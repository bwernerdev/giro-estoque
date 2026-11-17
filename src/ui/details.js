// Detalhes do item: gaveta (dialog#item-panel) ou painel fixo à direita (≥1700 px), cópia do código.
import { formatNumber, purchaseRequestText, scCoverageText, stockLocation } from '../analysis.js';
import { svgIcon } from '../icons.js';
import { escapeHtml, realCurrency } from './markup.js';

export function createDetails(ui) {
  const { state, el } = ui;
  function limitsText(row) {
    if (row.minimum === null || row.minimum === undefined || row.maximum === null || row.maximum === undefined) return formatNumber(row.stock);
    const status = row.stock < row.minimum ? 'abaixo do mínimo' : row.stock > row.maximum ? 'acima do máximo' : 'dentro dos limites';
    return `${formatNumber(row.stock)} · mín. ${formatNumber(row.minimum)} / máx. ${formatNumber(row.maximum)} (${status})`;
  }
  function detailFields(reason, row) {
    const entries = [];
    const add = (label, value, html = false) => { if (value !== '' && value !== null && value !== undefined) entries.push({ label, value, html }); };
    const filled = value => value !== null && value !== undefined;
    if (ui.isAnaliticoMode()) {
      const elapsed = filled(row.daysSince) ? `${formatNumber(row.daysSince)} dias desde a última requisição` : '';
      const notes = reason.split(' · ').filter(part => part !== elapsed && part !== row.blockReason && part !== `Id Bloqueio: ${row.blockId}`).join(' · ');
      add('Ação recomendada', row.actions?.length ? row.actions.map(ui.badgeHtml).join(' ') : '', true);
      add(reason.startsWith('Corrigir na planilha:') ? 'Dados a revisar' : 'Por que', notes);
      add('Saldo', limitsText(row));
      add('Sugestão de compra', filled(row.toBuy) ? `${formatNumber(row.toBuy)} (até o máximo${filled(row.onOrder) ? `, descontado o que está em SC aberta` : ''})` : '');
      add('Em SC aberta', filled(row.onOrder) ? `${formatNumber(row.onOrder)} a receber` : '');
      add(row.scCoverage && !row.scCoverage.sufficient ? 'SC insuficiente' : 'Cobertura da SC', scCoverageText(row.scCoverage));
      add('Solicitação de compra', [purchaseRequestText(row.purchase), row.purchase?.supplier && `fornecedor ${row.purchase.supplier}`].filter(Boolean).join(' · '));
      add('Valor do saldo', filled(row.stockValue) ? realCurrency(row.stockValue) : '');
      add('Média de consumo', filled(row.averageConsumption) ? formatNumber(row.averageConsumption) : '');
      add('Giro do estoque', filled(row.coverage) ? `${formatNumber(row.coverage)} dias` : '');
      add('Classificação', row.classification);
      add('Última requisição', row.lastRequest);
      add('Tempo sem requisição', elapsed);
      add('Bloqueio', [...new Set([row.blockReason, row.blockId].filter(Boolean))].join(' · '));
    } else {
      add('Motivo da ação', reason);
    }
    return `<dl class="detail-fields">${entries.map(({ label, value, html }) => `<div><dt>${escapeHtml(label)}</dt><dd>${html ? value : escapeHtml(value)}</dd></div>`).join('')}</dl>`;
  }
  function detailsHtml(reason, row) {
    if (!reason) return '<span class="no-details">—</span>';
    return `<button type="button" class="icon-button details-button" data-detail-row="${row.row}" aria-haspopup="dialog" aria-label="Ver detalhes" title="Ver detalhes">${svgIcon('chevronRight')}</button>`;
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
    parts.content.innerHTML = `<strong class="panel-item-name">${escapeHtml(row.item || `Linha ${row.row}`)}</strong>${row.sku ? `<div class="panel-item-code"><span>Código</span>${ui.codeHtml(row.sku)}</div>` : ''}${identity ? `<p class="panel-item-location">${escapeHtml(identity)}</p>` : ''}${detailFields(row.reason, row)}`;
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
  return { limitsText, detailFields, detailsHtml, panelParts, clearDock, closeItemPanel, fillItemPanel, detailRows, openItemPanel, stepItemPanel, copyCode, docked };
}
