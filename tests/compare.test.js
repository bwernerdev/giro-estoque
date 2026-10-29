import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, compareToSnapshot, readSnapshot, rowKey, saveSnapshot } from '../src/compare.js';

const row = (sku, action, extra = {}) => ({ sku, action, localCode: '7', ...extra });

test('compara ações por código e posição, e marca novos e removidos', () => {
  const snapshot = buildSnapshot([row('1', 'BLOQUEAR'), row('2', 'DESBLOQUEAR'), row('3', 'BLOQUEAR')], { mode: 'analitico', fileName: 'a.xlsx' });
  const now = [row('1', 'BLOQUEAR'), row('2', 'BLOQUEAR'), row('4', 'DESBLOQUEAR')];
  const result = compareToSnapshot(now, snapshot, 'analitico');
  assert.deepEqual({ changed: result.changed, added: result.added, removed: result.removed, total: result.total }, { changed: 1, added: 1, removed: 1, total: 2 });
  assert.equal(now[0].change, undefined);
  assert.deepEqual(now[1].change, { kind: 'mudou', from: 'DESBLOQUEAR' });
  assert.deepEqual(now[2].change, { kind: 'novo' });
});

test('a mesma peça em outra prateleira é outro item', () => {
  assert.notEqual(rowKey(row('1', 'x', { shelfCode: 'A' })), rowKey(row('1', 'x', { shelfCode: 'B' })));
});

test('sem importação anterior ou com outro modo não há comparação', () => {
  const snapshot = buildSnapshot([row('1', 'BLOQUEAR')], { mode: 'giro', fileName: 'a' });
  assert.equal(compareToSnapshot([row('1', 'x')], null, 'giro'), null);
  assert.equal(compareToSnapshot([row('1', 'x')], snapshot, 'analitico'), null);
});

test('guarda e lê o snapshot, ignorando armazenamento quebrado', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const snapshot = buildSnapshot([row('1', 'BLOQUEAR')], { mode: 'analitico', fileName: 'a' });
  assert.equal(saveSnapshot(snapshot, storage), true);
  assert.deepEqual(readSnapshot(storage).items, snapshot.items);
  assert.equal(saveSnapshot(snapshot, { setItem() { throw new Error('cheio'); } }), false);
  assert.equal(readSnapshot({ getItem() { throw new Error('x'); } }), null);
});
