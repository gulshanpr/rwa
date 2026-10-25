import { Check, Minus, X } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Requirement, StageResult } from "@/lib/framework/stages";
import { cn } from "@/lib/ui";

export const STAGE_NAMES = ["Disclosed", "Protected", "Trust-minimized"] as const;

export function stageLabel(stage: StageResult["stage"]): string {
  return stage === null ? "Below Stage 0" : `Stage ${stage} · ${STAGE_NAMES[stage]}`;
}

const ICON = {
  met: <Check className="size-3.5 text-risk-green" aria-label="Met" />,
  unmet: <X className="size-3.5 text-risk-red" aria-label="Not met" />,
  "not-assessed": <Minus className="size-3.5 text-fg-subtle" aria-label="Not assessed" />,
} as const;

/** Stage pill for headers and tables. */
export function StageBadge({ stage, className }: { stage: StageResult["stage"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-control border px-2 py-0.5 text-label whitespace-nowrap",
        stage === null ? "border-dashed border-fg-subtle text-fg-muted" : "border-accent/25 bg-accent-soft text-accent",
        className,
      )}
    >
      {stage === null ? "No stage" : `Stage ${stage}`}
    </span>
  );
}

function RequirementRow({ r }: { r: Requirement }) {
  return (
    <li className="flex items-start gap-2 py-1">
      <span className="mt-0.5 shrink-0">{ICON[r.status]}</span>
      <span className={cn("text-small", r.status === "met" ? "text-fg" : "text-fg-muted")}>
        {r.text}
        {r.status === "not-assessed" && <span className="text-fg-subtle"> · legal, not assessed yet</span>}
      </span>
    </li>
  );
}

export function StageCard({ stage }: { stage: StageResult }) {
  const description =
    stage.stage === null
      ? "The minimum disclosure for Stage 0 isn't there yet."
      : stage.pendingLegal
        ? "The next stage is held back only by legal checks we haven't assessed."
        : "How much holders have to trust the issuer. Each stage builds on the last.";
  return (
    <Card
      title={stageLabel(stage.stage)}
      description={description}
      actions={
        <Link href="/methodology#stages" className="text-small text-accent hover:underline">
          About stages
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {([0, 1, 2] as const).map((s) => (
          <div key={s}>
            <p className={cn("text-label", stage.stage !== null && stage.stage >= s ? "text-accent" : "text-fg-subtle")}>
              Stage {s} · {STAGE_NAMES[s]}
            </p>
            <ul className="mt-1">
              {stage.requirements
                .filter((r) => r.stage === s)
                .map((r) => (
                  <RequirementRow key={r.id} r={r} />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
