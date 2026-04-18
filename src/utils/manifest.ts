import type { ParseError } from 'jsonc-parser'
import fs from 'node:fs'
import path from 'node:path'
import escalade from 'escalade/sync'
import { parse } from 'jsonc-parser'

export function resolveManifestFile(cwd: string, file: string): string {
  if (path.isAbsolute(file))
    return file

  const hit = escalade(cwd, (_dir, names) => {
    return names.includes(file) ? file : false
  })

  if (!hit)
    throw new Error(`Could not find "${file}" upward from "${cwd}"`)

  return hit
}

export function readManifestVersion(
  cwd: string,
  file: string,
  versionKey: string,
): string {
  const abs = resolveManifestFile(cwd, file)
  const text = fs.readFileSync(abs, 'utf8')
  const errors: ParseError[] = []
  const data = parse(text, errors, { allowTrailingComma: true }) as Record<string, unknown> | null

  if (!data || typeof data !== 'object')
    throw new Error(`Invalid JSON in "${abs}"`)

  const version = data[versionKey]
  if (typeof version !== 'string' || !version.trim())
    throw new Error(`Missing or invalid "${versionKey}" in "${abs}"`)

  return version.trim()
}
