import type { PumpBranchProgress } from './branch-pump-progress'
import type { BranchType } from './release-type'

/**
 * Options for the `versionBump()` function.
 */
export interface PumpBranchOptions {
  /**
   * branch type
   *
   * @default "release".
   */
  type?: BranchType

  /**
   * 是否推送到远程分支
   * @default "true".
   */
  push?: boolean

  /**
   * 是否切换分支
   * @default "true".
   */
  checkout?: boolean

  /**
   * Prompt for confirmation
   *
   * @default true
   */
  confirm?: boolean

  /**
   * 设置提取项目版本号的文件. For certain known files ("package.json", "bower.json", etc.)
   *
   * @default "package.json"
   */
  file?: string

  /**
   * 设置提取项目版本号的key
   *
   * @default "version"
   */

  versionKey?: string

  /**
   * The working directory, which is used as the basis for locating all files.
   *
   * Defaults to `process.cwd()`
   */
  cwd?: string

  /**
   * 用户自定义分支名称模式，在用户选择分支类型后，会调用该函数获取分支名
   */
  customBranchName?: (
    currentVersion: string,
    type: BranchType,
  ) => Promise<string | void> | string | void

  /**
   * release分支名称模板，支持占位符: {version}、{date} 等
   * 例如 release/{version}-{date} 会生成 release/1.29.0-20260407
   * @default "release/{version}-{date}"
   */
  releasePattern?: string

  /**
   * hotfix分支名称模板，支持占位符: {version}、{date} 等
   *
   * 例如 hotfix/{username}-{date} 会生成 hotfix/tomos-20260407
   *
   * @default "hotfix/{username}-{date}"
   */
  hotfixPattern?: string

  /**
   * feature分支名称模板，支持占位符: {version}、{date} 等
   *
   * 例如 feature/{username}-{date} 会生成 feature/tomos-20260407
   *
   * @default "feature/{username}-{date}"
   */
  featurePattern?: string

  /**
   * Use TTY stdin/stdout for prompts and logs.
   *
   * - `true` — `process.stdin` / `process.stdout`
   * - `false` — disable interactive prompts (combine with explicit options or non-interactive flags)
   *
   * @default true
   */
  stdio?: boolean

  /**
   * Remote name used when pushing the new branch.
   *
   * @default "origin"
   */
  remote?: string

  /**
   * If true, only resolve the branch name and print actions without running git.
   */
  dryRun?: boolean

  /**
   * A callback that is provides information about the progress of the `pumpBranch()`.
   *
   * @param progress
   *
   * @returns
   */
  progress?: (progress: PumpBranchProgress) => void
}

/**
 * Options for the command-line interface.
 */
export interface InterfaceOptions {
  /**
   * The stream that will be used to read user input.  Can be one of the following:
   *
   * - `true` - To default to `process.stdin`
   * - `false` - To disable all CLI input
   * - Any readable stream
   *
   * Defaults to `true`.
   */
  input?: NodeJS.ReadableStream | NodeJS.ReadStream | boolean

  /**
   * The stream that will be used to write output, such as prompts and progress.
   * Can be one of the following:
   *
   * - `true` - To default to `process.stdout`
   * - `false` - To disable all CLI output
   * - Any writable stream
   *
   * Defaults to `true`.
   */
  output?: NodeJS.WritableStream | NodeJS.WriteStream | boolean

  /**
   * Any other properties will be passed directly to `readline.createInterface()`.
   * See the `ReadLineOptions` interface for possible options.
   */
  [key: string]: unknown
}
