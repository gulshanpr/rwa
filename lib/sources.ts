import { explorerAddress } from "./chains";
import type { AssetProfile } from "./profile";

export interface CitedSource {
  field: string;
  url?: string;
  tx?: string;
  note?: string;
  checkedAt?: string;
}

/** Asset page tabs, in display order. `null` is the overview. */
export type TabId =
  | "overview"
  | "underlying"
  | "counterparties"
  | "control"
  | "transparency"
  | "pricing"
  | "exit"
  | "legal"
  | "defi"
  | "history"
  | "sources";

const SECTION_TABS: Record<string, TabId> = {
  access: "overview",
  legal: "legal",
  freshnessClass: "transparency",
  underlying: "underlying",
  counterparties: "counterparties",
  control: "control",
  transparency: "transparency",
  pricing: "pricing",
  exit: "exit",
};

function humanize(path: string[]): string {
  return path
    .filter((p) => !/^\d+$/.test(p) && p !== "source" && p !== "value")
    .map((p) => p.replace(/([A-Z])/g, " $1").toLowerCase())
    .join(" › ");
}

function walk(value: unknown, path: string[], out: { path: string[]; source: CitedSource }[]) {
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (typeof obj.checkedAt === "string" && (obj.url || obj.tx)) {
    out.push({
      path,
      source: {
        field: humanize(path),
        url: obj.url as string | undefined,
        tx: obj.tx as string | undefined,
        note: obj.note as string | undefined,
        checkedAt: obj.checkedAt,
      },
    });
    return;
  }
  for (const [k, v] of Object.entries(obj)) walk(v, [...path, k], out);
}

export function collectSources(profile: AssetProfile): Partial<Record<TabId, CitedSource[]>> {
  const groups: Partial<Record<TabId, CitedSource[]>> = {};
  const push = (tab: TabId, s: CitedSource) => (groups[tab] ??= []).push(s);

  const curated: { path: string[]; source: CitedSource }[] = [];
  walk(profile.asset, [], curated);
  for (const c of curated) push(SECTION_TABS[c.path[0]] ?? "overview", c.source);

  if (profile.live) {
    push("overview", { field: "value (AUM)", url: profile.live.aum.source.url, note: profile.live.aum.source.name, checkedAt: profile.live.asOf.slice(0, 10) });
    push("defi", { field: "lending markets", url: profile.live.defiSource.url, note: profile.live.defiSource.name, checkedAt: profile.live.asOf.slice(0, 10) });
  }
  if (profile.measured) {
    const asOf = profile.measured.asOf.slice(0, 10);
    if (profile.measured.holders) push("exit", { field: "top holders", url: profile.measured.holders.source, note: "Top 10 wallets on Ethereum", checkedAt: asOf });
    push("exit", { field: "DEX sell quotes", url: profile.measured.dex.source, note: "$1M, $5M and $10M sells into USDC, against NAV", checkedAt: asOf });
  }
  for (const s of profile.snapshots) {
    for (const [address, c] of Object.entries(s.discovered.contracts)) {
      push("control", {
        field: `${c.name} contract`,
        url: explorerAddress(s.discovered.chain, address),
        note: `Read at block ${s.discovered.block}`,
        checkedAt: s.discovered.timestamp.slice(0, 10),
      });
    }
  }
  return groups;
}
