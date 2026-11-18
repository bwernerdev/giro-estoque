import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeText, importFile, parseCsv, readXlsxInWorker } from '../src/import.js';
import { findPurchaseHeaderRow, parsePurchaseReport } from '../src/purchases.js';

test('lê CSV com separador, aspas, quebra de linha e aspas escapadas', () => {
  const csv = 'Código;Item;Observação\r\n1;"Peça; especial";"Linha 1\nLinha 2"\r\n2;Normal;"Medida ""A"""';
  assert.deepEqual(parseCsv(csv, ';'), [
    ['Código', 'Item', 'Observação'],
    ['1', 'Peça; especial', 'Linha 1\nLinha 2'],
    ['2', 'Normal', 'Medida "A"'],
  ]);
});

test('rejeita CSV com aspas sem fechamento', () => {
  assert.throws(() => parseCsv('Item;Observação\n1;"texto', ';'), /aspas sem fechamento/);
});

test('aspas no meio do campo ficam no texto', () => {
  assert.deepEqual(parseCsv('Item;Email\nTALABARTE TIPO "Y" MATERIAL;ana@x.com "Ana" <ana@x.com>', ';'), [
    ['Item', 'Email'],
    ['TALABARTE TIPO "Y" MATERIAL', 'ana@x.com "Ana" <ana@x.com>'],
  ]);
});

test('CSV em ANSI (Windows-1252) mantém os acentos', async () => {
  const ansi = Uint8Array.from([0x53, 0x69, 0x74, 0x75, 0x61, 0xE7, 0xE3, 0x6F]); // "Situação" em Windows-1252
  assert.equal(decodeText(ansi.buffer), 'Situação');
  assert.equal(decodeText(new TextEncoder().encode('Situação').buffer), 'Situação');
  const [sheet] = await importFile({ name: 'snac.csv', arrayBuffer: async () => Uint8Array.from([...ansi, 0x3B, 0x4F, 0x4B]).buffer });
  assert.deepEqual(sheet.rows, [['Situação', 'OK']]);
});

test('lê o SNAC0540 pelos blocos SC/OF/REC, sem mexer nas colunas', () => {
  const rows = [
    ['SC', ' SC', ' SC', ' SC', ' SC', ' SC', ' SC', 'OF', ' OF', ' OF', ' OF', 'REC', ''],
    ['Código', ' Situação', ' Data Criação', ' Seq.', ' Cód. Produto', ' Cancelado', ' Local Estoque', 'Codigo', ' Saldo', ' Nome Fornecedor', ' Situação OF', 'Nr NF', ''],
    ['7609604', 'Compra confirmada', '14/08/2026', '1', '006470', '', '4', '7222987', '0', 'VIPOSA SA', 'Fechada', '175865', ''],
    ['7609605', 'Usuario preenchendo', '20/10/2026', '1', '7001', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  assert.equal(findPurchaseHeaderRow(rows), 1);
  assert.equal(findPurchaseHeaderRow([['Cd Item', 'Qtde Atual']]), -1);
  const { requests, byItem } = parsePurchaseReport(rows);
  assert.equal(requests.length, 2);
  const [first, second] = requests;
  assert.deepEqual([first.request, first.order, first.product, first.local, first.orderBalance, first.supplier, first.orderStatus, first.invoice],
    ['7609604', '7222987', '6470', 4, 0, 'VIPOSA SA', 'Fechada', '175865']);
  assert.equal(first.createdAt.toLocaleDateString('pt-BR'), '14/08/2026');
  assert.equal(second.local, null);
  assert.deepEqual([...byItem.keys()], ['6470', '7001']);
  assert.throws(() => parsePurchaseReport([['Cd Item']]), /SNAC0540/);
});


// Leitura do .xlsx no worker (src/import.worker.js) e a reserva na própria página.
async function sampleWorkbook() {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Analítico');
  sheet.addRow(['Cd Item', 'Nm Item', 'Qtde', 'Total', 'Data', 'Link']);
  sheet.addRow(['1001', { richText: [{ text: 'Luva ' }, { text: 'nitrílica', font: { bold: true } }] }, 3, { formula: 'C2*2', result: 6 }, new Date(Date.UTC(2026, 10, 18)), { text: 'site', hyperlink: 'https://example.com' }]);
  sheet.addRow([]);
  sheet.addRow(['1002', 'Broca', null, { formula: 'C4*2', result: 0 }]);
  workbook.addWorksheet('Vazia');
  return { ExcelJS, buffer: await workbook.xlsx.writeBuffer() };
}

test('worker do .xlsx lê igual à leitura na página (mesma conversão de células)', async t => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const { ExcelJS, buffer } = await sampleWorkbook();
  const context = vm.createContext({ Date, ExcelJS });
  vm.runInContext(await readFile(new URL('../src/import.worker.js', import.meta.url), 'utf8'), context);
  const inWorker = await context.readWorkbook(ExcelJS, buffer);
  const previous = globalThis.ExcelJS;
  globalThis.ExcelJS = ExcelJS;
  t.after(() => { if (previous) globalThis.ExcelJS = previous; else delete globalThis.ExcelJS; });
  const inPage = await importFile({ name: 'estoque.xlsx', arrayBuffer: async () => buffer.slice(0) });
  assert.deepEqual(JSON.parse(JSON.stringify(inWorker)), JSON.parse(JSON.stringify(inPage)));
  assert.equal(inPage.length, 1, 'aba vazia fica de fora');
  assert.deepEqual(inPage[0].rows[1], ['1001', 'Luva nitrílica', 3, 6, new Date(Date.UTC(2026, 10, 18)).toLocaleDateString('pt-BR'), 'site']);
});

test('readXlsxInWorker: abas do worker, erro de leitura, worker que não carrega e sem worker', async () => {
  const fakeWorker = reply => class {
    postMessage(message, transfer) {
      assert.deepEqual(transfer, [message.buffer], 'buffer transferido, não copiado');
      queueMicrotask(() => reply(this));
    }
    terminate() { this.terminated = true; }
  };
  const sheets = [{ name: 'A', rows: [['x']] }];
  assert.deepEqual(await readXlsxInWorker(new ArrayBuffer(1), fakeWorker(w => w.onmessage({ data: { sheets } }))), sheets);
  await assert.rejects(readXlsxInWorker(new ArrayBuffer(1), fakeWorker(w => w.onmessage({ data: { error: 'planilha corrompida' } }))), /planilha corrompida/);
  assert.equal(await readXlsxInWorker(new ArrayBuffer(1), fakeWorker(w => w.onerror({ preventDefault() {} }))), null);
  assert.equal(await readXlsxInWorker(new ArrayBuffer(1), class { constructor() { throw new Error('bloqueado'); } }), null);
  assert.equal(await readXlsxInWorker(new ArrayBuffer(1), undefined), null);
});
