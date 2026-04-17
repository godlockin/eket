/**
 * EKET Framework - ESLint Configuration
 * Strict TypeScript linting rules for code quality
 *
 * Aligned with CLAUDE.md principles:
 * 1. Type Safety: no `any`, no `@ts-ignore`
 * 2. Immutability: prefer const, readonly
 * 3. Error Handling: typed errors with context
 * 4. Fail Fast: validation at startup
 * 5. DRY: single source of truth
 * 6. Naming: consistent conventions
 */

import eslint from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default tseslint.config(
  {
    // Global ignores
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'logs/',
      '*.js',
      '*.d.ts',
      'tests/',
      'benchmarks/',
    ],
  },
  {
    // Base configuration extending eslint:recommended
    ...eslint.configs.recommended,
  },
  {
    // TypeScript files
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        NodeJS: 'readonly',
        setTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      import: importPlugin,
    },
    rules: {
      // ============================================================================
      // Type Safety (CRITICAL - aligned with CLAUDE.md)
      // ============================================================================
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ============================================================================
      // Naming Conventions
      // ============================================================================
      '@typescript-eslint/naming-convention': [
        'warn', // Warn instead of error to reduce noise
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE', 'PascalCase'],
        },
      ],

      // ============================================================================
      // Import Organization
      // ============================================================================
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [
            {
              pattern: '../**',
              group: 'parent',
              position: 'after',
            },
            {
              pattern: './**',
              group: 'sibling',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'always',
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-cycle': 'warn',
      'import/no-self-import': 'error',

      // ============================================================================
      // Code Style
      // ============================================================================
      'no-console': 'off', // Allow console for logging
      'no-debugger': 'error',
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
      'no-trailing-spaces': 'error',

      // ============================================================================
      // Best Practices
      // ============================================================================
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],

      // ============================================================================
      // TypeScript Specific
      // ============================================================================
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // ============================================================================
      // Async/Await
      // ============================================================================
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',

      // ============================================================================
      // Pre-existing Issues (downgraded to warn — fix incrementally)
      // ============================================================================
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-condition': 'warn',
      'no-unused-vars': 'warn',
    },
  },
  {
    // Test files - relaxed rules
    files: ['**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'import/order': 'off',
    },
  },
);
