export const enum ProgressEvent {
  ConfigLoaded = 'config-loaded',
  TokensResolved = 'tokens-resolved',
  NameResolved = 'name-resolved',
  GitPreflight = 'git-preflight',
  Confirmed = 'confirmed',
  GitBranchCreated = 'git-branch-created',
  GitPushed = 'git-pushed',
}

export interface PumpBranchProgress {
  event: ProgressEvent
  type: string
  base: string
  branchName: string
  dryRun: boolean
}
