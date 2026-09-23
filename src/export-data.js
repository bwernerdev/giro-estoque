function formatCurrency(value, fractionDigits = 2) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numericValue);
}

function unitPriceValue(row) {
  const stock = Number(row.stock ?? 0);
  const totalValue = Number(row.stockValue ?? 0);
  if (!Number.isFinite(stock) || !Number.isFinite(totalValue) || stock === 0) return 0;
  return totalValue / stock;
}

export function currencyNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const numericValue = Number(String(value ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function buildExportData(rows, mode, { includeDaysSince = false } = {}) {
  const baseHeaders = ['Código', 'Nome do item', 'Prateleira', 'Reparticao', 'Local', 'Qtde', 'Valor unitário', 'Valor do saldo'];

  if (mode === 'analitico') {
    const headers = includeDaysSince
      ? [...baseHeaders.slice(0, 6), 'Dias desde a última movimentação', ...baseHeaders.slice(6)]
      : baseHeaders;
    return {
      headers,
      rows: rows.map(row => [
        row.sku,
        row.item,
        row.shelfCode ?? '',
        row.partitionCode ?? '',
        row.localCode,
        row.stock,
        ...(includeDaysSince ? [row.daysSince ?? ''] : []),
        formatCurrency(unitPriceValue(row), 4),
        formatCurrency(row.stockValue ?? 0),
      ]),
    };
  }

  if (mode === 'giro') {
    return {
      headers: baseHeaders,
      rows: rows.map(row => [row.sku, row.item, row.shelfCode ?? '', row.partitionCode ?? '', row.location, row.stock, formatCurrency(unitPriceValue(row), 4), formatCurrency(row.stockValue ?? 0)]),
    };
  }

  return {
    headers: baseHeaders,
    rows: rows.map(row => [row.sku, row.item, row.shelfCode ?? '', row.partitionCode ?? '', row.location ?? row.localCode ?? '', row.stock, formatCurrency(unitPriceValue(row), 4), formatCurrency(row.stockValue ?? 0)]),
  };
}

export function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildCsv(data) {
  return '\uFEFF' + [data.headers, ...data.rows].map(row => row.map(csvField).join(';')).join('\r\n');
}
