# src/ui/

A interface, dividida por área. `../main.js` cria o contexto e chama cada `createX(ui)` nesta ordem: selectors, config, motion, preferences, table, details, overview, export, importer.

## Como os módulos conversam
- `context.js` cria `ui` com `state` (estado da tela), `el` (atalho de `querySelector`), `message` e `setProgress`. `main.js` acrescenta `panelMode`, `panelSource` e `inFrame`.
- Cada `createX(ui)` define suas funções, liga os eventos da sua área e devolve **só** as funções que outro módulo (ou `main.js`) usa; o resto fica interno. `main.js` junta tudo em `ui`. `tests/ui-modules.test.js` confere: nada devolvido sem uso fora do módulo, nenhum nome em dois módulos e todo `ui.nome` existe. Função de outro módulo é chamada como `ui.nome()` (no momento do evento, quando todos já estão montados).
- Nada fica guardado no nível do arquivo: os testes recarregam `main.js` a cada teste e precisam de estado limpo. Contadores e variáveis de cada área ficam dentro do `createX`.
- A ordem só importa para o que roda ao montar: `selectors` vem primeiro; `config` lê as consultas ao montar e `preferences` aplica tema, densidade e zebrado já na criação, usando `selectors` (`isAnaliticoMode`) e `motion` (`reducedMotion`).
- HTML que não depende de estado vai para `markup.js` como função exportada e é importado direto, sem passar por `ui`.

| Arquivo | Papel |
|---|---|
| `markup.js` | **Puro** (sem DOM nem estado; testado em `tests/dashboard.test.js` e `tests/markup.test.js`): `ANALITICO_ACTIONS`/`GIRO_ACTIONS`/`GENERIC_ACTIONS`, `slug`, `escapeHtml`, `realCurrency`/`itemCurrency`, `actionIcon`, `actionLabelHtml`, cartões (`buildSummaryMarkup`, `summaryGridLayout`: colunas sem buraco na grade), gráfico (`buildAgingChartMarkup`), indicadores (`buildHealthMarkup`, `buildTotalMarkup`), relatório de resumo (`buildSummaryReport`) e as peças da tabela e dos detalhes: `resultColumns`, `columnClass`, `urgentAction`, `badgeHtml`, `codeHtml`, `positionHtml`, `buyHint`, `purchaseHint`, `limitsText`, `detailFields(reason, row, analitico)`, `detailsHtml` |
| `context.js` | `createContext()`: estado inicial, `el`, `message`, `setProgress` |
| `selectors.js` | Consultas ao estado, sem tocar na tela: `currentSheet`, `dataRows`, `currentMode`, `isAnaliticoMode`, `isGiroMode`, `isMapped`, `requiredKeys` |
| `config.js` | Aba, mapeamento, tipo de análise e critérios: `renderMapping`, `renderSettings`, `setConfigExpanded` |
| `motion.js` | `reducedMotion`, `withTransition` (View Transitions), `countUp`/`resetCountUp`, `playEntrance`, inclinação dos cartões (`applyTilt`, só escuta o mouse sobre um cartão) |
| `preferences.js` | Guardado no navegador: tema, densidade, zebrado, agrupar, resumo recolhido (`setSummaryCollapsed`), bolinha do Exibir (`updateViewDot`), filtros (`readFilterPreferences`, `persistFilters`, `applyFilterPreferences`) |
| `table.js` | Cabeçalho (`renderTableHead`), linhas (`renderResults`, com as peças de `markup.js`), descrição expansível (`resetExpansions`), `visibleResults`, busca (atalho `/`), paginação, ordenação, agrupamento |
| `details.js` | Detalhes do item: gaveta `dialog#item-panel` ou painel fixo (≥1700 px), `openItemPanel`, setas para o item vizinho, `closeItemPanel`, `copyCode` (campos vêm de `detailFields` em `markup.js`) |
| `overview.js` | `refresh` (roda as regras em blocos e redesenha), visão geral (`renderOverview`, cartões com `--summary-cols`/`--summary-lead` da grade, gráfico), filtros de posição (`updatePositionFilters`), aviso de filtros ativos, itens ocultos, cliques nos cartões e no gráfico |
| `export.js` | Excel, CSV, PDF da tabela, PDF de resumo (`exportSummaryPdf`), `saveBlob` e **Gerar painel** (`generatePanel`, carrega `../panel/generate.js` sob demanda) |
| `importer.js` | Campos de anexo (`setAttachState`), barra do arquivo (`renderImportContext`, `importStamp`), SNAC0540 (`setPurchases`, `renderPurchaseContext`), `loadStock`, `loadFiles`, arrastar e soltar, `openPanel`, painel publicado (`openEmbeddedPanel`) e a última importação no navegador (`persistImport`, `restoreSavedImport`, `clearImport`) |
