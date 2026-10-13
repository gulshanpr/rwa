import { decodeEventLog, formatUnits, getAddress, parseAbi, toEventSelector, type Abi, type AbiEvent, type Address, type Log } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import { verifiedSource } from "@/discovery/sources";
import type { Asset, Chain } from "@/lib/schema/asset";
import type { Alert } from "@/lib/schema/live";
import { raiseAlert } from "./alerts";
import { catalog, getCursor, log, setCursor } from "./util";

const CONFIRMATIONS: Record<Chain, bigint> = { ethereum: 12n, arbitrum: 30n, optimism: 30n, base: 30n, polygon: 30n, avalanche: 30n };
const CHUNK = BigInt(process.env.WATCH_CHUNK ?? 500);
// PublicNode rejects eth_getLogs with more than ~8 addresses.
const ADDRESS_BATCH = Number(process.env.WATCH_ADDRESS_BATCH ?? 8);

// Standard events emitted by proxies, admins, Safes and timelocks, whatever their verified ABI says.
const STANDARD_EVENTS = parseAbi([
  "event Upgraded(address indexed implementation)",
  "event BeaconUpgraded(address indexed beacon)",
  "event AdminChanged(address previousAdmin, address newAdmin)",
  "event ProxyTargetSet(address newTarget)",
  "event ProxyOwnerChanged(address newOwner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event AddedOwner(address indexed owner)",
  "event RemovedOwner(address indexed owner)",
  "event ChangedThreshold(uint256 threshold)",
  "event EnabledModule(address indexed module)",
  "event DisabledModule(address indexed module)",
  "event ChangedGuard(address indexed guard)",
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  "event MinDelayChange(uint256 oldDuration, uint256 newDuration)",
]);

type Rule = { severity: Alert["severity"]; kind: Alert["kind"]; title: (c: string, a: Args) => string; consequence: string };
type Args = Record<string, unknown>;

const DS_ROLES: Record<number, string> = { 1: "MASTER", 2: "ISSUER", 4: "EXCHANGE", 8: "TRANSFER_AGENT" };
const fmt = (v: unknown) => (typeof v === "string" && v.startsWith("0x") && v.length === 42 ? `${v.slice(0, 6)}…${v.slice(-4)}` : String(v));

const NEW_CODE = "The contract now runs different code. Every power and rule can change with it.";
const NAV_DOWN = "The NAV the token contract reports can drop. Holders and lending markets that read it absorb the loss.";

const RULES: Record<string, Rule> = {
  // Maple proxies emit Upgraded(uint256 toVersion_, bytes arguments_) instead of the EIP-1967 event.
  Upgraded: {
    severity: "critical",
    kind: "upgrade",
    title: (c, a) => (a.toVersion_ !== undefined ? `${c} upgraded to version ${a.toVersion_}` : `${c} code replaced (new implementation ${fmt(a.implementation)})`),
    consequence: NEW_CODE,
  },
  BeaconUpgraded: { severity: "critical", kind: "upgrade", title: (c, a) => `${c} beacon changed to ${fmt(a.beacon)}`, consequence: "The contract now runs different code. Every power and rule can change with it." },
  ProxyTargetSet: { severity: "critical", kind: "upgrade", title: (c, a) => `${c} code replaced (new target ${fmt(a.newTarget)})`, consequence: "The contract now runs different code. Every power and rule can change with it." },
  AdminChanged: { severity: "critical", kind: "admin-change", title: (c, a) => `${c} upgrade admin changed to ${fmt(a.newAdmin)}`, consequence: "A different key can now replace this contract's code." },
  ProxyOwnerChanged: { severity: "critical", kind: "admin-change", title: (c, a) => `${c} proxy owner changed to ${fmt(a.newOwner)}`, consequence: "A different key can now replace this contract's code." },
  OwnershipTransferred: { severity: "critical", kind: "ownership-transfer", title: (c, a) => `${c} owner changed to ${fmt(a.newOwner)}`, consequence: "A different key now holds the owner powers on this contract." },
  RoleGranted: { severity: "critical", kind: "role-grant", title: (c, a) => `${c} granted role to ${fmt(a.account)}`, consequence: "A new address holds a privileged role." },
  RoleRevoked: { severity: "high", kind: "role-revoke", title: (c, a) => `${c} revoked role from ${fmt(a.account)}`, consequence: "An address lost a privileged role." },
  DSTrustServiceRoleAdded: { severity: "critical", kind: "role-grant", title: (_c, a) => `${DS_ROLES[Number(a.role)] ?? `Role ${a.role}`} role granted to ${fmt(a.targetAddress)}`, consequence: "A new address holds a DS Protocol role. ISSUER can mint, TRANSFER_AGENT can seize and pause, MASTER can do everything." },
  DSTrustServiceRoleRemoved: { severity: "high", kind: "role-revoke", title: (_c, a) => `${DS_ROLES[Number(a.role)] ?? `Role ${a.role}`} role removed from ${fmt(a.targetAddress)}`, consequence: "An address lost a DS Protocol role." },
  DSServiceSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c} service ${a.serviceId ?? ""} pointed to ${fmt(a.serviceAddress ?? Object.values(a)[1])}`, consequence: "A core DS Protocol service (compliance, registry, trust…) now points to a different contract." },
  Paused: { severity: "high", kind: "pause", title: (c) => `${c} paused`, consequence: "Transfers are stopped until it is unpaused." },
  Pause: { severity: "high", kind: "pause", title: (c) => `${c} paused`, consequence: "Transfers are stopped until it is unpaused." },
  Unpaused: { severity: "high", kind: "pause", title: (c) => `${c} unpaused`, consequence: "Transfers are allowed again." },
  Unpause: { severity: "high", kind: "pause", title: (c) => `${c} unpaused`, consequence: "Transfers are allowed again." },
  AddedOwner: { severity: "high", kind: "safe-change", title: (c, a) => `${c}: signer ${fmt(a.owner)} added`, consequence: "The set of people who can approve this multisig's actions changed." },
  RemovedOwner: { severity: "high", kind: "safe-change", title: (c, a) => `${c}: signer ${fmt(a.owner)} removed`, consequence: "The set of people who can approve this multisig's actions changed." },
  ChangedThreshold: { severity: "high", kind: "safe-change", title: (c, a) => `${c}: approval threshold set to ${a.threshold}`, consequence: "A different number of signers is now needed to act." },
  EnabledModule: { severity: "high", kind: "safe-change", title: (c, a) => `${c}: module ${fmt(a.module)} enabled`, consequence: "A module can act for the multisig without signer approval." },
  DisabledModule: { severity: "high", kind: "safe-change", title: (c, a) => `${c}: module ${fmt(a.module)} disabled`, consequence: "A module lost the ability to act for the multisig." },
  ChangedGuard: { severity: "high", kind: "safe-change", title: (c, a) => `${c}: guard set to ${fmt(a.guard)}`, consequence: "The checks applied to every multisig transaction changed." },
  CallScheduled: {
    severity: "high",
    kind: "timelock-scheduled",
    title: (c, a) => (a.contract_ !== undefined ? `${c}: ${fmt(a.caller_)} scheduled a call on ${fmt(a.contract_)}` : `${c}: call scheduled on ${fmt(a.target)}`),
    consequence: "A privileged change is queued and will execute after the delay.",
  },
  ProposalScheduled: { severity: "high", kind: "timelock-scheduled", title: (c, a) => `${c}: governance proposal ${a.proposalId} scheduled`, consequence: "A governance change is queued and will execute after the timelock delay." },
  RoleUpdated: {
    severity: "critical",
    kind: "role-grant",
    title: (c, a) => `${c}: role ${String(a.role).slice(0, 10)}… ${a.grantRole ? "granted to" : "revoked from"} ${fmt(a.account)}`,
    consequence: "The set of addresses that can propose, execute or cancel governance changes changed.",
  },
  ImplementationRegistered: { severity: "high", kind: "upgrade", title: (c, a) => `${c}: new code version ${a.version_} registered (${fmt(a.implementationAddress_)})`, consequence: "Contracts made by this factory can now be upgraded to this code." },
  DefaultVersionSet: { severity: "high", kind: "upgrade", title: (c, a) => `${c}: default version set to ${a.version_}`, consequence: "New contracts from this factory will run this code version." },
  UpgradePathEnabled: { severity: "high", kind: "upgrade", title: (c, a) => `${c}: upgrade path ${a.fromVersion_} → ${a.toVersion_} enabled`, consequence: "Existing contracts can now be upgraded along this path." },
  ProtocolPauseSet: { severity: "high", kind: "pause", title: (c, a) => `${c}: protocol ${a.protocolPaused_ ? "paused" : "unpaused"}`, consequence: "Deposits, redemptions, transfers and loan actions across every Maple pool stop while the protocol is paused." },
  ContractPauseSet: { severity: "high", kind: "pause", title: (c, a) => `${c}: ${fmt(a.contract_)} ${a.contractPaused_ ? "paused" : "unpaused"}`, consequence: "Every function on that contract stops while it is paused." },
  FunctionUnpauseSet: { severity: "high", kind: "pause", title: (c, a) => `${c}: function ${a.sig_} on ${fmt(a.contract_)} ${a.functionUnpaused_ ? "exempted from" : "subject to"} pause`, consequence: "Which functions keep working during a pause changed." },
  SecurityAdminSet: { severity: "critical", kind: "admin-change", title: (c, a) => `${c}: securityAdmin changed to ${fmt(a.currentSecurityAdmin_)}`, consequence: "A different key can now upgrade Maple contracts instantly and pause the protocol." },
  OperationalAdminSet: { severity: "critical", kind: "admin-change", title: (c, a) => `${c}: operationalAdmin changed to ${fmt(a.currentOperationalAdmin_)}`, consequence: "A different key can now approve borrowers, pool delegates and bots." },
  PendingGovernorSet: { severity: "critical", kind: "admin-change", title: (c, a) => `${c}: pending governor set to ${fmt(a.pendingGovernor_)}`, consequence: "Control of Maple governance is being handed to a new address." },
  GovernorshipAccepted: { severity: "critical", kind: "admin-change", title: (c, a) => `${c}: governor changed to ${fmt(a.currentGovernor_)}`, consequence: "A new address controls Maple governance." },
  PendingDelegateSet: { severity: "critical", kind: "admin-change", title: (c, a) => `${c}: pool delegate handover to ${fmt(a.newDelegate_)} started`, consequence: "A new address is about to control loans, impairments and access rules for this pool." },
  PendingDelegateAccepted: { severity: "critical", kind: "admin-change", title: (c, a) => `${c}: pool delegate is now ${fmt(a.newDelegate_)}`, consequence: "A new address controls loans, impairments and access rules for this pool." },
  ValidBorrowerSet: { severity: "medium", kind: "role-grant", title: (c, a) => `${c}: borrower ${fmt(a.borrower_)} ${a.isValid_ ? "approved" : "removed"}`, consequence: "Pool funds can only be lent to approved borrowers." },
  ValidPoolDelegateSet: { severity: "high", kind: "role-grant", title: (c, a) => `${c}: pool delegate ${fmt(a.account_)} ${a.isValid_ ? "approved" : "removed"}`, consequence: "Approved pool delegates can take over a pool's lending and access controls." },
  ValidInstanceSet: { severity: "medium", kind: "role-grant", title: (c, a) => `${c}: instance ${fmt(a.instance_)} ${a.isValid_ ? "registered" : "removed"}`, consequence: "Registered instances include bots that can move pool funds into strategies or process redemptions." },
  PoolPermissionLevelSet: { severity: "high", kind: "compliance-change", title: (c, a) => `${c}: permission level set to ${a.permissionLevel}`, consequence: "Who can deposit, redeem and transfer the token changed. Level 0 (private) blocks everyone not on the allowlist." },
  PoolBitmapsSet: { severity: "high", kind: "compliance-change", title: (c) => `${c}: function permission bitmaps changed`, consequence: "Which holders can deposit, redeem or transfer the token changed." },
  LenderAllowlistSet: { severity: "medium", kind: "compliance-change", title: (c) => `${c}: lender allowlist changed`, consequence: "Specific addresses were added to or removed from the allowlist." },
  UnrealizedLossesUpdated: { severity: "high", kind: "nav-drop", title: (c, a) => `${c}: unrealized losses set to ${a.unrealizedLosses_}`, consequence: NAV_DOWN },
  CollateralLiquidationTriggered: { severity: "high", kind: "nav-drop", title: (c, a) => `${c}: default triggered on loan ${fmt(a.loan_)}`, consequence: NAV_DOWN },
  StrategyImpaired: { severity: "high", kind: "nav-drop", title: (c) => `${c}: strategy impaired`, consequence: NAV_DOWN },
  MinDelayChange: { severity: "high", kind: "timelock-scheduled", title: (c, a) => `${c}: delay changed to ${a.newDuration}s`, consequence: "The warning time before privileged changes changed." },
  Seize: { severity: "medium", kind: "seize", title: (c, a) => `${c}: tokens seized from ${fmt(a.from)}`, consequence: "The transfer agent moved tokens out of a holder's wallet without their signature." },
  OmnibusSeize: { severity: "medium", kind: "seize", title: (c) => `${c}: tokens seized from an omnibus account`, consequence: "The transfer agent moved tokens out of a holder's account without their signature." },
  InvestorFullyLocked: { severity: "medium", kind: "freeze", title: (c) => `${c}: an investor was fully locked`, consequence: "One investor can no longer move any tokens." },
  HolderLocked: { severity: "medium", kind: "freeze", title: (c) => `${c}: holder tokens locked`, consequence: "Part of one holder's balance can no longer move." },
  Locked: { severity: "medium", kind: "freeze", title: (c, a) => `${c}: tokens locked in ${fmt(a.who)}`, consequence: "Part of one wallet's balance can no longer move." },
};

// Mint and burn only alert above this share of supply or USD amount (spec 8.2).
const LARGE_SUPPLY_SHARE = 0.05;
const LARGE_USD = 10_000_000;
const AMOUNT_EVENTS: Record<string, { kind: "mint" | "burn"; field: string; verb: string }> = {
  Issue: { kind: "mint", field: "value", verb: "minted" },
  // ERC-4626 vault shares (MaplePool).
  Deposit: { kind: "mint", field: "shares_", verb: "minted" },
  Withdraw: { kind: "burn", field: "shares_", verb: "burned" },
  Burn: { kind: "burn", field: "value", verb: "burned" },
  OmnibusBurn: { kind: "burn", field: "value", verb: "burned" },
};

interface Watched {
  asset: Asset;
  name: string;
}

async function watchList(chain: Chain): Promise<{ addresses: Map<string, Watched>; events: Map<string, AbiEvent[]> }> {
  const addresses = new Map<string, Watched>();
  const events = new Map<string, AbiEvent[]>();
  const add = (e: AbiEvent) => {
    if (!RULES[e.name] && !AMOUNT_EVENTS[e.name]) return;
    const sel = toEventSelector(e);
    const list = events.get(sel) ?? [];
    if (!list.some((x) => x.inputs.length === e.inputs.length && x.inputs.every((i, k) => i.indexed === e.inputs[k]!.indexed))) list.push(e);
    events.set(sel, list);
  };
  STANDARD_EVENTS.forEach((e) => add(e as AbiEvent));
  const { chainId } = clientsFor(chain);

  const { assets, snapshots } = await catalog();
  for (const asset of assets) {
    const labels = Object.fromEntries(asset.deployments.flatMap((d) => Object.entries(d.discovery.labels)).map(([k, v]) => [k.toLowerCase(), v]));
    for (const s of snapshots.get(asset.slug) ?? []) {
      if (s.discovered.chain !== chain) continue;
      for (const [addr, c] of Object.entries(s.discovered.contracts)) {
        addresses.set(addr.toLowerCase(), { asset, name: `${asset.ticker} ${labels[addr.toLowerCase()] ?? c.name}` });
        for (const a of new Set([addr, c.proxy?.implementation].filter(Boolean) as string[])) {
          const src = await verifiedSource(chainId, getAddress(a));
          (src.abi as Abi | undefined)?.forEach((e) => e.type === "event" && add(e));
        }
      }
      for (const [addr, h] of Object.entries(s.discovered.holders)) {
        if (h.kind === "eoa" || addresses.has(addr.toLowerCase())) continue;
        const name = labels[addr.toLowerCase()] ?? (h.kind === "safe" ? `Safe ${h.threshold}/${h.owners.length}` : h.kind === "contract" ? h.name : h.kind);
        addresses.set(addr.toLowerCase(), { asset, name: `${asset.ticker} ${name}` });
        // Non-standard timelocks (e.g. Maple's GovernorTimelock) emit events only their own ABI describes.
        if (h.kind === "timelock") ((await verifiedSource(chainId, getAddress(addr))).abi as Abi | undefined)?.forEach((e) => e.type === "event" && add(e));
      }
    }
  }
  return { addresses, events };
}

function decode(log: Log, events: Map<string, AbiEvent[]>): { name: string; args: Args } | undefined {
  const candidates = events.get(log.topics[0] ?? "0x") ?? [];
  for (const e of candidates) {
    try {
      const d = decodeEventLog({ abi: [e], data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
      return { name: d.eventName as string, args: (d.args ?? {}) as Args };
    } catch {}
  }
  return undefined;
}

const toJson = (args: Args) => JSON.parse(JSON.stringify(args, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

async function supplyFor(asset: Asset, chain: Chain, token: Address) {
  const { client } = clientsFor(chain);
  const abi = parseAbi(["function totalSupply() view returns (uint256)", "function decimals() view returns (uint8)"]);
  const [supply, decimals] = await Promise.all([client.readContract({ address: token, abi, functionName: "totalSupply" }), client.readContract({ address: token, abi, functionName: "decimals" })]);
  return { supply: Number(formatUnits(supply, decimals)), decimals };
}

export async function watcherJob() {
  const chains = [...new Set((await catalog()).assets.flatMap((a) => a.deployments.map((d) => d.chain)))];
  for (const chain of chains) {
    const { client } = clientsFor(chain);
    const { addresses, events } = await watchList(chain);
    if (addresses.size === 0) continue;
    const watchedAddresses = [...addresses.keys()].map((a) => getAddress(a));
    const confirmed = (await client.getBlockNumber()) - CONFIRMATIONS[chain];
    const end = process.env.WATCH_END_BLOCK ? BigInt(process.env.WATCH_END_BLOCK) : undefined;
    const head = end !== undefined && end < confirmed ? end : confirmed;
    const cursorName = `watcher:${chain}`;
    const saved = await getCursor(cursorName);
    // First run starts at the confirmed head; set WATCH_START_BLOCK to backfill.
    let from = saved ? BigInt(saved) + 1n : BigInt(process.env.WATCH_START_BLOCK ?? head);
    if (from > head) continue;
    const blockTimes = new Map<bigint, Date>();
    let matched = 0;

    while (from <= head) {
      const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
      const logs: Log[] = [];
      for (let i = 0; i < watchedAddresses.length; i += ADDRESS_BATCH) {
        logs.push(...(await client.getLogs({ address: watchedAddresses.slice(i, i + ADDRESS_BATCH), fromBlock: from, toBlock: to })));
      }
      logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
      for (const l of logs) {
        const ev = decode(l, events);
        if (!ev) continue;
        const watched = addresses.get(l.address.toLowerCase())!;
        const { asset } = watched;
        const block = l.blockNumber!;
        if (!blockTimes.has(block)) blockTimes.set(block, new Date(Number((await client.getBlock({ blockNumber: block })).timestamp) * 1000));
        const ts = blockTimes.get(block)!;

        const [row] = await getDb()
          .insert(schema.chainEvent)
          .values({ assetSlug: asset.slug, chain, block: Number(block), txHash: l.transactionHash!, logIndex: l.logIndex!, contract: getAddress(l.address), eventName: ev.name, argsJson: toJson(ev.args), ts })
          .onConflictDoNothing()
          .returning({ id: schema.chainEvent.id });
        if (!row) continue;
        matched++;

        const base = { id: `${chain}-${l.transactionHash}-${l.logIndex}`, asset: asset.slug, chain, contract: getAddress(l.address), txHash: l.transactionHash!, block: Number(block), publishedAt: ts.toISOString(), eventId: row.id };
        const rule = RULES[ev.name];
        if (rule) {
          await raiseAlert({ ...base, severity: rule.severity, kind: rule.kind, title: rule.title(watched.name, ev.args), consequence: rule.consequence });
          continue;
        }
        const amount = AMOUNT_EVENTS[ev.name];
        const deployment = asset.deployments.find((d) => d.chain === chain && d.token.toLowerCase() === l.address.toLowerCase());
        if (amount && deployment) {
          const { supply, decimals } = await supplyFor(asset, chain, getAddress(deployment.token));
          const value = Number(formatUnits(BigInt(String(ev.args[amount.field] ?? 0)), decimals));
          if (value / supply > LARGE_SUPPLY_SHARE || value > LARGE_USD) {
            await raiseAlert({
              ...base,
              severity: "medium",
              kind: amount.kind,
              title: `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${asset.ticker} ${amount.verb} on ${chain}`,
              consequence: `${((value / supply) * 100).toFixed(1)}% of the ${chain} supply. Large mints or burns usually match subscriptions or redemptions; check against reported AUM.`,
            });
          }
        }
      }
      await setCursor(cursorName, to.toString());
      from = to + 1n;
    }
    log("watcher", `${chain} ${addresses.size} address(es) up to block ${head}, ${matched} new event(s)`);
  }
}
