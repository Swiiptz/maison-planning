import { addDays, weekStart, today } from '../domain/dates.js';
import { uid } from '../domain/planning.js';

export function seedState(catalog, { demo = false, memberName = 'Moi', memberId = uid() } = {}) {
  const now = today(), monday = weekStart(now);
  const members = demo ? [{ id: 'member-camille', name: 'Camille' }, { id: 'member-alex', name: 'Alex' }] : [{ id: memberId, name: memberName }];
  const tasks = catalog.tasks.map((task, index) => {
    const groupIndex = catalog.groups.findIndex(g => g.id === task.groupId);
    const day = task.weekday ?? (groupIndex % 5);
    let anchor = task.recurrence === 'daily' ? (demo ? monday : now) : addDays(monday, day);
    if (!demo && anchor < now) anchor = addDays(anchor, 7);
    return { ...task, anchor: task.recurrence ? anchor : null, memberId: demo ? members[index % 2].id : members[0].id, archived: false, until: null };
  });
  const sessions = catalog.groups.filter(g => g.kind === 'room' && g.id !== 'garden').map(g => ({ id: `session-${g.id}`, title: `Ménage · ${g.name}`, groupId: g.id, taskIds: tasks.filter(t => t.groupId === g.id && t.recurrence).map(t => t.id), enabled: true }));
  return { schemaVersion: 1, revision: 0, household: { id: demo ? 'demo-household' : uid(), name: demo ? 'Notre maison' : 'Mon foyer' }, members, groups: structuredClone(catalog.groups), tasks, sessions, overrides: {} };
}
