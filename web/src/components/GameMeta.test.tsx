import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameMeta, type GameMetaGame } from './GameMeta'

const baseGame: GameMetaGame = {
  name: 'Brass: Birmingham',
  cover_image_url: null,
  is_expansion: false,
  designers: ['Martin Wallace'],
  publishers: ['Roxley Games'],
  year_published: 2018,
  bgg_rank: 2,
  bgg_category_rank: null,
  bgg_avg_rating: '8.60',
  complexity: '3.89',
  mechanics: ['Network and Route Building', 'Hand Management', 'Loans'],
  min_players: 2,
  max_players: 4,
  min_playtime: 60,
  max_playtime: 120,
  min_age: 14,
  rules_pdf_url: null,
}

describe('GameMeta', () => {
  // AC-2: Null cover fallback
  test('1. null cover_image_url → gradient placeholder with aria-hidden', () => {
    const { container } = render(<GameMeta game={{ ...baseGame, cover_image_url: null }} />)
    const placeholder = container.querySelector('[aria-hidden="true"]')
    expect(placeholder).not.toBeNull()
    expect(placeholder).toHaveStyle({ borderRadius: '12px' })
    expect(container.querySelector('img')).toBeNull()
  })

  // AC-1: Real cover image
  test('2. real cover_image_url → <img> with correct alt', () => {
    const url = 'https://cf.geekdo-images.com/brass.jpg'
    render(<GameMeta game={{ ...baseGame, cover_image_url: url }} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', url)
    expect(img).toHaveAttribute('alt', 'Brass: Birmingham')
  })

  // AC-3: Null rating → "Brak oceny BGG"
  test('3. bgg_avg_rating = null → "Brak oceny BGG" shown, no star', () => {
    render(<GameMeta game={{ ...baseGame, bgg_avg_rating: null }} />)
    expect(screen.getByTestId('bgg-no-rating')).toBeInTheDocument()
    expect(screen.getByTestId('bgg-no-rating').textContent).toBe('Brak oceny BGG')
    expect(screen.queryByTestId('bgg-rating-value')).toBeNull()
  })

  // AC-3: Real rating
  test('4. bgg_avg_rating = "8.1" → value and star shown', () => {
    render(<GameMeta game={{ ...baseGame, bgg_avg_rating: '8.1' }} />)
    const ratingEl = screen.getByTestId('bgg-rating-value')
    expect(ratingEl).toBeInTheDocument()
    expect(ratingEl.textContent).toBe('8.1')
    expect(screen.queryByTestId('bgg-no-rating')).toBeNull()
  })

  // AC-4: Expansion badge visible
  test('5. is_expansion = true → "DODATEK" badge visible', () => {
    render(<GameMeta game={{ ...baseGame, is_expansion: true }} />)
    const badge = screen.getByTestId('expansion-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toBe('DODATEK')
  })

  // AC-4: No expansion badge
  test('6. is_expansion = false → no badge', () => {
    render(<GameMeta game={{ ...baseGame, is_expansion: false }} />)
    expect(screen.queryByTestId('expansion-badge')).toBeNull()
  })

  // AC-5: 6 mechanics → 5 chips + overflow
  test('7. 6 mechanics → 5 chips + "i 1 więcej"', () => {
    const game = {
      ...baseGame,
      mechanics: ['A', 'B', 'C', 'D', 'E', 'F'],
    }
    render(<GameMeta game={game} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
    expect(screen.queryByText('F')).toBeNull()
    const overflow = screen.getByTestId('mechanics-overflow')
    expect(overflow.textContent).toBe('i 1 więcej')
  })

  // AC-5: 5 mechanics → no overflow
  test('8. 5 mechanics → all 5 chips, no overflow text', () => {
    const game = {
      ...baseGame,
      mechanics: ['A', 'B', 'C', 'D', 'E'],
    }
    render(<GameMeta game={game} />)
    expect(screen.getByText('E')).toBeInTheDocument()
    expect(screen.queryByTestId('mechanics-overflow')).toBeNull()
  })

  // AC-1: null designers → "—"
  test('9. designers = null → "—" rendered', () => {
    render(<GameMeta game={{ ...baseGame, designers: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  // AC-1: null rules_pdf_url → no link
  test('10. rules_pdf_url = null → no PDF link rendered', () => {
    render(<GameMeta game={{ ...baseGame, rules_pdf_url: null }} />)
    expect(screen.queryByText(/Zasady PDF/)).toBeNull()
  })

  // AC-1: rules_pdf_url present → link with correct attrs
  test('11. rules_pdf_url present → "Zasady PDF →" link with correct target and rel', () => {
    const url = 'https://example.com/rules.pdf'
    render(<GameMeta game={{ ...baseGame, rules_pdf_url: url }} />)
    const link = screen.getByText('Zasady PDF →')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // P1-2: empty string bgg_avg_rating bypasses null check
  test('12. bgg_avg_rating "" (empty string) → falls back to "Brak oceny BGG"', () => {
    render(<GameMeta game={{ ...baseGame, bgg_avg_rating: '' }} />)
    expect(screen.getByTestId('bgg-no-rating')).toBeInTheDocument()
    expect(screen.queryByTestId('bgg-rating-value')).toBeNull()
  })

  // P1-3: bgg_category_rank runtime guard
  test('13. bgg_category_rank valid shape → category chip rendered', () => {
    render(<GameMeta game={{ ...baseGame, bgg_category_rank: { category: 'Strategy', rank: 5 } }} />)
    expect(screen.getByText('Strategy #5')).toBeInTheDocument()
  })

  test('14. bgg_category_rank malformed shape → no chip rendered', () => {
    const malformed = { category: null, rank: null } as unknown as { category: string; rank: number }
    render(<GameMeta game={{ ...baseGame, bgg_category_rank: malformed }} />)
    expect(screen.queryByText(/Strategy/)).toBeNull()
    expect(screen.queryByText(/#null/)).toBeNull()
  })

  // TST-1: formatPlayers branches
  test('15. min_players null → Gracze cell shows "—"', () => {
    render(<GameMeta game={{ ...baseGame, min_players: null, max_players: null }} />)
    expect(screen.getByTestId('meta-players').textContent).toBe('—')
  })

  test('16. min_players set, max_players null → "N+ graczy"', () => {
    render(<GameMeta game={{ ...baseGame, min_players: 2, max_players: null }} />)
    expect(screen.getByTestId('meta-players').textContent).toBe('2+ graczy')
  })

  test('17. min_players = max_players → "N graczy"', () => {
    render(<GameMeta game={{ ...baseGame, min_players: 2, max_players: 2 }} />)
    expect(screen.getByTestId('meta-players').textContent).toBe('2 graczy')
  })

  test('18. min_players < max_players → "N–M graczy"', () => {
    render(<GameMeta game={{ ...baseGame, min_players: 2, max_players: 4 }} />)
    expect(screen.getByTestId('meta-players').textContent).toBe('2–4 graczy')
  })

  // TST-2: formatPlaytime branches
  test('19. min_playtime null → Czas gry cell shows "—"', () => {
    render(<GameMeta game={{ ...baseGame, min_playtime: null, max_playtime: null }} />)
    expect(screen.getByTestId('meta-playtime').textContent).toBe('—')
  })

  test('20. max_playtime null → "N+ min"', () => {
    render(<GameMeta game={{ ...baseGame, min_playtime: 60, max_playtime: null }} />)
    expect(screen.getByTestId('meta-playtime').textContent).toBe('60+ min')
  })

  test('21. min_playtime = max_playtime → "N min"', () => {
    render(<GameMeta game={{ ...baseGame, min_playtime: 90, max_playtime: 90 }} />)
    expect(screen.getByTestId('meta-playtime').textContent).toBe('90 min')
  })

  // TST-3: complexity
  test('22. complexity null → "—" in Trudność cell', () => {
    render(<GameMeta game={{ ...baseGame, complexity: null }} />)
    expect(screen.getByTestId('meta-complexity').textContent).toBe('—')
  })

  test('23. complexity "3.89" → "3.9 / 5" (toFixed rounding)', () => {
    render(<GameMeta game={{ ...baseGame, complexity: '3.89' }} />)
    expect(screen.getByTestId('meta-complexity').textContent).toBe('3.9 / 5')
  })

  // TST-4: bgg_rank chip
  test('24. bgg_rank non-null + rating present → "BGG #N" chip visible', () => {
    render(<GameMeta game={{ ...baseGame, bgg_rank: 2, bgg_avg_rating: '8.6' }} />)
    expect(screen.getByText('BGG #2')).toBeInTheDocument()
  })

  test('25. bgg_rank null + rating present → no BGG rank chip', () => {
    render(<GameMeta game={{ ...baseGame, bgg_rank: null, bgg_avg_rating: '8.6' }} />)
    expect(screen.queryByText(/BGG #/)).toBeNull()
  })

  // TST-6: mechanics null and empty
  test('26. mechanics null → Mechaniki section hidden', () => {
    render(<GameMeta game={{ ...baseGame, mechanics: null }} />)
    expect(screen.queryByText('Mechaniki')).toBeNull()
  })

  test('27. mechanics [] → Mechaniki section hidden', () => {
    render(<GameMeta game={{ ...baseGame, mechanics: [] }} />)
    expect(screen.queryByText('Mechaniki')).toBeNull()
  })

  // TST-7: publisherLine combinations
  test('28. publishers null + year present → shows year alone', () => {
    render(<GameMeta game={{ ...baseGame, publishers: null, year_published: 2018 }} />)
    expect(screen.getByTestId('publisher-line').textContent).toBe('2018')
  })

  test('29. publishers present + year null → shows publisher alone', () => {
    render(<GameMeta game={{ ...baseGame, publishers: ['Roxley'], year_published: null }} />)
    expect(screen.getByTestId('publisher-line').textContent).toBe('Roxley')
  })

  test('30. publishers null + year null → publisher line hidden', () => {
    render(<GameMeta game={{ ...baseGame, publishers: null, year_published: null }} />)
    expect(screen.queryByTestId('publisher-line')).toBeNull()
  })

  // TST-8: min_age
  test('31. min_age null → "—" in Wiek cell', () => {
    render(<GameMeta game={{ ...baseGame, min_age: null }} />)
    expect(screen.getByTestId('meta-age').textContent).toBe('—')
  })
})
