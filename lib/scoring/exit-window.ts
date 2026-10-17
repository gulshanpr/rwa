import type { Asset } from "../schema/asset";
import { formatSpan } from "../format";
import { POWER_LABELS, SEVEN_DAYS, type PowerRow } from "./control";
import { settlementDays } from "./exit";
import type { Reason, SliceResult } from "./types";

const DAY = 86400;

/** Powers that change the rules for every holder at once: new contract code, or new role holders. */
export const RULE_CHANGE_POWERS = ["upgrade", "admin"] as const;

export interface ExitWindow {
  /** Shortest notice holders get before a rule change takes effect. Infinity when nothing can change the rules. */
  noticeSeconds: number;
  /** The power and holder that set that notice. */
  fastest?: PowerRow;
  /** How long a documented redemption takes. Undefined when the settlement time isn't public. */
  exitSeconds?: number;
  /** noticeSeconds - exitSeconds: time left to react after getting out. */
  windowSeconds?: number;
}

export function exitWindow(asset: Asset, powers: PowerRow[]): ExitWindow {
  const ruleChanges = powers.filter((r) => (RULE_CHANGE_POWERS as readonly string[]).includes(r.power));
  const delay = (r: PowerRow) => (r.holder.holderClass === "eoa" || r.holder.holderClass === "unknown" ? 0 : r.holder.delaySeconds);
  const fastest = ruleChanges.reduce<PowerRow | undefined>((min, r) => (!min || delay(r) < delay(min) ? r : min), undefined);
  const noticeSeconds = fastest ? delay(fastest) : Infinity;

  const { redemption } = asset.exit;
  const exitSeconds =
    redemption.available.value && redemption.settlement.status === "public" ? settlementDays(redemption.settlement.value) * DAY : undefined;
  const windowSeconds = exitSeconds === undefined ? undefined : noticeSeconds - exitSeconds;
  return { noticeSeconds, fastest, exitSeconds, windowSeconds };
}

/**
 * L2BEAT's exit window, for RWAs: if the issuer changes the code or hands out new roles, can a holder
 * redeem before the change takes effect? Notice is the shortest timelock on a rule-changing power
 * (none for a single key). Exit is the documented redemption settlement time.
 */
export function scoreExitWindow(asset: Asset, powers: PowerRow[], hasDiscovery: boolean): SliceResult {
  if (!hasDiscovery) {
    return { slice: "exit-window", color: "grey", headline: "Not assessed yet: no discovery snapshot of this token's permissions.", reasons: [] };
  }
  const w = exitWindow(asset, powers);
  const add = (id: string, color: Reason["color"], text: string): SliceResult => ({
    slice: "exit-window",
    color,
    headline: text,
    reasons: [
      {
        id: `exit-window.${id}`,
        slice: "exit-window",
        color,
        text,
        critical: color === "red",
        evidence: w.fastest
          ? { tab: "control", anchor: `power-${w.fastest.id}`, label: `${POWER_LABELS[w.fastest.power]} power` }
          : { tab: "exit", anchor: "exit-window", label: "Exit window" },
      },
    ],
  });

  if (w.noticeSeconds === Infinity) {
    return { slice: "exit-window", color: "green", headline: "Nobody can upgrade the contracts or hand out new roles.", reasons: [] };
  }
  const what = w.fastest?.power === "admin" ? "new roles can be granted" : "the code can be upgraded";
  if (w.noticeSeconds === 0) return add("none", "red", `Holders get no notice: ${what} immediately, before anyone can redeem.`);
  const notice = formatSpan(w.noticeSeconds);
  if (w.exitSeconds === undefined)
    return add("unknown-exit", "yellow", `Changes wait ${notice}, but the redemption time isn't public, so holders can't tell whether they could get out first.`);
  if (w.windowSeconds! <= 0)
    return add("too-short", "red", `Changes wait ${notice}, but redemption takes longer, so holders can't get out before a change takes effect.`);
  if (w.windowSeconds! < SEVEN_DAYS)
    return add("short", "yellow", `Holders can redeem before a change takes effect, with ${formatSpan(w.windowSeconds!)} to spare (less than 7 days).`);
  return {
    slice: "exit-window",
    color: "green",
    headline: `Holders have ${formatSpan(w.windowSeconds!)} after redeeming before any change takes effect.`,
    reasons: [],
  };
}
