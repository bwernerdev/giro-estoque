# scripts/

Scripts Node (ESM) usados pelo build e pelos testes.

- `copy-vendor.mjs`: roda após `vite build`. Copia `vendor/`, ícones e `manifest.webmanifest` para `dist/`; força `./manifest.webmanifest` no `index.html` compilado; gera `dist/service-worker.js` a partir de `../service-worker.js`, trocando `CACHE_VERSION` (hash dos arquivos) e `APP_SHELL` (lista do que fica offline). Falha se não achar o manifesto ou os marcadores.
- `panel-hash.mjs`: `panelSourceHash()` (hash de `src/`, `vite.panel.config.js` e do favicon, sem `\r`) gravado no modelo do painel por `vite.panel.config.js` e conferido por `tests/panel.test.js` (`PANEL_HASH_PATTERN`).
- `serve-dist.mjs`: servidor estático de `dist/` em `127.0.0.1:4186`, sob o prefixo `/giro-estoque/`, bloqueia path traversal. Usado pelo Playwright.

Ao adicionar arquivo que o navegador carrega direto (fora do bundle do Vite), inclua-o em `copy-vendor.mjs`, senão ele não entra no cache offline.
