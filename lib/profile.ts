import { cache } from "react";
import { getSiteCatalog, type Catalog } from "./catalog";
import type { DiscoverySnapshot } from "./data";
import { loadMeasured } from "./data";
import { rateAsset, type FrameworkRating, type Tone } from "./framework";
import { analyzePowers, holderLabel, isSingleKey, lookupHolder, type PowerRow } from "./framework/permissions";
import { getAlerts, getLive } from "./live-store";
import { oracleAge, type OracleAge } from "./oracle";
import type { Asset } from "./schema/asset";
import type { Power } from "./schema/discovered";
import type { Entity } from "./schema/entity";
import type { Alert, Live } from "./schema/live";
import type { Measured } from "./schema/measured";

export { ASSET_CLASSES, assetClassFromPath } from "./labels";

export interface Flag {
  id: "eoa-upgrade" | "eoa-critical" | "eoa-high" | "no-upgrade-timelock" | "price-stale" | "defi-fixed" | "unclassified";
  label: string;
  color: Tone;
}

export interface AssetStats {
  aumUsd?: number;
  aumDelta30d?: number;
  adminRoles: number;
  singleKeyPowers: number;
  singleKeyOther: Power[];
  oracle?: OracleAge;
  defiCollateralUsd: number;
  defiBorrowUsd: number;
  defiMarkets: number;
}

export interface AssetProfile {
  asset: Asset;
  sample: boolean;
  entities: { issuer?: Entity; manager?: Entity; platform?: Entity };
  /** Display names for every entity slug, so pages can name custodians, auditors and providers. */
  entityNames: Record<string, string>;
  /** Every entity by slug, for regulation and auditor details. */
  entityInfo: Record<string, Entity>;
  snapshots: DiscoverySnapshot[];
  live?: Live;
  measured?: Measured;
  rating: FrameworkRating;
  powers: PowerRow[];
  stats: AssetStats;
  flags: Flag[];
  alerts: Alert[];
}

export function nameOf(profile: AssetProfile, slug: string): string {
  return profile.entityNames[slug] ?? slug;
}

function computeFlags(powers: PowerRow[], live: Live | undefined, stats: AssetStats): Flag[] {
  const flags: Flag[] = [];
  const single = (r: PowerRow) => isSingleKey(r.holder);
  if (powers.some((r) => r.power === "upgrade" && single(r)))
    flags.push({ id: "eoa-upgrade", label: "Single key can upgrade", color: "red" });
  else if (powers.some((r) => r.criticality === "critical" && single(r)))
    flags.push({ id: "eoa-critical", label: "Single-key critical power", color: "red" });
  const high = powers.filter((r) => r.criticality === "high" && single(r));
  if (high.length > 0)
    flags.push({ id: "eoa-high", label: "Single key can freeze/pause", color: high.some((r) => r.power === "freeze") ? "red" : "yellow" });
  if (powers.some((r) => r.power === "upgrade" && !single(r) && r.holder.delaySeconds === 0))
    flags.push({ id: "no-upgrade-timelock", label: "No upgrade timelock", color: "yellow" });
  if (stats.oracle && stats.oracle.scheduledAgeSeconds > 86400)
    flags.push({ id: "price-stale", label: "Price stale > 24h", color: "red" });
  if (live?.defiMarkets.some((m) => m.oracle.type === "fixed"))
    flags.push({ id: "defi-fixed", label: "Fixed $1 in DeFi", color: "yellow" });
  if (powers.some((r) => r.criticality === "unclassified"))
    flags.push({ id: "unclassified", label: "Unreviewed function", color: "grey" });
  return flags;
}

function buildProfile(asset: Asset, catalog: Catalog, live: Live | undefined, alerts: Alert[]): AssetProfile {
  const { entities } = catalog;
  const snapshots = catalog.snapshots.get(asset.slug) ?? [];
  const discovered = snapshots.map((s) => s.discovered);
  const powers = analyzePowers(discovered);
  const measured = loadMeasured(asset.slug);
  const rating = rateAsset({ asset, discovered, live, measured, entities });

  const stats: AssetStats = {
    aumUsd: live?.aum.usd,
    aumDelta30d: live?.aum.usd30dAgo ? live.aum.usd / live.aum.usd30dAgo - 1 : undefined,
    adminRoles: powers.filter((r) => r.criticality !== "unclassified").length,
    singleKeyPowers: powers.filter((r) => r.criticality === "critical" && isSingleKey(r.holder)).length,
    singleKeyOther: powers.filter((r) => r.criticality === "high" && isSingleKey(r.holder)).map((r) => r.power),
    oracle: oracleAge(asset, live),
    defiCollateralUsd: live?.defiMarkets.reduce((s, m) => s + m.collateralUsd, 0) ?? 0,
    defiBorrowUsd: live?.defiMarkets.reduce((s, m) => s + m.borrowUsd, 0) ?? 0,
    defiMarkets: live?.defiMarkets.length ?? 0,
  };

  return {
    asset,
    sample: asset.sample || snapshots.some((s) => s.meta.sample),
    entities: {
      issuer: entities.get(asset.issuer),
      manager: entities.get(asset.manager),
      platform: entities.get(asset.platform),
    },
    entityNames: Object.fromEntries([...entities.values()].map((e) => [e.slug, e.name])),
    entityInfo: Object.fromEntries(entities),
    snapshots,
    live,
    measured,
    rating,
    powers,
    stats,
    flags: computeFlags(powers, live, stats),
    alerts: alerts.filter((a) => a.asset === asset.slug),
  };
}

// Deduplicated per request; live data and alerts may come from Postgres.
export const getProfiles = cache(async (): Promise<AssetProfile[]> => {
  const catalog = await getSiteCatalog();
  const { assets } = catalog;
  const [lives, alerts] = await Promise.all([Promise.all(assets.map(getLive)), getAlerts()]);
  return assets
    .map((asset, i) => buildProfile(asset, catalog, lives[i], alerts))
    .sort((a, b) => (b.stats.aumUsd ?? 0) - (a.stats.aumUsd ?? 0));
});

export async function getProfile(slug: string): Promise<AssetProfile | undefined> {
  return (await getProfiles()).find((p) => p.asset.slug === slug);
}

export function addressLabel(profile: AssetProfile, address: string): string | undefined {
  for (const d of profile.asset.deployments) {
    const hit = Object.entries(d.discovery.labels).find(([k]) => k.toLowerCase() === address.toLowerCase());
    if (hit) return hit[1];
  }
  for (const s of profile.snapshots) {
    const c = Object.entries(s.discovered.contracts).find(([k]) => k.toLowerCase() === address.toLowerCase());
    if (c) return `${profile.asset.ticker} ${c[1].name}`;
  }
  return undefined;
}

export interface SearchAsset {
  slug: string;
  ticker: string;
  name: string;
  issuer: string;
  aumUsd: number | null;
  /** Lowercased name, issuer and platform, matched by substring. */
  terms: string;
}

/** Tuples keep the index small: it ships with every page. `asset` indexes SearchIndex.assets. */
export type SearchAddress = [address: string, label: string | null, role: string, asset: number];

export interface SearchIndex {
  assets: SearchAsset[];
  addresses: SearchAddress[];
}

export async function searchIndex(): Promise<SearchIndex> {
  const profiles = await getProfiles();
  const assets: SearchAsset[] = profiles.map((p) => {
    const issuer = p.entities.manager?.name ?? p.asset.manager;
    return {
      slug: p.asset.slug,
      ticker: p.asset.ticker,
      name: p.asset.name,
      issuer,
      aumUsd: p.stats.aumUsd ?? null,
      terms: [p.asset.name, issuer, p.entities.platform?.name ?? p.asset.platform].join(" ").toLowerCase(),
    };
  });
  const addresses: SearchAddress[] = [];
  profiles.forEach((p, i) => {
    // One entry per address per asset: snapshots list the same address in checksum and lower case, and on several chains.
    const seen = new Set<string>();
    for (const s of p.snapshots) {
      for (const address of [...Object.keys(s.discovered.contracts), ...Object.keys(s.discovered.holders)]) {
        if (seen.has(address.toLowerCase())) continue;
        seen.add(address.toLowerCase());
        const holder = lookupHolder(s.discovered, address);
        const contract = s.discovered.contracts[address];
        const label = addressLabel(p, address) ?? contract?.name ?? null;
        addresses.push([address, label, holder ? holderLabel(holder) : "Contract", i]);
      }
    }
  });
  return { assets, addresses };
}
