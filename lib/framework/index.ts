import type { Asset } from "../schema/asset";
import type { Discovered } from "../schema/discovered";
import type { Entity } from "../schema/entity";
import type { Live } from "../schema/live";
import type { Measured } from "../schema/measured";
import { rateControl } from "./control";
import { rateCounterparties } from "./counterparties";
import { exitLiquidity, rateExit, type ExitLiquidity } from "./exit";
import { ratePricing } from "./pricing";
import { rateStage, type StageResult } from "./stages";
import { hasOnchainData, rateTransparency } from "./transparency";
import { CATEGORY_ORDER, notAssessed, risksOf, type CategoryId, type CategoryResult, type Finding } from "./types";
import { governmentPct, rateUnderlying } from "./underlying";

// RWAbeat framework (docs/framework.md): seven categories rated green / yellow / red / unverified, plus
// Stages. Inputs are the curated asset profile, discovered permissions, live data and market measurements.

export interface FrameworkInput {
  asset: Asset;
  discovered: Discovered[];
  live?: Live;
  measured?: Measured;
  /** data/entities, for provider names, regulation and auditor tier. */
  entities: Map<string, Entity>;
  now?: Date;
}

export interface FrameworkRating {
  asset: string;
  categories: Record<CategoryId, CategoryResult>;
  /** Red, unknown and yellow findings across categories, worst first. */
  risks: Finding[];
  stage: StageResult;
  onchainData: boolean;
  metrics: {
    governmentPct?: number;
    wamDays?: number;
    top10HoldersPct?: number;
    liquidity: ExitLiquidity;
  };
}

const LEGAL_NOT_ASSESSED = notAssessed(
  "legal",
  "Not assessed yet. Bankruptcy remoteness, what the token legally is, and holder rights need a legal review.",
);

export function rateAsset(input: FrameworkInput): FrameworkRating {
  const { asset, discovered, live, measured } = input;
  const now = input.now ?? new Date();
  const u = asset.underlying;
  const categories: Record<CategoryId, CategoryResult> = {
    underlying: rateUnderlying(asset, now),
    legal: LEGAL_NOT_ASSESSED,
    counterparties: rateCounterparties(asset, input.entities),
    control: rateControl(asset, discovered, now),
    transparency: rateTransparency(asset),
    pricing: ratePricing(asset, live, measured),
    exit: rateExit(asset, measured),
  };
  return {
    asset: asset.slug,
    categories,
    risks: risksOf(CATEGORY_ORDER.map((c) => categories[c])),
    stage: rateStage(asset, discovered, measured),
    onchainData: hasOnchainData(asset),
    metrics: {
      governmentPct: u.holdings.status === "public" ? governmentPct(u.holdings.value.items) : undefined,
      wamDays: u.wamDays.status === "public" ? u.wamDays.value : undefined,
      top10HoldersPct: measured?.holders?.top10Pct,
      liquidity: exitLiquidity(asset, measured),
    },
  };
}

export * from "./types";
