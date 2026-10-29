// Comparação entre a importação atual e as anteriores (guardadas só no navegador).
export const SNAPSHOT_KEY = 'controle-estoque-snapshots';
const MAX_STORE_CHARS = 2_500_000;

const part = value => String(value ?? '').trim().toLowerCase();

export function rowKey(row) {
  return [row.sku || row.item, row.localCode, row.shelfCode, row.partitionCode].map(part).join('|');
}

export function positionText(row) {
  return [row.localCode && `Local ${row.localCode}`, row.shelfCode && `Prat. ${row.shelfCode}`, row.partitionCode && `Rep. ${row.partitionCode}`].filter(Boolean).join(' · ');
}

// Resumo curto do conteúdo, para reconhecer a mesma planilha importada duas vezes.
function fingerprint(items, actions) {
  let hash = 2166136261;
  for (const key of Object.keys(items).sort()) {
    const text = `${key}=${actions[items[key][0]]};`;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash.toString(36);
}

// items[chave] = [índice da ação, nome do item, posição]
export function buildSnapshot(results, { mode, fileName, savedAt = new Date() }) {
  const actions = [];
  const items = {};
  for (const row of results) {
    const key = rowKey(row);
    if (key in items) continue;
    let index = actions.indexOf(row.action);
    if (index < 0) index = actions.push(row.action) - 1;
    items[key] = [index, row.item || '', positionText(row)];
  }
  return { version: 2, mode, fileName, savedAt: savedAt.toISOString(), fingerprint: fingerprint(items, actions), actions, items };
}

// Com a mesma planilha reimportada, a base passa a ser a última importação diferente.
export function pickBase(store, snapshot) {
  if (!store?.latest) return null;
  return store.latest.fingerprint === snapshot.fingerprint ? store.previous ?? null : store.latest;
}

export function nextStore(store, snapshot) {
  if (store?.latest?.fingerprint === snapshot.fingerprint) return store;
  return { latest: snapshot, previous: store?.latest ?? null };
}

// Marca cada linha com `change` e resume as diferenças. Devolve null sem base e { mismatch } se o tipo difere.
export function compareToSnapshot(results, base, mode) {
  for (const row of results) delete row.change;
  if (!base || base.version !== 2) return null;
  if (base.mode !== mode) return { mismatch: true, fileName: base.fileName, savedAt: base.savedAt };
  const seen = new Set();
  const fresh = [];
  let changed = 0;
  for (const row of results) {
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(key in base.items)) { fresh.push([key, row]); continue; }
    const from = base.actions[base.items[key][0]];
    if (from !== row.action) { row.change = { kind: 'mudou', from }; changed++; }
  }
  const gone = Object.keys(base.items).filter(key => !seen.has(key));
  // Mesmo código em outra posição: o item foi movido, não saiu nem é novo.
  const goneBySku = new Map();
  for (const key of gone) {
    const sku = key.split('|')[0];
    if (!goneBySku.has(sku)) goneBySku.set(sku, []);
    goneBySku.get(sku).push(key);
  }
  const moved = new Set();
  let added = 0;
  for (const [key, row] of fresh) {
    const candidates = goneBySku.get(key.split('|')[0]);
    const old = candidates?.shift();
    if (old) { row.change = { kind: 'moveu', from: base.items[old][2] || 'posição anterior' }; moved.add(old); } else { row.change = { kind: 'novo' }; added++; }
  }
  const removedItems = gone.filter(key => !moved.has(key)).map(key => {
    const [action, name, position] = base.items[key];
    return { sku: key.split('|')[0], name, position, action: base.actions[action] };
  });
  return { changed, added, moved: moved.size, removed: removedItems.length, removedItems, total: changed + added + moved.size, fileName: base.fileName, savedAt: base.savedAt };
}

export function readStore(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(SNAPSHOT_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function withoutNames(snapshot) {
  if (!snapshot) return snapshot;
  const items = Object.fromEntries(Object.entries(snapshot.items).map(([key, [action]]) => [key, [action, '', '']]));
  return { ...snapshot, items };
}

// Se a base for grande demais, descarta primeiro a importação mais antiga e depois os nomes. Devolve false se nada couber.
export function saveStore(store, storage = globalThis.localStorage) {
  const attempts = [store, { ...store, previous: null }, { latest: withoutNames(store.latest), previous: null }];
  for (const attempt of attempts) {
    try {
      const text = JSON.stringify(attempt);
      if (text.length > MAX_STORE_CHARS) continue;
      storage.setItem(SNAPSHOT_KEY, text);
      return true;
    } catch { return false; }
  }
  return false;
}
