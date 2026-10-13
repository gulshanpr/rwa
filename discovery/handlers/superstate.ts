import { getAddress, parseAbi, zeroAddress, type Address } from "viem";
import type { Context } from "../context";
import { addMapped, reportWarnings } from "./mapped";

/**
 * Superstate fund tokens (USTB, USCC). Every contract is Ownable: the token's `_requireAuth()` checks
 * `owner()`, and the oracle and allowlist each have their own owner. RedemptionIdle is left out: the
 * token only stores its address and grants it nothing, so it belongs to Exit, not Control.
 */

const ABI = parseAbi([
  "function owner() view returns (address)",
  "function superstateOracle() view returns (address)",
  "function allowlist() view returns (address)",
]);

/**
 * Reviewed and not scored: metadata, chain support for the issuer's own bridge, a one-time initializer,
 * and the RedemptionIdle pointer (informational; the token grants it nothing).
 */
const TOKEN_NOT_SCORED = ["setName", "setSymbol", "setChainIdSupport", "setIsPublicInstrument", "initializeV1_2_0", "renounceOwnership", "setRedemptionContract"];

export async function superstate(ctx: Context, token: Address) {
  const warn: string[] = [];
  const owner = await ctx.read<Address>(token, ABI, "owner");
  const tokenOwner = { holders: owner ? [getAddress(owner)] : [], label: "owner()" };
  await addMapped(
    ctx,
    token,
    {
      role: "token",
      guards: { "_requireAuth()": tokenOwner },
      powers: {
        bulkMint: "mint",
        adminBurn: "burn-from",
        accountingPause: "pause",
        accountingUnpause: "pause",
        setMaximumOracleDelay: "set-price",
        setAllowlist: "set-compliance",
        setStablecoinConfig: "allocate",
      },
      notScored: TOKEN_NOT_SCORED,
    },
    warn,
  );

  const oracle = await ctx.read<Address>(token, ABI, "superstateOracle");
  if (oracle && oracle !== zeroAddress)
    await addMapped(ctx, oracle, { role: "oracle", powers: { addCheckpoint: "set-price", addCheckpoints: "set-price", setMaximumAcceptablePriceDelta: "set-price" }, notScored: ["renounceOwnership"] }, warn);

  const allowlist = await ctx.read<Address>(token, ABI, "allowlist");
  if (allowlist && allowlist !== zeroAddress)
    await addMapped(ctx, allowlist, { role: "service", powers: { setAllowed: "freeze", setAllowedBatch: "freeze" }, notScored: ["renounceOwnership"] }, warn);

  reportWarnings("superstate", warn);
  return { oracle, allowlist, warnings: warn };
}
