import { Check, X } from "lucide-react";
import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { CategoryCard } from "@/components/risk/category-card";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { tabMetadata } from "@/lib/asset-meta";
import { bestReport, FRESHNESS_TARGET, reportTests } from "@/lib/framework/transparency";
import { FRESHNESS_LABELS } from "@/lib/labels";
import { getProfile, nameOf } from "@/lib/profile";

export const generateMetadata = tabMetadata("Transparency");

const SOURCE_LABELS = { issuer: "Issuer", "fund-administrator": "Fund administrator", custodian: "Custodian", independent: "Independent firm" } as const;
const GRANULARITY_LABELS = { nav: "Single NAV", "asset-class": "By asset class", position: "Every position" } as const;
const VERIFIABILITY_LABELS = { "self-reported": "Self-reported", attestation: "Attestation", audit: "Audit", cryptographic: "Cryptographic" } as const;

function Mark({ ok }: { ok: boolean }) {
  return ok ? <Check className="size-3.5 shrink-0 text-risk-green" aria-label="Passes" /> : <X className="size-3.5 shrink-0 text-risk-red" aria-label="Fails" />;
}

function Cell({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Mark ok={ok} />
      {children}
    </span>
  );
}

export default async function TransparencyPage({ params }: PageProps<"/assets/[slug]/transparency">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, rating } = profile;
  const t = asset.transparency;
  const cls = asset.freshnessClass.value;
  const best = bestReport(asset);

  return (
    <div className="grid gap-4">
      <CategoryCard result={rating.categories.transparency} slug={slug} />

      <Card
        title="Reports"
        description={`Rated as ${FRESHNESS_LABELS[cls].toLowerCase()}, so data must be updated at least ${FRESHNESS_TARGET[cls]}${cls === "private-credit" ? ", with defaults reported as they happen" : ""}. The best report counts.`}
      >
        {t.reports.length === 0 ? (
          <p className="text-small text-fg-muted">No public reports found.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Report</Th>
                <Th>Data comes from</Th>
                <Th>Detail</Th>
                <Th>Updated</Th>
                <Th>Verifiable</Th>
                <Th>Onchain</Th>
              </tr>
            </thead>
            <tbody>
              {t.reports.map((r) => {
                const tests = reportTests(r, cls);
                return (
                  <Tr key={r.name}>
                    <Td>
                      <span className="font-medium">{r.name}</span>
                      <SourceMarker source={r.source} />
                      <p className="text-label font-normal text-fg-muted">
                        {nameOf(profile, r.provider)}
                        {r === best && (
                          <Tag variant="accent" className="ml-2">
                            Counts
                          </Tag>
                        )}
                      </p>
                    </Td>
                    <Td>
                      <Cell ok={tests.independent}>{SOURCE_LABELS[r.dataSource]}</Cell>
                    </Td>
                    <Td>
                      <Cell ok={tests.position}>{GRANULARITY_LABELS[r.granularity]}</Cell>
                    </Td>
                    <Td>
                      <Cell ok={tests.fresh}>{r.frequency}</Cell>
                    </Td>
                    <Td>
                      <Cell ok={tests.verified}>{VERIFIABILITY_LABELS[r.verifiability]}</Cell>
                    </Td>
                    <Td>
                      {r.feed ? (
                        <AddressChip address={r.feed.address} chain={r.feed.chain} kind="contract" />
                      ) : (
                        <span className="text-fg-muted">{r.onchain ? "Yes" : "No"}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-small text-fg-muted">
          Onchain data is a separate badge, not part of the rating: public data that lives offchain is still transparent to a person.
          Ladders adapted from Chronicle Labs, &quot;The Transparency Gap in Onchain Finance&quot; (Oct 2026).
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Event reporting" description="Private credit must report defaults as they happen, not at the next periodic report.">
          {cls === "private-credit" || t.eventReporting.status === "public" ? (
            <FactList facts={[disclosedFact("Defaults reported as they happen", t.eventReporting, (v) => (v ? "Yes" : "No"))]} />
          ) : (
            <p className="text-small text-fg-muted">Only checked for private credit.</p>
          )}
        </Card>
        <Card title="Kept private for a reason" description="Shown as context, never as a penalty.">
          {t.constraints.length === 0 ? (
            <p className="text-small text-fg-muted">None recorded.</p>
          ) : (
            <ul className="space-y-2">
              {t.constraints.map((c) => (
                <li key={c.what} className="text-small text-fg">
                  {c.what}: {c.reason}. <span className="text-fg-muted">Shared with {c.sharedWith}.</span>
                  <SourceMarker source={c.source} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
