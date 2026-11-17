import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSavedImport, loadSavedImport, saveImport } from '../src/saved-import.js';

test('sem IndexedDB (testes, modo privado) as funções falham e o app segue sem guardar', async () => {
  await assert.rejects(saveImport({ fileName: 'estoque.csv' }, null), /IndexedDB/);
  await assert.rejects(loadSavedImport(null), /IndexedDB/);
  await assert.rejects(clearSavedImport(null), /IndexedDB/);
});
