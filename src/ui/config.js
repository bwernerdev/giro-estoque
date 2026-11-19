// Configuração: aba, mapeamento das colunas, tipo de análise e critérios.
import { fields, suggestMapping } from '../analysis.js';
import { svgIcon } from '../icons.js';
import { escapeHtml } from './markup.js';

export function createConfig(ui) {
  const { state, el } = ui;
  // Consultas ao estado vêm de selectors.js (montado antes).
  const { currentSheet, requiredKeys, isAnaliticoMode, isGiroMode } = ui;
  function setConfigExpanded(expanded) {
    el('#config-grid').hidden = !expanded;
    el('#config-toggle').setAttribute('aria-expanded', String(expanded));
    el('#config-toggle').innerHTML = `${svgIcon('adjust')}<span>${expanded ? 'Fechar configuração' : 'Abrir configuração'}</span>`;
    el('#config-toggle').title = expanded ? 'Fechar configuração' : 'Abrir configuração';
  }
  function renderSettings() {
    el('#criteria-panel').hidden = isAnaliticoMode();
    if (isAnaliticoMode()) return;
    const giro = isGiroMode();
    const settings = state.settings[giro ? 'giro' : 'generic'];
    el('#criteria-intro').textContent = giro ? 'Limites sugeridos para decidir o que fazer com o giro. Ajuste conforme sua política de estoque.' : 'Limites provisórios para estoque e vendas dos últimos 30 dias.';
    el('#settings-grid').innerHTML = giro
      ? '<label>Cobertura curta até (dias)<input id="short-days" type="number" min="0" step="1" value="30"></label><label>Reduzir compras acima de (dias)<input id="excess-days" type="number" min="1" step="1" value="90"></label><label>Avaliar transferência acima de (dias)<input id="long-days" type="number" min="1" step="1" value="365"></label>'
      : '<label>Dias de segurança<input id="safety-days" type="number" min="0" step="1" value="7"></label><label>Excesso após (dias)<input id="excess-days" type="number" min="1" step="1" value="90"></label><label>Prazo padrão (dias)<input id="default-lead" type="number" min="0" step="1" value="7"></label>';
    el('#formula-note').textContent = giro ? 'Giro em dias = valor do estoque ÷ valor do consumo × 30. Sem consumo, o giro é indefinido.' : 'Média diária = vendas ÷ 30 · Ponto de reposição = média diária × (prazo + segurança)';
    el('#settings-grid').querySelectorAll('input').forEach(input => {
      const key = input.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      input.value = settings[key];
      input.addEventListener('input', () => { settings[key] = input.value; ui.refresh(); });
    });
  }

  let optionalFieldsOpen = false;
  function renderMapping() {
    const headers = currentSheet().rows[currentSheet().headerRow] || [];
    const required = new Set(requiredKeys());
    const fieldLabel = field => `<span class="field-label">${field.label}${required.has(field.key) ? ' <span class="required" title="Obrigatório">*</span>' : ''}</span>`;
    const fieldSelect = field => `<label>${fieldLabel(field)}<select data-map="${field.key}"><option value="-1">Não selecionar</option>${headers.map((header, i) => `<option value="${i}" ${state.mapping[field.key] === i ? 'selected' : ''}>${escapeHtml(header || `Coluna ${i + 1}`)}</option>`).join('')}</select></label>`;
    const optional = fields.filter(field => !required.has(field.key));
    el('#mapping').innerHTML = `<label class="sheet-select"><span class="field-label">Aba</span><select id="sheet-select">${state.sheets.map((sheet, i) => `<option value="${i}" ${i === state.sheet ? 'selected' : ''}>${escapeHtml(sheet.name)}</option>`).join('')}</select></label>`
      + fields.filter(field => required.has(field.key)).map(fieldSelect).join('')
      + `<details class="optional-fields"${optionalFieldsOpen ? ' open' : ''}><summary>Campos opcionais (${optional.length})</summary><div class="mapping-grid">${optional.map(fieldSelect).join('')}</div></details>`;
    el('#mapping').insertAdjacentHTML('afterbegin', '<label><span class="field-label">Tipo de análise</span><select id="analysis-mode"><option value="auto">Automático</option><option value="generic">Estoque e vendas</option><option value="giro">Giro por valor de consumo</option><option value="analitico">Analítico</option></select></label><label><span class="field-label">Formato dos números em texto</span><select id="number-format"><option value="pt-BR">Brasileiro: 1.234,56</option><option value="en-US">Internacional: 1,234.56</option></select></label>');
    el('.optional-fields').addEventListener('toggle', event => { optionalFieldsOpen = event.target.open; });
    el('#analysis-mode').value = state.mode;
    el('#number-format').value = state.numberFormat;
    el('#analysis-mode').addEventListener('change', event => {
      state.mode = event.target.value;
      state.page = 1;
      state.hiddenOnly = false;
      renderMapping(); renderSettings(); ui.refresh();
    });
    el('#number-format').addEventListener('change', event => { state.numberFormat = event.target.value; ui.refresh(); });
    el('#sheet-select').addEventListener('change', event => { state.sheet = Number(event.target.value); state.mapping = suggestMapping(currentSheet().rows[currentSheet().headerRow] || []); ui.renderImportContext(); renderMapping(); renderSettings(); ui.refresh(); });
    el('#mapping').querySelectorAll('[data-map]').forEach(select => select.addEventListener('change', () => {
      state.mapping[select.dataset.map] = Number(select.value);
      renderMapping();
      renderSettings();
      ui.refresh();
    }));
  }
  el('#config-toggle').addEventListener('click', () => setConfigExpanded(el('#config-grid').hidden));
  return { setConfigExpanded, renderSettings, renderMapping };
}
