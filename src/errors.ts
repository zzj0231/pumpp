import { NonZeroExitError } from 'tinyexec'

const ABORT_MESSAGE_RE = /force closed the prompt|aborted|sigint/i

export type PumppErrorCode
  = | 'INVALID_ARGUMENT'
    | 'UNKNOWN_BRANCH_TYPE'
    | 'CONFIG_INVALID'
    | 'UNRESOLVED_TOKEN'
    | 'INVALID_BRANCH_NAME'
    | 'NOT_A_GIT_REPO'
    | 'DIRTY_WORKING_TREE'
    | 'BASE_BRANCH_MISSING'
    | 'BRANCH_ALREADY_EXISTS'
    | 'GIT_COMMAND_FAILED'
    | 'ABORTED_BY_USER'
    | 'UNKNOWN'

export interface PumppErrorInit {
  code: PumppErrorCode
  hint?: string
  cause?: unknown
}

export class PumppError extends Error {
  code: PumppErrorCode
  hint?: string
  override cause?: unknown
  constructor(message: string, init: PumppErrorInit) {
    super(message)
    this.name = 'PumppError'
    this.code = init.code
    this.hint = init.hint
    this.cause = init.cause
  }
}

export function errorCodeToExit(code: PumppErrorCode): 0 | 1 | 2 {
  switch (code) {
    case 'ABORTED_BY_USER':
      return 0
    case 'INVALID_ARGUMENT':
    case 'UNKNOWN_BRANCH_TYPE':
    case 'CONFIG_INVALID':
    case 'UNRESOLVED_TOKEN':
    case 'INVALID_BRANCH_NAME':
      return 1
    default:
      return 2
  }
}

function isAbortMessage(msg: string): boolean {
  return ABORT_MESSAGE_RE.test(msg)
}

export function toPumppError(e: unknown): PumppError {
  if (e instanceof PumppError)
    return e

  if (e instanceof NonZeroExitError) {
    const stderr = e.output?.stderr ?? ''
    const hint = stderr.split('\n').map(s => s.trim()).find(Boolean)
    return new PumppError('git command failed', {
      code: 'GIT_COMMAND_FAILED',
      hint,
      cause: e,
    })
  }

  if (e instanceof Error && isAbortMessage(e.message)) {
    return new PumppError('aborted', { code: 'ABORTED_BY_USER', cause: e })
  }

  const message = e instanceof Error ? e.message : e == null ? '' : String(e)
  return new PumppError(message || 'unknown error', { code: 'UNKNOWN', cause: e })
}
