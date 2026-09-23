const brandIconUrl = new URL('../assets/images/favicon.webp', import.meta.url).href;

export function renderApp() {
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><img src="${brandIconUrl}" alt="" /></span><span>CONTROLE<span class="brand-light"> DE ESTOQUE</span></span></div>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-pressed="false">☾ Modo escuro</button>
      </header>
      <main>
        <section class="hero">
          <div class="eyebrow"><span class="eyebrow-dot"></span> ANÁLISE DE MATERIAIS</div>
          <h1>Entenda o giro<br>de cada <em>item.</em></h1>
          <p>Consulte quantidades, limites, classificação e ações por item.</p>
        </section>
        <section class="upload-card" id="upload-card">
          <div class="upload-icon">⇧</div>
          <div><h2>Importar planilha</h2><p>Arraste um arquivo aqui ou selecione no computador</p><small>Excel .xlsx ou CSV · análise local no navegador</small></div>
          <label class="primary-button" for="file-input" role="button" tabindex="0">Selecionar arquivo <span>→</span></label>
          <input id="file-input" type="file" accept=".xlsx,.csv" hidden>
        </section>
        <div id="message" role="status" aria-live="polite"></div>
        <section id="workspace" hidden>
          <div class="section-head">
            <div><h2>Preparar análise</h2></div>
            <div class="config-actions"><button id="config-toggle" class="secondary-button config-toggle" type="button" aria-controls="config-grid" aria-expanded="false">Abrir configuração ▾</button><span id="file-name" class="file-pill"></span></div>
          </div>
          <div id="config-grid" class="config-grid" hidden>
            <div class="panel"><h3>Colunas da planilha</h3><p class="panel-intro">Confirme quais colunas contêm os dados de cada item.</p><div id="mapping" class="mapping-grid"></div></div>
            <div class="panel" id="criteria-panel"><h3>Critérios de decisão</h3><p class="panel-intro" id="criteria-intro">Ajuste os limites de cobertura para sua operação.</p><div class="settings-grid" id="settings-grid"></div><p class="formula-note" id="formula-note"></p></div>
          </div>
          <section id="results-section" class="results-section">
            <div class="section-head"><div><span class="section-kicker">RESULTADOS</span><h2>Visão dos itens</h2></div></div>
            <div id="summary" class="summary-grid"></div>
            <div class="table-panel">
              <div class="table-tools">
                <label class="search-label"><span aria-hidden="true">⌕</span><span class="sr-only">Buscar item ou código</span><input id="search" type="search" placeholder="Buscar item ou código"></label>
                <div class="table-filters">
                  <select id="location-filter" aria-label="Filtrar local de estoque"><option value="">Todos os locais</option></select>
                  <select id="filter" aria-label="Filtrar recomendação"><option value="">Todas as recomendações</option></select>
                  <label id="hidden-toggle" class="hidden-toggle" hidden><input id="show-hidden" type="checkbox"> Mostrar itens ocultos</label>
                  <button id="density-toggle" class="secondary-button density-toggle" type="button" aria-pressed="false">Modo compacto</button>
                  <details id="export-menu" class="export-menu"><summary class="secondary-button">Exportar ▾</summary><div class="export-options"><button type="button" data-export="xlsx">Excel (.xlsx)</button><button type="button" data-export="pdf">PDF (salvar/imprimir)</button><button type="button" data-export="csv">CSV (.csv)</button></div></details>
                </div>
              </div>
              <div id="active-filters" class="active-filters" hidden><span id="active-filters-text"></span><button id="clear-filters" type="button">Limpar filtros</button></div>
              <div class="table-scroll"><table id="result-table"><caption class="sr-only">Resultados da análise de estoque</caption><thead id="table-head"></thead><tbody id="result-rows"></tbody></table></div>
              <div id="table-footer" class="table-footer"><span id="page-status"></span><nav id="pagination" class="pagination" aria-label="Páginas de resultados" hidden><button id="page-previous" type="button">Anterior</button><span id="page-label"></span><button id="page-next" type="button">Próxima</button></nav></div>
            </div>
          </section>
        </section>
      </main>
    </div>
    <section id="print-report" aria-hidden="true"></section>`;
}
