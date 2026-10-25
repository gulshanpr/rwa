"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import type { Rating } from "@/lib/framework/types";
import { formatPct, formatUsd } from "@/lib/format";
import type { CategoryDistribution } from "@/lib/rows";
import { cn, RISK_DOT, RISK_WORD } from "@/lib/ui";

const RATINGS: Rating[] = ["green", "yellow", "red", "unverified", "not-assessed"];
const BAR: Record<Rating, string> = {
  green: "bg-risk-green",
  yellow: "bg-risk-yellow",
  red: "bg-risk-red",
  unverified: "bg-[repeating-linear-gradient(45deg,var(--surface),var(--surface)_3px,var(--text-subtle)_3px,var(--text-subtle)_5px)]",
  "not-assessed": "bg-[repeating-linear-gradient(45deg,var(--risk-grey-soft),var(--risk-grey-soft)_4px,var(--border-strong)_4px,var(--border-strong)_6px)]",
};

export function RiskOverview({ data }: { data: CategoryDistribution[] }) {
  const [mode, setMode] = useState<"value" | "count">("value");

  return (
    <Card
      title="Risk overview"
      description="Share of tracked assets in each rating, per risk category."
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
      <ul className="space-y-3">
        {data.map((d) => {
          const values = mode === "value" ? d.byValue : d.byCount;
          const total = RATINGS.reduce((s, c) => s + values[c], 0);
          return (
            <li key={d.category} className="grid grid-cols-[112px_1fr] items-center gap-3 md:grid-cols-[132px_1fr]">
              <span className="text-small text-fg-muted">{d.label}</span>
              <div className="flex h-5 overflow-hidden rounded-[6px] bg-subtle">
                {RATINGS.filter((c) => values[c] > 0).map((c) => {
                  const share = total ? values[c] / total : 0;
                  const amount = mode === "value" ? formatUsd(values[c]) : `${values[c]} asset${values[c] === 1 ? "" : "s"}`;
                  return (
                    <div
                      key={c}
                      title={`${RISK_WORD[c]}: ${amount} (${formatPct(share, 0)})`}
                      className={cn("h-full border-r-2 border-surface last:border-r-0", BAR[c])}
                      style={{ width: `${share * 100}%` }}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-4 text-label font-normal text-fg-muted">
        {RATINGS.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", RISK_DOT[c])} /> {RISK_WORD[c]}
          </span>
        ))}
      </div>
    </Card>
  );
}
