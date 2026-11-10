# src/

Código da aplicação. Sem framework: `template.js` gera o HTML e `main.js` liga eventos e estado.

## JavaScript
| Arquivo | Linhas | Papel |
|---|---|---|
| `analysis.js` | ~260 | **Regras de negócio.** `fields`, `suggestMapping`, `findHeaderRow`, `detectAnalysisMode`, `parseNumber` (pt-BR/en-US), `analyze` (genérico), `analyzeGiro` (BBOG6656), `analyzeAnalitico` (ações BLOQUEAR, TRANSFERIR OBSOLETO, DESBLOQUEAR, ZERAR MIN/MAX, AJUSTAR MIN/MAX, com a explicação "Por que" de cada ação), `AGING_BUCKETS`/`agingBucket`/`agingSummary` (faixas de dias sem requisição), `stockHealth` (valor parado ≥180 dias e em locais obsoletos), `summarizeLocationTotal`. Locais obsoletos: 1 e 298 |
| `dashboard.js` | ~160 | Filtros (`filterResults`), busca sem acento, `paginate` (`PAGE_SIZE = 50`), `actionCounts`/`actionValues` (valor por ação)/`prioritizeActionCounts`, `sortResults`, `dataIssueSummary`, `processInChunks` (leitura em blocos) |
| `export-data.js` | ~80 | `buildExportData`, `buildCsv`, `csvField` (neutraliza fórmulas), `currencyNumber`, `shouldIncludeDaysSince` |
| `import.js` | ~70 | `importFile` (xlsx via ExcelJS e csv), `parseCsv`, `selectDataRows` |
| `main.js` | ~1000 | Estado da UI, listas de ações por modo (`ANALITICO_ACTIONS`, `GIRO_ACTIONS`, `GENERIC_ACTIONS`), cartões de indicador e atalho de itens sem ação (`buildSummaryMarkup`), indicadores em reais (`buildHealthMarkup`), gráfico por tempo sem requisição que filtra a tabela (`buildAgingChartMarkup`), tabela (coluna Posição combinada), painel de detalhes, menus Exibir/Exportar, exportação, tema, PWA |
| `template.js` | ~80 | `renderApp()`: HTML da interface |
| `icons.js` | ~25 | `svgIcon(name)`: ícones SVG inline |

## CSS (`styles/index.css` importa as camadas nesta ordem)
- `fonts.css`: @font-face (arquivos em `fonts/`).
- `tokens.css`: cores, tipografia, espaçamento (4 px), raios, sombras, alturas. O tema escuro só redefine tokens aqui; componentes não têm regras por tema.
- `base.css`: reset, foco, utilitários (`.sr-only`), barra de rolagem.
- `components.css`: botões, campos, badges, avisos, cartão, menu de exportação, painel lateral. Tom semântico por ação (`--tone-*`) vale para badge e cartão do resumo.
- `layout.css`: topbar clara (fixa e translúcida a partir de 1024 px; arquivo e configuração após importar), antes da importação, filtros na barra da tabela, resumo recolhível, aviso de itens ocultos, visão geral (indicadores em reais, cartões, atalho de itens sem ação, gráfico por tempo sem requisição), menu Exibir, configuração, barra de ferramentas, painel de detalhes fixo, rodapé os pontos de quebra (480, 720, 1024, 1180, 1280 e 1700 px) e, no fim, movimento (entrada após importar, linhas novas, View Transitions) e o esqueleto de carregamento.
- `table.css`: tabela de resultados (barra de valor `.value-cell`; densidade em `--cell-y`/`--cell-x`; larguras largas por container query no painel da tabela, porque o painel de detalhes consome largura da janela).
- `print.css`: relatório de impressão/PDF.

## Subpasta
- `fonts/`: DM Sans e Manrope em woff2, com licenças (declaradas em `fonts.css`; o app usa Manrope em títulos e números e Segoe UI no texto).

## Onde mexer
- Nova regra ou ação: `analysis.js` + lista em `main.js` + prioridade em `dashboard.js` (`ACTION_PRIORITY`) + teste em `tests/analysis.test.js`.
- Nova coluna exportada: `export-data.js` + `tests/dashboard.test.js` e `tests/regressions.test.js`.
- Visual: use tokens de `tokens.css` (nunca cores fixas). Layout desktop (≥1024 px) e barra de ferramentas em linha única (≥1360 px) ficam no fim de `layout.css`. Mexeu em largura de filtros ou colunas? Rode os e2e de layout (1024/1366/1920).
