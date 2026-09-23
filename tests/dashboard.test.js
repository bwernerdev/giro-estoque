import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { actionCounts, filterResults, locationOptions, paginate, processInChunks, resetDashboardState } from '../src/dashboard.js';
import { buildCsv, buildExportData, currencyNumber, shouldIncludeDaysSince } from '../src/export-data.js';
import { renderApp } from '../src/template.js';
import { buildSummaryMarkup } from '../src/main.js';

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
  assert.ok(document.querySelector('#import-context'));
  assert.ok(document.querySelector('#filtered-count'));
  assert.equal(document.querySelector('label[for="location-filter"]'), null);
  assert.equal(document.querySelector('#location-filter').closest('label').textContent.trim(), 'LocalTodos os locais');
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

test('renderiza apenas um card de valor total do estoque e mantém a linha inferior como resumo', () => {
  const actions = ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'TRANSFERIR OBSOLETO', 'DESBLOQUEAR', 'ZERAR MIN/MAX', 'Verificar dados'];
  const markup = buildSummaryMarkup({
    summaryResults: [{ item: 'A' }, { item: 'B' }],
    summaryAllResults: [{ item: 'A' }, { item: 'B' }, { item: 'C', hidden: true }],
    actions,
    locationFilter: '',
    locationTotal: 44302.87,
  });

  assert.match(markup, /VALOR TOTAL DO ESTOQUE/);
  assert.doesNotMatch(markup, /VALOR TOTAL DO ESTOQUE[\s\S]*VALOR TOTAL DO ESTOQUE/);
  assert.match(markup, /ITENS NO PAINEL/);
  assert.equal((markup.match(/summary-card/g) || []).length, 8);
});

test('cards vazios não recebem altura menor que os demais no resumo', () => {
  const css = readFileSync(new URL('../src/responsive.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.summary-filter\.is-empty\s*\{[^}]*min-height\s*:\s*88px/i);
  assert.doesNotMatch(css, /\.summary-filter\.is-empty\s*\{[^}]*height\s*:\s*auto/i);
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
  assert.deepEqual(data.headers, ['Código', 'Nome do item', 'Prateleira', 'Reparticao', 'Local', 'Qtde', 'Valor unitário', 'Valor do saldo']);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"10"/);
  assert.match(csv, /"Peça; especial"/);
  assert.match(csv, /"A1"/);
  assert.match(csv, /"B2"/);
  assert.match(csv, /"1"/);
  assert.match(csv, /"2"/);
  assert.match(csv, /"R\$\s*1\.234,56|R\$\s*1.234,56|R\$\s*1234,56/);
  assert.doesNotMatch(csv, /BLOQUEAR/);
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

  assert.deepEqual(data.headers, ['Código', 'Nome do item', 'Prateleira', 'Reparticao', 'Local', 'Qtde', 'Dias desde a última movimentação', 'Valor unitário', 'Valor do saldo']);
  assert.equal(data.rows[0][6], 114);
  assert.equal(shouldIncludeDaysSince('analitico', ''), true);
  assert.equal(shouldIncludeDaysSince('analitico', 'BLOQUEAR'), true);
  assert.equal(shouldIncludeDaysSince('analitico', 'TRANSFERIR OBSOLETO'), true);
  assert.equal(shouldIncludeDaysSince('analitico', 'DESBLOQUEAR'), false);
  assert.equal(shouldIncludeDaysSince('giro', 'BLOQUEAR'), false);
});
