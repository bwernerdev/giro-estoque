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
    if (width >= 1360) {
      // Pesquisa, filtros e ações dividem a mesma linha e a mesma base.
      expect(Math.abs((local.y + local.height) - (exportButton.y + exportButton.height))).toBeLessThan(1);
    } else {
      expect(local.y).toBeGreaterThan(exportButton.y + exportButton.height);
    }
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
      return select.clientWidth >= text + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
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
            const detailsFit = [...document.querySelectorAll('.details-button')].every(control => inside(control.getBoundingClientRect(), control.closest('td').getBoundingClientRect()));
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
  // Abaixo de 1024 px a pesquisa continua recolhida; no desktop ela fica sempre à vista (teste seguinte).
  await page.setViewportSize({ width: 900, height: 900 });
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
  await expect(page.locator('#total-value strong')).toHaveText('R$ 150,00');
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
  await expect(page.locator('#shelf-filter option')).toHaveText(['Todas', 'B']);
  await expect(page.locator('#partition-filter option')).toHaveText(['Todas', 'II']);
});

test('desktop: pesquisa sempre visível, atalho "/" e Esc não a recolhem', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await upload(page);
  const search = page.getByRole('searchbox', { name: 'Pesquisa' });
  await expect(page.locator('#search-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(search).toBeVisible();
  await page.locator('#density-toggle').focus();
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeVisible();
  await page.locator('#search-toggle').click();
  await expect(search).toBeFocused();
});

test('desktop: densidade compacta por padrão em 1366 px e linha com duas linhas no modo padrão', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await page.locator('#file-input').setInputFiles({ name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from('Produto;Codigo;Estoque;Vendas\nA;001;50;30\nB;002;5;30') });
  await expect(page.locator('#result-rows tr')).toHaveCount(2);
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  const cell = page.locator('#result-rows td.col-descricao').first();
  const lines = await cell.evaluate(td => ({ strong: td.querySelector('strong').getBoundingClientRect(), code: td.querySelector('.item-code').getBoundingClientRect(), small: td.querySelector('small').getBoundingClientRect() }));
  expect(Math.abs(lines.code.y - lines.small.y)).toBeLessThan(8);
  expect(lines.code.y).toBeGreaterThan(lines.strong.y);
});

test('desktop: resumo ocupa a linha inteira e o cabeçalho do painel é único', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await page.locator('#file-input').setInputFiles({ name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from('Produto;Codigo;Estoque;Vendas;Valor do estoque\nA;001;50;30;10\nB;002;5;30;20') });
  await expect(page.locator('#result-rows tr')).toHaveCount(2);
  const gap = await page.locator('#summary').evaluate(grid => {
    const bounds = grid.getBoundingClientRect();
    const first = grid.children[0].getBoundingClientRect();
    const last = [...grid.children].filter(card => Math.abs(card.getBoundingClientRect().y - first.y) < 4).at(-1).getBoundingClientRect();
    return Math.abs(bounds.right - last.right);
  });
  expect(gap).toBeLessThan(2);
  await expect(page.getByText('Preparar análise')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Trocar arquivo' })).toBeVisible();
  await expect(page.locator('#upload-card')).not.toBeVisible();
});

test('desktop: cabeçalho da tabela e rodapé permanecem fixos durante a rolagem', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 700 });
  await page.goto('./');
  await upload(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => {
    const tools = document.querySelector('.table-tools').getBoundingClientRect();
    const head = document.querySelector('#table-head th').getBoundingClientRect();
    const footer = document.querySelector('#table-footer').getBoundingClientRect();
    return Math.abs(head.top - tools.bottom) < 2 && Math.abs(footer.bottom - innerHeight) < 2;
  })).toBe(true);
});

test('desktop: clicar na linha abre o painel e as setas navegam entre itens', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await upload(page);
  await page.locator('#result-rows tr').nth(1).locator('td.col-local').click();
  await expect(page.locator('#item-panel')).toBeVisible();
  await expect(page.locator('.panel-item-name')).toHaveText('Item 01');
  await expect(page.locator('#result-rows tr.is-selected')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.panel-item-name')).toHaveText('Item 02');
  await page.locator('#item-panel-prev').click();
  await expect(page.locator('.panel-item-name')).toHaveText('Item 01');
  await page.keyboard.press('Escape');
  await expect(page.locator('#item-panel')).not.toBeVisible();
  await expect(page.locator('#result-rows tr.is-selected')).toHaveCount(0);
});
