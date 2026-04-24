# pumpp-cli

> 根据版本号和项目约定，一键生成并创建规范化的 Git 分支。

`pumpp-cli` 是一个约定优先的分支命名工具。你只需要定义一次规则，它就会按模板生成分支名，并完成校验、创建、切换，以及可选的推送。

适合这类场景：

- 发布分支需要固定带版本号和日期
- `feature` / `hotfix` 分支想统一带作者、描述等（可在 pattern 中自行加入 `{date}` 等 token）
- 团队想减少手动命名出错，统一分支规范
- 本地开发和 CI 希望共用同一套规则

## 特性

- **开箱即用**：默认提供 `release`、`feature`、`hotfix`、`style` 等类型
- **配置驱动**：在 `pumpp.config.ts` 里新增类型，CLI 会自动生成对应子命令
- **模板 + token**：见下文「[内置 token](#内置-token)」；也支持在配置里增加自定义 `tokenProviders`
- **可选 token 自动清理**：例如 `{desc?}` 为空时，会连同多余分隔符一起移除
- **交互友好**：生成后可选择 `Accept`、`Edit`、`Cancel`
- **Git 安全检查**：支持工作区检查、分支名校验、同名分支探测
- **可扩展**：支持自定义 token provider、`customBranchName` 钩子和编程式 API

## 安装

```bash
pnpm add -D pumpp-cli
# 或
pnpm add -g pumpp-cli
```

需要 Node.js `>= 18`。

## 快速开始

```bash
# 可选：生成配置文件脚手架
pumpp init

# 创建 release 分支
pumpp release

# 不带参数时进入交互模式
pumpp

# 只预览结果，不修改仓库
pumpp feature --desc login --dry-run

# 创建并推送 hotfix 分支
pumpp hotfix --desc cve-fix --push -y
```

默认规则（与 `src/config.ts` 中 `pumpConfigDefaults` 一致）如下：

- `release`: `release/{version}-{date}`
- `feature`: `feature/{username}-{desc?}`
- `hotfix`: `hotfix/{username}-{desc?}`
- `style`: `style({module})/{username}-{desc}`（`{module}` 由配置里随附的 `module` token provider 提供，**不是**下表中的内置解析器，见后文「预置的 `module`」）

## 内置 token

下列 token 由库内建的 `buildBuiltinProviders()` 提供，写在模板的 `{token}` 中即可。可选占位符的写法是 `{name?}`，含义见上文「可选 token 自动清理」。

| Token | 来源 / 行为 |
|--------|-------------|
| `version` | 从 manifest 读版本（默认 `package.json` 的 `version`，可用 `--file` / `--version-key` 与全局 `manifest` 配置覆盖）。用于分支名时**不**做 slug 化，与 manifest 中字符串一致。 |
| `major` / `minor` / `patch` | 在 `version` 可解析为 SemVer 时，分别取主/次/修订号；**依赖**同次解析中已得到的 `version`。不 slug 化。 |
| `date` | 无 `--date` 时取当天 **YYYYMMDD**；有 `--date` 时按 CLI 规则校验。不 slug 化。 |
| `year` / `month` / `day` | 在已有 `date` 时从 `YYYYMMDD` 拆出；**依赖** `date`。不 slug 化。 |
| `username` | 优先 `git config user.name`，否则 `USER` / `USERNAME` 等，再本机用户名；**经过 slug 化**（小写、空白与符号折叠）。 |
| `desc` | 来自 `--desc` 或交互输入；`interactive: true`。**经过 slug 化**。 |
| `branch` | 当前 Git 分支名；**经过 slug 化**。 |
| `random` | 6 位十六进制随机串，用于模板时保持字面，不额外 slug 化。 |

在任意 pattern 中未以 `{name}` 或 `{name?}` 形式出现的 token **不会**被解析。若希望某个 token 在「pattern 里写成可选」之外仍被强制要求，请在该类型的 `requiredTokens` 中声明（见 `docs/usage.md` 或类型定义）。

### 预置的 `module`（与内置 token 不同）

`pumpp` 的默认 `types.style` 使用 `{module}`。这不是上表内建解析器，而是 **默认配置**里附带的一条 `tokenProviders` 项：通常声明 `name: 'module'`，`interactive: true`，`resolve` 可省略。`pumpp init` 会生成等价的样例。若你自定义 `types` 或覆盖 `tokenProviders`，需要自行为 `{module}`（或其它自定义名）补全 provider 定义。

## 配置示例

在项目根目录创建 `pumpp.config.ts`：

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  base: 'main',
  types: {
    release: { pattern: 'release/{version}-{date}' },
    feature: { pattern: 'feature/{username}-{desc?}' },
    hotfix: { pattern: 'hotfix/{username}-{desc?}' },
    style: { pattern: 'style({module})/{username}-{desc}' },
    chore: { pattern: 'chore/{username}-{desc}' },
  },
  tokenProviders: [{ name: 'module', interactive: true }],
})
```

## 自定义 token

如果你想把工单号、环境名等信息放进分支名，可以添加自定义 token provider：

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  types: {
    feature: { pattern: 'feature/{ticket}-{desc}' },
  },
  tokenProviders: [
    {
      name: 'ticket',
      resolve: () => process.env.JIRA_TICKET?.toLowerCase(),
    },
  ],
})
```

如果这个 token 可能需要用户补充输入，可以把 provider 标记为 `interactive: true`：

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  types: {
    style: { pattern: 'style({module})/{username}-{desc?}' },
  },
  tokenProviders: [
    {
      name: 'module',
      interactive: true,
      resolve: () => process.env.BRANCH_MODULE?.toLowerCase(),
    },
  ],
})
```

行为说明：

- 当 `resolve()` 返回了值，CLI 直接使用该值渲染分支名
- 当 `resolve()` 没有返回值时，交互模式下 CLI 会提示你补全这个 token
- 如果当前是非交互模式（例如 `-y`、无 TTY、CI 等）且这个 token 仍然是必填的，那么 CLI 会报错，而不会静默跳过

上面的 `style({module})/{username}-{desc?}` 例子里，`{module}` 是必填 token；如果 `BRANCH_MODULE` 没有提供，交互模式会先提示输入 `module`，随后再按 pattern 顺序处理可交互 token。因为 `{desc?}` 是可选 token，CLI 也会提示输入它，但允许留空。

## 自定义最终分支名

如果模板还不够，可以用 `customBranchName` 在最终输出前做一次变换：

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  types: {
    release: {
      pattern: 'release/{version}-{date}',
      customBranchName: (ctx) => {
        if (/-(?:alpha|beta|rc)/.test(ctx.tokens.version ?? ''))
          return ctx.branchName.replace(/^release\//, 'prerelease/')
      },
    },
  },
})
```

## 编程式 API

```ts
import { pumpBranch } from 'pumpp-cli'

const { branchName } = await pumpBranch('release', {
  desc: 'v2-launch',
  push: true,
  yes: true,
})
```

## 更多文档

- 使用说明：[`docs/usage.md`](./docs/usage.md)

## License

MIT