import { decodeEventLog, formatUnits, getAddress, parseAbi, toEventSelector, zeroAddress, type Abi, type AbiEvent, type Address, type Log } from "viem";
import { getDb, schema } from "@/db/client";
import { clientsFor } from "@/discovery/rpc";
import { verifiedSource } from "@/discovery/sources";
import type { Asset, Chain } from "@/lib/schema/asset";
import type { Alert } from "@/lib/schema/live";
import { raiseAlert } from "./alerts";
import { catalog, getCursor, log, setCursor } from "./util";

const CONFIRMATIONS: Record<Chain, bigint> = { ethereum: 12n, arbitrum: 30n, optimism: 30n, base: 30n, polygon: 30n, avalanche: 30n, bsc: 30n };
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

  // Centrifuge V3. Hub and BalanceSheet are shared, so these are filtered to the asset's pool.
  Rely: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: ward ${fmt(a.user)} added`, consequence: "A new address can call every `auth` function on this contract. On the token or BalanceSheet that includes minting, burning and moving shares." },
  Deny: { severity: "high", kind: "role-revoke", title: (c, a) => `${c}: ward ${fmt(a.user)} removed`, consequence: "An address lost its `auth` access to this contract." },
  UpdateManager: {
    severity: "critical",
    kind: "role-grant",
    title: (c, a) => `${c}: pool manager ${fmt(a.manager ?? a.who)} ${a.canManage ? "added" : "removed"}`,
    consequence: "Pool managers can set the share price, mint, burn and move shares, and change the pool's other managers.",
  },
  UpdateBalanceSheetManager: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: balance-sheet manager ${String(a.manager).slice(0, 42)} ${a.canManage ? "added" : "removed"} on chain ${a.centrifugeId}`, consequence: "Balance-sheet managers can mint, burn and move shares and override the price within a transaction." },
  UpdateHookManager: { severity: "high", kind: "role-grant", title: (c, a) => `${c}: hook manager ${fmt(a.manager)} ${a.canManage ? "added" : "removed"}`, consequence: "Hook managers can change who may hold and transfer the token." },
  UpdateShareHook: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: transfer hook changed on chain ${a.centrifugeId}`, consequence: "Transfer, mint and burn restrictions for the token now run through a different contract." },
  SetSpokeRequestManager: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: request manager changed on chain ${a.centrifugeId}`, consequence: "A different contract now processes deposits and redemptions, and can mint and burn shares." },
  TransferSharesFrom: { severity: "medium", kind: "seize", title: (c, a) => `${c}: shares moved from ${fmt(a.from)} to ${fmt(a.to)}`, consequence: "A balance-sheet manager moved shares out of a holder's wallet without their signature." },
  Freeze: { severity: "medium", kind: "freeze", title: (c, a) => `${c}: ${fmt(a.user)} frozen`, consequence: "That wallet can no longer send or receive the token." },
  Unfreeze: { severity: "medium", kind: "freeze", title: (c, a) => `${c}: ${fmt(a.user)} unfrozen`, consequence: "That wallet can move the token again." },

  // Hashnote (USYC).
  UserRoleUpdated: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: role ${a.role} ${a.enabled ? "granted to" : "removed from"} ${fmt(a.user)}`, consequence: "Roles decide who can mint, set prices and change entitlements. Role 255 is the fund admin." },
  RoleCapabilityUpdated: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: role ${a.role} ${a.enabled ? "can now" : "can no longer"} call ${a.functionSig} on ${fmt(a.target)}`, consequence: "Which role may call a privileged function changed." },
  PublicCapabilityUpdated: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: ${a.functionSig} on ${fmt(a.target)} ${a.enabled ? "opened to anyone" : "no longer public"}`, consequence: "A public capability lets any address call the function." },
  MinterConfigured: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: minter ${fmt(a.minter)} allowance set to ${a.amount}`, consequence: "Minters can create new tokens up to their allowance." },
  TellerSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: teller changed to ${fmt(a.newTeller)}`, consequence: "A different contract now handles subscriptions and redemptions." },
  OracleSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: price oracle changed to ${fmt(a.newOracle)}`, consequence: "Subscriptions, redemptions and integrators now read the price from a different contract." },

  // Superstate (USTB).
  SetOracle: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: price oracle changed to ${fmt(a.newOracle)}`, consequence: "Onchain subscriptions now price the token from a different contract." },
  AllowlistUpdated: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: allowlist contract changed to ${fmt(a.newAllowlist)}`, consequence: "A different contract now decides who may hold and transfer the token." },
  AllowedSet: { severity: "low", kind: "compliance-change", title: (c, a) => `${c}: ${fmt(a.addr)} ${a.isAllowed ? "allowed" : "removed"}`, consequence: "Only allowlisted addresses can hold the token." },
  AccountingPaused: { severity: "high", kind: "pause", title: (c) => `${c}: accounting paused`, consequence: "Transfers, subscriptions and redemptions stop until accounting is unpaused." },
  SetRedemptionContract: { severity: "high", kind: "service-change", title: (c, a) => `${c}: redemption contract changed to ${fmt(a.newRedemptionContract)}`, consequence: "A different contract now handles onchain redemptions." },
  SetMaximumOracleDelay: { severity: "medium", kind: "service-change", title: (c, a) => `${c}: maximum oracle delay set to ${a.newMaxOracleDelay}s`, consequence: "How old the price may be before onchain subscriptions stop changed." },
  SetMaximumAcceptablePriceDelta: { severity: "high", kind: "service-change", title: (c, a) => `${c}: maximum price change per checkpoint set to ${a.newDelta}`, consequence: "How far the admin can move the NAV in one update changed." },

  // Ondo (OUSG).
  OndoOracleSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: oracle changed to ${fmt(a.newOndoOracle)}`, consequence: "Instant subscriptions and redemptions now price OUSG from a different contract." },
  TokenToRWAOracleSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: RWA oracle for ${fmt(a.token)} changed to ${fmt(a.newRWAOracle)}`, consequence: "The token's price now comes from a different contract." },
  AggregatorV3OracleSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: price feed for ${fmt(a.token)} changed to ${fmt(a.newOracle)}`, consequence: "The token's price now comes from a different feed." },
  HardcodedPriceSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: price for ${fmt(a.token)} hard-coded to ${a.newPrice}`, consequence: "The token's price is now a fixed value set by the admin, not a feed." },
  TokenToOracleTypeSet: { severity: "high", kind: "service-change", title: (c, a) => `${c}: oracle type for ${fmt(a.token)} set to ${a.oracleType}`, consequence: "Where the token's price comes from changed." },
  OndoIDRegistrySet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: ID registry changed to ${fmt(a.newOndoIDRegistry)}`, consequence: "A different contract now decides which wallets are KYC'd." },
  OndoComplianceSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: compliance contract changed to ${fmt(a.newOndoCompliance)}`, consequence: "A different contract now screens subscriptions and redemptions." },
  OndoTokenRouterSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: token router changed to ${fmt(a.newOndoTokenRouter)}`, consequence: "Subscription and redemption funds now flow through a different contract." },
  AdminSubscriptionCheckerSet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: admin subscription checker changed to ${fmt(a.newAdminSubscriptionChecker)}`, consequence: "The limits on admin mints now come from a different contract." },
  TokenWithdrawSourcesSet: { severity: "high", kind: "service-change", title: (c, a) => `${c}: redemption funding sources changed for ${fmt(a.withdrawToken)}`, consequence: "Instant redemptions are paid from a different set of wallets." },
  RWARoleSet: { severity: "critical", kind: "role-grant", title: (c, a) => `${c}: KYC role for ${fmt(a.rwaToken)} changed`, consequence: "A different role now decides which wallets may hold the token." },
  KYCRegistrySet: { severity: "critical", kind: "service-change", title: (c, a) => `${c}: KYC registry changed to ${fmt(a.newRegistry)}`, consequence: "A different contract now decides which wallets may hold the token." },
  SubscribePaused: { severity: "high", kind: "pause", title: (c) => `${c}: subscriptions paused`, consequence: "Instant subscriptions stop until unpaused." },
  RedeemPaused: { severity: "high", kind: "pause", title: (c) => `${c}: redemptions paused`, consequence: "Instant redemptions stop until unpaused." },
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
  // Superstate.
  Mint: { kind: "mint", field: "amount", verb: "minted" },
  AdminBurn: { kind: "burn", field: "amount", verb: "burned" },
  OffchainRedeem: { kind: "burn", field: "amount", verb: "redeemed" },
};
const ERC20_TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"])[0];

interface Watched {
  asset: Asset;
  name: string;
  /** Token with no named mint/burn event: mints and burns are read from Transfer to or from the zero address. */
  transferMints?: boolean;
}

async function watchList(chain: Chain): Promise<{ addresses: Map<string, Watched>; events: Map<string, AbiEvent[]> }> {
  const addresses = new Map<string, Watched>();
  const events = new Map<string, AbiEvent[]>();
  const add = (e: AbiEvent) => {
    if (!RULES[e.name] && !AMOUNT_EVENTS[e.name] && e !== ERC20_TRANSFER) return;
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
        const watched: Watched = { asset, name: `${asset.ticker} ${labels[addr.toLowerCase()] ?? c.name}` };
        addresses.set(addr.toLowerCase(), watched);
        const abiEvents: AbiEvent[] = [];
        for (const a of new Set([addr, c.proxy?.implementation].filter(Boolean) as string[])) {
          const src = await verifiedSource(chainId, getAddress(a));
          (src.abi as Abi | undefined)?.forEach((e) => e.type === "event" && abiEvents.push(e));
        }
        abiEvents.forEach(add);
        const isToken = asset.deployments.some((d) => d.chain === chain && d.token.toLowerCase() === addr.toLowerCase());
        const namedAmount = abiEvents.some((e) => AMOUNT_EVENTS[e.name] && e.inputs.some((i) => i.name === AMOUNT_EVENTS[e.name]!.field));
        if (isToken && !namedAmount) {
          watched.transferMints = true;
          add(ERC20_TRANSFER);
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
  // One chain's RPC failing must not stop the others from being watched.
  const failed: string[] = [];
  for (const chain of chains) {
    try {
      await watchChain(chain);
    } catch (e) {
      failed.push(chain);
      log("watcher", `${chain} FAILED: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  if (failed.length) throw new Error(`chain(s) failed: ${failed.join(", ")}`);
}

async function watchChain(chain: Chain) {
  const { client } = clientsFor(chain);
  const { addresses, events } = await watchList(chain);
  if (addresses.size === 0) return;
  const watchedAddresses = [...addresses.keys()].map((a) => getAddress(a));
  const confirmed = (await client.getBlockNumber()) - CONFIRMATIONS[chain];
  const end = process.env.WATCH_END_BLOCK ? BigInt(process.env.WATCH_END_BLOCK) : undefined;
  const head = end !== undefined && end < confirmed ? end : confirmed;
  const cursorName = `watcher:${chain}`;
  const saved = await getCursor(cursorName);
  // First run starts at the confirmed head; set WATCH_START_BLOCK to backfill.
  let from = saved ? BigInt(saved) + 1n : BigInt(process.env.WATCH_START_BLOCK ?? head);
  if (from > head) return;
  const blockTimes = new Map<bigint, Date>();
  let matched = 0;

  while (from <= head) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
    const logs: Log[] = [];
    for (let i = 0; i < watchedAddresses.length; i += ADDRESS_BATCH) {
      logs.push(...(await client.getLogs({ address: watchedAddresses.slice(i, i + ADDRESS_BATCH), fromBlock: from, toBlock: to })));
    }
    logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
    const decoded = logs.map((l) => decode(l, events));
    // A ward relied and denied in the same transaction (deployment scripts) changes nothing.
    const wardKey = (l: Log, user: unknown) => `${l.transactionHash}|${l.address.toLowerCase()}|${String(user).toLowerCase()}`;
    const relied = new Set(logs.flatMap((l, i) => (decoded[i]?.name === "Rely" ? [wardKey(l, decoded[i]!.args.user)] : [])));
    const netZero = new Set(logs.flatMap((l, i) => (decoded[i]?.name === "Deny" && relied.has(wardKey(l, decoded[i]!.args.user)) ? [wardKey(l, decoded[i]!.args.user)] : [])));
    for (const [i, l] of logs.entries()) {
      const ev = decoded[i];
      if (!ev) continue;
      if ((ev.name === "Rely" || ev.name === "Deny") && netZero.has(wardKey(l, ev.args.user))) continue;
      const watched = addresses.get(l.address.toLowerCase())!;
      const { asset } = watched;
      let amountRule = AMOUNT_EVENTS[ev.name];
      if (ev.name === "Transfer") {
        if (!watched.transferMints) continue;
        if (ev.args.from === zeroAddress) amountRule = { kind: "mint", field: "value", verb: "minted" };
        else if (ev.args.to === zeroAddress) amountRule = { kind: "burn", field: "value", verb: "burned" };
        else continue;
      }
      const poolId = asset.deployments.find((d) => d.chain === chain)?.discovery.poolId;
      if (poolId && ev.args.poolId !== undefined && String(ev.args.poolId) !== poolId) continue;
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
      const amount = amountRule;
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
