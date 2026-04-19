import type { PumpBranchProgress } from './type/pump-branch-progress'
import type { PumpBranchResults } from './type/pump-branch-results'
import type { ResolvedPumpConfig, ResolvedTypeConfig } from './type/pump-config'
import type { PumpDeps } from './type/pump-deps'
import type { PumpRuntimeOptions } from './type/pump-runtime-options'
import process from 'node:process'
import { defaultDeps } from './default-deps'
import { PumppError, toPumppError } from './errors'
import { loadPumpConfig } from './load-pump-config'
import { ProgressEvent } from './type/pump-branch-progress'
import { renderBranchName } from './utils/branch-template'
import { slugifyBranchToken } from './utils/slug'
import { resolveTokens } from './utils/token-providers'
import { validateRef } from './utils/validate-ref'

const DESC_TOKEN_RE = /\{desc\??\}/

export interface PreviewBranchResult {
  type: string
  pattern: string
  branchName: string
  tokens: Record<string, string>
  /**
   * Cheap synchronous re-render with a different `desc` value.
   *
   * Reuses pre-resolved tokens (no extra git / manifest IO), slugs the input,
   * and mirrors the same "fill {desc?} slot OR append after-the-fact" logic
   * `pumpBranch` uses. Note: `customBranchName` hooks are NOT applied here —
   * keystroke handlers cannot await arbitrary user code. The returned
   * `branchName` field above DOES include hook output for the initial empty
   * desc, so live previews stay close to the final result for typical configs.
   */
  renderWith: (desc?: string) => string
}

export async function pumpBranch(
  type: string,
  runtime: PumpRuntimeOptions = {},
  deps: PumpDeps = defaultDeps(),
): Promise<PumpBranchResults> {
  try {
    return await runPipeline(type, runtime, deps)
  }
  catch (e) {
    throw toPumppError(e)
  }
}

async function runPipeline(
  type: string,
  runtime: PumpRuntimeOptions,
  deps: PumpDeps,
): Promise<PumpBranchResults> {
  const { cwd, config, typeConfig, sluggedTokens, branchName: rendered } = await resolveAndRender(type, runtime, deps)

  const effective = mergeEffective(typeConfig, config, runtime)
  if (isHeadAlias(effective.base))
    effective.base = await resolveHeadAlias(cwd, deps)
  const dryRun = runtime.dryRun === true
  emit(runtime, { event: ProgressEvent.ConfigLoaded, type, base: effective.base, branchName: '', dryRun })
  emit(runtime, { event: ProgressEvent.TokensResolved, type, base: effective.base, branchName: '', dryRun })

  let branchName = rendered

  const hook = runtime.customBranchName
    ?? typeConfig.customBranchName
    ?? config.customBranchName
  if (hook) {
    const override = await hook({
      type,
      pattern: typeConfig.pattern,
      tokens: sluggedTokens,
      typeConfig,
    })
    if (typeof override === 'string' && override.trim())
      branchName = override.trim()
  }

  emit(runtime, { event: ProgressEvent.NameResolved, type, base: effective.base, branchName, dryRun })

  await preflight(cwd, branchName, effective, deps, runtime)
  emit(runtime, { event: ProgressEvent.GitPreflight, type, base: effective.base, branchName, dryRun })

  if (effective.confirm && !runtime.yes) {
    const label = dryRun ? 'Branch name (dry-run)' : 'Branch name'
    const edited = await deps.prompt.editText(label, branchName)
    if (edited === undefined)
      throw new PumppError('aborted by user', { code: 'ABORTED_BY_USER' })
    if (edited !== branchName) {
      branchName = edited
      await preflightName(cwd, branchName, effective, deps)
    }
  }
  emit(runtime, { event: ProgressEvent.Confirmed, type, base: effective.base, branchName, dryRun })

  if (!dryRun) {
    await deps.git.createBranch(cwd, branchName, effective.base, effective.checkout)
    emit(runtime, { event: ProgressEvent.GitBranchCreated, type, base: effective.base, branchName, dryRun })
    if (effective.push) {
      await deps.git.push(cwd, effective.remote, branchName)
      emit(runtime, { event: ProgressEvent.GitPushed, type, base: effective.base, branchName, dryRun })
    }
  }

  return {
    type,
    base: effective.base,
    branchName,
    dryRun,
    tokens: sluggedTokens,
    date: sluggedTokens.date ?? '',
    username: sluggedTokens.username ?? '',
    version: sluggedTokens.version,
    desc: runtime.desc,
  }
}

interface ResolveAndRenderResult {
  cwd: string
  config: ResolvedPumpConfig
  typeConfig: ResolvedTypeConfig
  sluggedTokens: Record<string, string>
  branchName: string
}

async function resolveAndRender(
  type: string,
  runtime: PumpRuntimeOptions,
  deps: PumpDeps,
): Promise<ResolveAndRenderResult> {
  const cwd = runtime.cwd ?? process.cwd()
  const config = runtime.config ?? await loadPumpConfig(cwd, runtime.configFile)
  const typeConfig = config.types[type]
  if (!typeConfig) {
    throw new PumppError(`Unknown branch type "${type}"`, {
      code: 'UNKNOWN_BRANCH_TYPE',
      hint: `Known types: ${Object.keys(config.types).join(', ') || '(none)'}`,
    })
  }

  const tokens = await resolveTokens({
    pattern: typeConfig.pattern,
    providers: config.tokenProviders,
    ctx: {
      cwd,
      type,
      globals: config.globals,
      typeConfig,
      runtime,
      tokens: {},
    },
    deps,
  })
  const sluggedTokens = slugValues(tokens)

  let branchName = renderBranchName(typeConfig.pattern, sluggedTokens)
  if (runtime.desc && !DESC_TOKEN_RE.test(typeConfig.pattern))
    branchName = `${branchName}-${slugifyBranchToken(runtime.desc)}`

  return { cwd, config, typeConfig, sluggedTokens, branchName }
}

/**
 * Preview the branch name without touching the working tree, remote, or running
 * the `customBranchName` hook on every keystroke.
 *
 * Resolves config + tokens once, then returns a synchronous `renderWith(desc)`
 * closure that the CLI uses to drive the live preview line under the desc
 * input. Token resolution still runs (so version / username / git read happen),
 * but git mutation, preflight, and the (potentially async) custom hook are
 * skipped on every re-render.
 */
export async function previewBranchName(
  type: string,
  runtime: PumpRuntimeOptions = {},
  deps: PumpDeps = defaultDeps(),
): Promise<PreviewBranchResult> {
  const baseRuntime: PumpRuntimeOptions = { ...runtime, desc: undefined }
  const { config, typeConfig, sluggedTokens } = await resolveAndRender(
    type,
    baseRuntime,
    deps,
  )

  const pattern = typeConfig.pattern
  const hasDescSlot = DESC_TOKEN_RE.test(pattern)

  const renderWith = (desc?: string): string => {
    const trimmed = desc?.trim() ?? ''
    if (!trimmed) {
      const tokens = { ...sluggedTokens }
      delete tokens.desc
      return renderBranchName(pattern, tokens)
    }
    const slug = slugifyBranchToken(trimmed)
    const tokens = { ...sluggedTokens, desc: slug }
    const name = renderBranchName(pattern, tokens)
    return hasDescSlot ? name : `${name}-${slug}`
  }

  let branchName = renderWith(runtime.desc)
  const hook = runtime.customBranchName
    ?? typeConfig.customBranchName
    ?? config.customBranchName
  if (hook) {
    const override = await hook({
      type,
      pattern,
      tokens: sluggedTokens,
      typeConfig,
    })
    if (typeof override === 'string' && override.trim())
      branchName = override.trim()
  }

  return {
    type,
    pattern,
    branchName,
    tokens: sluggedTokens,
    renderWith,
  }
}

interface Effective {
  base: string
  push: boolean
  checkout: boolean
  confirm: boolean
  gitCheck: boolean
  fetch: boolean
  remote: string
}

function mergeEffective(
  t: ResolvedTypeConfig,
  config: ResolvedPumpConfig,
  r: PumpRuntimeOptions,
): Effective {
  return {
    base: r.base ?? t.base,
    push: r.push ?? t.push,
    checkout: r.checkout ?? t.checkout,
    confirm: t.confirm,
    gitCheck: r.gitCheck ?? t.gitCheck,
    fetch: r.fetch ?? t.fetch,
    remote: r.remote ?? config.globals.remote,
  }
}

function slugValues(tokens: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tokens)) {
    if (k === 'version' || k === 'date' || k === 'year' || k === 'month' || k === 'day' || k === 'random')
      out[k] = v
    else
      out[k] = slugifyBranchToken(v, v)
  }
  return out
}

async function preflight(
  cwd: string,
  branchName: string,
  eff: Effective,
  deps: PumpDeps,
  runtime: PumpRuntimeOptions,
): Promise<void> {
  try {
    await deps.git.assertRepo(cwd)
  }
  catch (e) {
    throw new PumppError(`Not a git repository: ${cwd}`, { code: 'NOT_A_GIT_REPO', cause: e })
  }

  if (eff.gitCheck) {
    const status = (await deps.git.status(cwd)).trim()
    if (status) {
      throw new PumppError('Working tree is not clean', {
        code: 'DIRTY_WORKING_TREE',
        hint: 'Commit or stash changes, or pass --no-git-check',
      })
    }
  }

  const baseOk = await deps.git.revParseVerify(cwd, `refs/heads/${eff.base}`)
  if (!baseOk)
    throw new PumppError(`Base branch "${eff.base}" does not exist locally`, { code: 'BASE_BRANCH_MISSING' })

  if (eff.fetch) {
    try {
      await deps.git.fetch(cwd, eff.remote)
    }
    catch { /* WARN but do not abort */ }
  }

  await preflightName(cwd, branchName, eff, deps)

  void runtime
}

async function preflightName(
  cwd: string,
  branchName: string,
  eff: Effective,
  deps: PumpDeps,
): Promise<void> {
  if (await deps.git.revParseVerify(cwd, `refs/heads/${branchName}`)) {
    throw new PumppError(`Branch "${branchName}" already exists locally`, {
      code: 'BRANCH_ALREADY_EXISTS',
      hint: 'Pick a different name (or pass --desc to append a suffix)',
    })
  }

  if ((eff.push || eff.fetch) && await deps.git.lsRemoteHead(cwd, eff.remote, branchName)) {
    throw new PumppError(`Branch "${branchName}" already exists on remote "${eff.remote}"`, {
      code: 'BRANCH_ALREADY_EXISTS',
    })
  }

  await validateRef(branchName, deps)
}

function emit(runtime: PumpRuntimeOptions, p: PumpBranchProgress): void {
  runtime.progress?.(p)
}

function isHeadAlias(base: string): boolean {
  return base === '.' || base.toLowerCase() === 'head'
}

async function resolveHeadAlias(cwd: string, deps: PumpDeps): Promise<string> {
  try {
    await deps.git.assertRepo(cwd)
  }
  catch (e) {
    throw new PumppError(`Not a git repository: ${cwd}`, { code: 'NOT_A_GIT_REPO', cause: e })
  }
  const head = (await deps.git.currentBranch(cwd)).trim()
  if (!head || head === 'HEAD') {
    throw new PumppError('Cannot use HEAD as base while in detached HEAD state', {
      code: 'BASE_BRANCH_MISSING',
      hint: 'Checkout a branch first, or set base to an explicit branch name',
    })
  }
  return head
}
