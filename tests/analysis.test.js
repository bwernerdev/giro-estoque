import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeAnalitico, analyzeGiro, findHeaderRow, itemKey, pickPurchaseRequest, purchaseInProgress, purchaseStage, suggestMapping, summarizeLocationTotal } from '../src/analysis.js';

test('reconhece cabeçalhos comuns e recomenda ações distintas', () => {
  const mapping = suggestMapping(['Produto', 'Estoque Atual', 'Vendas 30 dias', 'Prazo de reposição']);
  assert.deepEqual([mapping.item, mapping.stock, mapping.sales, mapping.lead], [0, 1, 2, 3]);
  const rows = [
    ['Caneta', 5, 30, 7],
    ['Papel', 50, 30, 7],
    ['Pasta', 200, 30, 7],
    ['Grampeador', 10, 0, 7],
    ['Inválido', '', 10, 7],
  ];
  const results = analyze(rows, mapping, { safetyDays: 7, excessDays: 90, defaultLead: 7 });
  assert.deepEqual(results.map(row => row.action), ['Comprar', 'Manter', 'Avaliar excesso', 'Avaliar sem giro', 'Verificar dados']);
  assert.equal(results[0].reorderPoint, 14);
});

test('reconhece Ds Item como nome do item', () => {
  const mapping = suggestMapping(['Cd Item', 'Ds Item', 'Qtde Atual']);
  assert.equal(mapping.sku, 0);
  assert.equal(mapping.item, 1);
  assert.equal(mapping.stock, 2);
});

test('preserva a classificação informada na planilha Analítico', () => {
  const headers = ['Cd Item', 'Nm Item', 'Qtde Atual', 'Qnt Min', 'Qnt Max', 'Giro Estoque (Dias)', 'Itens Acima de 90 dias'];
  const mapping = suggestMapping(headers);
  assert.deepEqual([mapping.sku, mapping.item, mapping.stock, mapping.minimum, mapping.maximum, mapping.giroDays, mapping.classification], [0, 1, 2, 3, 4, 5, 6]);
  const results = analyzeAnalitico([
    [1, 'Sem saldo', 0, 4, 8, '', 'Sem Saldo'],
    [2, 'Comprar', 2, 4, 8, 7.5, 'Item com Giro'],
    [3, 'No mínimo', 4, 4, 8, 30, 'Item com Giro'],
    [4, 'Dentro', 6, 4, 8, 60, 'Item com Giro'],
    [5, 'Acima', 9, 4, 8, 120, 'Item de Giro Baixo/Sem Saida'],
  ], mapping);
  assert.deepEqual(results.map(row => row.classification), ['Sem Saldo', 'Item com Giro', 'Item com Giro', 'Item com Giro', 'Item de Giro Baixo/Sem Saida']);
  assert.deepEqual(results.map(row => row.action), ['COMPRAR', 'COMPRAR', 'Sem ação definida', 'Sem ação definida', 'Sem ação definida']);
});

test('aplica as condições de ação e ocultação informadas', () => {
  const mapping = suggestMapping(['Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  assert.equal(mapping.blockId, 4);
  const results = analyzeAnalitico([
    ['A', 0, 90, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Sem Saldo', 7],
    ['B', 5, 90, ' desbloqueado ', 'Desbloqueado', 0, 0, 'Item com Giro', 7],
    ['C', 5, 179, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item com Giro', 8],
    ['D', 5, 180, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item com Giro', 7],
    ['E', 5, 180, 'Bloqueado Por Saldo', 'Bloqueado por saldo', 0, 0, 'Item com Giro', 7],
    ['F', 0, 0, 'Bloqueado por saldo', 'Bloqueado por saldo', 0, 0, 'Sem Saldo', 7],
    ['G', 0, 0, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Sem Saldo', 7],
    ['H', 5, 20, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 0, 'Item com Giro', 7],
    ['I', 5, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Item com Giro', 7],
    ['J', 0, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Sem Saldo', 7],
    ['K', 5, 100, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Item com Giro', 7],
    ['L', 0, 575, 'Desbloqueado', 'Desbloqueado', 2, 5, 'Sem Saldo', 7],
    ['M', 5, 180, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item com Giro', 8],
    ['N', 5, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 0, 0, 'Item com Giro', 8],
    ['O', 30, 883, 'Bloqueado por saldo', 'Bloqueado por saldo', 0, 0, 'Item de Giro Baixo/Sem Saida', 298],
    ['P', 5, 180, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item com Giro', 298],
    ['Q', 5, 180, 'Desbloqueado', 'Desbloqueado', 1, 2, 'Item com Giro', 8],
    ['R', 5, 90, 'Desbloqueado', 'Desbloqueado', 1, 2, 'Item com Giro', 7],
    ['S', 5, 180, 'Bloqueado por saldo', 'Desbloqueado', 0, 0, 'Item com Giro', 7],
    ['T', 5, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Item de Giro Baixo/Sem Saida', 298],
    ['U', 5, 179, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Item com Giro', 298],
    ['V', 5, 180, 'Desbloqueado', 'Desbloqueado', 1, 2, 'Item de Giro Baixo/Sem Saida', 298],
    ['W', 0, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Sem Saldo', 298],
    ['X', -1, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Sem Saldo', 298],
  ], mapping);
  assert.deepEqual(results.map(row => row.actions), [
    ['Sem ação definida'], ['BLOQUEAR'], ['BLOQUEAR'], ['BLOQUEAR'],
    ['TRANSFERIR OBSOLETO'], ['DESBLOQUEAR'], ['Sem ação definida'],
    ['Verificar dados'], ['TRANSFERIR OBSOLETO'], ['DESBLOQUEAR'],
    ['Sem ação definida'], ['COMPRAR'], ['BLOQUEAR E TRANSFERIR OBSOLETO'], ['TRANSFERIR OBSOLETO'], ['Sem ação definida'], ['BLOQUEAR'],
    ['BLOQUEAR E TRANSFERIR OBSOLETO'], ['BLOQUEAR'], ['Verificar dados'],
    ['ZERAR MIN/MAX'], ['Sem ação definida'], ['BLOQUEAR'],
    ['DESBLOQUEAR'], ['Verificar dados'],
  ]);
  assert.equal(results[0].hidden, true);
  assert.equal(results[5].hidden, false);
  assert.equal(results[9].hidden, false);
  assert.equal(results[7].hidden, false);
  assert.equal(results[10].hidden, true);
  assert.equal(results[11].hidden, false);
  assert.equal(results[14].hidden, true);
  assert.equal(results[19].hidden, false);
  assert.equal(results[1].hidden, false);
});

test('recomenda AJUSTAR MIN/MAX só acima do máximo; abaixo do mínimo vira COMPRAR', () => {
  const mapping = suggestMapping(['Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  const results = analyzeAnalitico([
    ['Abaixo do mínimo', 2, 10, 'Desbloqueado', 'Desbloqueado', 4, 8, 'Item com Giro', 7],
    ['Acima do máximo', 9, 89, 'Desbloqueado', 'Desbloqueado', 4, 8, 'Item com Giro', 7],
    ['Dentro dos limites', 6, 10, 'Desbloqueado', 'Desbloqueado', 4, 8, 'Item com Giro', 7],
    ['Dif Dias de 90', 9, 90, 'Desbloqueado', 'Desbloqueado', 4, 8, 'Item com Giro', 7],
    ['Sem saldo', 0, 10, 'Desbloqueado', 'Desbloqueado', 4, 8, 'Sem Saldo', 7],
    ['Limites zerados', 9, 10, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item com Giro', 7],
    ['Limites zerados em obsoleto', 9, 10, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item com Giro', 298],
  ], mapping);

  assert.deepEqual(results.map(row => row.actions), [
    ['COMPRAR'], ['AJUSTAR MIN/MAX'], ['Sem ação definida'], ['BLOQUEAR'],
    ['COMPRAR'], ['AJUSTAR MIN/MAX'], ['Sem ação definida'],
  ]);
  assert.equal(results[0].hidden, false);
  assert.deepEqual([results[0].toMinimum, results[0].toMaximum], [2, 6]);
  assert.match(results[0].reason, /Comprar: saldo abaixo do mínimo; faltam 2 para o mínimo e 6 para o máximo\. Importe o SNAC0540/);
  assert.match(results[1].reason, /89 dias desde a última requisição \(abaixo de 90\) e saldo acima do máximo/);
});

test('status contraditórios exigem revisão antes de recomendar bloqueio ou transferência', () => {
  const mapping = suggestMapping(['Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  for (const [reason, id] of [['Desbloqueado', 'Bloqueado por saldo'], ['Bloqueado por saldo', 'Desbloqueado']]) {
    const [result] = analyzeAnalitico([['Peça', 5, 200, reason, id, 0, 0, 'Acima de 90', 20]], mapping);
    assert.deepEqual(result.actions, ['Verificar dados']);
    assert.match(result.reason, /status conflitantes/);
    assert.equal(result.hidden, false);
  }
});

test('mantém visíveis as linhas inválidas e informa o campo que precisa de correção', () => {
  const mapping = suggestMapping(['Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  const results = analyzeAnalitico([
    ['Saldo negativo', -1, 180, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Sem Saldo', 7],
    ['Status ausente', 2, 180, '', '', 0, 0, 'Item com Giro', 7],
    ['Limites invertidos', 2, 180, 'Desbloqueado', 'Desbloqueado', 8, 4, 'Item com Giro', 7],
  ], mapping);

  assert.ok(results.every(row => row.action === 'Verificar dados' && row.hidden === false));
  assert.match(results[0].reason, /Qtde Atual: valor negativo/);
  assert.match(results[1].reason, /Ds Motivo Bloqueio: valor ausente/);
  assert.match(results[2].reason, /Qnt Min: maior que Qnt Max/);
});

test('usa Id Bloqueio desbloqueado quando o motivo está vazio', () => {
  const mapping = suggestMapping(['Cd Item', 'Ds Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  const [result] = analyzeAnalitico([
    [392720, 'Calça EPI', 2, 114, '', 'Desbloqueado', 0, 0, 'Item de Giro Baixo/Sem Saida', 4],
  ], mapping);

  assert.deepEqual(result.actions, ['BLOQUEAR']);
  assert.equal(result.hidden, false);
  assert.match(result.reason, /considerado como Desbloqueado pelo Id Bloqueio/);
});

test('aplica ao local 1 as mesmas regras de obsoleto do local 298', () => {
  const mapping = suggestMapping(['Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  const results = analyzeAnalitico([
    ['Já bloqueado e sem limites', 5, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 0, 0, 'Item de Giro Baixo/Sem Saida', 1],
    ['Desbloqueado', 5, 180, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Item de Giro Baixo/Sem Saida', 1],
    ['Já bloqueado e com limites', 5, 180, 'Bloqueado por saldo', 'Bloqueado por saldo', 1, 2, 'Item de Giro Baixo/Sem Saida', 1],
  ], mapping);

  assert.deepEqual(results.map(row => row.actions), [
    ['Sem ação definida'],
    ['BLOQUEAR'],
    ['ZERAR MIN/MAX'],
  ]);
  assert.deepEqual(results.map(row => row.hidden), [true, false, false]);
});

test('reconhece o cabeçalho deslocado e calcula giro a partir dos valores monetários', () => {
  const rows = [[], ['Giro por SKU'], [], ['Filial ', 'SKU', 'Nome do SKU', 'Quantidade', 'Valor do Estoque', 'Valor do Consumo', 'Giro em Dias']];
  assert.equal(findHeaderRow(rows), 3);
  const mapping = suggestMapping(rows[3]);
  assert.equal(mapping.item, 2);
  assert.equal(mapping.stockValue, 4);
  assert.equal(mapping.consumption, 5);
  const results = analyzeGiro([
    ['Itajaí', 1, 'Peça A', 5, 100, 200, 15],
    ['Itajaí', 2, 'Peça B', 8, 100, 0, '#DIV/0'],
    ['Itajaí', 3, 'Peça C', 8, 1000, 10, 2000],
  ], mapping, { shortDays: 30, excessDays: 90, longDays: 365 }, 5);
  assert.deepEqual(results.map(row => row.action), ['Planejar reposição', 'Investigar sem consumo', 'Verificar dados']);
  assert.equal(results[0].coverage, 15);
  assert.equal(results[0].row, 5);
  assert.equal(analyzeGiro([['Itajaí', 4, 'Peça D', '', '', 50, '']], mapping, { shortDays: 30, excessDays: 90, longDays: 365 })[0].action, 'Confirmar saldo');
});

test('normaliza locais com número e espaços antes de somar o total', () => {
  const rows = [
    { localCode: 7, stockValue: 120.5 },
    { localCode: ' 7 ', stockValue: 75 },
    { localCode: '298', stockValue: 40 },
    { localCode: ' 298 ', stockValue: 20 },
    { localCode: 'Local 7', stockValue: 33 },
    { localCode: 'Local 8', stockValue: 50 },
    { localCode: '7', stockValue: null },
    { localCode: '7', stock: 999 },
  ];

  assert.equal(summarizeLocationTotal(rows, '7'), 195.5);
  assert.equal(summarizeLocationTotal(rows, '298'), 60);
  assert.equal(summarizeLocationTotal(rows, 'Local 7'), 33);
  assert.equal(summarizeLocationTotal(rows, ''), 338.5);
});

test('nunca usa quantidade como valor monetário no total do estoque', () => {
  assert.equal(summarizeLocationTotal([
    { localCode: '7', stock: 25 },
    { localCode: '7', stock: 2, stockValue: 398.21 },
  ], ''), 398.21);
});

test('soma o total do local de estoque selecionado em valor de saldo', () => {
  const rows = [
    { localCode: '7', stockValue: 120.5 },
    { localCode: '7', stockValue: 75 },
    { localCode: '298', stockValue: 40 },
    { localCode: '7', stockValue: null },
  ];
  assert.equal(summarizeLocationTotal(rows, '7'), 195.5);
  assert.equal(summarizeLocationTotal(rows, '298'), 40);
  assert.equal(summarizeLocationTotal(rows, ''), 235.5);
});

const request = (overrides = {}) => ({
  request: '100', status: 'Compra confirmada', createdAt: new Date(2026, 9, 1), product: '6470', sequence: '1',
  canceled: '', local: null, order: '900', orderStatus: 'Compra confirmada', orderBalance: 5, invoice: '', ...overrides,
});

test('SC em andamento: ativa, não cancelada e ainda não recebida', () => {
  assert.equal(purchaseInProgress(request()), true);
  assert.equal(purchaseInProgress(request({ status: 'Usuario preenchendo', order: '', orderStatus: '' })), true);
  assert.equal(purchaseInProgress(request({ status: 'Aguardando autorização' })), true);
  assert.equal(purchaseInProgress(request({ status: 'Cancelada' })), false);
  assert.equal(purchaseInProgress(request({ canceled: 'S' })), false);
  assert.equal(purchaseInProgress(request({ orderStatus: 'Cancelada' })), false);
  assert.equal(purchaseInProgress(request({ orderStatus: 'Fechada' })), false);
  assert.equal(purchaseInProgress(request({ invoice: '175865', orderBalance: 0 })), false, 'recebida');
  assert.equal(purchaseInProgress(request({ invoice: '175865', orderBalance: 3 })), true, 'entrega parcial');
  assert.deepEqual([request(), request({ invoice: '175865', orderBalance: 0, orderStatus: 'Fechada' }), request({ status: 'Cancelada' }), request({ orderStatus: 'Fechada' }), request({ orderStatus: 'Cancelada' })].map(purchaseStage),
    ['Compra confirmada', 'Recebida (NF 175865)', 'Cancelada', 'OF fechada sem entrega', 'OF cancelada']);
  assert.equal(purchaseStage(null), '');
});

test('SC do item: mesmo local ou sem local, a mais recente em andamento antes das encerradas', () => {
  const requests = [
    request({ request: '1', createdAt: new Date(2026, 8, 1), local: 4 }),
    request({ request: '2', createdAt: new Date(2026, 9, 1), local: 7, status: 'Cancelada' }),
    request({ request: '3', createdAt: new Date(2026, 9, 5), local: 4, status: 'Cancelada' }),
    request({ request: '4', createdAt: new Date(2026, 9, 9), local: 625 }),
  ];
  assert.deepEqual([pickPurchaseRequest(requests, 4).request, pickPurchaseRequest(requests, 4).inProgress], ['1', true]);
  assert.deepEqual([pickPurchaseRequest(requests, 7).request, pickPurchaseRequest(requests, 7).inProgress], ['2', false]);
  assert.equal(pickPurchaseRequest(requests, 3), null);
  assert.equal(pickPurchaseRequest([request({ request: '5', local: null })], 3).request, '5', 'SC sem local vale para qualquer local');
  assert.equal(pickPurchaseRequest(undefined, 4), null);
  assert.equal(itemKey('6.470'), '6470');
  assert.equal(itemKey('006470'), '6470');
});

test('COMPRAR abaixo do mínimo; COMPRA EM ANDAMENTO com SC ativa; exceções de local obsoleto e bloqueio', () => {
  const mapping = suggestMapping(['Cd Item', 'Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  const rows = [
    ['6.470', 'Com SC ativa', 1, 10, 'Desbloqueado', 'Desbloqueado', 4, 8, 'Item com Giro', 4],
    ['7001', 'SC cancelada', 0, 10, 'Desbloqueado', 'Desbloqueado', 2, 5, 'Sem Saldo', 4],
    ['7002', 'Sem SC', 0, 10, 'Desbloqueado', 'Desbloqueado', 2, 5, 'Sem Saldo', 4],
    ['7003', 'Obsoleto', 0, 10, 'Desbloqueado', 'Desbloqueado', 2, 5, 'Sem Saldo', 298],
    ['7004', 'Bloqueado', 0, 10, 'Bloqueado por saldo', 'Bloqueado por saldo', 2, 5, 'Sem Saldo', 4],
    ['7005', 'Vai bloquear', 1, 120, 'Desbloqueado', 'Desbloqueado', 2, 5, 'Item com Giro', 4],
    ['7006', 'No mínimo', 2, 10, 'Desbloqueado', 'Desbloqueado', 2, 5, 'Item com Giro', 4],
  ];
  const purchases = new Map([
    ['6470', [request({ request: '7609604', local: 4 })]],
    ['7001', [request({ request: '7609700', status: 'Cancelada', local: 4 })]],
  ]);
  const results = analyzeAnalitico(rows, mapping, 2, { purchases });
  assert.deepEqual(results.map(row => row.actions), [
    ['COMPRA EM ANDAMENTO'], ['COMPRAR'], ['COMPRAR'], ['Sem ação definida'], ['DESBLOQUEAR'], ['BLOQUEAR'], ['Sem ação definida'],
  ]);
  assert.equal(results[0].purchase.request, '7609604');
  assert.match(results[0].reason, /Compra em andamento: saldo abaixo do mínimo \(faltam 3 para o mínimo e 7 para o máximo\); SC 7609604 de 01\/10\/2026 \(Compra confirmada\), OF 900/);
  assert.match(results[1].reason, /Última SC: SC 7609700 .*\(Cancelada\)/);
  assert.match(results[2].reason, /Sem SC no SNAC0540 para o item/);
  assert.equal(results[3].toMinimum, null);
  const withoutReport = analyzeAnalitico(rows.slice(0, 1), mapping);
  assert.deepEqual(withoutReport[0].actions, ['COMPRAR']);
  assert.equal(withoutReport[0].purchase, null);
});

