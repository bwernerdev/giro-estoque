// "Gerar painel" (app): o modelo pronto (template.generated.html, saído de `npm run build:panel`)
// com os dados embutidos. Carregado sob demanda pelo main.js; no build do painel vira stub.js.
import template from './template.generated.html?raw';
import { fillPanelTemplate } from './data.js';

export function generatePanelHtml(data) {
  return fillPanelTemplate(template, data);
}
