import type { GitDeps } from '../type/pump-deps'
import os from 'node:os'
import process from 'node:process'
import { x } from 'tinyexec'
import { slugifyBranchToken } from './slug'

function opts(cwd: string) {
  return { nodeOptions: { cwd }, throwOnError: true } as const
}

async function safeRun(cwd: string, args: string[]): Promise<{ exitCode: number, stdout: string, stderr: string }> {
  const r = await x('git', args, { nodeOptions: { cwd }, throwOnError: false })
  return { exitCode: r.exitCode ?? 0, stdout: r.stdout, stderr: r.stderr }
}

export const realGit: GitDeps = {
  async assertRepo(cwd) {
    const { stdout, exitCode } = await safeRun(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (exitCode !== 0 || stdout.trim() !== 'true')
      throw Object.assign(new Error('not a git repo'), { __pumppHint: 'cwd must be inside a git working tree' })
  },
  async status(cwd) {
    const { stdout } = await x('git', ['status', '--porcelain'], opts(cwd))
    return stdout
  },
  async currentBranch(cwd) {
    const { stdout } = await x('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts(cwd))
    return stdout.trim()
  },
  async revParseVerify(cwd, ref) {
    const { exitCode } = await safeRun(cwd, ['rev-parse', '--verify', '--quiet', ref])
    return exitCode === 0
  },
  async lsRemoteHead(cwd, remote, branch) {
    const { stdout } = await x('git', ['ls-remote', '--heads', remote, branch], opts(cwd))
    return stdout.trim().length > 0
  },
  async fetch(cwd, remote) {
    await x('git', ['fetch', remote, '--prune'], opts(cwd))
  },
  async createBranch(cwd, name, base, checkout) {
    if (checkout)
      await x('git', ['checkout', '-b', name, base], opts(cwd))
    else
      await x('git', ['branch', name, base], opts(cwd))
  },
  async push(cwd, remote, name) {
    await x('git', ['push', '-u', remote, name], opts(cwd))
  },
  async checkRefFormat(name) {
    await x('git', ['check-ref-format', '--branch', name], { throwOnError: true })
  },
  async configGet(cwd, key) {
    const { stdout, exitCode } = await safeRun(cwd, ['config', key])
    return exitCode === 0 ? stdout.trim() || undefined : undefined
  },
}

// Legacy adapters (will be deleted in Task 12 alongside branch-pump.ts stub).
// They keep the old src/branch-pump.ts compiling during the incremental refactor.
export async function assertGitRepo(cwd: string): Promise<void> {
  await realGit.assertRepo(cwd)
}
export async function localBranchExists(cwd: string, branch: string): Promise<boolean> {
  return realGit.revParseVerify(cwd, `refs/heads/${branch}`)
}
export async function createBranch(cwd: string, branch: string, checkout: boolean): Promise<void> {
  await realGit.createBranch(cwd, branch, 'HEAD', checkout)
}
export async function pushBranch(cwd: string, remote: string, branch: string): Promise<void> {
  await realGit.push(cwd, remote, branch)
}
export async function getGitUserSlug(cwd: string): Promise<string> {
  const name = (await realGit.configGet(cwd, 'user.name'))?.trim()
  if (name)
    return slugifyBranchToken(name)
  const fromEnv = process.env.USER || process.env.USERNAME
  if (fromEnv)
    return slugifyBranchToken(fromEnv)
  return slugifyBranchToken(os.userInfo().username || 'user')
}
export async function getWorkingTreeStatus(cwd: string): Promise<string> {
  return realGit.status(cwd)
}
