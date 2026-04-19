import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readManifestVersion } from '../../src/utils/manifest'

describe('readManifestVersion', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pumpp-manifest-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads package.json version', () => {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    expect(readManifestVersion(dir, 'package.json', 'version')).toBe('1.2.3')
  })
  it('supports jsonc', () => {
    writeFileSync(path.join(dir, 'pkg.json'), `{\n  // comment\n  "v": "0.1.0"\n}`)
    expect(readManifestVersion(dir, 'pkg.json', 'v')).toBe('0.1.0')
  })
  it('throws when key missing', () => {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({}))
    expect(() => readManifestVersion(dir, 'package.json', 'version')).toThrow(/Missing or invalid/)
  })
  it('throws when file not found', () => {
    expect(() => readManifestVersion(dir, 'nope.json', 'version')).toThrow(/Could not find/)
  })
})
