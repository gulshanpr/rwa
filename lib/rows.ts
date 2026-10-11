import type { Chain, AssetClass } from "./schema/asset";
import { ASSET_CLASSES, getProfiles, type AssetProfile, type Flag } from "./profile";
import { SLICE_ORDER, SLICE_LABELS, type SliceColor, type SliceId } from "./scoring/types";

export interface AssetRow {
  slug: string;
  ticker: string;
  name: string;
  manager: string;
  assetClass: AssetClass;
  assetClassLabel: string;
  aumUsd: number | null;
  chains: Chain[];
  slices: Record<SliceId, { color: SliceColor; headline: string }>;
  flags: Flag[];
  singleKeyPowers: number;
  oracleAgeSeconds: number | null;
  defiCollateralUsd: number;
  topRisk: string | null;
}

export function toRow(p: AssetProfile): AssetRow {
  return {
    slug: p.asset.slug,
    ticker: p.asset.ticker,
    name: p.asset.name,
    manager: p.entities.manager?.name ?? p.asset.manager,
    assetClass: p.asset.assetClass,
    assetClassLabel: ASSET_CLASSES[p.asset.assetClass].label,
    aumUsd: p.stats.aumUsd ?? null,
    chains: p.asset.deployments.map((d) => d.chain),
    slices: Object.fromEntries(
      SLICE_ORDER.map((s) => [s, { color: p.score.slices[s].color, headline: p.score.slices[s].headline }]),
    ) as AssetRow["slices"],
    flags: p.flags,
    singleKeyPowers: p.stats.singleKeyPowers,
    oracleAgeSeconds: p.stats.oracle?.ageSeconds ?? null,
    defiCollateralUsd: p.stats.defiCollateralUsd,
    topRisk: p.score.risks[0]?.text ?? null,
  };
}

export async function assetRows(): Promise<AssetRow[]> {
  return (await getProfiles()).map(toRow);
}

export interface SliceDistribution {
  slice: SliceId;
  label: string;
  byValue: Record<SliceColor, number>;
  byCount: Record<SliceColor, number>;
}

export function sliceDistribution(rows: AssetRow[]): SliceDistribution[] {
  return SLICE_ORDER.map((slice) => {
    const byValue = { green: 0, yellow: 0, red: 0, grey: 0 };
    const byCount = { green: 0, yellow: 0, red: 0, grey: 0 };
    for (const r of rows) {
      const c = r.slices[slice].color;
      byValue[c] += r.aumUsd ?? 0;
      byCount[c] += 1;
    }
    return { slice, label: SLICE_LABELS[slice], byValue, byCount };
  });
}

export function rowsToCsv(rows: AssetRow[]): string {
  const header = [
    "slug",
    "ticker",
    "name",
    "manager",
    "asset_class",
    "aum_usd",
    "chains",
    ...SLICE_ORDER.map((s) => `${s}_color`),
    "single_key_powers",
    "oracle_age_seconds",
    "defi_collateral_usd",
    "flags",
    "top_risk",
  ];
  const lines = rows.map((r) =>
    [
      r.slug,
      r.ticker,
      r.name,
      r.manager,
      r.assetClass,
      r.aumUsd ?? "",
      r.chains.join(";"),
      ...SLICE_ORDER.map((s) => r.slices[s].color),
      r.singleKeyPowers,
      r.oracleAgeSeconds ?? "",
      r.defiCollateralUsd,
      r.flags.map((f) => f.label).join(";"),
      r.topRisk ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

export function csvCell(v: unknown): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
