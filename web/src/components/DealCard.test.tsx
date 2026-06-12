import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DealCard } from './DealCard'
import { formatPrice, formatNull } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'

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

describe('DealCard', () => {
  test('zwraca null gdy price_orig jest null', () => {
    const { container } = render(
      <DealCard {...base} price="89.90" price_orig={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  test('nie pokazuje HOT gdy discount ≤ 40%', () => {
    // round((120-72)/120*100) = round(40) = 40 — nie > 40
    render(<DealCard {...base} price="72.00" price_orig="120.00" />)
    expect(screen.queryByTestId('hot-sticker')).toBeNull()
  })

  test('pokazuje HOT gdy discount > 40%', () => {
    // round((150-88)/150*100) = round(41.3) = 41
    render(<DealCard {...base} price="88.00" price_orig="150.00" />)
    expect(screen.getByTestId('hot-sticker')).toBeInTheDocument()
  })

  test('badge zielony gdy discount < 40%', () => {
    // round((100-70)/100*100) = 30
    render(<DealCard {...base} price="70.00" price_orig="100.00" />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveStyle({ backgroundColor: '#3D5C3A' })
  })

  test('badge amber gdy discount 40–70%', () => {
    // round((100-50)/100*100) = 50
    render(<DealCard {...base} price="50.00" price_orig="100.00" />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveStyle({ backgroundColor: '#C07B18' })
  })

  test('badge czerwony gdy discount > 70%', () => {
    // round((100-20)/100*100) = 80
    render(<DealCard {...base} price="20.00" price_orig="100.00" />)
    const badge = screen.getByTestId('discount-badge')
    expect(badge).toHaveStyle({ backgroundColor: '#C42B2B' })
  })
})

describe('formatPrice', () => {
  test('całkowita cena bez groszy', () => {
    expect(formatPrice('99.00')).toBe('99 zł')
  })

  test('cena z groszami — przecinek', () => {
    expect(formatPrice('99.90')).toBe('99,90 zł')
  })

  test('null zwraca em-dash', () => {
    expect(formatPrice(null)).toBe('—')
  })

  test('undefined zwraca em-dash', () => {
    expect(formatPrice(undefined)).toBe('—')
  })

  test('liczba jako number', () => {
    expect(formatPrice(49)).toBe('49 zł')
    expect(formatPrice(49.99)).toBe('49,99 zł')
  })
})

describe('formatNull', () => {
  test('null → em-dash', () => expect(formatNull(null)).toBe('—'))
  test('undefined → em-dash', () => expect(formatNull(undefined)).toBe('—'))
  test('pusty string → em-dash', () => expect(formatNull('')).toBe('—'))
  test('wartość → string', () => expect(formatNull(42)).toBe('42'))
})

describe('calcDiscount', () => {
  test('oblicza zaokrąglony procent', () => {
    expect(calcDiscount(89.90, 149.90)).toBe(40)
    expect(calcDiscount(50, 100)).toBe(50)
    expect(calcDiscount(20, 100)).toBe(80)
  })

  test('dzielenie przez zero zwraca 0', () => {
    expect(calcDiscount(0, 0)).toBe(0)
  })
})
