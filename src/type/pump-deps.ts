export interface PromptDeps {
  confirm: (msg: string) => Promise<boolean>
  select: <T>(msg: string, choices: { title: string, value: T, description?: string }[]) => Promise<T>
  text: (msg: string) => Promise<string>
  /**
   * Text prompt prefilled with `initial`. User can accept (Enter) or edit inline.
   * Return `undefined` to signal cancel/abort (ESC, Ctrl-C, or submitted empty).
   */
  editText: (msg: string, initial: string) => Promise<string | undefined>
}

export interface GitDeps {
  assertRepo: (cwd: string) => Promise<void>
  status: (cwd: string) => Promise<string>
  currentBranch: (cwd: string) => Promise<string>
  revParseVerify: (cwd: string, ref: string) => Promise<boolean>
  lsRemoteHead: (cwd: string, remote: string, branch: string) => Promise<boolean>
  fetch: (cwd: string, remote: string) => Promise<void>
  createBranch: (cwd: string, name: string, base: string, checkout: boolean) => Promise<void>
  push: (cwd: string, remote: string, name: string) => Promise<void>
  checkRefFormat: (name: string) => Promise<void>
  configGet: (cwd: string, key: string) => Promise<string | undefined>
}

export interface PumpDeps {
  git: GitDeps
  now: () => Date
  readManifest: (cwd: string, file: string, key: string) => string
  prompt: PromptDeps
}
