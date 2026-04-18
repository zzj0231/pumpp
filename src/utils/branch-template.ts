const TOKEN_RE = /\{([a-z_][\w-]*)(\?)?\}/gi
const SEPARATORS = '-_/.'

export interface TokenRef {
  name: string
  optional: boolean
}

export function scanPattern(pattern: string): TokenRef[] {
  TOKEN_RE.lastIndex = 0
  const map = new Map<string, TokenRef>()
  for (const match of pattern.matchAll(TOKEN_RE)) {
    const name = match[1]
    const optional = match[2] === '?'
    const prev = map.get(name)
    if (!prev) {
      map.set(name, { name, optional })
    }
    else if (prev.optional && !optional) {
      prev.optional = false
    }
  }
  return Array.from(map.values())
}

function isSep(ch: string): boolean {
  return SEPARATORS.includes(ch)
}

export function renderBranchName(
  pattern: string,
  values: Record<string, string | undefined>,
): string {
  let out = ''
  let i = 0
  while (i < pattern.length) {
    TOKEN_RE.lastIndex = i
    const m = TOKEN_RE.exec(pattern)
    if (!m || m.index !== i) {
      out += pattern[i]
      i += 1
      continue
    }
    const [whole, name, q] = m
    const optional = q === '?'
    const v = values[name]

    if (v !== undefined && v !== '') {
      out += v
    }
    else if (!optional) {
      out += whole
    }
    else {
      const prevCh = out.at(-1)
      const nextCh = pattern[i + whole.length]
      const prevIsSep = prevCh ? isSep(prevCh) : false
      const nextIsSep = nextCh ? isSep(nextCh) : false
      if (prevIsSep && nextIsSep) {
        if (prevCh === '/' && nextCh !== '/')
          i += 1
        else
          out = out.slice(0, -1)
      }
      else if (prevIsSep && !nextCh) {
        out = out.slice(0, -1)
      }
      else if (!prevCh && nextIsSep) {
        i += 1
      }
      else if (prevCh && nextIsSep && !prevIsSep) {
        i += 1
      }
    }
    i += whole.length
  }

  out = out.replace(/([-_])\1+/g, '$1')
  out = out.replace(/^[-_/.]+|[-_/.]+$/g, '')
  out = out.replace(/\/{2,}/g, '/')
  TOKEN_RE.lastIndex = 0
  return out
}
