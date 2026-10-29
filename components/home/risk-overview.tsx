"use client";

import { Fragment, useState } from "react";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import type { Rating } from "@/lib/framework/types";
import { formatPct, formatUsd } from "@/lib/format";
import type { CategoryDistribution } from "@/lib/rows";
import { cn, RISK_DOT, RISK_WORD } from "@/lib/ui";

type Mode = "value" | "count";

const RATINGS: Rating[] = ["green", "yellow", "red", "unverified", "not-assessed"];
const BAR: Record<Rating, string> = {
  green: "bg-risk-green",
  yellow: "bg-risk-yellow",
  red: "bg-risk-red",
  unverified:
    "bg-[repeating-linear-gradient(45deg,var(--surface),var(--surface)_3px,var(--text-subtle)_3px,var(--text-subtle)_5px)]",
  "not-assessed":
    "bg-[repeating-linear-gradient(45deg,var(--risk-grey-soft),var(--risk-grey-soft)_4px,var(--border-strong)_4px,var(--border-strong)_6px)]",
};

const sum = (values: Record<Rating, number>) => RATINGS.reduce((s, r) => s + values[r], 0);
const assets = (n: number) => `${n} asset${n === 1 ? "" : "s"}`;

function Breakdown({ d, mode }: { d: CategoryDistribution; mode: Mode }) {
  const values = mode === "value" ? d.byValue : d.byCount;
  const total = sum(values);
  return (
    <>
      <p className="mb-2 font-medium">{d.label}</p>
      <ul className="space-y-1.5">
        {RATINGS.filter((r) => d.byCount[r] > 0).map((r) => (
          <li key={r} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", RISK_DOT[r])} />
            <span className="flex-1 pr-2 text-fg-muted">{RISK_WORD[r]}</span>
            <span className="tnum font-medium">
              {mode === "value" ? formatUsd(d.byValue[r]) : assets(d.byCount[r])}
            </span>
            <span className="tnum w-9 text-right text-fg-muted">{total ? formatPct(values[r] / total, 0) : "—"}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RiskOverview({ data }: { data: CategoryDistribution[] }) {
  const [mode, setMode] = useState<Mode>("value");

  return (
    <Card
      title="Risk overview"
      description={`Share of tracked ${mode === "value" ? "value" : "assets"} in each rating, per risk category.`}
      actions={
        <Segmented
          label="Measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "value", label: "By value" },
            { value: "count", label: "By count" },
          ]}
        />
      }
    >
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-3.5 md:grid-cols-[8.5rem_minmax(0,1fr)_3rem] md:gap-x-4">
        <span className="col-start-3 text-right text-label text-fg-subtle">Red</span>
        {data.map((d) => {
          const values = mode === "value" ? d.byValue : d.byCount;
          const total = sum(values);
          const assessed = d.byCount["not-assessed"] < sum(d.byCount);
          const summary = RATINGS.filter((r) => values[r] > 0)
            .map((r) => `${RISK_WORD[r]} ${formatPct(values[r] / total, 0)}`)
            .join(", ");
          return (
            <Fragment key={d.category}>
              <span className="truncate text-small text-fg-muted">{d.label}</span>
              <ChartTooltip content={<Breakdown d={d} mode={mode} />}>
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${summary}`}
                  className="flex h-4 gap-[2px] overflow-hidden rounded-[4px] ring-line-strong ring-offset-2 ring-offset-surface transition-shadow outline-none hover:ring-1 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {RATINGS.filter((r) => values[r] > 0).map((r) => (
                    <div key={r} className={cn("h-full", BAR[r])} style={{ flexGrow: values[r], flexBasis: 0 }} />
                  ))}
                </div>
              </ChartTooltip>
              <span className={cn("tnum text-right text-small", assessed ? "text-fg" : "text-fg-subtle")}>
                {assessed && total ? formatPct(values.red / total, 0) : "—"}
              </span>
            </Fragment>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-label font-normal text-fg-muted">
        {RATINGS.map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2.5 w-3.5 rounded-[2px]", BAR[r])} /> {RISK_WORD[r]}
          </span>
        ))}
      </div>
    </Card>
  );
}
