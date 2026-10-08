import { test, expect } from '@playwright/test';

const longName = 'AAA CALCA MOD SOCIAL TIPO MASCULINO MATERIAL TERBRIM COR AZ MARI 519 FORRO SFORRO BOLSO 2 FRONTAIS2 TRASEIROS LOGO SEARA BARRA SELASTICO COR AZ MARI 519 FECH BOTZIP TAMANHO EG CONFECCAO ESPECIAL NAO APLICAVEL';
const headers = 'Nm Item;Cd Item;Cd Local Estoque;Cd Prateleira;Cd Reparticao;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio';
const csv = [headers, ...Array.from({ length: 61 }, (_, i) =>
  `${i === 0 ? longName : `Item ${String(i).padStart(2, '0')}`};001;4;ESTANTE-${i};SETOR-${i};8;0;0;200;Acima de 90;Desbloqueado;Desbloqueado`
)].join('\n');

async function upload(page) {
  await page.locator('#file-input').setInputFiles({ name: 'layout.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#result-rows tr')).toHaveCount(50);
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [768, 1024, 1366, 1920]) {
  test(`tabela cabe em ${width}px com cabeçalhos inteiros e controles contidos`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await upload(page);
    await page.locator('#filter').selectOption('BLOQUEAR E TRANSFERIR OBSOLETO');
    const compact = await page.locator('#density-toggle').boundingBox();
    const exportButton = await page.locator('#export-menu summary').boundingBox();
    expect(Math.abs(compact.y - exportButton.y)).toBeLessThan(1);
    const local = await page.locator('#location-filter').boundingBox();
    const searchToggle = await page.locator('#search-toggle').boundingBox();
    expect(Math.abs(searchToggle.y - exportButton.y)).toBeLessThan(1);
    expect(local.y).toBeGreaterThan(exportButton.y + exportButton.height);
    if (width >= 1024) {
      for (const selector of ['#shelf-filter', '#partition-filter', '#filter']) {
        const control = await page.locator(selector).boundingBox();
        expect(Math.abs(control.y - local.y)).toBeLessThan(1);
      }
    }
    const filters = await page.locator('.table-filters').boundingBox();
    expect(Math.abs(local.x - filters.x)).toBeLessThan(1);
    expect(await page.locator('.table-filters select').evaluateAll(selects => selects.every(select => {
      const style = getComputedStyle(select);
      const context = document.createElement('canvas').getContext('2d');
      context.font = style.font;
      const text = context.measureText(select.selectedOptions[0].textContent).width;
      return select.clientWidth >= text + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 24
        && parseFloat(style.borderRadius) >= 100;
    }))).toBe(true);
    for (const theme of ['light', 'dark']) {
      for (const density of ['comfortable', 'compact']) {
        await page.evaluate(({ theme, density }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.density = density;
        }, { theme, density });
        for (const open of [false, true]) {
          if (open) await page.locator('.details-button').first().click();
          await expect.poll(() => page.evaluate(() => {
            const scroll = document.querySelector('.table-scroll');
            const inside = (child, parent, inset = 0) => child.left >= parent.left + inset - 1 && child.right <= parent.right - inset + 1 && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
            const wholeHeaders = ['prateleira', 'reparticao'].every(name => {
              const button = document.querySelector(`th.col-${name} button`);
              const range = document.createRange();
              range.selectNodeContents(button.firstChild);
              const rects = [...range.getClientRects()];
              return rects.length === 1 && inside(rects[0], button.getBoundingClientRect());
            });
            const badgesFit = [...document.querySelectorAll('#result-rows .badge')].every(badge => {
              const rect = badge.getBoundingClientRect();
              return ['.badge-label', '.badge-icon'].every(selector => inside(badge.querySelector(selector).getBoundingClientRect(), rect));
            });
            const detailsFit = [...document.querySelectorAll('.details-button')].every(control => {
              const button = control.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(control.firstChild);
              return range.getClientRects().length === 1 && inside(button, control.closest('td').getBoundingClientRect());
            });
            return scroll.scrollWidth <= scroll.clientWidth + 1 && wholeHeaders && badgesFit && detailsFit;
          })).toBe(true);
          if (open) {
            await expect(page.locator('#item-panel')).toBeVisible();
            expect(await page.locator('#item-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
            await page.locator('#item-panel-close').click();
          }
        }
      }
    }
    await expect(page.locator('#table-head th')).toHaveCount(9);
  });
}

test('descrições sobrevivem à ordenação, busca e paginação e detalhes abrem sem deslocar linhas', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await upload(page);
  const first = page.locator('#result-rows tr').filter({ has: page.locator('.col-prateleira', { hasText: /^ESTANTE-0$/ }) });
  const second = page.locator('#result-rows tr').filter({ has: page.locator('.col-prateleira', { hasText: /^ESTANTE-1$/ }) });
  await expect(first.locator('.item-description')).toHaveClass(/is-expandable/);
  const collapsed = await first.locator('strong').evaluate(text => text.clientHeight);
  await first.locator('.item-description summary').click();
  expect(await first.locator('strong').evaluate(text => text.clientHeight)).toBeGreaterThan(collapsed);
  const height = await first.evaluate(row => row.getBoundingClientRect().height);
  await first.locator('.details-button').click();
  await expect(page.locator('#item-panel')).toBeVisible();
  await expect(page.locator('.panel-item-name')).toHaveText(longName);
  await expect(page.locator('#item-panel-content')).toContainText('200 dias desde a última requisição');
  await expect(page.locator('#item-panel-content')).not.toContainText('Motivo do bloqueio');
  expect(await first.evaluate(row => row.getBoundingClientRect().height)).toBe(height);
  await page.keyboard.press('Escape');
  await expect(first.locator('.details-button')).toBeFocused();
  await page.locator('[data-sort-key="item"]').click();
  await expect(first.locator('.item-description')).toHaveAttribute('open', '');
  await second.locator('.details-button').click();
  await expect(page.locator('.panel-item-name')).toHaveText('Item 01');
  await page.locator('#item-panel-close').click();
  await page.locator('#search-toggle').click();
  await page.locator('#search').fill('Item 60');
  await expect(page.locator('#result-rows tr')).toHaveCount(1);
  await page.locator('#search').fill('');
  await expect(first.locator('.item-description')).toHaveAttribute('open', '');
  await page.locator('#page-next').click();
  await expect(page.locator('#result-rows tr')).toHaveCount(11);
  await page.locator('#page-previous').click();
  await expect(first.locator('.item-description')).toHaveAttribute('open', '');
  await first.locator('.item-description summary').click();
  await page.locator('[data-sort-key="sku"]').click();
  await expect(first.locator('.item-description')).not.toHaveAttribute('open');
  await upload(page);
  await expect(first.locator('.item-description')).not.toHaveAttribute('open');
  await expect(page.locator('#item-panel')).not.toBeVisible();
});

test('copia códigos com zeros à esquerda e confirma sucesso na tabela e no painel', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await upload(page);
  const copy = page.locator('#result-rows .copy-code').first();
  await copy.click();
  await expect(copy).toHaveAttribute('title', 'Copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('001');
  await expect(page.locator('#copy-feedback')).toHaveText('Código 001 copiado.');
  await page.locator('.details-button').first().click();
  await page.locator('#item-panel .copy-code').click();
  await expect(page.locator('#item-panel .copy-code')).toHaveAttribute('title', 'Copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('001');
});

test('pesquisa expande ao clicar, recolhe vazia e mantém buscas ativas após perder foco e recarregar', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await upload(page);
  const toggle = page.locator('#search-toggle');
  const search = page.getByRole('searchbox', { name: 'Pesquisa' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(search).not.toBeVisible();
  await toggle.hover();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(search).toBeFocused();
  await expect(search).toBeVisible();
  const toggleBounds = await toggle.boundingBox();
  const searchBounds = await search.boundingBox();
  expect(searchBounds.x).toBeGreaterThan(toggleBounds.x + toggleBounds.width);
  expect(Math.abs((searchBounds.y + searchBounds.height / 2) - (toggleBounds.y + toggleBounds.height / 2))).toBeLessThan(1);
  await page.locator('#density-toggle').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(search).not.toBeVisible();
  await toggle.click();
  await search.fill('Item 60');
  await expect(page.locator('#result-rows tr')).toHaveCount(1);
  await page.locator('#density-toggle').click();
  await expect(search).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.reload();
  await page.locator('#file-input').setInputFiles({ name: 'layout.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#result-rows tr')).toHaveCount(1);
  await expect(search).toHaveValue('Item 60');
  await expect(search).toBeVisible();
  await page.locator('#clear-filters').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(search).not.toBeVisible();
  await expect(page.locator('#result-rows tr')).toHaveCount(50);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('combina filtros de localização, exporta todos os filtrados e lembra o tamanho da página', async ({ page }) => {
  const positions = [headers + ';Vl Saldo', ...Array.from({ length: 61 }, (_, i) =>
    `Item ${i};00${i};${i === 60 ? 7 : 4};${i < 30 ? 'A' : 'B'};${i % 2 ? 'I' : 'II'};8;0;0;200;Acima de 90;Desbloqueado;Desbloqueado;10`
  )].join('\n');
  const load = () => page.locator('#file-input').setInputFiles({ name: 'posicoes.csv', mimeType: 'text/csv', buffer: Buffer.from(positions) });
  await page.goto('./');
  await load();
  await expect(page.locator('#result-rows tr')).toHaveCount(50);
  await page.locator('#location-filter').selectOption('4');
  await page.locator('#shelf-filter').selectOption('A');
  await page.locator('#partition-filter').selectOption('I');
  await expect(page.locator('#filtered-count')).toHaveText('15 de 61 itens');
  await expect(page.locator('#summary .local-total strong')).toHaveText('R$ 150,00');
  await expect(page.locator('#active-filters-text')).toContainText('Prateleira A');
  await expect(page.locator('#active-filters-text')).toContainText('Repartição I');
  const download = page.waitForEvent('download');
  await page.locator('#export-menu summary').click();
  await page.locator('[data-export="csv"]').click();
  const { readFile } = await import('node:fs/promises');
  const exported = await readFile(await (await download).path(), 'utf8');
  expect(exported.trim().split(/\r?\n/)).toHaveLength(16);
  await page.locator('#page-size').selectOption('25');
  await page.locator('#clear-filters').click();
  await expect(page.locator('#result-rows tr')).toHaveCount(25);
  await page.locator('#page-next').click();
  await expect(page.locator('#page-label')).toHaveText('Página 2 de 3');
  await page.locator('#page-size').selectOption('100');
  await expect(page.locator('#result-rows tr')).toHaveCount(61);
  await expect(page.locator('#pagination')).not.toBeVisible();
  await page.reload();
  await load();
  await expect(page.locator('#page-size')).toHaveValue('100');
  await expect(page.locator('#result-rows tr')).toHaveCount(61);
  await page.locator('#location-filter').selectOption('7');
  await expect(page.locator('#shelf-filter option')).toHaveText(['Todas as prateleiras', 'B']);
  await expect(page.locator('#partition-filter option')).toHaveText(['Todas as repartições', 'II']);
});
