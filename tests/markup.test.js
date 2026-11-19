// Peças puras da tabela e dos detalhes do item (src/ui/markup.js): recebem a linha já analisada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeHtml, buildFilterChips, buyHint, codeHtml, columnClass, detailFields, detailsHtml, displayItemName, emptyStateHtml, limitsText, positionHtml, purchaseHint, resultColumns, stockGaugeHtml, urgentAction } from '../src/ui/markup.js';

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
  assert.equal(detailFields('<i>Sem giro</i>', row, false), '<div class="detail-fields"><section class="detail-section"><dl><div><dt>Motivo da ação</dt><dd>&lt;i&gt;Sem giro&lt;/i&gt;</dd></div></dl></section></div>');
  assert.deepEqual([...analitico.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match => match[1]), ['O que fazer', 'Saldo e limites', 'Movimento e bloqueio']);
});

test('régua do saldo: tom pela situação e nada sem limites', () => {
  assert.equal(stockGaugeHtml({ stock: 3, minimum: null, maximum: 10 }), '');
  assert.equal(stockGaugeHtml({ stock: 0, minimum: 0, maximum: 0 }), '');
  assert.equal(stockGaugeHtml({ stock: 8, minimum: 0, maximum: 0 }), '');
  assert.match(stockGaugeHtml({ stock: 1, minimum: 0, maximum: 10 }), /left:0\.0%;transform:translateX\(0%\)">mín\. 0/);
  assert.match(stockGaugeHtml({ stock: 2, minimum: 5, maximum: 10 }), /gauge-marker is-danger/);
  assert.match(stockGaugeHtml({ stock: 7, minimum: 5, maximum: 10 }), /gauge-marker is-success/);
  assert.match(stockGaugeHtml({ stock: 30, minimum: 5, maximum: 10 }), /gauge-marker is-warning/);
  assert.match(stockGaugeHtml({ stock: 7, minimum: 5, maximum: 10 }), /aria-label="Saldo 7, mínimo 5, máximo 10: dentro dos limites"/);
  assert.match(stockGaugeHtml({ stock: 7, minimum: 9, maximum: 10 }), /mín\.\/máx\. 9 \/ 10/);
});

test('botão de detalhes só com motivo', () => {
  assert.equal(detailsHtml('', { row: 1 }), '<span class="no-details">—</span>');
  assert.match(detailsHtml('Motivo', { row: 9 }), /data-detail-row="9"/);
});

test('descrição em caixa de frase só quando vem toda em maiúsculas', () => {
  assert.equal(displayItemName('BASE PVC PRELE FOTO CELULA 220V 3 FIOS 10A'), 'Base PVC prele foto celula 220V 3 fios 10A');
  assert.equal(displayItemName('LUVA DE SEGURANÇA TAMANHO GG'), 'Luva de segurança tamanho GG');
  assert.equal(displayItemName('PVC TUBO'), 'PVC tubo');
  assert.equal(displayItemName('Parafuso sextavado M8'), 'Parafuso sextavado M8');
  assert.equal(displayItemName(''), '');
  assert.equal(displayItemName('1234'), '1234');
});

test('filtros ativos viram etiquetas removíveis com a contagem no fim', () => {
  const html = buildFilterChips([{ key: 'location', label: 'Local 7' }, { key: 'query', label: 'Busca: “<b>”' }], 15);
  assert.match(html, /data-clear-filter="location" title="Remover este filtro"><span>Local 7<\/span>/);
  assert.match(html, /Busca: “&lt;b&gt;”/);
  assert.match(html, /<span class="active-count">15 itens<\/span>$/);
  assert.match(buildFilterChips([], 1), /1 item</);
});

test('estado vazio explica o motivo e oferece a saída', () => {
  assert.match(emptyStateHtml({ filtered: true }), /data-empty-action="clear"/);
  assert.match(emptyStateHtml({ hiddenCount: 3 }), /3 itens estão ocultos.*data-empty-action="hidden"/);
  assert.doesNotMatch(emptyStateHtml(), /data-empty-action/);
  assert.match(emptyStateHtml(), /Nenhum item encontrado/);
});
