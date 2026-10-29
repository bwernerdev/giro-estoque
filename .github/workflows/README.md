# .github/workflows/

- `deploy-pages.yml`: publica no GitHub Pages a cada push em `main` (ou manualmente). Job `build`: Node 20, `npm ci`, `npm run build`, envia `./dist` como artefato. Job `deploy`: `actions/deploy-pages`.

Não roda testes; rode `npm test` antes do push.
