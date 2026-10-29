import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { AssetLogo } from "@/components/asset/asset-logo";
import { Card } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/framework/types";
import { shortEntityName } from "@/lib/labels";
import type { AssetRow } from "@/lib/rows";
import { cn, RISK_DOT } from "@/lib/ui";

const LIMIT = 5;

const redCategories = (r: AssetRow) => CATEGORY_ORDER.filter((c) => r.categories[c].rating === "red");
const redFlags = (r: AssetRow) => r.flags.filter((f) => f.color === "red").length;

/** The assets with the most red findings: a starting point, not the full list (that's the screener). */
export function NeedsAttention({ rows }: { rows: AssetRow[] }) {
  const ranked = rows
    .filter((r) => redCategories(r).length > 0 || redFlags(r) > 0)
    .sort(
      (a, b) =>
        redCategories(b).length - redCategories(a).length ||
        redFlags(b) - redFlags(a) ||
        (b.aumUsd ?? 0) - (a.aumUsd ?? 0),
    )
    .slice(0, LIMIT);

  return (
    <Card
      title="Needs attention"
      description="Assets with the most red ratings, and the worst finding behind each."
      bodyClassName="p-0"
      className="flex flex-col"
    >
      {ranked.length === 0 ? (
        <p className="px-4 py-6 text-small text-fg-muted md:px-5">No tracked asset has a red rating.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {ranked.map((r) => {
            const reds = redCategories(r);
            const finding = r.topRisk ?? (reds[0] ? r.categories[reds[0]].headline : r.flags[0]?.label);
            return (
              <li key={r.slug}>
                <Link
                  href={`/assets/${r.slug}`}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-page md:px-5"
                >
                  <AssetLogo slug={r.slug} ticker={r.ticker} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-fg group-hover:text-accent">{r.ticker}</span>
                      <span className="truncate text-label font-normal text-fg-subtle">
                        {shortEntityName(r.manager)} · {r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"}
                      </span>
                    </p>
                    {finding && <p className="mt-0.5 line-clamp-2 text-small text-fg-muted">{finding}</p>}
                    {reds.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-label font-normal text-fg-muted">
                        {reds.map((c) => (
                          <span key={c} className="inline-flex items-center gap-1.5">
                            <span aria-hidden className={cn("size-2 rounded-full", RISK_DOT.red)} />
                            {CATEGORY_LABELS[c]}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="mt-1.5 size-4 shrink-0 text-fg-subtle group-hover:text-fg" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto border-t border-line px-4 py-3 md:px-5">
        <Link href="/screener" className="inline-flex items-center gap-1 text-small text-accent hover:underline">
          Compare all {rows.length} assets in the screener <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
