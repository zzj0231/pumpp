import type { PumpDeps } from '../type/pump-deps'
import type { MissingTokenSpec, ResolvedTokenState, TokenContext, TokenProviderSpec } from '../type/token-provider'
import os from 'node:os'
import process from 'node:process'
import { parse as parseSemver } from 'semver'
import { PumppError } from '../errors'
import { scanPattern } from './branch-template'
import { formatYmd, splitYmd } from './date-token'
import { slugifyBranchToken } from './slug'

export function buildBuiltinProviders(): TokenProviderSpec[] {
  return [
    { name: 'version', resolve: versionResolve },
    { name: 'major', dependsOn: ['version'], resolve: ctx => parseSemver(ctx.tokens.version ?? '')?.major.toString() },
    { name: 'minor', dependsOn: ['version'], resolve: ctx => parseSemver(ctx.tokens.version ?? '')?.minor.toString() },
    { name: 'patch', dependsOn: ['version'], resolve: ctx => parseSemver(ctx.tokens.version ?? '')?.patch.toString() },
    { name: 'date', resolve: dateResolve },
    { name: 'year', dependsOn: ['date'], resolve: ctx => ctx.tokens.date ? splitYmd(ctx.tokens.date).year : undefined },
    { name: 'month', dependsOn: ['date'], resolve: ctx => ctx.tokens.date ? splitYmd(ctx.tokens.date).month : undefined },
    { name: 'day', dependsOn: ['date'], resolve: ctx => ctx.tokens.date ? splitYmd(ctx.tokens.date).day : undefined },
    { name: 'username', resolve: usernameResolve },
    { name: 'desc', interactive: true, resolve: ctx => ctx.runtime.desc?.trim() || undefined },
    { name: 'branch', resolve: branchResolve },
    { name: 'random', resolve: () => Math.random().toString(16).slice(2, 8) },
  ]
}

async function versionResolve(ctx: TokenContext): Promise<string | undefined> {
  const deps = getDeps(ctx)
  const file = ctx.runtime.file ?? ctx.globals.manifest.file
  const key = ctx.runtime.versionKey ?? ctx.globals.manifest.versionKey
  try {
    return deps.readManifest(ctx.cwd, file, key)
  }
  catch (e) {
    throw new PumppError(`Failed to read version from ${file}`, {
      code: 'UNRESOLVED_TOKEN',
      hint: (e as Error).message,
      cause: e,
    })
  }
}

function dateResolve(ctx: TokenContext): string {
  if (ctx.runtime.date) {
    splitYmd(ctx.runtime.date)
    return ctx.runtime.date
  }
  return formatYmd(getDeps(ctx).now())
}

async function usernameResolve(ctx: TokenContext): Promise<string> {
  const deps = getDeps(ctx)
  const fromGit = (await deps.git.configGet(ctx.cwd, 'user.name'))?.trim()
  if (fromGit)
    return slugifyBranchToken(fromGit)
  const fromEnv = process.env.USER || process.env.USERNAME
  if (fromEnv)
    return slugifyBranchToken(fromEnv)
  return slugifyBranchToken(os.userInfo().username || 'user')
}

async function branchResolve(ctx: TokenContext): Promise<string | undefined> {
  const name = await getDeps(ctx).git.currentBranch(ctx.cwd)
  return name ? slugifyBranchToken(name) : undefined
}

const DEPS_KEY = Symbol.for('pumpp.deps')

function getDeps(ctx: TokenContext): PumpDeps {
  const deps = (ctx as any)[DEPS_KEY] as PumpDeps | undefined
  if (!deps)
    throw new Error('TokenContext missing deps')
  return deps
}

function attachDeps(ctx: TokenContext, deps: PumpDeps): TokenContext {
  return Object.assign(ctx, { [DEPS_KEY]: deps })
}

export interface ResolveTokensArgs {
  pattern: string
  providers: TokenProviderSpec[]
  ctx: TokenContext
  deps: PumpDeps
  allowInteractiveMissing?: boolean
}

function buildProviderMap(providers: TokenProviderSpec[]): Map<string, TokenProviderSpec> {
  const map = new Map<string, TokenProviderSpec>()
  for (const provider of providers) {
    if (map.has(provider.name)) {
      throw new PumppError(`Duplicate token provider name "${provider.name}"`, {
        code: 'CONFIG_INVALID',
      })
    }
    map.set(provider.name, provider)
  }
  return map
}

function topoSort(providers: TokenProviderSpec[], map: Map<string, TokenProviderSpec>): TokenProviderSpec[] {
  const visited = new Set<string>()
  const temp = new Set<string>()
  const out: TokenProviderSpec[] = []

  function visit(p: TokenProviderSpec) {
    if (visited.has(p.name))
      return
    if (temp.has(p.name))
      throw new PumppError(`Token providers have a cyclic dependency on "${p.name}"`, { code: 'CONFIG_INVALID' })
    temp.add(p.name)
    for (const dep of p.dependsOn ?? []) {
      const d = map.get(dep)
      if (!d) {
        throw new PumppError(`Token provider "${p.name}" depends on unknown provider "${dep}"`, {
          code: 'CONFIG_INVALID',
        })
      }
      visit(d)
    }
    temp.delete(p.name)
    visited.add(p.name)
    out.push(p)
  }
  for (const p of providers) visit(p)
  return out
}

export async function resolveTokenState(args: ResolveTokensArgs): Promise<ResolvedTokenState> {
  const { pattern, providers, ctx: baseCtx, deps } = args
  const refs = scanPattern(pattern)
  const required = new Set<string>(baseCtx.typeConfig.requiredTokens ?? [])
  const needed = new Map<string, boolean>()
  for (const r of refs) needed.set(r.name, r.optional && !required.has(r.name))
  for (const r of required) {
    if (!needed.has(r))
      needed.set(r, false)
  }

  const providerByName = buildProviderMap(providers)
  const ordered = topoSort(providers, providerByName)
  const executable = collectExecutableProviders(needed, providerByName)
  const ctx = attachDeps({
    ...baseCtx,
    tokens: {
      ...baseCtx.tokens,
      ...(baseCtx.runtime.interactiveTokens ?? {}),
    },
  }, deps)

  for (const p of ordered) {
    if (!executable.has(p.name))
      continue
    if (ctx.tokens[p.name] !== undefined)
      continue
    if (!p.resolve)
      continue
    const v = await p.resolve(ctx)
    if (v !== undefined && v !== '')
      ctx.tokens[p.name] = String(v)
  }

  const missing: MissingTokenSpec[] = []
  for (const [name, optional] of needed) {
    if (ctx.tokens[name] !== undefined)
      continue

    const provider = providerByName.get(name)
    if (!provider) {
      if (!optional) {
        throw new PumppError(`No provider registered for required token "${name}"`, {
          code: 'UNRESOLVED_TOKEN',
          hint: `Add a tokenProvider named "${name}" or remove {${name}} from the pattern`,
        })
      }
      missing.push({ name, optional, interactive: false })
      continue
    }

    const interactive = provider.interactive === true
    if (!optional && !(interactive && args.allowInteractiveMissing)) {
      throw new PumppError(`Failed to resolve required token "${name}"`, {
        code: 'UNRESOLVED_TOKEN',
        hint: interactive
          ? `Token "${name}" is interactive. In non-interactive mode without a TTY, provide explicit input before running again.`
          : undefined,
      })
    }

    missing.push({ name, optional, interactive })
  }

  return { values: ctx.tokens, missing }
}

export async function resolveTokens(args: ResolveTokensArgs): Promise<Record<string, string>> {
  return (await resolveTokenState(args)).values
}

function collectExecutableProviders(needed: Map<string, boolean>, providerByName: Map<string, TokenProviderSpec>): Set<string> {
  const executable = new Set<string>()

  function include(name: string) {
    if (executable.has(name))
      return

    const provider = providerByName.get(name)
    if (!provider)
      return

    executable.add(name)
    for (const dep of provider.dependsOn ?? [])
      include(dep)
  }

  for (const name of needed.keys())
    include(name)

  return executable
}
