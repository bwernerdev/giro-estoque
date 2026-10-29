import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, compareToSnapshot, nextStore, pickBase, readStore, rowKey, saveStore } from '../src/compare.js';

const row = (sku, action, extra = {}) => ({ sku, action, item: `Item ${sku}`, localCode: '7', ...extra });
const snap = (rows, extra = {}) => buildSnapshot(rows, { mode: 'analitico', fileName: 'a.xlsx', ...extra });

test('compara ações por código e posição, e marca novos e removidos', () => {
  const base = snap([row('1', 'BLOQUEAR'), row('2', 'DESBLOQUEAR'), row('3', 'BLOQUEAR')]);
  const now = [row('1', 'BLOQUEAR'), row('2', 'BLOQUEAR'), row('4', 'DESBLOQUEAR')];
  const result = compareToSnapshot(now, base, 'analitico');
  assert.deepEqual({ changed: result.changed, added: result.added, removed: result.removed, moved: result.moved, total: result.total }, { changed: 1, added: 1, removed: 1, moved: 0, total: 2 });
  assert.equal(now[0].change, undefined);
  assert.deepEqual(now[1].change, { kind: 'mudou', from: 'DESBLOQUEAR' });
  assert.deepEqual(now[2].change, { kind: 'novo' });
  assert.deepEqual(result.removedItems, [{ sku: '3', name: 'Item 3', position: 'Local 7', action: 'BLOQUEAR' }]);
});

test('o mesmo código em outra posição é movido, não novo nem removido', () => {
  const base = snap([row('1', 'BLOQUEAR', { shelfCode: 'A' })]);
  const now = [row('1', 'BLOQUEAR', { shelfCode: 'B' })];
  const result = compareToSnapshot(now, base, 'analitico');
  assert.deepEqual({ added: result.added, removed: result.removed, moved: result.moved }, { added: 0, removed: 0, moved: 1 });
  assert.deepEqual(now[0].change, { kind: 'moveu', from: 'Local 7 · Prat. A' });
  assert.notEqual(rowKey(row('1', 'x', { shelfCode: 'A' })), rowKey(row('1', 'x', { shelfCode: 'B' })));
});

test('sem base não há comparação e outro tipo de planilha é avisado', () => {
  const base = buildSnapshot([row('1', 'BLOQUEAR')], { mode: 'giro', fileName: 'a' });
  assert.equal(compareToSnapshot([row('1', 'x')], null, 'giro'), null);
  assert.equal(compareToSnapshot([row('1', 'x')], base, 'analitico').mismatch, true);
});

test('reimportar a mesma planilha mantém a última importação diferente como base', () => {
  const first = snap([row('1', 'BLOQUEAR')]);
  const second = snap([row('1', 'DESBLOQUEAR')]);
  let store = nextStore(null, first);
  assert.equal(pickBase(store, first), null);
  assert.equal(pickBase(store, second), first);
  store = nextStore(store, second);
  assert.equal(store.previous, first);
  assert.equal(pickBase(store, second), first);
  assert.equal(nextStore(store, second), store);
});

test('guarda e lê a base, reduz quando é grande e ignora armazenamento quebrado', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const store = nextStore(null, snap([row('1', 'BLOQUEAR')]));
  assert.equal(saveStore(store, storage), true);
  assert.deepEqual(readStore(storage).latest.items, store.latest.items);
  const big = snap(Array.from({ length: 40000 }, (_, index) => row(String(index), 'BLOQUEAR', { item: 'x'.repeat(60) })));
  assert.equal(saveStore({ latest: big, previous: big }, storage), true);
  assert.equal(readStore(storage).previous, null);
  assert.equal(saveStore(store, { setItem() { throw new Error('cheio'); } }), false);
  assert.equal(readStore({ getItem() { throw new Error('x'); } }), null);
});
