-- email_suppressions.email unique constraint — DB-enforced idempotency for
-- unsubscribeAllAlertsByToken() (Story 6.3 code review). The app checks "does a row exist
-- for this email" before inserting; without a DB-level constraint, concurrent requests for
-- the same email can both pass that check and both insert, producing duplicate suppression
-- rows and duplicate consent_log entries (violates Story 6.3 AC6's idempotency guarantee).
-- The insert now uses ON CONFLICT DO NOTHING against this constraint instead.
ALTER TABLE "email_suppressions" ADD CONSTRAINT "uq_email_suppressions_email" UNIQUE ("email");
