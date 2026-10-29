"use client";

import { useState } from "react";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { formatPct, formatUsd, formatUsdFull } from "@/lib/format";
import type { Share } from "@/lib/rows";

type ShareDimension = "platform" | "issuer" | "class";

const DESCRIPTIONS: Record<ShareDimension, string> = {
  platform: "Tracked value by tokenization platform.",
  issuer: "Tracked value by issuer or fund manager.",
  class: "Tracked value by asset class.",
};

/** Past this many groups, the tail folds into "Other" so the list stays one screen tall. */
const MAX_ROWS = 7;

function fold(shares: Share[]): Share[] {
  if (shares.length <= MAX_ROWS + 1) return shares;
  const tail = shares.slice(MAX_ROWS);
  return [
    ...shares.slice(0, MAX_ROWS),
    {
      label: `Other (${tail.length})`,
      value: tail.reduce((s, x) => s + x.value, 0),
      tickers: tail.flatMap((x) => x.tickers),
    },
  ];
}

export function MarketShare({ data }: { data: Record<ShareDimension, Share[]> }) {
  const [dimension, setDimension] = useState<ShareDimension>("platform");
  const shares = fold(data[dimension]);
  const total = shares.reduce((s, x) => s + x.value, 0);
  const max = Math.max(...shares.map((x) => x.value), 1);

  return (
    <Card
      title="Market share"
      description={DESCRIPTIONS[dimension]}
      actions={
        <Segmented
          label="Group by"
          value={dimension}
          onChange={setDimension}
          options={[
            { value: "platform", label: "Platform" },
            { value: "issuer", label: "Issuer" },
            { value: "class", label: "Class" },
          ]}
        />
      }
    >
      <ul className="space-y-1">
        {shares.map((s) => (
          <li key={s.label}>
            <ChartTooltip
              content={
                <>
                  <p className="font-medium">{s.label}</p>
                  <p className="tnum mt-0.5 text-fg-muted" title={formatUsdFull(s.value)}>
                    {formatUsd(s.value)} · {total ? formatPct(s.value / total, 1) : "0%"} of tracked value
                  </p>
                  <p className="mt-1.5 text-fg-muted">{s.tickers.join(", ")}</p>
                </>
              }
            >
              <div
                tabIndex={0}
                aria-label={`${s.label}: ${formatUsd(s.value)}, ${total ? formatPct(s.value / total, 0) : "0%"} of tracked value. ${s.tickers.join(", ")}`}
                className="group grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-[3px] px-1.5 py-1.5 outline-none hover:bg-page focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="truncate text-small text-fg">{s.label}</span>
                <div className="h-2.5">
                  <div
                    className="h-full rounded-r-[4px] bg-accent transition-opacity group-hover:opacity-80"
                    style={{ width: `${(s.value / max) * 100}%` }}
                  />
                </div>
                <span className="tnum flex items-baseline gap-2 text-small">
                  <span className="text-fg">{formatUsd(s.value)}</span>
                  <span className="w-8 text-right text-label font-normal text-fg-subtle">
                    {total ? formatPct(s.value / total, 0) : "—"}
                  </span>
                </span>
              </div>
            </ChartTooltip>
          </li>
        ))}
      </ul>
    </Card>
  );
}
