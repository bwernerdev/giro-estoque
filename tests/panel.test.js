import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPanelData, fillPanelTemplate, PANEL_MARKER, readPanelData } from '../src/panel/data.js';

const rows = [['Cd Item', 'Nm Item', 'Qtde Atual'], ['0001001', 'Luva </script><b>', 1], ['1002', 'Broca', 0]];
const request = (product, extra = {}) => ({ request: '7609604', status: 'Compra confirmada', createdAt: new Date(2026, 9, 10), product, productName: 'Nome', sequence: '1', quantity: 4, canceled: '', local: 4, requester: 'Fulano', order: '900', orderStatus: 'Compra confirmada', orderBalance: 3, supplier: 'ACME', deliveryDate: new Date(2026, 10, 1), invoice: '', ...extra });

function sample() {
  return buildPanelData({
    sheet: { name: 'Analítico', rows, headerRow: 0 },
    mapping: { item: 1, sku: 0, stock: 2 },
    mode: 'analitico',
    numberFormat: 'pt-BR',
    settings: { generic: { safetyDays: '7' }, giro: { shortDays: '30' } },
    fileName: 'ESTOQUE.xlsx',
    importedAt: new Date(2026, 10, 16, 9, 0),
    purchases: { fileName: 'REL_SNAC0540.CSV', importedAt: new Date(2026, 10, 16, 9, 1), requests: [request('1001'), request('1002', { request: '2' }), request('999999', { request: '3' })] },
    generatedAt: new Date(2026, 10, 16, 10, 0),
  });
}

test('dados do painel: aba, mapeamento e só as SCs dos itens da planilha, sem campos que a tela não usa', () => {
  const data = sample();
  assert.equal(data.version, 1);
  assert.equal(data.sheet.rows, rows);
  assert.deepEqual(data.purchases.requests.map(entry => entry.request), ['7609604', '2'], 'SC de item fora da planilha fica fora');
  const [first] = data.purchases.requests;
  assert.equal(first.createdAt, new Date(2026, 9, 10).toISOString());
  for (const field of ['requester', 'productName', 'deliveryDate']) assert.equal(field in first, false, field);
  assert.equal(buildPanelData({ sheet: { name: 'x', rows, headerRow: 0 }, mapping: {}, settings: {} }).purchases, null);
  assert.throws(() => buildPanelData({ sheet: { rows: [] }, mapping: {}, settings: {} }), /Importe a planilha/);
});

test('modelo do painel: dados embutidos sem fechar a tag e lidos de volta com datas e SCs por item', () => {
  const html = fillPanelTemplate(`<script id="panel-data" type="application/json">${PANEL_MARKER}</script>`, sample());
  assert.equal(html.includes('</script><b>'), false, 'texto da planilha não fecha o script');
  const text = html.match(/<script id="panel-data" type="application\/json">(.*)<\/script>$/s)[1];
  const data = readPanelData(text);
  assert.equal(data.sheet.rows[1][1], 'Luva </script><b>');
  assert.ok(data.generatedAt instanceof Date && data.importedAt instanceof Date);
  assert.deepEqual(data.purchases.requests[0].createdAt, new Date(2026, 9, 10));
  assert.deepEqual([...data.purchases.byItem.keys()], ['1001', '1002']);
  assert.throws(() => fillPanelTemplate('<html></html>', sample()), /npm run build:panel/);
  assert.throws(() => readPanelData('{"version":99}'), /outra versão/);
});
