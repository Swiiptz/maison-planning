import { addDays, addMonths, daysBetween, datesBetween, parseDate } from './dates.js';

export const RECURRENCES = {
  daily: { label: 'Chaque jour', short: 'Quotidien', color: '#668dd2', ink: '#335997', bg: '#edf3ff' },
  weekly: { label: 'Chaque semaine', short: 'Hebdo.', color: '#73a166', ink: '#426239', bg: '#edf5e9' },
  fortnightly: { label: 'Toutes les 2 semaines', short: '2 semaines', color: '#d0ab26', ink: '#79600c', bg: '#fff8da' },
  monthly: { label: 'Chaque mois', short: 'Mensuel', color: '#e19a31', ink: '#895513', bg: '#fff1de' },
  bimonthly: { label: 'Tous les 2 mois', short: '2 mois', color: '#bf69c1', ink: '#804181', bg: '#f7eafa' },
  once: { label: 'Une seule fois', short: 'Ponctuel', color: '#8c919a', ink: '#535964', bg: '#eef0f3' },
};
export const uid = () => globalThis.crypto.randomUUID();
export const occurrenceId = (taskId, scheduledDate) => `${taskId}@${scheduledDate}`;

export function isDue(task, date) {
  if (!task.anchor || !task.recurrence || date < task.anchor || (task.startDate && date < task.startDate) || (task.until && date > task.until)) return false;
  const diff = daysBetween(task.anchor, date);
  if (task.recurrence === 'once') return diff === 0;
  const interval = { daily: 1, weekly: 7, fortnightly: 14 }[task.recurrence];
  if (interval) return diff % interval === 0;
  const a = parseDate(task.anchor), d = parseDate(date);
  const months = (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + d.getUTCMonth() - a.getUTCMonth();
  const every = task.recurrence === 'bimonthly' ? 2 : 1;
  return months % every === 0 && addMonths(task.anchor, months) === date;
}

export function occurrences(state, start, end) {
  const result = new Map();
  const dates = datesBetween(start, end);
  for (const task of state.tasks) {
    for (const date of dates) {
      if (!isDue(task, date)) continue;
      const id = occurrenceId(task.id, date);
      const override = state.overrides[id];
      const item = { id, taskId: task.id, scheduledDate: date, date, memberId: task.memberId ?? '', status: 'todo', ...override, task };
      if (item.date >= start && item.date <= end) result.set(id, item);
    }
  }
  // Include occurrences moved into the visible range, even from a different month.
  for (const override of Object.values(state.overrides)) {
    const task = state.tasks.find(t => t.id === override.taskId);
    if (!task || (override.status !== 'done' && !isDue(task, override.scheduledDate)) || override.date < start || override.date > end) continue;
    result.set(override.id, { memberId: task.memberId ?? '', status: 'todo', ...override, task });
  }
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date) || a.task.title.localeCompare(b.task.title, 'fr'));
}

export function cardsForDate(state, items, date, grouped = true) {
  const cards = [], bundles = new Map();
  for (const item of items.filter(o => o.date === date)) {
    const session = grouped && item.sessionId !== '' && state.sessions.find(s => s.enabled && (item.sessionId ? s.id === item.sessionId : s.taskIds.includes(item.taskId)));
    if (!session) { cards.push({ id: item.id, date, title: item.task.title, groupId: item.task.groupId, items: [item], session: false }); continue; }
    const key = `${session.id}@${date}`;
    if (!bundles.has(key)) bundles.set(key, { id: key, date, title: session.title, groupId: session.groupId, items: [], session: true });
    bundles.get(key).items.push(item);
  }
  cards.push(...bundles.values());
  return cards.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

export function updateOccurrences(state, items, patch, actorId) {
  const next = structuredClone(state);
  for (const item of items) {
    const value = { id: item.id, taskId: item.taskId, scheduledDate: item.scheduledDate, date: item.date, memberId: item.memberId, status: item.status, ...(next.overrides[item.id] ?? {}), ...patch };
    if (patch.date) parseDate(patch.date);
    if (patch.status === 'done') { value.completedAt = new Date().toISOString(); value.completedBy = actorId; }
    if (patch.status === 'todo') { delete value.completedAt; delete value.completedBy; }
    next.overrides[item.id] = value;
  }
  return next;
}

export function updateSeries(state, item, changes) {
  const next = structuredClone(state);
  const current = next.tasks.find(t => t.id === item.taskId);
  if (!current) throw new Error('Tâche introuvable.');
  const newTask = { ...current, ...changes, id: uid(), anchor: changes.anchor ?? item.scheduledDate, until: null, archived: false, reviewNote: '' };
  newTask.startDate = changes.anchor === current.anchor || changes.anchor === undefined ? item.scheduledDate : newTask.anchor;
  parseDate(newTask.anchor);
  current.until = addDays(item.scheduledDate, -1);
  current.archived = true;
  // Keep completed exceptions; their historical occurrence must remain valid.
  for (const override of Object.values(next.overrides)) {
    if (override.taskId !== current.id || override.scheduledDate < item.scheduledDate) continue;
    if (override.status === 'done') continue;
    delete next.overrides[override.id];
  }
  next.tasks.push(newTask);
  for (const session of next.sessions) if (session.taskIds.includes(current.id)) session.taskIds.push(newTask.id);
  return next;
}

export function earliestAnchor(state, fallback) {
  return state.tasks.reduce((min, t) => t.anchor && t.anchor < min ? t.anchor : min, fallback);
}

export function validateState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.groups) || !Array.isArray(state.members) || !Array.isArray(state.sessions) || !state.overrides || typeof state.overrides !== 'object' || Array.isArray(state.overrides)) throw new Error('Format de sauvegarde incompatible.');
  if (state.tasks.length > 3000 || Object.keys(state.overrides).length > 30000) throw new Error('Sauvegarde trop volumineuse.');
  for (const list of [state.tasks, state.groups, state.members, state.sessions]) {
    const ids = new Set();
    for (const item of list) {
      if (typeof item.id !== 'string' || !/^[a-zA-Z0-9@._-]{1,180}$/.test(item.id) || ids.has(item.id)) throw new Error('Identifiant invalide ou dupliqué.');
      ids.add(item.id);
    }
  }
  const groups = new Set(state.groups.map(g => g.id)), members = new Set(state.members.map(m => m.id));
  for (const group of state.groups) if (typeof group.name !== 'string' || group.name.length > 120 || !/^#[0-9a-fA-F]{6}$/.test(group.color)) throw new Error('Pièce invalide.');
  for (const member of state.members) if (typeof member.name !== 'string' || !member.name.trim() || member.name.length > 100) throw new Error('Membre invalide.');
  const tasks = new Map(state.tasks.map(t => [t.id, t]));
  for (const task of state.tasks) {
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 600 || !groups.has(task.groupId) || (task.memberId && !members.has(task.memberId)) || (task.recurrence && !RECURRENCES[task.recurrence])) throw new Error('Tâche invalide.');
    if (task.anchor) parseDate(task.anchor);
    if (task.until) parseDate(task.until);
    if (task.startDate) parseDate(task.startDate);
  }
  for (const session of state.sessions) if (typeof session.title !== 'string' || !session.title.trim() || session.title.length > 160 || !groups.has(session.groupId) || !Array.isArray(session.taskIds) || session.taskIds.some(id => !tasks.has(id))) throw new Error('Séance invalide.');
  for (const [key, o] of Object.entries(state.overrides)) {
    if (!tasks.has(o.taskId) || key !== occurrenceId(o.taskId, o.scheduledDate) || o.id !== key || !['todo', 'done'].includes(o.status) || (o.memberId && !members.has(o.memberId))) throw new Error('Échéance invalide.');
    parseDate(o.date); parseDate(o.scheduledDate);
  }
  return state;
}
