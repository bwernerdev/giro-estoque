// Contrato entre os módulos de src/ui/: cada createX(ui) devolve só o que outro módulo usa
// como ui.nome, e todo ui.nome usado existe em algum módulo (ou vem do contexto/main.js).
// A leitura é estática (texto das fontes), sem montar o app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const uiFiles = readdirSync(new URL('ui/', root)).filter(name => name.endsWith('.js')).map(name => `ui/${name}`);
// Comentários saem antes da leitura (falam de ui.x sem ser chamada).
const withoutComments = text => text.replace(/(^|\s)\/\/.*$/gm, '$1');
const sources = Object.fromEntries([...uiFiles, 'main.js'].map(path => [path, withoutComments(read(path))]));

// Nomes que main.js acrescenta a ui depois do contexto (Object.assign(ui, { ... })).
const mainExtras = (sources['main.js'].match(/Object\.assign\(ui, \{ ([^}]*) \}\)/)?.[1] || '')
  .split(',').map(name => name.trim()).filter(Boolean);

function usedNames(text) {
  const names = new Set([...text.matchAll(/\bui\.(\w+)/g)].map(match => match[1]));
  for (const match of text.matchAll(/const \{([^}]*)\} = ui;/g)) {
    match[1].split(',').map(name => name.trim()).filter(Boolean).forEach(name => names.add(name));
  }
  return names;
}

// Módulos com createX(ui): o objeto devolvido no fim da função.
const modules = Object.entries(sources).flatMap(([path, text]) => {
  const create = text.match(/export function (create\w+)\(/)?.[1];
  if (!create || path === 'main.js') return [];
  const returned = text.match(/ {2}return \{ ([^}]*) \};\n\}\s*$/);
  assert.ok(returned, `${path}: ${create} deve terminar com return { ... };`);
  return [{ path, create, names: returned[1].split(',').map(name => name.trim()) }];
});

test('main.js monta todos os módulos de src/ui/', () => {
  assert.ok(mainExtras.length > 0, 'main.js deve acrescentar panelMode, panelSource e inFrame');
  const mounted = sources['main.js'].match(/for \(const create of \[([^\]]*)\]\)/)?.[1] || '';
  for (const { create } of modules.filter(module => module.create !== 'createContext')) {
    assert.ok(mounted.includes(create), `main.js não monta ${create}`);
  }
});

test('nenhum nome é devolvido por dois módulos', () => {
  const owner = new Map();
  for (const { path, names } of modules) {
    for (const name of names) {
      assert.ok(!owner.has(name), `${name} devolvido por ${owner.get(name)} e ${path}`);
      owner.set(name, path);
    }
  }
});

test('cada módulo devolve só o que outro arquivo usa', () => {
  for (const { path, names } of modules) {
    const others = new Set(Object.entries(sources).filter(([other]) => other !== path).flatMap(([, text]) => [...usedNames(text)]));
    const unused = names.filter(name => !others.has(name));
    assert.deepEqual(unused, [], `${path} devolve nomes que nenhum outro arquivo usa; deixe-os internos`);
  }
});

test('todo ui.nome usado existe em algum módulo', () => {
  const provided = new Set([...modules.flatMap(module => module.names), ...mainExtras]);
  for (const [path, text] of Object.entries(sources)) {
    const missing = [...usedNames(text)].filter(name => !provided.has(name));
    assert.deepEqual(missing, [], `${path} usa ui.${missing[0]}, que nenhum módulo devolve`);
  }
});
