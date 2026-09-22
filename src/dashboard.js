import { normalize, normalizeLocalKey } from './analysis.js';

export const PAGE_SIZE = 50;

export function rowLocation(row) {
  return row.localCode ?? row.location ?? row.branch ?? '';
}

export function matchesLocation(row, location) {
  return !location || normalizeLocalKey(rowLocation(row)) === normalizeLocalKey(location);
}

export function locationOptions(rows) {
  return [...new Set(rows.map(row => String(rowLocation(row)).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

export function filterResults(rows, { query = '', action = '', location = '', analitico = false } = {}) {
  const normalizedQuery = normalize(query);
  return rows.filter(row => {
    const actionMatch = !action || (analitico ? row.actions.includes(action) : row.action === action);
    const searchValue = `${row.item ?? ''} ${row.sku ?? ''} ${row.branch ?? ''} ${row.location ?? ''} ${row.localCode ?? ''}`;
    return matchesLocation(row, location) && actionMatch && (!normalizedQuery || normalize(searchValue).includes(normalizedQuery));
  });
}

export function paginate(rows, page, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), pageCount);
  const start = (currentPage - 1) * pageSize;
  return { page: currentPage, pageCount, start, rows: rows.slice(start, start + pageSize) };
}

export function actionCounts(rows, actions, analitico) {
  return actions.map(action => ({
    action,
    count: rows.filter(row => analitico ? row.actions.includes(action) : row.action === action).length,
  }));
}

export function resetDashboardState(state) {
  state.page = 1;
  state.locationFilter = '';
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
