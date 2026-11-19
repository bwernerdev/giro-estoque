// Entrada do app: monta o HTML, cria o contexto (estado novo a cada carga, também nos testes,
// que recarregam este arquivo) e liga os módulos de src/ui/. Cada módulo recebe `ui`, onde
// ficam o estado, os atalhos de DOM e as funções dos outros módulos (chamadas como ui.x()).
import { renderApp } from './template.js';
import { createContext } from './ui/context.js';
import { createSelectors } from './ui/selectors.js';
import { createConfig } from './ui/config.js';
import { createMotion } from './ui/motion.js';
import { createPreferences } from './ui/preferences.js';
import { createTable } from './ui/table.js';
import { createDetails } from './ui/details.js';
import { createOverview } from './ui/overview.js';
import { createExport } from './ui/export.js';
import { createImporter } from './ui/importer.js';

const app = typeof document !== 'undefined' ? document.querySelector('#app') : null;
if (app) {
  app.innerHTML = renderApp();
  const ui = createContext();
  const { el } = ui;
  // Painel publicado (painel-giro-estoque.html, src/panel/): dados embutidos, só consulta.
  const panelSource = document.getElementById('panel-data');
  const panelMode = Boolean(panelSource);
  // Dentro de um quadro (pré-visualização do SharePoint): download, imprimir e armazenamento bloqueados.
  const inFrame = (() => { try { return window.top !== window; } catch { return true; } })();
  if (panelMode) {
    document.documentElement.dataset.panel = 'true';
    if (inFrame) document.documentElement.dataset.frame = 'true';
    el('#frame-notice').hidden = !inFrame;
  }
  Object.assign(ui, { panelMode, panelSource, inFrame });
  // A ordem importa só para o que roda ao montar: configuração usa as consultas e preferências
  // usam as consultas e o movimento.
  for (const create of [createSelectors, createConfig, createMotion, createPreferences, createTable, createDetails, createOverview, createExport, createImporter]) Object.assign(ui, create(ui));
  let deferredInstallPrompt = null;
  const installButton = el('#install-app');

  function setInstallButton(visible) {
    if (!installButton) return;
    const standalone = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;
    installButton.hidden = !visible || standalone;
  }

  setInstallButton(false);

  if (!panelMode && 'serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');

        await registration.update();
      } catch {
        /* O app continua funcionando mesmo sem service worker. */
      }
    });
  }

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;

      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallButton(false);
      }
      deferredInstallPrompt = null;
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallButton(true);
  });

  window.addEventListener('appinstalled', () => {
    setInstallButton(false);
  });

  const initialMessage = el('#message');
  if (initialMessage) {
    initialMessage.textContent = '';
    initialMessage.className = '';
  }
  const menus = ['#export-menu', '#view-menu'];
  document.addEventListener('click', event => {
    for (const menu of menus) if (!el(menu).contains(event.target)) el(menu).open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = menus.find(selector => el(selector).open);
    if (!menu) return;
    el(menu).open = false;
    el(`${menu} summary`).focus();
  });
  if (panelMode) ui.openEmbeddedPanel();
  else ui.restoreSavedImport();
}
