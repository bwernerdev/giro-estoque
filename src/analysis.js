export const fields = [
  { key: 'item', label: 'Nome do item', required: true, aliases: ['item', 'produto', 'descricao', 'descrição', 'nome', 'nome do sku', 'nm item'] },
  { key: 'sku', label: 'Código / SKU', required: false, aliases: ['sku', 'codigo', 'código', 'referencia', 'referência', 'cd item'] },
  { key: 'stock', label: 'Quantidade em estoque', required: false, aliases: ['estoque', 'estoque atual', 'saldo', 'quantidade em estoque', 'qtd estoque', 'quantidade', 'qtde atual'] },
  { key: 'sales', label: 'Vendas nos últimos 30 dias', required: true, aliases: ['vendas 30 dias', 'vendas nos ultimos 30 dias', 'vendas mensais', 'vendas', 'saida 30 dias', 'saídas 30 dias'] },
  { key: 'lead', label: 'Prazo de reposição (dias)', required: false, aliases: ['prazo de reposicao', 'prazo de reposição', 'lead time', 'prazo entrega', 'lead'] },
  { key: 'stockValue', label: 'Valor do estoque', required: false, aliases: ['valor do estoque', 'valor estoque', 'vl saldo'] },
  { key: 'consumption', label: 'Valor do consumo', required: false, aliases: ['valor do consumo', 'valor consumo'] },
  { key: 'giroDays', label: 'Giro em dias', required: false, aliases: ['giro em dias', 'giro dias', 'cobertura em dias', 'giro estoque dias'] },
  { key: 'branch', label: 'Filial', required: false, aliases: ['nm filial', 'nome filial', 'filial'] },
  { key: 'location', label: 'Local', required: false, aliases: ['nome do local', 'nm local'] },
  { key: 'group', label: 'Grupo', required: false, aliases: ['nm do grupo', 'grupo'] },
  { key: 'minimum', label: 'Quantidade mínima', required: false, aliases: ['qnt min', 'quantidade minima', 'estoque minimo'] },
  { key: 'maximum', label: 'Quantidade máxima', required: false, aliases: ['qnt max', 'quantidade maxima', 'estoque maximo'] },
  { key: 'daysSince', label: 'Dias desde a última requisição', required: false, aliases: ['dif dias'] },
  { key: 'averageConsumption', label: 'Média de consumo', required: false, aliases: ['media de consumo', 'media de conusmo'] },
  { key: 'classification', label: 'Classificação do giro', required: false, aliases: ['itens acima de 90 dias'] },
  { key: 'blockReason', label: 'Motivo do bloqueio', required: false, aliases: ['ds motivo bloqueio'] },
  { key: 'blockId', label: 'Id Bloqueio', required: false, aliases: ['id bloqueio'] },
  { key: 'lastRequest', label: 'Última requisição', required: false, aliases: ['dt ultima req', 'data ultima requisicao'] },
  { key: 'localCode', label: 'Código do local', required: false, aliases: ['cd local estoque'] },
];

export const ANALITICO_REQUIRED_KEYS = ['item', 'stock', 'minimum', 'maximum', 'daysSince', 'classification', 'blockReason', 'blockId', 'localCode'];

export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeLocalKey(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function suggestMapping(headers) {
  const result = {};
  for (const field of fields) {
    const aliases = field.aliases.map(normalize);
    result[field.key] = headers.findIndex(header => aliases.includes(normalize(header)));
  }
  return result;
}

export function findHeaderRow(rows) {
  let best = { index: 0, score: -1 };
  rows.slice(0, 20).forEach((row, index) => {
    const mapping = suggestMapping(row);
    const score = Object.values(mapping).filter(column => column >= 0).length;
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let text = String(value).trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!text || text === '-') return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
  else if (dot > comma && comma >= 0) text = text.replace(/,/g, '');
  else if (comma >= 0) text = text.replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAnaliticoNumber(value) {
  if (typeof value === 'string' && !/^-?[\d.,\s]+$/.test(value.trim())) return null;
  return parseNumber(value);
}

export function analyze(rows, mapping, settings, firstRow = 2) {
  const safetyDays = Math.max(0, parseNumber(settings.safetyDays) ?? 0);
  const excessDays = Math.max(1, parseNumber(settings.excessDays) ?? 90);
  const defaultLead = Math.max(0, parseNumber(settings.defaultLead) ?? 7);
  return rows.map((cells, index) => {
    const get = key => mapping[key] >= 0 ? cells[mapping[key]] : null;
    const item = String(get('item') ?? '').trim();
    const sku = String(get('sku') ?? '').trim();
    const stock = parseNumber(get('stock'));
    const sales = parseNumber(get('sales'));
    const leadValue = parseNumber(get('lead'));
    const lead = leadValue === null ? defaultLead : leadValue;
    const base = { row: index + firstRow, item, sku, stock, sales, lead, coverage: null, reorderPoint: null, action: 'Verificar dados', reason: '' };
    if (!item || stock === null || sales === null || stock < 0 || sales < 0 || lead < 0) {
      return { ...base, reason: 'Nome, estoque, vendas ou prazo ausente/inválido.' };
    }
    if (sales === 0) return { ...base, action: stock > 0 ? 'Avaliar sem giro' : 'Sem movimento', reason: stock > 0 ? 'Há estoque, mas nenhuma venda registrada em 30 dias.' : 'Sem estoque e sem vendas registradas.' };
    const daily = sales / 30;
    const coverage = stock / daily;
    const reorderPoint = daily * (lead + safetyDays);
    if (stock <= reorderPoint) return { ...base, coverage, reorderPoint, action: 'Comprar', reason: `Estoque até o ponto de reposição (${formatNumber(reorderPoint)} un.).` };
    if (coverage > excessDays) return { ...base, coverage, reorderPoint, action: 'Avaliar excesso', reason: `Cobertura acima de ${formatNumber(excessDays)} dias.` };
    return { ...base, coverage, reorderPoint, action: 'Manter', reason: 'Estoque acima do ponto de reposição e dentro do limite de cobertura.' };
  });
}

export function analyzeGiro(rows, mapping, settings, firstRow = 2) {
  const shortDays = Math.max(0, parseNumber(settings.shortDays) ?? 30);
  const excessDays = Math.max(shortDays, parseNumber(settings.excessDays) ?? 90);
  const longDays = Math.max(excessDays, parseNumber(settings.longDays) ?? 365);
  return rows.map((cells, index) => {
    const get = key => mapping[key] >= 0 ? cells[mapping[key]] : null;
    const item = String(get('item') ?? '').trim();
    const sku = String(get('sku') ?? '').trim();
    const branch = String(get('branch') ?? '').trim();
    const location = String(get('location') ?? '').trim();
    const group = String(get('group') ?? '').trim();
    const stock = parseNumber(get('stock'));
    const stockValue = parseNumber(get('stockValue'));
    const consumption = parseNumber(get('consumption'));
    const reportedGiro = parseNumber(get('giroDays'));
    const base = { row: index + firstRow, item, sku, branch, location, group, stock, stockValue, consumption, coverage: null, reportedGiro, action: 'Verificar dados', reason: '' };
    if (!item || (stockValue !== null && stockValue < 0) || (consumption !== null && consumption < 0)) return { ...base, reason: 'Nome, valor do estoque ou consumo inválido.' };
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

export function analyzeAnalitico(rows, mapping, firstRow = 2) {
  return rows.map((cells, index) => {
    const get = key => mapping[key] >= 0 ? cells[mapping[key]] : null;
    const item = String(get('item') ?? '').trim();
    const sku = String(get('sku') ?? '').trim();
    const stock = parseAnaliticoNumber(get('stock'));
    const minimum = parseAnaliticoNumber(get('minimum'));
    const maximum = parseAnaliticoNumber(get('maximum'));
    const stockValue = parseNumber(get('stockValue'));
    const coverage = parseNumber(get('giroDays'));
    const daysSince = parseAnaliticoNumber(get('daysSince'));
    const averageConsumption = parseNumber(get('averageConsumption'));
    const classification = String(get('classification') ?? '').trim();
    const blockReason = String(get('blockReason') ?? '').trim();
    const blockId = String(get('blockId') ?? '').trim();
    const lastRequest = String(get('lastRequest') ?? '').trim();
    const localCode = String(get('localCode') ?? '').trim();
    const localNumber = parseAnaliticoNumber(get('localCode'));
    const base = { row: index + firstRow, item, sku, stock, minimum, maximum, stockValue, coverage, daysSince, averageConsumption, classification, blockReason, blockId, lastRequest, localCode, hidden: false, actions: ['Verificar dados'], action: 'Verificar dados', reason: '' };
    const issues = [];
    const checkNumber = (key, label, value, required = false) => {
      if (!(mapping[key] >= 0)) {
        if (required) issues.push(`${label}: coluna não mapeada`);
        return;
      }
      if (value === null) issues.push(`${label}: valor ausente ou inválido`);
      else if (value < 0) issues.push(`${label}: valor negativo`);
    };
    if (!item) issues.push('Nm Item: valor ausente');
    if (!classification) issues.push('Itens Acima de 90 dias: valor ausente');
    checkNumber('stock', 'Qtde Atual', stock, true);
    checkNumber('minimum', 'Qnt Min', minimum);
    checkNumber('maximum', 'Qnt Max', maximum);
    if (mapping.daysSince >= 0) checkNumber('daysSince', 'Dif Dias', daysSince);
    if (mapping.localCode >= 0) checkNumber('localCode', 'Cd Local Estoque', localNumber);
    const reasonStatus = normalize(blockReason);
    if (mapping.blockReason >= 0 && !['desbloqueado', 'bloqueado por saldo'].includes(reasonStatus)) {
      issues.push(`Ds Motivo Bloqueio: ${blockReason ? 'valor não reconhecido' : 'valor ausente'}`);
    }
    const blockStatus = normalize(blockId);
    if (mapping.blockId >= 0 && blockStatus !== 'desbloqueado' && !blockStatus.startsWith('bloqueado')) {
      issues.push(`Id Bloqueio: ${blockId ? 'valor não reconhecido' : 'valor ausente'}`);
    }
    if (minimum !== null && maximum !== null && minimum > maximum) issues.push('Qnt Min: maior que Qnt Max');
    if (issues.length) return { ...base, reason: `Corrigir na planilha: ${issues.join('; ')}.` };
    const details = [daysSince === null ? '' : `${formatNumber(daysSince)} dias desde a última requisição`, blockReason, blockId ? `Id Bloqueio: ${blockId}` : ''].filter(Boolean);
    const alreadyBlocked = blockId ? blockStatus.startsWith('bloqueado') : false;
    const hiddenByStatus = stock === 0 && minimum === 0 && maximum === 0 && reasonStatus === 'desbloqueado';
    const actions = [];
    if (daysSince !== null && daysSince >= 180 && stock > 0 && localNumber === 298 && ['desbloqueado', 'bloqueado por saldo'].includes(reasonStatus)) actions.push('BLOQUEAR');
    else if (daysSince !== null && daysSince >= 180 && stock > 0 && (reasonStatus === 'bloqueado por saldo' || (reasonStatus === 'desbloqueado' && localNumber !== null && localNumber !== 7))) actions.push(alreadyBlocked ? 'TRANSFERIR OBSOLETO' : 'BLOQUEAR E TRANSFERIR OBSOLETO');
    else if (daysSince !== null && daysSince >= 90 && stock > 0 && reasonStatus === 'desbloqueado') actions.push('BLOQUEAR');
    if (daysSince !== null && daysSince >= 90 && stock === 0 && reasonStatus === 'bloqueado por saldo') actions.push('DESBLOQUEAR');
    if (stock > 0 && minimum !== null && maximum !== null && (minimum !== 0 || maximum !== 0) && localNumber === 298 && daysSince !== null && daysSince >= 180 && alreadyBlocked) actions.push('ZERAR MIN/MAX');
    if (!actions.length) actions.push('Sem ação definida');
    const hidden = hiddenByStatus || actions.includes('Sem ação definida');
    if (actions.includes('ZERAR MIN/MAX')) details.push('Zerar mín./máx.: saldo positivo, limite não zerado, local 298, ao menos 180 dias sem requisição e item bloqueado.');
    if (hidden) details.push(hiddenByStatus ? 'Oculto por padrão: saldo, mínimo e máximo zerados; Desbloqueado.' : 'Oculto por padrão: sem ação definida.');
    return { ...base, hidden, actions, action: actions.join(' + '), reason: details.join(' · ') };
  });
}

export function summarizeLocationTotal(rows, localFilter) {
  const filterValue = normalizeLocalKey(localFilter);
  if (!filterValue) {
    return rows.reduce((total, row) => {
      const amount = parseNumber(row.stockValue ?? row.stock ?? 0);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }
  return rows.reduce((total, row) => {
    const localValue = normalizeLocalKey(row?.localCode ?? row?.location ?? row?.branch ?? '');
    if (localValue !== filterValue) return total;
    const amount = parseNumber(row.stockValue ?? row.stock ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export function formatNumber(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
}
