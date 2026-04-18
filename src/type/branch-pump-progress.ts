import type { PumpBranchResults } from './branch-pump-results'

export const enum ProgressEvent {
  GitBranch = 'git branch',
  GitCheckout = 'git checkout',
  GitPush = 'git push',
}

export interface PumpBranchProgress extends PumpBranchResults {
  event?: ProgressEvent
}
