# src/analysis/

Regras de negócio, sem DOM. `../analysis.js` reexporta tudo; o resto do app importa de lá.

| Arquivo | Papel |
|---|---|
| `fields.js` | `fields` (campos e apelidos de cabeçalho), `ANALITICO_REQUIRED_KEYS`, `normalize`, `normalizeLocalKey`, `stockLocation`, `suggestMapping`, `findHeaderRow`, `detectAnalysisMode` |
| `numbers.js` | `parseNumber` (pt-BR/en-US), `formatNumber` |
| `generic.js` | `analyze`: estoque e vendas de 30 dias, ponto de reposição (Comprar, Manter, Avaliar excesso, Avaliar sem giro, Sem movimento) |
| `giro.js` | `analyzeGiro` (BBOG6656): giro = valor do estoque ÷ valor do consumo × 30 |
| `analitico.js` | `analyzeAnalitico` em etapas: `readRow` (lê a linha), `blockState` (situação do bloqueio), `dataIssues` (o que corrigir na planilha), `blockActions` (BLOQUEAR, TRANSFERIR OBSOLETO, DESBLOQUEAR), `purchaseActions` (COMPRAR, COMPRA EM ANDAMENTO, REVISAR SC, sugestão `toBuy` e `scCoverage`), `limitAction` (ZERAR/AJUSTAR MIN/MAX) e a visibilidade. Locais obsoletos: 1 e 298 |
| `purchase-rules.js` | Regras sobre o SNAC0540: `itemKey`, `purchaseInProgress`, `openPurchaseRequests`, `openPurchaseQuantity`, `purchaseDelivered`, `pickPurchaseRequest`, `purchaseStage`, `purchaseRequestText`, `scCoverageText` |
| `indicators.js` | `AGING_BUCKETS`, `agingBucket`, `agingSummary`, `stockHealth` (parado ≥180 dias e em locais obsoletos), `summarizeLocationTotal` |

## Onde mexer
- Regra nova do Analítico: a etapa certa em `analitico.js`, com a explicação ("Por que") ao lado da ação; teste em `../../tests/analysis.test.js`; lista de ações em `../ui/markup.js` e prioridade em `../dashboard.js`.
- Arquivo novo aqui: reexportar em `../analysis.js` e incluir no `APP_SHELL` de `../../service-worker.js`.
