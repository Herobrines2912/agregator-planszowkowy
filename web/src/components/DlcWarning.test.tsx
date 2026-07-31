import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DlcWarning } from './DlcWarning'
import type { BaseGameRef } from '@/db/queries/game-passport'

function baseGame(overrides: Partial<BaseGameRef> = {}): BaseGameRef {
  return { name: 'Brass: Birmingham', slug: 'brass-birmingham', bgg_id: 224517, current_min_price: '199.00', ...overrides }
}

describe('DlcWarning', () => {
  // AC-1: full render with price
  test('1. isExpansion=true, baseGame with price → banner renders with name, price, link', () => {
    render(<DlcWarning isExpansion={true} baseGame={baseGame()} />)

    expect(screen.getByTestId('dlc-warning')).toBeInTheDocument()
    expect(screen.getByText('Brass: Birmingham')).toBeInTheDocument()
    expect(screen.getByTestId('dlc-warning-price')).toHaveTextContent('Cena od 199 zł')

    const link = screen.getByTestId('dlc-warning-link')
    expect(link).toHaveAttribute('href', '/gra/brass-birmingham')
    expect(link).toHaveTextContent('Zobacz grę bazową →')

    expect(screen.queryByTestId('dlc-warning-bgg-link')).toBeNull()
    expect(screen.queryByTestId('dlc-warning-no-offers')).toBeNull()
  })

  // AC-2: orphan expansion — no resolvable base game
  test('2. isExpansion=true, baseGame=null → renders nothing', () => {
    const { container } = render(<DlcWarning isExpansion={true} baseGame={null} />)
    expect(container.firstChild).toBeNull()
  })

  // AC-3: not an expansion, regardless of baseGame value
  test('3. isExpansion=false, baseGame non-null → renders nothing', () => {
    const { container } = render(<DlcWarning isExpansion={false} baseGame={baseGame()} />)
    expect(container.firstChild).toBeNull()
  })

  // AC-4: base game resolved but has no in-stock offers, bgg_id present
  test('4. current_min_price=null, bgg_id present → BGG fallback link shown, no crash', () => {
    render(<DlcWarning isExpansion={true} baseGame={baseGame({ current_min_price: null, bgg_id: 224517 })} />)

    expect(screen.queryByTestId('dlc-warning-price')).toBeNull()

    const bggLink = screen.getByTestId('dlc-warning-bgg-link')
    expect(bggLink).toHaveAttribute('href', 'https://boardgamegeek.com/boardgame/224517')
    expect(bggLink).toHaveTextContent('Brak ofert w sklepach — sprawdź BGG →')
    expect(bggLink).toHaveAttribute('target', '_blank')
  })

  // AC-5: base game resolved, no offers, and no bgg_id → plain text fallback, no link
  test('5. current_min_price=null, bgg_id=null → plain text fallback, no BGG link', () => {
    render(<DlcWarning isExpansion={true} baseGame={baseGame({ current_min_price: null, bgg_id: null })} />)

    expect(screen.queryByTestId('dlc-warning-bgg-link')).toBeNull()
    expect(screen.getByTestId('dlc-warning-no-offers')).toHaveTextContent('Brak ofert w sklepach')
  })

  // guard order: is_expansion checked before baseGame truthiness
  test('6. isExpansion=false, baseGame=null → renders nothing', () => {
    const { container } = render(<DlcWarning isExpansion={false} baseGame={null} />)
    expect(container.firstChild).toBeNull()
  })
})
