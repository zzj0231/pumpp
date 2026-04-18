/** Safe-ish slug for a single path segment; allows `/` only via template literals between segments. */
const INVALID = /[^\w.-]+/g

export function slugifyBranchToken(input: string, fallback = 'user'): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(INVALID, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return s || fallback
}
