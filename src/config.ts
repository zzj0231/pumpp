import type { PumpBranchOptions } from './type/branch-pump-options'

export const pumpConfigDefaults: PumpBranchOptions = {
  push: true,
  checkout: true,
  confirm: true,
  file: 'package.json',
  versionKey: 'version',
  customBranchName: undefined,
  releasePattern: 'release/{version}-{date}',
  featurePattern: 'feature/{username}-{date}',
  hotfixPattern: 'hotfix/{username}-{date}',
}
