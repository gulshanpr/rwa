import { CATEGORY_LABELS, CATEGORY_ORDER, type CategoryId, type Color, type Rating } from "./framework";
import type { Stage } from "./framework/stages";
import { ASSET_CLASSES, getProfiles, type AssetProfile, type Flag } from "./profile";
import type { AssetClass, Chain } from "./schema/asset";

export interface CategoryCell {
  rating: Rating;
  floor?: Color;
  headline: string;
}

export interface AssetRow {
  slug: string;
  ticker: string;
  name: string;
  manager: string;
  platform: string;
  assetClass: AssetClass;
  assetClassLabel: string;
  aumUsd: number | null;
  chains: Chain[];
  categories: Record<CategoryId, CategoryCell>;
  /** null: below Stage 0. */
  stage: Stage | null;
  onchainData: boolean;
  flags: Flag[];
  singleKeyPowers: number;
  oracleAgeSeconds: number | null;
  defiCollateralUsd: number;
  topRisk: string | null;
}

function toRow(p: AssetProfile): AssetRow {
  const { rating } = p;
  return {
    slug: p.asset.slug,
    ticker: p.asset.ticker,
    name: p.asset.name,
    manager: p.entities.manager?.name ?? p.asset.manager,
    platform: p.entities.platform?.name ?? p.asset.platform,
    assetClass: p.asset.assetClass,
    assetClassLabel: ASSET_CLASSES[p.asset.assetClass].label,
    aumUsd: p.stats.aumUsd ?? null,
    chains: p.asset.deployments.map((d) => d.chain),
    categories: Object.fromEntries(
      CATEGORY_ORDER.map((c) => {
        const r = rating.categories[c];
        return [c, { rating: r.rating, ...(r.floor ? { floor: r.floor } : {}), headline: r.headline }];
      }),
    ) as AssetRow["categories"],
    stage: rating.stage.stage,
    onchainData: rating.onchainData,
    flags: p.flags,
    singleKeyPowers: p.stats.singleKeyPowers,
    oracleAgeSeconds: p.stats.oracle?.ageSeconds ?? null,
    defiCollateralUsd: p.stats.defiCollateralUsd,
    topRisk: rating.risks[0]?.text ?? null,
  };
}

export async function assetRows(): Promise<AssetRow[]> {
  return (await getProfiles()).map(toRow);
}

const RATINGS: Rating[] = ["green", "yellow", "red", "unverified", "not-assessed"];

export interface CategoryDistribution {
  category: CategoryId;
  label: string;
  byValue: Record<Rating, number>;
  byCount: Record<Rating, number>;
}

export function categoryDistribution(rows: AssetRow[]): CategoryDistribution[] {
  return CATEGORY_ORDER.map((category) => {
    const byValue = Object.fromEntries(RATINGS.map((r) => [r, 0])) as Record<Rating, number>;
    const byCount = { ...byValue };
    for (const r of rows) {
      const rating = r.categories[category].rating;
      byValue[rating] += r.aumUsd ?? 0;
      byCount[rating] += 1;
    }
    return { category, label: CATEGORY_LABELS[category], byValue, byCount };
  });
}

export interface Share {
  label: string;
  value: number;
  tickers: string[];
}

/** Tracked value grouped by `key`, largest first. */
export function valueBy(rows: AssetRow[], key: (r: AssetRow) => string): Share[] {
  const groups = new Map<string, Share>();
  for (const r of rows) {
    const label = key(r);
    const g = groups.get(label) ?? { label, value: 0, tickers: [] };
    g.value += r.aumUsd ?? 0;
    g.tickers.push(r.ticker);
    groups.set(label, g);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}
