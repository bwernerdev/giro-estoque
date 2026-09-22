import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeAnalitico, analyzeGiro, findHeaderRow, suggestMapping, summarizeLocationTotal } from '../src/analysis.js';

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
  assert.ok(results.every(row => row.action === 'Sem ação definida'));
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
    ['F', 0, 90, 'Bloqueado por saldo', 'Bloqueado por saldo', 0, 0, 'Sem Saldo', 7],
    ['G', 0, 89, 'Bloqueado por saldo', 'Bloqueado por saldo', 0, 0, 'Sem Saldo', 7],
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
    ['Sem ação definida'], ['Sem ação definida'], ['BLOQUEAR E TRANSFERIR OBSOLETO'], ['TRANSFERIR OBSOLETO'], ['Sem ação definida'], ['BLOQUEAR'],
    ['BLOQUEAR E TRANSFERIR OBSOLETO'], ['BLOQUEAR'], ['BLOQUEAR E TRANSFERIR OBSOLETO'],
    ['ZERAR MIN/MAX'], ['Sem ação definida'], ['BLOQUEAR'],
    ['DESBLOQUEAR'], ['Verificar dados'],
  ]);
  assert.equal(results[0].hidden, true);
  assert.equal(results[5].hidden, false);
  assert.equal(results[9].hidden, false);
  assert.equal(results[7].hidden, false);
  assert.equal(results[10].hidden, true);
  assert.equal(results[11].hidden, true);
  assert.equal(results[14].hidden, true);
  assert.equal(results[19].hidden, false);
  assert.equal(results[1].hidden, false);
});

test('mantém visíveis as linhas inválidas e informa o campo que precisa de correção', () => {
  const mapping = suggestMapping(['Nm Item', 'Qtde Atual', 'Dif Dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Qnt Min', 'Qnt Max', 'Itens Acima de 90 dias', 'Cd Local Estoque']);
  const results = analyzeAnalitico([
    ['Saldo negativo', -1, 180, 'Desbloqueado', 'Desbloqueado', 0, 0, 'Sem Saldo', 7],
    ['Status ausente', 2, 180, '', 'Desbloqueado', 0, 0, 'Item com Giro', 7],
    ['Limites invertidos', 2, 180, 'Desbloqueado', 'Desbloqueado', 8, 4, 'Item com Giro', 7],
  ], mapping);

  assert.ok(results.every(row => row.action === 'Verificar dados' && row.hidden === false));
  assert.match(results[0].reason, /Qtde Atual: valor negativo/);
  assert.match(results[1].reason, /Ds Motivo Bloqueio: valor ausente/);
  assert.match(results[2].reason, /Qnt Min: maior que Qnt Max/);
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
  ];

  assert.equal(summarizeLocationTotal(rows, '7'), 195.5);
  assert.equal(summarizeLocationTotal(rows, '298'), 60);
  assert.equal(summarizeLocationTotal(rows, 'Local 7'), 33);
  assert.equal(summarizeLocationTotal(rows, ''), 338.5);
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
