// Tabela de resultados: colunas, linhas, busca, paginação, ordenação e agrupamento.
import { agingBucket, formatNumber } from '../analysis.js';
import { PAGE_SIZE, filterResults, paginate, sortResults } from '../dashboard.js';
import { svgIcon } from '../icons.js';
import { badgeHtml, buyHint, codeHtml, columnClass, detailsHtml, displayItemName, emptyStateHtml, escapeHtml, itemCurrency, positionHtml, purchaseHint, slug, urgentAction } from './markup.js';

export function createTable(ui) {
  const { state, el, message } = ui;
  let searchRenderFrame = 0;
  const desktopQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;
  function setSearchExpanded(expanded) {
    expanded = expanded || Boolean(desktopQuery?.matches);
    el('#search-control').classList.toggle('is-expanded', expanded);
    el('#search-toggle').setAttribute('aria-expanded', String(expanded));
    el('#search-expansion').inert = !expanded;
  }
  function renderTableHead() {
    el('#table-head').innerHTML = `<tr>${state.columns.map(column => {
      const selected = state.sortKey === column.key;
      const ariaSort = selected ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
      const direction = selected ? (state.sortDirection === 'asc' ? 'decrescente' : 'crescente') : 'crescente';
      return `<th class="${columnClass(column.key)}" scope="col" aria-sort="${ariaSort}"><button type="button" class="sort-button" data-sort-key="${column.key}" aria-label="Ordenar por ${escapeHtml(column.sortLabel || column.label)}, ordem ${direction}"${column.hint ? ` title="${escapeHtml(column.hint)}"` : ''}>${escapeHtml(column.label)}</button></th>`;
    }).join('')}</tr>`;
  }
  const expandedRows = new Set();
  let expansionVersion = 0;
  let descriptionFrame = 0;
  function expansionAttributes(row, type) {
    const key = `${expansionVersion}:${state.sheet}:${ui.currentMode()}:${row.row}:${type}`;
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
    const name = row.item || `Linha ${row.row}`;
    return `<details class="item-description${expanded ? ' is-expandable' : ''}" ${attributes}><summary><strong title="${escapeHtml(name)}">${escapeHtml(displayItemName(name))}</strong></summary></details>`;
  }
  function updateDescriptionControls() {
    const measurements = [...el('#result-rows').querySelectorAll('.item-description:not([open])')].map(details => {
      const text = details.querySelector('strong');
      return { details, expandable: text.scrollHeight > text.clientHeight + 1 };
    });
    measurements.forEach(({ details, expandable }) => {
      details.classList.toggle('is-expandable', expandable);
      // Descrição curta não tem o que abrir: sai da ordem do Tab e o clique vai para a linha (detalhes).
      details.querySelector('summary').tabIndex = expandable ? 0 : -1;
    });
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
    const base = state.agingFilter ? state.results.filter(row => agingBucket(row) === state.agingFilter) : state.results;
    const sorted = sortResults(filterResults(base, {
      query: el('#search').value,
      action: el('#filter').value,
      location: state.locationFilter,
      shelf: state.shelfFilter,
      partition: state.partitionFilter,
      analitico: ui.isAnaliticoMode(),
      hiddenOnly: state.hiddenOnly,
    }), { key: state.sortKey, direction: state.sortDirection });
    if (!state.grouped) return sorted;
    return sorted.sort((a, b) => (state.actionRank.get(primaryAction(a)) ?? 99) - (state.actionRank.get(primaryAction(b)) ?? 99));
  }
  function renderResults() {
    rememberExpansions();
    const query = el('#search').value.trim().toLowerCase();
    if (query) setSearchExpanded(true);
    else if (!el('#search-control').contains(document.activeElement)) setSearchExpanded(false);
    const filter = el('#filter').value;
    const analitico = ui.isAnaliticoMode();
    const giro = !analitico && ui.isGiroMode();
    const filtered = visibleResults();
    const page = paginate(filtered, state.page, state.pageSize);
    state.page = page.page;
    const { pageCount, start, rows: visible } = page;
    state.pageRows = visible;
    // Barra na célula de valor: proporcional ao maior valor dos itens filtrados.
    let largestValue = 0;
    let filteredValue = 0;
    if (analitico || giro) for (const row of filtered) {
      const value = Number(row.stockValue) || 0;
      if (value > largestValue) largestValue = value;
      if (value > 0) filteredValue += value;
    }
    const valueCell = value => {
      const numeric = Number(value) || 0;
      if (!largestValue || numeric <= 0) return itemCurrency(value);
      const share = filteredValue ? Math.round((numeric / filteredValue) * 1000) / 10 : 0;
      return `<span class="value-cell" title="${String(share).replace('.', ',')}% do valor dos itens filtrados · barra comparada ao maior valor">${itemCurrency(value)}<span class="value-bar" aria-hidden="true"><span style="width:${Math.max((numeric / largestValue) * 100, 2).toFixed(1)}%"></span></span></span>`;
    };
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
        rowsHtml.push(`<tr data-row="${row.row}" class="${rowClass(row, row.actions.some(urgentAction) && 'urgent-row')}"><td>${descriptionHtml(row)}${hiddenTag}</td><td>${codeHtml(row.sku)}</td><td>${positionHtml(row)}</td><td>${formatNumber(row.stock)}</td><td>${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}${buyHint(row)}</td><td>${valueCell(row.stockValue)}</td><td>${row.actions.map(badgeHtml).join(' ')}${purchaseHint(row)}</td><td class="reason"><div class="cell-details"><span class="days">${row.daysSince === null || row.daysSince === undefined ? '—' : `${formatNumber(row.daysSince)} dias`}</span>${detailsHtml(row.reason, row)}</div></td></tr>`);
      } else {
        rowsHtml.push(`<tr data-row="${row.row}" class="${rowClass(row)}"><td><strong title="${escapeHtml(row.item || `Linha ${row.row}`)}">${escapeHtml(displayItemName(row.item || `Linha ${row.row}`))}</strong>${codeHtml(row.sku)}<small>${escapeHtml([row.branch, row.location, row.localCode && `Local ${row.localCode}`].filter(Boolean).join(' · ') || `Linha ${row.row}`)}</small></td><td>${giro ? valueCell(row.stockValue) : formatNumber(row.stock)}</td><td>${giro ? itemCurrency(row.consumption) : formatNumber(row.sales)}</td><td>${row.coverage === null ? '—' : `${formatNumber(row.coverage)} dias`}</td><td>${badgeHtml(row.action)}</td><td class="reason">${detailsHtml(row.reason, row)}</td></tr>`);
      }
    }
    el('#result-rows').classList.toggle('rows-enter', Boolean(state.animateRows) && !ui.reducedMotion());
    state.animateRows = false;
    const anyFilter = Boolean(query || filter || state.locationFilter || state.shelfFilter || state.partitionFilter || state.agingFilter || state.hiddenOnly);
    const hiddenCount = el('#show-hidden').checked ? 0 : state.allResults.length - state.results.length;
    el('#result-rows').innerHTML = visible.length ? rowsHtml.join('') : `<tr><td class="empty-row" colspan="${state.columns.length}">${emptyStateHtml({ filtered: anyFilter, hiddenCount })}</td></tr>`;
    el('#result-rows').querySelectorAll('tr').forEach(tr => {
      if (tr.querySelector('.empty-row') || tr.classList.contains('group-row')) return;
      [...tr.children].forEach((cell, index) => cell.classList.add(columnClass(state.columns[index].key)));
    });
    scheduleDescriptionControls();
    descriptionObserver?.disconnect();
    el('#result-rows').querySelectorAll('.item-description strong').forEach(text => descriptionObserver?.observe(text));
    const itemLabel = filtered.length === 1 ? 'item' : 'itens';
    const filterLabel = query || filter || state.locationFilter || state.shelfFilter || state.partitionFilter || state.hiddenOnly || state.agingFilter ? filtered.length === 1 ? ' filtrado' : ' filtrados' : '';
    el('#page-status').textContent = filtered.length ? `${start + 1}–${start + visible.length} de ${filtered.length} ${itemLabel}${filterLabel}` : 'Nenhum item encontrado';
    // Contador: o texto acessível muda direto; o visível sobe ou desce até o novo número
    // quando só os filtros mudaram (mesma planilha).
    const totalText = `${state.allResults.length.toLocaleString('pt-BR')} ${state.allResults.length === 1 ? 'item' : 'itens'}`;
    const countText = count => `${Math.round(count).toLocaleString('pt-BR')} de ${totalText}`;
    el('#filtered-count').textContent = countText(filtered.length);
    el('#filtered-count-sr').textContent = countText(filtered.length);
    if (state.countedTotal !== state.allResults.length) ui.resetFilteredCount(filtered.length);
    ui.countUp('filtered', el('#filtered-count'), filtered.length, countText);
    state.countedTotal = state.allResults.length;
    el('#pagination').hidden = pageCount <= 1;
    el('#page-label').textContent = `Página ${state.page} de ${pageCount}`;
    el('#page-previous').disabled = state.page === 1;
    el('#page-next').disabled = state.page === pageCount;
    ui.updateSummarySelection();
    ui.renderActiveFilters(filtered.length);
  }
  el('#search').addEventListener('input', () => {
    state.page = 1;
    cancelAnimationFrame(searchRenderFrame);
    searchRenderFrame = requestAnimationFrame(() => { renderResults(); ui.persistFilters(); });
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
  el('#filter').addEventListener('change', () => { state.page = 1; state.hiddenOnly = false; ui.withTransition(() => { renderResults(); ui.persistFilters(); }); });
  function changePage(direction) {
    state.page += direction;
    state.animateRows = true;
    renderResults();
    el('.table-tools').scrollIntoView({ block: 'start' });
  }
  el('#page-previous').addEventListener('click', () => changePage(-1));
  el('#page-next').addEventListener('click', () => changePage(1));
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable]') || el('#workspace').hidden || el('#item-panel').open || ui.shortcutsOpen()) return;
    event.preventDefault();
    setSearchExpanded(true);
    el('#search').focus({ preventScroll: true });
  });
  // Coluna fixa ganha sombra na borda depois que a tabela rola de lado.
  const tableScroll = el('.table-scroll');
  tableScroll.addEventListener('scroll', () => tableScroll.classList.toggle('is-scrolled-x', tableScroll.scrollLeft > 0), { passive: true });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => document.documentElement.style.setProperty('--tools-height', `${el('.table-tools').offsetHeight}px`)).observe(el('.table-tools'));
  }
  desktopQuery?.addEventListener?.('change', () => setSearchExpanded(Boolean(el('#search').value.trim())));
  el('#page-size').addEventListener('change', event => {
    state.pageSize = [25, 50, 100].includes(Number(event.target.value)) ? Number(event.target.value) : PAGE_SIZE;
    state.page = 1;
    renderResults();
    ui.persistFilters();
  });
  el('#result-rows').addEventListener('click', event => {
    const emptyAction = event.target.closest('[data-empty-action]');
    if (emptyAction) {
      if (emptyAction.dataset.emptyAction === 'clear') el('#clear-filters').click();
      else {
        el('#show-hidden').checked = true;
        el('#show-hidden').dispatchEvent(new Event('change'));
      }
      return;
    }
    const copy = event.target.closest('[data-copy-code]');
    if (copy) { ui.copyCode(copy); return; }
    const groupRow = event.target.closest('tr.group-row');
    if (groupRow) {
      const group = groupRow.querySelector('[data-group-toggle]').dataset.groupToggle;
      if (event.target.closest('[data-group-export]')) {
        ui.exportXlsx(visibleResults().filter(row => primaryAction(row) === group), group).catch(error => message(error.message || 'Não foi possível exportar o grupo.', 'error'));
        return;
      }
      if (state.collapsedGroups.has(group)) state.collapsedGroups.delete(group);
      else state.collapsedGroups.add(group);
      renderResults();
      return;
    }
    if (event.target.closest('a, input, select')) return;
    const summary = event.target.closest('summary');
    if (summary) {
      if (summary.closest('.item-description')?.classList.contains('is-expandable') || summary.closest('details')?.open) return;
      event.preventDefault(); // descrição curta: não abre o <details>, abre os detalhes do item como o resto da linha
    }
    const line = event.target.closest('tr[data-row]');
    const trigger = event.target.closest('[data-detail-row]') ?? line?.querySelector('[data-detail-row]');
    if (!trigger) return;
    const row = state.results.find(item => String(item.row) === trigger.dataset.detailRow);
    if (row) ui.openItemPanel(row, trigger);
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
    ui.persistFilters();
  });
  // Nova planilha: descrições abertas da importação anterior não valem mais.
  function resetExpansions() {
    expansionVersion++;
    expandedRows.clear();
  }
  return { renderTableHead, visibleResults, renderResults, resetExpansions };
}
