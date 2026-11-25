// Indicadores da visão geral: faixas de tempo sem requisição, valor parado e em locais
// obsoletos, e o total por local.
import { normalizeLocalKey, stockLocation } from './fields.js';
import { parseNumber } from './numbers.js';

const stockAmount = row => {
  const amount = parseNumber(row.stockValue);
  return Number.isFinite(amount) ? amount : 0;
};

// Faixas de tempo sem requisição (Dif Dias) do gráfico de envelhecimento; `until` é exclusivo.
export const AGING_BUCKETS = [
  { key: '0-89', label: '0 a 89 dias', from: 0, until: 90 },
  { key: '90-179', label: '90 a 179 dias', from: 90, until: 180 },
  { key: '180-364', label: '180 a 364 dias', from: 180, until: 365 },
  { key: '365+', label: '365 dias ou mais', from: 365, until: Infinity },
];

// Faixa do item, só para quem tem saldo e Dif Dias.
export function agingBucket(row) {
  if (!(row.stock > 0) || row.daysSince === null || row.daysSince === undefined) return null;
  return AGING_BUCKETS.find(bucket => row.daysSince >= bucket.from && row.daysSince < bucket.until)?.key ?? null;
}

export function agingSummary(rows) {
  const totals = new Map(AGING_BUCKETS.map(bucket => [bucket.key, { ...bucket, count: 0, value: 0 }]));
  rows.forEach(row => {
    const total = totals.get(agingBucket(row));
    if (!total) return;
    total.count++;
    total.value += stockAmount(row);
  });
  return [...totals.values()];
}

// Indicadores em reais: parado (180 dias ou mais sem requisição, fora dos locais obsoletos)
// e o que já está nos locais obsoletos 1 e 298. Só itens com saldo.
export function stockHealth(rows) {
  const idle = { count: 0, value: 0 };
  const obsolete = { count: 0, value: 0 };
  rows.forEach(row => {
    if (!(row.stock > 0)) return;
    const target = row.obsoleteLocation ? obsolete : row.daysSince >= 180 ? idle : null;
    if (!target) return;
    target.count++;
    target.value += stockAmount(row);
  });
  return { idle, obsolete };
}

export function summarizeLocationTotal(rows, localFilter) {
  const filterValue = normalizeLocalKey(localFilter);
  return rows.reduce((total, row) => (!filterValue || normalizeLocalKey(stockLocation(row)) === filterValue
    ? total + stockAmount(row)
    : total), 0);
}
