import type { ResolvedGlobals, ResolvedTypeConfig } from './pump-config'
import type { PumpRuntimeOptions } from './pump-runtime-options'

export interface TokenContext {
  cwd: string
  type: string
  globals: ResolvedGlobals
  typeConfig: ResolvedTypeConfig
  runtime: PumpRuntimeOptions
  tokens: Record<string, string>
}

export interface MissingTokenSpec {
  name: string
  optional: boolean
  interactive: boolean
}

export interface ResolvedTokenState {
  values: Record<string, string>
  missing: MissingTokenSpec[]
}

export interface TokenProviderSpec {
  name: string
  dependsOn?: string[]
  interactive?: boolean
  resolve?: (ctx: TokenContext) => Promise<string | undefined> | string | undefined
}
