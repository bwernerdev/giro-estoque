import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/vendor/', import.meta.url), { recursive: true });
await cp(new URL('../vendor/exceljs.min.js', import.meta.url), new URL('../dist/vendor/exceljs.min.js', import.meta.url));
await cp(new URL('../vendor/exceljs.min.js.map', import.meta.url), new URL('../dist/vendor/exceljs.min.js.map', import.meta.url));
await cp(new URL('../vendor/EXCELJS-LICENSE', import.meta.url), new URL('../dist/vendor/EXCELJS-LICENSE', import.meta.url));
