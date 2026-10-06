import { formatDuration } from "@/lib/format";
import type { OracleAge } from "@/lib/scoring/pricing";

const MAX_RATIO = 4;

export function AgeGauge({ age }: { age: OracleAge }) {
  const pct = (Math.min(age.ratio, MAX_RATIO) / MAX_RATIO) * 100;
  const zone = (from: number, to: number) => ({ left: `${(from / MAX_RATIO) * 100}%`, width: `${((to - from) / MAX_RATIO) * 100}%` });
  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-subtle" role="img" aria-label={`Oracle age ${formatDuration(age.ageSeconds)}, ${age.ratio.toFixed(2)} times the expected cadence`}>
        <div className="absolute inset-y-0 rounded-l-full bg-risk-green/70" style={zone(0, 1)} />
        <div className="absolute inset-y-0 bg-risk-yellow/70" style={zone(1, 3)} />
        <div className="absolute inset-y-0 rounded-r-full bg-risk-red/70" style={zone(3, MAX_RATIO)} />
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg shadow-card"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="tnum relative mt-1.5 h-4 text-label font-normal text-fg-subtle">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${100 / MAX_RATIO}%` }}>
          {formatDuration(age.cadenceSeconds)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(3 * 100) / MAX_RATIO}%` }}>
          {formatDuration(age.cadenceSeconds * 3)} stale
        </span>
        <span className="absolute right-0">{formatDuration(age.cadenceSeconds * MAX_RATIO)}+</span>
      </div>
    </div>
  );
}
