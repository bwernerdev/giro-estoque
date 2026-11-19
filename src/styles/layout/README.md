# src/styles/layout/

A estrutura da página, em partes. `../index.css` importa na ordem abaixo, entre `components.css` e `table.css`; a ordem é a da cascata (as partes eram blocos seguidos de um único `layout.css`, e o CSS gerado no build é o mesmo).

| Arquivo | Conteúdo |
|---|---|
| `structure.css` | `.shell`, topbar em grid (só o nome do arquivo encolhe), × que limpa a importação guardada |
| `start.css` | Tela inicial antes da importação (ilustração `.hero-art`, ajuda `.upload-help`), área de soltar, fio de andamento da leitura |
| `workspace.css` | Espaço de trabalho: topbar depois da importação, cabeçalho do Resumo, indicadores em reais (`.kpi-row`), filtros de posição, painel de detalhes fixo |
| `config.css` | Configuração (aba, mapeamento, critérios) |
| `overview.css` | Visão geral: cartões de ação (`--summary-cols`/`--summary-lead`), atalho de itens sem ação, gráfico por tempo sem requisição |
| `table-tools.css` | Barra da tabela: filtros, aviso de ocultos, menu Exibir, pesquisa, contador, filtros ativos (etiquetas `.active-chips`), rodapé e paginação |
| `breakpoints.css` | ≥1024 px (página rola inteira, topbar fixa e translúcida), ≥1700 px (detalhes ao lado), <1024, <1180, <720 e <480 px |
| `motion.css` | Movimento (entrada após importar, linhas novas, View Transitions), esqueleto de carregamento, hover (inclinação e brilho dos cartões com `--rx/--ry/--mx/--my` de `src/ui/motion.js`) |
| `attach.css` | Campos de anexo da tela inicial (`.attach-field`, estados por `data-state`, número do passo `.attach-step`) |
| `panel.css` | Modo painel publicado (`html[data-panel]`): esconde importar, configurar e Excel |

Arquivo novo: `@import` em `../index.css` na posição certa e entrada no `APP_SHELL` de `../../../service-worker.js` (o teste de regressão avisa).
