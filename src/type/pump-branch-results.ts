export interface PumpBranchResults {
  type: string
  base: string
  branchName: string
  dryRun: boolean
  tokens: Record<string, string>
  date: string
  username: string
  version?: string
  desc?: string
}
