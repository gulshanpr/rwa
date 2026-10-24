import { getAddress, keccak256, parseAbi, parseAbiItem, toHex, zeroAddress, type Address } from "viem";
import type { Permission, Power } from "@/lib/schema/discovered";
import type { Context } from "../context";
import { deploymentBlock, scanLogs } from "../rpc";
import { privilegedFunctions } from "../sources";

/**
 * Maple Protocol V2 pools (syrupUSDC, syrupUSDT). The pool token is immutable, but everything it
 * relies on (PoolManager, loan managers, withdrawal queue, strategies) is an upgradeable Maple proxy,
 * and most guards are inline `require`s on addresses read from MapleGlobals, so powers are mapped here
 * by hand from the verified source rather than from modifiers.
 */

const ABI = parseAbi([
  "function manager() view returns (address)",
  "function globals() view returns (address)",
  "function governor() view returns (address)",
  "function securityAdmin() view returns (address)",
  "function operationalAdmin() view returns (address)",
  "function poolDelegate() view returns (address)",
  "function withdrawalManager() view returns (address)",
  "function poolPermissionManager() view returns (address)",
  "function strategyListLength() view returns (uint256)",
  "function strategyList(uint256) view returns (address)",
  "function implementation() view returns (address)",
  "function factory() view returns (address)",
  "function admin() view returns (address)",
  "function hasRole(address account, bytes32 role) view returns (bool)",
  "function permissionAdmins(address) view returns (bool)",
  "function isInstanceOf(bytes32 key, address instance) view returns (bool)",
]);
const GOV_TIMELOCK_ABI = parseAbi(["function defaultTimelockParameters() view returns (uint32 delay, uint32 executionWindow)"]);
const GLOBALS_TIMELOCK_ABI = parseAbi(["function defaultTimelockParameters() view returns (uint128 delay, uint128 duration)"]);

const ROLE_UPDATED = parseAbiItem("event RoleUpdated(bytes32 indexed role, address indexed account, bool grantRole)");
const VALID_INSTANCE_SET = parseAbiItem("event ValidInstanceSet(bytes32 indexed instanceKey_, address indexed instance_, bool isValid_)");
const PERMISSION_ADMIN_SET = parseAbiItem("event PermissionAdminSet(address indexed account, bool isAdmin)");

const PROPOSER_ROLE = keccak256(toHex("PROPOSER_ROLE"));
const EXECUTOR_ROLE = keccak256(toHex("EXECUTOR_ROLE"));
const STRATEGY_MANAGER = toHex("STRATEGY_MANAGER", { size: 32 });

/** Privileged functions we read and chose not to score: fee setters, the delegate's own cover, one-time configuration. */
const NOT_SCORED = new Set([
  "completeConfiguration",
  "setDelegateManagementFeeRate",
  "setPlatformManagementFeeRate",
  "setPlatformServiceFeeRate",
  "setPlatformOriginationFeeRate",
  "setMaxCoverLiquidationPercent",
  "setMinCoverAmount",
  "setBootstrapMint",
  "setMapleTreasury",
  "withdrawCover",
  "setPendingPoolDelegate",
  "setStrategyFeeRate",
  "claimRewards",
  "setManualWithdrawal",
  "processRedemptions",
  "processEmptyRedemptions",
  "removeRequest",
  "setPendingTokenWithdrawer",
  "proposeRoleUpdates",
  "executeProposals",
  "scheduleProposals",
  "unscheduleProposals",
  "setDefaultTimelockParameters",
  "setFunctionTimelockParameters",
  "updateRole",
  "updateAccounting",
  "setAllowedSlippage",
  "setMinRatio",
  "unscheduleCall",
]);

type Rule = [power: Power, fns: string[], holders: Address[], who: string];

interface Roles {
  pool: Address;
  globals: Address;
  governor: Address;
  securityAdmin: Address;
  operationalAdmin: Address;
  poolDelegate: Address;
  pdUpgradeDelay: number;
}

async function governorTimelock(ctx: Context, governor: Address) {
  const from = await deploymentBlock(ctx.c, governor, ctx.block);
  const logs = await scanLogs(ctx.c, governor, ROLE_UPDATED, from, ctx.block);
  const members = async (role: `0x${string}`) => {
    const candidates = [...new Set(logs.filter((l) => l.args.role === role).map((l) => getAddress(l.args.account as string)))];
    const held = await Promise.all(candidates.map((a) => ctx.read<boolean>(governor, ABI, "hasRole", [a, role])));
    return candidates.filter((_, i) => held[i]).sort();
  };
  const [delay] = await ctx.readOrThrow<[number, number]>(governor, GOV_TIMELOCK_ABI, "defaultTimelockParameters");
  const proposers = await members(PROPOSER_ROLE);
  ctx.setHolder(governor, {
    kind: "timelock",
    minDelaySeconds: Number(delay),
    proposers: proposers.length > 0 ? proposers : [governor],
    executors: await members(EXECUTOR_ROLE),
  });
}

/** Addresses currently registered in MapleGlobals under an instance key (e.g. STRATEGY_MANAGER bots). */
async function validInstances(ctx: Context, globals: Address, key: `0x${string}`): Promise<Address[]> {
  const from = await deploymentBlock(ctx.c, globals, ctx.block);
  const logs = await scanLogs(ctx.c, globals, VALID_INSTANCE_SET, from, ctx.block);
  const candidates = [...new Set(logs.filter((l) => l.args.instanceKey_ === key).map((l) => getAddress(l.args.instance_ as string)))];
  const valid = await Promise.all(candidates.map((a) => ctx.read<boolean>(globals, ABI, "isInstanceOf", [key, a])));
  return candidates.filter((_, i) => valid[i]).sort();
}

async function permissionAdmins(ctx: Context, ppm: Address): Promise<Address[]> {
  const from = await deploymentBlock(ctx.c, ppm, ctx.block);
  const logs = await scanLogs(ctx.c, ppm, PERMISSION_ADMIN_SET, from, ctx.block);
  const candidates = [...new Set(logs.map((l) => getAddress(l.args.account as string)))];
  const active = await Promise.all(candidates.map((a) => ctx.read<boolean>(ppm, ABI, "permissionAdmins", [a])));
  return candidates.filter((_, i) => active[i]).sort();
}

async function addMapleContract(ctx: Context, address: Address, fallbackName: string, role: "token" | "service", rules: Rule[], warn: string[]) {
  const implementation = await ctx.read<Address>(address, ABI, "implementation");
  const impl = implementation && implementation !== zeroAddress ? getAddress(implementation) : undefined;
  const src = await ctx.source(impl ?? address);
  const name = src.name ?? fallbackName;
  const abiFns = new Set(src.abi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name));

  const permissions: Permission[] = [];
  const mapped = new Set<string>();
  for (const [power, fns, holders, who] of rules) {
    const present = fns.filter((f) => !src.verified || abiFns.has(f));
    if (present.length === 0) continue;
    present.forEach((f) => mapped.add(f));
    const names = present.length > 3 ? `${present.slice(0, 3).join(", ")} +${present.length - 3} more` : present.join(", ");
    ctx.grant(permissions, power, holders.filter((h) => h !== zeroAddress), `${name}.${names} · ${who}`);
  }
  for (const fn of privilegedFunctions(src)) {
    if (!mapped.has(fn.name) && !NOT_SCORED.has(fn.name) && !fn.modifiers.every((m) => /^only(Pool|PoolManager|Self|IfNotConfigured|Factory)$/.test(m)))
      warn.push(`${name}.${fn.name} (${fn.modifiers.join(", ")}) is not mapped to a power; review it.`);
  }
  ctx.addContract(address, {
    name,
    role,
    ...(impl ? { proxy: { type: "custom" as const, implementation: impl } } : {}),
    verified: src.verified,
    permissions,
  });
  return { name, implementation: impl };
}

export async function maplePool(ctx: Context, pool: Address) {
  const warn: string[] = [];
  const pm = getAddress(await ctx.readOrThrow<Address>(pool, ABI, "manager"));
  const globals = getAddress(await ctx.readOrThrow<Address>(pm, ABI, "globals"));
  const [governor, securityAdmin, operationalAdmin, poolDelegate, wm, ppm, strategyCount] = await Promise.all([
    ctx.readOrThrow<Address>(globals, ABI, "governor"),
    ctx.readOrThrow<Address>(globals, ABI, "securityAdmin"),
    ctx.readOrThrow<Address>(globals, ABI, "operationalAdmin"),
    ctx.readOrThrow<Address>(pm, ABI, "poolDelegate"),
    ctx.readOrThrow<Address>(pm, ABI, "withdrawalManager"),
    ctx.readOrThrow<Address>(pm, ABI, "poolPermissionManager"),
    ctx.readOrThrow<bigint>(pm, ABI, "strategyListLength"),
  ]);
  const [pdDelay] = await ctx.readOrThrow<[bigint, bigint]>(globals, GLOBALS_TIMELOCK_ABI, "defaultTimelockParameters");
  const r: Roles = {
    pool: getAddress(pool),
    globals,
    governor: getAddress(governor),
    securityAdmin: getAddress(securityAdmin),
    operationalAdmin: getAddress(operationalAdmin),
    poolDelegate: getAddress(poolDelegate),
    pdUpgradeDelay: Number(pdDelay),
  };
  const strategies = await Promise.all(Array.from({ length: Number(strategyCount) }, (_, i) => ctx.readOrThrow<Address>(pm, ABI, "strategyList", [BigInt(i)])));
  const ppmAdmin = getAddress(await ctx.readOrThrow<Address>(ppm, ABI, "admin"));

  await governorTimelock(ctx, r.governor);
  const strategyManagers = await validInstances(ctx, globals, STRATEGY_MANAGER);
  const ppmAdmins = await permissionAdmins(ctx, getAddress(ppm));

  const pdGovOa = [r.poolDelegate, r.governor, r.operationalAdmin];
  const govOa = [r.governor, r.operationalAdmin];
  const days = Math.round(r.pdUpgradeDelay / 86400);
  const upgrade = (contract: string): Rule => [
    "upgrade",
    ["upgrade"],
    [r.securityAdmin],
    `securityAdmin, no delay, to any version the governor registered on the ${contract} factory (the pool delegate can also upgrade after a ${days}-day scheduled call)`,
  ];

  await addMapleContract(ctx, r.pool, ctx.asset.ticker, "token", [], warn);

  const pmInfo = await addMapleContract(ctx, pm, "PoolManager", "service", [
    upgrade("PoolManager"),
    ["set-price", ["triggerDefault", "finishCollateralLiquidation"], pdGovOa, "pool delegate, governor or operationalAdmin (realizes loan losses into the NAV)"],
    ["allocate", ["setIsStrategy"], pdGovOa, "pool delegate, governor or operationalAdmin (turns a strategy that can pull pool funds on or off)"],
    ["allocate", ["addStrategy"], govOa, "governor or operationalAdmin"],
    ["set-compliance", ["setLiquidityCap", "setPoolPermissionManager"], govOa, "governor or operationalAdmin"],
  ], warn);
  const pmFactory = await ctx.read<Address>(pm, ABI, "factory");
  if (pmFactory) {
    ctx.addContract(pmFactory, {
      name: "PoolManagerFactory",
      role: "other",
      verified: (await ctx.source(getAddress(pmFactory))).verified,
      permissions: (() => {
        const p: Permission[] = [];
        ctx.grant(p, "upgrade", [r.governor], `MapleProxyFactory.registerImplementation, setDefaultVersion, enableUpgradePath · governor (decides which code ${pmInfo.name} can be upgraded to)`);
        return p;
      })(),
    });
  }

  for (let i = 0; i < Number(strategyCount); i++) {
    const s = getAddress(strategies[i]!);
    const src = await ctx.source((await ctx.read<Address>(s, ABI, "implementation")) ?? s);
    const isLoanManager = src.abi.some((x) => x.type === "function" && (x as { name: string }).name === "fund");
    if (isLoanManager) {
      await addMapleContract(ctx, s, "LoanManager", "service", [
        upgrade("LoanManager"),
        ["allocate", ["fund", "callPrincipal", "removeCall", "proposeNewTerms", "rejectNewTerms", "acceptNewTerms"], [r.poolDelegate], "pool delegate (only to loans whose borrower the governor or operationalAdmin approved)"],
        ["set-price", ["impairLoan", "removeLoanImpairment"], [r.poolDelegate, r.governor], "pool delegate or governor (marks a loan's value down or back up in the NAV)"],
      ], warn);
    } else {
      await addMapleContract(ctx, s, "Strategy", "service", [
        upgrade("strategy"),
        ["allocate", ["fundStrategy", "withdrawFromStrategy"], [r.poolDelegate, ...strategyManagers], "pool delegate or a STRATEGY_MANAGER instance registered in Globals"],
        ["allocate", ["setPsm"], pdGovOa, "pool delegate, governor or operationalAdmin"],
        ["set-price", ["impairStrategy", "deactivateStrategy", "reactivateStrategy"], pdGovOa, "pool delegate, governor or operationalAdmin (changes how the strategy's assets count in the NAV)"],
      ], warn);
    }
  }

  await addMapleContract(ctx, getAddress(wm), "WithdrawalManager", "service", [upgrade("WithdrawalManager")], warn);

  await addMapleContract(ctx, getAddress(ppm), "PoolPermissionManager", "service", [
    ["upgrade", ["setImplementation"], [ppmAdmin], "NonTransparentProxy admin, no delay"],
    ["set-compliance", ["setPoolPermissionLevel", "setPoolBitmaps", "setLenderAllowlist", "configurePool"], [r.poolDelegate, ppmAdmin, r.operationalAdmin], `pool delegate, admin or operationalAdmin (decides who can deposit, redeem and transfer ${ctx.asset.ticker})`],
    ["set-compliance", ["setLenderBitmaps"], [...ppmAdmins, ppmAdmin, r.operationalAdmin], "permission admins, admin or operationalAdmin"],
    ["admin", ["setPermissionAdmin"], [ppmAdmin, r.operationalAdmin], "admin or operationalAdmin"],
  ], warn);

  await addMapleContract(ctx, globals, "MapleGlobals", "service", [
    ["upgrade", ["setImplementation"], [r.governor], "NonTransparentProxy admin (governor)"],
    ["pause", ["setProtocolPause", "setContractPause", "setFunctionUnpause"], [r.governor, r.securityAdmin], "governor or securityAdmin"],
    ["admin", ["setSecurityAdmin", "setOperationalAdmin", "setPendingGovernor", "setMigrationAdmin", "setTimelockWindow", "setTimelockWindows", "setValidPoolDeployer", "setValidPoolAsset", "setValidCollateralAsset"], [r.governor], "governor"],
    ["admin", ["setValidBorrower", "setValidPoolDelegate", "setValidInstanceOf", "setCanDeployFrom", "activatePoolManager"], govOa, "governor or operationalAdmin (approves borrowers, pool delegates and bots)"],
    ["set-price", ["setManualOverridePrice", "setPriceOracle"], [r.governor], "governor (collateral price oracles used for liquidations)"],
  ], warn);

  for (const w of warn) process.stderr.write(`  maple: ${w}\n`);
  return {
    poolManager: pm,
    poolDelegate: r.poolDelegate,
    strategyManagers,
    permissionAdmins: ppmAdmins,
    unmapped: warn,
  };
}
