import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { actionCounts, filterResults, locationOptions, paginate, processInChunks, resetDashboardState } from '../src/dashboard.js';
import { buildCsv, buildExportData } from '../src/export-data.js';
import { renderApp } from '../src/template.js';

const rows = [
  { item: 'Parafuso', sku: '100', localCode: '7', action: 'BLOQUEAR', actions: ['BLOQUEAR'], hidden: false },
  { item: 'Arruela', sku: '200', localCode: '1', action: 'ZERAR MIN/MAX', actions: ['ZERAR MIN/MAX'], hidden: false },
  { item: 'Porca', sku: '300', localCode: '298', action: 'Sem ação definida', actions: ['Sem ação definida'], hidden: true },
];

test('estrutura da interface mantém controles e nomes acessíveis', () => {
  const dom = new JSDOM(renderApp());
  const document = dom.window.document;
  assert.equal(document.querySelector('#search').placeholder, 'Buscar item ou código');
  assert.equal(document.querySelector('#result-table caption').textContent, 'Resultados da análise de estoque');
  assert.equal(document.querySelectorAll('[data-export]').length, 3);
  assert.equal(document.querySelector('#pagination').getAttribute('aria-label'), 'Páginas de resultados');
});

test('filtra por busca, ação e local sem perder correspondências', () => {
  assert.deepEqual(filterResults(rows, { query: '100', analitico: true }).map(row => row.item), ['Parafuso']);
  assert.deepEqual(filterResults(rows, { action: 'ZERAR MIN/MAX', analitico: true }).map(row => row.item), ['Arruela']);
  assert.deepEqual(filterResults(rows, { location: '298', analitico: true }).map(row => row.item), ['Porca']);
  assert.deepEqual(locationOptions(rows), ['1', '7', '298']);
  assert.deepEqual(actionCounts(rows, ['BLOQUEAR', 'ZERAR MIN/MAX'], true).map(item => item.count), [1, 1]);
});

test('pagina sem descartar itens e limita a página atual', () => {
  const items = Array.from({ length: 115 }, (_, index) => ({ index }));
  assert.deepEqual(paginate(items, 2), { page: 2, pageCount: 3, start: 50, rows: items.slice(50, 100) });
  assert.equal(paginate(items, 99).page, 3);
});

test('reinicia filtros ao importar uma nova planilha', () => {
  const state = { page: 4, locationFilter: '298', sheets: ['anterior'] };
  resetDashboardState(state);
  assert.equal(state.page, 1);
  assert.equal(state.locationFilter, '');
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
  const data = buildExportData([{ row: 2, sku: '10', item: 'Peça; especial', localCode: '1', stock: 2, action: 'BLOQUEAR' }], 'analitico');
  const csv = buildCsv(data);
  assert.equal(data.headers.at(-1), 'Ações');
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"Peça; especial"/);
  assert.match(csv, /"BLOQUEAR"/);
});
