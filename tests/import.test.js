import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/import.js';

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
