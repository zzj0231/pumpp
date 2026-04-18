import type {
  PumpInputConfig,
  ResolvedGlobals,
  ResolvedPumpConfig,
  ResolvedTypeConfig,
  TypeInputConfig,
} from './type/pump-config'
import type { TokenProviderSpec } from './type/token-provider'
import { PumppError } from './errors'

const GLOBAL_DEFAULTS: ResolvedGlobals = {
  base: 'main',
  push: false,
  checkout: true,
  confirm: true,
  gitCheck: true,
  fetch: false,
  remote: 'origin',
  manifest: { file: 'package.json', versionKey: 'version' },
}

export function normalizePumpConfig(input: PumpInputConfig): ResolvedPumpConfig {
  const globals: ResolvedGlobals = {
    base: input.base ?? GLOBAL_DEFAULTS.base,
    push: input.push ?? GLOBAL_DEFAULTS.push,
    checkout: input.checkout ?? GLOBAL_DEFAULTS.checkout,
    confirm: input.confirm ?? GLOBAL_DEFAULTS.confirm,
    gitCheck: input.gitCheck ?? GLOBAL_DEFAULTS.gitCheck,
    fetch: input.fetch ?? GLOBAL_DEFAULTS.fetch,
    remote: input.remote ?? GLOBAL_DEFAULTS.remote,
    manifest: {
      file: input.manifest?.file ?? GLOBAL_DEFAULTS.manifest.file,
      versionKey: input.manifest?.versionKey ?? GLOBAL_DEFAULTS.manifest.versionKey,
    },
  }

  const rawTypes = input.types ?? {}
  const types: Record<string, ResolvedTypeConfig> = {}
  for (const [name, cfg] of Object.entries(rawTypes)) {
    types[name] = normalizeTypeConfig(name, cfg, globals)
  }

  if (Object.keys(types).length === 0) {
    throw new PumppError('No branch types configured', {
      code: 'CONFIG_INVALID',
      hint: 'Add at least one entry under `types` in your pumpp config',
    })
  }

  return {
    globals,
    types,
    tokenProviders: input.tokenProviders ?? [],
    customBranchName: input.customBranchName,
  }
}

function normalizeTypeConfig(
  name: string,
  cfg: TypeInputConfig,
  globals: ResolvedGlobals,
): ResolvedTypeConfig {
  if (!cfg || typeof cfg.pattern !== 'string' || !cfg.pattern.trim()) {
    throw new PumppError(`Branch type "${name}" is missing required "pattern"`, {
      code: 'CONFIG_INVALID',
    })
  }
  return {
    name,
    pattern: cfg.pattern,
    base: cfg.base ?? globals.base,
    push: cfg.push ?? globals.push,
    checkout: cfg.checkout ?? globals.checkout,
    confirm: cfg.confirm ?? globals.confirm,
    gitCheck: cfg.gitCheck ?? globals.gitCheck,
    fetch: cfg.fetch ?? globals.fetch,
    requiredTokens: cfg.requiredTokens ?? [],
    description: cfg.description,
    customBranchName: cfg.customBranchName,
  }
}

export function mergeTokenProviders(
  builtins: TokenProviderSpec[],
  user: TokenProviderSpec[],
): TokenProviderSpec[] {
  const byName = new Map(builtins.map(p => [p.name, p]))
  for (const p of user) byName.set(p.name, p)
  return Array.from(byName.values())
}
