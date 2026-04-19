import type { PumpInputConfig } from './type/pump-config'

export const pumpConfigDefaults: PumpInputConfig = {
  base: 'main',
  push: false,
  checkout: true,
  confirm: true,
  gitCheck: true,
  fetch: false,
  remote: 'origin',
  manifest: { file: 'package.json', versionKey: 'version' },
  types: {
    release: { pattern: 'release/{version}-{date}' },
    feature: { pattern: 'feature/{username}-{desc?}-{date}' },
    hotfix: { pattern: 'hotfix/{username}-{desc?}-{date}' },
  },
  tokenProviders: [],
}
