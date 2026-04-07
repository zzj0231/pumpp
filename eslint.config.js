import antfu from '@antfu/eslint-config'

export default antfu({
    ignores: ['dist', 'node_modules'],
    rules: {
        'no-console': 'off',
        'no-unused-vars': 'off',
        'no-restricted-syntax': 'off',
    }
})