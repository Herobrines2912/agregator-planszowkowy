import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListRow } from './ListRow'
import { formatPrice } from '@/lib/format'


vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const base = {
  slug: 'brass-birmingham',
  game_name: 'Brass: Birmingham',
  cover_image_url: null,
  store_name: 'AlePlanszowki',
  store_url: 'https://aleplanszowki.pl/brass',
}

describe('ListRow', () => {
  test('zwraca null gdy price_orig jest null', () => {
    const { container } = render(
      <ListRow {...base} price="89.90" price_orig={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  test('renderuje nazwę gry i sklep', () => {
    render(<ListRow {...base} price="129.00" price_orig="219.00" />)
    expect(screen.getByText('Brass: Birmingham')).toBeInTheDocument()
    expect(screen.getByText('AlePlanszowki')).toBeInTheDocument()
  })

  test('pokazuje HOT gdy discount > 40%', () => {
    // round((150-88)/150*100) = 41
    render(<ListRow {...base} price="88.00" price_orig="150.00" />)
    expect(screen.getByTestId('hot-sticker')).toBeInTheDocument()
  })

  test('nie pokazuje HOT gdy discount ≤ 40%', () => {
    // round((120-72)/120*100) = 40 — nie > 40
    render(<ListRow {...base} price="72.00" price_orig="120.00" />)
    expect(screen.queryByTestId('hot-sticker')).toBeNull()
  })

  test('badge zielony gdy discount < 40%', () => {
    // round((100-70)/100*100) = 30
    render(<ListRow {...base} price="70.00" price_orig="100.00" />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveStyle({ backgroundColor: '#3D5C3A' })
  })

  test('badge czerwony gdy discount > 70%', () => {
    // round((100-20)/100*100) = 80
    render(<ListRow {...base} price="20.00" price_orig="100.00" />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveStyle({ backgroundColor: '#C42B2B' })
  })

  test('formatuje cenę poprawnie', () => {
    render(<ListRow {...base} price="99.00" price_orig="159.00" />)
    expect(screen.getByText('99 zł')).toBeInTheDocument()
    expect(screen.getByText(formatPrice('159.00'))).toBeInTheDocument()
  })

  test('CTA ma tekst "Zobacz →"', () => {
    render(<ListRow {...base} price="129.00" price_orig="219.00" />)
    expect(screen.getByRole('link', { name: 'Zobacz →' })).toBeInTheDocument()
  })

  test('isBestDeal dodaje zielony border-left', () => {
    const { container } = render(
      <ListRow {...base} price="89.00" price_orig="150.00" isBestDeal />
    )
    const li = container.querySelector('li')
    expect(li).toHaveStyle({ borderLeft: '3px solid #3D5C3A' })
  })

  test('bez isBestDeal brak wyróżnionego border-left', () => {
    const { container } = render(
      <ListRow {...base} price="89.00" price_orig="150.00" />
    )
    const li = container.querySelector('li')
    expect(li).toHaveStyle({ borderLeft: '1px solid #D4C4AE' })
  })
})
