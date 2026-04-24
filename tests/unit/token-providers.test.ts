import type {
  TokenContext,
  TokenProviderSpec,
} from '../../src/type/token-provider'
import { describe, expect, it } from 'vitest'
import {
  buildBuiltinProviders,
  resolveTokens,
  resolveTokenState,
} from '../../src/utils/token-providers'

function ctxBase(): TokenContext {
  return {
    cwd: '/tmp',
    type: 'release',
    globals: {
      base: 'main',
      push: false,
      checkout: true,
      confirm: true,
      gitCheck: true,
      fetch: false,
      remote: 'origin',
      manifest: { file: 'package.json', versionKey: 'version' },
    },
    typeConfig: {
      name: 'release',
      pattern: 'release/{version}-{date}',
      base: 'main',
      push: false,
      checkout: true,
      confirm: true,
      gitCheck: true,
      fetch: false,
      requiredTokens: [],
    },
    runtime: {},
    tokens: {},
  }
}

function makeDeps(
  overrides: Partial<{
    now: () => Date
    readManifest: (c: string, f: string, k: string) => string
    gitUser: string
  }>,
) {
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
    expect(tokens).toMatchObject({
      date: '20260101',
      year: '2026',
      month: '01',
      day: '01',
    })
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
    await expect(
      resolveTokens({
        pattern: 'x/{desc}',
        providers,
        ctx,
        deps: makeDeps({}),
      }),
    ).rejects.toMatchObject({ code: 'UNRESOLVED_TOKEN' })
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

  it('resolves transitive provider dependencies for referenced tokens', async () => {
    const providers: TokenProviderSpec[] = [
      {
        name: 'a',
        resolve: () => 'alpha',
      },
      {
        name: 'b',
        dependsOn: ['a'],
        resolve: ctx => (ctx.tokens.a ? `${ctx.tokens.a}-beta` : undefined),
      },
      {
        name: 'c',
        dependsOn: ['b'],
        resolve: ctx => (ctx.tokens.b ? `${ctx.tokens.b}-gamma` : undefined),
      },
    ]

    const tokens = await resolveTokens({
      pattern: 'r/{c}',
      providers,
      ctx: ctxBase(),
      deps: makeDeps({}),
    })

    expect(tokens).toMatchObject({
      a: 'alpha',
      b: 'alpha-beta',
      c: 'alpha-beta-gamma',
    })
  })

  it('requiredTokens enforces presence even when pattern omits them', async () => {
    const providers = buildBuiltinProviders()
    const ctx = ctxBase()
    ctx.typeConfig.requiredTokens = ['desc']
    await expect(
      resolveTokens({
        pattern: 'r/{version}',
        providers,
        ctx,
        deps: makeDeps({}),
      }),
    ).rejects.toMatchObject({ code: 'UNRESOLVED_TOKEN' })
  })

  it('rejects duplicate provider names as CONFIG_INVALID', async () => {
    const duplicate: TokenProviderSpec = {
      name: 'version',
      resolve: () => '9.9.9',
    }

    await expect(
      resolveTokens({
        pattern: 'r/{version}',
        providers: [...buildBuiltinProviders(), duplicate],
        ctx: ctxBase(),
        deps: makeDeps({}),
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
  })

  it('rejects unknown dependsOn targets as CONFIG_INVALID', async () => {
    const custom: TokenProviderSpec = {
      name: 'tag',
      dependsOn: ['missing'],
      resolve: () => 'v1',
    }

    await expect(
      resolveTokens({
        pattern: 'r/{tag}',
        providers: [...buildBuiltinProviders(), custom],
        ctx: ctxBase(),
        deps: makeDeps({}),
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
  })
})

describe('resolveTokenState', () => {
  it('marks unresolved interactive required tokens without throwing', async () => {
    const custom: TokenProviderSpec = {
      name: 'module',
      interactive: true,
      resolve: () => undefined,
    }
    const result = await resolveTokenState({
      pattern: 'style/{module}',
      providers: [...buildBuiltinProviders(), custom],
      ctx: ctxBase(),
      deps: makeDeps({}),
      allowInteractiveMissing: true,
    })
    expect(result.values.module).toBeUndefined()
    expect(result.missing).toEqual([
      { name: 'module', optional: false, interactive: true },
    ])
  })

  it('interactive provider may omit resolve and still be marked missing', async () => {
    const custom: TokenProviderSpec = {
      name: 'module',
      interactive: true,
    }
    const result = await resolveTokenState({
      pattern: 'style/{module}',
      providers: [...buildBuiltinProviders(), custom],
      ctx: ctxBase(),
      deps: makeDeps({}),
      allowInteractiveMissing: true,
    })
    expect(result.values.module).toBeUndefined()
    expect(result.missing).toEqual([
      { name: 'module', optional: false, interactive: true },
    ])
  })

  it('keeps unresolved optional interactive tokens in missing metadata', async () => {
    const result = await resolveTokenState({
      pattern: 'feature/{username}-{desc?}',
      providers: buildBuiltinProviders(),
      ctx: ctxBase(),
      deps: makeDeps({ gitUser: 'Alice Bob' }),
      allowInteractiveMissing: true,
    })
    expect(result.values.username).toBe('alice-bob')
    expect(result.missing).toContainEqual({
      name: 'desc',
      optional: true,
      interactive: true,
    })
  })

  it('throws when interactive missing is not allowed', async () => {
    const custom: TokenProviderSpec = {
      name: 'module',
      interactive: true,
      resolve: () => undefined,
    }
    await expect(
      resolveTokenState({
        pattern: 'style/{module}',
        providers: [...buildBuiltinProviders(), custom],
        ctx: ctxBase(),
        deps: makeDeps({}),
        allowInteractiveMissing: false,
      }),
    ).rejects.toMatchObject({
      code: 'UNRESOLVED_TOKEN',
      hint: expect.stringMatching(
        /interactive|non-interactive|TTY|explicit input/i,
      ),
    })
  })

  it('required non-interactive token without resolve still throws even when allowInteractiveMissing', async () => {
    const custom: TokenProviderSpec = { name: 'ticket' }
    await expect(
      resolveTokenState({
        pattern: 'jira/{ticket}',
        providers: [...buildBuiltinProviders(), custom],
        ctx: ctxBase(),
        deps: makeDeps({}),
        allowInteractiveMissing: true,
      }),
    ).rejects.toMatchObject({ code: 'UNRESOLVED_TOKEN' })
  })
})
