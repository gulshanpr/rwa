import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, hasDatabase, readsFromDatabase, schema } from "@/db/client";
import { getSiteCatalog } from "./catalog";
import { loadAlerts, loadLive } from "./data";
import type { Asset, Chain } from "./schema/asset";
import { AlertSchema, LiveSchema, type Alert, type DefiMarket, type Live } from "./schema/live";

// Live data and alerts come from Postgres when DATABASE_URL is set (the worker writes there),
// otherwise from the JSON files in data/live/. Live data follows readsFromDatabase(); alerts see getAlerts().

const DAY = 86_400_000;

async function liveFromDb(asset: Asset): Promise<Live | undefined> {
  const db = getDb();
  const s = schema;

  const supply = (
    await Promise.all(
      asset.deployments.map(async (d) => {
        const [row] = await db.select().from(s.assetsSnapshot).where(and(eq(s.assetsSnapshot.assetSlug, asset.slug), eq(s.assetsSnapshot.chain, d.chain))).orderBy(desc(s.assetsSnapshot.ts)).limit(1);
        return row?.totalSupply != null ? { chain: d.chain, totalSupply: row.totalSupply, priceUsd: row.priceUsd ?? 0, source: row.source, ts: row.ts } : undefined;
      }),
    )
  ).filter((x) => x !== undefined);
  if (supply.length === 0) return undefined;

  const aumWhere = (extra?: ReturnType<typeof lte>) => and(eq(s.assetsSnapshot.assetSlug, asset.slug), eq(s.assetsSnapshot.chain, "all"), extra);
  const [aum] = await db.select().from(s.assetsSnapshot).where(aumWhere()).orderBy(desc(s.assetsSnapshot.ts)).limit(1);
  const [aum30] = aum ? await db.select().from(s.assetsSnapshot).where(aumWhere(lte(s.assetsSnapshot.ts, new Date(aum.ts.getTime() - 30 * DAY)))).orderBy(desc(s.assetsSnapshot.ts)).limit(1) : [];
  const onchainAum = supply.reduce((sum, r) => sum + r.totalSupply * r.priceUsd, 0);

  const ref = asset.pricing.reference;
  const [reading] =
    ref.type === "oracle" && ref.address
      ? await db.select().from(s.oracleReading).where(eq(s.oracleReading.assetSlug, asset.slug)).orderBy(desc(s.oracleReading.ts)).limit(1)
      : [];

  const markets: DefiMarket[] = [];
  for (const protocol of ["morpho", "aave"] as const) {
    const [run] = await db.select().from(s.cursor).where(eq(s.cursor.name, `defi:${protocol}:${asset.slug}`));
    if (!run) continue;
    const rows = await db.select().from(s.defiMarket).where(and(eq(s.defiMarket.assetSlug, asset.slug), eq(s.defiMarket.protocol, protocol), gte(s.defiMarket.ts, new Date(run.value))));
    for (const m of rows) {
      // Markets with nothing supplied or posted as collateral carry no exposure.
      if (m.collateralUsd === 0 && m.supplyUsd === 0 && m.borrowUsd === 0) continue;
      markets.push({
        marketId: m.marketId,
        protocol,
        name: m.name,
        chain: m.chain as Chain,
        loanAsset: m.loanAsset,
        lltv: m.lltv,
        oracle: { address: m.oracleAddress, type: m.oracleType as DefiMarket["oracle"]["type"], description: m.oracleDescription },
        collateralUsd: m.collateralUsd,
        borrowUsd: m.borrowUsd,
        supplyUsd: m.supplyUsd,
        url: m.url,
      });
    }
  }

  const asOf = new Date(Math.max(...supply.map((r) => r.ts.getTime()), reading?.ts.getTime() ?? 0));
  return LiveSchema.parse({
    asset: asset.slug,
    asOf: asOf.toISOString(),
    supply: supply.map(({ ts: _ts, ...r }) => r),
    aum: aum?.aumUsd
      ? { usd: aum.aumUsd, usd30dAgo: aum30?.aumUsd ?? undefined, source: { name: aum.source, url: aum.sourceUrl ?? "https://defillama.com" } }
      : { usd: onchainAum, source: { name: "Onchain supply × price (tracked chains only)", url: "https://defillama.com" } },
    oracle: reading
      ? { chain: reading.chain, address: reading.feed, value: reading.value, updatedAt: reading.updatedAtOnchain.toISOString() }
      : undefined,
    defiMarkets: markets,
    defiSource: { name: "Morpho API, Aave pools onchain", url: "https://app.morpho.org" },
  });
}

export async function getLive(asset: Asset): Promise<Live | undefined> {
  if (!readsFromDatabase()) return loadLive(asset.slug);
  try {
    return (await liveFromDb(asset)) ?? loadLive(asset.slug);
  } catch (e) {
    console.error(`live data for ${asset.slug}: falling back to JSON:`, e);
    return loadLive(asset.slug);
  }
}

// Alerts exist only in Postgres (the worker writes them; data/live/alerts.json is an empty fallback),
// so unlike the catalog they are read from the database during a production build too.
// The known-slug filter keeps alerts for assets another branch imported off the site.
let alertsDuringBuild: Promise<{ sample: boolean; alerts: Alert[] }> | undefined;
export function getAlerts(): Promise<{ sample: boolean; alerts: Alert[] }> {
  if (!hasDatabase() || process.env.CATALOG_SOURCE === "files") return Promise.resolve(loadAlerts());
  // One query per build instead of one per prerendered page.
  if (process.env.NEXT_PHASE === "phase-production-build") return (alertsDuringBuild ??= alertsFromDb());
  return alertsFromDb();
}

async function alertsFromDb(): Promise<{ sample: boolean; alerts: Alert[] }> {
  try {
    const known = new Set((await getSiteCatalog()).assets.map((a) => a.slug));
    const rows = await getDb().select().from(schema.alert).orderBy(desc(schema.alert.publishedAt)).limit(500);
    const alerts = rows
      .filter((r) => known.has(r.assetSlug))
      .map((r) =>
        AlertSchema.parse({
          id: r.id,
          asset: r.assetSlug,
          severity: r.severity,
          kind: r.kind,
          title: r.title,
          consequence: r.bodyMd,
          chain: r.chain ?? undefined,
          contract: r.contract ?? undefined,
          txHash: r.txHash ?? undefined,
          block: r.block ?? undefined,
          url: r.url ?? undefined,
          publishedAt: r.publishedAt.toISOString(),
        }),
      );
    return { sample: false, alerts };
  } catch (e) {
    console.error("alerts: falling back to JSON:", e);
    return loadAlerts();
  }
}
