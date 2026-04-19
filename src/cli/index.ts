import type { PumpBranchProgress } from '../type/pump-branch-progress'
import type { ResolvedPumpConfig } from '../type/pump-config'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import type { GlobalFlags } from './parse-args'
import path from 'node:path'
import process from 'node:process'
import { bold, gray, green, red, yellow } from 'kolorist'
import { previewBranchName, pumpBranch } from '../branch-pump'
import { defaultDeps } from '../default-deps'
import { errorCodeToExit, PumppError, toPumppError } from '../errors'
import { ProgressEvent } from '../type/pump-branch-progress'
import { ExitCode } from './exit-code'
import { runInit } from './init'
import { parseArgs } from './parse-args'
import { orange, symbols } from './symbols'

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

      case 'init': {
        const cwd = global.cwd ?? process.cwd()
        const result = await runInit({ cwd, format: intent.format, force: intent.force })
        if (!global.quiet) {
          const rel = path.relative(process.cwd(), result.path) || path.basename(result.path)
          const verb = result.overwrote ? 'overwrote' : 'created'
          console.log(`${symbols.success} ${verb} ${rel}`)
        }
        return
      }

      case 'interactive': {
        const deps = defaultDeps()
        const type = await pickType(config, deps)
        const runtime = await maybePromptDesc(type, config, deps, {})
        await runOne(type, { ...runtime, config }, global, deps)
        return
      }

      case 'run': {
        const deps = defaultDeps()
        const runtime = await maybePromptDesc(intent.type, config, deps, intent.runtime)
        await runOne(intent.type, { ...runtime, config }, global, deps)
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

/**
 * Ask for `{desc}` interactively when:
 *  - the resolved pattern has the token,
 *  - the user did not pass `--desc`,
 *  - the user did not pass `-y/--yes`,
 *  - and stdin is a TTY (skip silently in CI).
 *
 * Shows a live preview of the rendered branch name beneath the input on every
 * keystroke (when `textWithPreview` is available), then warns + re-asks once if
 * the user submits an empty value.
 */
async function maybePromptDesc(
  type: string,
  config: ResolvedPumpConfig,
  deps: ReturnType<typeof defaultDeps>,
  base: PumpRuntimeOptions,
): Promise<PumpRuntimeOptions> {
  const typeCfg = config.types[type]
  if (!typeCfg)
    return base
  if (!DESC_TOKEN_RE.test(typeCfg.pattern))
    return base
  if (base.desc)
    return base
  if (base.yes)
    return base
  if (!process.stdin.isTTY)
    return base

  let renderWith: ((d: string) => string) | undefined
  try {
    const previewRuntime: PumpRuntimeOptions = { ...base, config }
    const preview = await previewBranchName(type, previewRuntime, deps)
    renderWith = preview.renderWith
    printDescPromptHeader(type, typeCfg.pattern)
  }
  catch {
    // Preview prep failed (missing manifest, etc.) — degrade silently and
    // fall back to a plain text prompt without preview.
  }

  const first = (await askDesc(deps, renderWith)).trim()
  if (first)
    return { ...base, desc: first }

  if (!process.stdout.isTTY) {
    console.warn(yellow('! desc is empty; branch name will fall back to the pattern default'))
    return base
  }
  console.warn(yellow('! desc is empty; descriptive branches make code review and history scanning much easier'))
  const proceed = await deps.prompt.confirm('Proceed without a desc?')
  if (proceed)
    return base

  const second = (await askDesc(deps, renderWith)).trim()
  if (second)
    return { ...base, desc: second }
  return base
}

function printDescPromptHeader(type: string, pattern: string): void {
  console.log(`${gray('Type:   ')} ${type}`)
  console.log(`${gray('Pattern:')} ${orange(pattern)}`)
}

async function askDesc(
  deps: ReturnType<typeof defaultDeps>,
  renderWith: ((d: string) => string) | undefined,
): Promise<string> {
  const message = 'Description (fills {desc}):'
  if (renderWith && deps.prompt.textWithPreview) {
    const value = await deps.prompt.textWithPreview({ message, renderWith })
    if (value === undefined)
      throw new PumppError('aborted by user', { code: 'ABORTED_BY_USER' })
    return value
  }
  return await deps.prompt.text(message)
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
