// Análise Analítico: lê cada linha, confere os dados e aplica as regras em etapas nomeadas
// (bloqueio, compra, limites, visibilidade). Cada etapa explica a ação que recomenda; a
// explicação aparece nos detalhes do item e vai para a exportação.
import { normalize } from './fields.js';
import { formatNumber, parseNumber } from './numbers.js';
import { itemKey, openPurchaseQuantity, openPurchaseRequests, pickPurchaseRequest, purchaseDelivered, purchaseRequestText } from './purchase-rules.js';

const OBSOLETE_LOCATION_CODES = new Set([1, 298]);
// Motivos de bloqueio que a regra reconhece (já normalizados).
const KNOWN_BLOCK_REASONS = ['desbloqueado', 'bloqueado por saldo'];

// Quantidades do Analítico: texto só com dígitos, sinal, ponto e vírgula; o resto é inválido.
function parseAnaliticoNumber(value, numberFormat) {
  if (typeof value === 'string' && !/^[+-]?[\d.,]+$/.test(value.trim())) return null;
  return parseNumber(value, numberFormat);
}

// Lê a linha: textos aparados e números no formato escolhido. `base` é o resultado de uma
// linha com dados a corrigir; as outras partem dele.
function readRow(cells, mapping, rowNumber, numberFormat) {
  const get = key => mapping[key] >= 0 ? cells[mapping[key]] : null;
  const text = key => String(get(key) ?? '').trim();
  const amount = key => parseNumber(get(key), numberFormat);
  const quantity = key => parseAnaliticoNumber(get(key), numberFormat);
  const localNumber = quantity('localCode');
  const base = {
    row: rowNumber,
    item: text('item'),
    sku: text('sku'),
    shelfCode: text('shelfCode'),
    partitionCode: text('partitionCode'),
    divisionCode: text('divisionCode'),
    address: text('address'),
    stock: quantity('stock'),
    minimum: quantity('minimum'),
    maximum: quantity('maximum'),
    stockValue: amount('stockValue'),
    coverage: amount('giroDays'),
    daysSince: quantity('daysSince'),
    averageConsumption: amount('averageConsumption'),
    classification: text('classification'),
    blockReason: text('blockReason'),
    blockId: text('blockId'),
    lastRequest: text('lastRequest'),
    localCode: text('localCode'),
    obsoleteLocation: OBSOLETE_LOCATION_CODES.has(localNumber),
    hidden: false,
    actions: ['Verificar dados'],
    action: 'Verificar dados',
    reason: '',
  };
  return { base, localNumber };
}

// Situação do bloqueio. Sem motivo informado, o Id Bloqueio "Desbloqueado" vale como motivo.
function blockState({ blockReason, blockId }) {
  const rawReason = normalize(blockReason);
  const id = normalize(blockId);
  const reason = rawReason || (id === 'desbloqueado' ? 'desbloqueado' : '');
  return { rawReason, id, reason, blocked: blockId ? id.startsWith('bloqueado') : false };
}

// Dados a corrigir na planilha antes de qualquer regra.
function dataIssues(row, localNumber, mapping, block) {
  const issues = [];
  const checkNumber = (key, label, value, required = false) => {
    if (!(mapping[key] >= 0)) {
      if (required) issues.push(`${label}: coluna não mapeada`);
      return;
    }
    if (value === null) issues.push(`${label}: valor ausente ou inválido`);
    else if (value < 0) issues.push(`${label}: valor negativo`);
  };
  if (!row.item) issues.push('Nm Item: valor ausente');
  if (!row.classification) issues.push('Itens Acima de 90 dias: valor ausente');
  checkNumber('stock', 'Qtde Atual', row.stock, true);
  checkNumber('minimum', 'Qnt Min', row.minimum);
  checkNumber('maximum', 'Qnt Max', row.maximum);
  if (mapping.daysSince >= 0) checkNumber('daysSince', 'Dif Dias', row.daysSince);
  if (mapping.localCode >= 0) checkNumber('localCode', 'Cd Local Estoque', localNumber);
  const knownId = block.id === 'desbloqueado' || block.id.startsWith('bloqueado');
  if (mapping.blockReason >= 0 && !KNOWN_BLOCK_REASONS.includes(block.reason)) {
    issues.push(`Ds Motivo Bloqueio: ${row.blockReason ? 'valor não reconhecido' : 'valor ausente'}`);
  }
  if (mapping.blockId >= 0 && !knownId) {
    issues.push(`Id Bloqueio: ${row.blockId ? 'valor não reconhecido' : 'valor ausente'}`);
  }
  if (KNOWN_BLOCK_REASONS.includes(block.reason) && knownId && (block.reason === 'desbloqueado') !== (block.id === 'desbloqueado')) {
    issues.push('Ds Motivo Bloqueio e Id Bloqueio: status conflitantes');
  }
  if (row.minimum !== null && row.maximum !== null && row.minimum > row.maximum) issues.push('Qnt Min: maior que Qnt Max');
  return issues;
}

// Bloqueio, transferência para o local obsoleto e desbloqueio.
// - 180 dias ou mais no local obsoleto (1 ou 298): BLOQUEAR, se ainda não estiver bloqueado.
// - 180 dias ou mais fora dele: BLOQUEAR E TRANSFERIR OBSOLETO (ou só TRANSFERIR, se já bloqueado);
//   desbloqueado no local 7 não entra aqui.
// - 90 dias ou mais, desbloqueado: BLOQUEAR.
// - Saldo zerado e bloqueado por saldo: DESBLOQUEAR.
function blockActions({ stock, daysSince, obsoleteLocation }, localNumber, block) {
  const actions = [];
  const why = [];
  const days = formatNumber(daysSince);
  if (daysSince !== null && daysSince >= 180 && stock > 0 && obsoleteLocation && KNOWN_BLOCK_REASONS.includes(block.reason)) {
    if (!block.blocked) {
      actions.push('BLOQUEAR');
      why.push(`Bloquear: saldo positivo, ${days} dias sem requisição (180 ou mais) e item ainda não bloqueado no local obsoleto (1 ou 298).`);
    }
  }
  else if (daysSince !== null && daysSince >= 180 && stock > 0 && (block.reason === 'bloqueado por saldo' || (block.reason === 'desbloqueado' && localNumber !== null && localNumber !== 7))) {
    actions.push(block.blocked ? 'TRANSFERIR OBSOLETO' : 'BLOQUEAR E TRANSFERIR OBSOLETO');
    why.push(`${block.blocked ? 'Transferir obsoleto' : 'Bloquear e transferir obsoleto'}: saldo positivo, ${days} dias sem requisição (180 ou mais) e fora dos locais obsoletos (1 e 298)${block.blocked ? '; item já bloqueado' : ''}.`);
  }
  else if (daysSince !== null && daysSince >= 90 && stock > 0 && block.reason === 'desbloqueado') {
    actions.push('BLOQUEAR');
    why.push(`Bloquear: saldo positivo, ${days} dias sem requisição (90 ou mais) e item desbloqueado.`);
  }
  if (daysSince !== null && daysSince >= 0 && stock === 0 && block.reason === 'bloqueado por saldo') {
    actions.push('DESBLOQUEAR');
    why.push('Desbloquear: saldo zerado e item bloqueado por saldo.');
  }
  return { actions, why };
}

// Comprar: saldo abaixo do mínimo, fora dos locais obsoletos, item não bloqueado, sem
// recomendação de bloqueio nesta análise e com requisição há menos de 90 dias (item
// parado há 90 dias ou mais não se compra; sem Dif Dias, não bloqueia a compra).
// Sugestão de compra: o que falta para chegar ao máximo (Qnt Max − Qtde Atual; sem
// máximo acima do saldo, até o mínimo), descontado o que as SCs abertas ainda trazem.
// SCs abertas cobrem tudo: COMPRA EM ANDAMENTO; cobrem em parte: COMPRAR o restante.
// SC aberta em item que não precisa de compra: REVISAR SC (e não AJUSTAR MIN/MAX).
// purchases: SCs do SNAC0540 por item (itemKey), ou null quando o relatório não foi importado.
function purchaseActions({ sku, stock, minimum, maximum, daysSince, obsoleteLocation }, localNumber, blocked, willBlock, purchases) {
  const actions = [];
  const why = [];
  let purchase = null;
  let toBuy = null;
  // Quanto as SCs abertas cobrem do necessário (só item abaixo do mínimo com SC aberta).
  let scCoverage = null;
  const stale = daysSince !== null && daysSince >= 90;
  const requests = purchases ? purchases.get(itemKey(sku)) : null;
  const open = openPurchaseRequests(requests, localNumber);
  const onOrder = open.reduce((total, request) => total + openPurchaseQuantity(request), 0);
  const openText = open.length
    ? `${open.length === 1 ? 'SC aberta' : `${open.length} SCs abertas`} (${formatNumber(onOrder)} a receber): ${open.map(purchaseRequestText).join('; ')}`
    : '';
  const needsPurchase = minimum !== null && stock < minimum && !obsoleteLocation && !blocked && !willBlock && !stale;
  if (needsPurchase) {
    const target = maximum !== null && maximum > stock ? maximum : minimum;
    const targetText = `${target === maximum ? 'máximo' : 'mínimo'} (${formatNumber(target)})`;
    toBuy = Math.max(0, target - stock - onOrder);
    if (open.length) {
      purchase = open[0];
      const needed = target - stock;
      const after = stock + onOrder;
      scCoverage = { requests: open.length, needed, onOrder, missing: toBuy, target, targetKind: target === maximum ? 'máximo' : 'mínimo', after, minimum, maximum, sufficient: toBuy === 0, belowMinimum: after < minimum };
      if (toBuy > 0) {
        actions.push('COMPRAR');
        const reach = scCoverage.belowMinimum
          ? `ainda abaixo do mínimo (${formatNumber(minimum)})`
          : `sem chegar ao ${targetText}`;
        why.push(`Comprar: SC insuficiente. Saldo ${formatNumber(stock)} abaixo do mínimo (${formatNumber(minimum)}); para chegar ao ${targetText} são necessários ${formatNumber(needed)}, mas ${openText}. ${open.length === 1 ? 'A SC cobre' : 'As SCs cobrem'} só ${formatNumber(onOrder)} de ${formatNumber(needed)}: com ${open.length === 1 ? 'ela' : 'elas'} o saldo vai a ${formatNumber(after)}, ${reach}. Sugestão de compra: mais ${formatNumber(toBuy)}.`);
      } else {
        actions.push('COMPRA EM ANDAMENTO');
        why.push(`Compra em andamento: saldo abaixo do mínimo e ${openText}, o que cobre até o ${targetText}.`);
      }
    } else {
      purchase = purchases ? pickPurchaseRequest(requests, localNumber) : null;
      // Última SC já entregue (saldo da OF zerado): não aparece.
      const delivered = purchaseDelivered(purchase);
      if (delivered) purchase = null;
      actions.push('COMPRAR');
      const last = purchase ? ` Última SC: ${purchaseRequestText(purchase)}.` : delivered ? ' Sem SC em andamento no SNAC0540.' : purchases ? ' Sem SC no SNAC0540 para o item.' : ' Importe o SNAC0540 para conferir SCs em andamento.';
      why.push(`Comprar: saldo abaixo do mínimo; sugestão de compra ${formatNumber(toBuy)} para chegar ao ${targetText}.${last}`);
    }
  } else if (open.length) {
    purchase = open[0];
    const reasons = [
      minimum === null ? 'sem mínimo' : stock >= minimum && `saldo ${formatNumber(stock)} no mínimo (${formatNumber(minimum)}) ou acima`,
      stale && `${formatNumber(daysSince)} dias sem requisição (90 ou mais)`,
      obsoleteLocation && 'local obsoleto (1 ou 298)',
      blocked && 'item bloqueado',
      willBlock && 'recomendação de bloqueio nesta análise',
    ].filter(Boolean);
    actions.push('REVISAR SC');
    why.push(`Revisar SC: ${openText}, mas o item não precisa de compra (${reasons.join('; ')}). Confira se a compra ainda faz sentido.`);
  }
  return { actions, why, purchase, toBuy, scCoverage, onOrder: open.length ? onOrder : null };
}

// Limites: ZERAR MIN/MAX no local obsoleto (item bloqueado, 180 dias ou mais); AJUSTAR MIN/MAX
// com saldo acima do máximo e requisição recente (menos de 90 dias), se não houver SC aberta.
function limitAction({ stock, minimum, maximum, daysSince, obsoleteLocation }, blocked, hasOpenRequest) {
  if (stock > 0 && minimum !== null && maximum !== null && (minimum !== 0 || maximum !== 0) && obsoleteLocation && daysSince !== null && daysSince >= 180 && blocked) return 'ZERAR MIN/MAX';
  if (!hasOpenRequest && stock > 0 && daysSince !== null && daysSince < 90 && minimum !== null && maximum !== null && stock > maximum && !(obsoleteLocation && minimum === 0 && maximum === 0)) return 'AJUSTAR MIN/MAX';
  return null;
}

export function analyzeAnalitico(rows, mapping, firstRow = 2, { numberFormat = 'pt-BR', purchases = null } = {}) {
  return rows.map((cells, index) => {
    const { base, localNumber } = readRow(cells, mapping, index + firstRow, numberFormat);
    const block = blockState(base);
    const issues = dataIssues(base, localNumber, mapping, block);
    if (issues.length) return { ...base, reason: `Corrigir na planilha: ${issues.join('; ')}.` };
    const { stock, minimum, maximum, daysSince, blockReason, blockId } = base;
    const details = [daysSince === null ? '' : `${formatNumber(daysSince)} dias desde a última requisição`, blockReason, blockId ? `Id Bloqueio: ${blockId}` : ''].filter(Boolean);
    if (!block.rawReason && block.reason === 'desbloqueado') details.push('Motivo do bloqueio considerado como Desbloqueado pelo Id Bloqueio.');
    const blocking = blockActions(base, localNumber, block);
    const willBlock = blocking.actions.some(action => action.startsWith('BLOQUEAR'));
    const buying = purchaseActions(base, localNumber, block.blocked, willBlock, purchases);
    const actions = [...blocking.actions, ...buying.actions];
    details.push(...blocking.why, ...buying.why);
    const limit = limitAction(base, block.blocked, buying.onOrder !== null);
    if (limit) actions.push(limit);
    if (!actions.length) actions.push('Sem ação definida');
    // Visibilidade: compra em andamento (SCs abertas cobrem até o máximo) não pede nada e fica
    // oculta como sem ação; saldo, mínimo e máximo zerados e desbloqueado também (salvo REVISAR SC).
    const hiddenByStatus = stock === 0 && minimum === 0 && maximum === 0 && block.reason === 'desbloqueado';
    const ongoingOnly = actions.every(action => action === 'COMPRA EM ANDAMENTO');
    const hidden = (hiddenByStatus && !actions.includes('REVISAR SC')) || actions.includes('Sem ação definida') || ongoingOnly;
    if (limit === 'ZERAR MIN/MAX') details.push('Zerar mín./máx.: saldo positivo, limite não zerado, local obsoleto (1 ou 298), ao menos 180 dias sem requisição e item bloqueado.');
    if (limit === 'AJUSTAR MIN/MAX') details.push(`Ajustar mín./máx.: saldo positivo, ${formatNumber(daysSince)} dias desde a última requisição (abaixo de 90) e saldo acima do máximo.`);
    if (hidden) details.push(ongoingOnly ? 'Oculto por padrão: compra em andamento, nada a fazer até a entrega.' : hiddenByStatus && !actions.includes('Sem ação definida') ? 'Oculto por padrão: saldo, mínimo e máximo zerados; Desbloqueado.' : 'Oculto por padrão: sem ação definida.');
    return { ...base, hidden, actions, action: actions.join(' + '), reason: details.join(' · '), toBuy: buying.toBuy, onOrder: buying.onOrder, purchase: buying.purchase, scCoverage: buying.scCoverage };
  });
}
