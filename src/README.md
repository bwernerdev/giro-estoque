# src/

Código da aplicação. Sem framework: `template.js` gera o HTML, `main.js` monta o app e os módulos de `ui/` ligam eventos e estado.

## JavaScript
| Arquivo | Papel |
|---|---|
| `analysis.js` | **Regras de negócio.** `fields`, `suggestMapping`, `findHeaderRow`, `detectAnalysisMode`, `parseNumber` (pt-BR/en-US), `analyze` (genérico), `analyzeGiro` (BBOG6656), `analyzeAnalitico` (ações BLOQUEAR, TRANSFERIR OBSOLETO, DESBLOQUEAR, COMPRAR, COMPRA EM ANDAMENTO, REVISAR SC, ZERAR MIN/MAX, AJUSTAR MIN/MAX, com a explicação "Por que" de cada ação), compras (`itemKey`, `purchaseInProgress`, `pickPurchaseRequest`, `purchaseStage`, `purchaseDelivered`, `openPurchaseRequests`, `openPurchaseQuantity`, `purchaseRequestText`, `scCoverageText`), `AGING_BUCKETS`/`agingBucket`/`agingSummary` (faixas de dias sem requisição), `stockHealth` (valor parado ≥180 dias e em locais obsoletos), `summarizeLocationTotal`. Locais obsoletos: 1 e 298 |
| `dashboard.js` | Filtros (`filterResults`), busca sem acento, `paginate` (`PAGE_SIZE = 50`), `actionCounts`/`actionValues` (valor por ação)/`prioritizeActionCounts`, `sortResults`, `dataIssueSummary`, `processInChunks` (leitura em blocos) |
| `export-data.js` | `buildExportData`, `buildCsv`, `csvField` (neutraliza fórmulas), `currencyNumber`, `shouldIncludeDaysSince` |
| `import.js` | `importFile` (xlsx via ExcelJS, lido no worker por `readXlsxInWorker` e, sem worker, na própria página; csv), `decodeText` (UTF-8 ou ANSI/Windows-1252), `parseCsv` (aspas só no início do campo), `selectDataRows` |
| `import.worker.js` | Worker clássico do .xlsx: `importScripts('../vendor/exceljs.min.js')` (relativo: `src/` no fonte, `dist/assets/` no build, que o emite como arquivo por `vite.config.js`) e `readWorkbook`, a mesma conversão de células de `importFile` (`tests/import.test.js` compara as duas) |
| `purchases.js` | Leitura do follow-up de compras SNAC0540: `findPurchaseHeaderRow`/`isPurchaseReport`, `parsePurchaseReport` (colunas pelos blocos SC/OF/REC, SCs agrupadas por item), `parseReportDate` |
| `saved-import.js` | Última importação no IndexedDB do navegador: `saveImport`, `loadSavedImport`, `clearSavedImport` (`SAVED_IMPORT_VERSION`) |
| `main.js` | Entrada: `renderApp()`, contexto (`ui/context.js`), modo painel (`panelMode`, `inFrame`), monta os módulos de `ui/` em ordem, PWA (instalar, service worker), menus Exportar/Exibir fecham ao clicar fora ou com Esc, e abre o painel embutido ou a última importação |
| `template.js` | `renderApp()`: HTML da interface |
| `icons.js` | `svgIcon(name)`: ícones SVG inline |

## Subpastas
- `ui/`: a interface, um módulo por área (marcação, tabela, detalhes, visão geral, importação, exportação, preferências, configuração, movimento). Ver `ui/README.md`.
- `panel/`: "Gerar painel" (painel publicado no SharePoint). Ver `panel/README.md`.
- `styles/`: CSS em camadas (abaixo).
- `fonts/`: Manrope em woff2, com licença (declarada em `styles/fonts.css`; títulos e números). O texto usa Segoe UI do sistema.

## CSS (`styles/index.css` importa as camadas nesta ordem)
- `fonts.css`: @font-face (arquivos em `fonts/`).
- `tokens.css`: cores, tipografia, espaçamento (4 px), raios, sombras, alturas. O tema escuro só redefine tokens aqui; componentes não têm regras por tema.
- `base.css`: reset, foco, utilitários (`.sr-only`), barra de rolagem.
- `components.css`: botões, campos, badges, avisos, cartão, menu de exportação, painel lateral. Tom semântico por ação (`--tone-*`) vale para badge e cartão do resumo.
- `layout.css`: topbar (grid em que só o nome do arquivo encolhe; fixa e translúcida a partir de 1024 px; × que limpa os dados guardados), tela inicial e campos de anexo (`.attach-field`, estados por `data-state`), filtros na barra da tabela, resumo recolhível, aviso de itens ocultos, visão geral (indicadores em reais, cartões, atalho de itens sem ação, gráfico por tempo sem requisição), menu Exibir, configuração, barra de ferramentas, painel de detalhes fixo, rodapé, os pontos de quebra (480, 720, 1024, 1180, 1280 e 1700 px) e, no fim, movimento (entrada após importar, linhas novas, View Transitions), o esqueleto de carregamento, o hover (inclinação e brilho dos cartões com `--rx/--ry/--mx/--my` vindos de `ui/motion.js`, ícone que gira, faixa do gráfico em destaque, borda tracejada animada ao arrastar) e o modo painel publicado.
- `table.css`: tabela de resultados (barra de valor `.value-cell`; densidade em `--cell-y`/`--cell-x`; larguras largas por container query no painel da tabela, porque o painel de detalhes consome largura da janela).
- `print.css`: relatório de impressão/PDF (tabela em A4 deitado; resumo de uma página em A4 em pé, `.summary-report`).

## Onde mexer
- Nova regra ou ação: `analysis.js` + lista em `ui/markup.js` (`ANALITICO_ACTIONS` e afins) + prioridade em `dashboard.js` (`ACTION_PRIORITY`) + teste em `tests/analysis.test.js`.
- Nova coluna exportada: `export-data.js` + `tests/dashboard.test.js` e `tests/regressions.test.js`.
- Novo arquivo carregado direto pelo navegador: entra no `APP_SHELL` de `../service-worker.js` (o teste de regressão avisa).
- Visual: use tokens de `tokens.css` (nunca cores fixas). Layout desktop (≥1024 px) fica no fim de `layout.css`. Mexeu em largura de filtros ou colunas? Rode os e2e de layout (1024/1366/1920).
- Mexeu em qualquer arquivo de `src/`: rode `npm run build:panel` e commite `panel/template.generated.html`.
