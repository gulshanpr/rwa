"use client";

import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { useState } from "react";
import { AssetLogo } from "@/components/asset/asset-logo";
import { STAGE_NAMES, StageBadge } from "@/components/risk/stage-card";
import { formatUsd } from "@/lib/format";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Rating, type Tone } from "@/lib/framework/types";
import { ASSET_CLASSES, shortEntityName } from "@/lib/labels";
import type { AssetRow } from "@/lib/rows";
import { cn, RISK_DOT, RISK_WORD, ratingWord } from "@/lib/ui";

// The methodology's rating meanings, shortened to what the dots on a card show.
const MEANING: Record<Rating, string> = {
  green: "No known problem.",
  yellow: "A weakness worth knowing about.",
  red: "A serious problem: it can cause a loss or stop holders getting out.",
  unverified: "A fact isn't public, and it could make things worse.",
  "not-assessed": "Not rated yet.",
};

const TONE_RANK: Record<Tone, number> = { red: 0, yellow: 1, grey: 2, green: 3 };
const FLAG_ICON: Record<Tone, string> = {
  red: "text-risk-red",
  yellow: "text-risk-yellow",
  grey: "text-fg-subtle",
  green: "text-risk-green",
};

const caption = "text-label font-normal text-fg-subtle";

/**
 * The screener below md: one card per asset, each with the same labeled sections in the same places, so a
 * phone shows what each mark means and assets compare by position. A category no asset is rated on yet
 * (Legal Claim) is left out instead of adding a grey dot to every card.
 */
export function ScreenerCards({
  rows,
  allRows,
  order,
  isDefaultOrder,
  onClear,
}: {
  /** Filtered and sorted. */
  rows: AssetRow[];
  allRows: AssetRow[];
  /** How the list is sorted, e.g. "largest value first". */
  order: string;
  isDefaultOrder: boolean;
  /** Clears the filters behind the Filters button; undefined when none is on. */
  onClear?: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const categories = CATEGORY_ORDER.filter((c) => allRows.some((r) => r.categories[c].rating !== "not-assessed"));
  const unrated = CATEGORY_ORDER.filter((c) => !categories.includes(c));
  const legend: Rating[] = ["green", "yellow", "red", "unverified"];
  if (allRows.some((r) => categories.some((c) => r.categories[c].rating === "not-assessed")))
    legend.push("not-assessed");

  return (
    <div className="md:hidden">
      <div className="border-b border-line px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-small text-fg-muted">
            <span className="tnum font-medium text-fg">
              {rows.length === allRows.length ? rows.length : `${rows.length} of ${allRows.length}`}
            </span>{" "}
            {allRows.length === 1 ? "asset" : "assets"} · {order}
          </p>
          <button
            type="button"
            aria-expanded={helpOpen}
            aria-controls="screener-help"
            onClick={() => {
              if (!helpOpen) posthog.capture("screener_help_opened");
              setHelpOpen(!helpOpen);
            }}
            className="inline-flex shrink-0 items-center gap-1 py-1 text-small text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            How to read
            <ChevronDown className={cn("size-3.5 transition-transform", helpOpen && "rotate-180")} aria-hidden />
          </button>
        </div>

        {!helpOpen && (
          <ul
            aria-label="Rating colors"
            className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-label font-normal text-fg-muted"
          >
            {legend.map((r) => (
              <li key={r} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", RISK_DOT[r])} />
                {RISK_WORD[r]}
              </li>
            ))}
          </ul>
        )}

        {helpOpen && (
          <dl id="screener-help" className="mt-2.5 mb-1 space-y-3 rounded-control bg-page p-3 text-small">
            <div>
              <dt className="font-medium text-fg">Risk ratings</dt>
              <dd className="mt-0.5 text-fg-muted">
                Each risk is rated on its own. They don't add up to an overall score.
              </dd>
              <dd>
                <ul className="mt-2 space-y-1.5">
                  {legend.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span aria-hidden className={cn("mt-[5px] size-2.5 shrink-0 rounded-full", RISK_DOT[r])} />
                      <span className="text-fg-muted">
                        <span className="font-medium text-fg">{RISK_WORD[r]}</span> {MEANING[r]}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
              {unrated.length > 0 && (
                <dd className="mt-2 text-fg-muted">
                  {unrated.map((c) => CATEGORY_LABELS[c]).join(" and ")} {unrated.length === 1 ? "isn't" : "aren't"}{" "}
                  rated for any asset yet, so {unrated.length === 1 ? "it's" : "they're"} left out.
                </dd>
              )}
            </div>
            <div>
              <dt className="font-medium text-fg">Stage</dt>
              <dd className="mt-0.5 text-fg-muted">
                How much you have to trust the issuer, from Stage 0 ({STAGE_NAMES[0]}) to Stage 2 ({STAGE_NAMES[2]}). No
                stage means the minimum disclosure for Stage 0 isn't there yet.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Flags</dt>
              <dd className="mt-0.5 text-fg-muted">
                Specific issues found in the contracts, price feeds and lending markets, like a single key that can
                upgrade the token.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Value</dt>
              <dd className="mt-0.5 text-fg-muted">Assets under management.</dd>
            </div>
            {isDefaultOrder && (
              <div>
                <dt className="font-medium text-fg">Order</dt>
                <dd className="mt-0.5 text-fg-muted">Largest value first. It isn't a risk ranking.</dd>
              </div>
            )}
            <Link href="/methodology" className="inline-block text-accent hover:underline">
              How we rate assets →
            </Link>
          </dl>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-small text-fg-muted">
          <p>No assets match these filters.</p>
          {onClear && (
            <button type="button" onClick={onClear} className="mt-2 text-accent hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <AssetCard key={r.slug} row={r} categories={categories} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssetCard({ row: r, categories }: { row: AssetRow; categories: typeof CATEGORY_ORDER }) {
  const flags = [...r.flags].sort((a, b) => TONE_RANK[a.color] - TONE_RANK[b.color]);
  return (
    <li className="relative px-4 py-3.5 transition-colors hover:bg-page has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-accent">
      <div className="flex items-start gap-3">
        <AssetLogo slug={r.slug} ticker={r.ticker} size={32} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Stretched over the whole card, so a tap anywhere opens the asset. */}
            <Link
              href={`/assets/${r.slug}`}
              aria-label={`${r.ticker}, ${r.name}`}
              className="text-body font-semibold text-fg after:absolute after:inset-0 focus-visible:outline-none"
            >
              {r.ticker}
            </Link>
            <StageBadge stage={r.stage} />
          </p>
          <p className="mt-0.5 text-label font-normal text-fg-subtle">
            {shortEntityName(r.manager)} · {ASSET_CLASSES[r.assetClass].short}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="text-right">
            <p className="tnum text-body font-medium text-fg">{r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"}</p>
            <p className={cn("mt-0.5", caption)}>Value</p>
          </div>
          <ChevronRight className="mt-0.5 -mr-1 size-4 shrink-0 text-fg-subtle" aria-hidden />
        </div>
      </div>

      <p className={cn("mt-3", caption)}>Risk ratings</p>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-small text-fg-muted">
        {categories.map((c) => (
          <li key={c} className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", RISK_DOT[r.categories[c].rating])} />
            <span className="truncate">{CATEGORY_LABELS[c]}</span>
            <span className="sr-only">: {ratingWord(r.categories[c])}</span>
          </li>
        ))}
      </ul>

      <p className={cn("mt-3", caption)}>Flags</p>
      {flags.length === 0 ? (
        <p className="mt-1 text-small text-fg-muted">None</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-small text-fg-muted">
          {flags.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <TriangleAlert className={cn("mt-0.5 size-3.5 shrink-0", FLAG_ICON[f.color])} aria-hidden />
              {f.label}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
