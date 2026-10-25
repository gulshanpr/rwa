import type { Chain } from "../schema/asset";
import type { Discovered, Holder, Power } from "../schema/discovered";
import { formatDelay, formatDuration } from "../format";
import type { Tone } from "./types";

// Who holds each privileged power, resolved through proxy admins, timelocks and controlling contracts
// down to the account that signs. Control (control.ts) rates the result.

export const CRITICAL_POWERS: Power[] = ["upgrade", "mint", "force-transfer", "burn-from", "set-price", "allocate", "admin"];
export const HIGH_POWERS: Power[] = ["freeze", "pause", "set-compliance"];
/** Red when a single key holds them (framework §4: "a single key can mint, freeze or upgrade"). */
export const SINGLE_KEY_RED: Power[] = [...CRITICAL_POWERS, "freeze"];

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

export const POWER_VERBS: Record<Power, string> = {
  upgrade: "replace the contract code",
  mint: "create new tokens",
  "force-transfer": "move tokens out of any wallet",
  "burn-from": "destroy tokens in any wallet",
  "set-price": "change the onchain price",
  allocate: "move the assets backing the token",
  admin: "grant or revoke every other role",
  freeze: "freeze a holder's tokens",
  pause: "pause all transfers",
  "set-compliance": "change who may hold the token",
  unclassified: "call an unreviewed function",
};

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

/** EOAs, unknown contracts and 1-of-n Safes: any one signer can act alone. */
export function isSingleKey(h: ResolvedHolder): boolean {
  return h.holderClass === "eoa" || h.holderClass === "unknown" || h.safe?.threshold === 1;
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

/** What's wrong with how a power is held, worst first. */
export type PowerIssue = "single-key" | "weak-multisig" | "no-timelock";

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
  /** grey: unclassified, needs manual review. */
  color: Tone;
  issue?: PowerIssue;
}

function evaluate(power: Power, h: ResolvedHolder): { color: Tone; issue?: PowerIssue } {
  const criticality = criticalityOf(power);
  if (criticality === "unclassified") return { color: "grey" };
  if (isSingleKey(h)) return { color: SINGLE_KEY_RED.includes(power) ? "red" : "yellow", issue: "single-key" };
  if (criticality === "critical" && h.holderClass === "weak-safe") return { color: "yellow", issue: "weak-multisig" };
  if (criticality === "critical" && h.delaySeconds === 0) return { color: "yellow", issue: "no-timelock" };
  return { color: "green" };
}

function checksText(power: Power, h: ResolvedHolder): string {
  if (criticalityOf(power) === "unclassified") return "Needs review";
  if (isSingleKey(h)) return h.delaySeconds > 0 ? `${formatDelay(h.delaySeconds)} delay, single key` : "None";
  if (h.delaySeconds > 0) return `${formatDelay(h.delaySeconds)} delay`;
  return "No delay";
}

const ISSUE_RANK: Record<PowerIssue, number> = { "single-key": 0, "weak-multisig": 1, "no-timelock": 2 };
const TONE_RANK: Record<Tone, number> = { red: 0, yellow: 1, green: 2, grey: 3 };

export function analyzePowers(snapshots: Discovered[]): PowerRow[] {
  const rows: PowerRow[] = [];
  for (const d of snapshots) {
    for (const [contract, c] of Object.entries(d.contracts)) {
      c.permissions.forEach((p, i) => {
        const holder = resolveHolder(d, p.holder);
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
          ...evaluate(p.power, holder),
        });
      });
    }
  }
  const order = [...CRITICAL_POWERS, ...HIGH_POWERS, "unclassified"];
  // Within a power, the weakest holder first, so it leads the findings.
  const issueRank = (k?: PowerIssue) => (k ? ISSUE_RANK[k] : 3);
  return rows.sort(
    (a, b) => order.indexOf(a.power) - order.indexOf(b.power) || TONE_RANK[a.color] - TONE_RANK[b.color] || issueRank(a.issue) - issueRank(b.issue),
  );
}
