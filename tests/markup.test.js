// Peças puras da tabela e dos detalhes do item (src/ui/markup.js): recebem a linha já analisada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeHtml, buyHint, codeHtml, columnClass, detailFields, detailsHtml, limitsText, positionHtml, purchaseHint, resultColumns, urgentAction } from '../src/ui/markup.js';

test('colunas da tabela por tipo de análise', () => {
  assert.deepEqual(resultColumns(true, false).map(column => column.key), ['item', 'sku', 'localCode', 'stock', 'minimum', 'stockValue', 'action', 'daysSince']);
  assert.deepEqual(resultColumns(false, true).map(column => column.key), ['item', 'stockValue', 'consumption', 'coverage', 'action', 'reason']);
  assert.deepEqual(resultColumns(false, false).map(column => column.key), ['item', 'stock', 'sales', 'coverage', 'action', 'reason']);
  assert.equal(columnClass('localCode'), 'col-posicao');
  assert.equal(columnClass('reason'), 'col-detalhes');
});

test('selo de ação marca as urgentes e escapa o texto', () => {
  assert.equal(urgentAction('bloquear'), true);
  assert.equal(urgentAction('Verificar dados'), true);
  assert.equal(urgentAction('COMPRAR'), false);
  assert.match(badgeHtml('BLOQUEAR'), /class="badge bloquear urgent-action"/);
  assert.doesNotMatch(badgeHtml('COMPRAR'), /urgent-action/);
  assert.match(badgeHtml('REVISAR SC'), /<span class="acronym">SC<\/span>/);
  assert.doesNotMatch(badgeHtml('<b>x</b>'), /<b>/);
});

test('código copiável só aparece com código e vem escapado', () => {
  assert.equal(codeHtml(''), '');
  assert.equal(codeHtml(null), '');
  const html = codeHtml('A"1');
  assert.match(html, /data-copy-code="A&quot;1"/);
  assert.match(html, /aria-label="Copiar código A&quot;1"/);
});

test('posição corta partes vazias no fim e mantém as do meio', () => {
  assert.match(positionHtml({ localCode: '7', shelfCode: '0', partitionCode: 'I' }), />7 · 0 · I</);
  assert.match(positionHtml({ localCode: '7', shelfCode: '', partitionCode: '' }), />7</);
  assert.match(positionHtml({ localCode: '7', shelfCode: '', partitionCode: 'I' }), />7 · — · I</);
  assert.match(positionHtml({ localCode: '7' }), /title="Local 7 · Prateleira — · Repartição —"/);
});

test('dicas de compra abaixo das células', () => {
  assert.equal(buyHint({ toBuy: null }), '');
  assert.match(buyHint({ toBuy: 5 }), /comprar 5 até o máx\./);
  assert.doesNotMatch(buyHint({ toBuy: 5 }), /is-alert/);
  assert.equal(purchaseHint({}), '');
  assert.match(purchaseHint({ purchase: { request: '<12>' } }), /SC &lt;12&gt;/);
});

test('saldo com limites diz se está abaixo, dentro ou acima', () => {
  assert.equal(limitsText({ stock: 3, minimum: null, maximum: 10 }), '3');
  assert.match(limitsText({ stock: 3, minimum: 5, maximum: 10 }), /abaixo do mínimo/);
  assert.match(limitsText({ stock: 7, minimum: 5, maximum: 10 }), /dentro dos limites/);
  assert.match(limitsText({ stock: 12, minimum: 5, maximum: 10 }), /acima do máximo/);
});

test('campos dos detalhes: analítico lista o porquê e o saldo; os outros, só o motivo', () => {
  const row = { row: 4, stock: 2, minimum: 5, maximum: 10, actions: ['COMPRAR'], blockReason: '', blockId: '', daysSince: 3 };
  const analitico = detailFields('Abaixo do mínimo · 3 dias desde a última requisição', row, true);
  assert.match(analitico, /<dt>Ação recomendada<\/dt><dd><span class="badge comprar/);
  assert.match(analitico, /<dt>Por que<\/dt><dd>Abaixo do mínimo<\/dd>/);
  assert.match(analitico, /<dt>Saldo<\/dt>/);
  assert.match(analitico, /<dt>Tempo sem requisição<\/dt><dd>3 dias desde a última requisição<\/dd>/);
  assert.match(detailFields('Corrigir na planilha: falta o mínimo', row, true), /<dt>Dados a revisar<\/dt>/);
  assert.equal(detailFields('<i>Sem giro</i>', row, false), '<dl class="detail-fields"><div><dt>Motivo da ação</dt><dd>&lt;i&gt;Sem giro&lt;/i&gt;</dd></div></dl>');
});

test('botão de detalhes só com motivo', () => {
  assert.equal(detailsHtml('', { row: 1 }), '<span class="no-details">—</span>');
  assert.match(detailsHtml('Motivo', { row: 9 }), /data-detail-row="9"/);
});
