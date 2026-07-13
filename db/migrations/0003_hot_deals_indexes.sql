-- Performance indexes for hot-deals feed query
CREATE INDEX IF NOT EXISTS idx_products_game_id ON products(game_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(in_stock) WHERE in_stock = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_scrape_runs_status_finished ON scrape_runs(status, finished_at DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_games_is_expansion ON games(is_expansion);
