import type { PumpDeps } from '../../src/type/pump-deps'

const REFS_HEADS_RE = /^refs\/heads\//

export interface FakeState {
  repo: boolean
  statusOutput: string
  currentBranch: string
  localBranches: Set<string>
  remoteBranches: Set<string>
  createdBranches: { name: string, base: string, checkout: boolean }[]
  pushed: string[]
  fetched: string[]
  gitUser?: string
  checkRefOk: boolean
  now: Date
  manifestValue: string
  confirmAnswer: boolean
  selectAnswer?: string
  textAnswer?: string
}

export function createFakeDeps(overrides: Partial<FakeState> = {}): { deps: PumpDeps, state: FakeState } {
  const state: FakeState = {
    repo: true,
    statusOutput: '',
    currentBranch: 'main',
    localBranches: new Set(['main']),
    remoteBranches: new Set(['main']),
    createdBranches: [],
    pushed: [],
    fetched: [],
    gitUser: 'Alice',
    checkRefOk: true,
    now: new Date(2026, 3, 18),
    manifestValue: '1.2.3',
    confirmAnswer: true,
    ...overrides,
  }

  const deps: PumpDeps = {
    git: {
      async assertRepo() {
        if (!state.repo)
          throw new Error('not a git repo')
      },
      async status() { return state.statusOutput },
      async currentBranch() { return state.currentBranch },
      async revParseVerify(_c, ref) { return state.localBranches.has(ref.replace(REFS_HEADS_RE, '')) },
      async lsRemoteHead(_c, _r, b) { return state.remoteBranches.has(b) },
      async fetch(_c, r) { state.fetched.push(r) },
      async createBranch(_c, name, base, checkout) {
        state.createdBranches.push({ name, base, checkout })
        state.localBranches.add(name)
        if (checkout)
          state.currentBranch = name
      },
      async push(_c, _r, name) {
        state.pushed.push(name)
        state.remoteBranches.add(name)
      },
      async checkRefFormat() {
        if (!state.checkRefOk) {
          const err = new Error('invalid ref') as Error & { output?: { stderr?: string } }
          err.output = { stderr: 'fatal: invalid ref' }
          throw err
        }
      },
      async configGet() { return state.gitUser },
    },
    now: () => state.now,
    readManifest: () => state.manifestValue,
    prompt: {
      confirm: async () => state.confirmAnswer,
      select: async () => state.selectAnswer as never,
      text: async () => state.textAnswer ?? '',
    },
  }
  return { deps, state }
}
