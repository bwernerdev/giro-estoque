// Movimento: troca animada dos filtros, números que sobem, entrada após importar e
// inclinação dos cartões (o efeito fica no CSS; aqui só a posição do cursor).


export function createMotion(ui) {
  const { el } = ui;
  // Consulta criada uma vez: .matches acompanha a mudança da preferência sem recriar a consulta.
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery?.matches ?? false;
  // Troca animada (View Transitions) nos filtros; sem suporte ou com movimento reduzido, troca direto.
  function withTransition(update) {
    if (typeof document.startViewTransition !== 'function' || reducedMotion()) return update();
    // Outra troca no meio pula a animação desta (a atualização roda mesmo assim); sem o catch,
    // o navegador acusa "Transition was skipped" como erro não tratado.
    document.startViewTransition(update).ready?.catch(() => {});
  }
  // Números sobem do valor mostrado antes até o novo. O texto final já está na página: a
  // animação só reescreve os quadros intermediários e termina devolvendo esse texto.
  const shownNumbers = new Map();
  function countUp(key, element, target, format) {
    const from = shownNumbers.get(key) ?? 0;
    shownNumbers.set(key, target);
    if (!element || from === target || reducedMotion() || typeof requestAnimationFrame !== 'function') return;
    const finalText = element.textContent;
    const start = performance.now();
    const step = now => {
      if (!element.isConnected) return;
      const progress = Math.min(1, (now - start) / 700);
      const eased = 1 - (1 - progress) ** 3;
      element.textContent = progress < 1 ? format(from + (target - from) * eased) : finalText;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // Entrada da visão geral e da tabela depois de importar: aparecem em sequência.
  function playEntrance() {
    if (reducedMotion()) return;
    const shell = el('.shell');
    document.querySelectorAll('.money-kpi:not([hidden]), .summary-card, .chart-row, .table-panel')
      .forEach((node, index) => node.style.setProperty('--i', String(Math.min(index, 12))));
    shell.classList.add('is-entering');
    setTimeout(() => shell.classList.remove('is-entering'), 1400);
  }
  // Cartões inclinam na direção do cursor e um brilho acompanha o mouse. O script só
  // informa a posição (--rx, --ry, --mx, --my); o efeito e o hover ficam no CSS.
  // O movimento só é escutado enquanto o cursor está sobre um cartão: no resto da página,
  // mover o mouse não roda nenhum script nem pede quadro novo ao navegador.
  const tiltSelector = '.summary-card:not(:disabled), .money-kpi';
  let tiltCard = null;
  let tiltEvent = null;
  let tiltFrame = 0;
  function applyTilt() {
    tiltFrame = 0;
    const card = tiltCard;
    if (!card || !tiltEvent) return;
    const box = card.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = Math.min(1, Math.max(0, (tiltEvent.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (tiltEvent.clientY - box.top) / box.height));
    card.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }
  function trackTilt(event) {
    tiltEvent = event;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(applyTilt);
  }
  function resetTilt() {
    if (tiltFrame) cancelAnimationFrame(tiltFrame);
    tiltFrame = 0;
    tiltEvent = null;
    if (!tiltCard) return;
    tiltCard.removeEventListener('pointermove', trackTilt);
    ['--rx', '--ry', '--mx', '--my'].forEach(name => tiltCard.style.removeProperty(name));
    tiltCard = null;
  }
  const overviewArea = el('#overview');
  overviewArea.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || reducedMotion()) return;
    const card = event.target instanceof Element ? event.target.closest(tiltSelector) : null;
    if (!card || card === tiltCard) return;
    resetTilt();
    tiltCard = card;
    card.addEventListener('pointermove', trackTilt);
    trackTilt(event);
  });
  overviewArea.addEventListener('pointerout', event => {
    if (tiltCard && !tiltCard.contains(event.relatedTarget)) resetTilt();
  });
  // Nova planilha: os números voltam a subir do zero.
  function resetCountUp() { shownNumbers.clear(); ui.state.countedTotal = null; }
  // Contador de itens filtrados: em planilha nova ele não anima, só passa a valer o número atual.
  function resetFilteredCount(value) { shownNumbers.set('filtered', value); }
  return { withTransition, countUp, playEntrance, resetCountUp, resetFilteredCount, reducedMotion };
}
