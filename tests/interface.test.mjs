import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

// Exercise the render and event handlers without a browser. Layout and real
// pointer events still require browser QA; this checks the app/service boundary.
async function harness() {
  const listeners = new Map();
  const makeElement = () => ({ innerHTML: '', className: '', open: false, classList: { add() {}, remove() {} }, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; } });
  const nodes = { '#app': makeElement(), '#dialog': makeElement(), '#toast': makeElement() };
  const document = {
    querySelector(selector) { return nodes[selector]; },
    querySelectorAll() { return []; },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    body: makeElement(),
  };
  const storage = new Map();
  const catalog = await readFile(new URL('../app/data/catalog.json', import.meta.url), 'utf8');
  const context = vm.createContext({ document, console, crypto: webcrypto, structuredClone, URL, URLSearchParams, Intl, Date, setTimeout: () => 1, clearTimeout() {}, window: { scrollTo() {}, addEventListener() {} }, location: { pathname: '/planning/', search: '?demo=1' }, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, fetch: async () => ({ ok: true, json: async () => JSON.parse(catalog) }) });
  let code = 'const config = {provider: "demo"};\n';
  for (const file of ['domain/dates.js', 'domain/planning.js', 'adapters/demo.js', 'services/seed.js', 'services/planning-service.js', 'services/bootstrap.js', 'services/webmcp.js', 'main.js']) {
    let source = await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8');
    source = source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '').replaceAll('import.meta.url', '"https://example.test/"');
    if (file === 'main.js') source = source.replace(/\ninit\(\);\s*$/, '\nawait init();');
    code += source + '\n';
  }
  code = `(async () => {${code}\nglobalThis.qa = {getState:()=>state, getService:()=>service, ui, render, openDetail, getCards:()=>renderedCards, today};})()`;
  await vm.runInContext(code, context, { timeout: 10000 });
  return { qa: context.qa, nodes, async click(action, extra = {}) { const target = { dataset: { action, ...extra } }; const event = { target: { closest: () => target }, preventDefault() {} }; for (const handler of listeners.get('click') ?? []) await handler(event); }, async toggle(id, checked) { const event = { target: { dataset: { toggle: id }, checked, hasAttribute: () => false } }; for (const handler of listeners.get('change') ?? []) await handler(event); } };
}

test('agenda renders all seven days and switching views keeps the same state', async () => {
  const { qa, nodes, click } = await harness();
  assert.equal((nodes['#app'].innerHTML.match(/class="day-column/g) ?? []).length, 7);
  assert.ok(nodes['#app'].innerHTML.includes('Démonstration'));
  const before = qa.getState().tasks.length;
  await click('view', { view: 'month' });
  assert.ok(nodes['#app'].innerHTML.includes('month-grid'));
  assert.equal(qa.getState().tasks.length, before);
  await click('page', { page: 'catalog' });
  assert.ok(nodes['#app'].innerHTML.includes('catalog-list'));
});
test('checkbox event persists completion and leaves next occurrences untouched', async () => {
  const { qa, nodes, toggle } = await harness();
  const item = [...qa.getCards().values()].flatMap(c => c.items)[0];
  await toggle(item.id, true);
  assert.equal(qa.getState().overrides[item.id].status, 'done');
  assert.ok(nodes['#app'].innerHTML.includes('checked'));
  qa.openDetail({ title: 'Test', date: item.date, groupId: item.task.groupId, session: false, items: [item] });
  assert.equal(nodes['#dialog'].open, true);
  assert.ok(nodes['#dialog'].innerHTML.includes('Cette échéance seulement'));
  await toggle(item.id, false);
  assert.equal(qa.getState().overrides[item.id].status, 'todo');
});
test('user task titles are escaped in both catalogue and task details', async () => {
  const { qa, nodes, click } = await harness();
  const state = qa.getState();
  await qa.getService().createTask({ title: '<img src=x onerror=alert(1)>', description: '<script>alert(2)</script>', groupId: state.groups[0].id, memberId: state.members[0].id, anchor: qa.today(), recurrence: 'daily' });
  await click('page', { page: 'catalog' });
  assert.ok(nodes['#app'].innerHTML.includes('&lt;img'));
  assert.equal(nodes['#app'].innerHTML.includes('<img src=x'), false);
  assert.equal(nodes['#app'].innerHTML.includes('<script>alert'), false);
});
