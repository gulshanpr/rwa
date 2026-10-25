import type { Asset } from "../schema/asset";
import type { Discovered } from "../schema/discovered";
import type { Live } from "../schema/live";
import { rateControl } from "./control";
import { rateCounterparties } from "./counterparties";
import { exitLiquidity, rateExit, type ExitLiquidity } from "./exit";
import { ratePricing } from "./pricing";
import type { EntityFacts, Framework, Measured } from "./schema";
import { rateStage, type StageResult } from "./stages";
import { hasOnchainData, rateTransparency } from "./transparency";
import { notAssessed, type CategoryId, type CategoryResult } from "./types";
import { governmentPct, rateUnderlying } from "./underlying";

// RWAbeat framework (docs/framework.md): seven categories, rated green / yellow / red / unverified, plus
// Stages. Separate from lib/scoring (the six-slice rosette); it reads the same asset, discovery and
// live data, plus its own data in data/framework.

export interface FrameworkInput {
  asset: Asset;
  framework: Framework;
  discovered: Discovered[];
  live?: Live;
  measured?: Measured;
  entityFacts: Map<string, EntityFacts>;
  /** Display names by entity slug. */
  entityNames: Record<string, string>;
  now?: Date;
}

export interface FrameworkRating {
  asset: string;
  categories: Record<CategoryId, CategoryResult>;
  stage: StageResult;
  onchainData: boolean;
  metrics: {
    governmentPct?: number;
    wamDays?: number;
    top10HoldersPct?: number;
    liquidity: ExitLiquidity;
  };
}

export const LEGAL_NOT_ASSESSED = notAssessed(
  "legal",
  "Not assessed yet. Bankruptcy remoteness, what the token legally is, and holder rights need a legal review.",
);

export function rateAsset(input: FrameworkInput): FrameworkRating {
  const { asset, framework: fw, discovered, live, measured } = input;
  const now = input.now ?? new Date();
  const u = fw.underlying;
  return {
    asset: asset.slug,
    categories: {
      underlying: rateUnderlying(fw, now),
      legal: LEGAL_NOT_ASSESSED,
      counterparties: rateCounterparties(fw, input.entityFacts, input.entityNames),
      control: rateControl(asset, fw, discovered, now),
      transparency: rateTransparency(fw),
      pricing: ratePricing(asset, fw, live, measured),
      exit: rateExit(asset, fw, measured),
    },
    stage: rateStage(asset, fw, discovered, measured),
    onchainData: hasOnchainData(fw),
    metrics: {
      governmentPct: u.holdings.status === "public" ? governmentPct(u.holdings.value.items) : undefined,
      wamDays: u.wamDays.status === "public" ? u.wamDays.value : undefined,
      top10HoldersPct: measured?.holders?.top10Pct,
      liquidity: exitLiquidity(fw, measured),
    },
  };
}

export * from "./types";
