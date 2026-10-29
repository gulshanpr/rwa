import fs from "node:fs";
import path from "node:path";
import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address } from "viem";
import type { Chain } from "@/lib/schema/asset";
import type { Context } from "../context";
import { deploymentBlock, scanLogs } from "../rpc";
import { addMapped, reportWarnings, wardsOf } from "./mapped";

/**
 * Centrifuge V3 pools (JTRSY, JAAA). The share token is a MakerDAO-style `auth` contract whose wards
 * are the shared Root, Spoke and BalanceSheet. Those act for whoever drives them:
 * - Root only gains wards after its `delay()`, scheduled by the ProtocolGuardian Safe;
 * - Spoke executes Hub messages, which for a pool come from that pool's hub managers;
 * - BalanceSheet lets the pool's balance-sheet managers mint, burn and move shares directly.
 * Hub managers are registered per pool in HubRegistry; balance-sheet managers in BalanceSheet. The
 * crosschain adapter quorum behind the message contracts is not modeled.
 */

/** The hub chain's Hub. Spokes don't store it, so it can't be found from the token. */
const HUB: Partial<Record<Chain, Address>> = { ethereum: "0xA4A7Bb3831958463b3FE3E27A6a160F764341953" };

const ABI = parseAbi([
  "function hook() view returns (address)",
  "function poolId() view returns (uint64)",
  "function share() view returns (address)",
  "function manager() view returns (address)",
  "function hubRegistry() view returns (address)",
  "function manager(uint64, address) view returns (bool)",
  "function delay() view returns (uint256)",
  "function safe() view returns (address)",
  "function getOwners() view returns (address[])",
]);
const VAULT_UPDATE = parseAbiItem("event VaultUpdate(address indexed asset, address vault)");
const HUB_MANAGER = parseAbiItem("event UpdateManager(uint64 indexed poolId, address indexed manager, bool canManage)");
const BS_MANAGER = parseAbiItem("event UpdateManager(uint64 indexed poolId, address who, bool canManage)");

type Snapshot = {
  contracts: Record<string, { name: string; permissions: { power: string; holder: string }[] }>;
  holders: Record<string, unknown>;
};

/** The hub chain's snapshot. Spoke chains reuse it: Centrifuge deploys at the same addresses everywhere. */
function hubSnapshot(slug: string): Snapshot {
  const file = path.join(process.cwd(), "discovered", slug, "ethereum.json");
  if (!fs.existsSync(file))
    throw new Error(`Run Ethereum discovery for ${slug} first; spoke chains are checked against it.`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
}

/** On a spoke chain, the pool's hub managers as recorded in the hub chain's snapshot (Hub set-price holders). */
function hubManagersFromSnapshot(d: Snapshot): Address[] {
  const hub = Object.values(d.contracts).find((c) => c.name === "Hub");
  return [...new Set((hub?.permissions ?? []).filter((p) => p.power === "set-price").map((p) => getAddress(p.holder)))];
}

async function poolManagers(
  ctx: Context,
  registry: Address,
  event: typeof HUB_MANAGER | typeof BS_MANAGER,
  poolId: bigint,
  known?: Address[],
): Promise<Address[]> {
  let candidates = known;
  if (!candidates) {
    const from = await deploymentBlock(ctx.c, registry, ctx.block);
    const logs = await scanLogs(ctx.c, registry, event, from, ctx.block);
    candidates = [
      ...new Set(
        logs
          .filter((l) => BigInt(l.args.poolId as bigint) === poolId)
          .map((l) => getAddress((l.args.manager ?? l.args.who) as string)),
      ),
    ];
  }
  const active: boolean[] = [];
  for (const a of candidates) active.push(await ctx.readOrThrow<boolean>(registry, ABI, "manager", [poolId, a]));
  return candidates.filter((_, i) => active[i]).sort();
}

export async function centrifuge(ctx: Context, token: Address) {
  const warn: string[] = [];
  const hub = HUB[ctx.chain];
  const configured = ctx.asset.deployments.find((d) => d.chain === ctx.chain)?.discovery.poolId;
  // Spoke-chain logs span hundreds of millions of blocks; check the hub snapshot's addresses instead.
  const hubSnap = hub ? undefined : hubSnapshot(ctx.asset.slug);
  const known = hubSnap
    ? [...new Set([...Object.keys(hubSnap.contracts), ...Object.keys(hubSnap.holders)].map((a) => getAddress(a)))]
    : undefined;
  if (known)
    warn.push(
      `${ctx.chain} is a spoke chain: wards and managers are only checked among the ${known.length} addresses in the Ethereum snapshot, so this is a lower bound.`,
    );
  const wards = await wardsOf(ctx, token, known);
  const named = new Map<string, Address>();
  for (const w of wards) {
    const name = (await ctx.source(w)).name;
    if (name) named.set(name, w);
  }
  const root = named.get("Root");
  const spoke = named.get("Spoke");
  const balanceSheet = named.get("BalanceSheet");
  if (!root || !spoke || !balanceSheet)
    warn.push(`Expected Root, Spoke and BalanceSheet among the token's wards; found ${[...named.keys()].join(", ")}.`);

  let poolId: bigint | undefined;
  if (hubSnap) {
    if (!configured) throw new Error(`Set discovery.poolId for ${ctx.asset.slug} on ${ctx.chain}`);
    poolId = BigInt(configured);
  } else {
    const vaults = (
      await scanLogs(ctx.c, token, VAULT_UPDATE, await deploymentBlock(ctx.c, token, ctx.block), ctx.block)
    )
      .map((l) => l.args.vault as Address)
      .filter((v) => v && v !== zeroAddress)
      .reverse();
    // Newest first: tokens migrated from Centrifuge V2 keep their old vaults, which report the V2 pool id.
    for (const v of vaults) {
      if ((await ctx.read<Address>(v, ABI, "share"))?.toLowerCase() !== token.toLowerCase()) continue;
      poolId = await ctx.read<bigint>(v, ABI, "poolId");
      if (poolId !== undefined) break;
    }
    if (poolId === undefined) throw new Error(`No vault for ${token} reports a poolId`);
    if (configured !== poolId.toString())
      warn.push(
        `Vaults report pool ${poolId}; set discovery.poolId to it (currently ${configured ?? "unset"}) so the watcher filters shared-contract events.`,
      );
  }

  const registry = hub ? await ctx.readOrThrow<Address>(hub, ABI, "hubRegistry") : undefined;
  const hubManagers = registry
    ? await poolManagers(ctx, registry, HUB_MANAGER, poolId)
    : hubManagersFromSnapshot(hubSnap!);
  const bsManagers = balanceSheet ? await poolManagers(ctx, balanceSheet, BS_MANAGER, poolId, known) : [];

  const rootWards = root ? await wardsOf(ctx, root, known) : [];
  let guardian: Address | undefined;
  for (const w of rootWards) if ((await ctx.source(w)).name === "ProtocolGuardian") guardian = w;
  const guardianSafe = guardian ? await ctx.read<Address>(guardian, ABI, "safe") : undefined;
  const delay = root ? ((await ctx.read<bigint>(root, ABI, "delay")) ?? 0n) : 0n;
  const safeOwners = guardianSafe ? ((await ctx.read<Address[]>(guardianSafe, ABI, "getOwners")) ?? []) : [];

  // Root gains wards only through the Guardian's scheduleRely plus Root's delay.
  if (guardian && guardianSafe)
    ctx.setHolder(guardian, {
      kind: "timelock",
      minDelaySeconds: Number(delay),
      proposers: [getAddress(guardianSafe)],
      executors: [],
    });
  const viaHub = [...hubManagers, ...(guardian ? [guardian] : [])];
  if (root)
    ctx.setHolder(root, { kind: "contract", name: "Root", controllers: guardian ? [getAddress(guardian)] : [] });
  if (spoke) ctx.setHolder(spoke, { kind: "contract", name: "Spoke", controllers: viaHub });
  if (balanceSheet)
    ctx.setHolder(balanceSheet, {
      kind: "contract",
      name: "BalanceSheet",
      controllers: [...new Set([...bsManagers, ...viaHub])].sort(),
    });
  for (const m of bsManagers) {
    const name = (await ctx.source(m)).name;
    if (name === "AsyncRequestManager" || name === "SyncManager")
      ctx.setHolder(m, { kind: "contract", name, controllers: viaHub });
  }
  const bsWards = balanceSheet ? await wardsOf(ctx, balanceSheet, known) : [];
  for (const w of bsWards) {
    const name = (await ctx.source(w)).name;
    if (name === "MessageProcessor" || name === "MessageDispatcher")
      ctx.setHolder(w, { kind: "contract", name, controllers: viaHub });
  }

  const hook = await ctx.read<Address>(token, ABI, "hook");
  const hasHook = Boolean(hook && hook !== zeroAddress);
  await addMapped(
    ctx,
    token,
    {
      role: "token",
      guards: {
        auth: { holders: wards, label: "wards" },
        authOrHook: {
          holders: [...new Set([...wards, ...(hasHook ? [getAddress(hook!)] : [])])].sort(),
          label: "wards or the transfer hook",
        },
      },
      // The share token is not upgradeable; `file` swaps the transfer hook (or renames the token).
      powers: { authTransferFrom: "force-transfer", file: "set-compliance", rely: "admin", deny: "admin" },
      notScored: ["updateVault"],
    },
    warn,
  );

  if (hook && hasHook) {
    const hookWards = await wardsOf(ctx, hook, known);
    await addMapped(
      ctx,
      hook,
      {
        role: "service",
        guards: { auth: { holders: hookWards, label: "wards" } },
        powers: { updateRestriction: "freeze", trustedCall: "set-compliance", rely: "admin", deny: "admin" },
      },
      warn,
    );
  }

  if (balanceSheet)
    await addMapped(
      ctx,
      balanceSheet,
      {
        role: "service",
        rulesOnly: true,
        rules: [
          { power: "mint", fns: ["issue"], holders: bsManagers, via: `isManager(pool ${poolId})` },
          { power: "burn-from", fns: ["revoke"], holders: bsManagers, via: `isManager(pool ${poolId})` },
          {
            power: "force-transfer",
            fns: ["transferSharesFrom"],
            holders: bsManagers,
            via: `isManager(pool ${poolId})`,
          },
          {
            power: "set-price",
            fns: ["overridePricePoolPerShare", "overridePricePoolPerAsset"],
            holders: bsManagers,
            via: `isManager(pool ${poolId}), within one transaction`,
          },
          {
            power: "allocate",
            fns: ["withdraw", "deposit"],
            holders: bsManagers,
            via: `isManager(pool ${poolId}), moves pool escrow assets`,
          },
          { power: "admin", fns: ["updateManager"], holders: bsWards, via: "auth (wards)" },
        ],
      },
      warn,
    );

  // Hub manager changes are recorded here; listed so the watcher follows it.
  if (registry)
    ctx.addContract(registry, {
      name: "HubRegistry",
      role: "service",
      verified: (await ctx.source(registry)).verified,
      permissions: [],
    });

  if (hub)
    await addMapped(
      ctx,
      hub,
      {
        role: "oracle",
        rulesOnly: true,
        rules: [
          {
            power: "set-price",
            fns: ["updateSharePrice", "notifySharePrice"],
            holders: hubManagers,
            via: `_isManager(pool ${poolId})`,
          },
          {
            power: "admin",
            fns: ["updateHubManager", "updateBalanceSheetManager"],
            holders: hubManagers,
            via: `_isManager(pool ${poolId})`,
          },
          {
            power: "freeze",
            fns: ["updateRestriction"],
            holders: hubManagers,
            via: `_isManager(pool ${poolId}), sent to the hook`,
          },
          {
            power: "set-compliance",
            fns: ["updateShareHook"],
            holders: hubManagers,
            via: `_isManager(pool ${poolId}), swaps the transfer hook`,
          },
          {
            power: "mint",
            fns: ["setRequestManager", "updateVault"],
            holders: hubManagers,
            via: `_isManager(pool ${poolId}), swaps the contracts that issue shares`,
          },
          {
            power: "allocate",
            fns: ["updateContract"],
            holders: hubManagers,
            via: `_isManager(pool ${poolId}), reconfigures pool contracts such as the on/offramp manager`,
          },
        ],
      },
      warn,
    );

  if (guardian && guardianSafe)
    await addMapped(
      ctx,
      guardian,
      {
        role: "other",
        rulesOnly: true,
        rules: [
          {
            power: "pause",
            fns: ["pause"],
            holders: [getAddress(guardianSafe), ...safeOwners.map((o) => getAddress(o))],
            via: "onlySafeOrOwner: the Safe or any one of its owners",
          },
        ],
      },
      warn,
    );

  reportWarnings("centrifuge", warn);
  return {
    poolId: poolId.toString(),
    wards,
    hubManagers,
    bsManagers,
    guardian,
    guardianSafe,
    rootDelaySeconds: Number(delay),
    warnings: warn,
  };
}
