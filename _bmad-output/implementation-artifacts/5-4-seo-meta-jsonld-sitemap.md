---
baseline_commit: 9e58531
---

# Story 5.4 + 5.5 + 5.6: SEO Architecture — Meta Tags, JSON-LD & Sitemap

**Status:** review
**Epic:** 5 — Price History Chart & SEO Architecture
**Dev:** Dev A (Web)
**Depends on:** Story 4.1 (done ✅)
**Mock data OK:** Yes — real game/product data not required; mock getter still in place pending Story 4.5 (Dev B)

---

## User Story

As a **product owner**,
I want game pages and the homepage to have correct Open Graph meta tags, JSON-LD structured data, a sitemap, and robots.txt,
So that links shared on social media show rich previews, Google can index all game pages, and search engines understand our structured price data.

---

## Acceptance Criteria

### AC-1 — `generateMetadata` for Game Passport Page

- Given `generateMetadata()` in `app/gra/[slug]/page.tsx`
- When called for a game that exists
- Then it returns:
  - `title`: `"${name} — najlepsza cena | Agregator Planszówek"` (name truncated to 57 chars + `…` if longer)
  - `description`: `"Sprawdź aktualną cenę ${game.name} w polskich sklepach. Porównaj oferty AlePlanszowki, 3Trolle i innych."` truncated to 155 chars — never null, never empty
  - `openGraph.title`: same as `title`
  - `openGraph.description`: same as `description`
  - `openGraph.image`: `game.cover_image_url` if not null, otherwise `${siteUrl}/opengraph-image.png`
  - `openGraph.type`: `"website"`
  - `openGraph.locale`: `"pl_PL"`
  - `alternates.canonical`: `"${siteUrl}/gra/${slug}"` — no trailing slash, no query params
  - `robots`: `{ index: true, follow: true }`

- When called for a non-existent game (`getGameBySlugMock` returns null)
- Then it returns `{ title: 'Nie znaleziono gry | Agregator Planszówek' }` with no OG fields

### AC-2 — `generateMetadata` for Homepage

- Given `generateMetadata()` (or `export const metadata`) in `app/page.tsx`
- When called
- Then it returns:
  - `title`: `"Agregator Cen Planszówek — Porównaj ceny planszówek w Polsce"`
  - `description`: `"Znajdź najlepsze okazje na planszówki w polskich sklepach. Porównujemy ceny w AlePlanszowki, 3Trolle i innych. Aktualizowane codziennie."`
  - `openGraph.image`: `"${siteUrl}/opengraph-image.png"`
  - `openGraph.locale`: `"pl_PL"`
  - `robots`: `{ index: true, follow: true }`
- And the layout.tsx `metadata` is kept as fallback for other pages — do NOT remove it

### AC-3 — OG Image (`app/opengraph-image.tsx`)

- Given `GET /opengraph-image.png`
- When requested
- Then Next.js renders a 1200×630 `ImageResponse` with:
  - Background fill: `#F2EAD8` (parchment)
  - Logo text: `"Agregator Planszówek"` in Playfair Display 60px, color `#3D5C3A`, centered
  - Tagline: `"Porównaj ceny planszówek w polskich sklepach"` in 28px, color `#6B5744`, centered below logo
  - Subtle decorative line between logo and tagline: `1px solid #D4C4AE`, width 200px, centered

### AC-4 — `GameJsonLd` Component

- Given `<GameJsonLd>` rendered in `app/gra/[slug]/page.tsx`
- When inspected in page source
- Then it outputs `<script type="application/ld+json">` with `@type: "Product"` schema:
  - `name`: game name
  - `image`: `game.cover_image_url ?? null` (omitted if null — never `""` or `null` string)
  - `brand`: `{ "@type": "Brand", "name": publishers[0] }` — omitted if publishers empty/null
  - `aggregateRating`: `{ "@type": "AggregateRating", "ratingValue": bgg_avg_rating, "ratingCount": 1000, "bestRating": 10, "worstRating": 1 }` — **omitted entirely** when `bgg_avg_rating` is null (no null value, no "0")

- Given `bgg_avg_rating = null`
- When `GameJsonLd` renders
- Then the output JSON has no `aggregateRating` key at all — invalid structured data is worse than missing

### AC-5 — `OfferJsonLd` Component

- Given `<OfferJsonLd>` rendered alongside `GameJsonLd`
- When inspected
- Then it outputs `offers` array as separate `<script type="application/ld+json">` block with `@type: "ItemList"` wrapping one `@type: "Offer"` per product:
  - `price`: numeric string (e.g. `"89.99"`) — already string from DB Decimal→string pipeline
  - `priceCurrency`: `"PLN"`
  - `availability`: `"https://schema.org/InStock"` when `in_stock = true`, `"https://schema.org/OutOfStock"` when `in_stock = false`
  - `seller`: `{ "@type": "Organization", "name": storeName }`
  - `url`: product URL

- Given products = [] (Story 4.5 not yet wired)
- When `OfferJsonLd` renders with empty products array
- Then it renders nothing (null) — no empty `offers: []` in structured data

### AC-6 — Sitemap (`app/sitemap.ts`)

- Given `GET /sitemap.xml`
- When requested
- Then it returns a valid sitemap containing one `<url>` per game slug from `getAllGameSlugsForSitemap()`
- Each entry includes: `url: "${siteUrl}/gra/${slug}"`, `lastModified: new Date()`, `changeFrequency: "daily"`, `priority: 0.8`
- Homepage entry: `url: siteUrl`, `changeFrequency: "hourly"`, `priority: 1.0`
- And a `<link rel="sitemap" type="application/xml" href="/sitemap.xml">` is added to `app/layout.tsx` metadata

- Given Story 4.5 (Dev B) not yet done
- When sitemap runs
- Then `getAllGameSlugsForSitemap()` returns mock slugs `['brass-birmingham', 'scythe']` — same as mock games in page.tsx — no crash, no empty sitemap

### AC-7 — robots.txt (`app/robots.ts`)

- Given `GET /robots.txt`
- When requested
- Then it returns:
  ```
  User-agent: *
  Allow: /
  Disallow: /api/
  Sitemap: ${siteUrl}/sitemap.xml
  ```

### AC-8 — NEXT_PUBLIC_SITE_URL env var

- Given `.env.example`
- When reviewed
- Then it contains `NEXT_PUBLIC_SITE_URL=https://agregatorplanszowek.pl` with a comment
- And all canonical/sitemap URLs use `const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agregatorplanszowek.pl'` — never hardcoded without fallback

---

## Files to Create / Modify

| File | Type | Notes |
|------|------|-------|
| `web/src/app/gra/[slug]/page.tsx` | MODIFIED | Expand `generateMetadata` + add `<GameJsonLd>` + `<OfferJsonLd>` |
| `web/src/app/page.tsx` | MODIFIED | Add `export const metadata` |
| `web/src/app/opengraph-image.tsx` | NEW | Next.js ImageResponse, 1200×630 |
| `web/src/components/GameJsonLd.tsx` | NEW | Server Component, `@type: Product` JSON-LD |
| `web/src/components/OfferJsonLd.tsx` | NEW | Server Component, `@type: Offer` array JSON-LD |
| `web/src/app/sitemap.ts` | NEW | Next.js MetadataRoute.Sitemap |
| `web/src/app/robots.ts` | NEW | Next.js MetadataRoute.Robots |
| `web/.env.example` | MODIFIED | Add `NEXT_PUBLIC_SITE_URL` |
| `web/src/app/layout.tsx` | MODIFIED | Add sitemap link to metadata |

---

## Technical Implementation Guide

### siteUrl Helper — Use Everywhere

Create a shared constant in `lib/config.ts`:

```typescript
// web/src/lib/config.ts — NEW file
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agregatorplanszowek.pl'
```

Import this in page.tsx, sitemap.ts, robots.ts — never repeat the hardcoded string.

### Expanding `generateMetadata` in `app/gra/[slug]/page.tsx`

Current state: returns only `{ title }` — needs full OG + description + canonical.

```typescript
// Replace the existing generateMetadata function
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const game = await getGameBySlugMock(slug)

  if (!game) return { title: 'Nie znaleziono gry | Agregator Planszówek' }

  const name = game.name.length > 57 ? game.name.slice(0, 57) + '…' : game.name
  const title = `${name} — najlepsza cena | Agregator Planszówek`

  const rawDesc = `Sprawdź aktualną cenę ${game.name} w polskich sklepach. Porównaj oferty AlePlanszowki, 3Trolle i innych.`
  const description = rawDesc.length > 155 ? rawDesc.slice(0, 152) + '…' : rawDesc

  const image = game.cover_image_url ?? `${siteUrl}/opengraph-image.png`

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/gra/${slug}` },
    openGraph: {
      title,
      description,
      images: [image],
      type: 'website',
      locale: 'pl_PL',
    },
    robots: { index: true, follow: true },
  }
}
```

**Preserve everything else in this file** — mock getter, placeholders, breadcrumb, GameMeta, layout.

### Add `<GameJsonLd>` and `<OfferJsonLd>` to page.tsx

Add these inside the `return (...)` block, BEFORE the breadcrumb nav (they're invisible `<script>` tags):

```tsx
return (
  <>
    <GameJsonLd game={game} />
    <OfferJsonLd products={[]} />  {/* empty until Story 4.5 wires real data */}

    <nav aria-label="Breadcrumb" ...>
    ...
```

Both are Server Components — no `'use client'`.

### `GameJsonLd.tsx`

```tsx
// web/src/components/GameJsonLd.tsx
// Server Component — no 'use client'

import type { GameMetaGame } from '@/components/GameMeta'

interface Props {
  game: GameMetaGame
}

export function GameJsonLd({ game }: Props) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: game.name,
  }

  if (game.cover_image_url) {
    schema.image = game.cover_image_url
  }

  if (game.publishers && game.publishers.length > 0) {
    schema.brand = { '@type': 'Brand', name: game.publishers[0] }
  }

  if (game.bgg_avg_rating !== null && game.bgg_avg_rating !== undefined) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: parseFloat(game.bgg_avg_rating),
      ratingCount: 1000,
      bestRating: 10,
      worstRating: 1,
    }
  }
  // If bgg_avg_rating is null → aggregateRating key is simply not added

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

### `OfferJsonLd.tsx`

```tsx
// web/src/components/OfferJsonLd.tsx
// Server Component — no 'use client'

export interface OfferProduct {
  price: string        // Decimal→string, e.g. "89.99"
  in_stock: boolean
  store_name: string
  product_url: string
  affiliate_url?: string | null
}

interface Props {
  products: OfferProduct[]
}

export function OfferJsonLd({ products }: Props) {
  if (products.length === 0) return null  // no empty offers array in structured data

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'PLN',
        availability: p.in_stock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: p.store_name },
        url: p.affiliate_url ?? p.product_url,
      },
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

### Homepage Metadata (`app/page.tsx`)

Add at the top of the file (before the component):

```typescript
import type { Metadata } from 'next'
import { siteUrl } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Agregator Cen Planszówek — Porównaj ceny planszówek w Polsce',
  description:
    'Znajdź najlepsze okazje na planszówki w polskich sklepach. Porównujemy ceny w AlePlanszowki, 3Trolle i innych. Aktualizowane codziennie.',
  openGraph: {
    title: 'Agregator Cen Planszówek',
    description: 'Porównaj ceny planszówek w polskich sklepach internetowych',
    images: [`${siteUrl}/opengraph-image.png`],
    locale: 'pl_PL',
    type: 'website',
  },
  robots: { index: true, follow: true },
}
```

**Do not remove** the `metadata` export from `layout.tsx` — it remains as a fallback for any page that doesn't define its own.

### `app/opengraph-image.tsx`

Next.js 16 uses `next/og` for ImageResponse. The file must be at `app/opengraph-image.tsx` (Next.js convention — automatically served at `/opengraph-image.png`).

```tsx
// web/src/app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Agregator Cen Planszówek'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F2EAD8',
          gap: '24px',
        }}
      >
        <div
          style={{
            fontFamily: 'serif',
            fontSize: '60px',
            fontWeight: 700,
            color: '#3D5C3A',
            letterSpacing: '-1px',
          }}
        >
          Agregator Planszówek
        </div>

        <div
          style={{
            width: '200px',
            height: '1px',
            backgroundColor: '#D4C4AE',
          }}
        />

        <div
          style={{
            fontFamily: 'sans-serif',
            fontSize: '28px',
            color: '#6B5744',
          }}
        >
          Porównaj ceny planszówek w polskich sklepach
        </div>
      </div>
    ),
    { ...size }
  )
}
```

**Important:** `next/og` ImageResponse does NOT support `next/font/google` loading at edge runtime. Use generic `'serif'` / `'sans-serif'` — that's expected and acceptable. Do NOT try to load Playfair Display here.

### `app/sitemap.ts`

```typescript
// web/src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/config'

// Stub until Story 4.5 provides getAllGameSlugs() from db/queries/game-passport.ts
// When 4.5 is done: replace this with: import { getAllGameSlugs } from '@/db/queries/game-passport'
async function getAllGameSlugsForSitemap(): Promise<string[]> {
  // TODO Story 4.5: replace with real DB query
  return ['brass-birmingham', 'scythe']
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getAllGameSlugsForSitemap()

  const gameEntries: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${siteUrl}/gra/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    ...gameEntries,
  ]
}
```

### `app/robots.ts`

```typescript
// web/src/app/robots.ts
import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
```

### Add Sitemap Discovery to `layout.tsx`

Add `metadataBase` and sitemap link to the layout's existing metadata export:

```typescript
// In layout.tsx — replace existing metadata export:
export const metadata: Metadata = {
  title: 'Agregator Cen Planszówek',
  description: 'Porównaj ceny planszówek w polskich sklepach internetowych',
  metadataBase: new URL(siteUrl),  // ADD THIS — needed for relative OG image URLs to work
}
```

**Why `metadataBase` matters:** Without it, Next.js cannot resolve relative image paths in `openGraph.images`. With it, relative paths like `/opengraph-image.png` in child pages resolve correctly. This goes in `layout.tsx` (root metadata), not in every page.

Import `siteUrl` at the top of `layout.tsx`:
```typescript
import { siteUrl } from '@/lib/config'
```

### `.env.example` Addition

Add to `web/.env.example`:
```bash
# Public site URL (used for canonical URLs, OG images, sitemap)
NEXT_PUBLIC_SITE_URL=https://agregatorplanszowek.pl
```

---

## Established Patterns — Follow Exactly

| Pattern | Where | Rule |
|---------|-------|------|
| Inline styles | ALL components | No Tailwind utility classes in JSX |
| `var(--color-*)` CSS vars | page.tsx, components | Named colors only — raw hex only in SVG/OG ImageResponse |
| Server Components by default | GameJsonLd, OfferJsonLd | No `'use client'` unless state/event needed |
| `dangerouslySetInnerHTML` | JSON-LD scripts | Standard for inline `<script>` JSON-LD in React |
| Warm brown shadow | DealCard, GameMeta | `rgba(44,31,20,N)` — but not relevant here |
| No `@/db/index` imports | ESLint enforced | Never in components — only in `db/queries/` |

**Color reference for this story:**

```
#F2EAD8  parchment background (OG image background)
#3D5C3A  primary green (OG image logo text)
#6B5744  text-secondary (OG image tagline)
#D4C4AE  border (OG image decorative line)
```

---

## Current State of Modified Files

### `app/gra/[slug]/page.tsx` (current state — preserve all of this)

- Has `getGameBySlugMock()` → Keep (Story 4.5 replaces it)
- Has `generateStaticParams()` returning `[]` → Keep
- Has `generateMetadata()` returning only `{ title }` → **Expand this** (AC-1)
- Has breadcrumb nav, passport-grid, GameMeta → Keep
- Has placeholder divs for BestDealBanner, PriceTable, PriceChart → Keep
- **Add:** `<GameJsonLd>` and `<OfferJsonLd>` before the breadcrumb nav

### `app/page.tsx` (current state)

- Has NO metadata export → **Add** `export const metadata` (AC-2)
- Has `getLastScrapeTime()` mock function → Keep
- Has `SkeletonFeed` component → Keep
- Has `HomePage` component with mock deals → Keep
- Has `import { Suspense }` and other existing imports → Add `Metadata` and `siteUrl` imports

### `app/layout.tsx` (current state)

- Has basic `metadata` with title + description → **Add `metadataBase`** only
- Has font loads (Playfair, DM Sans) → Keep
- Has SiteHeader, SiteFooter → Keep

---

## What This Story Does NOT Change

- `getGameBySlugMock()` — stays until Story 4.5 (Dev B) provides real query
- `generateStaticParams()` stub — stays until Story 4.5 provides `getAllGameSlugs()`
- Placeholder divs for BestDealBanner, PriceTable, PriceChart → untouched
- `StalenessWarningBanner`, FilterBar, DealCard, ListRow → untouched
- Any files in `db/queries/` — not touched in this story

---

## Tests

No dedicated test file required for this story — the components are pure data-transformation (JSON.stringify) with no interactive state. Manual validation:

1. Run `npm run dev` → open `/` → View Source → confirm `<meta property="og:title">` present
2. Run `npm run dev` → open `/gra/brass-birmingham` → View Source → confirm `<script type="application/ld+json">` with `@type: Product`
3. Run `npm run dev` → open `/sitemap.xml` → confirm valid XML with `/gra/brass-birmingham` entry
4. Run `npm run dev` → open `/robots.txt` → confirm `Disallow: /api/` and sitemap URL
5. Run `npm run dev` → open `/opengraph-image.png` → confirm 1200×630 image renders

TypeScript validation is the primary correctness gate: `tsc --noEmit` must pass (MetadataRoute types are strict in Next.js 16).

---

## Definition of Done

- [x] `web/src/lib/config.ts` created with `siteUrl` export
- [x] `web/.env.example` has `NEXT_PUBLIC_SITE_URL`
- [x] `app/gra/[slug]/page.tsx` — `generateMetadata` returns full OG + description + canonical
- [x] `app/gra/[slug]/page.tsx` — `<GameJsonLd>` and `<OfferJsonLd products={[]}>` rendered
- [x] `app/page.tsx` — `export const metadata` with OG image and description
- [x] `app/opengraph-image.tsx` — created, renders 1200×630 image at `/opengraph-image.png`
- [x] `components/GameJsonLd.tsx` — created, no `aggregateRating` when `bgg_avg_rating` is null
- [x] `components/OfferJsonLd.tsx` — created, returns null when products = []
- [x] `app/sitemap.ts` — created, homepage + game slugs in output
- [x] `app/robots.ts` — created, `Disallow: /api/`
- [x] `app/layout.tsx` — `metadataBase` added to existing metadata export
- [x] `tsc --noEmit` clean
- [x] ESLint clean
- [x] `vitest run` exits 0 (127 tests pass — 5 new tests added, zero regressions)
- [ ] Manual: `/opengraph-image.png` loads in browser
- [ ] Manual: `/sitemap.xml` is valid XML with at least 2 entries
- [ ] Manual: Game Passport page source has `<script type="application/ld+json">`

---

---

## Dev Agent Record

### File List

- `web/src/lib/config.ts` — NEW: `siteUrl` export
- `web/.env.example` — MODIFIED: added `NEXT_PUBLIC_SITE_URL`
- `web/src/components/GameJsonLd.tsx` — NEW: Product JSON-LD Server Component
- `web/src/components/OfferJsonLd.tsx` — NEW: ItemList/Offer JSON-LD Server Component
- `web/src/app/opengraph-image.tsx` — NEW: Next.js OG ImageResponse 1200×630
- `web/src/app/sitemap.ts` — NEW: MetadataRoute.Sitemap
- `web/src/app/robots.ts` — NEW: MetadataRoute.Robots
- `web/src/app/gra/[slug]/page.tsx` — MODIFIED: expanded generateMetadata + GameJsonLd + OfferJsonLd
- `web/src/app/page.tsx` — MODIFIED: added export const metadata
- `web/src/app/layout.tsx` — MODIFIED: added metadataBase + siteUrl import
- `web/src/app/gra/[slug]/game-passport.test.tsx` — MODIFIED: updated title assertion + 5 new AC-1 tests

### Completion Notes

Zaimplementowano SEO architecture (Stories 5.4+5.5+5.6) w jednej historyjce:
- `siteUrl` jako shared constant w `lib/config.ts`
- `generateMetadata` w game passport zwraca pełne OG + opis + canonical + robots
- `GameJsonLd` poprawnie pomija `aggregateRating` gdy `bgg_avg_rating === null`
- `OfferJsonLd` zwraca null dla pustej tablicy products
- `opengraph-image.tsx` na edge runtime z ImageResponse 1200×630
- Sitemap z mock slugami (zastąpione przez Story 4.5)
- Robots.txt z `Disallow: /api/`
- `metadataBase` w layout.tsx umożliwia resolve relative OG image URLs
- 127 testów pass (5 nowych dla generateMetadata AC-1)

## Change Log

- 2026-06-17: Combined story 5.4 + 5.5 + 5.6 created — SEO meta tags, JSON-LD structured data, sitemap & robots.txt
- 2026-06-17: Implemented — all automated checks pass (tsc, eslint, 127 tests)
