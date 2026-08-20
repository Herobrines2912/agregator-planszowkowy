-- price_alerts.unsubscribe_token — powers the one-click unsubscribe link (Story 6.3).
-- Backfilled for existing rows rather than left NULL: an already-active alert must not lose
-- its ability to unsubscribe just because it predates this migration. Unlike
-- confirmation_token, this value is never rotated after issue (see schema.ts comment) — it
-- must keep working for the lifetime of every email already sent.
ALTER TABLE "price_alerts" ADD COLUMN IF NOT EXISTS "unsubscribe_token" text;--> statement-breakpoint
-- gen_random_uuid() is built into Postgres core (13+) — no pgcrypto extension required,
-- unlike gen_random_bytes(). 122 bits of entropy is ample for a backfilled unsubscribe token.
UPDATE "price_alerts" SET "unsubscribe_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') WHERE "unsubscribe_token" IS NULL;--> statement-breakpoint
ALTER TABLE "price_alerts" ALTER COLUMN "unsubscribe_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "uq_price_alerts_unsubscribe_token" UNIQUE ("unsubscribe_token");
