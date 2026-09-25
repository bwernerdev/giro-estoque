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
  await expect(page.locator('#message')).toContainText('1 linha precisa');
  await page.screenshot({ path: 'test-results/desktop-light.png', fullPage: true });
  await page.locator('#theme-toggle').click();
  await page.screenshot({ path: 'test-results/desktop-dark.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
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

test('interface e configuração cabem na tela do celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await upload(page);
  await page.getByRole('button', { name: 'Abrir configuração' }).click();
  await expect(page.locator('#number-format')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-config.png', fullPage: true });
  await page.getByRole('button', { name: 'Fechar configuração' }).click();
  await page.screenshot({ path: 'test-results/mobile-results.png', fullPage: true });
});
