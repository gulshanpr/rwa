import { notFound } from "next/navigation";
import { EmptyUnknown } from "@/components/data/empty-unknown";
import { disclosedFact, FactList, type Fact } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { CategoryCard } from "@/components/risk/category-card";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDate } from "@/lib/format";
import { GOVERNMENT_TYPES, HOLDING_LABELS } from "@/lib/framework/underlying";
import { getProfile } from "@/lib/profile";

export const generateMetadata = tabMetadata("Underlying Asset");

const QUALITY_LABELS = {
  "investment-grade": "Investment grade",
  "high-yield": "High yield",
  unrated: "Unrated",
} as const;

export default async function UnderlyingPage({ params }: PageProps<"/assets/[slug]/underlying">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, rating } = profile;
  const u = asset.underlying;
  const holdings = u.holdings;

  const credit: Fact[] = [
    disclosedFact("Weighted average maturity", u.wamDays, (v) => `${v} days`),
    ...(u.creditQuality ? [disclosedFact("Credit quality", u.creditQuality, (v) => QUALITY_LABELS[v])] : []),
    ...(u.securedPct ? [disclosedFact("Senior and secured", u.securedPct, (v) => `${v}%`)] : []),
    ...(u.largestObligorPct
      ? [disclosedFact("Largest borrower", u.largestObligorPct, (v) => `${v}% of the pool`)]
      : []),
    ...(u.obligors ? [disclosedFact("Borrowers", u.obligors, (v) => String(v))] : []),
  ];

  return (
    <div className="grid gap-4">
      <CategoryCard result={rating.categories.underlying} slug={slug} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="What backs the token"
          description={
            holdings.status !== "public"
              ? undefined
              : holdings.value.basis === "mandate"
                ? "Only the investment mandate is published, not a dated holdings report."
                : `Holdings report as of ${formatDate(holdings.value.asOf)}.`
          }
        >
          {holdings.status !== "public" ? (
            <EmptyUnknown
              topic={`${asset.ticker} holdings`}
              searchedAt={holdings.status === "not_public" ? holdings.searchedAt : undefined}
              note={holdings.note}
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Holding</Th>
                    <Th>Type</Th>
                    <Th align="right">Share</Th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.value.items.map((h, i) => (
                    <Tr key={`${h.type}-${i}`}>
                      <Td className="font-medium">{h.label ?? HOLDING_LABELS[h.type]}</Td>
                      <Td className="text-fg-muted">
                        {HOLDING_LABELS[h.type]}
                        {GOVERNMENT_TYPES.includes(h.type) ? " · government or cash" : ""}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-subtle sm:block">
                            <span className="block h-full bg-accent" style={{ width: `${Math.min(100, h.pct)}%` }} />
                          </span>
                          <span className="tnum">{h.pct}%</span>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <p className="mt-3 text-label font-normal text-fg-subtle">
                Source
                <SourceMarker source={holdings.source} />
              </p>
            </>
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Card title="Maturity and credit">
            <FactList facts={credit} />
          </Card>
          <Card title="Track record">
            <FactList
              facts={[
                { label: "History since", value: formatDate(u.trackRecord.value.since), source: u.trackRecord.source },
                {
                  label: "Losses to holders",
                  value:
                    u.trackRecord.value.losses.length === 0
                      ? "None found"
                      : `${u.trackRecord.value.losses.length} recorded`,
                  source: u.trackRecord.source,
                },
              ]}
            />
            {u.trackRecord.value.losses.length > 0 && (
              <ul className="mt-3 space-y-2">
                {u.trackRecord.value.losses.map((l) => (
                  <li key={l.date} className="text-small text-fg">
                    <span className="text-fg-muted">{formatDate(l.date)}:</span> {l.what}
                    {l.lossPct !== undefined && <span className="text-fg-muted"> ({l.lossPct}%)</span>}
                    <SourceMarker source={l.source} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
