import type { Asset } from "../schema/asset";
import type { Discovered, Power } from "../schema/discovered";
import { formatDelay } from "../format";
import { analyzePowers, type PowerRow, type ResolvedHolder } from "../scoring/control";
import type { Framework } from "./schema";
import { rateCategory, type CategoryResult, type Finding } from "./types";

/** Red when a single key holds them (framework §4: "a single key can mint, freeze or upgrade"). */
export const SINGLE_KEY_RED: Power[] = ["upgrade", "mint", "force-transfer", "burn-from", "set-price", "allocate", "admin", "freeze"];
export const CRITICAL: Power[] = ["upgrade", "mint", "force-transfer", "burn-from", "set-price", "allocate", "admin"];
export const AUDIT_MAX_AGE_MONTHS = 24;

const VERBS: Record<Power, string> = {
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

/** A 1-of-n Safe is a single key: any one signer can act alone. */
export function isSingleKey(h: ResolvedHolder): boolean {
  return h.holderClass === "eoa" || h.holderClass === "unknown" || h.safe?.threshold === 1;
}

const multisig = (h: ResolvedHolder) => (h.safe ? `A ${h.safe.threshold}-of-${h.safe.owners} multisig` : "A multisig");

function monthsSince(date: string, now: Date): number {
  const d = new Date(`${date}T00:00:00Z`);
  return (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
}

export function powerFindings(rows: PowerRow[]): Finding[] {
  const out = new Map<string, Finding>();
  const put = (f: Finding) => {
    if (!out.has(f.id)) out.set(f.id, f);
  };
  for (const r of rows) {
    if (r.criticality === "unclassified") continue;
    const h = r.holder;
    const critical = CRITICAL.includes(r.power);
    if (isSingleKey(h)) {
      put({
        id: `control.single-key.${r.power}`,
        color: SINGLE_KEY_RED.includes(r.power) ? "red" : "yellow",
        text: `A single key can ${VERBS[r.power]}${h.delaySeconds > 0 ? ` after a ${formatDelay(h.delaySeconds)} delay` : ""}.`,
      });
    } else if (critical && h.holderClass === "weak-safe") {
      put({ id: `control.weak-multisig.${r.power}`, color: "yellow", text: `${multisig(h)} can ${VERBS[r.power]}: few signers need to agree.` });
    } else if (critical && h.delaySeconds === 0) {
      put({ id: `control.no-timelock.${r.power}`, color: "yellow", text: `${multisig(h)} can ${VERBS[r.power]} with no timelock.` });
    }
    if (h.modulesEnabled)
      put({ id: `control.safe-module.${h.address}`, color: "yellow", text: "A Safe module can act without the signers' approval." });
  }
  return [...out.values()];
}

export function rateControl(asset: Asset, fw: Framework, discovered: Discovered[], now: Date): CategoryResult {
  const c = fw.control;
  const findings: Finding[] = [];
  const context: string[] = [];
  const add = (id: string, color: Finding["color"], text: string, extra: Partial<Finding> = {}) =>
    findings.push({ id: `control.${id}`, color, text, ...extra });

  if (discovered.length === 0) add("discovery", "unknown", "Admin powers haven't been read from the chain yet.", { worstCase: "red" });
  else {
    const rows = analyzePowers(discovered);
    const powers = powerFindings(rows);
    findings.push(...powers);
    if (powers.length === 0) add("powers", "green", "Critical powers sit with strong multisigs behind a timelock.");
    const unverified = discovered.flatMap((d) => Object.values(d.contracts).filter((x) => !x.verified));
    if (unverified.length > 0)
      add("unverified", "red", `${unverified.length} contract${unverified.length === 1 ? "'s" : "s'"} source isn't verified, so the powers aren't disclosed.`);
    const unclassified = rows.filter((r) => r.criticality === "unclassified").length;
    if (unclassified > 0) context.push(`${unclassified} privileged function${unclassified === 1 ? "" : "s"} still need manual review.`);

    const usesMultisig = rows.some((r) => r.criticality !== "unclassified" && r.holder.safe && r.holder.safe.threshold > 1);
    if (usesMultisig) {
      const s = c.signersIndependent;
      if (s.status === "public" && s.value) add("signers", "green", "Multisig signers are independent.", { source: s.source });
      else if (s.status === "public") add("signers", "yellow", "Multisig signers all work for the issuer.", { source: s.source });
      else add("signers", "unknown", "Multisig signers aren't named, so their independence can't be checked.", { worstCase: "yellow" });
    }
  }

  if (c.powersDocumented.value) add("documented", "green", "The issuer documents its admin powers.", { source: c.powersDocumented.source });
  else add("documented", "yellow", "The issuer doesn't document its admin powers; they're only visible onchain.", { source: c.powersDocumented.source });

  const latest = [...c.audits].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) add("audit", "red", "No smart contract audit is published.");
  else if (monthsSince(latest.date, now) > AUDIT_MAX_AGE_MONTHS)
    add("audit", "yellow", `The latest published audit is from ${latest.date.slice(0, 7)}, more than two years ago.`, { source: latest.source });
  else add("audit", "green", `Audited by ${latest.auditor} (${latest.date.slice(0, 7)}).`, { source: latest.source });

  const bridged = c.chains.filter((x) => x.mechanism !== "native");
  if (bridged.length > 0) {
    const providers = [...new Set(bridged.map((b) => b.provider).filter(Boolean))].join(", ");
    add("bridge", "yellow", `On ${bridged.map((b) => b.chain).join(", ")}, the token depends on a bridge${providers ? ` (${providers})` : ""}.`, {
      source: bridged[0].source,
    });
  }

  const bounty = c.bugBounty;
  context.push(bounty.status === "public" ? `Bug bounty on ${bounty.value.platform}, up to $${bounty.value.maxUsd.toLocaleString("en-US")}.` : "No public bug bounty.");
  if (asset.access.transferRestricted.value) context.push("Transfers are limited to allowlisted wallets.");

  return rateCategory("control", findings, context, "Powers are limited and documented, held by independent multisigs behind a timelock, and audited.");
}
