"use client";

import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import posthog from "posthog-js";
import { CHAINS } from "@/lib/chains";
import { formatDate } from "@/lib/format";
import type { Alert } from "@/lib/schema/live";
import { cn, RISK_DOT, SEVERITY_COLOR } from "@/lib/ui";
import { AlertCard, KIND_LABELS } from "./alert-card";

const SEVERITIES: Alert["severity"][] = ["critical", "high", "medium", "low"];
const PAGE_SIZES = [10, 20, 50];

type AlertChain = NonNullable<Alert["chain"]>;

const controlClass =
  "inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

/** Dropdown of checkboxes; the trigger shows how many are picked. */
function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
  onClear,
  render,
}: {
  label: string;
  options: T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
  render: (v: T) => React.ReactNode;
}) {
  if (options.length === 0) return null;
  return (
    <Popover.Root>
      <Popover.Trigger className={cn(controlClass, selected.size > 0 && "border-accent/40 bg-accent-soft text-accent hover:text-accent")}>
        {label}
        {selected.size > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 text-white">{selected.size}</span>}
        <ChevronDown className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 flex max-h-80 w-56 flex-col rounded-control border border-line bg-surface shadow-popover"
        >
          <div className="overflow-y-auto p-1.5">
            {options.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-small text-fg hover:bg-subtle">
                <input type="checkbox" checked={selected.has(o)} onChange={() => onToggle(o)} className="accent-[var(--accent)]" />
                {render(o)}
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <button type="button" onClick={onClear} className="border-t border-line px-3.5 py-2 text-left text-small text-fg-muted hover:text-fg">
              Clear {label.toLowerCase()}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Page numbers with gaps: 1 … 4 5 6 … 12. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : "gap");
    out.push(p);
  });
  return out;
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const step = "inline-flex size-8 items-center justify-center rounded-control text-small";
  return (
    <nav aria-label="Alert pages" className="flex items-center justify-between gap-2 sm:justify-center">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className={cn(controlClass, "disabled:pointer-events-none disabled:opacity-40")}
      >
        <ChevronLeft className="size-4" aria-hidden /> Prev
      </button>
      <span className="text-small text-fg-muted sm:hidden">
        Page {page} of {pages}
      </span>
      <ul className="hidden items-center gap-1 sm:flex">
        {pageList(page, pages).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} className={cn(step, "text-fg-subtle")} aria-hidden>
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={cn(step, p === page ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-subtle hover:text-fg")}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pages}
        className={cn(controlClass, "disabled:pointer-events-none disabled:opacity-40")}
      >
        Next <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}

export function AlertsFeed({ alerts, tickers }: { alerts: Alert[]; tickers: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Set<Alert["severity"]>>(new Set());
  const [asset, setAsset] = useState<Set<string>>(new Set());
  const [chain, setChain] = useState<Set<AlertChain>>(new Set());
  const [kind, setKind] = useState<Set<Alert["kind"]>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const listRef = useRef<HTMLDivElement>(null);

  // Any filter change goes back to the first page.
  const toggler =
    <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, filterType: "severity" | "asset" | "chain" | "kind") =>
    (v: T) => {
      set((prev) => {
        const next = new Set(prev);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        return next;
      });
      setPage(1);
      posthog.capture("alerts_filter_changed", { filter_type: filterType });
    };
  const clearer =
    <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, filterType: "asset" | "chain" | "kind") =>
    () => {
      set(new Set());
      setPage(1);
      posthog.capture("alerts_filter_changed", { filter_type: filterType, action: "cleared" });
    };
  const clearAll = () => {
    setQuery("");
    setSeverity(new Set());
    setAsset(new Set());
    setChain(new Set());
    setKind(new Set());
    setPage(1);
    posthog.capture("alerts_filter_changed", { filter_type: "all", action: "cleared" });
  };

  const ticker = (slug: string) => tickers[slug] ?? slug.toUpperCase();
  const match = <T,>(set: Set<T>, v: T | undefined) => set.size === 0 || (v !== undefined && set.has(v));
  const q = query.trim().toLowerCase();
  const matchesQuery = (a: Alert) =>
    !q || a.title.toLowerCase().includes(q) || a.consequence.toLowerCase().includes(q) || ticker(a.asset).toLowerCase().includes(q);
  // Severity counts ignore the severity filter itself, so the chips show what each one would add.
  const base = alerts.filter((a) => matchesQuery(a) && match(asset, a.asset) && match(chain, a.chain) && match(kind, a.kind));
  const shown = base.filter((a) => match(severity, a.severity));

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const pageItems = shown.slice(start, start + pageSize);

  const groups: { day: string; items: Alert[] }[] = [];
  for (const a of pageItems) {
    const day = a.publishedAt.slice(0, 10);
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(a);
    else groups.push({ day, items: [a] });
  }

  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const assets = uniq(alerts.map((a) => a.asset)).sort((a, b) => ticker(a).localeCompare(ticker(b)));
  const chains = uniq(alerts.flatMap((a) => (a.chain ? [a.chain] : [])));
  const kinds = uniq(alerts.map((a) => a.kind)).sort((a, b) => KIND_LABELS[a].localeCompare(KIND_LABELS[b]));
  const active = (q ? 1 : 0) + severity.size + asset.size + chain.size + kind.size;

  const goTo = (p: number) => {
    setPage(p);
    posthog.capture("alerts_page_changed", { page: p });
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card md:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block lg:w-72">
            <span className="sr-only">Search alerts</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search title, effect or ticker"
              className="h-8 w-full rounded-control border border-line bg-surface pr-2.5 pl-8 text-small text-fg placeholder:text-fg-subtle hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          {/* Scrolls sideways on narrow screens instead of wrapping into a tall block. */}
          <div role="group" aria-label="Severity" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 md:mx-0 md:px-0">
            {SEVERITIES.map((s) => {
              const count = base.filter((a) => a.severity === s).length;
              const on = severity.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggler(setSeverity, "severity")(s)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small capitalize transition-colors",
                    on ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  <span className={cn("size-2 rounded-full", RISK_DOT[SEVERITY_COLOR[s]])} aria-hidden />
                  {s}
                  <span className={cn("tnum text-label font-normal", on ? "text-accent" : "text-fg-subtle")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect label="Asset" options={assets} selected={asset} onToggle={toggler(setAsset, "asset")} onClear={clearer(setAsset, "asset")} render={ticker} />
          <MultiSelect
            label="Chain"
            options={chains}
            selected={chain}
            onToggle={toggler(setChain, "chain")}
            onClear={clearer(setChain, "chain")}
            render={(c) => CHAINS[c].name}
          />
          <MultiSelect
            label="Kind"
            options={kinds}
            selected={kind}
            onToggle={toggler(setKind, "kind")}
            onClear={clearer(setKind, "kind")}
            render={(k) => KIND_LABELS[k]}
          />
          {active > 0 && (
            <button type="button" onClick={clearAll} className="inline-flex h-8 items-center gap-1 px-1.5 text-small text-fg-muted hover:text-fg">
              <X className="size-3.5" aria-hidden /> Clear all
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex scroll-mt-[calc(var(--topbar-h)+2rem)] items-center justify-between gap-3 text-small text-fg-muted">
        <p aria-live="polite">
          {shown.length === 0 ? (
            "No alerts"
          ) : (
            <>
              <span className="tnum text-fg">
                {start + 1}–{start + pageItems.length}
              </span>{" "}
              of <span className="tnum text-fg">{shown.length}</span> alerts
              {shown.length !== alerts.length && <span className="hidden sm:inline"> (filtered from {alerts.length})</span>}
            </>
          )}
        </p>
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Per page</span>
          <select
            aria-label="Alerts per page"
            value={pageSize}
            onChange={(e) => {
              const value = Number(e.target.value);
              setPageSize(value);
              setPage(1);
              posthog.capture("alerts_page_changed", { page_size: value });
            }}
            className="h-8 rounded-control border border-line bg-surface px-2 text-small text-fg-muted hover:border-line-strong"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center text-small text-fg-muted">
          {alerts.length === 0 ? (
            "No alerts yet."
          ) : (
            <>
              No alerts match these filters.{" "}
              <button type="button" onClick={clearAll} className="text-accent hover:underline">
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.day} aria-label={formatDate(g.day)}>
              <h2 className="mb-2 flex items-center gap-3 text-label font-medium text-fg-subtle">
                {formatDate(g.day)}
                <span className="h-px flex-1 bg-line" aria-hidden />
                <span className="font-normal">{g.items.length}</span>
              </h2>
              <div className="flex flex-col gap-2.5">
                {g.items.map((a) => (
                  <AlertCard key={a.id} alert={a} ticker={ticker(a.asset)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Pagination page={current} pages={pages} onChange={goTo} />
    </div>
  );
}
