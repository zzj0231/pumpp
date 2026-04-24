# Pumpp CLI 交互式 Token 输入设计文档

- **日期**：2026-04-22
- **主题**：支持为自定义 token 配置交互式输入，并将现有 `{desc}` 特判抽象为通用机制
- **标题建议**：`feat(cli): 支持为自定义 token 配置 interactive 输入`
- **文档状态**：设计已在对话中确认；待用户 review 本文后，再进入 `writing-plans`

---

## 1. 背景

当前 `pumpp-cli` 已支持通过 `pattern` 和 `tokenProviders` 自定义分支命名规则，例如：

```ts
style: {
  pattern: 'style({module})/{username}-{desc?}',
}
```

渲染层面这类模板是可行的：只要 `{module}` 能被 provider 或运行时参数解析，最终即可生成类似 `style(layout)/zhijiang.zhao-sidebar-fix` 的分支名。

但 CLI 侧目前只有内置 `{desc}` 支持交互式输入。结果是：

- `pumpp style` 时，CLI 只会围绕 `desc` 提供交互
- 自定义 token（如 `module`）即使出现在 `pattern` 中，也不会进入交互输入
- 当自定义 token 无法通过 provider 成功解析时，会直接报 `UNRESOLVED_TOKEN`

这让自定义 token 的交互体验与 `{desc}` 不一致，也限制了更灵活的分支模板设计。

## 2. 目标与非目标

### 2.1 目标

- 将当前仅支持 `{desc}` 的交互输入能力，抽象为“支持任意声明为可交互 token 的输入补全”
- 保持现有 `{desc}` 行为兼容
- 支持多个 token 的顺序交互和 live preview
- 在 `TTY` / `--yes` / 非交互 / CI 场景下保持现有语义稳定
- 不破坏已有配置和已有命令用法

### 2.2 非目标

- 第一版不支持为交互 token 自定义 `message` / `placeholder` / `validate`
- 第一版不支持“provider 已有值但仍然提示用户覆盖”
- 第一版不支持“自动对所有缺失 token 进行交互”
- 第一版不把 `customBranchName` 接入每次按键级别的实时预览

## 3. 核心设计决策

### 3.1 交互能力挂在 `tokenProvider`

本次不新增独立的 `promptTokens` 配置，而是在 `TokenProviderSpec` 上增加：

```ts
interface TokenProviderSpec {
  name: string
  dependsOn?: string[]
  interactive?: boolean
  resolve: (ctx: TokenContext) => Promise<string | undefined> | string | undefined
}
```

语义为：

- `resolve()` 始终先执行
- 当 token 仍未成功解析，且 `interactive: true` 时，CLI 才允许进入交互输入
- `interactive: true` 是“缺失值兜底”，不是“无论如何都要询问”

推荐配置示例：

```ts
tokenProviders: [
  {
    name: 'module',
    interactive: true,
    resolve: () => process.env.BRANCH_MODULE,
  },
]
```

### 3.2 内置 `desc` 退化为同一机制

内置 `desc` provider 视为内建的交互 token，默认带：

```ts
{ name: 'desc', interactive: true, resolve: ctx => ctx.runtime.desc?.trim() || undefined }
```

这样可以保留现有 CLI 行为，同时逐步移除 `desc` 的专属特判逻辑。

### 3.3 交互顺序按 pattern 首次出现顺序

若多个 token 都需要交互输入，提示顺序按 `pattern` 中首次出现的顺序决定，而不是 provider 注册顺序。

例如：

```ts
pattern: 'style({module})/{username}-{desc?}'
```

交互顺序为：

1. `module`
2. `desc`

这样更符合用户对模板本身的阅读顺序，也使 preview 更直观。

## 4. 数据流调整

### 4.1 从“单阶段解析”改为“两阶段补齐”

现有 `resolveTokens()` 主要负责自动解析，并在必需 token 缺失时直接报错。本次建议调整为两阶段：

1. **自动解析阶段**
  - 扫描 `pattern` 和 `requiredTokens`
  - 调度 provider，尽可能自动解析 token
  - 不立即对“可交互但缺失”的 token 报错
2. **CLI 交互补齐阶段**
  - CLI 从解析结果中拿到“缺失且允许交互”的 token 列表
  - 在可交互环境中逐个 prompt
  - 用户输入后更新 token state，再统一渲染 branch name

### 4.2 解析层新增的结果结构

建议将当前“只返回 `Record<string, string>`”的形态扩成更丰富的元数据结果，例如：

```ts
interface ResolvedTokenState {
  values: Record<string, string>
  missing: {
    name: string
    optional: boolean
    interactive: boolean
  }[]
}
```

其中：

- `values` 表示自动解析成功的 token
- `missing` 表示本次需要关注但尚未拿到值的 token
- `interactive` 来自 `TokenProviderSpec.interactive`

CLI 据此决定是否进入 prompt；核心渲染层仍只消费最终 token map。

### 4.3 必需 token 的判定保持原语义

token 是否必需，仍然由以下规则决定：

- `pattern` 中的 `{name}` 为必需
- `pattern` 中的 `{name?}` 为可选
- `requiredTokens` 可将某些 token 提升为必需

本次新增的 `interactive` 不改变“必需 / 可选”本身，只改变“缺失时是否允许提示用户补值”。

## 5. CLI 交互与 Preview

### 5.1 CLI 交互流程

`pumpp <type>` 的交互流程调整为：

1. 加载配置，定位 type
2. 扫描当前 `pattern` + `requiredTokens`
3. 自动解析 token
4. 筛出“缺失且 `interactive: true`”的 token
5. 若当前环境允许交互，则按顺序逐个提示输入
6. 每次输入后更新 token state，并刷新 preview
7. 全部补齐后，进入现有确认 / 编辑 / preflight / create / push 流程

### 5.2 Preview 从 `desc` 专属改为多 token 通用

当前 `previewBranchName()` 仅支持 `renderWith(desc)`，内部仍带有 `{desc}` 填槽或尾部追加逻辑。

本次建议改成基于完整 token state 的同步重渲染接口，例如：

```ts
interface PreviewBranchResult {
  type: string
  pattern: string
  branchName: string
  tokens: Record<string, string>
  missing: {
    name: string
    optional: boolean
    interactive: boolean
  }[]
  renderWith: (patch: Record<string, string | undefined>) => string
}
```

其行为为：

- 初次调用时，先完成一次自动解析
- `renderWith()` 只对已有 token state 做同步 patch + 渲染
- 不重复执行 git / manifest / provider IO
- 不在按键级别重新执行 `customBranchName`

CLI 在用户输入 `module`、`desc` 等值时，只需更新本地 patch 即可刷新 preview。

### 5.3 移除 `desc` 尾部追加特判

当前存在“若 pattern 不含 `{desc}`，但运行时有 `desc`，则在末尾追加 `-${desc}`”的专属逻辑。

本次建议将其保留为**兼容语义**，但实现方式改为：

- CLI / runtime 继续支持 `--desc`
- 解析层将其视作内置 `desc` token 的预填值
- 渲染阶段不再写死“只针对 desc 单独处理”
- 若需要“pattern 不含 token 但输入后仍追加尾段”的兼容行为，则由通用 token state + 兼容分支处理完成，而不是在 CLI 交互里单独硬编码

换言之，第一版的外部行为可保持不变，但内部模型应从 “special-case desc” 切到 “token-state driven rendering”。

## 6. 兼容行为与错误处理

### 6.1 何时允许 prompt

只有在以下条件满足时，CLI 才进入交互输入：

- 当前 session 可交互（TTY 等）
- 未显式关闭交互（如 `--yes`）
- token 已注册 provider，且 `interactive: true`
- 自动解析阶段未拿到值

### 6.2 非交互环境下的行为

在 `--yes`、非 TTY、CI 或其它不可交互环境下：

- 不进入 prompt
- 必需 token 若仍未解析成功，继续报 `UNRESOLVED_TOKEN`
- 可选 token 若缺失，则直接留空

因此，`interactive: true` 的真实语义是：

> 允许在可交互环境下对缺失 token 做兜底输入；不保证所有环境都能交互。

### 6.3 错误提示增强

当某个 token 具备 `interactive: true`，但当前运行环境无法 prompt 且该 token 又是必需时，建议在现有 `UNRESOLVED_TOKEN` 基础上增加 hint，例如：

- `Token "module" is interactive, but prompting is unavailable in non-interactive mode`
- `Provide the value explicitly or run pumpp in an interactive TTY session`

这能帮助用户理解“为什么本地能问，但 CI 中会报错”。

## 7. 示例

配置：

```ts
export default definePumpConfig({
  types: {
    style: {
      pattern: 'style({module})/{username}-{desc?}',
    },
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

当执行：

```bash
pumpp style
```

期望行为：

1. `module` 未从环境变量解析到，进入 prompt，用户输入 `layout`
2. `desc` 沿用现有内置交互，用户输入 `sidebar-fix`
3. preview 实时显示最终分支名
4. 最终生成：`style(layout)/zhijiang.zhao-sidebar-fix`

若在 CI 中执行同样命令：

- 不进入 prompt
- `module` 为必需 token，因此报 `UNRESOLVED_TOKEN`
- `desc` 为可选 token，可直接留空

## 8. 测试建议

本次实现后，至少补足以下测试：

- `tokenProviders`：`interactive` 字段的类型和默认行为
- `resolveTokens`：provider 返回空时，区分 `interactive: true/false`
- `previewBranchName`：支持多个交互 token 的 `renderWith(patch)`
- CLI 交互：`module -> desc` 的顺序 prompt 与 preview
- 非交互模式：必需交互 token 缺失时报错，可选 token 缺失时跳过
- 兼容回归：现有 `feature --desc login` 行为不变

建议增加一条 e2e：

```bash
pumpp style
```

覆盖以下场景：

- 自定义 `module` token 配置了 `interactive: true`
- provider 未返回值
- CLI 顺序提示 `module`、`desc`
- 最终成功创建期望分支名

## 9. 最小落地范围

第一版实现仅包含：

- `TokenProviderSpec` 增加 `interactive?: boolean`
- 内置 `desc` provider 默认 `interactive: true`
- token 解析结果暴露缺失交互 token 元数据
- CLI 支持按 pattern 顺序补问多个 token
- preview 支持多 token 重渲染
- 保持现有 `--desc` 行为兼容

明确不包含：

- 自定义 prompt 文案
- 自定义输入校验
- provider 默认值的交互覆盖
- 所有 token 的自动交互

## 10. 变更记录

- 2026-04-22 创建文档
- 2026-04-22 确认交互能力挂载于 `tokenProvider.interactive`
- 2026-04-22 确认交互顺序按 pattern 首次出现顺序
- 2026-04-22 确认 `--yes` / 非 TTY / CI 下不进入 prompt，保留现有错误语义
- 2026-04-22 确认 preview 从 `desc` 专属升级为多 token 通用渲染

