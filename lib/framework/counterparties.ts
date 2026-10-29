import type { Asset, Rail, Role } from "../schema/asset";
import type { Entity } from "../schema/entity";
import { rateCategory, type CategoryResult, type Check } from "./types";

export const RAIL_LABELS: Record<Rail, string> = {
  "usd-wire": "USD wire",
  usdc: "USDC",
  usdt: "USDT",
  pyusd: "PYUSD",
  usds: "USDS",
  "other-stablecoin": "other stablecoins",
  "in-kind": "in-kind transfer",
};

const RAIL_ISSUERS: Partial<Record<Rail, string>> = { usdc: "Circle", usdt: "Tether", pyusd: "Paxos", usds: "Sky" };

const ROLE_LABELS: Record<Role, string> = {
  custodian: "custodian",
  "fund-administrator": "fund administrator",
  auditor: "auditor",
  "transfer-agent": "transfer agent",
};

const TIER_TEXT = {
  "big-four": "a Big Four firm",
  "pcaob-registered": "a PCAOB-registered firm",
  "global-network": "a member of a major international audit network",
} as const;

export function rateCounterparties(asset: Asset, entities: Map<string, Entity>): CategoryResult {
  const c = asset.counterparties;
  const findings: Check[] = [];
  const context: string[] = [];
  const add = (id: string, color: Check["color"], text: string, extra: Partial<Check> = {}) =>
    findings.push({ id: `counterparties.${id}`, color, text, ...extra });
  const name = (slug: string) => entities.get(slug)?.name ?? slug;
  const affiliated = (role: Role) => c.affiliated.value.includes(role);

  for (const [role, item] of [
    ["custodian", c.custodian],
    ["fund-administrator", c.fundAdministrator],
  ] as const) {
    const label = ROLE_LABELS[role];
    if (item.status === "not_public") {
      add(role, "red", `The ${label} isn't disclosed.`);
      continue;
    }
    if (item.status === "unknown") {
      add(role, "unknown", `We couldn't confirm who the ${label} is.`, { worstCase: "red" });
      continue;
    }
    const who = name(item.value);
    if (affiliated(role)) {
      const text =
        role === "custodian"
          ? `The issuer's own group holds the assets (custodian: ${who}).`
          : `The issuer's own group administers the fund (administrator: ${who}).`;
      add(role, "red", text, { source: c.affiliated.source });
      continue;
    }
    const f = entities.get(item.value);
    if (!f?.regulated)
      add(role, "unknown", `${who}'s regulatory status isn't recorded.`, { worstCase: "yellow", source: item.source });
    else if (!f.regulated.value)
      add(role, "yellow", `The ${label}, ${who}, isn't a regulated firm.`, { source: f.regulated.source });
    else
      add(role, "green", `Independent, regulated ${label}: ${who}${f.regulator ? ` (${f.regulator})` : ""}.`, {
        source: item.source,
      });
  }

  const auditor = c.auditor;
  if (auditor.status === "not_public") add("auditor", "red", "No financial audit is disclosed.");
  else if (auditor.status === "unknown")
    add("auditor", "unknown", "We couldn't confirm who audits the fund.", { worstCase: "red" });
  else {
    const who = name(auditor.value);
    const tier = entities.get(auditor.value)?.auditorTier;
    if (affiliated("auditor"))
      add("auditor", "red", `The auditor, ${who}, is part of the issuer's group.`, { source: c.affiliated.source });
    else if (!tier)
      add("auditor", "unknown", `We couldn't confirm that ${who} is a recognized audit firm.`, {
        worstCase: "yellow",
        source: auditor.source,
      });
    else if (tier.value === "other")
      add("auditor", "yellow", `The auditor, ${who}, is a small firm outside the major networks.`, {
        source: tier.source,
      });
    else add("auditor", "green", `Audited by ${who}, ${TIER_TEXT[tier.value]}.`, { source: auditor.source });
  }

  if (
    c.custodian.status === "public" &&
    c.fundAdministrator.status === "public" &&
    c.custodian.value === c.fundAdministrator.value
  )
    add(
      "same-firm",
      "yellow",
      `${name(c.custodian.value)} is both custodian and administrator, so one firm's failure hits both.`,
      { source: c.custodian.source },
    );

  const rails = c.settlementRails.value;
  if (rails.length === 1) {
    const issuer = RAIL_ISSUERS[rails[0]];
    add(
      "rails",
      "yellow",
      `Money moves only by ${RAIL_LABELS[rails[0]]}${issuer ? `, so ${issuer} is a single point of failure` : ""}.`,
      {
        source: c.settlementRails.source,
      },
    );
  } else
    add("rails", "green", `Settles by ${rails.map((r) => RAIL_LABELS[r]).join(", ")}.`, {
      source: c.settlementRails.source,
    });

  c.dependencies.forEach((d, i) => add(`dependency-${i}`, "yellow", d.what, { source: d.source }));
  if (c.transferAgent.status === "public")
    context.push(
      `Transfer agent: ${name(c.transferAgent.value)}${affiliated("transfer-agent") ? " (issuer's group)" : ""}.`,
    );
  for (const o of c.operators) context.push(`${o.role}: ${o.name}.`);

  return rateCategory(
    "counterparties",
    findings,
    context,
    "Independent, regulated custodian and administrator, a recognized auditor, and no single point of failure.",
  );
}
