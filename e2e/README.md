# e2e/

Testes Playwright no Chrome instalado. Rodar: `npm run test:e2e` (faz o build e sobe `scripts/serve-dist.mjs` em `http://127.0.0.1:4186/giro-estoque/`). Configuração em `../playwright.config.js` (1 worker, sem animações).

| Arquivo | Cobre |
|---|---|
| `app.spec.js` | Build em subpasta, critérios preservados, downloads Excel/CSV completos, leitura XLSX, paginação, impressão, layout em 1024/1366/1920 px e 390/768 px |
| `table.spec.js` | Tabela sem estouro de largura, descrições após ordenar/buscar/paginar, cópia de códigos com zeros à esquerda, busca expansível (<1024 px) e sempre visível (desktop, atalho `/`), filtros de localização, tamanho de página lembrado, densidade padrão, resumo em uma linha, cabeçalho/rodapé fixos, painel de detalhes (gaveta e fixo em 1920 px), abas de ação, barra lateral, agrupamento e tom da linha |

Saídas (capturas, PDF, traces) vão para `../test-results/` (ignorado pelo Git). Precisa de `dist/` atualizado: o script já roda o build.
