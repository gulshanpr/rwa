"use client";

import { useState } from "react";
import { CHAINS } from "@/lib/chains";
import type { Alert } from "@/lib/schema/live";
import { cn, RISK_DOT, SEVERITY_COLOR } from "@/lib/ui";
import { AlertCard } from "./alert-card";

const SEVERITIES: Alert["severity"][] = ["critical", "high", "medium", "low"];
const KIND_LABELS: Record<Alert["kind"], string> = {
  upgrade: "Upgrade",
  "admin-change": "Admin change",
  "role-grant": "Role granted",
  "role-revoke": "Role revoked",
  "ownership-transfer": "Ownership transfer",
  pause: "Pause",
  "safe-change": "Safe change",
  mint: "Large mint",
  burn: "Large burn",
  "oracle-stale": "Oracle stale",
};

function FilterGroup<T extends string>({
  title,
  options,
  selected,
  onToggle,
  render,
}: {
  title: string;
  options: T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  render: (v: T) => React.ReactNode;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-1.5 text-micro text-fg-subtle uppercase">{title}</legend>
      <div className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
        {options.map((o) => (
          <label
            key={o}
            className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1 text-small text-fg-muted hover:bg-subtle"
          >
            <input type="checkbox" checked={selected.has(o)} onChange={() => onToggle(o)} className="accent-[var(--accent)]" />
            {render(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function useSet<T>() {
  const [set, setSet] = useState<Set<T>>(new Set());
  const toggle = (v: T) =>
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  return [set, toggle] as const;
}

export function AlertsFeed({ alerts, tickers }: { alerts: Alert[]; tickers: Record<string, string> }) {
  const [severity, toggleSeverity] = useSet<Alert["severity"]>();
  const [asset, toggleAsset] = useSet<string>();
  const [chain, toggleChain] = useSet<Alert["chain"]>();
  const [kind, toggleKind] = useSet<Alert["kind"]>();

  const match = <T,>(set: Set<T>, v: T) => set.size === 0 || set.has(v);
  const shown = alerts.filter(
    (a) => match(severity, a.severity) && match(asset, a.asset) && match(chain, a.chain) && match(kind, a.kind),
  );
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card lg:sticky lg:top-24 lg:self-start">
        <FilterGroup
          title="Severity"
          options={SEVERITIES.filter((s) => alerts.some((a) => a.severity === s))}
          selected={severity}
          onToggle={toggleSeverity}
          render={(s) => (
            <span className="inline-flex items-center gap-1.5 capitalize">
              <span className={cn("size-2 rounded-full", RISK_DOT[SEVERITY_COLOR[s]])} /> {s}
            </span>
          )}
        />
        <FilterGroup
          title="Asset"
          options={uniq(alerts.map((a) => a.asset))}
          selected={asset}
          onToggle={toggleAsset}
          render={(s) => tickers[s] ?? s}
        />
        <FilterGroup
          title="Chain"
          options={uniq(alerts.map((a) => a.chain))}
          selected={chain}
          onToggle={toggleChain}
          render={(c) => CHAINS[c].name}
        />
        <FilterGroup
          title="Kind"
          options={uniq(alerts.map((a) => a.kind))}
          selected={kind}
          onToggle={toggleKind}
          render={(k) => KIND_LABELS[k]}
        />
      </aside>
      <div className="flex flex-col gap-3">
        {shown.length === 0 && (
          <p className="rounded-card border border-line bg-surface p-8 text-center text-small text-fg-muted">
            No alerts match these filters.
          </p>
        )}
        {shown.map((a) => (
          <AlertCard key={a.id} alert={a} ticker={tickers[a.asset] ?? a.asset.toUpperCase()} />
        ))}
      </div>
    </div>
  );
}
