import type { Stage } from "@/lib/scoring/stages";
import { STAGE_NAMES } from "@/lib/scoring/stages";
import { Tag } from "@/components/ui/tag";

const VARIANT = { 0: "risk-red", 1: "risk-yellow", 2: "risk-green" } as const;

export function StageBadge({ stage, compact = false }: { stage: Stage | null; compact?: boolean }) {
  if (stage === null) return <Tag title="No discovery snapshot yet, so the stage can't be assessed.">{compact ? "—" : "Stage: not assessed"}</Tag>;
  return (
    <Tag variant={VARIANT[stage]} title={`Stage ${stage}: ${STAGE_NAMES[stage]}`}>
      {compact ? `Stage ${stage}` : `Stage ${stage} · ${STAGE_NAMES[stage]}`}
    </Tag>
  );
}
