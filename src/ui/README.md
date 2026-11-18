# src/ui/

A interface, dividida por área. `../main.js` cria o contexto e chama cada `createX(ui)` nesta ordem: config, motion, preferences, table, details, overview, export, importer.

## Como os módulos conversam
- `context.js` cria `ui` com `state` (estado da tela), `el` (atalho de `querySelector`), `message` e `setProgress`. `main.js` acrescenta `panelMode`, `panelSource` e `inFrame`.
- Cada `createX(ui)` define suas funções, liga os eventos da sua área e devolve as funções; `main.js` junta tudo em `ui`. Função de outro módulo é chamada como `ui.nome()` (no momento do evento, quando todos já estão montados).
- Nada fica guardado no nível do arquivo: os testes recarregam `main.js` a cada teste e precisam de estado limpo. Contadores e variáveis de cada área ficam dentro do `createX`.
- A ordem só importa para o que roda ao montar: `preferences` aplica tema, densidade e zebrado já na criação e usa `config` (`isAnaliticoMode`) e `motion` (`reducedMotion`).

| Arquivo | Papel |
|---|---|
| `markup.js` | **Puro** (sem DOM nem estado, testado em `tests/dashboard.test.js`): `ANALITICO_ACTIONS`/`GIRO_ACTIONS`/`GENERIC_ACTIONS`, `slug`, `escapeHtml`, `realCurrency`/`itemCurrency`, `actionIcon`, `actionLabelHtml`, cartões (`buildSummaryMarkup`, `summaryGridLayout`: colunas sem buraco na grade), gráfico (`buildAgingChartMarkup`), indicadores (`buildHealthMarkup`, `buildTotalMarkup`), relatório de resumo (`buildSummaryReport`) |
| `context.js` | `createContext()`: estado inicial, `el`, `message`, `setProgress` |
| `config.js` | Aba, mapeamento, tipo de análise e critérios: `currentSheet`, `dataRows`, `currentMode`, `isAnaliticoMode`, `isGiroMode`, `isMapped`, `requiredKeys`, `renderMapping`, `renderSettings`, `setConfigExpanded` |
| `motion.js` | `reducedMotion`, `withTransition` (View Transitions), `countUp`/`resetCountUp`, `playEntrance`, inclinação dos cartões (`applyTilt`, só escuta o mouse sobre um cartão) |
| `preferences.js` | Guardado no navegador: tema, densidade, zebrado, agrupar, resumo recolhido (`setSummaryCollapsed`), bolinha do Exibir (`updateViewDot`), filtros (`readFilterPreferences`, `persistFilters`, `applyFilterPreferences`) |
| `table.js` | Colunas (`resultColumns`, `renderTableHead`), linhas (`renderResults`, `badgeHtml`, `buyHint`, `purchaseHint`, `codeHtml`, `positionHtml`), descrição expansível (`resetExpansions`), `visibleResults`, `primaryAction`, busca (`setSearchExpanded`, atalho `/`), paginação, ordenação, agrupamento |
| `details.js` | Detalhes do item: `detailFields`, gaveta `dialog#item-panel` ou painel fixo (≥1700 px, `docked`), `openItemPanel`, `stepItemPanel` (setas), `closeItemPanel`, `copyCode` |
| `overview.js` | `refresh` (roda as regras em blocos e redesenha), visão geral (`renderOverview`, cartões com `--summary-cols`/`--summary-lead` da grade, gráfico), filtros de posição (`updatePositionFilters`), aviso de filtros ativos, itens ocultos, cliques nos cartões e no gráfico |
| `export.js` | Excel, CSV, PDF da tabela, PDF de resumo (`exportSummaryPdf`), `saveBlob` e **Gerar painel** (`generatePanel`, carrega `../panel/generate.js` sob demanda) |
| `importer.js` | Campos de anexo (`setAttachState`), barra do arquivo (`renderImportContext`, `importStamp`), SNAC0540 (`setPurchases`, `renderPurchaseContext`), `loadStock`, `loadFiles`, arrastar e soltar, `openPanel`, painel publicado (`openEmbeddedPanel`) e a última importação no navegador (`persistImport`, `restoreSavedImport`, `clearImport`) |
