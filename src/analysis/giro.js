// Análise de giro (BBOG6656): valor do estoque contra valor do consumo.
import { formatNumber, parseNumber } from './numbers.js';

export function analyzeGiro(rows, mapping, settings, firstRow = 2) {
  const parse = value => parseNumber(value, settings.numberFormat);
  const shortDays = Math.max(0, parseNumber(settings.shortDays, 'en-US') ?? 30);
  const excessDays = Math.max(shortDays, parseNumber(settings.excessDays, 'en-US') ?? 90);
  const longDays = Math.max(excessDays, parseNumber(settings.longDays, 'en-US') ?? 365);
  return rows.map((cells, index) => {
    const get = key => mapping[key] >= 0 ? cells[mapping[key]] : null;
    const item = String(get('item') ?? '').trim();
    const sku = String(get('sku') ?? '').trim();
    const branch = String(get('branch') ?? '').trim();
    const location = String(get('location') ?? '').trim();
    const group = String(get('group') ?? '').trim();
    const shelfCode = String(get('shelfCode') ?? '').trim();
    const partitionCode = String(get('partitionCode') ?? '').trim();
    const divisionCode = String(get('divisionCode') ?? '').trim();
    const address = String(get('address') ?? '').trim();
    const stock = parse(get('stock'));
    const stockValue = parse(get('stockValue'));
    const consumption = parse(get('consumption'));
    const reportedGiro = parse(get('giroDays'));
    const base = { row: index + firstRow, item, sku, branch, location, group, shelfCode, partitionCode, divisionCode, address, stock, stockValue, consumption, coverage: null, reportedGiro, action: 'Verificar dados', reason: '' };
    const issues = [];
    if (!item) issues.push('Nome do item: valor ausente');
    for (const [key, label] of [['stock', 'Quantidade'], ['stockValue', 'Valor do estoque'], ['consumption', 'Consumo']]) {
      const raw = String(get(key) ?? '').trim();
      const value = parse(get(key));
      if ((raw && value === null) || (value !== null && value < 0)) issues.push(`${label}: ${value !== null && value < 0 ? 'valor negativo' : 'valor inválido'}`);
    }
    if (issues.length) return { ...base, reason: `Corrigir na planilha: ${issues.join('; ')}.` };
    if (stockValue === null && consumption !== null && consumption > 0) return { ...base, action: 'Confirmar saldo', reason: 'Há consumo, mas quantidade e valor do estoque estão em branco; confirmar saldo antes de repor.' };
    if (stockValue === null) return { ...base, reason: 'Valor do estoque em branco.' };
    if (consumption === null || consumption === 0) return { ...base, action: 'Investigar sem consumo', reason: 'Há estoque, mas não há consumo registrado no período.' };
    const coverage = stockValue / consumption * 30;
    if (reportedGiro !== null && Math.abs(reportedGiro - coverage) > 0.1) return { ...base, coverage, reason: 'O giro informado difere do cálculo: valor do estoque ÷ valor do consumo × 30.' };
    if (coverage <= shortDays) return { ...base, coverage, action: 'Planejar reposição', reason: `Cobertura de ${formatNumber(coverage)} dias, até o limite de ${formatNumber(shortDays)} dias.` };
    if (coverage > longDays) return { ...base, coverage, action: 'Avaliar transferência', reason: `Cobertura acima de ${formatNumber(longDays)} dias; revisar demanda e possível remanejamento.` };
    if (coverage > excessDays) return { ...base, coverage, action: 'Reduzir compras', reason: `Cobertura acima de ${formatNumber(excessDays)} dias; revisar novas compras.` };
    return { ...base, coverage, action: 'Manter', reason: 'Cobertura dentro da faixa configurada.' };
  });
}
