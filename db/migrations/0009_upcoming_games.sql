CREATE TABLE "upcoming_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"game_id" integer,
	"name" text NOT NULL,
	"expected_release_date" date,
	"expected_release_date_text" text,
	"cover_image_url" text,
	"pre_order_url" text NOT NULL,
	"pre_order_price" numeric(10, 2),
	"status" text DEFAULT 'upcoming' NOT NULL,
	"available_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_upcoming_games_store_name" UNIQUE("store_id","name")
);--> statement-breakpoint
ALTER TABLE "upcoming_games" ADD CONSTRAINT "upcoming_games_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upcoming_games" ADD CONSTRAINT "upcoming_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
