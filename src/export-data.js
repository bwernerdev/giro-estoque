import { purchaseStage } from './analysis.js';

function formatCurrency(value, fractionDigits = 2) {
  if (value === null || value === undefined) return '';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numericValue);
}

function unitPriceValue(row) {
  if (row.stock == null || row.stockValue == null) return null;
  const stock = Number(row.stock);
  const totalValue = Number(row.stockValue);
  if (!Number.isFinite(stock) || !Number.isFinite(totalValue) || stock === 0) return null;
  return totalValue / stock;
}

export function currencyNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const numericValue = Number(String(value ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numericValue) ? numericValue : 0;
}



export function shouldIncludeDaysSince(mode, action) {
  return mode === 'analitico' && action !== 'DESBLOQUEAR';
}

export function buildExportData(rows, mode, { includeDaysSince = false } = {}) {
  const baseHeaders = ['Código', 'Nome do item', 'Prateleira', 'Reparticao', 'Local', 'Qtde', 'Valor unitário', 'Valor do saldo'];

  if (mode === 'analitico') {
    const headers = includeDaysSince
      ? [...baseHeaders.slice(0, 6), 'Dias desde a última movimentação', ...baseHeaders.slice(6)]
      : baseHeaders;
    // Colunas de compra só quando algum item exportado tem COMPRAR ou COMPRA EM ANDAMENTO.
    const withPurchase = rows.some(row => row.toBuy !== null && row.toBuy !== undefined);
    const purchaseHeaders = withPurchase ? ['Sugestão de compra (até o máximo)', 'SC', 'Data da SC', 'Situação da SC', 'OF', 'Situação da OF', 'Andamento da SC'] : [];
    const purchaseCells = row => {
      if (!withPurchase) return [];
      const request = row.purchase;
      return [row.toBuy ?? '', request?.request ?? '', request?.createdAt ? request.createdAt.toLocaleDateString('pt-BR') : '', request?.status ?? '', request?.order ?? '', request?.orderStatus ?? '', purchaseStage(request)];
    };
    return {
      headers: [...headers, 'Classificação', 'Ações', ...purchaseHeaders, 'Motivo', 'Linha na planilha'],
      rows: rows.map(row => [
        row.sku,
        row.item,
        row.shelfCode ?? '',
        row.partitionCode ?? '',
        row.localCode,
        row.stock,
        ...(includeDaysSince ? [row.daysSince ?? ''] : []),
        formatCurrency(unitPriceValue(row), 4),
        formatCurrency(row.stockValue),
        row.classification ?? '',
        row.action ?? '',
        ...purchaseCells(row),
        row.reason ?? '',
        row.row ?? '',
      ]),
    };
  }

  if (mode === 'giro') {
    return {
      headers: [...baseHeaders, 'Giro (dias)', 'Recomendação', 'Motivo', 'Linha na planilha'],
      rows: rows.map(row => [row.sku, row.item, row.shelfCode ?? '', row.partitionCode ?? '', row.location, row.stock, formatCurrency(unitPriceValue(row), 4), formatCurrency(row.stockValue), row.coverage, row.action, row.reason, row.row ?? '']),
    };
  }

  return {
    headers: [...baseHeaders, 'Cobertura (dias)', 'Recomendação', 'Motivo', 'Linha na planilha'],
    rows: rows.map(row => [row.sku, row.item, row.shelfCode ?? '', row.partitionCode ?? '', row.localCode || row.location || '', row.stock, formatCurrency(unitPriceValue(row), 4), formatCurrency(row.stockValue), row.coverage, row.action, row.reason, row.row ?? '']),
  };
}

export function csvField(value) {
  let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
  // Quoting CSV separators alone does not stop spreadsheet formula interpretation.
  if (typeof value === 'string' && (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(data) {
  return '\uFEFF' + [data.headers, ...data.rows].map(row => row.map(csvField).join(';')).join('\r\n');
}
