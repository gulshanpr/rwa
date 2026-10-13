import { describe, expect, test } from "bun:test";
import { loadAssets, loadDiscovered, loadLive } from "../data";
import { AssetSchema, type Asset } from "../schema/asset";
import type { Discovered, Holder, Power } from "../schema/discovered";
import { analyzePowers, scoreControl } from "./control";
import { scoreDisclosure } from "./disclosure";
import { scoreExit } from "./exit";
import { scoreAsset } from "./index";
import { scorePricing } from "./pricing";
import type { SliceColor, SliceId } from "./types";
import { scoreVerification } from "./verification";

const checkedAt = "2026-10-12";
const src = { url: "https://example.com", checkedAt };
const pub = <T,>(value: T) => ({ status: "public" as const, value, source: src });
const hidden = { status: "not_public" as const, searchedAt: checkedAt };

const TOKEN = "0x00000000000000000000000000000000000000aa";
const EOA = "0x0000000000000000000000000000000000000001";
const SAFE = "0x0000000000000000000000000000000000000002";
const TIMELOCK = "0x0000000000000000000000000000000000000003";
const UNKNOWN = "0x0000000000000000000000000000000000000004";

function asset(overrides: Record<string, unknown> = {}): Asset {
  return AssetSchema.parse({
    slug: "fixture",
    name: "Fixture",
    ticker: "FIX",
    assetClass: "us-treasuries",
    description: "Fixture asset",
    issuer: "issuer",
    manager: "manager",
    platform: "platform",
    tokenStandard: "oz-erc20",
    priceModel: "stable-nav",
    deployments: [{ chain: "ethereum", token: TOKEN }],
    access: {
      investorType: { value: "qualified-purchaser", source: src },
      minimumInvestment: pub(1),
      transferRestricted: { value: true, source: src },
    },
    serviceProviders: { custodian: pub("c"), fundAdministrator: pub("f"), auditor: pub("a"), transferAgent: pub("t") },
    legal: {
      vehicleType: pub("fund"),
      jurisdiction: pub("KY"),
      lei: pub("x"),
      secFilings: hidden,
      offeringDocument: pub("om"),
      auditedFinancials: pub("fs"),
      insolvency: { status: "unknown" },
    },
    pricing: {
      reference: { type: "oracle", provider: "p", chain: "ethereum", writer: "oracle-network", dataOrigin: "fund-administrator", cadenceSeconds: 86400, historyOnchain: true, source: src },
    },
    verification: {
      methods: [{ type: "proof-of-asset", provider: "v", independent: true, assetLevel: true, frequency: "daily", cryptographicallyVerifiable: true, onchain: true, source: src }],
    },
    exit: {
      redemption: {
        available: { value: true, source: src },
        whoCanRedeem: { value: "all-holders", source: src },
        settlement: pub("T+1"),
        gatesOrSuspension: pub("stated-limits"),
      },
      instantLiquidity: [{ type: "offramp-contract", label: "offramp", chain: "ethereum", address: TOKEN, depthPctOfSupply: 10, source: src }],
    },
    externalIds: {},
    ...overrides,
  });
}

function discovered(permissions: [Power, string][], holders: Record<string, Holder>): Discovered {
  return {
    asset: "fixture",
    chain: "ethereum",
    block: 1,
    timestamp: "2026-10-12T00:00:00Z",
    contracts: { [TOKEN]: { name: "Token", role: "token", verified: true, permissions: permissions.map(([power, holder]) => ({ power, holder, via: "test" })) } },
    holders,
  };
}

const safe = (threshold: number, owners: number, modules: string[] = []): Holder => ({
  kind: "safe",
  threshold,
  owners: Array.from({ length: owners }, (_, i) => `0x${(i + 16).toString(16).padStart(40, "0")}`),
  modules,
});
const timelock = (days: number): Holder => ({ kind: "timelock", minDelaySeconds: days * 86400, proposers: [SAFE], executors: [] });

const control = (permissions: [Power, string][], holders: Record<string, Holder>) => scoreControl(analyzePowers([discovered(permissions, holders)]), "FIX");

describe("control (TECH_SPEC 6.1)", () => {
  test("critical power held by an EOA is red", () => {
    expect(control([["mint", EOA]], { [EOA]: { kind: "eoa" } }).color).toBe("red");
  });

  test("allocate is critical: an EOA that can lend out pool assets is red", () => {
    const r = control([["allocate", EOA]], { [EOA]: { kind: "eoa" } });
    expect(r.color).toBe("red");
    expect(r.headline).toBe("A single key can lend out or move the assets backing the token.");
  });

  test("unknown contract is treated as a single key", () => {
    expect(control([["upgrade", UNKNOWN]], { [UNKNOWN]: { kind: "contract-unknown" } }).color).toBe("red");
  });

  test("weak Safe without a timelock holding a critical power is red", () => {
    expect(control([["set-price", SAFE]], { [SAFE]: safe(2, 3) }).color).toBe("red");
  });

  test("strong Safe without a timelock holding upgrade is yellow", () => {
    const r = control([["upgrade", SAFE]], { [SAFE]: safe(3, 6) });
    expect(r.color).toBe("yellow");
    expect(r.headline).toBe("Upgrades take effect immediately (no timelock).");
  });

  test("upgrade behind a timelock shorter than 7 days is yellow", () => {
    const r = control([["upgrade", TIMELOCK]], { [TIMELOCK]: timelock(3), [SAFE]: safe(4, 7) });
    expect(r.color).toBe("yellow");
    expect(r.reasons[0]!.id).toBe("control.short-delay.upgrade");
  });

  test("upgrade behind a 7-day timelock of a strong Safe is green", () => {
    expect(control([["upgrade", TIMELOCK]], { [TIMELOCK]: timelock(7), [SAFE]: safe(3, 5) }).color).toBe("green");
  });

  test("EOA behind a timelock still counts as a single key", () => {
    const tl: Holder = { kind: "timelock", minDelaySeconds: 7 * 86400, proposers: [EOA], executors: [] };
    expect(control([["upgrade", TIMELOCK]], { [TIMELOCK]: tl, [EOA]: { kind: "eoa" } }).color).toBe("red");
  });

  test("high power held by an EOA is yellow", () => {
    expect(control([["pause", EOA]], { [EOA]: { kind: "eoa" } }).color).toBe("yellow");
  });

  test("a Safe module on a strong Safe is flagged yellow", () => {
    const r = control([["pause", SAFE]], { [SAFE]: safe(3, 5, [UNKNOWN]) });
    expect(r.color).toBe("yellow");
    expect(r.reasons.some((x) => x.id.startsWith("control.safe-modules"))).toBe(true);
  });

  test("unclassified powers do not change the color", () => {
    expect(control([["unclassified", EOA]], { [EOA]: { kind: "eoa" } }).color).toBe("green");
  });
});

describe("pricing (TECH_SPEC 6.2)", () => {
  test("independent daily oracle with administrator data is green", () => {
    expect(scorePricing(asset(), undefined).color).toBe("green");
  });

  test("no onchain reference is red", () => {
    expect(scorePricing(asset({ pricing: { reference: { type: "none", searchedAt: checkedAt } } }), undefined).color).toBe("red");
  });

  test("oracle older than 3x cadence is red", () => {
    const live = { asset: "fixture", sample: false, asOf: "2026-10-12T00:00:00Z", supply: [], aum: { usd: 0, source: { name: "x", url: "https://x.y" } }, oracle: { chain: "ethereum" as const, address: TOKEN, value: 1, updatedAt: "2026-10-08T00:00:00Z" }, defiMarkets: [], defiSource: { name: "x", url: "https://x.y" } };
    const ref = { type: "oracle", provider: "p", chain: "ethereum", address: TOKEN, writer: "oracle-network", dataOrigin: "fund-administrator", cadenceSeconds: 86400, historyOnchain: true, source: src };
    expect(scorePricing(asset({ pricing: { reference: ref } }), live).color).toBe("red");
  });

  const vault = (writer: string, dataOrigin = "issuer") => asset({
    priceModel: "accumulating-nav",
    pricing: { reference: { type: "vault", provider: "p", chain: "ethereum", address: TOKEN, method: "convertToAssets", writer, dataOrigin, historyOnchain: true, source: src } },
  });

  test("vault NAV that an EOA can write down is red", () => {
    expect(scorePricing(vault("eoa"), undefined).color).toBe("red");
  });

  test("vault NAV only governance can touch, from issuer accounting, is yellow", () => {
    expect(scorePricing(vault("governance"), undefined).color).toBe("yellow");
  });

  test("vault NAV nobody can override, from a fund administrator, is green", () => {
    expect(scorePricing(vault("none", "fund-administrator"), undefined).color).toBe("green");
  });
});

describe("verification (TECH_SPEC 6.3)", () => {
  const method = (m: Record<string, unknown>) =>
    asset({ verification: { methods: [{ type: "attestation", provider: "v", independent: true, assetLevel: true, frequency: "daily", cryptographicallyVerifiable: true, onchain: true, source: src, ...m }] } });

  test("5 of 5 is green", () => expect(scoreVerification(method({})).color).toBe("green"));
  test("3 of 5 is yellow", () => expect(scoreVerification(method({ onchain: false, cryptographicallyVerifiable: false })).color).toBe("yellow"));
  test("unstated frequency fails the daily test", () =>
    expect(scoreVerification(method({ frequency: "unstated", onchain: false, cryptographicallyVerifiable: false })).color).toBe("red"));
  test("self-reported only is red", () => expect(scoreVerification(method({ type: "self-reported" })).color).toBe("red"));
  test("no method is red", () => expect(scoreVerification(asset({ verification: { methods: [] } })).color).toBe("red"));
});

describe("exit (TECH_SPEC 6.4)", () => {
  const withRedemption = (r: Record<string, unknown>, instantLiquidity?: unknown[]) => {
    const base = asset();
    return asset({ exit: { redemption: { ...base.exit.redemption, ...r }, instantLiquidity: instantLiquidity ?? base.exit.instantLiquidity } });
  };

  test("T+1 with an instant path is green", () => expect(scoreExit(asset()).color).toBe("green"));
  test("T+3 is yellow", () => expect(scoreExit(withRedemption({ settlement: pub("T+3") })).color).toBe("yellow"));
  test("slower than T+5 is red", () => expect(scoreExit(withRedemption({ settlement: pub("T+7") })).color).toBe("red"));
  test("suspension at issuer discretion is red", () => expect(scoreExit(withRedemption({ gatesOrSuspension: pub("issuer-discretion") })).color).toBe("red"));
  test("unpublished settlement time is yellow", () => expect(scoreExit(withRedemption({ settlement: hidden })).color).toBe("yellow"));
  test("DEX depth under 2% of supply is not an instant path", () => {
    const dex = [{ type: "dex", label: "dex", chain: "ethereum", address: TOKEN, depthPctOfSupply: 0.4, source: src }];
    expect(scoreExit(withRedemption({}, dex)).reasons.map((r) => r.id)).toContain("exit.no-instant");
  });
});

describe("disclosure (TECH_SPEC 6.5)", () => {
  test("6 of 6 is green", () => expect(scoreDisclosure(asset()).color).toBe("green"));
  test("4 of 6 is yellow", () =>
    expect(scoreDisclosure(asset({ legal: { ...asset().legal, offeringDocument: hidden, auditedFinancials: hidden } })).color).toBe("yellow"));
  test("unknown counts as not public", () => {
    const sp = { custodian: { status: "unknown" }, fundAdministrator: hidden, auditor: hidden, transferAgent: hidden };
    expect(scoreDisclosure(asset({ serviceProviders: sp, legal: { ...asset().legal, offeringDocument: hidden } })).color).toBe("red");
  });
});

/** Phase 0 hand scores (research/<slug>.md, section M). The engine must agree with them on the committed data. */
const HAND_SCORES: Record<string, Partial<Record<SliceId, SliceColor>>> = {
  syrupusdc: { control: "red", pricing: "red", verification: "red", exit: "red", disclosure: "red", legal: "grey" },
};

describe("engine matches Phase 0 hand scores", () => {
  for (const [slug, expected] of Object.entries(HAND_SCORES)) {
    test(slug, () => {
      const a = loadAssets().find((x) => x.slug === slug)!;
      const score = scoreAsset(a, loadDiscovered(a).map((s) => s.discovered), loadLive(slug));
      const actual = Object.fromEntries(Object.keys(expected).map((k) => [k, score.slices[k as SliceId].color]));
      expect(actual).toEqual(expected);
    });
  }

  test("syrupUSDC's top risks are the pool delegate key, then the NAV it can write down", () => {
    const a = loadAssets().find((x) => x.slug === "syrupusdc")!;
    const score = scoreAsset(a, loadDiscovered(a).map((s) => s.discovered), loadLive("syrupusdc"));
    expect(score.risks.slice(0, 3).map((r) => r.id)).toEqual(["control.eoa.set-price", "control.eoa.allocate", "pricing.eoa"]);
  });
});
