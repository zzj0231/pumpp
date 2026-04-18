/**
 * Replace `{token}` segments in a branch name template.
 * Unknown placeholders are left unchanged.
 */
export function formatBranchTemplate(
  pattern: string,
  values: Record<string, string>,
): string {
  return pattern.replace(/\{([^}]+)\}/g, (full, rawKey: string) => {
    const key = rawKey.trim()
    const v = values[key]
    return v === undefined ? full : v
  })
}
