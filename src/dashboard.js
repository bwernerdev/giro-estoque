import { normalize, normalizeLocalKey, stockLocation } from './analysis.js?v=20260925-4';

export const PAGE_SIZE = 50;
const searchTextCache = new WeakMap();

function searchableText(row) {
  if (!row || typeof row !== 'object') return '';
  if (!searchTextCache.has(row)) {
    const value = `${row.item ?? ''} ${row.sku ?? ''} ${row.branch ?? ''} ${row.location ?? ''} ${row.localCode ?? ''}`;
    searchTextCache.set(row, normalize(value));
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

export function filterResults(rows, { query = '', action = '', location = '', analitico = false, hiddenOnly = false } = {}) {
  const normalizedQuery = normalize(query);
  return rows.filter(row => {
    const actionMatch = !action || (analitico ? row.actions.includes(action) : row.action === action);
    return matchesLocation(row, location) && actionMatch && (!hiddenOnly || row.hidden) && (!normalizedQuery || searchableText(row).includes(normalizedQuery));
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

export function resetDashboardState(state) {
  state.page = 1;
  state.locationFilter = '';
  state.hiddenOnly = false;
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
