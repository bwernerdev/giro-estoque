// ESLint: poucas regras, só o que pega erro de verdade (recomendadas + variável sem uso + ===).
// Texto da planilha em innerHTML não é coberto aqui: quem garante é escapeHtml (ui/markup.js) e
// o teste "texto da planilha com HTML" em tests/app.test.js.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', '.panel-build/', 'node_modules/', '.npm-cache/', 'test-results/', 'playwright-report/', 'vendor/', 'src/panel/template.generated.html'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Node: testes, e2e, scripts e configs.
    files: ['tests/**', 'e2e/**', 'scripts/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['service-worker.js', 'src/import.worker.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.worker, ...globals.serviceworker } },
  },
];
