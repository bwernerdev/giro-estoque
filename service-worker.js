const CACHE_VERSION = 'development';
const CACHE_NAME = `giro-estoque-app-v${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/images/favicon.webp',
  './assets/images/app-icon.svg',
  './src/style.css',
  './src/theme.css',
  './src/desktop.css',
  './src/main.js',
  './src/analysis.js',
  './src/dashboard.js',
  './src/export-data.js',
  './src/import.js',
  './src/template.js',
  './vendor/exceljs.min.js',
  './src/fonts/dm-sans-400.woff2',
  './src/fonts/dm-sans-500.woff2',
  './src/fonts/dm-sans-600.woff2',
  './src/fonts/dm-sans-700.woff2',
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
