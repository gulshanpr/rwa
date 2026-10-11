import { Check, X } from "lucide-react";
import { notFound } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { SourceMarker } from "@/components/data/source-marker";
import { RiskList } from "@/components/risk/risk-list";
import { SliceDot } from "@/components/risk/slice-dot";
import { Card } from "@/components/ui/card";
import { tabMetadata } from "@/lib/asset-meta";
import { entityName, getProfile } from "@/lib/profile";
import { bestMethod, passCount, VERIFICATION_TESTS } from "@/lib/scoring/verification";

export const generateMetadata = tabMetadata("Verification");

export default async function VerificationPage({ params }: PageProps<"/assets/[slug]/verification">) {
  const { slug } = await params;
  const profile = (await getProfile(slug)) ?? notFound();
  const { asset, score } = profile;
  const slice = score.slices.verification;
  const best = bestMethod(asset);

  return (
    <div className="grid gap-4">
      <Card
        title="Five transparency tests"
        description={
          best
            ? `Best method: ${entityName(best.provider)} ${best.type.replace(/-/g, " ")}. Passes ${passCount(best)} of 5.`
            : "No verification method found."
        }
        actions={<SliceDot color={slice.color} label={<span className="text-small text-fg-muted">{slice.headline}</span>} />}
      >
        {best ? (
          <ul className="divide-y divide-line rounded-control border border-line">
            {VERIFICATION_TESTS.map((t) => {
              const pass = t.pass(best);
              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${pass ? "bg-risk-green-soft text-risk-green" : "bg-risk-red-soft text-risk-red"}`}
                  >
                    {pass ? <Check className="size-3.5" aria-label="Pass" /> : <X className="size-3.5" aria-label="Fail" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-fg">
                      {t.label}
                      <SourceMarker source={best.source} />
                    </p>
                    <p className="text-small text-fg-muted">{t.question}</p>
                  </div>
                  <span className="text-small text-fg-muted">{pass ? "Yes" : "No"}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <RiskList reasons={slice.reasons} slug={slug} />
        )}
        {best?.feed && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-small text-fg-muted">
            Onchain feed: <AddressChip address={best.feed.address} chain={best.feed.chain} kind="contract" />
          </p>
        )}
        <p className="mt-4 text-label font-normal text-fg-subtle">
          Five tests adapted from Chronicle Labs, &ldquo;The Transparency Gap in Onchain Finance&rdquo; (Oct 2026).
        </p>
      </Card>

      {asset.verification.methods.length > 1 && (
        <Card title="Other verification methods">
          <ul className="space-y-2 text-small">
            {asset.verification.methods
              .filter((m) => m !== best)
              .map((m) => (
                <li key={`${m.provider}-${m.type}`}>
                  {entityName(m.provider)} · {m.type} · passes {passCount(m)} of 5
                  <SourceMarker source={m.source} />
                </li>
              ))}
          </ul>
        </Card>
      )}

      {slice.reasons.length > 0 && best && (
        <Card title="Gaps">
          <RiskList reasons={slice.reasons} slug={slug} />
        </Card>
      )}
    </div>
  );
}
