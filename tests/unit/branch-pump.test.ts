import { describe, expect, it } from 'vitest'
import { pumpBranch } from '../../src/branch-pump'
import { pumpConfigDefaults } from '../../src/config'
import { mergeTokenProviders, normalizePumpConfig } from '../../src/type-registry'
import { buildBuiltinProviders } from '../../src/utils/token-providers'
import { createFakeDeps } from '../helpers/fake-deps'

function baseConfig() {
  const c = normalizePumpConfig(pumpConfigDefaults)
  c.tokenProviders = mergeTokenProviders(buildBuiltinProviders(), c.tokenProviders)
  return c
}

describe('pumpBranch', () => {
  it('dry-run resolves release name without creating branches', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('release', {
      config: baseConfig(),
      dryRun: true,
      yes: true,
    }, deps)
    expect(r.branchName).toBe('release/1.2.3-20260418')
    expect(r.dryRun).toBe(true)
    expect(state.createdBranches).toHaveLength(0)
  })

  it('feature with --desc appends when pattern lacks {desc}', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('feature', {
      config: baseConfig(),
      desc: 'login',
      yes: true,
    }, deps)
    expect(r.branchName).toBe('feature/alice-20260418-login')
    expect(state.createdBranches[0]).toMatchObject({ name: 'feature/alice-20260418-login', base: 'main', checkout: true })
    expect(state.pushed).toHaveLength(0)
  })

  it('throws UNKNOWN_BRANCH_TYPE for unknown type', async () => {
    const { deps } = createFakeDeps()
    await expect(pumpBranch('rc', { config: baseConfig(), yes: true }, deps))
      .rejects
      .toMatchObject({ code: 'UNKNOWN_BRANCH_TYPE' })
  })

  it('throws DIRTY_WORKING_TREE when status non-empty and gitCheck on', async () => {
    const { deps } = createFakeDeps({ statusOutput: ' M file.txt\n' })
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects
      .toMatchObject({ code: 'DIRTY_WORKING_TREE' })
  })

  it('skips dirty check when gitCheck false', async () => {
    const { deps } = createFakeDeps({ statusOutput: ' M x\n' })
    await expect(pumpBranch('release', { config: baseConfig(), yes: true, gitCheck: false }, deps)).resolves.toBeTruthy()
  })

  it('throws BRANCH_ALREADY_EXISTS for local collision', async () => {
    const { deps, state } = createFakeDeps()
    state.localBranches.add('release/1.2.3-20260418')
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects
      .toMatchObject({ code: 'BRANCH_ALREADY_EXISTS' })
  })

  it('throws BASE_BRANCH_MISSING when base not found', async () => {
    const { deps, state } = createFakeDeps()
    state.localBranches.delete('main')
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects
      .toMatchObject({ code: 'BASE_BRANCH_MISSING' })
  })

  it('push when push=true, uses remote override', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('feature', {
      config: baseConfig(),
      yes: true,
      push: true,
      remote: 'upstream',
    }, deps)
    expect(state.pushed).toEqual([r.branchName])
  })

  it('aBORTED_BY_USER when edit prompt cancelled', async () => {
    const { deps } = createFakeDeps({ editAnswer: null })
    await expect(pumpBranch('release', { config: baseConfig() }, deps))
      .rejects
      .toMatchObject({ code: 'ABORTED_BY_USER' })
  })

  it('accepts generated name when user presses Enter (editText returns initial)', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('release', { config: baseConfig() }, deps)
    expect(r.branchName).toBe('release/1.2.3-20260418')
    expect(state.createdBranches[0].name).toBe('release/1.2.3-20260418')
  })

  it('uses edited branch name when user types a new value', async () => {
    const { deps, state } = createFakeDeps({ editAnswer: 'release/1.2.3-rc1' })
    const r = await pumpBranch('release', { config: baseConfig() }, deps)
    expect(r.branchName).toBe('release/1.2.3-rc1')
    expect(state.createdBranches[0].name).toBe('release/1.2.3-rc1')
  })

  it('re-checks local collision on edited name', async () => {
    const { deps, state } = createFakeDeps({ editAnswer: 'release/1.2.3-rc1' })
    state.localBranches.add('release/1.2.3-rc1')
    await expect(pumpBranch('release', { config: baseConfig() }, deps))
      .rejects
      .toMatchObject({ code: 'BRANCH_ALREADY_EXISTS' })
  })

  it('iNVALID_BRANCH_NAME when check-ref-format fails', async () => {
    const { deps } = createFakeDeps({ checkRefOk: false })
    await expect(pumpBranch('release', { config: baseConfig(), yes: true }, deps))
      .rejects
      .toMatchObject({ code: 'INVALID_BRANCH_NAME' })
  })

  it('customBranchName hook overrides rendered name (runtime)', async () => {
    const { deps, state } = createFakeDeps()
    const r = await pumpBranch('release', {
      config: baseConfig(),
      yes: true,
      customBranchName: () => 'release/custom-1',
    }, deps)
    expect(r.branchName).toBe('release/custom-1')
    expect(state.createdBranches[0].name).toBe('release/custom-1')
  })

  it('customBranchName from global config applies when runtime/type omit it', async () => {
    const { deps, state } = createFakeDeps()
    const cfg = baseConfig()
    cfg.customBranchName = ctx => `${ctx.type}/global-${ctx.tokens.version}`
    const r = await pumpBranch('release', { config: cfg, yes: true }, deps)
    expect(r.branchName).toBe('release/global-1.2.3')
    expect(state.createdBranches[0].name).toBe('release/global-1.2.3')
  })

  it('type-level customBranchName wins over global', async () => {
    const { deps } = createFakeDeps()
    const cfg = baseConfig()
    cfg.customBranchName = () => 'release/global-wins'
    cfg.types.release.customBranchName = () => 'release/type-wins'
    const r = await pumpBranch('release', { config: cfg, yes: true }, deps)
    expect(r.branchName).toBe('release/type-wins')
  })

  it('runtime customBranchName wins over type and global', async () => {
    const { deps } = createFakeDeps()
    const cfg = baseConfig()
    cfg.customBranchName = () => 'release/global-wins'
    cfg.types.release.customBranchName = () => 'release/type-wins'
    const r = await pumpBranch('release', {
      config: cfg,
      yes: true,
      customBranchName: () => 'release/runtime-wins',
    }, deps)
    expect(r.branchName).toBe('release/runtime-wins')
  })

  it('progress events fire in order', async () => {
    const { deps } = createFakeDeps()
    const events: string[] = []
    await pumpBranch('release', {
      config: baseConfig(),
      yes: true,
      push: true,
      progress: p => events.push(p.event),
    }, deps)
    expect(events).toEqual([
      'config-loaded',
      'tokens-resolved',
      'name-resolved',
      'git-preflight',
      'confirmed',
      'git-branch-created',
      'git-pushed',
    ])
  })
})
