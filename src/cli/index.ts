import type { PumpBranchProgress } from '../type/pump-branch-progress'
import type { ResolvedPumpConfig } from '../type/pump-config'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import type { GlobalFlags } from './parse-args'
import process from 'node:process'
import { green, red, yellow } from 'kolorist'
import { pumpBranch } from '../branch-pump'
import { defaultDeps } from '../default-deps'
import { errorCodeToExit, PumppError, toPumppError } from '../errors'
import { ProgressEvent } from '../type/pump-branch-progress'
import { ExitCode } from './exit-code'
import { parseArgs } from './parse-args'
import { symbols } from './symbols'

export async function main(argv = process.argv): Promise<void> {
  let global: GlobalFlags = { quiet: false, debug: false }
  try {
    const { intent, config } = await parseArgs(argv)
    if ('global' in intent)
      global = intent.global

    switch (intent.kind) {
      case 'help':
      case 'version':
        process.exit(ExitCode.Success)
        return

      case 'unknown':
        throw new PumppError(`Unknown branch type "${intent.input}"`, {
          code: 'UNKNOWN_BRANCH_TYPE',
          hint: `Known types: ${Object.keys(config.types).join(', ')}`,
        })

      case 'interactive': {
        const deps = defaultDeps()
        const type = await pickType(config, deps)
        const runtime = await augmentInteractive(type, config, deps, {})
        await runOne(type, { ...runtime, config }, global, deps)
        return
      }

      case 'run': {
        const deps = defaultDeps()
        await runOne(intent.type, { ...intent.runtime, config }, global, deps)
      }
    }
  }
  catch (raw) {
    handleError(raw, global)
  }
}

async function runOne(
  type: string,
  runtime: PumpRuntimeOptions,
  global: GlobalFlags,
  deps = defaultDeps(),
): Promise<void> {
  const effectiveRuntime: PumpRuntimeOptions = {
    ...runtime,
    cwd: runtime.cwd ?? global.cwd,
    progress: global.quiet ? undefined : buildProgress(),
  }
  const result = await pumpBranch(type, effectiveRuntime, deps)
  if (!global.quiet) {
    console.log(`${symbols.success} ${result.dryRun ? 'Dry run' : 'Done'}: ${result.branchName}`)
  }
}

function buildProgress(): (p: PumpBranchProgress) => void {
  return (p) => {
    switch (p.event) {
      case ProgressEvent.GitBranchCreated:
        console.log(`${symbols.success} ${green('branch')} ${p.branchName} ← ${p.base}`)
        break
      case ProgressEvent.GitPushed:
        console.log(`${symbols.success} ${green('push')}  ${p.branchName}`)
        break
      case ProgressEvent.NameResolved:
        console.log(`${symbols.info ?? '→'} name  ${p.branchName}`)
        break
    }
  }
}

async function pickType(config: ResolvedPumpConfig, deps = defaultDeps()): Promise<string> {
  const choices = Object.entries(config.types).map(([name, cfg]) => ({
    title: name,
    value: name,
    description: `${cfg.pattern}${cfg.description ? ` — ${cfg.description}` : ''}`,
  }))
  return await deps.prompt.select('Branch type', choices)
}

const DESC_TOKEN_RE = /\{desc\??\}/

async function augmentInteractive(
  type: string,
  config: ResolvedPumpConfig,
  deps: ReturnType<typeof defaultDeps>,
  base: PumpRuntimeOptions,
): Promise<PumpRuntimeOptions> {
  const typeCfg = config.types[type]
  if (!typeCfg)
    return base
  if (DESC_TOKEN_RE.test(typeCfg.pattern) && !base.desc) {
    const desc = await deps.prompt.text('Description (fills {desc}):')
    if (desc)
      return { ...base, desc }
  }
  return base
}

function handleError(raw: unknown, global: GlobalFlags): void {
  const err = toPumppError(raw)
  const exit = errorCodeToExit(err.code)
  if (exit === 0) {
    if (!global.quiet)
      console.log(yellow('aborted'))
    process.exit(exit)
  }
  const lines = [`${red('✖')} ${err.message}`]
  if (err.hint)
    lines.push(`  hint: ${err.hint}`)
  if (global.debug || process.env.NODE_ENV === 'development') {
    lines.push(`  code: ${err.code}`)
    if (err.stack)
      lines.push(err.stack)
    const stderr = (err.cause as { output?: { stderr?: string } } | undefined)?.output?.stderr
    if (stderr)
      lines.push(`  git stderr: ${stderr.trim()}`)
  }
  console.error(lines.join('\n'))
  process.exit(exit)
}
