const paths = {
  copy: '<rect x="9" y="9" width="11" height="12" rx="2"/><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/>',
  moon: '<path d="M20 15.4A8 8 0 0 1 8.6 4a8 8 0 1 0 11.4 11.4Z"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  arrowRight: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevronDown: '<path d="m7 9 5 5 5-5"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronUp: '<path d="m7 15 5-5 5 5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2"/>',
  zero: '<circle cx="12" cy="12" r="9"/><path d="m7 17 10-10"/>',
  adjust: '<path d="M4 7h10m4 0h2M4 17h2m4 0h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  transfer: '<path d="M5 8h13m-4-4 4 4-4 4M19 16H6m4 4-4-4 4-4"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15.6 15.6 0 0 1-2.6 3.2M6.6 6.7C4.3 8.2 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.4-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
};

export function svgIcon(name, className = 'ui-icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] ?? paths.dot}</svg>`;
}
