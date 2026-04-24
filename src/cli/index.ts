import type { PumpBranchProgress } from '../type/pump-branch-progress'
import type { ResolvedPumpConfig } from '../type/pump-config'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import type { GlobalFlags } from './parse-args'
import path from 'node:path'
import process from 'node:process'
import { green, red, yellow } from 'kolorist'
import { previewBranchName, pumpBranch } from '../branch-pump'
import { defaultDeps } from '../default-deps'
import { errorCodeToExit, PumppError, toPumppError } from '../errors'
import { ProgressEvent } from '../type/pump-branch-progress'
import { ExitCode } from './exit-code'
import { runInit } from './init'
import { parseArgs } from './parse-args'
import { promptInteractiveTokens } from './prompt-interactive-tokens'
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
        const preview = await previewBranchName(type, { config }, deps)
        const runtime = await promptInteractiveTokens({
          type,
          pattern: preview.pattern,
          preview,
          runtime: {},
          deps,
          isInteractive: process.stdin.isTTY,
        })
        await runOne(type, { ...runtime, config }, global, deps)
        return
      }

      case 'run': {
        const deps = defaultDeps()
        const preview = await previewBranchName(intent.type, { ...intent.runtime, config }, deps)
        const runtime = await promptInteractiveTokens({
          type: intent.type,
          pattern: preview.pattern,
          preview,
          runtime: intent.runtime,
          deps,
          isInteractive: process.stdin.isTTY,
        })
        await runOne(intent.type, { ...runtime, config }, global, deps)
        return
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
