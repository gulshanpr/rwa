"use client";

import { useEffect, useState } from "react";
import { AddressChip } from "@/components/data/address-chip";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { AccountRow, GraphEdge, GraphNode } from "@/lib/graph";
import { PermissionGraph } from "./permission-graph";

type View = "graph" | "table";

export function ControlExplorer({
  ticker,
  chainName,
  nodes,
  edges,
  accounts,
}: {
  ticker: string;
  chainName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  accounts: AccountRow[];
}) {
  const [view, setView] = useState<View>("graph");

  useEffect(() => {
    // The graph is too dense to read on a phone; start there on the table instead.
    if (window.matchMedia("(max-width: 767px)").matches) setView("table");
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith("addr-")) return;
      setView("table");
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "center" }));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <Card
      title={`Who controls ${ticker} on ${chainName}`}
      description="Token and service contracts on the left, the accounts holding their powers on the right. Edge color is the risk status of that power."
      actions={
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "graph", label: "Graph" },
            { value: "table", label: "Table" },
          ]}
        />
      }
    >
      {view === "graph" ? (
        <PermissionGraph nodes={nodes} edges={edges} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Type</Th>
              <Th>Powers held</Th>
              <Th>Signers</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <Tr key={a.address} id={`addr-${a.address.toLowerCase()}`}>
                <Td>
                  <AddressChip address={a.address} kind={a.kind} label={a.label} />
                </Td>
                <Td className="text-fg-muted">{a.detail}</Td>
                <Td className="min-w-48 text-fg-muted">{a.powers.length ? [...new Set(a.powers)].join(", ") : "—"}</Td>
                <Td>
                  {a.signers.length ? (
                    <details>
                      <summary className="cursor-pointer text-accent">{a.signers.length} signers</summary>
                      <ul className="mt-1 space-y-1">
                        {a.signers.map((s) => (
                          <li key={s}>
                            <AddressChip address={s} kind="signer" />
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
