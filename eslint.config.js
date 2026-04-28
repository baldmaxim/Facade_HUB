import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Сложные модули ВОР близки к пределу. vorExcelGenerator оставлен на 750.
    // TODO: вынести split-3 рендер из vorExcelGenerator.js и таблицу из VorFillModal.jsx.
    files: ['src/lib/vorExcelGenerator.js'],
    rules: {
      'max-lines': ['error', { max: 750, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // VorFillModal накопил state/handler/render под три AI-фичи (review, propose,
    // tech-advisor). Лимит 850 — после фазы Г-D+1 вынести VorMatchPreviewTable.
    files: ['src/components/VorFillModal.jsx'],
    rules: {
      'max-lines': ['error', { max: 850, skipBlankLines: true, skipComments: true }],
    },
  },
])
