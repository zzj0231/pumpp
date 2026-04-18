import { describe, expect, it } from 'vitest'
import { normalizePumpConfig } from '../../src/type-registry'

describe('normalizePumpConfig', () => {
  it('applies global defaults to each type', () => {
    const r = normalizePumpConfig({
      base: 'main',
      push: false,
      types: {
        release: { pattern: 'release/{version}' },
        feature: { pattern: 'feature/{username}', base: 'dev', push: true },
      },
    })
    expect(r.globals.base).toBe('main')
    expect(r.globals.push).toBe(false)
    expect(r.types.release).toMatchObject({ pattern: 'release/{version}', base: 'main', push: false, checkout: true })
    expect(r.types.feature).toMatchObject({ base: 'dev', push: true })
  })

  it('throws CONFIG_INVALID when pattern missing', () => {
    expect(() => normalizePumpConfig({ types: { release: {} as any } })).toThrow(/pattern/)
  })

  it('uses built-in manifest default', () => {
    const r = normalizePumpConfig({ types: { r: { pattern: 'r/{version}' } } })
    expect(r.globals.manifest).toEqual({ file: 'package.json', versionKey: 'version' })
  })

  it('merges manifest override', () => {
    const r = normalizePumpConfig({
      manifest: { file: 'pkg.json' },
      types: { r: { pattern: 'r/{version}' } },
    })
    expect(r.globals.manifest).toEqual({ file: 'pkg.json', versionKey: 'version' })
  })
})
