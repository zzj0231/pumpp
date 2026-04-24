# Interactive Token Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the CLI's current `{desc}`-only prompt flow into a token-provider-driven interactive input system so custom tokens like `{module}` can be prompted, previewed, and validated without breaking existing `--desc` behavior.

**Architecture:** Keep rendering and git mutation in `src/branch-pump.ts`, but split token work into two phases: auto-resolution in `src/utils/token-providers.ts`, then CLI-side interactive completion using token metadata. Preserve compatibility by treating built-in `desc` as an `interactive: true` provider and keeping the legacy "append desc when pattern omits `{desc}`" behavior behind a shared render helper instead of CLI special-casing.

**Tech Stack:** TypeScript, CAC, prompts, Vitest, existing `PumpDeps` dependency injection.

---

## File Structure

### Files to modify

- `src/type/token-provider.ts`
  - Add `interactive?: boolean` to `TokenProviderSpec`
  - Add shared token-resolution metadata types used by resolver, preview, and CLI prompt code
- `src/utils/token-providers.ts`
  - Keep provider topological ordering
  - Add a richer resolver that returns both resolved values and missing-token metadata
  - Preserve `resolveTokens()` as a compatibility wrapper until all callers migrate
- `src/branch-pump.ts`
  - Switch preview and final rendering to the richer token-resolution result
  - Replace `renderWith(desc)` with a patch-based `renderWith(patch)`
  - Centralize legacy desc-append compatibility in one helper
- `src/cli/index.ts`
  - Replace `maybePromptDesc()` with a generic interactive-token flow
  - Keep `pickType()` and `runOne()` unchanged except for the new pre-run prompt call
- `README.md`
  - Document `interactive: true` on custom providers and the new interactive example

### Files to create

- `src/cli/prompt-interactive-tokens.ts`
  - Small CLI-only helper that consumes preview metadata and prompts missing interactive tokens in pattern order
- `tests/unit/branch-pump-preview.test.ts`
  - Focused preview tests for missing-token metadata and multi-token `renderWith()`
- `tests/unit/prompt-interactive-tokens.test.ts`
  - Prompt-order, non-interactive, and desc-compat unit tests using fake `PumpDeps`

### Files to extend with tests

- `tests/unit/token-providers.test.ts`
  - Add resolver metadata tests and interactive hint coverage
- `tests/e2e/cli.test.ts`
  - Add a non-interactive custom-token regression and keep `--desc` regression intact

## Task 1: Add Interactive Token Metadata To Resolver

**Files:**
- Modify: `src/type/token-provider.ts`
- Modify: `src/utils/token-providers.ts`
- Test: `tests/unit/token-providers.test.ts`

- [ ] **Step 1: Write the failing resolver metadata tests**

```ts
import type { TokenContext, TokenProviderSpec } from '../../src/type/token-provider'
import { describe, expect, it } from 'vitest'
import { buildBuiltinProviders, resolveTokenState } from '../../src/utils/token-providers'

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

  it('throws with the existing code when interactive missing is not allowed', async () => {
    const custom: TokenProviderSpec = {
      name: 'module',
      interactive: true,
      resolve: () => undefined,
    }
    await expect(resolveTokenState({
      pattern: 'style/{module}',
      providers: [...buildBuiltinProviders(), custom],
      ctx: ctxBase(),
      deps: makeDeps({}),
      allowInteractiveMissing: false,
    })).rejects.toMatchObject({
      code: 'UNRESOLVED_TOKEN',
      hint: expect.stringMatching(/interactive|TTY|explicitly/i),
    })
  })
})
```

- [ ] **Step 2: Run the resolver tests to verify they fail**

Run: `pnpm vitest run tests/unit/token-providers.test.ts`

Expected: FAIL with `resolveTokenState is not a function` and missing `interactive` metadata assertions.

- [ ] **Step 3: Add shared types in `src/type/token-provider.ts`**

```ts
export interface MissingTokenSpec {
  name: string
  optional: boolean
  interactive: boolean
}

export interface ResolvedTokenState {
  values: Record<string, string>
  missing: MissingTokenSpec[]
}

export interface TokenProviderSpec {
  name: string
  dependsOn?: string[]
  interactive?: boolean
  resolve: (ctx: TokenContext) => Promise<string | undefined> | string | undefined
}
```

- [ ] **Step 4: Implement `resolveTokenState()` and keep `resolveTokens()` as a wrapper**

```ts
export interface ResolveTokensArgs {
  pattern: string
  providers: TokenProviderSpec[]
  ctx: TokenContext
  deps: PumpDeps
  allowInteractiveMissing?: boolean
}

export async function resolveTokenState(args: ResolveTokensArgs): Promise<ResolvedTokenState> {
  const { pattern, providers, ctx: baseCtx, deps } = args
  const refs = scanPattern(pattern)
  const required = new Set<string>(baseCtx.typeConfig.requiredTokens ?? [])
  const needed = new Map<string, boolean>()

  for (const r of refs)
    needed.set(r.name, r.optional && !required.has(r.name))
  for (const name of required) {
    if (!needed.has(name))
      needed.set(name, false)
  }

  const providerByName = new Map(providers.map(p => [p.name, p]))
  const ordered = topoSort(providers)
  const ctx = attachDeps({ ...baseCtx, tokens: { ...baseCtx.tokens } }, deps)

  for (const p of ordered) {
    if (!needed.has(p.name) && !anyDependent(p.name, needed, providers))
      continue
    const value = await p.resolve(ctx)
    if (value !== undefined && value !== '')
      ctx.tokens[p.name] = String(value)
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
          ? `Token "${name}" is interactive, but prompting is unavailable in non-interactive mode`
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
```

- [ ] **Step 5: Mark built-in `desc` as interactive**

```ts
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
```

- [ ] **Step 6: Run the resolver tests to verify they pass**

Run: `pnpm vitest run tests/unit/token-providers.test.ts`

Expected: PASS for the new `resolveTokenState` coverage and existing built-in provider assertions.

- [ ] **Step 7: Commit the resolver metadata slice**

```bash
git add src/type/token-provider.ts src/utils/token-providers.ts tests/unit/token-providers.test.ts
git commit -m "feat: add interactive token resolution metadata"
```

## Task 2: Generalize Preview Rendering To Multi-Token State

**Files:**
- Modify: `src/branch-pump.ts`
- Create: `tests/unit/branch-pump-preview.test.ts`

- [ ] **Step 1: Write preview tests for missing tokens and patch rendering**

```ts
import { describe, expect, it } from 'vitest'
import { previewBranchName } from '../../src/branch-pump'

it('returns missing interactive tokens in pattern order', async () => {
  const preview = await previewBranchName('style', {
    config: mockConfig({
      types: {
        style: { pattern: 'style({module})/{username}-{desc?}' },
      },
      tokenProviders: [
        { name: 'module', interactive: true, resolve: () => undefined },
      ],
    }),
  }, mockDeps({ gitUser: 'Alice Bob' }))

  expect(preview.missing).toEqual([
    { name: 'module', optional: false, interactive: true },
    { name: 'desc', optional: true, interactive: true },
  ])
})

it('renderWith applies token patches without re-running IO', async () => {
  const preview = await previewBranchName('style', {
    config: mockConfig({
      types: {
        style: { pattern: 'style({module})/{username}-{desc?}' },
      },
      tokenProviders: [
        { name: 'module', interactive: true, resolve: () => undefined },
      ],
    }),
  }, mockDeps({ gitUser: 'Alice Bob' }))

  expect(preview.renderWith({ module: 'layout' })).toBe('style(layout)/alice-bob')
  expect(preview.renderWith({ module: 'layout', desc: 'sidebar-fix' })).toBe(
    'style(layout)/alice-bob-sidebar-fix',
  )
})

it('keeps legacy desc append behavior when pattern omits {desc}', async () => {
  const preview = await previewBranchName('release', {
    config: mockConfig({
      types: {
        release: { pattern: 'release/{version}-{date}' },
      },
    }),
  }, mockDeps({ manifestVersion: '1.2.3', now: new Date(2026, 3, 22) }))

  expect(preview.renderWith({ desc: 'rc1' })).toBe('release/1.2.3-20260422-rc1')
})
```

- [ ] **Step 2: Run the preview tests to verify they fail**

Run: `pnpm vitest run tests/unit/branch-pump-preview.test.ts`

Expected: FAIL because `PreviewBranchResult` has no `missing` field and `renderWith()` still only accepts a desc string.

- [ ] **Step 3: Add a shared render helper in `src/branch-pump.ts`**

```ts
function renderResolvedBranchName(
  pattern: string,
  baseTokens: Record<string, string>,
  patch: Record<string, string | undefined> = {},
): string {
  const merged = { ...baseTokens, ...patch }
  const rendered = renderBranchName(pattern, merged)
  const desc = merged.desc?.trim()

  if (desc && !DESC_TOKEN_RE.test(pattern))
    return `${rendered}-${slugifyBranchToken(desc)}`

  return rendered
}
```

- [ ] **Step 4: Update `previewBranchName()` to use token-state metadata**

```ts
export interface PreviewBranchResult {
  type: string
  pattern: string
  branchName: string
  tokens: Record<string, string>
  missing: MissingTokenSpec[]
  renderWith: (patch: Record<string, string | undefined>) => string
}

export async function previewBranchName(
  type: string,
  runtime: PumpRuntimeOptions = {},
  deps: PumpDeps = defaultDeps(),
): Promise<PreviewBranchResult> {
  const baseRuntime: PumpRuntimeOptions = { ...runtime, desc: undefined }
  const { config, typeConfig, tokenState } = await resolveAndRenderPreview(type, baseRuntime, deps)

  const renderWith = (patch: Record<string, string | undefined> = {}) =>
    renderResolvedBranchName(typeConfig.pattern, tokenState.values, normalizePreviewPatch(patch))

  let branchName = renderWith(runtime.desc ? { desc: runtime.desc } : {})
  const hook = runtime.customBranchName ?? typeConfig.customBranchName ?? config.customBranchName
  if (hook) {
    const override = await hook({
      type,
      pattern: typeConfig.pattern,
      tokens: { ...tokenState.values, ...(runtime.desc ? { desc: slugifyBranchToken(runtime.desc) } : {}) },
      typeConfig,
    })
    if (typeof override === 'string' && override.trim())
      branchName = override.trim()
  }

  return {
    type,
    pattern: typeConfig.pattern,
    branchName,
    tokens: tokenState.values,
    missing: tokenState.missing,
    renderWith,
  }
}
```

- [ ] **Step 5: Update final branch rendering to reuse the same helper**

```ts
const tokenState = await resolveTokenState({
  pattern: typeConfig.pattern,
  providers: config.tokenProviders,
  ctx: { cwd, type, globals: config.globals, typeConfig, runtime, tokens: {} },
  deps,
  allowInteractiveMissing: false,
})
const sluggedTokens = slugValues(tokenState.values)
let branchName = renderResolvedBranchName(typeConfig.pattern, sluggedTokens, runtime.desc ? { desc: runtime.desc } : {})
```

- [ ] **Step 6: Run the preview tests and nearby branch tests**

Run: `pnpm vitest run tests/unit/branch-pump-preview.test.ts tests/unit/branch-template.test.ts`

Expected: PASS, including the desc-append compatibility case.

- [ ] **Step 7: Commit the preview refactor**

```bash
git add src/branch-pump.ts tests/unit/branch-pump-preview.test.ts
git commit -m "refactor: generalize branch preview for interactive tokens"
```

## Task 3: Replace `{desc}`-Only Prompting With Generic CLI Interactive Completion

**Files:**
- Create: `src/cli/prompt-interactive-tokens.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/unit/prompt-interactive-tokens.test.ts`

- [ ] **Step 1: Write CLI prompt-flow tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { promptInteractiveTokens } from '../../src/cli/prompt-interactive-tokens'

it('prompts missing interactive tokens in pattern order', async () => {
  const textWithPreview = vi.fn()
    .mockResolvedValueOnce('layout')
    .mockResolvedValueOnce('sidebar-fix')

  const runtime = await promptInteractiveTokens({
    type: 'style',
    pattern: 'style({module})/{username}-{desc?}',
    preview: {
      tokens: { username: 'alice-bob' },
      missing: [
        { name: 'module', optional: false, interactive: true },
        { name: 'desc', optional: true, interactive: true },
      ],
      renderWith: patch => renderFake(patch),
    },
    runtime: {},
    deps: { prompt: { textWithPreview, text: vi.fn(), confirm: vi.fn(), select: vi.fn(), editText: vi.fn() } } as any,
    isInteractive: true,
  })

  expect(textWithPreview).toHaveBeenNthCalledWith(1, expect.objectContaining({
    message: 'Module (fills {module}):',
  }))
  expect(textWithPreview).toHaveBeenNthCalledWith(2, expect.objectContaining({
    message: 'Description (fills {desc}):',
  }))
  expect(runtime).toMatchObject({ interactiveTokens: { module: 'layout', desc: 'sidebar-fix' } })
})

it('skips prompting entirely in non-interactive mode', async () => {
  const runtime = await promptInteractiveTokens({
    type: 'style',
    pattern: 'style({module})/{username}-{desc?}',
    preview: {
      tokens: { username: 'alice-bob' },
      missing: [{ name: 'module', optional: false, interactive: true }],
      renderWith: patch => renderFake(patch),
    },
    runtime: { yes: true },
    deps: fakeDeps(),
    isInteractive: false,
  })
  expect(runtime).toEqual({ yes: true })
})

it('preserves legacy runtime.desc when users passed --desc explicitly', async () => {
  const runtime = await promptInteractiveTokens({
    type: 'feature',
    pattern: 'feature/{username}-{desc?}-{date}',
    preview: {
      tokens: { username: 'alice-bob', date: '20260422' },
      missing: [{ name: 'desc', optional: true, interactive: true }],
      renderWith: patch => renderFake(patch),
    },
    runtime: { desc: 'login' },
    deps: fakeDeps(),
    isInteractive: true,
  })
  expect(runtime.desc).toBe('login')
})
```

- [ ] **Step 2: Run the CLI prompt tests to verify they fail**

Run: `pnpm vitest run tests/unit/prompt-interactive-tokens.test.ts`

Expected: FAIL because `promptInteractiveTokens()` does not exist.

- [ ] **Step 3: Create `src/cli/prompt-interactive-tokens.ts`**

```ts
import type { PreviewBranchResult } from '../branch-pump'
import type { PumpDeps } from '../type/pump-deps'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import { PumppError } from '../errors'

export async function promptInteractiveTokens(args: {
  type: string
  pattern: string
  preview: PreviewBranchResult
  runtime: PumpRuntimeOptions
  deps: PumpDeps
  isInteractive: boolean
}): Promise<PumpRuntimeOptions> {
  const { preview, runtime, deps, isInteractive } = args
  if (!isInteractive || runtime.yes)
    return runtime

  const values: Record<string, string> = {}
  for (const item of preview.missing) {
    if (!item.interactive)
      continue
    if (item.name === 'desc' && runtime.desc)
      continue

    const promptValue = await askOneToken(item.name, preview, values, deps)
    if (promptValue === undefined)
      throw new PumppError('aborted by user', { code: 'ABORTED_BY_USER' })
    if (promptValue)
      values[item.name] = promptValue.trim()
  }

  return {
    ...runtime,
    ...(values.desc ? { desc: values.desc } : {}),
    interactiveTokens: values,
  }
}
```

- [ ] **Step 4: Update `src/cli/index.ts` to use the new helper**

```ts
import { promptInteractiveTokens } from './prompt-interactive-tokens'

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
```

- [ ] **Step 5: Extend runtime typing only if needed**

```ts
export interface PumpRuntimeOptions {
  cwd?: string
  config?: ResolvedPumpConfig
  configFile?: string
  base?: string
  date?: string
  desc?: string
  interactiveTokens?: Record<string, string>
  yes?: boolean
  dryRun?: boolean
  push?: boolean
  checkout?: boolean
  fetch?: boolean
  gitCheck?: boolean
  remote?: string
  file?: string
  versionKey?: string
  customBranchName?: (ctx: NameContext) => string | Promise<string | void> | void
  progress?: (p: PumpBranchProgress) => void
}
```

- [ ] **Step 6: Merge generic interactive tokens into resolver context**

```ts
const ctx = attachDeps({
  ...baseCtx,
  tokens: {
    ...baseCtx.tokens,
    ...(baseCtx.runtime.interactiveTokens ?? {}),
  },
}, deps)
```

- [ ] **Step 7: Run the CLI unit tests**

Run: `pnpm vitest run tests/unit/prompt-interactive-tokens.test.ts tests/unit/branch-pump-preview.test.ts`

Expected: PASS for prompt order, `--yes` skip, and explicit `--desc` compatibility.

- [ ] **Step 8: Commit the generic prompt flow**

```bash
git add src/cli/index.ts src/cli/prompt-interactive-tokens.ts src/type/pump-runtime-options.ts src/utils/token-providers.ts tests/unit/prompt-interactive-tokens.test.ts
git commit -m "feat: prompt interactive custom tokens in the CLI"
```

## Task 4: Add End-To-End Regression Coverage

**Files:**
- Modify: `tests/e2e/cli.test.ts`

- [ ] **Step 1: Add a non-interactive custom-token regression**

```ts
it('custom interactive token unresolved in non-interactive mode exits with UNRESOLVED_TOKEN', () => {
  writeFileSync(path.join(dir, 'pumpp.config.ts'), `
    import { definePumpConfig } from '${repoRoot.replace(/\\/g, '/')}'
    export default definePumpConfig({
      types: {
        style: { pattern: 'style({module})/{username}-{desc?}' },
      },
      tokenProviders: [
        {
          name: 'module',
          interactive: true,
          resolve: () => process.env.BRANCH_MODULE,
        },
      ],
    })
  `)

  const r = pumpp(dir, 'style', '-y', '--no-push')
  expect(r.status).toBe(1)
  expect(r.stderr).toMatch(/module/)
  expect(r.stderr).toMatch(/interactive|TTY|explicitly/i)
})
```

- [ ] **Step 2: Keep the existing `--desc` happy-path regression adjacent to the new test**

```ts
it('feature --desc login creates branch without pushing', () => {
  const r = pumpp(dir, 'feature', '--desc', 'login', '-y', '--no-push')
  expect(r.status).toBe(0)
  const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
  expect(branch).toMatch(/feature\/alice-login-\d{8}/)
})
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm vitest run tests/e2e/cli.test.ts`

Expected: PASS for the new non-interactive error and the existing desc regression.

- [ ] **Step 4: Commit the regression tests**

```bash
git add tests/e2e/cli.test.ts
git commit -m "test: cover interactive custom token CLI behavior"
```

## Task 5: Update README And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an interactive custom-token example to README**

```md
## 自定义 token

如果你想把工单号、模块名、环境名等信息放进分支名，可以添加自定义 token provider：

```ts
export default definePumpConfig({
  types: {
    style: { pattern: 'style({module})/{username}-{desc?}' },
  },
  tokenProviders: [
    {
      name: 'module',
      interactive: true,
      resolve: () => process.env.BRANCH_MODULE,
    },
  ],
})
```

当 `resolve()` 没有返回值时，CLI 会在交互模式下提示输入 `module`；在非交互模式下，必需 token 仍会报错。
```

- [ ] **Step 2: Run targeted verification**

Run: `pnpm vitest run tests/unit/token-providers.test.ts tests/unit/branch-pump-preview.test.ts tests/unit/prompt-interactive-tokens.test.ts tests/e2e/cli.test.ts`

Expected: PASS across resolver, preview, CLI prompt, and e2e regressions.

- [ ] **Step 3: Run repo-level checks**

Run: `pnpm run test`

Expected: PASS for the full Vitest suite with no regressions in existing branch behavior.

- [ ] **Step 4: Commit docs and final verification changes**

```bash
git add README.md
git commit -m "docs: document interactive custom token providers"
```

## Self-Review Notes

### Spec Coverage

- `tokenProvider.interactive` is implemented in Task 1
- Multi-token preview and missing-token metadata are implemented in Task 2
- CLI prompting order, `--yes`, and non-interactive behavior are implemented in Task 3
- Error-path regression and desc compatibility are locked in by Task 4
- README update is covered in Task 5

### Placeholder Scan

- No `TODO` or `TBD` placeholders remain
- Every test step includes an actual test body
- Every implementation step includes concrete code snippets or signatures
- Every verification step includes exact commands and expected outcomes

### Type Consistency

- Shared names used throughout the plan:
  - `interactive?: boolean`
  - `MissingTokenSpec`
  - `ResolvedTokenState`
  - `resolveTokenState()`
  - `interactiveTokens?: Record<string, string>`
  - `promptInteractiveTokens()`

