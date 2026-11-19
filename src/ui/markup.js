// Marcação pura (sem DOM nem estado): listas de ações, formatação em reais, cartões, gráfico,
// indicadores, relatório de resumo e as peças da tabela e dos detalhes. Testada direto em
// tests/dashboard.test.js e tests/markup.test.js.
import { formatNumber, purchaseRequestText, purchaseStage, scCoverageText, stockLocation } from '../analysis.js';
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

// Grade dos cartões do resumo sem buraco no fim: linhas com o mesmo número de cartões,
// no máximo `max` por linha. Se ainda sobrar vaga, o primeiro cartão (o total) ocupa
// as vagas (`lead` colunas). Ex.: 6 cartões, máx. 4 → 3 + 3; 5, máx. 4 → total largo + 1, depois 3.
export function summaryGridLayout(count, max) {
  const rows = Math.max(1, Math.ceil(count / max));
  const columns = Math.max(1, Math.ceil(count / rows));
  return { columns, lead: Math.min(columns, rows * columns - count + 1) };
}

// Gráfico de envelhecimento: valor do estoque com saldo por faixa de dias sem requisição.
// Cada faixa é um botão que filtra a tabela. As faixas de 180 dias ou mais (candidatas a
// bloqueio e obsoleto) ganham o tom de atenção e de perigo; valor, itens e fatia ficam à vista.
const AGING_TONES = { '180-364': 'warning', '365+': 'danger' };
export function buildAgingChartMarkup(buckets, selected = '') {
  if (!buckets.some(({ count }) => count > 0)) return '';
  const total = buckets.reduce((sum, { value }) => sum + value, 0);
  const largest = Math.max(...buckets.map(({ value }) => value));
  return buckets.map(({ key, label, count, value }) => {
    const share = total ? Math.round((value / total) * 100) : 0;
    const width = largest ? Math.max((value / largest) * 100, value > 0 ? 1.5 : 0) : 0;
    const items = `${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'}`;
    const tip = `${label}: ${realCurrency(value)} (${share}% do valor) · ${items}`;
    const tone = AGING_TONES[key] ? ` is-${AGING_TONES[key]}` : '';
    return `<button type="button" class="chart-row${tone}" data-aging="${key}" aria-pressed="${key === selected}" title="${escapeHtml(tip)}"${count ? '' : ' disabled'}><span class="chart-label">${escapeHtml(label)}</span><span class="chart-track"><span class="chart-bar" style="width:${width.toFixed(1)}%"></span></span><span class="chart-value">${realCurrency(value)}<small>${items} · ${share}%</small></span></button>`;
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

// Filtros ativos como etiquetas: cada uma remove o seu filtro (data-clear-filter); no fim, quantos itens sobram.
export function buildFilterChips(filters, count) {
  const chips = filters.map(({ key, label }) => `<button type="button" class="filter-chip" data-clear-filter="${escapeHtml(key)}" title="Remover este filtro"><span>${escapeHtml(label)}</span>${svgIcon('close')}<span class="sr-only">: remover filtro</span></button>`).join('');
  return `${chips}<span class="active-count">${count.toLocaleString('pt-BR')} ${count === 1 ? 'item' : 'itens'}</span>`;
}

// Tabela sem linhas: diz por quê e oferece a saída (limpar filtros ou mostrar os ocultos).
export function emptyStateHtml({ filtered = false, hiddenCount = 0 } = {}) {
  const [text, button] = filtered
    ? ['Nenhum item atende aos filtros atuais. Remova um filtro acima ou limpe todos.', '<button type="button" class="secondary-button" data-empty-action="clear">Limpar filtros</button>']
    : hiddenCount > 0
      ? [`Nenhum item precisa de ação agora. ${hiddenCount.toLocaleString('pt-BR')} ${hiddenCount === 1 ? 'item está oculto' : 'itens estão ocultos'} (sem ação ou com compra em andamento).`, '<button type="button" class="secondary-button" data-empty-action="hidden">Mostrar itens ocultos</button>']
      : ['A planilha não tem itens para mostrar.', ''];
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${svgIcon('search')}</span><strong>Nenhum item encontrado</strong><p>${escapeHtml(text)}</p>${button}</div>`;
}

// Siglas que continuam em maiúsculas quando a descrição vira caixa de frase na tabela.
const KEEP_UPPER = new Set(['PVC', 'CPVC', 'PEAD', 'PP', 'PE', 'PU', 'EVA', 'MDF', 'INOX', 'LED', 'EPI', 'NBR', 'ABNT', 'ISO', 'NR', 'USB', 'HD', 'SSD', 'CPU', 'UV', 'AC', 'DC', 'BSP', 'NPT', 'SAE', 'RPM', 'PSI', 'KVA', 'TV', 'PCB', 'EG', 'GG', 'XG', 'EXG', 'XGG', 'SC', 'OF', 'NF', 'CA', 'II', 'III', 'IV']);

// Descrição para a tela: texto todo em maiúsculas (como vem do ERP) vira caixa de frase.
// Palavras com número (220V, 10A, 090C) e siglas conhecidas ficam como estão. Texto que já
// tem minúsculas não muda. A busca, os detalhes e a exportação usam o texto original.
export function displayItemName(text) {
  const value = String(text ?? '');
  if (!/[A-ZÀ-Ý]/.test(value) || /[a-zß-ÿ]/.test(value)) return value;
  return value
    .replace(/[A-Za-zÀ-ÿ0-9]+/g, word => (/\d/.test(word) || KEEP_UPPER.has(word) ? word : word.toLowerCase()))
    .replace(/^([^A-Za-zÀ-ÿ0-9]*)([a-zß-ÿ])/, (_, before, letter) => before + letter.toUpperCase());
}

// Tabela e detalhes do item: colunas, selos de ação, código copiável, posição, dicas de compra
// e os campos do painel de detalhes. Recebem a linha já analisada; nada de estado.
export function resultColumns(analitico, giro) {
  if (analitico) return [
    { label: 'Descrição', key: 'item' },
    { label: 'Código', key: 'sku' },
    { label: 'Posição', key: 'localCode', sortLabel: 'posição (local)' },
    { label: 'Qtd. atual', key: 'stock' },
    { label: 'Mín. / Máx', key: 'minimum' },
    { label: 'Valor', key: 'stockValue', sortLabel: 'valor do saldo', hint: 'Valor do saldo. A barra compara cada item com o de maior valor entre os filtrados.' },
    { label: 'Ação', key: 'action' },
    { label: 'Sem requisição', key: 'daysSince', sortLabel: 'dias sem requisição' },
  ];
  if (giro) return [
    { label: 'Item / Filial', key: 'item' },
    { label: 'Estoque (R$)', key: 'stockValue' },
    { label: 'Consumo (R$)', key: 'consumption' },
    { label: 'Giro', key: 'coverage' },
    { label: 'Recomendação', key: 'action' },
    { label: 'Motivo', key: 'reason' },
  ];
  return [
    { label: 'Item', key: 'item' },
    { label: 'Estoque', key: 'stock' },
    { label: 'Vendas / 30d', key: 'sales' },
    { label: 'Cobertura', key: 'coverage' },
    { label: 'Recomendação', key: 'action' },
    { label: 'Motivo', key: 'reason' },
  ];
}
export function columnClass(key) {
  const names = { item: 'descricao', sku: 'codigo', localCode: 'posicao', shelfCode: 'prateleira', partitionCode: 'reparticao', stock: 'estoque', stockValue: 'valor', sales: 'consumo', consumption: 'consumo', coverage: 'cobertura', minimum: 'limites', action: 'acao', daysSince: 'detalhes', reason: 'detalhes' };
  return `col-${names[key]}`;
}
export function urgentAction(action) {
  return ['BLOQUEAR', 'BLOQUEAR E TRANSFERIR OBSOLETO', 'VERIFICAR DADOS'].includes(String(action).toUpperCase());
}
export function badgeHtml(action) {
  return `<span class="badge ${slug(action)}${urgentAction(action) ? ' urgent-action' : ''}"><span class="badge-icon" aria-hidden="true">${svgIcon(actionIcon(action), 'badge-svg')}</span><span class="badge-label">${actionLabelHtml(action)}</span></span>`;
}
// Local, prateleira e repartição em uma coluna (ex.: 7 · 0 · I). Partes vazias no fim
// somem ("7" em vez de "7 · — · —"); vazia no meio vira "—" para a ordem não mudar.
// O title sempre nomeia as três.
export function positionHtml(row) {
  const parts = [stockLocation(row), row.shelfCode, row.partitionCode];
  const title = [['Local', parts[0]], ['Prateleira', parts[1]], ['Repartição', parts[2]]].map(([label, value]) => `${label} ${value || '—'}`).join(' · ');
  const shown = parts.map(value => value || '—');
  while (shown.length > 1 && !parts[shown.length - 1]) shown.pop();
  return `<span title="${escapeHtml(title)}">${escapeHtml(shown.join(' · '))}</span>`;
}
export function codeHtml(code) {
  const value = String(code ?? '');
  if (!value) return '';
  return `<span class="item-code"><span>${escapeHtml(value)}</span><button type="button" class="copy-code" data-copy-code="${escapeHtml(value)}" aria-label="Copiar código ${escapeHtml(value)}" title="Copiar código">${svgIcon('copy')}</button></span>`;
}
// Sugestão de compra (até o máximo) e a SC do SNAC0540, abaixo da célula.
export function buyHint(row) {
  if (row.toBuy === null || row.toBuy === undefined) return '';
  const coverage = row.scCoverage;
  const full = escapeHtml(scCoverageText(coverage));
  if (coverage?.sufficient) return `<small class="cell-hint" title="${full}">${escapeHtml(scCoverageText(coverage, { short: true }))}</small>`;
  // SC aberta que não cobre o necessário: aviso explícito acima da sugestão de compra.
  const alert = coverage ? `<small class="cell-hint is-alert" title="${full}">${escapeHtml(scCoverageText(coverage, { short: true }))}</small>` : '';
  return `${alert}<small class="cell-hint" title="Sugestão de compra: ${formatNumber(row.toBuy)} para chegar ao máximo${coverage ? `, já descontados ${formatNumber(row.onOrder)} em SC aberta` : ''}">comprar ${formatNumber(row.toBuy)} até o máx.</small>`;
}
export function purchaseHint(row) {
  if (!row.purchase) return '';
  return `<small class="cell-hint" title="${escapeHtml(purchaseRequestText(row.purchase))}">SC ${escapeHtml(row.purchase.request)} · ${escapeHtml(purchaseStage(row.purchase))}</small>`;
}
export function limitsText(row) {
  if (row.minimum === null || row.minimum === undefined || row.maximum === null || row.maximum === undefined) return formatNumber(row.stock);
  const status = row.stock < row.minimum ? 'abaixo do mínimo' : row.stock > row.maximum ? 'acima do máximo' : 'dentro dos limites';
  return `${formatNumber(row.stock)} · mín. ${formatNumber(row.minimum)} / máx. ${formatNumber(row.maximum)} (${status})`;
}
// Régua do saldo: faixa entre o mínimo e o máximo e o marcador do saldo atual, com o tom
// de abaixo (perigo), dentro (sucesso) ou acima (atenção). Sem limites, não aparece.
export function stockGaugeHtml({ stock, minimum, maximum }) {
  const filled = value => value !== null && value !== undefined && Number.isFinite(Number(value));
  if (!filled(stock) || !filled(minimum) || !filled(maximum) || maximum < minimum || maximum <= 0) return '';
  const scale = Math.max(maximum, stock, minimum, 1) * 1.15;
  const at = value => Math.min(100, Math.max(0, (value / scale) * 100));
  const tone = stock < minimum ? 'danger' : stock > maximum ? 'warning' : 'success';
  const status = stock < minimum ? 'abaixo do mínimo' : stock > maximum ? 'acima do máximo' : 'dentro dos limites';
  const label = `Saldo ${formatNumber(stock)}, mínimo ${formatNumber(minimum)}, máximo ${formatNumber(maximum)}: ${status}`;
  const close = at(maximum) - at(minimum) < 22;
  // Rótulo perto da borda encosta nela em vez de centralizar (não sai da caixa).
  const tick = (position, text, center = -50) => `<span class="gauge-tick" style="left:${position.toFixed(1)}%;transform:translateX(${position < 12 ? 0 : position > 88 ? -100 : center}%)">${text}</span>`;
  const ticks = close
    ? tick((at(minimum) + at(maximum)) / 2, `mín./máx. ${formatNumber(minimum)} / ${formatNumber(maximum)}`)
    : tick(at(minimum), `mín. ${formatNumber(minimum)}`, -30) + tick(at(maximum), `máx. ${formatNumber(maximum)}`, -70);
  return `<span class="stock-gauge" role="img" aria-label="${escapeHtml(label)}"><span class="gauge-track"><span class="gauge-range" style="left:${at(minimum).toFixed(1)}%;width:${Math.max(at(maximum) - at(minimum), 0.8).toFixed(1)}%"></span><span class="gauge-marker is-${tone}" style="left:${at(stock).toFixed(1)}%"></span></span><span class="gauge-ticks">${ticks}</span></span>`;
}

// Campos do painel de detalhes em seções (o que fazer, saldo, compra, movimento). Seção sem
// campo preenchido não aparece. Cada campo é <div><dt><dd> dentro do <dl> da seção.
export function detailFields(reason, row, analitico) {
  const sections = [];
  let entries = [];
  const add = (label, value, html = false) => { if (value !== '' && value !== null && value !== undefined) entries.push({ label, value, html }); };
  const section = (title, extra = '') => {
    if (entries.length) sections.push({ title, extra, entries });
    entries = [];
  };
  const filled = value => value !== null && value !== undefined;
  if (analitico) {
    const elapsed = filled(row.daysSince) ? `${formatNumber(row.daysSince)} dias desde a última requisição` : '';
    const notes = reason.split(' · ').filter(part => part !== elapsed && part !== row.blockReason && part !== `Id Bloqueio: ${row.blockId}`).join(' · ');
    add('Ação recomendada', row.actions?.length ? row.actions.map(badgeHtml).join(' ') : '', true);
    add(reason.startsWith('Corrigir na planilha:') ? 'Dados a revisar' : 'Por que', notes);
    section('O que fazer');
    add('Saldo', limitsText(row));
    add('Sugestão de compra', filled(row.toBuy) ? `${formatNumber(row.toBuy)} (até o máximo${filled(row.onOrder) ? `, descontado o que está em SC aberta` : ''})` : '');
    add('Valor do saldo', filled(row.stockValue) ? realCurrency(row.stockValue) : '');
    add('Média de consumo', filled(row.averageConsumption) ? formatNumber(row.averageConsumption) : '');
    add('Giro do estoque', filled(row.coverage) ? `${formatNumber(row.coverage)} dias` : '');
    section('Saldo e limites', stockGaugeHtml(row));
    add('Em SC aberta', filled(row.onOrder) ? `${formatNumber(row.onOrder)} a receber` : '');
    add(row.scCoverage && !row.scCoverage.sufficient ? 'SC insuficiente' : 'Cobertura da SC', scCoverageText(row.scCoverage));
    add('Solicitação de compra', [purchaseRequestText(row.purchase), row.purchase?.supplier && `fornecedor ${row.purchase.supplier}`].filter(Boolean).join(' · '));
    section('Compra (SC)');
    add('Classificação', row.classification);
    add('Última requisição', row.lastRequest);
    add('Tempo sem requisição', elapsed);
    add('Bloqueio', [...new Set([row.blockReason, row.blockId].filter(Boolean))].join(' · '));
    section('Movimento e bloqueio');
  } else {
    add('Motivo da ação', reason);
    section('');
  }
  const entryHtml = ({ label, value, html }) => `<div><dt>${escapeHtml(label)}</dt><dd>${html ? value : escapeHtml(value)}</dd></div>`;
  return `<div class="detail-fields">${sections.map(({ title, extra, entries: list }) => `<section class="detail-section">${title ? `<h3>${escapeHtml(title)}</h3>` : ''}${extra}<dl>${list.map(entryHtml).join('')}</dl></section>`).join('')}</div>`;
}
export function detailsHtml(reason, row) {
  if (!reason) return '<span class="no-details">—</span>';
  return `<button type="button" class="icon-button details-button" data-detail-row="${row.row}" aria-haspopup="dialog" aria-label="Ver detalhes" title="Ver detalhes">${svgIcon('chevronRight')}</button>`;
}
