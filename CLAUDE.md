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
- CSS em `src/styles/` (camadas: tokens, base, components, layout, table, print). Só tokens para cor/tamanho/raio/sombra; o tema escuro redefine tokens, sem regras por componente. Visual de painel (Segoe UI no texto, Manrope em títulos/números, azul `#2f5bd3`, cinzas neutros, raio 6/8 px, sombra leve `--shadow-1` e `--shadow-2` no hover dos cartões); azul da marca = ação principal, foco e selecionado (`--ring`); estados usam `--danger/warning/success/info/neutral`.
- Desktop-first, em `layout.css`: ≥1024 px a página rola inteira (cabeçalho e rodapé da tabela fixos, pesquisa sempre visível); sem barra lateral (arquivo e configuração na barra superior, filtros de posição e menu `#view-menu` na barra da tabela); ≥1700 px painel de detalhes fixo à direita (`#detail-dock`; abaixo disso, `dialog#item-panel`).
- Visão geral (`#overview`): `#summary-toggle` recolhe `#overview-body` (`html[data-summary]`, salvo no navegador; recolhido mostra o select `#filter` na barra da tabela), `.kpi-row` (`#total-value`, `#idle-value`, `#obsolete-value`; `stockHealth` em `analysis.js`) + `#summary` (botões `.summary-card` viram cartões de indicador com valor por ação via `actionValues`, e filtram a tabela; itens sem ação viram o atalho `.hidden-shortcut`) + `#aging-chart` (valor por faixa de dias sem requisição, `agingSummary`; clicar filtra por `state.agingFilter`). Com o resumo aberto, o select `#filter` fica fora da tela (leitor de tela/teclado) e continua sincronizado. "Mostrar itens ocultos" não é salvo; `#hidden-chip` avisa e desliga.
- Movimento (fim de `layout.css`; `base.css` desliga tudo com `prefers-reduced-motion`): esqueleto `#loading-skeleton` (`.shell.is-loading`, após 120 ms de leitura), entrada em sequência após importar (`.shell.is-entering`, `playEntrance`), números que sobem (`countUp`, guarda o último valor por chave), resumo com altura animada (`setSummaryCollapsed(..., true)`, Web Animations), linhas com fade ao trocar de página (`#result-rows.rows-enter`) e View Transitions nos filtros (`withTransition`). Barra de valor na célula: `.value-cell` em `table.css`. A partir de 1024 px a topbar é fixa e translúcida (`--topbar-glass`); os elementos fixos abaixo dela somam `--topbar-h`.
- Planilha modelo de importação: `Downloads/ESTOQUE.xlsx` (aba Analítico, ~600 linhas).
