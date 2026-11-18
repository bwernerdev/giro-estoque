// Importação: campos de anexo, Analítico + SNAC0540, arrastar e soltar, painel publicado e a
// última importação guardada no navegador.
import { findHeaderRow, suggestMapping } from '../analysis.js';
import { resetDashboardState } from '../dashboard.js';
import { svgIcon } from '../icons.js';
import { importFile } from '../import.js';
import { readPanelData } from '../panel/data.js';
import { isPurchaseReport, parsePurchaseReport } from '../purchases.js';
import { clearSavedImport, loadSavedImport, saveImport } from '../saved-import.js';
import { escapeHtml } from './markup.js';

export function createImporter(ui) {
  const { state, el, message, setProgress, panelMode, panelSource } = ui;
  // Só a leitura mais recente vale (outro arquivo escolhido no meio descarta a anterior).
  let importRun = 0;
  // Hora da importação; de outro dia (importação reaberta do navegador), data e hora.
  function importStamp(date) {
    if (!date) return '';
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
  }
  const stampPrefix = stamp => (stamp.includes('/') ? 'em' : 'às');
  function renderImportContext() {
    if (!state.fileName || !ui.currentSheet()) { el('#topbar-file').hidden = true; return; }
    const importedAt = importStamp(state.importedAt);
    // No painel publicado vale a data em que ele foi gerado (pode ser aberto dias depois).
    const generatedAt = panelMode ? state.panelGeneratedAt?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) ?? '' : '';
    const stamp = generatedAt
      ? `<span title="Painel gerado em ${escapeHtml(generatedAt)}${state.purchases ? `, com o SNAC0540 ${escapeHtml(state.purchases.fileName)}` : ''}">Dados de ${escapeHtml(generatedAt)}</span>`
      : importedAt ? `<span title="Importado ${stampPrefix(importedAt)} ${escapeHtml(importedAt)}">${escapeHtml(importedAt)}</span>` : '';
    // Limpar dados: apaga a importação guardada no navegador e volta à tela inicial.
    const clear = panelMode ? '' : `<button id="clear-data" class="topbar-file-clear" type="button" title="Limpar dados: apaga as planilhas guardadas neste navegador e volta à tela inicial" aria-label="Limpar dados importados">${svgIcon('close')}</button>`;
    el('#topbar-file').innerHTML = `<strong title="${escapeHtml(state.fileName)} · ${escapeHtml(ui.currentSheet().name)}">${escapeHtml(state.fileName)}</strong><span>${escapeHtml(ui.currentSheet().name)}</span>${stamp}${clear}`;
    // Só com o painel aberto (Analítico esperando o SNAC0540 fica só no campo da tela inicial).
    el('#topbar-file').hidden = !el('.shell').classList.contains('has-data');
    setAttachState('#stock-field', 'ok', `${state.fileName} · ${ui.currentSheet().name}${importedAt ? ` · importado ${stampPrefix(importedAt)} ${importedAt}` : ''}`);
    renderPurchaseContext();
  }
  // Campos de anexo da tela inicial (Analítico e SNAC0540): estado vazio, lendo, ok ou erro.
  function setAttachState(selector, status, text) {
    const field = el(selector);
    if (status) field.dataset.state = status; else delete field.dataset.state;
    field.querySelector('.attach-status').textContent = text;
  }
  function resetAttachFields() {
    if (state.fileName && ui.currentSheet()) renderImportContext(); else setAttachState('#stock-field', '', 'Escolha ou arraste o arquivo');
    renderPurchaseContext();
  }
  // Botão do SNAC0540: só no modo Analítico; depois de importado mostra a hora e o resumo.
  function renderPurchaseContext() {
    const button = el('#purchase-file');
    button.hidden = !ui.isAnaliticoMode();
    const loaded = state.purchases;
    const time = importStamp(loaded?.importedAt);
    button.querySelector('span').textContent = loaded ? `SNAC0540 · ${time}` : 'Importar SNAC0540';
    button.title = loaded
      ? `${loaded.fileName}: ${loaded.requests.length.toLocaleString('pt-BR')} linhas de SC de ${loaded.byItem.size.toLocaleString('pt-BR')} itens. Clique para trocar.`
      : 'Importar o follow-up de compras (SNAC0540) para conferir SCs em andamento';
    button.classList.toggle('is-loaded', Boolean(loaded));
    if (loaded) setAttachState('#purchase-field', 'ok', `${loaded.fileName} · ${loaded.requests.length.toLocaleString('pt-BR')} linhas de SC · importado ${stampPrefix(time)} ${time}`);
    else setAttachState('#purchase-field', '', 'Escolha ou arraste o arquivo');
  }
  // Painel publicado: abre direto com os dados embutidos, sem importar nada.
  // Qualquer erro até a tabela aparecer (dados, versão, análise, desenho) vira aviso, sem painel pela metade.
  async function openEmbeddedPanel() {
    try {
      const data = readPanelData(panelSource.textContent);
      state.sheets = [data.sheet];
      state.sheet = 0;
      state.mapping = data.mapping;
      state.mode = data.mode;
      state.numberFormat = data.numberFormat;
      for (const key of ['generic', 'giro']) Object.assign(state.settings[key], data.settings?.[key]);
      state.fileName = data.fileName;
      state.importedAt = data.importedAt;
      state.panelGeneratedAt = data.generatedAt;
      state.purchases = data.purchases;
      resetDashboardState(state);
      await openPanel();
      ui.playEntrance();
    } catch (error) {
      closePanel();
      message(`Não foi possível abrir os dados do painel (${error?.message ?? error}). Gere o painel de novo no app.`, 'error');
    }
  }
  // Volta à tela inicial (sem tabela nem nome de arquivo) depois de uma abertura que falhou.
  function closePanel() {
    el('.shell').classList.remove('has-data', 'is-loading');
    el('#workspace').hidden = true;
    el('#topbar-file').hidden = true;
  }

  // SNAC0540 lido: fica guardado em state.purchases e vale para o Analítico atual ou o próximo.
  function setPurchases(file, sheets) {
    const sheet = sheets.find(entry => isPurchaseReport(entry.rows));
    const { requests, byItem } = parsePurchaseReport(sheet.rows);
    state.purchases = { fileName: file.name, importedAt: new Date(), requests, byItem };
    renderPurchaseContext();
  }
  function purchaseSummary() {
    const buying = state.allResults.filter(row => row.actions?.includes('COMPRAR')).length;
    const ongoing = state.allResults.filter(row => row.actions?.includes('COMPRA EM ANDAMENTO')).length;
    return `${buying.toLocaleString('pt-BR')} ${buying === 1 ? 'item para comprar' : 'itens para comprar'} e ${ongoing.toLocaleString('pt-BR')} com compra em andamento.`;
  }
  // Planilha de estoque (Analítico, BBOG6656 ou estoque e vendas): troca a análise atual.
  async function loadStock(file, imported) {
    const sheets = imported.map(sheet => ({ ...sheet, headerRow: findHeaderRow(sheet.rows) }));
    if (!sheets.length || !sheets.some(sheet => sheet.rows.length > sheet.headerRow + 1)) throw new Error('Não encontrei linhas de dados na planilha.');
    state.sheets = sheets;
    ui.resetCountUp();
    ui.resetExpansions();
    state.collapsedGroups.clear();
    state.sheet = state.sheets.findIndex(sheet => sheet.rows.length > sheet.headerRow + 1);
    state.mapping = suggestMapping(ui.currentSheet().rows[ui.currentSheet().headerRow] || []);
    ui.applyFilterPreferences();
    state.fileName = file.name;
    state.importedAt = new Date();
    // Analítico sem SNAC0540: fica guardado na tela inicial; o painel só abre com os dois.
    if (ui.isAnaliticoMode() && !state.purchases) {
      el('.shell').classList.remove('has-data');
      el('#workspace').hidden = true;
      renderImportContext();
      return false;
    }
    await openPanel();
    return true;
  }

  // Última importação guardada no navegador (src/saved-import.js): grava a cada importação ou
  // mudança de aba, mapeamento ou critério; reabre sozinha ao atualizar a página.
  let savedImportKey = '';
  const importKey = () => JSON.stringify([state.importedAt, state.purchases?.importedAt, state.sheet, state.mapping, state.mode, state.numberFormat, state.settings]);
  function persistImport() {
    if (panelMode || (!state.sheets.length && !state.purchases)) return;
    const key = importKey();
    if (key === savedImportKey) return;
    savedImportKey = key;
    saveImport({
      sheets: state.sheets,
      sheet: state.sheet,
      mapping: state.mapping,
      mode: state.mode,
      numberFormat: state.numberFormat,
      settings: state.settings,
      fileName: state.fileName,
      importedAt: state.importedAt,
      purchases: state.purchases,
    }).catch(() => { savedImportKey = ''; /* Sem armazenamento: os dados valem até fechar a página. */ });
  }
  async function restoreSavedImport() {
    let data;
    try { data = await loadSavedImport(); } catch { return; }
    // Nada guardado, ou a pessoa já começou a importar enquanto o navegador respondia.
    if (!data || importRun) return;
    if (data.purchases) state.purchases = data.purchases;
    if (data.sheets?.length) {
      state.sheets = data.sheets;
      state.sheet = data.sheet;
      state.mapping = data.mapping;
      state.mode = data.mode;
      state.numberFormat = data.numberFormat;
      for (const key of ['generic', 'giro']) Object.assign(state.settings[key], data.settings?.[key]);
      state.fileName = data.fileName;
      state.importedAt = data.importedAt;
      resetDashboardState(state);
      ui.applyFilterPreferences();
    }
    savedImportKey = importKey();
    if (!ui.currentSheet()) {
      renderPurchaseContext();
      message('SNAC0540 da última importação reaberto (guardado neste navegador). Agora importe o relatório Analítico.');
      return;
    }
    if (ui.isAnaliticoMode() && !state.purchases) {
      renderImportContext();
      message(`Analítico da última importação reaberto (${state.fileName}). Agora importe o SNAC0540 para gerar o painel.`);
      return;
    }
    try {
      await openPanel();
    } catch (error) {
      // Guardado por uma versão anterior do app e não abre mais: apaga e volta à tela inicial.
      if (importRun) return; // a pessoa já está importando outro arquivo
      try { await clearSavedImport(); } catch { /* sem armazenamento */ }
      Object.assign(state, { sheets: [], sheet: 0, mapping: {}, mode: 'auto', purchases: null, fileName: '', importedAt: null, allResults: [], results: [] });
      savedImportKey = '';
      closePanel();
      resetAttachFields();
      message(`Não foi possível reabrir a última importação (${error?.message ?? error}). Ela foi apagada deste navegador: importe as planilhas de novo.`, 'error');
      return;
    }
    message('Planilhas da última importação reabertas (guardadas neste navegador). Para apagar, use o × ao lado do nome do arquivo.');
    ui.playEntrance();
  }
  async function clearImport() {
    try { await clearSavedImport(); } catch { /* Nada guardado ou sem armazenamento. */ }
    location.reload();
  }
  async function openPanel() {
    ui.setConfigExpanded(false);
    el('#workspace').hidden = false;
    el('.shell').classList.add('has-data');
    state.animateRows = true;
    renderImportContext(); ui.renderMapping(); ui.renderSettings(); await ui.refresh();
  }
  const waitingPanel = () => !el('.shell').classList.contains('has-data');

  // Aceita um ou dois arquivos de uma vez (seleção múltipla ou arrastar), em qualquer ordem:
  // no máximo uma planilha de estoque e um SNAC0540. O SNAC0540 sozinho fica guardado até
  // o Analítico chegar; com o Analítico já aberto, completa a análise sem trocá-la.
  async function loadFiles(fileList, { purchase = false } = {}) {
    const files = [...(fileList ?? [])].filter(Boolean);
    if (!files.length) return;
    const run = ++importRun;
    let loaded = false;
    message(files.length > 1 ? 'Lendo planilhas...' : 'Lendo planilha...');
    const field = purchase ? '#purchase-field' : '#stock-field';
    setAttachState(field, 'reading', `Lendo ${files.map(file => file.name).join(' e ')}...`);
    let failed = false;
    setProgress('busy');
    // Esqueleto do painel enquanto a planilha é lida (só se demorar, para não piscar).
    const skeletonTimer = setTimeout(() => { if (run === importRun) el('.shell').classList.add('is-loading'); }, 120);
    upload.setAttribute('aria-busy', 'true');
    upload.classList.add('loading');
    try {
      const imported = [];
      for (const file of files) imported.push({ file, sheets: await importFile(file) });
      if (run !== importRun) return;
      const purchaseFiles = imported.filter(({ sheets }) => sheets.some(sheet => isPurchaseReport(sheet.rows)));
      const stockFiles = imported.filter(entry => !purchaseFiles.includes(entry));
      if (purchase && stockFiles.length) throw new Error('Este arquivo não é o relatório SNAC0540. Exporte o follow-up de compras sem mexer nas colunas.');
      if (stockFiles.length > 1 || purchaseFiles.length > 1) throw new Error('Selecione no máximo uma planilha de estoque (Analítico) e um SNAC0540 por vez.');
      if (purchaseFiles.length) setPurchases(purchaseFiles[0].file, purchaseFiles[0].sheets);
      if (stockFiles.length) {
        const opened = await loadStock(stockFiles[0].file, stockFiles[0].sheets);
        if (run !== importRun) return;
        loaded = opened;
        if (!opened) {
          message(`Analítico carregado (${stockFiles[0].file.name}). Agora importe o SNAC0540 para gerar o painel.`);
        } else if (state.purchases && ui.isAnaliticoMode()) {
          message(`${purchaseFiles.length ? 'Analítico e SNAC0540 importados' : `Analítico importado com o SNAC0540 de ${state.purchases.importedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}: ${purchaseSummary()}`);
        } else if (purchaseFiles.length) {
          message('SNAC0540 guardado. As compras aparecem quando o relatório Analítico for importado.', 'warning');
        }
      } else if (state.sheets.length && ui.isAnaliticoMode() && waitingPanel()) {
        await openPanel();
        loaded = run === importRun;
        message(`Analítico e SNAC0540 importados: ${purchaseSummary()}`);
      } else if (state.sheets.length && ui.isAnaliticoMode()) {
        await ui.refresh();
        message(`SNAC0540 importado: ${state.purchases.requests.length.toLocaleString('pt-BR')} linhas de SC. ${purchaseSummary()}`);
      } else {
        message(`SNAC0540 carregado (${state.purchases.requests.length.toLocaleString('pt-BR')} linhas de SC). ${state.sheets.length ? 'As compras aparecem quando o relatório Analítico for importado.' : 'Agora importe o relatório Analítico.'}`);
      }
    } catch (error) {
      if (run === importRun) {
        failed = true;
        message(error.message || 'Não foi possível abrir o arquivo.', 'error');
        setAttachState(field, 'error', error.message || 'Não foi possível abrir o arquivo.');
      }
    }
    finally {
      if (run === importRun) {
        if (!failed) { resetAttachFields(); persistImport(); }
        clearTimeout(skeletonTimer);
        el('.shell').classList.remove('is-loading');
        upload.removeAttribute('aria-busy'); upload.classList.remove('loading'); setProgress(null);
        if (loaded) ui.playEntrance();
      }
    }
  }
  el('#replace-file').addEventListener('click', () => el('#file-input').click());
  el('#topbar-file').addEventListener('click', event => { if (event.target.closest('#clear-data')) clearImport(); });
  el('#file-input').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; loadFiles(files); });
  el('#purchase-file').addEventListener('click', () => el('#purchase-input').click());
  el('#purchase-input').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; loadFiles(files, { purchase: true }); });
  const upload = el('#upload-card');
  const shell = el('.shell');
  const draggingFiles = event => [...(event.dataTransfer?.types ?? [])].includes('Files');
  const stopDragging = () => {
    upload.classList.remove('dragging');
    shell.classList.remove('dragging-file');
    document.querySelectorAll('.attach-field.is-over').forEach(field => field.classList.remove('is-over'));
  };
  // Soltar em um campo carrega aquele tipo; o SNAC0540 recusa outra planilha. Fora dos campos vale a janela toda.
  for (const [selector, options] of [['#stock-field', {}], ['#purchase-field', { purchase: true }]]) {
    const field = el(selector);
    field.addEventListener('dragover', event => { if (draggingFiles(event)) field.classList.add('is-over'); });
    field.addEventListener('dragleave', event => { if (!field.contains(event.relatedTarget)) field.classList.remove('is-over'); });
    field.addEventListener('drop', event => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      stopDragging();
      loadFiles(event.dataTransfer.files, options);
    });
  }
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
    stopDragging();
    loadFiles(event.dataTransfer.files);
  });
  return { importStamp, renderImportContext, setAttachState, resetAttachFields, renderPurchaseContext, openEmbeddedPanel, setPurchases, purchaseSummary, loadStock, persistImport, restoreSavedImport, clearImport, openPanel, loadFiles, stampPrefix, importKey, waitingPanel, draggingFiles, stopDragging };
}
