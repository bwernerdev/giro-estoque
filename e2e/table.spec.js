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
    for (const theme of ['light', 'dark']) {
      for (const density of ['comfortable', 'compact']) {
        await page.evaluate(({ theme, density }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.density = density;
        }, { theme, density });
        for (const open of [false, true]) {
          await page.locator('.row-details').first().evaluate((details, expanded) => { details.open = expanded; }, open);
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
            const detailsFit = [...document.querySelectorAll('.row-details summary')].every(summary => {
              const label = summary.querySelector(summary.parentElement.open ? '.details-hide' : '.details-show');
              const button = summary.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(label);
              return range.getClientRects().length === 1 && inside(button, summary.closest('td').getBoundingClientRect()) && inside(label.getBoundingClientRect(), button, 5) && label.getBoundingClientRect().right <= button.right - 14;
            });
            return scroll.scrollWidth <= scroll.clientWidth + 1 && wholeHeaders && badgesFit && detailsFit;
          })).toBe(true);
        }
      }
    }
    await expect(page.locator('#table-head th')).toHaveCount(9);
  });
}

test('expansões sobrevivem à ordenação, busca e paginação e reiniciam na nova importação', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('./');
  await upload(page);
  const first = page.locator('#result-rows tr').filter({ has: page.locator('.col-prateleira', { hasText: /^ESTANTE-0$/ }) });
  const second = page.locator('#result-rows tr').filter({ has: page.locator('.col-prateleira', { hasText: /^ESTANTE-1$/ }) });
  await expect(first.locator('.item-description')).toHaveClass(/is-expandable/);
  const collapsed = await first.locator('strong').evaluate(text => text.clientHeight);
  await first.locator('.item-description summary').click();
  expect(await first.locator('strong').evaluate(text => text.clientHeight)).toBeGreaterThan(collapsed);
  await first.locator('.row-details summary').click();
  await page.locator('[data-sort-key="item"]').click();
  await expect(first.locator('.item-description')).toHaveAttribute('open', '');
  await expect(first.locator('.row-details')).toHaveAttribute('open', '');
  await expect(second.locator('.row-details')).not.toHaveAttribute('open');
  await page.locator('#search').fill('SETOR-60');
  await expect(page.locator('#result-rows tr')).toHaveCount(1);
  await page.locator('#search').fill('');
  await expect(first.locator('.row-details')).toHaveAttribute('open', '');
  await page.locator('#page-next').click();
  await expect(page.locator('#result-rows tr')).toHaveCount(11);
  await page.locator('#page-previous').click();
  await expect(first.locator('.item-description')).toHaveAttribute('open', '');
  await expect(first.locator('.row-details')).toHaveAttribute('open', '');
  await first.locator('.row-details summary').click();
  await page.locator('[data-sort-key="sku"]').click();
  await expect(first.locator('.row-details')).not.toHaveAttribute('open');
  await upload(page);
  await expect(first.locator('.item-description')).not.toHaveAttribute('open');
  await expect(first.locator('.row-details')).not.toHaveAttribute('open');
});
