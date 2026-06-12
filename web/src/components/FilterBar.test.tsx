import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from './FilterBar'

const mockReplace = vi.fn()
let mockParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockParams,
}))

beforeEach(() => {
  mockReplace.mockClear()
  mockParams = new URLSearchParams()
})

describe('FilterBar — struktura', () => {
  test('renderuje przycisk Filtry, licznik wyników, view toggle i sort dropdown', () => {
    render(<FilterBar resultCount={12} />)
    expect(screen.getByTestId('filtry-button')).toBeInTheDocument()
    expect(screen.getByTestId('result-count')).toHaveTextContent('— 12 okazji')
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('sort-dropdown')).toBeInTheDocument()
  })
})

describe('FilterBar — count bubble', () => {
  test('bąbelek ukryty gdy 0 aktywnych filtrów', () => {
    render(<FilterBar resultCount={5} />)
    expect(screen.queryByTestId('filter-count-bubble')).toBeNull()
  })

  test('bąbelek widoczny z wartością 1 gdy jeden filtr aktywny', () => {
    mockParams = new URLSearchParams('type=base')
    render(<FilterBar resultCount={5} />)
    const bubble = screen.getByTestId('filter-count-bubble')
    expect(bubble).toBeInTheDocument()
    expect(bubble).toHaveTextContent('1')
  })

  test('bąbelek pokazuje 2 gdy dwa filtry aktywne', () => {
    mockParams = new URLSearchParams('type=base&players=4')
    render(<FilterBar resultCount={3} />)
    expect(screen.getByTestId('filter-count-bubble')).toHaveTextContent('2')
  })
})

describe('FilterBar — aktywne tagi filtrów', () => {
  test('tag "Gra bazowa" gdy ?type=base', () => {
    mockParams = new URLSearchParams('type=base')
    render(<FilterBar resultCount={8} />)
    expect(screen.getByTestId('filter-tag-type')).toHaveTextContent('Gra bazowa')
  })

  test('tag "Dodatek" gdy ?type=expansion', () => {
    mockParams = new URLSearchParams('type=expansion')
    render(<FilterBar resultCount={2} />)
    expect(screen.getByTestId('filter-tag-type')).toHaveTextContent('Dodatek')
  })

  test('tag "Dla 2 graczy" gdy ?players=2', () => {
    mockParams = new URLSearchParams('players=2')
    render(<FilterBar resultCount={6} />)
    expect(screen.getByTestId('filter-tag-players')).toHaveTextContent('Dla 2 graczy')
  })

  test('brak tagów gdy URL nie ma filtrów', () => {
    render(<FilterBar resultCount={10} />)
    expect(screen.queryByTestId('filter-tag-type')).toBeNull()
    expect(screen.queryByTestId('filter-tag-players')).toBeNull()
  })
})

describe('FilterBar — usuwanie filtrów (×)', () => {
  test('kliknięcie × przy type wywołuje router.replace bez parametru type', () => {
    mockParams = new URLSearchParams('type=base&players=3')
    render(<FilterBar resultCount={4} />)
    fireEvent.click(screen.getByTestId('remove-filter-type'))
    expect(mockReplace).toHaveBeenCalledOnce()
    const url = mockReplace.mock.calls[0][0] as string
    const params = new URLSearchParams(url.replace(/^\?/, ''))
    expect(params.get('type')).toBeNull()
    expect(params.get('players')).toBe('3')
  })

  test('kliknięcie × przy players wywołuje router.replace bez parametru players', () => {
    mockParams = new URLSearchParams('type=base&players=3')
    render(<FilterBar resultCount={4} />)
    fireEvent.click(screen.getByTestId('remove-filter-players'))
    expect(mockReplace).toHaveBeenCalledOnce()
    const url = mockReplace.mock.calls[0][0] as string
    const params = new URLSearchParams(url.replace(/^\?/, ''))
    expect(params.get('players')).toBeNull()
    expect(params.get('type')).toBe('base')
  })
})

describe('FilterBar — view toggle', () => {
  test('domyślnie przycisk Karty jest aktywny (zielony), Lista nieaktywna', () => {
    render(<FilterBar resultCount={5} />)
    expect(screen.getByTestId('view-cards')).toHaveStyle({ backgroundColor: '#3D5C3A' })
    expect(screen.getByTestId('view-list')).not.toHaveStyle({ backgroundColor: '#3D5C3A' })
  })

  test('gdy ?view=list — Lista jest aktywna, Karty nieaktywne', () => {
    mockParams = new URLSearchParams('view=list')
    render(<FilterBar resultCount={5} />)
    expect(screen.getByTestId('view-list')).toHaveStyle({ backgroundColor: '#3D5C3A' })
    expect(screen.getByTestId('view-cards')).not.toHaveStyle({ backgroundColor: '#3D5C3A' })
  })

  test('kliknięcie Lista ustawia ?view=list w URL', () => {
    render(<FilterBar resultCount={5} />)
    fireEvent.click(screen.getByTestId('view-list'))
    expect(mockReplace).toHaveBeenCalledOnce()
    const url = mockReplace.mock.calls[0][0] as string
    expect(url).toContain('view=list')
  })

  test('kliknięcie Karty usuwa parametr view z URL', () => {
    mockParams = new URLSearchParams('view=list')
    render(<FilterBar resultCount={5} />)
    fireEvent.click(screen.getByTestId('view-cards'))
    expect(mockReplace).toHaveBeenCalledOnce()
    const url = mockReplace.mock.calls[0][0] as string
    const params = new URLSearchParams(url.replace(/^\?/, ''))
    expect(params.get('view')).toBeNull()
  })
})

describe('FilterBar — sort dropdown', () => {
  test('domyślnie wybrany "Rabat ↓" (discount)', () => {
    render(<FilterBar resultCount={5} />)
    const select = screen.getByTestId('sort-dropdown') as HTMLSelectElement
    expect(select.value).toBe('discount')
  })

  test('zmiana sort wywołuje router.replace z nowym parametrem sort', () => {
    render(<FilterBar resultCount={5} />)
    fireEvent.change(screen.getByTestId('sort-dropdown'), { target: { value: 'price-asc' } })
    expect(mockReplace).toHaveBeenCalledOnce()
    const url = mockReplace.mock.calls[0][0] as string
    expect(url).toContain('sort=price-asc')
  })

  test('dropdown zawiera wszystkie 4 opcje sortowania', () => {
    render(<FilterBar resultCount={5} />)
    const options = screen.getAllByRole('option')
    const values = options.map((o) => (o as HTMLOptionElement).value)
    expect(values).toEqual(['discount', 'price-asc', 'price-desc', 'popularity'])
  })
})
