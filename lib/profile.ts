import { loadAlerts, loadAssets, loadDiscovered, loadEntities, loadLive, type DiscoverySnapshot } from "./data";
import type { Asset, AssetClass } from "./schema/asset";
import type { Power } from "./schema/discovered";
import type { Entity } from "./schema/entity";
import type { Alert, Live } from "./schema/live";
import { scoreAsset, type AssetScore, type SliceColor } from "./scoring";
import { analyzePowers, holderLabel, lookupHolder, type PowerRow } from "./scoring/control";
import { oracleAge, type OracleAge } from "./scoring/pricing";
import { formatUsd, shortAddress } from "./format";

export const ASSET_CLASSES: Record<AssetClass, { label: string; short: string; path: string }> = {
  "us-treasuries": { label: "U.S. Treasuries", short: "Treasuries", path: "treasuries" },
  "private-credit": { label: "Private credit", short: "Private credit", path: "private-credit" },
};

export function assetClassFromPath(p: string): AssetClass | undefined {
  return (Object.keys(ASSET_CLASSES) as AssetClass[]).find((k) => ASSET_CLASSES[k].path === p);
}

export interface Flag {
  id: "eoa-upgrade" | "eoa-critical" | "eoa-high" | "no-upgrade-timelock" | "price-stale" | "defi-fixed" | "unclassified";
  label: string;
  color: SliceColor;
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
  snapshots: DiscoverySnapshot[];
  live?: Live;
  score: AssetScore;
  powers: PowerRow[];
  stats: AssetStats;
  flags: Flag[];
  alerts: Alert[];
}

export function entityName(slug: string): string {
  return loadEntities().get(slug)?.name ?? slug;
}

const isSingleKey = (r: PowerRow) => r.holder.holderClass === "eoa" || r.holder.holderClass === "unknown";

function computeFlags(powers: PowerRow[], live: Live | undefined, stats: AssetStats): Flag[] {
  const flags: Flag[] = [];
  if (powers.some((r) => r.power === "upgrade" && isSingleKey(r)))
    flags.push({ id: "eoa-upgrade", label: "EOA can upgrade", color: "red" });
  else if (powers.some((r) => r.criticality === "critical" && isSingleKey(r)))
    flags.push({ id: "eoa-critical", label: "EOA critical power", color: "red" });
  if (powers.some((r) => r.criticality === "high" && isSingleKey(r)))
    flags.push({ id: "eoa-high", label: "EOA can freeze/pause", color: "yellow" });
  if (powers.some((r) => r.power === "upgrade" && !isSingleKey(r) && r.holder.delaySeconds === 0))
    flags.push({ id: "no-upgrade-timelock", label: "No upgrade timelock", color: "yellow" });
  if (stats.oracle && stats.oracle.ageSeconds > 86400)
    flags.push({ id: "price-stale", label: "Price stale > 24h", color: "red" });
  if (live?.defiMarkets.some((m) => m.oracle.type === "fixed"))
    flags.push({ id: "defi-fixed", label: "Fixed $1 in DeFi", color: "yellow" });
  if (powers.some((r) => r.criticality === "unclassified"))
    flags.push({ id: "unclassified", label: "Unreviewed function", color: "grey" });
  return flags;
}

function buildProfile(asset: Asset): AssetProfile {
  const entities = loadEntities();
  const snapshots = loadDiscovered(asset);
  const live = loadLive(asset.slug);
  const discovered = snapshots.map((s) => s.discovered);
  const powers = analyzePowers(discovered);
  const score = scoreAsset(asset, discovered, live);

  const stats: AssetStats = {
    aumUsd: live?.aum.usd,
    aumDelta30d: live?.aum.usd30dAgo ? live.aum.usd / live.aum.usd30dAgo - 1 : undefined,
    adminRoles: powers.filter((r) => r.criticality !== "unclassified").length,
    singleKeyPowers: powers.filter((r) => r.criticality === "critical" && isSingleKey(r)).length,
    singleKeyOther: powers.filter((r) => r.criticality === "high" && isSingleKey(r)).map((r) => r.power),
    oracle: oracleAge(asset, live),
    defiCollateralUsd: live?.defiMarkets.reduce((s, m) => s + m.collateralUsd, 0) ?? 0,
    defiBorrowUsd: live?.defiMarkets.reduce((s, m) => s + m.borrowUsd, 0) ?? 0,
    defiMarkets: live?.defiMarkets.length ?? 0,
  };

  return {
    asset,
    sample: asset.sample || snapshots.some((s) => s.meta.sample) || Boolean(live?.sample),
    entities: {
      issuer: entities.get(asset.issuer),
      manager: entities.get(asset.manager),
      platform: entities.get(asset.platform),
    },
    snapshots,
    live,
    score,
    powers,
    stats,
    flags: computeFlags(powers, live, stats),
    alerts: loadAlerts().alerts.filter((a) => a.asset === asset.slug),
  };
}

let profilesCache: AssetProfile[] | undefined;
export function getProfiles(): AssetProfile[] {
  profilesCache ??= loadAssets()
    .map(buildProfile)
    .sort((a, b) => (b.stats.aumUsd ?? 0) - (a.stats.aumUsd ?? 0));
  return profilesCache;
}

export function getProfile(slug: string): AssetProfile | undefined {
  return getProfiles().find((p) => p.asset.slug === slug);
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

export interface SearchItem {
  id: string;
  kind: "asset" | "address" | "page";
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
}

export function searchIndex(): SearchItem[] {
  const items: SearchItem[] = [];
  for (const p of getProfiles()) {
    const { asset } = p;
    items.push({
      id: `asset-${asset.slug}`,
      kind: "asset",
      title: `${asset.ticker} · ${asset.name}`,
      subtitle: `${p.entities.manager?.name ?? asset.manager} · ${p.stats.aumUsd ? formatUsd(p.stats.aumUsd) : ""}`,
      href: `/assets/${asset.slug}`,
      keywords: [asset.ticker, asset.name, asset.issuer, asset.manager, asset.platform].join(" "),
    });
    for (const s of p.snapshots) {
      const addresses = new Set([...Object.keys(s.discovered.contracts), ...Object.keys(s.discovered.holders)]);
      for (const address of addresses) {
        const holder = lookupHolder(s.discovered, address);
        const contract = s.discovered.contracts[address];
        const label = addressLabel(p, address) ?? contract?.name ?? holderLabel(holder);
        items.push({
          id: `addr-${s.discovered.chain}-${address}`,
          kind: "address",
          title: `${label}`,
          subtitle: `${shortAddress(address)} · ${holder ? holderLabel(holder) : contract?.name} · ${asset.ticker}`,
          href: `/assets/${asset.slug}/control#addr-${address.toLowerCase()}`,
          keywords: `${address} ${address.toLowerCase()} ${label}`,
        });
      }
    }
  }
  return items;
}
