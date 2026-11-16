// "Gerar painel": o que vai dentro do painel-giro-estoque.html e como volta a ser estado do app.
// O painel leva a aba importada (linhas e cabeçalho), o mapeamento de colunas, o modo, os
// critérios e as SCs do SNAC0540 dos itens da planilha. Ao abrir, o app refaz a análise com
// as mesmas regras de analysis.js. Roda no navegador e no Node (sem ?raw nem DOM).
import { itemKey } from '../analysis.js';

export const PANEL_FILE_NAME = 'painel-giro-estoque.html';
export const PANEL_MARKER = '__DADOS_DO_PAINEL__';
// Mudou o formato abaixo: suba a versão (painel antigo avisa em vez de abrir errado).
export const PANEL_VERSION = 1;

// Só os campos da SC que as regras e a tela usam (sem solicitante, nome do produto nem entrega).
const REQUEST_FIELDS = ['request', 'status', 'createdAt', 'product', 'sequence', 'quantity', 'canceled', 'local', 'order', 'orderStatus', 'orderBalance', 'supplier', 'invoice'];

const isoDate = value => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null);
const readDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function buildPanelData({ sheet, mapping, mode, numberFormat, settings, fileName, importedAt, purchases = null, generatedAt = new Date() }) {
  if (!sheet?.rows?.length) throw new Error('Importe a planilha antes de gerar o painel.');
  // SCs só dos itens que estão na planilha: o resto não muda nenhuma ação.
  const keys = new Set(mapping.sku >= 0 ? sheet.rows.slice(sheet.headerRow + 1).map(cells => itemKey(cells[mapping.sku])).filter(Boolean) : []);
  return {
    version: PANEL_VERSION,
    generatedAt: isoDate(generatedAt),
    fileName,
    importedAt: isoDate(importedAt),
    sheet: { name: sheet.name, headerRow: sheet.headerRow, rows: sheet.rows },
    mapping: { ...mapping },
    mode,
    numberFormat,
    settings: JSON.parse(JSON.stringify(settings)),
    purchases: purchases ? {
      fileName: purchases.fileName,
      importedAt: isoDate(purchases.importedAt),
      requests: purchases.requests.filter(request => keys.has(request.product)).map(request => Object.fromEntries(REQUEST_FIELDS.map(field => [field, field === 'createdAt' ? isoDate(request[field]) : request[field] ?? null]))),
    } : null,
  };
}

// JSON dentro de <script type="application/json">: "<" escapado para nenhum texto fechar a tag.
export function serializePanelData(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function fillPanelTemplate(template, data) {
  if (template.split(PANEL_MARKER).length !== 2) throw new Error('Modelo do painel sem a marca de dados: rode npm run build:panel.');
  return template.replace(PANEL_MARKER, () => serializePanelData(data));
}

// Texto embutido no painel de volta ao formato do estado do app (datas e SCs por item).
export function readPanelData(text) {
  const data = JSON.parse(text);
  if (data?.version !== PANEL_VERSION || !data.sheet?.rows) throw new Error('painel de outra versão do app');
  let purchases = null;
  if (data.purchases) {
    const requests = data.purchases.requests.map(request => ({ ...request, createdAt: readDate(request.createdAt) }));
    const byItem = new Map();
    for (const request of requests) {
      if (!byItem.has(request.product)) byItem.set(request.product, []);
      byItem.get(request.product).push(request);
    }
    purchases = { fileName: data.purchases.fileName, importedAt: readDate(data.purchases.importedAt) ?? new Date(), requests, byItem };
  }
  return { ...data, generatedAt: readDate(data.generatedAt), importedAt: readDate(data.importedAt), purchases };
}
