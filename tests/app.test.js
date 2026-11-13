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
  async function load(file, input = '#file-input') {
    Object.defineProperty(el(input), 'files', { configurable: true, value: [file] });
    el(input).dispatchEvent(new dom.window.Event('change'));
    await waitFor(() => !el('#upload-card').hasAttribute('aria-busy'));
  }
  // O painel do Analítico só abre com o SNAC0540: carrega um mínimo (SC de outro item) antes.
  async function csv(text, name = 'dados.csv', { snac = true } = {}) {
    if (snac && /Qnt Min/.test(text) && el('#purchase-field').dataset.state !== 'ok') await load({ name: 'REL_SNAC0540.CSV', text: async () => SNAC_MIN }, '#purchase-input');
    await load({ name, text: async () => text });
  }
  async function exportFile(format) {
    const count = downloads.length;
    el(`[data-export="${format}"]`).click();
    await waitFor(() => downloads.length > count);
    return downloads.at(-1);
  }
  return { el, change, load, exportFile, csv };
}

test('importação mantém itens sem nome, número original da linha e aviso de revisão', async t => {
  const app = await boot(t);
  await app.csv('Relatorio\nProduto;Codigo;Estoque;Vendas\nA;1;5;30\n\n;2;999;10\nTotal;;1004;40\nB;3;10;30');
  assert.equal(app.el('#filtered-count').textContent, '3 de 3 itens');
  assert.match(app.el('#result-rows').textContent, /Linha 5/);
  assert.match(app.el('#data-quality').textContent, /1 linha precisa/);
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
  assert.match(app.el('#data-quality').textContent, /1 linha precisa/);
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
  assert.match(app.el('#topbar-file').textContent, /anterior.csv/);
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

test('o botão de instalar só aparece quando o navegador oferece a instalação', async t => {
  const app = await boot(t);
  const installButton = app.el('#install-app');
  assert.equal(installButton.hidden, true);
  const view = installButton.ownerDocument.defaultView;
  view.dispatchEvent(new view.Event('beforeinstallprompt', { cancelable: true }));
  assert.equal(installButton.hidden, false);
  view.dispatchEvent(new view.Event('appinstalled'));
  assert.equal(installButton.hidden, true);
});

test('modo Analítico mostra as oito colunas fixas com posição combinada e valor', async t => {
  const app = await boot(t);
  await app.csv('Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio\nPeça A;001;298;5;10;20;200;Acima de 90;Bloqueado por saldo;Bloqueado');
  assert.equal(app.el('#result-table').className, 'analitico-table');
  assert.deepEqual([...app.el('#table-head').querySelectorAll('th')].map(node => node.textContent),
    ['Descrição', 'Código', 'Posição', 'Qtd. atual', 'Mín. / Máx', 'Valor', 'Ação', 'Sem requisição']);
  const cells = [...app.el('#result-rows').querySelector('tr').children].map(node => node.textContent);
  assert.equal(cells.length, 8);
  assert.equal(cells[0], 'Peça A');
  assert.equal(app.el('#result-rows').querySelector('tr').children[0].querySelectorAll('small').length, 0);
  assert.equal(cells[1], '001');
  assert.equal(cells[2], '298 · — · —');
  assert.match(app.el('#result-rows td.col-posicao span').title, /Local 298 · Prateleira — · Repartição —/);
  assert.equal(cells[3], '5');
  assert.equal(cells[4], '10 / 20');
  assert.equal(cells[5], '—');
  assert.match(cells[6], /ZERAR MIN\/MAX/);
  assert.equal(cells[7], '200 dias');
  assert.equal(app.el('#result-rows .details-button').getAttribute('aria-label'), 'Ver detalhes');
  app.change('#search', 'inexistente', 'input');
  await waitFor(() => app.el('#result-rows').textContent.includes('Nenhum item encontrado'));
  assert.equal(app.el('#result-rows').querySelector('td').getAttribute('colspan'), '8');
});

test('a coluna Valor mostra a barra do peso de cada item e o esqueleto some depois da importação', async t => {
  const app = await boot(t);
  await app.csv('Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio;Vl Saldo\nPeça A;001;7;5;10;20;200;Acima de 90;;Desbloqueado;100\nPeça B;002;7;5;10;20;200;Acima de 90;;Desbloqueado;25\nPeça C;003;7;0;10;20;200;Acima de 90;;Desbloqueado;0');
  const hidden = app.el('#show-hidden');
  hidden.checked = true;
  hidden.dispatchEvent(new hidden.ownerDocument.defaultView.Event('change'));
  await waitFor(() => app.el('#result-rows').querySelectorAll('tr').length === 3);
  const cells = [...app.el('#result-rows').querySelectorAll('td.col-valor')];
  const bars = cells.map(cell => cell.querySelector('.value-bar > span')?.style.width ?? null);
  assert.deepEqual(bars.sort(), ['100%', '25%', null].sort());
  const titles = cells.map(cell => cell.querySelector('.value-cell')?.title).filter(Boolean).sort();
  assert.deepEqual(titles, ['20% do valor dos itens filtrados', '80% do valor dos itens filtrados']);
  assert.ok(cells.every(cell => /R\$/.test(cell.textContent)), 'o valor continua legível na célula');
  assert.equal(app.el('.shell').classList.contains('is-loading'), false);
  app.el('[data-export="summary"]').click();
  assert.equal(app.el('#print-report').className, 'summary-report');
  assert.match(app.el('#print-report h1').textContent, /Resumo do estoque/);
  assert.match(app.el('#print-report .report-kpi').textContent, /Valor total do estoque/);
  assert.match(app.el('#print-report .report-kpi').textContent, /R\$\s?125,00/);
  assert.equal(app.el('#print-report .report-bars') !== null, true);
  app.el('[data-export="pdf"]').click();
  assert.equal(app.el('#print-report').className, '');
  assert.ok(app.el('#print-report tbody tr'));
});

test('modo Analítico usa o número da linha como descrição apenas quando o nome do item não existe', async t => {
  const app = await boot(t);
  await app.csv('Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio\n;002;7;5;10;20;10;Item com Giro;Desbloqueado;Desbloqueado\nPeça B;003;7;5;10;20;200;Item com Giro;Desbloqueado;Desbloqueado');
  const rows = [...app.el('#result-rows').querySelectorAll('tr')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].textContent, 'Linha 2');
  assert.equal(rows[1].children[0].textContent, 'Peça B');
  assert.equal(rows[1].children[0].querySelectorAll('small').length, 0);
});

test('fora do Analítico a tabela preserva as seis colunas padrão', async t => {
  const app = await boot(t);
  await app.csv('Produto;Codigo;Estoque;Vendas\nA;1;5;30');
  assert.equal(app.el('#result-table').className, 'standard-table');
  assert.deepEqual([...app.el('#table-head').querySelectorAll('th')].map(node => node.textContent),
    ['Item', 'Estoque', 'Vendas / 30d', 'Cobertura', 'Recomendação', 'Motivo']);
  assert.equal(app.el('#result-rows').querySelector('tr').children.length, 6);
});

test('mantém filtros úteis, ordena colunas e restaura preferências na próxima importação', async t => {
  const app = await boot(t);
  const csv = 'Produto;Codigo;Estoque;Vendas\nBaixo;1;5;30\nMédio;2;50;30\nAlto;3;1000;30';
  await app.csv(csv);

  const options = [...app.el('#filter').options].map(option => option.textContent);
  assert.deepEqual(options, ['Todas as recomendações', 'Comprar', 'Avaliar excesso', 'Manter']);

  app.el('[data-sort-key="stock"]').click();
  assert.deepEqual([...app.el('#result-rows').querySelectorAll('tr td:first-child strong')].map(node => node.textContent), ['Baixo', 'Médio', 'Alto']);
  app.el('[data-sort-key="stock"]').click();
  assert.deepEqual([...app.el('#result-rows').querySelectorAll('tr td:first-child strong')].map(node => node.textContent), ['Alto', 'Médio', 'Baixo']);

  app.change('#filter', 'Manter');
  app.change('#search', 'Médio', 'input');
  await waitFor(() => JSON.parse(localStorage.getItem('controle-estoque-filters')).query === 'Médio');
  await app.csv(csv, 'nova.csv');
  assert.equal(app.el('#filter').value, 'Manter');
  assert.equal(app.el('#search').value, 'Médio');
  assert.equal(app.el('#table-head th:nth-child(2)').getAttribute('aria-sort'), 'descending');
  assert.equal(app.el('#result-rows').querySelectorAll('tr').length, 1);
});

test('mostra a contagem de itens ocultos e permite incluí-los pelo checkbox', async t => {
  const app = await boot(t);
  await app.csv('Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio\nOculto;001;7;5;0;10;10;Item com Giro;Desbloqueado;Desbloqueado\nVisível;002;7;5;0;10;200;Item com Giro;Desbloqueado;Desbloqueado');
  assert.equal(app.el('#hidden-toggle').hidden, false);
  assert.match(app.el('#hidden-toggle-text').textContent, /\(1\)/);
  assert.equal(app.el('#hidden-context'), null);
  app.el('#show-hidden').click();
  await waitFor(() => app.el('#filtered-count').textContent === '2 de 2 itens');
});

test('o total do estoque fica na barra do painel e a barra de andamento some ao terminar', async t => {
  const app = await boot(t);
  const bar = app.el('#progress');
  assert.equal(bar.hidden, true);
  const states = [];
  const view = bar.ownerDocument.defaultView;
  new view.MutationObserver(() => states.push(bar.hidden)).observe(bar, { attributes: true, attributeFilter: ['hidden'] });
  const rows = Array.from({ length: 1200 }, (_, i) => `Item ${i};${i};5;30;10`).join('\n');
  await app.csv(`Produto;Codigo;Estoque;Vendas;Valor do estoque\n${rows}`);
  assert.ok(states.includes(false), 'a barra deve aparecer durante a leitura');
  assert.equal(bar.hidden, true);
  assert.equal(app.el('#total-value').hidden, false);
  assert.match(app.el('#total-value').textContent, /Valor total do estoque/);
  assert.equal(app.el('#summary .local-total'), null);
});

test('agrupa por ação, recolhe grupos, mostra cartões com ícone e o arquivo na topbar', async t => {
  const app = await boot(t);
  await app.csv('Nm Item;Cd Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio\nA;001;7;5;0;10;200;Item com Giro;Desbloqueado;Desbloqueado\nB;002;7;0;0;0;50;Item com Giro;Bloqueado por saldo;Bloqueado\nC;003;7;5;0;10;200;Item com Giro;Desbloqueado;Desbloqueado', 'estoque.csv');
  assert.match(app.el('#topbar-file').textContent, /estoque\.csv/);
  assert.equal(app.el('#topbar-file').hidden, false);
  assert.ok(app.el('#summary').querySelectorAll('.summary-card .kpi-icon svg').length >= 2);
  assert.equal(app.el('#aging-chart').hidden, true, 'sem coluna de valor, o gráfico não aparece');
  assert.equal(app.el('#idle-value').hidden, true);

  assert.equal(app.el('#result-rows').querySelectorAll('tr.group-row').length, 0);
  app.el('#group-toggle').click();
  assert.equal(app.el('#group-toggle').getAttribute('aria-pressed'), 'true');
  const groups = [...app.el('#result-rows').querySelectorAll('tr.group-row')];
  assert.ok(groups.length >= 2, 'um cabeçalho por ação');
  assert.match(groups[0].textContent, /\d+ itens?/);
  const rowsBefore = app.el('#result-rows').querySelectorAll('tr[data-row]').length;
  assert.equal(rowsBefore, 3);
  groups[0].querySelector('[data-group-toggle]').click();
  assert.ok(app.el('#result-rows').querySelectorAll('tr[data-row]').length < rowsBefore);
  assert.ok(app.el('#result-rows').querySelector('tr[data-row]').className.length > 0, 'a linha leva a classe da ação');
});

const SNAC_HEADER = 'SC;SC;SC;SC;SC;SC;OF;OF;OF;REC\nCódigo;Situação;Data Criação;Seq.;Cód. Produto;Local Estoque;Codigo;Saldo;Situação OF;Nr NF\n';
const SNAC_MIN = `${SNAC_HEADER}7000001;Compra confirmada;10/10/2026;1;999999;;;;;`;
const SNAC = 'SC;SC;SC;SC;SC;SC;OF;OF;OF;REC\nCódigo;Situação;Data Criação;Seq.;Cód. Produto;Local Estoque;Codigo;Saldo;Situação OF;Nr NF\n7609604;Compra confirmada;10/10/2026;1;1001;4;7222987;5;Compra confirmada;\n7609605;Cancelada;11/10/2026;1;1002;;;;;';
const ANALITICO = 'Cd Item;Nm Item;Cd Local Estoque;Qtde Atual;Qnt Min;Qnt Max;Dif Dias;Itens Acima de 90 dias;Ds Motivo Bloqueio;Id Bloqueio\n1001;Luva;4;1;4;8;10;Item com Giro;Desbloqueado;Desbloqueado\n1002;Broca;4;0;2;5;10;Sem Saldo;Desbloqueado;Desbloqueado\n1003;Pino;298;0;2;5;10;Sem Saldo;Desbloqueado;Desbloqueado';

test('tela inicial: dois campos de anexo; SNAC0540 primeiro fica guardado até o Analítico', async t => {
  const app = await boot(t);
  const cards = () => [...app.el('#summary').querySelectorAll('[data-summary-action]')].map(card => card.dataset.summaryAction);
  assert.equal(app.el('#purchase-field').dataset.state, undefined);
  await app.csv(SNAC, 'REL_SNAC0540.CSV');
  assert.match(app.el('#message').textContent, /SNAC0540 carregado \(2 linhas de SC\)\. Agora importe o relatório Analítico\./);
  assert.equal(app.el('.shell').classList.contains('has-data'), false);
  assert.equal(app.el('#purchase-field').dataset.state, 'ok');
  assert.match(app.el('#purchase-status').textContent, /REL_SNAC0540\.CSV · 2 linhas de SC · importado às \d\d:\d\d/);
  assert.equal(app.el('#stock-field').dataset.state, undefined, 'o campo do Analítico continua vazio');

  Object.defineProperty(app.el('#purchase-input'), 'files', { configurable: true, value: [{ name: 'estoque.csv', text: async () => 'Cd Item;Nm Item\n1;A' }] });
  app.el('#purchase-input').dispatchEvent(new window.Event('change'));
  await waitFor(() => app.el('#purchase-field').dataset.state === 'error');
  assert.match(app.el('#purchase-status').textContent, /não é o relatório SNAC0540/);

  await app.csv(ANALITICO, 'estoque.csv', { snac: false });
  assert.match(app.el('#message').textContent, /Analítico importado com o SNAC0540 de \d\d:\d\d: 1 item para comprar e 1 com compra em andamento\./);
  assert.equal(app.el('#stock-field').dataset.state, 'ok');
  assert.equal(app.el('#purchase-field').dataset.state, 'ok', 'erro anterior some ao importar com sucesso');
  assert.deepEqual(cards(), ['COMPRAR', 'COMPRA EM ANDAMENTO']);
});

test('SNAC0540 é obrigatório: Analítico sozinho espera na tela inicial e o painel abre quando o SNAC0540 chega', async t => {
  const app = await boot(t);
  await app.csv(ANALITICO, 'estoque.csv', { snac: false });
  assert.match(app.el('#message').textContent, /Analítico carregado \(estoque\.csv\)\. Agora importe o SNAC0540 para gerar o painel\./);
  assert.equal(app.el('.shell').classList.contains('has-data'), false);
  assert.equal(app.el('#workspace').hidden, true);
  assert.equal(app.el('#stock-field').dataset.state, 'ok');
  assert.equal(app.el('#purchase-field').dataset.state, undefined);
  await app.load({ name: 'REL_SNAC0540.CSV', text: async () => SNAC }, '#purchase-input');
  assert.match(app.el('#message').textContent, /Analítico e SNAC0540 importados: 1 item para comprar e 1 com compra em andamento\./);
  assert.equal(app.el('.shell').classList.contains('has-data'), true);
  assert.equal(app.el('#workspace').hidden, false);
});

test('estoque e vendas não depende do SNAC0540', async t => {
  const app = await boot(t);
  await app.csv('Produto;Codigo;Estoque;Vendas\nA;1;5;30', 'giro.csv');
  assert.equal(app.el('.shell').classList.contains('has-data'), true);
});

test('SNAC0540 completa o Analítico: COMPRAR, COMPRA EM ANDAMENTO, SC na tabela e colunas de compra na exportação', async t => {
  const app = await boot(t);
  const snac = SNAC;
  await app.load({ name: 'REL_SNAC0540.CSV', text: async () => `${SNAC_HEADER}7609605;Cancelada;11/10/2026;1;1002;;;;;` }, '#purchase-input');
  await app.csv(ANALITICO, 'estoque.csv');
  assert.equal(app.el('#purchase-file').hidden, false);
  assert.match(app.el('#purchase-file').textContent, /SNAC0540 · \d\d:\d\d/);
  const cards = () => [...app.el('#summary').querySelectorAll('[data-summary-action]')].map(card => card.dataset.summaryAction);
  assert.deepEqual(cards(), ['COMPRAR']);
  assert.match(app.el('#result-rows').textContent, /comprar 7 até o máx\./);

  await app.csv(snac, 'REL_SNAC0540.CSV');
  assert.match(app.el('#message').textContent, /SNAC0540 importado: 2 linhas de SC\. 1 item para comprar e 1 com compra em andamento/);
  assert.match(app.el('#purchase-file').textContent, /SNAC0540 · \d\d:\d\d/);
  assert.equal(app.el('#topbar-file').textContent.includes('estoque.csv'), true, 'o Analítico continua carregado');
  assert.deepEqual(cards(), ['COMPRAR', 'COMPRA EM ANDAMENTO']);
  assert.match(app.el('#result-rows').textContent, /SC 7609604 · Compra confirmada/);
  assert.match(app.el('#result-rows').textContent, /SC 7609605 · Cancelada/);

  const csv = parseCsv((await (await app.exportFile('csv')).text()).replace(/^\uFEFF/, ''), ';');
  const column = name => csv[0].indexOf(name);
  assert.ok(column('Sugestão de compra (até o máximo)') > column('Ações'));
  assert.equal(column('Comprar até o mínimo'), -1);
  const luva = csv.find(row => row[0] === '1001');
  assert.deepEqual([luva[column('Sugestão de compra (até o máximo)')], luva[column('SC')], luva[column('Data da SC')], luva[column('Situação da SC')], luva[column('OF')]],
    ['7', '7609604', '10/10/2026', 'Compra confirmada', '7222987']);
  const broca = csv.find(row => row[0] === '1002');
  assert.equal(broca[column('Andamento da SC')], 'Cancelada');

  Object.defineProperty(app.el('#purchase-input'), 'files', { configurable: true, value: [{ name: 'estoque.csv', text: async () => 'Cd Item;Nm Item\n1;A' }] });
  app.el('#purchase-input').dispatchEvent(new window.Event('change'));
  await waitFor(() => /não é o relatório SNAC0540/.test(app.el('#message').textContent));
  assert.deepEqual(cards(), ['COMPRAR', 'COMPRA EM ANDAMENTO'], 'arquivo errado no botão do SNAC não troca nada');
});
