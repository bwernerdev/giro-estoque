import { svgIcon } from './icons.js';

const brandIconUrl = new URL('../assets/images/favicon.webp', import.meta.url).href;

export function renderApp() {
  return `
    <div class="shell">
      <div id="progress" class="progress" role="progressbar" aria-label="Andamento da leitura" aria-valuemin="0" aria-valuemax="100" hidden><div id="progress-bar" class="progress-bar"></div></div>
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><img src="${brandIconUrl}" alt="" /></span><span>GIRO<span class="brand-light"> DE ESTOQUE</span></span></div>
        <div id="topbar-file" class="topbar-file" hidden></div>
        <div class="topbar-actions">
          <button id="replace-file" class="topbar-button topbar-data" type="button" title="Trocar arquivo">${svgIcon('upload')}<span>Trocar arquivo</span></button>
          <button id="purchase-file" class="topbar-button topbar-data purchase-file" type="button" hidden>${svgIcon('clock')}<span>Importar SNAC0540</span></button>
          <button id="config-toggle" class="topbar-button topbar-data config-toggle" type="button" aria-controls="config-grid" aria-expanded="false" title="Abrir configuração">${svgIcon('adjust')}<span>Abrir configuração</span></button>
          <button id="install-app" class="topbar-button install-button" type="button" hidden>${svgIcon('download')}<span>Instalar app</span></button>
          <button id="theme-toggle" class="topbar-button theme-toggle" type="button" aria-pressed="false">${svgIcon('moon')}<span>Modo escuro</span></button>
        </div>
      </header>
      <main>
        <section class="hero">
          <div class="eyebrow"><span class="eyebrow-dot"></span> ANÁLISE DE ESTOQUE</div>
          <h1>Entenda o giro<br>de cada <em>item.</em></h1>
          <p>Veja o que fazer com cada item (bloquear, transferir, ajustar ou repor) e quanto valor está parado.</p>
        </section>
        <section class="upload-card" id="upload-card">
          <div class="upload-icon" aria-hidden="true">${svgIcon('upload')}</div>
          <div class="upload-copy">
            <h2>Importar planilhas</h2>
            <p>Anexe cada planilha no seu campo: clique para escolher ou arraste o arquivo.</p>
          </div>
          <div class="attach-fields" role="group" aria-label="Planilhas do processo">
            <label class="attach-field" id="stock-field">
              <span class="attach-head"><span class="attach-icon" aria-hidden="true">${svgIcon('list')}</span><span class="attach-title">Relatório Analítico</span><span class="attach-tag">Obrigatório</span></span>
              <span class="attach-hint">Analítico do estoque (.xlsx ou .csv). Também aceita BBOG6656 ou estoque e vendas.</span>
              <span class="attach-status" id="stock-status" aria-live="polite">Escolha ou arraste o arquivo</span>
              <input id="file-input" type="file" accept=".xlsx,.csv">
            </label>
            <label class="attach-field" id="purchase-field">
              <span class="attach-head"><span class="attach-icon" aria-hidden="true">${svgIcon('clock')}</span><span class="attach-title">SNAC0540</span><span class="attach-tag">Obrigatório</span></span>
              <span class="attach-hint">Follow-up de compras (.csv ou .xlsx), exportado sem mexer nas colunas. O painel do Analítico só abre com ele.</span>
              <span class="attach-status" id="purchase-status" aria-live="polite">Escolha ou arraste o arquivo</span>
              <input id="purchase-input" type="file" accept=".csv,.xlsx">
            </label>
          </div>
          <small class="upload-note">Os dados não saem do seu computador.</small>
        </section>
        <div id="message" role="status" aria-live="polite"></div>
        <section id="loading-skeleton" class="loading-skeleton" aria-hidden="true">
          <div class="skeleton-kpis">${'<span class="skeleton-block skeleton-kpi"></span>'.repeat(3)}</div>
          <div class="skeleton-cards">${'<span class="skeleton-block skeleton-card"></span>'.repeat(6)}</div>
          <div class="skeleton-table"><span class="skeleton-block skeleton-tools"></span>${'<span class="skeleton-block skeleton-line"></span>'.repeat(8)}</div>
        </section>
        <section id="workspace" hidden>
          <div class="workspace">
            <div class="workspace-main">
              <div id="config-grid" class="config-grid" hidden>
                <div class="panel"><h3>Colunas da planilha</h3><p class="panel-intro">Confirme quais colunas contêm os dados de cada item.</p><div id="mapping" class="mapping-grid"></div></div>
                <div class="panel" id="criteria-panel"><h3>Critérios de decisão</h3><p class="panel-intro" id="criteria-intro">Ajuste os limites de cobertura para sua operação.</p><div class="settings-grid" id="settings-grid"></div><p class="formula-note" id="formula-note"></p></div>
              </div>
              <section id="results-section" class="results-section">
                <div id="data-quality" class="insight-strip data-quality" role="status" hidden><div><strong id="data-quality-title"></strong><span id="data-quality-detail"></span></div></div>
                
                <div id="overview" class="overview">
                  <div class="overview-top">
                    <div class="kpi-row">
                      <div id="total-value" class="total-value money-kpi" hidden></div>
                      <div id="idle-value" class="money-kpi idle" hidden></div>
                      <div id="obsolete-value" class="money-kpi obsolete" hidden></div>
                    </div>
                    <button id="summary-toggle" class="discreet-button summary-toggle" type="button" aria-controls="overview-body" aria-expanded="true">${svgIcon('chevronUp')}<span>Recolher resumo</span></button>
                  </div>
                  <div id="overview-body" class="overview-body">
                    <div id="summary" class="summary-grid" role="group" aria-label="Filtrar por ação"></div>
                    <figure id="aging-chart" class="value-chart aging-chart" hidden>
                      <figcaption><strong>Tempo sem requisição</strong><span>Valor do estoque com saldo por faixa de dias · clique para filtrar</span></figcaption>
                      <div id="aging-chart-bars" class="chart-bars" role="group" aria-label="Filtrar por tempo sem requisição"></div>
                    </figure>
                  </div>
                </div>
                <div class="table-panel">
                  <div class="table-tools">
                    <div class="table-tools-header">
                      <div id="search-control" class="search-control"><button id="search-toggle" class="discreet-button search-toggle" type="button" aria-expanded="false" aria-controls="search-expansion">${svgIcon('search')}<span>Pesquisar</span></button><div id="search-expansion" class="search-expansion" inert><div class="search-expansion-inner"><label class="filter-field search-field"><span>Pesquisa</span><span class="search-label">${svgIcon('search')}<input id="search" type="search" placeholder="Buscar item ou código"></span></label></div></div></div>
                      <div class="table-filters" role="group" aria-label="Filtros">
                        <label class="filter-field"><span>Local</span><select id="location-filter" aria-label="Filtrar local de estoque"><option value="">Todos</option></select></label>
                        <label class="filter-field"><span>Prateleira</span><select id="shelf-filter" aria-label="Filtrar prateleira"><option value="">Todas</option></select></label>
                        <label class="filter-field"><span>Repartição</span><select id="partition-filter" aria-label="Filtrar repartição"><option value="">Todas</option></select></label>
                        <label class="filter-field filter-action"><span>Ação</span><select id="filter" aria-label="Filtrar recomendação"><option value="">Todas as recomendações</option></select></label>
                      </div>
                      <div class="filter-actions" role="group" aria-label="Ações da tabela">
                        <details id="view-menu" class="export-menu view-menu"><summary class="secondary-button"><span>Exibir</span><span id="view-dot" class="menu-dot" title="Há opções de exibição ligadas" hidden></span>${svgIcon('chevronDown')}</summary><div class="export-options view-options">
                          <button id="density-toggle" class="view-toggle density-toggle" type="button" aria-pressed="false"><span class="density-check">${svgIcon('check')}</span><span>Modo compacto</span></button>
                          <button id="stripe-toggle" class="view-toggle" type="button" aria-pressed="false"><span class="density-check">${svgIcon('check')}</span><span>Zebrado</span></button>
                          <button id="group-toggle" class="view-toggle" type="button" aria-pressed="false"><span class="density-check">${svgIcon('check')}</span><span>Agrupar por ação</span></button>
                          <label id="hidden-toggle" class="hidden-toggle" hidden><input id="show-hidden" type="checkbox"> <span id="hidden-toggle-text">Mostrar itens ocultos</span></label>
                        </div></details>
                        <details id="export-menu" class="export-menu"><summary class="primary-button"><span>Exportar</span>${svgIcon('chevronDown')}</summary><div class="export-options"><button type="button" data-export="xlsx">Excel (.xlsx)</button><button type="button" data-export="pdf">PDF da tabela</button><button type="button" data-export="summary">PDF de resumo (1 página)</button><button type="button" data-export="csv">CSV (.csv)</button></div></details>
                      </div>
                    </div>
                  </div>
                  <div class="results-bar"><div class="results-counter" role="status" aria-live="polite"><strong id="filtered-count">0 de 0 itens</strong><span>conforme os filtros atuais</span></div><button id="hidden-chip" class="filter-chip" type="button" hidden><span id="hidden-chip-text">Itens ocultos incluídos</span>${svgIcon('close')}<span class="sr-only">: ocultar de novo</span></button></div>
                  <div id="active-filters" class="active-filters" hidden><span id="active-filters-text"></span><button id="clear-filters" class="discreet-button" type="button">Limpar filtros</button></div>
                  <div class="table-scroll"><table id="result-table"><caption class="sr-only">Resultados da análise de estoque</caption><thead id="table-head"></thead><tbody id="result-rows"></tbody></table></div>
                  <div id="table-footer" class="table-footer"><span id="page-status"></span><label class="page-size-control">Itens por página<select id="page-size"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label><nav id="pagination" class="pagination" aria-label="Páginas de resultados" hidden><button id="page-previous" type="button">Anterior</button><span id="page-label"></span><button id="page-next" type="button">Próxima</button></nav></div>
                </div>
              </section>
            </div>
            <aside id="detail-dock" class="detail-dock" aria-label="Detalhes do item">
              <header class="item-panel-header"><h2>Detalhes do item</h2><div class="item-panel-nav"><button id="dock-prev" class="discreet-button" type="button" aria-label="Item anterior" title="Item anterior (↑)" disabled>${svgIcon('chevronUp')}</button><button id="dock-next" class="discreet-button" type="button" aria-label="Próximo item" title="Próximo item (↓)" disabled>${svgIcon('chevronDown')}</button><button id="dock-close" class="discreet-button" type="button" aria-label="Limpar seleção" title="Limpar seleção (Esc)" disabled>${svgIcon('close')}</button></div></header>
              <div id="detail-dock-content" class="item-panel-content"><p class="dock-empty">Clique em uma linha da tabela para ver os detalhes. Use as setas ↑ e ↓ para navegar entre os itens.</p></div>
            </aside>
          </div>
        </section>
      </main>
    </div>
    <dialog id="item-panel" class="item-panel" aria-labelledby="item-panel-title"><header class="item-panel-header"><h2 id="item-panel-title">Detalhes do item</h2><div class="item-panel-nav"><button id="item-panel-prev" class="discreet-button" type="button" aria-label="Item anterior" title="Item anterior (↑)">${svgIcon('chevronUp')}</button><button id="item-panel-next" class="discreet-button" type="button" aria-label="Próximo item" title="Próximo item (↓)">${svgIcon('chevronDown')}</button><button id="item-panel-close" class="discreet-button" type="button" aria-label="Fechar detalhes">${svgIcon('close')}</button></div></header><div id="item-panel-content" class="item-panel-content"></div></dialog>
    <span id="copy-feedback" class="sr-only" role="status" aria-live="polite"></span>
    <section id="print-report" aria-hidden="true"></section>`;
}
