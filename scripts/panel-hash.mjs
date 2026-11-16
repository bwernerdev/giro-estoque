// Impressão digital do que entra no modelo do painel (src/panel/template.generated.html).
// O app também roda servindo o código-fonte sem build (Go Live), então o modelo gerado é
// versionado; vite.panel.config.js grava este hash nele e tests/panel.test.js
// confere que o modelo commitado corresponde às fontes atuais.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const TEXT = /\.(js|mjs|css|html)$/;

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function panelSourceHash() {
  const inputs = [
    ...files(join(root, 'src')).filter(path => !path.endsWith('template.generated.html') && !path.endsWith('README.md')),
    join(root, 'vite.panel.config.js'),
    join(root, 'assets', 'images', 'favicon.webp'),
  ].map(path => relative(root, path).replaceAll('\\', '/')).sort();
  const hash = createHash('sha256');
  for (const path of inputs) {
    hash.update(path);
    const content = readFileSync(join(root, path));
    // Texto sem \r: o Git pode trocar o fim de linha no Windows.
    hash.update(TEXT.test(path) ? content.toString('utf8').replaceAll('\r', '') : content);
  }
  return hash.digest('hex').slice(0, 16);
}

export const PANEL_HASH_PATTERN = /<!-- fontes do painel: ([0-9a-f]{16}) -->/;
