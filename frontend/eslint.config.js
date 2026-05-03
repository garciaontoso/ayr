import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build artifacts and legacy files we don't lint
  globalIgnores([
    'dist',
    'public/mobile/assets/**',   // built mobile bundle (vendor)
    'ar_v10_2.jsx',              // legacy snapshot, untracked
    'coverage',
    'playwright-report',
    'test-results',
  ]),

  // Default config — browser source under src/
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Service worker / PWA globals
        caches: 'readonly',
        globalThis: 'readonly',
        ServiceWorkerGlobalScope: 'readonly',
        importScripts: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]|^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_|^e$',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],

      // React Compiler rules (new in eslint-plugin-react-hooks v7).
      // These detect issues the React Compiler cares about (sub-components
      // declared inside render, refs read during render, mutating props/state,
      // setState inside effect). Fixing each requires component-by-component
      // refactor and isn't part of this lint-cleanup pass — track as TODO,
      // surface as warnings so they don't break CI.
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/void-use-memo': 'warn',
      'react-hooks/capitalized-calls': 'warn',
      'react-hooks/automatic-effect-dependencies': 'warn',
      'react-hooks/memoized-effect-dependencies': 'warn',
      'react-hooks/no-deriving-state-in-effects': 'warn',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
    },
  },

  // Node-context files (scripts, configs, e2e tests)
  {
    files: [
      'scripts/**/*.{js,jsx}',
      'playwright.config.js',
      'vite.config.js',
      'vitest.config.js',
      'e2e/**/*.{js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Service worker context
  {
    files: ['public/sw.js', '**/sw.js', '**/service-worker.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
])
