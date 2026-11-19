const CACHE_VERSION = 'development';
const CACHE_NAME = `giro-estoque-app-v${CACHE_VERSION}`;
// Sem build (Go Live, servindo o fonte): o que fica offline. O build (scripts/copy-vendor.mjs)
// troca esta lista pelos arquivos do dist/. tests/regressions.test.js confere que ela bate com src/.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/images/favicon.webp',
  './assets/images/app-icon.svg',
  './vendor/exceljs.min.js',
  './src/styles/base.css',
  './src/styles/components.css',
  './src/styles/fonts.css',
  './src/styles/index.css',
  './src/styles/layout/structure.css',
  './src/styles/layout/start.css',
  './src/styles/layout/workspace.css',
  './src/styles/layout/config.css',
  './src/styles/layout/overview.css',
  './src/styles/layout/table-tools.css',
  './src/styles/layout/breakpoints.css',
  './src/styles/layout/motion.css',
  './src/styles/layout/attach.css',
  './src/styles/layout/panel.css',
  './src/styles/print.css',
  './src/styles/table.css',
  './src/styles/tokens.css',
  './src/analysis.js',
  './src/analysis/fields.js',
  './src/analysis/numbers.js',
  './src/analysis/generic.js',
  './src/analysis/giro.js',
  './src/analysis/analitico.js',
  './src/analysis/purchase-rules.js',
  './src/analysis/indicators.js',
  './src/dashboard.js',
  './src/export-data.js',
  './src/icons.js',
  './src/import.js',
  './src/import.worker.js',
  './src/main.js',
  './src/purchases.js',
  './src/saved-import.js',
  './src/template.js',
  './src/ui/config.js',
  './src/ui/context.js',
  './src/ui/details.js',
  './src/ui/export.js',
  './src/ui/importer.js',
  './src/ui/markup.js',
  './src/ui/motion.js',
  './src/ui/overview.js',
  './src/ui/preferences.js',
  './src/ui/selectors.js',
  './src/ui/shortcuts.js',
  './src/ui/table.js',
  './src/panel/data.js',
  './src/panel/generate.js',
  './src/panel/template.generated.html',
  './src/fonts/manrope-500.woff2',
  './src/fonts/manrope-700.woff2',
  './src/fonts/manrope-800.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('giro-estoque-app-v') && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
