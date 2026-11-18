// Worker clássico (sem módulos) que lê .xlsx com o ExcelJS fora da thread da tela: planilha
// grande não congela a página. Chamado por readXlsxInWorker (src/import.js), que cai para a
// leitura na própria página se este arquivo não carregar.
// O caminho do ExcelJS é relativo a este arquivo: src/ -> vendor/ servindo o fonte (Go Live) e
// dist/assets/ -> dist/vendor/ no build (scripts/copy-vendor.mjs copia o vendor).
// readWorkbook repete a conversão de importFile (src/import.js); tests/import.test.js confere
// que as duas dão o mesmo resultado.
/* global ExcelJS */

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if (value instanceof Date) return value.toLocaleDateString('pt-BR');
    return '';
  }
  return value;
}

async function readWorkbook(Library, buffer) {
  const workbook = new Library.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.filter(sheet => sheet.rowCount > 0).map(sheet => {
    const rows = [];
    sheet.eachRow({ includeEmpty: true }, row => {
      const cells = [];
      for (let i = 1; i <= sheet.columnCount; i++) cells.push(cellValue(row.getCell(i).value));
      rows.push(cells);
    });
    return { name: sheet.name, rows };
  });
}

if (typeof importScripts === 'function') {
  importScripts('../vendor/exceljs.min.js');
  self.onmessage = async event => {
    try {
      self.postMessage({ sheets: await readWorkbook(ExcelJS, event.data.buffer) });
    } catch (error) {
      self.postMessage({ error: error?.message || 'Não foi possível ler a planilha.' });
    }
  };
}
