# Controle de Estoque

Sistema web local para importar `.xlsx` ou `.csv` e analisar materiais.

## Executar

Abra `http://127.0.0.1:5500/giro-estoque/` com a extensão **Go Live** servindo a pasta `projetos`. O projeto também pode ser iniciado com `npm install` e `npm run dev`.

Para produção, execute `npm ci` e `npm run build`, depois publique o conteúdo de `dist/`. Os caminhos são relativos: a distribuição funciona tanto na raiz quanto em uma subpasta como `/giro-estoque/`. Acesse pelo endereço da pasta com a barra final. No PowerShell com scripts desabilitados, use `npm.cmd` em lugar de `npm`.

Após importar uma planilha, a apresentação e a área de importação ficam compactas para mostrar os resultados mais cedo. **Preparar análise** fica recolhido. Use **Abrir configuração** para revisar a aba e o mapeamento de colunas; se faltar uma coluna necessária, a área abre automaticamente. É possível selecionar novamente o mesmo arquivo para atualizar a análise.

Em **Tipo de análise**, a opção automática prioriza Analítico quando há suas colunas específicas e estoque/vendas quando ambas as colunas existem. Uma coluna adicional de valor de estoque não muda uma análise de vendas para giro monetário. Também é possível selecionar o tipo manualmente. Os critérios são preservados por tipo de análise durante a sessão, inclusive ao remapear colunas ou trocar de aba.

O **Formato dos números em texto** começa em **Brasileiro: 1.234,56**. Nesse formato, `1.234` significa 1234 e a vírgula separa os decimais. Para arquivos que usam ponto decimal, selecione **Internacional: 1,234.56**. Células numéricas do Excel mantêm seu valor original em ambos os casos. Textos malformados, como `abc12`, `1e3` e agrupamentos inválidos, não são convertidos em números. A leitura não mistura formatos na mesma análise.

Use o botão **Modo escuro** no cabeçalho para alternar o tema. A escolha fica salva no navegador.

Os cartões do resumo também funcionam como filtros da tabela. O cartão selecionado fica destacado, e a faixa acima da tabela mostra os filtros ativos e permite limpá-los de uma vez. A barra de busca e filtros permanece visível durante a rolagem. Use **Modo compacto** para reduzir a altura das linhas e visualizar mais itens; essa preferência também fica salva no navegador.

A análise acontece no navegador; a planilha não é enviada a um servidor. A biblioteca ExcelJS e as fontes visuais estão incluídas no projeto para que o Go Live funcione sem depender da internet. Planilhas grandes são analisadas em blocos e exibem o andamento da leitura.

## Planilha

O padrão principal é a aba **Analítico** da `PLANILHA.xlsx`. A primeira linha contém cabeçalhos como `Cd Item`, `Nm Item`, `Qtde Atual`, `Qnt Min`, `Qnt Max`, `Giro Estoque (Dias)` e `Itens Acima de 90 dias`. O sistema exibe a classificação **exatamente como está na planilha**. Linhas vazias e totalizadores explicitamente identificados como `Total`, `Subtotal`, `Total geral` ou `Soma`, sem código de item, são ignorados. Linhas sem nome ou totalizadores sem identificação permanecem para revisão, com o número original da linha preservado.

Antes de aplicar as regras, o sistema valida as colunas obrigatórias e os valores de cada item. Quantidades negativas, mínimo maior que máximo, status não reconhecido e valores obrigatórios ausentes recebem **Verificar dados**. Essas linhas permanecem visíveis, mostram o campo que precisa de correção em **Outros dados** e entram no respectivo filtro e cartão do resumo.

Quando `Ds Motivo Bloqueio` estiver vazio e `Id Bloqueio` informar exatamente **Desbloqueado**, o sistema considera o item desbloqueado para aplicar as regras. Valores preenchidos, conflitantes ou não reconhecidos continuam recebendo **Verificar dados**.

Regras de ação fornecidas pelo usuário:

- `Dif Dias >= 90`, `Qtde Atual > 0` e `Ds Motivo Bloqueio = Desbloqueado`: **BLOQUEAR**.
- `Dif Dias >= 180`, `Qtde Atual > 0` e `Ds Motivo Bloqueio = Bloqueado por saldo`: transferir a obsoleto, exceto nos locais **1** e **298**. Se `Id Bloqueio` já indica bloqueio, o texto exibido é **TRANSFERIR OBSOLETO**; caso contrário, **BLOQUEAR E TRANSFERIR OBSOLETO**. A condição adicional `Cd Local Estoque ≠ 7` para esse mesmo estado está contida nesta regra.
- `Dif Dias >= 180`, `Qtde Atual > 0`, `Ds Motivo Bloqueio = Desbloqueado` e `Cd Local Estoque` diferente de **1**, **7** e **298**: **BLOQUEAR E TRANSFERIR OBSOLETO**. Neste caso, a transferência substitui **BLOQUEAR**; no local 7 permanece apenas **BLOQUEAR**.
- Se o item já está nos locais obsoletos **1** ou **298**, não é recomendada nova transferência. Para `Dif Dias >= 180`, `Qtde Atual > 0` e status **Desbloqueado**, a ação é **BLOQUEAR**. Se `Id Bloqueio` já indicar bloqueio, essa ação não é repetida.
- `Dif Dias >= 0`, `Qtde Atual = 0` e `Ds Motivo Bloqueio = Bloqueado por saldo`: **DESBLOQUEAR**.
- `Qtde Atual > 0`, pelo menos um entre `Qnt Min` e `Qnt Max` diferente de zero, `Cd Local Estoque = 1` ou `298`, `Dif Dias >= 180` e `Id Bloqueio` começa por **Bloqueado**: **ZERAR MIN/MAX**.

Um item bloqueado nos locais **1** ou **298** pode receber **ZERAR MIN/MAX** quando atender às condições dessa regra. Se não houver outra ação aplicável, fica **Sem ação definida** e oculto por padrão.

Itens com **Sem ação definida** ficam ocultos por padrão, assim como os itens com `Qtde Atual = 0`, `Qnt Min = 0`, `Qnt Max = 0` e `Ds Motivo Bloqueio = Desbloqueado`. Marque **Mostrar itens ocultos**, ao lado do filtro de ações, para ver os itens ocultos identificados na tabela.

O menu **Exportar**, ao lado dos filtros, oferece Excel (.xlsx), CSV e PDF. A tabela mostra até **50 itens por página**. As exportações incluem todos os itens que correspondem ao filtro de ação, à busca e à opção **Mostrar itens ocultos**, inclusive os de outras páginas. Para PDF, o navegador abre a impressão; selecione **Salvar como PDF** como destino.

Excel e CSV incluem **Ações** ou **Recomendação**, **Motivo** e **Linha na planilha**, além da **Classificação** no modo Analítico. Valores monetários ausentes ficam em branco. O CSV usa ponto e vírgula e vírgula decimal; textos que podem ser interpretados como fórmulas recebem um apóstrofo de proteção. No XLSX, esses conteúdos são gravados como texto e os valores monetários como números.

As exportações do modo Analítico incluem a coluna **Dias desde a última movimentação**, preenchida com o valor de `Dif Dias`. A coluna aparece no Excel, CSV e PDF para todas as ações e em **Todas as ações**, sendo removida somente quando **DESBLOQUEAR** estiver selecionado.

O sistema procura o cabeçalho nas primeiras 20 linhas e reconhece o relatório **BBOG6656 - Giro De Estoques Almoxarifado Por Filial**. É possível corrigir o mapeamento após a importação. Arquivos Excel podem conter várias abas; escolha a aba na interface.

Na planilha Analítico, `Cd Item` é reconhecido como código e `Ds Item` ou `Nm Item` como nome do item.

## Estrutura do código

- `src/analysis.js`: validação dos dados e regras de negócio.
- `src/dashboard.js`: busca, filtros, resumo, paginação e processamento em blocos.
- `src/export-data.js`: preparação dos dados para Excel e CSV.
- `src/template.js`: estrutura HTML da interface.
- `src/main.js`: integração da interface, importação e exportação.
- `src/style.css`, `src/theme.css` e `src/responsive.css`: estilos base, tema escuro e responsividade.

Execute `npm test` para validar regras, filtros, paginação, nova importação, exportação e estrutura acessível da interface.

Execute `npm run test:e2e` para gerar o build e testar no Google Chrome instalado: publicação em subpasta, leitura XLSX/CSV, preservação dos critérios, downloads, paginação, impressão e layout de celular. O servidor de teste usa apenas `127.0.0.1:4186`; capturas de tela, PDF e rastros de falhas ficam em `test-results/` (ignorado pelo Git).

## Auditoria de dependências

Em 25/09/2026, `npm audit` apontou dois alertas moderados na cadeia `exceljs → uuid`, referentes ao mesmo [aviso GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq). O aviso trata dos métodos `v3`, `v5` e `v6` com buffer externo; o ExcelJS 4.4.0 instalado usa `v4()` sem buffer para identificadores de formatação condicional. Não foi identificado uso do caminho afetado no fluxo desta aplicação. Os alertas permanecem: não foi aplicado o downgrade incompatível para ExcelJS 3.4.0 sugerido por `npm audit fix --force`. O bundle em `vendor/` deve ser revisado junto com qualquer futura atualização do pacote; a auditoria do npm cobre a árvore de dependências, não esse arquivo pré-compilado.

## Cálculos

No relatório BBOG6656, o giro é calculado como `Valor do Estoque ÷ Valor do Consumo × 30`. O arquivo de exemplo traz o giro como valor, sem fórmulas gravadas nas células. O sistema recalcula o valor e confere diferenças com a coluna `Giro em Dias`. Sem consumo, o giro é indefinido; esses itens recebem a recomendação **Investigar sem consumo**. Quando há consumo e o saldo está em branco, a recomendação é **Confirmar saldo** antes de decidir pela reposição.

As faixas iniciais de decisão são configuráveis: até 30 dias, **Planejar reposição**; de 30 a 90, **Manter**; acima de 90, **Reduzir compras**; acima de 365, **Avaliar transferência**. Esses limites são sugestões e dependem da política de compras, do prazo de entrega e da criticidade de cada material.

Para planilhas genéricas, o sistema reconhece item, estoque atual, vendas dos últimos 30 dias e prazo de reposição.

As recomendações genéricas são **provisórias**:

- média diária = vendas em 30 dias ÷ 30;
- cobertura = estoque atual ÷ média diária;
- ponto de reposição = média diária × (prazo de reposição + dias de segurança);
- comprar quando o estoque está no ponto de reposição ou abaixo dele;
- avaliar excesso quando a cobertura supera o limite informado;
- manter nos demais casos.

As regras não supõem vendas futuras para itens sem histórico de venda. Valores de fórmulas do Excel são lidos dos resultados salvos no arquivo; se a planilha não tiver resultados calculados, abra e salve no Excel ou LibreOffice antes de importar.
