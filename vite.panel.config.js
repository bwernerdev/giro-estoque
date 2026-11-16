// Build do modelo do painel publicado ("Gerar painel"): empacota src/panel/entry.js (o app
// inteiro, JS + CSS + fontes) num script único e encaixa tudo em src/panel/template.html.
// Resultado: src/panel/template.generated.html, que o app importa (?raw) e completa com os
// dados na hora de gerar. Roda antes do dev e do build (package.json: predev, prebuild).
// O gerado é versionado: o GitHub Pages serve o código-fonte sem build. Mudou algo em src/?
// Rode `npm run build:panel` e commite o modelo junto (tests/panel.test.js confere o hash).
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { panelSourceHash } from './scripts/panel-hash.mjs';

const folder = fileURLToPath(new URL('./src/panel/', import.meta.url));

function buildTemplate() {
  return {
    name: 'montar-modelo-do-painel',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files = Object.values(bundle);
        const js = files.filter(file => file.type === 'chunk').map(file => file.code).join('\n');
        const css = files.filter(file => file.type === 'asset' && file.fileName.endsWith('.css')).map(file => String(file.source)).join('\n');
        if (!js) throw new Error('Build do painel sem JS.');
        if (!css) throw new Error('Build do painel sem CSS.');
        if (files.some(file => file.type === 'asset' && !file.fileName.endsWith('.css'))) throw new Error('Build do painel com arquivo separado: tudo precisa ficar embutido.');
        const template = readFileSync(`${folder}template.html`, 'utf8');
        for (const marker of ['/*CSS*/', '/*JS*/', '__DADOS_DO_PAINEL__']) {
          if (template.split(marker).length !== 2) throw new Error(`template.html precisa ter ${marker} uma vez.`);
        }
        // Texto "</script" ou "</style" dentro do código fecharia a tag antes da hora.
        const html = template
          .replace('<!doctype html>', () => `<!doctype html>\n<!-- fontes do painel: ${panelSourceHash()} -->`)
          .replace('/*CSS*/', () => css.replace(/<\/style/gi, '<\\/style'))
          .replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
        writeFileSync(`${folder}template.generated.html`, html);
        for (const name of Object.keys(bundle)) delete bundle[name];
      },
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [buildTemplate()],
  // IIFE não tem import.meta: sem isto, new URL(ícone embutido, import.meta.url) quebra com base
  // "undefined". O ícone já vira data: URL; a base só precisa ser uma URL válida.
  define: { 'import.meta.url': JSON.stringify('file:///painel-giro-estoque.html') },
  resolve: {
    // O painel não gera outro painel (e não leva o próprio modelo dentro de si).
    alias: [{ find: /^\.\/panel\/generate\.js$/, replacement: fileURLToPath(new URL('./src/panel/stub.js', import.meta.url)) }],
  },
  build: {
    outDir: '.panel-build',
    emptyOutDir: true,
    minify: true,
    cssCodeSplit: false,
    assetsInlineLimit: () => true,
    lib: {
      entry: 'src/panel/entry.js',
      formats: ['iife'],
      name: 'GiroEstoquePainel',
      fileName: () => 'painel.js',
      cssFileName: 'painel',
    },
  },
});
