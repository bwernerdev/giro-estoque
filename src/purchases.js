import { itemKey, normalize } from './analysis.js';

// Leitura do relatório de follow-up de compras SNAC0540 (exportado em .csv ou .xlsx).
// O relatório tem duas linhas de cabeçalho: a primeira diz o bloco (SC, OF ou REC) e a
// segunda o nome da coluna. Nomes repetem entre blocos ("Código" da SC e "Codigo" da OF),
// por isso cada coluna é procurada dentro do seu bloco. As regras sobre a SC (em andamento
// ou não, qual vale para o item) ficam em analysis.js.

const REQUIRED_HEADERS = ['situacao', 'data criacao', 'cod produto', 'nr nf'];

// Linha do cabeçalho com os nomes das colunas, ou -1 se não for um SNAC0540.
export function findPurchaseHeaderRow(rows) {
  return rows.slice(0, 10).findIndex(row => {
    const names = new Set((row ?? []).map(normalize));
    return REQUIRED_HEADERS.every(name => names.has(name));
  });
}

export function isPurchaseReport(rows) {
  return findPurchaseHeaderRow(rows) >= 0;
}

// Data do relatório: texto dd/mm/aaaa, Date do Excel ou número de série do Excel.
export function parseReportDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(Math.round((value - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000);
  }
  const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function reportNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function parsePurchaseReport(rows) {
  const headerRow = findPurchaseHeaderRow(rows);
  if (headerRow < 0) throw new Error('O arquivo não parece ser o relatório SNAC0540 (follow-up de compras).');
  const headers = (rows[headerRow] ?? []).map(normalize);
  const groupRow = headerRow > 0 ? rows[headerRow - 1] ?? [] : [];
  let group = '';
  const groups = headers.map((_, index) => {
    const label = normalize(groupRow[index]);
    if (['sc', 'of', 'rec'].includes(label)) group = label;
    return group;
  });
  // Primeira coluna com o nome dentro do bloco; sem linha de blocos, a primeira com o nome.
  const column = (block, ...names) => {
    for (const name of names) {
      const inBlock = headers.findIndex((header, index) => header === name && (!groups[index] || groups[index] === block));
      if (inBlock >= 0) return inBlock;
    }
    return -1;
  };
  const columns = {
    request: column('sc', 'codigo'),
    status: column('sc', 'situacao'),
    createdAt: column('sc', 'data criacao'),
    product: column('sc', 'cod produto'),
    productName: column('sc', 'nome produto'),
    sequence: column('sc', 'seq'),
    quantity: column('sc', 'quantidade'),
    canceled: column('sc', 'cancelado'),
    local: column('sc', 'local estoque'),
    requester: column('sc', 'nome solicitante'),
    order: column('of', 'codigo'),
    orderStatus: column('of', 'situacao of'),
    orderBalance: column('of', 'saldo'),
    supplier: column('of', 'nome fornecedor'),
    deliveryDate: column('of', 'data entrega'),
    invoice: column('rec', 'nr nf'),
  };
  const text = (cells, key) => (columns[key] >= 0 ? String(cells[columns[key]] ?? '').trim() : '');
  const requests = [];
  for (const cells of rows.slice(headerRow + 1)) {
    const product = itemKey(text(cells, 'product'));
    if (!product) continue;
    const local = text(cells, 'local');
    requests.push({
      request: text(cells, 'request'),
      status: text(cells, 'status'),
      createdAt: parseReportDate(columns.createdAt >= 0 ? cells[columns.createdAt] : ''),
      product,
      productName: text(cells, 'productName'),
      sequence: text(cells, 'sequence'),
      quantity: reportNumber(columns.quantity >= 0 ? cells[columns.quantity] : null),
      canceled: text(cells, 'canceled'),
      local: local === '' ? null : reportNumber(local),
      requester: text(cells, 'requester'),
      order: text(cells, 'order'),
      orderStatus: text(cells, 'orderStatus'),
      orderBalance: reportNumber(columns.orderBalance >= 0 ? cells[columns.orderBalance] : null),
      supplier: text(cells, 'supplier'),
      deliveryDate: parseReportDate(columns.deliveryDate >= 0 ? cells[columns.deliveryDate] : ''),
      invoice: text(cells, 'invoice'),
    });
  }
  if (!requests.length) throw new Error('O relatório SNAC0540 não tem linhas de solicitação.');
  const byItem = new Map();
  for (const request of requests) {
    if (!byItem.has(request.product)) byItem.set(request.product, []);
    byItem.get(request.product).push(request);
  }
  return { requests, byItem };
}
