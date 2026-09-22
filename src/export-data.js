export function buildExportData(rows, mode) {
  if (mode === 'analitico') {
    return {
      headers: ['Linha', 'Código do item', 'Nome do item', 'Código do local', 'Quantidade atual', 'Valor do saldo', 'Quantidade mínima', 'Quantidade máxima', 'Giro em dias', 'Dias desde última requisição', 'Média de consumo', 'Classificação da planilha', 'Motivo do bloqueio', 'Id Bloqueio', 'Última requisição', 'Ações'],
      rows: rows.map(row => [row.row, row.sku, row.item, row.localCode, row.stock, row.stockValue, row.minimum, row.maximum, row.coverage, row.daysSince, row.averageConsumption, row.classification, row.blockReason, row.blockId, row.lastRequest, row.action]),
    };
  }
  if (mode === 'giro') {
    return {
      headers: ['Linha', 'Item', 'SKU', 'Filial', 'Local', 'Grupo', 'Quantidade', 'Valor do estoque', 'Valor do consumo', 'Giro calculado em dias', 'Giro informado em dias', 'Recomendação', 'Motivo'],
      rows: rows.map(row => [row.row, row.item, row.sku, row.branch, row.location, row.group, row.stock, row.stockValue, row.consumption, row.coverage, row.reportedGiro, row.action, row.reason]),
    };
  }
  return {
    headers: ['Linha', 'Item', 'SKU', 'Estoque', 'Vendas 30 dias', 'Prazo dias', 'Cobertura dias', 'Ponto de reposição', 'Recomendação', 'Motivo'],
    rows: rows.map(row => [row.row, row.item, row.sku, row.stock, row.sales, row.lead, row.coverage, row.reorderPoint, row.action, row.reason]),
  };
}

export function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildCsv(data) {
  return '\uFEFF' + [data.headers, ...data.rows].map(row => row.map(csvField).join(';')).join('\r\n');
}
