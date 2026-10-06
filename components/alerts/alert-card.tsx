import Link from "next/link";
import { RelativeTime } from "@/components/data/relative-time";
import { explorerTx } from "@/lib/chains";
import type { Alert } from "@/lib/schema/live";
import { cn, RISK_DOT, SEVERITY_COLOR } from "@/lib/ui";

export function AlertCard({ alert, ticker, compact = false }: { alert: Alert; ticker: string; compact?: boolean }) {
  return (
    <article className={cn("min-w-0", !compact && "rounded-card border border-line bg-surface p-4 shadow-card")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label">
        <span className="inline-flex items-center gap-1.5 font-semibold tracking-wide text-fg-muted uppercase">
          <span className={cn("size-2 rounded-full", RISK_DOT[SEVERITY_COLOR[alert.severity]])} aria-hidden />
          {alert.severity}
        </span>
        <span className="text-fg-subtle">·</span>
        <RelativeTime iso={alert.publishedAt} className="font-normal text-fg-subtle" />
        <Link
          href={`/assets/${alert.asset}`}
          className="ml-auto rounded-[6px] border border-line px-1.5 py-px font-medium text-fg-muted hover:border-line-strong hover:text-fg"
        >
          {ticker}
        </Link>
      </div>
      <h3 className={cn("mt-1 font-medium text-fg", compact ? "text-small" : "text-body")}>{alert.title}</h3>
      <p className="mt-0.5 text-small text-fg-muted">{alert.consequence}</p>
      {!compact && (
        <div className="mt-2 flex gap-4 text-label">
          <a href={explorerTx(alert.chain, alert.txHash)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Transaction ↗
          </a>
          <Link href={`/assets/${alert.asset}/history`} className="text-accent hover:underline">
            View change
          </Link>
        </div>
      )}
    </article>
  );
}
