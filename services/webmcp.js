import { occurrences, isDue, occurrenceId } from '../domain/planning.js';
import { parseDate, daysBetween } from '../domain/dates.js';

// Optional browser capability. These tools use the exact services used by the UI.
export function registerPlanningTools(context, getState, getService) {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const register = tool => {
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); }
    catch { /* Unsupported implementations must not prevent use of the agenda. */ }
  };
  register({
    name: 'list_household_tasks',
    title: 'Lire les tâches du foyer',
    description: 'Lister les échéances du planning connecté entre deux dates incluses, avec leurs statuts et responsables.',
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: { type: 'object', properties: { start: { type: 'string', format: 'date' }, end: { type: 'string', format: 'date' } }, required: ['start', 'end'], additionalProperties: false },
    execute(input) {
      const state = getState(); if (!state) throw new Error('Connecte-toi au planning d’abord.');
      if (!input || typeof input.start !== 'string' || typeof input.end !== 'string') throw new Error('Deux dates sont nécessaires.');
      parseDate(input.start); parseDate(input.end);
      if (daysBetween(input.start, input.end) < 0 || daysBetween(input.start, input.end) > 62) throw new Error('Choisis une période de 63 jours maximum.');
      return occurrences(state, input.start, input.end).map(o => ({ id: o.id, title: o.task.title, date: o.date, status: o.status, memberId: o.memberId, groupId: o.task.groupId }));
    },
  });
  register({
    name: 'set_household_tasks_completion',
    title: 'Cocher ou décocher des tâches',
    description: 'Modifier la réalisation des échéances indiquées dans le planning connecté. Les prochaines répétitions ne sont pas modifiées.',
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputSchema: { type: 'object', properties: { occurrenceIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }, completed: { type: 'boolean' } }, required: ['occurrenceIds', 'completed'], additionalProperties: false },
    async execute(input) {
      const state = getState(), service = getService(); if (!state || !service) throw new Error('Connecte-toi au planning d’abord.');
      if (!input || !Array.isArray(input.occurrenceIds) || !input.occurrenceIds.length || input.occurrenceIds.length > 50 || typeof input.completed !== 'boolean') throw new Error('Échéances ou statut invalides.');
      const items = [...new Set(input.occurrenceIds)].map(id => {
        if (typeof id !== 'string') throw new Error('Identifiant invalide.');
        const at = id.lastIndexOf('@'), task = state.tasks.find(t => t.id === id.slice(0, at)), date = id.slice(at + 1);
        if (!task || (!isDue(task, date) && state.overrides[id]?.status !== 'done') || id !== occurrenceId(task.id, date)) throw new Error('Échéance introuvable.');
        return { id, taskId: task.id, task, date, scheduledDate: date, memberId: task.memberId, status: 'todo', ...state.overrides[id] };
      });
      await service.update(items, { status: input.completed ? 'done' : 'todo' });
      return { updated: items.length, status: input.completed ? 'done' : 'todo' };
    },
  });
  return () => lifecycle.abort();
}
