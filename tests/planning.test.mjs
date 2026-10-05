import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addMonths, weekStart, parseDate } from '../app/domain/dates.js';
import { isDue, occurrences, cardsForDate, updateOccurrences, updateSeries, validateState, moveCollisions, durationEstimate, matchesDuration, sortDurations, proposeReorganization, applyReorganization } from '../app/domain/planning.js';
import { seedState } from '../app/services/seed.js';
import { createDemoAdapter } from '../app/adapters/demo.js';
import { createPlanningService } from '../app/services/planning-service.js';

const catalog = JSON.parse(await readFile(new URL('../app/data/catalog.json', import.meta.url)));
const fixture = () => ({ schemaVersion: 1, revision: 0, household: { id: 'house', name: 'Maison' }, members: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }], groups: [{ id: 'kitchen', name: 'Cuisine', color: '#996633' }], sessions: [], tasks: [{ id: 'clean', groupId: 'kitchen', title: 'Nettoyer', description: '', recurrence: 'weekly', anchor: '2026-10-05', memberId: 'alice' }], overrides: {} });
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('daily collisions require confirmation and keep one occurrence without changing recurrence', () => {
  const state = fixture(); state.tasks[0].recurrence = 'daily';
  const source = occurrences(state, '2026-10-05', '2026-10-05')[0];
  assert.equal(moveCollisions(state, [source], '2026-10-06').length, 1);
  assert.throws(() => updateOccurrences(state, [source], { date: '2026-10-06' }, 'alice'), /Confirme/);
  assert.deepEqual(state.overrides, {});
  const next = updateOccurrences(state, [source], { date: '2026-10-06', memberId: 'bob' }, 'alice', { merge: true });
  validateState(next);
  assert.equal(occurrences(next, '2026-10-05', '2026-10-05').length, 0);
  const target = occurrences(next, '2026-10-06', '2026-10-06');
  assert.equal(target.length, 1); assert.equal(target[0].id, 'clean@2026-10-06');
  assert.equal(target[0].memberId, 'alice');
  assert.equal(next.overrides[source.id].mergedInto, target[0].id);
  assert.equal(occurrences(next, '2026-10-07', '2026-10-07').length, 1);
  assert.throws(() => updateOccurrences(next, [source], { status: 'done' }, 'alice'), /regroupée/);
});

test('merging preserves destination completion and supports repeated moves across months', () => {
  let state = fixture(); state.tasks[0].recurrence = 'daily';
  const source = occurrences(state, '2026-10-05', '2026-10-05')[0];
  const target = occurrences(state, '2026-11-03', '2026-11-03')[0];
  state = updateOccurrences(state, [target], { status: 'done', memberId: 'bob' }, 'bob');
  const completion = state.overrides[target.id].completedAt;
  state = updateOccurrences(state, [source], { date: target.date }, 'alice', { merge: true });
  const merged = occurrences(state, target.date, target.date);
  assert.equal(merged.length, 1); assert.equal(merged[0].status, 'done');
  assert.equal(merged[0].completedAt, completion); assert.equal(merged[0].completedBy, 'bob');
  assert.equal(merged[0].memberId, 'bob');
  state = updateOccurrences(state, occurrences(state, '2026-10-06', '2026-10-06'), { date: target.date }, 'alice', { merge: true });
  assert.equal(occurrences(state, target.date, target.date).length, 1);
  validateState(JSON.parse(JSON.stringify(state)));
});

test('session moves merge collisions and move other actions, without conflating equal titles', () => {
  const state = fixture(); state.tasks[0].recurrence = 'daily';
  state.tasks.push({ ...state.tasks[0], id: 'other', recurrence: 'weekly' });
  const items = occurrences(state, '2026-10-05', '2026-10-05');
  const next = updateOccurrences(state, items, { date: '2026-10-06' }, 'alice', { merge: true });
  const moved = occurrences(next, '2026-10-06', '2026-10-06');
  assert.equal(moved.length, 2);
  assert.deepEqual(new Set(moved.map(o => o.taskId)), new Set(['clean', 'other']));
  validateState(next);
});

test('merge undo restores all exceptions and refuses to overwrite subsequent changes', async () => {
  const state = fixture(); state.tasks[0].recurrence = 'daily';
  const adapter = createDemoAdapter(state, memoryStorage());
  const service = createPlanningService(adapter, 'alice');
  const before = await service.load();
  const items = occurrences(before, '2026-10-05', '2026-10-05');
  await assert.rejects(service.update(items, { date: '2026-10-06' }), /Confirme/);
  const merged = await service.update(items, { date: '2026-10-06' }, { merge: true, expectedRevision: 0 });
  await service.restoreMove(before.overrides, merged.revision);
  const restored = await service.load();
  assert.deepEqual(restored.overrides, before.overrides);
  assert.equal(occurrences(restored, '2026-10-05', '2026-10-06').length, 2);
  await assert.rejects(service.update(items, { date: '2026-10-06' }, { merge: true, expectedRevision: 0 }), /planning a changé/);
  await assert.rejects(service.restoreMove(before.overrides, merged.revision), /Annulation impossible/);
  adapter.dispose();
});

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

test('subtask progress is independent of completion, recurrence and export', async () => {
  const initial = fixture();
  initial.tasks[0].subtasks = [{ id: 'cloth', title: 'Prendre un chiffon' }, { id: 'spray', title: 'Préparer le produit' }];
  const adapter = createDemoAdapter(initial, memoryStorage());
  const service = createPlanningService(adapter, 'alice');
  let state = await service.load();
  const item = occurrences(state, '2026-10-05', '2026-10-05')[0];
  await service.setSubtask(item, 'cloth', true);
  await service.setSubtask(item, 'spray', true);
  state = await service.load();
  assert.equal(state.overrides[item.id].status, 'todo');
  assert.equal(state.overrides[item.id].completedAt, undefined);
  assert.deepEqual(state.overrides[item.id].subtaskDone, ['cloth', 'spray']);
  assert.equal(occurrences(state, '2026-10-12', '2026-10-12')[0].subtaskDone, undefined);
  await service.update([item], { status: 'done' });
  await service.setSubtask(item, 'cloth', false);
  state = await service.load();
  assert.equal(state.overrides[item.id].status, 'done');
  assert.deepEqual(state.overrides[item.id].subtaskDone, ['spray']);
  const exported = service.exportData();
  await service.importData(exported);
  state = await service.load();
  assert.deepEqual(state.tasks[0].subtasks, initial.tasks[0].subtasks);
  assert.deepEqual(state.overrides[item.id].subtaskDone, ['spray']);
  await assert.rejects(service.setSubtask(item, 'missing', true), /introuvable/);
  adapter.dispose();
});

test('unscheduled tasks accept optional lists and reject invalid subtask imports', () => {
  const state = fixture();
  state.tasks[0].anchor = null; state.tasks[0].recurrence = null;
  state.tasks[0].subtasks = [{ id: 'cloth', title: 'Chiffon' }];
  validateState(state);
  assert.equal(occurrences(state, '2026-10-05', '2026-10-12').length, 0);
  state.tasks[0].subtasks.push({ id: 'cloth', title: 'Produit' });
  assert.throws(() => validateState(state), /Sous-tâche invalide/);
});

test('duration estimates distinguish unknown durations and sort them last in both directions', () => {
  const tasks = [{ id: 'long', estimatedMinutes: 45 }, { id: 'unknown' }, { id: 'short', estimatedMinutes: 10 }, { id: 'medium', estimatedMinutes: 20 }];
  assert.deepEqual(durationEstimate(tasks), { minutes: 75, missing: 1 });
  assert.deepEqual(sortDurations(tasks, t => t.estimatedMinutes ?? null, 'duration-asc').map(t => t.id), ['short', 'medium', 'long', 'unknown']);
  assert.deepEqual(sortDurations(tasks, t => t.estimatedMinutes ?? null, 'duration-desc').map(t => t.id), ['long', 'medium', 'short', 'unknown']);
  assert.equal(matchesDuration(tasks[0], 'long'), true);
  assert.equal(matchesDuration(tasks[1], 'short'), false);
  assert.equal(matchesDuration(tasks[1], 'unknown'), true);
  const state = fixture();
  state.tasks[0].estimatedMinutes = null; validateState(state);
  state.tasks[0].estimatedMinutes = 0; assert.throws(() => validateState(state), /Durée estimée/);
  state.tasks[0].estimatedMinutes = 1.5; assert.throws(() => validateState(state), /Durée estimée/);
});

test('estimated duration survives export and import without generating extra occurrences', async () => {
  const initial = fixture(); initial.tasks[0].estimatedMinutes = 15;
  const adapter = createDemoAdapter(initial, memoryStorage());
  const service = createPlanningService(adapter, 'alice'); await service.load();
  await service.importData(service.exportData());
  const state = await service.load();
  assert.equal(state.tasks[0].estimatedMinutes, 15);
  assert.equal(occurrences(state, '2026-10-05', '2026-10-05').length, 1);
  adapter.dispose();
});

test('selected weekdays generate distinct weekly occurrences from the start date', () => {
  const task = { ...fixture().tasks[0], weekdays: [0, 2, 4] };
  const state = fixture(); state.tasks[0] = task;
  const items = occurrences(state, '2026-10-05', '2026-10-18');
  assert.deepEqual(items.map(item => item.date), ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16']);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.equal(isDue({ ...task, anchor: '2026-10-06' }, '2026-10-05'), false);
  assert.equal(isDue({ ...task, recurrence: 'daily', weekdays: [0, 1, 2, 3, 4] }, '2026-10-10'), false);
});

test('fortnightly weekdays follow alternate calendar weeks across year boundaries', () => {
  const task = { ...fixture().tasks[0], recurrence: 'fortnightly', anchor: '2026-12-30', weekdays: [0, 2, 4] };
  assert.equal(isDue(task, '2026-12-28'), false);
  assert.equal(isDue(task, '2026-12-30'), true);
  assert.equal(isDue(task, '2027-01-01'), true);
  assert.equal(isDue(task, '2027-01-04'), false);
  assert.equal(isDue(task, '2027-01-11'), true);
  assert.equal(isDue(task, '2027-01-13'), true);
});

test('changing selected weekdays keeps completed history, export and future shift coherent', async () => {
  let state = fixture(); state.tasks[0].weekdays = [0, 2];
  const first = occurrences(state, '2026-10-05', '2026-10-05')[0];
  state = updateOccurrences(state, [first], { status: 'done' }, 'alice');
  state = updateSeries(state, { taskId: 'clean', scheduledDate: '2026-10-12' }, { weekdays: [1, 3] });
  assert.equal(occurrences(state, '2026-10-05', '2026-10-05')[0].status, 'done');
  assert.deepEqual(occurrences(state, '2026-10-12', '2026-10-18').map(item => item.date), ['2026-10-13', '2026-10-15']);
  const item = occurrences(state, '2026-10-13', '2026-10-13')[0];
  state = updateSeries(state, item, { anchor: '2026-10-14' });
  assert.deepEqual(state.tasks.at(-1).weekdays, [2, 4]);
  const adapter = createDemoAdapter(state, memoryStorage());
  const service = createPlanningService(adapter, 'alice'); await service.load();
  await service.importData(service.exportData());
  assert.deepEqual((await service.load()).tasks.at(-1).weekdays, [2, 4]);
  adapter.dispose();
});

test('invalid weekday lists are rejected and legacy recurrence retains its behavior', () => {
  const state = fixture();
  assert.equal(isDue(state.tasks[0], '2026-10-12'), true);
  for (const weekdays of [[], [0, 0], [7], [-1], ['0']]) {
    state.tasks[0].weekdays = weekdays;
    assert.throws(() => validateState(state), /Jours de récurrence/);
  }
  const monthly = { anchor: '2026-01-31', recurrence: 'monthly', weekdays: [0] };
  assert.equal(isDue(monthly, '2026-02-28'), true);
});


const optimizationFixture = () => {
  const state = fixture(); state.tasks = [20,30,40,50,60,70].map((minutes,index) => ({...state.tasks[0],id:`flex-${index}`,title:`Flexible ${index}`,estimatedMinutes:minutes}));
  return state;
};
const optimizationOptions = {start:'2026-10-05',end:'2026-10-11',notBefore:'2026-10-05',fallbackMinutes:15};

test('reorganization balances time without changing totals, identities, series or assignees', () => {
  const state = optimizationFixture(), original = structuredClone(state);
  state.overrides['flex-0@2026-10-05'] = {id:'flex-0@2026-10-05',taskId:'flex-0',scheduledDate:'2026-10-05',date:'2026-10-05',memberId:'alice',status:'todo',subtaskDone:['prepared']};
  const proposal = proposeReorganization(state, optimizationOptions);
  assert.ok(proposal.moves.length > 0);
  assert.ok(Math.max(...proposal.after.map(day=>day.minutes)) < Math.max(...proposal.before.map(day=>day.minutes)));
  assert.equal(proposal.before.reduce((sum,day)=>sum+day.minutes,0), proposal.after.reduce((sum,day)=>sum+day.minutes,0));
  const next = applyReorganization(state, optimizationOptions, state.revision);
  const before = occurrences(state, optimizationOptions.start, optimizationOptions.end), after = occurrences(next, optimizationOptions.start, optimizationOptions.end);
  assert.deepEqual(after.map(item=>item.id).sort(), before.map(item=>item.id).sort());
  assert.deepEqual(next.tasks, original.tasks);
  assert.deepEqual(next.overrides['flex-0@2026-10-05'].subtaskDone,['prepared']);
  assert.ok(after.every(item=>item.memberId==='alice' && item.status==='todo' && !item.mergedInto));
  assert.equal(occurrences(next,'2026-10-12','2026-10-12').length,6);
  assert.equal(Object.keys(state.overrides).length,1);
});

test('reorganization protects daily, fixed, past and completed actions and obeys selected weekdays', () => {
  const state = optimizationFixture();
  state.tasks[0].recurrence='daily'; state.tasks[1].fixedDay=true;
  state.tasks[2].weekdays=[0,2];
  const completed = occurrences(state,'2026-10-05','2026-10-05').find(item=>item.taskId==='flex-3');
  const marked = updateOccurrences(state,[completed],{status:'done'},'alice');
  const proposal = proposeReorganization(marked,optimizationOptions);
  assert.ok(proposal.moves.every(move=>!['flex-0','flex-1','flex-3'].includes(move.taskId)));
  assert.ok(proposal.moves.filter(move=>move.taskId==='flex-2').every(move=>[1,3].includes(parseDate(move.to).getUTCDay())));
  const pastProposal = proposeReorganization(marked,{...optimizationOptions,notBefore:'2026-10-06'});
  assert.ok(pastProposal.moves.every(move=>move.from>='2026-10-06' && move.to>='2026-10-06'));
  const next = applyReorganization(marked,optimizationOptions,marked.revision);
  assert.deepEqual(next.overrides[completed.id],marked.overrides[completed.id]);
});

test('monthly reorganization keeps weekly occurrences in their original weeks and never creates collisions', () => {
  const state=optimizationFixture();
  state.tasks[0].recurrence='monthly'; delete state.tasks[1].estimatedMinutes;
  const options={...optimizationOptions,start:'2026-10-01',end:'2026-10-31'};
  const proposal=proposeReorganization(state,options);
  assert.ok(proposal.unknown>0);
  assert.ok(proposal.moves.filter(move=>move.taskId!=='flex-0').every(move=>weekStart(move.from)===weekStart(move.to)));
  const next=applyReorganization(state,options,state.revision);
  const before=occurrences(state,options.start,options.end), after=occurrences(next,options.start,options.end);
  assert.deepEqual(after.map(item=>item.id).sort(),before.map(item=>item.id).sort());
  assert.equal(new Set(after.map(item=>`${item.taskId}@${item.date}`)).size,after.length);
  assert.deepEqual(next.tasks,state.tasks);
  assert.ok(proposal.moves.every(move=>move.to>=options.notBefore && move.to<=options.end));
});

test('session flexible actions remain grouped and personal optimization never moves another member', () => {
  const state=optimizationFixture(); state.tasks[0].memberId='bob';
  state.sessions=[{id:'s',title:'Session',groupId:'kitchen',enabled:true,taskIds:['flex-1','flex-2']}];
  const options={...optimizationOptions,memberId:'alice'};
  const next=applyReorganization(state,options,state.revision);
  const items=occurrences(next,options.start,options.end);
  assert.equal(items.find(item=>item.taskId==='flex-0').date,'2026-10-05');
  assert.equal(items.find(item=>item.taskId==='flex-1').date,items.find(item=>item.taskId==='flex-2').date);
  assert.ok(proposeReorganization(state,options).moves.every(move=>move.taskId!=='flex-0'));
});

test('reorganization refuses stale approval, invalid duration assumptions and unsupported period sizes', () => {
  const state=optimizationFixture();
  assert.throws(()=>applyReorganization(state,optimizationOptions,1),/planning a changé/);
  assert.throws(()=>proposeReorganization(state,{...optimizationOptions,fallbackMinutes:0}),/invalides/);
  assert.throws(()=>proposeReorganization(state,{...optimizationOptions,end:'2026-11-30'}),/invalides/);
  state.tasks[0].fixedDay='yes'; assert.throws(()=>validateState(state),/Jour fixe/);
});


const rotationFixture = () => {
  const state=fixture(); state.tasks[0].anchor='2026-09-29'; state.tasks[0].estimatedMinutes=20;
  const previous=occurrences(state,'2026-09-29','2026-09-29')[0];
  return updateOccurrences(state,[previous],{status:'done'},'alice');
};

test('room preference reduces split rooms with bounded daily load and unchanged action counts',()=>{
  const state=fixture(); state.tasks=[0,1,2].map(index=>({...state.tasks[0],id:`room-${index}`,estimatedMinutes:10}));
  const plain=proposeReorganization(state,{...optimizationOptions,groupRooms:false});
  const grouped=proposeReorganization(state,{...optimizationOptions,groupRooms:true});
  assert.ok(grouped.roomsAfter<plain.roomsAfter);
  assert.ok(Math.max(...grouped.after.map(day=>day.minutes))<=grouped.balancedPeak+Math.max(15,Math.round(grouped.balancedPeak*.1)));
  assert.equal(grouped.after.reduce((sum,day)=>sum+day.minutes,0),30);
  assert.equal(grouped.after.reduce((sum,day)=>sum+day.count,0),3);
});

test('rotation uses the last actual checkbox actor and is only applied with the proposal',()=>{
  const state=rotationFixture(), original=structuredClone(state);
  const proposal=proposeReorganization(state,optimizationOptions);
  assert.equal(proposal.reassignments.length,1);
  assert.equal(proposal.reassignments[0].from,'alice'); assert.equal(proposal.reassignments[0].to,'bob');
  assert.deepEqual(state,original);
  const next=applyReorganization(state,optimizationOptions,state.revision);
  assert.equal(occurrences(next,'2026-10-06','2026-10-06')[0].memberId,'bob');
  assert.equal(next.tasks[0].memberId,'alice');
  assert.deepEqual(next.overrides['clean@2026-09-29'],state.overrides['clean@2026-09-29']);
  const byBob=structuredClone(state); byBob.overrides['clean@2026-09-29'].completedBy='bob';
  assert.equal(proposeReorganization(byBob,optimizationOptions).reassignments.length,0);
});

test('rotation respects selected participants, disables itself in personal scope and preserves pending assignments',()=>{
  const state=rotationFixture();
  state.tasks[0].rotationMembers=['alice']; assert.equal(proposeReorganization(state,optimizationOptions).reassignments.length,0);
  state.tasks[0].rotationMembers=['alice','bob'];
  assert.equal(proposeReorganization(state,{...optimizationOptions,memberId:'alice'}).reassignments.length,0);
  assert.equal(proposeReorganization(state,{...optimizationOptions,rotate:false}).reassignments.length,0);
  state.tasks[0].rotationEnabled=false; assert.equal(proposeReorganization(state,optimizationOptions).reassignments.length,0);
  state.tasks[0].rotationEnabled=true;
  const unfinished=structuredClone(state); unfinished.tasks[0].anchor='2026-09-22';
  unfinished.overrides['clean@2026-09-22']={...unfinished.overrides['clean@2026-09-29'],id:'clean@2026-09-22',scheduledDate:'2026-09-22',date:'2026-09-22'};
  delete unfinished.overrides['clean@2026-09-29'];
  assert.equal(proposeReorganization(unfinished,optimizationOptions).reassignments.length,0);
  const assigned=structuredClone(state); assigned.overrides['clean@2026-10-06']={id:'clean@2026-10-06',taskId:'clean',scheduledDate:'2026-10-06',date:'2026-10-06',memberId:'alice',status:'todo'};
  assert.equal(proposeReorganization(assigned,optimizationOptions).reassignments.length,0);
});

test('rotation retains completion history across an edited series and leaves current-day work assigned',()=>{
  const state=rotationFixture();
  const next=updateSeries(state,{taskId:'clean',scheduledDate:'2026-10-06'},{anchor:'2026-10-06',title:'Updated routine'});
  assert.equal(next.tasks[1].seriesId,'clean');
  assert.equal(proposeReorganization(next,optimizationOptions).reassignments[0].to,'bob');
  assert.equal(proposeReorganization(next,{...optimizationOptions,notBefore:'2026-10-06'}).reassignments.length,0);
  next.tasks[1].rotationMembers=['missing']; assert.throws(()=>validateState(next),/Participants/);
});
