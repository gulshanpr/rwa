"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Rosette } from "@/components/risk/rosette";
import { StageBadge } from "@/components/risk/stage-card";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_SHORT, type CategoryId } from "@/lib/framework/types";
import { shortEntityName } from "@/lib/labels";
import type { AssetRow } from "@/lib/rows";
import { cn, RISK_DOT, RISK_WORD, ratingWord } from "@/lib/ui";

type Filter = "us-treasuries" | "private-credit" | "all";
// Legal Claim isn't assessed yet, so a column of grey dots would only add noise.
const DOT_CATEGORIES = CATEGORY_ORDER.filter((c) => c !== "legal");
const CLASS_SHORT = { "us-treasuries": "Treasuries", "private-credit": "Private credit" } as const;

function RatingDot({ row, category }: { row: AssetRow; category: CategoryId }) {
  const c = row.categories[category];
  return (
    <ChartTooltip
      content={
        <>
          <p className="flex items-center gap-1.5 font-medium">
            <span aria-hidden className={cn("size-2 rounded-full", RISK_DOT[c.rating])} />
            {CATEGORY_LABELS[category]} · {ratingWord(c)}
          </p>
          <p className="mt-1 text-fg-muted">{c.headline}</p>
        </>
      }
    >
      <span
        role="img"
        aria-label={`${CATEGORY_LABELS[category]}: ${ratingWord(c)}. ${c.headline}`}
        className="inline-flex size-6 items-center justify-center"
      >
        <span className={cn("size-2.5 rounded-full", RISK_DOT[c.rating])} />
      </span>
    </ChartTooltip>
  );
}

function ShareBar({ value, total }: { value: number | null; total: number }) {
  const share = value !== null && total ? value / total : 0;
  return (
    <span className="mt-1 flex items-center justify-end gap-2">
      <span className="h-1 w-14 overflow-hidden rounded-full bg-subtle">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="tnum w-8 text-label font-normal text-fg-subtle">{share > 0 && share < 0.01 ? "<1%" : formatPct(share, 0)}</span>
    </span>
  );
}

export function AssetsTable({ rows }: { rows: AssetRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) => filter === "all" || r.assetClass === filter);
  const total = rows.reduce((s, r) => s + (r.aumUsd ?? 0), 0);

  return (
    <Card
      title="Assets"
      description="Ranked by value. Hover a dot to see the finding behind the rating."
      bodyClassName="p-0"
      actions={
        <Segmented
          label="Asset class"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "us-treasuries", label: "Treasuries" },
            { value: "private-credit", label: "Credit" },
          ]}
        />
      }
    >
      <div className="hidden px-5 pt-2 md:block">
        <Table>
          <thead>
            <tr>
              <Th align="right" className="w-10">
                #
              </Th>
              <Th>Asset</Th>
              <Th align="right">Value · share</Th>
              {DOT_CATEGORIES.map((c) => (
                <Th key={c} align="center" className="px-2">
                  <span title={CATEGORY_LABELS[c]}>{CATEGORY_SHORT[c]}</span>
                </Th>
              ))}
              <Th>Stage</Th>
              <Th className="hidden w-8 min-[1400px]:table-cell">
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <Td colSpan={5 + DOT_CATEGORIES.length} className="py-8 text-center text-fg-muted">
                  No assets in this class yet. The v1 list of 20 is being added one by one.
                </Td>
              </tr>
            )}
            {shown.map((r, i) => (
              <Tr key={r.slug}>
                <Td align="right" className="text-fg-subtle">
                  {i + 1}
                </Td>
                <Td className="py-3">
                  <Link href={`/assets/${r.slug}`} className="group flex min-w-0 items-center gap-3">
                    <Rosette slices={r.categories} size="sm" ticker={r.ticker} />
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 font-semibold text-fg group-hover:text-accent">{r.ticker}</span>
                        <span title={r.name} className="hidden truncate text-fg-muted xl:inline xl:max-w-40 min-[1400px]:max-w-56 2xl:max-w-72">
                          {r.name}
                        </span>
                      </span>
                      <span className="block text-label font-normal text-fg-subtle">
                        <span title={r.manager}>{shortEntityName(r.manager)}</span> · {CLASS_SHORT[r.assetClass]}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td align="right" className="py-3 whitespace-nowrap">
                  <span className="text-fg" title={r.aumUsd !== null ? formatUsdFull(r.aumUsd) : undefined}>
                    {r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"}
                  </span>
                  <ShareBar value={r.aumUsd} total={total} />
                </Td>
                {DOT_CATEGORIES.map((c) => (
                  <Td key={c} align="center" className="px-2">
                    <RatingDot row={r} category={c} />
                  </Td>
                ))}
                <Td>
                  <StageBadge stage={r.stage} />
                </Td>
                <Td className="hidden pl-0 min-[1400px]:table-cell">
                  <Link
                    href={`/assets/${r.slug}`}
                    aria-label={`${r.ticker} risk profile`}
                    className="inline-flex size-6 items-center justify-center rounded-[3px] text-fg-subtle hover:bg-subtle hover:text-fg"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line md:hidden">
        {shown.length === 0 && <li className="px-4 py-8 text-center text-small text-fg-muted">No assets in this class yet.</li>}
        {shown.map((r) => (
          <li key={r.slug}>
            <Link href={`/assets/${r.slug}`} className="block px-4 py-3.5 active:bg-page">
              <div className="flex items-center gap-3">
                <Rosette slices={r.categories} size="sm" ticker={r.ticker} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-fg">{r.ticker}</p>
                  <p className="truncate text-label font-normal text-fg-subtle">
                    {shortEntityName(r.manager)} · {CLASS_SHORT[r.assetClass]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-body text-fg">{r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"}</p>
                  <StageBadge stage={r.stage} className="mt-1" />
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 pl-9 text-label font-normal text-fg-muted">
                {DOT_CATEGORIES.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5" title={`${CATEGORY_LABELS[c]}: ${ratingWord(r.categories[c])}`}>
                    <span aria-hidden className={cn("size-2 rounded-full", RISK_DOT[r.categories[c].rating])} />
                    {CATEGORY_SHORT[c]}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 md:mt-4 md:px-5">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-normal text-fg-muted">
          {(["green", "yellow", "red", "unverified"] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-full", RISK_DOT[c])} /> {RISK_WORD[c]}
            </span>
          ))}
        </div>
        <Link href="/screener" className="inline-flex items-center gap-1 text-small text-accent hover:underline">
          Flags, chains and DeFi exposure in the screener <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
