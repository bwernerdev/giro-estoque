// "Gerar painel" (app): o modelo pronto (template.generated.html, saído de `npm run build:panel`)
// com os dados embutidos. Carregado sob demanda pelo main.js; no build do painel vira stub.js.
// O modelo vem por fetch (não por import ?raw): assim funciona também servindo o código-fonte
// sem build (Go Live); no build do Vite, o new URL vira um arquivo em dist/assets.
import { fillPanelTemplate } from './data.js';

const TEMPLATE_URL = new URL('./template.generated.html', import.meta.url);

export async function generatePanelHtml(data) {
  const response = await fetch(TEMPLATE_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Não foi possível carregar o modelo do painel (${response.status}). Recarregue a página.`);
  return fillPanelTemplate(await response.text(), data);
}
