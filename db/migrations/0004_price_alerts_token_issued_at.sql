-- price_alerts.token_issued_at — carries the 48h DOI confirmation-token TTL.
-- Backfilled from created_at rather than now(): stamping existing rows with the migration
-- time would resurrect long-dead confirmation links for a fresh 48h window.
ALTER TABLE "price_alerts" ADD COLUMN IF NOT EXISTS "token_issued_at" timestamptz;--> statement-breakpoint
UPDATE "price_alerts" SET "token_issued_at" = COALESCE("created_at", now()) WHERE "token_issued_at" IS NULL;--> statement-breakpoint
ALTER TABLE "price_alerts" ALTER COLUMN "token_issued_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "price_alerts" ALTER COLUMN "token_issued_at" SET NOT NULL;
