import { importFile, selectDataRows } from './import.js';
import { ANALITICO_REQUIRED_KEYS, analyze, analyzeAnalitico, analyzeGiro, detectAnalysisMode, fields, findHeaderRow, formatNumber, normalizeLocalKey, stockLocation, suggestMapping, summarizeLocationTotal } from './analysis.js';
import { actionCounts, dataIssueSummary, filterResults, locationOptions, matchesLocation, matchesPosition, paginate, PAGE_SIZE, prioritizeActionCounts, processInChunks, resetDashboardState, sortResults } from './dashboard.js';
import { buildCsv, buildExportData, currencyNumber, shouldIncludeDaysSince } from './export-data.js';
import { renderApp } from './template.js';
import { svgIcon } from './icons.js';

const app = typeof document !== 'undefined' ? document.querySelector('#app') : null;
const state = {
  sheets: [], sheet: 0, mapping: {}, allResults: [], results: [],
  page: 1, locationFilter: '', hiddenOnly: false, fileName: '', importedAt: null,
  shelfFilter: '', partitionFilter: '', pageSize: PAGE_SIZE,
  mode: 'auto',
  numberFormat: 'pt-BR',
  sortKey: '',
  sortDirection: 'asc',
  columns: [],
  pageRows: [],
  grouped: false,
  collapsedGroups: new Set(),
  actionOrder: [],
  actionRank: new Map(),
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

export function buildSummaryMarkup({ summaryResults, summaryAllResults, actions, counts, locationFilter, locationTotal, shelfFilter = '', partitionFilter = '' }) {
  const summaryCounts = prioritizeActionCounts(counts ?? actions.map(action => ({ action, count: summaryResults.filter(row => row.action === action).length })));
  return [
    `<button type="button" class="summary-card total summary-filter" data-summary-clear aria-pressed="false"><span>ITENS NO PAINEL</span><strong>${summaryResults.length}</strong></button>`,
    ...summaryCounts.filter(({ count }) => count > 0).map(({ action, count }) => {
      const hiddenCard = action === 'Itens ocultos';
      const attribute = hiddenCard ? 'data-summary-hidden' : `data-summary-action="${escapeHtml(action)}"`;
      const total = hiddenCard ? summaryAllResults.length : summaryResults.length;
      const percentage = total ? Math.round((count / total) * 100) : 0;
      return `<button type="button" class="summary-card summary-filter ${slug(action)}" ${attribute} aria-pressed="false"><span>${escapeHtml(action.toUpperCase())}</span><div class="summary-value"><strong>${count}</strong><small>${percentage}% ${hiddenCard ? 'do total' : 'do painel'}</small></div></button>`;
    }),
  ].filter(Boolean).join('');
}

export function buildTotalMarkup({ summaryAllResults, locationFilter, locationTotal, shelfFilter = '', partitionFilter = '' }) {
  if (!locationFilter && summaryAllResults.length === 0) return '';
  const label = shelfFilter || partitionFilter ? 'Valor do estoque na localização' : locationFilter ? 'Valor do estoque no local' : 'Valor total do estoque';
  const scope = [locationFilter && `Local ${locationFilter}`, shelfFilter && `Prateleira ${shelfFilter}`, partitionFilter && `Repartição ${partitionFilter}`].filter(Boolean).join(' · ');
  const title = escapeHtml(`Soma da coluna Vl Saldo${scope ? ` · ${scope}` : ''}`);
  return `<span class="total-label" title="${title}">${escapeHtml(label)}</span><strong title="${title}">${realCurrency(locationTotal)}</strong>`;
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

  setInstallButton(false);

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
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0a121c' : '#ffffff');
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-switching')));
  }
  try { setTheme(localStorage.getItem('giro-estoque-theme') ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch { setTheme('light'); }
  function setDensity(compact) {
    document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
    el('#density-toggle').setAttribute('aria-pressed', String(compact));
  }
  const WIDE_DESKTOP = 1366;
  try {
    const savedDensity = localStorage.getItem('controle-estoque-density');
    setDensity(savedDensity ? savedDensity === 'compact' : window.innerWidth >= WIDE_DESKTOP);
  } catch { setDensity(window.innerWidth >= WIDE_DESKTOP); }
  try { state.grouped = localStorage.getItem('controle-estoque-group') === 'on'; } catch { state.grouped = false; }
  el('#group-toggle').setAttribute('aria-pressed', String(state.grouped));
  function setSidebar(visible) {
    document.documentElement.dataset.sidebar = visible ? 'shown' : 'hidden';
    el('#sidebar-toggle').setAttribute('aria-expanded', String(visible));
    el('#sidebar-toggle span').textContent = visible ? 'Ocultar barra lateral' : 'Mostrar barra lateral';
  }
  try { setSidebar(localStorage.getItem('controle-estoque-sidebar') !== 'hidden'); } catch { setSidebar(true); }
  el('#sidebar-toggle').addEventListener('click', () => {
    const visible = document.documentElement.dataset.sidebar === 'hidden';
    setSidebar(visible);
    try { localStorage.setItem('controle-estoque-sidebar', visible ? 'shown' : 'hidden'); } catch { /* A escolha vale até fechar a página. */ }
  });
  function setStripedRows(striped) {
    document.documentElement.dataset.rows = striped ? 'striped' : 'plain';
    el('#stripe-toggle').setAttribute('aria-pressed', String(striped));
  }
  try { setStripedRows(localStorage.getItem('controle-estoque-rows') === 'striped'); } catch { setStripedRows(false); }
  function setProgress(value) {
    const bar = el('#progress');
    bar.hidden = value === null;
    bar.classList.toggle('is-indeterminate', value === 'busy');
    if (typeof value === 'number') {
      const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
      bar.setAttribute('aria-valuenow', String(percent));
      el('#progress-bar').style.width = `${percent}%`;
    } else bar.removeAttribute('aria-valuenow');
  }
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
        shelf: state.shelfFilter,
        partition: state.partitionFilter,
        pageSize: state.pageSize,
        showHidden: el('#show-hidden').checked,
        hiddenOnly: state.hiddenOnly,
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
      }));
    } catch { /* Os filtros permanecem válidos até fechar a página. */ }
  }
  const desktopQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;
  function setSearchExpanded(expanded) {
    expanded = expanded || Boolean(desktopQuery?.matches);
    el('#search-control').classList.toggle('is-expanded', expanded);
    el('#search-toggle').setAttribute('aria-expanded', String(expanded));
    el('#search-expansion').inert = !expanded;
  }
  function resultColumns(analitico, giro) {
    if (analitico) return [
      { label: 'Descrição', key: 'item' },
      { label: 'Código', key: 'sku' },
      { label: 'Local', key: 'localCode' },
      { label: 'Prateleira', key: 'shelfCode' },
      { label: 'Repartição', key: 'partitionCode' },
      { label: 'Qtd. atual', key: 'stock' },
      { label: 'Mín. / Máx', key: 'minimum' },
      { label: 'Ação', key: 'action' },
      { label: 'Dias', key: 'daysSince', sortLabel: 'dias desde a última movimentação' },
    ];
    if (giro) return [
      { label: 'Item / Filial', key: 'item' },
      { label: 'Estoque (R$)', key: 'stockValue' },
      { label: 'Consumo (R$)', key: 'consumption' },
      { label: 'Giro', key: 'coverage' },
      { label: 'Recomendação', key: 'action' },
      { label: 'Motivo', key: 'reason' },
    ];
    return [
      { label: 'Item', key: 'item' },
      { label: 'Estoque', key: 'stock' },
      { label: 'Vendas / 30d', key: 'sales' },
      { label: 'Cobertura', key: 'coverage' },
      { label: 'Recomendação', key: 'action' },
      { label: 'Motivo', key: 'reason' },
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
  function renderActionBar(counts) {
    const bar = el('#action-bar');
    const segments = counts.filter(({ action, count }) => action !== 'Itens ocultos' && count > 0);
    bar.hidden = segments.length === 0;
    bar.innerHTML = segments.map(({ action, count }) => `<span class="seg ${slug(action)}" style="flex:${count}" title="${escapeHtml(action)}: ${count}"></span>`).join('');
    bar.setAttribute('aria-label', `Distribuição das ações: ${segments.map(({ action, count }) => `${action} ${count}`).join(', ')}`);
  }
  function renderHiddenToggle(hiddenCount) {
    el('#hidden-toggle-text').textContent = `Mostrar itens ocultos (${hiddenCount.toLocaleString('pt-BR')})`;
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
    if (!state.fileName || !currentSheet()) { el('#import-context').textContent = ''; el('#topbar-file').hidden = true; return; }
    const importedAt = state.importedAt?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? '';
    el('#topbar-file').innerHTML = `<strong>${escapeHtml(state.fileName)}</strong><span>${escapeHtml(currentSheet().name)}</span>`;
    el('#topbar-file').hidden = false;
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

  let optionalFieldsOpen = false;
  function renderMapping() {
    const headers = currentSheet().rows[currentSheet().headerRow] || [];
    const required = new Set(requiredKeys());
    const fieldLabel = field => `<span class="field-label">${field.label}${required.has(field.key) ? ' <span class="required" title="Obrigatório">*</span>' : ''}</span>`;
    const fieldSelect = field => `<label>${fieldLabel(field)}<select data-map="${field.key}"><option value="-1">Não selecionar</option>${headers.map((header, i) => `<option value="${i}" ${state.mapping[field.key] === i ? 'selected' : ''}>${escapeHtml(header || `Coluna ${i + 1}`)}</option>`).join('')}</select></label>`;
    const optional = fields.filter(field => !required.has(field.key));
    el('#mapping').innerHTML = `<label class="sheet-select"><span class="field-label">Aba</span><select id="sheet-select">${state.sheets.map((sheet, i) => `<option value="${i}" ${i === state.sheet ? 'selected' : ''}>${escapeHtml(sheet.name)}</option>`).join('')}</select></label>`
      + fields.filter(field => required.has(field.key)).map(fieldSelect).join('')
      + `<details class="optional-fields"${optionalFieldsOpen ? ' open' : ''}><summary>Campos opcionais (${optional.length})</summary><div class="mapping-grid">${optional.map(fieldSelect).join('')}</div></details>`;
    el('#mapping').insertAdjacentHTML('afterbegin', '<label><span class="field-label">Tipo de análise</span><select id="analysis-mode"><option value="auto">Automático</option><option value="generic">Estoque e vendas</option><option value="giro">Giro por valor de consumo</option><option value="analitico">Analítico</option></select></label><label><span class="field-label">Formato dos números em texto</span><select id="number-format"><option value="pt-BR">Brasileiro: 1.234,56</option><option value="en-US">Internacional: 1,234.56</option></select></label>');
    el('.optional-fields').addEventListener('toggle', event => { optionalFieldsOpen = event.target.open; });
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

  function updatePositionFilters() {
    const localRows = state.allResults.filter(row => matchesLocation(row, state.locationFilter));
    const update = (selector, key, stateKey, rows, label) => {
      const values = [...new Set(rows.map(row => String(row[key] ?? '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
      if (!values.includes(state[stateKey])) state[stateKey] = '';
      const select = el(selector);
      select.innerHTML = `<option value="">${label}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      select.value = state[stateKey];
      select.disabled = values.length === 0;
    };
    update('#shelf-filter', 'shelfCode', 'shelfFilter', localRows, 'Todas');
    update('#partition-filter', 'partitionCode', 'partitionFilter', localRows.filter(row => matchesPosition(row, { shelf: state.shelfFilter })), 'Todas');
  }

  async function refresh({ reanalyze = true } = {}) {
    if (reanalyze) closeItemPanel();
    const run = reanalyze ? ++refreshRun : refreshRun;
    const analitico = isAnaliticoMode();
    const giro = !analitico && isGiroMode();
    const required = new Set(requiredKeys());
    const missing = fields.filter(field => required.has(field.key) && !isMapped(field.key));
    if (missing.length) { state.results = []; el('#results-section').hidden = true; el('#total-value').hidden = true; setConfigExpanded(true); message(`Selecione as colunas: ${missing.map(field => field.label).join(', ')}.`, 'error'); return; }
    const selected = fields.map(field => state.mapping[field.key]).filter(value => value >= 0);
    if (new Set(selected).size !== selected.length) { state.results = []; el('#results-section').hidden = true; el('#total-value').hidden = true; setConfigExpanded(true); message('Cada dado deve usar uma coluna diferente.', 'error'); return; }
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
          if (run !== refreshRun) return;
          message(`Analisando ${processed.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} linhas...`);
          setProgress(processed / total);
        } : undefined,
      });
      if (run !== refreshRun) return;
      setProgress(null);
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
    el('#location-filter').innerHTML = '<option value="">Todos</option>' + locationValues.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    el('#location-filter').value = state.locationFilter;
    updatePositionFilters();

    const position = { location: state.locationFilter, shelf: state.shelfFilter, partition: state.partitionFilter };
    const summaryResults = state.results.filter(row => matchesPosition(row, position));
    const summaryAllResults = state.allResults.filter(row => matchesPosition(row, position));
    const actions = analitico ? ANALITICO_ACTIONS : giro ? GIRO_ACTIONS : GENERIC_ACTIONS;
    const counts = prioritizeActionCounts(analitico
      ? [...actionCounts(summaryResults, actions, true), { action: 'Itens ocultos', count: summaryAllResults.filter(row => row.hidden).length }]
      : actionCounts(summaryResults, actions, false));
    const availableActions = counts.filter(({ action, count }) => action !== 'Itens ocultos' && count > 0).map(({ action }) => action);
    state.actionOrder = availableActions;
    state.actionRank = new Map(availableActions.map((action, index) => [action, index]));
    renderActionBar(counts);
    const hiddenCount = summaryAllResults.filter(row => row.hidden).length;
    const locationTotal = summarizeLocationTotal(summaryAllResults, state.locationFilter);
    const previousFilter = state.pendingActionFilter || el('#filter').value;
    state.pendingActionFilter = '';
    el('#summary').innerHTML = buildSummaryMarkup({
      summaryResults,
      summaryAllResults,
      actions: analitico ? [...ANALITICO_ACTIONS, 'Itens ocultos'] : giro ? GIRO_ACTIONS : GENERIC_ACTIONS,
      counts,
      locationFilter: state.locationFilter,
      locationTotal,
      shelfFilter: state.shelfFilter,
      partitionFilter: state.partitionFilter,
    });
    const totalMarkup = buildTotalMarkup({ summaryAllResults, locationFilter: state.locationFilter, locationTotal, shelfFilter: state.shelfFilter, partitionFilter: state.partitionFilter });
    el('#total-value').innerHTML = totalMarkup;
    el('#total-value').hidden = !totalMarkup;
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
    renderHiddenToggle(hiddenCount);
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
  function detailFields(reason, row) {
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
    return `<dl class="detail-fields">${entries.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
  }
  function detailsHtml(reason, row) {
    if (!reason) return '<span class="no-details">—</span>';
    return `<button type="button" class="icon-button details-button" data-detail-row="${row.row}" aria-haspopup="dialog" aria-label="Ver detalhes" title="Ver detalhes">${svgIcon('chevronRight')}</button>`;
  }
  function codeHtml(code) {
    const value = String(code ?? '');
    if (!value) return '';
    return `<span class="item-code"><span>${escapeHtml(value)}</span><button type="button" class="copy-code" data-copy-code="${escapeHtml(value)}" aria-label="Copiar código ${escapeHtml(value)}" title="Copiar código">${svgIcon('copy')}</button></span>`;
  }
  let panelTrigger = null;
  let panelRow = null;
  const DOCK_MIN_WIDTH = 1700;
  const dockQuery = typeof window.matchMedia === 'function' ? window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`) : null;
  const docked = () => Boolean(dockQuery?.matches);
  const DOCK_EMPTY = '<p class="dock-empty">Clique em uma linha da tabela para ver os detalhes. Use as setas ↑ e ↓ para navegar entre os itens.</p>';
  function panelParts() {
    return docked()
      ? { content: el('#detail-dock-content'), prev: el('#dock-prev'), next: el('#dock-next'), close: el('#dock-close') }
      : { content: el('#item-panel-content'), prev: el('#item-panel-prev'), next: el('#item-panel-next'), close: el('#item-panel-close') };
  }
  function clearDock() {
    panelRow = null;
    panelTrigger = null;
    el('#result-rows').querySelectorAll('tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
    el('#detail-dock-content').innerHTML = DOCK_EMPTY;
    for (const selector of ['#dock-prev', '#dock-next', '#dock-close']) el(selector).disabled = true;
  }
  function closeItemPanel() {
    const panel = el('#item-panel');
    if (panel.open) panel.close();
    if (panelRow) clearDock();
  }
  function fillItemPanel(row) {
    panelRow = row;
    el('#result-rows').querySelectorAll('tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
    el(`#result-rows tr[data-row="${row.row}"]`)?.classList.add('is-selected');
    const identity = [stockLocation(row) && `Local ${stockLocation(row)}`, row.shelfCode && `Prateleira ${row.shelfCode}`, row.partitionCode && `Repartição ${row.partitionCode}`].filter(Boolean).join(' · ');
    const parts = panelParts();
    parts.content.innerHTML = `<strong class="panel-item-name">${escapeHtml(row.item || `Linha ${row.row}`)}</strong>${row.sku ? `<div class="panel-item-code"><span>Código</span>${codeHtml(row.sku)}</div>` : ''}${identity ? `<p class="panel-item-location">${escapeHtml(identity)}</p>` : ''}${detailFields(row.reason, row)}`;
    const neighbours = detailRows();
    const index = neighbours.indexOf(row);
    parts.prev.disabled = index <= 0;
    parts.next.disabled = index < 0 || index >= neighbours.length - 1;
    parts.close.disabled = false;
  }
  function detailRows() { return state.pageRows.filter(row => row.reason); }
  function openItemPanel(row, trigger) {
    panelTrigger = trigger;
    fillItemPanel(row);
    if (docked()) return;
    if (!el('#item-panel').open) el('#item-panel').showModal();
    el('#item-panel-close').focus();
  }
  function stepItemPanel(direction) {
    const rows = detailRows();
    const next = rows[rows.indexOf(panelRow) + direction];
    if (!next) return;
    panelTrigger = el(`[data-detail-row="${next.row}"]`) ?? panelTrigger;
    fillItemPanel(next);
    panelTrigger?.scrollIntoView?.({ block: 'nearest' });
  }
  async function copyCode(button) {
    const code = button.dataset.copyCode;
    button.disabled = true;
    try {
      if (window.navigator.clipboard?.writeText) await window.navigator.clipboard.writeText(code);
      else {
        const input = document.createElement('textarea');
        input.value = code;
        input.className = 'clipboard-fallback';
        (el('#item-panel').open ? el('#item-panel') : document.body).append(input);
        try {
          input.select();
          if (!document.execCommand?.('copy')) throw new Error('Clipboard unavailable');
        } finally { input.remove(); button.focus(); }
      }
      button.innerHTML = svgIcon('check');
      button.classList.add('is-copied');
      button.title = 'Copiado';
      button.setAttribute('aria-label', `Código ${code} copiado`);
      el('#copy-feedback').textContent = `Código ${code} copiado.`;
      setTimeout(() => {
        if (!button.isConnected) return;
        button.innerHTML = svgIcon('copy');
        button.classList.remove('is-copied');
        button.title = 'Copiar código';
        button.setAttribute('aria-label', `Copiar código ${code}`);
        button.disabled = false;
      }, 1800);
    } catch {
      button.disabled = false;
      el('#copy-feedback').textContent = 'Não foi possível copiar. Selecione o código e copie manualmente.';
      button.title = 'Não foi possível copiar';
    }
  }
  function primaryAction(row) {
    const options = row.actions?.length ? row.actions : [row.action];
    return [...options].sort((a, b) => (state.actionRank.get(a) ?? 99) - (state.actionRank.get(b) ?? 99))[0];
  }
  function rowClass(row, ...extra) {
    return [slug(primaryAction(row)), row.hidden && 'hidden-item', ...extra, row.reason && 'has-details'].filter(Boolean).join(' ');
  }
  function groupRowHtml(action, count) {
    const collapsed = state.collapsedGroups.has(action);
    return `<tr class="group-row"><td colspan="${state.columns.length}"><div class="group-head"><button type="button" class="group-toggle" data-group-toggle="${escapeHtml(action)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Expandir' : 'Recolher'} grupo ${escapeHtml(action)}">${svgIcon(collapsed ? 'chevronRight' : 'chevronDown')}</button>${badgeHtml(action)}<span class="group-count">${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'}</span><button type="button" class="discreet-button group-export" data-group-export="${escapeHtml(action)}">Exportar grupo</button></div></td></tr>`;
  }
  function visibleResults() {
    const sorted = sortResults(filterResults(state.results, {
      query: el('#search').value,
      action: el('#filter').value,
      location: state.locationFilter,
      shelf: state.shelfFilter,
      partition: state.partitionFilter,
      analitico: isAnaliticoMode(),
      hiddenOnly: state.hiddenOnly,
    }), { key: state.sortKey, direction: state.sortDirection });
    if (!state.grouped) return sorted;
    return sorted.sort((a, b) => (state.actionRank.get(primaryAction(a)) ?? 99) - (state.actionRank.get(primaryAction(b)) ?? 99));
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
    if (state.shelfFilter) parts.push(`Prateleira ${state.shelfFilter}`);
    if (state.partitionFilter) parts.push(`Repartição ${state.partitionFilter}`);
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
    if (query) setSearchExpanded(true);
    else if (!el('#search-control').contains(document.activeElement)) setSearchExpanded(false);
    const filter = el('#filter').value;
    const analitico = isAnaliticoMode();
    const giro = !analitico && isGiroMode();
    const filtered = visibleResults();
    const page = paginate(filtered, state.page, state.pageSize);
    state.page = page.page;
    const { pageCount, start, rows: visible } = page;
    state.pageRows = visible;
    const groupCounts = new Map();
    if (state.grouped) filtered.forEach(row => groupCounts.set(primaryAction(row), (groupCounts.get(primaryAction(row)) ?? 0) + 1));
    const rowsHtml = [];
    let currentGroup = null;
    for (const row of visible) {
      const group = primaryAction(row);
      if (state.grouped && group !== currentGroup) {
        currentGroup = group;
        rowsHtml.push(groupRowHtml(group, groupCounts.get(group)));
      }
      if (state.grouped && state.collapsedGroups.has(group)) continue;
      if (analitico) {
        const hiddenTag = row.hidden ? ' <span class="hidden-indicator">Oculto</span>' : '';
        rowsHtml.push(`<tr data-row="${row.row}" class="${rowClass(row, row.actions.some(urgentAction) && 'urgent-row')}"><td>${descriptionHtml(row)}${hiddenTag}</td><td>${codeHtml(row.sku)}</td><td>${escapeHtml(stockLocation(row)) || '—'}</td><td>${escapeHtml(row.shelfCode) || '—'}</td><td>${escapeHtml(row.partitionCode) || '—'}</td><td>${formatNumber(row.stock)}</td><td>${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}</td><td>${row.actions.map(badgeHtml).join(' ')}</td><td class="reason"><div class="cell-details"><span class="days">${row.daysSince === null || row.daysSince === undefined ? '—' : `${formatNumber(row.daysSince)} dias`}</span>${detailsHtml(row.reason, row)}</div></td></tr>`);
      } else {
        rowsHtml.push(`<tr data-row="${row.row}" class="${rowClass(row)}"><td><strong>${escapeHtml(row.item || `Linha ${row.row}`)}</strong>${codeHtml(row.sku)}<small>${escapeHtml([row.branch, row.location, row.localCode && `Local ${row.localCode}`].filter(Boolean).join(' · ') || `Linha ${row.row}`)}</small></td><td>${giro ? itemCurrency(row.stockValue) : formatNumber(row.stock)}</td><td>${giro ? itemCurrency(row.consumption) : formatNumber(row.sales)}</td><td>${row.coverage === null ? '—' : `${formatNumber(row.coverage)} dias`}</td><td>${badgeHtml(row.action)}</td><td class="reason">${detailsHtml(row.reason, row)}</td></tr>`);
      }
    }
    el('#result-rows').innerHTML = visible.length ? rowsHtml.join('') : `<tr><td class="empty-row" colspan="${state.columns.length}">Nenhum item encontrado.</td></tr>`;
    el('#result-rows').querySelectorAll('tr').forEach(tr => {
      if (tr.querySelector('.empty-row') || tr.classList.contains('group-row')) return;
      [...tr.children].forEach((cell, index) => cell.classList.add(columnClass(state.columns[index].key)));
    });
    scheduleDescriptionControls();
    descriptionObserver?.disconnect();
    el('#result-rows').querySelectorAll('.item-description strong').forEach(text => descriptionObserver?.observe(text));
    const itemLabel = filtered.length === 1 ? 'item' : 'itens';
    const filterLabel = query || filter || state.locationFilter || state.shelfFilter || state.partitionFilter || state.hiddenOnly ? filtered.length === 1 ? ' filtrado' : ' filtrados' : '';
    el('#page-status').textContent = filtered.length ? `${start + 1}–${start + visible.length} de ${filtered.length} ${itemLabel}${filterLabel}` : 'Nenhum item encontrado';
    el('#filtered-count').textContent = `${filtered.length.toLocaleString('pt-BR')} de ${state.allResults.length.toLocaleString('pt-BR')} ${state.allResults.length === 1 ? 'item' : 'itens'}`;
    el('#pagination').hidden = pageCount <= 1;
    el('#page-label').textContent = `Página ${state.page} de ${pageCount}`;
    el('#page-previous').disabled = state.page === 1;
    el('#page-next').disabled = state.page === pageCount;
    updateSummarySelection();
    renderActiveFilters(filtered.length);
  }

  function exportData(source = visibleResults(), actionValue = el('#filter').value) {
    const mode = isAnaliticoMode() ? 'analitico' : isGiroMode() ? 'giro' : 'generic';
    return buildExportData(source, mode, {
      includeDaysSince: shouldIncludeDaysSince(mode, actionValue),
    });
  }
  function exportName(extension, actionValue = el('#filter').value) {
    const action = slug(actionValue || 'todas-as-acoes');
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
  async function exportXlsx(source = visibleResults(), actionValue = el('#filter').value) {
    if (!globalThis.ExcelJS) throw new Error('A biblioteca de Excel não foi carregada. Recarregue a página.');
    const { headers, rows } = exportData(source, actionValue);
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
    saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportName('xlsx', actionValue));
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
    const shelf = state.shelfFilter ? ` · Prateleira: ${escapeHtml(state.shelfFilter)}` : '';
    const partition = state.partitionFilter ? ` · Repartição: ${escapeHtml(state.partitionFilter)}` : '';
    el('#print-report').innerHTML = `<h1>Controle de Estoque</h1><p>Ação: ${escapeHtml(filter)}${local}${shelf}${partition}${search ? ` · Busca: ${escapeHtml(search)}` : ''} · ${rows.length} ${rows.length === 1 ? 'item' : 'itens'}</p><table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, value]) => `<td>${escapeHtml(value(row) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    window.print();
  }

  async function loadFile(file) {
    if (!file) return;
    const run = ++importRun;
    message('Lendo planilha...');
    setProgress('busy');
    upload.setAttribute('aria-busy', 'true');
    upload.classList.add('loading');
    try {
      const sheets = (await importFile(file)).map(sheet => ({ ...sheet, headerRow: findHeaderRow(sheet.rows) }));
      if (run !== importRun) return;
      if (!sheets.length || !sheets.some(sheet => sheet.rows.length > sheet.headerRow + 1)) throw new Error('Não encontrei linhas de dados na planilha.');
      state.sheets = sheets;
      expansionVersion++;
      expandedRows.clear();
      state.collapsedGroups.clear();
      state.sheet = state.sheets.findIndex(sheet => sheet.rows.length > sheet.headerRow + 1);
      state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []);
      const savedFilters = readFilterPreferences();
      const restoreHidden = currentMode() === 'analitico' && Boolean(savedFilters.showHidden);
      el('#show-hidden').checked = restoreHidden;
      el('#search').value = typeof savedFilters.query === 'string' ? savedFilters.query : '';
      el('#filter').value = '';
      resetDashboardState(state);
      state.locationFilter = typeof savedFilters.location === 'string' ? savedFilters.location : '';
      state.shelfFilter = typeof savedFilters.shelf === 'string' ? savedFilters.shelf : '';
      state.partitionFilter = typeof savedFilters.partition === 'string' ? savedFilters.partition : '';
      state.pageSize = [25, 50, 100].includes(Number(savedFilters.pageSize)) ? Number(savedFilters.pageSize) : PAGE_SIZE;
      el('#page-size').value = String(state.pageSize);
      state.hiddenOnly = Boolean(savedFilters.hiddenOnly && restoreHidden);
      state.sortKey = typeof savedFilters.sortKey === 'string' ? savedFilters.sortKey : '';
      state.sortDirection = savedFilters.sortDirection === 'desc' ? 'desc' : 'asc';
      state.pendingActionFilter = typeof savedFilters.action === 'string' ? savedFilters.action : '';
      state.fileName = file.name;
      state.importedAt = new Date();
      setConfigExpanded(false);
      el('#workspace').hidden = false;
      el('.shell').classList.add('has-data');
      renderImportContext(); renderMapping(); renderSettings(); await refresh();
    } catch (error) { if (run === importRun) message(error.message || 'Não foi possível abrir o arquivo.', 'error'); }
    finally { if (run === importRun) { upload.removeAttribute('aria-busy'); upload.classList.remove('loading'); setProgress(null); } }
  }

  el('#replace-file').addEventListener('click', () => el('#file-input').click());
  el('#file-input').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; loadFile(file); });
  const upload = el('#upload-card');
  const fileButton = upload.querySelector('.primary-button');
  fileButton.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    el('#file-input').click();
  });
  const shell = el('.shell');
  const draggingFiles = event => [...(event.dataTransfer?.types ?? [])].includes('Files');
  shell.addEventListener('dragover', event => {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    upload.classList.add('dragging');
    shell.classList.add('dragging-file');
  });
  shell.addEventListener('dragleave', event => {
    if (event.relatedTarget && shell.contains(event.relatedTarget)) return;
    upload.classList.remove('dragging');
    shell.classList.remove('dragging-file');
  });
  shell.addEventListener('drop', event => {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    upload.classList.remove('dragging');
    shell.classList.remove('dragging-file');
    loadFile(event.dataTransfer.files[0]);
  });
  el('#search').addEventListener('input', () => {
    state.page = 1;
    cancelAnimationFrame(searchRenderFrame);
    searchRenderFrame = requestAnimationFrame(() => { renderResults(); persistFilters(); });
  });
  el('#search-toggle').addEventListener('click', () => {
    const expanded = el('#search-toggle').getAttribute('aria-expanded') === 'true';
    if (expanded && !el('#search').value.trim() && !desktopQuery?.matches) setSearchExpanded(false);
    else {
      setSearchExpanded(true);
      el('#search').focus({ preventScroll: true });
    }
  });
  el('#search-control').addEventListener('focusout', () => {
    setTimeout(() => {
      if (!el('#search-control').contains(document.activeElement) && !el('#search').value.trim()) setSearchExpanded(false);
    }, 0);
  });
  el('#search').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || el('#search').value.trim()) return;
    event.preventDefault();
    setSearchExpanded(false);
    el('#search-toggle').focus();
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
  el('#stripe-toggle').addEventListener('click', () => {
    const striped = document.documentElement.dataset.rows !== 'striped';
    setStripedRows(striped);
    try { localStorage.setItem('controle-estoque-rows', striped ? 'striped' : 'plain'); } catch { /* A escolha vale até fechar a página. */ }
  });
  el('#config-toggle').addEventListener('click', () => setConfigExpanded(el('#config-grid').hidden));
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable]') || el('#workspace').hidden || el('#item-panel').open) return;
    event.preventDefault();
    setSearchExpanded(true);
    el('#search').focus({ preventScroll: true });
  });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => document.documentElement.style.setProperty('--tools-height', `${el('.table-tools').offsetHeight}px`)).observe(el('.table-tools'));
  }
  desktopQuery?.addEventListener?.('change', () => setSearchExpanded(Boolean(el('#search').value.trim())));
  el('#show-hidden').addEventListener('change', () => {
    state.page = 1;
    if (!el('#show-hidden').checked) state.hiddenOnly = false;
    refresh({ reanalyze: false });
  });
  for (const [selector, key] of [['#shelf-filter', 'shelfFilter'], ['#partition-filter', 'partitionFilter']]) {
    el(selector).addEventListener('change', event => {
      state[key] = event.target.value;
      state.page = 1;
      refresh({ reanalyze: false });
    });
  }
  el('#page-size').addEventListener('change', event => {
    state.pageSize = [25, 50, 100].includes(Number(event.target.value)) ? Number(event.target.value) : PAGE_SIZE;
    state.page = 1;
    renderResults();
    persistFilters();
  });
  el('#result-rows').addEventListener('click', event => {
    const copy = event.target.closest('[data-copy-code]');
    if (copy) { copyCode(copy); return; }
    const groupRow = event.target.closest('tr.group-row');
    if (groupRow) {
      const group = groupRow.querySelector('[data-group-toggle]').dataset.groupToggle;
      if (event.target.closest('[data-group-export]')) {
        exportXlsx(visibleResults().filter(row => primaryAction(row) === group), group).catch(error => message(error.message || 'Não foi possível exportar o grupo.', 'error'));
        return;
      }
      if (state.collapsedGroups.has(group)) state.collapsedGroups.delete(group);
      else state.collapsedGroups.add(group);
      renderResults();
      return;
    }
    if (event.target.closest('summary, a, input, select')) return;
    const line = event.target.closest('tr[data-row]');
    const trigger = event.target.closest('[data-detail-row]') ?? line?.querySelector('[data-detail-row]');
    if (!trigger) return;
    const row = state.results.find(item => String(item.row) === trigger.dataset.detailRow);
    if (row) openItemPanel(row, trigger);
  });
  for (const selector of ['#item-panel-content', '#detail-dock-content']) {
    el(selector).addEventListener('click', event => {
      const copy = event.target.closest('[data-copy-code]');
      if (copy) copyCode(copy);
    });
  }
  el('#dock-prev').addEventListener('click', () => stepItemPanel(-1));
  el('#dock-next').addEventListener('click', () => stepItemPanel(1));
  el('#dock-close').addEventListener('click', clearDock);
  document.addEventListener('keydown', event => {
    if (!docked() || !panelRow || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, select, textarea, summary, [contenteditable]')) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      stepItemPanel(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Escape') clearDock();
  });
  el('#group-toggle').addEventListener('click', () => {
    state.grouped = !state.grouped;
    state.page = 1;
    el('#group-toggle').setAttribute('aria-pressed', String(state.grouped));
    try { localStorage.setItem('controle-estoque-group', state.grouped ? 'on' : 'off'); } catch { /* A escolha vale até fechar a página. */ }
    renderResults();
  });
  el('#item-panel-close').addEventListener('click', closeItemPanel);
  el('#item-panel-prev').addEventListener('click', () => stepItemPanel(-1));
  el('#item-panel-next').addEventListener('click', () => stepItemPanel(1));
  el('#item-panel').addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.target.closest?.('input, select, textarea')) return;
    event.preventDefault();
    stepItemPanel(event.key === 'ArrowDown' ? 1 : -1);
  });
  el('#item-panel').addEventListener('click', event => {
    if (event.target !== el('#item-panel')) return;
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeItemPanel();
  });
  el('#item-panel').addEventListener('close', () => {
    el('#result-rows').querySelectorAll('tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
    if (panelTrigger?.isConnected) panelTrigger.focus();
    else el('#search').focus();
    panelTrigger = null;
    panelRow = null;
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
    state.shelfFilter = '';
    state.partitionFilter = '';
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
  document.addEventListener('click', event => {
    if (!el('#export-menu').contains(event.target)) el('#export-menu').open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!el('#export-menu').open) return;
    el('#export-menu').open = false;
    el('#export-menu summary').focus();
  });
}
