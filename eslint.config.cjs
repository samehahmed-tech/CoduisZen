const globals = require('globals');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'coverage/**',
      'node_modules/**',
      'node_modules_old/**',
      '.wwebjs_auth/**',
      '.wwebjs_cache/**',
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
      '.ua/**',
      'output/**',
      'backups/**',
      'prototypes/**',
      'One Click Builder/**',
      'scripts/sameh-installer/hotfix/payload/**',
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
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
