import type { AddressKind } from "@/components/data/address-chip";
import { formatDuration } from "./format";
import { addressLabel, type AssetProfile } from "./profile";
import type { Chain } from "./schema/asset";
import { holderLabel, POWER_LABELS, type PowerRow } from "./framework/permissions";
import type { Tone } from "./framework/types";

export type GraphNode = {
  id: string;
  kind: AddressKind;
  title: string;
  subtitle: string;
  address: string;
  signers?: string[];
};

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  color: Tone;
  critical: boolean;
}

export interface AccountRow {
  address: string;
  kind: AddressKind;
  label: string;
  detail: string;
  powers: string[];
  signers: string[];
}

const id = (a: string) => a.toLowerCase();

const TONE_RANK: Record<Tone, number> = { grey: 0, green: 1, yellow: 2, red: 3 };
const worstTone = (tones: Tone[]): Tone => tones.reduce<Tone>((w, t) => (TONE_RANK[t] > TONE_RANK[w] ? t : w), "grey");

export function buildControlGraph(profile: AssetProfile, chain: Chain) {
  const snapshot = profile.snapshots.find((s) => s.discovered.chain === chain);
  if (!snapshot) return { nodes: [], edges: [], accounts: [] };
  const d = snapshot.discovered;
  const rows = profile.powers.filter((r) => r.chain === chain);

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge & { rows: PowerRow[] }>();
  const accounts = new Map<string, AccountRow>();

  const ensureHolder = (address: string) => {
    const key = id(address);
    if (nodes.has(key)) return key;
    const holder = Object.entries(d.holders).find(([k]) => id(k) === key)?.[1];
    const kind: AddressKind = holder?.kind ?? "contract-unknown";
    const label = addressLabel(profile, address);
    let detail = holderLabel(holder);
    let signers: string[] = [];
    if (holder?.kind === "safe") {
      signers = holder.owners;
      detail = `Safe ${holder.threshold}/${holder.owners.length}${holder.modules.length ? ` · ${holder.modules.length} module(s)` : ""}`;
    }
    if (holder?.kind === "timelock") detail = `Timelock · ${formatDuration(holder.minDelaySeconds)} delay`;
    nodes.set(key, {
      id: key,
      kind,
      title: label ?? holderLabel(holder),
      subtitle: label ? detail : "",
      address,
      signers: signers.length ? signers : undefined,
    });
    accounts.set(key, { address, kind, label: label ?? holderLabel(holder), detail, powers: [], signers });

    if (holder?.kind === "proxy-admin") {
      const owner = ensureHolder(holder.owner);
      edges.set(`${key}->${owner}`, { id: `${key}->${owner}`, source: key, target: owner, label: "owner", color: "grey", critical: false, rows: [] });
    }
    if (holder?.kind === "timelock") {
      for (const p of holder.proposers) {
        const proposer = ensureHolder(p);
        edges.set(`${key}->${proposer}`, { id: `${key}->${proposer}`, source: key, target: proposer, label: "proposer", color: "grey", critical: false, rows: [] });
      }
    }
    if (holder?.kind === "contract") {
      for (const c of holder.controllers) {
        if (c.toLowerCase() === address.toLowerCase()) continue;
        const controller = ensureHolder(c);
        edges.set(`${key}->${controller}`, { id: `${key}->${controller}`, source: key, target: controller, label: "controlled by", color: "grey", critical: false, rows: [] });
      }
    }
    return key;
  };

  for (const [address, c] of Object.entries(d.contracts)) {
    if (c.role === "proxy-admin") continue;
    const key = id(address);
    const proxy = c.proxy ? `${c.proxy.type.toUpperCase()} proxy` : "Not a proxy";
    nodes.set(key, {
      id: key,
      kind: "contract",
      title: c.role === "token" ? `${profile.asset.ticker} token` : c.name,
      subtitle: c.role === "token" ? `${c.name} · ${proxy}` : `Service · ${c.verified ? "verified" : "unverified"}`,
      address,
    });
    accounts.set(key, {
      address,
      kind: "contract",
      label: c.role === "token" ? `${profile.asset.ticker} token (${c.name})` : c.name,
      detail: [proxy, c.proxy ? `impl ${c.proxy.implementation.slice(0, 6)}…${c.proxy.implementation.slice(-4)}` : null, c.verified ? "verified" : "unverified"]
        .filter(Boolean)
        .join(" · "),
      powers: [],
      signers: [],
    });
  }

  for (const row of rows) {
    const source = id(row.contract);
    const target = ensureHolder(row.holder.address);
    const key = `${source}->${target}`;
    const existing = edges.get(key);
    if (existing) existing.rows.push(row);
    else edges.set(key, { id: key, source, target, label: "", color: "grey", critical: false, rows: [row] });
    accounts.get(target)?.powers.push(POWER_LABELS[row.power]);
  }

  const edgeList: GraphEdge[] = [...edges.values()].map(({ rows: r, ...e }) =>
    r.length === 0
      ? e
      : {
          ...e,
          label: [...new Set(r.map((x) => POWER_LABELS[x.power].toLowerCase()))].join(", "),
          color: worstTone(r.map((x) => x.color)),
          critical: r.some((x) => x.criticality === "critical"),
        },
  );

  return { nodes: [...nodes.values()], edges: edgeList, accounts: [...accounts.values()] };
}
