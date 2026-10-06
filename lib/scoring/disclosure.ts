import type { Asset } from "../schema/asset";
import type { Disclosed } from "../schema/sourced";
import type { Reason, SliceResult } from "./types";

export interface DisclosureCheck {
  id: string;
  label: string;
  status: Disclosed<unknown>["status"];
  item: Disclosed<unknown>;
  missingText: string;
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
    { id: "legal-entity", label: "Legal entity and jurisdiction", item: entity, missingText: "The legal entity or its jurisdiction is not public." },
    { id: "custodian", label: "Custodian named", item: sp.custodian, missingText: "The custodian is not publicly named." },
    { id: "fund-administrator", label: "Fund administrator named", item: sp.fundAdministrator, missingText: "The fund administrator is not publicly named." },
    { id: "auditor", label: "Auditor named", item: sp.auditor, missingText: "The auditor is not publicly named." },
    { id: "offering-document", label: "Offering document public", item: legal.offeringDocument, missingText: "The offering memorandum is not public." },
    { id: "audited-financials", label: "Audited financials public", item: legal.auditedFinancials, missingText: "Audited financial statements are not public." },
  ];
  return items.map((i) => ({ ...i, status: i.item.status }));
}

export function scoreDisclosure(asset: Asset): SliceResult {
  const checks = disclosureChecks(asset);
  const publicCount = checks.filter((c) => c.status === "public").length;
  const color = publicCount >= 5 ? "green" : publicCount >= 3 ? "yellow" : "red";
  const reasons: Reason[] =
    color === "green"
      ? []
      : checks
          .filter((c) => c.status !== "public")
          .map((c) => ({
            id: `disclosure.${c.id}`,
            slice: "disclosure",
            color,
            text: c.missingText,
            critical: false,
            evidence: { tab: "disclosure", anchor: `check-${c.id}`, label: c.label },
          }));
  return {
    slice: "disclosure",
    color,
    headline: color === "green" ? `${publicCount} of 6 key disclosures are public.` : `Only ${publicCount} of 6 key disclosures are public.`,
    reasons,
  };
}
