// Atalhos de teclado: o botão "?" da barra da tabela (e a tecla ?) abre a lista em
// dialog#shortcuts-dialog. Esc fecha (comportamento nativo do <dialog>).
export function createShortcuts(ui) {
  const { el } = ui;
  const dialog = el('#shortcuts-dialog');
  const shortcutsOpen = () => Boolean(dialog?.open);
  function openShortcuts() {
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    el('#shortcuts-close').focus();
  }
  function closeShortcuts() {
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
  el('#shortcuts-button').addEventListener('click', openShortcuts);
  el('#shortcuts-close').addEventListener('click', closeShortcuts);
  dialog.addEventListener('close', () => el('#shortcuts-button').focus({ preventScroll: true }));
  // Clique fora da caixa (no fundo escurecido) fecha.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeShortcuts();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable]') || el('#workspace').hidden || el('#item-panel').open) return;
    event.preventDefault();
    if (shortcutsOpen()) closeShortcuts();
    else openShortcuts();
  });
  return { shortcutsOpen };
}
