# Pumpp 分支管理 CLI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/specs/2026-04-18-pumpp-branch-cli-design.md` 完整重构 pumpp，产出一个「子命令 + 类型注册表 + 占位符模板 + 依赖注入」驱动的通用分支创建 CLI。

**Architecture:** 三层（CLI / 核心 / 配置）。核心 `pumpBranch(type, runtimeOptions?, deps?)` 通过 `PumpDeps` 注入 git / prompts / fs / clock，纯函数式模板引擎 + 延迟 token 解析 + 7 阶段 progress 事件。CLI 通过 c12 加载配置，动态注册子命令（`cac`），错误映射到 `PumppError` → exit code。

**Tech Stack:** Node.js (≥18) + TypeScript + tsdown（构建）+ cac（CLI）+ c12（配置）+ prompts（交互）+ tinyexec（git）+ jsonc-parser + semver + kolorist + vitest（测试）。

**执行前置：** 本计划假定从 spec 已通过的当前仓库状态开始（现有 `src/` 为旧实现，计划要求**整包重写**文件内容，不保留旧 API）。每个 Task 末尾都以一次 commit 收尾，保持主干可中断、可继续。

---

## 0. 约定

- 包管理器：`pnpm`；所有命令用 pnpm 运行。Windows PowerShell 与 macOS/Linux bash 命令文本一致（不用 shell 特有语法）。
- 测试框架：vitest；单测放 `tests/unit/<subject>.test.ts`；E2E 放 `tests/e2e/*.test.ts`。
- 每个 Task 结束后执行一次 `pnpm run lint && pnpm run typecheck && pnpm exec vitest run`（简写 `pnpm check`，将在 Task 1 配置），全部通过再 commit。
- Commit 前缀参考 antfu 风格：`feat:` / `refactor:` / `test:` / `chore:` / `fix:`。

---

## 文件结构（最终目标）

```
src/
  index.ts                      # 库导出
  config.ts                     # pumpConfigDefaults（内置三类型）
  define-config.ts              # definePumpConfig
  load-pump-config.ts           # c12 加载 + 合并 + 归一化
  type-registry.ts              # types 归一化 / defaults reapply / 校验
  branch-pump.ts                # 核心 pumpBranch(type, options, deps?)
  default-deps.ts               # defaultDeps() 装配真实能力
  errors.ts                     # PumppError + 错误码 + toPumppError
  type/
    pump-config.ts              # PumpInputConfig / TypeInputConfig / Resolved*
    pump-runtime-options.ts     # PumpRuntimeOptions / NameContext
    pump-branch-progress.ts     # ProgressEvent + PumpBranchProgress
    pump-branch-results.ts      # PumpBranchResults
    pump-deps.ts                # PumpDeps
    token-provider.ts           # TokenProviderSpec + TokenContext
  utils/
    branch-template.ts          # scanPattern + renderBranchName
    token-providers.ts          # builtins + resolveTokens(topo)
    manifest.ts                 # JSONC 版本读取
    git-ops.ts                  # 真实 git 调用（被 defaultDeps 用）
    slug.ts
    date-token.ts               # 纯函数 formatYmd(date)
    validate-ref.ts             # 用 deps.git.checkRefFormat 做校验
  cli/
    index.ts                    # main 装命令 / 错误分发 / 进度打印
    register-commands.ts        # 按 types 动态生成子命令
    parse-args.ts               # 公共选项定义 + flags → PumpRuntimeOptions
    run.ts                      # tsx 开发入口
    exit-code.ts
    symbols.ts
tests/
  unit/
    slug.test.ts
    date-token.test.ts
    branch-template.test.ts
    manifest.test.ts
    validate-ref.test.ts
    token-providers.test.ts
    type-registry.test.ts
    errors.test.ts
    branch-pump.test.ts
    parse-args.test.ts
  e2e/
    cli.test.ts
bin/pumpp.mjs                   # 已存在，不动
docs/specs/2026-04-18-pumpp-branch-cli-design.md   # spec（不动）
docs/specs/2026-04-18-pumpp-branch-cli-plan.md     # 本文件
```

---

## Task 1: 项目脚手架（vitest + 脚本 + 清旧占位）

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/.gitkeep`

- [ ] **Step 1.1: 安装 vitest**

```bash
pnpm add -D vitest@^3.0.0
```

- [ ] **Step 1.2: 更新 `package.json` scripts**

把 `scripts` 区域替换为（保留其它字段）：

```json
{
  "scripts": {
    "lint": "eslint .",
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "pumpp": "tsx src/cli/run.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "pnpm run lint && pnpm run typecheck && pnpm run test",
    "prepublishOnly": "pnpm run build"
  }
}
```

- [ ] **Step 1.3: 创建最小 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
```

- [ ] **Step 1.4: 给 ESLint 忽略 tests 里的 `no-console`（不需要额外配置，antfu config 对 tests 默认允许；确认无需改动）**

Run: `pnpm run lint`
Expected: 通过（当前 src 仍是旧代码，已能 lint 通过；新文件还没建）

- [ ] **Step 1.5: 创建占位 `tests/.gitkeep`（空文件），并提交**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/.gitkeep
git commit -m "chore: add vitest and check script"
```

---

## Task 2: 错误模块 `src/errors.ts`

spec §5.6。包含错误码常量、`PumppError`、`toPumppError`、`errorCodeToExit` 映射。

**Files:**

- Create: `src/errors.ts`
- Create: `tests/unit/errors.test.ts`
- Modify: `src/cli/exit-code.ts`

- [ ] **Step 2.1: 先写失败测试 `tests/unit/errors.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { NonZeroExitError } from 'tinyexec'
import { errorCodeToExit, PumppError, toPumppError } from '../../src/errors'

describe('PumppError', () => {
  it('carries code, hint and cause', () => {
    const cause = new Error('boom')
    const err = new PumppError('bad', { code: 'INVALID_ARGUMENT', hint: 'try --help', cause })
    expect(err.message).toBe('bad')
    expect(err.code).toBe('INVALID_ARGUMENT')
    expect(err.hint).toBe('try --help')
    expect(err.cause).toBe(cause)
  })
})

describe('errorCodeToExit', () => {
  it('maps user-input errors to 1', () => {
    expect(errorCodeToExit('INVALID_ARGUMENT')).toBe(1)
    expect(errorCodeToExit('UNKNOWN_BRANCH_TYPE')).toBe(1)
    expect(errorCodeToExit('UNRESOLVED_TOKEN')).toBe(1)
    expect(errorCodeToExit('INVALID_BRANCH_NAME')).toBe(1)
    expect(errorCodeToExit('CONFIG_INVALID')).toBe(1)
  })
  it('maps operational errors to 2', () => {
    expect(errorCodeToExit('NOT_A_GIT_REPO')).toBe(2)
    expect(errorCodeToExit('DIRTY_WORKING_TREE')).toBe(2)
    expect(errorCodeToExit('BASE_BRANCH_MISSING')).toBe(2)
    expect(errorCodeToExit('BRANCH_ALREADY_EXISTS')).toBe(2)
    expect(errorCodeToExit('GIT_COMMAND_FAILED')).toBe(2)
    expect(errorCodeToExit('UNKNOWN')).toBe(2)
  })
  it('maps aborted to 0', () => {
    expect(errorCodeToExit('ABORTED_BY_USER')).toBe(0)
  })
})

describe('toPumppError', () => {
  it('passes through PumppError', () => {
    const e = new PumppError('x', { code: 'CONFIG_INVALID' })
    expect(toPumppError(e)).toBe(e)
  })
  it('wraps tinyexec NonZeroExitError', () => {
    const nz = Object.assign(new NonZeroExitError({} as any, { stdout: '', stderr: 'fatal: bad\n' } as any), {})
    const e = toPumppError(nz)
    expect(e.code).toBe('GIT_COMMAND_FAILED')
    expect(e.hint).toMatch(/fatal: bad/)
    expect(e.cause).toBe(nz)
  })
  it('recognises SIGINT-style abort', () => {
    const e = toPumppError(new Error('User force closed the prompt with 0 null'))
    expect(e.code).toBe('ABORTED_BY_USER')
  })
  it('wraps unknown errors', () => {
    const e = toPumppError(new Error('random'))
    expect(e.code).toBe('UNKNOWN')
  })
})
```

- [ ] **Step 2.2: 运行，确认失败**

Run: `pnpm exec vitest run tests/unit/errors.test.ts`
Expected: FAIL（`Cannot find module '../../src/errors'`）

- [ ] **Step 2.3: 写实现 `src/errors.ts`**

```ts
import { NonZeroExitError } from 'tinyexec'

export type PumppErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNKNOWN_BRANCH_TYPE'
  | 'CONFIG_INVALID'
  | 'UNRESOLVED_TOKEN'
  | 'INVALID_BRANCH_NAME'
  | 'NOT_A_GIT_REPO'
  | 'DIRTY_WORKING_TREE'
  | 'BASE_BRANCH_MISSING'
  | 'BRANCH_ALREADY_EXISTS'
  | 'GIT_COMMAND_FAILED'
  | 'ABORTED_BY_USER'
  | 'UNKNOWN'

export interface PumppErrorInit {
  code: PumppErrorCode
  hint?: string
  cause?: unknown
}

export class PumppError extends Error {
  code: PumppErrorCode
  hint?: string
  override cause?: unknown
  constructor(message: string, init: PumppErrorInit) {
    super(message)
    this.name = 'PumppError'
    this.code = init.code
    this.hint = init.hint
    this.cause = init.cause
  }
}

export function errorCodeToExit(code: PumppErrorCode): 0 | 1 | 2 {
  switch (code) {
    case 'ABORTED_BY_USER':
      return 0
    case 'INVALID_ARGUMENT':
    case 'UNKNOWN_BRANCH_TYPE':
    case 'CONFIG_INVALID':
    case 'UNRESOLVED_TOKEN':
    case 'INVALID_BRANCH_NAME':
      return 1
    default:
      return 2
  }
}

function isAbortMessage(msg: string): boolean {
  return /force closed the prompt|aborted|sigint/i.test(msg)
}

export function toPumppError(e: unknown): PumppError {
  if (e instanceof PumppError)
    return e

  if (e instanceof NonZeroExitError) {
    const stderr = (e as unknown as { output?: { stderr?: string } }).output?.stderr ?? ''
    const hint = stderr.split('\n').map(s => s.trim()).find(Boolean)
    return new PumppError('git command failed', {
      code: 'GIT_COMMAND_FAILED',
      hint,
      cause: e,
    })
  }

  if (e instanceof Error && isAbortMessage(e.message)) {
    return new PumppError('aborted', { code: 'ABORTED_BY_USER', cause: e })
  }

  const message = e instanceof Error ? e.message : String(e)
  return new PumppError(message || 'unknown error', { code: 'UNKNOWN', cause: e })
}
```

- [ ] **Step 2.4: 更新 `src/cli/exit-code.ts` 对齐 spec**

```ts
export const enum ExitCode {
  Success = 0,
  InvalidArgument = 1,
  OperationalError = 2,
}
```

- [ ] **Step 2.5: 运行测试 & 类型检查，通过后 commit**

Run: `pnpm exec vitest run tests/unit/errors.test.ts && pnpm run typecheck`
Expected: PASS

```bash
git add src/errors.ts src/cli/exit-code.ts tests/unit/errors.test.ts
git commit -m "feat(errors): add PumppError, error codes, exit mapping"
```

---

## Task 3: 共享类型定义 `src/type/*`

把 spec §5.2 / §5.4 / §5.5 / §5.7 的所有类型落盘。纯类型不跑运行时测试；用 `tsc --noEmit` 保证正确。

**Files:**

- Create: `src/type/pump-config.ts`
- Create: `src/type/pump-runtime-options.ts`
- Create: `src/type/pump-branch-progress.ts`
- Create: `src/type/pump-branch-results.ts`
- Create: `src/type/pump-deps.ts`
- Create: `src/type/token-provider.ts`
- Delete (later, after all refs removed): `src/type/branch-pump-options.ts`、`src/type/branch-pump-progress.ts`、`src/type/branch-pump-results.ts`、`src/type/release-type.ts`

注：本 Task 只**新增**类型文件；旧文件在 Task 18 统一清理（因为 CLI / 核心层还在引用，清理时机要晚）。

- [ ] **Step 3.1: `src/type/pump-config.ts`**

```ts
import type { TokenProviderSpec } from './token-provider'

export interface ManifestOptions {
  file?: string
  versionKey?: string
}

export interface TypeInputConfig {
  pattern: string
  base?: string
  push?: boolean
  checkout?: boolean
  confirm?: boolean
  gitCheck?: boolean
  fetch?: boolean
  requiredTokens?: string[]
  description?: string
}

export interface PumpInputConfig {
  base?: string
  push?: boolean
  checkout?: boolean
  confirm?: boolean
  gitCheck?: boolean
  fetch?: boolean
  remote?: string
  manifest?: ManifestOptions
  types?: Record<string, TypeInputConfig>
  tokenProviders?: TokenProviderSpec[]
}

export interface ResolvedGlobals {
  base: string
  push: boolean
  checkout: boolean
  confirm: boolean
  gitCheck: boolean
  fetch: boolean
  remote: string
  manifest: Required<ManifestOptions>
}

export interface ResolvedTypeConfig {
  name: string
  pattern: string
  base: string
  push: boolean
  checkout: boolean
  confirm: boolean
  gitCheck: boolean
  fetch: boolean
  requiredTokens: string[]
  description?: string
}

export interface ResolvedPumpConfig {
  globals: ResolvedGlobals
  types: Record<string, ResolvedTypeConfig>
  tokenProviders: TokenProviderSpec[]
}
```

- [ ] **Step 3.2: `src/type/pump-runtime-options.ts`**

```ts
import type { ResolvedPumpConfig, ResolvedTypeConfig } from './pump-config'
import type { PumpBranchProgress } from './pump-branch-progress'

export interface NameContext {
  type: string
  pattern: string
  tokens: Record<string, string>
  typeConfig: ResolvedTypeConfig
}

export interface PumpRuntimeOptions {
  cwd?: string
  config?: ResolvedPumpConfig
  configFile?: string

  base?: string
  date?: string
  desc?: string
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

- [ ] **Step 3.3: `src/type/pump-branch-progress.ts` + `src/type/pump-branch-results.ts`**

```ts
// pump-branch-progress.ts
export const enum ProgressEvent {
  ConfigLoaded = 'config-loaded',
  TokensResolved = 'tokens-resolved',
  NameResolved = 'name-resolved',
  GitPreflight = 'git-preflight',
  Confirmed = 'confirmed',
  GitBranchCreated = 'git-branch-created',
  GitPushed = 'git-pushed',
}

export interface PumpBranchProgress {
  event: ProgressEvent
  type: string
  base: string
  branchName: string
  dryRun: boolean
}
```

```ts
// pump-branch-results.ts
export interface PumpBranchResults {
  type: string
  base: string
  branchName: string
  dryRun: boolean
  tokens: Record<string, string>
  date: string
  username: string
  version?: string
  desc?: string
}
```

- [ ] **Step 3.4: `src/type/pump-deps.ts` + `src/type/token-provider.ts`**

```ts
// token-provider.ts
import type { PumpRuntimeOptions } from './pump-runtime-options'
import type { ResolvedGlobals, ResolvedTypeConfig } from './pump-config'

export interface TokenContext {
  cwd: string
  type: string
  globals: ResolvedGlobals
  typeConfig: ResolvedTypeConfig
  runtime: PumpRuntimeOptions
  tokens: Record<string, string>
}

export interface TokenProviderSpec {
  name: string
  dependsOn?: string[]
  resolve: (ctx: TokenContext) => Promise<string | undefined> | string | undefined
}
```

```ts
// pump-deps.ts
export interface PromptDeps {
  confirm: (msg: string) => Promise<boolean>
  select: <T>(msg: string, choices: { title: string, value: T, description?: string }[]) => Promise<T>
  text: (msg: string) => Promise<string>
}

export interface GitDeps {
  assertRepo: (cwd: string) => Promise<void>
  status: (cwd: string) => Promise<string>
  currentBranch: (cwd: string) => Promise<string>
  revParseVerify: (cwd: string, ref: string) => Promise<boolean>
  lsRemoteHead: (cwd: string, remote: string, branch: string) => Promise<boolean>
  fetch: (cwd: string, remote: string) => Promise<void>
  createBranch: (cwd: string, name: string, base: string, checkout: boolean) => Promise<void>
  push: (cwd: string, remote: string, name: string) => Promise<void>
  checkRefFormat: (name: string) => Promise<void>
  configGet: (cwd: string, key: string) => Promise<string | undefined>
}

export interface PumpDeps {
  git: GitDeps
  now: () => Date
  readManifest: (cwd: string, file: string, key: string) => string
  prompt: PromptDeps
}
```

- [ ] **Step 3.5: typecheck 并 commit**

Run: `pnpm run typecheck`
Expected: PASS（旧实现还没被删，这些新文件只是新增）

```bash
git add src/type/pump-config.ts src/type/pump-runtime-options.ts src/type/pump-branch-progress.ts src/type/pump-branch-results.ts src/type/pump-deps.ts src/type/token-provider.ts
git commit -m "feat(types): add new config / runtime / deps / progress types"
```

---

## Task 4: slug util + 测试

保留既有逻辑，补测试。

**Files:**

- Modify: `src/utils/slug.ts`（微调：导出 fallback 参数）
- Create: `tests/unit/slug.test.ts`

- [ ] **Step 4.1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { slugifyBranchToken } from '../../src/utils/slug'

describe('slugifyBranchToken', () => {
  it('lowercases, replaces spaces with dashes', () => {
    expect(slugifyBranchToken('Alice Bob')).toBe('alice-bob')
  })
  it('strips invalid chars', () => {
    expect(slugifyBranchToken('张 三! v2')).toBe('v2')
  })
  it('collapses repeated dashes', () => {
    expect(slugifyBranchToken('a   b---c')).toBe('a-b-c')
  })
  it('trims leading/trailing dashes', () => {
    expect(slugifyBranchToken('  -foo- ')).toBe('foo')
  })
  it('falls back when fully stripped', () => {
    expect(slugifyBranchToken('!!!', 'fallback')).toBe('fallback')
  })
  it('default fallback is "user"', () => {
    expect(slugifyBranchToken('')).toBe('user')
  })
})
```

- [ ] **Step 4.2: 跑测试确认失败（fallback 参数不存在）**

Run: `pnpm exec vitest run tests/unit/slug.test.ts`
Expected: FAIL（fallback 分支）

- [ ] **Step 4.3: 更新实现**

```ts
const INVALID = /[^\w.-]+/g

export function slugifyBranchToken(input: string, fallback = 'user'): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(INVALID, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return s || fallback
}
```

- [ ] **Step 4.4: 跑测试通过**

Run: `pnpm exec vitest run tests/unit/slug.test.ts`
Expected: PASS

- [ ] **Step 4.5: commit**

```bash
git add src/utils/slug.ts tests/unit/slug.test.ts
git commit -m "refactor(slug): add fallback argument, cover with tests"
```

---

## Task 5: date-token util → 纯函数

spec: `date` 默认取创建当天；支持 `--date` 覆盖；`year/month/day` 从 `date` 切。做一个纯 `formatYmd(date)` + `splitYmd(ymd)`。

**Files:**

- Modify: `src/utils/date-token.ts`
- Create: `tests/unit/date-token.test.ts`

- [ ] **Step 5.1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { formatYmd, splitYmd } from '../../src/utils/date-token'

describe('formatYmd', () => {
  it('pads month / day', () => {
    expect(formatYmd(new Date(2026, 0, 3))).toBe('20260103')
  })
  it('handles double-digit', () => {
    expect(formatYmd(new Date(2026, 11, 31))).toBe('20261231')
  })
})

describe('splitYmd', () => {
  it('parses YYYYMMDD', () => {
    expect(splitYmd('20260103')).toEqual({ year: '2026', month: '01', day: '03' })
  })
  it('throws on invalid length', () => {
    expect(() => splitYmd('2026013')).toThrow()
  })
  it('throws on non-digit', () => {
    expect(() => splitYmd('2026abcd')).toThrow()
  })
})
```

- [ ] **Step 5.2: FAIL first**

Run: `pnpm exec vitest run tests/unit/date-token.test.ts`
Expected: FAIL

- [ ] **Step 5.3: 实现**

```ts
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

export function splitYmd(ymd: string): { year: string, month: string, day: string } {
  if (!/^\d{8}$/.test(ymd))
    throw new Error(`Invalid date token "${ymd}" (expected YYYYMMDD)`)
  return {
    year: ymd.slice(0, 4),
    month: ymd.slice(4, 6),
    day: ymd.slice(6, 8),
  }
}
```

- [ ] **Step 5.4: PASS**

Run: `pnpm exec vitest run tests/unit/date-token.test.ts`
Expected: PASS

- [ ] **Step 5.5: commit**

```bash
git add src/utils/date-token.ts tests/unit/date-token.test.ts
git commit -m "refactor(date-token): pure formatYmd/splitYmd with tests"
```

---

## Task 6: 模板引擎 `src/utils/branch-template.ts`

语法：`{name}` 必需、`{name?}` 可选。可选缺失时清理相邻分隔符（`-`、`_`、`/`、`.`）。

**Files:**

- Modify: `src/utils/branch-template.ts`
- Create: `tests/unit/branch-template.test.ts`

- [ ] **Step 6.1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { renderBranchName, scanPattern } from '../../src/utils/branch-template'

describe('scanPattern', () => {
  it('returns required and optional token names', () => {
    expect(scanPattern('release/{version}-{date}-{desc?}')).toEqual([
      { name: 'version', optional: false },
      { name: 'date', optional: false },
      { name: 'desc', optional: true },
    ])
  })
  it('handles duplicates (deduplicated, keeps strictest requirement)', () => {
    expect(scanPattern('{x}-{x?}')).toEqual([{ name: 'x', optional: false }])
  })
})

describe('renderBranchName', () => {
  it('substitutes provided tokens', () => {
    expect(renderBranchName('release/{version}-{date}', {
      version: '1.2.3',
      date: '20260418',
    })).toBe('release/1.2.3-20260418')
  })
  it('leaves unknown required token untouched (caller asserts earlier)', () => {
    expect(renderBranchName('release/{version}', {})).toBe('release/{version}')
  })
  it('drops optional token with neighbouring separator', () => {
    expect(renderBranchName('feature/{username}-{date}-{desc?}', {
      username: 'alice',
      date: '20260418',
    })).toBe('feature/alice-20260418')
  })
  it('drops optional token in middle cleanly', () => {
    expect(renderBranchName('a/{x?}-{y}', { y: 'z' })).toBe('a/z')
  })
  it('drops leading optional token', () => {
    expect(renderBranchName('{pre?}/release/{date}', { date: '20260418' })).toBe('release/20260418')
  })
  it('collapses duplicated dashes after drop', () => {
    expect(renderBranchName('a-{x?}-b', {})).toBe('a-b')
  })
})
```

- [ ] **Step 6.2: FAIL**

Run: `pnpm exec vitest run tests/unit/branch-template.test.ts`
Expected: FAIL

- [ ] **Step 6.3: 实现**

```ts
const TOKEN_RE = /\{([a-zA-Z_][\w-]*)(\?)?\}/g
const SEPARATORS = '-_/.'

export interface TokenRef {
  name: string
  optional: boolean
}

export function scanPattern(pattern: string): TokenRef[] {
  const map = new Map<string, TokenRef>()
  for (const match of pattern.matchAll(TOKEN_RE)) {
    const name = match[1]
    const optional = match[2] === '?'
    const prev = map.get(name)
    if (!prev) {
      map.set(name, { name, optional })
    }
    else if (prev.optional && !optional) {
      prev.optional = false
    }
  }
  return Array.from(map.values())
}

function isSep(ch: string): boolean {
  return SEPARATORS.includes(ch)
}

export function renderBranchName(
  pattern: string,
  values: Record<string, string | undefined>,
): string {
  let out = ''
  let i = 0
  while (i < pattern.length) {
    TOKEN_RE.lastIndex = i
    const m = TOKEN_RE.exec(pattern)
    if (!m || m.index !== i) {
      out += pattern[i]
      i += 1
      continue
    }
    const [whole, name, q] = m
    const optional = q === '?'
    const v = values[name]

    if (v !== undefined && v !== '') {
      out += v
    }
    else if (!optional) {
      out += whole
    }
    else {
      const prevCh = out[out.length - 1]
      const nextCh = pattern[i + whole.length]
      if (prevCh && isSep(prevCh) && (!nextCh || isSep(nextCh))) {
        out = out.slice(0, -1)
      }
      else if (prevCh && nextCh && isSep(nextCh) && !isSep(prevCh)) {
        i += 1
      }
    }
    i += whole.length
  }

  out = out.replace(/([-_])\1+/g, '$1')
  out = out.replace(/^[-_/.]+|[-_/.]+$/g, '')
  out = out.replace(/\/{2,}/g, '/')
  return out
}
```

- [ ] **Step 6.4: PASS**

Run: `pnpm exec vitest run tests/unit/branch-template.test.ts`
Expected: PASS；若边界用例（例如连续分隔折叠）没过，据实微调清理顺序（实现中已留 `replace` 折叠阶段）。

- [ ] **Step 6.5: commit**

```bash
git add src/utils/branch-template.ts tests/unit/branch-template.test.ts
git commit -m "feat(template): scan/render with optional-token separator cleanup"
```

---

## Task 7: manifest 读取

保留既有实现，迁移测试。

**Files:**

- Modify: `src/utils/manifest.ts`（无改动或轻改）
- Create: `tests/unit/manifest.test.ts`

- [ ] **Step 7.1: 写测试**

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readManifestVersion } from '../../src/utils/manifest'

describe('readManifestVersion', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pumpp-manifest-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads package.json version', () => {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    expect(readManifestVersion(dir, 'package.json', 'version')).toBe('1.2.3')
  })
  it('supports jsonc', () => {
    writeFileSync(path.join(dir, 'pkg.json'), `{\n  // comment\n  "v": "0.1.0"\n}`)
    expect(readManifestVersion(dir, 'pkg.json', 'v')).toBe('0.1.0')
  })
  it('throws when key missing', () => {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({}))
    expect(() => readManifestVersion(dir, 'package.json', 'version')).toThrow(/Missing or invalid/)
  })
  it('throws when file not found', () => {
    expect(() => readManifestVersion(dir, 'nope.json', 'version')).toThrow(/Could not find/)
  })
})
```

- [ ] **Step 7.2: 运行（多半直接 PASS，因为既有实现基本合规）**

Run: `pnpm exec vitest run tests/unit/manifest.test.ts`
Expected: PASS；若 FAIL 按 spec 错误信息调整 `manifest.ts` 报错文案。

- [ ] **Step 7.3: commit**

```bash
git add src/utils/manifest.ts tests/unit/manifest.test.ts
git commit -m "test(manifest): cover jsonc and missing-key paths"
```

---

## Task 8: `src/utils/validate-ref.ts`

薄包装：调用 `deps.git.checkRefFormat`，失败抛 `PumppError(INVALID_BRANCH_NAME)`，hint 取 stderr。

**Files:**

- Create: `src/utils/validate-ref.ts`
- Create: `tests/unit/validate-ref.test.ts`

- [ ] **Step 8.1: 写测试**

```ts
import { describe, expect, it, vi } from 'vitest'
import { PumppError } from '../../src/errors'
import { validateRef } from '../../src/utils/validate-ref'

function fakeDeps(impl: (name: string) => Promise<void>) {
  return { git: { checkRefFormat: vi.fn(impl) } }
}

describe('validateRef', () => {
  it('resolves when check passes', async () => {
    const deps = fakeDeps(async () => {})
    await expect(validateRef('feature/x', deps as any)).resolves.toBeUndefined()
    expect(deps.git.checkRefFormat).toHaveBeenCalledWith('feature/x')
  })

  it('throws PumppError INVALID_BRANCH_NAME on rejection', async () => {
    const deps = fakeDeps(async () => {
      const err: any = new Error('fatal: bad ref')
      err.output = { stderr: 'fatal: bad ref\n' }
      throw err
    })
    const e = await validateRef('..bad', deps as any).catch(x => x)
    expect(e).toBeInstanceOf(PumppError)
    expect(e.code).toBe('INVALID_BRANCH_NAME')
    expect(e.hint).toMatch(/bad ref/)
  })
})
```

- [ ] **Step 8.2: FAIL**

Run: `pnpm exec vitest run tests/unit/validate-ref.test.ts`
Expected: FAIL

- [ ] **Step 8.3: 实现**

```ts
import type { PumpDeps } from '../type/pump-deps'
import { PumppError } from '../errors'

export async function validateRef(
  name: string,
  deps: Pick<PumpDeps, 'git'>,
): Promise<void> {
  try {
    await deps.git.checkRefFormat(name)
  }
  catch (raw) {
    const stderr = (raw as { output?: { stderr?: string } }).output?.stderr
      ?? (raw instanceof Error ? raw.message : '')
    const hint = stderr.split('\n').map(s => s.trim()).find(Boolean)
    throw new PumppError(`Invalid branch name "${name}"`, {
      code: 'INVALID_BRANCH_NAME',
      hint,
      cause: raw,
    })
  }
}
```

- [ ] **Step 8.4: PASS & commit**

Run: `pnpm exec vitest run tests/unit/validate-ref.test.ts`
Expected: PASS

```bash
git add src/utils/validate-ref.ts tests/unit/validate-ref.test.ts
git commit -m "feat(validate-ref): wrap git check-ref-format with PumppError"
```

---

## Task 9: token providers `src/utils/token-providers.ts`

内置 providers + 拓扑排序 + 按需解析 + `requiredTokens` 校验 + 用户扩展。

**Files:**

- Create: `src/utils/token-providers.ts`
- Create: `tests/unit/token-providers.test.ts`

- [ ] **Step 9.1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { buildBuiltinProviders, resolveTokens } from '../../src/utils/token-providers'
import type { TokenProviderSpec, TokenContext } from '../../src/type/token-provider'

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
    const ctx = ctxBase(); ctx.runtime.date = '20260101'
    const tokens = await resolveTokens({
      pattern: '{date}-{year}-{month}-{day}',
      providers, ctx, deps: makeDeps({}),
    })
    expect(tokens).toMatchObject({ date: '20260101', year: '2026', month: '01', day: '01' })
  })

  it('optional token unresolved stays empty', async () => {
    const providers = buildBuiltinProviders()
    const tokens = await resolveTokens({
      pattern: 'release/{version}-{desc?}',
      providers, ctx: ctxBase(), deps: makeDeps({}),
    })
    expect(tokens.desc).toBeUndefined()
  })

  it('required token unresolved throws UNRESOLVED_TOKEN', async () => {
    const providers = buildBuiltinProviders()
    const ctx = ctxBase()
    await expect(resolveTokens({
      pattern: 'x/{desc}',
      providers, ctx, deps: makeDeps({}),
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
      providers, ctx: ctxBase(), deps: makeDeps({}),
    })
    expect(tokens.tag).toBe('v1.2.3')
  })

  it('requiredTokens enforces presence even when pattern omits them', async () => {
    const providers = buildBuiltinProviders()
    const ctx = ctxBase(); ctx.typeConfig.requiredTokens = ['desc']
    await expect(resolveTokens({
      pattern: 'r/{version}',
      providers, ctx, deps: makeDeps({}),
    })).rejects.toMatchObject({ code: 'UNRESOLVED_TOKEN' })
  })
})
```

- [ ] **Step 9.2: FAIL**

Run: `pnpm exec vitest run tests/unit/token-providers.test.ts`
Expected: FAIL

- [ ] **Step 9.3: 实现**

```ts
import os from 'node:os'
import process from 'node:process'
import { parse as parseSemver } from 'semver'
import type { TokenContext, TokenProviderSpec } from '../type/token-provider'
import type { PumpDeps } from '../type/pump-deps'
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
    { name: 'desc', resolve: ctx => ctx.runtime.desc?.trim() || undefined },
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
}

function topoSort(providers: TokenProviderSpec[]): TokenProviderSpec[] {
  const map = new Map(providers.map(p => [p.name, p]))
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
      if (d) visit(d)
    }
    temp.delete(p.name)
    visited.add(p.name)
    out.push(p)
  }
  for (const p of providers) visit(p)
  return out
}

export async function resolveTokens(args: ResolveTokensArgs): Promise<Record<string, string>> {
  const { pattern, providers, ctx: baseCtx, deps } = args
  const refs = scanPattern(pattern)
  const required = new Set<string>(baseCtx.typeConfig.requiredTokens ?? [])
  const needed = new Map<string, boolean>()
  for (const r of refs) needed.set(r.name, r.optional && !required.has(r.name))
  for (const r of required) if (!needed.has(r)) needed.set(r, false)

  const providerByName = new Map(providers.map(p => [p.name, p]))
  const ordered = topoSort(providers)
  const ctx = attachDeps({ ...baseCtx, tokens: { ...baseCtx.tokens } }, deps)

  for (const p of ordered) {
    if (!needed.has(p.name) && !anyDependent(p.name, needed, providers))
      continue
    const v = await p.resolve(ctx)
    if (v !== undefined && v !== '')
      ctx.tokens[p.name] = String(v)
  }

  for (const [name, optional] of needed) {
    if (ctx.tokens[name] === undefined && !optional) {
      if (!providerByName.has(name)) {
        throw new PumppError(`No provider registered for required token "${name}"`, {
          code: 'UNRESOLVED_TOKEN',
          hint: `Add a tokenProvider named "${name}" or remove {${name}} from the pattern`,
        })
      }
      throw new PumppError(`Failed to resolve required token "${name}"`, { code: 'UNRESOLVED_TOKEN' })
    }
  }

  return ctx.tokens
}

function anyDependent(name: string, needed: Map<string, boolean>, providers: TokenProviderSpec[]): boolean {
  for (const p of providers) {
    if (p.dependsOn?.includes(name) && needed.has(p.name))
      return true
  }
  return false
}
```

- [ ] **Step 9.4: PASS**

Run: `pnpm exec vitest run tests/unit/token-providers.test.ts`
Expected: PASS

- [ ] **Step 9.5: commit**

```bash
git add src/utils/token-providers.ts tests/unit/token-providers.test.ts
git commit -m "feat(tokens): builtin providers with topo-sort and lazy resolve"
```

---

## Task 10: git-ops 真实实现 + `src/default-deps.ts`

把既有 `git-ops.ts` 改写为匹配 `PumpDeps.git` 的 API；新增 `default-deps.ts` 装配。**不测试 git-ops 本身**（真实 git，留给 E2E），只通过 typecheck。

**Files:**

- Modify: `src/utils/git-ops.ts`
- Create: `src/default-deps.ts`

- [ ] **Step 10.1: 重写 `src/utils/git-ops.ts`**

```ts
import { x } from 'tinyexec'
import type { GitDeps } from '../type/pump-deps'

function opts(cwd: string) {
  return { nodeOptions: { cwd }, throwOnError: true } as const
}

async function safeRun(cwd: string, args: string[]): Promise<{ exitCode: number, stdout: string, stderr: string }> {
  const r = await x('git', args, { nodeOptions: { cwd }, throwOnError: false })
  return { exitCode: r.exitCode ?? 0, stdout: r.stdout, stderr: r.stderr }
}

export const realGit: GitDeps = {
  async assertRepo(cwd) {
    const { stdout, exitCode } = await safeRun(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (exitCode !== 0 || stdout.trim() !== 'true')
      throw Object.assign(new Error('not a git repo'), { __pumppHint: 'cwd must be inside a git working tree' })
  },
  async status(cwd) {
    const { stdout } = await x('git', ['status', '--porcelain'], opts(cwd))
    return stdout
  },
  async currentBranch(cwd) {
    const { stdout } = await x('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts(cwd))
    return stdout.trim()
  },
  async revParseVerify(cwd, ref) {
    const { exitCode } = await safeRun(cwd, ['rev-parse', '--verify', '--quiet', ref])
    return exitCode === 0
  },
  async lsRemoteHead(cwd, remote, branch) {
    const { stdout } = await x('git', ['ls-remote', '--heads', remote, branch], opts(cwd))
    return stdout.trim().length > 0
  },
  async fetch(cwd, remote) {
    await x('git', ['fetch', remote, '--prune'], opts(cwd))
  },
  async createBranch(cwd, name, base, checkout) {
    if (checkout)
      await x('git', ['checkout', '-b', name, base], opts(cwd))
    else
      await x('git', ['branch', name, base], opts(cwd))
  },
  async push(cwd, remote, name) {
    await x('git', ['push', '-u', remote, name], opts(cwd))
  },
  async checkRefFormat(name) {
    await x('git', ['check-ref-format', '--branch', name], { throwOnError: true })
  },
  async configGet(cwd, key) {
    const { stdout, exitCode } = await safeRun(cwd, ['config', key])
    return exitCode === 0 ? stdout.trim() || undefined : undefined
  },
}
```

- [ ] **Step 10.2: 创建 `src/default-deps.ts`**

```ts
import process from 'node:process'
import prompts from 'prompts'
import type { PumpDeps, PromptDeps } from './type/pump-deps'
import { realGit } from './utils/git-ops'
import { readManifestVersion } from './utils/manifest'

function buildPrompt(): PromptDeps {
  return {
    async confirm(message) {
      const { value } = await prompts({ type: 'confirm', name: 'value', message, initial: true }, {
        onCancel: () => { throw new Error('User force closed the prompt') },
      })
      return Boolean(value)
    },
    async select(message, choices) {
      const { value } = await prompts({ type: 'select', name: 'value', message, choices }, {
        onCancel: () => { throw new Error('User force closed the prompt') },
      })
      return value
    },
    async text(message) {
      const { value } = await prompts({ type: 'text', name: 'value', message }, {
        onCancel: () => { throw new Error('User force closed the prompt') },
      })
      return String(value ?? '')
    },
  }
}

export function defaultDeps(): PumpDeps {
  return {
    git: realGit,
    now: () => new Date(),
    readManifest: readManifestVersion,
    prompt: buildPrompt(),
  }
}

export { process as _process }
```

- [ ] **Step 10.3: typecheck + commit**

Run: `pnpm run typecheck`
Expected: PASS

```bash
git add src/utils/git-ops.ts src/default-deps.ts
git commit -m "refactor(deps): realGit implementing GitDeps; defaultDeps factory"
```

---

## Task 11: type registry `src/type-registry.ts`

规范化 `types`：把顶层默认回填到每个 type；校验 pattern 存在；合并 key（按 key 整体覆盖，同时顶层默认 reapply）。

**Files:**

- Create: `src/type-registry.ts`
- Create: `tests/unit/type-registry.test.ts`

- [ ] **Step 11.1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { normalizePumpConfig } from '../../src/type-registry'

describe('normalizePumpConfig', () => {
  it('applies global defaults to each type', () => {
    const r = normalizePumpConfig({
      base: 'main',
      push: false,
      types: {
        release: { pattern: 'release/{version}' },
        feature: { pattern: 'feature/{username}', base: 'dev', push: true },
      },
    })
    expect(r.globals.base).toBe('main')
    expect(r.globals.push).toBe(false)
    expect(r.types.release).toMatchObject({ pattern: 'release/{version}', base: 'main', push: false, checkout: true })
    expect(r.types.feature).toMatchObject({ base: 'dev', push: true })
  })

  it('throws CONFIG_INVALID when pattern missing', () => {
    expect(() => normalizePumpConfig({ types: { release: {} as any } })).toThrow(/pattern/)
  })

  it('uses built-in manifest default', () => {
    const r = normalizePumpConfig({ types: { r: { pattern: 'r/{version}' } } })
    expect(r.globals.manifest).toEqual({ file: 'package.json', versionKey: 'version' })
  })

  it('merges manifest override', () => {
    const r = normalizePumpConfig({
      manifest: { file: 'pkg.json' },
      types: { r: { pattern: 'r/{version}' } },
    })
    expect(r.globals.manifest).toEqual({ file: 'pkg.json', versionKey: 'version' })
  })
})
```

- [ ] **Step 11.2: FAIL**

Run: `pnpm exec vitest run tests/unit/type-registry.test.ts`
Expected: FAIL

- [ ] **Step 11.3: 实现**

```ts
import type {
  PumpInputConfig,
  ResolvedGlobals,
  ResolvedPumpConfig,
  ResolvedTypeConfig,
  TypeInputConfig,
} from './type/pump-config'
import type { TokenProviderSpec } from './type/token-provider'
import { PumppError } from './errors'

const GLOBAL_DEFAULTS: ResolvedGlobals = {
  base: 'main',
  push: false,
  checkout: true,
  confirm: true,
  gitCheck: true,
  fetch: false,
  remote: 'origin',
  manifest: { file: 'package.json', versionKey: 'version' },
}

export function normalizePumpConfig(input: PumpInputConfig): ResolvedPumpConfig {
  const globals: ResolvedGlobals = {
    base: input.base ?? GLOBAL_DEFAULTS.base,
    push: input.push ?? GLOBAL_DEFAULTS.push,
    checkout: input.checkout ?? GLOBAL_DEFAULTS.checkout,
    confirm: input.confirm ?? GLOBAL_DEFAULTS.confirm,
    gitCheck: input.gitCheck ?? GLOBAL_DEFAULTS.gitCheck,
    fetch: input.fetch ?? GLOBAL_DEFAULTS.fetch,
    remote: input.remote ?? GLOBAL_DEFAULTS.remote,
    manifest: {
      file: input.manifest?.file ?? GLOBAL_DEFAULTS.manifest.file,
      versionKey: input.manifest?.versionKey ?? GLOBAL_DEFAULTS.manifest.versionKey,
    },
  }

  const rawTypes = input.types ?? {}
  const types: Record<string, ResolvedTypeConfig> = {}
  for (const [name, cfg] of Object.entries(rawTypes)) {
    types[name] = normalizeTypeConfig(name, cfg, globals)
  }

  if (Object.keys(types).length === 0) {
    throw new PumppError('No branch types configured', {
      code: 'CONFIG_INVALID',
      hint: 'Add at least one entry under `types` in your pumpp config',
    })
  }

  return {
    globals,
    types,
    tokenProviders: input.tokenProviders ?? [],
  }
}

function normalizeTypeConfig(
  name: string,
  cfg: TypeInputConfig,
  globals: ResolvedGlobals,
): ResolvedTypeConfig {
  if (!cfg || typeof cfg.pattern !== 'string' || !cfg.pattern.trim()) {
    throw new PumppError(`Branch type "${name}" is missing required "pattern"`, {
      code: 'CONFIG_INVALID',
    })
  }
  return {
    name,
    pattern: cfg.pattern,
    base: cfg.base ?? globals.base,
    push: cfg.push ?? globals.push,
    checkout: cfg.checkout ?? globals.checkout,
    confirm: cfg.confirm ?? globals.confirm,
    gitCheck: cfg.gitCheck ?? globals.gitCheck,
    fetch: cfg.fetch ?? globals.fetch,
    requiredTokens: cfg.requiredTokens ?? [],
    description: cfg.description,
  }
}

export function mergeTokenProviders(
  builtins: TokenProviderSpec[],
  user: TokenProviderSpec[],
): TokenProviderSpec[] {
  const byName = new Map(builtins.map(p => [p.name, p]))
  for (const p of user) byName.set(p.name, p)
  return Array.from(byName.values())
}
```

- [ ] **Step 11.4: PASS & commit**

```bash
pnpm exec vitest run tests/unit/type-registry.test.ts
git add src/type-registry.ts tests/unit/type-registry.test.ts
git commit -m "feat(type-registry): normalize types, apply global defaults"
```

---

## Task 12: 配置默认值 + `define-config`

**Files:**

- Modify: `src/config.ts`
- Modify: `src/define-config.ts`

- [ ] **Step 12.1: 新 `src/config.ts`**

```ts
import type { PumpInputConfig } from './type/pump-config'

export const pumpConfigDefaults: PumpInputConfig = {
  base: 'main',
  push: false,
  checkout: true,
  confirm: true,
  gitCheck: true,
  fetch: false,
  remote: 'origin',
  manifest: { file: 'package.json', versionKey: 'version' },
  types: {
    release: { pattern: 'release/{version}-{date}' },
    feature: { pattern: 'feature/{username}-{date}' },
    hotfix: { pattern: 'hotfix/{username}-{date}' },
  },
  tokenProviders: [],
}
```

- [ ] **Step 12.2: 新 `src/define-config.ts`**

```ts
import { createDefineConfig } from 'c12'
import type { PumpInputConfig } from './type/pump-config'

export const definePumpConfig = createDefineConfig<PumpInputConfig>()
```

- [ ] **Step 12.3: typecheck + commit**

Run: `pnpm run typecheck`
Expected: 可能报 `src/branch-pump.ts` / `src/cli/parse-args.ts` 旧代码引用失败——这是预期（Task 14/16 会修）。**暂不 commit**；先把相关下游任务跑完。

改为：先把旧 `branch-pump.ts` / `cli/parse-args.ts` / `cli/index.ts` 置为 stub（保证 typecheck 通过），再 commit。

在本步直接把下列三文件内容替换为最小桩：

`src/branch-pump.ts`:

```ts
export async function pumpBranch(): Promise<never> {
  throw new Error('pumpBranch: not yet reimplemented')
}
```

`src/cli/parse-args.ts`:

```ts
export interface ParsedArgs { _stub: true }
export async function parseArgs(): Promise<ParsedArgs> {
  throw new Error('parseArgs: not yet reimplemented')
}
```

`src/cli/index.ts`:

```ts
export async function main(): Promise<void> {
  throw new Error('cli main: not yet reimplemented')
}
```

`src/index.ts`（临时，只导出可用符号）:

```ts
export { pumpConfigDefaults } from './config'
export { definePumpConfig } from './define-config'
export { PumppError } from './errors'
export type * from './type/pump-config'
export type * from './type/pump-runtime-options'
export type * from './type/pump-branch-progress'
export type * from './type/pump-branch-results'
export type * from './type/pump-deps'
export type * from './type/token-provider'
export { ProgressEvent } from './type/pump-branch-progress'
```

`src/load-pump-config.ts`（临时占位，也在本步改掉）:

```ts
import type { PumpInputConfig } from './type/pump-config'
export async function loadPumpConfig(): Promise<PumpInputConfig> {
  throw new Error('loadPumpConfig: not yet reimplemented')
}
```

- [ ] **Step 12.4: 删除旧 type 文件**

此时旧 `src/type/branch-pump-options.ts` / `branch-pump-progress.ts` / `branch-pump-results.ts` / `release-type.ts` 已无引用（stub 都不依赖），删除：

```bash
git rm src/type/branch-pump-options.ts src/type/branch-pump-progress.ts src/type/branch-pump-results.ts src/type/release-type.ts
```

（若部分文件不存在，按实际删除；`git status` 前 `src/type/release-type.ts` 可能并未 track。用 `rm` 或 `git rm --ignore-unmatch`。）

- [ ] **Step 12.5: typecheck + test（现有测试不依赖被 stub 的符号） + commit**

Run: `pnpm run typecheck && pnpm exec vitest run`
Expected: PASS

```bash
git add src/config.ts src/define-config.ts src/branch-pump.ts src/cli/parse-args.ts src/cli/index.ts src/index.ts src/load-pump-config.ts
git commit -m "refactor: stub core/cli, introduce PumpInputConfig defaults"
```

---

## Task 13: `src/load-pump-config.ts` 真实加载

用 c12 加载 raw input → `normalizePumpConfig` 归一化。

**Files:**

- Modify: `src/load-pump-config.ts`

无独立单测（c12 自身已测；加载路径留给 E2E）。类型 + lint 保底。

- [ ] **Step 13.1: 实现**

```ts
import { loadConfig } from 'c12'
import { mergeTokenProviders, normalizePumpConfig } from './type-registry'
import { pumpConfigDefaults } from './config'
import { buildBuiltinProviders } from './utils/token-providers'
import type { PumpInputConfig, ResolvedPumpConfig } from './type/pump-config'

export async function loadPumpConfig(
  cwd: string,
  configFile?: string,
): Promise<ResolvedPumpConfig> {
  const { config } = await loadConfig<PumpInputConfig>({
    name: 'pumpp',
    cwd,
    defaults: pumpConfigDefaults,
    packageJson: ['pumpp'],
    dotenv: false,
    ...(configFile ? { configFile } : {}),
  })
  const normalized = normalizePumpConfig(config ?? {})
  normalized.tokenProviders = mergeTokenProviders(
    buildBuiltinProviders(),
    normalized.tokenProviders,
  )
  return normalized
}
```

- [ ] **Step 13.2: typecheck + commit**

```bash
pnpm run typecheck
git add src/load-pump-config.ts
git commit -m "feat(config): load and normalize pumpp config via c12"
```

---

## Task 14: 核心 `pumpBranch`（9 步流水线）+ 单测

核心难点。先测、后实现。表驱动覆盖：`--desc` 追加、`--no-push`、`--dry-run`、base 缺失、分支已存在、confirm 取消。

**Files:**

- Modify: `src/branch-pump.ts`
- Create: `tests/unit/branch-pump.test.ts`
- Create: `tests/helpers/fake-deps.ts`（测试辅助）

- [ ] **Step 14.1: 测试辅助 `tests/helpers/fake-deps.ts`**

```ts
import type { PumpDeps } from '../../src/type/pump-deps'

export interface FakeState {
  repo: boolean
  statusOutput: string
  currentBranch: string
  localBranches: Set<string>
  remoteBranches: Set<string>
  createdBranches: { name: string, base: string, checkout: boolean }[]
  pushed: string[]
  fetched: string[]
  gitUser?: string
  checkRefOk: boolean
  now: Date
  manifestValue: string
  confirmAnswer: boolean
  selectAnswer?: string
  textAnswer?: string
}

export function createFakeDeps(overrides: Partial<FakeState> = {}): { deps: PumpDeps, state: FakeState } {
  const state: FakeState = {
    repo: true,
    statusOutput: '',
    currentBranch: 'main',
    localBranches: new Set(['main']),
    remoteBranches: new Set(['main']),
    createdBranches: [],
    pushed: [],
    fetched: [],
    gitUser: 'Alice',
    checkRefOk: true,
    now: new Date(2026, 3, 18),
    manifestValue: '1.2.3',
    confirmAnswer: true,
    ...overrides,
  }

  const deps: PumpDeps = {
    git: {
      async assertRepo() {
        if (!state.repo) throw new Error('not a git repo')
      },
      async status() { return state.statusOutput },
      async currentBranch() { return state.currentBranch },
      async revParseVerify(_c, ref) { return state.localBranches.has(ref.replace(/^refs\/heads\//, '')) },
      async lsRemoteHead(_c, _r, b) { return state.remoteBranches.has(b) },
      async fetch(_c, r) { state.fetched.push(r) },
      async createBranch(_c, name, base, checkout) {
        state.createdBranches.push({ name, base, checkout })
        state.localBranches.add(name)
        if (checkout) state.currentBranch = name
      },
      async push(_c, _r, name) { state.pushed.push(name); state.remoteBranches.add(name) },
      async checkRefFormat() {
        if (!state.checkRefOk) {
          const err: any = new Error('invalid ref'); err.output = { stderr: 'fatal: invalid ref' }
          throw err
        }
      },
      async configGet() { return state.gitUser },
    },
    now: () => state.now,
    readManifest: () => state.manifestValue,
    prompt: {
      confirm: async () => state.confirmAnswer,
      select: async () => state.selectAnswer as any,
      text: async () => state.textAnswer ?? '',
    },
  }
  return { deps, state }
}
```

- [ ] **Step 14.2: 写核心测试 `tests/unit/branch-pump.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { pumpBranch } from '../../src/branch-pump'
import { normalizePumpConfig } from '../../src/type-registry'
import { buildBuiltinProviders } from '../../src/utils/token-providers'
import { mergeTokenProviders } from '../../src/type-registry'
import { createFakeDeps } from '../helpers/fake-deps'
import { pumpConfigDefaults } from '../../src/config'

function baseConfig() {
  const c = normalizePumpConfig(pumpConfigDefaults)
  c.tokenProviders = mergeTokenProviders(buildBuiltinProviders(), c.tokenProviders)
  return c
}

describe('pumpBranch', () => {
  it('dry-run resolves release name without creating branches', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('release', {
      config: baseConfig(),
      dryRun: true,
      yes: true,
    }, deps)
    expect(r.branchName).toBe('release/1.2.3-20260418')
    expect(r.dryRun).toBe(true)
    expect(state.createdBranches).toHaveLength(0)
  })

  it('feature with --desc appends when pattern lacks {desc}', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('feature', {
      config: baseConfig(),
      desc: 'login',
      yes: true,
    }, deps)
    expect(r.branchName).toBe('feature/alice-20260418-login')
    expect(state.createdBranches[0]).toMatchObject({ name: 'feature/alice-20260418-login', base: 'main', checkout: true })
    expect(state.pushed).toHaveLength(0)
  })

  it('throws UNKNOWN_BRANCH_TYPE for unknown type', async () => {
    const { deps } = createFakeDeps()
    await expect(pumpBranch('rc', { config: baseConfig(), yes: true }, deps))
      .rejects.toMatchObject({ code: 'UNKNOWN_BRANCH_TYPE' })
  })

  it('throws DIRTY_WORKING_TREE when status non-empty and gitCheck on', async () => {
    const { deps } = createFakeDeps({ statusOutput: ' M file.txt\n' })
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects.toMatchObject({ code: 'DIRTY_WORKING_TREE' })
  })

  it('skips dirty check when gitCheck false', async () => {
    const { deps } = createFakeDeps({ statusOutput: ' M x\n' })
    await expect(pumpBranch('release', { config: baseConfig(), yes: true, gitCheck: false }, deps)).resolves.toBeTruthy()
  })

  it('throws BRANCH_ALREADY_EXISTS for local collision', async () => {
    const { deps, state } = createFakeDeps()
    state.localBranches.add('release/1.2.3-20260418')
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects.toMatchObject({ code: 'BRANCH_ALREADY_EXISTS' })
  })

  it('throws BASE_BRANCH_MISSING when base not found', async () => {
    const { deps, state } = createFakeDeps()
    state.localBranches.delete('main')
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects.toMatchObject({ code: 'BASE_BRANCH_MISSING' })
  })

  it('push when push=true, uses remote override', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('feature', {
      config: baseConfig(), yes: true, push: true, remote: 'upstream',
    }, deps)
    expect(state.pushed).toEqual([r.branchName])
  })

  it('ABORTED_BY_USER when confirm declined', async () => {
    const { deps } = createFakeDeps({ confirmAnswer: false })
    await expect(pumpBranch('release', { config: baseConfig() }, deps))
      .rejects.toMatchObject({ code: 'ABORTED_BY_USER' })
  })

  it('INVALID_BRANCH_NAME when check-ref-format fails', async () => {
    const { deps } = createFakeDeps({ checkRefOk: false })
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects.toMatchObject({ code: 'INVALID_BRANCH_NAME' })
  })

  it('customBranchName hook overrides rendered name', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('release', {
      config: baseConfig(),
      yes: true,
      customBranchName: () => 'release/custom-1',
    }, deps)
    expect(r.branchName).toBe('release/custom-1')
    expect(state.createdBranches[0].name).toBe('release/custom-1')
  })

  it('progress events fire in order', async () => {
    const { deps } = createFakeDeps()
    const events: string[] = []
    await pumpBranch('release', {
      config: baseConfig(), yes: true, push: true,
      progress: p => events.push(p.event),
    }, deps)
    expect(events).toEqual([
      'config-loaded',
      'tokens-resolved',
      'name-resolved',
      'git-preflight',
      'confirmed',
      'git-branch-created',
      'git-pushed',
    ])
  })
})
```

- [ ] **Step 14.3: FAIL（stub 抛异常）**

Run: `pnpm exec vitest run tests/unit/branch-pump.test.ts`
Expected: FAIL

- [ ] **Step 14.4: 实现 `src/branch-pump.ts`**

```ts
import process from 'node:process'
import type { ResolvedPumpConfig, ResolvedTypeConfig } from './type/pump-config'
import type { PumpRuntimeOptions } from './type/pump-runtime-options'
import type { PumpBranchResults } from './type/pump-branch-results'
import type { PumpBranchProgress } from './type/pump-branch-progress'
import type { PumpDeps } from './type/pump-deps'
import { ProgressEvent } from './type/pump-branch-progress'
import { PumppError, toPumppError } from './errors'
import { defaultDeps } from './default-deps'
import { loadPumpConfig } from './load-pump-config'
import { renderBranchName, scanPattern } from './utils/branch-template'
import { resolveTokens } from './utils/token-providers'
import { slugifyBranchToken } from './utils/slug'
import { validateRef } from './utils/validate-ref'

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
  const cwd = runtime.cwd ?? process.cwd()
  const config = runtime.config ?? await loadPumpConfig(cwd, runtime.configFile)
  const typeConfig = config.types[type]
  if (!typeConfig) {
    throw new PumppError(`Unknown branch type "${type}"`, {
      code: 'UNKNOWN_BRANCH_TYPE',
      hint: `Known types: ${Object.keys(config.types).join(', ') || '(none)'}`,
    })
  }

  const effective = mergeEffective(typeConfig, config, runtime)
  const dryRun = runtime.dryRun === true
  emit(runtime, { event: ProgressEvent.ConfigLoaded, type, base: effective.base, branchName: '', dryRun })

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
  emit(runtime, { event: ProgressEvent.TokensResolved, type, base: effective.base, branchName: '', dryRun })

  let branchName = renderBranchName(typeConfig.pattern, sluggedTokens)
  if (runtime.desc && !/\{desc\??\}/.test(typeConfig.pattern)) {
    branchName = `${branchName}-${slugifyBranchToken(runtime.desc)}`
  }

  if (runtime.customBranchName) {
    const override = await runtime.customBranchName({
      type, pattern: typeConfig.pattern, tokens: sluggedTokens, typeConfig,
    })
    if (typeof override === 'string' && override.trim())
      branchName = override.trim()
  }

  emit(runtime, { event: ProgressEvent.NameResolved, type, base: effective.base, branchName, dryRun })

  await preflight(cwd, branchName, effective, deps, runtime)
  emit(runtime, { event: ProgressEvent.GitPreflight, type, base: effective.base, branchName, dryRun })

  if (effective.confirm && !runtime.yes) {
    const ok = await deps.prompt.confirm(
      dryRun
        ? `Dry run: would create "${branchName}" from ${effective.base}. Continue?`
        : `Create branch "${branchName}" from ${effective.base}?`,
    )
    if (!ok)
      throw new PumppError('aborted by user', { code: 'ABORTED_BY_USER' })
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
  try { await deps.git.assertRepo(cwd) }
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
  if (!baseOk) {
    throw new PumppError(`Base branch "${eff.base}" does not exist locally`, { code: 'BASE_BRANCH_MISSING' })
  }

  if (eff.fetch) {
    try { await deps.git.fetch(cwd, eff.remote) }
    catch { /* WARN but do not abort */ }
  }

  if (await deps.git.revParseVerify(cwd, `refs/heads/${branchName}`)) {
    throw new PumppError(`Branch "${branchName}" already exists locally`, {
      code: 'BRANCH_ALREADY_EXISTS',
      hint: 'Pass --desc to append a unique suffix',
    })
  }

  if ((eff.push || eff.fetch) && await deps.git.lsRemoteHead(cwd, eff.remote, branchName)) {
    throw new PumppError(`Branch "${branchName}" already exists on remote "${eff.remote}"`, {
      code: 'BRANCH_ALREADY_EXISTS',
    })
  }

  await validateRef(branchName, deps)

  void runtime
}

function emit(runtime: PumpRuntimeOptions, p: PumpBranchProgress): void {
  runtime.progress?.(p)
}
```

- [ ] **Step 14.5: PASS（可能需 2-3 轮微调 token slug 规则 / preflight 顺序）**

Run: `pnpm exec vitest run tests/unit/branch-pump.test.ts`
Expected: PASS（若 FAIL，按断言逐条修）

- [ ] **Step 14.6: commit**

```bash
git add src/branch-pump.ts tests/unit/branch-pump.test.ts tests/helpers/fake-deps.ts
git commit -m "feat(core): pumpBranch 9-step pipeline with deps injection"
```

---

## Task 15: CLI 动态子命令 `src/cli/register-commands.ts`

把一个 cac CLI 实例 + `ResolvedPumpConfig` 作为输入，为每个 type 注册子命令；每个命令 action 只负责把 flags 整形为 `PumpRuntimeOptions`，并调 caller 传入的 runner。

**Files:**

- Create: `src/cli/register-commands.ts`

无独立单测（动态注册通过 parse-args 间接测试）。

- [ ] **Step 15.1: 实现**

```ts
import type { CAC } from 'cac'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import type { ResolvedPumpConfig, ResolvedTypeConfig } from '../type/pump-config'

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
  if (typeof o.base === 'string') r.base = o.base
  if (typeof o.date === 'string') r.date = o.date
  if (typeof o.desc === 'string') r.desc = o.desc
  if (o.yes === true) r.yes = true
  if (o.dryRun === true) r.dryRun = true
  if (typeof o.push === 'boolean') r.push = o.push
  if (typeof o.checkout === 'boolean') r.checkout = o.checkout
  if (typeof o.fetch === 'boolean') r.fetch = o.fetch
  if (typeof o.gitCheck === 'boolean') r.gitCheck = o.gitCheck
  if (typeof o.remote === 'string') r.remote = o.remote
  if (typeof o.file === 'string') r.file = o.file
  if (typeof o.versionKey === 'string') r.versionKey = o.versionKey
  return r
}
```

- [ ] **Step 15.2: typecheck + commit**

```bash
pnpm run typecheck
git add src/cli/register-commands.ts
git commit -m "feat(cli): dynamic type-command registration"
```

---

## Task 16: CLI 顶层解析 `src/cli/parse-args.ts` + 单测

职责：读 argv → 读 `--cwd`/`--config` → 加载配置 → 构造 cac → 注册全局选项 + 每种 type 子命令 + `''` 空命令（交互）→ 返回一个「描述要执行什么」的 intent 对象。真实执行在 `cli/index.ts` 里做。

交互模式 intent 单独携带 `interactive: true`；在 `cli/index.ts` 里弹出 select 然后再 dispatch。

**Files:**

- Modify: `src/cli/parse-args.ts`
- Create: `tests/unit/parse-args.test.ts`

- [ ] **Step 16.1: 写测试**

```ts
import { describe, expect, it } from 'vitest'
import { normalizePumpConfig } from '../../src/type-registry'
import { pumpConfigDefaults } from '../../src/config'
import { buildIntent } from '../../src/cli/parse-args'

const config = normalizePumpConfig(pumpConfigDefaults)

describe('buildIntent', () => {
  it('recognises subcommand', () => {
    const i = buildIntent(['node', 'pumpp', 'release', '-y', '--no-push'], config)
    expect(i.kind).toBe('run')
    if (i.kind === 'run') {
      expect(i.type).toBe('release')
      expect(i.runtime.yes).toBe(true)
      expect(i.runtime.push).toBe(false)
    }
  })

  it('maps --desc', () => {
    const i = buildIntent(['node', 'pumpp', 'feature', '--desc', 'login', '-y'], config)
    if (i.kind === 'run') expect(i.runtime.desc).toBe('login')
  })

  it('maps manifest flags', () => {
    const i = buildIntent(['node', 'pumpp', 'release', '--file', 'pkg.json', '--version-key', 'v', '-y'], config)
    if (i.kind === 'run') {
      expect(i.runtime.file).toBe('pkg.json')
      expect(i.runtime.versionKey).toBe('v')
    }
  })

  it('no subcommand → interactive intent', () => {
    const i = buildIntent(['node', 'pumpp'], config)
    expect(i.kind).toBe('interactive')
  })

  it('unknown subcommand → unknown intent', () => {
    const i = buildIntent(['node', 'pumpp', 'rc'], config)
    expect(i.kind).toBe('unknown')
    if (i.kind === 'unknown') expect(i.input).toBe('rc')
  })

  it('help flag carries through', () => {
    const i = buildIntent(['node', 'pumpp', '--help'], config)
    expect(i.kind).toBe('help')
  })

  it('version flag carries through', () => {
    const i = buildIntent(['node', 'pumpp', '--version'], config)
    expect(i.kind).toBe('version')
  })
})
```

- [ ] **Step 16.2: FAIL**

Run: `pnpm exec vitest run tests/unit/parse-args.test.ts`
Expected: FAIL

- [ ] **Step 16.3: 实现**

```ts
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import cac from 'cac'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import type { ResolvedPumpConfig } from '../type/pump-config'
import { loadPumpConfig } from '../load-pump-config'
import { addSharedOptions, cliOptionsToRuntime, registerTypeCommands } from './register-commands'

export type Intent =
  | { kind: 'help' }
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

  let captured: { type: string, runtime: PumpRuntimeOptions } | null = null

  registerTypeCommands(cli, config, async (type, runtime) => {
    captured = { type, runtime }
  })

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

  const first = parsed.args[0]
  if (!first)
    return { kind: 'interactive', global }
  if (!(first in config.types))
    return { kind: 'unknown', input: first, global }

  // cac already matched our subcommand; but since run:false we must read options ourselves.
  return {
    kind: 'run',
    type: first,
    runtime: cliOptionsToRuntime(parsed.options),
    global,
  }
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
    if (a === '-C' || a === '--cwd') out.cwd = argv[++i]
    else if (a.startsWith('--cwd=')) out.cwd = a.slice(6)
    else if (a === '--config') out.configFile = argv[++i]
    else if (a.startsWith('--config=')) out.configFile = a.slice(9)
  }
  return out
}
```

- [ ] **Step 16.4: PASS**

Run: `pnpm exec vitest run tests/unit/parse-args.test.ts`
Expected: PASS（如未通过，多半是 cac `run: false` 下如何读 options；若不支持则改为 `cli.parse(argv)` + 在 handler 中 `captured = ...` 再取 captured，相应调整代码和断言；保持意图等价即可。）

- [ ] **Step 16.5: commit**

```bash
git add src/cli/parse-args.ts tests/unit/parse-args.test.ts
git commit -m "feat(cli): parseArgs produces structured Intent"
```

---

## Task 17: CLI 顶层 `src/cli/index.ts`

职责：
1. 预扫描 cwd / config → 加载配置 → 走 `parseArgs`
2. 根据 `Intent`：
   - `help` / `version`：cac 会直接打印，我们只 exit 0
   - `run`：直接调 `pumpBranch`
   - `interactive`：提示选 type（可选再输 desc）→ 调 `pumpBranch`
   - `unknown`：抛 `UNKNOWN_BRANCH_TYPE`
3. 错误渲染：`PumppError` → exit = `errorCodeToExit(code)`；`--debug` 时附加 code + stack；`--quiet` 静音 progress。

**Files:**

- Modify: `src/cli/index.ts`

- [ ] **Step 17.1: 实现**

```ts
import process from 'node:process'
import { green, red, yellow } from 'kolorist'
import { pumpBranch } from '../branch-pump'
import { defaultDeps } from '../default-deps'
import { errorCodeToExit, PumppError, toPumppError } from '../errors'
import { ProgressEvent } from '../type/pump-branch-progress'
import type { PumpBranchProgress } from '../type/pump-branch-progress'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import type { ResolvedPumpConfig } from '../type/pump-config'
import type { GlobalFlags, Intent } from './parse-args'
import { parseArgs } from './parse-args'
import { symbols } from './symbols'
import { ExitCode } from './exit-code'

export async function main(argv = process.argv): Promise<void> {
  let global: GlobalFlags = { quiet: false, debug: false }
  try {
    const { intent, config } = await parseArgs(argv)
    if ('global' in intent) global = intent.global

    switch (intent.kind) {
      case 'help':
      case 'version':
        return void process.exit(ExitCode.Success)

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

async function augmentInteractive(
  type: string,
  config: ResolvedPumpConfig,
  deps: ReturnType<typeof defaultDeps>,
  base: PumpRuntimeOptions,
): Promise<PumpRuntimeOptions> {
  const typeCfg = config.types[type]
  if (!typeCfg) return base
  if (/\{desc\??\}/.test(typeCfg.pattern) && !base.desc) {
    const desc = await deps.prompt.text('Description (fills {desc}):')
    if (desc) return { ...base, desc }
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
    if (err.stack) lines.push(err.stack)
    const stderr = (err.cause as { output?: { stderr?: string } } | undefined)?.output?.stderr
    if (stderr) lines.push(`  git stderr: ${stderr.trim()}`)
  }
  console.error(lines.join('\n'))
  process.exit(exit)
}
```

- [ ] **Step 17.2: 补齐 `symbols`（加 info）**

在 `src/cli/symbols.ts`：

```ts
import { cyan, green, red } from 'kolorist'

export const symbols = {
  success: green('✔'),
  error: red('✖'),
  info: cyan('ℹ'),
}
```

- [ ] **Step 17.3: lint + typecheck + test**

Run: `pnpm run check`
Expected: PASS（全部）

- [ ] **Step 17.4: 手动烟测（可选但建议）**

Run: `pnpm pumpp release --dry-run -y`
Expected: 输出 `release/<version>-<today>` 并在当前 pumpp 仓库里真的以 dryRun 结束。**若当前分支已脏 → 预期报 `DIRTY_WORKING_TREE`**；此时先 commit 前述文件，再继续验证或传 `--no-git-check`。

- [ ] **Step 17.5: commit**

```bash
git add src/cli/index.ts src/cli/symbols.ts
git commit -m "feat(cli): main dispatcher with interactive + error rendering"
```

---

## Task 18: 库导出 `src/index.ts` 最终形态

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 18.1: 替换为最终导出**

```ts
export { pumpBranch } from './branch-pump'
export { pumpConfigDefaults } from './config'
export { defaultDeps } from './default-deps'
export { definePumpConfig } from './define-config'
export { errorCodeToExit, PumppError, toPumppError } from './errors'
export type { PumppErrorCode } from './errors'
export { loadPumpConfig } from './load-pump-config'
export { mergeTokenProviders, normalizePumpConfig } from './type-registry'
export { ProgressEvent } from './type/pump-branch-progress'
export type { PumpBranchProgress } from './type/pump-branch-progress'
export type { PumpBranchResults } from './type/pump-branch-results'
export type {
  ManifestOptions,
  PumpInputConfig,
  ResolvedGlobals,
  ResolvedPumpConfig,
  ResolvedTypeConfig,
  TypeInputConfig,
} from './type/pump-config'
export type { NameContext, PumpRuntimeOptions } from './type/pump-runtime-options'
export type { GitDeps, PromptDeps, PumpDeps } from './type/pump-deps'
export type { TokenContext, TokenProviderSpec } from './type/token-provider'
export { buildBuiltinProviders, resolveTokens } from './utils/token-providers'
```

- [ ] **Step 18.2: typecheck + build dry run**

Run: `pnpm run typecheck && pnpm run build`
Expected: PASS；`dist/` 生成 `index.mjs` / `index.d.mts` / `cli/index.mjs` / `cli/index.d.mts`。

- [ ] **Step 18.3: commit**

```bash
git add src/index.ts
git commit -m "feat: finalize public library exports"
```

---

## Task 19: E2E 烟测 `tests/e2e/cli.test.ts`

5 条矩阵（spec §5.7）。先 `pnpm run build`，再用 `node bin/pumpp.mjs` 在临时 git 仓库里跑。

**Files:**

- Create: `tests/e2e/cli.test.ts`

- [ ] **Step 19.1: 写 E2E 测试**

```ts
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const cli = path.join(repoRoot, 'bin', 'pumpp.mjs')

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function pumpp(cwd: string, ...args: string[]): { status: number, stdout: string, stderr: string } {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr }
}

describe('pumpp CLI (e2e)', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' })
  })

  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pumpp-e2e-'))
    git(dir, 'init', '-b', 'main')
    git(dir, 'config', 'user.email', 'test@example.com')
    git(dir, 'config', 'user.name', 'Alice')
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }))
    git(dir, 'add', '.')
    git(dir, 'commit', '-m', 'init')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('release --dry-run -y prints expected name', () => {
    const r = pumpp(dir, 'release', '--dry-run', '-y', '--no-push')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/release\/1\.0\.0-\d{8}/)
  })

  it('feature --desc login creates branch without pushing', () => {
    const r = pumpp(dir, 'feature', '--desc', 'login', '-y', '--no-push')
    expect(r.status).toBe(0)
    const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
    expect(branch).toMatch(/feature\/alice-\d{8}-login/)
  })

  it('hotfix on dirty tree exits 2 with DIRTY_WORKING_TREE', () => {
    writeFileSync(path.join(dir, 'dirty.txt'), 'x')
    const r = pumpp(dir, 'hotfix', '-y', '--no-push')
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Working tree is not clean|DIRTY_WORKING_TREE/)
  })

  it('unknown subcommand exits 1', () => {
    const r = pumpp(dir, 'rc', '-y')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/Unknown branch type/)
  })

  it('running release twice collides with BRANCH_ALREADY_EXISTS', () => {
    const first = pumpp(dir, 'release', '-y', '--no-push', '--no-checkout')
    expect(first.status).toBe(0)
    const second = pumpp(dir, 'release', '-y', '--no-push', '--no-checkout')
    expect(second.status).toBe(2)
    expect(second.stderr).toMatch(/already exists/i)
  })
})
```

- [ ] **Step 19.2: 运行**

Run: `pnpm exec vitest run tests/e2e/cli.test.ts`
Expected: PASS（首次会触发一次 `pnpm run build`，稍慢是正常）

- [ ] **Step 19.3: 如 FAIL，常见问题 + 修法**

- `pnpm` 在 PATH 里找不到 → 把 `beforeAll` 改为直接 `execFileSync('node', [path.join(repoRoot, 'node_modules/tsdown/dist/cli.js')], ...)` 或通过环境变量 `PNPM` 指定；若在 Windows 下 `pnpm.cmd`，在 spawnSync 里传 `shell: true`。
- `git init -b main` 旧 git 不支持 → fallback：`git init && git checkout -b main`。
- `release/1.0.0-...` 没匹配 → 检查 `--no-git-check` 语义；我们刚 commit 初始化，工作树应为 clean。

- [ ] **Step 19.4: commit**

```bash
git add tests/e2e/cli.test.ts
git commit -m "test(e2e): 5-case smoke matrix for pumpp CLI"
```

---

## Task 20: 终检 + 补 README 提示（可选）

**Files:**

- （可选）Modify: `README.md`（如已过时）——spec 未强制要求，允许跳过。

- [ ] **Step 20.1: 跑完整 `check`**

Run: `pnpm run check`
Expected: 全部 PASS

- [ ] **Step 20.2: 跑构建确认发布物正确**

Run: `pnpm run build`
Expected: `dist/` 生成；`node -e "import('./dist/index.mjs').then(m => console.log(Object.keys(m)))"` 能列出导出符号。

- [ ] **Step 20.3: 汇总 commit（若还有零散修改）**

```bash
git status
# 若有零散改动：
git add -A
git commit -m "chore: finalize pumpp rewrite per spec"
```

- [ ] **Step 20.4: 完成**

所有 Task 完成；手动快速跑一次 `pnpm pumpp --help` 与 `pnpm pumpp release --dry-run -y --no-git-check` 做最终人眼确认。

---

## Self-review checklist（计划内嵌自检）

- [x] §5.1 架构分层：CLI / 核心 / 配置 → Task 14（核心）、Task 13（配置）、Task 15–17（CLI）
- [x] §5.2 `PumpInputConfig` / `TypeInputConfig` / `Resolved*` / 合并规则 → Task 3（类型）+ Task 11（归一化）+ Task 13（c12 加载）
- [x] §5.3 子命令 + 全局选项 + `--debug/--quiet/--cwd/--config` + 交互 → Task 15/16/17
- [x] §5.4 9 步流水线 + `ProgressEvent`（7 个） + `PumpBranchResults` + `customBranchName` → Task 14
- [x] §5.5 `{name}` / `{name?}` + 内置 provider + `TokenProviderSpec` + 分隔符清理 + `git check-ref-format` → Task 6/8/9
- [x] §5.6 `PumppError` + 错误码表 + 退出码 + `--debug` 附加栈 + `toPumppError` → Task 2/17
- [x] §5.7 Vitest + `PumpDeps` + 分层测试 + 5 条 E2E → Task 1/9/11/14/19 + helpers
- [x] 差异表里新增文件：`type-registry.ts`、`default-deps.ts`、`errors.ts`、`cli/register-commands.ts`、`utils/token-providers.ts`、`utils/validate-ref.ts` → Task 2/8/9/10/11/15 全覆盖
- [x] 完整重构（旧类型文件清理）→ Task 12 Step 12.4
- [x] 每个 Task 都以 commit 收尾；每次动代码前先 lint/typecheck/test 通过

**命名一致性检查：**

- `ProgressEvent` 值 `config-loaded` / `tokens-resolved` / `name-resolved` / `git-preflight` / `confirmed` / `git-branch-created` / `git-pushed`：Task 3 定义、Task 14 emit、Task 14 测试、Task 17 消费全部一致 ✅
- `PumppErrorCode` 列表在 Task 2 定义 → Task 14 抛 → Task 2 单测 → Task 17 渲染全部一致 ✅
- `PumpDeps.git` 方法名在 Task 3 定义、Task 10 实现、Task 14 使用、Task 14 helpers 模拟 ✅

---

## Execution Handoff

Plan complete and saved to `docs/specs/2026-04-18-pumpp-branch-cli-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — 每个 Task 发一个 fresh subagent 去做，Task 间两阶段 review。
2. **Inline Execution** — 在本会话里按 Task 顺序做，每个 Task 结束时 checkpoint review。

请选其一；或先 review 本计划，提改动意见后再进入执行阶段。
