import type { Asset, HoldingType } from "../schema/asset";
import { rateCategory, type CategoryResult, type Check } from "./types";

/** Counted as "short-dated government debt, cash, or repo backed by government debt". */
export const GOVERNMENT_TYPES: HoldingType[] = [
  "cash",
  "government-bills",
  "government-notes",
  "government-repo",
  "government-mmf",
  "stablecoin",
];
export const GOVERNMENT_MIN_PCT = 95;
export const SHORT_DATED_DAYS = 365;
/** Above this, one borrower defaulting is a large loss for the pool. */
export const MAX_OBLIGOR_PCT = 20;
export const MIN_OBLIGORS = 10;
export const MIN_HISTORY_MONTHS = 12;
export const LOSS_LOOKBACK_YEARS = 3;

export const HOLDING_LABELS: Record<HoldingType, string> = {
  cash: "Cash",
  "government-bills": "T-bills",
  "government-notes": "Treasury notes",
  "government-repo": "Government repo",
  "government-mmf": "Government money funds",
  stablecoin: "Stablecoins",
  "secured-loans": "Secured loans",
  "unsecured-loans": "Unsecured loans",
  "structured-credit": "Structured credit",
  "corporate-bonds": "Corporate bonds",
  "credit-fund": "Credit fund",
  "digital-asset-strategies": "Digital-asset strategies",
  "real-estate": "Real estate",
  other: "Other",
};

const round = (n: number) => Math.round(n * 10) / 10;

export function governmentPct(items: { type: HoldingType; pct: number }[]): number {
  return items.filter((i) => GOVERNMENT_TYPES.includes(i.type)).reduce((s, i) => s + i.pct, 0);
}

function monthsBetween(from: string, to: Date): number {
  const a = new Date(`${from}T00:00:00Z`);
  return (to.getUTCFullYear() - a.getUTCFullYear()) * 12 + (to.getUTCMonth() - a.getUTCMonth());
}

export function rateUnderlying(asset: Asset, now: Date): CategoryResult {
  const u = asset.underlying;
  const findings: Check[] = [];
  const context: string[] = [];
  const add = (id: string, color: Check["color"], text: string, extra: Partial<Check> = {}) =>
    findings.push({ id: `underlying.${id}`, color, text, ...extra });

  if (u.holdings.status !== "public") {
    add("holdings", "unknown", "What backs the token isn't published.", { worstCase: "red" });
    return rateCategory("underlying", findings, context, "");
  }

  const { items, asOf, basis } = u.holdings.value;
  const gov = governmentPct(items);
  const list = items.map((i) => `${i.label ?? HOLDING_LABELS[i.type]} ${round(i.pct)}%`).join(", ");
  context.push(
    basis === "mandate"
      ? `Only the mandate is published, no dated holdings: ${list}.`
      : `Holdings on ${asOf}: ${list}.`,
  );

  if (gov >= GOVERNMENT_MIN_PCT) {
    add("government", "green", `${round(gov)}% is government debt, government repo or cash.`, {
      source: u.holdings.source,
    });
    const billsOnly = !items.some((i) => i.type === "government-notes");
    if (u.wamDays.status !== "public" && billsOnly)
      add("wam", "green", "Short-dated: T-bills, repo and cash all mature within a year.");
    else if (u.wamDays.status !== "public")
      add("wam", "unknown", "The weighted average maturity isn't published.", { worstCase: "yellow" });
    else if (u.wamDays.value > SHORT_DATED_DAYS)
      add(
        "wam",
        "yellow",
        `The weighted average maturity is ${u.wamDays.value} days, so rate moves can cut the price.`,
        { source: u.wamDays.source },
      );
    else
      add("wam", "green", `Short-dated: the weighted average maturity is ${u.wamDays.value} days.`, {
        source: u.wamDays.source,
      });
    return rateCategory(
      "underlying",
      findings,
      context,
      "Short-dated government debt. No private borrower can cause a loss.",
    );
  }

  add(
    "credit",
    "yellow",
    `${round(100 - gov)}% is private credit or other risk assets, so losses depend on borrowers paying back.`,
    {
      source: u.holdings.source,
    },
  );

  const quality = u.creditQuality;
  const secured = u.securedPct;
  const isIg = quality?.status === "public" && quality.value === "investment-grade";
  const isSecured = secured?.status === "public" && secured.value >= 50;
  if (isIg) add("quality", "green", "The credit is investment grade.", { source: quality.source });
  else if (isSecured)
    add("quality", "green", `${round(secured.value)}% is senior and secured by collateral.`, {
      source: secured.source,
    });
  else if (quality?.status === "public" && secured?.status === "public")
    add("quality", "red", `Mostly unsecured (${round(secured.value)}% secured) and below investment grade.`, {
      source: secured.source,
    });
  else add("quality", "unknown", "Credit quality and seniority aren't published.", { worstCase: "red" });

  const top = u.largestObligorPct;
  const count = u.obligors;
  if (top?.status === "public" && top.value > MAX_OBLIGOR_PCT)
    add(
      "concentration",
      "red",
      `The largest borrower is ${round(top.value)}% of the pool, so one default is a large loss.`,
      { source: top.source },
    );
  else if (count?.status === "public" && count.value < MIN_OBLIGORS)
    add(
      "concentration",
      "red",
      `Only ${count.value} borrower${count.value === 1 ? "" : "s"}, so one default is a large loss.`,
      { source: count.source },
    );
  else if (top?.status === "public")
    add(
      "concentration",
      "green",
      `Spread out: the largest borrower is ${round(top.value)}% of the pool${count?.status === "public" ? `, across ${count.value} borrowers` : ""}.`,
      { source: top.source },
    );
  else add("concentration", "unknown", "The size of the largest borrower isn't published.", { worstCase: "red" });

  const track = u.trackRecord;
  const months = monthsBetween(track.value.since, now);
  const recent = track.value.losses.filter((l) => monthsBetween(l.date, now) < LOSS_LOOKBACK_YEARS * 12);
  if (months < MIN_HISTORY_MONTHS)
    add("history", "red", `Less than a year of performance history (since ${track.value.since}).`, {
      source: track.source,
    });
  else if (recent.length > 0)
    add("history", "red", `Holders took a loss on ${recent[0].date}: ${recent[0].what}`, { source: recent[0].source });
  else
    add("history", "green", `No losses passed to holders since ${track.value.since.slice(0, 4)}.`, {
      source: track.source,
    });
  for (const l of track.value.losses.filter((x) => !recent.includes(x)))
    context.push(`Older loss on ${l.date}: ${l.what}`);

  return rateCategory("underlying", findings, context, "");
}
