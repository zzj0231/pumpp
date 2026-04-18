import type { ReleaseType as SemverReleaseType } from 'semver'

export type ReleaseType = SemverReleaseType | 'next' | 'conventional'

export type BranchType = 'hotfix' | 'feature' | 'release'
/**
 * The different types of pre-releases.
 */
export const prereleaseTypes: ReleaseType[] = [
  'premajor',
  'preminor',
  'prepatch',
  'prerelease',
]

/**
 * All possible release types.
 */
export const releaseTypes: ReleaseType[] = [
  ...prereleaseTypes,
  'major',
  'minor',
  'patch',
  'next',
  'conventional',
]

/**
 * Determines whether the specified value is a pre-release.
 */
export function isPrerelease(value: any): boolean {
  return prereleaseTypes.includes(value)
}

/**
 * Determines whether the specified value is a valid ReleaseType string.
 */
export function isReleaseType(value: any): value is ReleaseType {
  return releaseTypes.includes(value)
}

export interface BranchPatternLiteralSegment {
  kind: 'literal'
  value: string
}

export interface BranchPatternVariableSegment {
  kind: 'variable'
  name: string
}

export type BranchPatternSegment = BranchPatternLiteralSegment | BranchPatternVariableSegment

export interface ParsedBranchPattern {
  pattern: string

  segments: BranchPatternSegment[]

  variables: string[]

  build: (values: Record<string, string>) => string
}
