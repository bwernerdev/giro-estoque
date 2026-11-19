// Regras de negócio, divididas em src/analysis/ (ver o README da pasta). Este arquivo só
// reexporta, para que quem importa ./analysis.js não precise saber em que parte cada regra está.
export * from './analysis/fields.js';
export * from './analysis/numbers.js';
export * from './analysis/generic.js';
export * from './analysis/giro.js';
export * from './analysis/analitico.js';
export * from './analysis/purchase-rules.js';
export * from './analysis/indicators.js';
