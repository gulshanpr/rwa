import type { Asset } from "../schema/asset";
import { formatUsd } from "../format";
import { settlementDays } from "../scoring/exit";
import type { Framework, Measured } from "./schema";
import { rateCategory, type CategoryResult, type Finding } from "./types";

/** An exit path counts as real liquidity when it can take a sell of this size. */
export const REAL_LIQUIDITY_USD = 5_000_000;
export const MAX_SLIPPAGE_PCT = 1;
/** "Redemption longer than a week": more than five business days. */
export const MAX_SETTLEMENT_DAYS = 5;
export const MAX_NOTICE_DAYS = 7;
/** A route that loses more than this on $1M only goes through dust pools: there's no market. */
export const MARKET_MAX_SLIPPAGE_PCT = 10;

/** The token has a real secondary market onchain. */
export function hasMarket(measured: Measured | undefined): boolean {
  return Boolean(measured?.dex.quotes.some((q) => q.routed && (q.slippagePct ?? 100) < MARKET_MAX_SLIPPAGE_PCT));
}

export interface ExitLiquidity {
  /** Largest DEX sell (of the sizes quoted) that stays within the slippage bar. */
  dexUsd: number;
  /** Instant redemption capacity available today: min(daily cap, funded), when both are known. */
  instantUsd?: number;
  instantUnknown: boolean;
}

export function exitLiquidity(fw: Framework, measured: Measured | undefined): ExitLiquidity {
  const dexUsd = Math.max(0, ...(measured?.dex.quotes ?? []).filter((q) => q.routed && (q.slippagePct ?? 100) <= MAX_SLIPPAGE_PCT).map((q) => q.sizeUsd));
  let instantUsd: number | undefined;
  let instantUnknown = false;
  for (const f of fw.exit.instant) {
    const cap = f.dailyCapUsd.status === "public" ? f.dailyCapUsd.value : Infinity;
    // With funding unknown, a small cap still settles it: the facility can't pay more than the cap.
    if (f.fundedUsd.status !== "public" && cap >= REAL_LIQUIDITY_USD) {
      instantUnknown = true;
      continue;
    }
    instantUsd = Math.max(instantUsd ?? 0, f.fundedUsd.status === "public" ? Math.min(cap, f.fundedUsd.value) : cap);
  }
  return { dexUsd, instantUsd, instantUnknown };
}

export function rateExit(asset: Asset, fw: Framework, measured: Measured | undefined): CategoryResult {
  const r = asset.exit.redemption;
  const x = fw.exit;
  const findings: Finding[] = [];
  const context: string[] = [];
  const add = (id: string, color: Finding["color"], text: string, extra: Partial<Finding> = {}) =>
    findings.push({ id: `exit.${id}`, color, text, ...extra });
  const liquidity = exitLiquidity(fw, measured);
  const tradesAtAll = hasMarket(measured);

  if (!r.available.value) add("no-redemption", tradesAtAll ? "yellow" : "red", tradesAtAll ? "There's no redemption; the only exit is selling." : "There's no redemption and no secondary market.", { source: r.available.source });
  else {
    if (r.whoCanRedeem.value === "all-holders") add("who", "green", "Any holder can redeem.", { source: r.whoCanRedeem.source });
    else if (r.whoCanRedeem.value === "whitelisted-holders") add("who", "yellow", "Only allowlisted holders can redeem.", { source: r.whoCanRedeem.source });
    else add("who", "yellow", "Each redemption needs the issuer's approval.", { source: r.whoCanRedeem.source });

    const s = r.settlement;
    if (s.status !== "public") add("settlement", "unknown", "The redemption settlement time isn't public.", { worstCase: "red" });
    else {
      const days = settlementDays(s.value);
      if (days > MAX_SETTLEMENT_DAYS) add("settlement", "red", `Redemption takes ${s.value}, more than a week.`, { source: s.source });
      else if (days > 1) add("settlement", "yellow", `Redemption settles at ${s.value}.`, { source: s.source });
      else add("settlement", "green", `Redemption settles at ${s.value}.`, { source: s.source });
    }

    const dealing = x.dealing.value;
    if (dealing === "monthly" || dealing === "quarterly") add("dealing", "red", `Redemptions are only processed ${dealing}.`, { source: x.dealing.source });
    else if (dealing === "weekly") add("dealing", "yellow", "Redemptions are only processed weekly.", { source: x.dealing.source });

    const notice = x.noticeDays;
    if (notice.status !== "public") add("notice", "unknown", "Any notice period isn't public.", { worstCase: "red" });
    else if (notice.value > MAX_NOTICE_DAYS) add("notice", "red", `Redeeming needs ${notice.value} days' notice.`, { source: notice.source });
    else if (notice.value > 0) add("notice", "yellow", `Redeeming needs ${notice.value} day${notice.value === 1 ? "" : "s"}' notice.`, { source: notice.source });

    const lockup = x.lockupDays;
    if (lockup.status !== "public") add("lockup", "unknown", "Any lock-up isn't public.", { worstCase: "red" });
    else if (lockup.value > 0) add("lockup", "red", `New money is locked up for ${lockup.value} days.`, { source: lockup.source });

    const gates = r.gatesOrSuspension;
    if (gates.status !== "public") add("gates", "unknown", "The terms for suspending redemptions aren't public.", { worstCase: "red" });
    else if (gates.value === "issuer-discretion") add("gates", "red", "The issuer can suspend redemptions at its discretion.", { source: gates.source });
    else add("gates", "green", gates.value === "none" ? "No redemption gates." : "Suspension is limited to stated cases.", { source: gates.source });

    const cap = x.dailyCapUsd;
    if (cap.status === "public" && cap.value !== null) add("cap", "yellow", `Redemptions are capped at ${formatUsd(cap.value)} a day.`, { source: cap.source });
    else if (cap.status !== "public") add("cap", "unknown", "Any daily redemption cap isn't public.", { worstCase: "yellow" });
  }

  const liq = x.liquidators.value;
  if (liq === "anyone") add("liquidators", "green", "Any liquidator can hold the token.", { source: x.liquidators.source });
  else if (liq === "allowlisted") add("liquidators", "yellow", "Only allowlisted liquidators can hold the token.", { source: x.liquidators.source });
  else add("liquidators", "red", "Liquidators can't legally hold the token.", { source: x.liquidators.source });

  const instant = liquidity.instantUsd ?? 0;
  if (Math.max(liquidity.dexUsd, instant) >= REAL_LIQUIDITY_USD)
    add(
      "liquidity",
      "green",
      liquidity.dexUsd >= REAL_LIQUIDITY_USD
        ? `A ${formatUsd(liquidity.dexUsd)} sell clears onchain within ${MAX_SLIPPAGE_PCT}% of NAV.`
        : `Instant redemption can pay out ${formatUsd(instant)} today.`,
    );
  else if (liquidity.instantUnknown) add("liquidity", "unknown", "An instant redemption facility exists, but how much it can pay out isn't public.", { worstCase: "yellow" });
  else if (tradesAtAll || instant > 0)
    add("liquidity", "yellow", `Instant liquidity is thin: ${liquidity.dexUsd > 0 ? `${formatUsd(liquidity.dexUsd)} on DEXs` : instant > 0 ? `${formatUsd(instant)} instant redemption` : "DEX sells lose more than 1% even at $1M"}.`);
  else add("liquidity", "yellow", "No instant or secondary liquidity: every exit goes through issuer redemption.");

  if (x.minimumUsd.status === "public") context.push(`Minimum redemption ${formatUsd(x.minimumUsd.value)}.`);
  if (x.feeBps.status === "public" && x.feeBps.value > 0) context.push(`Redemption fee ${x.feeBps.value / 100}%.`);
  for (const f of x.instant) {
    const funded = f.fundedUsd.status === "public" ? formatUsd(f.fundedUsd.value) : "unknown";
    const cap = f.dailyCapUsd.status === "public" ? `${formatUsd(f.dailyCapUsd.value)}/day cap` : "no stated cap";
    context.push(`${f.label}: ${funded} available, ${cap}${f.feeBps ? `, ${f.feeBps / 100}% fee` : ""}.`);
  }
  if (measured?.holders) context.push(`Top 10 wallets hold ${measured.holders.top10Pct.toFixed(1)}% of supply on ${measured.holders.chain}.`);

  return rateCategory("exit", findings, context, "Fast redemption with no discretionary gates, real instant liquidity, and liquidators can hold the token.");
}
