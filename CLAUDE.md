# giro-estoque — mapa rápido

App web local (Vite, JS puro, sem framework) que importa `.xlsx`/`.csv` de estoque, aplica regras de negócio no navegador e exporta Excel/CSV/PDF. Regras de negócio detalhadas: `README.md` (raiz). Cada pasta tem um `README.md` próprio com o mapa dos arquivos.

## Comandos (PowerShell: use `npm.cmd` se scripts estiverem bloqueados)
- `npm run dev`: servidor Vite.
- `npm test`: testes unitários (`node --test tests/*.test.js`, usa jsdom).
- `npm run build`: `vite build` + `scripts/copy-vendor.mjs` (gera `dist/` e o service worker). `prebuild`/`predev` rodam `npm run build:panel` (`vite.panel.config.js`: app inteiro em IIFE dentro de `src/panel/template.generated.html`). **O GitHub Pages serve o código-fonte da `main` sem build** (modo legacy): nada que dependa do Vite (`?raw`, imports sem caminho) funciona no site. O modelo do painel é versionado; mexeu em `src/`, rode `npm run build:panel` e commite o modelo (`tests/panel.test.js` compara o hash de `scripts/panel-hash.mjs`).
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
`index.html` (entrada), `manifest.webmanifest` (PWA), `service-worker.js` (modelo; o build injeta `CACHE_VERSION` e `APP_SHELL`), `vite.config.js` (`base: './'`), `vite.panel.config.js` (modelo do painel publicado), `playwright.config.js`.

## Convenções
- Textos de interface e mensagens em português do Brasil.
- Regras de ação ficam só em `src/analysis.js`; a UI não as reimplementa.
- Alterou regra ou texto de interface: atualize o teste correspondente e o `README.md` da raiz.
- Caminhos relativos (`./`) para funcionar em subpasta.
- CSS em `src/styles/` (camadas: tokens, base, components, layout, table, print). Só tokens para cor/tamanho/raio/sombra; o tema escuro redefine tokens, sem regras por componente. Visual de painel (Segoe UI no texto, Manrope em títulos/números, azul `#2f5bd3`, cinzas neutros, raio 6/8 px, sombra leve `--shadow-1` e `--shadow-2` no hover dos cartões); azul da marca = ação principal, foco e selecionado (`--ring`); estados usam `--danger/warning/success/info/neutral`.
- Desktop-first, em `layout.css`: ≥1024 px a página rola inteira (cabeçalho e rodapé da tabela fixos, pesquisa sempre visível); sem barra lateral (arquivo e configuração na barra superior, filtros de posição e menu `#view-menu` na barra da tabela); ≥1700 px painel de detalhes fixo à direita (`#detail-dock`; abaixo disso, `dialog#item-panel`).
- Visão geral (`#overview`): `#summary-toggle` recolhe `#overview-body` (`html[data-summary]`, salvo no navegador; recolhido mostra o select `#filter` na barra da tabela), `.kpi-row` (`#total-value`, `#idle-value`, `#obsolete-value`; `stockHealth` em `analysis.js`) + `#summary` (botões `.summary-card` viram cartões de indicador com valor por ação via `actionValues`, e filtram a tabela; itens sem ação viram o atalho `.hidden-shortcut`) + `#aging-chart` (valor por faixa de dias sem requisição, `agingSummary`; clicar filtra por `state.agingFilter`). Com o resumo aberto, o select `#filter` fica fora da tela (leitor de tela/teclado) e continua sincronizado. "Mostrar itens ocultos" não é salvo; `#hidden-chip` avisa e desliga.
- Movimento (fim de `layout.css`; `base.css` desliga tudo com `prefers-reduced-motion`): esqueleto `#loading-skeleton` (`.shell.is-loading`, após 120 ms de leitura), entrada em sequência após importar (`.shell.is-entering`, `playEntrance`), números que sobem (`countUp`, guarda o último valor por chave), resumo com altura animada (`setSummaryCollapsed(..., true)`, Web Animations), linhas com fade ao trocar de página (`#result-rows.rows-enter`), View Transitions nos filtros (`withTransition`) e hover (seção "Hover": `.summary-card`/`.money-kpi` inclinam e brilham com `--rx/--ry/--mx/--my` gravados por `applyTilt` em `main.js`, que só escuta `pointermove` enquanto o cursor está sobre um cartão (nada de listener de movimento no `document`); transformações só dentro de `prefers-reduced-motion: no-preference`; botões com `:active` em `components.css`, filete da linha em `table.css`). Barra de valor na célula: `.value-cell` em `table.css`. A partir de 1024 px a topbar é fixa e translúcida (`--topbar-glass`); os elementos fixos abaixo dela somam `--topbar-h`.
- Compras (SNAC0540): `src/purchases.js` lê o relatório (cabeçalho em dois níveis SC/OF/REC, `parsePurchaseReport` → `byItem` por `itemKey`); regras em `analysis.js` (`purchaseInProgress`, `pickPurchaseRequest` mesmo local ou sem local e mais recente em andamento, `purchaseStage`, `purchaseDelivered` (SC já entregue, OF sem saldo, é descartada), `openPurchaseRequests`/`openPurchaseQuantity` (SCs abertas e quanto trazem), ações **COMPRAR**, **COMPRA EM ANDAMENTO** e **REVISAR SC** em `analyzeAnalitico` via `settings.purchases`). Sugestão de compra `toBuy` = até o máximo menos `onOrder` (SCs abertas); SC aberta tira o AJUSTAR MIN/MAX. Tela inicial: dois campos de anexo (`#stock-field` com `#file-input`, `#purchase-field` com `#purchase-input`; `data-state` reading/ok/error via `setAttachState`, soltar no campo carrega aquele tipo). `loadFiles` aceita um ou dois arquivos, separa o SNAC0540 pelo cabeçalho e guarda em `state.purchases` sem trocar o Analítico. SNAC0540 obrigatório no modo Analítico: `loadStock` sem `state.purchases` guarda a planilha e não abre o painel (`openPanel` abre quando o SNAC0540 chega); testes usam um SNAC0540 mínimo (`e2e/helpers.js` `attach`, `csv` em `tests/app.test.js`); botão `#purchase-file` na topbar só no modo Analítico. CSV: `decodeText` (UTF-8, senão Windows-1252) e aspas só no início do campo.
- Exportar: Excel, CSV, PDF da tabela (`exportPdf`, A4 deitado) e PDF de resumo (`exportSummaryPdf` + `buildSummaryReport`, `#print-report.summary-report`, página nomeada `@page summary` A4 em pé em `print.css`; usa `state.overview`, gravado em `refresh`).
- Gerar painel (`src/panel/`, ver README da pasta): `#generate-panel` na topbar baixa `painel-giro-estoque.html` = modelo + `buildPanelData` (aba, mapeamento, modo, critérios, SCs dos itens da planilha) em `#panel-data`. O mesmo `main.js` abre em modo painel quando acha `#panel-data` (`html[data-panel]`, `openEmbeddedPanel`; `html[data-frame]` + `#frame-notice` dentro de iframe); CSS no fim de `layout.css` esconde importar/configurar/Excel. `generate.js` busca o modelo por `fetch(new URL(..., import.meta.url))`. No build do painel `./panel/generate.js` vira `stub.js` e `import.meta.url` é definido (IIFE). Mudou o formato dos dados: suba `PANEL_VERSION`.
- Planilha modelo de importação: `Downloads/ESTOQUE.xlsx` (aba Analítico, ~600 linhas).
