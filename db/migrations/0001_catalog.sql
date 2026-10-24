CREATE TABLE "asset" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"asset_class" text NOT NULL,
	"description" text NOT NULL,
	"issuer" text NOT NULL,
	"manager" text NOT NULL,
	"platform" text NOT NULL,
	"token_standard" text NOT NULL,
	"price_model" text NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment" (
	"asset_slug" text NOT NULL,
	"chain" text NOT NULL,
	"position" integer NOT NULL,
	"token" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ignore_methods" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "deployment_asset_slug_chain_pk" PRIMARY KEY("asset_slug","chain")
);
--> statement-breakpoint
CREATE TABLE "discovery_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"chain" text NOT NULL,
	"block" bigint NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"tool_version" text NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"contracts" jsonb NOT NULL,
	"holders" jsonb NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diff_summary" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"types" text[] NOT NULL,
	"jurisdiction" text,
	"lei" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"path" text NOT NULL,
	"body" jsonb NOT NULL,
	"status" text NOT NULL,
	"source_url" text,
	"checked_at" text,
	"entered_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hand_score" (
	"asset_slug" text NOT NULL,
	"slice" text NOT NULL,
	"color" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"entered_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hand_score_asset_slug_slice_pk" PRIMARY KEY("asset_slug","slice")
);
--> statement-breakpoint
CREATE TABLE "research_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_slug" text NOT NULL,
	"section" text NOT NULL,
	"body_md" text NOT NULL,
	"entered_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_issuer_entity_slug_fk" FOREIGN KEY ("issuer") REFERENCES "public"."entity"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_manager_entity_slug_fk" FOREIGN KEY ("manager") REFERENCES "public"."entity"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_platform_entity_slug_fk" FOREIGN KEY ("platform") REFERENCES "public"."entity"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_asset_slug_asset_slug_fk" FOREIGN KEY ("asset_slug") REFERENCES "public"."asset"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_snapshot" ADD CONSTRAINT "discovery_snapshot_asset_slug_asset_slug_fk" FOREIGN KEY ("asset_slug") REFERENCES "public"."asset"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact" ADD CONSTRAINT "fact_asset_slug_asset_slug_fk" FOREIGN KEY ("asset_slug") REFERENCES "public"."asset"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hand_score" ADD CONSTRAINT "hand_score_asset_slug_asset_slug_fk" FOREIGN KEY ("asset_slug") REFERENCES "public"."asset"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_note" ADD CONSTRAINT "research_note_asset_slug_asset_slug_fk" FOREIGN KEY ("asset_slug") REFERENCES "public"."asset"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_snapshot_asset" ON "discovery_snapshot" USING btree ("asset_slug","chain","block");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_current" ON "fact" USING btree ("asset_slug","path") WHERE superseded_at is null;--> statement-breakpoint
CREATE INDEX "fact_asset" ON "fact" USING btree ("asset_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "research_note_key" ON "research_note" USING btree ("asset_slug","section");