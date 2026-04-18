import type { TokenProviderSpec } from './token-provider'

export interface ManifestOptions {
  file?: string
  versionKey?: string
}

export interface TypeInputConfig {
  pattern: string
  base?: string
  push?: boolean
  checkout?: boolean
  confirm?: boolean
  gitCheck?: boolean
  fetch?: boolean
  requiredTokens?: string[]
  description?: string
}

export interface PumpInputConfig {
  base?: string
  push?: boolean
  checkout?: boolean
  confirm?: boolean
  gitCheck?: boolean
  fetch?: boolean
  remote?: string
  manifest?: ManifestOptions
  types?: Record<string, TypeInputConfig>
  tokenProviders?: TokenProviderSpec[]
}

export interface ResolvedGlobals {
  base: string
  push: boolean
  checkout: boolean
  confirm: boolean
  gitCheck: boolean
  fetch: boolean
  remote: string
  manifest: Required<ManifestOptions>
}

export interface ResolvedTypeConfig {
  name: string
  pattern: string
  base: string
  push: boolean
  checkout: boolean
  confirm: boolean
  gitCheck: boolean
  fetch: boolean
  requiredTokens: string[]
  description?: string
}

export interface ResolvedPumpConfig {
  globals: ResolvedGlobals
  types: Record<string, ResolvedTypeConfig>
  tokenProviders: TokenProviderSpec[]
}
