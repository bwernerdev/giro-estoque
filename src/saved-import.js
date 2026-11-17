// Última importação guardada no navegador (IndexedDB): ao atualizar a página, o app reabre
// com as mesmas planilhas (Analítico, SNAC0540, aba, mapeamento e critérios). Guarda só no
// navegador desta máquina; "Limpar dados" (× ao lado do nome do arquivo) apaga.
// Sem IndexedDB (testes, modo privado, quadro bloqueado) as funções falham e quem chama ignora.
const DB_NAME = 'giro-estoque';
const STORE = 'importacao';
const KEY = 'ultima';
// Mudou o formato guardado: suba a versão (a importação antiga é ignorada).
export const SAVED_IMPORT_VERSION = 1;

function openDatabase(idb) {
  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Banco do navegador bloqueado.'));
  });
}

async function withStore(mode, action, idb = globalThis.indexedDB) {
  if (!idb) throw new Error('Navegador sem IndexedDB.');
  const db = await openDatabase(idb);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

// Datas e o Map das SCs (purchases.byItem) passam pelo clone estruturado do IndexedDB.
export function saveImport(data, idb) {
  return withStore('readwrite', store => store.put({ ...data, version: SAVED_IMPORT_VERSION, savedAt: new Date() }, KEY), idb);
}

export async function loadSavedImport(idb) {
  const data = await withStore('readonly', store => store.get(KEY), idb);
  return data?.version === SAVED_IMPORT_VERSION ? data : null;
}

export function clearSavedImport(idb) {
  return withStore('readwrite', store => store.delete(KEY), idb);
}
