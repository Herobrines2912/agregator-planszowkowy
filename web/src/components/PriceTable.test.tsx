import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriceTable } from './PriceTable'
import type { GameProduct } from '@/db/queries/game-passport'

function product(overrides: Partial<GameProduct> & { id: number }): GameProduct {
  return {
    store_name: 'AlePlanszowki',
    price: '89.90',
    price_orig: null,
    in_stock: true,
    product_url: 'https://aleplanszowki.pl/gra',
    ...overrides,
  }
}

describe('PriceTable', () => {
  // AC-6: empty products array
  test('1. products = [] → renders null, no crash', () => {
    const { container } = render(<PriceTable products={[]} bestProductId={null} />)
    expect(container.firstChild).toBeNull()
  })

  // AC-6: single-row table
  test('2. single-row table → renders without crashing', () => {
    render(<PriceTable products={[product({ id: 1 })]} bestProductId={1} />)
    expect(screen.getAllByTestId('price-table-row')).toHaveLength(1)
  })

  // AC-2: cheapest row highlight
  test('3. bestProductId matches a row → NAJTANIEJ chip shown on that row only', () => {
    const products = [
      product({ id: 1, store_name: 'AlePlanszowki' }),
      product({ id: 2, store_name: '3Trolle' }),
    ]
    render(<PriceTable products={products} bestProductId={1} />)
    const chips = screen.getAllByTestId('najtaniej-chip')
    expect(chips).toHaveLength(1)
  })

  // AC-2: all out of stock → bestProductId null → no highlight
  test('4. bestProductId = null → no row gets NAJTANIEJ chip', () => {
    const products = [
      product({ id: 1, in_stock: false }),
      product({ id: 2, in_stock: false }),
    ]
    render(<PriceTable products={products} bestProductId={null} />)
    expect(screen.queryByTestId('najtaniej-chip')).toBeNull()
  })

  // AC-3: out-of-stock dimming + label
  test('5. in_stock = false → row dimmed (opacity 0.55) and "Niedostępny" label shown', () => {
    render(<PriceTable products={[product({ id: 1, in_stock: false })]} bestProductId={null} />)
    const row = screen.getByTestId('price-table-row')
    expect(row).toHaveStyle({ opacity: 0.55 })
    expect(screen.getByTestId('unavailable-label')).toHaveTextContent('Niedostępny')
    expect(screen.queryByTestId('buy-link')).toBeNull()
  })

  // AC-3: in-stock row is not dimmed and shows buy link
  test('6. in_stock = true → row not dimmed, "Kup →" link shown', () => {
    render(<PriceTable products={[product({ id: 1, in_stock: true })]} bestProductId={null} />)
    const row = screen.getByTestId('price-table-row')
    expect(row).toHaveStyle({ opacity: 1 })
    expect(screen.getByTestId('buy-link')).toHaveTextContent('Kup →')
    expect(screen.queryByTestId('unavailable-label')).toBeNull()
  })

  // AC-5: external link attributes
  test('7. "Kup →" link has target=_blank, rel=noopener noreferrer, correct href', () => {
    render(
      <PriceTable
        products={[product({ id: 1, product_url: 'https://3trolle.pl/gra-x' })]}
        bestProductId={null}
      />,
    )
    const link = screen.getByTestId('buy-link')
    expect(link).toHaveAttribute('href', 'https://3trolle.pl/gra-x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // AC-4: no badge when price_orig is null
  test('8. price_orig = null → no discount badge, Rabat cell shows em-dash', () => {
    render(<PriceTable products={[product({ id: 1, price_orig: null })]} bestProductId={null} />)
    expect(screen.queryByTestId('discount-badge')).toBeNull()
    expect(screen.getByTestId('rabat-cell')).toHaveTextContent('—')
  })

  // AC-4: discount badge color thresholds — green (<40)
  test('9. discount 30% → badge green (#3D5C3A)', () => {
    // round((100-70)/100*100) = 30
    render(
      <PriceTable
        products={[product({ id: 1, price: '70.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-30%')
    expect(badge).toHaveStyle({ backgroundColor: '#3D5C3A' })
  })

  // AC-4: discount badge color thresholds — amber (40-70)
  test('10. discount 50% → badge amber (#C07B18)', () => {
    // round((100-50)/100*100) = 50
    render(
      <PriceTable
        products={[product({ id: 1, price: '50.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-50%')
    expect(badge).toHaveStyle({ backgroundColor: '#C07B18' })
  })

  // AC-4: discount badge color thresholds — red (>70)
  test('11. discount 80% → badge red (#C42B2B)', () => {
    // round((100-20)/100*100) = 80
    render(
      <PriceTable
        products={[product({ id: 1, price: '20.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-80%')
    expect(badge).toHaveStyle({ backgroundColor: '#C42B2B' })
  })

  // AC-1: rows render in input order, no client-side re-sort
  test('12. rows render in exact input array order (no re-sorting)', () => {
    const products = [
      product({ id: 3, store_name: 'Store C' }),
      product({ id: 1, store_name: 'Store A' }),
      product({ id: 2, store_name: 'Store B' }),
    ]
    render(<PriceTable products={products} bestProductId={null} />)
    const rows = screen.getAllByTestId('price-table-row')
    expect(rows[0]).toHaveTextContent('Store C')
    expect(rows[1]).toHaveTextContent('Store A')
    expect(rows[2]).toHaveTextContent('Store B')
  })

  // AC-1: null price displays em-dash via formatPrice
  test('13. price = null → Cena cell shows em-dash, no crash', () => {
    render(<PriceTable products={[product({ id: 1, price: null })]} bestProductId={null} />)
    const row = screen.getByTestId('price-table-row')
    expect(row).toHaveTextContent('—')
  })

  // AC-2: cheapest row gets the green border-left highlight
  test('14. bestProductId matches → that row has border-left highlight, others do not', () => {
    const products = [
      product({ id: 1, store_name: 'AlePlanszowki' }),
      product({ id: 2, store_name: '3Trolle' }),
    ]
    render(<PriceTable products={products} bestProductId={1} />)
    const rows = screen.getAllByTestId('price-table-row')
    expect(rows[0]).toHaveStyle({ borderLeft: '3px solid #3D5C3A' })
    expect(rows[1]).not.toHaveStyle({ borderLeft: '3px solid #3D5C3A' })
  })

  // AC-4: badge color boundary — 40% is amber, not green (< 40 green, 40–70 amber)
  test('15. discount exactly 40% → badge amber (#C07B18)', () => {
    // round((100-60)/100*100) = 40
    render(
      <PriceTable
        products={[product({ id: 1, price: '60.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-40%')
    expect(badge).toHaveStyle({ backgroundColor: '#C07B18' })
  })

  // AC-4: badge color boundary — 70% amber, 71% red (40–70 amber, > 70 red)
  test('16. discount 70% → amber, 71% → red (boundary between amber and red)', () => {
    const { unmount } = render(
      // round((100-30)/100*100) = 70
      <PriceTable
        products={[product({ id: 1, price: '30.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    expect(screen.getByTestId('discount-badge')).toHaveStyle({ backgroundColor: '#C07B18' })
    unmount()

    // round((100-29)/100*100) = 71
    render(
      <PriceTable
        products={[product({ id: 1, price: '29.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-71%')
    expect(badge).toHaveStyle({ backgroundColor: '#C42B2B' })
  })

  // AC-4: price higher than price_orig → negative discount → no badge, em-dash
  test('17. price > price_orig (negative discount) → no badge, Rabat cell shows em-dash', () => {
    render(
      <PriceTable
        products={[product({ id: 1, price: '120.00', price_orig: '100.00' })]}
        bestProductId={null}
      />,
    )
    expect(screen.queryByTestId('discount-badge')).toBeNull()
    expect(screen.getByTestId('rabat-cell')).toHaveTextContent('—')
  })
})
