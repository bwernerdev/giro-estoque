// "Gerar painel": baixa o painel-giro-estoque.html (app + dados num arquivo só) e abre como
// arquivo e dentro de um quadro isolado, como a pré-visualização do SharePoint (iframe sandbox,
// srcdoc, sem armazenamento, download nem impressão).
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { attach, attachSnac, SNAC_HEADER } from './helpers.js';

const SNAC = `${SNAC_HEADER}7609604;Compra confirmada;10/10/2026;1;1001;4;7222987;7;Compra confirmada;\n7609605;Cancelada;11/10/2026;1;1002;;;;;`;
const ANALITICO = 'Cd Item;Nm Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio\n1001;Luva;4;1;4;8;10;Item com Giro;Desbloqueado;Desbloqueado\n1002;Broca;4;0;2;5;10;Sem Saldo;Desbloqueado;Desbloqueado\n1003;Pino;298;0;2;5;10;Sem Saldo;Desbloqueado;Desbloqueado';
const cards = root => root.locator('#summary [data-summary-action]');

async function generate(page, info) {
  await page.goto('./');
  await attachSnac(page, SNAC);
  await attach(page, { name: 'estoque.csv', mimeType: 'text/csv', buffer: Buffer.from(ANALITICO) });
  await expect(page.locator('#results-section')).toBeVisible();
  await expect(page.locator('#generate-panel')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#generate-panel').click()]);
  expect(download.suggestedFilename()).toBe('painel-giro-estoque.html');
  await expect(page.locator('#message')).toContainText('Painel gerado: painel-giro-estoque.html');
  // Com extensão .html (o download.path() não tem), senão o navegador abre como texto.
  const path = info.outputPath('painel-giro-estoque.html');
  await download.saveAs(path);
  return { path, html: await readFile(path, 'utf8') };
}

test('botão Gerar painel só aparece com o painel aberto', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#generate-panel')).toBeHidden();
});

test('painel aberto como arquivo: mesmas ações, só consulta, tudo embutido', async ({ page, context }, info) => {
  const { path, html } = await generate(page, info);
  expect(html).not.toContain('__DADOS_DO_PAINEL__');
  expect(html).not.toMatch(/<script[^>]*\ssrc=|<link[^>]*stylesheet/);

  const panel = await context.newPage();
  const errors = [];
  panel.on('pageerror', error => errors.push(error.message));
  const external = [];
  panel.on('request', request => { if (!/^(file|data|blob):/.test(request.url())) external.push(request.url()); });
  await panel.goto(pathToFileURL(path).href);
  await expect(panel.locator('#results-section')).toBeVisible();
  await expect(cards(panel)).toHaveText([/comprar/i]);
  await expect(panel.locator('#result-rows')).toContainText('SC 7609605 · Cancelada');
  await expect(panel.locator('#topbar-file')).toContainText('Dados de');
  for (const selector of ['.upload-card', '#replace-file', '#purchase-file', '#config-toggle', '#generate-panel', '#frame-notice']) {
    await expect(panel.locator(selector), selector).toBeHidden();
  }
  await panel.locator('#export-menu summary').click();
  await expect(panel.locator('[data-export="xlsx"]')).toBeHidden();
  await expect(panel.locator('[data-export="csv"]')).toBeVisible();
  const [csv] = await Promise.all([panel.waitForEvent('download'), panel.locator('[data-export="csv"]').click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  // Fontes e ícone embutidos: a página não busca nada fora do arquivo.
  expect(await panel.evaluate(() => document.fonts.check('700 16px Manrope'))).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('painel dentro de quadro isolado (SharePoint): aviso e sem exportar', async ({ page, context }, info) => {
  const { html } = await generate(page, info);
  const host = await context.newPage();
  const errors = [];
  host.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await host.setViewportSize({ width: 1400, height: 900 });
  await host.setContent('<iframe sandbox="allow-scripts" style="width:1380px;height:880px;border:0"></iframe>');
  await host.locator('iframe').evaluate((frame, srcdoc) => { frame.srcdoc = srcdoc; }, html);
  const frame = host.frameLocator('iframe');
  await expect(frame.locator('#results-section')).toBeVisible();
  await expect(cards(frame)).toHaveCount(1);
  await expect(frame.locator('#frame-notice')).toBeVisible();
  await expect(frame.locator('#export-menu')).toBeHidden();
  await frame.locator('#result-rows tr[data-row]').first().click();
  await expect(frame.locator('.detail-fields').locator('visible=true')).toContainText('Ação recomendada');
  expect(errors).toEqual([]);
});
