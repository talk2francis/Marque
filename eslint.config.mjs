import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/drizzle/**', 'packages/db/drizzle/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // AGENTS.md: no new `any`, no unexplained @ts-ignore.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Node config files: CommonJS and Node globals are correct here.
    files: ['**/*.cjs', '**/*.config.mjs'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', process: 'readonly', URL: 'readonly', __dirname: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Audit scripts run in Node but evaluate code inside a browser page, so
    // both sets of globals are legitimate in the same file.
    files: ['scripts/**/*.mjs', 'scripts/**/*.mts'],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly', URL: 'readonly',
        document: 'readonly', window: 'readonly', getComputedStyle: 'readonly', Buffer: 'readonly',
      },
    },
  },
)
