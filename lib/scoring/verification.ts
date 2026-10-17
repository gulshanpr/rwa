import type { Asset, VerificationMethod } from "../schema/asset";
import type { Disclosed } from "../schema/sourced";
import type { Live } from "../schema/live";
import { formatPct, formatUsd, secondsBetween } from "../format";
import { listChains } from "./control";
import type { Reason, SliceResult } from "./types";

/** Reported assets and onchain value must agree within this share of the reported figure. */
export const RECONCILE_TOLERANCE = 0.05;
/** A reported figure older than this, against the live data, is too old to reconcile. */
export const RECONCILE_MAX_AGE_DAYS = 45;

export const METHOD_TESTS = [
  {
    id: "independent",
    label: "Independent",
    question: "Is reserve data checked by someone other than the issuer (an auditor, administrator, custodian or attestation firm)?",
    pass: (m: VerificationMethod) => m.independent && m.type !== "self-reported",
    failText: "Reserves aren't checked by anyone independent of the issuer.",
  },
  {
    id: "asset-level",
    label: "Asset-level",
    question: "Are holdings reported line by line (loan by loan for credit), not just as a total?",
    pass: (m: VerificationMethod) => m.assetLevel,
    failText: "Reserves are reported as a total, not holding by holding.",
  },
  {
    id: "weekly",
    label: "At least weekly",
    question: "Is the report updated at least once a week?",
    pass: (m: VerificationMethod) => ["realtime", "daily", "weekly"].includes(m.frequency),
    failText: "Reserves are reported less than weekly, or with no stated cadence.",
  },
  {
    id: "public",
    label: "Public report",
    question: "Can anyone read the report itself, not just a claim that one exists?",
    pass: (m: VerificationMethod) => m.publicReport,
    failText: "The reserve report itself isn't public.",
  },
] as const;

export const RECONCILE_TEST = {
  id: "reconciles",
  label: "Reconciles onchain",
  question: `Do the reported assets match onchain supply × price across every chain, within ${RECONCILE_TOLERANCE * 100}%? We compute this ourselves.`,
};

export function methodPassCount(m: VerificationMethod): number {
  return METHOD_TESTS.filter((t) => t.pass(m)).length;
}

export function bestMethod(asset: Asset): VerificationMethod | undefined {
  return [...asset.verification.methods].sort((a, b) => methodPassCount(b) - methodPassCount(a))[0];
}

export interface Reconciliation {
  pass: boolean;
  text: string;
  onchainUsd?: number;
  reportedUsd?: number;
  gap?: number;
}

/** Compares the assets reported off chain with what the tracked tokens are worth onchain. */
export function reconcile(asset: Asset, live: Live | undefined): Reconciliation {
  const reported = asset.verification.reported;
  const unread = (asset.otherChains ?? []).filter((o) => o.issuance !== "lock-and-mint").map((o) => o.chain);
  const onchain = live && live.supply.length > 0 ? live.supply.reduce((s, x) => s + x.totalSupply * x.priceUsd, 0) : undefined;
  if (!reported) return { pass: false, text: "No reported asset total is published to check onchain supply against.", onchainUsd: onchain };
  if (!live || onchain === undefined) return { pass: false, text: "Onchain supply hasn't been read yet.", reportedUsd: reported.value.usd };

  const onchainUsd = onchain;
  const reportedUsd = reported.value.usd;
  const gap = onchainUsd / reportedUsd - 1;
  const base = { onchainUsd, reportedUsd, gap };
  const ageDays = secondsBetween(reported.value.asOf, live.asOf) / 86400;
  if (ageDays > RECONCILE_MAX_AGE_DAYS)
    return { ...base, pass: false, text: `The latest reported total (${formatUsd(reportedUsd)}) is ${Math.round(ageDays)} days old, too old to reconcile with today's supply.` };
  if (Math.abs(gap) <= RECONCILE_TOLERANCE)
    return { ...base, pass: true, text: `Reported assets (${formatUsd(reportedUsd)}) match onchain value (${formatUsd(onchainUsd)}) within ${formatPct(Math.abs(gap))}.` };
  const missing = unread.length > 0 ? ` Supply on ${listChains(unread)} isn't read, which may explain it.` : "";
  return {
    ...base,
    pass: false,
    text: `Onchain value (${formatUsd(onchainUsd)}) is ${formatPct(Math.abs(gap), 0)} ${gap < 0 ? "below" : "above"} the reported ${formatUsd(reportedUsd)}.${missing}`,
  };
}

/** Private-credit facts that should be public for anyone to judge the loan book. */
export function portfolioChecks(asset: Asset): { id: string; label: string; item: Disclosed<unknown>; missingText: string }[] {
  if (asset.assetClass !== "private-credit") return [];
  const p = asset.portfolio ?? {};
  const unknown = { status: "unknown" as const };
  return [
    { id: "loan-level", label: "Loan-level data", item: p.loanLevelData ?? unknown, missingText: "Loan-by-loan data isn't public." },
    { id: "concentration", label: "Largest borrower exposure", item: p.largestExposurePct ?? unknown, missingText: "How much of the book sits with the largest borrower isn't public." },
    { id: "collateral", label: "Collateral", item: p.collateral ?? unknown, missingText: "What secures the loans isn't public." },
    { id: "loss-history", label: "Loss history", item: p.lossHistory ?? unknown, missingText: "The history of defaults and impairments isn't public." },
  ];
}

export function scoreVerification(asset: Asset, live?: Live): SliceResult {
  const evidence = { tab: "verification" as const, label: "Reserve tests" };
  const best = bestMethod(asset);
  const rec = reconcile(asset, live);
  const portfolio: Reason[] = portfolioChecks(asset)
    .filter((c) => c.item.status !== "public")
    .map((c) => ({
      id: `verification.portfolio.${c.id}`,
      slice: "verification",
      color: "yellow",
      text: c.missingText,
      critical: false,
      evidence: { tab: "verification", anchor: "portfolio", label: c.label },
    }));

  if (!best || asset.verification.methods.every((m) => m.type === "self-reported")) {
    const text = best ? "Reserves are only self-reported by the issuer." : "No public, independent reserve report was found.";
    return {
      slice: "verification",
      color: "red",
      headline: text,
      reasons: [{ id: "verification.none", slice: "verification", color: "red", text, critical: true, evidence }, ...portfolio],
    };
  }

  const passed = methodPassCount(best) + Number(rec.pass);
  const color = passed === 5 ? "green" : passed >= 3 ? "yellow" : "red";
  const failed: Reason[] = [
    ...METHOD_TESTS.filter((t) => !t.pass(best)).map((t) => ({ id: `verification.${t.id}`, text: t.failText })),
    ...(rec.pass ? [] : [{ id: "verification.reconciles", text: rec.text }]),
  ].map((f) => ({ ...f, slice: "verification", color: color === "green" ? "yellow" : color, critical: false, evidence }) as Reason);
  const reasons = color === "green" ? portfolio : [...failed, ...portfolio];
  const finalColor = color === "green" && portfolio.length > 0 ? "yellow" : color;

  return {
    slice: "verification",
    color: finalColor,
    headline: finalColor === "green" ? "Reserves pass all five tests." : reasons[0].text,
    reasons,
  };
}
