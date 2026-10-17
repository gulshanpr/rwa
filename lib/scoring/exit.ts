import type { Asset } from "../schema/asset";
import { sliceFromReasons, type Reason, type SliceResult } from "./types";

export const MIN_INSTANT_DEPTH_PCT = 2;

export function settlementDays(settlement: string): number {
  return Number(settlement.replace("T+", ""));
}

export function scoreExit(asset: Asset): SliceResult {
  const { redemption, instantLiquidity } = asset.exit;
  const reasons: Reason[] = [];
  const add = (id: string, color: Reason["color"], text: string) =>
    reasons.push({
      id: `exit.${id}`,
      slice: "exit",
      color,
      text,
      critical: false,
      evidence: { tab: "exit", label: "Exit terms" },
    });

  if (!redemption.available.value) {
    add("no-redemption", "red", "There is no documented way to redeem.");
    return sliceFromReasons("exit", reasons, "");
  }

  const settlement = redemption.settlement;
  if (settlement.status !== "public") {
    add("settlement-unknown", "yellow", "The redemption settlement time is not public.");
  } else {
    const days = settlementDays(settlement.value);
    if (days > 5) add("slow", "red", `Redemption takes ${settlement.value}, longer than T+5.`);
    else if (days > 1) add("t5", "yellow", `Redemption settles at ${settlement.value}, slower than T+1.`);
  }

  const gates = redemption.gatesOrSuspension;
  if (gates.status === "public" && gates.value === "issuer-discretion")
    add("discretion", "red", "The issuer can suspend redemptions at its discretion, with no stated limits.");
  else if (gates.status !== "public")
    add("gates-unknown", "yellow", "The terms for suspending redemptions are not public.");

  if (redemption.whoCanRedeem.value === "issuer-approved")
    add("approval", "yellow", "Each redemption needs case-by-case approval from the issuer.");

  // Every instant route needs measured capacity of at least 2% of supply. A facility with no measured
  // liquidity might be empty, as BUIDL's USDC facility was at review.
  const instant = instantLiquidity.filter((l) => (l.depthPctOfSupply ?? 0) >= MIN_INSTANT_DEPTH_PCT);
  const unmeasured = instantLiquidity.filter((l) => l.type === "offramp-contract" && l.depthPctOfSupply === undefined);
  if (instant.length === 0 && unmeasured.length > 0)
    add("instant-unmeasured", "yellow", `There's an onchain redemption contract (${unmeasured[0].label}), but how much it can pay out isn't measured.`);
  else if (instant.length === 0)
    add("no-instant", "yellow", "There's no onchain way to exit instantly; redemption goes through the issuer.");

  return sliceFromReasons(
    "exit",
    reasons,
    settlement.status === "public"
      ? `Redemption at ${settlement.value}, plus an onchain instant exit.`
      : "Redemption plus an onchain instant exit.",
  );
}
