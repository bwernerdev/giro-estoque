import { writeFile } from 'node:fs/promises';

const targets = await (await fetch('http://127.0.0.1:9225/json')).json();
const target = targets.find(item => item.type === 'page' && item.url.startsWith('http://127.0.0.1:4173'));
if (!target) throw new Error('Página de teste não encontrada.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, method } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${method}: ${message.error.message}`));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(item => item.value ?? item.description).join(' '));
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject, method });
  socket.send(JSON.stringify({ id, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
await new Promise(resolve => setTimeout(resolve, 1500));
const inputObject = await send('Runtime.evaluate', { expression: 'document.querySelector("#file-input")' });
if (!inputObject.result.objectId) {
  const diagnostic = await send('Runtime.evaluate', { expression: 'JSON.stringify({url: location.href, body: document.body.innerHTML, scripts: [...document.scripts].map(script => script.src)})', returnByValue: true });
  throw new Error(`Input não encontrado: ${diagnostic.result.value}; erros: ${JSON.stringify(errors)}`);
}
const input = await send('DOM.describeNode', { objectId: inputObject.result.objectId });
await send('DOM.setFileInputFiles', { backendNodeId: input.node.backendNodeId, files: ['C:/Users/bmwerner/Downloads/PLANILHA.xlsx'] });
await new Promise(resolve => setTimeout(resolve, 3000));
const evaluation = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    workspaceVisible: !document.querySelector('#workspace').hidden,
    summaryCards: document.querySelectorAll('.summary-card').length,
    tableRows: document.querySelectorAll('#result-rows tr').length,
    pageStatus: document.querySelector('#page-status').textContent,
    message: document.querySelector('#message').textContent,
    itemMapping: document.querySelector('[data-map="item"] option:checked')?.textContent,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  })`,
  returnByValue: true,
});
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('review-final.png', Buffer.from(screenshot.data, 'base64'));
console.log(evaluation.result.value);
console.log(JSON.stringify({ errors }));
socket.close();
