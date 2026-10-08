import { normalize, normalizeLocalKey, stockLocation } from './analysis.js';

export const PAGE_SIZE = 50;
const searchTextCache = new WeakMap();

function searchableText(row) {
  if (!row || typeof row !== 'object') return [];
  if (!searchTextCache.has(row)) {
    searchTextCache.set(row, [normalize(row.item ?? ''), normalize(row.sku ?? '')]);
  }
  return searchTextCache.get(row);
}

export function matchesLocation(row, location) {
  return !location || normalizeLocalKey(stockLocation(row)) === normalizeLocalKey(location);
}

export function locationOptions(rows) {
  return [...new Set(rows.map(row => String(stockLocation(row)).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

export function matchesPosition(row, { location = '', shelf = '', partition = '' } = {}) {
  return matchesLocation(row, location)
    && (!shelf || normalize(row.shelfCode ?? '') === normalize(shelf))
    && (!partition || normalize(row.partitionCode ?? '') === normalize(partition));
}

export function filterResults(rows, { query = '', action = '', location = '', shelf = '', partition = '', analitico = false, hiddenOnly = false } = {}) {
  const normalizedQuery = normalize(query);
  return rows.filter(row => {
    const actionMatch = !action || (analitico ? row.actions.includes(action) : row.action === action);
    return matchesPosition(row, { location, shelf, partition }) && actionMatch && (!hiddenOnly || row.hidden) && (!normalizedQuery || searchableText(row).some(value => value.includes(normalizedQuery)));
  });
}

export function paginate(rows, page, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), pageCount);
  const start = (currentPage - 1) * pageSize;
  return { page: currentPage, pageCount, start, rows: rows.slice(start, start + pageSize) };
}

export function actionCounts(rows, actions, analitico) {
  const counts = new Map(actions.map(action => [action, 0]));
  rows.forEach(row => {
    const rowActions = analitico ? row.actions : [row.action];
    rowActions.forEach(action => {
      if (counts.has(action)) counts.set(action, counts.get(action) + 1);
    });
  });
  return actions.map(action => ({ action, count: counts.get(action) }));
}

const ACTION_PRIORITY = [
  'Verificar dados',
  'BLOQUEAR E TRANSFERIR OBSOLETO',
  'BLOQUEAR',
  'TRANSFERIR OBSOLETO',
  'Confirmar saldo',
  'Investigar sem consumo',
  'Comprar',
  'Planejar reposição',
  'DESBLOQUEAR',
  'ZERAR MIN/MAX',
  'Reduzir compras',
  'Avaliar transferência',
  'Avaliar excesso',
  'Avaliar sem giro',
  'Manter',
  'Sem movimento',
  'Sem ação definida',
  'Itens ocultos',
];
const actionPriority = new Map(ACTION_PRIORITY.map((action, index) => [normalize(action), index]));

export function prioritizeActionCounts(counts) {
  return counts.map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => (actionPriority.get(normalize(a.action)) ?? ACTION_PRIORITY.length) - (actionPriority.get(normalize(b.action)) ?? ACTION_PRIORITY.length) || a.index - b.index)
    .map(({ index: _index, ...entry }) => entry);
}

export function sortResults(rows, { key = '', direction = 'asc' } = {}) {
  if (!key) return rows;
  const factor = direction === 'desc' ? -1 : 1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = a.row?.[key];
    const right = b.row?.[key];
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
    if (leftEmpty) return a.index - b.index;
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return comparison * factor || a.index - b.index;
  }).map(entry => entry.row);
}

export function dataIssueSummary(rows) {
  const issues = new Map();
  const canonicalField = label => {
    const value = normalize(label);
    if (/^(qtde|qnt|quantidade)/.test(value)) return 'Quantidade';
    if (value === 'nm item' || value.includes('nome')) return 'Nome do item';
    if (value.includes('valor do estoque')) return 'Valor do estoque';
    if (value.includes('estoque')) return 'Estoque';
    if (value.includes('venda')) return 'Vendas';
    if (value.includes('consumo')) return 'Consumo';
    if (value.includes('prazo')) return 'Prazo';
    return label;
  };
  const add = label => {
    const field = canonicalField(label);
    issues.set(field, (issues.get(field) ?? 0) + 1);
  };
  const reviewRows = rows.filter(row => row.action === 'Verificar dados' || row.actions?.includes('Verificar dados'));
  reviewRows.forEach(row => {
    const reason = String(row.reason ?? '');
    const explicit = [...reason.matchAll(/(?:Corrigir na planilha:\s*|;\s*)([^:;.]+):/gi)].map(match => match[1].trim());
    if (explicit.length) {
      explicit.forEach(add);
      return;
    }
    const normalized = normalize(reason);
    if (normalized.includes('nome')) add('Nome do item');
    if (normalized.includes('quantidade')) add('Quantidade');
    if (normalized.includes('valor do estoque')) add('Valor do estoque');
    else if (normalized.includes('estoque')) add('Estoque');
    if (normalized.includes('vendas')) add('Vendas');
    if (normalized.includes('prazo')) add('Prazo');
    if (normalized.includes('consumo')) add('Consumo');
    if (normalized.includes('giro informado')) add('Giro informado');
  });
  return {
    count: reviewRows.length,
    fields: [...issues.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 3).map(([field, count]) => ({ field, count })),
  };
}

export function resetDashboardState(state) {
  state.page = 1;
  state.locationFilter = '';
  state.hiddenOnly = false;
  state.sortKey = '';
  state.sortDirection = 'asc';
  return state;
}

export async function processInChunks(rows, analyzeChunk, { firstRow = 2, chunkSize = 500, onProgress, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const results = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    results.push(...analyzeChunk(rows.slice(offset, offset + chunkSize), firstRow + offset));
    const processed = Math.min(offset + chunkSize, rows.length);
    onProgress?.(processed, rows.length);
    if (processed < rows.length) await yieldControl();
  }
  return results;
}
