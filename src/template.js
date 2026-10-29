import { svgIcon } from './icons.js';

const brandIconUrl = new URL('../assets/images/favicon.webp', import.meta.url).href;

export function renderApp() {
  return `
    <div class="shell">
      <div id="progress" class="progress" role="progressbar" aria-label="Andamento da leitura" aria-valuemin="0" aria-valuemax="100" hidden><div id="progress-bar" class="progress-bar"></div></div>
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><img src="${brandIconUrl}" alt="" /></span><span>CONTROLE<span class="brand-light"> DE ESTOQUE</span></span></div>
        <div class="topbar-actions">
          <button id="install-app" class="topbar-button install-button" type="button" hidden>${svgIcon('download')}<span>Instalar app</span></button>
          <button id="theme-toggle" class="topbar-button theme-toggle" type="button" aria-pressed="false">${svgIcon('moon')}<span>Modo escuro</span></button>
        </div>
      </header>
      <main>
        <section class="hero">
          <div class="eyebrow"><span class="eyebrow-dot"></span> ANÁLISE DE MATERIAIS</div>
          <h1>Entenda o giro<br>de cada <em>item.</em></h1>
          <p>Consulte quantidades, limites, classificação e ações por item.</p>
        </section>
        <section class="upload-card" id="upload-card">
          <div class="upload-icon" aria-hidden="true">${svgIcon('download')}</div>
          <div class="upload-copy">
            <h2>Importar planilha</h2>
            <p>Arraste um arquivo aqui ou selecione no computador.</p>
            <small>Excel .xlsx ou CSV · sem enviar dados para servidor</small>
          </div>
          <div class="upload-actions">
            <label class="primary-button" for="file-input" role="button" tabindex="0"><span>Selecionar arquivo</span>${svgIcon('arrowRight')}</label>
            <input id="file-input" type="file" accept=".xlsx,.csv" hidden>
          </div>
        </section>
        <div id="message" role="status" aria-live="polite"></div>
        <section id="workspace" hidden>
          <div class="workspace-bar">
            <div id="import-context" class="import-context" aria-live="polite"></div>
            <div id="total-value" class="total-value" hidden></div>
            <div class="config-actions"><button id="replace-file" class="secondary-button config-toggle" type="button">${svgIcon('download')}<span>Trocar arquivo</span></button><button id="config-toggle" class="secondary-button config-toggle" type="button" aria-controls="config-grid" aria-expanded="false"><span>Abrir configuração</span>${svgIcon('chevronDown')}</button></div>
          </div>
          <div id="config-grid" class="config-grid" hidden>
            <div class="panel"><h3>Colunas da planilha</h3><p class="panel-intro">Confirme quais colunas contêm os dados de cada item.</p><div id="mapping" class="mapping-grid"></div></div>
            <div class="panel" id="criteria-panel"><h3>Critérios de decisão</h3><p class="panel-intro" id="criteria-intro">Ajuste os limites de cobertura para sua operação.</p><div class="settings-grid" id="settings-grid"></div><p class="formula-note" id="formula-note"></p></div>
          </div>
          <section id="results-section" class="results-section">
            <div id="data-quality" class="insight-strip data-quality" role="status" hidden><div><strong id="data-quality-title"></strong><span id="data-quality-detail"></span></div></div>
            <div id="summary" class="summary-grid"></div>
            <div class="table-panel">
              <div class="table-tools">
                <div class="table-tools-header">
                <div id="search-control" class="search-control"><button id="search-toggle" class="discreet-button search-toggle" type="button" aria-expanded="false" aria-controls="search-expansion">${svgIcon('search')}<span>Pesquisar</span></button><div id="search-expansion" class="search-expansion" inert><div class="search-expansion-inner"><label class="filter-field search-field"><span>Pesquisa</span><span class="search-label">${svgIcon('search')}<input id="search" type="search" placeholder="Buscar item ou código"></span></label></div></div></div>
                  <div class="filter-actions" role="group" aria-label="Ações da tabela">                  <button id="density-toggle" class="secondary-button density-toggle" type="button" aria-pressed="false"><span class="density-check">${svgIcon('check')}</span><span>Modo compacto</span></button>
                  <details id="export-menu" class="export-menu"><summary class="primary-button"><span>Exportar</span>${svgIcon('chevronDown')}</summary><div class="export-options"><button type="button" data-export="xlsx">Excel (.xlsx)</button><button type="button" data-export="pdf">PDF (salvar/imprimir)</button><button type="button" data-export="csv">CSV (.csv)</button></div></details></div>
                </div>
                <div class="table-filters">
                  <label class="filter-field"><span>Local</span><select id="location-filter" aria-label="Filtrar local de estoque"><option value="">Todos</option></select></label>
                  <label class="filter-field"><span>Prateleira</span><select id="shelf-filter" aria-label="Filtrar prateleira"><option value="">Todas</option></select></label>
                  <label class="filter-field"><span>Repartição</span><select id="partition-filter" aria-label="Filtrar repartição"><option value="">Todas</option></select></label>
                  <label class="filter-field"><span>Ação</span><select id="filter" aria-label="Filtrar recomendação"><option value="">Todas as recomendações</option></select></label>

                </div>
              </div>
              <div class="results-bar"><div class="results-counter" role="status" aria-live="polite"><strong id="filtered-count">0 de 0 itens</strong><span>conforme os filtros atuais</span></div><div class="results-options"><button id="stripe-toggle" class="discreet-button" type="button" aria-pressed="false">Zebrado</button><label id="hidden-toggle" class="hidden-toggle" hidden><input id="show-hidden" type="checkbox"> <span id="hidden-toggle-text">Mostrar itens ocultos</span></label></div></div>
              <div id="active-filters" class="active-filters" hidden><span id="active-filters-text"></span><button id="clear-filters" class="discreet-button" type="button">Limpar filtros</button></div>
              <div class="table-scroll"><table id="result-table"><caption class="sr-only">Resultados da análise de estoque</caption><thead id="table-head"></thead><tbody id="result-rows"></tbody></table></div>
              <div id="table-footer" class="table-footer"><span id="page-status"></span><label class="page-size-control">Itens por página<select id="page-size"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label><nav id="pagination" class="pagination" aria-label="Páginas de resultados" hidden><button id="page-previous" type="button">Anterior</button><span id="page-label"></span><button id="page-next" type="button">Próxima</button></nav></div>
            </div>
          </section>
        </section>
      </main>
    </div>
    <dialog id="item-panel" class="item-panel" aria-labelledby="item-panel-title"><header class="item-panel-header"><h2 id="item-panel-title">Detalhes do item</h2><div class="item-panel-nav"><button id="item-panel-prev" class="discreet-button" type="button" aria-label="Item anterior" title="Item anterior (↑)">${svgIcon('chevronUp')}</button><button id="item-panel-next" class="discreet-button" type="button" aria-label="Próximo item" title="Próximo item (↓)">${svgIcon('chevronDown')}</button><button id="item-panel-close" class="discreet-button" type="button" aria-label="Fechar detalhes">${svgIcon('close')}</button></div></header><div id="item-panel-content" class="item-panel-content"></div></dialog>
    <span id="copy-feedback" class="sr-only" role="status" aria-live="polite"></span>
    <section id="print-report" aria-hidden="true"></section>`;
}
