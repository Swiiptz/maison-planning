import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPlanningTools } from '../app/services/webmcp.js';
import { createPlanningService } from '../app/services/planning-service.js';

test('browser tool contracts read and update the same service, rejecting invalid actions', async () => {
  let state = { schemaVersion: 1, revision: 0, household: { id: 'house', name: 'Maison' }, members: [{ id: 'member', name: 'Moi' }], groups: [{ id: 'room', name: 'Cuisine', color: '#996633' }], tasks: [{ id: 'task', title: 'Nettoyer', groupId: 'room', memberId: 'member', anchor: '2026-10-05', recurrence: 'weekly' }], sessions: [], overrides: {} };
  const adapter = { load: async () => structuredClone(state), subscribe: () => () => {}, commit: async (next, revision) => { assert.equal(revision, state.revision); state = { ...next, revision: revision + 1 }; return structuredClone(state); } };
  const service = createPlanningService(adapter, 'member'); await service.load();
  const tools = new Map(), context = { registerTool(tool, options) { tools.set(tool.name, tool); assert.ok(options.signal); } };
  const stop = registerPlanningTools(context, () => state, () => service);
  const read = tools.get('list_household_tasks'), complete = tools.get('set_household_tasks_completion');
  assert.equal(read.annotations.readOnlyHint, true);
  assert.equal(complete.annotations.readOnlyHint, false);
  assert.equal(read.execute({ start: '2026-10-05', end: '2026-10-05' })[0].status, 'todo');
  const result = await complete.execute({ occurrenceIds: ['task@2026-10-05'], completed: true });
  assert.equal(result.updated, 1); assert.equal(state.overrides['task@2026-10-05'].completedBy, 'member');
  assert.equal(read.execute({ start: '2026-10-05', end: '2026-10-05' })[0].status, 'done');
  await assert.rejects(complete.execute({ occurrenceIds: ['missing@2026-10-05'], completed: true }), /introuvable/);
  assert.equal(state.revision, 1);
  assert.throws(() => read.execute({ start: '2026-10-05', end: '2026-10-04' }), /période/);
  stop();
});
