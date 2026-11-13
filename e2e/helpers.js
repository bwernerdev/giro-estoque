// O painel do Analítico só abre com o SNAC0540. `attach` anexa uma planilha no campo do
// Analítico e, se for um Analítico (tem Qnt Min) sem SNAC0540 carregado, anexa antes um
// SNAC0540 mínimo (uma SC de outro item), para não mudar as ações do teste.
export const SNAC_HEADER = 'SC;SC;SC;SC;SC;SC;OF;OF;OF;REC\nCódigo;Situação;Data Criação;Seq.;Cód. Produto;Local Estoque;Codigo;Saldo;Situação OF;Nr NF\n';
export const SNAC_MIN = `${SNAC_HEADER}7000001;Compra confirmada;10/10/2026;1;999999;;;;;`;

export async function attachSnac(page, text = SNAC_MIN, encoding = 'utf8') {
  await page.locator('#purchase-input').setInputFiles({ name: 'REL_SNAC0540.CSV', mimeType: 'text/csv', buffer: Buffer.from(text, encoding) });
  await page.waitForFunction(() => document.querySelector('#purchase-field').dataset.state === 'ok');
}

export async function attach(page, file) {
  const analitico = /Qnt Min/.test(file.buffer.toString('latin1')) || /\.xlsx$/.test(file.name);
  if (analitico && await page.locator('#purchase-field').getAttribute('data-state') !== 'ok') await attachSnac(page);
  await page.locator('#file-input').setInputFiles(file);
}
