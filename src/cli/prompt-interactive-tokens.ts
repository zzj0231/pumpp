import type { PreviewBranchResult } from '../branch-pump'
import type { PumpDeps } from '../type/pump-deps'
import type { PumpRuntimeOptions } from '../type/pump-runtime-options'
import { PumppError } from '../errors'

interface PromptInteractiveTokensArgs {
  type: string
  pattern: string
  preview: PreviewBranchResult
  runtime: PumpRuntimeOptions
  deps: PumpDeps
  isInteractive: boolean
}

export async function promptInteractiveTokens(args: PromptInteractiveTokensArgs): Promise<PumpRuntimeOptions> {
  const { preview, runtime, deps, isInteractive } = args
  if (!isInteractive || runtime.yes)
    return runtime

  const promptedValues: Record<string, string> = {}

  for (const token of preview.missing) {
    if (!token.interactive)
      continue
    if (hasExplicitRuntimeValue(token.name, runtime))
      continue

    const value = await askOneToken(token.name, preview, promptedValues, deps)
    const trimmed = value?.trim()
    if (trimmed)
      promptedValues[token.name] = trimmed
  }

  if (Object.keys(promptedValues).length === 0)
    return runtime

  const interactiveTokens = {
    ...(runtime.interactiveTokens ?? {}),
    ...promptedValues,
  }

  return {
    ...runtime,
    ...(runtime.desc ? {} : promptedValues.desc ? { desc: promptedValues.desc } : {}),
    interactiveTokens,
  }
}

async function askOneToken(
  name: string,
  preview: PreviewBranchResult,
  promptedValues: Record<string, string>,
  deps: PumpDeps,
): Promise<string> {
  const message = `${tokenLabel(name)} (fills {${name}}):`
  if (deps.prompt.textWithPreview) {
    const value = await deps.prompt.textWithPreview({
      message,
      renderWith: current => preview.renderWith({
        ...promptedValues,
        [name]: current,
      }),
    })
    if (value === undefined)
      throw new PumppError('aborted by user', { code: 'ABORTED_BY_USER' })
    return value
  }

  return await deps.prompt.text(message)
}

function hasExplicitRuntimeValue(name: string, runtime: PumpRuntimeOptions): boolean {
  if (name === 'desc')
    return Boolean(runtime.desc?.trim())

  return Boolean(runtime.interactiveTokens?.[name]?.trim())
}

function tokenLabel(name: string): string {
  if (name === 'desc')
    return 'Description'

  return name
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}
