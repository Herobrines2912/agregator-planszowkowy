// Shared request-validation primitives for API routes handling user-submitted input.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const CONTROL_CHAR_RE = /[\x00-\x1f]/

// NUMERIC(10,2) max: precision 10, scale 2 — see web/src/db/schema.ts (priceAlerts.target_price,
// products.price, products.price_orig all share this precision/scale). Keep in sync with schema.ts.
export const MAX_NUMERIC_10_2 = 99999999.99
