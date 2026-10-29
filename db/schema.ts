import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// Catalog: curated and discovered data. Postgres is where it is edited; `bun rwa export` writes the Git copy.

export const entity = pgTable("entity", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  types: text("types").array().notNull(),
  jurisdiction: text("jurisdiction"),
  lei: text("lei"),
  website: text("website"),
  /** Counterparties facts: regulated, regulator, auditorTier (EntitySchema). */
  facts: jsonb("facts"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const asset = pgTable("asset", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  assetClass: text("asset_class").notNull(),
  description: text("description").notNull(),
  issuer: text("issuer")
    .notNull()
    .references(() => entity.slug),
  manager: text("manager")
    .notNull()
    .references(() => entity.slug),
  platform: text("platform")
    .notNull()
    .references(() => entity.slug),
  tokenStandard: text("token_standard").notNull(),
  priceModel: text("price_model").notNull(),
  sample: boolean("sample").notNull().default(false),
  status: text("status").notNull().default("published"),
  externalIds: jsonb("external_ids").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const deployment = pgTable(
  "deployment",
  {
    assetSlug: text("asset_slug")
      .notNull()
      .references(() => asset.slug, { onDelete: "cascade" }),
    chain: text("chain").notNull(),
    position: integer("position").notNull(),
    token: text("token").notNull(),
    /** [address, label] pairs; an array because jsonb does not keep object key order. */
    labels: jsonb("labels").$type<[string, string][]>().notNull().default([]),
    ignoreMethods: text("ignore_methods")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    poolId: text("pool_id"),
  },
  (t) => [primaryKey({ columns: [t.assetSlug, t.chain] })],
);

/**
 * One row per curated field (path into AssetSchema, e.g. "legal.lei"). `body` is the field exactly as the
 * schema defines it (Sourced, Disclosed, an array of sourced items, or a price reference). Append-only:
 * an edit supersedes the current row, so history is kept.
 */
export const fact = pgTable(
  "fact",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug")
      .notNull()
      .references(() => asset.slug, { onDelete: "cascade" }),
    path: text("path").notNull(),
    body: jsonb("body").notNull(),
    status: text("status").notNull(),
    sourceUrl: text("source_url"),
    checkedAt: text("checked_at"),
    enteredBy: text("entered_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    supersededAt: ts("superseded_at"),
  },
  (t) => [
    uniqueIndex("fact_current")
      .on(t.assetSlug, t.path)
      .where(sql`superseded_at is null`),
    index("fact_asset").on(t.assetSlug),
  ],
);

export const discoverySnapshot = pgTable(
  "discovery_snapshot",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug")
      .notNull()
      .references(() => asset.slug, { onDelete: "cascade" }),
    chain: text("chain").notNull(),
    block: bigint("block", { mode: "number" }).notNull(),
    ts: ts("ts").notNull(),
    toolVersion: text("tool_version").notNull(),
    sample: boolean("sample").notNull().default(false),
    contracts: jsonb("contracts").notNull(),
    holders: jsonb("holders").notNull(),
    extra: jsonb("extra").notNull().default({}),
    diffSummary: text("diff_summary")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status").notNull().default("approved"),
    reviewedBy: text("reviewed_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("discovery_snapshot_asset").on(t.assetSlug, t.chain, t.block)],
);

export const researchNote = pgTable(
  "research_note",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug")
      .notNull()
      .references(() => asset.slug, { onDelete: "cascade" }),
    section: text("section").notNull(),
    bodyMd: text("body_md").notNull(),
    enteredBy: text("entered_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("research_note_key").on(t.assetSlug, t.section)],
);

export const handScore = pgTable(
  "hand_score",
  {
    assetSlug: text("asset_slug")
      .notNull()
      .references(() => asset.slug, { onDelete: "cascade" }),
    slice: text("slice").notNull(),
    color: text("color").notNull(),
    reason: text("reason").notNull().default(""),
    enteredBy: text("entered_by").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assetSlug, t.slice] })],
);

// chain = "all" for fund-level rows (AUM across every chain).
export const assetsSnapshot = pgTable(
  "assets_snapshot",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug").notNull(),
    chain: text("chain").notNull(),
    ts: ts("ts").notNull(),
    totalSupply: doublePrecision("total_supply"),
    priceUsd: doublePrecision("price_usd"),
    aumUsd: doublePrecision("aum_usd"),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
  },
  (t) => [uniqueIndex("assets_snapshot_key").on(t.assetSlug, t.chain, t.source, t.ts)],
);

export const oracleReading = pgTable(
  "oracle_reading",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug").notNull(),
    chain: text("chain").notNull(),
    feed: text("feed").notNull(),
    ts: ts("ts").notNull(),
    value: doublePrecision("value").notNull(),
    updatedAtOnchain: ts("updated_at_onchain").notNull(),
    ageSeconds: integer("age_seconds").notNull(),
    roundId: text("round_id"),
  },
  (t) => [index("oracle_reading_feed_ts").on(t.feed, t.ts)],
);

export const defiMarket = pgTable(
  "defi_market",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug").notNull(),
    marketId: text("market_id").notNull(),
    protocol: text("protocol").notNull(),
    chain: text("chain").notNull(),
    name: text("name").notNull(),
    collateralAsset: text("collateral_asset").notNull(),
    loanAsset: text("loan_asset").notNull(),
    lltv: doublePrecision("lltv").notNull(),
    oracleAddress: text("oracle_address").notNull(),
    oracleType: text("oracle_type").notNull(),
    oracleDescription: text("oracle_description").notNull(),
    url: text("url").notNull(),
    collateralUsd: doublePrecision("collateral_usd").notNull(),
    borrowUsd: doublePrecision("borrow_usd").notNull(),
    supplyUsd: doublePrecision("supply_usd").notNull(),
    ts: ts("ts").notNull(),
  },
  (t) => [index("defi_market_asset_ts").on(t.assetSlug, t.ts)],
);

export const chainEvent = pgTable(
  "chain_event",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug").notNull(),
    chain: text("chain").notNull(),
    block: bigint("block", { mode: "number" }).notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    contract: text("contract").notNull(),
    eventName: text("event_name").notNull(),
    argsJson: jsonb("args_json").notNull(),
    ts: ts("ts").notNull(),
  },
  (t) => [uniqueIndex("chain_event_key").on(t.chain, t.txHash, t.logIndex)],
);

export const alert = pgTable(
  "alert",
  {
    id: text("id").primaryKey(),
    assetSlug: text("asset_slug").notNull(),
    severity: text("severity").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    eventId: integer("event_id"),
    chain: text("chain"),
    contract: text("contract"),
    txHash: text("tx_hash"),
    block: bigint("block", { mode: "number" }),
    url: text("url"),
    publishedAt: ts("published_at").notNull(),
    channelsJson: jsonb("channels_json").notNull().default([]),
  },
  (t) => [index("alert_published").on(t.publishedAt)],
);

export const externalCheck = pgTable(
  "external_check",
  {
    id: serial("id").primaryKey(),
    assetSlug: text("asset_slug").notNull(),
    source: text("source").notNull(),
    key: text("key").notNull(),
    valueJson: jsonb("value_json").notNull(),
    ts: ts("ts").notNull(),
  },
  (t) => [uniqueIndex("external_check_key").on(t.assetSlug, t.source, t.key)],
);

export const cursor = pgTable("cursor", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull(),
});
