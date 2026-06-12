CREATE TABLE "consent_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"ip_hash" text,
	"token_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_retention_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_at" timestamp with time zone DEFAULT now(),
	"step" text NOT NULL,
	"rows_affected" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"is_anonymized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bgg_id" integer,
	"bgg_sync_status" text DEFAULT 'pending',
	"is_expansion" boolean DEFAULT false NOT NULL,
	"cover_image_url" text,
	"designers" text[],
	"publishers" text[],
	"bgg_rank" integer,
	"bgg_category_rank" jsonb,
	"complexity" numeric(3, 2),
	"mechanics" text[],
	"min_players" integer,
	"max_players" integer,
	"min_playtime" integer,
	"max_playtime" integer,
	"min_age" integer,
	"rules_pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "games_slug_unique" UNIQUE("slug"),
	CONSTRAINT "games_bgg_id_unique" UNIQUE("bgg_id")
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"email" text NOT NULL,
	"email_hash" text NOT NULL,
	"alert_type" text NOT NULL,
	"type_b_enabled" boolean DEFAULT false NOT NULL,
	"target_price" numeric(10, 2),
	"status" text DEFAULT 'pending_doi' NOT NULL,
	"confirmation_token" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_price_alerts_email_game" UNIQUE("email_hash","game_id")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"price" numeric(10, 2),
	"price_orig" numeric(10, 2),
	"in_stock" boolean NOT NULL,
	"scraped_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer,
	"store_id" integer NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"price" numeric(10, 2),
	"price_orig" numeric(10, 2),
	"in_stock" boolean DEFAULT true NOT NULL,
	"bgg_id" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"products_scraped" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'failed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_consent_log_email_time" ON "consent_log" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "idx_price_history_product_time" ON "price_history" USING btree ("product_id","scraped_at");