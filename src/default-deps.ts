import type { PromptDeps, PumpDeps, TextWithPreviewOptions } from './type/pump-deps'
import process from 'node:process'
import readline from 'node:readline'
import { bold, dim, gray, green, red, yellow } from 'kolorist'
import prompts from 'prompts'
import { realGit } from './utils/git-ops'
import { readManifestVersion } from './utils/manifest'

const ANSI_SAVE_CURSOR = '\x1B7'
const ANSI_RESTORE_CURSOR = '\x1B8'
const ANSI_CURSOR_DOWN_1 = '\x1B[1B'
const ANSI_CLEAR_LINE = '\x1B[2K'

function readlineEdit(message: string, initial: string): Promise<string | undefined> {
  if (!process.stdin.isTTY)
    return Promise.resolve(initial)

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    let done = false
    const finish = (value: string | undefined): void => {
      if (done)
        return
      done = true
      try { rl.close() }
      catch {}
      resolve(value)
    }

    rl.on('SIGINT', () => finish(undefined))
    rl.on('close', () => finish(undefined))

    rl.question(`${message} ${dim('›')} `, answer => finish(answer))
    // Pre-fill the buffer so the user can arrow / backspace to edit,
    // instead of the classic prompts-style "type to replace" behavior.
    rl.write(initial)
  })
}

type EditAction = 'accept' | 'edit' | 'cancel'

async function promptAction(message: string, initial: string): Promise<EditAction | undefined> {
  let cancelled = false
  const { value } = await prompts({
    type: 'select',
    name: 'value',
    message: `${message}: ${bold(initial)}`,
    hint: 'Enter to accept, ↑/↓ to pick',
    choices: [
      { title: green('✔ Accept'), description: 'Create this branch as-is', value: 'accept' },
      { title: yellow('✎ Edit'), description: 'Modify before creating', value: 'edit' },
      { title: red('✖ Cancel'), description: 'Abort, do not touch the repo', value: 'cancel' },
    ],
    initial: 0,
  }, {
    onCancel: () => {
      cancelled = true
      return false
    },
  })
  if (cancelled)
    return undefined
  return value as EditAction
}

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
      const action = await promptAction(message, initial)
      if (action === undefined || action === 'cancel')
        return undefined
      if (action === 'accept')
        return initial

      const answer = await readlineEdit(message, initial)
      if (answer === undefined)
        return undefined
      const trimmed = answer.trim()
      return trimmed === '' ? undefined : trimmed
    },
    textWithPreview,
  }
}

async function textWithPreview(opts: TextWithPreviewOptions): Promise<string | undefined> {
  const initial = opts.initial ?? ''
  if (!process.stdout.isTTY || !process.stdin.isTTY)
    return textWithStaticPreview(opts, initial)

  const reservePreviewLine = (): void => {
    process.stdout.write(`\n\x1B[1A`)
  }
  const safeRender = (val: string): string => {
    try {
      return opts.renderWith(val)
    }
    catch {
      return '(unavailable)'
    }
  }
  const drawPreview = (val: string): void => {
    const preview = safeRender(val)
    process.stdout.write(
      `${ANSI_SAVE_CURSOR}${ANSI_CURSOR_DOWN_1}\r${ANSI_CLEAR_LINE}  ${gray('Preview:')} ${dim(preview)}${ANSI_RESTORE_CURSOR}`,
    )
  }
  const clearPreviewLine = (): void => {
    process.stdout.write(`\r${ANSI_CLEAR_LINE}`)
  }

  reservePreviewLine()
  drawPreview(initial)

  let cancelled = false
  let result: string | undefined

  try {
    const { value } = await prompts({
      type: 'text',
      name: 'value',
      message: opts.message,
      initial,
      onState({ value, aborted }) {
        if (aborted) {
          cancelled = true
          return
        }
        drawPreview(String(value ?? ''))
      },
    }, {
      onCancel: () => {
        cancelled = true
        return false
      },
    })
    result = value === undefined ? '' : String(value)
  }
  finally {
    clearPreviewLine()
  }

  return cancelled ? undefined : result
}

async function textWithStaticPreview(opts: TextWithPreviewOptions, initial: string): Promise<string | undefined> {
  let preview: string
  try {
    preview = opts.renderWith(initial)
  }
  catch {
    preview = '(unavailable)'
  }
  process.stdout.write(`  ${gray('Preview:')} ${dim(preview)}\n`)

  let cancelled = false
  const { value } = await prompts({
    type: 'text',
    name: 'value',
    message: opts.message,
    initial,
  }, {
    onCancel: () => {
      cancelled = true
      return false
    },
  })
  if (cancelled)
    return undefined
  return value === undefined ? '' : String(value)
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
