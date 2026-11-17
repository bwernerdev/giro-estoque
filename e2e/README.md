# e2e/

Testes Playwright no Chrome instalado. Rodar: `npm run test:e2e` (faz o build e sobe `scripts/serve-dist.mjs` em `http://127.0.0.1:4186/giro-estoque/`). Configuração em `../playwright.config.js` (1 worker, sem animações).

| Arquivo | Cobre |
|---|---|
| `app.spec.js` | Build em subpasta, critérios preservados, downloads Excel/CSV completos, leitura XLSX, paginação, impressão, layout em 1024/1366/1920 px e 390/768 px, barra superior completa (Analítico + Instalar app) sem rolagem lateral em 1180/1272/1366 px, última importação guardada no navegador (atualizar reabre o painel, o × limpa) |
| `helpers.js` | `attach` (anexa no campo do Analítico; antes de um Analítico sem SNAC0540, anexa um SNAC0540 mínimo, já que o painel exige os dois) e `attachSnac` |
| `panel.spec.js` | **Gerar painel**: botão só com o painel aberto; baixa `painel-giro-estoque.html` sem arquivos externos; aberto como arquivo (mesmas ações, sem importar/configurar/Excel, CSV funciona, fontes embutidas, nenhuma requisição fora do arquivo) e num iframe `sandbox` com `srcdoc` como o SharePoint (aviso, sem Exportar, detalhes abrem) |
| `table.spec.js` | Tabela sem estouro de largura, descrições após ordenar/buscar/paginar, cópia de códigos com zeros à esquerda, busca expansível (<1024 px) e sempre visível (desktop, atalho `/`), filtros de localização, tamanho de página lembrado, densidade padrão, resumo em uma linha, cabeçalho/rodapé fixos, painel de detalhes (gaveta e fixo em 1920 px), menu Exibir, agrupamento, tom da linha, resumo recolhível e itens ocultos |

Saídas (capturas, PDF, traces) vão para `../test-results/` (ignorado pelo Git). Precisa de `dist/` atualizado: o script já roda o build.
