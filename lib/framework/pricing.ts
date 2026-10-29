import type { Asset, FreshnessClass } from "../schema/asset";
import type { Live } from "../schema/live";
import { formatDuration } from "../format";
import type { Measured } from "../schema/measured";
import { oracleAge } from "../oracle";
import { hasMarket } from "./exit";
import { PROFILE_LABELS } from "./transparency";
import { rateCategory, type CategoryResult, type Check } from "./types";

/** Seconds between updates that still count as fresh, per profile (same bar as Transparency). */
export const PRICE_CADENCE_MAX: Record<FreshnessClass, number> = {
  "tbill-mmf": 86400,
  "short-duration-credit": 7 * 86400,
  "private-credit": 31 * 86400,
  "real-estate": 92 * 86400,
};
/** A secondary-market discount above this is worth flagging. */
export const MAX_DISCOUNT_PCT = 2;

const ORIGIN_TEXT = {
  issuer: "the issuer",
  "fund-administrator": "the fund administrator",
  custodian: "the custodian",
} as const;

export function ratePricing(asset: Asset, live: Live | undefined, measured: Measured | undefined): CategoryResult {
  const ref = asset.pricing.reference;
  const p = asset.pricing;
  const profile = asset.freshnessClass.value;
  const findings: Check[] = [];
  const context: string[] = [];
  const add = (id: string, color: Check["color"], text: string, extra: Partial<Check> = {}) =>
    findings.push({ id: `pricing.${id}`, color, text, ...extra });

  if (ref.type === "none") {
    add(
      "none",
      "red",
      asset.priceModel === "stable-nav"
        ? "There's no NAV feed, so markets can only assume the token is worth $1."
        : "There's no onchain price or NAV.",
    );
    return rateCategory("pricing", findings, context, "");
  }

  if (ref.type === "vault") {
    add("live", "green", "The contract computes the NAV itself, so it can't go stale.", { source: ref.source });
    if (ref.writer === "eoa")
      add("manual", "red", "A single key can write the NAV down or back up by hand.", { source: ref.source });
    else if (ref.writer === "issuer-multisig")
      add("writer", "yellow", "The issuer's multisig can write the NAV down or back up.", { source: ref.source });
  } else {
    if (ref.writer === "eoa")
      add("manual", "red", "A single key types in the onchain price (manual pricing).", { source: ref.source });
    else if (ref.writer === "issuer-multisig")
      add("writer", "yellow", "The issuer's own multisig publishes the onchain price.", { source: ref.source });
    else add("writer", "green", `Delivered by an oracle (${ref.provider}).`, { source: ref.source });

    if (ref.cadenceSeconds > PRICE_CADENCE_MAX[profile])
      add(
        "cadence",
        "red",
        `The price updates every ${formatDuration(ref.cadenceSeconds)}, too rarely for ${PROFILE_LABELS[profile]}.`,
        { source: ref.source },
      );
    else
      add(
        "cadence",
        "green",
        `Updates every ${formatDuration(ref.cadenceSeconds)}, fast enough for ${PROFILE_LABELS[profile]}.`,
        { source: ref.source },
      );

    const age = oracleAge(asset, live);
    if (age?.freshness === "stale")
      add("stale", "red", `The onchain price hasn't updated in ${formatDuration(age.ageSeconds)}.`);
    else if (age?.freshness === "late")
      add(
        "late",
        "yellow",
        `The onchain price is ${formatDuration(age.scheduledAgeSeconds - age.cadenceSeconds)} late.`,
      );

    const s = p.stalenessDetectable;
    if (s.value) add("staleness", "green", "Consumers can tell how old the price is.", { source: s.source });
    else add("staleness", "red", "Consumers can't tell from the feed when the price is stale.", { source: s.source });
  }

  if (ref.dataOrigin === "issuer")
    add("origin", "yellow", "The NAV comes from the issuer, with no independent check.", { source: ref.source });
  else add("origin", "green", `The NAV comes from ${ORIGIN_TEXT[ref.dataOrigin]}.`, { source: ref.source });

  const loss = p.lossRecognition;
  if (loss.value === "delayed")
    add("losses", "yellow", "Write-downs reach the onchain price later than they happen.", { source: loss.source });
  else
    add(
      "losses",
      "green",
      loss.value === "immediate" ? "Write-downs show up in the price at once." : "Write-downs show up at the next NAV.",
      { source: loss.source },
    );

  if (hasMarket(measured)) {
    const d = p.secondaryDiscount;
    if (d?.status === "public" && d.value.maxPct > MAX_DISCOUNT_PCT)
      add("discount", "yellow", `It has traded up to ${d.value.maxPct}% below NAV (${d.value.window}).`, {
        source: d.source,
      });
    else if (d?.status === "public")
      add("discount", "green", `Its market price tracks NAV: at most ${d.value.maxPct}% below (${d.value.window}).`, {
        source: d.source,
      });
    else add("discount", "yellow", "It trades onchain, but nobody tracks its market price against NAV.");
  }

  const fixed = live?.defiMarkets.filter((m) => m.oracle.type === "fixed" && m.collateralUsd > 0) ?? [];
  if (fixed.length > 0)
    add(
      "defi-fixed",
      "yellow",
      `${fixed.length} lending market${fixed.length === 1 ? " prices" : "s price"} ${asset.ticker} at a fixed $1, with no NAV check.`,
    );

  return rateCategory(
    "pricing",
    findings,
    context,
    "NAV from an independent administrator, delivered by an oracle with staleness checks, and losses reflected promptly.",
  );
}
