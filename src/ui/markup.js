// Marcação pura (sem DOM nem estado): listas de ações, formatação em reais, cartões, gráfico,
// indicadores e o relatório de resumo. Testada direto em tests/dashboard.test.js.
import { prioritizeActionCounts } from '../dashboard.js';
import { svgIcon } from '../icons.js';

export const ANALITICO_ACTIONS = ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'TRANSFERIR OBSOLETO', 'DESBLOQUEAR', 'COMPRAR', 'COMPRA EM ANDAMENTO', 'REVISAR SC', 'ZERAR MIN/MAX', 'AJUSTAR MIN/MAX', 'Sem ação definida', 'Verificar dados'];
export const GIRO_ACTIONS = ['Planejar reposição', 'Manter', 'Reduzir compras', 'Avaliar transferência', 'Investigar sem consumo', 'Confirmar saldo', 'Verificar dados'];
export const GENERIC_ACTIONS = ['Comprar', 'Manter', 'Avaliar excesso', 'Avaliar sem giro', 'Sem movimento', 'Verificar dados'];
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_COMPACT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export function slug(text) { return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// Rótulo de ação em HTML: siglas (SC) num span que escapa do text-transform: lowercase.
export function actionLabelHtml(action) {
  return escapeHtml(action).replace(/\bSC\b/g, '<span class="acronym">SC</span>');
}

export function actionIcon(action) {
  const normalized = String(action).toUpperCase();
  if (normalized.includes('VERIFICAR') || normalized.includes('CONFIRMAR') || normalized.includes('INVESTIGAR')) return 'alert';
  if (normalized.includes('DESBLOQUEAR')) return 'unlock';
  if (normalized.includes('ZERAR')) return 'zero';
  if (normalized.includes('AJUSTAR')) return 'adjust';
  if (normalized.includes('TRANSFERIR')) return 'transfer';
  if (normalized.includes('BLOQUEAR')) return 'block';
  if (normalized.includes('ANDAMENTO')) return 'clock';
  if (normalized.includes('REVISAR')) return 'alert';
  if (normalized.includes('COMPRAR') || normalized.includes('REPOSIÇÃO')) return 'plus';
  if (normalized.includes('REDUZIR')) return 'minus';
  if (normalized.includes('MANTER')) return 'check';
  return 'dot';
}

export function buildSummaryMarkup({ summaryResults, summaryAllResults, actions, counts, values = null, analitico = false }) {
  const summaryCounts = prioritizeActionCounts(counts ?? actions.map(action => ({ action, count: summaryResults.filter(row => row.action === action).length })));
  const hidden = summaryCounts.find(({ action }) => action === 'Itens ocultos');
  // Valor zero (ex.: Desbloquear, sempre sem saldo) não informa nada: fica só a %.
  const money = action => (values?.get(action) > 0 ? BRL_COMPACT.format(values.get(action)) : '');
  return [
    `<button type="button" class="summary-card total summary-filter" data-summary-clear aria-pressed="false"><span class="kpi-head"><span class="kpi-icon" aria-hidden="true">${svgIcon('list', 'kpi-svg')}</span><span class="kpi-label">${analitico && summaryResults.length < summaryAllResults.length ? 'ITENS COM AÇÃO' : 'TODOS OS ITENS'}</span></span><div class="summary-value"><strong>${summaryResults.length}</strong><small>de ${summaryAllResults.length} no arquivo</small></div></button>`,
    ...summaryCounts.filter(({ action, count }) => action !== 'Itens ocultos' && count > 0).map(({ action, count }) => {
      const percentage = summaryResults.length ? Math.round((count / summaryResults.length) * 100) : 0;
      const amount = money(action);
      return `<button type="button" class="summary-card summary-filter ${slug(action)}" data-summary-action="${escapeHtml(action)}" aria-pressed="false"><span class="kpi-head"><span class="kpi-icon" aria-hidden="true">${svgIcon(actionIcon(action), 'kpi-svg')}</span><span class="kpi-label">${actionLabelHtml(action.toUpperCase())}</span></span><div class="summary-value"><strong>${count}</strong><small>${amount ? `${amount} · ${percentage}%` : `${percentage}% do total`}</small></div></button>`;
    }),
    // Itens sem ação não são indicador: viram um atalho discreto abaixo dos cartões.
    hidden?.count ? `<button type="button" class="summary-filter hidden-shortcut" data-summary-hidden aria-pressed="false">${svgIcon('eyeOff')}<span>Ver ${hidden.count.toLocaleString('pt-BR')} ${hidden.count === 1 ? 'item sem ação' : 'itens sem ação'}</span></button>` : '',
  ].filter(Boolean).join('');
}

// Gráfico de envelhecimento: valor do estoque com saldo por faixa de dias sem requisição.
// Uma série, uma cor; cada faixa é um botão que filtra a tabela.
export function buildAgingChartMarkup(buckets, selected = '') {
  if (!buckets.some(({ count }) => count > 0)) return '';
  const total = buckets.reduce((sum, { value }) => sum + value, 0);
  const largest = Math.max(...buckets.map(({ value }) => value));
  return buckets.map(({ key, label, count, value }) => {
    const share = total ? Math.round((value / total) * 100) : 0;
    const width = largest ? Math.max((value / largest) * 100, value > 0 ? 1.5 : 0) : 0;
    const items = `${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'}`;
    const tip = `${label}: ${realCurrency(value)} (${share}% do valor) · ${items}`;
    return `<button type="button" class="chart-row" data-aging="${key}" aria-pressed="${key === selected}" title="${escapeHtml(tip)}"${count ? '' : ' disabled'}><span class="chart-label">${escapeHtml(label)}</span><span class="chart-track"><span class="chart-bar" style="width:${width.toFixed(1)}%"></span></span><span class="chart-value">${realCurrency(value)}<small>${items}</small></span></button>`;
  }).join('');
}

// Indicadores em reais ao lado do valor total (modo Analítico).
export function buildHealthMarkup(kind, { count, value }) {
  const items = `${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'}`;
  return kind === 'idle'
    ? `<span class="total-label">Parado há 180 dias ou mais</span><strong>${realCurrency(value)}</strong><small>${items} fora dos locais obsoletos</small>`
    : `<span class="total-label">Em locais obsoletos (1 e 298)</span><strong>${realCurrency(value)}</strong><small>${items} com saldo</small>`;
}

export function buildTotalMarkup({ summaryAllResults, locationFilter, locationTotal, shelfFilter = '', partitionFilter = '' }) {
  if (!locationFilter && summaryAllResults.length === 0) return '';
  const label = shelfFilter || partitionFilter ? 'Valor do estoque na localização' : locationFilter ? 'Valor do estoque no local' : 'Valor total do estoque';
  const scope = [locationFilter && `Local ${locationFilter}`, shelfFilter && `Prateleira ${shelfFilter}`, partitionFilter && `Repartição ${partitionFilter}`].filter(Boolean).join(' · ');
  const title = escapeHtml(`Soma da coluna Vl Saldo${scope ? ` · ${scope}` : ''}`);
  const count = summaryAllResults.length;
  const detail = scope || `${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'} no arquivo`;
  return `<span class="total-label" title="${title}">${escapeHtml(label)}</span><strong title="${title}">${realCurrency(locationTotal)}</strong><small>${escapeHtml(detail)}</small>`;
}

// Ação em caixa de frase, como nos badges ("AJUSTAR MIN/MAX" vira "Ajustar min/max").
export function actionText(action) {
  const text = String(action ?? '');
  // Siglas (SC) continuam em maiúsculas: "REVISAR SC" vira "Revisar SC".
  return text === text.toUpperCase() ? (text.charAt(0) + text.slice(1).toLowerCase()).replace(/\bsc\b/g, 'SC') : text;
}

// Resumo de uma página para reunião ou e-mail: indicadores em reais, ações e tempo sem
// requisição, sem a tabela de itens.
export function buildSummaryReport({ fileName = '', sheetName = '', importedAt = null, generatedAt = new Date(), scope = '', total = null, health = null, aging = null, actions = [], itemsWithAction = 0, itemsInFile = 0, withoutAction = 0, analitico = false }) {
  const dateTime = date => (date ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const items = count => `${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'}`;
  const share = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
  const money = value => (value > 0 ? realCurrency(value) : '—');
  const source = [fileName, sheetName && `aba ${sheetName}`, importedAt && `importado em ${dateTime(importedAt)}`].filter(Boolean).join(' · ');
  const kpi = (label, value, detail, tone = '') => `<div class="report-kpi${tone ? ` ${tone}` : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
  const kpis = [
    total !== null && kpi(scope ? 'Valor do estoque no recorte' : 'Valor total do estoque', realCurrency(total), `${items(itemsInFile)} no arquivo`),
    health && kpi('Parado há 180 dias ou mais', realCurrency(health.idle.value), `${items(health.idle.count)} · ${share(health.idle.value, total)} do valor`, 'idle'),
    health && kpi('Em locais obsoletos (1 e 298)', realCurrency(health.obsolete.value), `${items(health.obsolete.count)} · ${share(health.obsolete.value, total)} do valor`, 'obsolete'),
    kpi(analitico ? 'Itens com ação' : 'Itens analisados', itemsWithAction.toLocaleString('pt-BR'), analitico ? `de ${items(itemsInFile)} no arquivo` : 'com recomendação'),
  ].filter(Boolean).join('');
  const withValue = total !== null;
  const actionRows = actions.map(({ action, count, value }) => `<tr><td>${escapeHtml(actionText(action))}</td><td class="number">${count.toLocaleString('pt-BR')}</td><td class="number">${share(count, itemsWithAction)}</td>${withValue ? `<td class="number">${money(value)}</td>` : ''}</tr>`).join('');
  const notes = [
    analitico && 'Um item pode ter mais de uma ação.',
    withoutAction > 0 && `${items(withoutAction)} sem ação não ${withoutAction === 1 ? 'entra' : 'entram'} na tabela.`,
  ].filter(Boolean).join(' ');
  const actionsSection = actions.length
    ? `<section><h2>${analitico ? 'Ações recomendadas' : 'Recomendações'}</h2><table><thead><tr><th>${analitico ? 'Ação' : 'Recomendação'}</th><th class="number">Itens</th><th class="number">% dos itens</th>${withValue ? '<th class="number">Valor do saldo</th>' : ''}</tr></thead><tbody>${actionRows}</tbody></table>${notes ? `<p class="report-note">${escapeHtml(notes)}</p>` : ''}</section>`
    : '';
  const agingTotal = aging?.reduce((sum, { value }) => sum + value, 0) ?? 0;
  const agingLargest = aging ? Math.max(...aging.map(({ value }) => value)) : 0;
  const agingSection = aging?.some(({ count }) => count > 0)
    ? `<section><h2>Tempo sem requisição</h2><p class="report-note">Valor do estoque com saldo por faixa de dias sem requisição.</p><div class="report-bars">${aging.map(({ label, count, value }) => `<div class="report-bar-row"><span>${escapeHtml(label)}</span><span class="report-track"><span class="report-bar" style="width:${agingLargest ? Math.max((value / agingLargest) * 100, value > 0 ? 1.5 : 0).toFixed(1) : 0}%"></span></span><strong>${realCurrency(value)}</strong><small>${items(count)} · ${share(value, agingTotal)}</small></div>`).join('')}</div></section>`
    : '';
  return `<header class="report-header"><div><h1>Resumo do estoque</h1>${source ? `<p>${escapeHtml(source)}</p>` : ''}${scope ? `<p>Recorte: ${escapeHtml(scope)}</p>` : ''}</div><p class="report-generated">Giro de Estoque<br>Gerado em ${escapeHtml(dateTime(generatedAt))}</p></header><div class="report-kpis">${kpis}</div>${actionsSection}${agingSection}`;
}

export function realCurrency(value) {
  const numeric = Number(value) || 0;
  return BRL_FORMATTER.format(numeric);
}
export function itemCurrency(value) { return value === null || value === undefined ? '—' : BRL_FORMATTER.format(value); }

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
