import {
  boolean,
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
  cover_image_url: text('cover_image_url'),
  designers: text('designers').array(),
  publishers: text('publishers').array(),
  bgg_rank: integer('bgg_rank'),
  bgg_category_rank: jsonb('bgg_category_rank'),
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
export const products = pgTable('products', {
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
})

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
    target_price: numeric('target_price', { precision: 10, scale: 2 }),
    status: text('status')
      .$type<'pending_doi' | 'active' | 'cancelled'>()
      .notNull()
      .default('pending_doi'),
    confirmation_token: text('confirmation_token').notNull(),
    confirmed_at: timestamptz('confirmed_at'),
    created_at: timestamptz('created_at').defaultNow(),
  },
  (t) => [unique('uq_price_alerts_email_game').on(t.email_hash, t.game_id)],
)

// ---------------------------------------------------------------------------
// email_suppressions  (raw email — needed for L-3 suppression join)
// ---------------------------------------------------------------------------
export const emailSuppressions = pgTable('email_suppressions', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  reason: text('reason')
    .$type<'hard_bounce' | 'complaint' | 'user_request' | 'global_optout'>()
    .notNull(),
  is_anonymized: boolean('is_anonymized').notNull().default(false),
  created_at: timestamptz('created_at').defaultNow(),
})

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
