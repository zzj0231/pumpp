import type { PromptDeps, PumpDeps } from './type/pump-deps'
import process from 'node:process'
import prompts from 'prompts'
import { realGit } from './utils/git-ops'
import { readManifestVersion } from './utils/manifest'

function buildPrompt(): PromptDeps {
  return {
    async confirm(message) {
      const { value } = await prompts({ type: 'confirm', name: 'value', message, initial: true }, {
        onCancel: () => { throw new Error('User force closed the prompt') },
      })
      return Boolean(value)
    },
    async select(message, choices) {
      const { value } = await prompts({ type: 'select', name: 'value', message, choices }, {
        onCancel: () => { throw new Error('User force closed the prompt') },
      })
      return value
    },
    async text(message) {
      const { value } = await prompts({ type: 'text', name: 'value', message }, {
        onCancel: () => { throw new Error('User force closed the prompt') },
      })
      return String(value ?? '')
    },
    async editText(message, initial) {
      let cancelled = false
      const { value } = await prompts({ type: 'text', name: 'value', message, initial }, {
        onCancel: () => {
          cancelled = true
          return false
        },
      })
      if (cancelled)
        return undefined
      const out = String(value ?? '').trim()
      return out === '' ? undefined : out
    },
  }
}

export function defaultDeps(): PumpDeps {
  return {
    git: realGit,
    now: () => new Date(),
    readManifest: readManifestVersion,
    prompt: buildPrompt(),
  }
}

export { process as _process }
