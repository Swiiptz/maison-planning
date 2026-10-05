import { validateState, updateOccurrences, updateSeries, uid, applyReorganization } from '../domain/planning.js';
import { addDays, today } from '../domain/dates.js';

export function createPlanningService(adapter, actorId) {
  let state;
  let pending = false;
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(structuredClone(state)); };
  adapter.subscribe(value => { state = value; emit(); });
  async function save(transform) {
    if (pending) throw new Error('Enregistrement en cours. Réessaie dans un instant.');
    if (!state) throw new Error('Le planning est encore en cours de chargement.');
    pending = true;
    try {
      const next = transform(structuredClone(state));
      validateState(next);
      state = await adapter.commit(next, state.revision);
      emit();
      return structuredClone(state);
    } catch (error) {
      try { state = await adapter.load(); emit(); } catch { /* Preserve last snapshot when offline. */ }
      throw error;
    } finally { pending = false; }
  }
  return {
    async load() { state = await adapter.load(); return structuredClone(state); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    update(items, patch, options = {}) { return save(s => {
      if (options.expectedRevision !== undefined && s.revision !== options.expectedRevision) throw new Error('Le planning a changé. Réessaie le déplacement pour vérifier les doublons.');
      const fresh = items.map(item => ({ ...item, ...(s.overrides[item.id] ?? {}) }));
      return updateOccurrences(s, fresh, patch, actorId, options);
    }); },
    setSubtask(item, subtaskId, checked) { return save(s => {
      const task = s.tasks.find(t => t.id === item.taskId);
      if (!task?.subtasks?.some(subtask => subtask.id === subtaskId) || typeof checked !== 'boolean') throw new Error('Sous-tâche introuvable.');
      const fresh = { ...item, ...(s.overrides[item.id] ?? {}) };
      const done = new Set(fresh.subtaskDone ?? []);
      if (checked) done.add(subtaskId); else done.delete(subtaskId);
      return updateOccurrences(s, [fresh], { subtaskDone: [...done] }, actorId);
    }); },
    reorganize(options, expectedRevision) { return save(s => { if (options.notBefore !== today()) throw new Error('La journée a changé. Génère une nouvelle proposition.'); return applyReorganization(s, options, expectedRevision); }); },
    restoreMove(overrides, expectedRevision) { return save(s => {
      if (s.revision !== expectedRevision) throw new Error('Le planning a changé depuis le déplacement. Annulation impossible sans écraser une modification.');
      s.overrides = structuredClone(overrides); return s;
    }); },
    updateSeries(item, changes) { return save(s => updateSeries(s, item, changes)); },
    updateFuture(items, changes) { return save(s => items.reduce((next, item) => updateSeries(next, item, changes), s)); },
    restoreDates(items) { return save(s => items.reduce((next, item) => updateOccurrences(next, [item], { date: item.previousDate }, actorId), s)); },
    createTask(task) { return save(s => { s.tasks.push({ ...task, id: uid(), archived: false, until: null, sourceFile: '', reviewNote: '' }); return s; }); },
    editTask(taskId, changes) { return save(s => { const task = s.tasks.find(t => t.id === taskId); if (!task) throw new Error('Tâche introuvable.'); Object.assign(task, changes); return s; }); },
    archive(taskId, date) { return save(s => {
      const task = s.tasks.find(t => t.id === taskId); task.archived = true; task.until = addDays(date, -1);
      return s;
    }); },
    createSession(session) { return save(s => {
      for (const current of s.sessions) current.taskIds = current.taskIds.filter(id => !session.taskIds.includes(id));
      s.sessions.push({ ...session, id: uid(), enabled: true }); return s;
    }); },
    addMember(name) { return save(s => { s.members.push({ id: uid(), name: name.trim() }); return s; }); },
    renameMember(id, name) { return save(s => { s.members.find(m => m.id === id).name = name.trim(); return s; }); },
    setGroupColor(id, color) { return save(s => { s.groups.find(g => g.id === id).color = color; return s; }); },
    exportData() { return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data: state }, null, 2); },
    importData(text) {
      const parsed = JSON.parse(text);
      const imported = validateState(parsed.data ?? parsed);
      return save(s => {
        // Keep registered identities valid: importing cannot remove existing members.
        const members = new Map(s.members.map(m => [m.id, m]));
        for (const member of imported.members) members.set(member.id, member);
        return { ...imported, members: [...members.values()], household: s.household, revision: s.revision };
      });
    },
  };
}
