// No build do painel, generate.js aponta para cá: o painel não gera outro painel e não leva o
// próprio modelo dentro de si (vite.panel.config.js).
export function generatePanelHtml() {
  throw new Error('O painel publicado não gera outro painel.');
}
