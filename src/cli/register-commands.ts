import type { CAC } from 'cac'
import type { ResolvedPumpConfig, ResolvedTypeConfig } from '../type/pump-config'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'

export interface TypeCommandHandler {
  (type: string, runtime: PumpRuntimeOptions): Promise<void>
}

export function registerTypeCommands(
  cli: CAC,
  config: ResolvedPumpConfig,
  run: TypeCommandHandler,
): void {
  for (const [name, typeCfg] of Object.entries(config.types)) {
    registerOne(cli, name, typeCfg, run)
  }
}

function registerOne(
  cli: CAC,
  name: string,
  typeCfg: ResolvedTypeConfig,
  run: TypeCommandHandler,
) {
  const help = typeCfg.description ?? `Create a ${name} branch`
  const cmd = cli.command(name, help)
  addSharedOptions(cmd)
  cmd.example(() => `pumpp ${name}   # pattern: ${typeCfg.pattern}`)
  cmd.action(async (options: Record<string, unknown>) => {
    await run(name, cliOptionsToRuntime(options))
  })
}

export function addSharedOptions(cmd: ReturnType<CAC['command']>): void {
  cmd
    .option('-b, --base <branch>', 'Override base branch')
    .option('-d, --date <ymd>', 'Override {date} token (YYYYMMDD)')
    .option('--desc <text>', 'Value of {desc} token; appended if pattern omits {desc}')
    .option('-y, --yes', 'Skip confirmation')
    .option('--dry-run', 'Resolve branch name only; do not run git')
    .option('--push', 'Push new branch to remote')
    .option('--no-push', 'Do not push')
    .option('--checkout', 'Checkout after creating')
    .option('--no-checkout', 'Create branch without checkout')
    .option('--fetch', 'Run git fetch before creating')
    .option('--no-fetch', 'Skip git fetch')
    .option('--git-check', 'Require clean working tree')
    .option('--no-git-check', 'Allow dirty working tree')
    .option('--remote <name>', 'Remote for push/fetch')
    .option('--file <path>', 'Manifest file for {version}')
    .option('--version-key <key>', 'Field name inside manifest')
}

export function cliOptionsToRuntime(o: Record<string, unknown>): PumpRuntimeOptions {
  const r: PumpRuntimeOptions = {}
  if (typeof o.base === 'string')
    r.base = o.base
  if (typeof o.date === 'string')
    r.date = o.date
  if (typeof o.desc === 'string')
    r.desc = o.desc
  if (typeof o.remote === 'string')
    r.remote = o.remote
  if (typeof o.file === 'string')
    r.file = o.file
  if (typeof o.versionKey === 'string')
    r.versionKey = o.versionKey
  return r
}
