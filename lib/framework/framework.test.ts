import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadAssets, loadDiscovered, loadEntities, loadMeasured } from "../data";
import { AssetSchema, type Asset } from "../schema/asset";
import type { Discovered, Holder, Power } from "../schema/discovered";
import type { Entity } from "../schema/entity";
import { LiveSchema } from "../schema/live";
import type { Measured } from "../schema/measured";
import { rateControl } from "./control";
import { rateCounterparties } from "./counterparties";
import { exitLiquidity, rateExit } from "./exit";
import { rateAsset, type CategoryId, type Rating } from "./index";
import { analyzePowers } from "./permissions";
import { ratePricing } from "./pricing";
import { rateStage } from "./stages";
import { rateTransparency } from "./transparency";
import { rateCategory, risksOf } from "./types";
import { rateUnderlying } from "./underlying";

const NOW = new Date("2026-10-25T00:00:00Z");
const checkedAt = "2026-10-20";
const src = { url: "https://example.com", checkedAt };
const pub = <T>(value: T) => ({ status: "public" as const, value, source: src });
const hidden = { status: "not_public" as const, searchedAt: checkedAt };
const sourced = <T>(value: T) => ({ value, source: src });

const TOKEN = "0x00000000000000000000000000000000000000aa";
const EOA = "0x0000000000000000000000000000000000000001";
const SAFE = "0x0000000000000000000000000000000000000002";
const TIMELOCK = "0x0000000000000000000000000000000000000003";

/** An asset that passes every check: green everywhere except Legal, which isn't assessed. */
const BASE = {
  slug: "fixture",
  name: "Fixture",
  ticker: "FIX",
  assetClass: "us-treasuries",
  description: "Fixture asset",
  issuer: "issuer",
  manager: "manager",
  platform: "platform",
  tokenStandard: "oz-erc20",
  priceModel: "accumulating-nav",
  deployments: [{ chain: "ethereum", token: TOKEN }],
  access: {
    investorType: sourced("qualified-purchaser"),
    minimumInvestment: pub(1),
    transferRestricted: sourced(false),
  },
  legal: {
    vehicleType: pub("fund"),
    jurisdiction: pub("KY"),
    lei: pub("x"),
    secFilings: hidden,
    offeringDocument: pub("om"),
    auditedFinancials: pub("fs"),
    insolvency: { status: "unknown" },
  },
  freshnessClass: sourced("tbill-mmf"),
  underlying: {
    holdings: pub({ asOf: checkedAt, items: [{ type: "government-bills", pct: 100 }] }),
    wamDays: pub(40),
    trackRecord: sourced({ since: "2020-01-01", losses: [] }),
  },
  counterparties: {
    custodian: pub("bank"),
    fundAdministrator: pub("admin"),
    auditor: pub("big4"),
    transferAgent: pub("ta"),
    affiliated: sourced([]),
    settlementRails: sourced(["usd-wire", "usdc"]),
  },
  control: {
    audits: [{ auditor: "A", scope: "all", date: "2026-01-01", source: src }],
    bugBounty: pub({ platform: "Immunefi", maxUsd: 100000 }),
    powersDocumented: sourced(true),
    signersIndependent: pub(true),
    chains: [{ chain: "ethereum", mechanism: "native", source: src }],
  },
  transparency: {
    reports: [
      {
        name: "PoA",
        provider: "p",
        dataSource: "custodian",
        granularity: "position",
        frequency: "daily",
        verifiability: "cryptographic",
        onchain: true,
        source: src,
      },
    ],
    eventReporting: pub(true),
  },
  pricing: {
    reference: {
      type: "oracle",
      provider: "p",
      chain: "ethereum",
      writer: "oracle-network",
      dataOrigin: "fund-administrator",
      cadenceSeconds: 86400,
      historyOnchain: true,
      source: src,
    },
    stalenessDetectable: sourced(true),
    lossRecognition: sourced("next-nav"),
  },
  exit: {
    redemption: {
      available: sourced(true),
      whoCanRedeem: sourced("all-holders"),
      settlement: pub("T+1"),
      gatesOrSuspension: pub("stated-limits"),
    },
    dealing: sourced("daily"),
    noticeDays: pub(0),
    lockupDays: pub(0),
    dailyCapUsd: pub(null),
    minimumUsd: pub(0),
    feeBps: pub(0),
    liquidators: sourced("anyone"),
    instant: [{ label: "facility", dailyCapUsd: pub(50_000_000), fundedUsd: pub(20_000_000) }],
  },
  externalIds: {},
};

function merge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a;
  if (
    Array.isArray(b) ||
    typeof b !== "object" ||
    b === null ||
    typeof a !== "object" ||
    a === null ||
    Array.isArray(a)
  )
    return b;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
  return out;
}

/** The fixture with `overrides` deep-merged in (arrays and scalars replace). */
const asset = (overrides: Record<string, unknown> = {}): Asset => AssetSchema.parse(merge(BASE, overrides));

const ENTITIES = new Map<string, Entity>([
  ["bank", { slug: "bank", name: "Bank", type: ["custodian"], regulated: sourced(true), regulator: "OCC" }],
  ["admin", { slug: "admin", name: "Admin", type: ["fund-administrator"], regulated: sourced(true) }],
  ["big4", { slug: "big4", name: "Big Four", type: ["auditor"], auditorTier: sourced("big-four") }],
  ["tiny", { slug: "tiny", name: "Tiny", type: ["auditor"], auditorTier: sourced("other") }],
]);

function discovered(permissions: [Power, string][], holders: Record<string, Holder>): Discovered {
  return {
    asset: "fixture",
    chain: "ethereum",
    block: 1,
    timestamp: "2026-10-12T00:00:00Z",
    contracts: {
      [TOKEN]: {
        name: "Token",
        role: "token",
        verified: true,
        permissions: permissions.map(([power, holder]) => ({ power, holder, via: "test" })),
      },
    },
    holders,
  };
}
const safe = (threshold: number, owners: number): Holder => ({
  kind: "safe",
  threshold,
  owners: Array.from({ length: owners }, (_, i) => `0x${(i + 16).toString(16).padStart(40, "0")}`),
  modules: [],
});
const timelocked = (days: number) =>
  discovered(
    [
      ["upgrade", TIMELOCK],
      ["mint", TIMELOCK],
    ],
    {
      [TIMELOCK]: { kind: "timelock", minDelaySeconds: days * 86400, proposers: [SAFE], executors: [] },
      [SAFE]: safe(4, 7),
    },
  );

function measured(quotes: Measured["dex"]["quotes"]): Measured {
  return {
    asset: "fixture",
    asOf: "2026-10-25T00:00:00Z",
    dex: { chain: "ethereum", navUsd: 1, quotes, source: "https://kyberswap.com" },
  };
}

describe("rating states (framework rule 5)", () => {
  const check = (color: "red" | "yellow" | "unknown", worstCase?: "red" | "yellow") => ({
    id: color,
    color,
    worstCase,
    text: color,
  });
  test("a known red wins over unknowns", () =>
    expect(rateCategory("exit", [check("red"), check("unknown", "red")], [], "").rating).toBe("red"));
  test("an unknown that could be worse than what we know is unverified, with the floor kept", () => {
    const r = rateCategory("exit", [check("yellow"), check("unknown", "red")], [], "");
    expect([r.rating, r.floor, r.headline]).toEqual(["unverified", "yellow", "unknown"]);
  });
  test("an unknown that can't change the result doesn't block it", () =>
    expect(rateCategory("exit", [check("yellow"), check("unknown", "yellow")], [], "").rating).toBe("yellow"));
  test("with nothing known there is no floor", () =>
    expect(rateCategory("exit", [check("unknown", "red")], [], "").floor).toBeUndefined());
  test("findings are tagged with their category", () =>
    expect(rateCategory("exit", [check("red")], [], "").findings[0].category).toBe("exit"));
});

describe("underlying asset", () => {
  const credit = (u: Record<string, unknown>) =>
    asset({ underlying: { holdings: pub({ asOf: checkedAt, items: [{ type: "secured-loans", pct: 100 }] }), ...u } });
  test("short-dated government debt is green", () => expect(rateUnderlying(asset(), NOW).rating).toBe("green"));
  test("bills, repo and cash count as short-dated without a published WAM", () =>
    expect(rateUnderlying(asset({ underlying: { wamDays: hidden } }), NOW).rating).toBe("green"));
  test("notes with no published WAM are unverified", () => {
    const u = { holdings: pub({ asOf: checkedAt, items: [{ type: "government-notes", pct: 100 }] }), wamDays: hidden };
    expect(rateUnderlying(asset({ underlying: u }), NOW).rating).toBe("unverified");
  });
  test("diversified senior secured credit with history is yellow", () =>
    expect(
      rateUnderlying(credit({ securedPct: pub(95), largestObligorPct: pub(3), obligors: pub(200) }), NOW).rating,
    ).toBe("yellow"));
  test("one borrower is red", () =>
    expect(
      rateUnderlying(credit({ securedPct: pub(100), largestObligorPct: pub(100), obligors: pub(1) }), NOW).rating,
    ).toBe("red"));
  test("unsecured, sub-investment-grade credit is red", () => {
    const u = {
      holdings: pub({ asOf: checkedAt, items: [{ type: "unsecured-loans", pct: 100 }] }),
      creditQuality: pub("high-yield"),
      securedPct: pub(10),
      largestObligorPct: pub(2),
      obligors: pub(100),
    };
    expect(rateUnderlying(asset({ underlying: u }), NOW).rating).toBe("red");
  });
  test("less than a year of history is red", () => {
    const a = credit({
      securedPct: pub(100),
      largestObligorPct: pub(2),
      obligors: pub(100),
      trackRecord: sourced({ since: "2026-03-01", losses: [] }),
    });
    expect(rateUnderlying(a, NOW).findings.find((f) => f.id === "underlying.history")?.color).toBe("red");
  });
  test("unpublished concentration leaves credit unverified", () =>
    expect(rateUnderlying(credit({ securedPct: pub(100) }), NOW).rating).toBe("unverified"));
});

describe("counterparties", () => {
  const rate = (o: Record<string, unknown>) => rateCounterparties(asset({ counterparties: o }), ENTITIES).rating;
  test("regulated, independent parties and two rails are green", () => expect(rate({})).toBe("green"));
  test("an administrator in the issuer's group is red", () =>
    expect(rate({ affiliated: sourced(["fund-administrator"]) })).toBe("red"));
  test("an undisclosed custodian is red", () => expect(rate({ custodian: hidden })).toBe("red"));
  test("one rail is a single point of failure", () =>
    expect(rate({ settlementRails: sourced(["usdc"]) })).toBe("yellow"));
  test("one firm as custodian and administrator is yellow", () =>
    expect(rate({ fundAdministrator: pub("bank") })).toBe("yellow"));
  test("a small auditor is yellow", () => expect(rate({ auditor: pub("tiny") })).toBe("yellow"));
  test("an unknown regulatory status keeps green from being claimed", () =>
    expect(rate({ custodian: pub("unlisted") })).toBe("unverified"));
});

describe("permissions", () => {
  test("a single key holding a critical power or freeze is red, pause is yellow", () => {
    const rows = analyzePowers([
      discovered(
        [
          ["mint", EOA],
          ["freeze", EOA],
          ["pause", EOA],
        ],
        { [EOA]: { kind: "eoa" } },
      ),
    ]);
    expect(Object.fromEntries(rows.map((r) => [r.power, r.color]))).toEqual({
      mint: "red",
      freeze: "red",
      pause: "yellow",
    });
  });
  test("timelocked strong multisig is green, unclassified is grey", () => {
    const d = timelocked(7);
    d.contracts[TOKEN].permissions.push({ power: "unclassified", holder: EOA, via: "test" });
    d.holders[EOA] = { kind: "eoa" };
    expect([...new Set(analyzePowers([d]).map((r) => r.color))].sort()).toEqual(["green", "grey"]);
  });
});

describe("control", () => {
  const rate = (d: Discovered[], o: Record<string, unknown> = {}) => rateControl(asset({ control: o }), d, NOW);
  test("timelocked powers held by an independent multisig, documented and audited, are green", () =>
    expect(rate([timelocked(7)]).rating).toBe("green"));
  test("a single key that can freeze is red", () =>
    expect(rate([discovered([["freeze", EOA]], { [EOA]: { kind: "eoa" } })]).rating).toBe("red"));
  test("a 1-of-n Safe is a single key", () =>
    expect(rate([discovered([["mint", SAFE]], { [SAFE]: safe(1, 9) })]).rating).toBe("red"));
  test("a single key that can only pause is yellow", () =>
    expect(rate([discovered([["pause", EOA]], { [EOA]: { kind: "eoa" } })]).rating).toBe("yellow"));
  test("a multisig with no timelock is yellow", () =>
    expect(rate([discovered([["upgrade", SAFE]], { [SAFE]: safe(4, 7) })]).rating).toBe("yellow"));
  test("no audit is red", () => expect(rate([timelocked(7)], { audits: [] }).rating).toBe("red"));
  test("an audit older than two years is yellow", () =>
    expect(
      rate([timelocked(7)], { audits: [{ auditor: "A", scope: "all", date: "2023-01-01", source: src }] }).rating,
    ).toBe("yellow"));
  test("a bridged deployment is yellow", () =>
    expect(
      rate([timelocked(7)], { chains: [{ chain: "base", mechanism: "bridged", provider: "CCIP", source: src }] })
        .rating,
    ).toBe("yellow"));
  test("unnamed signers keep green from being claimed", () =>
    expect(rate([timelocked(7)], { signersIndependent: hidden }).rating).toBe("unverified"));
  test("nothing discovered is unverified", () => expect(rate([]).rating).toBe("unverified"));
});

describe("transparency", () => {
  const report = (r: Record<string, unknown>) => ({
    transparency: { reports: [{ ...BASE.transparency.reports[0], ...r }] },
  });
  test("independent, position-level, daily and verifiable is green for a T-bill fund", () =>
    expect(rateTransparency(asset()).rating).toBe("green"));
  test("self-reported only is red", () =>
    expect(rateTransparency(asset(report({ verifiability: "self-reported" }))).rating).toBe("red"));
  test("monthly is too slow for a T-bill fund", () =>
    expect(rateTransparency(asset(report({ frequency: "monthly" }))).rating).toBe("yellow"));
  test("monthly with event reporting is fresh enough for private credit", () =>
    expect(
      rateTransparency(asset({ freshnessClass: sourced("private-credit"), ...report({ frequency: "monthly" }) }))
        .rating,
    ).toBe("green"));
  test("private credit without event reporting is yellow", () =>
    expect(
      rateTransparency(
        asset({ freshnessClass: sourced("private-credit"), transparency: { eventReporting: pub(false) } }),
      ).rating,
    ).toBe("yellow"));
  test("aggregate numbers only are yellow", () =>
    expect(rateTransparency(asset(report({ granularity: "nav" }))).rating).toBe("yellow"));
  test("no reports is red", () =>
    expect(rateTransparency(asset({ transparency: { reports: [] } })).rating).toBe("red"));
});

describe("pricing", () => {
  const rate = (o: Record<string, unknown>, m?: Measured) => ratePricing(asset(o), undefined, m).rating;
  test("administrator NAV through an oracle with staleness checks is green", () => expect(rate({})).toBe("green"));
  test("a stable token with no NAV feed is assumed to be $1: red", () =>
    expect(rate({ priceModel: "stable-nav", pricing: { reference: { type: "none", searchedAt: checkedAt } } })).toBe(
      "red",
    ));
  test("a stale price nobody can detect is red", () =>
    expect(rate({ pricing: { stalenessDetectable: sourced(false) } })).toBe("red"));
  test("monthly pricing is too slow for a T-bill fund but fine for private credit", () => {
    const monthly = { pricing: { reference: { ...BASE.pricing.reference, cadenceSeconds: 30 * 86400 } } };
    expect(rate(monthly)).toBe("red");
    expect(rate({ ...monthly, freshnessClass: sourced("private-credit") })).toBe("green");
  });
  test("a traded token with no discount history is yellow", () =>
    expect(rate({}, measured([{ sizeUsd: 1e6, routed: true, outUsd: 999000, slippagePct: 0.1 }]))).toBe("yellow"));
  test("delayed write-downs are yellow", () =>
    expect(rate({ pricing: { lossRecognition: sourced("delayed") } })).toBe("yellow"));
});

describe("exit", () => {
  const rate = (o: Record<string, unknown>, m?: Measured) => rateExit(asset({ exit: o }), m).rating;
  test("T+1, no gates, funded instant facility, open to liquidators is green", () => expect(rate({})).toBe("green"));
  test("liquidators that can't hold the token is red", () =>
    expect(rate({ liquidators: sourced("none") })).toBe("red"));
  test("allowlisted liquidators is yellow", () => expect(rate({ liquidators: sourced("allowlisted") })).toBe("yellow"));
  test("a notice period over a week is red", () => expect(rate({ noticeDays: pub(31) })).toBe("red"));
  test("quarterly dealing is red", () => expect(rate({ dealing: sourced("quarterly") })).toBe("red"));
  test("a daily cap is yellow", () => expect(rate({ dailyCapUsd: pub(10_000_000) })).toBe("yellow"));
  test("allowlisted-only redemption is yellow", () =>
    expect(rate({ redemption: { whoCanRedeem: sourced("whitelisted-holders") } })).toBe("yellow"));
  test("settlement slower than T+5 is red", () => expect(rate({ redemption: { settlement: pub("T+7") } })).toBe("red"));
  test("unpublished suspension terms are unverified", () =>
    expect(rate({ redemption: { gatesOrSuspension: hidden } })).toBe("unverified"));
  test("a $5M DEX sell within 1% counts as real liquidity", () =>
    expect(rate({ instant: [] }, measured([{ sizeUsd: 5e6, routed: true, outUsd: 4_980_000, slippagePct: 0.4 }]))).toBe(
      "green",
    ));
  test("dust-pool routes aren't a market", () =>
    expect(rate({ instant: [] }, measured([{ sizeUsd: 1e6, routed: true, outUsd: 100, slippagePct: 99.99 }]))).toBe(
      "yellow",
    ));
  test("a small cap settles an unfunded facility as thin", () => {
    const a = asset({ exit: { instant: [{ label: "x", dailyCapUsd: pub(1_000_000), fundedUsd: hidden }] } });
    expect(exitLiquidity(a, undefined)).toEqual({ dexUsd: 0, instantUsd: 1_000_000, instantUnknown: false });
  });
});

describe("stages", () => {
  test("legal requirements hold a fully trust-minimized asset at Stage 0, pending legal", () => {
    const m = measured([{ sizeUsd: 5e6, routed: true, outUsd: 4_990_000, slippagePct: 0.2 }]);
    const s = rateStage(asset(), [timelocked(7)], m);
    expect([s.stage, s.pendingLegal]).toEqual([0, true]);
  });
  test("an unnamed auditor is below Stage 0", () =>
    expect(rateStage(asset({ counterparties: { auditor: hidden } }), [timelocked(7)], undefined).stage).toBeNull());
});

/** Ratings on the committed data. Update deliberately when data or rules change. */
const EXPECTED: Record<string, Partial<Record<CategoryId, Rating>> & { stage: 0 | 1 | 2 | null }> = {
  acred: {
    underlying: "yellow",
    counterparties: "red",
    control: "red",
    transparency: "yellow",
    pricing: "yellow",
    exit: "red",
    stage: 0,
  },
  buidl: {
    underlying: "unverified",
    counterparties: "yellow",
    control: "red",
    transparency: "green",
    pricing: "yellow",
    exit: "unverified",
    stage: 0,
  },
  falconx: {
    underlying: "red",
    counterparties: "red",
    control: "red",
    transparency: "red",
    pricing: "red",
    exit: "red",
    stage: null,
  },
  jaaa: {
    underlying: "yellow",
    counterparties: "green",
    control: "red",
    transparency: "green",
    pricing: "red",
    exit: "red",
    stage: 0,
  },
  jtrsy: {
    underlying: "green",
    counterparties: "green",
    control: "red",
    transparency: "green",
    pricing: "red",
    exit: "red",
    stage: 0,
  },
  "mf-one": {
    underlying: "unverified",
    counterparties: "red",
    control: "red",
    transparency: "yellow",
    pricing: "red",
    exit: "unverified",
    stage: null,
  },
  ousg: {
    underlying: "green",
    counterparties: "red",
    control: "red",
    transparency: "red",
    pricing: "yellow",
    exit: "yellow",
    stage: null,
  },
  syrupusdc: {
    underlying: "yellow",
    counterparties: "red",
    control: "red",
    transparency: "yellow",
    pricing: "red",
    exit: "red",
    stage: null,
  },
  ustb: {
    underlying: "green",
    counterparties: "green",
    control: "red",
    transparency: "green",
    pricing: "red",
    exit: "unverified",
    stage: 0,
  },
  usyc: {
    underlying: "green",
    counterparties: "yellow",
    control: "red",
    transparency: "red",
    pricing: "red",
    exit: "unverified",
    stage: 0,
  },
};

// Live data (supply, oracle, lending markets) frozen on 2026-10-14, so expected ratings don't move with the market.
const fixtureLive = (slug: string) =>
  LiveSchema.parse(JSON.parse(fs.readFileSync(path.join(import.meta.dir, "fixtures/live", `${slug}.json`), "utf8")));

describe("committed data", () => {
  const entities = loadEntities();

  test("every tracked asset has an expected rating", () =>
    expect(
      loadAssets()
        .map((a) => a.slug)
        .sort(),
    ).toEqual(Object.keys(EXPECTED).sort()));

  for (const [slug, { stage, ...categories }] of Object.entries(EXPECTED)) {
    test(slug, () => {
      const a = loadAssets().find((x) => x.slug === slug)!;
      const r = rateAsset({
        asset: a,
        discovered: loadDiscovered(a).map((s) => s.discovered),
        live: fixtureLive(slug),
        measured: loadMeasured(slug),
        entities,
        now: NOW,
      });
      const actual = Object.fromEntries(Object.keys(categories).map((k) => [k, r.categories[k as CategoryId].rating]));
      expect({ ...actual, stage: r.stage.stage }).toEqual({ ...categories, stage });
      expect(r.categories.legal.rating).toBe("not-assessed");
    });
  }
});

describe("what can go wrong", () => {
  test("each category's worst finding comes before a second one from the same category", () => {
    const f = (category: CategoryId, id: string) => ({ id, category, color: "red" as const, text: id });
    const cats = [
      {
        category: "control" as const,
        rating: "red" as const,
        headline: "",
        context: [],
        findings: [f("control", "c1"), f("control", "c2")],
      },
      { category: "exit" as const, rating: "red" as const, headline: "", context: [], findings: [f("exit", "e1")] },
    ];
    expect(risksOf(cats).map((x) => x.id)).toEqual(["c1", "e1", "c2"]);
  });
});
