import { Check, CircleAlert, X } from "lucide-react";
import { notFound } from "next/navigation";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDate } from "@/lib/format";
import { entityName, getProfile } from "@/lib/profile";
import { disclosureChecks } from "@/lib/scoring/disclosure";
import { repoNewIssueUrl } from "@/lib/site";

export const generateMetadata = tabMetadata("Disclosure");

function renderValue(value: unknown): string {
  if (typeof value === "string") return entityName(value);
  return String(value);
}

export default async function DisclosurePage({ params }: PageProps<"/assets/[slug]/disclosure">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, score } = profile;
  const checks = disclosureChecks(asset);
  const slice = score.slices.disclosure;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Card
        title="Six key disclosures"
        description="Unknown counts as not public."
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
                <p className="text-body font-medium text-fg">{c.label}</p>
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
        <Card title="Legal & insolvency" id="legal">
          <div className="flex items-start gap-2.5">
            <SliceDot color="grey" className="mt-1.5" />
            <div className="text-small text-fg-muted">
              <p className="font-medium text-fg">Not assessed in v1.</p>
              <p className="mt-1">We don&apos;t yet evaluate bankruptcy remoteness or what claims holders have if the issuer fails.</p>
              <p className="mt-2">
                Until a qualified legal contributor joins, we only show which documents are public, so you can read them
                yourself.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
