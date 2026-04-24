import type { PumpBranchProgress } from './pump-branch-progress'
import type { ResolvedPumpConfig, ResolvedTypeConfig } from './pump-config'

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
  interactiveTokens?: Record<string, string>
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
