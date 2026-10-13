import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { assetToRows } from "@/lib/catalog";
import type { Asset } from "@/lib/schema/asset";
import type { Discovered, DiscoveredMeta } from "@/lib/schema/discovered";
import type { Entity } from "@/lib/schema/entity";
import { getDb, schema } from "./client";

const s = schema;

/** Key-order-independent JSON, so values read back from jsonb compare equal to the originals. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export interface SaveResult {
  created: boolean;
  factsChanged: string[];
  factsRemoved: string[];
}

export async function saveEntity(e: Entity): Promise<boolean> {
  const row = { slug: e.slug, name: e.name, types: e.type, jurisdiction: e.jurisdiction ?? null, lei: e.lei ?? null, website: e.website ?? null };
  const [old] = await getDb().select().from(s.entity).where(eq(s.entity.slug, e.slug));
  if (old && stableJson({ ...old, createdAt: 0, updatedAt: 0 }) === stableJson({ ...row, createdAt: 0, updatedAt: 0 })) return false;
  await getDb()
    .insert(s.entity)
    .values(row)
    .onConflictDoUpdate({ target: s.entity.slug, set: { ...row, updatedAt: new Date() } });
  return true;
}

/**
 * Upserts an asset and its deployments, and records every curated field as a fact. Unchanged facts are
 * left alone; a changed one supersedes the current row; a field no longer present is superseded with no
 * replacement.
 */
export async function saveAsset(asset: Asset, by: string, status: "draft" | "published" = "published"): Promise<SaveResult> {
  const rows = assetToRows(asset);
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ slug: s.asset.slug }).from(s.asset).where(eq(s.asset.slug, asset.slug));
    await tx
      .insert(s.asset)
      .values({ ...rows.asset, status })
      .onConflictDoUpdate({ target: s.asset.slug, set: { ...rows.asset, updatedAt: new Date() } });

    await tx.delete(s.deployment).where(eq(s.deployment.assetSlug, asset.slug));
    if (rows.deployments.length) await tx.insert(s.deployment).values(rows.deployments);

    const current = await tx.select().from(s.fact).where(and(eq(s.fact.assetSlug, asset.slug), isNull(s.fact.supersededAt)));
    const byPath = new Map(current.map((f) => [f.path, f]));
    const now = new Date();
    const changed: string[] = [];
    for (const f of rows.facts) {
      const old = byPath.get(f.path);
      byPath.delete(f.path);
      if (old && stableJson(old.body) === stableJson(f.body)) continue;
      if (old) await tx.update(s.fact).set({ supersededAt: now }).where(eq(s.fact.id, old.id));
      await tx.insert(s.fact).values({ assetSlug: asset.slug, ...f, enteredBy: by });
      changed.push(f.path);
    }
    for (const old of byPath.values()) await tx.update(s.fact).set({ supersededAt: now }).where(eq(s.fact.id, old.id));
    return { created: !existing, factsChanged: changed, factsRemoved: [...byPath.keys()] };
  });
}

/** Stores a snapshot unless the latest one for this asset and chain has the same content. */
export async function saveSnapshot(
  d: Discovered,
  meta: DiscoveredMeta,
  opts: { by: string; extra?: Record<string, unknown>; diffSummary?: string[]; status?: "pending" | "approved" },
): Promise<boolean> {
  const db = getDb();
  const [latest] = await db
    .select({ contracts: s.discoverySnapshot.contracts, holders: s.discoverySnapshot.holders, block: s.discoverySnapshot.block })
    .from(s.discoverySnapshot)
    .where(and(eq(s.discoverySnapshot.assetSlug, d.asset), eq(s.discoverySnapshot.chain, d.chain)))
    .orderBy(desc(s.discoverySnapshot.block), desc(s.discoverySnapshot.id))
    .limit(1);
  const content = (x: { contracts: unknown; holders: unknown }) => stableJson({ c: x.contracts, h: x.holders }).toLowerCase();
  if (latest && (latest.block === d.block || content(latest) === content(d))) return false;
  await db.insert(s.discoverySnapshot).values({
    assetSlug: d.asset,
    chain: d.chain,
    block: d.block,
    ts: new Date(d.timestamp),
    toolVersion: meta.toolVersion,
    sample: meta.sample,
    contracts: d.contracts,
    holders: d.holders,
    extra: opts.extra ?? {},
    diffSummary: opts.diffSummary ?? [],
    status: opts.status ?? "approved",
    reviewedBy: (opts.status ?? "approved") === "approved" ? opts.by : null,
  });
  return true;
}

export async function saveResearchNote(slug: string, section: string, bodyMd: string, by: string): Promise<boolean> {
  const [old] = await getDb()
    .select({ bodyMd: s.researchNote.bodyMd })
    .from(s.researchNote)
    .where(and(eq(s.researchNote.assetSlug, slug), eq(s.researchNote.section, section)));
  if (old?.bodyMd === bodyMd) return false;
  await getDb()
    .insert(s.researchNote)
    .values({ assetSlug: slug, section, bodyMd, enteredBy: by })
    .onConflictDoUpdate({ target: [s.researchNote.assetSlug, s.researchNote.section], set: { bodyMd, enteredBy: by, createdAt: sql`now()` } });
  return true;
}

export async function saveHandScore(slug: string, slice: string, color: string, reason: string, by: string) {
  await getDb()
    .insert(s.handScore)
    .values({ assetSlug: slug, slice, color, reason, enteredBy: by })
    .onConflictDoUpdate({ target: [s.handScore.assetSlug, s.handScore.slice], set: { color, reason, enteredBy: by, updatedAt: new Date() } });
}
