"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { formatPct, formatUsd } from "@/lib/format";
import type { SliceDistribution } from "@/lib/rows";
import type { SliceColor } from "@/lib/scoring/types";
import { cn, RISK_DOT, RISK_WORD } from "@/lib/ui";

const COLORS: SliceColor[] = ["green", "yellow", "red", "grey"];
const BAR: Record<SliceColor, string> = {
  green: "bg-risk-green",
  yellow: "bg-risk-yellow",
  red: "bg-risk-red",
  grey: "bg-[repeating-linear-gradient(45deg,var(--risk-grey-soft),var(--risk-grey-soft)_4px,var(--border-strong)_4px,var(--border-strong)_6px)]",
};

export function RiskOverview({ data }: { data: SliceDistribution[] }) {
  const [mode, setMode] = useState<"value" | "count">("value");

  return (
    <Card
      title="Risk overview"
      description="Share of tracked assets in each color, per slice."
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
          const total = COLORS.reduce((s, c) => s + values[c], 0);
          return (
            <li key={d.slice} className="grid grid-cols-[96px_1fr] items-center gap-3 md:grid-cols-[120px_1fr]">
              <span className="text-small text-fg-muted">{d.label}</span>
              <div className="flex h-5 overflow-hidden rounded-[6px] bg-subtle">
                {COLORS.filter((c) => values[c] > 0).map((c) => {
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
        {COLORS.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", RISK_DOT[c])} /> {RISK_WORD[c]}
          </span>
        ))}
      </div>
    </Card>
  );
}
