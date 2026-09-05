ALTER TABLE "upcoming_games" ADD CONSTRAINT "ck_upcoming_games_status" CHECK ("status" IN ('upcoming', 'available'));
