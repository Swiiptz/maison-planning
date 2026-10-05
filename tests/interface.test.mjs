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
  for (const file of ['domain/dates.js', 'domain/planning.js', 'domain/statistics.js', 'adapters/demo.js', 'services/seed.js', 'services/planning-service.js', 'services/bootstrap.js', 'services/webmcp.js', 'main.js']) {
    let source = (await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
    source = source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '').replaceAll('import.meta.url', '"https://example.test/"');
    if (file === 'main.js') source = source.replace(/\ninit\(\);\s*$/, '\nawait init();');
    code += source + '\n';
  }
  code = `(async () => {${code}\nglobalThis.qa = {getState:()=>state, getService:()=>service, getRuntime:()=>runtime, ui, render, openDetail, moveCard, enhanceSelects, getCards:()=>renderedCards, today, addDays, weekStart, occurrences, reorganizationPreview};})()`;
  await vm.runInContext(code, context, { timeout: 10000 });
  return { qa: context.qa, nodes, document, window: context.window, context, async submitForm(id, values, dataset={}) { context.FormData = class { get(key) { return values[key] ?? ''; } getAll(key) { return values[key] ?? []; } }; for (const handler of listeners.get('submit') ?? []) await handler({preventDefault(){},target:{id,dataset,reportValidity:()=>true}}); }, async input(name, value) { for (const handler of listeners.get('input') ?? []) await handler({target: {name, value, dataset: {}}}); }, async submitTask(id, values) { context.FormData = class { get(key) { return values[key] ?? ''; } getAll(key) { return values[key] ?? []; } }; const event = { preventDefault() {}, target: { id: 'task-form', dataset: { id }, reportValidity: () => true } }; for (const handler of listeners.get('submit') ?? []) await handler(event); }, async click(action, extra = {}) { const target = { dataset: { action, ...extra } }; const event = { target: { closest: () => target }, preventDefault() {} }; for (const handler of listeners.get('click') ?? []) await handler(event); }, async toggle(id, checked, session = false) { const event = { target: { dataset: session ? { toggleSession: id } : { toggle: id }, checked, hasAttribute: () => false } }; for (const handler of listeners.get('change') ?? []) await handler(event); } };
}

test('agenda renders all seven days and switching views keeps the same state', async () => {
  const { qa, nodes, click } = await harness();
  assert.equal((nodes['#app'].innerHTML.match(/class="day-column/g) ?? []).length, 7);
  assert.equal(nodes['#app'].innerHTML.includes('demo-banner'), false);
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

test('move warning allows cancel, explicit merge and complete undo', async () => {
  const { qa, nodes, click } = await harness();
  const source = [...qa.getCards().values()].flatMap(card => card.items).find(item => item.task.recurrence === 'daily');
  assert.ok(source);
  const date = qa.addDays(source.date, 1);
  const card = { title: source.task.title, items: [source] };
  const revision = qa.getState().revision;
  await qa.moveCard(card, date);
  assert.equal(nodes['#dialog'].open, true);
  assert.ok(nodes['#dialog'].innerHTML.includes('Attention'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Regrouper'));
  assert.equal(qa.getState().revision, revision);
  await click('close');
  assert.equal(qa.getState().revision, revision);
  await qa.moveCard(card, date);
  await click('confirm-merge');
  assert.equal(nodes['#dialog'].open, false);
  assert.equal(qa.occurrences(qa.getState(), date, date).filter(o => o.taskId === source.taskId).length, 1);
  assert.ok(qa.getState().overrides[source.id].mergedInto);
  await click('undo');
  assert.equal(qa.getState().overrides[source.id], undefined);
  assert.equal(qa.occurrences(qa.getState(), source.date, date).filter(o => o.taskId === source.taskId).length, 2);
});

test('completed session is crossed out in its detail and month view', async () => {
  const { qa, nodes, click } = await harness();
  const card = [...qa.getCards().values()].find(c => c.session && c.items.length > 1);
  assert.ok(card);
  await qa.getService().update(card.items, { status: 'done' });
  qa.openDetail(card);
  assert.ok(nodes['#dialog'].innerHTML.includes('id="dialog-title" class="checked-text"'));
  assert.ok(nodes['#app'].innerHTML.includes('Terminée ·'));
  await click('close');
  await click('view', { view: 'month' });
  assert.match(nodes['#app'].innerHTML, /class="month-task completed"/);
});

test('optional subtask editor is available without forcing a recurrence', async () => {
  const { qa, nodes, click } = await harness();
  const task = qa.getState().tasks.find(t => !t.recurrence);
  await click('edit-task', { id: task.id });
  assert.ok(nodes['#dialog'].innerHTML.includes('id="subtask-editor"'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Ajouter une étape'));
  assert.ok(nodes['#dialog'].innerHTML.includes('value="" selected>À configurer'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Cocher cette liste ne termine pas la tâche principale'));
});

test('session checkbox completes its actions and leaves future dates and existing completion unchanged', async () => {
  const { qa, toggle } = await harness();
  const card = [...qa.getCards().values()].find(c => c.session && c.items.length > 1);
  const first = card.items[0];
  await qa.getService().update([first], { status: 'done' });
  const completedAt = qa.getState().overrides[first.id].completedAt;
  await toggle(card.id, true, true);
  for (const item of card.items) assert.equal(qa.getState().overrides[item.id].status, 'done');
  assert.equal(qa.getState().overrides[first.id].completedAt, completedAt);
  const nextDate = qa.addDays(card.date, 1);
  assert.ok(qa.occurrences(qa.getState(), nextDate, nextDate).every(item => item.status === 'todo'));
  await toggle(card.id, false, true);
  for (const item of card.items) assert.equal(qa.getState().overrides[item.id].status, 'todo');
});

test('custom select supports keyboard choice and Escape without changing the underlying value', async () => {
  const { qa, document, window, context } = await harness();
  class Element {
    constructor() { this.attrs = new Map(); this.events = new Map(); this.children = []; this.style = {}; this.dataset = {}; this.classList = { add() {}, toggle() {} }; }
    setAttribute(key, value) { this.attrs.set(key, value); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); }
    addEventListener(key, fn) { this.events.set(key, fn); }
    append(child) { this.children.push(child); }
    before() {}
    remove() { this.removed = true; }
    contains(element) { return element === this; }
    focus() {}
    scrollIntoView() {}
    getBoundingClientRect() { return { left: 40, top: 80, bottom: 120, width: 180 }; }
    dispatchEvent(event) { this.events.get(event.type)?.(event); }
  }
  document.createElement = () => new Element();
  document.body.append = () => {};
  window.innerWidth = 800; window.innerHeight = 600;
  context.Event = class { constructor(type) { this.type = type; } };
  const select = new Element();
  select.options = [{ textContent: 'Tous', value: '', selected: true }, { textContent: 'Chaque jour', value: 'daily' }];
  select.selectedIndex = 0; select.dataset.filter = 'frequency';
  Object.defineProperty(select, 'selectedOptions', { get: () => [select.options[select.selectedIndex]] });
  let wrapper;
  select.before = element => { wrapper = element; };
  const changes = [];
  select.addEventListener('change', () => changes.push(select.selectedIndex));
  // Native change listeners are normally cumulative; preserve the test listener.
  const add = select.addEventListener.bind(select);
  select.addEventListener = (key, fn) => { const previous = select.events.get(key); add(key, event => { previous?.(event); fn(event); }); };
  qa.enhanceSelects({ querySelectorAll: () => [select] });
  const button = wrapper.children[1];
  assert.equal(button.getAttribute('role'), 'combobox');
  const key = value => button.events.get('keydown')({ key: value, preventDefault() {}, stopPropagation() {} });
  key('ArrowDown');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  key('Enter');
  assert.equal(select.selectedIndex, 1);
  assert.deepEqual(changes, [1]);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  key('ArrowUp'); key('Escape');
  assert.equal(select.selectedIndex, 1);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('subtask row reordering and rename preserve identities and save optional duration', async () => {
  const { qa, nodes, click, submitTask } = await harness();
  const original = qa.getState().tasks.find(task => !task.recurrence);
  await qa.getService().editTask(original.id, { subtasks: [{ id: 'first', title: 'Chiffons' }, { id: 'second', title: 'Produit' }] });
  const task = qa.getState().tasks.find(task => task.id === original.id);
  await click('edit-task', { id: task.id });
  const editor = { innerHTML: '', querySelector: () => ({ focus() {} }) };
  nodes['#dialog'].querySelector = () => editor;
  await click('subtask-down', { index: '0' });
  assert.ok(editor.innerHTML.indexOf('value="Produit"') < editor.innerHTML.indexOf('value="Chiffons"'));
  await submitTask(task.id, { title: task.title, groupId: task.groupId, memberId: task.memberId, recurrence: '', anchor: '', description: '', estimatedMinutes: '12', subtaskTitle: ['Produit doux', 'Chiffons'] });
  const saved = qa.getState().tasks.find(t => t.id === task.id);
  assert.deepEqual(saved.subtasks.map(s => s.id), ['second', 'first']);
  assert.equal(saved.subtasks[0].title, 'Produit doux');
  assert.equal(saved.estimatedMinutes, 12);
  assert.equal(saved.recurrence, null);
});

test('navigation and calendar panels collapse without losing task data', async () => {
  const { qa, nodes, click } = await harness();
  const count = qa.getState().tasks.length;
  await click('toggle-sidebar');
  assert.ok(nodes['#app'].innerHTML.includes('app-shell sidebar-collapsed'));
  await click('toggle-calendar');
  assert.ok(nodes['#app'].innerHTML.includes('agenda-layout calendar-collapsed'));
  assert.ok(nodes['#app'].innerHTML.includes('Afficher le calendrier'));
  assert.equal(qa.getState().tasks.length, count);
  await click('toggle-sidebar'); await click('toggle-calendar');
  assert.equal(qa.ui.sidebarCollapsed, false); assert.equal(qa.ui.calendarCollapsed, false);
});

test('task form saves selected weekdays and refuses an empty selection', async () => {
  const { qa, nodes, click, submitTask } = await harness();
  const task = qa.getState().tasks.find(task => !task.recurrence);
  await click('edit-task', { id: task.id });
  assert.ok(nodes['#dialog'].innerHTML.includes('Les jours de la routine'));
  assert.ok(nodes['#dialog'].innerHTML.includes('aria-label="Dimanche"'));
  const values = { title: task.title, groupId: task.groupId, memberId: task.memberId, anchor: '2026-10-05', recurrence: 'weekly', subtaskTitle: [], weekdays: [] };
  await submitTask(task.id, values);
  assert.equal(qa.getState().tasks.find(t => t.id === task.id).recurrence, null);
  assert.ok(nodes['#toast'].innerHTML.includes('au moins un jour'));
  await submitTask(task.id, { ...values, weekdays: ['0', '2'] });
  const saved = qa.getState().tasks.find(t => t.id === task.id);
  assert.deepEqual(saved.weekdays, [0, 2]);
  assert.deepEqual(Array.from(qa.occurrences(qa.getState(), '2026-10-05', '2026-10-11').filter(item => item.taskId === task.id), item => item.date), ['2026-10-05', '2026-10-07']);
});


test('day and week recap reflect filtered actions, completion and partial durations', async () => {
  const { qa, nodes, click, toggle } = await harness();
  const service = qa.getService(), groupId = qa.getState().groups[0].id;
  const memberId = 'member-camille';
  await service.importData(JSON.stringify({...qa.getState(), tasks:[], sessions:[], overrides:{}}));
  const anchor = qa.today();
  await service.createTask({title:'Known time',groupId,memberId,anchor,recurrence:'daily',estimatedMinutes:10});
  await service.createTask({title:'Unknown time',groupId,memberId,anchor,recurrence:'daily'});
  qa.ui.member = memberId;
  await click('page', {page:'today'});
  const day = qa.occurrences(qa.getState(), anchor, anchor).filter(item => item.memberId === memberId);
  assert.equal(day.length, 2);
  assert.ok(nodes['#app'].innerHTML.includes('0 sur 2 actions réalisées aujourd’hui'));
  assert.ok(nodes['#app'].innerHTML.includes('Au moins 10 min · 1 sans durée'));
  await toggle(day.find(item => item.task.estimatedMinutes).id, true);
  assert.ok(nodes['#app'].innerHTML.includes('1 sur 2 actions réalisées aujourd’hui'));
  assert.ok(nodes['#app'].innerHTML.includes('aria-valuenow="50"'));
  // Hiding completed cards must not remove their contribution to the recap.
  qa.ui.showDone = false; qa.render();
  assert.ok(nodes['#app'].innerHTML.includes('1 sur 2 actions réalisées aujourd’hui'));
  await click('recap-period', {value:'week'});
  const start = qa.weekStart(anchor), end = qa.addDays(start, 6);
  const week = qa.occurrences(qa.getState(), start, end).filter(item => item.memberId === memberId);
  assert.ok(nodes['#app'].innerHTML.includes(`1 sur ${week.length} actions réalisées cette semaine`));
  assert.equal(nodes['#app'].innerHTML.includes('data-action="recap-date"'), false);
  assert.ok(nodes['#app'].innerHTML.includes('class="progress-ring"'));
  assert.equal(nodes['#app'].innerHTML.includes('recap-progress'), false);
  qa.ui.date = qa.addDays(anchor, 30);
  await click('recap-period', {value:'day'});
  assert.equal(qa.ui.page, 'today');
  assert.ok(nodes['#app'].innerHTML.includes('1 sur 2 actions réalisées aujourd’hui'));
  assert.ok(nodes['#app'].innerHTML.includes('Récapitulatif du jour'));

});

test('mobile filters expose active chips and clear individual filters without changing data', async () => {
  const { qa, nodes, click } = await harness();
  const revision = qa.getState().revision;
  qa.ui.member = qa.getState().members[0].id; qa.ui.duration = 'short'; qa.ui.showDone = false; qa.render();
  assert.ok(nodes['#app'].innerHTML.includes('data-key="member"'));
  assert.ok(nodes['#app'].innerHTML.includes('data-key="duration"'));
  await click('toggle-filters'); assert.equal(qa.ui.filtersOpen, true);
  assert.ok(nodes['#app'].innerHTML.includes('filter-panel is-open'));
  await click('clear-filter', {key:'duration'});
  assert.equal(qa.ui.duration, ''); assert.ok(qa.ui.member);
  await click('clear-filter', {key:'showDone'}); assert.equal(qa.ui.showDone, true);
  await click('reset-filters'); assert.equal(qa.ui.member, '');
  assert.equal(qa.getState().revision, revision);
});

test('duplicate editor saves an independent task and fresh subtask IDs without copying history', async () => {
  const { qa, nodes, click, submitTask } = await harness();
  const state = qa.getState(), groupId = state.groups[0].id, memberId = state.members[0].id;
  await qa.getService().createTask({title:'Routine to copy',description:'Keep this instruction',groupId,memberId,anchor:qa.today(),recurrence:'daily',estimatedMinutes:15,subtasks:[{id:'original-step',title:'Prepare'}]});
  const original = qa.getState().tasks.find(task => task.title === 'Routine to copy');
  const item = qa.occurrences(qa.getState(), qa.today(), qa.today()).find(item => item.taskId === original.id);
  await qa.getService().update([item], {status:'done'});
  const before = structuredClone(qa.getState());
  await click('duplicate-task', {id:original.id});
  assert.ok(nodes['#dialog'].innerHTML.includes('data-id=""'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Routine to copy (copie)'));
  assert.ok(nodes['#dialog'].innerHTML.includes('value="15"'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Keep this instruction'));
  assert.equal(qa.getState().tasks.length, before.tasks.length);
  await submitTask('', {title:'My new routine',description:original.description,groupId,memberId,anchor:qa.today(),recurrence:'daily',weekdays:[0,1,2,3,4,5,6],estimatedMinutes:'15',subtaskTitle:['Prepare']});
  const copy = qa.getState().tasks.find(task => task.title === 'My new routine');
  assert.ok(copy); assert.notEqual(copy.id, original.id);
  assert.equal(copy.estimatedMinutes, 15); assert.equal(copy.groupId, groupId);
  assert.notEqual(copy.subtasks[0].id, original.subtasks[0].id);
  assert.equal(copy.subtasks[0].title, 'Prepare');
  assert.deepEqual(qa.getState().overrides, before.overrides);
  assert.equal(qa.occurrences(qa.getState(), qa.today(), qa.today()).find(item => item.taskId === copy.id).status, 'todo');
  assert.deepEqual(qa.getState().tasks.find(task => task.id === original.id), before.tasks.find(task => task.id === original.id));
});

test('routine preview updates with optional time and preserves monthly date wording', async () => {
  const { qa, nodes, click, input } = await harness();
  const task = qa.getState().tasks.find(task => task.recurrence === 'monthly');
  await click('edit-task', {id:task.id});
  assert.ok(nodes['#dialog'].innerHTML.includes('id="routine-preview"'));
  const preview = {textContent:''};
  const fields = { '#routine-preview':preview, '[name="recurrence"]':{value:'monthly'}, '[name="anchor"]':{value:task.anchor}, '[name="estimatedMinutes"]':{value:'15'} };
  nodes['#dialog'].querySelector = selector => fields[selector];
  nodes['#dialog'].querySelectorAll = () => [];
  await input('estimatedMinutes', '15');
  assert.ok(preview.textContent.includes('Chaque mois'));
  assert.ok(preview.textContent.includes('environ 15 min'));
  fields['[name="estimatedMinutes"]'].value = '';
  await input('estimatedMinutes', '');
  assert.equal(preview.textContent.includes('environ'), false);
});


test('Today period selector changes displayed task and session dates without altering the agenda', async () => {
  const { qa, nodes, click } = await harness();
  const groupId = qa.getState().groups[0].id;
  const memberId = 'member-camille';
  await qa.getService().importData(JSON.stringify({...qa.getState(), tasks:[], sessions:[], overrides:{}}));
  for (const title of ['Weekly action one', 'Weekly action two']) {
    await qa.getService().createTask({title,groupId,memberId,anchor:qa.today(),recurrence:'daily'});
  }
  const taskIds = qa.getState().tasks.filter(task => task.memberId === memberId).map(task => task.id);
  await qa.getService().createSession({title:'Weekly session',groupId,taskIds});
  qa.ui.member = memberId;
  const agendaDate = qa.ui.date, agendaView = qa.ui.view;
  await click('page', {page:'today'});
  assert.equal(qa.getCards().size, 1);
  assert.ok([...qa.getCards().values()].every(card => card.session && card.date === qa.today()));
  await click('recap-period', {value:'week'});
  const start = qa.weekStart(qa.today()), end = qa.addDays(start, 6);
  const dueDates = new Set(qa.occurrences(qa.getState(), start, end).filter(item => item.memberId === memberId).map(item => item.date));
  assert.equal(qa.getCards().size, dueDates.size);
  assert.deepEqual(new Set([...qa.getCards().values()].map(card => card.date)), dueDates);
  assert.ok([...qa.getCards().values()].every(card => card.session));
  assert.equal((nodes['#app'].innerHTML.match(/class="today-program-day"/g) ?? []).length, 7);
  assert.ok(nodes['#app'].innerHTML.includes('Mes tâches cette semaine'));
  assert.ok(nodes['#app'].innerHTML.includes('class="today-week-grid"'));
  assert.ok(nodes['#app'].innerHTML.includes('class="progress-ring"'));
  await click('recap-period', {value:'day'});
  assert.equal(qa.ui.page, 'today');
  assert.equal(qa.getCards().size, 1);
  assert.ok([...qa.getCards().values()].every(card => card.date === qa.today()));
  assert.equal(nodes['#app'].innerHTML.includes('today-week-grid'), false);
  assert.equal(qa.ui.date, agendaDate); assert.equal(qa.ui.view, agendaView);
  await click('page', {page:'planning'});
  assert.equal(nodes['#app'].innerHTML.includes('routine-recap'), false);
  assert.ok(nodes['#app'].innerHTML.includes('time-overview'));
  assert.ok(nodes['#app'].innerHTML.includes('week-summary'));
  assert.equal((nodes['#app'].innerHTML.match(/class="day-column/g) ?? []).length, 7);
});


test('Today shows only my assigned occurrences and session completion leaves others untouched', async () => {
  const {qa,nodes,click,toggle} = await harness();
  const service = qa.getService(), state = qa.getState(), groupId = state.groups[0].id;
  await service.importData(JSON.stringify({...state,tasks:[],sessions:[],overrides:{}}));
  const me = 'member-camille', other = state.members.find(member => member.id !== me).id;
  for (const [title,memberId,estimatedMinutes] of [['My action',me,10],['Other action',other,60]]) {
    await service.createTask({title,memberId,estimatedMinutes,groupId,anchor:qa.today(),recurrence:'daily'});
  }
  const taskIds = qa.getState().tasks.map(task => task.id);
  await service.createSession({title:'Shared session',groupId,taskIds});
  qa.ui.member = other; // A household filter cannot override my personal overview.
  await click('page',{page:'today'});
  assert.ok(nodes['#app'].innerHTML.includes('0 sur 1 actions réalisées aujourd’hui'));
  assert.ok(nodes['#app'].innerHTML.includes('≈ 10 min'));
  assert.equal(nodes['#app'].innerHTML.includes('data-filter="member"'),false);
  const card = [...qa.getCards().values()][0];
  await click('detail',{id:card.id});
  assert.ok(nodes['#dialog'].innerHTML.includes('My action'));
  assert.equal(nodes['#dialog'].innerHTML.includes('Other action'),false);
  await click('close');
  await toggle(card.id,true,true);
  const actions = qa.occurrences(qa.getState(),qa.today(),qa.today());
  assert.equal(actions.find(item=>item.memberId===me).status,'done');
  assert.equal(actions.find(item=>item.memberId===other).status,'todo');
  assert.ok(nodes['#app'].innerHTML.includes('1 sur 1 actions réalisées aujourd’hui'));
  await click('recap-period',{value:'week'});
  assert.ok([...qa.getCards().values()].every(card=>card.items.every(item=>item.memberId===me)));
  await click('page',{page:'planning'});
  qa.ui.member=''; qa.render();
  assert.ok([...qa.getCards().values()].some(card=>card.items.some(item=>item.memberId===other)));
});


test('discrete quick report preserves collision warning and cancellation', async () => {
  const {qa,nodes,click} = await harness();
  const source=[...qa.getCards().values()].find(card=>!card.session && card.items[0].task.recurrence==='daily');
  assert.ok(source);
  await click('quick-move',{id:source.id});
  assert.ok(nodes['#dialog'].innerHTML.includes('quick-move-form'));
  const revision=qa.getState().revision;
  await click('quick-tomorrow');
  assert.ok(nodes['#dialog'].innerHTML.includes('Regrouper les occurrences'));
  assert.equal(qa.getState().revision,revision);
  await click('close'); assert.equal(qa.getState().revision,revision);
});

test('optional editor and overdue tasks are folded and personal sessions use explicit wording', async () => {
  const {qa,nodes,click}=await harness();
  const task=qa.getState().tasks.find(task=>!task.recurrence);
  await click('edit-task',{id:task.id});
  assert.ok(nodes['#dialog'].innerHTML.includes('<details class="task-extras">'));
  assert.ok(nodes['#dialog'].innerHTML.includes('name="fixedDay"'));
  await click('close'); await click('page',{page:'today'});
  assert.ok(nodes['#app'].innerHTML.includes('Mes actions · '));
  assert.ok(nodes['#app'].innerHTML.includes('Terminer mes actions'));
  const older=qa.addDays(qa.today(),-1);
  await qa.getService().createTask({title:'Past action',groupId:qa.getState().groups[0].id,memberId:'member-camille',anchor:older,recurrence:'once'});
  assert.ok(nodes['#app'].innerHTML.includes('<details class="overdue-section today-overdue">'));
});

test('optimization preview is read-only, applies atomically and supports undo', async () => {
  const {qa,nodes,click,submitForm}=await harness();
  await qa.getService().importData(JSON.stringify({...qa.getState(),tasks:[],sessions:[],overrides:{}}));
  const anchor=qa.weekStart(qa.today());
  // Put flexible actions on the first future day inside the current week.
  const date=qa.today();
  for (let index=0;index<5;index++) await qa.getService().createTask({title:`Action ${index}`,groupId:qa.getState().groups[0].id,memberId:'member-camille',anchor:date,recurrence:'weekly',estimatedMinutes:20});
  await click('page',{page:'today'});
  const before=structuredClone(qa.getState());
  await click('reorganize');
  assert.ok(nodes['#dialog'].innerHTML.includes('Uniquement mes tâches'));
  await submitForm('reorganization-form',{period:'week',fallbackMinutes:'15'},{date,personal:'true'});
  assert.ok(nodes['#dialog'].innerHTML.includes('Voir les déplacements'));
  assert.equal(qa.getState().revision,before.revision);
  await click('confirm-reorganization');
  assert.ok(Object.keys(qa.getState().overrides).length>0);
  assert.deepEqual(qa.getState().tasks,before.tasks);
  await click('undo');
  assert.deepEqual(qa.getState().overrides,before.overrides);
});


test('household rotation preview explicitly lists reassignment, applies and undoes it',async()=>{
  const {qa,nodes,click}=await harness();
  const state=qa.getState(), anchor=qa.addDays(qa.today(),-6), future=qa.addDays(qa.today(),1);
  await qa.getService().importData(JSON.stringify({...state,tasks:[],sessions:[],overrides:{}}));
  const me='member-camille';
  await qa.getService().createTask({title:'Rotate this',groupId:state.groups[0].id,memberId:me,anchor,recurrence:'weekly',estimatedMinutes:10});
  const previous=qa.occurrences(qa.getState(),anchor,anchor)[0];
  await qa.getService().update([previous],{status:'done'});
  const before=structuredClone(qa.getState());
  qa.reorganizationPreview({start:qa.weekStart(qa.today()),end:qa.addDays(qa.weekStart(qa.today()),6),notBefore:qa.today(),fallbackMinutes:15,rotate:true});
  assert.ok(nodes['#dialog'].innerHTML.includes('Changements de responsable'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Appliquer la proposition'));
  assert.equal(qa.getState().revision,before.revision);
  await click('confirm-reorganization');
  assert.notEqual(qa.occurrences(qa.getState(),future,future)[0].memberId,me);
  await click('undo'); assert.deepEqual(qa.getState().overrides,before.overrides);
});


test('Stats renders saved completions, filters interactive charts and opens read-only details',async()=>{
  const {qa,nodes,click}=await harness();
  await qa.getService().importData(JSON.stringify({...qa.getState(),tasks:[],sessions:[],overrides:{}}));
  const groupId=qa.getState().groups[0].id;
  await qa.getService().createTask({title:'<img src=x> Detailed routine',groupId,memberId:'member-alex',anchor:qa.today(),recurrence:'daily',estimatedMinutes:15});
  const item=qa.occurrences(qa.getState(),qa.today(),qa.today())[0];
  await qa.getService().update([item],{status:'done'});
  const revision=qa.getState().revision;
  await click('page',{page:'stats'});
  assert.ok(nodes['#app'].innerHTML.includes('La maison en chiffres'));
  assert.ok(nodes['#app'].innerHTML.includes('stats-heatmap'));
  assert.ok(nodes['#app'].innerHTML.includes('Le plumeau d’or'));
  assert.ok(nodes['#app'].innerHTML.includes('&lt;img src=x&gt;'));
  assert.equal(nodes['#app'].innerHTML.includes('<img src=x>'),false);
  await click('stats-member',{id:'member-camille'});
  assert.ok(nodes['#app'].innerHTML.includes('1 actions faites'));
  await click('stats-member',{id:'member-alex'});
  assert.ok(nodes['#app'].innerHTML.includes('0 actions faites'));
  await click('stats-reset');
  await click('stats-record',{id:item.id});
  assert.ok(nodes['#dialog'].innerHTML.includes('Réalisé par'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Camille'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Alex'));
  assert.equal(nodes['#dialog'].innerHTML.includes('detail-form'),false);
  await click('close');await click('stats-period',{value:'all'});
  assert.ok(nodes['#app'].innerHTML.includes('365 derniers jours'));
  assert.equal(qa.getState().revision,revision);
});


test('Stats CSV exports filtered records and neutralizes spreadsheet formulas',async()=>{
  const {qa,click,context,document}=await harness();
  await qa.getService().importData(JSON.stringify({...qa.getState(),tasks:[],sessions:[],overrides:{}}));
  await qa.getService().createTask({title:'  =SUM(1;2)',groupId:qa.getState().groups[0].id,memberId:'member-camille',anchor:qa.today(),recurrence:'once'});
  await qa.getService().update(qa.occurrences(qa.getState(),qa.today(),qa.today()),{status:'done'});
  await click('page',{page:'stats'});
  let csv='',download='';
  context.Blob=class{constructor(parts){csv=parts.join('');}};
  context.URL={createObjectURL:()=> 'blob:stats',revokeObjectURL(){}};
  document.createElement=()=>({set download(value){download=value;},click(){}});
  await click('stats-export');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'  =SUM(1;2)"));
  assert.ok(csv.includes('Camille'));assert.ok(download.endsWith('.csv'));
  await click('stats-member',{id:'member-alex'});await click('stats-export');
  assert.equal(csv.includes('SUM(1;2)'),false);
});

test('connected settings show the real account and an escaped family selector with a favorite', async () => {
  const {qa,nodes,click} = await harness();
  const shared = qa.getRuntime(); shared.mode = 'shared'; shared.households = [{householdId:'one',name:'<Famille>',canInvite:true}]; shared.favoriteHouseholdId = 'one'; shared.refreshHouseholds = async()=>shared.households;
  qa.ui.page='settings';qa.render();
  assert.ok(nodes['#app'].innerHTML.includes('Mon compte'));
  assert.ok(nodes['#app'].innerHTML.includes('Mes familles'));
  assert.equal(nodes['#app'].innerHTML.includes('Démonstration locale'),false);
  await click('families');
  assert.ok(nodes['#dialog'].innerHTML.includes('&lt;Famille&gt;'));
  assert.equal(nodes['#dialog'].innerHTML.includes('<Famille>'),false);
  assert.ok(nodes['#dialog'].innerHTML.includes('aria-pressed="true"'));
  assert.ok(nodes['#dialog'].innerHTML.includes('Créer ou rejoindre'));
});
