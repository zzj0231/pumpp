import { describe, expect, it } from 'vitest'

import { slugifyBranchToken } from '../../src/utils/slug'

describe('slugifyBranchToken', () => {
  it('lowercases, replaces spaces with dashes', () => {
    expect(slugifyBranchToken('Alice Bob')).toBe('alice-bob')
  })
  it('strips invalid chars', () => {
    expect(slugifyBranchToken('张 三! v2')).toBe('v2')
  })
  it('collapses repeated dashes', () => {
    expect(slugifyBranchToken('a   b---c')).toBe('a-b-c')
  })
  it('trims leading/trailing dashes', () => {
    expect(slugifyBranchToken('  -foo- ')).toBe('foo')
  })
  it('falls back when fully stripped', () => {
    expect(slugifyBranchToken('!!!', 'fallback')).toBe('fallback')
  })
  it('default fallback is "user"', () => {
    expect(slugifyBranchToken('')).toBe('user')
  })
})
