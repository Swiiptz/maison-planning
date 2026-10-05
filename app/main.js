import { createRuntime } from './services/bootstrap.js';
import { today, addDays, addMonths, weekStart, monthStart, monthEnd, datesBetween, formatDate } from './domain/dates.js';
import { RECURRENCES, occurrences, cardsForDate, earliestAnchor, occurrenceId } from './domain/planning.js';
import { registerPlanningTools } from './services/webmcp.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const ui = { page: 'planning', view: 'week', date: today(), member: '', group: '', frequency: '', search: '', showDone: true, grouped: true, onlyReview: false };
let runtime, service, state, busy = false, selectedCard, undo, toastTimer;
let renderedCards = new Map();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = name => name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  tasks: '<path d="m3 6 1 1 2-2m-3 8 1 1 2-2m-3 8 1 1 2-2M10 6h11M10 13h11M10 20h11"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h13"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.tasks}</svg>`;
const memberName = id => state.members.find(m => m.id === id)?.name ?? 'À attribuer';
const groupById = id => state.groups.find(g => g.id === id);
const groupBadge = id => { const g = groupById(id); return g ? `<span class="room-badge" style="--room:${g.color}">${esc(g.name)}</span>` : ''; };
const frequencyBadge = recurrence => { const r = RECURRENCES[recurrence]; return r ? `<span class="frequency-badge" style="--freq-bg:${r.bg};--freq-ink:${r.ink}">${esc(r.short)}</span>` : '<span class="frequency-badge neutral">À configurer</span>'; };
const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
const membersOptions = current => option('', 'À attribuer', current) + state.members.map(m => option(m.id, m.name, current)).join('');
const groupOptions = current => state.groups.map(g => option(g.id, g.name, current)).join('');
const recurrenceOptions = current => Object.entries(RECURRENCES).map(([id, r]) => option(id, r.label, current)).join('');
const button = (action, label, cls = '', extra = '') => `<button type="button" data-action="${action}" class="${cls}" ${extra}>${label}</button>`;
const dateLabel = date => formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });

function notify(message, { error = false, canUndo = false } = {}) {
  clearTimeout(toastTimer);
  toast.className = `visible${error ? ' error' : ''}`;
  toast.innerHTML = `<span>${esc(message)}</span>${canUndo ? button('undo', 'Annuler', 'toast-undo') : ''}`;
  toastTimer = setTimeout(() => { toast.className = ''; }, canUndo ? 10000 : 6500);
}

async function perform(operation, message, after) {
  if (busy) return;
  busy = true; document.body.classList.add('saving');
  try { await operation(); if (after) after(); if (message) notify(message); }
  catch (error) { notify(error.message, { error: true }); }
  finally { busy = false; document.body.classList.remove('saving'); }
}

function period() {
  if (ui.view === 'day' || ui.page === 'today') return [ui.page === 'today' ? today() : ui.date, ui.page === 'today' ? today() : ui.date];
  if (ui.view === 'month') return [monthStart(ui.date), monthEnd(ui.date)];
  const start = weekStart(ui.date); return [start, addDays(start, 6)];
}
function matches(item) {
  return (!ui.member || item.memberId === ui.member) && (!ui.group || item.task.groupId === ui.group) && (!ui.frequency || item.task.recurrence === ui.frequency) && (!ui.search || `${item.task.title} ${item.task.description}`.toLocaleLowerCase('fr').includes(ui.search.toLocaleLowerCase('fr')));
}
function visibleOccurrences(start, end) { return occurrences(state, start, end).filter(matches); }
function shown(items) { return ui.showDone ? items : items.filter(o => o.status !== 'done'); }
function resolveItem(id) {
  const at = id.lastIndexOf('@'), taskId = id.slice(0, at), scheduledDate = id.slice(at + 1);
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return null;
  return { id, taskId, scheduledDate, date: scheduledDate, memberId: task.memberId ?? '', status: 'todo', ...state.overrides[id], task };
}

function nav() {
  return [['today', 'Aujourd’hui', 'check'], ['planning', 'Agenda', 'calendar'], ['catalog', 'Tâches', 'tasks'], ['settings', 'Réglages', 'settings']].map(([page, label, glyph]) => button('page', `${icon(glyph)}<span>${label}</span>`, `nav-item${ui.page === page ? ' active' : ''}`, `data-page="${page}"${ui.page === page ? ' aria-current="page"' : ''}`)).join('');
}
function filters() {
  return `<div class="filters"><label><span class="sr-only">Membre</span><select data-filter="member">${option('', 'Tous les membres', ui.member)}${state.members.map(m => option(m.id, m.name, ui.member)).join('')}</select></label><label><span class="sr-only">Pièce</span><select data-filter="group">${option('', 'Toutes les pièces', ui.group)}${groupOptions(ui.group)}</select></label><label><span class="sr-only">Fréquence</span><select data-filter="frequency">${option('', 'Toutes les fréquences', ui.frequency)}${recurrenceOptions(ui.frequency)}</select></label><label class="done-switch"><input type="checkbox" data-filter="showDone" ${ui.showDone ? 'checked' : ''}>Voir les tâches faites</label></div>`;
}

function cardHTML(card, compact = false) {
  renderedCards.set(card.id, card);
  const done = card.items.filter(o => o.status === 'done').length, allDone = done === card.items.length;
  const frequencies = [...new Set(card.items.map(o => o.task.recurrence))];
  const freq = frequencies.length === 1 ? RECURRENCES[frequencies[0]] : null;
  const members = [...new Set(card.items.map(o => o.memberId))];
  const assigned = members.length === 1 ? memberName(members[0]) : `${members.length} responsables`;
  const colors = frequencies.map(f => RECURRENCES[f]?.color ?? '#888');
  const stripe = freq ? freq.color : `linear-gradient(to bottom, ${colors.map((c, i) => `${c} ${i * 100 / colors.length}% ${(i + 1) * 100 / colors.length}%`).join(',')})`;
  return `<article class="task-card${allDone ? ' completed' : ''}${compact ? ' compact' : ''}" style="--stripe:${stripe}" data-card="${esc(card.id)}">
    <div class="card-top"><span class="card-kind">${card.session ? 'Séance' : 'Tâche'}</span><button type="button" class="drag-handle" data-drag="${esc(card.id)}" draggable="true" aria-label="Déplacer ${esc(card.title)}">${icon('grip')}</button></div>
    <button type="button" class="card-title" data-action="detail" data-id="${esc(card.id)}">${esc(card.title)}</button>
    <div class="card-badges">${groupBadge(card.groupId)}${frequencies.length === 1 ? frequencyBadge(frequencies[0]) : `<span class="frequency-badge neutral">${frequencies.length} fréquences</span>`}</div>
    <div class="card-bottom">${card.session ? `<span class="session-progress">${done}/${card.items.length} actions</span>` : `<label class="task-check"><input type="checkbox" data-toggle="${esc(card.items[0].id)}" ${allDone ? 'checked' : ''} aria-label="Terminer ${esc(card.title)}"><span>${allDone ? 'Fait' : 'À faire'}</span></label>`}<span class="assignee" title="${esc(assigned)}"><span class="avatar avatar-small">${members.length === 1 && members[0] ? esc(initials(assigned)) : '·'}</span><span>${esc(assigned)}</span></span></div>
    ${card.session ? `<div class="card-progress" role="progressbar" aria-label="Progression de la séance" aria-valuemin="0" aria-valuemax="${card.items.length}" aria-valuenow="${done}"><span style="width:${done / card.items.length * 100}%"></span></div>` : ''}
  </article>`;
}

function dayColumn(date, items, compact = false) {
  const dayItems = items.filter(o => o.date === date), done = dayItems.filter(o => o.status === 'done').length;
  const cards = cardsForDate(state, shown(dayItems), date, ui.grouped);
  return `<section class="day-column${date === today() ? ' is-today' : ''}" data-drop-date="${date}" aria-label="${esc(dateLabel(date))}"><div class="day-heading"><span>${formatDate(date, { weekday: 'short' })}</span><button type="button" data-action="select-day" data-date="${date}" class="day-number">${formatDate(date, { day: 'numeric' })}</button><span class="day-count">${dayItems.length ? `${done}/${dayItems.length}` : '—'}</span></div><div class="day-cards">${cards.map(c => cardHTML(c, compact)).join('') || '<div class="day-empty">Rien de prévu</div>'}</div>${button('new-task', `${icon('plus')}<span>Ajouter</span>`, 'day-add', `data-date="${date}"`)}</section>`;
}

function miniCalendar() {
  const first = weekStart(monthStart(ui.date)), days = datesBetween(first, addDays(first, 41));
  return `<div class="mini-calendar"><div class="mini-title">${formatDate(ui.date, { month: 'long', year: 'numeric' })}</div><div class="mini-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="mini-weekday">${d}</span>`).join('')}${days.map(date => button('select-day', formatDate(date, { day: 'numeric' }), `mini-date${date === ui.date ? ' selected' : ''}${date.slice(0, 7) !== ui.date.slice(0, 7) ? ' outside' : ''}`, `data-date="${date}" aria-label="${esc(dateLabel(date))}"`)).join('')}</div></div>`;
}

function planningHTML() {
  const [start, end] = period(), items = visibleOccurrences(start, end);
  const done = items.filter(o => o.status === 'done').length;
  const notConfigured = state.tasks.filter(t => !t.archived && (!t.anchor || !t.recurrence));
  const overdue = visibleOccurrences(earliestAnchor(state, today()), addDays(today(), -1)).filter(o => o.status !== 'done');
  const heading = ui.view === 'month' ? formatDate(ui.date, { month: 'long', year: 'numeric' }) : ui.view === 'day' ? dateLabel(ui.date) : `${formatDate(start, { day: 'numeric' })} – ${formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  let board;
  if (ui.view === 'month') {
    const gridStart = weekStart(start), gridEnd = addDays(weekStart(end), 6), dates = datesBetween(gridStart, gridEnd);
    const gridItems = visibleOccurrences(gridStart, gridEnd);
    board = `<div class="month-weekdays">${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(s => `<span>${s}</span>`).join('')}</div><div class="month-grid">${dates.map(date => {
      const cards = cardsForDate(state, shown(gridItems), date, ui.grouped);
      return `<section class="month-cell${date === today() ? ' is-today' : ''}${date.slice(0, 7) !== start.slice(0, 7) ? ' outside' : ''}" data-drop-date="${date}">${button('select-day', formatDate(date, { day: 'numeric' }), 'month-number', `data-date="${date}" aria-label="${esc(dateLabel(date))}"`)}${cards.slice(0, 3).map(c => {
        renderedCards.set(c.id, c); const g = groupById(c.groupId);
        return button('detail', `<span class="month-dot" style="background:${g.color}"></span>${esc(c.title)}`, 'month-task', `data-id="${esc(c.id)}"`);
      }).join('')}${cards.length > 3 ? button('select-day', `+ ${cards.length - 3} autres`, 'month-more', `data-date="${date}"`) : ''}</section>`;
    }).join('')}</div>`;
  } else if (ui.view === 'day') {
    board = `<div class="daily-grid" data-drop-date="${ui.date}">${cardsForDate(state, shown(items), ui.date, ui.grouped).map(c => cardHTML(c)).join('') || '<div class="empty-state">Une journée libre.<br>Ajoute une tâche pour commencer.</div>'}</div>`;
  } else {
    const days = datesBetween(start, end);
    board = `<div class="mobile-week-strip">${days.map(date => button('focus-day', `<span>${formatDate(date, { weekday: 'short' })}</span><strong>${formatDate(date, { day: 'numeric' })}</strong>`, date === ui.date ? 'selected' : '', `data-date="${date}"`)).join('')}</div><div class="week-board">${days.map(date => dayColumn(date, items)).join('')}</div><div class="mobile-day-list" data-drop-date="${ui.date}">${cardsForDate(state, shown(items), ui.date, ui.grouped).map(c => cardHTML(c)).join('') || '<div class="empty-state">Rien de prévu ce jour.</div>'}</div>`;
  }
  return `<div class="planning-toolbar"><div class="period-control">${button('previous', icon('left'), 'icon-button', 'aria-label="Période précédente"')}<h2>${esc(heading)}</h2>${button('next', icon('right'), 'icon-button', 'aria-label="Période suivante"')}${button('today', 'Aujourd’hui', 'subtle-button')}</div><div class="view-tabs" aria-label="Vue de l’agenda">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([v, s]) => button('view', s, ui.view === v ? 'selected' : '', `data-view="${v}" aria-pressed="${ui.view === v}"`)).join('')}</div></div>
    ${filters()}<div class="agenda-layout"><aside class="agenda-aside">${miniCalendar()}<div class="week-summary"><div class="eyebrow">${ui.view === 'day' ? 'La journée' : ui.view === 'month' ? 'Le mois' : 'La semaine'}</div><div class="summary-number">${done}<span> / ${items.length}</span></div><p>actions réalisées</p><div class="summary-track"><span style="width:${items.length ? done / items.length * 100 : 0}%"></span></div></div><div class="aside-section"><div class="aside-title">À configurer <span>${notConfigured.length}</span></div><p>Ces étapes n’ont pas de fréquence indiquée dans les documents.</p>${button('review', 'Voir les étapes', 'text-button')}${overdue.length ? button('overdue', `${overdue.length} actions en retard`, 'overdue-link') : ''}</div><div class="aside-section legend"><div class="aside-title">Les récurrences</div>${Object.entries(RECURRENCES).filter(([key]) => key !== 'once').map(([, r]) => `<div><span style="background:${r.color}"></span>${r.label}</div>`).join('')}</div></aside><div class="agenda-board">${board}</div></div><div class="board-footer"><label><input type="checkbox" data-filter="grouped" ${ui.grouped ? 'checked' : ''}>Regrouper les tâches en séances</label><span>Déplace une carte avec sa poignée, ou ouvre-la pour choisir une date.</span></div>`;
}

function todayHTML() {
  const now = today(), upcoming = visibleOccurrences(now, now);
  const overdue = visibleOccurrences(earliestAnchor(state, now), addDays(now, -1)).filter(o => o.status === 'todo');
  const done = upcoming.filter(o => o.status === 'done').length;
  return `${filters()}<div class="today-summary"><div><div class="eyebrow">${esc(dateLabel(now))}</div><h2>${done === upcoming.length && upcoming.length ? 'Tout est fait pour aujourd’hui.' : 'Une action à la fois.'}</h2><p>${done} sur ${upcoming.length} actions réalisées aujourd’hui</p></div><div class="progress-ring" style="--progress:${upcoming.length ? done / upcoming.length * 360 : 0}deg"><span>${upcoming.length ? Math.round(done / upcoming.length * 100) : 0}%</span></div></div>${overdue.length ? `<section class="overdue-section"><div class="section-heading"><h2>À rattraper</h2><span>${overdue.length} actions</span></div><div class="daily-grid">${groupPastCards(overdue).map(c => cardHTML(c)).join('')}</div></section>` : ''}<section><div class="section-heading"><h2>Au programme</h2>${button('mine', 'Mes tâches', 'subtle-button')}</div><div class="daily-grid" data-drop-date="${now}">${cardsForDate(state, shown(upcoming), now, ui.grouped).map(c => cardHTML(c)).join('') || '<div class="empty-state">Aucune tâche pour ces filtres.</div>'}</div></section>`;
}
function groupPastCards(items) { return [...new Set(items.map(o => o.date))].flatMap(date => cardsForDate(state, items, date, ui.grouped)).map(c => ({ ...c, title: `${c.title} · ${formatDate(c.date, { day: 'numeric', month: 'short' })}` })); }

function catalogHTML() {
  const tasks = state.tasks.filter(t => !t.archived && (!ui.group || t.groupId === ui.group) && (!ui.frequency || t.recurrence === ui.frequency) && (!ui.member || t.memberId === ui.member) && (!ui.onlyReview || !t.recurrence || !t.anchor || t.reviewNote) && `${t.title} ${t.description}`.toLocaleLowerCase('fr').includes(ui.search.toLocaleLowerCase('fr')));
  return `<div class="catalog-tools"><label class="search-input">${icon('search')}<input type="search" id="catalog-search" placeholder="Rechercher une tâche…" value="${esc(ui.search)}" aria-label="Rechercher une tâche"></label><label class="done-switch"><input type="checkbox" data-filter="onlyReview" ${ui.onlyReview ? 'checked' : ''}>À vérifier ou configurer</label><span class="result-count">${tasks.length} tâches</span></div>${filters()}<div class="catalog-list">${tasks.map(t => `<article class="catalog-row"><div class="catalog-main">${groupBadge(t.groupId)}<h2>${esc(t.title)}</h2>${t.description ? `<p>${esc(t.description)}</p>` : ''}${t.reviewNote ? `<span class="review-note">${esc(t.reviewNote)}</span>` : ''}</div><div class="catalog-meta">${frequencyBadge(t.recurrence)}<span>${esc(memberName(t.memberId))}</span>${t.anchor ? `<span class="muted">À partir du ${formatDate(t.anchor, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div><div class="catalog-actions">${button('edit-task', t.recurrence && t.anchor ? 'Modifier' : 'Configurer', 'subtle-button', `data-id="${esc(t.id)}"`)}${button('archive', 'Archiver', 'text-button muted', `data-id="${esc(t.id)}"`)}</div></article>`).join('') || '<div class="empty-state">Aucune tâche ne correspond à cette recherche.</div>'}</div>`;
}

function settingsHTML() {
  return `<div class="settings-grid"><section class="settings-panel"><div class="eyebrow">Le foyer</div><h2>${esc(state.household.name)}</h2><p>Les tâches et les séances peuvent être attribuées à chacun.</p><div class="members-list">${state.members.map(m => `<div class="member-row"><span class="avatar">${esc(initials(m.name))}</span><strong>${esc(m.name)}</strong>${button('rename-member', 'Renommer', 'text-button', `data-id="${esc(m.id)}"`)}${runtime.permissions?.canInvite ? button('invite', 'Inviter', 'subtle-button', `data-id="${esc(m.id)}"`) : ''}</div>`).join('')}</div>${button('add-member', `${icon('plus')}Ajouter un membre`, 'subtle-button')}</section><section class="settings-panel"><div class="eyebrow">Les pièces</div><h2>Des repères à votre image</h2><p>La couleur d’une pièce reste indépendante de la récurrence.</p><div class="room-settings">${state.groups.filter(g => g.kind === 'room').map(g => `<label><span>${esc(g.name)}</span><input type="color" data-group-color="${g.id}" value="${g.color}" aria-label="Couleur de ${esc(g.name)}"></label>`).join('')}</div></section><section class="settings-panel"><div class="eyebrow">Sauvegarde</div><h2>Garder une copie</h2><p>Exporte les tâches, les répétitions et l’historique du foyer dans un fichier que tu pourras réimporter.</p><div class="button-row">${button('export', 'Exporter les données', 'primary-button')}${button('import', 'Importer une sauvegarde', 'subtle-button')}</div></section><section class="settings-panel"><div class="eyebrow">Connexion</div><h2>${runtime.mode === 'demo' ? 'Démonstration locale' : 'Planning partagé'}</h2><p>${runtime.mode === 'demo' ? 'Ces données sont enregistrées uniquement dans ce navigateur. Les membres sont des exemples.' : `Connecté avec ${esc(runtime.auth.current()?.email)}. Les données sont partagées avec les membres autorisés du foyer.`}</p>${runtime.mode === 'demo' ? button('connect', 'Connecter mon foyer', 'primary-button') : button('sign-out', `${icon('logout')}Se déconnecter`, 'subtle-button')}</section></div>`;
}

function render() {
  if (!state) return;
  renderedCards = new Map();
  const headings = { planning: ['Le planning du foyer', 'L’agenda de la maison'], today: ['Le planning du foyer', 'Aujourd’hui'], catalog: ['Les routines de la maison', 'Toutes les tâches'], settings: ['À chacun sa place', 'Les réglages du foyer'] };
  const [eyebrow, heading] = headings[ui.page];
  const account = runtime.auth.current();
  const content = ui.page === 'planning' ? planningHTML() : ui.page === 'today' ? todayHTML() : ui.page === 'catalog' ? catalogHTML() : settingsHTML();
  app.innerHTML = `<div class="app-shell"><aside class="sidebar"><a class="brand" href="#planning" data-action="page" data-page="planning"><span class="brand-mark">${icon('home')}</span><span>maison<span class="brand-sub">Un foyer, un agenda.</span></span></a><div class="household-label">${esc(state.household.name)}</div><nav aria-label="Navigation principale">${nav()}</nav><div class="sidebar-note"><span class="note-symbol">⌁</span><p>Les petites choses<br>font une maison.</p></div><div class="sidebar-account"><span class="avatar">${esc(initials(account?.name || 'Moi'))}</span><div><strong>${esc(account?.name || 'Moi')}</strong><span>${runtime.mode === 'demo' ? 'Mode démonstration' : 'Membre du foyer'}</span></div></div></aside><main id="main" class="workspace"><header class="workspace-header"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}<span class="title-dot">.</span></h1></div>${ui.page !== 'settings' ? `<div class="create-buttons">${button('new-session', 'Nouvelle séance', 'subtle-button')}${button('new-task', `${icon('plus')}Nouvelle tâche`, 'primary-button')}</div>` : ''}</header>${runtime.mode === 'demo' ? `<div class="demo-banner"><span><strong>Démonstration</strong> · Enregistrée sur cet appareil</span>${button('connect', 'Connecter mon foyer', 'text-button')}</div>` : ''}${content}<footer class="workspace-footer"><span>Maison · le planning du foyer</span><span>${runtime.mode === 'demo' ? 'Exemple local' : 'Planning partagé'}</span></footer></main><nav class="mobile-nav" aria-label="Navigation mobile">${nav()}</nav></div>`;
}

function openDialog(html) {
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function dialogHeader(title, subtitle = '') {
  return `<div class="dialog-header"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${button('close', icon('close'), 'icon-button', 'aria-label="Fermer"')}</div>`;
}
function openDetail(card) {
  selectedCard = { ...card, items: card.items.map(o => resolveItem(o.id)).filter(Boolean) };
  const items = selectedCard.items;
  const members = [...new Set(items.map(o => o.memberId))];
  openDialog(`${dialogHeader(card.title, dateLabel(items[0]?.date ?? card.date))}<div class="detail-badges">${groupBadge(card.groupId)}<span>${card.session ? `${items.filter(o => o.status === 'done').length} / ${items.length} actions réalisées` : 'Tâche individuelle'}</span></div><div class="checklist">${items.map(o => `<div class="checklist-row"><label><input type="checkbox" data-toggle="${esc(o.id)}" ${o.status === 'done' ? 'checked' : ''}><span class="${o.status === 'done' ? 'checked-text' : ''}">${esc(o.task.title)}${o.task.description ? `<small>${esc(o.task.description)}</small>` : ''}</span></label><div class="checklist-meta">${frequencyBadge(o.task.recurrence)}<span>${esc(memberName(o.memberId))}</span>${card.session ? button('detach', 'Séparer', 'text-button', `data-id="${esc(o.id)}"`) : ''}</div></div>`).join('')}</div><form id="detail-form"><div class="form-grid"><label>Date<input type="date" name="date" value="${items[0]?.date ?? card.date}" required></label><label>Responsable<select name="memberId">${members.length > 1 ? option('__keep', 'Garder les responsables', '__keep') : ''}${membersOptions(members.length === 1 ? members[0] : '__keep')}</select></label></div><label>Appliquer à<select name="scope"><option value="one">Cette échéance seulement</option><option value="future">Celle-ci et les suivantes</option></select></label><p class="form-help">Déplacer une échéance seule conserve les prochaines dates. Les actions déjà réalisées gardent leur historique.</p><div class="dialog-actions">${button('close', 'Fermer', 'subtle-button')}<button type="submit" class="primary-button">Enregistrer</button></div></form>`);
}

function taskForm(task = null, date = ui.date) {
  const editing = Boolean(task);
  openDialog(`${dialogHeader(editing ? 'Modifier la tâche' : 'Nouvelle tâche', editing && task.reviewNote ? task.reviewNote : 'Une action, un responsable, une répétition.')}<form id="task-form" data-id="${task?.id ?? ''}"><label>Nom de la tâche<input name="title" value="${esc(task?.title)}" placeholder="Ex. Nettoyer les miroirs" maxlength="600" required></label><div class="form-grid"><label>Pièce ou catégorie<select name="groupId">${groupOptions(task?.groupId ?? ui.group ?? state.groups[0].id)}</select></label><label>Responsable<select name="memberId">${membersOptions(task?.memberId ?? runtime.memberId ?? '')}</select></label></div><div class="form-grid"><label>Première date<input type="date" name="anchor" value="${task?.anchor ?? date}" required></label><label>Récurrence<select name="recurrence">${recurrenceOptions(task?.recurrence ?? 'weekly')}</select></label></div><label>Consignes <span class="muted">(facultatif)</span><textarea name="description" rows="3" maxlength="3000">${esc(task?.description)}</textarea></label>${editing && task.anchor ? '<p class="form-help">Les changements de planning s’appliquent à partir d’aujourd’hui, ou de la première échéance si elle est à venir. L’historique est conservé.</p>' : ''}<div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button">${editing ? 'Enregistrer' : 'Créer la tâche'}</button></div></form>`);
}

function sessionForm(groupId = state.groups[0].id) {
  const candidates = state.tasks.filter(t => !t.archived && t.groupId === groupId && t.recurrence && t.anchor);
  openDialog(`${dialogHeader('Nouvelle séance', 'Regrouper des tâches sans changer leurs fréquences.')}<form id="session-form"><label>Nom de la séance<input name="title" placeholder="Ex. Ménage cuisine" maxlength="160" required></label><label>Pièce ou catégorie<select name="groupId" data-session-group>${groupOptions(groupId)}</select></label><fieldset class="session-picker"><legend>Actions de la séance</legend>${candidates.map(t => `<label><input type="checkbox" name="taskIds" value="${t.id}"><span>${esc(t.title)}</span>${frequencyBadge(t.recurrence)}</label>`).join('') || '<p>Aucune tâche planifiée dans ce groupe. Crée ou configure une tâche d’abord.</p>'}</fieldset><p class="form-help">La séance apparaît les jours où ses actions sont dues. Une action conserve son responsable et sa récurrence.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button" ${candidates.length ? '' : 'disabled'}>Créer la séance</button></div></form>`);
}

async function moveCard(card, date) {
  const items = card.items.map(o => resolveItem(o.id)).filter(o => o && o.status !== 'done');
  if (!items.length) { notify('Cette carte est déjà terminée. Son historique est conservé.'); return; }
  const before = items.map(o => ({ id: o.id, date: o.date }));
  await perform(() => service.update(items, { date }), null, () => {
    undo = () => service.restoreDates(before.map(item => ({ ...resolveItem(item.id), previousDate: item.date })));
    notify(`Déplacé au ${formatDate(date, { day: 'numeric', month: 'long' })}.`, { canUndo: true });
  });
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'close') { dialog.close(); selectedCard = null; return; }
  if (action === 'demo') { location.href = `${location.pathname}?demo=1`; return; }
  if (action === 'connect') { location.href = location.pathname; return; }
  if (action === 'retry') { location.reload(); return; }
  if (action === 'sign-in') { await perform(() => runtime.auth.signIn()); return; }
  if (action === 'sign-out') { await perform(() => runtime.auth.signOut(), null, () => { state = null; runtime.dispose(); loginScreen(); }); return; }
  if (!state) return;
  if (action === 'page') { event.preventDefault(); ui.page = target.dataset.page; ui.search = ''; ui.onlyReview = false; render(); window.scrollTo({ top: 0 }); }
  else if (action === 'view') { ui.view = target.dataset.view; render(); }
  else if (action === 'previous' || action === 'next') { const direction = action === 'next' ? 1 : -1; ui.date = ui.view === 'month' ? addMonths(ui.date, direction) : addDays(ui.date, direction * (ui.view === 'week' ? 7 : 1)); render(); }
  else if (action === 'today') { ui.date = today(); render(); }
  else if (action === 'select-day') { ui.date = target.dataset.date; ui.view = 'day'; render(); }
  else if (action === 'focus-day') { ui.date = target.dataset.date; render(); }
  else if (action === 'new-task') taskForm(null, target.dataset.date ?? ui.date);
  else if (action === 'new-session') sessionForm(ui.group || state.groups[0].id);
  else if (action === 'edit-task') taskForm(state.tasks.find(t => t.id === target.dataset.id));
  else if (action === 'detail') { const card = renderedCards.get(target.dataset.id); if (card) openDetail(card); }
  else if (action === 'review') { ui.page = 'catalog'; ui.onlyReview = true; ui.group = ''; ui.frequency = ''; ui.member = ''; render(); }
  else if (action === 'overdue') { ui.page = 'today'; render(); }
  else if (action === 'mine') { ui.member = ui.member === runtime.memberId ? '' : runtime.memberId; render(); }
  else if (action === 'detach') await perform(() => service.update([resolveItem(target.dataset.id)], { sessionId: '' }), 'L’action est maintenant indépendante.', () => dialog.close());
  else if (action === 'undo' && undo) { const operation = undo; undo = null; await perform(operation, 'Déplacement annulé.'); }
  else if (action === 'archive') {
    const task = state.tasks.find(t => t.id === target.dataset.id);
    openDialog(`${dialogHeader('Archiver cette tâche ?')}<p>${esc(task.title)}</p><p>Les prochaines échéances seront arrêtées. Les réalisations passées restent dans l’historique.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}${button('confirm-archive', 'Archiver', 'primary-button', `data-id="${task.id}"`)}</div>`);
  }
  else if (action === 'confirm-archive') await perform(() => service.archive(target.dataset.id, today()), 'Tâche archivée.', () => dialog.close());
  else if (action === 'add-member' || action === 'rename-member') {
    const member = state.members.find(m => m.id === target.dataset.id);
    openDialog(`${dialogHeader(member ? 'Renommer le membre' : 'Ajouter un membre')}<form id="member-form" data-id="${member?.id ?? ''}"><label>Prénom ou nom<input name="name" value="${esc(member?.name)}" required maxlength="100"></label><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button class="primary-button" type="submit">Enregistrer</button></div></form>`);
  }
  else if (action === 'invite') openDialog(`${dialogHeader(`Inviter ${memberName(target.dataset.id)}`, 'Le code sera réservé à cette adresse.')}<form id="invite-form" data-id="${target.dataset.id}"><label>Adresse email du compte<input name="email" type="email" required></label><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button">Créer le code</button></div></form>`);
  else if (action === 'export') {
    const blob = new Blob([service.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `maison-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Sauvegarde exportée.');
  }
  else if (action === 'import') openDialog(`${dialogHeader('Importer une sauvegarde', 'Les données du planning seront remplacées après confirmation.')}<form id="import-form"><label>Fichier de sauvegarde<input name="file" type="file" accept="application/json,.json" required></label><label class="confirmation"><input type="checkbox" name="confirm" required>J’ai exporté une copie du planning actuel.</label><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button class="primary-button" type="submit">Importer</button></div></form>`);
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.filter) { ui[target.dataset.filter] = target.type === 'checkbox' ? target.checked : target.value; render(); }
  if (target.dataset.toggle) {
    const item = resolveItem(target.dataset.toggle);
    await perform(() => service.update([item], { status: target.checked ? 'done' : 'todo' }), null, () => { if (dialog.open && selectedCard) openDetail(selectedCard); });
  }
  if (target.dataset.groupColor) await perform(() => service.setGroupColor(target.dataset.groupColor, target.value), 'Couleur enregistrée.');
  if (target.hasAttribute('data-session-group')) {
    const title = dialog.querySelector('[name=title]').value;
    sessionForm(target.value); dialog.querySelector('[name=title]').value = title;
  }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'catalog-search') return;
  ui.search = event.target.value;
  const start = event.target.selectionStart;
  render(); const input = document.querySelector('#catalog-search'); input.focus();
  try { input.setSelectionRange(start, start); } catch { /* Search fields may not expose selections. */ }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, data = new FormData(form);
  if (!form.reportValidity()) return;
  if (form.id === 'task-form') {
    const values = { title: data.get('title').trim(), groupId: data.get('groupId'), memberId: data.get('memberId'), anchor: data.get('anchor'), recurrence: data.get('recurrence'), description: data.get('description').trim() };
    const task = state.tasks.find(t => t.id === form.dataset.id);
    const operation = !task ? () => service.createTask(values) : !task.anchor || !task.recurrence ? () => service.editTask(task.id, { ...values, reviewNote: '' }) : () => service.updateSeries({ taskId: task.id, scheduledDate: task.anchor > today() ? task.anchor : today() }, values);
    await perform(operation, task ? 'Tâche mise à jour.' : 'Tâche créée.', () => dialog.close());
  } else if (form.id === 'session-form') {
    const taskIds = data.getAll('taskIds'); if (!taskIds.length) { notify('Sélectionne au moins une action.', { error: true }); return; }
    await perform(() => service.createSession({ title: data.get('title').trim(), groupId: data.get('groupId'), taskIds }), 'Séance créée.', () => dialog.close());
  } else if (form.id === 'detail-form') {
    const fresh = selectedCard.items.map(o => resolveItem(o.id)).filter(o => o && o.status !== 'done');
    const changes = { date: data.get('date') };
    if (data.get('memberId') !== '__keep') changes.memberId = data.get('memberId');
    if (data.get('scope') === 'future') {
      await perform(() => service.updateFuture(fresh, { anchor: changes.date, ...(changes.memberId !== undefined ? { memberId: changes.memberId } : {}) }), 'Les prochaines échéances ont été mises à jour.', () => dialog.close());
    } else await perform(() => service.update(fresh, changes), 'Échéance mise à jour.', () => dialog.close());
  } else if (form.id === 'member-form') {
    const name = data.get('name').trim(); if (!name) return;
    await perform(() => form.dataset.id ? service.renameMember(form.dataset.id, name) : service.addMember(name), 'Membre enregistré.', () => dialog.close());
  } else if (form.id === 'invite-form') await perform(async () => {
    const token = await runtime.invite(form.dataset.id, data.get('email'), state.household.id);
    openDialog(`${dialogHeader('Invitation prête')}<p>Transmets ce code à ${esc(memberName(form.dataset.id))}. Cette personne devra se connecter avec ${esc(data.get('email'))}, puis choisir « Rejoindre un foyer ».</p><label>Code d’invitation<input readonly value="${token}"></label><p class="form-help">Le code est lié à l’adresse indiquée. Aucun email n’est envoyé automatiquement.</p><div class="dialog-actions">${button('close', 'Fermer', 'primary-button')}</div>`);
  });
  else if (form.id === 'import-form') {
    const file = data.get('file'); if (file.size > 5_000_000) { notify('Ce fichier est trop volumineux.', { error: true }); return; }
    await perform(async () => service.importData(await file.text()), 'Sauvegarde importée.', () => dialog.close());
  } else if (form.id === 'household-form') await perform(async () => { service = await runtime.createHousehold(data.get('name').trim()); await openService(); });
  else if (form.id === 'join-form') await perform(async () => { service = await runtime.joinHousehold(data.get('token').trim()); await openService(); });
});

// Mouse drag and drop; touch/pen drag uses only the handle, leaving page scrolling intact.
let draggedId = null, touchDrag = null;
document.addEventListener('dragstart', event => {
  const handle = event.target.closest('[data-drag]'); if (!handle) return;
  draggedId = handle.dataset.drag; event.dataTransfer.setData('text/plain', draggedId); event.dataTransfer.effectAllowed = 'move';
  handle.closest('.task-card').classList.add('dragging');
});
document.addEventListener('dragover', event => { const zone = event.target.closest('[data-drop-date]'); if (zone && draggedId) { event.preventDefault(); zone.classList.add('drop-active'); } });
document.addEventListener('dragleave', event => { const zone = event.target.closest('[data-drop-date]'); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drop-active'); });
document.addEventListener('drop', event => {
  const zone = event.target.closest('[data-drop-date]');
  if (!zone || !draggedId) return;
  event.preventDefault(); const card = renderedCards.get(draggedId); if (card) moveCard(card, zone.dataset.dropDate);
  draggedId = null; document.querySelectorAll('.drop-active,.dragging').forEach(el => el.classList.remove('drop-active', 'dragging'));
});
document.addEventListener('dragend', () => { draggedId = null; document.querySelectorAll('.drop-active,.dragging').forEach(el => el.classList.remove('drop-active', 'dragging')); });
document.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse') return;
  const handle = event.target.closest('[data-drag]'); if (!handle) return;
  handle.setPointerCapture(event.pointerId);
  touchDrag = { id: handle.dataset.drag, x: event.clientX, y: event.clientY, moved: false };
});
document.addEventListener('pointermove', event => {
  if (!touchDrag) return;
  if (Math.hypot(event.clientX - touchDrag.x, event.clientY - touchDrag.y) > 10) touchDrag.moved = true;
  if (!touchDrag.moved) return;
  const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-date],[data-action="focus-day"]');
  document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active')); zone?.classList.add('drop-active');
});
document.addEventListener('pointerup', event => {
  if (!touchDrag) return;
  const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-date],[data-action="focus-day"]');
  const card = renderedCards.get(touchDrag.id);
  if (touchDrag.moved && zone && card) moveCard(card, zone.dataset.dropDate ?? zone.dataset.date);
  else if (card) openDetail(card);
  touchDrag = null; document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active'));
});
document.addEventListener('pointercancel', () => { touchDrag = null; document.querySelectorAll('.drop-active').forEach(el => el.classList.remove('drop-active')); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });

function loginScreen(error = '') {
  app.innerHTML = `<main class="welcome"><div class="welcome-brand"><span class="brand-mark">${icon('home')}</span><span>maison</span></div><div class="welcome-panel"><div class="eyebrow">L’agenda du foyer</div><h1>Une maison.<br>Un planning commun<span class="title-dot">.</span></h1><p>Retrouve les tâches du jour, répartis les routines et prépare la semaine avec les membres de ton foyer.</p>${error ? `<div class="login-error" role="alert">${esc(error)}</div>` : ''}${runtime ? button('sign-in', esc(runtime.auth.signInLabel || 'Se connecter'), 'primary-button') : button('retry', 'Réessayer', 'primary-button')}${button('demo', 'Essayer avec un exemple', 'subtle-button')}<p class="form-help">L’exemple est enregistré sur cet appareil. Le planning du foyer nécessite une connexion.</p></div><div class="welcome-preview" aria-hidden="true"><div class="preview-heading">La semaine de la maison</div><div class="preview-week"><span>LUN.</span><span>MAR.</span><span>MER.</span></div><div class="preview-cards"><div style="border-color:#73a166"><span class="preview-room">Cuisine</span><strong>Ménage cuisine</strong><span>Chaque semaine · 4 actions</span></div><div style="border-color:#668dd2"><span class="preview-room">Salle de bain</span><strong>Nettoyer le lavabo</strong><span>Chaque jour</span></div><div style="border-color:#bf69c1"><span class="preview-room">Salon</span><strong>Nettoyer les vitres</strong><span>Tous les 2 mois</span></div></div><div class="preview-caption">Les bonnes habitudes, à leur place.</div></div></main>`;
}
function householdScreen() {
  app.innerHTML = `<main class="setup-screen"><span class="brand-mark">${icon('home')}</span><h1>Bienvenue, ${esc(runtime.auth.current()?.name)}</h1><p>Crée le planning de ta maison ou rejoins celui de ton foyer.</p><div class="setup-panels"><form id="household-form"><h2>Créer mon foyer</h2><label>Nom du foyer<input name="name" value="Notre maison" maxlength="100" required></label><button type="submit" class="primary-button">Créer le planning</button><p class="form-help">Les tâches des documents sont ajoutées automatiquement. Tu pourras ajuster les dates et les responsables.</p></form><form id="join-form"><h2>Rejoindre un foyer</h2><label>Code d’invitation<input name="token" placeholder="Code transmis par ton foyer" required></label><button type="submit" class="subtle-button">Rejoindre</button></form></div>${button('sign-out', 'Se déconnecter', 'text-button')}</main>`;
}
async function openService() {
  if (!service) service = await runtime.open();
  if (!service) { householdScreen(); return; }
  state = await service.load();
  service.subscribe(value => { state = value; render(); });
  runtime.onError?.(error => notify(error.message, { error: true }));
  render();
}
async function init() {
  try {
    runtime = await createRuntime({ demo: new URLSearchParams(location.search).get('demo') === '1' });
    const account = await runtime.auth.ready();
    runtime.auth.subscribe(async account => {
      service = null; state = null; runtime.dispose();
      if (!account) { loginScreen(); return; }
      try { await openService(); } catch (error) { loginScreen(error.message); }
    });
    if (!account) { loginScreen(); return; }
    await openService();
  } catch (error) { loginScreen(error.message); }
}
const stopTools = registerPlanningTools(document.modelContext, () => state, () => service);
window.addEventListener('pagehide', stopTools, { once: true });
init();
