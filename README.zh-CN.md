# pumpp-cli

[English](./README.md) | 简体中文

> 把 Git 分支命名规范变成团队共享命令。

`pumpp-cli` 让团队把分支命名规则写进 `pumpp.config`，然后在本地和 CI 使用同一套命令创建分支。它会渲染 token、校验分支名、检查 base 分支、创建分支、可选切换分支，并可选推送到远端。

完整使用说明见 [`docs/usage.md`](./docs/usage.md)。

## 适用场景

- 团队经常创建发布分支，已经厌倦手写 `git checkout -b ...`。
- 分支命名规则散落在文档、群消息或个人记忆里。
- `release`、`feature`、`hotfix` 分支需要统一团队格式。
- 本地开发和 CI 希望共用同一套分支创建逻辑。

## 特性

- 零配置可用：内置 `release`、`feature`、`hotfix` 三类分支。
- 支持 `{version}`、`{date}`、`{username}`、`{desc?}` 等 pattern token。
- 通过 `base` 控制分支从哪里创建，例如 `main`、`HEAD` 或 `.`。
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
# 创建配置文件脚手架
pnpm pumpp init

# 添加团队共享入口
pnpm pkg set scripts.branch="pumpp"

# 交互式选择分支类型
pnpm branch

# 创建 release 分支
pnpm branch release

# 只预览分支名，不修改 Git
pnpm branch feature --desc login --dry-run

# 创建并推送 hotfix 分支
pnpm branch hotfix --desc cve-fix --push -y
```

也可以直接使用 CLI，例如 `pnpm pumpp release`、`pnpm pumpp feature --desc login`，或全局安装后运行 `pumpp release`。对团队来说，把入口写进 `package.json` scripts 更清晰，也更容易保持一致。

默认规则与 `src/config.ts` 里的 `pumpConfigDefaults` 一致：

| 类型 | 默认 Pattern |
| --- | --- |
| `release` | `release/{version}-{date}` |
| `feature` | `feature/{username}-{desc?}` |
| `hotfix` | `hotfix/{username}-{desc?}` |

## 团队接入

推荐在项目里提供统一入口：

```json
{
  "scripts": {
    "branch": "pumpp",
    "branch:release": "pumpp release",
    "branch:feature": "pumpp feature",
    "branch:hotfix": "pumpp hotfix"
  }
}
```

团队成员可以直接使用：

```bash
pnpm branch
pnpm branch:release
pnpm branch:feature --desc login
```

这样分支创建入口会像 `pnpm test` 或 `pnpm build` 一样留在项目里，不需要每个人记住原始的 `git checkout -b` 命令。

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
    feature: { pattern: 'feature/{username}-{desc?}', base: 'HEAD' },
    hotfix: { pattern: 'hotfix/{username}-{desc?}' },
    chore: { pattern: 'chore/{username}-{desc}' },
  },
})
```

`pattern` 控制分支名，`base` 控制分支从哪里切出来。顶层 `base: 'main'` 适合作为发布和热修流程的安全默认值；某个类型也可以覆盖成 `base: 'HEAD'` 或 `base: '.'`，表示从当前 checkout 的分支创建。

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
          return `prerelease/${ctx.tokens.version}-${ctx.tokens.date}`
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
