import { Check, CircleAlert, X } from "lucide-react";
import { notFound } from "next/navigation";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDate } from "@/lib/format";
import { getProfile, nameOf } from "@/lib/profile";
import { disclosureChecks, disclosurePoints, DISCLOSURE_GREEN, DISCLOSURE_YELLOW } from "@/lib/scoring/disclosure";
import { repoNewIssueUrl } from "@/lib/site";

export const generateMetadata = tabMetadata("Disclosure");

const CLAIM_LABELS = {
  "fund-share": "A share in a fund",
  "spv-note": "A note issued by a special-purpose vehicle",
  "issuer-note": "A note issued by the operating company",
  "vault-share": "A share of an onchain vault",
  "tracker-certificate": "A tracker certificate",
  other: "Other",
} as const;

const REGISTER_LABELS = {
  onchain: "The token is the legal record of ownership",
  "offchain-mirrored": "A transfer agent keeps the legal record; the token mirrors it",
} as const;

export default async function DisclosurePage({ params }: PageProps<"/assets/[slug]/disclosure">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, score } = profile;
  const entityName = (s: string) => nameOf(profile, s);
  const renderValue = (value: unknown) => (typeof value === "string" ? entityName(value) : String(value));
  const checks = disclosureChecks(asset);
  const { max } = disclosurePoints(checks);
  const slice = score.slices.disclosure;
  const { legal } = asset;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Card
        title="Key disclosures"
        description={`Unknown counts as not public. The offering document and audited financials count double. Green is ${DISCLOSURE_GREEN}+ of ${max} points, yellow ${DISCLOSURE_YELLOW}+.`}
        actions={<SliceDot color={slice.color} label={<span className="text-small text-fg-muted">{slice.headline}</span>} />}
      >
        <ul className="divide-y divide-line rounded-control border border-line">
          {checks.map((c) => (
            <li key={c.id} id={`check-${c.id}`} className="flex scroll-mt-24 items-start gap-3 px-4 py-3 target:bg-accent-soft">
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                  c.status === "public" ? "bg-risk-green-soft text-risk-green" : c.status === "not_public" ? "bg-risk-red-soft text-risk-red" : "bg-risk-grey-soft text-fg-muted"
                }`}
              >
                {c.status === "public" ? (
                  <Check className="size-3.5" aria-label="Public" />
                ) : c.status === "not_public" ? (
                  <X className="size-3.5" aria-label="Not public" />
                ) : (
                  <CircleAlert className="size-3.5" aria-label="Unknown" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-fg">
                  {c.label}
                  {c.weight > 1 && <span className="ml-1.5 text-label font-normal text-fg-subtle">×{c.weight}</span>}
                </p>
                {c.item.status === "public" ? (
                  <p className="text-small text-fg-muted">
                    {renderValue(c.item.value)}
                    <SourceMarker source={c.item.source} />
                  </p>
                ) : (
                  <p className="text-small text-fg-muted">
                    {c.item.status === "not_public"
                      ? `Searched on ${formatDate(c.item.searchedAt)}${c.item.note ? `: ${c.item.note.toLowerCase()}` : ""}.`
                      : "We couldn't find this."}{" "}
                    <a
                      href={repoNewIssueUrl(`${asset.ticker}: ${c.label}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      Found it? Open a PR.
                    </a>
                  </p>
                )}
              </div>
              <span className="text-small whitespace-nowrap text-fg-muted">
                {c.status === "public" ? "Public" : c.status === "not_public" ? "Not public" : "Unknown"}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid content-start gap-4">
        <Card title="Public records">
          <FactList
            facts={[
              disclosedFact("Issuer", asset.legal.vehicleType, () => entityName(asset.issuer)),
              disclosedFact("LEI", asset.legal.lei, (v) => <span className="font-mono text-[12px]">{v}</span>),
              disclosedFact("SEC filings", asset.legal.secFilings, (v) => `CIK ${v.cik} · Form ${v.forms.join(", ")}`),
              disclosedFact("Transfer agent", asset.serviceProviders.transferAgent, entityName),
            ]}
          />
        </Card>
        <Card title="Legal & insolvency" id="legal" description="Not assessed. These are the facts we found; we don't judge them.">
          <div className="mb-3 flex items-start gap-2.5">
            <SliceDot color="grey" className="mt-1.5" />
            <p className="text-small text-fg-muted">
              We don&apos;t evaluate bankruptcy remoteness or what claims holders have if the issuer fails. Read the documents linked
              here yourself.
            </p>
          </div>
          <FactList
            facts={[
              disclosedFact("What a holder owns", legal.claimType ?? { status: "unknown" }, (v) => CLAIM_LABELS[v]),
              disclosedFact("Legal register", legal.register ?? { status: "unknown" }, (v) => REGISTER_LABELS[v]),
              disclosedFact("Regulator", legal.regulator ?? { status: "unknown" }),
              disclosedFact("Insolvency terms", legal.insolvency),
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
