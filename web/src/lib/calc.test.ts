import { describe, test, expect } from 'vitest'
import { calcMarginProxy } from './calc'

describe('calcMarginProxy', () => {
  test('normal case: computes margin on cost, rounded to 1 decimal', () => {
    expect(calcMarginProxy('50.00', '150.00')).toBe(200.0)
  })

  test('both inputs invalid → null', () => {
    expect(calcMarginProxy('abc', 'xyz')).toBeNull()
  })

  test('currentPrice invalid → null', () => {
    expect(calcMarginProxy('abc', '150.00')).toBeNull()
  })

  test('historicalMax invalid → null', () => {
    expect(calcMarginProxy('50.00', 'abc')).toBeNull()
  })

  test('historicalMax is zero → null (fails > 0 validation)', () => {
    expect(calcMarginProxy('50.00', '0')).toBeNull()
  })

  test('currentPrice is zero → null (fails > 0 validation, avoids divide-by-zero)', () => {
    expect(calcMarginProxy('0', '150.00')).toBeNull()
  })

  test('currentPrice negative → null', () => {
    expect(calcMarginProxy('-10.00', '150.00')).toBeNull()
  })

  test('currentPrice > historicalMax → returns negative number, not null', () => {
    const result = calcMarginProxy('150.00', '50.00')
    expect(result).not.toBeNull()
    expect(result).toBeLessThan(0)
    expect(result).toBe(-66.7)
  })

  test('rounds to 1 decimal place', () => {
    expect(calcMarginProxy('30.00', '100.00')).toBe(233.3)
  })
})
