import { importFile, selectDataRows } from './import.js';
import { ANALITICO_REQUIRED_KEYS, analyze, analyzeAnalitico, analyzeGiro, detectAnalysisMode, fields, findHeaderRow, formatNumber, normalizeLocalKey, stockLocation, suggestMapping, summarizeLocationTotal } from './analysis.js';
import { actionCounts, dataIssueSummary, filterResults, locationOptions, matchesLocation, paginate, PAGE_SIZE, prioritizeActionCounts, processInChunks, resetDashboardState, sortResults } from './dashboard.js';
import { buildCsv, buildExportData, currencyNumber, shouldIncludeDaysSince } from './export-data.js';
import { renderApp } from './template.js';
import { svgIcon } from './icons.js';

const app = typeof document !== 'undefined' ? document.querySelector('#app') : null;
const state = {
  sheets: [], sheet: 0, mapping: {}, allResults: [], results: [],
  page: 1, locationFilter: '', hiddenOnly: false, fileName: '', importedAt: null,
  mode: 'auto',
  numberFormat: 'pt-BR',
  sortKey: '',
  sortDirection: 'asc',
  columns: [],
  pendingActionFilter: '',
  settings: {
    generic: { safetyDays: '7', excessDays: '90', defaultLead: '7' },
    giro: { shortDays: '30', excessDays: '90', longDays: '365' },
  },
};
export const ANALITICO_ACTIONS = ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'TRANSFERIR OBSOLETO', 'DESBLOQUEAR', 'ZERAR MIN/MAX', 'Sem ação definida', 'Verificar dados'];
const GIRO_ACTIONS = ['Planejar reposição', 'Manter', 'Reduzir compras', 'Avaliar transferência', 'Investigar sem consumo', 'Confirmar saldo', 'Verificar dados'];
const GENERIC_ACTIONS = ['Comprar', 'Manter', 'Avaliar excesso', 'Avaliar sem giro', 'Sem movimento', 'Verificar dados'];
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let refreshRun = 0;
let searchRenderFrame = 0;
let importRun = 0;

function slug(text) { return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export function buildSummaryMarkup({ summaryResults, summaryAllResults, actions, counts, locationFilter, locationTotal }) {
  const summaryCounts = prioritizeActionCounts(counts ?? actions.map(action => ({ action, count: summaryResults.filter(row => row.action === action).length })));
  const localTotalCard = locationFilter || summaryAllResults.length > 0
    ? `<div class="summary-card local-total"><div><span>${locationFilter ? 'VALOR DO ESTOQUE NO LOCAL' : 'VALOR TOTAL DO ESTOQUE'}</span><small>Soma da coluna Vl Saldo${locationFilter ? ` · Local ${escapeHtml(locationFilter)}` : ''}</small></div><strong>${realCurrency(locationTotal)}</strong></div>`
    : '';

  return [
    `<button type="button" class="summary-card total summary-filter" data-summary-clear aria-pressed="false"><span>ITENS NO PAINEL</span><strong>${summaryResults.length}</strong></button>`,
    ...summaryCounts.filter(({ count }) => count > 0).map(({ action, count }) => {
      const hiddenCard = action === 'Itens ocultos';
      const attribute = hiddenCard ? 'data-summary-hidden' : `data-summary-action="${escapeHtml(action)}"`;
      const total = hiddenCard ? summaryAllResults.length : summaryResults.length;
      const percentage = total ? Math.round((count / total) * 100) : 0;
      return `<button type="button" class="summary-card summary-filter ${slug(action)}" ${attribute} aria-pressed="false"><span>${escapeHtml(action.toUpperCase())}</span><div class="summary-value"><strong>${count}</strong><small>${percentage}% ${hiddenCard ? 'do total' : 'do painel'}</small></div></button>`;
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
  let deferredInstallPrompt = null;
  const installButton = el('#install-app');

  function setInstallButton(visible) {
    if (!installButton) return;
    const standalone = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;
    installButton.hidden = !visible || standalone;
  }

  setInstallButton(true);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');

        await registration.update();
      } catch {
        /* O app continua funcionando mesmo sem service worker. */
      }
    });
  }

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;

      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallButton(false);
      }
      deferredInstallPrompt = null;
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallButton(true);
  });

  window.addEventListener('appinstalled', () => {
    setInstallButton(false);
  });

  function setTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.classList.add('theme-switching');
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const toggle = el('#theme-toggle');
    toggle.innerHTML = `${svgIcon(dark ? 'sun' : 'moon')}<span>${dark ? 'Modo claro' : 'Modo escuro'}</span>`;
    toggle.setAttribute('aria-pressed', String(dark));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#080e17' : '#0b1725');
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-switching')));
  }
  try { setTheme(localStorage.getItem('giro-estoque-theme')); } catch { setTheme('light'); }
  function setDensity(compact) {
    document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
    el('#density-toggle').setAttribute('aria-pressed', String(compact));
  }
  try { setDensity(localStorage.getItem('controle-estoque-density') === 'compact'); } catch { setDensity(false); }
  function message(text, type = '') {
    el('#message').textContent = text;
    el('#message').className = text ? `message${type ? ` ${type}` : ''}` : '';
  }
  const FILTER_STORAGE_KEY = 'controle-estoque-filters';
  function readFilterPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }
  function persistFilters() {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        query: el('#search').value.trim(),
        action: el('#filter').value,
        location: state.locationFilter,
        showHidden: el('#show-hidden').checked,
        hiddenOnly: state.hiddenOnly,
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
      }));
    } catch { /* Os filtros permanecem válidos até fechar a página. */ }
  }
  function resultColumns(analitico, giro) {
    if (analitico) return [
      { label: 'DESCRIÇÃO', key: 'item' },
      { label: 'CÓDIGO', key: 'sku' },
      { label: 'LOCAL', key: 'localCode' },
      { label: 'PRATELEIRA', key: 'shelfCode' },
      { label: 'REPARTIÇÃO', key: 'partitionCode' },
      { label: 'QTD. ATUAL', key: 'stock' },
      { label: 'MÍN. / MÁX', key: 'minimum' },
      { label: 'AÇÃO', key: 'action' },
      { label: 'OUTROS DADOS', key: 'daysSince', sortLabel: 'dias desde a última movimentação' },
    ];
    if (giro) return [
      { label: 'ITEM / FILIAL', key: 'item' },
      { label: 'ESTOQUE (R$)', key: 'stockValue' },
      { label: 'CONSUMO (R$)', key: 'consumption' },
      { label: 'GIRO', key: 'coverage' },
      { label: 'RECOMENDAÇÃO', key: 'action' },
      { label: 'MOTIVO', key: 'reason' },
    ];
    return [
      { label: 'ITEM', key: 'item' },
      { label: 'ESTOQUE', key: 'stock' },
      { label: 'VENDAS / 30D', key: 'sales' },
      { label: 'COBERTURA', key: 'coverage' },
      { label: 'RECOMENDAÇÃO', key: 'action' },
      { label: 'MOTIVO', key: 'reason' },
    ];
  }
  function columnClass(key) {
    const names = { item: 'descricao', sku: 'codigo', localCode: 'local', shelfCode: 'prateleira', partitionCode: 'reparticao', stock: 'estoque', stockValue: 'estoque', sales: 'consumo', consumption: 'consumo', coverage: 'cobertura', minimum: 'limites', action: 'acao', daysSince: 'detalhes', reason: 'detalhes' };
    return `col-${names[key]}`;
  }
  function renderTableHead() {
    el('#table-head').innerHTML = `<tr>${state.columns.map(column => {
      const selected = state.sortKey === column.key;
      const ariaSort = selected ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
      const direction = selected ? (state.sortDirection === 'asc' ? 'decrescente' : 'crescente') : 'crescente';
      return `<th class="${columnClass(column.key)}" scope="col" aria-sort="${ariaSort}"><button type="button" class="sort-button" data-sort-key="${column.key}" aria-label="Ordenar por ${escapeHtml(column.sortLabel || column.label)}, ordem ${direction}">${escapeHtml(column.label)}</button></th>`;
    }).join('')}</tr>`;
  }
  function renderDataQuality(rows) {
    const quality = dataIssueSummary(rows);
    const panel = el('#data-quality');
    panel.hidden = quality.count === 0;
    if (!quality.count) return;
    el('#data-quality-title').textContent = `${quality.count} ${quality.count === 1 ? 'linha precisa' : 'linhas precisam'} de revisão`;
    el('#data-quality-detail').textContent = quality.fields.length
      ? `Campos mais frequentes: ${quality.fields.map(({ field, count }) => `${field} (${count})`).join(' · ')}.`
      : 'Abra “Outros dados” ou “Motivo” para localizar o problema.';
  }
  function renderHiddenContext(hiddenCount) {
    const panel = el('#hidden-context');
    panel.hidden = !isAnaliticoMode() || hiddenCount === 0;
    if (panel.hidden) return;
    const included = el('#show-hidden').checked;
    const subject = hiddenCount === 1 ? 'item ocultado' : 'itens ocultados';
    const inclusion = hiddenCount === 1 ? 'está incluído' : 'estão incluídos';
    el('#hidden-context-text').textContent = `${hiddenCount.toLocaleString('pt-BR')} ${subject} pelas regras${included ? ` ${inclusion} no painel.` : '.'}`;
    el('#toggle-hidden-context').textContent = included ? 'Ocultar novamente' : 'Exibir também';
  }
  function setConfigExpanded(expanded) {
    el('#config-grid').hidden = !expanded;
    el('#config-toggle').setAttribute('aria-expanded', String(expanded));
    el('#config-toggle').innerHTML = `<span>${expanded ? 'Fechar configuração' : 'Abrir configuração'}</span>${svgIcon(expanded ? 'chevronUp' : 'chevronDown')}`;
  }

  const initialMessage = el('#message');
  if (initialMessage) {
    initialMessage.textContent = '';
    initialMessage.className = '';
  }
  function currentSheet() { return state.sheets[state.sheet]; }
  function renderImportContext() {
    if (!state.fileName || !currentSheet()) { el('#import-context').textContent = ''; return; }
    const importedAt = state.importedAt?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? '';
    el('#import-context').innerHTML = `<span><strong>Arquivo:</strong> ${escapeHtml(state.fileName)}</span><span><strong>Aba:</strong> ${escapeHtml(currentSheet().name)}</span>${importedAt ? `<span><strong>Importado às:</strong> ${escapeHtml(importedAt)}</span>` : ''}`;
  }
  function dataRows() { return selectDataRows(currentSheet().rows, state.mapping, currentSheet().headerRow + 1); }

  function isMapped(key) { return state.mapping[key] >= 0; }
  function currentMode() { return state.mode === 'auto' ? detectAnalysisMode(state.mapping) : state.mode; }
  function isGiroMode() { return currentMode() === 'giro'; }
  function isAnaliticoMode() { return currentMode() === 'analitico'; }
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
    const settings = state.settings[giro ? 'giro' : 'generic'];
    el('#criteria-intro').textContent = giro ? 'Limites sugeridos para decidir o que fazer com o giro. Ajuste conforme sua política de estoque.' : 'Limites provisórios para estoque e vendas dos últimos 30 dias.';
    el('#settings-grid').innerHTML = giro
      ? '<label>Cobertura curta até (dias)<input id="short-days" type="number" min="0" step="1" value="30"></label><label>Reduzir compras acima de (dias)<input id="excess-days" type="number" min="1" step="1" value="90"></label><label>Avaliar transferência acima de (dias)<input id="long-days" type="number" min="1" step="1" value="365"></label>'
      : '<label>Dias de segurança<input id="safety-days" type="number" min="0" step="1" value="7"></label><label>Excesso após (dias)<input id="excess-days" type="number" min="1" step="1" value="90"></label><label>Prazo padrão (dias)<input id="default-lead" type="number" min="0" step="1" value="7"></label>';
    el('#formula-note').textContent = giro ? 'Giro em dias = valor do estoque ÷ valor do consumo × 30. Sem consumo, o giro é indefinido.' : 'Média diária = vendas ÷ 30 · Ponto de reposição = média diária × (prazo + segurança)';
    el('#settings-grid').querySelectorAll('input').forEach(input => {
      const key = input.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      input.value = settings[key];
      input.addEventListener('input', () => { settings[key] = input.value; refresh(); });
    });
  }

  function renderMapping() {
    const headers = currentSheet().rows[currentSheet().headerRow] || [];
    const required = new Set(requiredKeys());
    el('#mapping').innerHTML = `<label class="sheet-select">Aba<select id="sheet-select">${state.sheets.map((sheet, i) => `<option value="${i}" ${i === state.sheet ? 'selected' : ''}>${escapeHtml(sheet.name)}</option>`).join('')}</select></label>` + fields.map(field => `<label>${field.label}${required.has(field.key) ? ' <span class="required">*</span>' : ''}<select data-map="${field.key}"><option value="-1">Não selecionar</option>${headers.map((header, i) => `<option value="${i}" ${state.mapping[field.key] === i ? 'selected' : ''}>${escapeHtml(header || `Coluna ${i + 1}`)}</option>`).join('')}</select></label>`).join('');
    el('#mapping').insertAdjacentHTML('afterbegin', '<label>Tipo de análise<select id="analysis-mode"><option value="auto">Automático</option><option value="generic">Estoque e vendas</option><option value="giro">Giro por valor de consumo</option><option value="analitico">Analítico</option></select></label><label>Formato dos números em texto<select id="number-format"><option value="pt-BR">Brasileiro: 1.234,56</option><option value="en-US">Internacional: 1,234.56</option></select></label>');
    el('#analysis-mode').value = state.mode;
    el('#number-format').value = state.numberFormat;
    el('#analysis-mode').addEventListener('change', event => {
      state.mode = event.target.value;
      state.page = 1;
      state.hiddenOnly = false;
      renderMapping(); renderSettings(); refresh();
    });
    el('#number-format').addEventListener('change', event => { state.numberFormat = event.target.value; refresh(); });
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
    if (missing.length) { state.results = []; el('#results-section').hidden = true; setConfigExpanded(true); message(`Selecione as colunas: ${missing.map(field => field.label).join(', ')}.`, 'error'); return; }
    const selected = fields.map(field => state.mapping[field.key]).filter(value => value >= 0);
    if (new Set(selected).size !== selected.length) { state.results = []; el('#results-section').hidden = true; setConfigExpanded(true); message('Cada dado deve usar uma coluna diferente.', 'error'); return; }
    if (reanalyze) {
      const rows = dataRows();
      const mapping = { ...state.mapping };
      const settings = { ...state.settings[currentMode()], numberFormat: state.numberFormat };
      const analyzeChunk = chunk => {
        const cells = chunk.map(entry => entry.cells);
        const results = analitico ? analyzeAnalitico(cells, mapping, 2, settings)
          : giro ? analyzeGiro(cells, mapping, settings) : analyze(cells, mapping, settings);
        return results.map((result, index) => ({ ...result, row: chunk[index].row }));
      };
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
    const counts = prioritizeActionCounts(analitico
      ? [...actionCounts(summaryResults, actions, true), { action: 'Itens ocultos', count: summaryAllResults.filter(row => row.hidden).length }]
      : actionCounts(summaryResults, actions, false));
    const availableActions = counts.filter(({ action, count }) => action !== 'Itens ocultos' && count > 0).map(({ action }) => action);
    const hiddenCount = summaryAllResults.filter(row => row.hidden).length;
    const locationTotal = summarizeLocationTotal(state.allResults, state.locationFilter);
    const previousFilter = state.pendingActionFilter || el('#filter').value;
    state.pendingActionFilter = '';
    el('#summary').innerHTML = buildSummaryMarkup({
      summaryResults,
      summaryAllResults,
      actions: analitico ? [...ANALITICO_ACTIONS, 'Itens ocultos'] : giro ? GIRO_ACTIONS : GENERIC_ACTIONS,
      counts,
      locationFilter: state.locationFilter,
      locationTotal,
    });
    el('#filter').innerHTML = `<option value="">${analitico ? 'Todas as ações' : 'Todas as recomendações'}</option>` + availableActions.map(action => `<option>${escapeHtml(action)}</option>`).join('');
    el('#filter').value = availableActions.includes(previousFilter) ? previousFilter : '';
    el('#filter').setAttribute('aria-label', 'Filtrar ação');
    el('#result-table').className = analitico ? 'analitico-table' : 'standard-table';
    state.columns = resultColumns(analitico, giro);
    if (!state.columns.some(column => column.key === state.sortKey)) {
      state.sortKey = '';
      state.sortDirection = 'asc';
    }
    renderTableHead();
    renderDataQuality(summaryResults);
    renderHiddenContext(hiddenCount);
    message('');
    renderResults();
    persistFilters();
  }

  function actionIcon(action) {
    const normalized = String(action).toUpperCase();
    if (normalized.includes('VERIFICAR') || normalized.includes('CONFIRMAR') || normalized.includes('INVESTIGAR')) return 'alert';
    if (normalized.includes('DESBLOQUEAR')) return 'unlock';
    if (normalized.includes('ZERAR')) return 'zero';
    if (normalized.includes('TRANSFERIR')) return 'transfer';
    if (normalized.includes('BLOQUEAR')) return 'block';
    if (normalized.includes('COMPRAR') || normalized.includes('REPOSIÇÃO')) return 'plus';
    if (normalized.includes('REDUZIR')) return 'minus';
    if (normalized.includes('MANTER')) return 'check';
    return 'dot';
  }
  function urgentAction(action) {
    return ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'VERIFICAR DADOS'].includes(String(action).toUpperCase());
  }
  function badgeHtml(action) {
    return `<span class="badge ${slug(action)}${urgentAction(action) ? ' urgent-action' : ''}"><span class="badge-icon" aria-hidden="true">${svgIcon(actionIcon(action), 'badge-svg')}</span><span class="badge-label">${escapeHtml(action)}</span></span>`;
  }
  const expandedRows = new Set();
  let expansionVersion = 0;
  let descriptionFrame = 0;
  function expansionAttributes(row, type) {
    const key = `${expansionVersion}:${state.sheet}:${currentMode()}:${row.row}:${type}`;
    return `data-expansion-key="${key}"${expandedRows.has(key) ? ' open' : ''}`;
  }
  function rememberExpansions() {
    el('#result-rows').querySelectorAll('[data-expansion-key]').forEach(details => {
      const key = details.dataset.expansionKey;
      if (!key.startsWith(`${expansionVersion}:`)) return;
      if (details.open) expandedRows.add(key);
      else expandedRows.delete(key);
    });
  }
  function descriptionHtml(row) {
    const attributes = expansionAttributes(row, 'description');
    const expanded = attributes.endsWith(' open');
    return `<details class="item-description${expanded ? ' is-expandable' : ''}" ${attributes}><summary><strong>${escapeHtml(row.item || `Linha ${row.row}`)}</strong></summary></details>`;
  }
  function updateDescriptionControls() {
    const measurements = [...el('#result-rows').querySelectorAll('.item-description:not([open])')].map(details => {
      const text = details.querySelector('strong');
      return { details, expandable: text.scrollHeight > text.clientHeight + 1 };
    });
    measurements.forEach(({ details, expandable }) => details.classList.toggle('is-expandable', expandable));
  }
  function scheduleDescriptionControls() {
    if (descriptionFrame) return;
    descriptionFrame = requestAnimationFrame(() => {
      descriptionFrame = 0;
      updateDescriptionControls();
    });
  }
  const descriptionObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleDescriptionControls) : null;
  document.fonts?.ready.then(scheduleDescriptionControls);
  function detailsHtml(reason, row) {
    if (!reason) return '<span class="no-details">—</span>';
    const entries = [];
    if (isAnaliticoMode()) {
      const elapsed = row.daysSince === null || row.daysSince === undefined ? '' : `${formatNumber(row.daysSince)} dias desde a última requisição`;
      if (row.lastRequest) entries.push(['Última requisição', row.lastRequest]);
      if (elapsed) entries.push(['Tempo sem requisição', elapsed]);
      if (row.blockId) entries.push(['Status de bloqueio', row.blockId]);
      const notes = reason.split(' · ').filter(part => part !== elapsed && part !== row.blockReason && part !== `Id Bloqueio: ${row.blockId}`).join(' · ');
      if (row.action) entries.push(['Ação recomendada', row.action]);
      if (notes) entries.push([reason.startsWith('Corrigir na planilha:') ? 'Dados a revisar' : 'Observações', notes]);
    } else {
      entries.push(['Motivo da ação', reason]);
    }
    const content = entries.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    return `<details class="row-details" ${expansionAttributes(row, 'reason')}><summary class="discreet-button"><span class="details-show">Ver detalhes</span><span class="details-hide">Ocultar detalhes</span></summary><dl class="detail-fields">${content}</dl></details>`;
  }
  function visibleResults() {
    return sortResults(filterResults(state.results, {
      query: el('#search').value,
      action: el('#filter').value,
      location: state.locationFilter,
      analitico: isAnaliticoMode(),
      hiddenOnly: state.hiddenOnly,
    }), { key: state.sortKey, direction: state.sortDirection });
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
    const sortedColumn = state.columns.find(column => column.key === state.sortKey);
    if (sortedColumn) parts.push(`Ordem: ${sortedColumn.sortLabel || sortedColumn.label} (${state.sortDirection === 'asc' ? 'crescente' : 'decrescente'})`);
    el('#active-filters').hidden = parts.length === 0;
    el('#active-filters-text').textContent = parts.length ? `${parts.join(' · ')} · ${filteredCount} ${filteredCount === 1 ? 'item' : 'itens'}` : '';
  }
  function renderResults() {
    rememberExpansions();
    const query = el('#search').value.trim().toLowerCase();
    const filter = el('#filter').value;
    const analitico = isAnaliticoMode();
    const giro = !analitico && isGiroMode();
    const filtered = visibleResults();
    const page = paginate(filtered, state.page, PAGE_SIZE);
    state.page = page.page;
    const { pageCount, start, rows: visible } = page;
    el('#result-rows').innerHTML = visible.length ? visible.map(row => {
      if (analitico) {
        const hiddenTag = row.hidden ? ' <span class="hidden-indicator">Oculto</span>' : '';
        return `<tr class="${row.hidden ? 'hidden-item' : ''}${row.actions.some(urgentAction) ? ' urgent-row' : ''}"><td>${descriptionHtml(row)}${hiddenTag}</td><td>${escapeHtml(row.sku)}</td><td>${escapeHtml(stockLocation(row)) || '—'}</td><td>${escapeHtml(row.shelfCode) || '—'}</td><td>${escapeHtml(row.partitionCode) || '—'}</td><td>${formatNumber(row.stock)}</td><td>${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}</td><td>${row.actions.map(badgeHtml).join(' ')}</td><td class="reason">${detailsHtml(row.reason, row)}</td></tr>`;
      }
      return `<tr class="${row.hidden ? 'hidden-item' : ''}"><td><strong>${escapeHtml(row.item || `Linha ${row.row}`)}</strong><small>${escapeHtml([row.sku, row.branch, row.location, row.localCode && `Local ${row.localCode}`].filter(Boolean).join(' · ') || `Linha ${row.row}`)}</small></td><td>${giro ? itemCurrency(row.stockValue) : formatNumber(row.stock)}</td><td>${giro ? itemCurrency(row.consumption) : formatNumber(row.sales)}</td><td>${row.coverage === null ? '—' : `${formatNumber(row.coverage)} dias`}</td><td>${badgeHtml(row.action)}</td><td class="reason">${detailsHtml(row.reason, row)}</td></tr>`;
    }).join('') : `<tr><td class="empty-row" colspan="${state.columns.length}">Nenhum item encontrado.</td></tr>`;
    el('#result-rows').querySelectorAll('tr').forEach(tr => {
      if (tr.querySelector('.empty-row')) return;
      [...tr.children].forEach((cell, index) => cell.classList.add(columnClass(state.columns[index].key)));
    });
    scheduleDescriptionControls();
    descriptionObserver?.disconnect();
    el('#result-rows').querySelectorAll('.item-description strong').forEach(text => descriptionObserver?.observe(text));
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
    headerRow.eachCell((cell, _colNumber) => {
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
    const run = ++importRun;
    message('Lendo planilha...');
    upload.setAttribute('aria-busy', 'true');
    upload.classList.add('loading');
    try {
      const sheets = (await importFile(file)).map(sheet => ({ ...sheet, headerRow: findHeaderRow(sheet.rows) }));
      if (run !== importRun) return;
      if (!sheets.length || !sheets.some(sheet => sheet.rows.length > sheet.headerRow + 1)) throw new Error('Não encontrei linhas de dados na planilha.');
      state.sheets = sheets;
      expansionVersion++;
      expandedRows.clear();
      state.sheet = state.sheets.findIndex(sheet => sheet.rows.length > sheet.headerRow + 1);
      state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []);
      const savedFilters = readFilterPreferences();
      const restoreHidden = currentMode() === 'analitico' && Boolean(savedFilters.showHidden);
      el('#show-hidden').checked = restoreHidden;
      el('#search').value = typeof savedFilters.query === 'string' ? savedFilters.query : '';
      el('#filter').value = '';
      resetDashboardState(state);
      state.locationFilter = typeof savedFilters.location === 'string' ? savedFilters.location : '';
      state.hiddenOnly = Boolean(savedFilters.hiddenOnly && restoreHidden);
      state.sortKey = typeof savedFilters.sortKey === 'string' ? savedFilters.sortKey : '';
      state.sortDirection = savedFilters.sortDirection === 'desc' ? 'desc' : 'asc';
      state.pendingActionFilter = typeof savedFilters.action === 'string' ? savedFilters.action : '';
      state.fileName = file.name;
      state.importedAt = new Date();
      setConfigExpanded(false);
      el('#file-name').textContent = file.name;
      el('#workspace').hidden = false;
      el('.shell').classList.add('has-data');
      renderImportContext(); renderMapping(); renderSettings(); await refresh();
    } catch (error) { if (run === importRun) message(error.message || 'Não foi possível abrir o arquivo.', 'error'); }
    finally { if (run === importRun) { upload.removeAttribute('aria-busy'); upload.classList.remove('loading'); } }
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
    searchRenderFrame = requestAnimationFrame(() => { renderResults(); persistFilters(); });
  });
  el('#filter').addEventListener('change', () => { state.page = 1; state.hiddenOnly = false; renderResults(); persistFilters(); });
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
  el('#toggle-hidden-context').addEventListener('click', () => {
    state.page = 1;
    state.hiddenOnly = false;
    el('#show-hidden').checked = !el('#show-hidden').checked;
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
    persistFilters();
  });
  el('#table-head').addEventListener('click', event => {
    const button = event.target.closest('[data-sort-key]');
    if (!button) return;
    const key = button.dataset.sortKey;
    state.sortDirection = state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc';
    state.sortKey = key;
    state.page = 1;
    renderTableHead();
    renderResults();
    persistFilters();
  });
  el('#clear-filters').addEventListener('click', () => {
    state.page = 1;
    state.locationFilter = '';
    state.hiddenOnly = false;
    state.sortKey = '';
    state.sortDirection = 'asc';
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
