import type { Asset } from "../schema/asset";
import type { Discovered } from "../schema/discovered";
import type { Measured } from "../schema/measured";
import { exitLiquidity, REAL_LIQUIDITY_USD } from "./exit";
import { analyzePowers, CRITICAL_POWERS, isSingleKey } from "./permissions";
import { bestReport, reportTests } from "./transparency";

export type Stage = 0 | 1 | 2;

export interface Requirement {
  id: string;
  stage: Stage;
  text: string;
  status: "met" | "unmet" | "not-assessed";
}

export interface StageResult {
  /** null: below Stage 0, so the minimum disclosure for a rating isn't there. */
  stage: Stage | null;
  /** The next stage is held back only by legal checks, which aren't assessed yet. */
  pendingLegal: boolean;
  requirements: Requirement[];
}

export function rateStage(asset: Asset, discovered: Discovered[], measured: Measured | undefined): StageResult {
  const c = asset.counterparties;
  const rows = analyzePowers(discovered).filter((r) => r.criticality !== "unclassified");
  const best = bestReport(asset);
  const tests = best && reportTests(best, asset.freshnessClass.value);
  const r = asset.exit.redemption;
  const ref = asset.pricing.reference;
  const independentParty = (key: "custodian" | "fundAdministrator", role: "custodian" | "fund-administrator") =>
    c[key].status === "public" && !c.affiliated.value.includes(role);

  const req: [Stage, string, string, boolean | "not-assessed"][] = [
    [0, "holdings", "What the token holds is described publicly", asset.underlying.holdings.status === "public"],
    [0, "parties", "Issuer, custodian, administrator and auditor are named", [c.custodian, c.fundAdministrator, c.auditor].every((s) => s.status === "public")],
    [0, "structure", "The legal structure is documented", asset.legal.vehicleType.status === "public" && asset.legal.jurisdiction.status === "public"],
    [0, "verified", "Smart contracts are verified onchain", discovered.length > 0 && discovered.every((d) => Object.values(d.contracts).every((c) => c.verified))],

    [1, "bankruptcy-remote", "Bankruptcy-remote structure", "not-assessed"],
    [1, "independent-custody", "Independent custodian and administrator", independentParty("custodian", "custodian") && independentParty("fundAdministrator", "fund-administrator")],
    [1, "independent-verification", "Holdings independently verified, at a pace that fits the asset", Boolean(tests?.independent && tests.verified && tests.fresh)],
    [1, "multisig", "Admin powers held by a multisig, with a documented policy", rows.length > 0 && !rows.some((x) => isSingleKey(x.holder)) && asset.control.powersDocumented.value],
    [1, "redemption-path", "A documented redemption path", r.available.value && r.settlement.status === "public"],

    [2, "trustee", "An independent trustee who can act for holders", "not-assessed"],
    [2, "verifiable-holdings", "Holdings data that anyone can verify", asset.transparency.reports.some((x) => x.verifiability === "cryptographic")],
    [2, "timelock", "Admin changes behind a timelock, so holders can exit first", rows.filter((x) => CRITICAL_POWERS.includes(x.power)).every((x) => x.holder.delaySeconds > 0)],
    [
      2,
      "exit-without-issuer",
      "An exit that works without the issuer's goodwill, and liquidators can hold the token",
      exitLiquidity(asset, measured).dexUsd >= REAL_LIQUIDITY_USD && asset.exit.liquidators.value === "anyone",
    ],
    [2, "independent-pricing", "Pricing from an independent source", ref.type !== "none" && ref.dataOrigin !== "issuer" && ref.writer !== "eoa" && ref.writer !== "issuer-multisig"],
  ];

  const requirements: Requirement[] = req.map(([stage, id, text, ok]) => ({
    id: `stage.${id}`,
    stage,
    text,
    status: ok === "not-assessed" ? "not-assessed" : ok ? "met" : "unmet",
  }));

  const met = (s: Stage) => requirements.filter((x) => x.stage === s).every((x) => x.status === "met");
  const stage: Stage | null = !met(0) ? null : !met(1) ? 0 : !met(2) ? 1 : 2;
  const next = stage === null ? 0 : stage + 1;
  const blockers = requirements.filter((x) => x.stage === next && x.status !== "met");
  const pendingLegal = blockers.length > 0 && blockers.every((x) => x.status === "not-assessed");

  return { stage, pendingLegal, requirements };
}
