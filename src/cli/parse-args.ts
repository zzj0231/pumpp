import type { PumpBranchOptions } from '../type/branch-pump-options'
import type { BranchType } from '../type/release-type'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import cac from 'cac'
import { pumpConfigDefaults } from '../config'
import { loadPumpConfig } from '../load-pump-config'
import { ExitCode } from './exit-code'

function readPkgMeta(): { name: string, version: string } {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json',
  )
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string, version: string }
}

function assertBranchType(value: string): asserts value is BranchType {
  if (value !== 'release' && value !== 'feature' && value !== 'hotfix') {
    console.error(`Invalid --type "${value}". Expected release | feature | hotfix`)
    process.exit(ExitCode.InvalidArgument)
  }
}

export interface ParsedArgs {
  help?: boolean
  version?: boolean
  quiet: boolean
  interactive: boolean
  noGitCheck: boolean
  options: PumpBranchOptions
}

function mergeCliOptions(file: PumpBranchOptions, args: Record<string, unknown>): PumpBranchOptions {
  const merged: PumpBranchOptions = { ...file }

  if (typeof args.cwd === 'string')
    merged.cwd = args.cwd

  if (typeof args.file === 'string')
    merged.file = args.file

  if (typeof args.versionKey === 'string')
    merged.versionKey = args.versionKey

  if (typeof args.type === 'string') {
    assertBranchType(args.type)
    merged.type = args.type
  }

  if (args.noPush === true)
    merged.push = false

  if (args.noCheckout === true)
    merged.checkout = false

  if (args.yes === true)
    merged.confirm = false

  if (args.dryRun === true)
    merged.dryRun = true

  if (typeof args.remote === 'string')
    merged.remote = args.remote

  return merged
}

export function loadCliArgs(argv = process.argv) {
  const pkg = readPkgMeta()
  const cli = cac(pkg.name)

  cli
    .version(pkg.version)
    .usage('[options]')
    .option('-C, --cwd <dir>', 'Working directory')
    .option('-t, --type <type>', 'Branch type: release | feature | hotfix')
    .option('-i, --interactive', 'Prompt for branch type')
    .option('--file <file>', `Manifest file (default from config: ${pumpConfigDefaults.file})`)
    .option('--version-key <key>', `Version field (default from config: ${pumpConfigDefaults.versionKey})`)
    .option('-n, --no-push', 'Do not push the new branch')
    .option('--no-checkout', 'Create branch without checking it out')
    .option('-y, --yes', 'Skip confirmation')
    .option('--dry-run', 'Resolve branch name only; skip git writes')
    .option('--no-git-check', 'Allow a dirty working tree')
    .option('--remote <name>', 'Remote for git push')
    .option('--config <path>', 'Path to pumpp config file')
    .option('-q, --quiet', 'Quiet mode')
    .help()

  const result = cli.parse(argv)
  return { args: result.options as Record<string, unknown> }
}

export async function parseArgs(argv = process.argv): Promise<ParsedArgs> {
  try {
    const { args } = loadCliArgs(argv)
    const cwd = typeof args.cwd === 'string' ? args.cwd : process.cwd()
    const configFile = typeof args.config === 'string' ? args.config : undefined
    const fileConfig = await loadPumpConfig(cwd, configFile)
    const options = mergeCliOptions(fileConfig, args)

    return {
      help: args.help as boolean | undefined,
      version: args.version as boolean | undefined,
      quiet: Boolean(args.quiet),
      interactive: Boolean(args.interactive),
      noGitCheck: Boolean(args.noGitCheck),
      options,
    }
  }
  catch (error) {
    console.error((error as Error).message)
    return process.exit(ExitCode.InvalidArgument) as never
  }
}
