import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['dist', 'node_modules', 'tsconfig.json', '.vscode', 'docs'],
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['package.json'],
    rules: {
      'jsonc/sort-keys': 'off',
    },
  },
)
