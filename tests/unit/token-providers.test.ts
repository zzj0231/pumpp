import type { TokenContext, TokenProviderSpec } from '../../src/type/token-provider'
import { describe, expect, it } from 'vitest'
import { buildBuiltinProviders, resolveTokens } from '../../src/utils/token-providers'

function ctxBase(): TokenContext {
  return {
    cwd: '/tmp',
    type: 'release',
    globals: { base: 'main', push: false, checkout: true, confirm: true, gitCheck: true, fetch: false, remote: 'origin', manifest: { file: 'package.json', versionKey: 'version' } },
    typeConfig: { name: 'release', pattern: 'release/{version}-{date}', base: 'main', push: false, checkout: true, confirm: true, gitCheck: true, fetch: false, requiredTokens: [] },
    runtime: {},
    tokens: {},
  }
}

function makeDeps(overrides: Partial<{ now: () => Date, readManifest: (c: string, f: string, k: string) => string, gitUser: string }>) {
  return {
    now: overrides.now ?? (() => new Date(2026, 3, 18)),
    readManifest: overrides.readManifest ?? (() => '1.2.3'),
    git: { configGet: async () => overrides.gitUser },
  } as any
}

describe('resolveTokens (builtins)', () => {
  it('resolves only tokens referenced in pattern', async () => {
    const providers = buildBuiltinProviders()
    const deps = makeDeps({ gitUser: 'Alice Bob' })
    const tokens = await resolveTokens({
      pattern: 'release/{version}-{date}',
      providers,
      ctx: ctxBase(),
      deps,
    })
    expect(tokens.version).toBe('1.2.3')
    expect(tokens.date).toBe('20260418')
    expect(tokens.username).toBeUndefined()
  })

  it('--date runtime override wins', async () => {
    const providers = buildBuiltinProviders()
    const ctx = ctxBase()
    ctx.runtime.date = '20260101'
    const tokens = await resolveTokens({
      pattern: '{date}-{year}-{month}-{day}',
      providers,
      ctx,
      deps: makeDeps({}),
    })
    expect(tokens).toMatchObject({ date: '20260101', year: '2026', month: '01', day: '01' })
  })

  it('optional token unresolved stays empty', async () => {
    const providers = buildBuiltinProviders()
    const tokens = await resolveTokens({
      pattern: 'release/{version}-{desc?}',
      providers,
      ctx: ctxBase(),
      deps: makeDeps({}),
    })
    expect(tokens.desc).toBeUndefined()
  })

  it('required token unresolved throws UNRESOLVED_TOKEN', async () => {
    const providers = buildBuiltinProviders()
    const ctx = ctxBase()
    await expect(resolveTokens({
      pattern: 'x/{desc}',
      providers,
      ctx,
      deps: makeDeps({}),
    })).rejects.toMatchObject({ code: 'UNRESOLVED_TOKEN' })
  })

  it('custom provider runs after its dependency', async () => {
    const custom: TokenProviderSpec = {
      name: 'tag',
      dependsOn: ['version'],
      resolve: ctx => `v${ctx.tokens.version}`,
    }
    const providers = [...buildBuiltinProviders(), custom]
    const tokens = await resolveTokens({
      pattern: 'r/{tag}',
      providers,
      ctx: ctxBase(),
      deps: makeDeps({}),
    })
    expect(tokens.tag).toBe('v1.2.3')
  })

  it('requiredTokens enforces presence even when pattern omits them', async () => {
    const providers = buildBuiltinProviders()
    const ctx = ctxBase()
    ctx.typeConfig.requiredTokens = ['desc']
    await expect(resolveTokens({
      pattern: 'r/{version}',
      providers,
      ctx,
      deps: makeDeps({}),
    })).rejects.toMatchObject({ code: 'UNRESOLVED_TOKEN' })
  })
})
