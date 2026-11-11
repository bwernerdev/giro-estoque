import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

const generic = 'Produto;Codigo;Estoque;Vendas;Valor do estoque\nA;001;50;30;1.234,56\n;002;5;30;20\nTotal;;55;60;1.254,56';
async function upload(page, csv = generic) {
  await page.locator('#file-input').setInputFiles({ name: 'dados.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#upload-card')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('#results-section')).toBeVisible();
}

test('build funciona em subpasta, mantém critérios e gera Excel/CSV completos', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const failed = [];
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('./');
  await upload(page);
  await expect(page.locator('#filtered-count')).toHaveText('2 de 2 itens');
  await expect(page.locator('#result-rows')).toContainText('Linha 3');
  await page.getByRole('button', { name: 'Abrir configuração' }).click();
  await page.locator('#safety-days').fill('50');
  await page.locator('.optional-fields summary').click();
  await page.locator('[data-map="sku"]').selectOption('-1');
  await expect(page.locator('#safety-days')).toHaveValue('50');
  await page.locator('[data-map="sku"]').selectOption('1');
  await page.getByRole('button', { name: 'Fechar configuração' }).click();
  for (const format of ['csv', 'xlsx']) {
    await page.locator('#export-menu summary').click();
    const pending = page.waitForEvent('download');
    await page.locator(`[data-export="${format}"]`).click();
    const download = await pending;
    const data = await readFile(await download.path());
    if (format === 'csv') {
      expect(data.toString('utf8')).toContain('"Recomendação";"Motivo";"Linha na planilha"');
      expect(data.toString('utf8')).toContain('Verificar dados');
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      const sheet = workbook.worksheets[0];
      expect(sheet.rowCount).toBe(3);
      expect(sheet.getCell('A2').value).toBe('001');
      expect(sheet.getCell('H2').value).toBe(1234.56);
    }
  }
  await expect(page.locator('#data-quality')).toContainText('1 linha precisa');
  await page.screenshot({ path: 'test-results/desktop-light.png', fullPage: true });
  await page.locator('#theme-toggle').click();
  await expect(page.locator('#theme-toggle')).toContainText('Modo claro');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/desktop-dark.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test('PDF de resumo cabe em uma página A4 em pé, sem a tabela de itens', async ({ page }) => {
  const header = 'Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio;Vl Saldo';
  const rows = Array.from({ length: 120 }, (_, i) => `Peça ${i};${1000 + i};${i % 5 === 0 ? 298 : 7};${i % 4};2;6;${(i * 7) % 500};Acima de 90;;${i % 3 ? 'Desbloqueado' : 'Bloqueado'};${(i * 13.5).toFixed(2).replace('.', ',')}`);
  await page.goto('./');
  await upload(page, [header, ...rows].join('\n'));
  // No tema escuro o papel continua branco com texto escuro.
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') await page.locator('#theme-toggle').click();
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('#export-menu summary').click();
  await page.locator('[data-export="summary"]').click();
  await expect(page.locator('#print-report h1')).toHaveText('Resumo do estoque');
  await expect(page.locator('#print-report .report-kpi')).toHaveCount(4);
  await expect(page.locator('#print-report .report-bar-row')).toHaveCount(4);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#print-report')).toBeVisible();
  for (const cell of ['#print-report td', '#print-report th', '#print-report .report-kpi strong']) await expect(page.locator(cell).first()).toHaveCSS('color', 'rgb(23, 35, 50)');
  const pdf = await page.pdf({ path: 'test-results/resumo.pdf', preferCSSPageSize: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(1);
});

test('leitura Excel, filtros, paginação e impressão incluem todos os resultados', async ({ page }) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Analítico');
  sheet.addRow(['Cd Item', 'Nm Item', 'Qtde Atual', 'Qnt Min', 'Qnt Max', 'Dif Dias', 'Itens Acima de 90 dias', 'Ds Motivo Bloqueio', 'Id Bloqueio', 'Cd Local Estoque']);
  for (let i = 0; i < 61; i++) sheet.addRow([i + 1, `Peça ${i}`, 2, 0, 0, 100, 'Item com Giro', 'Desbloqueado', 'Desbloqueado', 7]);
  await page.goto('./');
  await page.locator('#file-input').setInputFiles({ name: 'dados.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
  await expect(page.locator('#filtered-count')).toHaveText('61 de 61 itens');
  await expect(page.locator('#result-rows tr')).toHaveCount(50);
  await page.locator('#page-next').click();
  await expect(page.locator('#result-rows tr')).toHaveCount(11);
  await page.locator('#filter').selectOption('BLOQUEAR');
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('#export-menu summary').click();
  await page.locator('[data-export="pdf"]').click();
  await expect(page.locator('#print-report tbody tr')).toHaveCount(61);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.shell')).not.toBeVisible();
  await expect(page.locator('#print-report')).toBeVisible();
  await expect(page.locator('#print-report th').first()).toHaveCSS('position', 'static');
  const pdf = await page.pdf({ path: 'test-results/estoque.pdf', preferCSSPageSize: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  await page.screenshot({ path: 'test-results/print.png', fullPage: true });
});

for (const width of [1024, 1366, 1920]) {
  test(`interface e configuração cabem no desktop de ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await upload(page);
    await page.getByRole('button', { name: 'Abrir configuração' }).click();
    await expect(page.locator('#number-format')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#mapping')).toBeVisible();
    const mapping = await page.locator('#mapping').boundingBox();
    const criteria = await page.locator('#criteria-panel').boundingBox();
    expect(criteria.y).toBeGreaterThan(mapping.y);
    await page.screenshot({ path: `test-results/desktop-${width}-config.png`, fullPage: true });
    await page.getByRole('button', { name: 'Fechar configuração' }).click();
    await page.screenshot({ path: `test-results/desktop-${width}-results.png`, fullPage: true });
  });
}

for (const width of [390, 768]) {
  test(`interface permanece utilizável em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await upload(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Abrir configuração' }).click();
    await expect(page.locator('#mapping')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Fechar configuração' }).click();
    await expect(page.locator('#export-menu summary')).toBeVisible();
    await page.screenshot({ path: `test-results/responsive-${width}.png`, fullPage: true });
  });
}

test.describe('tema e zebrado', () => {
  test.use({ colorScheme: 'dark' });
  test('sem escolha salva, o tema segue o sistema e a escolha manual prevalece', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test('hover: cartões inclinam com o cursor, gráfico destaca a faixa e arrastar anima a borda', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const header = 'Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio;Vl Saldo';
  const rows = Array.from({ length: 40 }, (_, i) => `Peça ${i};${1000 + i};${i % 5 === 0 ? 298 : 7};${i % 4};2;6;${(i * 37) % 500};Acima de 90;;${i % 3 ? 'Desbloqueado' : 'Bloqueado'};${(i * 13.5).toFixed(2).replace('.', ',')}`);
  await page.goto('./');
  const dataTransfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['x'], 'a.csv')); return data; });
  await page.dispatchEvent('.shell', 'dragover', { dataTransfer });
  await expect(page.locator('#upload-card')).toHaveCSS('animation-name', 'march');
  expect(await page.locator('.shell').evaluate(shell => getComputedStyle(shell, '::after').animationName)).toBe('march');
  await page.dispatchEvent('.shell', 'dragleave');
  await expect(page.locator('#upload-card')).not.toHaveClass(/dragging/);
  await upload(page, [header, ...rows].join('\n'));
  await expect(page.locator('.shell')).not.toHaveClass(/is-entering/);

  const card = page.locator('.summary-card[data-summary-action]').first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await expect.poll(() => card.evaluate(node => [node.style.getPropertyValue('--rx'), node.style.getPropertyValue('--ry')])).toEqual(['2.00deg', '-2.00deg']);
  await expect.poll(() => card.evaluate(node => getComputedStyle(node).transform)).toMatch(/^matrix3d/);
  await expect.poll(() => card.evaluate(node => getComputedStyle(node, '::after').opacity)).toBe('1');
  await expect.poll(() => card.locator('.kpi-icon').evaluate(node => getComputedStyle(node).transform)).not.toBe('none');

  const kpi = page.locator('#idle-value');
  const kpiBox = await kpi.boundingBox();
  await page.mouse.move(kpiBox.x + kpiBox.width * 0.9, kpiBox.y + kpiBox.height * 0.5);
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--rx'))).toBe('');
  await expect.poll(() => kpi.evaluate(node => node.style.getPropertyValue('--ry'))).toBe('3.20deg');

  const bars = page.locator('#aging-chart-bars .chart-row:not([disabled])');
  await bars.first().hover();
  await expect.poll(() => bars.nth(1).locator('.chart-bar').evaluate(node => getComputedStyle(node).opacity)).toBe('0.35');
  await expect.poll(() => bars.first().locator('.chart-bar').evaluate(node => getComputedStyle(node).opacity)).toBe('1');

  const row = page.locator('#result-rows tr:not(.urgent-row):not(.group-row)').first();
  await row.hover();
  await expect(row.locator('td').first()).toHaveCSS('box-shadow', /inset/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const other = page.locator('.summary-card[data-summary-action]').nth(1);
  const otherBox = await other.boundingBox();
  await page.mouse.move(otherBox.x + otherBox.width * 0.2, otherBox.y + otherBox.height * 0.2);
  await page.waitForTimeout(100);
  expect(await other.evaluate(node => node.style.getPropertyValue('--rx'))).toBe('');
  expect(await other.evaluate(node => getComputedStyle(node).transform)).not.toMatch(/^matrix3d/);
});

test('botão Zebrado alterna as linhas alternadas e lembra a escolha', async ({ page }) => {
  await page.goto('./');
  await upload(page);
  const stripe = page.locator('#stripe-toggle');
  const second = page.locator('#result-rows tr').nth(1);
  const plain = await second.evaluate(row => getComputedStyle(row).backgroundColor);
  await page.locator('#view-menu summary').click();
  await stripe.click();
  await expect(stripe).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => second.evaluate(row => getComputedStyle(row).backgroundColor)).not.toBe(plain);
  await page.reload();
  await upload(page);
  await expect(page.locator('#stripe-toggle')).toHaveAttribute('aria-pressed', 'true');
});
