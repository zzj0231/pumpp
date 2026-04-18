import type { BranchType } from './release-type'

export interface PumpBranchResults {
  type: BranchType

  currentVersion: string

  newBranchName: string
}
