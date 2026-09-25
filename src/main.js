import { importFile } from './import.js?v=20260925-3';
import { ANALITICO_REQUIRED_KEYS, analyze, analyzeAnalitico, analyzeGiro, fields, findHeaderRow, formatNumber, normalizeLocalKey, suggestMapping, summarizeLocationTotal } from './analysis.js?v=20260925-3';
import { actionCounts, filterResults, locationOptions, matchesLocation, paginate, PAGE_SIZE, processInChunks, resetDashboardState } from './dashboard.js?v=20260925-3';
import { buildCsv, buildExportData, currencyNumber, shouldIncludeDaysSince } from './export-data.js?v=20260925-3';
import { renderApp } from './template.js?v=20260925-3';

const app = typeof document !== 'undefined' ? document.querySelector('#app') : null;
const state = { sheets: [], sheet: 0, mapping: {}, allResults: [], results: [], page: 1, locationFilter: '', hiddenOnly: false, fileName: '', importedAt: null };
const ANALITICO_ACTIONS = ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'TRANSFERIR OBSOLETO', 'DESBLOQUEAR', 'ZERAR MIN/MAX', 'Verificar dados'];
const GIRO_ACTIONS = ['Planejar reposição', 'Manter', 'Reduzir compras', 'Avaliar transferência', 'Investigar sem consumo', 'Confirmar saldo', 'Verificar dados'];
const GENERIC_ACTIONS = ['Comprar', 'Manter', 'Avaliar excesso', 'Avaliar sem giro', 'Sem movimento', 'Verificar dados'];
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let refreshRun = 0;
let searchRenderFrame = 0;

function slug(text) { return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export function buildSummaryMarkup({ summaryResults, summaryAllResults, actions, counts, locationFilter, locationTotal }) {
  const summaryCounts = counts ?? actions.map(action => ({ action, count: summaryResults.filter(row => row.action === action).length }));
  const localTotalCard = locationFilter || summaryAllResults.length > 0
    ? `<div class="summary-card local-total"><div><span>${locationFilter ? 'VALOR DO ESTOQUE NO LOCAL' : 'VALOR TOTAL DO ESTOQUE'}</span><small>Soma da coluna Vl Saldo${locationFilter ? ` · Local ${escapeHtml(locationFilter)}` : ''}</small></div><strong>${realCurrency(locationTotal)}</strong></div>`
    : '';

  return [
    `<button type="button" class="summary-card total summary-filter" data-summary-clear aria-pressed="false"><span>ITENS NO PAINEL</span><strong>${summaryResults.length}</strong></button>`,
    ...summaryCounts.map(({ action, count }) => {
      const hiddenCard = action === 'Itens ocultos';
      const attribute = hiddenCard ? 'data-summary-hidden' : `data-summary-action="${escapeHtml(action)}"`;
      return `<button type="button" class="summary-card summary-filter ${slug(action)}${count === 0 ? ' is-empty' : ''}" ${attribute} aria-pressed="false"><span>${escapeHtml(action.toUpperCase())}</span><strong>${count}</strong></button>`;
    }),
    localTotalCard,
  ].filter(Boolean).join('');
}

function realCurrency(value) {
  const numeric = Number(value) || 0;
  return BRL_FORMATTER.format(numeric);
}
function itemCurrency(value) { return value === null || value === undefined ? '—' : BRL_FORMATTER.format(value); }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

if (app) app.innerHTML = renderApp();

const el = typeof document !== 'undefined' ? selector => document.querySelector(selector) : () => null;
if (typeof document !== 'undefined') {
  function setTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    el('#theme-toggle').textContent = dark ? '☀ Modo claro' : '☾ Modo escuro';
    el('#theme-toggle').setAttribute('aria-pressed', String(dark));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#080e17' : '#0b1725');
  }
  try { setTheme(localStorage.getItem('giro-estoque-theme')); } catch { setTheme('light'); }
  function setDensity(compact) {
    document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
    el('#density-toggle').textContent = compact ? 'Modo confortável' : 'Modo compacto';
    el('#density-toggle').setAttribute('aria-pressed', String(compact));
  }
  try { setDensity(localStorage.getItem('controle-estoque-density') === 'compact'); } catch { setDensity(false); }
  function message(text, tone = '') {
    const type = tone === true ? 'error' : tone;
    el('#message').textContent = text;
    el('#message').className = text ? `message${type ? ` ${type}` : ''}` : '';
  }
  function setConfigExpanded(expanded) {
    el('#config-grid').hidden = !expanded;
    el('#config-toggle').setAttribute('aria-expanded', String(expanded));
    el('#config-toggle').textContent = expanded ? 'Fechar configuração ▴' : 'Abrir configuração ▾';
  }
  function currentSheet() { return state.sheets[state.sheet]; }
  function renderImportContext() {
    if (!state.fileName || !currentSheet()) { el('#import-context').textContent = ''; return; }
    const importedAt = state.importedAt?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? '';
    el('#import-context').innerHTML = `<span><strong>Arquivo:</strong> ${escapeHtml(state.fileName)}</span><span><strong>Aba:</strong> ${escapeHtml(currentSheet().name)}</span>${importedAt ? `<span><strong>Importado às:</strong> ${escapeHtml(importedAt)}</span>` : ''}`;
  }
  function dataRows() { return currentSheet().rows.slice(currentSheet().headerRow + 1).filter(row => row.some(value => String(value ?? '').trim()) && (state.mapping.item < 0 || String(row[state.mapping.item] ?? '').trim())); }

  function isMapped(key) { return state.mapping[key] >= 0; }
  function isGiroMode() { return isMapped('stockValue') || isMapped('consumption'); }
  function isAnaliticoMode() { return isMapped('classification') || (isMapped('daysSince') && isMapped('blockReason')); }
  function requiredKeys() {
    if (isAnaliticoMode()) return ANALITICO_REQUIRED_KEYS;
    if (isGiroMode()) return ['item', 'stockValue', 'consumption'];
    return ['item', 'stock', 'sales'];
  }
  function renderSettings() {
    el('#criteria-panel').hidden = isAnaliticoMode();
    el('.config-grid').classList.toggle('single-panel', isAnaliticoMode());
    if (isAnaliticoMode()) return;
    const giro = isGiroMode();
    el('#criteria-intro').textContent = giro ? 'Limites sugeridos para decidir o que fazer com o giro. Ajuste conforme sua política de estoque.' : 'Limites provisórios para estoque e vendas dos últimos 30 dias.';
    el('#settings-grid').innerHTML = giro
      ? '<label>Cobertura curta até (dias)<input id="short-days" type="number" min="0" step="1" value="30"></label><label>Reduzir compras acima de (dias)<input id="excess-days" type="number" min="1" step="1" value="90"></label><label>Avaliar transferência acima de (dias)<input id="long-days" type="number" min="1" step="1" value="365"></label>'
      : '<label>Dias de segurança<input id="safety-days" type="number" min="0" step="1" value="7"></label><label>Excesso após (dias)<input id="excess-days" type="number" min="1" step="1" value="90"></label><label>Prazo padrão (dias)<input id="default-lead" type="number" min="0" step="1" value="7"></label>';
    el('#formula-note').textContent = giro ? 'Giro em dias = valor do estoque ÷ valor do consumo × 30. Sem consumo, o giro é indefinido.' : 'Média diária = vendas ÷ 30 · Ponto de reposição = média diária × (prazo + segurança)';
    el('#settings-grid').querySelectorAll('input').forEach(input => input.addEventListener('input', refresh));
  }

  function renderMapping() {
    const headers = currentSheet().rows[currentSheet().headerRow] || [];
    const required = new Set(requiredKeys());
    el('#mapping').innerHTML = `<label class="sheet-select">Aba<select id="sheet-select">${state.sheets.map((sheet, i) => `<option value="${i}" ${i === state.sheet ? 'selected' : ''}>${escapeHtml(sheet.name)}</option>`).join('')}</select></label>` + fields.map(field => `<label>${field.label}${required.has(field.key) ? ' <span class="required">*</span>' : ''}<select data-map="${field.key}"><option value="-1">Não selecionar</option>${headers.map((header, i) => `<option value="${i}" ${state.mapping[field.key] === i ? 'selected' : ''}>${escapeHtml(header || `Coluna ${i + 1}`)}</option>`).join('')}</select></label>`).join('');
    el('#sheet-select').addEventListener('change', event => { state.sheet = Number(event.target.value); state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []); renderImportContext(); renderMapping(); renderSettings(); refresh(); });
    el('#mapping').querySelectorAll('[data-map]').forEach(select => select.addEventListener('change', () => {
      state.mapping[select.dataset.map] = Number(select.value);
      renderMapping();
      renderSettings();
      refresh();
    }));
  }

  async function refresh({ reanalyze = true } = {}) {
    const run = reanalyze ? ++refreshRun : refreshRun;
    const analitico = isAnaliticoMode();
    const giro = !analitico && isGiroMode();
    const required = new Set(requiredKeys());
    const missing = fields.filter(field => required.has(field.key) && !isMapped(field.key));
    if (missing.length) { state.results = []; el('#results-section').hidden = true; setConfigExpanded(true); message(`Selecione as colunas: ${missing.map(field => field.label).join(', ')}.`, true); return; }
    const selected = fields.map(field => state.mapping[field.key]).filter(value => value >= 0);
    if (new Set(selected).size !== selected.length) { state.results = []; el('#results-section').hidden = true; setConfigExpanded(true); message('Cada dado deve usar uma coluna diferente.', true); return; }
    if (reanalyze) {
      const rows = dataRows();
      const analyzeChunk = analitico
        ? (chunk, firstRow) => analyzeAnalitico(chunk, state.mapping, firstRow)
        : giro
          ? (chunk, firstRow) => analyzeGiro(chunk, state.mapping, { shortDays: el('#short-days').value, excessDays: el('#excess-days').value, longDays: el('#long-days').value }, firstRow)
          : (chunk, firstRow) => analyze(chunk, state.mapping, { safetyDays: el('#safety-days').value, excessDays: el('#excess-days').value, defaultLead: el('#default-lead').value }, firstRow);
      if (rows.length > 1000) message(`Analisando ${rows.length.toLocaleString('pt-BR')} linhas...`);
      const analyzed = await processInChunks(rows, analyzeChunk, {
        firstRow: currentSheet().headerRow + 2,
        onProgress: rows.length > 1000 ? (processed, total) => {
          if (run === refreshRun) message(`Analisando ${processed.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} linhas...`);
        } : undefined,
      });
      if (run !== refreshRun) return;
      state.allResults = analyzed;
    }
    state.results = analitico && !el('#show-hidden').checked ? state.allResults.filter(row => !row.hidden) : state.allResults;
    el('#hidden-toggle').hidden = !analitico;
    el('#results-section').hidden = false;
    const previousLocation = normalizeLocalKey(state.locationFilter);
    const locationValues = locationOptions(state.allResults);
    state.locationFilter = previousLocation
      ? locationValues.find(value => normalizeLocalKey(value) === previousLocation) ?? ''
      : '';
    el('#location-filter').innerHTML = '<option value="">Todos os locais</option>' + locationValues.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    el('#location-filter').value = state.locationFilter;

    const summaryResults = state.results.filter(row => matchesLocation(row, state.locationFilter));
    const summaryAllResults = state.allResults.filter(row => matchesLocation(row, state.locationFilter));
    const actions = analitico ? ANALITICO_ACTIONS : giro ? GIRO_ACTIONS : GENERIC_ACTIONS;
    const counts = analitico
      ? [...actionCounts(summaryResults, actions, true), { action: 'Itens ocultos', count: summaryAllResults.filter(row => row.hidden).length }]
      : actionCounts(summaryResults, actions, false);
    const locationTotal = summarizeLocationTotal(state.allResults, state.locationFilter);
    const previousFilter = el('#filter').value;
    el('#summary').innerHTML = buildSummaryMarkup({
      summaryResults,
      summaryAllResults,
      actions: analitico ? [...ANALITICO_ACTIONS, 'Itens ocultos'] : giro ? GIRO_ACTIONS : GENERIC_ACTIONS,
      counts,
      locationFilter: state.locationFilter,
      locationTotal,
    });
    el('#filter').innerHTML = `<option value="">${analitico ? 'Todas as ações' : 'Todas as recomendações'}</option>` + actions.map(action => `<option>${escapeHtml(action)}</option>`).join('');
    if (actions.includes(previousFilter)) el('#filter').value = previousFilter;
    el('#filter').setAttribute('aria-label', 'Filtrar ação');
    el('#result-table').className = analitico ? 'analitico-table' : 'standard-table';
    const headings = analitico
      ? ['ITEM / CÓDIGO', 'QTD. ATUAL', 'MÍN. / MÁX.', 'GIRO', 'CLASSIFICAÇÃO', 'AÇÃO', 'OUTROS DADOS']
      : giro
        ? ['ITEM / FILIAL', 'ESTOQUE (R$)', 'CONSUMO (R$)', 'GIRO', 'RECOMENDAÇÃO', 'MOTIVO']
        : ['ITEM', 'ESTOQUE', 'VENDAS / 30D', 'COBERTURA', 'RECOMENDAÇÃO', 'MOTIVO'];
    el('#table-head').innerHTML = `<tr>${headings.map(heading => `<th scope="col">${heading}</th>`).join('')}</tr>`;
    const reviewCount = state.results.filter(row => row.action === 'Verificar dados').length;
    message(reviewCount ? `${reviewCount} ${reviewCount === 1 ? 'linha precisa' : 'linhas precisam'} de revisão. Consulte “Outros dados” para corrigir a planilha.` : '', reviewCount ? 'warning' : '');
    renderResults();
  }

  function actionIcon(action) {
    const normalized = String(action).toUpperCase();
    if (normalized.includes('VERIFICAR') || normalized.includes('CONFIRMAR') || normalized.includes('INVESTIGAR')) return '!';
    if (normalized.includes('DESBLOQUEAR')) return '↗';
    if (normalized.includes('ZERAR')) return '0';
    if (normalized.includes('TRANSFERIR')) return '→';
    if (normalized.includes('BLOQUEAR')) return '⊘';
    if (normalized.includes('COMPRAR') || normalized.includes('REPOSIÇÃO')) return '+';
    if (normalized.includes('REDUZIR')) return '−';
    if (normalized.includes('MANTER')) return '✓';
    return '•';
  }
  function badgeHtml(action) {
    return `<span class="badge ${slug(action)}"><span class="badge-icon" aria-hidden="true">${actionIcon(action)}</span>${escapeHtml(action)}</span>`;
  }
  function detailsHtml(reason) {
    if (!reason) return '<span class="no-details">—</span>';
    return `<details class="row-details"><summary>Ver detalhes</summary><p>${escapeHtml(reason)}</p></details>`;
  }
  function visibleResults() {
    return filterResults(state.results, {
      query: el('#search').value,
      action: el('#filter').value,
      location: state.locationFilter,
      analitico: isAnaliticoMode(),
      hiddenOnly: state.hiddenOnly,
    });
  }
  function updateSummarySelection() {
    const selectedAction = el('#filter').value;
    el('#summary').querySelectorAll('.summary-filter').forEach(card => {
      const selected = card.hasAttribute('data-summary-hidden')
        ? state.hiddenOnly
        : card.hasAttribute('data-summary-clear')
          ? !selectedAction && !state.hiddenOnly
          : card.dataset.summaryAction === selectedAction && !state.hiddenOnly;
      card.classList.toggle('is-active', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }
  function renderActiveFilters(filteredCount) {
    const parts = [];
    const query = el('#search').value.trim();
    if (state.locationFilter) parts.push(`Local ${state.locationFilter}`);
    if (el('#filter').value) parts.push(el('#filter').value);
    if (query) parts.push(`Busca: “${query}”`);
    if (state.hiddenOnly) parts.push('Somente itens ocultos');
    else if (el('#show-hidden').checked && isAnaliticoMode()) parts.push('Itens ocultos incluídos');
    el('#active-filters').hidden = parts.length === 0;
    el('#active-filters-text').textContent = parts.length ? `${parts.join(' · ')} · ${filteredCount} ${filteredCount === 1 ? 'item' : 'itens'}` : '';
  }
  function renderResults() {
    const query = el('#search').value.trim().toLowerCase();
    const filter = el('#filter').value;
    const analitico = isAnaliticoMode();
    const giro = !analitico && isGiroMode();
    const filtered = visibleResults();
    const page = paginate(filtered, state.page, PAGE_SIZE);
    state.page = page.page;
    const { pageCount, start, rows: visible } = page;
    el('#result-rows').innerHTML = visible.length ? visible.map(row => `<tr class="${row.hidden ? 'hidden-item' : ''}"><td><strong>${escapeHtml(row.item || `Linha ${row.row}`)}${row.hidden ? ' <span class="hidden-indicator">Oculto</span>' : ''}</strong><small>${escapeHtml([row.sku, row.branch, row.location, row.localCode && `Local ${row.localCode}`].filter(Boolean).join(' · ') || `Linha ${row.row}`)}</small></td><td>${giro ? itemCurrency(row.stockValue) : formatNumber(row.stock)}</td><td>${analitico ? `${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}` : giro ? itemCurrency(row.consumption) : formatNumber(row.sales)}</td><td>${row.coverage === null ? '—' : `${formatNumber(row.coverage)} dias`}</td>${analitico ? `<td>${escapeHtml(row.classification)}</td>` : ''}<td>${analitico ? row.actions.map(badgeHtml).join(' ') : badgeHtml(row.action)}</td><td class="reason">${detailsHtml(row.reason)}</td></tr>`).join('') : `<tr><td class="empty-row" colspan="${analitico ? 7 : 6}">Nenhum item encontrado.</td></tr>`;
    const itemLabel = filtered.length === 1 ? 'item' : 'itens';
    const filterLabel = query || filter || state.locationFilter || state.hiddenOnly ? filtered.length === 1 ? ' filtrado' : ' filtrados' : '';
    el('#page-status').textContent = filtered.length ? `${start + 1}–${start + visible.length} de ${filtered.length} ${itemLabel}${filterLabel}` : 'Nenhum item encontrado';
    el('#filtered-count').textContent = `${filtered.length.toLocaleString('pt-BR')} de ${state.allResults.length.toLocaleString('pt-BR')} ${state.allResults.length === 1 ? 'item' : 'itens'}`;
    el('#pagination').hidden = pageCount <= 1;
    el('#page-label').textContent = `Página ${state.page} de ${pageCount}`;
    el('#page-previous').disabled = state.page === 1;
    el('#page-next').disabled = state.page === pageCount;
    updateSummarySelection();
    renderActiveFilters(filtered.length);
  }

  function exportData() {
    const mode = isAnaliticoMode() ? 'analitico' : isGiroMode() ? 'giro' : 'generic';
    return buildExportData(visibleResults(), mode, {
      includeDaysSince: shouldIncludeDaysSince(mode, el('#filter').value),
    });
  }
  function exportName(extension) {
    const action = slug(el('#filter').value || 'todas-as-acoes');
    const local = state.locationFilter ? `-local-${slug(state.locationFilter)}` : '';
    return `controle-estoque-${action}${local}.${extension}`;
  }
  function saveBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCsv() {
    const content = buildCsv(exportData());
    saveBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), exportName('csv'));
  }
  async function exportXlsx() {
    if (!globalThis.ExcelJS) throw new Error('A biblioteca de Excel não foi carregada. Recarregue a página.');
    const { headers, rows } = exportData();
    const workbook = new globalThis.ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Itens filtrados');
    sheet.columns = headers.map((header, index) => ({
      key: `col${index}`,
      width: Math.min(42, Math.max(12, header.length + 3)),
    }));
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2B3A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF2B3A4A' } },
        left: { style: 'thin', color: { argb: 'FF2B3A4A' } },
        bottom: { style: 'thin', color: { argb: 'FF2B3A4A' } },
        right: { style: 'thin', color: { argb: 'FF2B3A4A' } },
      };
      cell.numFmt = '@';
      cell.value = String(cell.value ?? '');
    });
    rows.forEach((row, rowIndex) => {
      const dataRow = sheet.addRow(row);
      dataRow.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1] ?? '';
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (rowIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        if (['Valor unitário', 'Valor do saldo'].includes(header)) {
          cell.value = currencyNumber(cell.value);
          cell.numFmt = header === 'Valor unitário' ? '[$R$-pt-BR] #,##0.0000' : '[$R$-pt-BR] #,##0.00';
        }
      });
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 2), column: headers.length } };
    const buffer = await workbook.xlsx.writeBuffer();
    saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportName('xlsx'));
  }
  function exportPdf() {
    const analitico = isAnaliticoMode();
    const giro = !analitico && isGiroMode();
    const rows = visibleResults();
    const hasAddress = rows.some(row => row.address || row.itemAddress || row.endereco);
    const includeDaysSince = shouldIncludeDaysSince(analitico ? 'analitico' : giro ? 'giro' : 'generic', el('#filter').value);
    const columns = analitico
      ? [['Código', row => row.sku], ['Item', row => row.item], ['Cd Prateleira', row => row.shelfCode ?? ''], ['Cd Reparticao', row => row.partitionCode ?? ''], ['Local', row => row.localCode], ['Saldo', row => row.stock], ['Mín./máx.', row => `${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}`], ...(includeDaysSince ? [['Dias desde a última movimentação', row => row.daysSince]] : []), ['Classificação', row => row.classification], ...(hasAddress ? [['Endereço do item', row => row.address ?? row.itemAddress ?? row.endereco ?? '']] : []), ['Ações', row => row.action], ['Outros dados', row => row.reason]]
      : giro
        ? [['SKU', row => row.sku], ['Item', row => row.item], ['Filial', row => row.branch], ['Local', row => row.location], ['Cd Prateleira', row => row.shelfCode ?? ''], ['Cd Reparticao', row => row.partitionCode ?? ''], ['Quantidade', row => row.stock], ['Giro (dias)', row => row.coverage], ...(hasAddress ? [['Endereço do item', row => row.address ?? row.itemAddress ?? row.endereco ?? '']] : []), ['Recomendação', row => row.action], ['Motivo', row => row.reason]]
        : [['SKU', row => row.sku], ['Item', row => row.item], ['Cd Prateleira', row => row.shelfCode ?? ''], ['Cd Reparticao', row => row.partitionCode ?? ''], ['Estoque', row => row.stock], ['Vendas/30 dias', row => row.sales], ['Cobertura', row => row.coverage], ...(hasAddress ? [['Endereço do item', row => row.address ?? row.itemAddress ?? row.endereco ?? '']] : []), ['Recomendação', row => row.action], ['Motivo', row => row.reason]];
    const filter = el('#filter').value || 'Todas as ações';
    const search = el('#search').value.trim();
    const local = state.locationFilter ? ` · Local: ${escapeHtml(state.locationFilter)}` : '';
    el('#print-report').innerHTML = `<h1>Controle de Estoque</h1><p>Ação: ${escapeHtml(filter)}${local}${search ? ` · Busca: ${escapeHtml(search)}` : ''} · ${rows.length} ${rows.length === 1 ? 'item' : 'itens'}</p><table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, value]) => `<td>${escapeHtml(value(row) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    window.print();
  }

  async function loadFile(file) {
    if (!file) return;
    message('Lendo planilha...');
    upload.setAttribute('aria-busy', 'true');
    upload.classList.add('loading');
    try {
      state.sheets = (await importFile(file)).map(sheet => ({ ...sheet, headerRow: findHeaderRow(sheet.rows) }));
      if (!state.sheets.length || !state.sheets.some(sheet => sheet.rows.length > sheet.headerRow + 1)) throw new Error('Não encontrei linhas de dados na planilha.');
      state.sheet = state.sheets.findIndex(sheet => sheet.rows.length > sheet.headerRow + 1);
      state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []);
      el('#show-hidden').checked = false;
      el('#search').value = '';
      el('#filter').value = '';
      resetDashboardState(state);
      state.fileName = file.name;
      state.importedAt = new Date();
      setConfigExpanded(false);
      el('#file-name').textContent = file.name;
      el('#workspace').hidden = false;
      el('.shell').classList.add('has-data');
      renderImportContext(); renderMapping(); renderSettings(); await refresh();
    } catch (error) { message(error.message || 'Não foi possível abrir o arquivo.', true); }
    finally { upload.removeAttribute('aria-busy'); upload.classList.remove('loading'); }
  }

  el('#file-input').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; loadFile(file); });
  const upload = el('#upload-card');
  const fileButton = upload.querySelector('.primary-button');
  fileButton.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    el('#file-input').click();
  });
  upload.addEventListener('dragover', event => { event.preventDefault(); upload.classList.add('dragging'); });
  upload.addEventListener('dragleave', () => upload.classList.remove('dragging'));
  upload.addEventListener('drop', event => { event.preventDefault(); upload.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]); });
  el('#search').addEventListener('input', () => {
    state.page = 1;
    cancelAnimationFrame(searchRenderFrame);
    searchRenderFrame = requestAnimationFrame(renderResults);
  });
  el('#filter').addEventListener('change', () => { state.page = 1; state.hiddenOnly = false; renderResults(); });
  el('#location-filter').addEventListener('change', () => {
    state.locationFilter = el('#location-filter').value;
    state.page = 1;
    refresh({ reanalyze: false });
  });
  function changePage(direction) {
    state.page += direction;
    renderResults();
    el('.table-tools').scrollIntoView({ block: 'start' });
  }
  el('#page-previous').addEventListener('click', () => changePage(-1));
  el('#page-next').addEventListener('click', () => changePage(1));
  el('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
    try { localStorage.setItem('giro-estoque-theme', theme); } catch { /* A escolha vale até fechar a página. */ }
  });
  el('#density-toggle').addEventListener('click', () => {
    const compact = document.documentElement.dataset.density !== 'compact';
    setDensity(compact);
    try { localStorage.setItem('controle-estoque-density', compact ? 'compact' : 'comfortable'); } catch { /* A escolha vale até fechar a página. */ }
  });
  el('#config-toggle').addEventListener('click', () => setConfigExpanded(el('#config-grid').hidden));
  el('#show-hidden').addEventListener('change', () => {
    state.page = 1;
    if (!el('#show-hidden').checked) state.hiddenOnly = false;
    refresh({ reanalyze: false });
  });
  el('#summary').addEventListener('click', event => {
    const card = event.target.closest('.summary-filter');
    if (!card) return;
    state.page = 1;
    if (card.hasAttribute('data-summary-hidden')) {
      state.hiddenOnly = true;
      el('#show-hidden').checked = true;
      el('#filter').value = '';
      refresh({ reanalyze: false });
      return;
    }
    state.hiddenOnly = false;
    el('#filter').value = card.dataset.summaryAction ?? '';
    renderResults();
  });
  el('#clear-filters').addEventListener('click', () => {
    state.page = 1;
    state.locationFilter = '';
    state.hiddenOnly = false;
    el('#search').value = '';
    el('#filter').value = '';
    el('#show-hidden').checked = false;
    refresh({ reanalyze: false });
  });
  el('#export-menu').querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
    el('#export-menu').open = false;
    el('#export-menu summary').focus();
    try {
      if (button.dataset.export === 'xlsx') await exportXlsx();
      else if (button.dataset.export === 'pdf') exportPdf();
      else exportCsv();
    } catch (error) { message(error.message || 'Não foi possível exportar os itens.', true); }
  }));
  document.addEventListener('click', event => { if (!el('#export-menu').contains(event.target)) el('#export-menu').open = false; });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !el('#export-menu').open) return;
    el('#export-menu').open = false;
    el('#export-menu summary').focus();
  });
}
