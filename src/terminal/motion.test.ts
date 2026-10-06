import { describe, expect, it } from 'vitest'
import { smoothScrollDuration } from './motion'

describe('history motion settings', () => {
  it('disables animation when motion is not allowed, regardless of duration', () => {
    for (const duration of [undefined, 120, 250, 1_000_000]) {
      expect(smoothScrollDuration(duration, false)).toBe(0)
    }
  })
  it('handles legacy settings, explicit disabling and malformed/extreme values', () => {
    expect(smoothScrollDuration(undefined, true)).toBe(120)
    expect(smoothScrollDuration(0, true)).toBe(0)
    expect(smoothScrollDuration(-1, true)).toBe(0)
    expect(smoothScrollDuration(1_000_000, true)).toBe(250)
    expect(smoothScrollDuration(Number.NaN, true)).toBe(0)
    expect(smoothScrollDuration(Number.POSITIVE_INFINITY, true)).toBe(0)
  })
})
