import type { PumpBranchOptions } from './type/branch-pump-options'
import { loadConfig } from 'c12'
import { pumpConfigDefaults } from './config'

export async function loadPumpConfig(
  cwd: string,
  configFile?: string,
): Promise<PumpBranchOptions> {
  const { config } = await loadConfig<PumpBranchOptions>({
    name: 'pumpp',
    cwd,
    defaults: pumpConfigDefaults,
    packageJson: ['pumpp'],
    dotenv: true,
    ...(configFile ? { configFile } : {}),
  })

  return config
}
