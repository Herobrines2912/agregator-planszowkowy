import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true })

// ---------------------------------------------------------------------------
// stores
// ---------------------------------------------------------------------------
export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  base_url: text('base_url').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
})

// ---------------------------------------------------------------------------
// games  (canonical BGG-deduplicated game record)
// ---------------------------------------------------------------------------
export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  bgg_id: integer('bgg_id').unique(),
  bgg_sync_status: text('bgg_sync_status')
    .$type<'pending' | 'synced' | 'not_found' | 'rate_limited'>()
    .default('pending'),
  is_expansion: boolean('is_expansion').notNull().default(false),
  parent_game_id: integer('parent_game_id').references((): AnyPgColumn => games.id),
  cover_image_url: text('cover_image_url'),
  designers: text('designers').array(),
  publishers: text('publishers').array(),
  year_published: integer('year_published'),
  bgg_rank: integer('bgg_rank'),
  bgg_category_rank: jsonb('bgg_category_rank').$type<{ category: string; rank: number } | null>(),
  bgg_avg_rating: numeric('bgg_avg_rating', { precision: 5, scale: 2 }),
  complexity: numeric('complexity', { precision: 3, scale: 2 }),
  mechanics: text('mechanics').array(),
  min_players: integer('min_players'),
  max_players: integer('max_players'),
  min_playtime: integer('min_playtime'),
  max_playtime: integer('max_playtime'),
  min_age: integer('min_age'),
  rules_pdf_url: text('rules_pdf_url'),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow(),
})

// ---------------------------------------------------------------------------
// products  (per-store product; current price snapshot)
// ---------------------------------------------------------------------------
export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    game_id: integer('game_id').references(() => games.id),
    store_id: integer('store_id').notNull().references(() => stores.id),
    external_id: text('external_id'),
    name: text('name').notNull(),
    url: text('url').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }),
    price_orig: numeric('price_orig', { precision: 10, scale: 2 }),
    in_stock: boolean('in_stock').notNull().default(true),
    bgg_id: integer('bgg_id'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
  },
  (t) => [unique('products_store_external_unique').on(t.store_id, t.external_id)],
)

// ---------------------------------------------------------------------------
// price_history  (append-only — no UPDATE or DELETE)
// ---------------------------------------------------------------------------
export const priceHistory = pgTable(
  'price_history',
  {
    id: serial('id').primaryKey(),
    product_id: integer('product_id').notNull().references(() => products.id),
    price: numeric('price', { precision: 10, scale: 2 }),
    price_orig: numeric('price_orig', { precision: 10, scale: 2 }),
    in_stock: boolean('in_stock').notNull(),
    scraped_at: timestamptz('scraped_at').notNull(),
  },
  (t) => [index('idx_price_history_product_time').on(t.product_id, t.scraped_at)],
)

// ---------------------------------------------------------------------------
// scrape_runs  (one row per store per cycle; deleted after 90 days)
// ---------------------------------------------------------------------------
export const scrapeRuns = pgTable('scrape_runs', {
  id: serial('id').primaryKey(),
  store_id: integer('store_id').notNull().references(() => stores.id),
  started_at: timestamptz('started_at').notNull(),
  finished_at: timestamptz('finished_at'),
  products_scraped: integer('products_scraped').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  status: text('status')
    .$type<'success' | 'partial' | 'failed'>()
    .notNull()
    .default('failed'),
})

// ---------------------------------------------------------------------------
// price_alerts  (Double Opt-In subscriptions)
// ---------------------------------------------------------------------------
export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: serial('id').primaryKey(),
    game_id: integer('game_id').notNull().references(() => games.id),
    email: text('email').notNull(),
    email_hash: text('email_hash').notNull(),
    alert_type: text('alert_type')
      .$type<'price_drop' | 'availability'>()
      .notNull(),
    type_b_enabled: boolean('type_b_enabled').notNull().default(false),
    // Last time a Type B (anomaly-discount) email was sent for this alert — NULL means
    // never notified. Gates the 24h Type B cooldown; status is never used for this since
    // Type B alerts stay 'active' and re-evaluate every run, unlike Type A's one-shot trigger.
    last_type_b_notified_at: timestamptz('last_type_b_notified_at'),
    target_price: numeric('target_price', { precision: 10, scale: 2 }),
    status: text('status')
      .$type<'pending_doi' | 'active' | 'cancelled'>()
      .notNull()
      .default('pending_doi'),
    confirmation_token: text('confirmation_token').notNull(),
    // Stamped every time a confirmation token is issued — on insert and on every rotation.
    // The 48h DOI window is measured from here, never from created_at: re-subscribing to a
    // cancelled or long-expired alert issues a fresh token, and a fresh token has to start a
    // fresh clock or it would arrive already expired.
    token_issued_at: timestamptz('token_issued_at').notNull().defaultNow(),
    // Generated once at insert and NEVER rotated (unlike confirmation_token) — every email ever
    // sent embeds this token, and a user must be able to unsubscribe from a months-old message
    // sitting unread in their inbox. No TTL, no re-subscribe rotation.
    unsubscribe_token: text('unsubscribe_token').notNull(),
    confirmed_at: timestamptz('confirmed_at'),
    created_at: timestamptz('created_at').defaultNow(),
  },
  (t) => [
    unique('uq_price_alerts_email_game').on(t.email_hash, t.game_id),
    unique('uq_price_alerts_unsubscribe_token').on(t.unsubscribe_token),
  ],
)

// ---------------------------------------------------------------------------
// email_suppressions  (raw email — needed for L-3 suppression join)
// ---------------------------------------------------------------------------
export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    reason: text('reason')
      .$type<'hard_bounce' | 'complaint' | 'user_request' | 'global_optout'>()
      .notNull(),
    is_anonymized: boolean('is_anonymized').notNull().default(false),
    created_at: timestamptz('created_at').defaultNow(),
  },
  // One suppression row per email — the app checks "does a row exist for this email" (any
  // reason) before writing a new one, so concurrent writers must be DB-serialized via this
  // constraint (ON CONFLICT DO NOTHING) rather than relying on an app-level check-then-insert,
  // which races under concurrent requests (see unsubscribeAllAlertsByToken in queries/alerts.ts).
  (t) => [unique('uq_email_suppressions_email').on(t.email)],
)

// ---------------------------------------------------------------------------
// consent_log  (append-only RODO audit — NEVER DELETE from this table)
// ---------------------------------------------------------------------------
export const consentLog = pgTable(
  'consent_log',
  {
    id: serial('id').primaryKey(),
    email_hash: text('email_hash').notNull(),
    action: text('action')
      .$type<
        | 'opt_in_requested'
        | 'opt_in_confirmed'
        | 'unsubscribed'
        | 'suppressed'
        | 'suppression_overridden'
        | 'reactivated'
      >()
      .notNull(),
    source: text('source')
      .$type<'user' | 'brevo_webhook' | 'system'>()
      .notNull(),
    ip_hash: text('ip_hash'),
    token_id: integer('token_id'),
    created_at: timestamptz('created_at').defaultNow(),
  },
  (t) => [index('idx_consent_log_email_time').on(t.email_hash, t.created_at)],
)

// ---------------------------------------------------------------------------
// data_retention_log  (records each maintenance.yml run step)
// ---------------------------------------------------------------------------
export const dataRetentionLog = pgTable('data_retention_log', {
  id: serial('id').primaryKey(),
  run_at: timestamptz('run_at').defaultNow(),
  step: text('step').notNull(),
  rows_affected: integer('rows_affected').notNull().default(0),
})

// ---------------------------------------------------------------------------
// upcoming_games  (preorder/upcoming-release listings scraped weekly, Story 8.2)
// ---------------------------------------------------------------------------
export const upcomingGames = pgTable(
  'upcoming_games',
  {
    id: serial('id').primaryKey(),
    store_id: integer('store_id').notNull().references(() => stores.id),
    game_id: integer('game_id').references(() => games.id),
    name: text('name').notNull(),
    // Exact date, rarely populated — both stores currently only give approximate text
    // (see expected_release_date_text). Kept for stores/cases that do give a firm date.
    expected_release_date: date('expected_release_date'),
    // Approximate free-text release estimate (e.g. "ok. 9 października 2026") — the
    // common case for both stores today, per Story 8.1's findings.
    expected_release_date_text: text('expected_release_date_text'),
    cover_image_url: text('cover_image_url'),
    pre_order_url: text('pre_order_url').notNull(),
    pre_order_price: numeric('pre_order_price', { precision: 10, scale: 2 }),
    status: text('status')
      .$type<'upcoming' | 'available'>()
      .notNull()
      .default('upcoming'),
    available_since: timestamptz('available_since'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
  },
  (t) => [
    unique('uq_upcoming_games_store_name').on(t.store_id, t.name),
    check('ck_upcoming_games_status', sql`${t.status} IN ('upcoming', 'available')`),
  ],
)
