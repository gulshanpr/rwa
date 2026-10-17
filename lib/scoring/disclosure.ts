import type { Asset } from "../schema/asset";
import type { Disclosed } from "../schema/sourced";
import type { Reason, SliceResult } from "./types";

export interface DisclosureCheck {
  id: string;
  label: string;
  status: Disclosed<unknown>["status"];
  item: Disclosed<unknown>;
  missingText: string;
  /** The offering document and audited financials are what holders need if things go wrong, so they count double. */
  weight: number;
}

function combine(a: Disclosed<unknown>, b: Disclosed<unknown>): Disclosed<unknown> {
  if (a.status === "public" && b.status === "public") return a;
  if (a.status === "not_public") return a;
  if (b.status === "not_public") return b;
  return a.status === "unknown" ? a : b;
}

export function disclosureChecks(asset: Asset): DisclosureCheck[] {
  const { legal, serviceProviders: sp } = asset;
  const entity = combine(legal.vehicleType, legal.jurisdiction);
  const items: Omit<DisclosureCheck, "status">[] = [
    { id: "legal-entity", label: "Legal entity and jurisdiction", item: entity, weight: 1, missingText: "The legal entity or its jurisdiction is not public." },
    { id: "regulator", label: "Regulator or registration", item: legal.regulator ?? { status: "unknown" }, weight: 1, missingText: "Who regulates the vehicle, if anyone, is not public." },
    { id: "custodian", label: "Custodian named", item: sp.custodian, weight: 1, missingText: "The custodian is not publicly named." },
    { id: "fund-administrator", label: "Fund administrator named", item: sp.fundAdministrator, weight: 1, missingText: "The fund administrator is not publicly named." },
    { id: "auditor", label: "Auditor named", item: sp.auditor, weight: 1, missingText: "The auditor is not publicly named." },
    { id: "offering-document", label: "Offering document public", item: legal.offeringDocument, weight: 2, missingText: "The offering memorandum is not public." },
    { id: "audited-financials", label: "Audited financials public", item: legal.auditedFinancials, weight: 2, missingText: "Audited financial statements are not public." },
  ];
  return items.map((i) => ({ ...i, status: i.item.status }));
}

export const DISCLOSURE_GREEN = 8;
export const DISCLOSURE_YELLOW = 4;

export function disclosurePoints(checks: DisclosureCheck[]): { points: number; max: number } {
  return {
    points: checks.filter((c) => c.status === "public").reduce((s, c) => s + c.weight, 0),
    max: checks.reduce((s, c) => s + c.weight, 0),
  };
}

export function scoreDisclosure(asset: Asset): SliceResult {
  const checks = disclosureChecks(asset);
  const { points, max } = disclosurePoints(checks);
  const color = points >= DISCLOSURE_GREEN ? "green" : points >= DISCLOSURE_YELLOW ? "yellow" : "red";
  const reasons: Reason[] = checks
    .filter((c) => c.status !== "public")
    .sort((a, b) => b.weight - a.weight)
    .map((c) => ({
      id: `disclosure.${c.id}`,
      slice: "disclosure",
      color: color === "green" ? "yellow" : color,
      text: c.missingText,
      critical: false,
      evidence: { tab: "disclosure", anchor: `check-${c.id}`, label: c.label },
    }));
  return {
    slice: "disclosure",
    color,
    headline: `${points} of ${max} disclosure points are public.`,
    reasons: color === "green" ? [] : reasons,
  };
}
