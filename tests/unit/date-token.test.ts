import { describe, expect, it } from 'vitest'
import { formatYmd, splitYmd } from '../../src/utils/date-token'

describe('formatYmd', () => {
  it('pads month / day', () => {
    expect(formatYmd(new Date(2026, 0, 3))).toBe('20260103')
  })
  it('handles double-digit', () => {
    expect(formatYmd(new Date(2026, 11, 31))).toBe('20261231')
  })
})

describe('splitYmd', () => {
  it('parses YYYYMMDD', () => {
    expect(splitYmd('20260103')).toEqual({ year: '2026', month: '01', day: '03' })
  })
  it('throws on invalid length', () => {
    expect(() => splitYmd('2026013')).toThrow()
  })
  it('throws on non-digit', () => {
    expect(() => splitYmd('2026abcd')).toThrow()
  })
})
