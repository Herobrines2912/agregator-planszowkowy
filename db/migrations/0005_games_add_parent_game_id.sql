ALTER TABLE "games" ADD COLUMN "parent_game_id" integer;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_parent_game_id_games_id_fk" FOREIGN KEY ("parent_game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
