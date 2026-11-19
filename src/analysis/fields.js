// Campos da planilha: lista com apelidos de cabeçalho, mapeamento automático, linha do
// cabeçalho e tipo de análise. Também a normalização de texto usada nas comparações.
export const fields = [
  { key: 'item', label: 'Nome do item', required: true, aliases: ['item', 'produto', 'descricao', 'descrição', 'nome', 'nome do sku', 'nm item', 'ds item'] },
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
  { key: 'averageConsumption', label: 'Média de consumo', required: false, aliases: ['media de consumo', 'media de conusmo' /* alias intencional: captura planilhas com o typo original */] },
  { key: 'classification', label: 'Classificação do giro', required: false, aliases: ['itens acima de 90 dias'] },
  { key: 'blockReason', label: 'Motivo do bloqueio', required: false, aliases: ['ds motivo bloqueio'] },
  { key: 'blockId', label: 'Id Bloqueio', required: false, aliases: ['id bloqueio'] },
  { key: 'lastRequest', label: 'Última requisição', required: false, aliases: ['dt ultima req', 'data ultima requisicao'] },
  { key: 'localCode', label: 'Código do local', required: false, aliases: ['cd local estoque'] },
  { key: 'shelfCode', label: 'Código da prateleira', required: false, aliases: ['cd prateleira', 'codigo prateleira', 'código prateleira', 'prateleira'] },
  { key: 'partitionCode', label: 'Código da repartição', required: false, aliases: ['cd reparticao', 'codigo reparticao', 'código reparticao', 'reparticao', 'repartição'] },
  { key: 'divisionCode', label: 'Código da divisão', required: false, aliases: ['cd divisao', 'codigo divisao', 'código divisao', 'divisao', 'divisão'] },
  { key: 'address', label: 'Endereço do item', required: false, aliases: ['endereco do item', 'endereço do item', 'endereco', 'endereço', 'logradouro', 'localizacao', 'localização'] },
];

export const ANALITICO_REQUIRED_KEYS = ['item', 'stock', 'minimum', 'maximum', 'daysSince', 'classification', 'blockReason', 'blockId', 'localCode'];

export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeLocalKey(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? normalize(trimmed) : '';
}

export function stockLocation(row) {
  return [row?.localCode, row?.location, row?.branch].find(value => String(value ?? '').trim() !== '') ?? '';
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

export function detectAnalysisMode(mapping) {
  const mapped = key => mapping[key] >= 0;
  if (mapped('classification') || (mapped('daysSince') && mapped('blockReason'))) return 'analitico';
  if (mapped('stock') && mapped('sales')) return 'generic';
  if (mapped('stockValue') || mapped('consumption')) return 'giro';
  return 'generic';
}
