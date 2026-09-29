import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
await mkdir(new URL('vendor/', dist), { recursive: true });
for (const name of ['exceljs.min.js', 'exceljs.min.js.map', 'EXCELJS-LICENSE']) {
  await cp(new URL(`vendor/${name}`, root), new URL(`vendor/${name}`, dist));
}
await mkdir(new URL('assets/images/', dist), { recursive: true });
for (const name of ['favicon.webp', 'app-icon.svg']) {
  await cp(new URL(`assets/images/${name}`, root), new URL(`assets/images/${name}`, dist));
}
await cp(new URL('manifest.webmanifest', root), new URL('manifest.webmanifest', dist));

// Vite fingerprints the linked manifest, but its relative start_url must resolve
// from the application root. Use the original manifest copied above instead.
const indexUrl = new URL('index.html', dist);
const index = await readFile(indexUrl, 'utf8');
if (!/<link\s+rel="manifest"\s+href="[^"]+"\s*\/?>/.test(index)) throw new Error('Não foi possível localizar o manifesto no HTML compilado.');
const corrected = index.replace(/(<link\s+rel="manifest"\s+href=")[^"]+("\s*\/?>)/, '$1./manifest.webmanifest$2');
await writeFile(indexUrl, corrected);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const distPath = fileURLToPath(dist);
const shell = (await files(distPath))
  .map(path => relative(distPath, path).replaceAll('\\', '/'))
  .filter(path => !path.endsWith('.map') && path !== 'service-worker.js' && !path.startsWith('assets/manifest-'))
  .sort();
const hash = createHash('sha256');
for (const path of shell) {
  hash.update(path);
  hash.update(await readFile(join(distPath, path)));
}
const source = await readFile(new URL('service-worker.js', root), 'utf8');
const worker = source
  .replace("const CACHE_VERSION = 'development';", `const CACHE_VERSION = '${hash.digest('hex').slice(0, 12)}';`)
  .replace(/const APP_SHELL = \[[\s\S]*?\];/, `const APP_SHELL = ${JSON.stringify(['./', ...shell.map(path => `./${path}`)])};`);
if (worker === source || worker.includes("CACHE_VERSION = 'development'")) throw new Error('Não foi possível gerar o cache offline.');
await writeFile(new URL('service-worker.js', dist), worker);
