import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { actionCounts, actionValues, dataIssueSummary, filterResults, locationOptions, paginate, prioritizeActionCounts, processInChunks, resetDashboardState, sortResults } from '../src/dashboard.js';
import { buildCsv, buildExportData, currencyNumber, shouldIncludeDaysSince } from '../src/export-data.js';
import { agingBucket, agingSummary, stockHealth } from '../src/analysis.js';
import { renderApp } from '../src/template.js';
import { ANALITICO_ACTIONS, buildAgingChartMarkup, buildHealthMarkup, buildSummaryMarkup, buildTotalMarkup } from '../src/main.js';

const rows = [
  { item: 'Parafuso', sku: '100', localCode: '7', action: 'BLOQUEAR', actions: ['BLOQUEAR'], hidden: false },
  { item: 'Arruela', sku: '200', localCode: '1', action: 'ZERAR MIN/MAX', actions: ['ZERAR MIN/MAX'], hidden: false },
  { item: 'Porca', sku: '300', localCode: '298', action: 'Sem ação definida', actions: ['Sem ação definida'], hidden: true },
];

test('estrutura da interface mantém controles e nomes acessíveis', () => {
  const dom = new JSDOM(renderApp());
  const document = dom.window.document;
  assert.equal(document.querySelector('#search').placeholder, 'Buscar item ou código');
  assert.match(document.querySelector('.brand-mark img').src, /favicon\.webp/);
  assert.equal(document.querySelector('.primary-button').getAttribute('tabindex'), '0');
  assert.equal(document.querySelector('#result-table caption').textContent, 'Resultados da análise de estoque');
  assert.equal(document.querySelectorAll('[data-export]').length, 3);
  assert.ok(document.querySelector('#density-toggle'));
  assert.ok(document.querySelector('#clear-filters'));
  assert.equal(document.querySelector('#import-context'), null);
  assert.ok(document.querySelector('#view-menu #density-toggle'));
  assert.ok(document.querySelector('#view-menu #show-hidden'));
  assert.equal(document.querySelector('#sidebar'), null);
  assert.ok(document.querySelector('.table-tools #location-filter'));
  assert.ok(document.querySelector('.topbar #replace-file'));
  assert.ok(document.querySelector('#summary-toggle[aria-controls="overview-body"]'));
  assert.ok(document.querySelector('.results-bar #hidden-chip'));
  assert.ok(document.querySelector('#aging-chart #aging-chart-bars'));
  assert.match(document.querySelector('.brand').textContent, /GIRO DE ESTOQUE/);
  assert.match(document.querySelector('.eyebrow').textContent, /ANÁLISE DE ESTOQUE/);
  assert.match(document.querySelector('.hero p').textContent, /quanto valor está parado/);
  assert.match(document.querySelector('.upload-copy small').textContent, /Analítico, BBOG6656 ou estoque e vendas.*não saem do seu computador/);
  assert.equal(document.querySelector('.upload-icon path').getAttribute('d'), document.querySelector('#replace-file path').getAttribute('d'), 'importar e trocar arquivo usam o mesmo ícone de envio');
  assert.ok(document.querySelector('#filtered-count'));
  assert.equal(document.querySelector('.results-counter').getAttribute('aria-live'), 'polite');
  assert.equal(document.querySelector('label[for="location-filter"]'), null);
  assert.equal(document.querySelector('#location-filter').closest('label').textContent.trim(), 'LocalTodos');
  assert.equal(document.querySelector('#filter').closest('label').textContent.trim(), 'AçãoTodas as recomendações');
  assert.equal(document.querySelector('#pagination').getAttribute('aria-label'), 'Páginas de resultados');
});

test('filtra por busca, ação e local sem perder correspondências', () => {
  assert.deepEqual(filterResults(rows, { query: '100', analitico: true }).map(row => row.item), ['Parafuso']);
  assert.deepEqual(filterResults(rows, { action: 'ZERAR MIN/MAX', analitico: true }).map(row => row.item), ['Arruela']);
  assert.deepEqual(filterResults(rows, { location: '298', analitico: true }).map(row => row.item), ['Porca']);
  assert.deepEqual(filterResults(rows, { hiddenOnly: true, analitico: true }).map(row => row.item), ['Porca']);
  assert.deepEqual(locationOptions(rows), ['1', '7', '298']);
  assert.deepEqual(actionCounts(rows, ['BLOQUEAR', 'ZERAR MIN/MAX'], true).map(item => item.count), [1, 1]);
});

test('pesquisa somente trechos do código ou da descrição, ignorando caixa e acentos', () => {
  const items = [{ item: 'Peça hidráulica', sku: '001234', branch: 'FILIAL', location: 'DEPOSITO', localCode: '298', shelfCode: 'ESTANTE', partitionCode: 'SETOR' }];
  for (const query of ['hidraul', 'PEÇA', '0123']) {
    assert.deepEqual(filterResults(items, { query }), items);
  }
  for (const query of ['FILIAL', 'DEPOSITO', '298', 'ESTANTE', 'SETOR', 'hidráulica 001']) {
    assert.deepEqual(filterResults(items, { query }), []);
  }
});

test('o valor total do estoque aparece uma única vez, fora dos cartões do resumo', () => {
  const summaryResults = [{ item: 'A' }, { item: 'B' }];
  const summaryAllResults = [{ item: 'A' }, { item: 'B' }, { item: 'C', hidden: true }];
  const markup = buildSummaryMarkup({ summaryResults, summaryAllResults, actions: ANALITICO_ACTIONS, analitico: true });
  assert.doesNotMatch(markup, /VALOR TOTAL/i);
  assert.match(markup, /ITENS COM AÇÃO/);
  assert.match(markup, /de 3 no arquivo/);
  assert.match(buildSummaryMarkup({ summaryResults, summaryAllResults, actions: ['BLOQUEAR'] }), /TODOS OS ITENS/);
  assert.equal((markup.match(/summary-card/g) || []).length, 1);

  const total = buildTotalMarkup({ summaryAllResults, locationFilter: '', locationTotal: 44302.87 });
  assert.match(total, /Valor total do estoque/);
  assert.match(total, /R\$\s?44\.302,87/);
  assert.match(buildTotalMarkup({ summaryAllResults, locationFilter: '4', locationTotal: 10, shelfFilter: 'A' }), /na localização/);
  assert.equal(buildTotalMarkup({ summaryAllResults: [], locationFilter: '', locationTotal: 0 }), '');
});

test('combina filtros exatos de local, prateleira e repartição, incluindo código zero', () => {
  const positions = [
    { item: 'A', localCode: '4', shelfCode: '0', partitionCode: 'I', actions: ['BLOQUEAR'] },
    { item: 'B', localCode: '4', shelfCode: '10', partitionCode: 'I', actions: ['BLOQUEAR'] },
    { item: 'C', localCode: '7', shelfCode: '0', partitionCode: 'I', actions: ['BLOQUEAR'] },
    { item: 'D', localCode: '4', shelfCode: '0', partitionCode: 'II', actions: ['BLOQUEAR'] },
  ];
  assert.deepEqual(filterResults(positions, { location: '4', shelf: '0', partition: 'i', action: 'BLOQUEAR', analitico: true }).map(row => row.item), ['A']);
});

test('expõe no resumo e no filtro todas as ações produzidas pelo modo analítico', () => {
  const generatedActions = new Set(rows.flatMap(row => row.actions));
  assert.ok([...generatedActions].every(action => ANALITICO_ACTIONS.includes(action)));
  assert.ok(ANALITICO_ACTIONS.includes('Sem ação definida'));

  const markup = buildSummaryMarkup({
    summaryResults: rows,
    summaryAllResults: rows,
    actions: ANALITICO_ACTIONS,
    locationFilter: '',
    locationTotal: 0,
  });
  assert.match(markup, /data-summary-action="Sem ação definida"/);
});

test('oculta cards de ação zerados e os exibe quando há itens para executar', () => {
  const markup = buildSummaryMarkup({
    summaryResults: rows,
    summaryAllResults: rows,
    actions: ['BLOQUEAR', 'TRANSFERIR OBSOLETO', 'Sem ação definida'],
    counts: [
      { action: 'BLOQUEAR', count: 1 },
      { action: 'TRANSFERIR OBSOLETO', count: 0 },
      { action: 'Sem ação definida', count: 1 },
      { action: 'Itens ocultos', count: 0 },
    ],
    locationFilter: '',
    locationTotal: 0,
  });

  assert.match(markup, /data-summary-action="BLOQUEAR"/);
  assert.match(markup, /data-summary-action="Sem ação definida"/);
  assert.match(markup, /33% do total/);
  assert.doesNotMatch(markup, /data-summary-action="TRANSFERIR OBSOLETO"/);
  assert.doesNotMatch(markup, /data-summary-hidden/);
});

test('itens ocultos viram atalho discreto e cartões mostram o valor da ação', () => {
  const markup = buildSummaryMarkup({
    summaryResults: rows,
    summaryAllResults: rows,
    actions: ['BLOQUEAR', 'Itens ocultos'],
    counts: [{ action: 'BLOQUEAR', count: 1 }, { action: 'Itens ocultos', count: 4 }],
    values: new Map([['BLOQUEAR', 12500]]),
    analitico: true,
  });
  assert.doesNotMatch(markup, /data-summary-action="Itens ocultos"/);
  assert.match(markup, /class="summary-filter hidden-shortcut" data-summary-hidden/);
  assert.match(markup, /Ver 4 itens sem ação/);
  assert.match(markup, /R\$\s?12,5\s?mil · 33%/);
});

test('prioriza ações críticas e ordena valores sem mover vazios para o início', () => {
  const prioritized = prioritizeActionCounts([
    { action: 'Manter', count: 2 },
    { action: 'BLOQUEAR', count: 1 },
    { action: 'Verificar dados', count: 1 },
  ]);
  assert.deepEqual(prioritized.map(entry => entry.action), ['Verificar dados', 'BLOQUEAR', 'Manter']);
  const source = [{ item: 'Dez', stock: 10 }, { item: 'Dois', stock: 2 }, { item: 'Vazio', stock: null }];
  assert.deepEqual(sortResults(source, { key: 'stock', direction: 'asc' }).map(row => row.item), ['Dois', 'Dez', 'Vazio']);
  assert.deepEqual(sortResults(source, { key: 'stock', direction: 'desc' }).map(row => row.item), ['Dez', 'Dois', 'Vazio']);
});

test('resume os campos mais frequentes das linhas que precisam de revisão', () => {
  const summary = dataIssueSummary([
    { action: 'Verificar dados', reason: 'Corrigir na planilha: Qtde Atual: valor ausente ou inválido; Nm Item: valor ausente.' },
    { action: 'Verificar dados', reason: 'Nome, quantidade, valor do estoque ou consumo inválido.' },
    { action: 'Manter', reason: '' },
  ]);
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.fields.find(entry => entry.field === 'Quantidade'), { field: 'Quantidade', count: 2 });
});

test('pagina sem descartar itens e limita a página atual', () => {
  const items = Array.from({ length: 115 }, (_, index) => ({ index }));
  assert.deepEqual(paginate(items, 2), { page: 2, pageCount: 3, start: 50, rows: items.slice(50, 100) });
  assert.equal(paginate(items, 99).page, 3);
});

test('reinicia filtros ao importar uma nova planilha', () => {
  const state = { page: 4, locationFilter: '298', hiddenOnly: true, sheets: ['anterior'] };
  resetDashboardState(state);
  assert.equal(state.page, 1);
  assert.equal(state.locationFilter, '');
  assert.equal(state.hiddenOnly, false);
  assert.deepEqual(state.sheets, ['anterior']);
});

test('processa planilhas grandes em blocos preservando linhas e progresso', async () => {
  const source = Array.from({ length: 1201 }, (_, index) => [index]);
  const progress = [];
  const result = await processInChunks(source, (chunk, firstRow) => chunk.map((cells, index) => ({ value: cells[0], row: firstRow + index })), {
    firstRow: 2,
    chunkSize: 500,
    onProgress: processed => progress.push(processed),
    yieldControl: async () => {},
  });
  assert.equal(result.length, 1201);
  assert.equal(result.at(-1).row, 1202);
  assert.deepEqual(progress, [500, 1000, 1201]);
});

test('exporta todas as linhas filtradas com CSV compatível', () => {
  const data = buildExportData([{ row: 2, sku: '10', item: 'Peça; especial', shelfCode: 'A1', partitionCode: 'B2', localCode: '1', stock: 2, stockValue: 1234.56, action: 'BLOQUEAR', address: 'Rua A, 123' }], 'analitico');
  const csv = buildCsv(data);
  assert.deepEqual(data.headers, ['Código', 'Nome do item', 'Prateleira', 'Reparticao', 'Local', 'Qtde', 'Valor unitário', 'Valor do saldo', 'Classificação', 'Ações', 'Motivo', 'Linha na planilha']);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"10"/);
  assert.match(csv, /"Peça; especial"/);
  assert.match(csv, /"A1"/);
  assert.match(csv, /"B2"/);
  assert.match(csv, /"1"/);
  assert.match(csv, /"2"/);
  assert.match(csv, /"R\$\s*1\.234,56|R\$\s*1.234,56|R\$\s*1234,56/);
  assert.match(csv, /BLOQUEAR/);
});

test('preserva quatro casas decimais no valor unitário exportado', () => {
  const data = buildExportData([{ sku: '61086', item: 'Elemento filtrante', localCode: '7', stock: 2, stockValue: 796.425 }], 'analitico');
  assert.equal(data.rows[0][6].replace(/\s/g, ' '), 'R$ 398,2125');
  assert.equal(data.rows[0][7].replace(/\s/g, ' '), 'R$ 796,43');
  assert.equal(currencyNumber(data.rows[0][6]), 398.2125);
  assert.equal(currencyNumber(398.2125), 398.2125);
});

test('inclui os dias desde a última movimentação em todas as ações, menos Desbloquear', () => {
  const data = buildExportData([{
    sku: '392720',
    item: 'Calça EPI',
    localCode: '4',
    stock: 2,
    stockValue: 159.54,
    daysSince: 114,
  }], 'analitico', { includeDaysSince: true });

  assert.deepEqual(data.headers, ['Código', 'Nome do item', 'Prateleira', 'Reparticao', 'Local', 'Qtde', 'Dias desde a última movimentação', 'Valor unitário', 'Valor do saldo', 'Classificação', 'Ações', 'Motivo', 'Linha na planilha']);
  assert.equal(data.rows[0][6], 114);
  assert.equal(shouldIncludeDaysSince('analitico', ''), true);
  assert.equal(shouldIncludeDaysSince('analitico', 'BLOQUEAR'), true);
  assert.equal(shouldIncludeDaysSince('analitico', 'TRANSFERIR OBSOLETO'), true);
  assert.equal(shouldIncludeDaysSince('analitico', 'DESBLOQUEAR'), false);
  assert.equal(shouldIncludeDaysSince('giro', 'BLOQUEAR'), false);
});

test('soma o valor do estoque por ação e monta o gráfico do maior para o menor', () => {
  const items = [
    { action: 'BLOQUEAR', actions: ['BLOQUEAR'], stockValue: '1.000,50' },
    { action: 'BLOQUEAR', actions: ['BLOQUEAR', 'TRANSFERIR OBSOLETO'], stockValue: 500 },
    { action: 'TRANSFERIR OBSOLETO', actions: ['TRANSFERIR OBSOLETO'], stockValue: null },
    { action: 'ZERAR MIN/MAX', actions: ['ZERAR MIN/MAX'], stockValue: 2000 },
  ];
  const values = actionValues(items, ['BLOQUEAR', 'TRANSFERIR OBSOLETO', 'ZERAR MIN/MAX', 'DESBLOQUEAR'], true);
  assert.deepEqual(values.map(({ action, count, value }) => [action, count, value]), [
    ['BLOQUEAR', 2, 1500.5],
    ['TRANSFERIR OBSOLETO', 2, 500],
    ['ZERAR MIN/MAX', 1, 2000],
    ['DESBLOQUEAR', 0, 0],
  ]);
});

test('agrupa o valor com saldo por tempo sem requisição e separa parado de obsoleto', () => {
  const items = [
    { stock: 5, daysSince: 10, stockValue: 100, obsoleteLocation: false },
    { stock: 5, daysSince: 120, stockValue: '1.000,50', obsoleteLocation: false },
    { stock: 5, daysSince: 200, stockValue: 300, obsoleteLocation: false },
    { stock: 5, daysSince: 400, stockValue: 700, obsoleteLocation: true },
    { stock: 0, daysSince: 400, stockValue: 999, obsoleteLocation: false },
    { stock: 5, daysSince: null, stockValue: 50, obsoleteLocation: false },
  ];
  assert.deepEqual(items.map(agingBucket), ['0-89', '90-179', '180-364', '365+', null, null]);
  const buckets = agingSummary(items);
  assert.deepEqual(buckets.map(({ key, count, value }) => [key, count, value]), [
    ['0-89', 1, 100], ['90-179', 1, 1000.5], ['180-364', 1, 300], ['365+', 1, 700],
  ]);
  const health = stockHealth(items);
  assert.deepEqual(health.idle, { count: 1, value: 300 });
  assert.deepEqual(health.obsolete, { count: 1, value: 700 });
  assert.match(buildHealthMarkup('idle', health.idle), /Parado há 180 dias ou mais/);
  assert.match(buildHealthMarkup('obsolete', health.obsolete), /R\$\s?700,00/);

  const chart = buildAgingChartMarkup(buckets, '90-179');
  assert.equal((chart.match(/class="chart-row"/g) || []).length, 4);
  assert.match(chart, /data-aging="90-179" aria-pressed="true"/);
  assert.match(chart, /width:100\.0%/);
  assert.match(chart, /R\$\s?1\.000,50/);
  assert.equal(buildAgingChartMarkup(agingSummary([])), '');
});
