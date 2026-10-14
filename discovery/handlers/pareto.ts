import { getAddress, parseAbi, zeroAddress, type Address } from "viem";
import type { Context } from "../context";
import { addMapped, reportWarnings } from "./mapped";

/**
 * Pareto credit vaults (IdleCDOEpochVariant). The senior tranche is an immutable ERC-20 whose only
 * minter is the vault. The vault, strategy and queue are upgradeable. Epoch start/stop sets the
 * tranche price; that call is made by the strategy manager's operator. `startEpoch` also pauses
 * deposits and turns withdrawal requests off until the epoch stops.
 */

const ABI = parseAbi([
  "function minter() view returns (address)",
  "function owner() view returns (address)",
  "function strategy() view returns (address)",
  "function manager() view returns (address)",
  "function borrower() view returns (address)",
  "function operator() view returns (address)",
  "function AATranche() view returns (address)",
  "function BBTranche() view returns (address)",
]);

const CHECKS = ["_checkOnlyOwner()", "_checkOnlyOwnerOrManager()", "_checkOnlyOwnerOrGuardian()", "onlyOwner"] as const;

export async function pareto(ctx: Context, token: Address) {
  const warn: string[] = [];
  const minter = await ctx.read<Address>(token, ABI, "minter");
  const cdo = minter ? getAddress(minter) : token;
  const owner = await ctx.readOrThrow<Address>(cdo, ABI, "owner");
  const strategy = await ctx.readOrThrow<Address>(cdo, ABI, "strategy");
  const manager = await ctx.readOrThrow<Address>(strategy, ABI, "manager");
  const borrower = await ctx.readOrThrow<Address>(strategy, ABI, "borrower");
  const operator = (await ctx.read<Address>(manager, ABI, "operator")) ?? manager;
  const bb = await ctx.read<Address>(cdo, ABI, "BBTranche");
  const keys = {
    owner: getAddress(owner),
    manager: getAddress(manager),
    operator: getAddress(operator),
    borrower: getAddress(borrower),
  };
  const ownerOrOperator = [...new Set([keys.owner, keys.operator])].sort();

  const who = (modifier: string) => {
    if (modifier === "_checkOnlyOwner()" || modifier === "onlyOwner") return { holders: [keys.owner], label: "owner" };
    if (modifier === "_checkOnlyOwnerOrManager()") return { holders: ownerOrOperator, label: "owner or the strategy manager's operator" };
    if (modifier === "_checkOnlyOwnerOrGuardian()") return { holders: [keys.owner], label: "owner (guardian is an internal variable, initialized to the owner; no public getter)" };
    return undefined;
  };

  const tranche = async (address: Address, role: "token" | "service") => {
    const src = await ctx.source(address);
    const permissions: { power: "mint" | "burn-from"; holder: Address; via: string }[] = [];
    ctx.grant(permissions, "mint", [cdo], `${src.name ?? "Tranche"}.mint · minter is the vault`);
    ctx.grant(permissions, "burn-from", [cdo], `${src.name ?? "Tranche"}.burn · minter is the vault`);
    ctx.addContract(address, { name: src.name ?? "IdleCDOTranche", role, verified: src.verified, permissions });
  };
  await tranche(token, "token");
  if (bb && bb !== zeroAddress && getAddress(bb) !== getAddress(token)) await tranche(getAddress(bb), "service");

  // Mint and burn on the tranche are only reachable through the vault, and only the owner and the
  // operator drive it. The borrower can write the price down, but cannot mint.
  ctx.setHolder(cdo, { kind: "contract", name: "IdleCDO", controllers: ownerOrOperator });
  ctx.setHolder(keys.manager, { kind: "contract", name: "IdleCreditVault manager", controllers: [keys.operator] });

  await addMapped(
    ctx,
    cdo,
    {
      role: "service",
      guards: Object.fromEntries(CHECKS.map((m) => [m, who(m)!])),
      powers: {
        startEpoch: "set-price",
        stopEpoch: "set-price",
        stopEpochWithDuration: "set-price",
        writeOffDeposit: "set-price",
        updateAccounting: "set-price",
        transferToken: "allocate",
        emergencyShutdown: "pause",
      },
      rules: [
        { power: "set-price", fns: ["startEpoch", "stopEpoch", "stopEpochWithDuration"], holders: ownerOrOperator, via: "owner or the strategy manager's operator. stopEpoch sets the interest and therefore priceAA" },
        { power: "set-price", fns: ["writeOffDeposit"], holders: [keys.borrower], via: "borrower, and only while an epoch is running" },
        { power: "pause", fns: ["pause", "unpause", "emergencyShutdown"], holders: [keys.owner], via: "owner. startEpoch also pauses deposits itself" },
        { power: "allocate", fns: ["transferToken"], holders: [keys.owner], via: "owner, no timelock" },
      ],
      notScored: [
        "initialize",
        "depositAA",
        "depositBB",
        "depositDuringEpoch",
        "requestWithdraw",
        "claimWithdrawRequest",
        "claimInstantWithdrawRequest",
        "sendFundsToBorrower",
        "getFundsFromBorrower",
        "getInstantWithdrawFunds",
        "restoreOperations",
        "finalizeDefault",
      ],
    },
    warn,
  );

  await addMapped(
    ctx,
    strategy,
    {
      role: "service",
      guards: { onlyOwner: { holders: [keys.owner], label: "owner" }, onlyIdleCDO: null },
      powers: { setBorrower: "allocate", transferToken: "allocate", setManager: "admin" },
      rules: [
        { power: "allocate", fns: ["setBorrower"], holders: [keys.owner], via: "owner. points the vault's only borrower" },
        { power: "set-price", fns: ["setApr", "setAprs", "setAprsWithBuffer"], holders: [cdo], via: "only the vault, which the operator drives at epoch stop" },
      ],
      notScored: ["deposit", "redeem", "redeemUnderlying", "requestWithdraw", "claimWithdrawRequest", "initialize"],
    },
    warn,
  );

  warn.push("guardian is internal (IdleCDOStorage) and was set to the owner at initialization. setGuardian can change it and there is no getter, so a later change would not show up here.");
  reportWarnings("pareto", warn);
  return { cdo, strategy, ...keys, warnings: warn };
}
