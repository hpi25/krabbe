import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next/**', 'public/**', 'next-env.d.ts']),
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      'simple-import-sort/imports': 'warn',
      '@next/next/no-img-element': 'off',
      'react/display-name': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'space-infix-ops': 'warn',
      'comma-spacing': 'warn',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'eqeqeq': 'error',
      'no-return-await': 'warn',
      'no-var': 'error',
      'prefer-const': 'warn',
      'eol-last': ['warn', 'always'],
      'indent': ['warn', 2],
      'semi': ['error', 'never'],
      'arrow-parens': ['error', 'as-needed'],
      'jsx-quotes': ['warn', 'prefer-double'],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'simple-import-sort/imports': [
        'warn',
        {
          groups: [
            ['^react', '^next', '^@', '^[a-z]'],
            ['^/src/'],
            ['^./', '^.', '^../'],
          ],
        },
      ],
    },
  },
])
