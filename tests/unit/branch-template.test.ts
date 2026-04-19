import { describe, expect, it } from 'vitest'
import { renderBranchName, scanPattern } from '../../src/utils/branch-template'

describe('scanPattern', () => {
  it('returns required and optional token names', () => {
    expect(scanPattern('release/{version}-{date}-{desc?}')).toEqual([
      { name: 'version', optional: false },
      { name: 'date', optional: false },
      { name: 'desc', optional: true },
    ])
  })
  it('handles duplicates (deduplicated, keeps strictest requirement)', () => {
    expect(scanPattern('{x}-{x?}')).toEqual([{ name: 'x', optional: false }])
  })
})

describe('renderBranchName', () => {
  it('substitutes provided tokens', () => {
    expect(renderBranchName('release/{version}-{date}', {
      version: '1.2.3',
      date: '20260418',
    })).toBe('release/1.2.3-20260418')
  })
  it('leaves unknown required token untouched (caller asserts earlier)', () => {
    expect(renderBranchName('release/{version}', {})).toBe('release/{version}')
  })
  it('drops optional token with neighbouring separator', () => {
    expect(renderBranchName('feature/{username}-{date}-{desc?}', {
      username: 'alice',
      date: '20260418',
    })).toBe('feature/alice-20260418')
  })
  it('drops optional token in middle cleanly', () => {
    expect(renderBranchName('a/{x?}-{y}', { y: 'z' })).toBe('a/z')
  })
  it('handles {desc?}-{date} order with empty desc (new default)', () => {
    expect(renderBranchName('feature/{username}-{desc?}-{date}', {
      username: 'alice',
      date: '20260418',
    })).toBe('feature/alice-20260418')
  })
  it('handles {desc?}-{date} order with desc filled', () => {
    expect(renderBranchName('feature/{username}-{desc?}-{date}', {
      username: 'alice',
      desc: 'login',
      date: '20260418',
    })).toBe('feature/alice-login-20260418')
  })
  it('drops leading optional token', () => {
    expect(renderBranchName('{pre?}/release/{date}', { date: '20260418' })).toBe('release/20260418')
  })
  it('collapses duplicated dashes after drop', () => {
    expect(renderBranchName('a-{x?}-b', {})).toBe('a-b')
  })
})
