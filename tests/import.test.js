import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeText, importFile, parseCsv } from '../src/import.js';
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

