const YMD_RE = /^\d{8}$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

export function splitYmd(ymd: string): { year: string, month: string, day: string } {
  if (!YMD_RE.test(ymd))
    throw new Error(`Invalid date token "${ymd}" (expected YYYYMMDD)`)
  return {
    year: ymd.slice(0, 4),
    month: ymd.slice(4, 6),
    day: ymd.slice(6, 8),
  }
}
