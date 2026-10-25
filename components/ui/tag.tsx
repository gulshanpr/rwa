import { cn, RISK_DOT, RISK_SOFT, type RiskVisual } from "@/lib/ui";

type Variant = "neutral" | "accent" | `risk-${RiskVisual}`;

export function Tag({
  children,
  variant = "neutral",
  className,
  title,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  title?: string;
}) {
  const risk = variant.startsWith("risk-") ? (variant.slice(5) as RiskVisual) : undefined;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-control border px-2 py-0.5 text-label",
        variant === "neutral" && "border-line bg-surface text-fg-muted",
        variant === "accent" && "border-accent/25 bg-accent-soft text-accent",
        risk && RISK_SOFT[risk],
        className,
      )}
    >
      {risk && <span aria-hidden className={cn("size-1.5 rounded-full", RISK_DOT[risk])} />}
      {children}
    </span>
  );
}
