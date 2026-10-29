import type { Asset } from "../schema/asset";
import type { Discovered } from "../schema/discovered";
import { formatDelay } from "../format";
import { analyzePowers, POWER_VERBS, type PowerRow, type ResolvedHolder } from "./permissions";
import { rateCategory, type CategoryResult, type Check } from "./types";

export const AUDIT_MAX_AGE_MONTHS = 24;

const multisig = (h: ResolvedHolder) => (h.safe ? `A ${h.safe.threshold}-of-${h.safe.owners} multisig` : "A multisig");

function monthsSince(date: string, now: Date): number {
  const d = new Date(`${date}T00:00:00Z`);
  return (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
}

/** One finding per power and issue, from the weakest holder (rows come sorted that way). */
function powerFindings(rows: PowerRow[]): Check[] {
  const out = new Map<string, Check>();
  const put = (f: Check) => {
    if (!out.has(f.id)) out.set(f.id, f);
  };
  for (const r of rows) {
    const h = r.holder;
    const verb = POWER_VERBS[r.power];
    if (r.issue === "single-key" && (r.color === "red" || r.color === "yellow"))
      put({
        id: `control.single-key.${r.power}`,
        color: r.color,
        text: `A single key can ${verb}${h.delaySeconds > 0 ? ` after a ${formatDelay(h.delaySeconds)} delay` : ""}.`,
      });
    else if (r.issue === "weak-multisig")
      put({
        id: `control.weak-multisig.${r.power}`,
        color: "yellow",
        text: `${multisig(h)} can ${verb}: few signers need to agree.`,
      });
    else if (r.issue === "no-timelock")
      put({
        id: `control.no-timelock.${r.power}`,
        color: "yellow",
        text: `${multisig(h)} can ${verb} with no timelock.`,
      });
    if (h.modulesEnabled && r.criticality !== "unclassified")
      put({
        id: `control.safe-module.${h.address}`,
        color: "yellow",
        text: "A Safe module can act without the signers' approval.",
      });
  }
  return [...out.values()];
}

export function rateControl(asset: Asset, discovered: Discovered[], now: Date): CategoryResult {
  const c = asset.control;
  const findings: Check[] = [];
  const context: string[] = [];
  const add = (id: string, color: Check["color"], text: string, extra: Partial<Check> = {}) =>
    findings.push({ id: `control.${id}`, color, text, ...extra });

  if (discovered.length === 0)
    add("discovery", "unknown", "Admin powers haven't been read from the chain yet.", { worstCase: "red" });
  else {
    const rows = analyzePowers(discovered);
    const powers = powerFindings(rows);
    findings.push(...powers);
    if (powers.length === 0) add("powers", "green", "Critical powers sit with strong multisigs behind a timelock.");
    const unverified = discovered.flatMap((d) => Object.values(d.contracts).filter((x) => !x.verified));
    if (unverified.length > 0)
      add(
        "unverified",
        "red",
        `${unverified.length} contract${unverified.length === 1 ? "'s" : "s'"} source isn't verified, so the powers aren't disclosed.`,
      );
    const unclassified = rows.filter((r) => r.criticality === "unclassified").length;
    if (unclassified > 0)
      context.push(`${unclassified} privileged function${unclassified === 1 ? "" : "s"} still need manual review.`);

    const usesMultisig = rows.some(
      (r) => r.criticality !== "unclassified" && r.holder.safe && r.holder.safe.threshold > 1,
    );
    if (usesMultisig) {
      const s = c.signersIndependent;
      if (s.status === "public" && s.value)
        add("signers", "green", "Multisig signers are independent.", { source: s.source });
      else if (s.status === "public")
        add("signers", "yellow", "Multisig signers all work for the issuer.", { source: s.source });
      else
        add("signers", "unknown", "Multisig signers aren't named, so their independence can't be checked.", {
          worstCase: "yellow",
        });
    }
  }

  if (c.powersDocumented.value)
    add("documented", "green", "The issuer documents its admin powers.", { source: c.powersDocumented.source });
  else
    add("documented", "yellow", "The issuer doesn't document its admin powers; they're only visible onchain.", {
      source: c.powersDocumented.source,
    });

  const latest = [...c.audits].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) add("audit", "red", "No smart contract audit is published.");
  else if (monthsSince(latest.date, now) > AUDIT_MAX_AGE_MONTHS)
    add("audit", "yellow", `The latest published audit is from ${latest.date.slice(0, 7)}, more than two years ago.`, {
      source: latest.source,
    });
  else add("audit", "green", `Audited by ${latest.auditor} (${latest.date.slice(0, 7)}).`, { source: latest.source });

  const bridged = c.chains.filter((x) => x.mechanism !== "native");
  if (bridged.length > 0) {
    const providers = [...new Set(bridged.map((b) => b.provider).filter(Boolean))].join(", ");
    add(
      "bridge",
      "yellow",
      `On ${bridged.map((b) => b.chain).join(", ")}, the token depends on a bridge${providers ? ` (${providers})` : ""}.`,
      {
        source: bridged[0].source,
      },
    );
  }

  const bounty = c.bugBounty;
  context.push(
    bounty.status === "public"
      ? `Bug bounty on ${bounty.value.platform}, up to $${bounty.value.maxUsd.toLocaleString("en-US")}.`
      : "No public bug bounty.",
  );
  if (asset.access.transferRestricted.value) context.push("Transfers are limited to allowlisted wallets.");

  return rateCategory(
    "control",
    findings,
    context,
    "Powers are limited and documented, held by independent multisigs behind a timelock, and audited.",
  );
}
