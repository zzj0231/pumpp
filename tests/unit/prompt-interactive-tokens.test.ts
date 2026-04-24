import { describe, expect, it, vi } from 'vitest'
import { promptInteractiveTokens } from '../../src/cli/prompt-interactive-tokens'
import { createFakeDeps } from '../helpers/fake-deps'

describe('promptInteractiveTokens', () => {
  it('prompts missing interactive tokens in pattern order', async () => {
    const { deps } = createFakeDeps()
    const textWithPreview = vi.fn()
      .mockResolvedValueOnce('layout')
      .mockResolvedValueOnce('sidebar-fix')
    deps.prompt.textWithPreview = textWithPreview

    const preview = {
      type: 'style',
      pattern: 'style({module})/{username}-{desc?}',
      branchName: 'style()/alice-bob',
      tokens: { username: 'alice-bob' },
      missing: [
        { name: 'module', optional: false, interactive: true },
        { name: 'desc', optional: true, interactive: true },
      ],
      renderWith: (patch: Record<string, string | undefined>) => JSON.stringify(patch),
    }

    const runtime = await promptInteractiveTokens({
      type: 'style',
      pattern: preview.pattern,
      preview,
      runtime: {},
      deps,
      isInteractive: true,
    })

    expect(textWithPreview).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: 'Module (fills {module}):',
    }))
    expect(textWithPreview).toHaveBeenNthCalledWith(2, expect.objectContaining({
      message: 'Description (fills {desc}):',
    }))
    expect(runtime).toMatchObject({
      desc: 'sidebar-fix',
      interactiveTokens: {
        module: 'layout',
        desc: 'sidebar-fix',
      },
    })
  })

  it.each([
    { label: 'non-interactive mode', isInteractive: false, runtime: {} },
    { label: '--yes mode', isInteractive: true, runtime: { yes: true } },
  ])('skips prompting entirely in $label', async ({ isInteractive, runtime: baseRuntime }) => {
    const { deps } = createFakeDeps()
    const textWithPreview = vi.fn()
    deps.prompt.textWithPreview = textWithPreview

    const runtime = await promptInteractiveTokens({
      type: 'style',
      pattern: 'style({module})/{username}-{desc?}',
      preview: {
        type: 'style',
        pattern: 'style({module})/{username}-{desc?}',
        branchName: 'style()/alice-bob',
        tokens: { username: 'alice-bob' },
        missing: [{ name: 'module', optional: false, interactive: true }],
        renderWith: () => 'style()/alice-bob',
      },
      runtime: baseRuntime,
      deps,
      isInteractive,
    })

    expect(textWithPreview).not.toHaveBeenCalled()
    expect(runtime).toEqual(baseRuntime)
  })

  it('preserves legacy explicit runtime.desc', async () => {
    const { deps } = createFakeDeps()
    const textWithPreview = vi.fn()
    deps.prompt.textWithPreview = textWithPreview

    const runtime = await promptInteractiveTokens({
      type: 'feature',
      pattern: 'feature/{username}-{desc?}-{date}',
      preview: {
        type: 'feature',
        pattern: 'feature/{username}-{desc?}-{date}',
        branchName: 'feature/alice-bob-login-20260422',
        tokens: { username: 'alice-bob', date: '20260422' },
        missing: [{ name: 'desc', optional: true, interactive: true }],
        renderWith: () => 'feature/alice-bob-login-20260422',
      },
      runtime: { desc: 'login' },
      deps,
      isInteractive: true,
    })

    expect(textWithPreview).not.toHaveBeenCalled()
    expect(runtime).toEqual({ desc: 'login' })
  })
})
