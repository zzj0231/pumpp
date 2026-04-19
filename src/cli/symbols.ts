import { cyan, green, red } from 'kolorist'

export const symbols = {
  success: green('✔'),
  error: red('✖'),
  info: cyan('ℹ'),
}

/**
 * ANSI 256-color orange (color 208). Renders a true orange on every modern
 * terminal that supports 256 colors (Windows Terminal, iTerm2, kitty, vscode,
 * gnome-terminal, etc.) and degrades gracefully to plain text where it isn't.
 */
export function orange(text: string): string {
  return `\x1B[38;5;208m${text}\x1B[39m`
}
