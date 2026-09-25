import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeAnalitico, analyzeGiro, detectAnalysisMode, parseNumber, suggestMapping, summarizeLocationTotal } from '../src/analysis.js';
import { locationOptions } from '../src/dashboard.js';
import { selectDataRows, parseCsv } from '../src/import.js';
import { buildCsv, buildExportData } from '../src/export-data.js';

test('números em texto seguem o formato escolhido sem descartar caracteres inválidos', () => {
  for (const value of ['abc12', '1e3', '1 2', '1.23.456', '12,34,56', '', '--1', '#DIV/0!', true, Infinity]) {
    assert.equal(parseNumber(value), null, String(value));
  }
  assert.equal(parseNumber('1.234'), 1234);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('R$\u00a01.234,56'), 1234.56);
  assert.equal(parseNumber('-1.234,50'), -1234.5);
  assert.equal(parseNumber('1.234', 'en-US'), 1.234);
  assert.equal(parseNumber('1,234.56', 'en-US'), 1234.56);
  assert.equal(parseNumber('1,234.56'), null);
  assert.equal(parseNumber(1.234), 1.234);
});

test('valores malformados recebem revisão nos três modos de análise', () => {
  const generic = suggestMapping(['Produto', 'Estoque', 'Vendas', 'Lead']);
  assert.equal(analyze([['A', 'abc12', 30, 7]], generic, {})[0].action, 'Verificar dados');
  assert.equal(analyze([['A', 5, 30, 'abc7']], generic, {})[0].action, 'Verificar dados');
  assert.equal(analyze([['A', '1.234', 30, '']], generic, {})[0].stock, 1234);
  assert.equal(analyze([['A', '1.234', 30, '']], generic, { numberFormat: 'en-US' })[0].stock, 1.234);
  const giro = suggestMapping(['Produto', 'Valor do estoque', 'Valor do consumo']);
  assert.equal(analyzeGiro([['A', 'abc12', 30]], giro, {})[0].action, 'Verificar dados');
  assert.equal(analyzeGiro([['A', 12, 'abc30']], giro, {})[0].action, 'Verificar dados');
  const analitico = suggestMapping(['Nm Item', 'Qtde Atual', 'Itens Acima de 90 dias']);
  assert.equal(analyzeAnalitico([['A', 'abc12', 'Sem Saldo']], analitico)[0].action, 'Verificar dados');
});

test('filtra apenas vazios e totais explícitos, mantendo a linha original e registros incompletos', () => {
  const mapping = suggestMapping(['Produto', 'Codigo', 'Estoque']);
  const rows = [['Relatório'], ['Produto', 'Codigo', 'Estoque'], ['A', '1', 2], [], ['', '2', 99], ['', '', 20], ['Total', '', 121], ['Subtotal', 'sku-real', 1], ['B', '3', 5]];
  assert.deepEqual(selectDataRows(rows, mapping, 2).map(entry => entry.row), [3, 5, 6, 8, 9]);
});

test('valor monetário extra não altera o modo de estoque e vendas', () => {
  assert.equal(detectAnalysisMode(suggestMapping(['Produto', 'Estoque', 'Vendas', 'Valor do estoque'])), 'generic');
  assert.equal(detectAnalysisMode(suggestMapping(['Produto', 'Valor do estoque', 'Valor do consumo'])), 'giro');
  assert.equal(detectAnalysisMode(suggestMapping(['Produto', 'Itens Acima de 90 dias'])), 'analitico');
});

test('locais vazios usam a descrição disponível e o código zero continua válido', () => {
  const rows = [{ localCode: '', location: 'Filial A', stockValue: 20 }, { localCode: 0, location: 'Reserva', stockValue: 10 }];
  assert.deepEqual(locationOptions(rows), ['0', 'Filial A']);
  assert.equal(summarizeLocationTotal(rows, '0'), 10);
  assert.equal(summarizeLocationTotal(rows, 'Filial A'), 20);
});

test('CSV neutraliza fórmulas em texto e mantém números e separadores brasileiros', () => {
  const dangerous = ['=1+1', '+1+1', '-1+1', '@SUM(A1)', ' \t=1+1', '\ttexto', '\r=1+1', '\n=1+1'];
  const csv = buildCsv({ headers: ['Texto', 'Número'], rows: dangerous.map(value => [value, -1.25]) });
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''), ';');
  assert.deepEqual(rows.slice(1).map(row => row[0]), dangerous.map(value => "'" + value));
  assert.ok(rows.slice(1).every(row => row[1] === '-1,25'));
  const ordinary = 'Peça; "especial"\nsegunda linha';
  assert.equal(parseCsv(buildCsv({ headers: ['Item'], rows: [[ordinary]] }).slice(1), ';')[1][0], ordinary);
});

test('exportações preservam recomendações, motivos, classificação e origem', () => {
  for (const mode of ['generic', 'giro', 'analitico']) {
    const data = buildExportData([{ sku: '001', item: 'A', action: 'Verificar dados', reason: 'Estoque inválido', classification: 'Sem Saldo', row: 8 }], mode);
    const record = Object.fromEntries(data.headers.map((header, index) => [header, data.rows[0][index]]));
    assert.equal(record[mode === 'analitico' ? 'Ações' : 'Recomendação'], 'Verificar dados');
    assert.equal(record.Motivo, 'Estoque inválido');
    assert.equal(record['Linha na planilha'], 8);
    assert.equal(record['Valor do saldo'], '');
    if (mode === 'analitico') assert.equal(record.Classificação, 'Sem Saldo');
  }
});
