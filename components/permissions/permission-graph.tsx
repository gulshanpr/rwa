"use client";

import { Graph, layout } from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Clock, FileCode2, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { shortAddress } from "@/lib/format";
import type { GraphEdge, GraphNode } from "@/lib/graph";
import { RISK_FILL } from "@/lib/ui";

const NODE_WIDTH = 230;
const MAX_SIGNERS = 3;

const ICONS = {
  eoa: KeyRound,
  signer: KeyRound,
  safe: Lock,
  timelock: Clock,
  "proxy-admin": ShieldCheck,
  contract: FileCode2,
  "contract-unknown": FileCode2,
};

function nodeHeight(n: GraphNode): number {
  const signerLines = n.signers ? Math.min(n.signers.length, MAX_SIGNERS) + (n.signers.length > MAX_SIGNERS ? 1 : 0) : 0;
  return 62 + (n.subtitle ? 0 : -2) + signerLines * 16 + (signerLines ? 8 : 0);
}

type FlowNode = Node<GraphNode, "account">;

function AccountNode({ data }: NodeProps<FlowNode>) {
  const Icon = ICONS[data.kind];
  const extra = data.signers ? data.signers.length - MAX_SIGNERS : 0;
  return (
    <div
      className="rounded-card border border-line-strong bg-surface px-3 py-2.5 shadow-card"
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-line-strong" />
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${data.kind === "eoa" ? "text-risk-red" : "text-fg-muted"}`} aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-small font-medium text-fg">{data.title}</p>
          {data.subtitle && <p className="truncate text-label font-normal text-fg-muted">{data.subtitle}</p>}
          <p className="font-mono text-[11px] text-fg-subtle">{shortAddress(data.address)}</p>
        </div>
      </div>
      {data.signers && (
        <ul className="mt-1.5 border-t border-line pt-1.5 font-mono text-[11px] leading-4 text-fg-muted">
          {data.signers.slice(0, MAX_SIGNERS).map((s) => (
            <li key={s}>├ {shortAddress(s)}</li>
          ))}
          {extra > 0 && <li className="font-sans">└ +{extra} more signers</li>}
        </ul>
      )}
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-line-strong" />
    </div>
  );
}

const nodeTypes = { account: AccountNode };
const ROOT = "__root__";

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): { nodes: FlowNode[]; edges: Edge[] } {
  const g = new Graph();
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 170, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(n) });
  for (const e of edges) g.setEdge(e.source, e.target);
  // A hidden root with heavy edges keeps every contract in the first column.
  g.setNode(ROOT, { width: 1, height: 1 });
  for (const n of nodes) if (n.kind === "contract") g.setEdge(ROOT, n.id, { weight: 100, minlen: 1 });
  layout(g);

  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id);
      return {
        id: n.id,
        type: "account",
        data: n,
        position: { x: p.x - NODE_WIDTH / 2, y: p.y - nodeHeight(n) / 2 },
        draggable: false,
        connectable: false,
      };
    }),
    edges: edges.map((e) => {
      const stroke = e.color === "grey" ? "var(--border-strong)" : RISK_FILL[e.color];
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        style: { stroke, strokeWidth: e.critical ? 2 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
        labelStyle: { fontSize: 11, fill: "var(--text-muted)" },
        labelBgStyle: { fill: "var(--surface)", stroke: "var(--border)" },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
      };
    }),
  };
}

export function PermissionGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const flow = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  return (
    <div className="h-[520px] w-full overflow-hidden rounded-control border border-line bg-page">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
