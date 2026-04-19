import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const cli = path.join(repoRoot, 'bin', 'pumpp.mjs')
const IS_WIN = process.platform === 'win32'

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function pumpp(cwd: string, ...args: string[]): { status: number, stdout: string, stderr: string } {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr }
}

describe('pumpp CLI (e2e)', () => {
  beforeAll(() => {
    const pnpm = IS_WIN ? 'pnpm.cmd' : 'pnpm'
    execFileSync(pnpm, ['run', 'build'], { cwd: repoRoot, stdio: 'inherit', shell: IS_WIN })
  }, 120_000)

  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pumpp-e2e-'))
    try {
      git(dir, 'init', '-b', 'main')
    }
    catch {
      git(dir, 'init')
      git(dir, 'checkout', '-b', 'main')
    }
    git(dir, 'config', 'user.email', 'test@example.com')
    git(dir, 'config', 'user.name', 'Alice')
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }))
    git(dir, 'add', '.')
    git(dir, 'commit', '-m', 'init')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('release --dry-run -y prints expected name', () => {
    const r = pumpp(dir, 'release', '--dry-run', '-y', '--no-push')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/release\/1\.0\.0-\d{8}/)
  })

  it('feature --desc login creates branch without pushing', () => {
    const r = pumpp(dir, 'feature', '--desc', 'login', '-y', '--no-push')
    expect(r.status).toBe(0)
    const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
    expect(branch).toMatch(/feature\/alice-login-\d{8}/)
  })

  it('hotfix on dirty tree exits 2 with DIRTY_WORKING_TREE', () => {
    writeFileSync(path.join(dir, 'dirty.txt'), 'x')
    const r = pumpp(dir, 'hotfix', '-y', '--no-push')
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Working tree is not clean|DIRTY_WORKING_TREE/)
  })

  it('unknown subcommand exits 1', () => {
    const r = pumpp(dir, 'rc', '-y')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/Unknown branch type/)
  })

  it('running release twice collides with BRANCH_ALREADY_EXISTS', () => {
    const first = pumpp(dir, 'release', '-y', '--no-push', '--no-checkout')
    expect(first.status).toBe(0)
    const second = pumpp(dir, 'release', '-y', '--no-push', '--no-checkout')
    expect(second.status).toBe(2)
    expect(second.stderr).toMatch(/already exists/i)
  })

  it('init scaffolds pumpp.config.ts; re-run fails; --force overwrites', () => {
    const first = pumpp(dir, 'init')
    expect(first.status).toBe(0)
    expect(first.stdout).toMatch(/created pumpp\.config\.ts/)

    const second = pumpp(dir, 'init')
    expect(second.status).toBe(1)
    expect(second.stderr).toMatch(/existing pumpp\.config/i)

    const third = pumpp(dir, 'init', '--force')
    expect(third.status).toBe(0)
    expect(third.stdout).toMatch(/overwrote pumpp\.config\.ts/)
  })
})
