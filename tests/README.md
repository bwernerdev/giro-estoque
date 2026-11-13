# tests/

Testes unitários com `node --test` (jsdom para DOM). Rodar: `npm test`.

| Arquivo | Cobre |
|---|---|
| `analysis.test.js` | Regras de ação do Analítico (inclui COMPRAR / COMPRA EM ANDAMENTO e a escolha da SC do SNAC0540), mapeamento de cabeçalhos, locais 1/298, status contraditório, linhas inválidas, giro e totais por local |
| `app.test.js` | Fluxo da interface em jsdom: importação, remapeamento, formato numérico, exportação Excel/CSV/PDF, instalação PWA, colunas fixas da tabela, preferências, importação do SNAC0540 junto do Analítico, dois campos de anexo da tela inicial (SNAC0540 antes do Analítico, erro no campo), SNAC0540 obrigatório para abrir o painel do Analítico. O helper `csv` carrega um SNAC0540 mínimo antes de um Analítico (`{ snac: false }` desliga) |
| `dashboard.test.js` | Estrutura acessível, filtros, busca, cartões de resumo, ordenação, paginação, processamento em blocos, CSV exportado |
| `import.test.js` | Leitura de CSV (aspas, aspas no meio do campo, separadores, aspas sem fechar, ANSI/Windows-1252) e do relatório SNAC0540 |
| `regressions.test.js` | Números em texto, valores malformados, totais/linhas vazias, neutralização de fórmulas no CSV, coerência do cache offline |

Regra e texto de interface mudaram? Ajuste o teste do arquivo correspondente. Testes de layout e navegador real ficam em `../e2e/`.
