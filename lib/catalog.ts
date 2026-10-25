import { asc, desc, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { getDb, readsFromDatabase, schema } from "@/db/client";
import { loadAssets, loadDiscovered, loadEntities, type DiscoverySnapshot } from "./data";
import { AssetSchema, type Asset } from "./schema/asset";
import { DiscoveredSchema } from "./schema/discovered";
import { EntitySchema, type Entity } from "./schema/entity";

// Assets, entities and discovery snapshots, from Postgres when DATABASE_URL is set and the catalog
// tables have been imported (`bun rwa import`), otherwise from the Git copy in data/ and discovered/.

export interface Catalog {
  source: "db" | "files";
  assets: Asset[];
  entities: Map<string, Entity>;
  snapshots: Map<string, DiscoverySnapshot[]>;
}

/** Top-level asset fields stored as columns or in their own table. Everything else is a fact. */
const COLUMNS = ["slug", "sample", "name", "ticker", "assetClass", "description", "issuer", "manager", "platform", "tokenStandard", "priceModel", "deployments", "externalIds"] as const;

export interface FactRow {
  path: string;
  body: unknown;
  status: string;
  sourceUrl: string | null;
  checkedAt: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLeaf = (v: unknown) => Array.isArray(v) || (isRecord(v) && ("source" in v || "status" in v || "searchedAt" in v));

function describe(path: string, body: unknown): FactRow {
  if (Array.isArray(body)) {
    const dates = body.map((i) => (isRecord(i) && isRecord(i.source) ? (i.source.checkedAt as string) : undefined)).filter(Boolean) as string[];
    return { path, body, status: "list", sourceUrl: null, checkedAt: dates.sort()[0] ?? null };
  }
  const b = body as Record<string, unknown>;
  const source = isRecord(b.source) ? b.source : undefined;
  return {
    path,
    body,
    status: typeof b.status === "string" ? b.status : typeof b.type === "string" ? b.type : "sourced",
    sourceUrl: (source?.url as string | undefined) ?? null,
    checkedAt: (source?.checkedAt as string | undefined) ?? (b.searchedAt as string | undefined) ?? null,
  };
}

/** Splits an asset into its column values, deployments and one fact per curated field. */
export function assetToRows(asset: Asset) {
  const facts: FactRow[] = [];
  const walk = (value: unknown, path: string) => {
    if (value === undefined) return;
    if (isLeaf(value)) return void facts.push(describe(path, value));
    if (isRecord(value)) for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
  };
  const rest = Object.fromEntries(Object.entries(asset).filter(([k]) => !(COLUMNS as readonly string[]).includes(k)));
  walk(rest, "");
  return {
    asset: {
      slug: asset.slug,
      name: asset.name,
      ticker: asset.ticker,
      assetClass: asset.assetClass,
      description: asset.description,
      issuer: asset.issuer,
      manager: asset.manager,
      platform: asset.platform,
      tokenStandard: asset.tokenStandard,
      priceModel: asset.priceModel,
      sample: asset.sample,
      externalIds: asset.externalIds,
    },
    deployments: asset.deployments.map((d, position) => ({
      assetSlug: asset.slug,
      chain: d.chain,
      position,
      token: d.token,
      labels: Object.entries(d.discovery.labels),
      ignoreMethods: d.discovery.ignoreMethods,
      poolId: d.discovery.poolId ?? null,
    })),
    facts,
  };
}

type AssetRow = typeof schema.asset.$inferSelect;
type DeploymentRow = typeof schema.deployment.$inferSelect;

/** Inverse of assetToRows. Parses with AssetSchema, so a bad row fails loudly with its path. */
export function rowsToAsset(row: AssetRow, deployments: DeploymentRow[], facts: { path: string; body: unknown }[]): Asset {
  const out: Record<string, unknown> = {
    slug: row.slug,
    sample: row.sample,
    name: row.name,
    ticker: row.ticker,
    assetClass: row.assetClass,
    description: row.description,
    issuer: row.issuer,
    manager: row.manager,
    platform: row.platform,
    tokenStandard: row.tokenStandard,
    priceModel: row.priceModel,
    deployments: [...deployments]
      .sort((a, b) => a.position - b.position)
      .map((d) => ({
        chain: d.chain,
        token: d.token,
        discovery: { ignoreMethods: d.ignoreMethods, labels: Object.fromEntries(d.labels), ...(d.poolId ? { poolId: d.poolId } : {}) },
      })),
  };
  for (const f of facts) {
    const keys = f.path.split(".");
    let node = out;
    for (const k of keys.slice(0, -1)) node = (node[k] ??= {}) as Record<string, unknown>;
    node[keys.at(-1)!] = f.body;
  }
  out.externalIds = row.externalIds;
  const parsed = AssetSchema.safeParse(out);
  if (!parsed.success) throw new Error(`Asset ${row.slug} in the database is invalid: ${parsed.error.message}`);
  return parsed.data;
}

export function entityFromRow(row: typeof schema.entity.$inferSelect): Entity {
  return EntitySchema.parse({
    slug: row.slug,
    name: row.name,
    type: row.types,
    ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
    ...(row.lei ? { lei: row.lei } : {}),
    ...(row.website ? { website: row.website } : {}),
    ...((row.facts as Record<string, unknown> | null) ?? {}),
  });
}

export async function catalogFromDb(opts: { includeDrafts?: boolean } = {}): Promise<Catalog | undefined> {
  const db = getDb();
  const s = schema;
  const assetRows = await db.select().from(s.asset).orderBy(asc(s.asset.slug));
  if (assetRows.length === 0) return undefined;
  const [entityRows, deploymentRows, factRows, snapshotRows] = await Promise.all([
    db.select().from(s.entity),
    db.select().from(s.deployment),
    db.select({ assetSlug: s.fact.assetSlug, path: s.fact.path, body: s.fact.body }).from(s.fact).where(isNull(s.fact.supersededAt)).orderBy(asc(s.fact.id)),
    db
      .selectDistinctOn([s.discoverySnapshot.assetSlug, s.discoverySnapshot.chain])
      .from(s.discoverySnapshot)
      .where(eq(s.discoverySnapshot.status, "approved"))
      .orderBy(s.discoverySnapshot.assetSlug, s.discoverySnapshot.chain, desc(s.discoverySnapshot.block), desc(s.discoverySnapshot.id)),
  ]);

  const visible = assetRows.filter((a) => a.status === "published" || (opts.includeDrafts && a.status === "draft"));
  const assets = visible.map((row) =>
    rowsToAsset(
      row,
      deploymentRows.filter((d) => d.assetSlug === row.slug),
      factRows.filter((f) => f.assetSlug === row.slug),
    ),
  );
  const snapshots = new Map<string, DiscoverySnapshot[]>();
  for (const a of assets) {
    snapshots.set(
      a.slug,
      a.deployments.flatMap((d) => {
        const r = snapshotRows.find((x) => x.assetSlug === a.slug && x.chain === d.chain);
        if (!r) return [];
        const timestamp = r.ts.toISOString().replace(".000Z", "Z");
        return [
          {
            discovered: DiscoveredSchema.parse({ asset: a.slug, chain: r.chain, block: r.block, timestamp, contracts: r.contracts, holders: r.holders }),
            meta: { block: r.block, timestamp, toolVersion: r.toolVersion, sample: r.sample },
            path: `discovered/${a.slug}/${r.chain}.json`,
          },
        ];
      }),
    );
  }
  return { source: "db", assets, entities: new Map(entityRows.map((r) => [r.slug, entityFromRow(r)])), snapshots };
}

export function catalogFromFiles(): Catalog {
  const assets = loadAssets();
  return { source: "files", assets, entities: loadEntities(), snapshots: new Map(assets.map((a) => [a.slug, loadDiscovered(a)])) };
}

export async function getCatalog(opts: { includeDrafts?: boolean } = {}): Promise<Catalog> {
  if (!readsFromDatabase()) return catalogFromFiles();
  try {
    const fromDb = await catalogFromDb(opts);
    if (fromDb) return fromDb;
    console.warn("catalog: DATABASE_URL is set but the catalog tables are empty; reading data/ files. Run `bun rwa import`.");
  } catch (e) {
    console.error(`catalog: falling back to data/ files: ${e instanceof Error ? e.message : e}`);
  }
  return catalogFromFiles();
}

/** Published catalog, read once per server request. */
export const getSiteCatalog = cache(() => getCatalog());
