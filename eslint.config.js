import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Allow intentionally-unused args/vars prefixed with underscore
      // (e.g. interface methods that ignore a parameter).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The classic hooks rules (rules-of-hooks, exhaustive-deps) stay on.
      // These two are the experimental React-Compiler-oriented rules added in
      // eslint-plugin-react-hooks v7; they produce false positives for the
      // imperative resource management this app needs (epub.js engine lifecycle,
      // debounce timers, lazy controller init, Web Audio nodes).
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Provider + its companion hook intentionally live in one file.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Vitest globals (describe/it/expect) in test files.
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
])
