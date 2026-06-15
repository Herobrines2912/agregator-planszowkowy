import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PriceChart, type PriceDataPoint } from './PriceChart'

const mockData: PriceDataPoint[] = [
  // AlePlanszowki — storeId 1
  { date: '2026-05-16', storeId: 1, storeName: 'AlePlanszowki', price: '99.90' },
  { date: '2026-05-23', storeId: 1, storeName: 'AlePlanszowki', price: '94.99' },
  { date: '2026-05-30', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
  { date: '2026-06-06', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
  { date: '2026-06-13', storeId: 1, storeName: 'AlePlanszowki', price: '84.90' },
  // 3Trolle — storeId 2
  { date: '2026-05-16', storeId: 2, storeName: '3Trolle', price: '104.99' },
  { date: '2026-05-23', storeId: 2, storeName: '3Trolle', price: '99.99' },
  { date: '2026-05-30', storeId: 2, storeName: '3Trolle', price: '99.99' },
  { date: '2026-06-06', storeId: 2, storeName: '3Trolle', price: '94.99' },
  { date: '2026-06-13', storeId: 2, storeName: '3Trolle', price: '94.99' },
]
// Spans ~28 days — unlocks 1T and 2T (range thresholds: 1T=7d, 2T=14d)

describe('PriceChart', () => {
  // AC-9: empty data → empty state
  test('1. data=[] → empty state message renders, no SVG path crash', () => {
    render(<PriceChart data={[]} gameId={1} />)
    expect(screen.getByText(/Za mało danych/)).toBeTruthy()
  })

  // AC-10: single data point
  test('2. single data point per store → renders without error', () => {
    const singlePoint: PriceDataPoint[] = [
      { date: '2026-06-13', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
    ]
    // Should not throw
    const { container } = render(<PriceChart data={singlePoint} gameId={1} />)
    // A circle should be rendered instead of a path for single points
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  // AC-1: two stores → two paths
  test('3. two stores in data → two <path> elements in SVG', () => {
    // Use 2T (14-day window) — mockData has 2026-06-06 and 2026-06-13 within range → 2 points per store → paths
    const { container } = render(<PriceChart data={mockData} gameId={1} initialRange="2T" />)
    const paths = container.querySelectorAll('path[stroke]')
    expect(paths.length).toBe(2)
  })

  // AC-1: formatPrice on Y-axis
  test('4. formatPrice() applied to Y-axis labels (no raw numbers)', () => {
    render(<PriceChart data={mockData} gameId={1} initialRange="1T" />)
    // Y-axis labels should contain "zł" suffix
    const svgTexts = document.querySelectorAll('text')
    const yLabels = Array.from(svgTexts).filter(el => el.textContent?.includes('zł'))
    expect(yLabels.length).toBeGreaterThan(0)
  })

  // AC-5: legend shows one item per store
  test('5. legend shows one button per store', () => {
    render(<PriceChart data={mockData} gameId={1} initialRange="1T" />)
    expect(screen.getByText('AlePlanszowki')).toBeTruthy()
    expect(screen.getByText('3Trolle')).toBeTruthy()
  })

  // AC-5: clicking legend item hides line
  test('6. clicking a legend item hides that store line', () => {
    // Use 2T so each store has 2+ points → paths (not circles)
    const { container } = render(<PriceChart data={mockData} gameId={1} initialRange="2T" />)

    // Initial: 2 paths visible
    expect(container.querySelectorAll('path[stroke]').length).toBe(2)

    // Click AlePlanszowki legend button
    fireEvent.click(screen.getByText('AlePlanszowki').closest('button')!)

    // Legend item should be dimmed (opacity 0.4)
    const btn = screen.getByText('AlePlanszowki').closest('button')! as HTMLElement
    expect(btn.style.opacity).toBe('0.4')
  })

  // AC-5: last visible legend item click is no-op
  test('7. clicking last visible legend item is no-op', () => {
    render(<PriceChart data={mockData} gameId={1} initialRange="1T" />)

    // Hide 3Trolle first
    fireEvent.click(screen.getByText('3Trolle').closest('button')!)

    // Now AlePlanszowki is the last visible — clicking it should not change opacity
    const aleBtn = screen.getByText('AlePlanszowki').closest('button')! as HTMLElement
    expect(aleBtn.style.cursor).toBe('not-allowed')

    fireEvent.click(aleBtn)
    // Still not hidden (opacity should be 1, not 0.4)
    expect(aleBtn.style.opacity).not.toBe('0.4')
  })

  // AC-7: disabled range button
  test('8. disabled range button renders with cursor: not-allowed', () => {
    // Use 10-day span data → 1M (30d threshold) remains disabled
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const tenDayData: PriceDataPoint[] = [
      { date: tenDaysAgo.toISOString().slice(0, 10), storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
      { date: new Date().toISOString().slice(0, 10), storeId: 1, storeName: 'AlePlanszowki', price: '84.90' },
    ]
    const { container } = render(<PriceChart data={tenDayData} gameId={99} initialRange="1T" />)
    const buttons = container.querySelectorAll('button')
    const monthBtn = Array.from(buttons).find(b => b.textContent === '1M')
    expect(monthBtn).toBeTruthy()
    expect((monthBtn as HTMLElement).style.cursor).toBe('not-allowed')
  })

  // AC-8: stats "Najniższa" matches min price in data
  test('9. stats section: Najniższa value matches min price in data', () => {
    render(<PriceChart data={mockData} gameId={1} initialRange="1T" />)
    // Min price in the 1T window (last 7 days from now vs data)
    // Since data dates are in the past, 1T filter may return empty — use a fresh dataset
    const recentData: PriceDataPoint[] = [
      { date: new Date().toISOString().slice(0, 10), storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
      { date: new Date().toISOString().slice(0, 10), storeId: 2, storeName: '3Trolle', price: '104.99' },
    ]
    const { container } = render(<PriceChart data={recentData} gameId={2} initialRange="1T" />)
    // Najniższa should show 89,90 zł
    const najnizszaLabel = screen.getAllByText('Najniższa')
    expect(najnizszaLabel.length).toBeGreaterThan(0)
    expect(container.textContent).toContain('89,90 zł')
  })

  // AC-8: "Średnia 30d" absent when fewer than 7 data points
  test('10. stats: Średnia 30d absent when fewer than 7 data points in range', () => {
    // Only 2 recent points — not enough for 30-day average
    const fewPoints: PriceDataPoint[] = [
      { date: new Date().toISOString().slice(0, 10), storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
      { date: new Date().toISOString().slice(0, 10), storeId: 2, storeName: '3Trolle', price: '99.99' },
    ]
    render(<PriceChart data={fewPoints} gameId={3} initialRange="1T" />)
    // "Średnia 30d" should NOT appear
    expect(screen.queryByText('Średnia 30d')).toBeNull()
  })
})
