import Link from "next/link";
import { Rosette } from "@/components/risk/rosette";
import { formatPct, formatUsd } from "@/lib/format";
import { assetRows } from "@/lib/rows";
import { cn } from "@/lib/ui";

/** Horizontal strip of tracked assets under the top bar: rosette, ticker, value, 30d change. */
export async function AssetStrip() {
  const rows = await assetRows();
  if (rows.length === 0) return null;
  return (
    <div className="border-b border-line bg-surface">
      <div className="no-scrollbar flex h-10 items-stretch overflow-x-auto">
        <span className="flex shrink-0 items-center border-r border-line px-4 text-micro text-fg-subtle uppercase md:px-6">
          Tracked
        </span>
        {rows.map((r) => (
          <Link
            key={r.slug}
            href={`/assets/${r.slug}`}
            className="group flex shrink-0 items-center gap-2 border-r border-line px-4 text-small transition-colors hover:bg-raised"
          >
            <Rosette slices={r.slices} size="xs" ticker={r.ticker} />
            <span className="font-medium text-fg-muted group-hover:text-accent">{r.ticker}</span>
            <span className="tnum text-fg">{r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"}</span>
            {r.aumDelta30d !== null && (
              <span className={cn("tnum text-label", r.aumDelta30d >= 0 ? "text-up" : "text-down")}>
                {r.aumDelta30d >= 0 ? "+" : "−"}
                {formatPct(Math.abs(r.aumDelta30d), 1)}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
