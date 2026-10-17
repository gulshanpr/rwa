import { describe, expect, test } from "bun:test";
import { loadAssets, loadDiscovered, loadLive } from "../data";
import { AssetSchema, type Asset } from "../schema/asset";
import type { Discovered, Holder, Power } from "../schema/discovered";
import { analyzePowers, scoreControl } from "./control";
import { scoreDisclosure } from "./disclosure";
import { scoreExit } from "./exit";
import { scoreExitWindow } from "./exit-window";
import { fixFor } from "./fixes";
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
      methods: [{ type: "attestation", provider: "v", independent: true, assetLevel: true, frequency: "daily", publicReport: true, source: src }],
      reported: { value: { usd: 1000, asOf: checkedAt }, source: src },
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

  test("weekends don't count towards a business-day feed's age", () => {
    const live = (updatedAt: string) => ({ asset: "fixture", sample: false, asOf: "2026-10-12T12:00:00Z", supply: [], aum: { usd: 0, source: { name: "x", url: "https://x.y" } }, oracle: { chain: "ethereum" as const, address: TOKEN, value: 1, updatedAt }, defiMarkets: [], defiSource: { name: "x", url: "https://x.y" } });
    const ref = (businessDaysOnly: boolean) => ({ type: "oracle", provider: "p", chain: "ethereum", address: TOKEN, writer: "oracle-network", dataOrigin: "fund-administrator", cadenceSeconds: 86400, businessDaysOnly, historyOnchain: true, source: src });
    const friday = live("2026-10-09T21:00:00Z");
    expect(scorePricing(asset({ pricing: { reference: ref(true) } }), friday).color).toBe("green");
    expect(scorePricing(asset({ pricing: { reference: ref(false) } }), friday).color).toBe("yellow");
    const thursday = live("2026-10-08T00:00:00Z");
    expect(scorePricing(asset({ pricing: { reference: ref(true) } }), thursday).color).toBe("yellow");
    expect(scorePricing(asset({ pricing: { reference: ref(false) } }), thursday).color).toBe("red");
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

const liveWith = (usd: number, extra: Record<string, unknown> = {}) => ({
  asset: "fixture",
  sample: false,
  asOf: "2026-10-12T00:00:00Z",
  supply: [{ chain: "ethereum" as const, totalSupply: usd, priceUsd: 1, source: "x" }],
  aum: { usd, source: { name: "x", url: "https://x.y" } },
  defiMarkets: [],
  defiSource: { name: "x", url: "https://x.y" },
  ...extra,
});

describe("reserves", () => {
  const method = (m: Record<string, unknown>, reported?: unknown) =>
    asset({
      verification: {
        methods: [{ type: "attestation", provider: "v", independent: true, assetLevel: true, frequency: "daily", publicReport: true, source: src, ...m }],
        ...(reported === undefined ? { reported: { value: { usd: 1000, asOf: checkedAt }, source: src } } : reported === null ? {} : { reported }),
      },
    });

  test("4 report tests plus a matching reconciliation is green", () => expect(scoreVerification(method({}), liveWith(1020)).color).toBe("green"));
  test("onchain value more than 5% off the reported total fails reconciliation", () => {
    const r = scoreVerification(method({}), liveWith(800));
    expect(r.color).toBe("yellow");
    expect(r.reasons.map((x) => x.id)).toContain("verification.reconciles");
  });
  test("a reported total older than 45 days can't reconcile", () => {
    const old = { value: { usd: 1000, asOf: "2026-06-01" }, source: src };
    expect(scoreVerification(method({}, old), liveWith(1000)).reasons[0]!.text).toContain("too old");
  });
  test("unread native chains are named when supply falls short", () => {
    const a = asset({ ...method({}), otherChains: [{ chain: "solana", issuance: "native", source: src }] });
    expect(scoreVerification(a, liveWith(500)).reasons[0]!.text).toContain("solana");
  });
  test("weekly passes the frequency test, monthly doesn't", () => {
    expect(scoreVerification(method({ frequency: "weekly" }), liveWith(1000)).color).toBe("green");
    expect(scoreVerification(method({ frequency: "monthly" }), liveWith(1000)).color).toBe("yellow");
  });
  test("a report that isn't public fails a test", () => expect(scoreVerification(method({ publicReport: false }), liveWith(1000)).color).toBe("yellow"));
  test("2 of 5 is red", () =>
    expect(scoreVerification(method({ assetLevel: false, frequency: "unstated", publicReport: false }), liveWith(1000)).color).toBe("red"));
  test("self-reported only is red", () => expect(scoreVerification(method({ type: "self-reported" }), liveWith(1000)).color).toBe("red"));
  test("no method is red", () => expect(scoreVerification(asset({ verification: { methods: [] } })).color).toBe("red"));
  test("private credit with nothing public about the loan book is capped at yellow", () => {
    const a = asset({ ...method({}), assetClass: "private-credit" });
    const r = scoreVerification(a, liveWith(1000));
    expect(r.color).toBe("yellow");
    expect(r.reasons.map((x) => x.id)).toContain("verification.portfolio.loan-level");
  });
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

describe("disclosure", () => {
  test("8 of 9 points (regulator unknown) is green", () => expect(scoreDisclosure(asset()).color).toBe("green"));
  test("missing offering document and financials (4 points) is yellow", () =>
    expect(scoreDisclosure(asset({ legal: { ...asset().legal, offeringDocument: hidden, auditedFinancials: hidden } })).color).toBe("yellow"));
  test("the offering document counts double", () =>
    expect(scoreDisclosure(asset({ legal: { ...asset().legal, offeringDocument: hidden } })).headline).toBe("6 of 9 disclosure points are public."));
  test("unknown counts as not public", () => {
    const sp = { custodian: { status: "unknown" }, fundAdministrator: hidden, auditor: hidden, transferAgent: hidden };
    expect(scoreDisclosure(asset({ serviceProviders: sp, legal: { ...asset().legal, offeringDocument: hidden } })).color).toBe("red");
  });
});

/**
 * Phase 0 hand scores (research/<slug>.md, section M), updated for framework v0.4. The engine must agree with
 * them on the committed data. What v0.4 changed against the original hand scores:
 * - Reserves: Chronicle proof-of-asset is no longer used, so USTB and JTRSY drop to red (their only remaining
 *   report is self-reported or none). syrupUSDC's Network Firm report now passes 3 of 5 (independent,
 *   asset-level, public), so it is yellow.
 * - OUSG: its 2-of-6 price setter is capped at 2% a day by the contract, so Control is yellow. Its instant
 *   redemption facility has no measured liquidity, so Redemption is yellow, not green.
 * - USYC: the CIMA registration counts as a disclosure point, which doesn't change its color.
 * - Exit window is new: every reviewed asset can be upgraded or have roles granted with no notice.
 */
const HAND_SCORES: Record<string, Partial<Record<SliceId, SliceColor>>> = {
  syrupusdc: { control: "red", "exit-window": "red", pricing: "red", verification: "yellow", exit: "red", disclosure: "red", legal: "grey" },
  ustb: { control: "red", "exit-window": "red", pricing: "red", verification: "red", exit: "yellow", disclosure: "yellow", legal: "grey" },
  ousg: { control: "yellow", "exit-window": "red", pricing: "yellow", verification: "red", exit: "yellow", disclosure: "red", legal: "grey" },
  usyc: { control: "red", "exit-window": "red", pricing: "red", verification: "red", exit: "yellow", disclosure: "yellow", legal: "grey" },
  jtrsy: { control: "red", "exit-window": "red", pricing: "red", verification: "red", exit: "red", disclosure: "yellow", legal: "grey" },
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

  test("syrupUSDC's top risks are the pool delegate key, no notice before upgrades, then the NAV it can write down", () => {
    const a = loadAssets().find((x) => x.slug === "syrupusdc")!;
    const score = scoreAsset(a, loadDiscovered(a).map((s) => s.discovered), loadLive("syrupusdc"));
    expect(score.risks.slice(0, 4).map((r) => r.id)).toEqual(["control.eoa.set-price", "control.eoa.allocate", "exit-window.none", "pricing.eoa"]);
  });
});

describe("control bounds, bridges and missing discovery", () => {
  const bound = (maxMovePctPerDay: number, holderCanRemove = false) => ({
    chain: "ethereum" as const, contract: TOKEN, power: "set-price" as const, maxMovePctPerDay, holderCanRemove, description: "cap", source: src,
  });
  const rows = (b: ReturnType<typeof bound>[]) => analyzePowers([discovered([["set-price", EOA]], { [EOA]: { kind: "eoa" } })], b);

  test("a tight bound the holder can't lift turns red into yellow", () => {
    const r = scoreControl(rows([bound(1)]), "FIX");
    expect(r.color).toBe("yellow");
    expect(r.reasons[0]!.id).toBe("control.bounded.set-price");
  });
  test("a loose bound doesn't count", () => expect(scoreControl(rows([bound(9)]), "FIX").color).toBe("red"));
  test("a bound the holder can lift doesn't count", () => expect(scoreControl(rows([bound(1, true)]), "FIX").color).toBe("red"));

  test("a bridge contract that can mint is flagged", () => {
    const BRIDGE = "0x0000000000000000000000000000000000000005";
    const d = discovered([["mint", BRIDGE]], { [BRIDGE]: { kind: "contract", name: "TokenBridge", controllers: [SAFE] }, [SAFE]: safe(3, 5) });
    const r = scoreControl(analyzePowers([d]), "FIX", { discovered: [d] });
    expect(r.reasons.some((x) => x.id.startsWith("control.bridge."))).toBe(true);
  });
  test("tokens bridged to other chains are flagged", () => {
    const d = discovered([], {});
    const r = scoreControl([], "FIX", { discovered: [d], otherChains: [{ chain: "base", issuance: "lock-and-mint", bridge: "Chainlink CCIP", source: src }] });
    expect(r.color).toBe("yellow");
    expect(r.headline).toContain("Chainlink CCIP");
  });
  test("an unverified contract with critical powers is flagged", () => {
    const d = discovered([["mint", SAFE]], { [SAFE]: safe(3, 5) });
    d.contracts[TOKEN]!.verified = false;
    const r = scoreControl(analyzePowers([d]), "FIX", { discovered: [d] });
    expect(r.reasons.some((x) => x.id.startsWith("control.unverified"))).toBe(true);
  });
  test("no discovery snapshot is grey, not green", () => expect(scoreControl([], "FIX", { discovered: [] }).color).toBe("grey"));
});

describe("exit window", () => {
  const w = (holders: Record<string, Holder>, holder: string, settlement = "T+1") =>
    scoreExitWindow(
      asset({ exit: { ...asset().exit, redemption: { ...asset().exit.redemption, settlement: pub(settlement) } } }),
      analyzePowers([discovered([["upgrade", holder]], holders)]),
      true,
    );

  test("an EOA that can upgrade gives no notice: red", () => expect(w({ [EOA]: { kind: "eoa" } }, EOA).color).toBe("red"));
  test("a 2-day timelock against T+3 redemption is red", () =>
    expect(w({ [TIMELOCK]: timelock(2), [SAFE]: safe(3, 5) }, TIMELOCK, "T+3").color).toBe("red"));
  test("a 3-day timelock against T+1 redemption leaves 2 days: yellow", () =>
    expect(w({ [TIMELOCK]: timelock(3), [SAFE]: safe(3, 5) }, TIMELOCK).color).toBe("yellow"));
  test("a 10-day timelock against T+1 redemption leaves 9 days: green", () =>
    expect(w({ [TIMELOCK]: timelock(10), [SAFE]: safe(3, 5) }, TIMELOCK).color).toBe("green"));
  test("nothing can upgrade or grant roles: green", () => expect(scoreExitWindow(asset(), [], true).color).toBe("green"));
  test("no discovery: grey", () => expect(scoreExitWindow(asset(), [], false).color).toBe("grey"));
});

describe("NAV for private credit", () => {
  const credit = (valuation?: unknown) => asset({ assetClass: "private-credit", pricing: { ...asset().pricing, ...(valuation ? { valuation } : {}) } });
  test("unknown valuer and write-down policy are yellow", () => {
    const r = scorePricing(credit(), undefined);
    expect(r.color).toBe("yellow");
    expect(r.reasons.map((x) => x.id)).toEqual(expect.arrayContaining(["pricing.valuer-unknown", "pricing.impairment-policy"]));
  });
  test("an independent valuer with a public policy adds nothing", () =>
    expect(scorePricing(credit({ valuer: pub("independent-agent"), impairmentPolicy: pub("90 days past due") }), undefined).color).toBe("green"));
  test("an EOA writer under a tight cap is yellow, not red", () => {
    const ref = { type: "oracle", provider: "p", chain: "ethereum", address: TOKEN, writer: "eoa", dataOrigin: "fund-administrator", cadenceSeconds: 86400, historyOnchain: true, source: src };
    const capped = asset({ pricing: { reference: ref }, bounds: [{ chain: "ethereum", contract: TOKEN, power: "set-price", maxMovePctPerDay: 1, holderCanRemove: false, description: "cap", source: src }] });
    expect(scorePricing(capped, undefined).color).toBe("yellow");
  });
});

describe("stages and fixes", () => {
  const score = (a: Asset, holders: Record<string, Holder>, perms: [Power, string][]) => scoreAsset(a, [discovered(perms, holders)], liveWith(1000));

  test("a fully green asset with a long timelock is Stage 2", () => {
    const tl = { [TIMELOCK]: timelock(10), [SAFE]: safe(3, 5) };
    expect(score(asset(), tl, [["upgrade", TIMELOCK], ["mint", TIMELOCK]]).stage.stage).toBe(2);
  });
  test("a single key with a critical power keeps it at Stage 0", () => {
    const r = score(asset(), { [EOA]: { kind: "eoa" } }, [["mint", EOA]]);
    expect(r.stage.stage).toBe(0);
    expect(r.stage.next.map((x) => x.id)).toContain("s1-no-single-key");
  });
  test("no discovery is not assessed", () => expect(scoreAsset(asset(), [], undefined).stage.assessed).toBe(false));
  test("every reason the engine produces has a fix", () => {
    for (const a of loadAssets()) {
      const s = scoreAsset(a, loadDiscovered(a).map((x) => x.discovered), loadLive(a.slug));
      for (const r of s.risks) expect([r.id, fixFor(r.id) ?? r.fix]).toEqual([r.id, expect.any(String)]);
    }
  });
});

describe("look-through", () => {
  test("a fund holding a token with red Control gets a yellow finding", () => {
    const under = scoreAsset(asset(), [discovered([["mint", EOA]], { [EOA]: { kind: "eoa" } })], undefined);
    const holder = asset({ holdings: [{ asset: "under", sharePct: 30, source: src }] });
    const tl = { [TIMELOCK]: timelock(10), [SAFE]: safe(3, 5) };
    const r = scoreAsset(holder, [discovered([["upgrade", TIMELOCK]], tl)], liveWith(1000), new Map([["under", { ticker: "UND", score: under }]]));
    expect(r.slices.control.color).toBe("yellow");
    expect(r.slices.control.reasons.map((x) => x.id)).toContain("control.look-through.under");
  });
});
