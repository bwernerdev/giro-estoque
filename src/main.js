import { importFile } from './import.js';
import { analyze, analyzeAnalitico, analyzeGiro, fields, findHeaderRow, formatNumber, normalize, normalizeLocalKey, suggestMapping, summarizeLocationTotal } from './analysis.js';

const app = document.querySelector('#app');
const PAGE_SIZE = 50;
const state = { sheets: [], sheet: 0, mapping: {}, allResults: [], results: [], fileName: '', page: 1, locationFilter: '' };

function realCurrency(value) {
  const numeric = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numeric);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div class="brand"><span class="brand-mark">↗</span><span>CONTROLE<span class="brand-light"> DE ESTOQUE</span></span></div><button id="theme-toggle" class="theme-toggle" type="button" aria-pressed="false">☾ Modo escuro</button></header>
    <main>
      <section class="hero"><div class="eyebrow"><span class="eyebrow-dot"></span> ANÁLISE DE MATERIAIS</div><h1>Entenda o giro<br>de cada <em>item.</em></h1><p>Consulte quantidades, limites, classificação e ações por item.</p></section>
      <section class="upload-card" id="upload-card"><div class="upload-icon">⇧</div><div><h2>Importar planilha</h2><p>Arraste um arquivo aqui ou selecione no computador</p><small>Excel .xlsx ou CSV · análise local no navegador</small></div><label class="primary-button" for="file-input">Selecionar arquivo <span>→</span></label><input id="file-input" type="file" accept=".xlsx,.csv" hidden></section>
      <div id="message" role="status" aria-live="polite"></div>
      <section id="workspace" hidden>
        <div class="section-head"><div><h2>Preparar análise</h2></div><div class="config-actions"><button id="config-toggle" class="secondary-button config-toggle" type="button" aria-controls="config-grid" aria-expanded="false">Abrir configuração ▾</button><span id="file-name" class="file-pill"></span></div></div>
        <div id="config-grid" class="config-grid" hidden><div class="panel"><h3>Colunas da planilha</h3><p class="panel-intro">Confirme quais colunas contêm os dados de cada item.</p><div id="mapping" class="mapping-grid"></div></div>
        <div class="panel" id="criteria-panel"><h3>Critérios de decisão</h3><p class="panel-intro" id="criteria-intro">Ajuste os limites de cobertura para sua operação.</p><div class="settings-grid" id="settings-grid"></div><p class="formula-note" id="formula-note"></p></div></div>
        <section id="results-section" class="results-section"><div class="section-head"><div><span class="section-kicker">RESULTADOS</span><h2>Visão dos itens</h2></div></div><div id="summary" class="summary-grid"></div><div class="table-panel"><div class="table-tools"><label class="search-label">⌕ <input id="search" type="search" placeholder="Buscar item ou código"></label><div class="table-filters"><select id="location-filter" aria-label="Filtrar local de estoque"><option value="">Todos os locais</option></select><select id="filter" aria-label="Filtrar recomendação"><option value="">Todas as recomendações</option></select><label id="hidden-toggle" class="hidden-toggle" hidden><input id="show-hidden" type="checkbox"> Mostrar itens ocultos</label><details id="export-menu" class="export-menu"><summary class="secondary-button">Exportar ▾</summary><div class="export-options"><button type="button" data-export="xlsx">Excel (.xlsx)</button><button type="button" data-export="pdf">PDF (salvar/imprimir)</button><button type="button" data-export="csv">CSV (.csv)</button></div></details></div></div><div class="table-scroll"><table id="result-table"><thead id="table-head"></thead><tbody id="result-rows"></tbody></table></div><div id="table-footer" class="table-footer"><span id="page-status"></span><nav id="pagination" class="pagination" aria-label="Páginas de resultados" hidden><button id="page-previous" type="button">Anterior</button><span id="page-label"></span><button id="page-next" type="button">Próxima</button></nav></div></div></section>
      </section>
    </main>
  </div><section id="print-report" aria-hidden="true"></section>`;

const el = selector => document.querySelector(selector);
function setTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  el('#theme-toggle').textContent = dark ? '☀ Modo claro' : '☾ Modo escuro';
  el('#theme-toggle').setAttribute('aria-pressed', String(dark));
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#080e17' : '#0b1725');
}
try { setTheme(localStorage.getItem('giro-estoque-theme')); } catch { setTheme('light'); }
function message(text, error = false) { el('#message').textContent = text; el('#message').className = text ? (error ? 'message error' : 'message') : ''; }
function setConfigExpanded(expanded) {
  el('#config-grid').hidden = !expanded;
  el('#config-toggle').setAttribute('aria-expanded', String(expanded));
  el('#config-toggle').textContent = expanded ? 'Fechar configuração ▴' : 'Abrir configuração ▾';
}
function currentSheet() { return state.sheets[state.sheet]; }
function dataRows() { return currentSheet().rows.slice(currentSheet().headerRow + 1).filter(row => row.some(value => String(value ?? '').trim()) && (state.mapping.item < 0 || String(row[state.mapping.item] ?? '').trim())); }

function isGiroMode() { return state.mapping.stockValue >= 0 && state.mapping.consumption >= 0; }
function isAnaliticoMode() { return state.mapping.stock >= 0 && state.mapping.classification >= 0; }
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
  el('#mapping').innerHTML = `<label class="sheet-select">Aba<select id="sheet-select">${state.sheets.map((sheet, i) => `<option value="${i}" ${i === state.sheet ? 'selected' : ''}>${escapeHtml(sheet.name)}</option>`).join('')}</select></label>` + fields.filter(field => state.mapping[field.key] >= 0 || ['item', 'sku', 'stock'].includes(field.key)).map(field => `<label>${field.label}${(field.key === 'item' || (isAnaliticoMode() && ['stock', 'classification'].includes(field.key)) || (!isAnaliticoMode() && !isGiroMode() && ['stock', 'sales'].includes(field.key))) ? ' <span class="required">*</span>' : ''}<select data-map="${field.key}"><option value="-1">Não selecionar</option>${headers.map((header, i) => `<option value="${i}" ${state.mapping[field.key] === i ? 'selected' : ''}>${escapeHtml(header || `Coluna ${i + 1}`)}</option>`).join('')}</select></label>`).join('');
  el('#sheet-select').addEventListener('change', event => { state.sheet = Number(event.target.value); state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []); renderMapping(); renderSettings(); refresh(); });
  el('#mapping').querySelectorAll('[data-map]').forEach(select => select.addEventListener('change', () => { state.mapping[select.dataset.map] = Number(select.value); renderSettings(); refresh(); }));
}

function refresh() {
  const analitico = isAnaliticoMode();
  const giro = !analitico && isGiroMode();
  const missing = fields.filter(field => (field.key === 'item' || (analitico && ['stock', 'classification'].includes(field.key)) || (!analitico && !giro && ['stock', 'sales'].includes(field.key))) && state.mapping[field.key] < 0);
  if (missing.length) { state.results = []; el('#results-section').hidden = true; setConfigExpanded(true); message(`Selecione as colunas: ${missing.map(field => field.label).join(', ')}.`, true); return; }
  const selected = fields.map(field => state.mapping[field.key]).filter(value => value >= 0);
  if (new Set(selected).size !== selected.length) { state.results = []; el('#results-section').hidden = true; setConfigExpanded(true); message('Cada dado deve usar uma coluna diferente.', true); return; }
  state.allResults = analitico
    ? analyzeAnalitico(dataRows(), state.mapping, currentSheet().headerRow + 2)
    : giro
      ? analyzeGiro(dataRows(), state.mapping, { shortDays: el('#short-days').value, excessDays: el('#excess-days').value, longDays: el('#long-days').value }, currentSheet().headerRow + 2)
      : analyze(dataRows(), state.mapping, { safetyDays: el('#safety-days').value, excessDays: el('#excess-days').value, defaultLead: el('#default-lead').value }, currentSheet().headerRow + 2);
  state.results = analitico && !el('#show-hidden').checked ? state.allResults.filter(row => !row.hidden) : state.allResults;
  el('#hidden-toggle').hidden = !analitico;
  el('#results-section').hidden = false;
  const actions = analitico ? ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'TRANSFERIR OBSOLETO', 'DESBLOQUEAR', 'ZERAR MIN/MAX', 'Verificar dados'] : giro ? ['Planejar reposição', 'Manter', 'Reduzir compras', 'Avaliar transferência', 'Investigar sem consumo', 'Confirmar saldo', 'Verificar dados'] : ['Comprar', 'Manter', 'Avaliar excesso', 'Avaliar sem giro', 'Sem movimento', 'Verificar dados'];
  const counts = analitico
    ? [...actions.filter(action => action !== 'Verificar dados').map(action => ({ action, count: state.results.filter(row => row.actions.includes(action)).length })), { action: 'Itens ocultos', count: state.allResults.filter(row => row.hidden).length }]
    : actions.map(action => ({ action, count: state.results.filter(row => row.action === action).length }));
  const locationTotal = summarizeLocationTotal(state.allResults, state.locationFilter);
  const localTotalCard = state.locationFilter || state.allResults.length > 0
    ? `<div class="summary-card local-total"><span>${state.locationFilter ? 'TOTAL DO LOCAL' : 'TOTAL GERAL'}</span><strong>${realCurrency(locationTotal)}</strong></div>`
    : '';
  el('#summary').innerHTML = `<div class="summary-card total"><span>ITENS NO PAINEL</span><strong>${state.results.length}</strong></div>` + counts.map(({ action, count }) => `<div class="summary-card ${slug(action)}"><span>${escapeHtml(action.toUpperCase())}</span><strong>${count}</strong></div>`).join('') + (localTotalCard || '');
  const previousFilter = el('#filter').value;
  const previousLocation = state.locationFilter;
  const locationValues = [...new Set(state.allResults.map(row => String(row.localCode ?? row.location ?? row.branch ?? '').trim()).filter(Boolean))];
  el('#location-filter').innerHTML = '<option value="">Todos os locais</option>' + locationValues.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');

  const normalizedPreviousLocation = normalizeLocalKey(previousLocation);
  const matchingLocation = locationValues.find(value => normalizeLocalKey(value) === normalizedPreviousLocation) ?? '';
  state.locationFilter = normalizedPreviousLocation ? matchingLocation : '';
  el('#location-filter').value = state.locationFilter;
  el('#filter').innerHTML = `<option value="">${analitico ? 'Todas as ações' : 'Todas as recomendações'}</option>` + actions.map(action => `<option>${escapeHtml(action)}</option>`).join('');
  if (actions.includes(previousFilter)) el('#filter').value = previousFilter;
  el('#filter').setAttribute('aria-label', 'Filtrar ação');
  el('#result-table').className = analitico ? 'analitico-table' : 'standard-table';
  el('#table-head').innerHTML = analitico ? '<tr><th>ITEM / CÓDIGO</th><th>QTD. ATUAL</th><th>MÍN. / MÁX.</th><th>GIRO</th><th>CLASSIFICAÇÃO</th><th>AÇÃO</th><th>OUTROS DADOS</th></tr>' : giro ? '<tr><th>ITEM / FILIAL</th><th>ESTOQUE (R$)</th><th>CONSUMO (R$)</th><th>GIRO</th><th>RECOMENDAÇÃO</th><th>MOTIVO</th></tr>' : '<tr><th>ITEM</th><th>ESTOQUE</th><th>VENDAS / 30D</th><th>COBERTURA</th><th>RECOMENDAÇÃO</th><th>MOTIVO</th></tr>';
  message(state.results.some(row => row.action === 'Verificar dados') ? 'Algumas linhas precisam de revisão. Confira os dados de origem e o mapeamento.' : '');
  renderResults();
}

function slug(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function visibleResults() {
  const query = normalize(el('#search').value);
  const filter = el('#filter').value;
  const localFilter = state.locationFilter;
  const analitico = isAnaliticoMode();
  return state.results.filter(row => {
    const localMatch = !localFilter || normalizeLocalKey(row.localCode ?? row.location ?? row.branch ?? '') === normalizeLocalKey(localFilter);
    const actionMatch = !filter || (analitico ? row.actions.includes(filter) : row.action === filter);
    const searchMatch = !query || normalize(`${row.item} ${row.sku} ${row.branch || ''} ${row.location || ''} ${row.localCode || ''}`).includes(query);
    return localMatch && actionMatch && searchMatch;
  });
}
function renderResults() {
  const query = el('#search').value.trim().toLowerCase();
  const filter = el('#filter').value;
  const analitico = isAnaliticoMode();
  const giro = !analitico && isGiroMode();
  const currency = value => value === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const filtered = visibleResults();
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(Math.max(state.page, 1), pageCount);
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  el('#result-rows').innerHTML = visible.length ? visible.map(row => `<tr class="${row.hidden ? 'hidden-item' : ''}"><td><strong>${escapeHtml(row.item || `Linha ${row.row}`)}${row.hidden ? ' <span class="hidden-indicator">Oculto</span>' : ''}</strong><small>${escapeHtml([row.sku, row.branch, row.location, row.localCode && `Local ${row.localCode}`].filter(Boolean).join(' · ') || `Linha ${row.row}`)}</small></td><td>${giro ? currency(row.stockValue) : formatNumber(row.stock)}</td><td>${analitico ? `${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}` : giro ? currency(row.consumption) : formatNumber(row.sales)}</td><td>${row.coverage === null ? '—' : `${formatNumber(row.coverage)} dias`}</td>${analitico ? `<td>${escapeHtml(row.classification)}</td>` : ''}<td>${analitico ? row.actions.map(action => `<span class="badge ${slug(action)}">${escapeHtml(action)}</span>`).join(' ') : `<span class="badge ${slug(row.action)}">${escapeHtml(row.action)}</span>`}</td><td class="reason">${escapeHtml(row.reason)}</td></tr>`).join('') : `<tr><td class="empty-row" colspan="${analitico ? 7 : 6}">Nenhum item encontrado.</td></tr>`;
  const itemLabel = filtered.length === 1 ? 'item' : 'itens';
  const filterLabel = query || filter ? filtered.length === 1 ? ' filtrado' : ' filtrados' : '';
  el('#page-status').textContent = filtered.length ? `${start + 1}–${start + visible.length} de ${filtered.length} ${itemLabel}${filterLabel}` : 'Nenhum item encontrado';
  el('#pagination').hidden = pageCount <= 1;
  el('#page-label').textContent = `Página ${state.page} de ${pageCount}`;
  el('#page-previous').disabled = state.page === 1;
  el('#page-next').disabled = state.page === pageCount;
}

function csvField(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function exportData() {
  const analitico = isAnaliticoMode();
  const giro = !analitico && isGiroMode();
  const headers = analitico ? ['Linha', 'Código do item', 'Nome do item', 'Código do local', 'Quantidade atual', 'Valor do saldo', 'Quantidade mínima', 'Quantidade máxima', 'Giro em dias', 'Dias desde última requisição', 'Média de consumo', 'Classificação da planilha', 'Motivo do bloqueio', 'Id Bloqueio', 'Última requisição', 'Ações'] : giro ? ['Linha', 'Item', 'SKU', 'Filial', 'Local', 'Grupo', 'Quantidade', 'Valor do estoque', 'Valor do consumo', 'Giro calculado em dias', 'Giro informado em dias', 'Recomendação', 'Motivo'] : ['Linha', 'Item', 'SKU', 'Estoque', 'Vendas 30 dias', 'Prazo dias', 'Cobertura dias', 'Ponto de reposição', 'Recomendação', 'Motivo'];
  const rows = visibleResults().map(row => analitico ? [row.row, row.sku, row.item, row.localCode, row.stock, row.stockValue, row.minimum, row.maximum, row.coverage, row.daysSince, row.averageConsumption, row.classification, row.blockReason, row.blockId, row.lastRequest, row.action] : giro ? [row.row, row.item, row.sku, row.branch, row.location, row.group, row.stock, row.stockValue, row.consumption, row.coverage, row.reportedGiro, row.action, row.reason] : [row.row, row.item, row.sku, row.stock, row.sales, row.lead, row.coverage, row.reorderPoint, row.action, row.reason]);
  return { headers, rows };
}
function exportName(extension) {
  const action = slug(el('#filter').value || 'todas-as-acoes');
  return `controle-estoque-${action}.${extension}`;
}
function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv() {
  const { headers, rows } = exportData();
  const content = '\uFEFF' + [headers, ...rows].map(row => row.map(csvField).join(';')).join('\r\n');
  saveBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), exportName('csv'));
}
async function exportXlsx() {
  if (!globalThis.ExcelJS) throw new Error('A biblioteca de Excel não foi carregada. Recarregue a página.');
  const { headers, rows } = exportData();
  const workbook = new globalThis.ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Itens filtrados');
  sheet.addRow(headers);
  rows.forEach(row => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C2B3A' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 2), column: headers.length } };
  sheet.columns.forEach((column, index) => { column.width = Math.min(42, Math.max(12, headers[index].length + 3)); });
  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportName('xlsx'));
}
function exportPdf() {
  const analitico = isAnaliticoMode();
  const giro = !analitico && isGiroMode();
  const columns = analitico
    ? [['Código', row => row.sku], ['Item', row => row.item], ['Local', row => row.localCode], ['Saldo', row => row.stock], ['Mín./máx.', row => `${formatNumber(row.minimum)} / ${formatNumber(row.maximum)}`], ['Dias sem requisição', row => row.daysSince], ['Classificação', row => row.classification], ['Ações', row => row.action], ['Outros dados', row => row.reason]]
    : giro
      ? [['SKU', row => row.sku], ['Item', row => row.item], ['Filial', row => row.branch], ['Local', row => row.location], ['Quantidade', row => row.stock], ['Giro (dias)', row => row.coverage], ['Recomendação', row => row.action], ['Motivo', row => row.reason]]
      : [['SKU', row => row.sku], ['Item', row => row.item], ['Estoque', row => row.stock], ['Vendas/30 dias', row => row.sales], ['Cobertura', row => row.coverage], ['Recomendação', row => row.action], ['Motivo', row => row.reason]];
  const rows = visibleResults();
  const filter = el('#filter').value || 'Todas as ações';
  const search = el('#search').value.trim();
  el('#print-report').innerHTML = `<h1>Controle de Estoque</h1><p>Ação: ${escapeHtml(filter)}${search ? ` · Busca: ${escapeHtml(search)}` : ''} · ${rows.length} ${rows.length === 1 ? 'item' : 'itens'}</p><table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, value]) => `<td>${escapeHtml(value(row) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  window.print();
}

async function loadFile(file) {
  if (!file) return;
  message('Lendo planilha...');
  try {
    state.sheets = (await importFile(file)).map(sheet => ({ ...sheet, headerRow: findHeaderRow(sheet.rows) }));
    if (!state.sheets.length || !state.sheets.some(sheet => sheet.rows.length > sheet.headerRow + 1)) throw new Error('Não encontrei linhas de dados na planilha.');
    state.sheet = state.sheets.findIndex(sheet => sheet.rows.length > sheet.headerRow + 1);
    state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []);
    el('#show-hidden').checked = false;
    state.page = 1;
    setConfigExpanded(false);
    state.fileName = file.name;
    el('#file-name').textContent = file.name;
    el('#workspace').hidden = false;
    el('.shell').classList.add('has-data');
    renderMapping(); renderSettings(); refresh();
  } catch (error) { message(error.message || 'Não foi possível abrir o arquivo.', true); }
}

el('#file-input').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; loadFile(file); });
const upload = el('#upload-card');
upload.addEventListener('dragover', event => { event.preventDefault(); upload.classList.add('dragging'); });
upload.addEventListener('dragleave', () => upload.classList.remove('dragging'));
upload.addEventListener('drop', event => { event.preventDefault(); upload.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]); });
el('#search').addEventListener('input', () => { state.page = 1; renderResults(); });
el('#filter').addEventListener('change', () => { state.page = 1; renderResults(); });
el('#location-filter').addEventListener('change', () => {
  state.locationFilter = el('#location-filter').value;
  state.page = 1;
  refresh();
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
el('#config-toggle').addEventListener('click', () => setConfigExpanded(el('#config-grid').hidden));
el('#show-hidden').addEventListener('change', () => { state.page = 1; refresh(); });
el('#export-menu').querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
  el('#export-menu').open = false;
  try {
    if (button.dataset.export === 'xlsx') await exportXlsx();
    else if (button.dataset.export === 'pdf') exportPdf();
    else exportCsv();
  } catch (error) { message(error.message || 'Não foi possível exportar os itens.', true); }
}));
document.addEventListener('click', event => { if (!el('#export-menu').contains(event.target)) el('#export-menu').open = false; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') el('#export-menu').open = false; });
