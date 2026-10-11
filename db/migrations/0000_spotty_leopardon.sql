CREATE TABLE "alert" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"severity" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"event_id" integer,
	"chain" text,
	"contract" text,
	"tx_hash" text,
	"block" bigint,
	"url" text,
	"published_at" timestamp with time zone NOT NULL,
	"channels_json" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"chain" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"total_supply" double precision,
	"price_usd" double precision,
	"aum_usd" double precision,
	"source" text NOT NULL,
	"source_url" text
);
--> statement-breakpoint
CREATE TABLE "chain_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"chain" text NOT NULL,
	"block" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"contract" text NOT NULL,
	"event_name" text NOT NULL,
	"args_json" jsonb NOT NULL,
	"ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursor" (
	"name" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defi_market" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"market_id" text NOT NULL,
	"protocol" text NOT NULL,
	"chain" text NOT NULL,
	"name" text NOT NULL,
	"collateral_asset" text NOT NULL,
	"loan_asset" text NOT NULL,
	"lltv" double precision NOT NULL,
	"oracle_address" text NOT NULL,
	"oracle_type" text NOT NULL,
	"oracle_description" text NOT NULL,
	"url" text NOT NULL,
	"collateral_usd" double precision NOT NULL,
	"borrow_usd" double precision NOT NULL,
	"supply_usd" double precision NOT NULL,
	"ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_check" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"value_json" jsonb NOT NULL,
	"ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oracle_reading" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"chain" text NOT NULL,
	"feed" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"updated_at_onchain" timestamp with time zone NOT NULL,
	"age_seconds" integer NOT NULL,
	"round_id" text
);
--> statement-breakpoint
CREATE INDEX "alert_published" ON "alert" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_snapshot_key" ON "assets_snapshot" USING btree ("asset_slug","chain","source","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_event_key" ON "chain_event" USING btree ("chain","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "defi_market_asset_ts" ON "defi_market" USING btree ("asset_slug","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "external_check_key" ON "external_check" USING btree ("asset_slug","source","key");--> statement-breakpoint
CREATE INDEX "oracle_reading_feed_ts" ON "oracle_reading" USING btree ("feed","ts");