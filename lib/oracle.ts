import { secondsBetween } from "./format";
import type { Asset } from "./schema/asset";
import type { Live } from "./schema/live";

export type OracleFreshness = "on-schedule" | "late" | "stale" | "missing";

export interface OracleAge {
  ageSeconds: number;
  /** Age that counts against the cadence: weekends are left out for business-day feeds. */
  scheduledAgeSeconds: number;
  cadenceSeconds: number;
  businessDaysOnly: boolean;
  ratio: number;
  freshness: OracleFreshness;
}

const DAY_SECONDS = 86400;

/** Seconds between two instants that fall on Saturday or Sunday (UTC). */
function weekendSeconds(from: number, to: number): number {
  let total = 0;
  for (let day = Math.floor(from / DAY_SECONDS); day * DAY_SECONDS < to; day++) {
    const weekday = new Date(day * DAY_SECONDS * 1000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) continue;
    total += Math.max(0, Math.min(to, (day + 1) * DAY_SECONDS) - Math.max(from, day * DAY_SECONDS));
  }
  return total;
}

export function feedAgeSeconds(
  ref: { businessDaysOnly: boolean },
  updatedAt: Date | string,
  now: Date | string,
): number {
  const from = new Date(updatedAt).getTime() / 1000;
  const to = new Date(now).getTime() / 1000;
  return Math.max(0, Math.round(to - from - (ref.businessDaysOnly ? weekendSeconds(from, to) : 0)));
}

/** Late past one cadence, stale past three. */
export function oracleAge(asset: Asset, live: Live | undefined): OracleAge | undefined {
  const ref = asset.pricing.reference;
  if (ref.type !== "oracle" || !live?.oracle) return undefined;
  const ageSeconds = secondsBetween(live.oracle.updatedAt, live.asOf);
  const scheduledAgeSeconds = feedAgeSeconds(ref, live.oracle.updatedAt, live.asOf);
  const ratio = scheduledAgeSeconds / ref.cadenceSeconds;
  const freshness: OracleFreshness = ratio > 3 ? "stale" : ratio > 1 ? "late" : "on-schedule";
  return {
    ageSeconds,
    scheduledAgeSeconds,
    cadenceSeconds: ref.cadenceSeconds,
    businessDaysOnly: ref.businessDaysOnly,
    ratio,
    freshness,
  };
}
