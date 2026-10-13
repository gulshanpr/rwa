import type { Discovered, Holder, Power } from "../schema/discovered";
import type { Chain } from "../schema/asset";
import { formatDelay, formatDuration } from "../format";
import { sliceFromReasons, type Reason, type SliceColor, type SliceResult } from "./types";

export const SEVEN_DAYS = 7 * 86400;

export const CRITICAL_POWERS: Power[] = ["upgrade", "mint", "force-transfer", "burn-from", "set-price", "allocate", "admin"];
export const HIGH_POWERS: Power[] = ["freeze", "pause", "set-compliance"];

export type Criticality = "critical" | "high" | "unclassified";

export function criticalityOf(power: Power): Criticality {
  if (CRITICAL_POWERS.includes(power)) return "critical";
  if (HIGH_POWERS.includes(power)) return "high";
  return "unclassified";
}

export const POWER_LABELS: Record<Power, string> = {
  upgrade: "Upgrade",
  mint: "Mint",
  "force-transfer": "Force-transfer",
  "burn-from": "Burn from holder",
  "set-price": "Set price",
  allocate: "Allocate funds",
  freeze: "Freeze",
  pause: "Pause",
  "set-compliance": "Set compliance",
  admin: "Grant roles",
  unclassified: "Unclassified",
};

function powerVerb(power: Power, ticker: string): string {
  switch (power) {
    case "upgrade":
      return "replace the token's code";
    case "mint":
      return `create new ${ticker} tokens`;
    case "force-transfer":
      return "move tokens out of any holder's wallet";
    case "burn-from":
      return "destroy tokens in any holder's wallet";
    case "set-price":
      return "change the onchain price or NAV";
    case "allocate":
      return "lend out or move the assets backing the token";
    case "freeze":
      return "freeze a specific holder's tokens";
    case "pause":
      return "pause all transfers";
    case "set-compliance":
      return "change who is allowed to hold the token";
    case "admin":
      return "grant or revoke every other role";
    case "unclassified":
      return "call an unreviewed privileged function";
  }
}

export type HolderClass = "eoa" | "strong-safe" | "weak-safe" | "unknown";

export interface HolderStep {
  address: string;
  kind: Holder["kind"];
  label: string;
}

export interface ResolvedHolder {
  address: string;
  holderClass: HolderClass;
  delaySeconds: number;
  safe?: { threshold: number; owners: number };
  modulesEnabled: boolean;
  /** From the direct holder down to the account that ultimately signs. */
  path: HolderStep[];
}

const CLASS_RANK: Record<HolderClass, number> = { "strong-safe": 1, "weak-safe": 2, eoa: 3, unknown: 3 };

export function isStrongSafe(threshold: number, owners: number): boolean {
  return threshold >= 3 && threshold / owners >= 0.5;
}

export function holderLabel(holder: Holder | undefined): string {
  if (!holder) return "Unknown contract";
  switch (holder.kind) {
    case "eoa":
      return "EOA";
    case "safe":
      return `Safe ${holder.threshold}/${holder.owners.length}`;
    case "timelock":
      return `Timelock ${formatDuration(holder.minDelaySeconds)}`;
    case "proxy-admin":
      return "ProxyAdmin";
    case "contract":
      return holder.name;
    case "contract-unknown":
      return "Unknown contract";
  }
}

export function lookupHolder(discovered: Discovered, address: string): Holder | undefined {
  const key = Object.keys(discovered.holders).find((k) => k.toLowerCase() === address.toLowerCase());
  return key ? discovered.holders[key] : undefined;
}

export function resolveHolder(discovered: Discovered, address: string, depth = 0, visited = new Set<string>()): ResolvedHolder {
  const holder = lookupHolder(discovered, address);
  visited.add(address.toLowerCase());
  const step: HolderStep = { address, kind: holder?.kind ?? "contract-unknown", label: holderLabel(holder) };
  const unknown: ResolvedHolder = {
    address,
    holderClass: "unknown",
    delaySeconds: 0,
    modulesEnabled: false,
    path: [step],
  };
  if (!holder || depth > 4) return unknown;

  switch (holder.kind) {
    case "eoa":
      return { ...unknown, holderClass: "eoa" };
    case "contract-unknown":
      return unknown;
    case "safe":
      return {
        address,
        holderClass: isStrongSafe(holder.threshold, holder.owners.length) ? "strong-safe" : "weak-safe",
        delaySeconds: 0,
        safe: { threshold: holder.threshold, owners: holder.owners.length },
        modulesEnabled: holder.modules.length > 0,
        path: [step],
      };
    case "proxy-admin": {
      const inner = resolveHolder(discovered, holder.owner, depth + 1, visited);
      return { ...inner, address, path: [step, ...inner.path] };
    }
    case "contract": {
      const controllers = holder.controllers.filter((c) => !visited.has(c.toLowerCase()));
      if (controllers.length === 0) return unknown;
      const worst = controllers
        .map((c) => resolveHolder(discovered, c, depth + 1, new Set(visited)))
        .reduce((a, b) => (CLASS_RANK[b.holderClass] > CLASS_RANK[a.holderClass] ? b : a));
      return { ...worst, address, path: [step, ...worst.path] };
    }
    case "timelock": {
      const worst = holder.proposers
        .map((p) => resolveHolder(discovered, p, depth + 1, visited))
        .reduce((a, b) => (CLASS_RANK[b.holderClass] > CLASS_RANK[a.holderClass] ? b : a));
      return {
        ...worst,
        address,
        delaySeconds: holder.minDelaySeconds + worst.delaySeconds,
        path: [step, ...worst.path],
      };
    }
  }
}

export interface PowerRow {
  id: string;
  chain: Chain;
  contract: string;
  contractName: string;
  power: Power;
  criticality: Criticality;
  via: string;
  holder: ResolvedHolder;
  checks: string;
  color: SliceColor;
  reasonKey?: string;
}

function evaluate(power: Power, h: ResolvedHolder): { color: SliceColor; key?: string } {
  const criticality = criticalityOf(power);
  if (criticality === "unclassified") return { color: "grey" };
  const singleKey = h.holderClass === "eoa" || h.holderClass === "unknown";

  if (criticality === "critical") {
    if (singleKey) return { color: "red", key: "eoa" };
    if (h.holderClass === "weak-safe" && h.delaySeconds === 0) return { color: "red", key: "weak-safe" };
    if (power === "upgrade") {
      if (h.delaySeconds === 0) return { color: "yellow", key: "no-delay" };
      if (h.delaySeconds < SEVEN_DAYS) return { color: "yellow", key: "short-delay" };
      if (h.holderClass !== "strong-safe") return { color: "yellow", key: "weak-safe-timelock" };
      return { color: "green" };
    }
    if (h.delaySeconds === 0) return { color: "yellow", key: "no-delay" };
    return { color: "green" };
  }

  if (singleKey) return { color: "yellow", key: "eoa" };
  return { color: "green" };
}

function checksText(power: Power, h: ResolvedHolder): string {
  if (criticalityOf(power) === "unclassified") return "Needs review";
  if (h.holderClass === "eoa" || h.holderClass === "unknown") return "None";
  if (h.delaySeconds > 0) return `${formatDelay(h.delaySeconds)} delay`;
  return "No delay";
}

export function analyzePowers(snapshots: Discovered[]): PowerRow[] {
  const rows: PowerRow[] = [];
  for (const d of snapshots) {
    for (const [contract, c] of Object.entries(d.contracts)) {
      c.permissions.forEach((p, i) => {
        const holder = resolveHolder(d, p.holder);
        const { color, key } = evaluate(p.power, holder);
        rows.push({
          id: `${d.chain}-${contract}-${i}`,
          chain: d.chain,
          contract,
          contractName: c.name,
          power: p.power,
          criticality: criticalityOf(p.power),
          via: p.via,
          holder,
          checks: checksText(p.power, holder),
          color,
          reasonKey: key,
        });
      });
    }
  }
  const order = [...CRITICAL_POWERS, ...HIGH_POWERS, "unclassified"];
  // Within a power, the weakest holder first, so it leads the reasons.
  const colors = ["red", "yellow", "green"];
  const keys = ["eoa", "weak-safe", "no-delay", "short-delay", "weak-safe-timelock"];
  const keyRank = (k?: string) => (k && keys.includes(k) ? keys.indexOf(k) : keys.length);
  return rows.sort(
    (a, b) => order.indexOf(a.power) - order.indexOf(b.power) || colors.indexOf(a.color) - colors.indexOf(b.color) || keyRank(a.reasonKey) - keyRank(b.reasonKey),
  );
}

function reasonText(row: PowerRow, ticker: string): string {
  const verb = powerVerb(row.power, ticker);
  const s = row.holder.safe;
  const multisig = s ? `A ${s.threshold}-of-${s.owners} multisig` : "A multisig";
  switch (row.reasonKey) {
    case "eoa":
      return `A single key can ${verb}.`;
    case "weak-safe":
      return `${multisig} can ${verb} with no delay.`;
    case "no-delay":
      return row.power === "upgrade"
        ? "Upgrades take effect immediately (no timelock)."
        : `${multisig} can ${verb} with no delay.`;
    case "short-delay":
      return `Upgrades have only a ${formatDelay(row.holder.delaySeconds)} delay, less than 7 days to react.`;
    case "weak-safe-timelock":
      return `Upgrades are timelocked but controlled by ${multisig.toLowerCase()} below our strength bar.`;
    default:
      return `${multisig} can ${verb}.`;
  }
}

export function scoreControl(rows: PowerRow[], ticker: string): SliceResult {
  const reasons = new Map<string, Reason>();
  for (const row of rows) {
    if (row.color === "red" || row.color === "yellow") {
      const id = `control.${row.reasonKey}.${row.power}`;
      if (!reasons.has(id)) {
        reasons.set(id, {
          id,
          slice: "control",
          color: row.color,
          text: reasonText(row, ticker),
          critical: row.criticality === "critical",
          evidence: { tab: "control", anchor: `power-${row.id}`, label: `${POWER_LABELS[row.power]} power` },
        });
      }
    }
    if (row.holder.modulesEnabled) {
      const id = `control.safe-modules.${row.holder.address}`;
      reasons.set(id, {
        id,
        slice: "control",
        color: "yellow",
        text: "A Safe module can act without the signers' approval.",
        critical: row.criticality === "critical",
        evidence: { tab: "control", anchor: `power-${row.id}`, label: "Safe modules" },
      });
    }
  }
  return sliceFromReasons(
    "control",
    [...reasons.values()],
    "Critical powers are timelocked and held by strong multisigs.",
  );
}
