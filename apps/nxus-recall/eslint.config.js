import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
  // Prevent importing server-only packages in client code
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/**/*.server.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nxus/db/server'],
              message:
                'Do not import @nxus/db/server directly in client code. Use local wrappers in src/services/*.server.ts with dynamic imports.',
            },
          ],
        },
      ],
    },
  },
)
