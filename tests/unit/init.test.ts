import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTemplate, runInit } from '../../src/cli/init'

describe('buildTemplate', () => {
  it('ts template imports definePumpConfig and has the three built-in types', () => {
    const t = buildTemplate('ts')
    expect(t).toContain(`import { definePumpConfig } from 'pumpp'`)
    expect(t).toContain(`release: {`)
    expect(t).toContain(`feature: {`)
    expect(t).toContain(`hotfix: {`)
    expect(t).toContain('customBranchName')
    expect(t).toContain('tokenProviders')
  })

  it('mjs template uses JSDoc type hint and no TS import', () => {
    const t = buildTemplate('mjs')
    expect(t).toContain(`@type {import('pumpp').PumpInputConfig}`)
    expect(t).not.toContain(`import {`)
    expect(t).toContain(`export default {`)
  })

  it('json template is valid JSON without comments / functions', () => {
    const t = buildTemplate('json')
    const parsed = JSON.parse(t)
    expect(parsed.types.release.pattern).toBe('release/{version}-{date}')
    expect(parsed.base).toBe('main')
    expect(t).not.toContain('customBranchName')
    expect(t).not.toContain('//')
  })
})

describe('runInit', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pumpp-init-'))
  })

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('creates pumpp.config.ts in an empty directory', async () => {
    const res = await runInit({ cwd: tmp, format: 'ts', force: false })
    expect(res.created).toBe(true)
    expect(res.overwrote).toBe(false)
    const contents = await fs.readFile(res.path, 'utf8')
    expect(contents).toContain('definePumpConfig')
  })

  it('refuses to overwrite without --force', async () => {
    await fs.writeFile(path.join(tmp, 'pumpp.config.ts'), '/* existing */', 'utf8')
    await expect(runInit({ cwd: tmp, format: 'ts', force: false }))
      .rejects
      .toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  it('overwrites with --force and reports overwrote:true', async () => {
    await fs.writeFile(path.join(tmp, 'pumpp.config.ts'), '/* old */', 'utf8')
    const res = await runInit({ cwd: tmp, format: 'ts', force: true })
    expect(res.overwrote).toBe(true)
    const contents = await fs.readFile(res.path, 'utf8')
    expect(contents).toContain('definePumpConfig')
  })

  it('detects existing config of a different extension', async () => {
    await fs.writeFile(path.join(tmp, 'pumpp.config.json'), '{}', 'utf8')
    await expect(runInit({ cwd: tmp, format: 'ts', force: false }))
      .rejects
      .toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  it('writes pumpp.config.mjs for --format mjs', async () => {
    const res = await runInit({ cwd: tmp, format: 'mjs', force: false })
    expect(path.basename(res.path)).toBe('pumpp.config.mjs')
  })
})
