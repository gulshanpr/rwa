import { cn, RISK_DOT, RISK_WORD, type RiskVisual } from "@/lib/ui";

export function RiskDot({
  color,
  label,
  showWord = false,
  title,
  className,
}: {
  color: RiskVisual;
  label?: React.ReactNode;
  showWord?: boolean;
  /** Overrides the color word on hover, e.g. "Unverified · at least yellow". */
  title?: string;
  className?: string;
}) {
  const word = title ?? RISK_WORD[color];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden={Boolean(label || showWord)}
        role={label || showWord ? undefined : "img"}
        aria-label={label || showWord ? undefined : word}
        title={word}
        className={cn("inline-block size-2 shrink-0 rounded-full", RISK_DOT[color])}
      />
      {label}
      {showWord && <span className="text-fg-muted">{word}</span>}
    </span>
  );
}
