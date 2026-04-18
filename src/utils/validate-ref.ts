import type { PumpDeps } from '../type/pump-deps'
import { PumppError } from '../errors'

export async function validateRef(
  name: string,
  deps: Pick<PumpDeps, 'git'>,
): Promise<void> {
  try {
    await deps.git.checkRefFormat(name)
  }
  catch (raw) {
    const stderr = (raw as { output?: { stderr?: string } }).output?.stderr
      ?? (raw instanceof Error ? raw.message : '')
    const hint = stderr.split('\n').map(s => s.trim()).find(Boolean)
    throw new PumppError(`Invalid branch name "${name}"`, {
      code: 'INVALID_BRANCH_NAME',
      hint,
      cause: raw,
    })
  }
}
