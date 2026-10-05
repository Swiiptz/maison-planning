import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addMonths, weekStart, parseDate } from '../app/domain/dates.js';
import { isDue, occurrences, cardsForDate, updateOccurrences, updateSeries, validateState } from '../app/domain/planning.js';
import { seedState } from '../app/services/seed.js';
import { createDemoAdapter } from '../app/adapters/demo.js';
import { createPlanningService } from '../app/services/planning-service.js';

const catalog = JSON.parse(await readFile(new URL('../app/data/catalog.json', import.meta.url)));
const fixture = () => ({ schemaVersion: 1, revision: 0, household: { id: 'house', name: 'Maison' }, members: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }], groups: [{ id: 'kitchen', name: 'Cuisine', color: '#996633' }], sessions: [], tasks: [{ id: 'clean', groupId: 'kitchen', title: 'Nettoyer', description: '', recurrence: 'weekly', anchor: '2026-10-05', memberId: 'alice' }], overrides: {} });
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('monthly recurrence clamps short months but returns to the anchor day', () => {
  const task = { anchor: '2026-01-31', recurrence: 'monthly' };
  assert.equal(isDue(task, '2026-02-28'), true);
  assert.equal(isDue(task, '2026-03-31'), true);
  assert.equal(isDue(task, '2026-03-28'), false);
  assert.equal(isDue({ ...task, anchor: '2028-01-31' }, '2028-02-29'), true);
});
test('every two months respects the anchor and calendar boundaries', () => {
  const task = { anchor: '2026-12-31', recurrence: 'bimonthly' };
  assert.equal(isDue(task, '2027-02-28'), true);
  assert.equal(isDue(task, '2027-01-31'), false);
  assert.equal(isDue(task, '2027-04-30'), true);
});
test('fortnightly is a 14-day interval, weeks start on Monday', () => {
  assert.equal(isDue({ anchor: '2026-10-05', recurrence: 'fortnightly' }, '2026-10-19'), true);
  assert.equal(isDue({ anchor: '2026-10-05', recurrence: 'fortnightly' }, '2026-10-12'), false);
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.throws(() => parseDate('2026-02-30'));
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});
test('moving across months keeps identity and future recurrence unchanged', () => {
  let state = fixture();
  const first = occurrences(state, '2026-10-05', '2026-10-05')[0];
  state = updateOccurrences(state, [first], { date: '2026-11-03' }, 'alice');
  assert.equal(occurrences(state, '2026-10-05', '2026-10-05').length, 0);
  const moved = occurrences(state, '2026-11-03', '2026-11-03');
  assert.equal(moved.length, 1); assert.equal(moved[0].id, first.id);
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12').length, 1);
});
test('checking and unchecking affects one occurrence and records its actor', () => {
  let state = fixture();
  const first = occurrences(state, '2026-10-05', '2026-10-05')[0];
  state = updateOccurrences(state, [first], { status: 'done' }, 'bob');
  assert.equal(state.overrides[first.id].completedBy, 'bob');
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12')[0].status, 'todo');
  state = updateOccurrences(state, [first], { status: 'todo' }, 'bob');
  assert.equal(state.overrides[first.id].completedAt, undefined);
});
test('reassigning a single occurrence does not change the usual owner', () => {
  let state = fixture(); const first = occurrences(state, '2026-10-05', '2026-10-05')[0];
  state = updateOccurrences(state, [first], { memberId: 'bob' }, 'alice');
  assert.equal(occurrences(state, '2026-10-05', '2026-10-05')[0].memberId, 'bob');
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12')[0].memberId, 'alice');
});
test('future series changes preserve past and completed history', () => {
  let state = fixture();
  const first = occurrences(state, '2026-10-05', '2026-10-05')[0];
  state = updateOccurrences(state, [first], { status: 'done' }, 'alice');
  const second = occurrences(state, '2026-10-12', '2026-10-12')[0];
  state = updateSeries(state, second, { anchor: '2026-10-13', memberId: 'bob' });
  assert.equal(occurrences(state, '2026-10-05', '2026-10-05')[0].status, 'done');
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12').length, 0);
  assert.equal(occurrences(state, '2026-10-13', '2026-10-13')[0].memberId, 'bob');
  assert.equal(occurrences(state, '2026-10-20', '2026-10-20').length, 1);
  validateState(state);
});
test('future changes preserve an occurrence completed ahead of its date', () => {
  let state = fixture(); const ahead = occurrences(state, '2026-10-19', '2026-10-19')[0];
  state = updateOccurrences(state, [ahead], { status: 'done' }, 'alice');
  state = updateSeries(state, occurrences(state, '2026-10-12', '2026-10-12')[0], { anchor: '2026-10-13' });
  assert.equal(occurrences(state, '2026-10-19', '2026-10-19')[0].status, 'done');
  assert.equal(occurrences(state, '2026-10-19', '2026-10-19')[0].id, ahead.id);
  validateState(state);
});
test('changing a future owner with the same anchor does not regenerate the past', () => {
  let state = fixture(); const item = occurrences(state, '2026-10-12', '2026-10-12')[0];
  state = updateSeries(state, item, { anchor: state.tasks[0].anchor, memberId: 'bob' });
  assert.equal(occurrences(state, '2026-10-05', '2026-10-05').length, 1);
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12').length, 1);
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12')[0].memberId, 'bob');
});
test('sessions group due actions without duplicates or excess recurrence', () => {
  const state = fixture();
  state.tasks.push({ ...state.tasks[0], id: 'oven', title: 'Four', recurrence: 'bimonthly' });
  state.sessions.push({ id: 'session', title: 'Cuisine', groupId: 'kitchen', taskIds: ['clean', 'oven'], enabled: true });
  let items = occurrences(state, '2026-10-05', '2026-10-05');
  assert.equal(cardsForDate(state, items, '2026-10-05')[0].items.length, 2);
  items = occurrences(state, '2026-10-12', '2026-10-12');
  assert.equal(items.length, 1); assert.equal(cardsForDate(state, items, '2026-10-12')[0].items.length, 1);
  assert.equal(cardsForDate(state, items, '2026-10-12', false).length, 1);
});
test('detaching an action changes grouping without duplicating the action', () => {
  let state = fixture(); state.sessions.push({ id: 'session', title: 'Cuisine', groupId: 'kitchen', taskIds: ['clean'], enabled: true });
  const item = occurrences(state, '2026-10-05', '2026-10-05')[0];
  state = updateOccurrences(state, [item], { sessionId: '' }, 'alice');
  const cards = cardsForDate(state, occurrences(state, '2026-10-05', '2026-10-05'), '2026-10-05');
  assert.equal(cards.length, 1); assert.equal(cards[0].session, false);
});
test('PDF seed includes all groups, retains unscheduled steps, and fixes collection weekdays', () => {
  const state = seedState(catalog, { demo: true }); validateState(state);
  assert.equal(state.groups.length, 16); assert.equal(state.tasks.length, 187);
  assert.equal(state.tasks.filter(t => !t.recurrence).length, 23);
  for (const task of state.tasks.filter(t => t.weekday !== undefined)) {
    assert.equal((parseDate(task.anchor).getUTCDay() + 6) % 7, task.weekday);
  }
});
test('demo persistence detects concurrent writes and survives recreating the adapter', async () => {
  const storage = memoryStorage(), first = createDemoAdapter(fixture(), storage), second = createDemoAdapter(fixture(), storage);
  const next = fixture(); next.members[0].name = 'Alice B'; await first.commit(next, 0);
  await assert.rejects(second.commit(fixture(), 0), /autre onglet/);
  assert.equal((await second.load()).members[0].name, 'Alice B');
  first.dispose(); second.dispose();
});
test('service contract works with an independent adapter and preserves exports', async () => {
  let saved = fixture();
  const adapter = { subscribe: () => () => {}, load: async () => structuredClone(saved), commit: async (next, version) => { assert.equal(version, saved.revision); saved = { ...next, revision: version + 1 }; return structuredClone(saved); } };
  const service = createPlanningService(adapter, 'alice');
  const initial = await service.load(); await service.update(occurrences(initial, '2026-10-05', '2026-10-05'), { status: 'done' });
  const exportText = service.exportData(); await service.importData(exportText);
  assert.equal(saved.overrides['clean@2026-10-05'].status, 'done');
  assert.equal(saved.overrides['clean@2026-10-05'].completedBy, 'alice');
  assert.equal(saved.revision, 2);
});
test('archive preserves completed future occurrences while stopping new ones', async () => {
  const adapter = createDemoAdapter(fixture(), memoryStorage()), service = createPlanningService(adapter, 'alice');
  let state = await service.load(); await service.update(occurrences(state, '2026-10-19', '2026-10-19'), { status: 'done' });
  await service.archive('clean', '2026-10-12'); state = await service.load();
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12').length, 0);
  assert.equal(occurrences(state, '2026-10-19', '2026-10-19')[0].status, 'done');
  adapter.dispose();
});
test('invalid imports fail before any data is written', async () => {
  const adapter = createDemoAdapter(fixture(), memoryStorage()), service = createPlanningService(adapter, 'alice'); await service.load();
  const invalid = fixture(); invalid.tasks[0].groupId = 'missing';
  assert.throws(() => service.importData(JSON.stringify(invalid)), /Tâche invalide/);
  assert.equal((await service.load()).revision, 0);
  adapter.dispose();
});
