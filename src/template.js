import { svgIcon } from './icons.js';

const brandIconUrl = new URL('../assets/images/favicon.webp', import.meta.url).href;

export function renderApp() {
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><img src="${brandIconUrl}" alt="" /></span><span>CONTROLE<span class="brand-light"> DE ESTOQUE</span></span></div>
        <div class="topbar-actions">
          <button id="install-app" class="install-button" type="button">${svgIcon('download')}<span>Instalar app</span></button>
          <button id="theme-toggle" class="theme-toggle" type="button" aria-pressed="false">${svgIcon('moon')}<span>Modo escuro</span></button>
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
          <div class="section-head">
            <div><h2>Preparar análise</h2></div>
            <div class="config-actions"><button id="config-toggle" class="secondary-button config-toggle" type="button" aria-controls="config-grid" aria-expanded="false"><span>Abrir configuração</span>${svgIcon('chevronDown')}</button><span id="file-name" class="file-pill"></span></div>
          </div>
          <div id="config-grid" class="config-grid" hidden>
            <div class="panel"><h3>Colunas da planilha</h3><p class="panel-intro">Confirme quais colunas contêm os dados de cada item.</p><div id="mapping" class="mapping-grid"></div></div>
            <div class="panel" id="criteria-panel"><h3>Critérios de decisão</h3><p class="panel-intro" id="criteria-intro">Ajuste os limites de cobertura para sua operação.</p><div class="settings-grid" id="settings-grid"></div><p class="formula-note" id="formula-note"></p></div>
          </div>
          <section id="results-section" class="results-section">
            <div class="section-head"><div><span class="section-kicker">RESULTADOS</span><h2>Visão dos itens</h2></div></div>
            <div id="import-context" class="import-context" aria-live="polite"></div>
            <div id="data-quality" class="insight-strip data-quality" role="status" hidden><div><strong id="data-quality-title"></strong><span id="data-quality-detail"></span></div></div>
            <div id="hidden-context" class="insight-strip hidden-context" hidden><span id="hidden-context-text"></span><button id="toggle-hidden-context" class="discreet-button" type="button"></button></div>
            <div id="summary" class="summary-grid"></div>
            <div class="table-panel">
              <div class="table-tools">
                <div class="table-tools-header">
                <div id="search-control" class="search-control"><button id="search-toggle" class="discreet-button search-toggle" type="button" aria-expanded="false" aria-controls="search-expansion">${svgIcon('search')}<span>Pesquisar</span></button><div id="search-expansion" class="search-expansion" inert><div class="search-expansion-inner"><label class="filter-field search-field"><span>Pesquisa</span><span class="search-label">${svgIcon('search')}<input id="search" type="search" placeholder="Buscar código ou descrição do item"></span></label></div></div></div>
                  <div class="filter-actions" role="group" aria-label="Ações da tabela"><label id="hidden-toggle" class="hidden-toggle" hidden><input id="show-hidden" type="checkbox"> Mostrar itens ocultos</label>
                  <button id="density-toggle" class="secondary-button density-toggle" type="button" aria-pressed="false"><span class="density-check">${svgIcon('check')}</span><span>Modo compacto</span></button>
                  <details id="export-menu" class="export-menu"><summary class="primary-button"><span>Exportar</span>${svgIcon('chevronDown')}</summary><div class="export-options"><button type="button" data-export="xlsx">Excel (.xlsx)</button><button type="button" data-export="pdf">PDF (salvar/imprimir)</button><button type="button" data-export="csv">CSV (.csv)</button></div></details></div>
                </div>
                <div class="table-filters">
                  <label class="filter-field"><span>Local</span><select id="location-filter" aria-label="Filtrar local de estoque"><option value="">Todos os locais</option></select></label>
                  <label class="filter-field"><span>Prateleira</span><select id="shelf-filter" aria-label="Filtrar prateleira"><option value="">Todas as prateleiras</option></select></label>
                  <label class="filter-field"><span>Repartição</span><select id="partition-filter" aria-label="Filtrar repartição"><option value="">Todas as repartições</option></select></label>
                  <label class="filter-field"><span>Ação</span><select id="filter" aria-label="Filtrar recomendação"><option value="">Todas as recomendações</option></select></label>

                </div>
              </div>
              <div class="results-counter" role="status" aria-live="polite"><strong id="filtered-count">0 de 0 itens</strong><span>conforme os filtros atuais</span></div>
              <div id="active-filters" class="active-filters" hidden><span id="active-filters-text"></span><button id="clear-filters" class="discreet-button" type="button">Limpar filtros</button></div>
              <div class="table-scroll"><table id="result-table"><caption class="sr-only">Resultados da análise de estoque</caption><thead id="table-head"></thead><tbody id="result-rows"></tbody></table></div>
              <div id="table-footer" class="table-footer"><span id="page-status"></span><label class="page-size-control">Itens por página<select id="page-size"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label><nav id="pagination" class="pagination" aria-label="Páginas de resultados" hidden><button id="page-previous" type="button">Anterior</button><span id="page-label"></span><button id="page-next" type="button">Próxima</button></nav></div>
            </div>
          </section>
        </section>
      </main>
    </div>
    <dialog id="item-panel" class="item-panel" aria-labelledby="item-panel-title"><header class="item-panel-header"><h2 id="item-panel-title">Detalhes do item</h2><button id="item-panel-close" class="discreet-button" type="button" aria-label="Fechar detalhes">${svgIcon('close')}</button></header><div id="item-panel-content" class="item-panel-content"></div></dialog>
    <span id="copy-feedback" class="sr-only" role="status" aria-live="polite"></span>
    <section id="print-report" aria-hidden="true"></section>`;
}
