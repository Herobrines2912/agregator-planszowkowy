import { describe, test, expect } from 'vitest'
import { EMAIL_RE, CONTROL_CHAR_RE, MAX_NUMERIC_10_2 } from './validation'

describe('EMAIL_RE', () => {
  test('accepts a plain valid email', () => {
    expect(EMAIL_RE.test('user@example.com')).toBe(true)
  })

  test('rejects a string with no @', () => {
    expect(EMAIL_RE.test('not-an-email')).toBe(false)
  })

  test('rejects a string with whitespace', () => {
    expect(EMAIL_RE.test('user @example.com')).toBe(false)
  })
})

describe('CONTROL_CHAR_RE', () => {
  test('detects an embedded null byte', () => {
    const nullByte = String.fromCharCode(0)
    expect(CONTROL_CHAR_RE.test(`a${nullByte}b@example.com`)).toBe(true)
  })

  test('does not flag a normal string', () => {
    expect(CONTROL_CHAR_RE.test('user@example.com')).toBe(false)
  })
})

describe('MAX_NUMERIC_10_2', () => {
  test('matches the precision(10,2) upper bound', () => {
    expect(MAX_NUMERIC_10_2).toBe(99999999.99)
  })
})
