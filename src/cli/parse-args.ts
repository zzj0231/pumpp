import type { ResolvedPumpConfig } from '../type/pump-config'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import cac from 'cac'
import { loadPumpConfig } from '../load-pump-config'
import { addSharedOptions, cliOptionsToRuntime, registerTypeCommands } from './register-commands'

export type Intent
  = | { kind: 'help' }
    | { kind: 'version' }
    | { kind: 'interactive', global: GlobalFlags }
    | { kind: 'unknown', input: string, global: GlobalFlags }
    | { kind: 'run', type: string, runtime: PumpRuntimeOptions, global: GlobalFlags }

export interface GlobalFlags {
  cwd?: string
  configFile?: string
  quiet: boolean
  debug: boolean
}

export function readPkg(): { name: string, version: string } {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const pkgPath = path.resolve(here, '../../package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
}

export function buildIntent(argv: string[], config: ResolvedPumpConfig): Intent {
  const pkg = readPkg()
  const cli = cac(pkg.name)
  cli
    .option('-C, --cwd <dir>', 'Working directory')
    .option('--config <path>', 'Path to pumpp config')
    .option('-q, --quiet', 'Suppress non-error output')
    .option('--debug', 'Print error code + stack + git stderr')
    .help()
    .version(pkg.version)

  registerTypeCommands(cli, config, async () => { /* noop when run:false */ })

  const emptyCmd = cli.command('', 'Pick a type interactively')
  addSharedOptions(emptyCmd)
  emptyCmd.action(() => {})

  const parsed = cli.parse(argv, { run: false })

  const global: GlobalFlags = {
    cwd: typeof parsed.options.cwd === 'string' ? parsed.options.cwd : undefined,
    configFile: typeof parsed.options.config === 'string' ? parsed.options.config : undefined,
    quiet: Boolean(parsed.options.quiet),
    debug: Boolean(parsed.options.debug),
  }

  if (parsed.options.help)
    return { kind: 'help' }
  if (parsed.options.version)
    return { kind: 'version' }

  const matched = cli.matchedCommandName
  if (matched && matched in config.types) {
    return {
      kind: 'run',
      type: matched,
      runtime: cliOptionsToRuntime(parsed.options),
      global,
    }
  }

  const first = parsed.args[0]
  if (first)
    return { kind: 'unknown', input: first, global }

  return { kind: 'interactive', global }
}

export async function parseArgs(argv = process.argv): Promise<{
  intent: Intent
  config: ResolvedPumpConfig
}> {
  const preliminary = preliminaryScan(argv)
  const config = await loadPumpConfig(
    preliminary.cwd ?? process.cwd(),
    preliminary.configFile,
  )
  const intent = buildIntent(argv, config)
  return { intent, config }
}

function preliminaryScan(argv: string[]): { cwd?: string, configFile?: string } {
  const out: { cwd?: string, configFile?: string } = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-C' || a === '--cwd')
      out.cwd = argv[++i]
    else if (a.startsWith('--cwd='))
      out.cwd = a.slice(6)
    else if (a === '--config')
      out.configFile = argv[++i]
    else if (a.startsWith('--config='))
      out.configFile = a.slice(9)
  }
  return out
}
