# tests/

Testes unitários com `node --test` (jsdom para DOM). Rodar: `npm test`.

| Arquivo | Cobre |
|---|---|
| `analysis.test.js` | Regras de ação do Analítico (inclui COMPRAR / COMPRA EM ANDAMENTO / REVISAR SC, desconto das SCs abertas e a escolha da SC do SNAC0540), mapeamento de cabeçalhos, locais 1/298, status contraditório, linhas inválidas, giro e totais por local |
| `app.test.js` | Fluxo da interface em jsdom: importação, remapeamento, formato numérico, exportação Excel/CSV/PDF, instalação PWA, colunas fixas da tabela, preferências, importação do SNAC0540 junto do Analítico, dois campos de anexo da tela inicial (SNAC0540 antes do Analítico, erro no campo), SNAC0540 obrigatório para abrir o painel do Analítico, painel publicado (abre com `#panel-data`, dados de outra versão ou que falham ao montar a tela avisam; `boot(t, { body })`), texto da planilha com HTML vira texto em toda a tela (tabela, detalhes, filtros, atributos, nome do arquivo). O helper `csv` carrega um SNAC0540 mínimo antes de um Analítico (`{ snac: false }` desliga) |
| `markup.test.js` | Peças puras da tabela e dos detalhes (`src/ui/markup.js`): colunas por modo, selo de ação, código copiável, posição, dicas de compra, saldo com limites, campos dos detalhes, botão de detalhes |
| `ui-modules.test.js` | Contrato entre os módulos de `src/ui/` (leitura estática): `main.js` monta todos, cada `createX` devolve só o que outro arquivo usa, nenhum nome em dois módulos, todo `ui.nome` existe |
| `dashboard.test.js` | Estrutura acessível, filtros, busca, cartões de resumo e relatório de resumo (`src/ui/markup.js`), ordenação, paginação, processamento em blocos, CSV exportado |
| `import.test.js` | Leitura de CSV (aspas, aspas no meio do campo, separadores, aspas sem fechar, ANSI/Windows-1252), do relatório SNAC0540 e do .xlsx: o worker (`src/import.worker.js`, rodado em `node:vm`) converte igual à leitura na página; `readXlsxInWorker` com worker falso (abas, erro de leitura, worker que não carrega, sem worker) |
| `panel.test.js` | Dados do painel publicado (`src/panel/data.js`): só as colunas mapeadas e as mesmas linhas que o app analisa (`panelRows`), só SCs dos itens da planilha e sem campos que a tela não usa, `<` escapado, leitura de volta com datas e SCs por item, versão, modelo versionado (`src/panel/template.generated.html`) atualizado em relação às fontes |
| `saved-import.test.js` | Última importação no navegador (`src/saved-import.js`): sem IndexedDB as funções rejeitam e o app segue sem guardar (o fluxo real fica no e2e) |
| `contrast.test.js` | Contraste WCAG dos tokens (`src/styles/tokens.css`) nos dois temas: texto e selos >= 4,5:1, borda de campo >= 3:1 sobre `surface`, `surface-2` e `bg`. O `../dashboard` tem o mesmo teste |
| `regressions.test.js` | Números em texto, valores malformados, totais/linhas vazias, neutralização de fórmulas no CSV, cache offline (a lista do `service-worker.js` sem build bate com os arquivos de `src/`, `src/analysis/`, `src/ui/`, `src/styles/` e `src/styles/layout/`) |

Regra e texto de interface mudaram? Ajuste o teste do arquivo correspondente. Testes de layout e navegador real ficam em `../e2e/`.
