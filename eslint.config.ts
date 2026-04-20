import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['*.md'],
  formatters: {
    css: true,
    html: true,
    markdown: true,
  },
  markdown: {
    overrides: {},
  },
  rules: {
    'no-console': 'off',
    'no-restricted-syntax': 'off',
  },
  pnpm: true,
})
