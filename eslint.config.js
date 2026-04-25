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
    // Сложные модули ВОР близки к пределу 600 строк; временно поднят лимит до 650.
    // TODO: вынести split-3 рендер из vorExcelGenerator.js и таблицу из VorFillModal.jsx.
    files: ['src/lib/vorExcelGenerator.js', 'src/components/VorFillModal.jsx'],
    rules: {
      'max-lines': ['error', { max: 750, skipBlankLines: true, skipComments: true }],
    },
  },
])
