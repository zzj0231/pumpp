import type { PumpInputConfig, ResolvedPumpConfig } from './type/pump-config'
import { loadConfig } from 'c12'
import { pumpConfigDefaults } from './config'
import { mergeTokenProviders, normalizePumpConfig } from './type-registry'
import { buildBuiltinProviders } from './utils/token-providers'

export async function loadPumpConfig(
  cwd: string,
  configFile?: string,
): Promise<ResolvedPumpConfig> {
  const { config } = await loadConfig<PumpInputConfig>({
    name: 'pumpp',
    cwd,
    defaults: pumpConfigDefaults,
    packageJson: ['pumpp'],
    dotenv: false,
    ...(configFile ? { configFile } : {}),
  })
  const normalized = normalizePumpConfig(config ?? {})
  normalized.tokenProviders = mergeTokenProviders(
    buildBuiltinProviders(),
    normalized.tokenProviders,
  )
  return normalized
}
