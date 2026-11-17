import tseslint from 'typescript-eslint';
import litPlugin from 'eslint-plugin-lit';
import wcPlugin from 'eslint-plugin-wc';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/results/**', '**/generated/**', 'test-results/**', 'tools/lithono-ide/**'] },
  ...tseslint.configs.recommended,
  litPlugin.configs['flat/recommended'],
  wcPlugin.configs['flat/recommended'],
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
    },
  },
  { files: ['src/framework/server/index.ts'], rules: { 'lit/binding-positions': 'off', 'lit/no-invalid-html': 'off' } },
  { files: ['src/framework/standard-schema.ts'], rules: { '@typescript-eslint/no-namespace': 'off' } },
  { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-this-alias': 'off' } }
);
