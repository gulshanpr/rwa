"use client";

import Link from "next/link";
import { useState } from "react";
import { Rosette } from "@/components/risk/rosette";
import { SliceDot } from "@/components/risk/slice-dot";
import { StageBadge } from "@/components/risk/stage-badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { formatUsd } from "@/lib/format";
import type { AssetRow } from "@/lib/rows";
import type { SliceId } from "@/lib/scoring/types";

type Filter = "us-treasuries" | "private-credit" | "all";
const DOT_SLICES: { id: SliceId; label: string }[] = [
  { id: "control", label: "Ctrl" },
  { id: "exit-window", label: "Window" },
  { id: "pricing", label: "NAV" },
  { id: "verification", label: "Resv" },
  { id: "exit", label: "Redeem" },
  { id: "disclosure", label: "Discl" },
];

export function AssetsTable({ rows }: { rows: AssetRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) => filter === "all" || r.assetClass === filter);

  return (
    <Card
      title="Assets"
      actions={
        <Segmented
          label="Asset class"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "us-treasuries", label: "Treasuries" },
            { value: "private-credit", label: "Credit" },
            { value: "all", label: "All" },
          ]}
        />
      }
    >
      <Table>
        <thead>
          <tr>
            <Th align="right">#</Th>
            <Th>Asset</Th>
            <Th>Issuer</Th>
            <Th align="right">Value</Th>
            <Th align="center">Rosette</Th>
            <Th>Stage</Th>
            {DOT_SLICES.map((s) => (
              <Th key={s.id} align="center">
                {s.label}
              </Th>
            ))}
            <Th>Flags</Th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <Td colSpan={13} className="py-8 text-center text-fg-muted">
                No assets in this class yet. The v1 list of 20 is being added one by one.
              </Td>
            </tr>
          )}
          {shown.map((r, i) => (
            <Tr key={r.slug}>
              <Td align="right" className="text-fg-subtle">
                {i + 1}
              </Td>
              <Td>
                <Link href={`/assets/${r.slug}`} className="group block min-w-48">
                  <span className="font-semibold text-fg group-hover:text-accent">{r.ticker}</span>{" "}
                  <span className="text-fg-muted">{r.name}</span>
                </Link>
              </Td>
              <Td className="whitespace-nowrap text-fg-muted">{r.manager}</Td>
              <Td align="right">{r.aumUsd !== null ? formatUsd(r.aumUsd) : "—"}</Td>
              <Td align="center">
                <span className="inline-flex">
                  <Rosette slices={r.slices} size="sm" ticker={r.ticker} />
                </span>
              </Td>
              <Td>
                <StageBadge stage={r.stage} compact />
              </Td>
              {DOT_SLICES.map((s) => (
                <Td key={s.id} align="center">
                  <span title={r.slices[s.id].headline}>
                    <SliceDot color={r.slices[s.id].color} />
                  </span>
                </Td>
              ))}
              <Td>
                <div className="flex flex-wrap gap-1">
                  {r.flags
                    .filter((f) => f.color !== "grey")
                    .map((f) => (
                      <Tag key={f.id} variant={`risk-${f.color}`}>
                        {f.label}
                      </Tag>
                    ))}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
