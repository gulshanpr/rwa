import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { STAGE_NAMES, type StageResult } from "@/lib/scoring/stages";
import { StageBadge } from "./stage-badge";

export function StageCard({ result }: { result: StageResult }) {
  const target = result.stage === 2 ? undefined : result.stage + 1;
  const shown = result.requirements.filter((r) => r.stage === (target ?? 2));
  return (
    <Card
      title="Stage"
      description={
        !result.assessed
          ? "Not assessed until the token's permissions have been discovered."
          : target
            ? `What it takes to reach Stage ${target} (${STAGE_NAMES[target as 1 | 2]}). ${result.next.length} of ${shown.length} requirements still unmet.`
            : "Every Stage 2 requirement is met."
      }
      actions={<StageBadge stage={result.assessed ? result.stage : null} />}
    >
      <ul className="divide-y divide-line rounded-control border border-line">
        {shown.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${r.met ? "bg-risk-green-soft text-risk-green" : "bg-risk-red-soft text-risk-red"}`}
            >
              {r.met ? <Check className="size-3.5" aria-label="Met" /> : <X className="size-3.5" aria-label="Not met" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body text-fg">{r.text}</p>
              {!r.met && (
                <p className="mt-0.5 text-small text-fg-muted">
                  <span className="font-medium text-fg-subtle">How to fix: </span>
                  {r.fix}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-label font-normal text-fg-subtle">
        Stage 0 &ldquo;Trust us&rdquo; → Stage 1 &ldquo;Verify us&rdquo; → Stage 2 &ldquo;Prove it&rdquo;. The legal slice joins Stage 2
        once it is assessed.
      </p>
    </Card>
  );
}
