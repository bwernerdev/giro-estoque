// Análise genérica: estoque e vendas dos últimos 30 dias, com ponto de reposição.
import { formatNumber, parseNumber } from './numbers.js';

export function analyze(rows, mapping, settings, firstRow = 2) {
  const parse = value => parseNumber(value, settings.numberFormat);
  const safetyDays = Math.max(0, parseNumber(settings.safetyDays, 'en-US') ?? 0);
  const excessDays = Math.max(1, parseNumber(settings.excessDays, 'en-US') ?? 90);
  const defaultLead = Math.max(0, parseNumber(settings.defaultLead, 'en-US') ?? 7);
  return rows.map((cells, index) => {
    const get = key => mapping[key] >= 0 ? cells[mapping[key]] : null;
    const item = String(get('item') ?? '').trim();
    const sku = String(get('sku') ?? '').trim();
    const shelfCode = String(get('shelfCode') ?? '').trim();
    const partitionCode = String(get('partitionCode') ?? '').trim();
    const divisionCode = String(get('divisionCode') ?? '').trim();
    const address = String(get('address') ?? '').trim();
    const stock = parse(get('stock'));
    const stockValue = parse(get('stockValue'));
    const location = String(get('location') ?? '').trim();
    const localCode = String(get('localCode') ?? '').trim();
    const sales = parse(get('sales'));
    const lead = String(get('lead') ?? '').trim() === '' ? defaultLead : parse(get('lead'));
    const base = { row: index + firstRow, item, sku, shelfCode, partitionCode, divisionCode, address, location, localCode, stock, stockValue, sales, lead, coverage: null, reorderPoint: null, action: 'Verificar dados', reason: '' };
    const issues = [];
    if (!item) issues.push('Nome do item: valor ausente');
    if (stock === null || stock < 0) issues.push(`Estoque: ${stock !== null && stock < 0 ? 'valor negativo' : 'valor ausente ou inválido'}`);
    if (sales === null || sales < 0) issues.push(`Vendas: ${sales !== null && sales < 0 ? 'valor negativo' : 'valor ausente ou inválido'}`);
    if (lead === null || lead < 0) issues.push(`Prazo: ${lead !== null && lead < 0 ? 'valor negativo' : 'valor ausente ou inválido'}`);
    if (issues.length) return { ...base, reason: `Corrigir na planilha: ${issues.join('; ')}.` };
    if (sales === 0) return { ...base, action: stock > 0 ? 'Avaliar sem giro' : 'Sem movimento', reason: stock > 0 ? 'Há estoque, mas nenhuma venda registrada em 30 dias.' : 'Sem estoque e sem vendas registradas.' };
    const daily = sales / 30;
    const coverage = stock / daily;
    const reorderPoint = daily * (lead + safetyDays);
    if (stock <= reorderPoint) return { ...base, coverage, reorderPoint, action: 'Comprar', reason: `Estoque até o ponto de reposição (${formatNumber(reorderPoint)} un.).` };
    if (coverage > excessDays) return { ...base, coverage, reorderPoint, action: 'Avaliar excesso', reason: `Cobertura acima de ${formatNumber(excessDays)} dias.` };
    return { ...base, coverage, reorderPoint, action: 'Manter', reason: 'Estoque acima do ponto de reposição e dentro do limite de cobertura.' };
  });
}
