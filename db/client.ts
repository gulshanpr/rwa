import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let instance: { db: Db; sql: postgres.Sql } | undefined;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Whether site pages read Postgres (catalog, live data, alerts) or the Git copy under data/.
 * A production build reads the Git copy: it is reproducible from the commit, cannot fail because
 * Postgres holds data imported by another branch, and avoids one full database load per prerendered
 * page. Pages still use the database at runtime through ISR. `CATALOG_SOURCE=files|db` overrides this.
 */
export function readsFromDatabase(): boolean {
  if (process.env.CATALOG_SOURCE === "files") return false;
  if (process.env.CATALOG_SOURCE === "db") return hasDatabase();
  return process.env.NEXT_PHASE !== "phase-production-build" && hasDatabase();
}

export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url)
      throw new Error(
        "DATABASE_URL is not set. For local use run `bun run db:local` and set DATABASE_URL=postgres://postgres@localhost:5433/postgres",
      );
    // PGlite's socket server accepts one connection and no prepared statements.
    const local = /localhost|127\.0\.0\.1/.test(url);
    // Neon's pooler (PgBouncer, transaction mode) does not support prepared statements.
    const pooled = /-pooler\./.test(url);
    const sql = postgres(url, { max: local ? 1 : 5, prepare: !local && !pooled, onnotice: () => {} });
    instance = { db: drizzle(sql, { schema }), sql };
  }
  return instance.db;
}

export async function closeDb() {
  await instance?.sql.end({ timeout: 5 });
  instance = undefined;
}

export { schema };
