// Números: leitura de texto nos formatos brasileiro (1.234,56) e internacional (1,234.56)
// e formatação para a tela.
export function parseNumber(value, numberFormat = 'pt-BR') {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(/^R\$\s*/, '');
  const international = numberFormat === 'en-US';
  const pattern = international
    ? /^[+-]?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/
    : /^[+-]?(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?$/;
  if (!pattern.test(text)) return null;
  text = international ? text.replace(/,/g, '') : text.replace(/\./g, '').replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumber(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
}
