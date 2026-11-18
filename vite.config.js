import { defineConfig } from 'vite';

// Keep the distribution portable between the domain root and subdirectories.
export default defineConfig({
  base: './',
  build: {
    // O worker do .xlsx (src/import.worker.js) precisa ser um arquivo em dist/assets/: embutido
    // como data: URL, o importScripts('../vendor/exceljs.min.js') dele não acharia o ExcelJS.
    assetsInlineLimit: file => (file.endsWith('import.worker.js') ? false : undefined),
  },
});
