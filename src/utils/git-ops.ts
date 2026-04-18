import os from 'node:os'
import process from 'node:process'
import { x } from 'tinyexec'
import { slugifyBranchToken } from './slug'

function execOpts(cwd: string) {
  return ({
    nodeOptions: { cwd },
    throwOnError: true,
  }) as const
}

export async function assertGitRepo(cwd: string): Promise<void> {
  const { stdout } = await x('git', ['rev-parse', '--is-inside-work-tree'], execOpts(cwd))
  if (stdout.trim() !== 'true')
    throw new Error('Not a git repository (or git unavailable)')
}

export async function getWorkingTreeStatus(cwd: string): Promise<string> {
  const { stdout } = await x('git', ['status', '--porcelain'], execOpts(cwd))
  return stdout
}

export async function getGitUserSlug(cwd: string): Promise<string> {
  const { stdout } = await x('git', ['config', 'user.name'], {
    ...execOpts(cwd),
    throwOnError: false,
  })

  const name = stdout.trim()
  if (name)
    return slugifyBranchToken(name)

  const fromEnv = process.env.USER || process.env.USERNAME
  if (fromEnv)
    return slugifyBranchToken(fromEnv)

  return slugifyBranchToken(os.userInfo().username || 'user')
}

export async function localBranchExists(cwd: string, branch: string): Promise<boolean> {
  const r = await x('git', ['rev-parse', '--verify', `refs/heads/${branch}`], {
    ...execOpts(cwd),
    throwOnError: false,
  })
  return r.exitCode === 0
}

export async function createBranch(
  cwd: string,
  branch: string,
  checkout: boolean,
): Promise<void> {
  if (checkout) {
    await x('git', ['checkout', '-b', branch], execOpts(cwd))
  }
  else {
    await x('git', ['branch', branch], execOpts(cwd))
  }
}

export async function pushBranch(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await x('git', ['push', '-u', remote, branch], execOpts(cwd))
}
