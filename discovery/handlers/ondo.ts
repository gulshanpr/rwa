import { getAddress, parseAbi, zeroAddress, type Address } from "viem";
import type { Power } from "@/lib/schema/discovered";
import type { Context } from "../context";
import { addMapped, reportWarnings, roleHash } from "./mapped";
import { roleMembers } from "./oz-access-control";

/**
 * Ondo Qualified Access tokens (OUSG). OpenZeppelin AccessControl throughout, with Ondo's own role
 * names. Minting goes through the InstantManager (a MINTER_ROLE holder), which prices against
 * OndoOracle → OUSGOracleWrapper → RWAOracleExternalComparisonCheck. Holder eligibility lives in
 * OndoIDRegistry, where each token has its own role.
 */

const ABI = parseAbi([
  "function kycRegistry() view returns (address)",
  "function ondoOracle() view returns (address)",
  "function ondoIDRegistry() view returns (address)",
  "function ondoRateLimiter() view returns (address)",
  "function ondoTokenRouter() view returns (address)",
  "function adminSubscriptionChecker() view returns (address)",
  "function tokenToRWAOracle(address) view returns (address)",
  "function rwaOracle() view returns (address)",
  "function rwaRole(address) view returns (bytes32)",
]);

const IM_POWERS: Record<string, Power> = {
  setOndoOracle: "set-price",
  setMinimumRwaPrice: "set-price",
  setOndoIDRegistry: "set-compliance",
  setOndoCompliance: "set-compliance",
  setAdminSubscriptionChecker: "mint",
  setOndoTokenRouter: "allocate",
  retrieveTokens: "allocate",
  setAcceptedSubscriptionToken: "set-compliance",
  setAcceptedRedemptionToken: "set-compliance",
  pauseSubscribe: "pause",
  pauseRedeem: "pause",
  unpauseSubscribe: "pause",
  unpauseRedeem: "pause",
};
/** Reviewed and not scored: fee contracts, minimum sizes and rate limits shape exits, not holdings. */
const IM_NOT_SCORED = ["setOndoRedemptionFees", "setOndoSubscriptionFees", "setMinimumDepositAmount", "setMinimumRedemptionAmount", "setOndoRateLimiter"];

export async function ondo(ctx: Context, token: Address) {
  const warn: string[] = [];
  const t = await addMapped(ctx, token, { role: "token", powers: { setKYCRegistry: "set-compliance", setKYCRequirementGroup: "set-compliance" } }, warn);

  const kycView = await ctx.read<Address>(token, ABI, "kycRegistry");
  if (kycView && kycView !== zeroAddress)
    await addMapped(ctx, kycView, { role: "service", powers: { setOndoRegistry: "set-compliance", setKYCRequirementGroupToRwaToken: "set-compliance" } }, warn);

  const minters = t.roles.get(roleHash("MINTER_ROLE")) ?? [];
  const managers: Address[] = [];
  for (const m of minters) {
    if (await ctx.read<Address>(m, ABI, "ondoOracle")) managers.push(m);
  }
  if (managers.length === 0) warn.push("No InstantManager found among MINTER_ROLE holders.");

  for (const im of managers) {
    const imRoles = await roleMembers(ctx, im);
    const adminSubscribers = imRoles.get(roleHash("ADMIN_SUBSCRIPTION_ROLE")) ?? [];
    await addMapped(
      ctx,
      im,
      {
        role: "service",
        powers: IM_POWERS,
        notScored: IM_NOT_SCORED,
        rules: [{ power: "mint", fns: ["adminSubscribe"], holders: adminSubscribers, via: "ADMIN_SUBSCRIPTION_ROLE (capped by AdminSubscriptionChecker allowance)" }],
      },
      warn,
    );

    const oracle = await ctx.read<Address>(im, ABI, "ondoOracle");
    if (oracle && oracle !== zeroAddress) {
      await addMapped(ctx, oracle, { role: "oracle", powers: { setTokenToOracleType: "set-price", setHardcodedPrice: "set-price", setTokenToAggregatorV3Oracle: "set-price", setTokenToRWAOracle: "set-price" } }, warn);
      const wrapper = await ctx.read<Address>(oracle, ABI, "tokenToRWAOracle", [token]);
      if (wrapper && wrapper !== zeroAddress) {
        await addMapped(ctx, wrapper, { role: "oracle", powers: { setRwaOracle: "set-price" }, notScored: ["renounceOwnership"] }, warn);
        const source = await ctx.read<Address>(wrapper, ABI, "rwaOracle");
        if (source && source !== zeroAddress) await addMapped(ctx, source, { role: "oracle" }, warn);
      }
    }

    const registry = await ctx.read<Address>(im, ABI, "ondoIDRegistry");
    if (registry && registry !== zeroAddress) {
      const regRoles = await roleMembers(ctx, registry);
      const rwaRole = await ctx.read<`0x${string}`>(registry, ABI, "rwaRole", [token]);
      const registrars = [...new Set([...(rwaRole ? (regRoles.get(rwaRole) ?? []) : []), ...(regRoles.get(roleHash("MASTER_CONFIGURER_ROLE")) ?? [])])];
      await addMapped(
        ctx,
        registry,
        {
          name: "OndoIDRegistry",
          role: "service",
          powers: { setRWARole: "admin" },
          rules: [{ power: "freeze", fns: ["setUserID", "removeUserAddresses"], holders: registrars, via: `rwaRole(${ctx.asset.ticker}) or MASTER_CONFIGURER_ROLE` }],
        },
        warn,
      );
    }

    const router = await ctx.read<Address>(im, ABI, "ondoTokenRouter");
    if (router && router !== zeroAddress)
      await addMapped(
        ctx,
        router,
        {
          role: "service",
          powers: { setWithdrawTokenSources: "allocate", setUserWithdrawTokenSources: "allocate", setDepositTokenRecipient: "allocate", setMinimumTokenPriceAndOracle: "set-price" },
          guards: { "onlyRole(RWA_MANAGER_ROLE)": null },
        },
        warn,
      );
  }

  reportWarnings("ondo", warn);
  return { instantManagers: managers.map((m) => getAddress(m)), warnings: warn };
}
