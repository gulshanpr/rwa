import { ArrowDown, ArrowUp } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { RiskDot } from "@/components/risk/risk-dot";
import { cn, type RiskVisual } from "@/lib/ui";

export function StatCard({
  label,
  info,
  infoHref,
  value,
  valueTitle,
  sub,
  delta,
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
  status?: { color: RiskVisual; label: string };
  className?: string;
}) {
  return (
    <div className={cn("min-w-44 flex-1 rounded-card border border-line bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center gap-1.5 text-label text-fg-subtle">
        <span>{label}</span>
        <InfoTip label={label} href={infoHref}>
          {info}
        </InfoTip>
      </div>
      <div className="tnum mt-1.5 text-stat text-fg" title={valueTitle}>
        {value}
        {sub && <span className="ml-1.5 text-body font-normal text-fg-muted">{sub}</span>}
      </div>
      {delta && (
        <div className={cn("tnum mt-1 flex items-center gap-0.5 text-label", delta.direction === "up" ? "text-up" : "text-down")}>
          {delta.direction === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {delta.value}
          {delta.suffix && <span className="ml-1 text-fg-subtle">{delta.suffix}</span>}
        </div>
      )}
      {status && <RiskDot color={status.color} label={<span className="text-label text-fg-muted">{status.label}</span>} className="mt-1" />}
    </div>
  );
}
