// Comparação entre a importação atual e a anterior (guardada no navegador).
export const SNAPSHOT_KEY = 'controle-estoque-snapshot';
const MAX_SNAPSHOT_CHARS = 2_500_000;

export function rowKey(row) {
  return [row.sku || row.item, row.localCode, row.shelfCode, row.partitionCode].map(part => String(part ?? '').trim().toLowerCase()).join('|');
}

export function buildSnapshot(results, { mode, fileName, savedAt = new Date() }) {
  const actions = [];
  const items = {};
  for (const row of results) {
    const key = rowKey(row);
    if (key in items) continue;
    let index = actions.indexOf(row.action);
    if (index < 0) index = actions.push(row.action) - 1;
    items[key] = index;
  }
  return { version: 1, mode, fileName, savedAt: savedAt.toISOString(), actions, items };
}

// Marca cada linha com `change` ({ kind: 'novo' } ou { kind: 'mudou', from }) e resume as diferenças.
export function compareToSnapshot(results, snapshot, mode) {
  for (const row of results) delete row.change;
  if (!snapshot || snapshot.version !== 1 || snapshot.mode !== mode) return null;
  const seen = new Set();
  let changed = 0, added = 0;
  for (const row of results) {
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(key in snapshot.items)) { row.change = { kind: 'novo' }; added++; continue; }
    const from = snapshot.actions[snapshot.items[key]];
    if (from !== row.action) { row.change = { kind: 'mudou', from }; changed++; }
  }
  const removed = Object.keys(snapshot.items).filter(key => !seen.has(key)).length;
  return { changed, added, removed, total: changed + added, fileName: snapshot.fileName, savedAt: snapshot.savedAt };
}

export function readSnapshot(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(SNAPSHOT_KEY) || 'null'); } catch { return null; }
}

export function saveSnapshot(snapshot, storage = globalThis.localStorage) {
  try {
    const text = JSON.stringify(snapshot);
    if (text.length > MAX_SNAPSHOT_CHARS) return false;
    storage.setItem(SNAPSHOT_KEY, text);
    return true;
  } catch { return false; }
}
