# .github/workflows/

- `deploy-pages.yml`: publica no GitHub Pages a cada push em `main` (ou manualmente). Job `build`: Node 24 (o jsdom dos testes não roda no Node 20), `TZ=America/Sao_Paulo`, `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npx playwright test` (e2e no `dist/` com o Google Chrome do runner; na falha, os rastros vão como artefato `e2e-rastros`) e envia `./dist` como artefato. Se qualquer passo falhar, nada é publicado. Job `deploy`: `actions/deploy-pages`.
