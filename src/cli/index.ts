import type { PumpBranchProgress } from '../type/branch-pump-progress'
import type { BranchType } from '../type/release-type'
import process from 'node:process'
import { NonZeroExitError } from 'tinyexec'
import { pumpBranch } from '../branch-pump'
import { ProgressEvent } from '../type/branch-pump-progress'
import { getWorkingTreeStatus } from '../utils/git-ops'
import { ExitCode } from './exit-code'
import { parseArgs } from './parse-args'
import { symbols } from './symbols'

export async function checkGitStatus(cwd: string): Promise<void> {
  const dirty = (await getWorkingTreeStatus(cwd)).trim()
  if (dirty)
    throw new Error(`Git working tree is not clean:\n${dirty}`)
}

function progress(quiet: boolean) {
  return ({ event, newBranchName, type, currentVersion }: PumpBranchProgress): void => {
    if (quiet)
      return

    switch (event) {
      case ProgressEvent.GitBranch:
        console.log(symbols.success, `Created branch ${newBranchName} (${type}, ${currentVersion})`)
        break
      case ProgressEvent.GitPush:
        console.log(symbols.success, `Pushed branch ${newBranchName}`)
        break
    }
  }
}

async function promptBranchType(): Promise<BranchType> {
  const prompts = await import('prompts')
  const { branchType } = await prompts.default({
    type: 'select',
    name: 'branchType',
    message: 'Branch type',
    choices: [
      { title: 'release', value: 'release' },
      { title: 'feature', value: 'feature' },
      { title: 'hotfix', value: 'hotfix' },
    ],
    initial: 0,
  }, {
    onCancel: () => {
      throw new Error('Aborted')
    },
  })

  return branchType as BranchType
}

function errorHandler(error: Error | NonZeroExitError): void {
  let message = error.message || String(error)

  if (error instanceof NonZeroExitError)
    message += `\n\n${error.output?.stderr || ''}`

  if (process.env.DEBUG || process.env.NODE_ENV === 'development')
    message += `\n\n${error.stack || ''}`

  console.error(message)
  process.exit(ExitCode.OperationalError)
}

/**
 * CLI entry (see `bin/pumpp.mjs`).
 */
export async function main(): Promise<void> {
  try {
    process.on('uncaughtException', errorHandler)
    process.on('unhandledRejection', errorHandler)

    const parsed = await parseArgs()

    if (parsed.help || parsed.version)
      process.exit(ExitCode.Success)

    const cwd = parsed.options.cwd ?? process.cwd()

    if (!parsed.noGitCheck)
      await checkGitStatus(cwd)

    if (parsed.interactive)
      parsed.options.type = await promptBranchType()

    if (!parsed.quiet)
      parsed.options.progress = progress(parsed.quiet)

    const result = await pumpBranch(parsed.options)

    if (!parsed.quiet)
      console.log(symbols.success, `Done: ${result.newBranchName}`)
  }
  catch (error) {
    errorHandler(error as Error)
  }
}
