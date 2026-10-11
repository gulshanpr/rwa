import { bigint, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

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
