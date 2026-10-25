"use client";

import * as Popover from "@radix-ui/react-popover";
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { RiskDot } from "@/components/risk/risk-dot";
import { Rosette } from "@/components/risk/rosette";
import { StageBadge } from "@/components/risk/stage-card";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { CHAINS } from "@/lib/chains";
import { formatDuration, formatUsd } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_SHORT, RATING_RANK, type CategoryId, type Rating, type Tone } from "@/lib/framework/types";
import { shortEntityName } from "@/lib/labels";
import type { Flag } from "@/lib/profile";
import type { AssetRow } from "@/lib/rows";
import type { Chain } from "@/lib/schema/asset";
import { cn, RISK_DOT, RISK_WORD, ratingWord } from "@/lib/ui";

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});


const helper = createColumnHelper<typeof features, AssetRow>();

const TONE_RANK: Record<Tone, number> = { red: 0, yellow: 1, grey: 2, green: 3 };

/** The worst flag, with the rest behind "+n" so the column stays one tag wide. */
function FlagsCell({ flags }: { flags: Flag[] }) {
  const sorted = [...flags].sort((a, b) => TONE_RANK[a.color] - TONE_RANK[b.color]);
  if (sorted.length === 0) return <span className="text-fg-subtle">None</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Tag variant={`risk-${sorted[0].color}`}>{sorted[0].label}</Tag>
      {sorted.length > 1 && (
        <ChartTooltip
          content={
            <ul className="space-y-1.5">
              {sorted.map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", RISK_DOT[f.color])} />
                  {f.label}
                </li>
              ))}
            </ul>
          }
        >
          <button
            type="button"
            aria-label={`All flags: ${sorted.map((f) => f.label).join(", ")}`}
            className="rounded-control border border-line px-1.5 py-0.5 text-label text-fg-muted hover:border-line-strong hover:text-fg"
          >
            +{sorted.length - 1}
          </button>
        </ChartTooltip>
      )}
    </span>
  );
}

const columns = helper.columns([
  helper.accessor("ticker", {
    header: "Asset",
    enableHiding: false,
    meta: { sticky: true },
    cell: (info) => {
      const r = info.row.original;
      return (
        <Link href={`/assets/${r.slug}`} title={r.name} className="group flex min-w-44 items-center gap-3">
          <Rosette slices={r.categories} size="sm" ticker={r.ticker} />
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <span className="font-semibold text-fg group-hover:text-accent">{r.ticker}</span>
              <span className="hidden max-w-56 truncate text-fg-muted 2xl:inline">{r.name}</span>
            </span>
            <span className="block text-label font-normal whitespace-nowrap text-fg-subtle">
              {shortEntityName(r.manager)} · {r.assetClassLabel}
            </span>
          </span>
        </Link>
      );
    },
  }),
  helper.accessor("assetClassLabel", { header: "Class" }),
  helper.accessor((r) => shortEntityName(r.manager), {
    id: "manager",
    header: "Issuer",
    cell: (info) => <span title={info.row.original.manager}>{info.getValue()}</span>,
  }),
  helper.accessor((r) => r.aumUsd ?? -1, {
    id: "aum",
    header: "Value",
    meta: { align: "right" },
    cell: (info) => (info.row.original.aumUsd !== null ? formatUsd(info.row.original.aumUsd) : "—"),
  }),
  ...CATEGORY_ORDER.map((category) =>
    helper.accessor((r) => RATING_RANK[r.categories[category].rating], {
      id: category,
      header: CATEGORY_SHORT[category],
      meta: { align: "center", title: CATEGORY_LABELS[category] },
      cell: (info) => {
        const c = info.row.original.categories[category];
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
      },
    }),
  ),
  helper.accessor((r) => r.stage ?? -1, {
    id: "stage",
    header: "Stage",
    meta: { title: "Stage: how much holders have to trust the issuer" },
    cell: (info) => <StageBadge stage={info.row.original.stage} />,
  }),
  helper.accessor((r) => (r.onchainData ? 1 : 0), {
    id: "onchainData",
    header: "Onchain data",
    meta: { align: "center", title: "Holdings or reserve data published onchain (a badge, not part of any rating)" },
    cell: (info) => (info.row.original.onchainData ? "Yes" : <span className="text-fg-subtle">No</span>),
  }),
  helper.accessor((r) => r.chains.join(", "), {
    id: "chains",
    header: "Chains",
    cell: (info) => info.row.original.chains.map((c) => CHAINS[c].name).join(", "),
  }),
  helper.accessor("defiCollateralUsd", {
    header: "DeFi collateral",
    meta: { align: "right" },
    cell: (info) => formatUsd(info.getValue()),
  }),
  helper.accessor((r) => r.oracleAgeSeconds ?? Number.MAX_SAFE_INTEGER, {
    id: "oracleAge",
    header: "Oracle age",
    meta: { align: "right" },
    cell: (info) => (info.row.original.oracleAgeSeconds !== null ? formatDuration(info.row.original.oracleAgeSeconds) : "None"),
  }),
  helper.display({
    id: "flags",
    header: "Flags",
    cell: (info) => <FlagsCell flags={info.row.original.flags} />,
  }),
]);

type ColumnMeta = { align?: "left" | "right" | "center"; title?: string; sticky?: boolean };
type ClassFilter = "all" | "us-treasuries" | "private-credit";
type Toggle = "eoa" | "staged" | "collateral" | "stale";

const TOGGLES: { id: Toggle; label: string; test: (r: AssetRow) => boolean }[] = [
  { id: "eoa", label: "Single-key critical power", test: (r) => r.singleKeyPowers > 0 },
  { id: "staged", label: "Stage 0 or above", test: (r) => r.stage !== null },
  { id: "collateral", label: "Used as collateral", test: (r) => r.defiCollateralUsd > 0 },
  { id: "stale", label: "Price stale > 24h", test: (r) => r.flags.some((f) => f.id === "price-stale") },
];

const selectClass =
  "h-8 rounded-control border border-line bg-surface px-2 text-small text-fg-muted hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent";

export function Screener({ rows, defaultClass = "all" }: { rows: AssetRow[]; defaultClass?: ClassFilter }) {
  const [assetClass, setAssetClass] = useState<ClassFilter>(defaultClass);
  const [chain, setChain] = useState<Chain | "all">("all");
  const [category, setCategory] = useState<CategoryId>("control");
  const [rating, setRating] = useState<Rating | "any">("any");
  const [toggles, setToggles] = useState<Set<Toggle>>(new Set());

  const chains = useMemo(() => [...new Set(rows.flatMap((r) => r.chains))], [rows]);
  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          (assetClass === "all" || r.assetClass === assetClass) &&
          (chain === "all" || r.chains.includes(chain)) &&
          (rating === "any" || r.categories[category].rating === rating) &&
          TOGGLES.every((t) => !toggles.has(t.id) || t.test(r)),
      ),
    [rows, assetClass, chain, category, rating, toggles],
  );

  const table = useTable({
    features,
    columns,
    data,
    initialState: {
      sorting: [{ id: "aum", desc: true }],
      // The asset cell already shows issuer and class; the rest are a click away under Columns.
      columnVisibility: { assetClassLabel: false, manager: false, legal: false, onchainData: false, chains: false, defiCollateralUsd: false, oracleAge: false },
    },
  });

  const flip = (id: Toggle) =>
    setToggles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <div className="space-y-3 border-b border-line p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Asset class"
            value={assetClass}
            onChange={setAssetClass}
            options={[
              { value: "all", label: "All" },
              { value: "us-treasuries", label: "Treasuries" },
              { value: "private-credit", label: "Credit" },
            ]}
          />
          <select aria-label="Chain" className={selectClass} value={chain} onChange={(e) => setChain(e.target.value as Chain | "all")}>
            <option value="all">All chains</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                {CHAINS[c].name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select aria-label="Risk category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <span className="text-small text-fg-subtle">is</span>
            <select aria-label="Rating" className={selectClass} value={rating} onChange={(e) => setRating(e.target.value as Rating | "any")}>
              <option value="any">any rating</option>
              {(["green", "yellow", "red", "unverified", "not-assessed"] as const).map((r) => (
                <option key={r} value={r}>
                  {RISK_WORD[r].toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Popover.Root>
              <Popover.Trigger className={cn(selectClass, "inline-flex items-center gap-1.5")}>
                <Columns3 className="size-3.5" /> Columns
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 w-52 rounded-control border border-line bg-surface p-2 shadow-popover"
                >
                  {table
                    .getAllLeafColumns()
                    .filter((c) => c.getCanHide())
                    .map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-small hover:bg-subtle">
                        <input
                          type="checkbox"
                          checked={c.getIsVisible()}
                          onChange={() => c.toggleVisibility()}
                          className="accent-[var(--accent)]"
                        />
                        {(c.columnDef.meta as ColumnMeta | undefined)?.title ?? String(c.columnDef.header)}
                      </label>
                    ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <a href="/api/assets.csv" className={cn(selectClass, "inline-flex items-center gap-1.5")}>
              <Download className="size-3.5" /> Download CSV
            </a>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-label font-normal text-fg-subtle">Only show</span>
          {TOGGLES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={toggles.has(t.id)}
              onClick={() => flip(t.id)}
              className={cn(
                "h-7 rounded-full border px-3 text-small transition-colors",
                toggles.has(t.id)
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-small">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      title={meta?.title}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "sticky top-0 border-b border-line bg-subtle px-3 py-2 text-label whitespace-nowrap text-fg-muted first:pl-4 last:pr-4",
                        meta?.align === "right" ? "text-right" : meta?.align === "center" ? "text-center" : "text-left",
                        meta?.sticky && "left-0 z-10",
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-fg"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 text-fg-subtle" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-10 text-center text-fg-muted">
                  No assets match these filters.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="group/row transition-colors hover:bg-page">
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "border-b border-line px-3 py-2.5 first:pl-4 last:pr-4",
                        meta?.align === "right" ? "tnum text-right whitespace-nowrap" : meta?.align === "center" ? "px-2 text-center" : "",
                        meta?.sticky && "sticky left-0 z-[1] bg-surface transition-colors group-hover/row:bg-page",
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {table.getRowModel().rows.length === 0 && (
          <li className="px-4 py-10 text-center text-small text-fg-muted">No assets match these filters.</li>
        )}
        {table.getRowModel().rows.map(({ original: r }) => (
          <li key={r.slug} className="p-4">
            <Link href={`/assets/${r.slug}`} className="flex items-start gap-3">
              <Rosette slices={r.categories} size="sm" ticker={r.ticker} />
              <div className="min-w-0 flex-1">
                <p className="text-body">
                  <span className="font-semibold">{r.ticker}</span> <span className="text-fg-muted">{shortEntityName(r.manager)}</span>
                </p>
                <p className="tnum text-small text-fg-muted">
                  {r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"} · {r.assetClassLabel}
                </p>
              </div>
              <StageBadge stage={r.stage} />
            </Link>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-label font-normal text-fg-muted">
              {CATEGORY_ORDER.map((c) => (
                <RiskDot key={c} color={r.categories[c].rating} label={CATEGORY_SHORT[c]} title={ratingWord(r.categories[c])} />
              ))}
            </div>
            {r.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.flags.map((f) => (
                  <Tag key={f.id} variant={`risk-${f.color}`}>
                    {f.label}
                  </Tag>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
