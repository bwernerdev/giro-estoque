import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import ExcelJS from 'exceljs';
import { parseCsv } from '../src/import.js';

let instance = 0;
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('A interface não concluiu a operação.');
}

async function boot(t) {
  const dom = new JSDOM('<html><head><meta name="theme-color"></head><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, ExcelJS,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const downloads = [];
  t.mock.method(URL, 'createObjectURL', blob => { downloads.push(blob); return 'blob:review'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', () => {});
  t.mock.method(dom.window, 'print', () => {});
  t.after(() => dom.window.close());
  await import(`../src/main.js?test=${++instance}`);
  const el = selector => dom.window.document.querySelector(selector);
  const change = (selector, value, event = 'change') => { const target = el(selector); target.value = value; target.dispatchEvent(new dom.window.Event(event, { bubbles: true })); };
  async function load(file) {
    Object.defineProperty(el('#file-input'), 'files', { configurable: true, value: [file] });
    el('#file-input').dispatchEvent(new dom.window.Event('change'));
    await waitFor(() => !el('#upload-card').hasAttribute('aria-busy'));
  }
  async function exportFile(format) {
    const count = downloads.length;
    el(`[data-export="${format}"]`).click();
    await waitFor(() => downloads.length > count);
    return downloads.at(-1);
  }
  return { el, change, load, exportFile, csv: (text, name = 'dados.csv') => load({ name, text: async () => text }) };
}

test('importação mantém itens sem nome, número original da linha e aviso de revisão', async t => {
  const app = await boot(t);
  await app.csv('Relatorio\nProduto;Codigo;Estoque;Vendas\nA;1;5;30\n\n;2;999;10\nTotal;;1004;40\nB;3;10;30');
  assert.equal(app.el('#filtered-count').textContent, '3 de 3 itens');
  assert.match(app.el('#result-rows').textContent, /Linha 5/);
  assert.match(app.el('#message').textContent, /1 linha precisa/);
  const csv = parseCsv((await (await app.exportFile('csv')).text()).replace(/^\uFEFF/, ''), ';');
  const origin = csv[0].indexOf('Linha na planilha');
  assert.deepEqual(csv.slice(1).map(row => row[origin]), ['3', '5', '7']);
});

test('coluna monetária adicional não bloqueia análise e critérios sobrevivem ao remapeamento e à troca de modo', async t => {
  const app = await boot(t);
  await app.csv('Produto;Codigo;Estoque;Vendas;Valor do estoque;Valor do consumo\nA;1;50;30;100;100');
  assert.equal(app.el('#results-section').hidden, false);
  assert.ok(app.el('#safety-days'));
  app.change('#safety-days', '50', 'input');
  await waitFor(() => app.el('#result-rows').textContent.includes('Comprar'));
  app.change('[data-map="sku"]', '-1');
  assert.equal(app.el('#safety-days').value, '50');
  app.change('#analysis-mode', 'giro');
  app.change('#short-days', '40', 'input');
  app.change('#analysis-mode', 'generic');
  assert.equal(app.el('#safety-days').value, '50');
  app.change('#analysis-mode', 'giro');
  assert.equal(app.el('#short-days').value, '40');
});

test('formato numérico explícito muda a leitura do CSV e rejeita dados malformados', async t => {
  const app = await boot(t);
  await app.csv('Produto;Estoque;Vendas\nA;1.234;30\nB;abc12;30');
  assert.match(app.el('#result-rows').textContent, /Avaliar excesso/);
  app.change('#number-format', 'en-US');
  await waitFor(() => app.el('#result-rows').textContent.includes('Comprar'));
  assert.match(app.el('#message').textContent, /1 linha precisa/);
});

test('Excel e CSV exportam todos os itens filtrados e PDF mantém o contexto', async t => {
  const app = await boot(t);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dados');
  sheet.addRow(['Produto', 'Codigo', 'Estoque', 'Vendas']);
  for (let index = 0; index < 61; index++) sheet.addRow([index === 0 ? '=1+1' : `Peca ${index}`, String(index).padStart(3, '0'), 5.25, 30]);
  sheet.addRow(['Manter', 'ultimo', 50, 30]);
  const buffer = await workbook.xlsx.writeBuffer();
  await app.load({ name: 'dados.xlsx', arrayBuffer: async () => buffer });
  assert.equal(app.el('#result-rows').children.length, 50);
  app.change('#filter', 'Comprar');
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(await (await app.exportFile('xlsx')).arrayBuffer());
  assert.equal(exported.worksheets[0].rowCount, 62);
  assert.equal(exported.worksheets[0].getCell('A2').value, '000');
  assert.equal(exported.worksheets[0].getCell('B2').value, '=1+1');
  assert.equal(exported.worksheets[0].getCell('B2').type, ExcelJS.ValueType.String);
  const csv = parseCsv((await (await app.exportFile('csv')).text()).replace(/^\uFEFF/, ''), ';');
  assert.equal(csv.length, 62);
  assert.equal(csv[1][1], "'=1+1");
  assert.equal(csv[1][5], '5,25');
  assert.equal(csv[1][csv[0].indexOf('Recomendação')], 'Comprar');
  app.el('[data-export="pdf"]').click();
  assert.equal(app.el('#print-report tbody').children.length, 61);
  assert.match(app.el('#print-report').textContent, /Comprar/);
});

test('uma importação vazia preserva a planilha anterior e seus controles', async t => {
  const app = await boot(t);
  await app.csv('Produto;Estoque;Vendas\nA;5;30', 'anterior.csv');
  await app.csv('', 'vazio.csv');
  assert.match(app.el('#message').textContent, /Não encontrei/);
  assert.match(app.el('#import-context').textContent, /anterior.csv/);
  app.change('[data-map="sku"]', '-1');
  await waitFor(() => app.el('#message').textContent === '');
  assert.equal(app.el('#filtered-count').textContent, '1 de 1 item');
});

test('o evento de instalação do app não exibe mensagem de sucesso', async t => {
  const app = await boot(t);
  const message = app.el('#message');
  message.textContent = 'Estado atual do app';
  message.className = 'message';
  const installEvent = new message.ownerDocument.defaultView.Event('appinstalled', { bubbles: true });
  message.dispatchEvent(installEvent);
  assert.equal(message.textContent, 'Estado atual do app');
  assert.equal(message.className, 'message');
});
