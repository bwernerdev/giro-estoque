// Preferências guardadas no navegador: tema, densidade, zebrado, agrupar, resumo recolhido
// e filtros da tabela.
import { PAGE_SIZE, resetDashboardState } from '../dashboard.js';
import { svgIcon } from '../icons.js';

export function createPreferences(ui) {
  const { state, el } = ui;
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
  // Resumo recolhido: ficam só os valores em reais e o filtro de ação aparece na barra da tabela.
  let summaryAnimation = null;
  function setSummaryCollapsed(collapsed, animate = false) {
    document.documentElement.dataset.summary = collapsed ? 'collapsed' : 'expanded';
    const body = el('#overview-body');
    // Altura animada do ponto atual (inclusive no meio de outra animação) até o destino.
    const from = body.hidden ? 0 : body.getBoundingClientRect().height;
    summaryAnimation?.cancel();
    summaryAnimation = null;
    body.hidden = false;
    if (!animate || ui.reducedMotion() || typeof body.animate !== 'function') {
      body.hidden = collapsed;
      body.style.overflow = '';
    } else {
      const to = collapsed ? 0 : body.getBoundingClientRect().height;
      body.style.overflow = 'hidden';
      const animation = body.animate(
        [{ height: `${from}px`, opacity: collapsed ? 1 : 0 }, { height: `${to}px`, opacity: collapsed ? 0 : 1 }],
        { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      );
      summaryAnimation = animation;
      // Um clique no meio da animação cancela esta; só a mais recente encerra o estado.
      animation.onfinish = () => {
        if (summaryAnimation !== animation) return;
        body.hidden = collapsed;
        body.style.overflow = '';
        summaryAnimation = null;
      };
    }
    el('#summary-toggle').setAttribute('aria-expanded', String(!collapsed));
    el('#summary-toggle').innerHTML = `${svgIcon(collapsed ? 'chevronDown' : 'chevronUp')}<span>${collapsed ? 'Mostrar resumo' : 'Recolher resumo'}</span>`;
  }
  try { setSummaryCollapsed(localStorage.getItem('giro-estoque-summary') === 'collapsed'); } catch { setSummaryCollapsed(false); }
  el('#summary-toggle').addEventListener('click', () => {
    const collapsed = document.documentElement.dataset.summary !== 'collapsed';
    setSummaryCollapsed(collapsed, true);
    try { localStorage.setItem('giro-estoque-summary', collapsed ? 'collapsed' : 'expanded'); } catch { /* A escolha vale até fechar a página. */ }
  });
  // Bolinha no botão Exibir quando alguma opção que muda a tabela está ligada.
  function updateViewDot() {
    const on = document.documentElement.dataset.rows === 'striped' || state.grouped || (el('#show-hidden').checked && ui.isAnaliticoMode());
    el('#view-dot').hidden = !on;
  }
  function setStripedRows(striped) {
    document.documentElement.dataset.rows = striped ? 'striped' : 'plain';
    el('#stripe-toggle').setAttribute('aria-pressed', String(striped));
    updateViewDot();
  }
  try { setStripedRows(localStorage.getItem('controle-estoque-rows') === 'striped'); } catch { setStripedRows(false); }
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
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
      }));
    } catch { /* Os filtros permanecem válidos até fechar a página. */ }
  }
  // Filtros lembrados (busca, ação, posição, página, ordem) ao abrir uma planilha.
  function applyFilterPreferences() {
    const savedFilters = readFilterPreferences();
    // Itens ocultos não são lembrados: cada importação começa só com os itens com ação.
    el('#show-hidden').checked = false;
    state.agingRevealedHidden = false;
    el('#search').value = typeof savedFilters.query === 'string' ? savedFilters.query : '';
    el('#filter').value = '';
    resetDashboardState(state);
    state.locationFilter = typeof savedFilters.location === 'string' ? savedFilters.location : '';
    state.shelfFilter = typeof savedFilters.shelf === 'string' ? savedFilters.shelf : '';
    state.partitionFilter = typeof savedFilters.partition === 'string' ? savedFilters.partition : '';
    state.pageSize = [25, 50, 100].includes(Number(savedFilters.pageSize)) ? Number(savedFilters.pageSize) : PAGE_SIZE;
    el('#page-size').value = String(state.pageSize);
    state.hiddenOnly = false;
    state.sortKey = typeof savedFilters.sortKey === 'string' ? savedFilters.sortKey : '';
    state.sortDirection = savedFilters.sortDirection === 'desc' ? 'desc' : 'asc';
    state.pendingActionFilter = typeof savedFilters.action === 'string' ? savedFilters.action : '';
  }
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
  el('#group-toggle').addEventListener('click', () => {
    state.grouped = !state.grouped;
    state.page = 1;
    el('#group-toggle').setAttribute('aria-pressed', String(state.grouped));
    try { localStorage.setItem('controle-estoque-group', state.grouped ? 'on' : 'off'); } catch { /* A escolha vale até fechar a página. */ }
    ui.renderResults();
  });
  return { setTheme, setDensity, setSummaryCollapsed, updateViewDot, setStripedRows, readFilterPreferences, persistFilters, applyFilterPreferences };
}
