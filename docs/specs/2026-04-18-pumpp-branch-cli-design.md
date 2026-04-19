# Pumpp 分支管理 CLI 设计文档

- **日期**：2026-04-18
- **主题**：基于项目分支规范自动创建 `release / feature / hotfix`（可扩展）等分支的 CLI
- **参考项目**：[antfu-collective/bumpp](https://github.com/antfu-collective/bumpp)（工程结构 / CLI 风格对齐）
- **文档状态**：**已通过用户最终 review（2026-04-18）**。下一步：`writing-plans` 产出实现计划 `docs/specs/2026-04-18-pumpp-branch-cli-plan.md`，计划通过后才进入重构/实现

---

## 下次会话接续指引（Handoff）

如果你在新会话（上下文已清）里继续，把下面这条原样发给我即可：

> 继续 pumpp 项目。设计文档已通过 review：`docs/specs/2026-04-18-pumpp-branch-cli-design.md`。
> 请按 superpowers 的 `writing-plans` 流程，基于该 spec 产出分步实现计划；不要直接写代码，计划先给我 review。

接续要点（我会读以下来恢复状态）：

1. 本 spec 全节（5.1–5.7）皆已通过；所有决策汇总在「第 4 节」与各 5.x 小节
2. 当前仓库 `src/` 下有一版**旧实现**（`pumpBranch(options)` 单命令 `--type` 风格），新设计要求**完整重构**而非增量改（见 5.4 差异表）
3. 依赖注入 `PumpDeps`、类型注册表 `types`、`{?}` 可选语法、`git check-ref-format` 校验、Vitest 测试策略均为**已决定**
4. `pumpp list` 等辅助命令为 YAGNI
5. CLI 形态：子命令 `pumpp release/feature/hotfix/...`；无参进入交互；全局 `--debug/-q/-C/--config/--help/--version`
6. `base` 三类默认 `main`；重名靠 `--desc` 追加尾段
7. 退出码：`0` 成功/用户取消；`1` 用户输入错；`2` 环境/仓库错

---

## 1. 背景与目标

当前仓库 `pumpp` 目标是做一个「分支版的 bumpp」——`bumpp` 负责 version-bump，`pumpp` 负责 **branch-pump**：按项目既定的分支规范，自动产出合规命名的新分支，并完成 `git branch / checkout / push` 等动作。核心价值：

- 团队成员不用记分支命名规则，`pumpp release` 就能按规范创建
- 支持本项目团队规范的同时，对**其他团队的分支规范**也保持通用，靠**配置**而非**改源码**扩展

**非目标**：不做 version bump（由 `bumpp` 负责）；不做 MR / PR 创建；不负责合并策略；不做 changelog。

## 2. 项目分支规范（用户原始口述）

> - `main` 分支是主分支
> - `release` 分支是发布分支，`feature` 分支是从 `release` 拉，合并到 `release`；发布完成后 `release` 分支回归 `main`
> - `hotfix` 统一从 `main` 拉直接合并到 `main`

**后续调整（见 Q&A 第 4 问）**：feature 分支**也统一从 `main` 切**，简化工具的 base 选择逻辑；合并回哪里由开发者人工决定，CLI 不管。

## 3. 需求澄清记录（Q&A）

### Q1 · 采用的分支工作流
选 **D. 自定义**。描述见第 2 节。

### Q2 · `release` 分支切出基准与并发
选 **C. 版本 + 日期/迭代号**。CLI 需要**通用**：同时支持「迭代号 + 日期」或「只迭代号」。

### Q3 · 迭代号来源
口径：**迭代号 == 日期**（`YYYYMMDD`），默认取创建当天，CLI `--date` 可覆盖。
→ 实现上**不单独搞 `{sprint}`**，统一用 `{date}` 占位符。

### Q4 · `feature` 基分支
选 **feature 统一从 `main` 切**（推翻原口述里「从 release 切」）。
结果：`release / feature / hotfix` 三类默认 base 都是 `main`，配置可覆盖，`--base` 可手动覆盖。

### Q5 · CLI 形态
选 **A. 子命令风格**：`pumpp release / pumpp feature / pumpp hotfix`。

### Q6 · 默认行为

| 项 | 默认 | 说明 |
|----|------|------|
| git 干净检查 | ✅ 开 | `--no-git-check` 可关 |
| `git fetch` | ❌ 关 | `--fetch` 开 |
| 新分支 `checkout` | ✅ 开 | `--no-checkout` 关 |
| 新分支 `push -u` | ❌ 关 | `--push` 开 |
| 确认提示 | ✅ 开 | `-y/--yes` 跳 |
| `--dry-run` | 提供 | 只解析不写 git |

`{version}` 只在**当前类型的最终模板含 `{version}` 时**才去读 `package.json`（字段可配置 `manifest.file` / `manifest.versionKey`）。

### Q7 · 实现路子
选 **路子 2：类型注册表**（`types: { release, feature, hotfix, ... }`）。
- 类型全部由配置驱动，CLI 子命令根据配置**动态生成**
- 内置默认仍是三类；用户加 `types.bugfix = {...}` 即获得 `pumpp bugfix`

### Q8 · 测试框架与可测性
引入 **Vitest**；核心 `pumpBranch` 采用**依赖注入**（见 5.7）。

## 4. 已锁定的设计决策汇总

- **子命令**：`pumpp <type> [options]`，直接 `pumpp` 无参进入交互选类型
- **三类默认 base**：`main`；按配置 / `--base` 覆盖
- **占位符**：`{version} / {date} / {username} / {desc}`，内置另有 `major/minor/patch/year/month/day/branch/random`
- **默认命名模板**
  - `release/{version}-{date}`
  - `feature/{username}-{date}`
  - `hotfix/{username}-{date}`
- **重名策略**：不传 `--desc` 同名已存在 → 报错；`--desc` 作为追加尾段
- **默认行为矩阵**：见 Q6 表
- **`{version}` 延迟读取**：模板不含 `{version}` 就不读 manifest
- **ref 合法化**：最终分支名用 `git check-ref-format --branch` 权威校验
- **退出码**：`0` 成功 / 用户取消；`1` 用户输入错；`2` 环境/仓库错

## 5. 设计分节

### 5.1 总体架构 & 模块边界 —— 已通过

- **分三层**
  - **CLI 层** (`src/cli/*`)：解析 argv、装命令、交互提示、渲染输出、错误退出
  - **核心层** (`src/branch-pump.ts` + `src/utils/*`)：按「已合并配置 + 类型」产出最终分支名、调用 git、回调 `progress`
  - **配置层** (`src/config.ts` + `src/load-pump-config.ts` + `src/type-registry.ts`)：产出一个规范化的 `ResolvedPumpConfig`
- **CLI 动态装命令**：先走配置层拿到 `types` 键集合，再在 CLI 层循环 `cli.command('<type>', ...)` 注册
- **核心 API**：`pumpBranch(type, runtimeOptions?, deps?)` —— `type` 作为第一个参数，`deps` 为可注入的依赖（见 5.7）
- **占位符延迟解析**：仅当最终 `pattern` 引用到该占位符时，才触发对应 `token-provider`

**目录结构（规划）**

```
src/
  index.ts                    # 库导出
  config.ts                   # pumpConfigDefaults（内置三类型）
  define-config.ts            # definePumpConfig
  load-pump-config.ts         # c12 加载 + 合并
  type-registry.ts            # 类型表规范化 / 校验 / 合并默认
  branch-pump.ts              # 核心 pumpBranch(type, options, deps?)
  default-deps.ts             # defaultDeps()：装配真实 git/manifest/clock/prompt
  errors.ts                   # PumppError + 错误码常量
  type/                       # 所有 TS 类型
  utils/
    branch-template.ts        # pattern 渲染（含 {name?} 可选语法、分隔符清理）
    token-providers.ts        # 内置 + 用户 provider 调度（拓扑排序）
    manifest.ts               # 读版本号（JSONC）
    git-ops.ts                # git 原子封装（被 defaultDeps 使用）
    slug.ts
    date-token.ts
    validate-ref.ts           # 包装 git check-ref-format 调用
  cli/
    index.ts                  # main()：装命令、错误分发
    register-commands.ts      # 从类型注册表动态生成子命令
    parse-args.ts             # 公共选项解析 + CLI→runtime 映射
    run.ts                    # tsx 开发入口
    exit-code.ts
    symbols.ts
bin/pumpp.mjs
docs/specs/2026-04-18-pumpp-branch-cli-design.md  # 本文档
```

### 5.2 配置形态 & 类型注册表 —— 已通过

**顶层输入（`PumpInputConfig`）**

```ts
interface PumpInputConfig {
  base?: string // 默认 "main"
  push?: boolean // 默认 false
  checkout?: boolean // 默认 true
  confirm?: boolean // 默认 true
  gitCheck?: boolean // 默认 true
  fetch?: boolean // 默认 false
  remote?: string // 默认 "origin"
  manifest?: { file?: string, versionKey?: string } // 默认 { file: 'package.json', versionKey: 'version' }

  types?: Record<string, TypeInputConfig>
  tokenProviders?: TokenProviderSpec[] // 用户扩展占位符
}

interface TypeInputConfig {
  pattern: string // 必填
  base?: string
  push?: boolean
  checkout?: boolean
  confirm?: boolean
  gitCheck?: boolean
  fetch?: boolean
  requiredTokens?: string[]
  description?: string
}
```

**加载顺序（c12）**：内置默认 → `pumpp.config.*` / `.pumpprc` → `package.json#pumpp` → CLI 选项。

**合并规则**

- 普通字段：`defu` 深合并
- `types`：**按 key 整体覆盖**——若用户给了 `types.release = { pattern: 'x' }`，则内置 `types.release` 完整被替代；随后 `type-registry.ts` 把顶层默认 reapply 到未填字段上，保证任何 `ResolvedTypeConfig` 的布尔/base/remote 字段不再为 `undefined`。

**产出（`ResolvedPumpConfig`）**

```ts
interface ResolvedPumpConfig {
  globals: ResolvedGlobals
  types: Record<string, ResolvedTypeConfig>
  tokenProviders: TokenProviderSpec[] // 含内置 + 用户
}
```

核心层**只与 `ResolvedPumpConfig` 打交道**，不再回头看顶层输入。

### 5.3 CLI surface（子命令 + 选项）—— 已通过

**顶层 usage**

```
pumpp [command] [options]

Commands:
  release             Create a release branch
  feature             Create a feature branch
  hotfix              Create a hotfix branch
  <user-defined>      (Any type registered in pumpp.config types)

Run without a command to pick a type interactively.

Global Options:
  -C, --cwd <dir>     Working directory (default: process.cwd())
      --config <path> Path to pumpp config file
  -q, --quiet         Suppress non-error output
      --debug         Print error code + stack + git stderr
  -h, --help
  -v, --version
```

**子命令共享选项**

```
-b, --base <branch>       Override base branch
-d, --date <YYYYMMDD>     Override {date} token (default: today)
    --desc <text>         Value of {desc} token; appended to name if pattern has no {desc}
-y, --yes                 Skip confirmation prompt
    --dry-run             Resolve branch name only; do not run git

    --push / --no-push
    --checkout / --no-checkout
    --fetch / --no-fetch
    --git-check / --no-git-check
    --remote <name>

    --file <path>         Manifest file to read {version} from
    --version-key <key>   Field name inside manifest
```

布尔 flag 都提供 `--xxx` 和 `--no-xxx` 两侧，便于 CI 从任一侧覆盖配置。

**`--file` / `--version-key`**：CLI 扁平表达，内部映射到 `manifest.file` / `manifest.versionKey`，**覆盖**配置文件的 `manifest.*`。

**交互模式**：`pumpp` 无参进入，列出所有已注册 type（显示各自 pattern 与 description）；选择后继续该类型的默认流程；若模板含 `{desc}` 而 CLI 未传 `--desc`，再追加一次文本输入提示。

**动态注册**（伪代码）

```ts
const config = await loadPumpConfig(cwd, configFile)
const cli = cac('pumpp')
for (const [name, typeCfg] of Object.entries(config.types))
  registerTypeCommand(cli, name, typeCfg)
cli.command('', 'Pick a type interactively').action(runInteractive)
cli.help(); cli.version(pkg.version); cli.parse()
```

**`pumpp <type> --help`**：在 help 回调里动态注入 `Pattern: <current>` 一行。

### 5.4 核心流程 `pumpBranch` 数据流 —— 已通过

**API**

```ts
pumpBranch(
  type: string,
  runtimeOptions?: PumpRuntimeOptions,
  deps: PumpDeps = defaultDeps(),
): Promise<PumpBranchResults>
```

**`PumpRuntimeOptions`（CLI 直映）**

```ts
interface PumpRuntimeOptions {
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

**流水线（9 步）**

1. `resolveConfig` —— 若 `options.config` 缺失则调 `loadPumpConfig`；type 不存在 → `UNKNOWN_BRANCH_TYPE`
2. `mergeTypeOptions` —— CLI > 类型 > 顶层默认；产出 `EffectiveOptions`
3. `resolveTokens`（延迟）—— 扫 pattern → 找 provider → 拓扑排序 → 按需 resolve；必需缺失 → `UNRESOLVED_TOKEN`；`requiredTokens` 校验
4. `renderBranchName` —— slug 每个 token 值 → 模板替换 → 清理孤立分隔符；若 `--desc` 非空且 pattern 无 `{desc}` → 追加 `-${desc}` 到尾部
5. `customBranchName` hook —— 若用户提供且返回非空字符串，覆盖第 4 步结果
6. `gitPreflight` —— 顺序：`NOT_A_GIT_REPO → DIRTY_WORKING_TREE（gitCheck）→ BASE_BRANCH_MISSING → fetch（WARN 不中断）→ BRANCH_ALREADY_EXISTS（本地；`push`/`fetch` 开启时再探测远程）→ 走 `validateRef` 做 `git check-ref-format --branch <name>`，失败 → `INVALID_BRANCH_NAME`
7. `confirmPrompt` —— `confirm: true && !dryRun && !yes`：交互确认；取消 → `ABORTED_BY_USER`
8. `runGit` —— 非 `dryRun`：`git branch <name> <base>`（或 `git checkout -b <name> <base>`），可选 `git push -u <remote> <name>`
9. return `PumpBranchResults`

**从 `base` 切，不从 HEAD**。

**`ProgressEvent`**

```ts
const enum ProgressEvent {
  ConfigLoaded = 'config-loaded',
  TokensResolved = 'tokens-resolved',
  NameResolved = 'name-resolved',
  GitPreflight = 'git-preflight',
  Confirmed = 'confirmed',
  GitBranchCreated = 'git-branch-created',
  GitPushed = 'git-pushed',
}
```

**`PumpBranchResults`**

```ts
interface PumpBranchResults {
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

**与现有实现的差异（重构点）**

| 文件 | 现状 | 新设计 |
|------|------|--------|
| `src/branch-pump.ts` | `pumpBranch(options)` 从 options 读 `type` | `pumpBranch(type, runtimeOptions?, deps?)` |
| `src/config.ts` | 扁平 `file / versionKey / releasePattern / ...` | 顶层字段 + `manifest` 对象 + `types` 注册表 |
| `src/cli/parse-args.ts` | 单命令 + `--type` | 动态子命令注册（`cli/register-commands.ts`） |
| `src/type/branch-pump-options.ts` | `PumpBranchOptions` 带 `type` | 拆为 `PumpInputConfig` + `PumpRuntimeOptions` |
| `src/type/branch-pump-progress.ts` | 3 事件 | 7 事件（见上） |
| 新增 | —— | `type-registry.ts`、`default-deps.ts`、`errors.ts`、`cli/register-commands.ts`、`utils/token-providers.ts`、`utils/validate-ref.ts` |

实现阶段采用**完整重构**，不保留中间过渡版本。

### 5.5 模板引擎 & 占位符扩展点 —— 已通过

**语法**

- `{name}` 必需；未解析成功 → `UNRESOLVED_TOKEN`
- `{name?}` 可选；未解析时**连同相邻分隔符一起被清理**（例：`feature/{username}-{date}-{desc?}` 无 desc 时 → `feature/<user>-<date>`）
- 不支持转义 `\{`（YAGNI）

**内置 providers（全部保留）**

| 名称 | 来源 |
|------|------|
| `version` | `manifest.file` + `manifest.versionKey`（JSONC 解析） |
| `major/minor/patch` | `semver.parse(version)` |
| `date` | `deps.now()` → `YYYYMMDD`；可被 `--date` 覆盖 |
| `year/month/day` | 同 `date` 分片 |
| `username` | `git config user.name` → `$USER`/`$USERNAME` → `os.userInfo().username`，slugify |
| `desc` | CLI `--desc` / runtime `options.desc` |
| `branch` | `git rev-parse --abbrev-ref HEAD` |
| `random` | 6 位随机 hex |

**扩展点 `TokenProviderSpec`**

```ts
interface TokenContext {
  cwd: string
  type: string
  globals: ResolvedGlobals
  typeConfig: ResolvedTypeConfig
  runtime: PumpRuntimeOptions
  tokens: Record<string, string>
}

interface TokenProviderSpec {
  name: string
  dependsOn?: string[] // 其它 provider 的 name
  resolve: (ctx: TokenContext) => Promise<string | undefined> | string | undefined
}
```

**解析流程**

1. `scanPattern(pattern)` → `tokensNeeded: Set<string>` + 每个是否可选
2. `topoSort(providers, dependsOn)`
3. 遍历 `tokensNeeded`：provider 不存在且可选 → 留空；必需 → 抛错；调用返回 `undefined` 同理
4. 执行 `requiredTokens` 校验
5. 返回 `tokens`

**合法化（在渲染后）**

1. 每个 token 的值先 `slugifyBranchToken`
2. 模板替换
3. 清理由 `{?}` 缺失遗留的孤立分隔符
4. 调 `git check-ref-format --branch <name>`；非 0 → `INVALID_BRANCH_NAME`（stderr 作 hint）

### 5.6 错误处理 & 退出码 —— 已通过

**错误类**

```ts
class PumppError extends Error {
  code: string
  hint?: string
  cause?: unknown
}
```

**错误码 → 退出码**

| `code` | 退出码 |
|--------|--------|
| `INVALID_ARGUMENT` / `UNKNOWN_BRANCH_TYPE` / `CONFIG_INVALID` / `UNRESOLVED_TOKEN` / `INVALID_BRANCH_NAME` | 1 |
| `NOT_A_GIT_REPO` / `DIRTY_WORKING_TREE` / `BASE_BRANCH_MISSING` / `BRANCH_ALREADY_EXISTS` / `GIT_COMMAND_FAILED` | 2 |
| `ABORTED_BY_USER` | 0 |

```ts
const enum ExitCode {
  Success = 0,
  InvalidArgument = 1,
  OperationalError = 2,
}
```

**渲染**

- 默认：`✖ <message>\n  hint: <...>`；不打印 `code`、stack
- `--debug` 或 `NODE_ENV=development`：追加 `code`、stack、`cause.output.stderr`
- `--quiet`：不打印成功/progress；错误仍写 stderr

**远程探测（`BRANCH_ALREADY_EXISTS`）**

- 默认只查本地 `refs/heads/<name>`
- 当 `push: true` 或 `fetch: true` → 额外 `git ls-remote --heads <remote> <name>`

**`toPumppError(e)` 转换规则**

- `tinyexec.NonZeroExitError` → `GIT_COMMAND_FAILED`（`cause` 保留；`hint` 取 stderr 第一行）
- `SIGINT` / prompts 取消 → `ABORTED_BY_USER`
- 其它未知 `Error` → `{ code: 'UNKNOWN', exit: 2 }`

### 5.7 测试策略 —— 已通过

**框架**：Vitest，`"test": "vitest run"` / `"test:watch": "vitest"`；`"check": "pnpm run lint && pnpm run typecheck && pnpm run test"`。

**分层**

- **Unit · Utils**（70%）：`branch-template` / `token-providers` / `manifest` / `slug` / `validate-ref`
- **Unit · Core**（25%）：`pumpBranch`（依赖注入，表驱动）
- **Smoke / E2E**（5%）：临时 git repo 跑真实 `git`，只覆盖 happy path + 关键错误

**依赖注入 `PumpDeps`**

```ts
interface PumpDeps {
  git: {
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
  now: () => Date
  readManifest: (cwd: string, file: string, key: string) => string
  prompt: {
    confirm: (msg: string) => Promise<boolean>
    select: <T>(msg: string, choices: { title: string, value: T }[]) => Promise<T>
    text: (msg: string) => Promise<string>
  }
}

function defaultDeps(): PumpDeps // src/default-deps.ts；装 tinyexec / prompts / fs / os
```

核心文件（`branch-pump.ts`、`token-providers.ts` 等）**只通过 `deps` 使用外部能力**，不 `import` tinyexec/prompts 等副作用库。

**E2E 最小矩阵（5 条）**

| 用例 | 预期 |
|------|------|
| `pumpp release --dry-run -y` | 返回名 `release/1.0.0-<today>`，不创建分支 |
| `pumpp feature --desc login -y --no-push` | 创建 `feature/<user>-<today>-login`，HEAD 切过去，无远程 |
| `pumpp hotfix -y`（工作区脏） | 退出码 2，`DIRTY_WORKING_TREE` |
| `pumpp rc`（未注册） | 退出码 1，`UNKNOWN_BRANCH_TYPE` |
| `pumpp release -y` 连跑两次 | 第二次退出码 2，`BRANCH_ALREADY_EXISTS` |

**Unit 重点**

- `branch-template`：`{x}` / `{x?}`、孤立分隔符清理、边界
- `token-providers`：manifest 缺失 / JSONC 注释 / `versionKey` 错 / 依赖拓扑顺序 / 注入 `now` 固定日期 / 自定义 provider
- `validate-ref`：成功名 vs. 失败名 → 错误映射
- `pumpBranch`：表驱动覆盖 `--desc` 追加、`--no-push`、`--dry-run`、base 缺失、分支存在、confirm 取消

**YAGNI**

- 不做 mutation testing / coverage 门槛
- 不做真实 remote 连通测试
- 不做跨平台 CI 矩阵（Node 20 LTS 单版本即可）
- 不为纯类型导出写运行时测试

## 6. 决策后状态

以下 TODO 在澄清过程中已有答案，保留在此供追溯：

- [x] 是否把现有实现重构 → **是，完整重构**（见 5.4 差异表）
- [x] 引入 vitest → **是**
- [ ] `pumpp list` / `pumpp types` 辅助命令 → **暂不做（YAGNI）**，`pumpp --help` 与 `pumpp <type> --help` 已足够
- [x] 日志级别 `--debug` → **加入全局选项**（见 5.3）

## 7. 后续步骤

1. 本文档由用户最终 review（当前状态）
2. 通过后进入 `writing-plans`：基于本 spec 产出分步实现计划（`docs/specs/2026-04-18-pumpp-branch-cli-plan.md` 或同路径）
3. 计划经 review 后进入实现阶段

## 8. 变更记录

- 2026-04-18 创建文档；完成 Q1–Q7
- 2026-04-18 第 1–6 节设计通过
- 2026-04-18 第 7 节设计通过（Vitest + 依赖注入 + 5 条 E2E）
- 2026-04-18 完成 spec 自审：
  - 修正 5.4 差异表内容补齐
  - 5.3 全局选项补充 `--debug`（与 5.6 描述一致）
  - 5.7 补充 `PumpDeps` 具体形状与 `defaultDeps` 位置
  - 第 6 节决策后 TODO 状态更新；`pumpp list` 明确 YAGNI
- 2026-04-18 **用户最终 review 通过**；下一步进入 `writing-plans`
