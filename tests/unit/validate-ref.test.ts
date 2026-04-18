import { describe, expect, it, vi } from 'vitest'
import { PumppError } from '../../src/errors'
import { validateRef } from '../../src/utils/validate-ref'

function fakeDeps(impl: (name: string) => Promise<void>) {
  return { git: { checkRefFormat: vi.fn(impl) } }
}

describe('validateRef', () => {
  it('resolves when check passes', async () => {
    const deps = fakeDeps(async () => {})
    await expect(validateRef('feature/x', deps as any)).resolves.toBeUndefined()
    expect(deps.git.checkRefFormat).toHaveBeenCalledWith('feature/x')
  })

  it('throws PumppError INVALID_BRANCH_NAME on rejection', async () => {
    const deps = fakeDeps(async () => {
      const err: any = new Error('fatal: bad ref')
      err.output = { stderr: 'fatal: bad ref\n' }
      throw err
    })
    const e = await validateRef('..bad', deps as any).catch(x => x)
    expect(e).toBeInstanceOf(PumppError)
    expect(e.code).toBe('INVALID_BRANCH_NAME')
    expect(e.hint).toMatch(/bad ref/)
  })
})
