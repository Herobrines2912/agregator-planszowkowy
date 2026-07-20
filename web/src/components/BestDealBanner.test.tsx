import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BestDealBanner } from './BestDealBanner'
import type { GameProduct } from '@/db/queries/game-passport'

function product(overrides: Partial<GameProduct> = {}): GameProduct {
  return {
    id: 1,
    store_name: 'AlePlanszowki',
    price: '89.90',
    price_orig: null,
    in_stock: true,
    product_url: 'https://aleplanszowki.pl/gra',
    ...overrides,
  }
}

describe('BestDealBanner', () => {
  // AC-5: no products at all
  test('1. product = null → renders null, no crash', () => {
    const { container } = render(<BestDealBanner product={null} />)
    expect(container.firstChild).toBeNull()
  })

  // AC-1: full banner render with in-stock product
  test('2. in-stock product → shows store name, price, CTA text, link attributes', () => {
    render(
      <BestDealBanner
        product={product({ store_name: '3Trolle', price: '99.00', product_url: 'https://3trolle.pl/gra-x' })}
      />,
    )
    expect(screen.getByTestId('best-deal-store')).toHaveTextContent('3Trolle')
    expect(screen.getByTestId('best-deal-price')).toHaveTextContent('99 zł')

    const cta = screen.getByTestId('best-deal-cta')
    expect(cta).toHaveTextContent('Kup za 99 zł w 3Trolle →')
    expect(cta).toHaveAttribute('href', 'https://3trolle.pl/gra-x')
    expect(cta).toHaveAttribute('target', '_blank')
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer')

    expect(screen.queryByTestId('best-deal-unavailable-label')).toBeNull()
  })

  // AC-2: all out of stock → dimmed state, no CTA link
  test('3. in_stock = false → dimmed (opacity 0.55), unavailable label shown, no CTA link', () => {
    render(<BestDealBanner product={product({ in_stock: false })} />)
    expect(screen.getByTestId('best-deal-banner')).toHaveStyle({ opacity: 0.55 })
    expect(screen.getByTestId('best-deal-unavailable-label')).toHaveTextContent(
      'Aktualnie niedostępne — sprawdź sklepy poniżej',
    )
    expect(screen.queryByTestId('best-deal-cta')).toBeNull()
  })

  // in-stock banner is not dimmed
  test('4. in_stock = true → opacity 1', () => {
    render(<BestDealBanner product={product({ in_stock: true })} />)
    expect(screen.getByTestId('best-deal-banner')).toHaveStyle({ opacity: 1 })
  })

  // AC-1: discount badge shown when price_orig present and discount > 0
  test('5. price_orig present with positive discount → discount badge shown', () => {
    render(<BestDealBanner product={product({ price: '70.00', price_orig: '100.00' })} />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-30%')
  })

  // discount badge absent when price_orig is null
  test('6. price_orig = null → no discount badge', () => {
    render(<BestDealBanner product={product({ price_orig: null })} />)
    expect(screen.queryByTestId('discount-badge')).toBeNull()
  })

  // discount badge absent when discount <= 0 (price >= price_orig)
  test('7. price > price_orig (negative discount) → no discount badge', () => {
    render(<BestDealBanner product={product({ price: '120.00', price_orig: '100.00' })} />)
    expect(screen.queryByTestId('discount-badge')).toBeNull()
  })

  // AC-1: original price shown with strikethrough when present
  test('8. price_orig present → original price rendered with strikethrough', () => {
    render(<BestDealBanner product={product({ price: '70.00', price_orig: '100.00' })} />)
    const rendered = screen.getByText('100 zł')
    expect(rendered).toHaveStyle({ textDecoration: 'line-through' })
  })

  // AC-7: discount badge color thresholds — green (<40)
  test('9. discount 30% → badge green (#3D5C3A)', () => {
    // round((100-70)/100*100) = 30
    render(<BestDealBanner product={product({ price: '70.00', price_orig: '100.00' })} />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-30%')
    expect(badge).toHaveStyle({ backgroundColor: '#3D5C3A' })
  })

  // AC-7: discount badge color thresholds — amber (40-70)
  test('10. discount 50% → badge amber (#C07B18)', () => {
    // round((100-50)/100*100) = 50
    render(<BestDealBanner product={product({ price: '50.00', price_orig: '100.00' })} />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-50%')
    expect(badge).toHaveStyle({ backgroundColor: '#C07B18' })
  })

  // AC-7: discount badge color thresholds — red (>70)
  test('11. discount 80% → badge red (#C42B2B)', () => {
    // round((100-20)/100*100) = 80
    render(<BestDealBanner product={product({ price: '20.00', price_orig: '100.00' })} />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-80%')
    expect(badge).toHaveStyle({ backgroundColor: '#C42B2B' })
  })

  // badge color boundary — 40% is amber, not green (< 40 green, 40–70 amber), mirrors PriceTable.test.tsx
  test('11b. discount exactly 40% → badge amber (#C07B18)', () => {
    // round((100-60)/100*100) = 40
    render(<BestDealBanner product={product({ price: '60.00', price_orig: '100.00' })} />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-40%')
    expect(badge).toHaveStyle({ backgroundColor: '#C07B18' })
  })

  // badge color boundary — 70% amber, 71% red (40–70 amber, > 70 red), mirrors PriceTable.test.tsx
  test('11c. discount 70% → amber, 71% → red (boundary between amber and red)', () => {
    const { unmount } = render(
      // round((100-30)/100*100) = 70
      <BestDealBanner product={product({ price: '30.00', price_orig: '100.00' })} />,
    )
    expect(screen.getByTestId('discount-badge')).toHaveStyle({ backgroundColor: '#C07B18' })
    unmount()

    // round((100-29)/100*100) = 71
    render(<BestDealBanner product={product({ price: '29.00', price_orig: '100.00' })} />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveTextContent('-71%')
    expect(badge).toHaveStyle({ backgroundColor: '#C42B2B' })
  })

  // AC-1: price = null → em-dash via formatPrice, no crash
  test('12. price = null → shows em-dash, no crash', () => {
    render(<BestDealBanner product={product({ price: null })} />)
    expect(screen.getByTestId('best-deal-price')).toHaveTextContent('—')
  })

  // root element carries the class used by globals.css media query (AC-4)
  test('13. root element has "best-deal-banner" class for mobile stacking rule', () => {
    render(<BestDealBanner product={product()} />)
    expect(screen.getByTestId('best-deal-banner')).toHaveClass('best-deal-banner')
  })

  // CTA element carries the class used by globals.css media query (AC-4)
  test('14. CTA link has "best-deal-banner-cta" class for full-width mobile rule', () => {
    render(<BestDealBanner product={product()} />)
    expect(screen.getByTestId('best-deal-cta')).toHaveClass('best-deal-banner-cta')
  })
})
