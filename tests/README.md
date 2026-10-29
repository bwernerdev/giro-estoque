# tests/

Testes unitários com `node --test` (jsdom para DOM). Rodar: `npm test`.

| Arquivo | Cobre |
|---|---|
| `analysis.test.js` | Regras de ação do Analítico, mapeamento de cabeçalhos, locais 1/298, status contraditório, linhas inválidas, giro e totais por local |
| `app.test.js` | Fluxo da interface em jsdom: importação, remapeamento, formato numérico, exportação Excel/CSV/PDF, instalação PWA, colunas fixas da tabela, preferências |
| `dashboard.test.js` | Estrutura acessível, filtros, busca, cartões de resumo, ordenação, paginação, processamento em blocos, CSV exportado |
| `import.test.js` | Leitura de CSV (aspas, separadores, aspas sem fechar) |
| `regressions.test.js` | Números em texto, valores malformados, totais/linhas vazias, neutralização de fórmulas no CSV, coerência do cache offline |

Regra e texto de interface mudaram? Ajuste o teste do arquivo correspondente. Testes de layout e navegador real ficam em `../e2e/`.
