import { notFound } from "next/navigation";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { CategoryCard } from "@/components/risk/category-card";
import { Card } from "@/components/ui/card";
import { tabMetadata } from "@/lib/asset-meta";
import { getProfile, nameOf } from "@/lib/profile";

export const generateMetadata = tabMetadata("Legal Claim");

/** What the Legal Claim category will rate once a legal reviewer joins (framework.md §2). */
const QUESTIONS = [
  "Structure: regulated fund, bankruptcy-remote SPV, or direct issuer liability",
  "What the token legally is: a fund share, a debt note, or a contractual claim",
  "Whether the token is the official record of ownership",
  "Jurisdiction, and whether a court there would recognize a token holder",
  "An independent trustee or board that can act for holders",
  "Regulatory status of the product and the issuer",
];

export default async function LegalPage({ params }: PageProps<"/assets/[slug]/legal">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, rating } = profile;
  const { legal } = asset;
  const entityName = (s: string) => nameOf(profile, s);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="grid content-start gap-4">
        <CategoryCard result={rating.categories.legal} slug={slug}>
          <div className="text-small text-fg-muted">
            <p>
              Until a qualified legal reviewer joins, we show the public records below so you can read them yourself.
              This category will check:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {QUESTIONS.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <p className="mt-2">
              Bankruptcy remoteness (Stage 1) and an independent trustee (Stage 2) depend on this review.
            </p>
          </div>
        </CategoryCard>
      </div>

      <div className="grid content-start gap-4">
        <Card title="Legal structure">
          <FactList
            facts={[
              { label: "Issuer", value: entityName(asset.issuer) },
              disclosedFact("Vehicle", legal.vehicleType),
              disclosedFact("Jurisdiction", legal.jurisdiction),
              disclosedFact("If the issuer fails", legal.insolvency),
            ]}
          />
        </Card>
        <Card title="Public records">
          <FactList
            facts={[
              disclosedFact("LEI", legal.lei, (v) => <span className="font-mono text-[12px]">{v}</span>),
              disclosedFact("SEC filings", legal.secFilings, (v) => `CIK ${v.cik} · Form ${v.forms.join(", ")}`),
              disclosedFact("Offering document", legal.offeringDocument),
              disclosedFact("Audited financials", legal.auditedFinancials),
              disclosedFact("Transfer agent", asset.counterparties.transferAgent, entityName),
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
