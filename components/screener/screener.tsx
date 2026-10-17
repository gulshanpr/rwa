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
import { Rosette } from "@/components/risk/rosette";
import { SliceDot } from "@/components/risk/slice-dot";
import { StageBadge } from "@/components/risk/stage-badge";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { CHAINS } from "@/lib/chains";
import { formatDuration, formatUsd } from "@/lib/format";
import type { AssetRow } from "@/lib/rows";
import type { Chain } from "@/lib/schema/asset";
import { SLICE_LABELS, SLICE_ORDER, type SliceColor, type SliceId } from "@/lib/scoring/types";
import { cn } from "@/lib/ui";

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

const RANK: Record<SliceColor, number> = { grey: 0, green: 1, yellow: 2, red: 3 };
const SHORT: Record<SliceId, string> = {
  control: "Ctrl",
  "exit-window": "Window",
  pricing: "NAV",
  verification: "Resv",
  exit: "Redeem",
  disclosure: "Discl",
  legal: "Legal",
};

const helper = createColumnHelper<typeof features, AssetRow>();

const columns = helper.columns([
  helper.accessor("ticker", {
    header: "Asset",
    enableHiding: false,
    cell: (info) => (
      <Link href={`/assets/${info.row.original.slug}`} className="group block min-w-52">
        <span className="font-semibold text-fg group-hover:text-accent">{info.getValue()}</span>{" "}
        <span className="text-fg-muted">{info.row.original.name}</span>
      </Link>
    ),
  }),
  helper.accessor("assetClassLabel", { header: "Class" }),
  helper.accessor("manager", { header: "Issuer" }),
  helper.accessor((r) => r.aumUsd ?? -1, {
    id: "aum",
    header: "Value",
    meta: { align: "right" },
    cell: (info) => (info.row.original.aumUsd !== null ? formatUsd(info.row.original.aumUsd) : "—"),
  }),
  helper.display({
    id: "rosette",
    header: "Rosette",
    meta: { align: "center" },
    cell: (info) => (
      <span className="inline-flex">
        <Rosette slices={info.row.original.slices} size="sm" ticker={info.row.original.ticker} />
      </span>
    ),
  }),
  helper.accessor((r) => r.stage ?? -1, {
    id: "stage",
    header: "Stage",
    cell: (info) => <StageBadge stage={info.row.original.stage} compact />,
  }),
  ...SLICE_ORDER.map((slice) =>
    helper.accessor((r) => RANK[r.slices[slice].color], {
      id: slice,
      header: SHORT[slice],
      meta: { align: "center", title: SLICE_LABELS[slice] },
      cell: (info) => (
        <span title={`${SLICE_LABELS[slice]}: ${info.row.original.slices[slice].headline}`}>
          <SliceDot color={info.row.original.slices[slice].color} />
        </span>
      ),
    }),
  ),
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
    cell: (info) => (
      <div className="flex flex-wrap gap-1">
        {info.row.original.flags.map((f) => (
          <Tag key={f.id} variant={`risk-${f.color}`}>
            {f.label}
          </Tag>
        ))}
      </div>
    ),
  }),
]);

type ColumnMeta = { align?: "left" | "right" | "center"; title?: string };
type ClassFilter = "all" | "us-treasuries" | "private-credit";
type Toggle = "eoa" | "collateral" | "stale";

const TOGGLES: { id: Toggle; label: string; test: (r: AssetRow) => boolean }[] = [
  { id: "eoa", label: "Has EOA critical power", test: (r) => r.singleKeyPowers > 0 },
  { id: "collateral", label: "Used as collateral", test: (r) => r.defiCollateralUsd > 0 },
  { id: "stale", label: "Price stale > 24h", test: (r) => r.flags.some((f) => f.id === "price-stale") },
];

const selectClass =
  "h-8 rounded-control border border-line bg-surface px-2 text-small text-fg-muted hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent";

export function Screener({ rows, defaultClass = "all" }: { rows: AssetRow[]; defaultClass?: ClassFilter }) {
  const [assetClass, setAssetClass] = useState<ClassFilter>(defaultClass);
  const [chain, setChain] = useState<Chain | "all">("all");
  const [slice, setSlice] = useState<SliceId>("control");
  const [sliceColor, setSliceColor] = useState<SliceColor | "any">("any");
  const [toggles, setToggles] = useState<Set<Toggle>>(new Set());

  const chains = useMemo(() => [...new Set(rows.flatMap((r) => r.chains))], [rows]);
  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          (assetClass === "all" || r.assetClass === assetClass) &&
          (chain === "all" || r.chains.includes(chain)) &&
          (sliceColor === "any" || r.slices[slice].color === sliceColor) &&
          TOGGLES.every((t) => !toggles.has(t.id) || t.test(r)),
      ),
    [rows, assetClass, chain, slice, sliceColor, toggles],
  );

  const table = useTable({ features, columns, data, initialState: { sorting: [{ id: "aum", desc: true }] } });

  const flip = (id: Toggle) =>
    setToggles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 md:p-4">
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
          <select aria-label="Slice" className={selectClass} value={slice} onChange={(e) => setSlice(e.target.value as SliceId)}>
            {SLICE_ORDER.map((s) => (
              <option key={s} value={s}>
                {SLICE_LABELS[s]}
              </option>
            ))}
          </select>
          <span className="text-small text-fg-subtle">is</span>
          <select
            aria-label="Slice color"
            className={selectClass}
            value={sliceColor}
            onChange={(e) => setSliceColor(e.target.value as SliceColor | "any")}
          >
            <option value="any">any color</option>
            <option value="green">green</option>
            <option value="yellow">yellow</option>
            <option value="red">red</option>
            <option value="grey">not assessed</option>
          </select>
        </div>
        {TOGGLES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={toggles.has(t.id)}
            onClick={() => flip(t.id)}
            className={cn(
              "h-8 rounded-full border px-3 text-small transition-colors",
              toggles.has(t.id)
                ? "border-accent/30 bg-accent-soft text-accent"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
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
              <tr key={row.id} className="transition-colors hover:bg-page">
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "border-b border-line px-3 py-2.5 first:pl-4 last:pr-4",
                        meta?.align === "right" ? "tnum text-right whitespace-nowrap" : meta?.align === "center" ? "text-center" : "",
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
              <Rosette slices={r.slices} size="sm" ticker={r.ticker} />
              <div className="min-w-0 flex-1">
                <p className="text-body">
                  <span className="font-semibold">{r.ticker}</span> <span className="text-fg-muted">{r.manager}</span>
                </p>
                <p className="tnum text-small text-fg-muted">
                  {r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"} · {r.assetClassLabel}
                </p>
              </div>
            </Link>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-label font-normal text-fg-muted">
              {SLICE_ORDER.map((s) => (
                <SliceDot key={s} color={r.slices[s].color} label={SHORT[s]} />
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
