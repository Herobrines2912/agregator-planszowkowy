import { describe, test, expect } from 'vitest'
import { sha256Hex } from './crypto'

describe('sha256Hex', () => {
  test('produces a stable, correct SHA-256 hex digest', () => {
    expect(sha256Hex('test@example.com')).toBe(
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    )
    expect(sha256Hex('test@example.com')).toBe(sha256Hex('test@example.com'))
  })
})
