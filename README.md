# Controle de Estoque

Sistema web local para importar `.xlsx` ou `.csv` e analisar materiais.

## Executar

Abra `http://127.0.0.1:5500/giro-estoque/` com a extensão **Go Live** servindo a pasta `projetos`. O projeto também pode ser iniciado com `npm install` e `npm run dev`.

Após importar uma planilha, a apresentação e a área de importação ficam compactas para mostrar os resultados mais cedo. **Preparar análise** fica recolhido. Use **Abrir configuração** para revisar a aba e o mapeamento de colunas; se faltar uma coluna necessária, a área abre automaticamente. É possível selecionar novamente o mesmo arquivo para atualizar a análise.

Use o botão **Modo escuro** no cabeçalho para alternar o tema. A escolha fica salva no navegador.

A análise acontece no navegador; a planilha não é enviada a um servidor. A biblioteca ExcelJS está incluída em `vendor/` para que o Go Live funcione sem instalar pacotes.

## Planilha

O padrão principal é a aba **Analítico** da `PLANILHA.xlsx`. A primeira linha contém cabeçalhos como `Cd Item`, `Nm Item`, `Qtde Atual`, `Qnt Min`, `Qnt Max`, `Giro Estoque (Dias)` e `Itens Acima de 90 dias`. O sistema exibe a classificação **exatamente como está na planilha**. Linhas de soma sem item são ignoradas.

Antes de aplicar as regras, o sistema valida as colunas obrigatórias e os valores de cada item. Quantidades negativas, mínimo maior que máximo, status não reconhecido e valores obrigatórios ausentes recebem **Verificar dados**. Essas linhas permanecem visíveis, mostram o campo que precisa de correção em **Outros dados** e entram no respectivo filtro e cartão do resumo.

Regras de ação fornecidas pelo usuário:

- `Dif Dias >= 90`, `Qtde Atual > 0` e `Ds Motivo Bloqueio = Desbloqueado`: **BLOQUEAR**.
- `Dif Dias >= 180`, `Qtde Atual > 0` e `Ds Motivo Bloqueio = Bloqueado por saldo`: transferir a obsoleto, exceto no local **298**. Se `Id Bloqueio` já indica bloqueio, o texto exibido é **TRANSFERIR OBSOLETO**; caso contrário, **BLOQUEAR E TRANSFERIR OBSOLETO**. A condição adicional `Cd Local Estoque ≠ 7` para esse mesmo estado está contida nesta regra.
- `Dif Dias >= 180`, `Qtde Atual > 0`, `Ds Motivo Bloqueio = Desbloqueado` e `Cd Local Estoque` diferente de **7** e **298**: **BLOQUEAR E TRANSFERIR OBSOLETO**. Neste caso, a transferência substitui **BLOQUEAR**; no local 7 permanece apenas **BLOQUEAR**.
- Se o item já está no local **298**, não é recomendada nova transferência. Para `Dif Dias >= 180`, `Qtde Atual > 0` e status **Desbloqueado** ou **Bloqueado por saldo**, a ação é apenas **BLOQUEAR**.
- `Dif Dias >= 90`, `Qtde Atual = 0` e `Ds Motivo Bloqueio = Bloqueado por saldo`: **DESBLOQUEAR**.
- `Qtde Atual > 0`, pelo menos um entre `Qnt Min` e `Qnt Max` diferente de zero, `Cd Local Estoque = 298`, `Dif Dias >= 180` e `Id Bloqueio` começa por **Bloqueado**: **ZERAR MIN/MAX**.

Um item no local **298** pode receber **BLOQUEAR** e **ZERAR MIN/MAX** ao mesmo tempo. Os demais ficam **Sem ação definida** até que outra regra seja informada.

Itens com **Sem ação definida** ficam ocultos por padrão, assim como os itens com `Qtde Atual = 0`, `Qnt Min = 0`, `Qnt Max = 0` e `Ds Motivo Bloqueio = Desbloqueado`. Marque **Mostrar itens ocultos**, ao lado do filtro de ações, para ver os itens ocultos identificados na tabela.

O menu **Exportar**, ao lado dos filtros, oferece Excel (.xlsx), CSV e PDF. A tabela mostra até **50 itens por página**. As exportações incluem todos os itens que correspondem ao filtro de ação, à busca e à opção **Mostrar itens ocultos**, inclusive os de outras páginas. Para PDF, o navegador abre a impressão; selecione **Salvar como PDF** como destino.

O sistema procura o cabeçalho nas primeiras 20 linhas e reconhece o relatório **BBOG6656 - Giro De Estoques Almoxarifado Por Filial**. É possível corrigir o mapeamento após a importação. Arquivos Excel podem conter várias abas; escolha a aba na interface.

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
