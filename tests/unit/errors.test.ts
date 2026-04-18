import { NonZeroExitError } from 'tinyexec'
import { describe, expect, it } from 'vitest'
import { errorCodeToExit, PumppError, toPumppError } from '../../src/errors'

describe('pumppError', () => {
  it('carries code, hint and cause', () => {
    const cause = new Error('boom')
    const err = new PumppError('bad', { code: 'INVALID_ARGUMENT', hint: 'try --help', cause })
    expect(err.message).toBe('bad')
    expect(err.code).toBe('INVALID_ARGUMENT')
    expect(err.hint).toBe('try --help')
    expect(err.cause).toBe(cause)
  })
})

describe('errorCodeToExit', () => {
  it('maps user-input errors to 1', () => {
    expect(errorCodeToExit('INVALID_ARGUMENT')).toBe(1)
    expect(errorCodeToExit('UNKNOWN_BRANCH_TYPE')).toBe(1)
    expect(errorCodeToExit('UNRESOLVED_TOKEN')).toBe(1)
    expect(errorCodeToExit('INVALID_BRANCH_NAME')).toBe(1)
    expect(errorCodeToExit('CONFIG_INVALID')).toBe(1)
  })
  it('maps operational errors to 2', () => {
    expect(errorCodeToExit('NOT_A_GIT_REPO')).toBe(2)
    expect(errorCodeToExit('DIRTY_WORKING_TREE')).toBe(2)
    expect(errorCodeToExit('BASE_BRANCH_MISSING')).toBe(2)
    expect(errorCodeToExit('BRANCH_ALREADY_EXISTS')).toBe(2)
    expect(errorCodeToExit('GIT_COMMAND_FAILED')).toBe(2)
    expect(errorCodeToExit('UNKNOWN')).toBe(2)
  })
  it('maps aborted to 0', () => {
    expect(errorCodeToExit('ABORTED_BY_USER')).toBe(0)
  })
})

describe('toPumppError', () => {
  it('passes through PumppError', () => {
    const e = new PumppError('x', { code: 'CONFIG_INVALID' })
    expect(toPumppError(e)).toBe(e)
  })
  it('wraps tinyexec NonZeroExitError', () => {
    const nz = new NonZeroExitError({} as any, { stdout: '', stderr: 'fatal: bad\n', exitCode: 1 } as any)
    const e = toPumppError(nz)
    expect(e.code).toBe('GIT_COMMAND_FAILED')
    expect(e.hint).toMatch(/fatal: bad/)
    expect(e.cause).toBe(nz)
  })
  it('recognises all abort-like messages', () => {
    expect(toPumppError(new Error('User force closed the prompt with 0 null')).code).toBe('ABORTED_BY_USER')
    expect(toPumppError(new Error('Aborted')).code).toBe('ABORTED_BY_USER')
    expect(toPumppError(new Error('SIGINT received')).code).toBe('ABORTED_BY_USER')
  })
  it('wraps unknown errors', () => {
    const e = toPumppError(new Error('random'))
    expect(e.code).toBe('UNKNOWN')
  })
  it('wraps non-Error thrown values', () => {
    const fromString = toPumppError('plain string')
    expect(fromString.code).toBe('UNKNOWN')
    expect(fromString.message).toBe('plain string')

    const fromNull = toPumppError(null)
    expect(fromNull.code).toBe('UNKNOWN')
    expect(fromNull.message).toBe('unknown error')
  })
})
