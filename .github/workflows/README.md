# .github/workflows/

- `deploy-pages.yml`: publica no GitHub Pages a cada push em `main` (ou manualmente). Job `build`: Node 24 (o jsdom dos testes não roda no Node 20), `npm ci`, `npm test` (testes unitários: se falharem, nada é publicado), `npm run build`, envia `./dist` como artefato. Job `deploy`: `actions/deploy-pages`.

Os e2e (Playwright, Chrome instalado) não rodam aqui: rode `npm run test:e2e` antes do push quando mexer em layout ou fluxo.
