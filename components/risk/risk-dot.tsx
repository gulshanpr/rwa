import type { SliceColor } from "@/lib/scoring/types";
import { cn, RISK_DOT, RISK_WORD } from "@/lib/ui";

export function SliceDot({
  color,
  label,
  showWord = false,
  className,
}: {
  color: SliceColor;
  label?: React.ReactNode;
  showWord?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden={Boolean(label || showWord)}
        role={label || showWord ? undefined : "img"}
        aria-label={label || showWord ? undefined : RISK_WORD[color]}
        title={RISK_WORD[color]}
        className={cn("inline-block size-2 shrink-0 rounded-full", RISK_DOT[color])}
      />
      {label}
      {showWord && <span className="text-fg-muted">{RISK_WORD[color]}</span>}
    </span>
  );
}
