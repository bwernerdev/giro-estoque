// Consultas ao estado: aba atual, linhas de dados, colunas mapeadas e tipo de análise.
// Não mexem na tela; ficam aqui para que qualquer módulo as use sem depender da configuração.
import { ANALITICO_REQUIRED_KEYS, detectAnalysisMode } from '../analysis.js';
import { selectDataRows } from '../import.js';

export function createSelectors(ui) {
  const { state } = ui;
  function currentSheet() { return state.sheets[state.sheet]; }
  function dataRows() { return selectDataRows(currentSheet().rows, state.mapping, currentSheet().headerRow + 1); }
  function isMapped(key) { return state.mapping[key] >= 0; }
  function currentMode() { return state.mode === 'auto' ? detectAnalysisMode(state.mapping) : state.mode; }
  function isGiroMode() { return currentMode() === 'giro'; }
  function isAnaliticoMode() { return currentMode() === 'analitico'; }
  function requiredKeys() {
    if (isAnaliticoMode()) return ANALITICO_REQUIRED_KEYS;
    if (isGiroMode()) return ['item', 'stockValue', 'consumption'];
    return ['item', 'stock', 'sales'];
  }
  return { currentSheet, dataRows, isMapped, currentMode, isGiroMode, isAnaliticoMode, requiredKeys };
}
