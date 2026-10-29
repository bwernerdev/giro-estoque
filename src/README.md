# src/

Código da aplicação. Sem framework: `template.js` gera o HTML e `main.js` liga eventos e estado.

## JavaScript
| Arquivo | Linhas | Papel |
|---|---|---|
| `analysis.js` | ~260 | **Regras de negócio.** `fields`, `suggestMapping`, `findHeaderRow`, `detectAnalysisMode`, `parseNumber` (pt-BR/en-US), `analyze` (genérico), `analyzeGiro` (BBOG6656), `analyzeAnalitico` (ações BLOQUEAR, TRANSFERIR OBSOLETO, DESBLOQUEAR, ZERAR MIN/MAX), `summarizeLocationTotal`. Locais obsoletos: 1 e 298 |
| `dashboard.js` | ~160 | Filtros (`filterResults`), busca sem acento, `paginate` (`PAGE_SIZE = 50`), `actionCounts`/`prioritizeActionCounts`, `sortResults`, `dataIssueSummary`, `processInChunks` (leitura em blocos) |
| `export-data.js` | ~80 | `buildExportData`, `buildCsv`, `csvField` (neutraliza fórmulas), `currencyNumber`, `shouldIncludeDaysSince` |
| `import.js` | ~70 | `importFile` (xlsx via ExcelJS e csv), `parseCsv`, `selectDataRows` |
| `main.js` | ~1000 | Estado da UI, listas de ações por modo (`ANALITICO_ACTIONS`, `GIRO_ACTIONS`, `GENERIC_ACTIONS`), cartões de resumo, tabela, exportação, tema, PWA |
| `template.js` | ~80 | `renderApp()`: HTML da interface |
| `icons.js` | ~25 | `svgIcon(name)`: ícones SVG inline |

## CSS (`styles/index.css` importa as camadas nesta ordem)
- `fonts.css`: @font-face (arquivos em `fonts/`).
- `tokens.css`: cores, tipografia, espaçamento (4 px), raios, sombras, alturas. O tema escuro só redefine tokens aqui; componentes não têm regras por tema.
- `base.css`: reset, foco, utilitários (`.sr-only`), barra de rolagem.
- `components.css`: botões, campos, badges, avisos, cartão, menu de exportação, painel lateral. Tom semântico por ação (`--tone-*`) vale para badge e cartão do resumo.
- `layout.css`: topbar, antes da importação, barra do painel, configuração, resumo, barra de ferramentas, rodapé e todos os pontos de quebra (480, 720, 1024, 1360, 1700 px).
- `table.css`: tabela de resultados (densidade em `--cell-y`).
- `print.css`: relatório de impressão/PDF.

## Subpasta
- `fonts/`: DM Sans e Manrope em woff2, com licenças.

## Onde mexer
- Nova regra ou ação: `analysis.js` + lista em `main.js` + prioridade em `dashboard.js` (`ACTION_PRIORITY`) + teste em `tests/analysis.test.js`.
- Nova coluna exportada: `export-data.js` + `tests/dashboard.test.js` e `tests/regressions.test.js`.
- Visual: use tokens de `tokens.css` (nunca cores fixas). Layout desktop (≥1024 px) e barra de ferramentas em linha única (≥1360 px) ficam no fim de `layout.css`. Mexeu em largura de filtros ou colunas? Rode os e2e de layout (1024/1366/1920).
