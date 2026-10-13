import type { Asset } from "../schema/asset";
import type { Live } from "../schema/live";
import { formatDuration, secondsBetween } from "../format";
import { sliceFromReasons, type Reason, type SliceResult } from "./types";

export type OracleFreshness = "on-schedule" | "late" | "stale" | "missing";

export interface OracleAge {
  ageSeconds: number;
  cadenceSeconds: number;
  ratio: number;
  freshness: OracleFreshness;
}

export function oracleAge(asset: Asset, live: Live | undefined): OracleAge | undefined {
  const ref = asset.pricing.reference;
  if (ref.type !== "oracle" || !live?.oracle) return undefined;
  const ageSeconds = secondsBetween(live.oracle.updatedAt, live.asOf);
  const ratio = ageSeconds / ref.cadenceSeconds;
  const freshness: OracleFreshness = ratio > 3 ? "stale" : ratio > 1 ? "late" : "on-schedule";
  return { ageSeconds, cadenceSeconds: ref.cadenceSeconds, ratio, freshness };
}

export function scorePricing(asset: Asset, live: Live | undefined): SliceResult {
  const ref = asset.pricing.reference;
  const reasons: Reason[] = [];
  const add = (id: string, color: Reason["color"], text: string, tab: Reason["evidence"]["tab"] = "pricing", label = "Price source") =>
    reasons.push({ id: `pricing.${id}`, slice: "pricing", color, text, critical: color === "red", evidence: { tab, label } });

  if (ref.type === "none") {
    add("none", "red", "There is no onchain price or NAV reference.");
    return sliceFromReasons("pricing", reasons, "");
  }

  if (ref.type === "vault") {
    if (ref.writer === "eoa") add("eoa", "red", "A single key can write the onchain NAV down or back up, for example by marking loans as impaired.");
    else if (ref.writer === "issuer-multisig") add("issuer-writer", "yellow", "The issuer's own multisig can write the onchain NAV down or back up.");
    if (ref.dataOrigin === "issuer") add("issuer-origin", "yellow", "The NAV is the issuer's own accounting, not a fund administrator's or custodian's.");
    if (!ref.historyOnchain) add("history", "yellow", "Price history isn't kept onchain.");
    return sliceFromReasons("pricing", reasons, "The token's own contract computes the NAV and nobody can override it.");
  }

  const age = oracleAge(asset, live);
  if (ref.writer === "eoa") add("eoa", "red", "A single key writes the onchain price.");
  if (age?.freshness === "stale")
    add("stale", "red", `The onchain price hasn't updated in ${formatDuration(age.ageSeconds)}; lending markets may misprice it.`);
  else if (age?.freshness === "late")
    add("late", "yellow", `The onchain price is ${formatDuration(age.ageSeconds - age.cadenceSeconds)} late.`);

  if (ref.writer === "issuer-multisig") add("issuer-writer", "yellow", "The issuer's own multisig writes the onchain price.");
  if (ref.writer === "single-provider" && ref.dataOrigin === "issuer")
    add("single-provider", "yellow", "A single provider relays the issuer's self-reported NAV.");
  else if (ref.dataOrigin === "issuer")
    add("issuer-origin", "yellow", "The NAV comes from the issuer, not a fund administrator or custodian.");
  if (ref.cadenceSeconds > 86400) add("cadence", "yellow", "The onchain price updates less than daily.");
  if (!ref.historyOnchain) add("history", "yellow", "Price history isn't kept onchain.");

  if (asset.priceModel === "stable-nav" && live) {
    const fixed = live.defiMarkets.filter((m) => m.oracle.type === "fixed");
    if (fixed.length > 0) {
      add(
        "defi-fixed",
        "yellow",
        `${fixed.length} of ${live.defiMarkets.length} DeFi markets price ${asset.ticker} at a fixed $1, with no NAV check.`,
        "defi",
        "Market oracles",
      );
    }
  }

  return sliceFromReasons("pricing", reasons, "An independent oracle network publishes the NAV at least daily.");
}
