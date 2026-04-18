import type { TokenProviderSpec } from './token-provider'

export interface ManifestOptions {
  file?: string
  versionKey?: string
}

/**
 * Post-render branch-name hook. Receives the fully-resolved context and
 * may return a replacement name; returning `undefined` / `void` keeps the
 * default rendered name.
 *
 * Priority (high → low): runtime `customBranchName` > type-level > global.
 */
export type CustomBranchNameHook = (
  ctx: import('./pump-runtime-options').NameContext,
) => string | Promise<string | void> | void

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
  customBranchName?: CustomBranchNameHook
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
  customBranchName?: CustomBranchNameHook
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
  customBranchName?: CustomBranchNameHook
}

export interface ResolvedPumpConfig {
  globals: ResolvedGlobals
  types: Record<string, ResolvedTypeConfig>
  tokenProviders: TokenProviderSpec[]
  customBranchName?: CustomBranchNameHook
}
