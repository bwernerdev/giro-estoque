const ExcelJS = globalThis.ExcelJS;

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

export async function importFile(file) {
  if (/\.csv$/i.test(file.name)) {
    const content = await file.text();
    const firstLine = content.split(/\r?\n/, 1)[0];
    const separator = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    return [{ name: 'CSV', rows: parseCsv(content.replace(/^\uFEFF/, ''), separator) }];
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Use um arquivo .xlsx ou .csv.');
  if (!ExcelJS) throw new Error('A biblioteca de Excel não foi carregada. Recarregue a página.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
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

export function parseCsv(content, separator) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === separator && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('O CSV contém aspas sem fechamento.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
