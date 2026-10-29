import type { Asset, Frequency, FreshnessClass, Report } from "../schema/asset";
import { rateCategory, type CategoryResult, type Check, type Color } from "./types";

/** Framework §5: "Freshness should fit the asset". The slowest update that still counts as fresh. */
export const FRESHNESS_TARGET: Record<FreshnessClass, Frequency> = {
  "tbill-mmf": "daily",
  "short-duration-credit": "weekly",
  "private-credit": "monthly",
  "real-estate": "quarterly",
};

export const PROFILE_LABELS: Record<FreshnessClass, string> = {
  "tbill-mmf": "a T-bill or money market fund",
  "short-duration-credit": "short-duration credit",
  "private-credit": "private credit",
  "real-estate": "real estate",
};

const FREQUENCY_RANK: Record<Frequency, number> = {
  realtime: 0,
  daily: 1,
  weekly: 2,
  monthly: 3,
  quarterly: 4,
  annual: 5,
  unstated: 6,
};

function isFresh(frequency: Frequency, profile: FreshnessClass): boolean {
  return FREQUENCY_RANK[frequency] <= FREQUENCY_RANK[FRESHNESS_TARGET[profile]];
}

interface ReportTests {
  independent: boolean;
  position: boolean;
  fresh: boolean;
  verified: boolean;
}

export function reportTests(r: Report, profile: FreshnessClass): ReportTests {
  return {
    independent: r.dataSource !== "issuer",
    position: r.granularity === "position",
    fresh: isFresh(r.frequency, profile),
    verified: r.verifiability !== "self-reported",
  };
}

function reportColor(t: ReportTests): Color {
  if (!t.verified) return "red";
  return t.independent && t.position && t.fresh ? "green" : "yellow";
}

const COLOR_ORDER: Record<Color, number> = { green: 0, yellow: 1, red: 2 };

export function bestReport(asset: Asset): Report | undefined {
  const profile = asset.freshnessClass.value;
  const score = (r: Report) => {
    const t = reportTests(r, profile);
    return COLOR_ORDER[reportColor(t)] * 10 - Object.values(t).filter(Boolean).length;
  };
  return [...asset.transparency.reports].sort((a, b) => score(a) - score(b))[0];
}

/** Framework §5: onchain data is a separate badge, not part of the rating. */
export function hasOnchainData(asset: Asset): boolean {
  return asset.transparency.reports.some((r) => r.onchain);
}

const SOURCE_TEXT: Record<Report["dataSource"], string> = {
  issuer: "the issuer",
  "fund-administrator": "the fund administrator",
  custodian: "the custodian",
  independent: "an independent third party",
};

const GRANULARITY_TEXT: Record<Report["granularity"], string> = {
  nav: "a single NAV",
  "asset-class": "a breakdown by asset class",
  position: "every position",
};

export function rateTransparency(asset: Asset): CategoryResult {
  const t = asset.transparency;
  const profile = asset.freshnessClass.value;
  const findings: Check[] = [];
  const context = t.constraints.map(
    (c) => `Kept private: ${c.what}. Reason: ${c.reason}. Shared with ${c.sharedWith}.`,
  );
  const add = (id: string, color: Check["color"], text: string, extra: Partial<Check> = {}) =>
    findings.push({ id: `transparency.${id}`, color, text, ...extra });

  const best = bestReport(asset);
  if (!best) {
    add("none", "red", "There's no meaningful public disclosure of what backs the token.");
    return rateCategory("transparency", findings, context, "");
  }

  const tests = reportTests(best, profile);
  const source = best.source;
  if (!tests.verified) {
    add("self-reported", "red", `The only reports are self-reported by the issuer (best: ${best.name}).`, { source });
    return rateCategory("transparency", findings, context, "");
  }

  add(
    "verified",
    "green",
    `${best.name}: ${best.verifiability === "cryptographic" ? "cryptographically verifiable" : `a third-party ${best.verifiability}`}.`,
    { source },
  );
  if (tests.independent)
    add("independent", "green", `Data comes from ${SOURCE_TEXT[best.dataSource]}, not the issuer.`, { source });
  else add("independent", "yellow", "The data comes from the issuer itself, not an independent party.", { source });
  if (tests.position) add("granularity", "green", "Every position is published.", { source });
  else
    add("granularity", "yellow", `Only ${GRANULARITY_TEXT[best.granularity]} is published, not every position.`, {
      source,
    });
  if (tests.fresh)
    add("freshness", "green", `Updated ${best.frequency}, fast enough for ${PROFILE_LABELS[profile]}.`, { source });
  else
    add(
      "freshness",
      "yellow",
      best.frequency === "unstated"
        ? `No update schedule is stated; ${PROFILE_LABELS[profile]} needs at least ${FRESHNESS_TARGET[profile]}.`
        : `Updated ${best.frequency}, slower than the ${FRESHNESS_TARGET[profile]} that ${PROFILE_LABELS[profile]} needs.`,
      { source },
    );

  if (profile === "private-credit") {
    const e = t.eventReporting;
    if (e.status === "public" && e.value)
      add("events", "green", "Defaults and write-downs are reported when they happen.", { source: e.source });
    else if (e.status === "public")
      add("events", "yellow", "Defaults only show up in the next periodic report.", { source: e.source });
    else
      add("events", "unknown", "There's no stated commitment to report defaults when they happen.", {
        worstCase: "yellow",
      });
  }

  return rateCategory(
    "transparency",
    findings,
    context,
    "Independently sourced, position-level data, refreshed at a pace that fits the asset, and verifiable.",
  );
}
