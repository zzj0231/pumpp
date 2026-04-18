function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local date as `YYYYMMDD`, e.g. `20260418`. */
export function formatDateYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}
