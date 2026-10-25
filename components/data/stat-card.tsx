import { ArrowDown, ArrowUp } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { RiskDot } from "@/components/risk/risk-dot";
import { formatPct } from "@/lib/format";
import { cn, type RiskVisual } from "@/lib/ui";

// The track is a lighter step of the fill's own hue, so the share reads across the whole bar.
const METER = {
  accent: { track: "bg-accent-soft", fill: "bg-accent" },
  red: { track: "bg-risk-red-soft", fill: "bg-risk-red" },
} as const;

export function StatCard({
  label,
  info,
  infoHref,
  value,
  valueTitle,
  sub,
  delta,
  note,
  meter,
  status,
  className,
}: {
  label: string;
  info: string;
  infoHref?: string;
  value: React.ReactNode;
  valueTitle?: string;
  sub?: React.ReactNode;
  delta?: { value: string; direction: "up" | "down"; suffix?: string };
  /** Muted line under the value, after the delta. */
  note?: React.ReactNode;
  /** A share of a whole (0–1), drawn as a bar under the value. */
  meter?: { ratio: number; tone: keyof typeof METER; label: string };
  status?: { color: RiskVisual; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-52 flex-1 flex-col rounded-card border border-line bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center gap-1.5 text-label font-normal text-fg-muted">
        <span>{label}</span>
        <InfoTip label={label} href={infoHref}>
          {info}
        </InfoTip>
      </div>
      <div className="mt-2 text-stat text-fg" title={valueTitle}>
        {value}
        {sub && <span className="ml-1.5 text-body font-normal text-fg-muted">{sub}</span>}
      </div>
      {(delta || note) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-label font-normal text-fg-muted">
          {delta && (
            <span className={cn("tnum inline-flex items-center gap-0.5 font-medium", delta.direction === "up" ? "text-up" : "text-down")}>
              {delta.direction === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {delta.value}
              {delta.suffix && <span className="ml-0.5 font-normal text-fg-subtle">{delta.suffix}</span>}
            </span>
          )}
          {delta && note && <span className="text-fg-subtle">·</span>}
          {note}
        </div>
      )}
      {meter && (
        <div className="mt-auto flex items-center gap-2.5 pt-3">
          <div
            role="img"
            aria-label={`${formatPct(meter.ratio, 0)} ${meter.label}`}
            className={cn("h-1.5 flex-1 overflow-hidden rounded-full", METER[meter.tone].track)}
          >
            <div className={cn("h-full rounded-full", METER[meter.tone].fill)} style={{ width: `${Math.min(meter.ratio, 1) * 100}%` }} />
          </div>
          <span className="tnum shrink-0 text-label font-normal text-fg-muted">
            {formatPct(meter.ratio, 0)} {meter.label}
          </span>
        </div>
      )}
      {status && <RiskDot color={status.color} label={<span className="text-label text-fg-muted">{status.label}</span>} className="mt-1.5" />}
    </div>
  );
}
