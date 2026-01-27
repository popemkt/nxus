//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      // TypeScript-specific rules for stricter type checking
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Prevent importing server-only packages in client code
  // Files ending in .server.ts are allowed to import these
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.server.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nxus/workbench/server'],
              message:
                'Do not import @nxus/workbench/server directly in client code. Use local wrappers in src/services/*/xyz.server.ts with dynamic imports. See .agent/rules/codebase-rules.md',
            },
            {
              group: ['@nxus/db/server'],
              message:
                'Do not import @nxus/db/server directly in client code. Use local wrappers in src/services/*/xyz.server.ts with dynamic imports. See .agent/rules/codebase-rules.md',
            },
          ],
        },
      ],
    },
  },
]
