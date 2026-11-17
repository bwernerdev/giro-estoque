// Exportar (Excel, CSV, PDF da tabela e PDF de resumo) e Gerar painel.
import { agingSummary, formatNumber, stockHealth } from '../analysis.js';
import { actionCounts, actionValues, prioritizeActionCounts } from '../dashboard.js';
import { buildCsv, buildExportData, currencyNumber, shouldIncludeDaysSince } from '../export-data.js';
import { PANEL_FILE_NAME, buildPanelData } from '../panel/data.js';
import { ANALITICO_ACTIONS, GENERIC_ACTIONS, GIRO_ACTIONS, buildSummaryReport, escapeHtml, slug } from './markup.js';

export function createExport(ui) {
  const { state, el, message } = ui;
  function exportData(source = ui.visibleResults(), actionValue = el('#filter').value) {
    const mode = ui.isAnaliticoMode() ? 'analitico' : ui.isGiroMode() ? 'giro' : 'generic';
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
  async function exportXlsx(source = ui.visibleResults(), actionValue = el('#filter').value) {
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
    const analitico = ui.isAnaliticoMode();
    const giro = !analitico && ui.isGiroMode();
    const rows = ui.visibleResults();
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
    el('#print-report').className = '';
    el('#print-report').innerHTML = `<h1>Giro de Estoque</h1><p>Ação: ${escapeHtml(filter)}${local}${shelf}${partition}${search ? ` · Busca: ${escapeHtml(search)}` : ''} · ${rows.length} ${rows.length === 1 ? 'item' : 'itens'}</p><table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, value]) => `<td>${escapeHtml(value(row) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    window.print();
  }

  // Resumo de uma página: mesmo recorte de posição da visão geral, sem busca nem filtro de ação.
  function exportSummaryPdf() {
    if (!state.overview) return;
    const { summaryAllResults, locationTotal, analitico, giro } = state.overview;
    const withValue = ui.isMapped('stockValue');
    const rows = analitico ? summaryAllResults.filter(row => !row.hidden) : summaryAllResults;
    const actionList = analitico ? ANALITICO_ACTIONS : giro ? GIRO_ACTIONS : GENERIC_ACTIONS;
    const counts = prioritizeActionCounts(actionCounts(rows, actionList, analitico)).filter(({ count }) => count > 0);
    const values = withValue ? new Map(actionValues(rows, counts.map(({ action }) => action), analitico).map(({ action, value }) => [action, value])) : null;
    el('#print-report').className = 'summary-report';
    el('#print-report').innerHTML = buildSummaryReport({
      fileName: state.fileName,
      // CSV não tem abas: o nome "CSV" não informa nada no relatório.
      sheetName: /\.csv$/i.test(state.fileName) ? '' : ui.currentSheet()?.name ?? '',
      importedAt: state.importedAt,
      generatedAt: new Date(),
      scope: [state.locationFilter && `Local ${state.locationFilter}`, state.shelfFilter && `Prateleira ${state.shelfFilter}`, state.partitionFilter && `Repartição ${state.partitionFilter}`].filter(Boolean).join(' · '),
      total: withValue ? Number(locationTotal) || 0 : null,
      health: analitico && withValue ? stockHealth(summaryAllResults) : null,
      aging: analitico && withValue ? agingSummary(summaryAllResults) : null,
      actions: counts.map(({ action, count }) => ({ action, count, value: values?.get(action) ?? null })),
      itemsWithAction: rows.length,
      itemsInFile: summaryAllResults.length,
      withoutAction: analitico ? summaryAllResults.length - rows.length : 0,
      analitico,
    });
    window.print();
  }

  // "Gerar painel": o app num .html único com os dados atuais (src/panel/), para publicar no SharePoint.
  const fileSize = bytes => (bytes >= 1048576
    ? `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.ceil(bytes / 1024).toLocaleString('pt-BR')} KB`);
  async function generatePanel() {
    const button = el('#generate-panel');
    if (ui.waitingPanel() || !ui.currentSheet() || !state.allResults.length) { message('Importe as planilhas antes de gerar o painel.', 'error'); return; }
    button.disabled = true;
    try {
      const { generatePanelHtml } = await import('../panel/generate.js');
      const html = await generatePanelHtml(buildPanelData({
        sheet: ui.currentSheet(),
        mapping: state.mapping,
        mode: ui.currentMode(),
        numberFormat: state.numberFormat,
        settings: state.settings,
        fileName: state.fileName,
        importedAt: state.importedAt,
        purchases: state.purchases,
      }));
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      saveBlob(blob, PANEL_FILE_NAME);
      message(`Painel gerado: ${PANEL_FILE_NAME} (${fileSize(blob.size)}). Para publicar, envie o arquivo para a pasta do SharePoint e escolha "Substituir" (mesmo nome): o link continua o mesmo e quem abrir vê os dados de agora.`);
    } catch (error) {
      message(error.message || 'Não foi possível gerar o painel.', 'error');
    } finally {
      button.disabled = false;
    }
  }
  el('#generate-panel').addEventListener('click', generatePanel);
  el('#export-menu').querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
    el('#export-menu').open = false;
    el('#export-menu summary').focus();
    try {
      if (button.dataset.export === 'xlsx') await exportXlsx();
      else if (button.dataset.export === 'pdf') exportPdf();
      else if (button.dataset.export === 'summary') exportSummaryPdf();
      else exportCsv();
    } catch (error) { message(error.message || 'Não foi possível exportar os itens.', 'error'); }
  }));
  return { exportData, exportName, saveBlob, exportCsv, exportXlsx, exportPdf, exportSummaryPdf, generatePanel, fileSize };
}
