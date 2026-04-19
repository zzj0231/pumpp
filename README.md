# pumpp

> **b**ranch-**pumpp** — create convention-based git branches from manifest version and project config.

`bumpp` 管版本号，`pumpp` 管分支名。按项目既定的命名规范（`release/{version}-{date}`、`feature/{username}-{desc?}-{date}` 等）一键生成并创建分支。

- **零配置可用**：内置 `release` / `feature` / `hotfix` 三类；`pumpp init` 一键出脚手架
- **配置驱动**：在 `pumpp.config.ts` 里注册任意类型，CLI 子命令自动生成
- **模板 + token**：`{version}` / `{date}` / `{username}` / `{desc?}` 等 8 类内置 token，支持自定义
- **可选 token**：`{desc?}` 未解析时连同分隔符一并清理
- **友好确认菜单**：Accept / Edit / Cancel 三选；选 Edit 可在预填 buffer 里光标就位改分支名
- **意图驱动**：`release` 全自动；`feature` / `hotfix` TTY 下默认询问 `desc`，空回车给警告 + 二次询问，CI 用 `-y` 跳过
- **三层定制**：token provider 覆盖 / `customBranchName` 钩子 / 编程式 API，按需选
- **Git 安全**：干净工作区检查、`git check-ref-format` 校验、同名分支探测
- **完整 DI**：核心流水线可注入 deps，易于测试与嵌入

---

## 安装

```bash
pnpm add -D pumpp      # 项目依赖
pnpm add -g pumpp      # 或全局
```

Node.js `>= 18`。

## 快速开始

```bash
# 一键生成 pumpp.config.ts 脚手架（可选；不跑也能用）
pumpp init

# 从 main 切一条 release 分支，默认 pattern: release/{version}-{date}
pumpp release

# 无参 → 交互模式
pumpp

# 仅解析不写仓库
pumpp feature --desc login --dry-run
# → Dry run: feature/<user>-login-20260418

# 创建并推送
pumpp hotfix --desc cve-fix --push -y
```

## 自定义

手写（或 `pumpp init` 之后）在项目根留一份 `pumpp.config.ts`：

```ts
import { definePumpConfig } from 'pumpp'

export default definePumpConfig({
  base: 'main',
  types: {
    release: { pattern: 'release/{version}-{date}' },
    feature: { pattern: 'feature/{username}-{desc?}-{date}' },
    hotfix: { pattern: 'hotfix/{username}-{desc?}-{date}' },
    chore: { pattern: 'chore/{username}-{desc}' },
  },
})
```

自定义 token provider：

```ts
import { definePumpConfig } from 'pumpp'

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

条件路由 / 最终变换——`customBranchName` 钩子（全局或每类型）：

```ts
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
import { pumpBranch } from 'pumpp'

const { branchName } = await pumpBranch('release', {
  desc: 'v2-launch',
  push: true,
  yes: true,
})
```

## 文档

- **使用说明**：[`docs/usage.md`](./docs/usage.md)（命令 / 配置 / 模板 / API / 错误码全覆盖）

## License

MIT
