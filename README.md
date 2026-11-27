# Giro de Estoque
App web local: importa `.xlsx`/`.csv` (relatório Analítico, BBOG6656 ou estoque e vendas) e diz o que fazer com cada item e quanto valor está parado. Dados não saem do computador (análise no navegador, leitura do .xlsx em worker).

## Executar
- Dev: Go Live servindo `projetos` em `http://127.0.0.1:5500/giro-estoque/`, ou `npm install` + `npm run dev`. PowerShell sem scripts: `npm.cmd`.
- Produção: `npm ci` + `npm run build`, publicar `dist/`. GitHub Pages publica `dist/` por Actions (desde 16/11/2026). Caminhos relativos: funciona na raiz e em subpasta (acessar com barra final).
- `dev` e `build` rodam antes `npm run build:panel` (gera `src/panel/template.generated.html`). O modelo é versionado para o app rodar sem build (Go Live). Mexeu em `src/`? Rode `build:panel` e commite o modelo junto; `npm test` falha se estiver desatualizado.
- Testes: `npm test` (regras, filtros, paginação, exportação, acessibilidade). `npm run test:e2e` (build + Chrome instalado: subpasta, XLSX/CSV, downloads, impressão, 390 a 1920 px; servidor `127.0.0.1:4186`; saída em `test-results/`, ignorada).

## Importar
- Dois campos: **1 Relatório Analítico** (também aceita BBOG6656 e estoque e vendas) e **2 SNAC0540**. Clicar ou arrastar; arrastar os dois juntos funciona (o app separa pelo cabeçalho). O campo 2 recusa outra planilha.
- Com o Analítico, os dois são obrigatórios (qualquer ordem; o primeiro espera o outro). BBOG6656 e estoque e vendas abrem sem SNAC0540. Trocar o Analítico mantém o SNAC0540.
- Cabeçalho procurado nas 20 primeiras linhas; várias abas (escolha na interface); mapeamento corrigível após importar. `Cd Item` = código; `Ds Item`/`Nm Item` = nome.
- **Tipo de análise** automático: Analítico se há suas colunas; estoque/vendas se há ambas. Coluna extra de valor não muda vendas para giro monetário. Critérios ficam por tipo durante a sessão.
- **Formato dos números em texto**: padrão Brasileiro (`1.234` = 1234); Internacional para ponto decimal. Células numéricas do Excel não mudam. Texto malformado (`abc12`, `1e3`) não vira número. Fórmulas: vale o resultado salvo (abra e salve no Excel antes se não houver).
- **Memória local:** a última importação (Analítico + SNAC0540, aba, mapeamento, critérios) fica no IndexedDB e volta ao reabrir. O **×** ao lado do nome do arquivo apaga (use em computador compartilhado). Importação incompatível é apagada com aviso.
- Linhas vazias e totais identificados (`Total`, `Subtotal`, `Total geral`, `Soma`) sem código são ignorados; sem identificação, ficam para revisão com a linha original.

## Tela
- **Resumo** (recolhível, escolha salva): valor total do estoque (Vl Saldo; com filtro de posição, só dela) e, no Analítico com valor, **Parado há 180 dias ou mais** (saldo > 0, 180+ dias sem requisição, fora dos locais 1 e 298) e **Em locais obsoletos (1 e 298)**.
- **Cartões** por ação (contagem, valor, % do total) e **Itens com ação**; filtram a tabela. Itens sem ação: atalho **Ver N itens sem ação**.
- Gráfico **Tempo sem requisição**: valor em 0-89, 90-179, 180-364 e 365+ dias (180+ em amarelo/vermelho, com %). Clicar filtra (itens ocultos entram). Sem coluna de valor, indicadores e gráfico somem.
- Filtros ativos viram etiquetas com ×; **Limpar tudo**. Local, Prateleira e Repartição ficam na barra da tabela. Tabela vazia explica o motivo e oferece a saída.
- Atalhos: `/` busca, `↑/↓` navega itens, `Esc` fecha, `?` lista de atalhos (não aparece em toque). Detalhes: gaveta; fixo à direita a partir de 1700 px.
- Menu **Exibir**: Modo compacto, Zebrado, Agrupar por ação (com **Exportar grupo**), Mostrar itens ocultos (não lembrado entre importações). Tema claro/escuro (segue o sistema até haver escolha manual). Movimento reduzido do sistema desliga as animações.
- Layout: desktop; ajusta abaixo de 1024, 720 e 480 px e acima de 1700 px. Abaixo de 1024 px a coluna Descrição fica fixa à esquerda.
- Colunas do Analítico: **Descrição**, **Código**, **Posição** (local · prateleira · repartição, ex. `7 · 0 · I`; vazio no fim some, no meio vira `—`), **Qtd. atual**, **Mín. / Máx**, **Valor** (ordenável, com barra relativa; o BBOG6656 usa **Estoque (R$)**), **Ação**, **Sem requisição** (`Dif Dias`).
- **Detalhes:** O que fazer, Saldo e limites (régua mín/máx), Compra (SC), Movimento e bloqueio; seção sem dado some. Traz **Por que** (a regra que gerou cada ação).

## Validação
Quantidade negativa, mínimo > máximo, status não reconhecido e obrigatório ausente = **Verificar dados** (linha visível, campo em **Dados a revisar**, filtro e cartão próprios). `Ds Motivo Bloqueio` vazio + `Id Bloqueio` = **Desbloqueado** conta como desbloqueado; estados conflitantes = **Verificar dados**, sem ação operacional.

## Regras de ação (Analítico)
- `Dif Dias >= 90`, `Qtde Atual > 0`, Desbloqueado: **BLOQUEAR**.
- `Dif Dias >= 180`, `Qtde Atual > 0`, `Bloqueado por saldo`, fora dos locais 1 e 298: **TRANSFERIR OBSOLETO** (se `Id Bloqueio` já indica bloqueio) ou **BLOQUEAR E TRANSFERIR OBSOLETO**.
- `Dif Dias >= 180`, `Qtde Atual > 0`, Desbloqueado, local fora de 1, 7 e 298: **BLOQUEAR E TRANSFERIR OBSOLETO** (substitui BLOQUEAR). Local 7: só BLOQUEAR.
- Já nos locais 1 ou 298: sem nova transferência; `Dif Dias >= 180`, saldo > 0, Desbloqueado = **BLOQUEAR** (não repete se já bloqueado).
- `Qtde Atual = 0`, `Bloqueado por saldo`: **DESBLOQUEAR**.
- `Qtde Atual > 0`, Min ou Max ≠ 0, local 1 ou 298, `Dif Dias >= 180`, `Id Bloqueio` começa por Bloqueado: **ZERAR MIN/MAX**. Sem outra ação: **Sem ação definida** (oculto).
- `Qtde Atual > 0`, `Dif Dias < 90`, `Qtde Atual > Qnt Max`: **AJUSTAR MIN/MAX**. Não vale nos locais 1/298 com Min e Max zerados. Com SC aberta vira **REVISAR SC**.
- `Qtde Atual < Qnt Min`, fora dos locais 1 e 298, sem bloqueio, sem BLOQUEAR/BLOQUEAR E TRANSFERIR na análise e `Dif Dias < 90` (sem `Dif Dias`, não barra): **COMPRAR**. Sugestão = `Qnt Max − Qtde Atual` (máximo vazio ou ≤ saldo: até o mínimo), **menos o que as SCs abertas trazem**.
  - SCs cobrem tudo: **COMPRA EM ANDAMENTO** (oculta por padrão).
  - Cobrem parte: segue **COMPRAR** com o restante e aviso **SC insuficiente** (tabela: `cobre 3 de 7`, `, não chega ao mín.`; Por que; detalhes; coluna **Cobertura da SC** na exportação).
- SC aberta em item sem necessidade de compra (saldo ≥ mínimo, 90+ dias sem requisição, local 1/298, bloqueado ou com bloqueio recomendado): **REVISAR SC**. O Por que diz onde o saldo chega com a SC (saldo + a receber) frente aos limites.
- **Ocultos por padrão:** Sem ação definida, COMPRA EM ANDAMENTO e itens com `Qtde Atual = 0`, Min = 0, Max = 0, Desbloqueado. Mostrar: **Ver N itens sem ação** ou **Mostrar itens ocultos**; o aviso **Itens ocultos incluídos** (ou **Somente itens ocultos**) os esconde de novo.

## SNAC0540 (compras)
Substitui a planilha CONTROLE DE ITENS PARA COMPRA (Analítico = abas Local N e Base_Bloqueados; SNAC0540 = Base_Dados_SRP). Exportar sem mexer nas colunas: CSV do sistema (ANSI, `;`) ou o mesmo em .xlsx. Reconhecido pelo cabeçalho de duas linhas (blocos **SC**, **OF**, **REC**). Para trocar com o painel aberto: botão **SNAC0540** na barra superior ou arrastar.
- SCs do mesmo `Cód. Produto` (só dígitos: `6.470` = `6470`) no mesmo local; SC sem **Local Estoque** vale para qualquer local.
- **Em andamento:** situação Compra confirmada, Usuario preenchendo, Comprador negociando ou Aguardando autorização; `Cancelado` ≠ **S**; OF não Cancelada nem Fechada; não recebida (sem `Nr NF`, ou com nota e saldo a entregar). A receber = saldo a entregar da OF, ou a quantidade da SC sem OF (linha de SC repetida por recebimento parcial conta uma vez).
- Cancelada, recebida ou OF fechada não segura a compra (item segue **COMPRAR**). SC já entregue não aparece na tabela, nos detalhes nem na exportação.
- Tabela: mostra a SC mais recente em andamento (sem nenhuma, a mais recente, só informativa). **Mín. / Máx** traz a sugestão (`comprar 7 até o máx.`, `comprar 4 até o máx. (+5 em SC)`, `SC cobre o máx.`); **Ação** traz `SC 7609604 · Compra confirmada`, `Cancelada`, `OF cancelada`, `OF fechada sem entrega`. Detalhes: Sugestão de compra, Em SC aberta, Solicitação de compra (SC, data, situação, OF, NF, fornecedor). A coluna OBS da planilha antiga não tem equivalente.

## Exportar
- Menu **Exportar**: Excel, **PDF da tabela**, **PDF de resumo (1 página)** e CSV. Tabela: 50 itens por página; exportações incluem todos os itens do filtro de ação, busca e **Mostrar itens ocultos**, de todas as páginas.
- PDF: o navegador abre a impressão (**Salvar como PDF**). **Tabela** (A4 deitado): filtros, arquivo, aba, hora, linhas alternadas, **Página N de M**. **Resumo** (A4 em pé): indicadores em reais com %, itens com ação, tabela de ações (itens, %, valor) e o gráfico; respeita Local/Prateleira/Repartição ("Recorte"), mas não busca, filtro de ação nem itens ocultos (citados em nota). Sem coluna de valor, só contagens.
- Excel/CSV: **Ações** ou **Recomendação**, **Motivo**, **Linha na planilha**, **Classificação** (Analítico) e **Dias desde a última movimentação** (`Dif Dias`; removida só com DESBLOQUEAR selecionado). Com COMPRAR, COMPRA EM ANDAMENTO ou REVISAR SC: **Sugestão de compra (até o máximo)**, **Em SC aberta**, **Cobertura da SC**, **SC**, **Data da SC**, **Situação da SC**, **OF**, **Situação da OF**, **Andamento da SC**. Valor ausente = em branco. CSV: `;` e vírgula decimal; texto que parece fórmula ganha apóstrofo. XLSX: texto como texto, valores como número.

## Gerar painel (SharePoint)
- **Gerar painel** baixa `painel-giro-estoque.html` (app com CSS, fontes, ícone e dados embutidos) para o OneDrive/SharePoint, com link na Intranet. Mostra **Dados de** (hora da geração); ações recalculadas ao abrir com as mesmas regras; não guarda nada no navegador.
- Só consulta: sem Trocar arquivo, SNAC0540, Abrir configuração, Gerar painel nem Excel. CSV e PDF ficam. No quadro do SharePoint (download/impressão bloqueados), **Exportar** some e aparece aviso para usar ⋯ › Baixar.
- Dados: só as colunas mapeadas da aba, o mapeamento, tipo, critérios e as SCs do SNAC0540 dos itens da planilha (sem solicitante, nome do produto nem data de entrega).
- Atualizar: gerar de novo e **Substituir** (mesmo nome); o link não muda.

## Outros modos
- **BBOG6656** (Giro De Estoques Almoxarifado Por Filial): giro = `Valor do Estoque ÷ Valor do Consumo × 30`, recalculado e conferido com `Giro em Dias`. Sem consumo: **Investigar sem consumo**; consumo com saldo em branco: **Confirmar saldo**. Faixas configuráveis (sugestões): até 30 dias **Planejar reposição**; 30-90 **Manter**; acima de 90 **Reduzir compras**; acima de 365 **Avaliar transferência**.
- **Genérico** (item, estoque atual, vendas 30 dias, prazo de reposição; recomendações **provisórias**): média diária = vendas 30 d ÷ 30; cobertura = estoque ÷ média; ponto de reposição = média × (prazo + dias de segurança); comprar no ponto ou abaixo; avaliar excesso acima do limite de cobertura; senão manter. Sem histórico de venda, não supõe vendas futuras.

## Código
- `src/analysis/` regras e validação (`src/analysis.js` reexporta). `src/dashboard.js` busca, filtros, resumo, paginação, blocos.
- `src/import.js`, `src/purchases.js` leitura (XLSX/CSV, SNAC0540). `src/export-data.js` dados de Excel/CSV. `src/saved-import.js` importação guardada.
- `src/template.js` HTML. `src/main.js` entrada. `src/ui/` interface por área. `src/icons.js` ícones SVG.
- `src/styles/` CSS em camadas via `index.css`; cores, tamanhos e sombras em `tokens.css` (o escuro só redefine tokens).
- `src/panel/` Gerar painel; `vite.panel.config.js` empacota o `.html` único. ExcelJS e fontes ficam em `vendor/` (funciona sem internet).

## Auditoria de dependências (25/09/2026)
`npm audit`: 2 alertas moderados em `exceljs → uuid` ([GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), `v3`/`v5`/`v6` com buffer externo). ExcelJS 4.4.0 usa só `v4()` sem buffer: caminho afetado não usado. Mantidos; sem `npm audit fix --force` (downgrade incompatível para 3.4.0). O bundle em `vendor/` não entra na auditoria: revisar junto com qualquer atualização do pacote.
