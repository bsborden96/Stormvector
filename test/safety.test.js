const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app(fetch) {
  const elements = new Map();
  const node = () => ({
    textContent: '',
    children: [],
    classList: { add() {}, remove() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
  });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    createElement: node,
    addEventListener() {},
  };
  const storage = new Map();
  const context = vm.createContext({
    document, fetch, URLSearchParams, Date, console,
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(fs.readFileSync('src/app.js', 'utf8'), context);
  return { context, elements, storage, run: (code) => vm.runInContext(code, context) };
}

test('SPC category comes from the official point query, including strongest overlapping polygon', async () => {
  let requested;
  const { run } = app(async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ features: [
      { properties: { label: 'TSTM' } }, { properties: { label: 'ENH' } },
    ] }) };
  });
  const outlook = await run('fetchLiveSpcOutlook({lat:43.634,lon:-88.729})');
  assert.equal(outlook.category, 'Enhanced Risk');
  assert.match(requested.hostname, /weather\.noaa\.gov$/);
  assert.equal(requested.searchParams.get('geometry'), '-88.729,43.634');
});

test('a failed alert refresh retains previous alerts and never repeats a warning interrupt', () => {
  const { run, elements } = app(async () => { throw new Error('offline'); });
  run('place = {name:"Waupun, WI",lat:43.634,lon:-88.729}; broadcastRunning = true');
  run('severeInterrupt = () => { globalThis.interruptCount = (globalThis.interruptCount || 0) + 1 }');
  const alert = '{id:"alert-1",properties:{event:"Tornado Warning",headline:"Take shelter",expires:"2026-09-24T01:00:00Z"}}';
  run(`applyAlerts([${alert}], true)`);
  run(`applyAlerts([${alert}])`);
  run('applyAlerts(null)');
  assert.equal(run('activeAlerts.length'), 1);
  assert.equal(run('globalThis.interruptCount || 0'), 0);
  assert.match(elements.get('briefingStatus').textContent, /refresh failed/);
  run(`applyAlerts([${alert}])`);
  assert.equal(run('globalThis.interruptCount || 0'), 0);
  run(`applyAlerts([${alert.replaceAll('alert-1', 'alert-2')}])`);
  assert.equal(run('globalThis.interruptCount'), 1);
});

test('all referenced element IDs exist in the page', () => {
  const js = fs.readFileSync('src/app.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  for (const [, id] of js.matchAll(/\$\('([^']+)'\)/g)) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`);
  }
});
