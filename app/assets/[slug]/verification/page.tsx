import { Check, X } from "lucide-react";
import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { disclosedFact, FactList } from "@/components/data/fact-list";
import { SourceMarker } from "@/components/data/source-marker";
import { RiskList } from "@/components/risk/risk-list";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { tabMetadata } from "@/lib/asset-meta";
import { formatDate, formatPct, formatUsd } from "@/lib/format";
import { getProfile, nameOf } from "@/lib/profile";
import { bestMethod, METHOD_TESTS, methodPassCount, RECONCILE_TEST, reconcile } from "@/lib/scoring/verification";

export const generateMetadata = tabMetadata("Reserves");

function TestRow({ pass, label, question, detail, source }: { pass: boolean; label: string; question: string; detail?: React.ReactNode; source?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${pass ? "bg-risk-green-soft text-risk-green" : "bg-risk-red-soft text-risk-red"}`}
      >
        {pass ? <Check className="size-3.5" aria-label="Pass" /> : <X className="size-3.5" aria-label="Fail" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-fg">
          {label}
          {source}
        </p>
        <p className="text-small text-fg-muted">{question}</p>
        {detail && <p className="mt-1 text-small text-fg">{detail}</p>}
      </div>
      <span className="text-small text-fg-muted">{pass ? "Yes" : "No"}</span>
    </li>
  );
}

export default async function ReservesPage({ params }: PageProps<"/assets/[slug]/verification">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, score, live } = profile;
  const entityName = (s: string) => nameOf(profile, s);
  const slice = score.slices.verification;
  const best = bestMethod(asset);
  const rec = reconcile(asset, live);
  const reported = asset.verification.reported;
  const portfolio = asset.portfolio ?? {};
  const isCredit = asset.assetClass === "private-credit";

  return (
    <div className="grid gap-4">
      <Card
        title="Five reserve tests"
        description={
          best
            ? `Best method: ${entityName(best.provider)} ${best.type.replace(/-/g, " ")}. Passes ${methodPassCount(best) + Number(rec.pass)} of 5.`
            : "No reserve report found. Without one, only our onchain reconciliation can be checked."
        }
        actions={<SliceDot color={slice.color} label={<span className="text-small text-fg-muted">{slice.headline}</span>} />}
      >
        <ul className="divide-y divide-line rounded-control border border-line">
          {METHOD_TESTS.map((t) => (
            <TestRow key={t.id} pass={best ? t.pass(best) : false} label={t.label} question={t.question} source={best && <SourceMarker source={best.source} />} />
          ))}
          <TestRow
            pass={rec.pass}
            label={RECONCILE_TEST.label}
            question={RECONCILE_TEST.question}
            detail={rec.text}
            source={reported && <SourceMarker source={reported.source} />}
          />
        </ul>
        {best?.feed && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-small text-fg-muted">
            Published onchain at <AddressChip address={best.feed.address} chain={best.feed.chain} kind="contract" />
          </p>
        )}
        <p className="mt-4 text-label font-normal text-fg-subtle">
          The four report tests describe the best reserve report we found. The fifth is computed by RWABeat: reported assets against
          onchain supply × price on every tracked chain.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reconciliation" description="What the reports say against what the tokens are worth onchain.">
          <FactList
            facts={[
              {
                label: "Reported assets",
                value: reported ? `${formatUsd(reported.value.usd)} on ${formatDate(reported.value.asOf)}` : "None published",
                source: reported?.source,
              },
              { label: "Onchain value", value: rec.onchainUsd !== undefined ? `${formatUsd(rec.onchainUsd)} (tracked chains)` : "—" },
              { label: "Difference", value: rec.gap !== undefined ? `${rec.gap >= 0 ? "+" : "−"}${formatPct(Math.abs(rec.gap))}` : "—" },
              {
                label: "Chains not read",
                value: asset.otherChains?.length
                  ? asset.otherChains.map((o) => `${o.chain}${o.issuance === "lock-and-mint" ? " (bridged, counted on the main chain)" : ""}`).join(", ")
                  : "None known",
              },
            ]}
          />
        </Card>

        {isCredit ? (
          <Card title="Loan book" id="portfolio" description="Is enough public to judge the loans? Scored as disclosures, never as credit quality.">
            <FactList
              facts={[
                disclosedFact("Loan-level data", portfolio.loanLevelData ?? { status: "unknown" }, (v) => (v === "unstated" ? "Published, cadence not stated" : `Published ${v}`)),
                disclosedFact("Largest borrower", portfolio.largestExposurePct ?? { status: "unknown" }, (v) => `${v}% of the book`),
                disclosedFact("Collateral", portfolio.collateral ?? { status: "unknown" }),
                disclosedFact("Loss history", portfolio.lossHistory ?? { status: "unknown" }),
                disclosedFact("First-loss capital", portfolio.firstLoss ?? { status: "unknown" }),
                disclosedFact("Average loan maturity", portfolio.weightedMaturityDays ?? { status: "unknown" }, (v) => `${v} days`),
              ]}
            />
          </Card>
        ) : (
          asset.verification.methods.length > 1 && (
            <Card title="Other reserve reports">
              <ul className="space-y-2 text-small">
                {asset.verification.methods
                  .filter((m) => m !== best)
                  .map((m) => (
                    <li key={`${m.provider}-${m.type}`}>
                      {entityName(m.provider)} · {m.type.replace(/-/g, " ")} · passes {methodPassCount(m)} of 4 report tests
                      <SourceMarker source={m.source} />
                    </li>
                  ))}
              </ul>
            </Card>
          )
        )}
      </div>

      {slice.reasons.length > 0 && (
        <Card title="Gaps">
          <RiskList reasons={slice.reasons} slug={slug} showFix />
        </Card>
      )}
    </div>
  );
}
