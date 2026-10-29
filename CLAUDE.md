# giro-estoque — mapa rápido

App web local (Vite, JS puro, sem framework) que importa `.xlsx`/`.csv` de estoque, aplica regras de negócio no navegador e exporta Excel/CSV/PDF. Regras de negócio detalhadas: `README.md` (raiz). Cada pasta tem um `README.md` próprio com o mapa dos arquivos.

## Comandos (PowerShell: use `npm.cmd` se scripts estiverem bloqueados)
- `npm run dev`: servidor Vite.
- `npm test`: testes unitários (`node --test tests/*.test.js`, usa jsdom).
- `npm run build`: `vite build` + `scripts/copy-vendor.mjs` (gera `dist/` e o service worker).
- `npm run test:e2e`: build + Playwright (Chrome instalado) em `127.0.0.1:4186/giro-estoque/`.

## Pastas
| Pasta | Conteúdo |
|---|---|
| `src/` | Código da aplicação (regras, tabela, importação, exportação, CSS) |
| `tests/` | Testes unitários |
| `e2e/` | Testes Playwright |
| `scripts/` | Pós-build (cache offline) e servidor de teste |
| `assets/` | Imagens do app |
| `vendor/` | ExcelJS pré-compilado (offline) |
| `.github/workflows/` | Deploy no GitHub Pages |
| `dist/`, `test-results/`, `node_modules/`, `.npm-cache/` | Gerados/ignorados: não ler nem editar |

## Arquivos na raiz
`index.html` (entrada), `manifest.webmanifest` (PWA), `service-worker.js` (modelo; o build injeta `CACHE_VERSION` e `APP_SHELL`), `vite.config.js` (`base: './'`), `playwright.config.js`.

## Convenções
- Textos de interface e mensagens em português do Brasil.
- Regras de ação ficam só em `src/analysis.js`; a UI não as reimplementa.
- Alterou regra ou texto de interface: atualize o teste correspondente e o `README.md` da raiz.
- Caminhos relativos (`./`) para funcionar em subpasta.
- CSS em `src/styles/` (camadas: tokens, base, components, layout, table, print). Só tokens para cor/tamanho/raio/sombra; o tema escuro redefine tokens, sem regras por componente. Verde da marca = ação principal e foco; "selecionado" usa `--ring`; estados usam `--danger/warning/success/info/neutral`.
- Desktop-first: layout de ≥1024 px (página rola inteira, cabeçalho/rodapé da tabela fixos, pesquisa sempre visível) e linha única da barra de ferramentas a partir de 1360 px, em `layout.css`.
- Planilha modelo de importação: `Downloads/ESTOQUE.xlsx` (aba Analítico, ~600 linhas).
