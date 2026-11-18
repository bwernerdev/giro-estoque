// Contraste WCAG dos tokens (src/styles/tokens.css), nos dois temas.
// Texto sobre fundo: 4,5:1 (1.4.3). Borda de campo (input/select) sobre a superfície: 3:1 (1.4.11).
// O ../dashboard tem o mesmo teste (tests/contraste.test.js) com os mesmos limites:
// mudou uma cor compartilhada aqui, confira lá também.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function block(selector) {
  const start = css.indexOf('{', css.indexOf(selector));
  const end = css.indexOf('\n}', start);
  const pairs = [...css.slice(start, end).matchAll(/--([\w-]+):\s*#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)];
  return Object.fromEntries(pairs.map(([, name, hex]) => [name, hex.length === 3 ? [...hex].map(c => c + c).join('') : hex]));
}

function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const light = block(':root {');
const themes = { claro: light, escuro: { ...light, ...block('html[data-theme="dark"] {') } };

const text = [
  ['text', 'surface'], ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-faint', 'surface'],
  ['accent-text', 'surface'], ['accent-ink', 'accent'], ['danger-fg', 'danger-bg'],
  ['warning-fg', 'warning-bg'], ['success-fg', 'success-bg'], ['info-fg', 'info-bg'], ['neutral-fg', 'neutral-bg'],
];
const fieldBorder = [['control-border', 'surface'], ['control-border', 'surface-2'], ['control-border', 'bg']];

for (const [theme, t] of Object.entries(themes)) {
  test(`contraste no tema ${theme}: texto >= 4,5:1 e borda de campo >= 3:1`, () => {
    for (const [pairs, minimum] of [[text, 4.5], [fieldBorder, 3]]) {
      for (const [fg, bg] of pairs) {
        assert.ok(t[fg] && t[bg], `token ausente: --${fg} ou --${bg}`);
        const value = contrast(t[fg], t[bg]);
        assert.ok(value >= minimum, `--${fg} sobre --${bg}: ${value.toFixed(2)}:1 (mínimo ${minimum}:1)`);
      }
    }
  });
}
