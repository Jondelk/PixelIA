import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/ai/**'],
    rules: {
      // La lógica del proveedor de IA vive solo en apps/api/src/ai (ver CLAUDE.md).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@anthropic-ai/*', 'openai', '@google/genai'], message: 'Usa la capa ai/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
