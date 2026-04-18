import type { PumpBranchOptions } from './type/branch-pump-options'
import type { PumpBranchResults } from './type/branch-pump-results'
import type { BranchType } from './type/release-type'
import process from 'node:process'
import { ProgressEvent } from './type/branch-pump-progress'
import { renderBranchName } from './utils/branch-template'
import { formatYmd } from './utils/date-token'
import {
  assertGitRepo,
  createBranch,
  getGitUserSlug,
  localBranchExists,
  pushBranch,
} from './utils/git-ops'
import { readManifestVersion } from './utils/manifest'
import { slugifyBranchToken } from './utils/slug'

function patternForType(options: Required<Pick<PumpBranchOptions, 'releasePattern' | 'featurePattern' | 'hotfixPattern'>>, type: BranchType): string {
  if (type === 'release')
    return options.releasePattern
  if (type === 'feature')
    return options.featurePattern
  return options.hotfixPattern
}

export async function pumpBranch(raw: PumpBranchOptions = {}): Promise<PumpBranchResults> {
  const cwd = raw.cwd ?? process.cwd()
  const file = raw.file ?? 'package.json'
  const versionKey = raw.versionKey ?? 'version'
  const type = raw.type ?? 'release'
  const push = raw.push !== false
  const checkout = raw.checkout !== false
  const confirm = raw.confirm !== false
  const remote = raw.remote ?? 'origin'
  const dryRun = raw.dryRun === true

  const releasePattern = raw.releasePattern ?? 'release/{version}-{date}'
  const featurePattern = raw.featurePattern ?? 'feature/{username}-{date}'
  const hotfixPattern = raw.hotfixPattern ?? 'hotfix/{username}-{date}'

  const currentVersion = readManifestVersion(cwd, file, versionKey)
  const username = await getGitUserSlug(cwd)
  const date = formatYmd(new Date())

  let newBranchName = await raw.customBranchName?.(currentVersion, type)
  if (!newBranchName) {
    const pattern = patternForType({ releasePattern, featurePattern, hotfixPattern }, type)
    newBranchName = renderBranchName(pattern, {
      version: slugifyBranchToken(currentVersion),
      date,
      username,
    })
  }

  if (!newBranchName.trim())
    throw new Error('Resolved branch name is empty')

  await assertGitRepo(cwd)

  if (await localBranchExists(cwd, newBranchName))
    throw new Error(`Branch "${newBranchName}" already exists locally`)

  if (confirm) {
    if (raw.stdio === false)
      throw new Error('Confirmation required but stdio is disabled; pass confirm: false or enable stdio')

    const prompts = await import('prompts')
    const { confirmed } = await prompts.default({
      type: 'confirm',
      name: 'confirmed',
      message: dryRun
        ? `Dry run: would create branch "${newBranchName}" from ${type} (version ${currentVersion}). Continue?`
        : `Create branch "${newBranchName}" (${type}, version ${currentVersion})?`,
      initial: true,
    }, {
      onCancel: () => {
        throw new Error('Aborted')
      },
    })

    if (!confirmed)
      throw new Error('Aborted')
  }

  if (dryRun)
    return { type, currentVersion, newBranchName }

  raw.progress?.({ type, currentVersion, newBranchName, event: ProgressEvent.GitBranch })
  await createBranch(cwd, newBranchName, checkout)

  if (push) {
    raw.progress?.({ type, currentVersion, newBranchName, event: ProgressEvent.GitPush })
    await pushBranch(cwd, remote, newBranchName)
  }

  return { type, currentVersion, newBranchName }
}
