// Regras de compra sobre o follow-up SNAC0540: SC em andamento, SCs abertas, quanto trazem,
// qual SC vale para o item e os textos de andamento e de cobertura.
import { normalize } from './fields.js';
import { formatNumber } from './numbers.js';

// Código do item comparável entre relatórios: só dígitos, sem zeros à esquerda
// ("6.470" no Analítico e "006470" viram "6470").
export function itemKey(value) {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

const ACTIVE_REQUEST_STATUSES = new Set(['compra confirmada', 'usuario preenchendo', 'comprador negociando', 'aguardando autorizacao']);

// SC em andamento: situação ativa, não cancelada, OF não cancelada nem fechada e ainda
// não recebida (sem nota fiscal, ou com nota e saldo a entregar na OF).
export function purchaseInProgress(request) {
  if (!request || !ACTIVE_REQUEST_STATUSES.has(normalize(request.status))) return false;
  if (normalize(request.canceled) === 's') return false;
  if (['cancelada', 'fechada'].includes(normalize(request.orderStatus))) return false;
  if (request.invoice && !(request.orderBalance > 0)) return false;
  return true;
}

// Quanto uma SC aberta ainda vai trazer: o saldo a entregar da OF; sem OF (ou sem saldo
// informado), a quantidade pedida na SC.
export function openPurchaseQuantity(request) {
  if (!request) return 0;
  if (request.orderBalance > 0) return request.orderBalance;
  return request.quantity > 0 ? request.quantity : 0;
}

// SCs abertas do item no local (mesmo local ou sem local), mais recente primeiro, uma por
// linha de SC (SC + Seq.): o relatório repete a linha a cada recebimento parcial.
export function openPurchaseRequests(requests, localNumber) {
  const seen = new Set();
  return (requests ?? [])
    .filter(request => request.local === null || request.local === undefined || localNumber === null || request.local === localNumber)
    .filter(purchaseInProgress)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || Number(b.request) - Number(a.request) || Number(a.sequence) - Number(b.sequence))
    .filter(request => {
      const key = `${request.request}|${request.sequence ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(request => ({ ...request, inProgress: true }));
}

// SC encerrada com a OF sem saldo a entregar (já entregue): não interessa mais para a compra.
export function purchaseDelivered(request) {
  return Boolean(request && !purchaseInProgress(request) && (request.order || request.invoice) && !(request.orderBalance > 0));
}

// SC que vale para o item no local: só SCs do mesmo local ou sem local informado; entre
// elas, a mais recente em andamento, ou a mais recente de todas se nenhuma estiver ativa.
export function pickPurchaseRequest(requests, localNumber) {
  const candidates = (requests ?? []).filter(request => request.local === null || request.local === undefined || localNumber === null || request.local === localNumber);
  if (!candidates.length) return null;
  const newestFirst = [...candidates].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
    || Number(b.request) - Number(a.request) || Number(a.sequence) - Number(b.sequence));
  const active = newestFirst.find(purchaseInProgress);
  const chosen = active ?? newestFirst[0];
  return { ...chosen, inProgress: Boolean(active) };
}

function requestDate(date) {
  return date ? date.toLocaleDateString('pt-BR') : '';
}

// Andamento da SC em poucas palavras: a situação, se ainda está em andamento; senão o
// motivo de ter encerrado (recebida, cancelada ou OF fechada sem entrega).
export function purchaseStage(request) {
  if (!request) return '';
  if (purchaseInProgress(request)) return request.status;
  if (request.invoice) return `Recebida (NF ${request.invoice})`;
  if (normalize(request.status) === 'cancelada' || normalize(request.canceled) === 's') return 'Cancelada';
  if (normalize(request.orderStatus) === 'cancelada') return 'OF cancelada';
  if (normalize(request.orderStatus) === 'fechada') return 'OF fechada sem entrega';
  return request.status;
}

export function purchaseRequestText(request) {
  if (!request) return '';
  const parts = [`SC ${request.request}`, requestDate(request.createdAt) && `de ${requestDate(request.createdAt)}`, request.status && `(${request.status})`].filter(Boolean).join(' ');
  const order = request.order ? `, OF ${request.order}${request.orderStatus ? ` (${request.orderStatus})` : ''}` : '';
  const invoice = request.invoice ? `, NF ${request.invoice}` : '';
  return `${parts}${order}${invoice}`;
}

// Cobertura das SCs abertas para a tela e a exportação: curto (tabela) ou completo (detalhes).
export function scCoverageText(coverage, { short = false } = {}) {
  if (!coverage) return '';
  const { requests = 1, needed, onOrder, missing, target, targetKind, after, minimum, maximum, sufficient, belowMinimum } = coverage;
  const [scs, bring, them] = requests === 1 ? ['a SC aberta', 'traz', 'ela'] : ['as SCs abertas', 'trazem', 'elas'];
  if (short) {
    if (sufficient) return 'SC cobre o máx.';
    return `SC insuficiente: cobre ${formatNumber(onOrder)} de ${formatNumber(needed)}${belowMinimum ? ', não chega ao mín.' : ''}`;
  }
  const limits = maximum === null ? `mínimo ${formatNumber(minimum)}` : `mínimo ${formatNumber(minimum)} / máximo ${formatNumber(maximum)}`;
  if (sufficient) return `Cobre: ${scs} ${bring} ${formatNumber(onOrder)}, e o necessário para o ${targetKind} (${formatNumber(target)}) é ${formatNumber(needed)}. Com ${them} o saldo vai a ${formatNumber(after)} (${limits}).`;
  return `Insuficiente: ${scs} ${bring} ${formatNumber(onOrder)} de ${formatNumber(needed)} necessários para o ${targetKind} (${formatNumber(target)}); faltam ${formatNumber(missing)}. Com ${them} o saldo vai a ${formatNumber(after)} (${limits})${belowMinimum ? ', ainda abaixo do mínimo' : ''}.`;
}
