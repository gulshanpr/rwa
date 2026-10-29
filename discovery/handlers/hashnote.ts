import fs from "node:fs";
import path from "node:path";
import {
  getAddress,
  parseAbi,
  parseAbiItem,
  toFunctionSelector,
  zeroAddress,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import type { Context } from "../context";
import { deploymentBlock, scanLogs } from "../rpc";
import { hasFunction, type VerifiedSource } from "../sources";
import { addMapped, reportWarnings, type Holders } from "./mapped";

/**
 * Hashnote / Circle USYC. The token defers to a Solmate-style RolesAuthority ("Entitlements"):
 * roles are bits in `getUserRoles(user)`, and most functions check that one of the caller's roles has
 * the capability for (target, selector). Role 255 is the fund admin. Minting is not role-based: any
 * address with a `minterAllowance` can mint and burn, and the fund admin can move any holder's tokens
 * through a branch in `transferFrom`.
 */

const ABI = parseAbi([
  "function authority() view returns (address)",
  "function owner() view returns (address)",
  "function minterAllowance(address) view returns (uint256)",
  "function getUserRoles(address) view returns (bytes32)",
  "function getRolesWithCapability(address, bytes4) view returns (bytes32)",
  "function isCapabilityPublic(address, bytes4) view returns (bool)",
  "function oracle() view returns (address)",
  "function reporter() view returns (address)",
]);
const USER_ROLE_UPDATED = parseAbiItem("event UserRoleUpdated(address indexed user, uint8 indexed role, bool enabled)");
const MINTER_CONFIGURED = parseAbiItem("event MinterConfigured(address minter, uint256 amount)");
const FUND_ADMIN = 255;

/** Reviewed and not scored: Teller fees, limits, treasury and after-hours settings shape exits, not holdings; sweeps move tokens sent to the contract by mistake. */
const TELLER_NOT_SCORED = [
  "setAfterHourTrading",
  "setFeeManager",
  "setFeeRecipient",
  "setLimits",
  "setTreasury",
  "sweep",
  "renounceOwnership",
];

async function logsOrUndefined(
  ctx: Context,
  address: Address,
  event: typeof USER_ROLE_UPDATED | typeof MINTER_CONFIGURED,
) {
  try {
    const from = await deploymentBlock(ctx.c, address, ctx.block);
    return await scanLogs(ctx.c, address, event, from, ctx.block);
  } catch {
    return undefined;
  }
}

/** Addresses seen in the Ethereum snapshot, used as candidates when a chain has no log source. */
function ethereumCandidates(slug: string): Address[] {
  const file = path.join(process.cwd(), "discovered", slug, "ethereum.json");
  if (!fs.existsSync(file)) return [];
  const d = JSON.parse(fs.readFileSync(file, "utf8")) as { holders: Record<string, unknown> };
  return Object.keys(d.holders).map((a) => getAddress(a));
}

const selectorOf = (src: VerifiedSource, name: string): Hex | undefined => {
  const fn = src.abi.find((x) => x.type === "function" && x.name === name) as AbiFunction | undefined;
  return fn ? toFunctionSelector(fn) : undefined;
};

export async function hashnote(ctx: Context, token: Address) {
  const warn: string[] = [];
  const authority = getAddress((await ctx.readOrThrow<Address>(token, ABI, "authority")) as Address);

  const roleLogs = await logsOrUndefined(ctx, authority, USER_ROLE_UPDATED);
  const minterLogs = await logsOrUndefined(ctx, token, MINTER_CONFIGURED);
  const partial = !roleLogs || !minterLogs;
  const fallback = partial ? ethereumCandidates(ctx.asset.slug) : [];
  if (partial)
    warn.push(
      `No log source on ${ctx.chain}: role and minter holders are checked only for ${fallback.length} addresses from the Ethereum snapshot, so this is a lower bound.`,
    );

  const roleCandidates = [...new Set([...(roleLogs ?? []).map((l) => getAddress(l.args.user as string)), ...fallback])];
  const rolesOf = new Map<Address, bigint>();
  for (const u of roleCandidates) {
    const bits = await ctx.read<Hex>(authority, ABI, "getUserRoles", [u]);
    if (bits && BigInt(bits) !== 0n) rolesOf.set(u, BigInt(bits));
  }
  const withRole = (role: number) => [...rolesOf].filter(([, bits]) => (bits >> BigInt(role)) & 1n).map(([u]) => u);
  const fundAdmins = withRole(FUND_ADMIN);
  const admin: Holders = { holders: fundAdmins, label: "fund admin, role 255" };

  const capability = async (target: Address, sig: Hex | undefined): Promise<Holders> => {
    if (!sig) return { holders: [], label: "capability" };
    if (await ctx.read<boolean>(authority, ABI, "isCapabilityPublic", [target, sig]))
      warn.push(`${sig} on ${target} is a public capability.`);
    const mask = BigInt((await ctx.read<Hex>(authority, ABI, "getRolesWithCapability", [target, sig])) ?? "0x0");
    const roles = [...Array(256).keys()].filter((r) => (mask >> BigInt(r)) & 1n);
    return {
      holders: [...rolesOf].filter(([, bits]) => bits & mask).map(([u]) => u),
      label: `Entitlements capability, role ${roles.join("/") || "none"}`,
    };
  };

  const minterCandidates = [
    ...new Set([...(minterLogs ?? []).map((l) => getAddress(l.args.minter as string)), ...fallback]),
  ];
  const minters: Address[] = [];
  for (const m of minterCandidates) {
    if (((await ctx.read<bigint>(token, ABI, "minterAllowance", [m])) ?? 0n) > 0n) minters.push(m);
  }

  const proxy = await ctx.detectProxy(token);
  const tokenSrc = await ctx.source(proxy?.implementation ?? token);
  const allowanceByFundAdmin = Object.values(tokenSrc.sources).some((s) =>
    /function setMinterAllowance[\s\S]{0,300}?System_FundAdmin/.test(s),
  );
  const allowanceSetters = allowanceByFundAdmin
    ? admin
    : await capability(token, selectorOf(tokenSrc, "setMinterAllowance"));
  await addMapped(
    ctx,
    token,
    {
      role: "token",
      guards: { "_assertFundAdmin()": admin },
      notScored: ["sweep", "renounceOwnership"],
      rules: [
        { power: "mint", fns: ["mint"], holders: minters, via: "minterAllowance > 0" },
        { power: "burn-from", fns: ["burn", "burnFor"], holders: minters, via: "minterAllowance > 0" },
        {
          power: "force-transfer",
          fns: ["transferFrom"],
          holders: fundAdmins,
          via: "fund-admin branch skips allowance and allowlist (role 255)",
        },
        {
          power: "mint",
          fns: ["setMinterAllowance", "incrementMinterAllowance", "decrementMinterAllowance"],
          holders: allowanceSetters.holders,
          via: `creates minters (${allowanceSetters.label})`,
        },
      ],
    },
    warn,
  );

  const authSrc = await ctx.source((await ctx.detectProxy(authority))?.implementation ?? authority);
  const authOwner = await ctx.read<Address>(authority, ABI, "owner");
  const sig = (name: string) => selectorOf(authSrc, name);
  const [setRole, setCap, setPublic, pause] = await Promise.all([
    capability(authority, sig("setUserRole")),
    capability(authority, sig("setRoleCapability")),
    capability(authority, sig("setPublicCapability")),
    capability(authority, sig("pause")),
  ]);
  await addMapped(
    ctx,
    authority,
    {
      name: "Entitlements",
      role: "service",
      notScored: ["renounceOwnership"],
      rules: [
        {
          power: "admin",
          fns: ["setUserRole", "setUserRoleBatch", "setRoleCapability"],
          holders: authOwner ? [getAddress(authOwner)] : [],
          via: "owner() (role 255 grants)",
        },
        {
          power: "set-compliance",
          fns: ["setUserRole", "setUserRoleBatch"],
          holders: setRole.holders,
          via: setRole.label,
        },
        { power: "set-compliance", fns: ["setRoleCapability"], holders: setCap.holders, via: setCap.label },
        { power: "set-compliance", fns: ["setPublicCapability"], holders: setPublic.holders, via: setPublic.label },
        {
          power: "pause",
          fns: ["pause"],
          holders: pause.holders,
          via: `${pause.label} (blocks every transfer and redemption)`,
        },
        { power: "pause", fns: ["unpause"], holders: authOwner ? [getAddress(authOwner)] : [], via: "owner()" },
      ],
    },
    warn,
  );

  const tellers: Address[] = [];
  for (const m of minters) {
    const oracle = await ctx.read<Address>(m, ABI, "oracle");
    if (!oracle || oracle === zeroAddress) continue;
    tellers.push(m);
    await addMapped(
      ctx,
      m,
      {
        role: "service",
        guards: { "_assertFundAdmin()": admin },
        powers: { setOracle: "set-price" },
        notScored: TELLER_NOT_SCORED,
      },
      warn,
    );
  }

  const ref = ctx.asset.pricing.reference;
  const oracle = ref.type === "oracle" && ref.chain === ctx.chain && ref.address ? getAddress(ref.address) : undefined;
  if (oracle) {
    const reporter = await ctx.read<Address>(oracle, ABI, "reporter");
    await addMapped(
      ctx,
      oracle,
      {
        role: "oracle",
        notScored: ["renounceOwnership"],
        rules: [
          {
            power: "set-price",
            fns: ["transmit", "setNextPrice"],
            holders: reporter ? [getAddress(reporter)] : [],
            via: "msg.sender == reporter()",
          },
        ],
      },
      warn,
    );
    if (reporter && reporter !== zeroAddress) {
      const src = await ctx.source((await ctx.detectProxy(reporter))?.implementation ?? reporter);
      if (hasFunction(src.abi, "transmitCall"))
        await addMapped(
          ctx,
          reporter,
          {
            role: "oracle",
            guards: { "_assertFundAdmin()": admin },
            powers: {
              transmit: "set-price",
              transmitCall: "set-price",
              transmitCallBatch: "set-price",
              setTokenDetails: "set-price",
              setFeeSchedule: "set-price",
            },
            notScored: ["renounceOwnership"],
          },
          warn,
        );
    }
  }

  reportWarnings("hashnote", warn);
  return { authority, fundAdmins, minters, tellers, partial, warnings: warn };
}
