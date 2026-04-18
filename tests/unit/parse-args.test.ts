import { describe, expect, it } from 'vitest'
import { buildIntent } from '../../src/cli/parse-args'
import { pumpConfigDefaults } from '../../src/config'
import { normalizePumpConfig } from '../../src/type-registry'

const config = normalizePumpConfig(pumpConfigDefaults)

describe('buildIntent', () => {
  it('recognises subcommand', () => {
    const i = buildIntent(['node', 'pumpp', 'release', '-y', '--no-push'], config)
    expect(i.kind).toBe('run')
    if (i.kind === 'run') {
      expect(i.type).toBe('release')
      expect(i.runtime.yes).toBe(true)
      expect(i.runtime.push).toBe(false)
    }
  })

  it('maps --desc', () => {
    const i = buildIntent(['node', 'pumpp', 'feature', '--desc', 'login', '-y'], config)
    if (i.kind === 'run')
      expect(i.runtime.desc).toBe('login')
  })

  it('maps manifest flags', () => {
    const i = buildIntent(['node', 'pumpp', 'release', '--file', 'pkg.json', '--version-key', 'v', '-y'], config)
    if (i.kind === 'run') {
      expect(i.runtime.file).toBe('pkg.json')
      expect(i.runtime.versionKey).toBe('v')
    }
  })

  it('no subcommand → interactive intent', () => {
    const i = buildIntent(['node', 'pumpp'], config)
    expect(i.kind).toBe('interactive')
  })

  it('unknown subcommand → unknown intent', () => {
    const i = buildIntent(['node', 'pumpp', 'rc'], config)
    expect(i.kind).toBe('unknown')
    if (i.kind === 'unknown')
      expect(i.input).toBe('rc')
  })

  it('help flag carries through', () => {
    const i = buildIntent(['node', 'pumpp', '--help'], config)
    expect(i.kind).toBe('help')
  })

  it('version flag carries through', () => {
    const i = buildIntent(['node', 'pumpp', '--version'], config)
    expect(i.kind).toBe('version')
  })
})
