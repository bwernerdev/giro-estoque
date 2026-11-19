// Contexto do app: estado da tela e utilidades comuns. Criado a cada carga de main.js
// (os testes recarregam o app com estado limpo); os módulos de src/ui/ acrescentam suas funções.
import { PAGE_SIZE } from '../dashboard.js';

export function createContext() {
  const state = {
    sheets: [], sheet: 0, mapping: {}, allResults: [], results: [],
    page: 1, locationFilter: '', hiddenOnly: false, fileName: '', importedAt: null,
    // SNAC0540 importado: { fileName, importedAt, requests, byItem } ou null.
    purchases: null,
    shelfFilter: '', partitionFilter: '', pageSize: PAGE_SIZE,
    mode: 'auto',
    numberFormat: 'pt-BR',
    sortKey: '',
    sortDirection: 'asc',
    columns: [],
    pageRows: [],
    grouped: false,
    agingFilter: '',
    collapsedGroups: new Set(),
    actionOrder: [],
    actionRank: new Map(),
    pendingActionFilter: '',
    settings: {
      generic: { safetyDays: '7', excessDays: '90', defaultLead: '7' },
      giro: { shortDays: '30', excessDays: '90', longDays: '365' },
    },
  };
  const el = selector => document.querySelector(selector);
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
  // Aviso flutuante e curto (exportação concluída, código copiado...). Some sozinho; um novo
  // aviso substitui o anterior. A região tem role=status, então o leitor de tela também lê.
  let toastTimer = 0;
  function toast(text, type = 'success') {
    const box = el('#toast');
    if (!box) return;
    clearTimeout(toastTimer);
    box.className = `toast is-${type}`;
    el('#toast-text').textContent = text;
    box.hidden = false;
    void box.offsetWidth; // aplica o estado inicial antes da transição de entrada
    box.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      box.classList.remove('is-visible');
      toastTimer = setTimeout(() => { box.hidden = true; }, 220);
    }, 3200);
  }
  return { state, el, setProgress, message, toast };
}
