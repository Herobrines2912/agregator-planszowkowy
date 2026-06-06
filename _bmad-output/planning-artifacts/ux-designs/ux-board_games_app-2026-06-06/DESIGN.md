---
title: Agregator Cen Planszówek
status: final
created: 2026-06-07
updated: 2026-06-07
colors:
  background: "#F2EAD8"
  surface: "#DDD0BC"
  surface-header: "#EDE5D4"
  surface-card: "#DDD0BC"
  primary: "#3D5C3A"
  primary-dark: "#2E4A2C"
  text-primary: "#2C1F14"
  text-secondary: "#6B5744"
  text-muted: "#A89480"
  border: "#D4C4AE"
  border-strong: "#C5B49A"
  badge-hot: "#C4622D"
  badge-discount-low: "#3D5C3A"
  badge-discount-mid: "#C07B18"
  badge-discount-high: "#C42B2B"
  overlay: "rgba(44,31,20,0.5)"
typography:
  heading-font: "Playfair Display"
  heading-weights: [400, 700, 800]
  body-font: "DM Sans"
  body-weights: [400, 500, 700]
  base-size: "15px"
  scale: [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 28, 36, 48, 52]
rounded:
  sm: "5px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
---

## Brand & Style

**Project name:** Agregator Cen Planszówek  
**Working title:** "Agregator Cen" (abbreviated in logo and footer)

**Aesthetic direction (DEC-01):** Enthusiast magazine / community passion project. The visual language communicates "made with love, not by a corporation." Every design decision — warm parchment backgrounds, serif headlines, a hand-tilted HOT sticker — reinforces the feeling of a resource built by a board game fan for other board game fans.

**Voice register:** Warm, knowledgeable, community-first. The product speaks like a trusted friend who happens to know every Polish board game store's pricing history. Never condescending, never salesy.

**Anti-patterns — what this product explicitly avoids:**

- Corporate deal-site aggression (flashing banners, "SUPER OKAZJA!!!" typography, countdown timers)
- Loud promotional red-and-yellow color language associated with discount retail
- The cluttered, information-overloaded approach of sites like i-szop.pl
- Pure white backgrounds — cold and sterile, inconsistent with the warm brand
- Pure black text — too harsh; the brand uses deep warm brown (#2C1F14) instead
- More than two font families in the same surface

**Reference vibes to embrace:** magazine-quality editorial design, dense-but-legible data tables that feel crafted (not auto-generated), illustrated board game rulebook typography.

**Dark mode:** Planned Phase 2. Dark variant uses deep sepia/brown tones — not pure black — to preserve the warmth of the brand. The cream/parchment palette inverts to a rich dark brown base while retaining the same semantic color tokens.

---

## Colors

All hex values extracted directly from mockup CSS.

| Token | Hex | Role | Usage notes |
|---|---|---|---|
| `background` | `#F2EAD8` | Page background | Parchment/cream — used on `body`, `.browser-body`. Never replaced with white. |
| `surface` | `#DDD0BC` | Default surface | Card backgrounds, table rows (odd), metadata grid, price table. |
| `surface-header` | `#EDE5D4` | Header & nav surface | Sticky header, breadcrumb bar, filter bar background, view toggle background. |
| `surface-card` | `#DDD0BC` | Card surface | Deal cards, chart cards, BGG info card, explainer card — same as `surface`. |
| `primary` | `#3D5C3A` | Brand green | Primary buttons, active states, HOT sticker text contrast, best-price box background, "Najtaniej" badge, chart line (AlePlanszowki), active view toggle segment. |
| `primary-dark` | `#2E4A2C` | Hover state for primary | Button hover on `.btn-offer:hover`, `.btn-kup:hover`. |
| `text-primary` | `#2C1F14` | Main text | Body copy, card titles, price values, table data — deep warm brown, not pure black. |
| `text-secondary` | `#6B5744` | Metadata & labels | Subtitles, store names, metadata labels, breadcrumb text, filter meta, section subtitles. |
| `text-muted` | `#A89480` | De-emphasized text | Strikethrough original prices, timestamps, placeholder text, footer copyright, muted notes. |
| `border` | `#D4C4AE` | Default border | Card borders, input borders, dividers, section separators. |
| `border-strong` | `#C5B49A` | Strong border | Metadata grid cell separators, price table cell separators, store chip borders on Game Passport. |
| `badge-hot` | `#C4622D` | HOT sticker | Terracotta — used only for the HOT sticker and as chart line color for 3Trolle. Distinct from all button greens. Never used for general badges. |
| `badge-discount-low` | `#3D5C3A` | Discount badge < 40% | Green — same token as `primary`. Low urgency. |
| `badge-discount-mid` | `#C07B18` | Discount badge 40–70% | Amber — medium urgency. Also used for DLC warning borders and amber sparklines. |
| `badge-discount-high` | `#C42B2B` | Discount badge > 70% | Red — high urgency, exceptional deal. Distinct from the HOT terracotta. |
| `overlay` | `rgba(44,31,20,0.5)` | Modal backdrop | Dim layer behind Email Alert modal. Extracted from `.dim-layer` which uses `rgba(44,31,20,0.52)` — canonicalized to 0.5. |

**HOT sticker note:** Terracotta `#C4622D` was chosen specifically to distinguish the HOT sticker from:

- The green primary buttons (would blend visually)
- Aggressive promotional red (too loud, too corporate)

The terracotta reads as "warm highlight" not "danger" or "sale."

**Discount badge system (DEC-05):** Badge color is always determined by value, never by brand color preference:

- `< 40%` → green `#3D5C3A`, white text
- `40–70%` → amber `#C07B18`, white text
- `> 70%` → red `#C42B2B`, white text

**Alert / warning:** Amber `#C07B18` for DLC banners (border and link color), data staleness warnings, and amber sparklines in Flipper Mode.

**Success:** Primary green `#3D5C3A` — checkmark circle in modal Step 3, "Najtaniej" badge, best-price row highlight border.

**Additional surface values noted in mockups (not in primary token set):**

- `#CFC0A8` — price table thead background (darker surface for table headers)
- `#E5DAC8` — flipper table even rows (lighter than #DDD0BC odd rows)
- `#F5F0EA` / `#F5EFE4` — input field backgrounds (slightly lighter than surface-header)
- `#3D2E1E` — body copy text on Game Passport description paragraphs (slightly warmer than text-primary; functionally equivalent)
- `#3D2A08` — DLC banner body text (very warm brown, used only within amber DLC context)

---

## Typography

**Heading font: Playfair Display** (Google Fonts, serif)  
Weights loaded: 400, 700, 800 (regular + italic for 400 loaded on Game Passport)

Used for:
- Logo name (20px, 800w, `#3D5C3A`, letter-spacing -0.3px)
- Page/section headings: h1, h2 (28px, 800w on homepage; 28px 700w on Game Passport)
- Game title on Passport hero (52px, 800w, letter-spacing -1px)
- Best price value callout (28px, 800w)
- Short game description (italic, 15px, 400w) — body italic Playfair Display
- Modal titles (20px, 700w)
- Flipper mode banner title (22px, 700w)
- Footer logo (16px, 700w)
- Cover label on game cover placeholder (22px, 700w)
- BGG info section title (18px, 700w)
- Summary card title in modal (15px, 700w)

**Body font: DM Sans** (Google Fonts, sans-serif)  
Weights loaded: 400, 500, 700

Used for: all UI text, data values, labels, buttons, metadata, filter chips, tags, table content, price figures, store names, logo tagline, placeholders.

**Key sizing decisions (extracted from CSS):**

| Use | Size | Weight | Color |
|---|---|---|---|
| Game title (Passport hero) | 52px | 800 | `#2C1F14` |
| Section headings | 28px | 800 (homepage) / 700 (Passport) | `#2C1F14` |
| Best price callout | 28px | 800 | `#fff` (on green bg) |
| Logo name | 20px | 800 | `#3D5C3A` |
| Modal title | 20px | 700 | `#2C1F14` |
| Flipper banner title | 22px | 700 | `#fff` |
| Cover label | 22px | 700 | `rgba(255,255,255,0.9)` |
| BGG info title | 18px | 700 | `#2C1F14` |
| Price (card, large) | 20px | 700 | `#2C1F14` |
| Price (price table row) | 18px | 800 | `#2C1F14` |
| Price (list row) | 16px | 700 | `#2C1F14` |
| Body text | 15px | 400 | `#2C1F14` / `#3D2E1E` |
| Card title | 16px | 700 | `#2C1F14` |
| List row title | 15px | 700 | `#2C1F14` |
| Search input | 14px | 400 | `#2C1F14` |
| Button text | 12–14px | 700 | varies |
| Store name (card) | 12px | 600 | `#6B5744` |
| Card subtitle | 12px | 500 | `#6B5744` |
| Meta labels (uppercase) | 10px | 500–700 | `#6B5744` |
| Logo tagline | 10px | 500 | `#6B5744` |
| HOT sticker text | 11px | 700 | `#fff` |

**HOT sticker typographic treatment:**  
Font: DM Sans, 11px, weight 700, letter-spacing 0.8px, text-transform uppercase, line-height default. The slightly condensed uppercase style with generous letter-spacing gives the sticker a hand-stamped quality without requiring a custom font.

**Italic body copy:**  
Playfair Display italic (400w) used exclusively for the 2-sentence game summary in the Game Passport hero. Left-bordered with `#D4C4AE` at 3px. Line-height 1.65. Creates visual distinction from the factual data above and the full description below.

**Base size:** 15px on `body`. Line-height 1.5 globally.

---

## Layout & Spacing

**Max content width:** 1280px (browser frame in mockups)

**Content padding:** 40px horizontal, 28–36px top, 48–64px bottom (varies by surface)

**Header height:** 64px, sticky (`position: sticky; top: 0; z-index: 100`)  
Header background: `#EDE5D4`, border-bottom: 1px solid `#D4C4AE`  
Header internal layout: `logo [flex-shrink:0]` → `search [flex:1, max-width:440px, margin:0 auto]` → `actions [flex-shrink:0]`, gap 32px

**Breadcrumb bar:** Separate bar below header on Game Passport. Background `#EDE5D4`, border-bottom 1px solid `#D4C4AE`, padding 8px 40px. Not present on homepage or Flipper Mode.

**Filter strip (homepage):** Below content-area top padding. Flex row, gap 12px, flex-wrap. Contains: Filtry button → divider → active tags → result count → spacer → view toggle → sort dropdown.

**Filter bar (list view):** Background `#EDE5D4`, border-bottom 1px solid `#D4C4AE`, padding 10px 40px. Rendered as a second bar below header (separate from content area).

**Card grid:** 4 columns, `grid-template-columns: repeat(4, 1fr)`, gap 22px

**Card image area height:** 148px

**List row:** flex row, padding 12px 16px, gap 12px, border-radius 10px, gap between rows 8px

**Section spacing:** 40px between sections (`margin-bottom: 40px` on `.section-block`)

**Hero layout (Game Passport):** 2-column grid, 38% / 62%, gap 40px

**Flipper table:** border-radius 10px on wrapper, body rows padding 12px 14px

**Footer:** margin-top 48px, padding 24px 40px, border-top 1px solid `#D4C4AE`, flex row space-between

---

## Elevation & Depth

Box-shadows use the warm brown base `rgba(44,31,20,N)` — never neutral grey shadows.

| Element | Shadow |
|---|---|
| Cards resting | `0 2px 8px rgba(44,31,20,0.08), 0 1px 2px rgba(44,31,20,0.05)` |
| Cards hover | `0 8px 28px rgba(44,31,20,0.16), 0 2px 6px rgba(44,31,20,0.08)` |
| List row hover | `0 4px 16px rgba(44,31,20,0.13)` |
| Modal | `0 24px 64px rgba(44,31,20,0.28)` |
| HOT sticker | `2px 3px 8px rgba(196,98,45,0.45)` (terracotta-tinted) |
| Browser frame (mockup) | `0 8px 48px rgba(44,31,20,0.18), 0 2px 8px rgba(44,31,20,0.08)` |
| Game cover | `0 4px 24px rgba(44,31,20,0.14), 0 1px 4px rgba(44,31,20,0.08)` |
| Flipper table wrap | `0 2px 12px rgba(44,31,20,0.07)` |
| Slider thumb | `0 2px 6px rgba(61,92,58,0.4)` (green-tinted) |
| Checkmark circle (modal success) | `0 4px 16px rgba(61,92,58,0.35)` (green-tinted) |

---

## Shapes

| Element | Border-radius |
|---|---|
| Deal cards | 12px |
| List rows | 10px |
| Primary buttons (`btn-offer`, `btn-flipper`) | 24px (pill) |
| Small pill buttons (`btn-alert`, `btn-filtry`, `btn-kup`) | 18–20px |
| Modal container | 16px |
| Overlay simulation | 20px |
| Price table wrapper | 14px |
| Chart card | 14px |
| BGG info card | 14px |
| Metadata grid | 12px (with `overflow: hidden`) |
| HOT sticker | 4–5px (hand-stamp feel; do not use full pill) |
| Discount badge | 6–8px |
| Filter chips / active tags | 20px (near-pill) |
| View toggle | 20px outer, 18px active segment |
| Store chip (Game Passport) | 20px |
| Search input | 24px |
| Hamburger button | 8px |
| Input fields in modal | 10px |
| Summary card in modal | 10px |

**HOT sticker transform:** `rotate(-4deg)` always. The tilt is a deliberate design decision (DEC-06) — it communicates "handmade" and "organic." Straightening removes this effect entirely.

---

## Components

### 1. Deal Card (card view)

**Visual structure:**

```
┌─────────────────────────────┐
│ [image placeholder 148px]   │
│ [HOT sticker top-left]      │
│ [discount badge top-right]  │
├─────────────────────────────┤
│ [card title — Playfair 16px]│
│ [subtitle — DM Sans 12px]   │
│ [divider line]              │
│ [price-current] [price-orig]│
│ [store logo + name] [CTA]   │
└─────────────────────────────┘
```

- Background: `#DDD0BC`, border-radius 12px, overflow visible (sticker can protrude)
- Inner wrapper (`card-inner`): border-radius 12px, `overflow: hidden` (clips image)
- Image area: 148px height, colored gradient placeholder; border-radius 12px 12px 0 0
- Image overlay: `repeating-linear-gradient` grain texture at 3% opacity
- Card body padding: 14px 16px 16px
- Divider between subtitle and price: 1px `#D4C4AE`

**States:**

- Resting: `box-shadow: 0 2px 8px rgba(44,31,20,0.08)`
- Hover: `transform: translateY(-3px)`, `box-shadow: 0 8px 28px rgba(44,31,20,0.16)`, HOT sticker enters wiggle animation
- Load: `cardFadeIn` keyframe — opacity 0→1, translateY 16px→0, staggered 70ms per card (delays: 0.05s, 0.12s, 0.19s, 0.26s... +0.07s each)

**Tokens:** surface-card, text-primary, text-secondary, border, primary

### 2. List Row (list view)

**Visual structure (flex row, left to right):**

`[48px thumbnail] [HOT pill?] [title+subtitle] [store chip] [spacer] [discount badge] [price block] [CTA button]`

- Background: `#DDD0BC`, border-radius 10px, padding 12px 16px, gap 12px
- Border: 1px solid `#D4C4AE`
- Best deal variant: `border-left: 3px solid #3D5C3A`
- Thumbnail: 48px × 48px, border-radius 8px, colored background placeholder

**States:**

- Resting: no elevation
- Hover: `transform: translateY(-1px)`, `box-shadow: 0 4px 16px rgba(44,31,20,0.13)`
- Load: `fadeInUp` keyframe, staggered 50ms per row

**Tokens:** surface-card, text-primary, text-secondary, border, primary

### 3. HOT Sticker

- Background: `#C4622D` (badge-hot token)
- Text: `#fff`, DM Sans, 11px, weight 700, letter-spacing 0.8px, text-transform uppercase
- Padding: 4px 9px
- Border-radius: 4px
- Transform: `rotate(-4deg)`
- Box-shadow: `2px 3px 8px rgba(196,98,45,0.45)`
- Position: `absolute`, `top: 12px`, `left: 10px`, `z-index: 10`
- On card hover: `@keyframes hotWiggle` — alternates `rotate(-5deg) scale(1.04)` → `rotate(-3deg) scale(1.07)`, infinite alternate, 0.4s ease

**List view variant (HOT pill):** Same terracotta background, inline-flex, border-radius 10px, `rotate(-2deg)`, font-size 10px. No box-shadow in list view.

### 4. Discount Badge

- Position: `absolute`, `top: 8px`, `right: 10px`, `z-index: 5` (on card)
- Font: DM Sans, 13px, weight 700, color `#fff`
- Padding: 4px 9px
- Border-radius: 6px
- Box-shadow: `0 2px 6px rgba(0,0,0,0.18)`
- Color by value: `badge-discount-low` (#3D5C3A), `badge-discount-mid` (#C07B18), `badge-discount-high` (#C42B2B)

**In Flipper Mode table:** Soft variant — semi-transparent background with colored text and border:
- Red: `background: rgba(196,43,43,0.12); color: #C42B2B; border: 1px solid rgba(196,43,43,0.3)`
- Amber: `background: rgba(192,123,24,0.12); color: #C07B18`
- Green: `background: rgba(61,92,58,0.12); color: #3D5C3A`

### 5. Filter Chip (Filtry button)

- Default: `border: 1.5px solid #3D5C3A`, `background: transparent`, `color: #3D5C3A`
- Hover: `background: #3D5C3A`, `color: #fff`
- Filter count bubble inside: `background: #3D5C3A`, `color: #fff`, border-radius 10px, 11px font, 700w
- Border-radius: 20px
- Padding: 7px 16px
- Font: DM Sans, 13px, weight 600

### 6. Active Filter Tag

- Background: `#3D5C3A`
- Color: `#fff`
- Border-radius: 20px
- Padding: 5px 10px 5px 12px
- Font: DM Sans, 12px, weight 600
- Remove button (×): opacity 0.65 resting, 1.0 on parent hover

### 7. Flipper Mode Button

- **Default (inactive — not on /flipper):** `border: 2px solid #3D5C3A`, `background: transparent`, `color: #3D5C3A`, border-radius 24px, DM Sans 13px 700w
- **Active (in Flipper Mode — on /flipper):** `border: 2px solid #3D5C3A`, `background: #3D5C3A`, `color: #fff`
- Hover (default state): `background: #3D5C3A`, `color: #fff`
- Padding: 8px 18px

### 8. Hamburger Button

- Size: 38 × 38px (homepage/passport mockup); 36 × 36px (list view mockup) — canonicalize to 38×38px
- Border: `1.5px solid #D4C4AE`
- Border-radius: 8px
- Background: transparent
- Three lines: `width: 16px`, `height: 2px`, `background: #2C1F14`, border-radius 2px, gap 4px
- Hover: `background: #E4DAC8`, `border-color: #B8A88E`

### 9. Best Price Box

- Background: `#3D5C3A`
- Border-radius: 12px
- Padding: 18px 22px
- Layout: flex row space-between, align-items center
- Label: DM Sans 12px, `rgba(255,255,255,0.7)`, uppercase, letter-spacing 0.5px
- Price value: Playfair Display 28px 800w, `#fff`
- Store sub-label: DM Sans 13px, `rgba(255,255,255,0.75)`
- CTA button inside: `background: rgba(255,255,255,0.18)`, `border: 2px solid rgba(255,255,255,0.5)`, `color: #fff`, border-radius 24px, DM Sans 14px 700w
- CTA hover: `background: rgba(255,255,255,0.28)`, `border-color: rgba(255,255,255,0.8)`

### 10. DLC Warning Banner

- Background: `linear-gradient(135deg, #F5E6C8 0%, #EDD89C 100%)`
- Border: `1.5px solid #C07B18`; left border overridden to `5px solid #C07B18`
- Border-radius: 10px
- Padding: 14px 20px
- Text color: `#3D2A08` (very warm dark amber-brown)
- Link button: `border: 1.5px solid #C07B18`, `color: #7A4A08`, border-radius 20px, hover fills with `#C07B18` white text

### 11. Price Table Row

- Table wrapper: `background: #DDD0BC`, border-radius 14px, `border: 1px solid #C5B49A`, `overflow: hidden`
- Thead: `background: #CFC0A8`, padding 12px 20px, font-size 11px, 700w, uppercase, letter-spacing 0.7px, color `#6B5744`
- Body rows: padding 16px 20px
- Cheapest row (`.row-best`): `border-left: 4px solid #3D5C3A`, `background: rgba(61,92,58,0.05)`
- Cheapest row hover: `background: rgba(61,92,58,0.10)`
- Default row hover: `background: rgba(61,92,58,0.07)`
- "Najtaniej" badge: `background: #3D5C3A`, `color: #fff`, border-radius 8px, font-size 10px, 700w, uppercase

### 12. View Toggle (Karty / Lista)

- Container: `background: #EDE5D4`, `border: 1.5px solid #D4C4AE`, border-radius 20px (homepage mockup) / border-radius 8px (list view mockup) — use 20px as canonical pill form
- Inactive segment: `background: transparent`, `color: #6B5744`
- Active segment: `background: #3D5C3A`, `color: #fff`, border-radius 18px (inner pill)
- Font: DM Sans, 12px, weight 600
- Padding per button: 6px 13px

### 13. Email Alert Modal

Three states, same modal container:

**Overlay:** `background: rgba(44,31,20,0.5)`, `backdrop-filter: blur(3px)`. Applied via `.dim-layer` behind the modal container.

**Container:** `background: #EDE5D4`, border-radius 16px, width 368px, `box-shadow: 0 24px 64px rgba(44,31,20,0.28)`. Modal header border-bottom: 1px solid `#D4C4AE`. Close button: 28×28px, circular, `background: #D4C4AE`.

**State 1 — Form:**
- Current price chip: `background: #3D5C3A`, `color: #fff`, border-radius 20px
- Price input: Playfair Display 24px 700w, large number entry, suffix "zł" in DM Sans 18px
- Slider: track `#D4C4AE`, fill `#3D5C3A`, thumb `#3D5C3A` with white border and green box-shadow
- Email input: border 1.5px `#D4C4AE`, border-radius 10px, background `#F5EFE4`
- Type B checkbox (unchecked): border 1.5px `#D4C4AE`, border-radius 4px
- Privacy note: DM Sans 10.5px, `#8A7562`
- Primary CTA: `background: #3D5C3A`, full-width, border-radius 10px

**State 2 — Pending:**
- Email icon: 56px emoji, centered
- Resend link: `#3D5C3A`, underlined, 11.5px
- Ghost button (Zmień e-mail): border `#D4C4AE`, `color: #6B5744`
- Outline button (Zamknij): border `#3D5C3A`, `color: #3D5C3A`

**State 3 — Success:**
- Modal title: `color: #3D5C3A` (not default dark brown)
- Checkmark circle: 64px, `background: #3D5C3A`, `box-shadow: 0 4px 16px rgba(61,92,58,0.35)`, white checkmark via CSS border trick
- Summary card: `background: #DDD0BC`, border-radius 10px
- "AKTYWNY" badge: `background: #3D5C3A`, font-size 9px, uppercase
- Game suggestion chips: `background: #DDD0BC`, `border: 1px solid #C4B59E`, border-radius 20px
- Primary CTA: same as State 1

---

## Do's and Don'ts

**DO:**

- Use Playfair Display for all h1/h2 headings, game titles, modal titles, and price callouts
- Use semantic discount badge colors — value determines color, never override with brand green
- Keep HOT sticker rotated at -4deg — straightening removes the "handmade" feel (DEC-06)
- Maintain warm brown text (`#2C1F14`) throughout — not pure black (`#000`)
- Use `rgba(44,31,20,N)` shadows — never neutral grey
- Apply staggered fade-in animation to all feed items (cards and list rows)
- Use "zł" suffix on all prices — never "PLN" or currency symbol

**DON'T:**

- Use white (`#FFFFFF`) as page background — always use parchment `#F2EAD8`
- Use green (`#3D5C3A`) for the HOT sticker — it blends visually with primary action buttons
- Use aggressive red for HOT — too promotional, inconsistent with brand warmth (DEC-06)
- Add more than 2 font families to any surface
- Use neutral grey box-shadows — always use the warm brown base
- Override HOT sticker rotation to 0deg
- Use pure uppercase body text except in explicit label contexts (metadata labels, badge text)
- Mix the soft Flipper Mode badge style (semi-transparent) with the solid card badge style on the same surface
