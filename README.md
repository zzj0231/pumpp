# pumpp

> **b**ranch-**pumpp** — create convention-based git branches from manifest version and project config.

`bumpp` 管版本号，`pumpp` 管分支名。按项目既定的命名规范（`release/{version}-{date}`、`feature/{username}-{date}-{desc?}` 等）一键生成并创建分支。

- **零配置可用**：内置 `release` / `feature` / `hotfix` 三类
- **配置驱动**：在 `pumpp.config.ts` 里注册任意类型，CLI 子命令自动生成
- **模板 + token**：`{version}` / `{date}` / `{username}` / `{desc?}` 等 8 类内置 token，支持自定义
- **可选 token**：`{desc?}` 未解析时连同分隔符一并清理
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
# 从 main 切一条 release 分支，默认 pattern: release/{version}-{date}
pumpp release

# 无参 → 交互模式
pumpp

# 仅解析不写仓库
pumpp feature --desc login --dry-run
# → Dry run: feature/<user>-20260418-login

# 创建并推送
pumpp hotfix --desc cve-fix --push -y
```

## 自定义

在项目根加 `pumpp.config.ts`：

```ts
import { definePumpConfig } from 'pumpp'

export default definePumpConfig({
  base: 'main',
  types: {
    release: { pattern: 'release/{version}-{date}' },
    feature: { pattern: 'feature/{username}-{date}-{desc?}' },
    hotfix: { pattern: 'hotfix/{username}-{date}' },
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
