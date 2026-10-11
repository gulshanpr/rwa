import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const log = (job: string, msg: string) => console.error(`[${new Date().toISOString()}] ${job}: ${msg}`);

export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

export async function getCursor(name: string): Promise<string | undefined> {
  const [row] = await getDb().select().from(schema.cursor).where(eq(schema.cursor.name, name));
  return row?.value;
}

export async function setCursor(name: string, value: string) {
  await getDb()
    .insert(schema.cursor)
    .values({ name, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.cursor.name, set: { value, updatedAt: sql`excluded.updated_at` } });
}

export async function upsertCheck(assetSlug: string, source: string, key: string, value: unknown) {
  await getDb()
    .insert(schema.externalCheck)
    .values({ assetSlug, source, key, valueJson: value, ts: new Date() })
    .onConflictDoUpdate({
      target: [schema.externalCheck.assetSlug, schema.externalCheck.source, schema.externalCheck.key],
      set: { valueJson: sql`excluded.value_json`, ts: sql`excluded.ts` },
    });
}

export async function getCheck<T>(assetSlug: string, source: string, key: string): Promise<T | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.externalCheck)
    .where(
      sql`${schema.externalCheck.assetSlug} = ${assetSlug} and ${schema.externalCheck.source} = ${source} and ${schema.externalCheck.key} = ${key}`,
    );
  return rows[0]?.valueJson as T | undefined;
}
