const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'coverage/**',
      'node_modules/**',
      'node_modules_old/**',
      'drizzle/meta/**',
      'artifacts/**',
      'scratch/**',
      'client-delivery/**',
      'client-release/**',
      'Ashraf System/**',
      '*.md',
      '*.log',
      '*.json',
      'public/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,cjs,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: false,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
    },
  },
);
