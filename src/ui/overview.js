// Análise e visão geral: refresh (roda as regras), indicadores em reais, cartões, gráfico,
// filtros de posição e aviso de filtros ativos.
import { AGING_BUCKETS, agingSummary, analyze, analyzeAnalitico, analyzeGiro, fields, normalizeLocalKey, stockHealth, summarizeLocationTotal } from '../analysis.js';
import { actionCounts, actionValues, dataIssueSummary, locationOptions, matchesLocation, matchesPosition, prioritizeActionCounts, processInChunks } from '../dashboard.js';
import { ANALITICO_ACTIONS, GENERIC_ACTIONS, GIRO_ACTIONS, buildAgingChartMarkup, buildHealthMarkup, buildSummaryMarkup, buildTotalMarkup, escapeHtml, realCurrency } from './markup.js';

export function createOverview(ui) {
  const { state, el, message, setProgress } = ui;
  // Só a análise mais recente vale (uma troca rápida de filtro descarta a anterior).
  let refreshRun = 0;
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
  // Indicadores em reais e gráfico só no Analítico com a coluna de valor (Vl Saldo).
  function renderOverview(summaryAllResults, analitico) {
    const withValue = analitico && ui.isMapped('stockValue');
    const health = withValue ? stockHealth(summaryAllResults) : null;
    for (const [selector, kind] of [['#idle-value', 'idle'], ['#obsolete-value', 'obsolete']]) {
      el(selector).innerHTML = health ? buildHealthMarkup(kind, health[kind]) : '';
      el(selector).hidden = !health;
      if (health) ui.countUp(kind, el(`${selector} strong`), Number(health[kind].value) || 0, realCurrency);
    }
    const chart = withValue ? buildAgingChartMarkup(agingSummary(summaryAllResults), state.agingFilter) : '';
    el('#aging-chart-bars').innerHTML = chart;
    el('#aging-chart').hidden = !chart;
  }
  function renderHiddenToggle(hiddenCount) {
    el('#hidden-toggle-text').textContent = `Mostrar itens ocultos (${hiddenCount.toLocaleString('pt-BR')})`;
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
    if (reanalyze) ui.closeItemPanel();
    const run = reanalyze ? ++refreshRun : refreshRun;
    const analitico = ui.isAnaliticoMode();
    const giro = !analitico && ui.isGiroMode();
    const required = new Set(ui.requiredKeys());
    const missing = fields.filter(field => required.has(field.key) && !ui.isMapped(field.key));
    if (missing.length) { state.results = []; el('#results-section').hidden = true; el('#total-value').hidden = true; ui.setConfigExpanded(true); message(`Selecione as colunas: ${missing.map(field => field.label).join(', ')}.`, 'error'); return; }
    const selected = fields.map(field => state.mapping[field.key]).filter(value => value >= 0);
    if (new Set(selected).size !== selected.length) { state.results = []; el('#results-section').hidden = true; el('#total-value').hidden = true; ui.setConfigExpanded(true); message('Cada dado deve usar uma coluna diferente.', 'error'); return; }
    if (reanalyze) {
      const rows = ui.dataRows();
      const mapping = { ...state.mapping };
      const settings = { ...state.settings[ui.currentMode()], numberFormat: state.numberFormat, purchases: state.purchases?.byItem ?? null };
      const analyzeChunk = chunk => {
        const cells = chunk.map(entry => entry.cells);
        const results = analitico ? analyzeAnalitico(cells, mapping, 2, settings)
          : giro ? analyzeGiro(cells, mapping, settings) : analyze(cells, mapping, settings);
        return results.map((result, index) => ({ ...result, row: chunk[index].row }));
      };
      if (rows.length > 1000) message(`Analisando ${rows.length.toLocaleString('pt-BR')} linhas...`);
      const analyzed = await processInChunks(rows, analyzeChunk, {
        firstRow: ui.currentSheet().headerRow + 2,
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
    renderOverview(summaryAllResults, analitico);
    state.overview = { summaryAllResults, locationTotal: summarizeLocationTotal(summaryAllResults, state.locationFilter), analitico, giro };
    const hiddenCount = summaryAllResults.filter(row => row.hidden).length;
    const locationTotal = summarizeLocationTotal(summaryAllResults, state.locationFilter);
    const previousFilter = state.pendingActionFilter || el('#filter').value;
    state.pendingActionFilter = '';
    el('#summary').innerHTML = buildSummaryMarkup({
      summaryResults,
      summaryAllResults,
      actions: analitico ? [...ANALITICO_ACTIONS, 'Itens ocultos'] : giro ? GIRO_ACTIONS : GENERIC_ACTIONS,
      // Com os ocultos já na tabela, o atalho "Ver N itens sem ação" seria redundante.
      counts: el('#show-hidden').checked && !state.hiddenOnly ? counts.filter(({ action }) => action !== 'Itens ocultos') : counts,
      values: ui.isMapped('stockValue') ? new Map(actionValues(summaryResults, availableActions, analitico).map(({ action, value }) => [action, value])) : null,
      analitico,
      locationFilter: state.locationFilter,
      locationTotal,
      shelfFilter: state.shelfFilter,
      partitionFilter: state.partitionFilter,
    });
    const totalMarkup = buildTotalMarkup({ summaryAllResults, locationFilter: state.locationFilter, locationTotal, shelfFilter: state.shelfFilter, partitionFilter: state.partitionFilter });
    el('#total-value').innerHTML = totalMarkup;
    el('#total-value').hidden = !totalMarkup;
    if (totalMarkup) ui.countUp('total', el('#total-value strong'), Number(locationTotal) || 0, realCurrency);
    el('#summary').querySelectorAll('.summary-card').forEach(card => {
      const strong = card.querySelector('.summary-value strong');
      ui.countUp(`card:${card.dataset.summaryAction ?? 'total'}`, strong, Number(strong.textContent) || 0, value => String(Math.round(value)));
    });
    el('#filter').innerHTML = `<option value="">${analitico ? 'Todas as ações' : 'Todas as recomendações'}</option>` + availableActions.map(action => `<option>${escapeHtml(action)}</option>`).join('');
    el('#filter').value = availableActions.includes(previousFilter) ? previousFilter : '';
    el('#filter').setAttribute('aria-label', 'Filtrar ação');
    el('#result-table').className = analitico ? 'analitico-table' : 'standard-table';
    state.columns = ui.resultColumns(analitico, giro);
    if (!state.columns.some(column => column.key === state.sortKey)) {
      state.sortKey = '';
      state.sortDirection = 'asc';
    }
    ui.renderTableHead();
    renderDataQuality(summaryResults);
    renderHiddenToggle(hiddenCount);
    message('');
    ui.renderResults();
    ui.persistFilters();
    ui.persistImport();
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
    if (state.agingFilter) parts.push(`Sem requisição: ${AGING_BUCKETS.find(bucket => bucket.key === state.agingFilter)?.label ?? ''}`);
    const sortedColumn = state.columns.find(column => column.key === state.sortKey);
    if (sortedColumn) parts.push(`Ordem: ${sortedColumn.sortLabel || sortedColumn.label} (${state.sortDirection === 'asc' ? 'crescente' : 'decrescente'})`);
    // Itens ocultos ganham um aviso próprio, ao lado do contador, que desliga com um clique.
    const showingHidden = el('#show-hidden').checked && ui.isAnaliticoMode();
    el('#hidden-chip').hidden = !showingHidden;
    el('#hidden-chip-text').textContent = state.hiddenOnly ? 'Somente itens ocultos' : 'Itens ocultos incluídos';
    ui.updateViewDot();
    el('#active-filters').hidden = parts.length === 0;
    el('#active-filters-text').textContent = parts.length ? `${parts.join(' · ')} · ${filteredCount} ${filteredCount === 1 ? 'item' : 'itens'}` : '';
  }
  el('#location-filter').addEventListener('change', () => {
    state.locationFilter = el('#location-filter').value;
    state.page = 1;
    ui.withTransition(() => refresh({ reanalyze: false }));
  });
  el('#hidden-chip').addEventListener('click', () => {
    el('#show-hidden').checked = false;
    state.hiddenOnly = false;
    state.agingRevealedHidden = false;
    state.page = 1;
    refresh({ reanalyze: false });
  });
  el('#show-hidden').addEventListener('change', () => {
    state.page = 1;
    if (!el('#show-hidden').checked) state.hiddenOnly = false;
    refresh({ reanalyze: false });
  });
  for (const [selector, key] of [['#shelf-filter', 'shelfFilter'], ['#partition-filter', 'partitionFilter']]) {
    el(selector).addEventListener('change', event => {
      state[key] = event.target.value;
      state.page = 1;
      ui.withTransition(() => refresh({ reanalyze: false }));
    });
  }
  el('#summary').addEventListener('click', event => {
    const card = event.target.closest('.summary-filter');
    if (!card) return;
    state.page = 1;
    if (card.hasAttribute('data-summary-hidden')) {
      state.hiddenOnly = true;
      el('#show-hidden').checked = true;
      el('#filter').value = '';
      ui.withTransition(() => refresh({ reanalyze: false }));
      return;
    }
    state.hiddenOnly = false;
    el('#filter').value = card.dataset.summaryAction ?? '';
    ui.withTransition(() => { ui.renderResults(); ui.persistFilters(); });
  });
  el('#aging-chart-bars').addEventListener('click', event => {
    const bar = event.target.closest('[data-aging]');
    if (!bar) return;
    const previous = state.agingFilter;
    state.agingFilter = previous === bar.dataset.aging ? '' : bar.dataset.aging;
    state.page = 1;
    // A faixa conta todos os itens com saldo; mostra os ocultos para a tabela bater com o gráfico
    // e volta a escondê-los ao sair do filtro, se estavam escondidos antes.
    if (state.agingFilter) {
      if (!previous) state.agingRevealedHidden = !el('#show-hidden').checked;
      el('#show-hidden').checked = true;
      state.hiddenOnly = false;
    } else if (state.agingRevealedHidden) {
      el('#show-hidden').checked = false;
      state.agingRevealedHidden = false;
    }
    ui.withTransition(() => refresh({ reanalyze: false }));
  });
  el('#clear-filters').addEventListener('click', () => {
    state.page = 1;
    state.locationFilter = '';
    state.shelfFilter = '';
    state.partitionFilter = '';
    state.hiddenOnly = false;
    state.agingFilter = '';
    state.sortKey = '';
    state.sortDirection = 'asc';
    el('#search').value = '';
    el('#filter').value = '';
    el('#show-hidden').checked = false;
    ui.withTransition(() => refresh({ reanalyze: false }));
  });
  return { renderDataQuality, renderOverview, renderHiddenToggle, updatePositionFilters, refresh, updateSummarySelection, renderActiveFilters };
}
