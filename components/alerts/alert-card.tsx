import Link from "next/link";
import { AssetLogo } from "@/components/asset/asset-logo";
import { RelativeTime } from "@/components/data/relative-time";
import { CHAINS, explorerTx } from "@/lib/chains";
import type { Alert } from "@/lib/schema/live";
import { cn, RISK_DOT, SEVERITY_COLOR } from "@/lib/ui";

export const KIND_LABELS: Record<Alert["kind"], string> = {
  upgrade: "Upgrade",
  "admin-change": "Admin change",
  "role-grant": "Role granted",
  "role-revoke": "Role revoked",
  "ownership-transfer": "Ownership transfer",
  pause: "Pause",
  "safe-change": "Safe change",
  mint: "Large mint",
  burn: "Large burn",
  freeze: "Freeze",
  seize: "Seize",
  "service-change": "Service change",
  "timelock-scheduled": "Timelock queued",
  "oracle-stale": "Oracle stale",
  "nav-drop": "NAV write-down",
  "compliance-change": "Access rules changed",
  filing: "SEC filing",
  "lei-change": "LEI change",
};

export function AlertCard({ alert, ticker, compact = false }: { alert: Alert; ticker: string; compact?: boolean }) {
  return (
    <article className={cn("min-w-0", !compact && "rounded-card border border-line bg-surface p-3.5 shadow-card md:p-4")}>
      <div className="flex items-start gap-2 text-label">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-semibold tracking-wide text-fg-muted uppercase">
            <span className={cn("size-2 rounded-full", RISK_DOT[SEVERITY_COLOR[alert.severity]])} aria-hidden />
            {alert.severity}
          </span>
          <span className="text-fg-subtle" aria-hidden>
            ·
          </span>
          <RelativeTime iso={alert.publishedAt} className="font-normal text-fg-subtle" />
          {!compact && (
            <>
              <span className="text-fg-subtle" aria-hidden>
                ·
              </span>
              <span className="font-normal text-fg-subtle">
                {KIND_LABELS[alert.kind]}
                {alert.chain && ` on ${CHAINS[alert.chain].name}`}
              </span>
            </>
          )}
        </div>
        <Link
          href={`/assets/${alert.asset}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-line py-px pr-1.5 pl-1 font-medium text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <AssetLogo slug={alert.asset} ticker={ticker} size={14} />
          {ticker}
        </Link>
      </div>
      <h3 className={cn("mt-1.5 font-medium text-fg", compact ? "text-small" : "text-body")}>{alert.title}</h3>
      <p className="mt-0.5 text-small text-fg-muted">{alert.consequence}</p>
      {!compact && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-label">
          {alert.chain && alert.txHash ? (
            <a href={explorerTx(alert.chain, alert.txHash)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Transaction ↗
            </a>
          ) : alert.url ? (
            <a href={alert.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Source ↗
            </a>
          ) : null}
          <Link href={`/assets/${alert.asset}/history`} className="text-accent hover:underline">
            View change
          </Link>
        </div>
      )}
    </article>
  );
}
