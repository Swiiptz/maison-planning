import { addDays, addMonths, daysBetween, datesBetween, parseDate, weekStart } from './dates.js';

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

export function durationEstimate(tasks) {
  const known = tasks.filter(task => Number.isInteger(task.estimatedMinutes) && task.estimatedMinutes > 0);
  return { minutes: known.reduce((sum, task) => sum + task.estimatedMinutes, 0), missing: tasks.length - known.length };
}
export function matchesDuration(task, filter) {
  const minutes = task.estimatedMinutes;
  if (!filter) return true;
  if (filter === 'unknown') return !minutes;
  if (!minutes) return false;
  if (filter === 'short') return minutes <= 15;
  if (filter === 'medium') return minutes > 15 && minutes <= 30;
  if (filter === 'long') return minutes > 30;
  return true;
}
export function sortDurations(values, estimate, direction) {
  if (!['duration-asc', 'duration-desc'].includes(direction)) return values;
  return [...values].sort((a, b) => {
    const left = estimate(a), right = estimate(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return direction === 'duration-asc' ? left - right : right - left;
  });
}

export function isDue(task, date) {
  if (!task.anchor || !task.recurrence || date < task.anchor || (task.startDate && date < task.startDate) || (task.until && date > task.until)) return false;
  const diff = daysBetween(task.anchor, date);
  if (task.recurrence === 'once') return diff === 0;
  if (task.weekdays?.length && ['daily', 'weekly', 'fortnightly'].includes(task.recurrence)) {
    const weekday = (parseDate(date).getUTCDay() + 6) % 7;
    if (!task.weekdays.includes(weekday)) return false;
    if (task.recurrence !== 'fortnightly') return true;
    return Math.floor(daysBetween(weekStart(task.anchor), weekStart(date)) / 7) % 2 === 0;
  }
  const interval = { daily: 1, weekly: 7, fortnightly: 14 }[task.recurrence];
  if (interval) return diff % interval === 0;
  const a = parseDate(task.anchor), d = parseDate(date);
  const months = (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + d.getUTCMonth() - a.getUTCMonth();
  const every = task.recurrence === 'bimonthly' ? 2 : 1;
  return months % every === 0 && addMonths(task.anchor, months) === date;
}

export function defaultResponsible(task, date) {
  return task.unassignedPeriods?.some(period => period.start <= date && period.end >= date) ? '' : task.memberId ?? '';
}
export function mergeUnassignedPeriods(periods) {
  const sorted = periods.map(period => ({ ...period })).sort((a,b) => a.start.localeCompare(b.start));
  const result = [];
  for (const period of sorted) {
    const previous = result.at(-1);
    if (previous && period.start <= addDays(previous.end, 1)) previous.end = previous.end > period.end ? previous.end : period.end;
    else result.push(period);
  }
  return result;
}

export function occurrences(state, start, end) {
  const result = new Map();
  const dates = datesBetween(start, end);
  for (const task of state.tasks) {
    for (const date of dates) {
      if (!isDue(task, date)) continue;
      const id = occurrenceId(task.id, date);
      const override = state.overrides[id];
      const item = { id, taskId: task.id, scheduledDate: date, date, memberId: defaultResponsible(task, override?.date ?? date), status: 'todo', ...override, task };
      if (!item.skipped && !item.mergedInto && item.date >= start && item.date <= end) result.set(id, item);
    }
  }
  // Include occurrences moved into the visible range, even from a different month.
  for (const override of Object.values(state.overrides)) {
    const task = state.tasks.find(t => t.id === override.taskId);
    if (!task || override.skipped || override.mergedInto || (override.status !== 'done' && !isDue(task, override.scheduledDate)) || override.date < start || override.date > end) continue;
    result.set(override.id, { memberId: defaultResponsible(task, override.date), status: 'todo', ...override, task });
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

export function moveCollisions(state, items, date) {
  parseDate(date);
  const targetItems = occurrences(state, date, date);
  const seen = new Map();
  for (const target of targetItems) {
    if (!seen.has(target.taskId) || target.status === 'done') seen.set(target.taskId, target);
  }
  return items.flatMap(item => {
    if (item.status === 'done' || item.mergedInto) return [];
    const target = seen.get(item.taskId);
    seen.set(item.taskId, target ?? item);
    return target && target.id !== item.id ? [{ source: item, target }] : [];
  });
}

export function updateOccurrences(state, items, patch, actorId, { merge = false } = {}) {
  const collisions = patch.date ? moveCollisions(state, items, patch.date) : [];
  if (collisions.length && !merge) throw new Error('Cette tâche existe déjà ce jour-là. Confirme le regroupement ou annule le déplacement.');
  const next = structuredClone(state);
  for (const item of items) {
    if (item.skipped || next.overrides[item.id]?.skipped) throw new Error('Cette échéance a été retirée. Actualise le planning.');
    if (item.mergedInto || next.overrides[item.id]?.mergedInto) throw new Error('Cette échéance a été regroupée. Actualise le planning.');
    if (patch.date && item.status === 'done') continue;
    const value = { id: item.id, taskId: item.taskId, scheduledDate: item.scheduledDate, date: item.date, memberId: item.memberId, status: item.status, ...(next.overrides[item.id] ?? {}), ...patch };
    if (patch.date) parseDate(patch.date);
    if (patch.status === 'done') { value.completedAt = new Date().toISOString(); value.completedBy = actorId; }
    if (patch.status === 'todo') { delete value.completedAt; delete value.completedBy; }
    next.overrides[item.id] = value;
  }
  // Keep the destination's assignee and completion, and retain the source
  // occurrence as an explicit link instead of deleting its history.
  for (const { source, target } of collisions) {
    next.overrides[source.id].mergedInto = target.id;
    next.overrides[source.id].mergedAt = new Date().toISOString();
    next.overrides[source.id].mergedBy = actorId;
    if (target.date === patch.date) {
      next.overrides[target.id] = { id: target.id, taskId: target.taskId, scheduledDate: target.scheduledDate, date: target.date, memberId: target.memberId, status: target.status, ...(state.overrides[target.id] ?? {}) };
    }
  }
  return next;
}

export function updateSeries(state, item, changes) {
  const next = structuredClone(state);
  const current = next.tasks.find(t => t.id === item.taskId);
  if (!current) throw new Error('Tâche introuvable.');
  const newTask = { ...current, ...changes, seriesId: current.seriesId ?? current.id, id: uid(), anchor: changes.anchor ?? item.scheduledDate, until: null, archived: false, reviewNote: '' };
  if (current.weekdays?.length && changes.anchor && changes.weekdays === undefined) {
    const shift = daysBetween(item.scheduledDate, changes.anchor);
    newTask.weekdays = current.weekdays.map(day => ((day + shift) % 7 + 7) % 7).sort((a, b) => a - b);
  }
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

// A bounded heuristic balances estimated workload, without removing occurrences
// or changing series. Unknown durations are explicit assumptions, never zero.
export function proposeReorganization(state, { start, end, notBefore, memberId = '', fallbackMinutes = 15, groupRooms = true, rotate = true }) {
  parseDate(start); parseDate(end); parseDate(notBefore);
  if (end < start || daysBetween(start, end) > 30 || !Number.isInteger(fallbackMinutes) || fallbackMinutes < 1 || fallbackMinutes > 1440 || (memberId && !state.members.some(member => member.id === memberId))) throw new Error('Période ou paramètres de réorganisation invalides.');
  const all = occurrences(state, start, end);
  if (all.length > 3000) throw new Error('Trop d’actions pour une seule proposition. Choisis une semaine ou un membre.');
  const dates = datesBetween(start, end), positions = new Map(all.map(item => [item.id, item.date]));
  const chosen = all.filter(item => !memberId || item.memberId === memberId);
  const pending = chosen.filter(item => item.status !== 'done');
  const weight = item => item.task.estimatedMinutes || fallbackMinutes;
  const loads = new Map(dates.map(date => [date, {minutes:0, count:0}]));
  for (const item of pending) { const load = loads.get(item.date); load.minutes += weight(item); load.count++; }
  const movable = pending.filter(item => item.date >= notBefore && item.task.recurrence !== 'daily' && !item.task.fixedDay);
  const units = new Map();
  for (const item of movable) {
    const session = item.sessionId !== '' && state.sessions.find(session => session.enabled && (item.sessionId ? session.id === item.sessionId : session.taskIds.includes(item.taskId)));
    const key = session ? `${session.id}@${item.date}` : item.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(item);
  }
  // Neighbouring occurrences constrain repeated actions so their order survives.
  const neighbours = new Map();
  for (const item of occurrences(state, addDays(start, -62), addDays(end, 62))) {
    if (!neighbours.has(item.taskId)) neighbours.set(item.taskId, []);
    neighbours.get(item.taskId).push(item);
  }
  const snapshot = () => dates.map(date => ({date, ...loads.get(date)}));
  const before = snapshot();
  const canUse = (item, target) => {
    const task = item.task;
    if (target < notBefore || target < task.anchor || (task.startDate && target < task.startDate) || (task.until && target > task.until)) return false;
    if (['weekly', 'fortnightly'].includes(task.recurrence) && weekStart(target) !== weekStart(item.date)) return false;
    if (task.weekdays?.length && !task.weekdays.includes((parseDate(target).getUTCDay() + 6) % 7)) return false;
    for (const other of neighbours.get(item.taskId) ?? []) {
      if (other.id === item.id) continue;
      const otherDate = positions.get(other.id) ?? other.date;
      if (otherDate === target || (other.scheduledDate < item.scheduledDate && otherDate >= target) || (other.scheduledDate > item.scheduledDate && otherDate <= target)) return false;
    }
    return true;
  };
  // Accept only changes that improve squared daily time (then action counts).
  for (let pass = 0; pass < 200; pass++) {
    let best = null;
    for (const items of units.values()) {
      const source = positions.get(items[0].id), sourceLoad = loads.get(source);
      const minutes = items.reduce((sum, item) => sum + weight(item), 0), count = items.length;
      for (const target of dates) {
        if (target === source || !items.every(item => canUse(item, target))) continue;
        const targetLoad = loads.get(target);
        const timeGain = 2 * minutes * (sourceLoad.minutes - targetLoad.minutes - minutes);
        const countGain = 2 * count * (sourceLoad.count - targetLoad.count - count);
        if (timeGain < 0 || (timeGain === 0 && countGain <= 0)) continue;
        const distance = Math.abs(daysBetween(source, target));
        if (!best || timeGain > best.timeGain || (timeGain === best.timeGain && (countGain > best.countGain || (countGain === best.countGain && distance < best.distance)))) best = {items, source, target, minutes, count, timeGain, countGain, distance};
      }
    }
    if (!best) break;
    loads.get(best.source).minutes -= best.minutes; loads.get(best.source).count -= best.count;
    loads.get(best.target).minutes += best.minutes; loads.get(best.target).count += best.count;
    for (const item of best.items) positions.set(item.id, best.target);
  }
  const balancedPeak = Math.max(0, ...snapshot().map(day => day.minutes));
  const roomVisits = () => new Set(pending.map(item => `${positions.get(item.id)}|${item.task.groupId}`)).size;
  const roomsBefore = new Set(pending.map(item => `${item.date}|${item.task.groupId}`)).size;
  if (groupRooms) {
    const peakLimit = balancedPeak + Math.max(15, Math.round(balancedPeak * .1));
    for (let pass = 0; pass < 200; pass++) {
      const counts = new Map();
      for (const item of pending) { const key = `${positions.get(item.id)}|${item.task.groupId}`; counts.set(key,(counts.get(key) ?? 0)+1); }
      let best = null;
      for (const items of units.values()) {
        const source = positions.get(items[0].id), minutes = items.reduce((sum,item)=>sum+weight(item),0);
        const rooms = new Map(); for (const item of items) rooms.set(item.task.groupId,(rooms.get(item.task.groupId) ?? 0)+1);
        for (const target of dates) {
          if (target === source || loads.get(target).minutes + minutes > peakLimit || !items.every(item=>canUse(item,target))) continue;
          const roomGain = [...rooms].reduce((sum,[room,count])=>sum + (counts.get(`${source}|${room}`)===count ? 1:0) - (counts.has(`${target}|${room}`) ? 0:1),0);
          const timeGain = 2 * minutes * (loads.get(source).minutes-loads.get(target).minutes-minutes);
          if (roomGain <= 0 || timeGain < -900 * roomGain) continue;
          const distance = Math.abs(daysBetween(source,target));
          if (!best || roomGain > best.roomGain || (roomGain===best.roomGain && (timeGain>best.timeGain || (timeGain===best.timeGain && distance<best.distance)))) best={items,source,target,minutes,roomGain,timeGain,distance};
        }
      }
      if (!best) break;
      loads.get(best.source).minutes-=best.minutes; loads.get(best.source).count-=best.items.length;
      loads.get(best.target).minutes+=best.minutes; loads.get(best.target).count+=best.items.length;
      for (const item of best.items) positions.set(item.id,best.target);
    }
  }
  const reassignments = [];
  if (rotate && !memberId && state.members.length > 1) {
    const root = task => task.seriesId ?? task.id;
    const taskById = new Map(state.tasks.map(task=>[task.id,task]));
    const history = Object.values(state.overrides).filter(item=>item.status==='done' && !item.mergedInto && item.completedBy && taskById.has(item.taskId));
    const memberLoads = new Map();
    for (const item of pending) { const key=`${positions.get(item.id)}|${item.memberId}`; memberLoads.set(key,(memberLoads.get(key) ?? 0)+weight(item)); }
    const considered = new Set();
    const future = [...pending].sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
    const preceding = occurrences(state,addDays(start,-62),end);
    for (const item of future) {
      const lineage = root(item.task);
      if (considered.has(lineage)) continue;
      considered.add(lineage);
      // An outstanding action keeps its assignee. Only a future successor of
      // completed work can be suggested to another member, once per series.
      if (item.date <= notBefore || positions.get(item.id) <= notBefore || item.task.fixedDay || item.task.rotationEnabled === false || state.overrides[item.id]?.memberId) continue;
      if (preceding.some(other=>other.id!==item.id && root(other.task)===lineage && other.scheduledDate<item.scheduledDate && other.status!=='done')) continue;
      const last = history.filter(done=>root(taskById.get(done.taskId))===lineage && done.scheduledDate<item.scheduledDate).sort((a,b)=>(b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date))[0];
      if (!last || last.completedBy !== item.memberId) continue;
      const participants = item.task.rotationMembers ?? state.members.map(member=>member.id);
      const date = positions.get(item.id), currentLoad=memberLoads.get(`${date}|${item.memberId}`) ?? 0;
      const candidates = participants.filter(id=>id!==last.completedBy && state.members.some(member=>member.id===id)).sort((a,b)=>(memberLoads.get(`${date}|${a}`) ?? 0)-(memberLoads.get(`${date}|${b}`) ?? 0));
      const next = candidates.find(id=>(memberLoads.get(`${date}|${id}`) ?? 0)+weight(item) <= currentLoad+15);
      if (!next) continue;
      reassignments.push({id:item.id,taskId:item.taskId,title:item.task.title,date,from:item.memberId,to:next,lastCompletedBy:last.completedBy});
      memberLoads.set(`${date}|${item.memberId}`,currentLoad-weight(item));
      memberLoads.set(`${date}|${next}`,(memberLoads.get(`${date}|${next}`) ?? 0)+weight(item));
    }
  }
  return {revision:state.revision, before, after:snapshot(), reassignments, roomsBefore, roomsAfter:roomVisits(), balancedPeak, moves:movable.filter(item => positions.get(item.id) !== item.date).map(item => ({id:item.id, taskId:item.taskId, title:item.task.title, from:item.date, to:positions.get(item.id)})), unknown:pending.filter(item => !item.task.estimatedMinutes).length, protected:pending.length - movable.length, fallbackMinutes};
}

export function applyReorganization(state, options, expectedRevision) {
  if (state.revision !== expectedRevision) throw new Error('Le planning a changé. Génère une nouvelle proposition avant de confirmer.');
  const proposal = proposeReorganization(state, options);
  const next = structuredClone(state);
  const current = new Map(occurrences(state, options.start, options.end).map(item => [item.id, item]));
  // Apply final positions together so intermediate positions cannot merge tasks.
  for (const move of proposal.moves) {
    const item = current.get(move.id);
    next.overrides[item.id] = {id:item.id, taskId:item.taskId, scheduledDate:item.scheduledDate, memberId:item.memberId, status:item.status, date:item.date, ...(next.overrides[item.id] ?? {}), date:move.to};
  }
  for (const change of proposal.reassignments) {
    const item = current.get(change.id);
    next.overrides[item.id] = {id:item.id,taskId:item.taskId,scheduledDate:item.scheduledDate,date:item.date,status:item.status,memberId:item.memberId,...(next.overrides[item.id] ?? {}),memberId:change.to};
  }
  return next;
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
    if (task.unassignedPeriods !== undefined) {
      if (!Array.isArray(task.unassignedPeriods) || task.unassignedPeriods.length > 500) throw new Error('Exceptions de responsable invalides.');
      for (const period of task.unassignedPeriods) { parseDate(period.start); parseDate(period.end); if (period.start > period.end) throw new Error('Période sans responsable invalide.'); }
    }
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 600 || !groups.has(task.groupId) || (task.memberId && !members.has(task.memberId)) || (task.recurrence && !RECURRENCES[task.recurrence])) throw new Error('Tâche invalide.');
    if (task.seriesId !== undefined && (typeof task.seriesId !== 'string' || !task.seriesId.length || task.seriesId.length > 100)) throw new Error('Série invalide.');
    if (task.rotationEnabled !== undefined && typeof task.rotationEnabled !== 'boolean') throw new Error('Rotation invalide.');
    if (task.rotationMembers !== undefined && task.rotationMembers !== null && (!Array.isArray(task.rotationMembers) || !task.rotationMembers.length || new Set(task.rotationMembers).size !== task.rotationMembers.length || task.rotationMembers.some(id=>!members.has(id)))) throw new Error('Participants invalides.');
    if (task.fixedDay !== undefined && typeof task.fixedDay !== 'boolean') throw new Error('Jour fixe invalide.');
    if (task.anchor) parseDate(task.anchor);
    if (task.until) parseDate(task.until);
    if (task.startDate) parseDate(task.startDate);
    if (task.weekdays !== undefined && task.weekdays !== null) {
      if (!Array.isArray(task.weekdays) || task.weekdays.length > 7 || new Set(task.weekdays).size !== task.weekdays.length || task.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || (['daily', 'weekly', 'fortnightly'].includes(task.recurrence) && !task.weekdays.length)) throw new Error('Jours de récurrence invalides.');
    }
    if (task.estimatedMinutes !== undefined && task.estimatedMinutes !== null && (!Number.isInteger(task.estimatedMinutes) || task.estimatedMinutes < 1 || task.estimatedMinutes > 1440)) throw new Error('Durée estimée invalide (1 à 1440 minutes).');
    if (task.subtasks !== undefined) {
      if (!Array.isArray(task.subtasks) || task.subtasks.length > 80) throw new Error('Liste de sous-tâches invalide (80 maximum).');
      const ids = new Set();
      for (const subtask of task.subtasks) {
        if (!subtask || typeof subtask.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(subtask.id) || ids.has(subtask.id) || typeof subtask.title !== 'string' || !subtask.title.trim() || subtask.title.length > 240) throw new Error('Sous-tâche invalide.');
        ids.add(subtask.id);
      }
    }
  }
  for (const session of state.sessions) if (typeof session.title !== 'string' || !session.title.trim() || session.title.length > 160 || !groups.has(session.groupId) || !Array.isArray(session.taskIds) || session.taskIds.some(id => !tasks.has(id))) throw new Error('Séance invalide.');
  for (const [key, o] of Object.entries(state.overrides)) {
    if (!tasks.has(o.taskId) || key !== occurrenceId(o.taskId, o.scheduledDate) || o.id !== key || !['todo', 'done'].includes(o.status) || (o.memberId && !members.has(o.memberId))) throw new Error('Échéance invalide.');
    if (o.skipped !== undefined && (typeof o.skipped !== 'boolean' || (o.skipped && o.status === 'done'))) throw new Error('Retrait d’échéance invalide.');
    parseDate(o.date); parseDate(o.scheduledDate);
    if (o.subtaskDone !== undefined && (!Array.isArray(o.subtaskDone) || o.subtaskDone.length > 80 || new Set(o.subtaskDone).size !== o.subtaskDone.length || o.subtaskDone.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)))) throw new Error('Progression des sous-tâches invalide.');
    if (o.mergedInto !== undefined) {
      if (typeof o.mergedInto !== 'string' || o.mergedInto === key) throw new Error('Regroupement invalide.');
      const at = o.mergedInto.lastIndexOf('@');
      if (o.mergedInto.slice(0, at) !== o.taskId) throw new Error('Regroupement invalide.');
      parseDate(o.mergedInto.slice(at + 1));
      const visited = new Set([key]);
      let target = o.mergedInto;
      while (target) {
        if (visited.has(target)) throw new Error('Regroupement circulaire invalide.');
        visited.add(target); target = state.overrides[target]?.mergedInto;
      }
    }
  }
  return state;
}
