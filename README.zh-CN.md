# pumpp-cli

[English](./README.md) | 简体中文

> 根据项目配置和 manifest 版本号，创建符合约定的 Git 分支。

`pumpp-cli` 是一个小型 CLI，用来把团队的分支命名规则变成可重复执行的命令。你只需要定义一次 pattern，之后交给 `pumpp` 渲染分支名、校验、创建分支、可选切换分支，并可选推送到远端。

完整使用说明见 [`docs/usage.md`](./docs/usage.md)。

## 适用场景

- 发布分支需要固定的版本号和日期格式。
- `feature` / `hotfix` 分支需要统一团队命名规则。
- 想减少手写分支名带来的拼写错误和格式漂移。
- 本地开发和 CI 希望共用同一套分支创建逻辑。

## 特性

- 零配置可用：内置 `release`、`feature`、`hotfix` 三类分支。
- 支持 `{version}`、`{date}`、`{username}`、`{desc?}` 等 pattern token。
- 可选 token 会自动清理多余分隔符，例如 `{desc?}` 为空时不会留下多余的 `-`。
- 创建分支前会提示 `Accept`、`Edit`、`Cancel`。
- 提供 Git 安全检查：工作区状态、分支名合法性、同名分支碰撞。
- 支持自定义分支类型、自定义 token provider、`customBranchName` 和编程式 API。

## 安装

```bash
pnpm add -D pumpp-cli
# 或
pnpm add -g pumpp-cli
```

需要 Node.js `>= 18`。

## 快速开始

```bash
# 可选：创建配置文件脚手架
pumpp init

# 创建 release 分支
pumpp release

# 交互式选择分支类型
pumpp

# 只预览分支名，不修改 Git
pumpp feature --desc login --dry-run

# 创建并推送 hotfix 分支
pumpp hotfix --desc cve-fix --push -y
```

默认规则与 `src/config.ts` 里的 `pumpConfigDefaults` 一致：

| 类型 | 默认 Pattern |
| --- | --- |
| `release` | `release/{version}-{date}` |
| `feature` | `feature/{username}-{desc?}` |
| `hotfix` | `hotfix/{username}-{desc?}` |

## 内置 Token

| Token | 来源 |
| --- | --- |
| `version` | manifest 版本号，默认是 `package.json#version` |
| `major` / `minor` / `patch` | 从 `version` 解析出的 SemVer 片段 |
| `date` | 当前日期 `YYYYMMDD`，也可以用 `--date` 覆盖 |
| `year` / `month` / `day` | 从 `date` 拆出的日期片段 |
| `username` | Git 用户名、环境用户或系统用户名，然后 slug 化 |
| `desc` | `--desc` 或交互输入，然后 slug 化 |
| `branch` | 当前 Git 分支名，然后 slug 化 |
| `random` | 6 位随机十六进制字符串 |

Token 只有出现在 pattern 里，例如 `{name}` 或 `{name?}`，才会被解析。如果某个类型需要强制要求一个未直接写进 pattern 的 token，可以使用 `requiredTokens`。

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
    chore: { pattern: 'chore/{username}-{desc}' },
  },
})
```

## 自定义 Token

如果分支名需要读取项目自己的数据，比如工单号，可以添加 token provider：

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

如果 token 可能需要用户输入，可以标记为 `interactive: true`。在非交互模式下，未解析的必需 token 会直接失败，不会静默跳过。

## 自定义最终分支名

当 pattern 渲染不够用时，可以使用 `customBranchName`：

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

## License

MIT
