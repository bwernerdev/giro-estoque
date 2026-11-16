# src/panel — painel publicado ("Gerar painel")

O botão **Gerar painel** (topbar, `#generate-panel`) baixa `painel-giro-estoque.html`: o app inteiro (JS, CSS, fontes e ícone embutidos) mais os dados atuais, num arquivo só, para o OneDrive/SharePoint com link na Intranet. Quem abre vê o mesmo painel, só consulta.

| Arquivo | Conteúdo |
|---|---|
| `data.js` | `PANEL_FILE_NAME`, `PANEL_MARKER`, `PANEL_VERSION`, `buildPanelData` (aba importada, mapeamento, modo, formato numérico, critérios e SCs do SNAC0540 só dos itens da planilha, sem solicitante, nome do produto nem entrega), `serializePanelData` (`<` escapado), `fillPanelTemplate`, `readPanelData` (de volta a datas e `byItem`). Roda no navegador e no Node |
| `template.html` | Esqueleto com `/*CSS*/`, `/*JS*/` e `__DADOS_DO_PAINEL__` (em `<script id="panel-data" type="application/json">`) |
| `entry.js` | Entrada do build do painel: `styles/index.css` + `main.js` |
| `generate.js` | `generatePanelHtml(data)` (async): busca o modelo pronto com `fetch(new URL('./template.generated.html', import.meta.url))` e encaixa os dados. Importado sob demanda pelo `main.js`. Sem `?raw`: o GitHub Pages serve o código-fonte sem build |
| `stub.js` | Substitui `generate.js` no build do painel (o painel não gera outro painel nem leva o próprio modelo) |
| `template.generated.html` | Gerado por `npm run build:panel` (`../../vite.panel.config.js`; roda antes do `dev` e do `build`). **Versionado** (o Pages serve o fonte), com o hash das fontes no comentário `fontes do painel` (`../../scripts/panel-hash.mjs`). Não editar à mão: mexeu em `src/`, rode `npm run build:panel` e commite junto; `tests/panel.test.js` falha se estiver desatualizado |

## Regras
- O `main.js` entra em modo painel quando acha `#panel-data`: `html[data-panel]`, abre direto (`openEmbeddedPanel`), sem service worker. O fim de `styles/layout.css` esconde importar, SNAC0540, configuração, Gerar painel e Excel (ExcelJS não vai no arquivo).
- Dentro de um quadro (`window.top !== window`, pré-visualização do SharePoint): `html[data-frame]`, some o menu Exportar e aparece `#frame-notice`. Lá não funcionam download, impressão nem armazenamento (o app já trata `localStorage` com try/catch).
- IIFE não tem `import.meta`: `vite.panel.config.js` define `import.meta.url` para `new URL(ícone, import.meta.url)` do `template.js` funcionar.
- Mudou o formato de `buildPanelData`: suba `PANEL_VERSION` (painel antigo avisa em vez de abrir errado) e ajuste `tests/panel.test.js` e `e2e/panel.spec.js`.
- Publicar: enviar para a mesma pasta do OneDrive com o **mesmo nome** e escolher "Substituir". O link da Intranet continua o mesmo.
