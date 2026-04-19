# Pumpp 使用说明

`pumpp` = **branch-pump**：按项目分支规范，自动生成并创建符合命名约定的 Git 分支。
定位类比 `bumpp` 负责 version-bump，`pumpp` 负责 branch-pump。

- **不做**：版本号变更（交给 `bumpp`）、PR/MR、合并策略、changelog
- **做**：按配置的 pattern 解析 token → 生成分支名 → `git branch` / `checkout` / `push`

---

## 1. 安装

```bash
# 项目本地依赖
pnpm add -D pumpp

# 或全局
pnpm add -g pumpp
```

需要 Node.js `>= 18`。

可选：把 `pumpp` 加到 `package.json` scripts：

```json
{
  "scripts": {
    "release": "pumpp release",
    "feature": "pumpp feature",
    "hotfix": "pumpp hotfix"
  }
}
```

---

## 2. 快速开始

零配置即可用（内置 `release / feature / hotfix` 三类）：

```bash
# 一步生成 pumpp.config.ts 脚手架（可选；零配置也能跑）
pumpp init

# 从 main 切一条 release 分支，默认 pattern: release/{version}-{date}
pumpp release
# → 弹出 Accept / Edit / Cancel 确认菜单（见下），然后执行：git branch release/1.2.3-20260418 main

# 无参 → 进入交互模式，列出所有已注册类型
pumpp

# 只解析分支名，不跑 git
pumpp feature --desc login --dry-run
# → Dry run: feature/<user>-20260418-login

# 跳过提示直接创建并推送
pumpp hotfix --desc urgent-fix --push -y
```

### 2.1 确认菜单（Accept / Edit / Cancel）

按模板生成完分支名后，`pumpp` **不是简单的 y/N**，而是先弹一个三选菜单，按 ↑ / ↓ 选：

```
? Branch name: release/1.2.3-20260418
❯ ✔ Accept    Create this branch as-is
  ✎ Edit      Modify before creating
  ✖ Cancel    Abort, do not touch the repo
```

- **✔ Accept**（默认高亮，直接 Enter）→ 用当前分支名继续
- **✎ Edit** → 进入可编辑输入框，**分支名已预填在 buffer 里**，← / → 移动光标、Backspace 删改，**不会按一个字就清空**；Enter 提交，Ctrl-C 取消
  - 改完后会重新跑 `git check-ref-format` 校验 + 重查本地 / 远端同名碰撞
  - 空串提交 = 取消
- **✖ Cancel** → 干净退出（`ABORTED_BY_USER`，退出码 `0`），不动仓库
- **Ctrl-C / ESC** → 同 Cancel
- **`-y / --yes`** → 跳过整个确认，CI 友好

适合场景：临时加后缀（`-rc1` / `-fix-typo`）、改版本号格式、借 pattern 框架但手动微调单次分支名。

---

## 3. 内置类型（默认配置）

| 子命令    | 默认 pattern                     | 用途                       |
| --------- | -------------------------------- | -------------------------- |
| `release` | `release/{version}-{date}`       | 从 `package.json` 读版本号 |
| `feature` | `feature/{username}-{date}`      | 按作者 + 日期              |
| `hotfix`  | `hotfix/{username}-{date}`       | 同上；用于紧急修复         |

三类默认 `base = main`，与 spec §Q4 一致。要改 pattern / 新增类型，见 §5 配置。

---

## 4. 命令与选项

### 4.1 顶层用法

```
pumpp [command] [options]

Commands:
  release             Create a release branch
  feature             Create a feature branch
  hotfix              Create a hotfix branch
  <user-defined>      Any type registered in pumpp.config.ts
  init                Scaffold a pumpp.config file in the current directory

Run without a command to pick a type interactively.
```

### 4.1.1 `pumpp init`

脚手架命令，一行产出带注释 + `definePumpConfig()` 包装的 starter 配置文件。

```bash
pumpp init                 # 生成 pumpp.config.ts（默认）
pumpp init --format mjs    # 生成 pumpp.config.mjs
pumpp init --format json   # 生成 pumpp.config.json
pumpp init --force         # 覆盖已存在的配置
```

- 检测到任意已存在的 `pumpp.config.{ts,mts,mjs,cjs,js,json}` → 退出码 `1`，提示加 `--force`
- `--cwd <dir>` 可把文件写到指定目录
- 生成的模板包含：三类内置 type、manifest 配置、被注释掉的 `tokenProviders` 和 `customBranchName` 示例（即刻可用 + 渐进式解锁定制）

### 4.2 全局选项

| 选项              | 说明                                                   |
| ----------------- | ------------------------------------------------------ |
| `-C, --cwd <dir>` | 工作目录（默认 `process.cwd()`）                       |
| `--config <path>` | 指定配置文件路径                                       |
| `-q, --quiet`     | 抑制非错误输出（progress / 成功提示），错误仍写 stderr |
| `--debug`         | 打印错误 `code` / stack / `git stderr`                 |
| `-h, --help`      | 帮助                                                   |
| `-v, --version`   | 版本号                                                 |

### 4.3 子命令共享选项

| 选项                         | 说明                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| `-b, --base <branch>`        | 覆盖 base 分支；可写 `HEAD` / `.` 表示**当前分支**（见 §5.1）              |
| `-d, --date <YYYYMMDD>`      | 覆盖 `{date}` token（默认当天）                                            |
| `--desc <text>`              | `{desc}` token 的值；若 pattern 不含 `{desc}` 则**追加到结尾** (`-desc`)   |
| `-y, --yes`                  | 跳过确认                                                                   |
| `--dry-run`                  | 仅解析分支名，不执行任何 git 写操作                                        |
| `--push` / `--no-push`       | 创建后 `git push -u <remote>`（默认关）                                    |
| `--checkout` / `--no-checkout` | 创建后 `checkout`（默认开）                                              |
| `--fetch` / `--no-fetch`     | 预先 `git fetch <remote>`（默认关；失败只 WARN，不中断）                   |
| `--git-check` / `--no-git-check` | 是否要求工作区干净（默认开）                                           |
| `--remote <name>`            | `push` / `fetch` 使用的远端（默认 `origin`）                               |
| `--file <path>`              | 读取 `{version}` 的 manifest 文件（默认 `package.json`）                   |
| `--version-key <key>`        | manifest 里的字段名（默认 `version`）                                      |

**布尔 flag 都提供 `--xxx` / `--no-xxx` 两侧**，便于 CI 从任一侧覆盖配置。

---

## 5. 配置 `pumpp.config.ts`

项目根放一份，`pumpp` 会用 [`c12`](https://github.com/unjs/c12) 自动加载：`pumpp.config.{ts,js,mjs,cjs,json}`，也支持 `package.json` 里的 `"pumpp"` 字段。

```ts
import { definePumpConfig } from 'pumpp'

export default definePumpConfig({
  base: 'main',
  remote: 'origin',
  push: false,
  checkout: true,
  confirm: true,
  gitCheck: true,
  fetch: false,

  manifest: {
    file: 'package.json',
    versionKey: 'version',
  },

  types: {
    release: {
      pattern: 'release/{version}-{date}',
      description: 'Create a release branch',
    },
    feature: {
      pattern: 'feature/{username}-{date}-{desc?}',
      requiredTokens: ['username'],
    },
    hotfix: {
      pattern: 'hotfix/{username}-{date}',
      base: 'main',
    },
    // 自定义类型自动生成子命令 `pumpp chore`
    chore: {
      pattern: 'chore/{username}-{desc}',
      base: 'HEAD', // 从当前 checkout 的分支切（详见 §5.1）
      description: 'Housekeeping branches',
    },
  },

  tokenProviders: [
    // 自定义 token provider（见 §7）
  ],

  // 可选：对生成的分支名做最终变换（见 §7.2）
  // customBranchName: (ctx) => {
  //   if (/-(?:alpha|beta|rc)/.test(ctx.tokens.version ?? ''))
  //     return ctx.branchName.replace(/^release\//, 'prerelease/')
  // },
})
```

**合并优先级**（高 → 低）：CLI 选项 > 类型配置 > 顶层默认 > 内置 defaults。

### 5.1 `base` 字段接受哪些值

`base` 最终被传给 `git branch <name> <base>` / `git checkout -b <name> <base>`，但 pumpp 在执行前会先校验 `refs/heads/<base>` 必须解析得到。所以：

| 写法 | 含义 | 通过校验？ |
| --- | --- | --- |
| `'main'` / `'master'` / `'develop'` | 任意本地分支 | ✅ |
| `'release/v2'` / `'team/foo/bar'` | 带 `/` 的多级分支名 | ✅ |
| `'HEAD'` / `'head'` / `'.'` | **当前 checkout 的分支**（运行时解析为真名） | ✅ |
| `'origin/main'` 等远端 ref | 远端引用 | ❌ → `BASE_BRANCH_MISSING` |
| tag / commit SHA | 非分支 | ❌ → `BASE_BRANCH_MISSING` |
| 不存在的本地分支 | — | ❌ → `BASE_BRANCH_MISSING` |

**`base: 'HEAD'` 的细节：**

- 大小写不敏感（`HEAD` / `head` / `Head` 都行）；`.` 是 git 习惯的等价简写
- 解析时机：在所有 git 校验和 progress 事件之前；之后整个流水线（`createBranch` 调用、`PumpBranchProgress.base`、返回的 `result.base`）都用真实分支名
- **detached HEAD 状态** → 抛 `BASE_BRANCH_MISSING`，提示先 checkout 一个分支
- 适合场景：`feature` / `chore` 类型希望"从用户当前所在分支切"而非硬编码 `main`

```ts
types: {
  // 永远从 main 切（默认）
  release: { pattern: 'release/{version}-{date}' },

  // 跟随当前分支：在 dev 上就从 dev 切，在 release/v2 上就从 release/v2 切
  feature: { pattern: 'feature/{username}-{date}-{desc?}', base: 'HEAD' },
  chore:   { pattern: 'chore/{desc}', base: '.' },
}
```

CLI 也直接支持：`pumpp feature -b HEAD --desc fix-typo`。

---

## 6. 模板语法

pattern 是普通字符串 + 形如 `{name}` / `{name?}` 的 token 占位符。

```
release/{version}-{date}
feature/{username}-{date}-{desc?}
```

### 6.1 必需 vs 可选

- `{name}` **必需**：解析失败 → `UNRESOLVED_TOKEN`
- `{name?}` **可选**：解析失败则**连同相邻分隔符一起被清理**

例：pattern = `feature/{username}-{date}-{desc?}`

- 有 `desc=login` → `feature/alice-20260418-login`
- 无 `desc` → `feature/alice-20260418`（尾部 `-` 自动清理）

### 6.2 内置 providers

| token      | 来源                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| `version`  | `manifest.file` + `manifest.versionKey`（JSONC 解析）                          |
| `major/minor/patch` | `semver.parse(version)`                                                |
| `date`     | 当前时间 → `YYYYMMDD`；`--date` 可覆盖                                         |
| `year/month/day` | `date` 分片                                                              |
| `username` | `git config user.name` → `$USER`/`$USERNAME` → `os.userInfo().username`，slug  |
| `desc`     | `--desc`                                                                       |
| `branch`   | 当前 HEAD 分支名，slug                                                         |
| `random`   | 6 位随机 hex                                                                   |

### 6.3 token 合法化

解析完的 token 值会依次经过：

1. `slugifyBranchToken`（空格/特殊字符 → `-`；保留 ASCII letter/digit/`-`/`_`/`/`）
2. 模板替换
3. 清理孤立分隔符
4. `git check-ref-format --branch <name>` 校验；失败 → `INVALID_BRANCH_NAME`

---

## 7. 扩展：三层定制能力

从"临时改一次"到"写死规则"，pumpp 提供四种互补的钩子，由细到粗：

| 层 | 何时用 | 粒度 | 入口 |
| --- | --- | --- | --- |
| §2.1 Accept/Edit/Cancel 菜单 | 一次性微调这一条分支名 | 单次 | CLI 运行时 prompt |
| §7.1 覆盖 token provider | 改 `{version}` / `{date}` 等某个 token 的值 | 所有用到该 token 的分支 | `pumpp.config` 的 `tokenProviders` |
| §7.2 `customBranchName` hook | 对完整分支名做最终变换（条件路由 / 替换） | 每类型 或 全局 | `pumpp.config` 或 `pumpBranch()` runtime |
| §8 编程式 `pumpBranch()` | 完全自定义流程 | 任意 | TS/JS 脚本 |

### 7.1 自定义 / 覆盖 token provider

```ts
import { definePumpConfig } from 'pumpp'

export default definePumpConfig({
  types: {
    feature: { pattern: 'feature/{ticket}-{desc}' },
  },
  tokenProviders: [
    // 新增 {ticket} token
    {
      name: 'ticket',
      resolve: () => process.env.JIRA_TICKET?.toLowerCase(),
    },
    // 覆盖内置 {version}：把 1.2.3 → 1_2_3
    {
      name: 'version',
      resolve: async (ctx) => {
        const pkg = await import(`${ctx.cwd}/package.json`, { assert: { type: 'json' } })
        return String(pkg.default.version).replace(/\./g, '_')
      },
    },
    // 依赖其它 token：topo 排序保证先解析 username
    {
      name: 'env-suffix',
      dependsOn: ['username'],
      resolve: ctx => `${ctx.tokens.username}-prod`,
    },
  ],
})
```

`TokenProviderSpec`：

```ts
interface TokenProviderSpec {
  name: string
  dependsOn?: string[] // 其他 provider 的 name
  resolve: (ctx: TokenContext) => Promise<string | undefined> | string | undefined
}

interface TokenContext {
  cwd: string
  type: string
  globals: ResolvedGlobals
  typeConfig: ResolvedTypeConfig
  runtime: PumpRuntimeOptions
  tokens: Record<string, string> // 已解析的 token
}
```

- **返回 `undefined` 或空串**：视为未解析；若该 token 是必需的 → 抛 `UNRESOLVED_TOKEN`
- **用户 provider 会与内置 provider 合并**，同名时**用户覆盖内置**
- **循环依赖** → `CONFIG_INVALID`

### 7.2 `customBranchName` 钩子：条件路由 / 最终变换

当 token-level 覆盖不够用——例如"pre-release 版本要改前缀"——挂一个 `customBranchName` 钩子：

```ts
import { definePumpConfig } from 'pumpp'

export default definePumpConfig({
  types: {
    release: {
      pattern: 'release/{version}-{date}',
      // 只对 release 生效
      customBranchName: (ctx) => {
        if (/-(?:alpha|beta|rc)/.test(ctx.tokens.version ?? ''))
          return ctx.branchName.replace(/^release\//, 'prerelease/')
      },
    },
  },
  // 对所有类型兜底生效
  customBranchName: ctx => ctx.branchName.toLowerCase(),
})
```

**合并优先级**（高 → 低）：

1. `pumpBranch(type, { customBranchName })` runtime（编程式 API 调用）
2. `types.X.customBranchName` （类型级）
3. `customBranchName` （全局）

**签名：**

```ts
type CustomBranchNameHook = (ctx: NameContext) => string | Promise<string | void> | void

interface NameContext {
  type: string
  pattern: string
  tokens: Record<string, string> // 已 slugify 的完整 token map
  typeConfig: ResolvedTypeConfig
}
```

- 返回 **非空字符串** → 作为新分支名，继续跑 `git check-ref-format` 校验和碰撞检测
- 返回 `undefined` / `void` / 空串 → 保留默认渲染结果
- 支持 `async` / 返回 `Promise`

**注意**：hook 返回的名字不走 slugify（`slugifyBranchToken` 只处理单个 token 值），所以你有权返回任意带 `/` 的合法 Git ref；但仍受 `git check-ref-format --branch` 校验。

---

## 8. 编程式 API

```ts
import { loadPumpConfig, pumpBranch } from 'pumpp'

const result = await pumpBranch('release', {
  desc: 'v2-launch',
  push: true,
  yes: true,
  customBranchName: (ctx) => {
    // 可返回自定义名覆盖默认渲染结果；返回 undefined 则保留原名
    if (ctx.type === 'feature' && ctx.tokens.desc === 'emergency')
      return `hotfix/${ctx.tokens.username}-emergency`
  },
  progress: (p) => {
    console.log('[progress]', p.event, p.branchName)
  },
})

console.log(result.branchName) // e.g. release/1.2.3-20260418-v2-launch
```

### 8.1 核心 API

```ts
pumpBranch(
  type: string,
  runtime?: PumpRuntimeOptions,
  deps?: PumpDeps, // 可注入用于测试
): Promise<PumpBranchResults>
```

### 8.2 `PumpBranchResults`

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

### 8.3 Progress 事件（共 7 个）

```
config-loaded → tokens-resolved → name-resolved → git-preflight
 → confirmed → git-branch-created → git-pushed
```

---

## 9. 错误码 & 退出码

| code                                 | 退出码 |
| ------------------------------------ | ------ |
| `ABORTED_BY_USER`                    | 0      |
| `INVALID_ARGUMENT`                   | 1      |
| `UNKNOWN_BRANCH_TYPE`                | 1      |
| `CONFIG_INVALID`                     | 1      |
| `UNRESOLVED_TOKEN`                   | 1      |
| `INVALID_BRANCH_NAME`                | 1      |
| `NOT_A_GIT_REPO`                     | 2      |
| `DIRTY_WORKING_TREE`                 | 2      |
| `BASE_BRANCH_MISSING`                | 2      |
| `BRANCH_ALREADY_EXISTS`              | 2      |
| `GIT_COMMAND_FAILED`                 | 2      |
| `UNKNOWN`                            | 2      |

- 默认输出 `✖ <message>\n  hint: <...>`，不打印 `code` 和 stack
- `--debug` 或 `NODE_ENV=development`：追加 `code` / stack / git stderr
- `--quiet`：抑制成功与 progress；错误仍写 stderr

---

## 10. 工作流示例

### 10.1 本仓库约定

> `main` 是主分支；`release` 从 `main` 切；`feature` 也从 `main` 切；
> `hotfix` 从 `main` 切直接合回 `main`。

默认配置已满足：三类 base 都是 `main`。

### 10.2 CI：发版

```yaml
- name: Cut release branch
  run: pumpp release -y --push
```

### 10.3 本地：日常新特性

```bash
pumpp feature --desc oauth-refresh
# → feature/alice-20260418-oauth-refresh（确认后创建并 checkout）
```

### 10.4 紧急修复

```bash
pumpp hotfix --desc cve-fix --push -y
```

---

## 11. FAQ

**Q：如何只预览分支名不改仓库？**
A：`--dry-run`。preflight 检查也会执行，但不跑 `git branch` / `push`。

**Q：怎么关掉工作区检查？**
A：`--no-git-check`；或在配置里把 `gitCheck: false`。

**Q：同名分支已存在怎么办？**
A：会抛 `BRANCH_ALREADY_EXISTS`（退出码 2）。解决：`--desc` 加后缀、在确认提示里就地改名（见 §2.1）、或手动 `git branch -D`。

**Q：生成的分支名不满意，不想 Ctrl-C 重跑怎么办？**
A：在确认菜单里选 **✎ Edit**（§2.1），分支名会预填在输入框里直接改，Enter 提交；改后会再跑 `git check-ref-format` 和碰撞检查，非法会抛 `INVALID_BRANCH_NAME`。更结构化的定制见 §7。

**Q：想让 `feature` 从 `dev` 切？**
A：在 `types.feature.base = 'dev'`，或命令行 `pumpp feature --base dev`。

**Q：想从"我现在所在的分支"切，不写死？**
A：把 `base` 写成 `'HEAD'`（或简写 `'.'`），运行时会解析成当前分支名。CLI 也可以 `pumpp feature -b HEAD`。在 detached HEAD 状态下会拒绝并提示。完整规则见 §5.1。

**Q：`{version}` 从哪读？**
A：默认 `package.json` 的 `version`。通过 `manifest.file` / `manifest.versionKey` 或 CLI `--file` / `--version-key` 覆盖。JSONC（带注释）也支持。

**Q：为什么 `--fetch` 失败只是 WARN？**
A：离线 / 无权限是常态，不应阻断本地分支创建。探测远端同名分支用的是 `git ls-remote`，只在 `--push` 或 `--fetch` 开启时才查。

---

## 12. 参考

- 设计文档：[`docs/specs/2026-04-18-pumpp-branch-cli-design.md`](./specs/2026-04-18-pumpp-branch-cli-design.md)
- 实现计划：[`docs/specs/2026-04-18-pumpp-branch-cli-plan.md`](./specs/2026-04-18-pumpp-branch-cli-plan.md)
- 姊妹项目：[`bumpp`](https://github.com/antfu-collective/bumpp)（version-bump）
