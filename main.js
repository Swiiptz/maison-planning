import { householdStatistics } from './domain/statistics.js';
import { createRuntime } from './services/bootstrap.js';
import { today, addDays, addMonths, weekStart, monthStart, monthEnd, datesBetween, formatDate } from './domain/dates.js';
import { RECURRENCES, occurrences, cardsForDate, earliestAnchor, occurrenceId, moveCollisions, uid, durationEstimate, matchesDuration, sortDurations, proposeReorganization, defaultResponsible } from './domain/planning.js';
import { registerPlanningTools } from './services/webmcp.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const ui = { page: 'planning', view: 'week', date: today(), member: '', group: '', frequency: '', search: '', showDone: true, grouped: true, onlyReview: false, sidebarCollapsed: false, calendarCollapsed: false, duration: '', sort: '', statsPeriod: 'month', statsMember: '', statsGroup: '', statsFrequency: '', statsSearch: '', statsLimit: 20, filtersOpen: false, recap: 'day' };
let subtaskDraft = [];
let weekdayDraft = new Set(), weekdaysTouched = false;
const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const supportsWeekdays = recurrence => ['daily', 'weekly', 'fortnightly'].includes(recurrence);
function weekdayLabelHTML(task) {
  return supportsWeekdays(task.recurrence) && task.weekdays?.length ? `<span class="weekday-label">${task.weekdays.length === 7 ? 'Tous les jours' : task.weekdays.map(day => WEEKDAYS[day].slice(0, 3)).join(' · ')}</span>` : '';
}
function defaultWeekdays(recurrence, anchor) {
  if (recurrence === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  const date = anchor || today();
  return [(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
}
function weekdaySummary(recurrence) {
  if (!supportsWeekdays(recurrence)) return 'Pour cette fréquence, les échéances suivent la date de départ.';
  const days = [...weekdayDraft].sort((a, b) => a - b).map(day => WEEKDAYS[day].toLocaleLowerCase('fr'));
  if (!days.length) return 'Sélectionne au moins un jour.';
  return `${recurrence === 'fortnightly' ? 'Une semaine sur deux' : 'Chaque semaine'} : ${days.join(', ')}.`;
}
function weekdayPickerHTML(recurrence) {
  const supported = supportsWeekdays(recurrence);
  return `<fieldset class="weekday-picker"${supported ? '' : ' disabled'}><legend>Les jours de la routine</legend><div class="weekday-picker-top"><span>${supported ? 'Choisis un ou plusieurs jours' : 'Selon la date de départ'}</span>${supported ? `<div>${button('weekday-all', 'Tous', 'weekday-preset')}${button('weekday-workdays', 'Lun–Ven', 'weekday-preset')}</div>` : ''}</div><div class="weekday-options">${WEEKDAYS.map((day, index) => `<label><input type="checkbox" name="weekdays" value="${index}" data-weekday="${index}" ${weekdayDraft.has(index) && supported ? 'checked' : ''} aria-label="${day}"><span>${day.slice(0, 3)}<span class="weekday-dot" aria-hidden="true"></span></span></label>`).join('')}</div><p class="weekday-summary" aria-live="polite">${esc(weekdaySummary(recurrence))}</p></fieldset>`;
}
function refreshWeekdayPicker() {
  const recurrence = dialog.querySelector('[name="recurrence"]').value;
  dialog.querySelector('#weekday-config').innerHTML = weekdayPickerHTML(recurrence);
  refreshRoutinePreview();
}
let runtime, service, state, busy = false, selectedCard, undo, toastTimer;
let householdSetupOpen = false;
let assignmentRemoval = null, durationProposal = null, occurrenceRemoval = null;
let renderedCards = new Map(), statsModel = null;
let pendingMove = null, quickMoveCard = null, reorganization = null;
const catalogOpen = new Map(), catalogSearchOpen = new Map();
const sessionCardsCache = new Map();
const foldAnimations = new WeakMap();
let dialogAnimation = null, dialogReturnFocus = null, lastRenderedPage = null;
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let selectMenu = null, selectSequence = 0;

function closeSelectMenu() {
  if (!selectMenu) return;
  selectMenu.button.setAttribute('aria-expanded', 'false');
  selectMenu.button.removeAttribute('aria-activedescendant');
  selectMenu.button.removeAttribute('aria-controls');
  selectMenu.popup.remove(); selectMenu = null;
}

function enhanceSelects(container) {
  for (const select of container.querySelectorAll?.('select:not(.native-select)') ?? []) {
    const wrapper = document.createElement('span'); wrapper.className = 'maison-select';
    select.before(wrapper); wrapper.append(select);
    select.classList.add('native-select'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'select-trigger';
    const key = select.dataset.filter ?? select.dataset.statFilter ?? select.name ?? String(++selectSequence);
    button.dataset.selectKey = key;
    const label = select.getAttribute('aria-label') ?? ({ member: 'Membre', group: 'Pièce', frequency: 'Fréquence', duration: 'Durée estimée', sort: 'Trier les tâches', groupId: 'Pièce ou catégorie', memberId: 'Responsable', recurrence: 'Récurrence', scope: 'Appliquer à' })[key] ?? 'Choisir une option';
    button.setAttribute('aria-label', label); button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
    button.disabled = select.disabled;
    const refresh = () => { button.innerHTML = `<span class="select-value">${esc(select.selectedOptions[0]?.textContent ?? '')}</span><span class="select-arrow" aria-hidden="true">${icon('right')}</span>`; };
    refresh(); wrapper.append(button); select.addEventListener('change', refresh);
    const open = () => {
      closeSelectMenu();
      const popup = document.createElement('div'); popup.className = 'select-popup'; popup.id = `select-options-${++selectSequence}`;
      popup.setAttribute('role', 'listbox'); popup.setAttribute('aria-label', label);
      const options = [...select.options];
      const entries = options.map((option, index) => {
        const entry = document.createElement('div'); entry.className = 'select-option'; entry.id = `${popup.id}-${index}`;
        entry.setAttribute('role', 'option'); entry.setAttribute('aria-selected', String(option.selected));
        if (option.disabled) entry.setAttribute('aria-disabled', 'true');
        const color = select.dataset.filter === 'frequency' || select.name === 'recurrence' ? RECURRENCES[option.value]?.color : select.dataset.filter === 'group' || select.name === 'groupId' ? state.groups.find(group => group.id === option.value)?.color : null;
        entry.innerHTML = `${color ? `<span class="select-option-dot" style="background:${esc(color)}" aria-hidden="true"></span>` : ''}<span>${esc(option.textContent)}</span><span class="select-option-check" aria-hidden="true">${option.selected ? icon('check') : ''}</span>`;
        entry.addEventListener('pointerdown', event => event.preventDefault());
        entry.addEventListener('click', () => choose(index)); popup.append(entry); return entry;
      });
      let active = Math.max(0, select.selectedIndex);
      const highlight = index => {
        active = index;
        entries.forEach((entry, i) => entry.classList.toggle('highlighted', i === active));
        button.setAttribute('aria-activedescendant', entries[active].id);
        entries[active].scrollIntoView({ block: 'nearest' });
      };
      const choose = index => {
        if (options[index].disabled) return;
        select.selectedIndex = index; refresh(); closeSelectMenu(); button.focus({ preventScroll: true });
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      (dialog.open && dialog.contains(select) ? dialog : document.body).append(popup);
      const bounds = button.getBoundingClientRect();
      const roomBelow = window.innerHeight - bounds.bottom - 12, roomAbove = bounds.top - 12;
      const below = roomBelow >= 180 || roomBelow >= roomAbove;
      const maxHeight = Math.max(80, Math.min(300, below ? roomBelow : roomAbove));
      const width = Math.min(Math.max(bounds.width, 230), window.innerWidth - 24);
      popup.style.width = `${width}px`; popup.style.maxHeight = `${maxHeight}px`;
      popup.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`;
      if (below) popup.style.top = `${bounds.bottom + 7}px`; else popup.style.bottom = `${window.innerHeight - bounds.top + 7}px`;
      button.setAttribute('aria-controls', popup.id); button.setAttribute('aria-expanded', 'true');
      selectMenu = { button, popup, highlight, choose, options, get active() { return active; } };
      highlight(active);
    };
    button.addEventListener('click', () => { if (selectMenu?.button === button) closeSelectMenu(); else open(); });
    let search = '', lastKey = 0;
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') { if (selectMenu?.button === button) { event.preventDefault(); event.stopPropagation(); closeSelectMenu(); } return; }
      if (event.key === 'Tab') { closeSelectMenu(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key) && (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey)) return;
      event.preventDefault();
      if (selectMenu?.button !== button) { open(); if (event.key === 'Enter' || event.key === ' ') return; }
      const menu = selectMenu, enabled = menu.options.map((option, i) => option.disabled ? -1 : i).filter(i => i >= 0);
      if (!enabled.length) return;
      if (event.key === 'Enter' || event.key === ' ') { menu.choose(menu.active); return; }
      let next;
      if (event.key === 'Home') next = enabled[0];
      else if (event.key === 'End') next = enabled.at(-1);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') next = enabled[Math.max(0, Math.min(enabled.length - 1, enabled.indexOf(menu.active) + (event.key === 'ArrowDown' ? 1 : -1)))];
      else {
        search = Date.now() - lastKey > 700 ? event.key : search + event.key; lastKey = Date.now();
        next = enabled.find(i => menu.options[i].textContent.toLocaleLowerCase('fr').startsWith(search.toLocaleLowerCase('fr')));
      }
      if (next !== undefined) menu.highlight(next);
    });
  }
}
document.addEventListener('pointerdown', event => { if (selectMenu && !selectMenu.popup.contains(event.target) && !selectMenu.button.contains(event.target)) closeSelectMenu(); });
window.addEventListener('resize', closeSelectMenu);
document.addEventListener('scroll', event => { if (selectMenu && !selectMenu.popup.contains(event.target)) closeSelectMenu(); }, true);

function rememberFocus(container) {
  const active = document.activeElement;
  if (!active || !container.contains?.(active)) return null;
  const attributes = ['id', 'name', 'data-action', 'data-id', 'data-filter', 'data-stat-filter', 'data-toggle', 'data-page', 'data-view', 'data-date', 'data-subtask', 'data-occurrence', 'data-select-key', 'data-toggle-session'];
  const keys = attributes.flatMap(name => active.hasAttribute(name) ? [[name, active.getAttribute(name)]] : []);
  return keys.length ? { keys, start: active.selectionStart, end: active.selectionEnd } : null;
}
function restoreFocus(container, saved) {
  if (!saved) return;
  const target = [...container.querySelectorAll('button,input,select,textarea,a,[tabindex]')].find(node => saved.keys.every(([name, value]) => node.getAttribute(name) === value));
  target?.focus({ preventScroll: true });
  if (target && typeof saved.start === 'number') {
    try { target.setSelectionRange(saved.start, saved.end); } catch { /* Not all inputs allow text selection. */ }
  }
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = name => name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  tasks: '<path d="m3 6 1 1 2-2m-3 8 1 1 2-2m-3 8 1 1 2-2M10 6h11M10 13h11M10 20h11"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  stats: '<path d="M4 19h16M6 15v-4M12 15V5M18 15V8"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h13"/>',
  bath: '<path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM5 12V5a2 2 0 0 1 4 0M6 19v2m12-2v2"/>',
  bed: '<path d="M3 18V8m18 10V8M3 13h18v5H3M6 13V9h5v4m2 0V9h5v4M3 18v3m18-3v3"/>',
  play: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  kitchen: '<path d="M5 3v6a2 2 0 0 0 4 0V3M7 3v18M18 3c-3 2-3 6-3 9h3m0-9v18"/>',
  sofa: '<path d="M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M5 11a2 2 0 0 0-2 2v5h18v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-2-2M5 18v3m14-3v3"/>',
  door: '<path d="M5 21V3h14v18M3 21h18M15 12h.01"/>',
  box: '<path d="m3 7 9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10M7 5l9 4"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3M3 20V4m0 16h18"/>',
  leaf: '<path d="M20 3C9 3 3 7 5 14s12 8 15-11ZM5 20l10-10"/>',
  laundry: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 8h16M7 5.5h.01m3 0h.01"/><circle cx="12" cy="14" r="4"/><path d="M8 14c2-2 4 2 8 0"/>',
  recycling: '<path d="m9 4 3-2 4 7m-3-1 3 1 1-3M20 11l2 4-8 4m1-3-1 3 3 1M10 20H5L3 11m3 1-3-1-1 3"/>',
  tools: '<path d="m14 6 4-3a5 5 0 0 1-6 7L5 21l-3-3 10-9a5 5 0 0 1 2-6z"/>',
  document: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.tasks}</svg>`;
const roomIcon = group => icon(({ bathroom: 'bath', bedroom: 'bed', 'blue-room': 'bed', playroom: 'play', kitchen: 'kitchen', living: 'sofa', entrance: 'door', storage: 'box', mezzanine: 'stairs', corridor: 'door', garden: 'leaf', laundry: 'laundry', recycling: 'recycling', stock: 'box', equipment: 'tools', admin: 'document' })[group.id] ?? (group.kind === 'room' ? 'home' : 'tasks'));
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
  toast.className = `visible${error ? ' error' : canUndo ? '' : ' quiet'}`;
  toast.setAttribute?.('role', error ? 'alert' : 'status');
  toast.innerHTML = `<span>${esc(message)}</span>${canUndo ? button('undo', 'Annuler', 'toast-undo') : ''}`;
  toastTimer = setTimeout(() => { toast.className = ''; }, canUndo ? 10000 : error ? 6500 : 2400);
}

async function perform(operation, message, after) {
  if (busy) return;
  busy = true; document.body.classList.add('saving');
  const activeButton = document.activeElement?.closest?.('button');
  const buttonContent = activeButton?.innerHTML;
  const wasDisabled = activeButton?.disabled;
  if (activeButton) {
    activeButton.disabled = true;
    activeButton.setAttribute('aria-busy', 'true');
    activeButton.innerHTML = `<span class="save-spinner" aria-hidden="true"></span>${buttonContent}<span class="sr-only"> — Enregistrement en cours</span>`;
  }
  try { await operation(); if (after) after(); if (message) notify(message); }
  catch (error) { notify(error.message, { error: true }); }
  finally {
    busy = false; document.body.classList.remove('saving');
    if (activeButton) { activeButton.innerHTML = buttonContent; activeButton.disabled = wasDisabled; activeButton.removeAttribute('aria-busy'); }
  }
}

function period() {
  if (ui.view === 'day' || ui.page === 'today') return [ui.page === 'today' ? today() : ui.date, ui.page === 'today' ? today() : ui.date];
  if (ui.view === 'month') return [monthStart(ui.date), monthEnd(ui.date)];
  const start = weekStart(ui.date); return [start, addDays(start, 6)];
}
function matches(item) {
  return matchesDuration(item.task, ui.duration) && (ui.page === 'today' ? Boolean(runtime.memberId) && item.memberId === runtime.memberId : !ui.member || item.memberId === ui.member) && (!ui.group || item.task.groupId === ui.group) && (!ui.frequency || item.task.recurrence === ui.frequency) && (!ui.search || `${item.task.title} ${item.task.description}`.toLocaleLowerCase('fr').includes(ui.search.toLocaleLowerCase('fr')));
}
function formatMinutes(minutes) { return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`; }
function estimateLabel(tasks) {
  const estimate = durationEstimate(tasks);
  if (!tasks.length) return '0 min';
  if (!estimate.minutes) return 'Durée à estimer';
  return `${estimate.missing ? 'Au moins ' : '≈ '}${formatMinutes(estimate.minutes)}${estimate.missing ? ` · ${estimate.missing} sans durée` : ''}`;
}
function timeSummaryHTML(items) {
  const remaining = items.filter(item => item.status !== 'done');
  return `<div class="time-overview">${icon('calendar')}<span><strong>Temps restant estimé</strong> ${esc(estimateLabel(remaining.map(item => item.task)))}</span><small>Pour les tâches affichées${ui.member ? ' de ce membre' : ' du foyer'} · estimation, sans répartition automatique</small></div>`;
}
function recapHTML(date) {
  const weekly = ui.recap === 'week';
  const start = weekly ? weekStart(date) : date, end = weekly ? addDays(start, 6) : date;
  const items = visibleOccurrences(start, end), done = items.filter(item => item.status === 'done').length;
  const remaining = items.filter(item => item.status !== 'done');
  const percent = items.length ? Math.round(done / items.length * 100) : 0;
  const label = weekly ? `Cette semaine · ${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short' })}` : dateLabel(date);
  return `<div class="today-period-switch">${button('reorganize', `${icon('tasks')}Équilibrer`, 'text-button')}<div class="view-tabs" role="group" aria-label="Période des tâches affichées">${['day', 'week'].map(value => button('recap-period', value === 'day' ? 'Aujourd’hui' : 'Cette semaine', ui.recap === value ? 'selected' : '', `data-value="${value}" aria-pressed="${ui.recap === value}"`)).join('')}</div></div><section class="today-summary" aria-label="Récapitulatif ${weekly ? 'de la semaine' : 'du jour'}"><div><div class="eyebrow">${esc(label)}</div><h2>${done === items.length && items.length ? (weekly ? 'Tout est fait pour cette semaine.' : 'Tout est fait pour aujourd’hui.') : 'Une action à la fois.'}</h2><p>${done} sur ${items.length} actions réalisées ${weekly ? 'cette semaine' : 'aujourd’hui'}</p><p class="today-time">${esc(estimateLabel(remaining.map(item => item.task)))} · temps restant${ui.group || ui.frequency || ui.duration || ui.search ? ' · selon les filtres' : ''}</p></div><div class="progress-ring" style="--progress:${items.length ? done / items.length * 360 : 0}deg" role="progressbar" aria-label="Actions réalisées" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span>${percent}%</span></div></section>`;
}

function displayCards(currentState, items, date, grouped = true) {
  return sortDurations(cardsForDate(currentState, items, date, grouped), card => {
    const estimate = durationEstimate(sessionItems(card).map(item => item.task));
    return estimate.missing ? null : estimate.minutes;
  }, ui.sort);
}
function visibleOccurrences(start, end) { return occurrences(state, start, end).filter(matches); }
function shown(items) { return ui.showDone ? items : items.filter(o => o.status !== 'done'); }
function resolveItem(id) {
  const at = id.lastIndexOf('@'), taskId = id.slice(0, at), scheduledDate = id.slice(at + 1);
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || state.overrides[id]?.skipped) return null;
  return { id, taskId, scheduledDate, date: scheduledDate, memberId: defaultResponsible(task, state.overrides[id]?.date ?? scheduledDate), status: 'todo', ...state.overrides[id], task };
}

function nav() {
  return [['today', 'Aujourd’hui', 'check'], ['planning', 'Agenda', 'calendar'], ['catalog', 'Tâches', 'tasks'], ['stats', 'Stats', 'stats'], ['settings', 'Réglages', 'settings']].map(([page, label, glyph]) => button('page', `${icon(glyph)}<span>${label}</span>`, `nav-item${ui.page === page ? ' active' : ''}`, `data-page="${page}" aria-label="${label}" title="${label}"${ui.page === page ? ' aria-current="page"' : ''}`)).join('');
}
function activeFilters() {
  return [['member', ui.page !== 'today' && ui.member && memberName(ui.member)], ['group', ui.group && groupById(ui.group).name], ['frequency', ui.frequency && RECURRENCES[ui.frequency]?.label], ['duration', ({short:'≤ 15 min', medium:'16–30 min', long:'> 30 min', unknown:'Sans durée'})[ui.duration]], ['sort', ui.sort && (ui.sort === 'duration-asc' ? 'Courtes d’abord' : 'Longues d’abord')], ['showDone', !ui.showDone && 'À faire seulement']].filter(([, label]) => label);
}
function filters() {
  return `<div class="filter-panel${ui.filtersOpen ? ' is-open' : ''}"><div class="filter-mobile-toolbar">${button('toggle-filters', `${icon('settings')}Filtrer${activeFilters().length ? `<span class="filter-count">${activeFilters().length}</span>` : ''}`, 'subtle-button', `aria-expanded="${ui.filtersOpen}" aria-controls="task-filters"`)}${ui.filtersOpen ? button('reset-filters', 'Réinitialiser', 'text-button') : ''}</div><div class="filters" id="task-filters">${ui.page === 'today' ? '' : `<label><span class="sr-only">Membre</span><select data-filter="member">${option('', 'Tous les membres', ui.member)}${state.members.map(m => option(m.id, m.name, ui.member)).join('')}</select></label>`}<label><span class="sr-only">Pièce</span><select data-filter="group">${option('', 'Toutes les pièces', ui.group)}${groupOptions(ui.group)}</select></label><label><span class="sr-only">Fréquence</span><select data-filter="frequency">${option('', 'Toutes les fréquences', ui.frequency)}${recurrenceOptions(ui.frequency)}</select></label><label><span class="sr-only">Durée estimée</span><select data-filter="duration">${[['', 'Toutes les durées'], ['short', '15 min ou moins'], ['medium', '16 à 30 min'], ['long', 'Plus de 30 min'], ['unknown', 'Durée à renseigner']].map(([value, label]) => option(value, label, ui.duration)).join('')}</select></label><label><span class="sr-only">Trier les tâches</span><select data-filter="sort">${[['', 'Ordre habituel'], ['duration-asc', 'Les plus courtes d’abord'], ['duration-desc', 'Les plus longues d’abord']].map(([value, label]) => option(value, label, ui.sort)).join('')}</select></label><label class="done-switch"><input type="checkbox" data-filter="showDone" ${ui.showDone ? 'checked' : ''}>Voir les tâches faites</label></div><div class="filter-chips">${activeFilters().map(([key, label]) => button('clear-filter', `${esc(label)}<span aria-hidden="true">×</span>`, 'filter-chip', `data-key="${key}" aria-label="Retirer le filtre : ${esc(label)}"`)).join('')}</div></div>`;
}

function sessionItems(card) {
  if (!card.session) return card.items;
  if (!sessionCardsCache.has(card.date)) sessionCardsCache.set(card.date, cardsForDate(state, occurrences(state, card.date, card.date), card.date));
  const items = sessionCardsCache.get(card.date).find(full => full.id === card.id)?.items ?? card.items;
  return ui.page === 'today' ? items.filter(item => item.memberId === runtime.memberId) : items;
}
function assignmentsHTML(items, detailed = false) {
  const members = [...new Set(items.map(item => item.memberId))];
  return `<div class="assignment-list${detailed ? ' assignment-list-detailed' : ''}">${members.map(id => {
    const actions = items.filter(item => item.memberId === id);
    const remaining = actions.filter(item => item.status !== 'done').length;
    const count = items.length > 1 ? `${actions.length} action${actions.length > 1 ? 's' : ''}` : '';
    return `<span class="assignment-pill"><span class="avatar avatar-small" aria-hidden="true">${id ? esc(initials(memberName(id))) : '?'}</span><span><strong>${esc(memberName(id))}</strong>${count ? `<small>${count}${detailed ? ` · ${remaining} à faire` : ''}</small>` : ''}</span></span>`;
  }).join('')}</div>`;
}

function cardHTML(card, compact = false) {
  renderedCards.set(card.id, card);
  const progressItems = sessionItems(card);
  const done = progressItems.filter(o => o.status === 'done').length, allDone = done === progressItems.length;
  const frequencies = [...new Set(card.items.map(o => o.task.recurrence))];
  const freq = frequencies.length === 1 ? RECURRENCES[frequencies[0]] : null;
  const members = [...new Set(card.items.map(o => o.memberId))];
  const assigned = members.length === 1 ? memberName(members[0]) : `${members.length} responsables`;
  const colors = frequencies.map(f => RECURRENCES[f]?.color ?? '#888');
  const stripe = freq ? freq.color : `linear-gradient(to bottom, ${colors.map((c, i) => `${c} ${i * 100 / colors.length}% ${(i + 1) * 100 / colors.length}%`).join(',')})`;
  return `<article class="task-card${card.session ? ' session-card' : ''}${allDone ? ' completed' : ''}${compact ? ' compact' : ''}" style="--stripe:${stripe}" data-card="${esc(card.id)}">
    <div class="card-top"><span class="card-kind">${card.session ? `${icon('tasks')}Séance` : 'Tâche'}</span><div class="card-tools">${!allDone ? button('quick-move', icon('more'), 'card-more', `data-id="${esc(card.id)}" aria-label="Options pour ${esc(card.title)}" title="Options"`) : ''}<button type="button" class="drag-handle" data-drag="${esc(card.id)}" draggable="true" aria-label="Déplacer ${esc(card.title)}">${icon('grip')}</button></div></div>
    <button type="button" class="card-title" title="${esc(card.title)}" data-action="detail" data-id="${esc(card.id)}">${esc(card.title)}</button>
    <div class="card-badges">${groupBadge(card.groupId)}${frequencies.length === 1 ? frequencyBadge(frequencies[0]) : `<span class="frequency-badge neutral">${frequencies.length} fréquences</span>`}</div>
    ${durationEstimate(progressItems.map(item => item.task)).minutes ? `<div class="card-duration">${esc(estimateLabel(progressItems.map(item => item.task)))}</div>` : ''}<div class="card-bottom">${card.session ? `<label class="task-check session-check"><input type="checkbox" data-toggle-session="${esc(card.id)}" ${allDone ? 'checked' : ''} aria-label="${ui.page === 'today' ? (allDone ? 'Remettre mes actions à faire' : 'Terminer mes actions') : (allDone ? 'Remettre à faire' : 'Terminer') + ' toutes les tâches'} de ${esc(card.title)}"><span class="session-progress">${allDone ? 'Terminée · ' : ''}${ui.page === 'today' ? 'Mes actions · ' : ''}${done}/${progressItems.length}${ui.page === 'today' ? '' : ' actions'}</span></label>` : `<label class="task-check"><input type="checkbox" data-toggle="${esc(card.items[0].id)}" ${allDone ? 'checked' : ''} aria-label="Terminer ${esc(card.title)}"><span>${allDone ? 'Fait' : 'À faire'}</span></label>`}${assignmentsHTML(progressItems)}</div>
    ${card.session ? `<div class="card-progress" role="progressbar" aria-label="Progression de la séance" aria-valuemin="0" aria-valuemax="${progressItems.length}" aria-valuenow="${done}"><span style="width:${done / progressItems.length * 100}%"></span></div>` : ''}
  </article>`;
}

function dayColumn(date, items, compact = false) {
  const dayItems = items.filter(o => o.date === date), done = dayItems.filter(o => o.status === 'done').length;
  const cards = displayCards(state, shown(dayItems), date, ui.grouped);
  return `<section class="day-column${date === today() ? ' is-today' : ''}" data-drop-date="${date}" aria-label="${esc(dateLabel(date))}"><div class="day-heading"><span>${formatDate(date, { weekday: 'short' })}</span><button type="button" data-action="select-day" data-date="${date}" class="day-number">${formatDate(date, { day: 'numeric' })}</button><span class="day-count">${dayItems.length ? `${done}/${dayItems.length}` : '—'}</span>${durationEstimate(dayItems.filter(item => item.status !== 'done').map(item => item.task)).minutes ? `<span class="day-time">${esc(estimateLabel(dayItems.filter(item => item.status !== 'done').map(item => item.task)))}</span>` : ''}</div><div class="day-cards">${cards.map(c => cardHTML(c, compact)).join('') || '<div class="day-empty">Rien de prévu</div>'}</div>${button('new-task', `${icon('plus')}<span>Ajouter</span>`, 'day-add', `data-date="${date}"`)}</section>`;
}

function miniCalendar() {
  const first = weekStart(monthStart(ui.date)), days = datesBetween(first, addDays(first, 41));
  return `<div class="mini-calendar"><div class="mini-title">${formatDate(ui.date, { month: 'long', year: 'numeric' })}</div><div class="mini-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="mini-weekday">${d}</span>`).join('')}${days.map(date => button('select-day', formatDate(date, { day: 'numeric' }), `mini-date${date === ui.date ? ' selected' : ''}${date.slice(0, 7) !== ui.date.slice(0, 7) ? ' outside' : ''}`, `data-date="${date}" aria-label="${esc(dateLabel(date))}"`)).join('')}</div></div>`;
}

function planningHTML() {
  const [start, end] = period(), items = visibleOccurrences(start, end);
  const done = items.filter(item => item.status === 'done').length;
  const notConfigured = state.tasks.filter(t => !t.archived && (!t.anchor || !t.recurrence));
  const overdue = visibleOccurrences(earliestAnchor(state, today()), addDays(today(), -1)).filter(o => o.status !== 'done');
  const heading = ui.view === 'month' ? formatDate(ui.date, { month: 'long', year: 'numeric' }) : ui.view === 'day' ? dateLabel(ui.date) : `${formatDate(start, { day: 'numeric' })} – ${formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  let board;
  if (ui.view === 'month') {
    const gridStart = weekStart(start), gridEnd = addDays(weekStart(end), 6), dates = datesBetween(gridStart, gridEnd);
    const gridItems = visibleOccurrences(gridStart, gridEnd);
    board = `<div class="month-weekdays">${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(s => `<span>${s}</span>`).join('')}</div><div class="month-grid">${dates.map(date => {
      const cards = displayCards(state, shown(gridItems), date, ui.grouped);
      return `<section class="month-cell${date === today() ? ' is-today' : ''}${date.slice(0, 7) !== start.slice(0, 7) ? ' outside' : ''}" data-drop-date="${date}">${button('select-day', formatDate(date, { day: 'numeric' }), 'month-number', `data-date="${date}" aria-label="${esc(dateLabel(date))}"`)}${cards.slice(0, 3).map(c => {
        renderedCards.set(c.id, c); const g = groupById(c.groupId);
        const fullItems = sessionItems(c);
        const completed = fullItems.length > 0 && fullItems.every(item => item.status === 'done');
        return button('detail', `<span class="month-dot" style="background:${g.color}"></span><span>${esc(c.title)}</span>${completed ? '<span class="sr-only"> — Terminée</span>' : ''}`, `month-task${completed ? ' completed' : ''}`, `data-id="${esc(c.id)}"`);
      }).join('')}${cards.length > 3 ? button('select-day', `+ ${cards.length - 3} autres`, 'month-more', `data-date="${date}"`) : ''}</section>`;
    }).join('')}</div>`;
  } else if (ui.view === 'day') {
    board = `<div class="daily-grid" data-drop-date="${ui.date}">${displayCards(state, shown(items), ui.date, ui.grouped).map(c => cardHTML(c)).join('') || '<div class="empty-state">Une journée libre.<br>Ajoute une tâche pour commencer.</div>'}</div>`;
  } else {
    const days = datesBetween(start, end);
    board = `<div class="mobile-week-strip">${days.map(date => button('focus-day', `<span>${formatDate(date, { weekday: 'short' })}</span><strong>${formatDate(date, { day: 'numeric' })}</strong>`, date === ui.date ? 'selected' : '', `data-date="${date}"`)).join('')}</div><div class="week-board" tabindex="0" role="region" aria-label="Planning de la semaine">${days.map(date => dayColumn(date, items)).join('')}</div><div class="mobile-day-list" data-drop-date="${ui.date}">${displayCards(state, shown(items), ui.date, ui.grouped).map(c => cardHTML(c)).join('') || '<div class="empty-state">Rien de prévu ce jour.</div>'}</div>`;
  }
  return `<div class="planning-toolbar"><div class="period-control">${button('previous', icon('left'), 'icon-button', 'aria-label="Période précédente"')}<h2>${esc(heading)}</h2>${button('next', icon('right'), 'icon-button', 'aria-label="Période suivante"')}${button('today', 'Aujourd’hui', 'subtle-button')}</div><div class="view-tabs" aria-label="Vue de l’agenda">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([v, s]) => button('view', s, ui.view === v ? 'selected' : '', `data-view="${v}" aria-pressed="${ui.view === v}"`)).join('')}</div></div>
    ${filters()}${timeSummaryHTML(items)}<div class="agenda-panel-controls">${button('clear-period-assignments', 'Retirer les responsables', 'text-button muted')}${button('reorganize', `${icon('tasks')}Équilibrer`, 'text-button')}${button('toggle-calendar', `${icon('calendar')}${ui.calendarCollapsed ? 'Afficher le calendrier' : 'Replier le calendrier'}`, 'text-button', `aria-expanded="${!ui.calendarCollapsed}" aria-controls="calendar-panel"`)}</div><div class="agenda-layout${ui.calendarCollapsed ? ' calendar-collapsed' : ''}"><aside class="agenda-aside" id="calendar-panel"${ui.calendarCollapsed ? ' hidden' : ''}>${miniCalendar()}<div class="week-summary"><div class="eyebrow">${ui.view === 'day' ? 'La journée' : ui.view === 'month' ? 'Le mois' : 'La semaine'}</div><div class="summary-number">${done}<span> / ${items.length}</span></div><p>actions réalisées</p><div class="summary-track"><span style="width:${items.length ? done / items.length * 100 : 0}%"></span></div></div><div class="aside-section"><div class="aside-title">À configurer <span>${notConfigured.length}</span></div><p>Ces étapes n’ont pas de fréquence indiquée dans les documents.</p>${button('review', 'Voir les étapes', 'text-button')}${overdue.length ? button('overdue', `${overdue.length} actions en retard`, 'overdue-link') : ''}</div><div class="aside-section legend"><div class="aside-title">Les récurrences</div>${Object.entries(RECURRENCES).filter(([key]) => key !== 'once').map(([, r]) => `<div><span style="background:${r.color}"></span>${r.label}</div>`).join('')}</div></aside><div class="agenda-board">${board}</div></div><div class="board-footer"><label><input type="checkbox" data-filter="grouped" ${ui.grouped ? 'checked' : ''}>Regrouper les tâches en séances</label><span>Déplace une carte avec sa poignée, ou ouvre-la pour choisir une date.</span></div>`;
}

function todayHTML() {
  const date = today(), weekly = ui.recap === 'week';
  const start = weekly ? weekStart(date) : date, end = weekly ? addDays(start, 6) : date;
  const upcoming = visibleOccurrences(start, end);
  // Earlier unfinished actions appear separately and never duplicate the period's cards.
  const overdue = visibleOccurrences(earliestAnchor(state, today()), addDays(start < today() ? start : today(), -1)).filter(item => item.status === 'todo');
  const days = datesBetween(start, end);
  const program = days.map(day => {
    const cards = displayCards(state, shown(upcoming), day, ui.grouped);
    return `<section class="today-program-day" aria-label="${esc(dateLabel(day))}">${weekly ? `<h3 class="today-day-heading">${esc(dateLabel(day))}${day === today() ? '<span>Aujourd’hui</span>' : ''}</h3>` : ''}<div class="daily-grid" data-drop-date="${day}">${cards.map(card => cardHTML(card)).join('') || '<div class="empty-state">Aucune tâche pour ces filtres.</div>'}</div></section>`;
  }).join('');
  return `${filters()}${recapHTML(date)}<section class="today-program"><div class="section-heading"><h2>${weekly ? 'Mes tâches cette semaine' : 'Mes tâches aujourd’hui'}</h2></div>${weekly ? `<div class="today-week-scroll" tabindex="0" role="region" aria-label="Tâches et séances de la semaine en cours"><div class="today-week-grid">${program}</div></div>` : program}</section>${overdue.length ? `<details class="overdue-section today-overdue"><summary>À rattraper <span>${overdue.length} actions</span></summary><div class="daily-grid">${groupPastCards(overdue).map(card => cardHTML(card)).join('')}</div></details>` : ''}`;
}

function groupPastCards(items) { return [...new Set(items.map(o => o.date))].flatMap(date => displayCards(state, items, date, ui.grouped)).map(c => ({ ...c, title: `${c.title} · ${formatDate(c.date, { day: 'numeric', month: 'short' })}` })); }

function catalogHTML() {
  const tasks = state.tasks.filter(t => !t.archived && matchesDuration(t, ui.duration) && (!ui.group || t.groupId === ui.group) && (!ui.frequency || t.recurrence === ui.frequency) && (!ui.member || t.memberId === ui.member) && (!ui.onlyReview || !t.recurrence || !t.anchor || t.reviewNote) && `${t.title} ${t.description}`.toLocaleLowerCase('fr').includes(ui.search.toLocaleLowerCase('fr')));
  const sections = state.groups.map(group => {
    const rows = sortDurations(tasks.filter(task => task.groupId === group.id), task => task.estimatedMinutes ?? null, ui.sort);
    if (!rows.length) return '';
    const open = (ui.search ? catalogSearchOpen : catalogOpen).get(group.id) ?? Boolean(ui.search);
    const contentId = `catalog-group-${group.id}`;
    const unconfigured = rows.filter(t => !t.recurrence || !t.anchor).length;
    const subtitle = unconfigured ? `${unconfigured} à configurer` : group.kind === 'room' ? 'Les routines de cette pièce' : 'Les routines du foyer';
    return `<section class="catalog-group" style="--room:${esc(group.color)}"><h2 class="catalog-group-heading">${button('toggle-catalog-group', `<span class="catalog-room-icon" aria-hidden="true">${roomIcon(group)}</span><span class="catalog-group-label"><span class="catalog-group-name">${esc(group.name)}</span><span class="catalog-group-subtitle">${esc(subtitle)}</span></span><span class="catalog-group-count">${rows.length}<span class="catalog-count-unit"> tâche${rows.length > 1 ? 's' : ''}</span></span><span class="catalog-chevron" aria-hidden="true">${icon('right')}</span>`, 'catalog-group-toggle', `data-id="${esc(group.id)}" aria-expanded="${open}" aria-controls="${esc(contentId)}"`)}</h2><div id="${esc(contentId)}" class="catalog-group-content"${open ? '' : ' hidden'}>${rows.map(t => `<article class="catalog-row"><div class="catalog-main"><h3>${esc(t.title)}</h3>${t.description ? `<p>${esc(t.description)}</p>` : ''}${t.reviewNote ? `<span class="review-note">${esc(t.reviewNote)}</span>` : ''}</div><div class="catalog-meta">${frequencyBadge(t.recurrence)}${weekdayLabelHTML(t)}<span class="duration-badge">${esc(t.estimatedMinutes ? '≈ ' + formatMinutes(t.estimatedMinutes) : 'Durée à estimer')}</span><span>${esc(memberName(t.memberId))}</span>${t.anchor ? `<span class="muted">À partir du ${formatDate(t.anchor, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div><div class="catalog-actions">${button('edit-task', t.recurrence && t.anchor ? 'Modifier' : 'Configurer', 'subtle-button', `data-id="${esc(t.id)}"`)}${button('duplicate-task', 'Dupliquer', 'text-button duplicate-button', `data-id="${esc(t.id)}"`)}${button('archive', 'Archiver', 'text-button muted', `data-id="${esc(t.id)}"`)}</div></article>`).join('')}</div></section>`;
  }).join('');
  return `<div class="catalog-tools"><label class="search-input">${icon('search')}<input type="search" id="catalog-search" placeholder="Rechercher une tâche…" value="${esc(ui.search)}" aria-label="Rechercher une tâche"></label><label class="done-switch"><input type="checkbox" data-filter="onlyReview" ${ui.onlyReview ? 'checked' : ''}>À vérifier ou configurer</label><span class="result-count">${tasks.length} tâches</span></div>${filters()}<div class="catalog-fold-controls">${button('expand-catalog', 'Tout déplier', 'text-button')}${button('collapse-catalog', 'Tout replier', 'text-button')}${button('clear-catalog-assignments', 'Retirer les responsables', 'text-button muted')}${isMmsFamily() && durationSuggestions().length ? button('suggest-durations', 'Ajouter les durées estimées', 'text-button') : ''}</div><div class="catalog-list">${sections || '<div class="empty-state">Aucune tâche ne correspond à cette recherche.</div>'}</div>`;
}

function statisticsWindow() {
  const now=today(), year=now.slice(0,4);
  const start=ui.statsPeriod==='week'?weekStart(now):ui.statsPeriod==='year'?`${year}-01-01`:ui.statsPeriod==='all'?addDays(now,-364):monthStart(now);
  const end=ui.statsPeriod==='week'?addDays(start,6):ui.statsPeriod==='year'?`${year}-12-31`:ui.statsPeriod==='all'?now:monthEnd(now);
  return {start,end,now,allHistory:ui.statsPeriod==='all',memberId:ui.statsMember,groupId:ui.statsGroup,frequency:ui.statsFrequency};
}
function statisticsHTML() {
  const window=statisticsWindow(), model=householdStatistics(state,window); statsModel=model;
  const actorName=id=>id ? memberName(id) : 'Auteur non renseigné';
  const minutesLabel=(minutes,missing)=>minutes ? `${missing?'Au moins ':'≈ '}${formatMinutes(minutes)}` : missing?'Non renseigné':'0 min';
  const stat=(value,label,hint,glyph='tasks')=>`<article class="stat-tile"><span class="stat-tile-icon">${icon(glyph)}</span><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(hint)}</small></article>`;
  const distribution=(rows,name,color,action)=>rows.length?`<div class="stat-distribution">${rows.map(row=>`<button type="button" class="stat-bar-row" data-action="${action}" data-id="${esc(row.id)}" ${!row.id?'disabled':''} aria-label="Filtrer : ${esc(name(row.id))}"><span class="stat-bar-heading"><strong>${esc(name(row.id))}</strong><span>${row.count} · ${model.completed?Math.round(row.count/model.completed*100):0}%</span></span><span class="stat-bar-track"><i style="width:${model.completed?row.count/model.completed*100:0}%;background:${esc(color(row.id))}"></i></span><small>${esc(minutesLabel(row.minutes,row.missing))}${row.missing?` · ${row.missing} sans durée`:''}</small></button>`).join('')}</div>`:'<p class="stats-empty">Les premiers coups de main feront pousser ce graphique.</p>';
  const leader=model.byMember.find(row=>row.id), room=model.byRoom[0];
  const history=model.history.filter(item=>`${item.task.title} ${actorName(item.actorId)} ${groupById(item.task.groupId).name}`.toLocaleLowerCase('fr').includes(ui.statsSearch.toLocaleLowerCase('fr')));
  const maxWeekday=Math.max(1,...model.weekdays.map(day=>day.count)), maxHeat=Math.max(1,...model.heatmap.map(day=>day.count));
  const totalHint=window.allHistory?'Toutes les réalisations conservées':'Réalisations sur la période';
  return `<div class="stats-controls"><div class="view-tabs stats-period" role="group" aria-label="Période des statistiques">${[['week','Semaine'],['month','Mois'],['year','Année'],['all','Tout']].map(([value,label])=>button('stats-period',label,ui.statsPeriod===value?'selected':'',`data-value="${value}" aria-pressed="${ui.statsPeriod===value}"`)).join('')}</div><label><span class="sr-only">Personne</span><select data-stat-filter="statsMember" aria-label="Réalisé par">${option('','Tout le foyer',ui.statsMember)}${state.members.map(member=>option(member.id,member.name,ui.statsMember)).join('')}</select></label><label><span class="sr-only">Pièce</span><select data-stat-filter="statsGroup" aria-label="Pièce des statistiques">${option('','Toutes les pièces',ui.statsGroup)}${groupOptions(ui.statsGroup)}</select></label><label><span class="sr-only">Fréquence</span><select data-stat-filter="statsFrequency" aria-label="Fréquence des statistiques">${option('','Toutes les fréquences',ui.statsFrequency)}${recurrenceOptions(ui.statsFrequency)}</select></label>${ui.statsMember || ui.statsGroup || ui.statsFrequency ? button('stats-reset','Tout afficher','text-button'):''}${button('stats-export',`${icon('document')}Exporter les détails`,'text-button')}</div><section class="stats-hero"><div><div class="eyebrow">${esc(totalHint)}</div><h2>${model.completed>100?'Les moutons de poussière font leurs valises.':model.completed?'La maison respire. Merci les petites mains.':'Le balai attend son premier héros.'}</h2><p>${model.completed} actions faites · ${model.activeDays} jours actifs${model.missing?` · ${model.missing} durées à renseigner`:''}</p><span class="stats-hero-note">${ui.statsMember?`Réalisé par ${esc(memberName(ui.statsMember))}`:'Les efforts de tout le foyer'} · ${window.allHistory?'historique enregistré':`${esc(formatDate(window.start,{day:'numeric',month:'short'}))} – ${esc(formatDate(window.end,{day:'numeric',month:'short',year:'numeric'}))}`}</span></div><div class="stats-ring-wrap"><div class="progress-ring" style="--progress:${model.progress*3.6}deg" role="progressbar" aria-label="Avancement des actions planifiées" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${model.progress}"><span>${model.progress}%</span></div><small>${window.allHistory?'Planning · 365 jours':'Planning de la période'}</small></div></section><div class="stat-tiles">${stat(model.completed,'Actions réalisées','Personne qui a coché','check')}${stat(minutesLabel(model.minutes,model.missing),'Temps de ménage estimé',model.missing?`${model.missing} actions sans durée`:'D’après les durées configurées','calendar')}${stat(model.pending,'Actions encore à faire',`${model.scheduledDone} / ${model.planned} actions planifiées faites`,'tasks')}${stat(model.overdue,'Actions en retard','Assignées et échues','calendar')}${stat(model.activeDays,'Jours où ça a bougé',`${model.currentStreak} jours de série actuelle`,'leaf')}${stat(`${model.bestStreak} j`,'Meilleure série de la période','Même un petit geste compte','home')}</div><div class="stats-grid"><section class="stats-panel"><div class="stats-panel-heading"><div class="eyebrow">Les coups de main</div><h2>Qui fait quoi, en vrai ?</h2><p>Selon la personne qui coche. Clique sur un membre pour explorer.</p></div>${distribution(model.byMember,actorName,id=>['#648b73','#c79563','#8794bd','#ab879b'][Math.max(0,state.members.findIndex(member=>member.id===id))%4],'stats-member')}</section><section class="stats-panel"><div class="stats-panel-heading"><div class="eyebrow">Les pièces</div><h2>Où le balai se promène</h2><p>Réalisations par pièce ou catégorie. Clique pour filtrer.</p></div>${distribution(model.byRoom,id=>groupById(id).name,id=>groupById(id).color,'stats-room')}</section><section class="stats-panel stats-wide"><div class="stats-panel-heading"><div class="eyebrow">Le rythme de la maison</div><h2>Petits gestes, grande différence</h2><p>${esc(dateLabel(model.chartStart))} – ${esc(dateLabel(model.chartEnd))}. Chaque case représente un jour ; clique sur un jour actif.</p></div><div class="stats-heat-scroll"><div class="stats-heat-labels" aria-hidden="true">${['L','M','M','J','V','S','D'].map(day=>`<span>${day}</span>`).join('')}</div><div class="stats-heatmap">${model.heatmap.map(day=>button('stats-day','',`stats-heat-cell${day.outside?' outside':''}`,`data-date="${day.date}" style="--level:${day.count?Math.max(.25,day.count/maxHeat):0}" ${!day.count || day.outside?'disabled':''} aria-label="${esc(dateLabel(day.date))} : ${day.count} actions" title="${esc(dateLabel(day.date))} · ${day.count} actions"`)).join('')}</div></div><div class="stats-heat-legend"><span>Moins</span><i></i><i></i><i></i><i></i><span>Plus</span></div></section><section class="stats-panel"><div class="stats-panel-heading"><div class="eyebrow">Les habitudes</div><h2>Le jour où ça s’active</h2></div><div class="stats-weekdays" role="img" aria-label="${esc(model.weekdays.map(day=>`${WEEKDAYS[day.id]} : ${day.count} actions`).join(', '))}">${model.weekdays.map(day=>`<div><strong>${day.count}</strong><span class="stats-weekday-track"><i style="height:${day.count/maxWeekday*100}%"></i></span><small>${WEEKDAYS[day.id].slice(0,3)}</small></div>`).join('')}</div><p class="stats-footnote">${model.completed?'Un rythme, pas une obligation. Le canapé ne juge pas.':'Pas encore de rythme à afficher.'}</p></section><section class="stats-panel"><div class="stats-panel-heading"><div class="eyebrow">Les échéances</div><h2>À l’heure ou presque</h2></div><div class="stats-timing"><strong>${model.timingKnown?Math.round(model.onTime/model.timingKnown*100)+'%':'—'}</strong><span>réalisées à temps</span></div><div class="stats-mini-metrics"><span><strong>${model.onTime}</strong> à temps</span><span><strong>${model.late}</strong> après l’échéance</span><span><strong>${model.late?model.averageDelay.toFixed(1).replace('.',',')+' j':'—'}</strong> retard moyen</span></div><p class="stats-footnote">${model.timingKnown} réalisations datées · comparaison à la date prévue après report.</p></section><section class="stats-panel stats-wide"><div class="stats-panel-heading"><div class="eyebrow">Les petites victoires</div><h2>Le tableau d’honneur du plumeau</h2><p>Des clins d’œil aux gestes enregistrés, sans points inventés.</p></div><div class="stats-trophies"><article><span aria-hidden="true">🏅</span><h3>Le plumeau d’or</h3><strong>${leader?esc(actorName(leader.id)):'À décrocher'}</strong><p>${leader?`${leader.count} actions réalisées sur cette période.`:'Une première action et le voilà lancé.'}</p></article><article><span aria-hidden="true">🧹</span><h3>Le balai voyageur</h3><strong>${room?esc(groupById(room.id).name):'À explorer'}</strong><p>${room?`${room.count} actions réalisées ici.`:'Les pièces n’ont pas encore raconté leur histoire.'}</p></article><article><span aria-hidden="true">✨</span><h3>La série qui brille</h3><strong>${model.bestStreak?model.bestStreak+' jours':'Premier éclat attendu'}</strong><p>Au moins une action chaque jour de la série.</p></article></div></section><section class="stats-panel stats-wide"><div class="stats-panel-heading"><div class="eyebrow">Chaque routine à la loupe</div><h2>Les tâches qui reviennent</h2><p>Les versions d’une même série sont réunies.</p></div>${model.byTask.length?`<div class="stats-table-scroll"><table class="stats-table"><thead><tr><th>Tâche</th><th>Faites</th><th>Temps estimé</th><th>Réalisé par</th><th>Dernière fois</th></tr></thead><tbody>${model.byTask.map(row=>`<tr><td><strong>${esc(row.title)}</strong><small>${esc(groupById(row.groupId).name)}</small></td><td>${row.count}</td><td>${esc(minutesLabel(row.minutes,row.missing))}${row.missing?`<small>${row.missing} sans durée</small>`:''}</td><td>${esc(row.participants.map(actorName).join(', '))}</td><td>${esc(formatDate(row.last,{day:'numeric',month:'short',year:'numeric'}))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="stats-empty">Les routines apparaîtront après leur première réalisation.</p>'}</section><section class="stats-panel"><div class="stats-panel-heading"><div class="eyebrow">Les répétitions</div><h2>À chaque rythme son effort</h2></div><div class="stats-frequency-list">${model.byFrequency.map(row=>`<div>${frequencyBadge(row.id)}<strong>${row.count}</strong><small>${esc(minutesLabel(row.minutes,row.missing))}</small></div>`).join('') || '<p class="stats-empty">Aucune réalisation pour ces filtres.</p>'}</div></section><section class="stats-panel"><div class="stats-panel-heading"><div class="eyebrow">Les coulisses</div><h2>Le planning sous le capot</h2></div><dl class="stats-inventory">${[['Tâches actives',model.catalog.active],['À configurer',model.catalog.unconfigured],['Anciennes définitions / archives',model.catalog.archived],['Séances configurées',model.sessions],['Sous-tâches configurées',model.catalog.subtasks],['Étapes cochées des actions faites',model.subtasksDone],['Échéances reportées',model.moved],['Occurrences regroupées',model.merged],['Responsable différent de la série',model.reassigned]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="stats-footnote">État actuellement sauvegardé, pas un journal de chaque modification.</p></section><section class="stats-panel stats-wide"><div class="stats-panel-heading"><div class="eyebrow">L’historique</div><h2>Le carnet des coups de main</h2></div><label class="search-input stats-search">${icon('search')}<input id="stats-search" type="search" placeholder="Une tâche, une pièce, une personne…" value="${esc(ui.statsSearch)}" aria-label="Rechercher dans l’historique"></label><div class="stats-history">${history.slice(0,ui.statsLimit).map(item=>button('stats-record',`<span class="stat-record-icon">${roomIcon(groupById(item.task.groupId))}</span><span class="stat-record-main"><strong>${esc(item.task.title)}</strong><small>${esc(groupById(item.task.groupId).name)} · ${esc(actorName(item.actorId))}${item.memberId!==item.actorId?` · assignée à ${esc(memberName(item.memberId))}`:''}</small></span><span class="stat-record-date">${esc(formatDate(item.completedDate,{day:'numeric',month:'short',year:'numeric'}))}<small>${item.approximateDate?'Date estimée':item.lateDays?`${item.lateDays} j après l’échéance`:'À temps'} · ${item.minutes?esc(formatMinutes(item.minutes))+' estimées':'Durée inconnue'}</small></span>`,'stat-record',`data-id="${esc(item.id)}"`)).join('') || '<p class="stats-empty">Aucune réalisation enregistrée pour cette recherche.</p>'}</div>${history.length>ui.statsLimit?button('stats-more',`Voir plus · ${history.length-ui.statsLimit} restantes`,'subtle-button'):''}</section></div><details class="stats-method"><summary>Ce que racontent ces chiffres</summary><p>Les réalisations sont attribuées à la personne qui coche. Les temps sont la somme des durées configurées, sans chronomètre ; les durées inconnues restent inconnues. Les compteurs du planning concernent les actions assignées sur la période, les graphiques concernent les validations effectuées.</p><p>Décocher une action retire sa réalisation des statistiques. Les reports et affectations décrivent les exceptions actuellement conservées. Les titres et durées viennent des définitions de tâches sauvegardées.</p><p>${window.allHistory?'Toutes les réalisations sauvegardées sont incluses ; les compteurs du planning couvrent les 365 derniers jours. ':''}Pour les longues périodes, le calendrier montre les 84 derniers jours, avec les semaines alignées du lundi au dimanche. ${model.datesEstimated} dates estimées et ${model.unknownActor} auteurs non renseignés dans cette sélection. Les dates estimées sont exclues du calcul de ponctualité.</p></details>`;
}
function statisticsRecord(id) {
  const item=statsModel?.history.find(item=>item.id===id); if(!item)return;
  openDialog(`${dialogHeader(item.task.title,'Le détail d’un coup de main')}<dl class="stats-inventory"><div><dt>Réalisé par</dt><dd>${esc(item.actorId?memberName(item.actorId):'Auteur non renseigné')}</dd></div><div><dt>Assigné à</dt><dd>${esc(memberName(item.memberId))}</dd></div><div><dt>Pièce</dt><dd>${esc(groupById(item.task.groupId).name)}</dd></div><div><dt>Date de réalisation${item.approximateDate?' estimée':''}</dt><dd>${esc(dateLabel(item.completedDate))}</dd></div><div><dt>Date prévue après report</dt><dd>${esc(dateLabel(item.date))}</dd></div><div><dt>Échéance d’origine</dt><dd>${esc(dateLabel(item.scheduledDate))}</dd></div><div><dt>Durée estimée</dt><dd>${item.minutes?esc(formatMinutes(item.minutes)):'Non renseignée'}</dd></div><div><dt>Étapes cochées</dt><dd>${item.subtaskDone?.length||0} / ${item.task.subtasks?.length||0}</dd></div></dl><div class="dialog-actions">${button('close','Fermer','subtle-button')}</div>`);
}
function exportStatistics() {
  if(!statsModel)return;
  const cell=value=>{let text=String(value??'');if(/^\s*[=+@-]|^[\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['Tâche','Pièce','Réalisé par','Assigné à','Date réalisation','Date estimée','Date prévue','Échéance origine','Minutes estimées','Jours de retard'],...statsModel.history.map(item=>[item.task.title,groupById(item.task.groupId).name,item.actorId?memberName(item.actorId):'Inconnu',memberName(item.memberId),item.completedDate,item.approximateDate?'oui':'non',item.date,item.scheduledDate,item.minutes||'',item.approximateDate?'':item.lateDays])];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`maison-statistiques-${today()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function settingsHTML() {
  return `<div class="settings-grid"><section class="settings-panel"><div class="eyebrow">Le foyer</div><h2>${esc(state.household.name)}</h2><p>Les tâches et les séances peuvent être attribuées à chacun.</p><div class="members-list">${state.members.map(m => `<div class="member-row"><span class="avatar">${esc(initials(m.name))}</span><strong>${esc(m.name)}</strong>${runtime.mode === 'demo' || runtime.permissions?.canInvite || m.id === runtime.memberId ? button('rename-member', 'Renommer', 'text-button', `data-id="${esc(m.id)}"`) : ''}${runtime.permissions?.canInvite && m.id !== runtime.memberId ? button('invite', 'Invitation', 'subtle-button', `data-id="${esc(m.id)}"`) : ''}</div>`).join('')}</div>${runtime.mode === 'demo' || runtime.permissions?.canInvite ? button('add-member', `${icon('plus')}Préparer une invitation`, 'subtle-button') : ''}</section><section class="settings-panel"><div class="eyebrow">Les pièces</div><h2>Des repères à votre image</h2><p>La couleur d’une pièce reste indépendante de la récurrence.</p><div class="room-settings">${state.groups.filter(g => g.kind === 'room').map(g => `<label><span>${esc(g.name)}</span><input type="color" data-group-color="${g.id}" value="${g.color}" aria-label="Couleur de ${esc(g.name)}"></label>`).join('')}</div></section><section class="settings-panel"><div class="eyebrow">Sauvegarde</div><h2>Garder une copie</h2><p>Exporte les tâches, les répétitions et l’historique du foyer dans un fichier que tu pourras réimporter.</p><div class="button-row">${button('export', 'Exporter les données', 'primary-button')}${button('import', 'Importer une sauvegarde', 'subtle-button')}</div></section><section class="settings-panel"><div class="eyebrow">Connexion</div><h2>${runtime.mode === 'demo' ? 'Démonstration locale' : 'Mon compte'}</h2><p>${runtime.mode === 'demo' ? 'Ces données sont enregistrées uniquement dans ce navigateur. Les membres sont des exemples.' : `Connecté avec ${esc(runtime.auth.current()?.email)}. Les données sont partagées avec les membres autorisés du foyer.`}</p>${runtime.mode === 'shared' ? `<div class="account-family"><span>Famille active</span><strong>${esc(state.household.name)}</strong>${button('families', 'Mes familles', 'subtle-button')}</div>` : ''}${runtime.mode === 'demo' ? button('connect', 'Connecter mon foyer', 'primary-button') : button('sign-out', `${icon('logout')}Se déconnecter`, 'subtle-button')}</section></div>`;
}

function render() {
  householdSetupOpen = false;
  if (!state) return;
  const samePage = lastRenderedPage === ui.page;
  const focus = samePage ? rememberFocus(app) : null;
  closeSelectMenu();
  const scroll = { x: window.scrollX, y: window.scrollY, board: document.querySelector('.week-board')?.scrollLeft, boardTop: document.querySelector('.week-board')?.scrollTop };
  renderedCards = new Map();
  sessionCardsCache.clear();
  const headings = { planning: ['Le planning du foyer', 'L’agenda de la maison'], today: ['Le planning du foyer', 'Aujourd’hui'], catalog: ['Les routines de la maison', 'Toutes les tâches'], stats: ['Les petits efforts font les grands foyers', 'La maison en chiffres'], settings: ['À chacun sa place', 'Les réglages du foyer'] };
  const [eyebrow, heading] = headings[ui.page];
  const account = runtime.auth.current();
  const content = ui.page === 'planning' ? planningHTML() : ui.page === 'today' ? todayHTML() : ui.page === 'catalog' ? catalogHTML() : ui.page === 'stats' ? statisticsHTML() : settingsHTML();
  app.innerHTML = `<div class="app-shell${ui.sidebarCollapsed ? ' sidebar-collapsed' : ''}"><aside class="sidebar" id="main-sidebar">${button('toggle-sidebar', icon(ui.sidebarCollapsed ? 'right' : 'left'), 'icon-button sidebar-toggle', `aria-label="${ui.sidebarCollapsed ? 'Déplier' : 'Replier'} le volet de navigation" aria-expanded="${!ui.sidebarCollapsed}" aria-controls="main-sidebar"`)}<a class="brand" aria-label="Maison — accueil du planning" href="#planning" data-action="page" data-page="planning"><span class="brand-mark">${icon('home')}</span><span>maison<span class="brand-sub">Un foyer, un agenda.</span></span></a><div class="household-label">${runtime.mode === 'shared' ? button('families', `${esc(state.household.name)} ${icon('right')}`, 'family-switch', 'aria-label="Changer de famille"') : esc(state.household.name)}</div><nav aria-label="Navigation principale">${nav()}</nav><div class="sidebar-note"><span class="note-symbol">⌁</span><p>Les petites choses<br>font une maison.</p></div><div class="sidebar-account"><span class="avatar">${esc(initials(account?.name || 'Moi'))}</span><div><strong>${esc(account?.name || 'Moi')}</strong><span>Membre du foyer</span></div></div></aside><main id="main" class="workspace"><header class="workspace-header"><div><div class="eyebrow">${eyebrow}</div><h1>${heading}<span class="title-dot">.</span></h1></div>${!['settings', 'stats'].includes(ui.page) ? `<div class="create-buttons">${button('new-session', 'Nouvelle séance', 'subtle-button')}${button('new-task', `${icon('plus')}<span>Nouvelle tâche</span>`, 'primary-button task-create', 'aria-label="Nouvelle tâche" title="Nouvelle tâche"')}</div>` : ''}</header>${content}<footer class="workspace-footer"><span>Maison · le planning du foyer</span><span>${esc(state.household.name)}</span></footer></main><nav class="mobile-nav" aria-label="Navigation mobile">${nav()}</nav></div>`;
  lastRenderedPage = ui.page;
  enhanceSelects(app);
  restoreFocus(app, focus);
  const board = document.querySelector('.week-board');
  if (samePage && board && scroll.board !== undefined) board.scrollLeft = scroll.board;
  if (samePage && board && scroll.boardTop !== undefined) board.scrollTop = scroll.boardTop;
  if (samePage && typeof scroll.y === 'number') window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
}

function openDialog(html) {
  closeSelectMenu();
  const focus = dialog.open ? rememberFocus(dialog) : null;
  const scrollTop = dialog.scrollTop;
  const checklistScroll = dialog.querySelector?.('.checklist')?.scrollTop;
  if (!dialog.open) dialogReturnFocus = rememberFocus(app);
  dialogAnimation?.cancel(); dialogAnimation = null;
  dialog.innerHTML = html;
  enhanceSelects(dialog);
  if (!dialog.open) {
    dialog.showModal();
    document.body.classList.add('modal-open');
    if (!reducedMotion() && dialog.animate) dialogAnimation = dialog.animate(
      [{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
      { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
  } else {
    restoreFocus(dialog, focus); dialog.scrollTop = scrollTop;
    const checklist = dialog.querySelector?.('.checklist');
    if (checklist && checklistScroll !== undefined) checklist.scrollTop = checklistScroll;
  }
}

function closeDialog() {
  closeSelectMenu();
  if (!dialog.open) return;
  dialogAnimation?.cancel(); dialogAnimation = null;
  const finish = () => {
    dialog.close(); document.body.classList.remove('modal-open');
    selectedCard = null; pendingMove = null;
    restoreFocus(app, dialogReturnFocus); dialogReturnFocus = null;
  };
  if (reducedMotion() || !dialog.animate) { finish(); return; }
  const animation = dialog.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], { duration: 140, easing: 'ease-in' });
  dialogAnimation = animation;
  animation.finished.then(() => { if (dialogAnimation === animation) { dialogAnimation = null; finish(); } }).catch(() => {});
}

function setCatalogFold(groupId, open) {
  const expanded = ui.search ? catalogSearchOpen : catalogOpen;
  expanded.set(groupId, open);
  const content = document.getElementById?.(`catalog-group-${groupId}`);
  const toggle = content?.previousElementSibling?.querySelector('button');
  if (!content || !toggle) return;
  toggle.setAttribute('aria-expanded', String(open));
  const height = content.hidden ? 0 : content.getBoundingClientRect().height;
  foldAnimations.get(content)?.cancel();
  content.hidden = false;
  content.inert = !open;
  if (reducedMotion() || !content.animate) { content.hidden = !open; return; }
  const animation = content.animate([{ height: `${height}px`, opacity: open ? .4 : 1 }, { height: `${open ? content.scrollHeight : 0}px`, opacity: open ? 1 : 0 }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
  foldAnimations.set(content, animation);
  content.inert = !open;
  animation.finished.then(() => {
    if (foldAnimations.get(content) !== animation) return;
    content.hidden = !open; content.inert = !open; foldAnimations.delete(content);
  }).catch(() => {});
}
function dialogHeader(title, subtitle = '', completed = false) {
  return `<div class="dialog-header"><div><h2 id="dialog-title"${completed ? ' class="checked-text"' : ''}>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${button('close', icon('close'), 'icon-button', 'aria-label="Fermer"')}</div>`;
}

function subtasksHTML(item) {
  const subtasks = item.task.subtasks ?? [];
  if (!subtasks.length) return '';
  const done = new Set(item.subtaskDone ?? []);
  return `<fieldset class="task-subtasks"><legend>Sous-tâches · ${subtasks.filter(subtask => done.has(subtask.id)).length}/${subtasks.length}</legend>${subtasks.map(subtask => `<label><input type="checkbox" data-subtask="${esc(subtask.id)}" data-occurrence="${esc(item.id)}" ${done.has(subtask.id) ? 'checked' : ''}><span${done.has(subtask.id) ? ' class="checked-text"' : ''}>${esc(subtask.title)}</span></label>`).join('')}<p>La tâche principale se valide séparément.</p></fieldset>`;
}
function subtaskEditorHTML() {
  return `<div class="subtask-editor-heading"><strong>Sous-tâches</strong><span>Facultatif · ${subtaskDraft.length} étape${subtaskDraft.length > 1 ? 's' : ''}</span></div><div class="subtask-editor-list">${subtaskDraft.map((subtask, index) => `<div class="subtask-editor-row"><span class="subtask-number" aria-hidden="true">${index + 1}</span><label class="sr-only" for="subtask-title-${index}">Étape ${index + 1}</label><input id="subtask-title-${index}" name="subtaskTitle" data-subtask-index="${index}" value="${esc(subtask.title)}" maxlength="240" placeholder="Ex. Préparer les chiffons"><div class="subtask-row-actions">${button('subtask-up', icon('left'), 'icon-button subtask-up', `data-index="${index}" aria-label="Monter l’étape ${index + 1}" ${index === 0 ? 'disabled' : ''}`)}${button('subtask-down', icon('right'), 'icon-button subtask-down', `data-index="${index}" aria-label="Descendre l’étape ${index + 1}" ${index === subtaskDraft.length - 1 ? 'disabled' : ''}`)}${button('subtask-remove', icon('close'), 'icon-button', `data-index="${index}" aria-label="Supprimer l’étape ${index + 1}"`)}</div></div>`).join('') || '<p class="subtask-editor-empty">Ajoute les petites étapes ou le matériel à préparer.</p>'}</div>${button('subtask-add', `${icon('plus')}Ajouter une étape`, 'subtle-button')}<p class="form-help">Cocher cette liste ne termine pas la tâche principale. Tu peux la laisser vide ou la préparer sans programmer la tâche.</p>`;
}
function refreshSubtaskEditor(focusIndex) {
  const editor = dialog.querySelector('#subtask-editor');
  editor.innerHTML = subtaskEditorHTML();
  if (focusIndex !== undefined) editor.querySelector(`[data-subtask-index="${focusIndex}"]`)?.focus();
}
function openDetail(card) {
  selectedCard = { ...card, items: sessionItems(card).map(o => resolveItem(o.id)).filter(Boolean) };
  const items = selectedCard.items;
  const members = [...new Set(items.map(o => o.memberId))];
  openDialog(`${dialogHeader(card.title, dateLabel(items[0]?.date ?? card.date), items.length > 0 && items.every(item => item.status === 'done'))}<div class="detail-badges">${groupBadge(card.groupId)}<span>${card.session ? `${ui.page === 'today' ? 'Mes actions · ' : ''}${items.filter(o => o.status === 'done').length} / ${items.length} actions réalisées` : 'Tâche individuelle'}</span></div>${card.session ? `<section class="session-assignment-summary" aria-label="Répartition de la séance"><h3>Qui fait quoi</h3>${assignmentsHTML(items, true)}</section>` : ''}<div class="checklist">${items.map(o => `<div class="checklist-row"><label><input type="checkbox" data-toggle="${esc(o.id)}" ${o.status === 'done' ? 'checked' : ''}><span class="${o.status === 'done' ? 'checked-text' : ''}">${esc(o.task.title)}${o.task.description ? `<small>${esc(o.task.description)}</small>` : ''}</span></label><div class="checklist-meta">${frequencyBadge(o.task.recurrence)}${weekdayLabelHTML(o.task)}<span class="duration-badge">${esc(o.task.estimatedMinutes ? '≈ ' + formatMinutes(o.task.estimatedMinutes) : 'Durée à estimer')}</span><span class="detail-assignment"><span class="avatar avatar-small" aria-hidden="true">${o.memberId ? esc(initials(memberName(o.memberId))) : '?'}</span><strong>${esc(memberName(o.memberId))}</strong></span>${card.session ? button('detach', 'Séparer', 'text-button', `data-id="${esc(o.id)}"`) : ''}${button('edit-task', 'Modifier la tâche', 'text-button', `data-id="${esc(o.taskId)}"`)}${o.status !== 'done' ? button('remove-occurrence', 'Retirer de ce jour', 'text-button muted', `data-id="${esc(o.id)}"`) : ''}</div>${subtasksHTML(o)}</div>`).join('')}</div><form id="detail-form"><div class="form-grid"><label>Date<input type="date" name="date" value="${items[0]?.date ?? card.date}" required></label><label>Responsable<select name="memberId">${members.length > 1 ? option('__keep', 'Garder les responsables', '__keep') : ''}${membersOptions(members.length === 1 ? members[0] : '__keep')}</select></label></div><label>Appliquer à<select name="scope"><option value="one">Cette échéance seulement</option><option value="future">Celle-ci et les suivantes</option></select></label><p class="form-help">Déplacer une échéance seule conserve les prochaines dates. Les actions déjà réalisées gardent leur historique.</p><div class="dialog-actions">${button('close', 'Fermer', 'subtle-button')}<button type="submit" class="primary-button">Enregistrer</button></div></form>`);
}

function routineDescription(task) {
  let text = 'Sans échéance pour le moment';
  if (task.recurrence && !task.anchor) text = 'Choisis une première date';
  if (task.recurrence && task.anchor) {
    if (supportsWeekdays(task.recurrence)) {
      const days = (task.weekdays ?? defaultWeekdays(task.recurrence, task.anchor)).map(day => WEEKDAYS[day].toLocaleLowerCase('fr'));
      text = days.length === 7 ? (task.recurrence === 'fortnightly' ? 'Tous les jours, une semaine sur deux' : 'Tous les jours') : days.length ? `${task.recurrence === 'fortnightly' ? 'Une semaine sur deux, le' : 'Chaque'} ${days.join(' et ')}` : 'Choisis au moins un jour';
    } else text = `${RECURRENCES[task.recurrence]?.label ?? ''} · à partir du ${formatDate(task.anchor, { day: 'numeric', month: 'short' })}`;
  }
  return `${text}${task.estimatedMinutes > 0 ? ` · environ ${formatMinutes(Number(task.estimatedMinutes))}` : ''}`;
}
function refreshRoutinePreview() {
  const preview = dialog.querySelector?.('#routine-preview');
  if (!preview) return;
  preview.textContent = routineDescription({ recurrence: dialog.querySelector('[name="recurrence"]').value, anchor: dialog.querySelector('[name="anchor"]').value, weekdays: [...weekdayDraft].sort((a,b) => a-b), estimatedMinutes: dialog.querySelector('[name="estimatedMinutes"]').value });
}

function taskForm(task = null, date = ui.date, duplicate = false) {
  const editing = Boolean(task) && !duplicate;
  if (duplicate) task = { ...task, id: '', title: `${task.title.slice(0, 592)} (copie)`, anchor: task.recurrence ? date : null, reviewNote: '', subtasks: (task.subtasks ?? []).map(subtask => ({ ...subtask, id: uid('subtask') })) };
  subtaskDraft = structuredClone(task?.subtasks ?? []);
  weekdaysTouched = false;
  weekdayDraft = new Set(task?.weekdays ?? defaultWeekdays(task ? task.recurrence : 'weekly', task?.anchor ?? date));
  openDialog(`${dialogHeader(editing ? 'Modifier la tâche' : 'Nouvelle tâche', editing && task.reviewNote ? task.reviewNote : 'Une action, un responsable, une répétition.')}<form id="task-form" data-id="${task?.id ?? ''}"><label>Nom de la tâche<input name="title" value="${esc(task?.title)}" placeholder="Ex. Nettoyer les miroirs" maxlength="600" required></label><div class="form-grid"><label>Pièce ou catégorie<select name="groupId">${groupOptions(task?.groupId ?? ui.group ?? state.groups[0].id)}</select></label><label>Responsable<select name="memberId">${membersOptions(task?.memberId ?? '')}</select></label></div><div class="form-grid"><label>Première date<input type="date" name="anchor" value="${task?.anchor ?? (task ? '' : date)}"></label><label>Récurrence<select name="recurrence">${option('', 'À configurer — sans échéance', task ? (task.recurrence ?? '') : 'weekly')}${recurrenceOptions(task ? (task.recurrence ?? '') : 'weekly')}</select></label></div><label class="fixed-day-setting"><input type="checkbox" name="fixedDay" ${task?.fixedDay ? 'checked' : ''}>Jour fixe <small>Ne pas déplacer lors d’un équilibrage</small></label><div id="weekday-config">${weekdayPickerHTML(task ? task.recurrence : 'weekly')}</div><div class="duration-setting"><label for="task-duration">Durée estimée <span class="muted">(facultatif)</span></label><div class="duration-controls"><div class="duration-input"><input id="task-duration" name="estimatedMinutes" type="number" min="1" max="1440" step="1" inputmode="numeric" value="${task?.estimatedMinutes ?? ''}" placeholder="—" aria-describedby="duration-help"><span aria-hidden="true">min</span></div><div class="duration-presets" role="group" aria-label="Durées rapides">${[5, 15, 30, 60].map(minutes => button('duration-preset', `${minutes} min`, 'duration-chip', `data-minutes="${minutes}" aria-pressed="${task?.estimatedMinutes === minutes}"`)).join('')}${button('duration-preset', 'Effacer', 'duration-clear', 'data-minutes="" aria-label="Effacer la durée estimée"')}</div></div><p id="duration-help" class="form-help">Temps approximatif, à laisser vide si inconnu.</p></div><div id="routine-preview" class="routine-preview" aria-live="polite">${esc(routineDescription(task ?? { recurrence: 'weekly', anchor: date, weekdays: [...weekdayDraft] }))}</div><details class="task-extras"><summary>Consignes et sous-tâches <span>Facultatif</span></summary><div><label>Consignes <span class="muted">(facultatif)</span><textarea name="description" rows="3" maxlength="3000">${esc(task?.description)}</textarea></label><section class="rotation-settings"><label class="rotation-enable"><input type="checkbox" name="rotationEnabled" ${task?.rotationEnabled !== false ? 'checked' : ''}>Favoriser un autre responsable lors de l’équilibrage</label><p class="form-help">Préférence souple, après une réalisation. Les tâches en attente gardent leur responsable.</p><fieldset><legend>Participants <span class="muted">(tous par défaut)</span></legend><div class="rotation-members">${state.members.map(member => `<label><input type="checkbox" name="rotationMembers" value="${esc(member.id)}" ${!task?.rotationMembers || task.rotationMembers.includes(member.id) ? 'checked' : ''}><span class="avatar avatar-small" aria-hidden="true">${esc(initials(member.name))}</span>${esc(member.name)}</label>`).join('')}</div></fieldset></section><section id="subtask-editor" class="subtask-editor" aria-label="Configurer les sous-tâches">${subtaskEditorHTML()}</section></div></details>${editing && task.anchor ? '<p class="form-help">Les changements de planning s’appliquent à partir d’aujourd’hui, ou de la première échéance si elle est à venir. L’historique est conservé.</p>' : ''}<div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button">${editing ? 'Enregistrer' : 'Créer la tâche'}</button></div></form>`);
}

function sessionForm(groupId = state.groups[0].id) {
  const candidates = state.tasks.filter(t => !t.archived && t.groupId === groupId && t.recurrence && t.anchor);
  openDialog(`${dialogHeader('Nouvelle séance', 'Regrouper des tâches sans changer leurs fréquences.')}<form id="session-form"><label>Nom de la séance<input name="title" placeholder="Ex. Ménage cuisine" maxlength="160" required></label><label>Pièce ou catégorie<select name="groupId" data-session-group>${groupOptions(groupId)}</select></label><fieldset class="session-picker"><legend>Actions de la séance</legend>${candidates.map(t => `<label><input type="checkbox" name="taskIds" value="${t.id}"><span>${esc(t.title)}</span>${frequencyBadge(t.recurrence)}</label>`).join('') || '<p>Aucune tâche planifiée dans ce groupe. Crée ou configure une tâche d’abord.</p>'}</fieldset><p class="form-help">La séance apparaît les jours où ses actions sont dues. Une action conserve son responsable et sa récurrence.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button" ${candidates.length ? '' : 'disabled'}>Créer la séance</button></div></form>`);
}

function reorganizationForm() {
  const date = ui.page === 'today' ? today() : ui.date;
  const personal = ui.page === 'today';
  openDialog(`${dialogHeader('Équilibrer le planning', 'Une proposition à vérifier avant de déplacer quoi que ce soit.')}<form id="reorganization-form" data-date="${date}" data-personal="${personal}"><label>Période<select name="period"><option value="week">Cette semaine</option><option value="month">Ce mois</option></select></label>${personal ? '<p class="form-help">Uniquement mes tâches et mes actions dans les séances.</p>' : `<label>Pour qui ?<select name="memberId">${option('', 'Tout le foyer', ui.member)}${state.members.map(member => option(member.id, member.name, ui.member)).join('')}</select></label>`}<div class="optimizer-preferences"><label><input type="checkbox" name="groupRooms" checked>Rapprocher les tâches d’une même pièce</label>${personal ? '' : '<label><input type="checkbox" name="rotate" checked>Varier les responsables si possible <small>Pour « Tout le foyer » uniquement</small></label>'}</div><label class="optimizer-duration">Durée supposée si une tâche n’a pas d’estimation<div class="duration-input"><input type="number" name="fallbackMinutes" min="1" max="1440" value="15" required inputmode="numeric"><span>min</span></div></label><p class="form-help">Les actions quotidiennes, les jours fixes et les actions passées ou faites restent en place. Les jours de semaine choisis sont respectés. Les filtres de pièce et de durée ne limitent pas cette proposition.</p><p class="form-help">On répartit la charge entre les jours, sans réduire le temps total ni supprimer des tâches. Les actions déplaçables d’une séance restent groupées ; ses actions fixes gardent leur date.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button">Voir la proposition</button></div></form>`);
}
function reorganizationPreview(options) {
  const proposal = proposeReorganization(state, options);
  reorganization = {options, proposal};
  const max = Math.max(1, ...proposal.before.map(day => day.minutes), ...proposal.after.map(day => day.minutes));
  const beforePeak = Math.max(0, ...proposal.before.map(day => day.minutes)), afterPeak = Math.max(0, ...proposal.after.map(day => day.minutes));
  openDialog(`${dialogHeader('La proposition', `${dateLabel(options.start)} – ${dateLabel(options.end)}`)}<p class="optimizer-intro">${proposal.moves.length || proposal.reassignments.length ? `${proposal.moves.length} actions à reporter · ${proposal.reassignments.length} changements de responsable. Journée la plus chargée : ${esc(formatMinutes(beforePeak))} → ${esc(formatMinutes(afterPeak))}.` : 'La répartition ne peut pas être améliorée avec ces contraintes.'}</p>${proposal.unknown ? `<p class="optimizer-warning">${proposal.unknown} actions sans durée : hypothèse de ${proposal.fallbackMinutes} min par action pour cette proposition. Leurs durées enregistrées restent inchangées.</p>` : ''}<p class="form-help">${proposal.protected} actions protégées. Les sous-tâches et prochaines répétitions sont conservées. Aucun responsable ne change en dehors de la liste ci-dessous. Il s’agit d’une proposition d’équilibrage, sans garantie d’optimum.</p><p class="form-help">Répartition des pièces : ${proposal.roomsBefore} → ${proposal.roomsAfter} créneaux pièce / jour. Le regroupement est limité pour garder des journées raisonnables.</p><div class="optimizer-legend"><span>Avant</span><strong>Après</strong></div><div class="optimizer-days">${proposal.before.map((before, index) => {
    const after = proposal.after[index];
    return `<div class="optimizer-day"><span>${esc(formatDate(before.date, {weekday:'short',day:'numeric'}))}</span><div class="optimizer-bar before"><i style="width:${before.minutes/max*100}%"></i></div><div class="optimizer-bar after"><i style="width:${after.minutes/max*100}%"></i></div><small>${before.count} → ${after.count} actions<br>${esc(formatMinutes(before.minutes))} → ${esc(formatMinutes(after.minutes))}</small></div>`;
  }).join('')}</div>${proposal.moves.length ? `<details class="optimizer-moves"><summary>Voir les déplacements (${proposal.moves.length})</summary><ul>${proposal.moves.map(move => `<li><strong>${esc(move.title)}</strong><span>${esc(formatDate(move.from,{day:'numeric',month:'short'}))} → ${esc(formatDate(move.to,{day:'numeric',month:'short'}))}</span></li>`).join('')}</ul></details>` : ''}${proposal.reassignments.length ? `<section class="optimizer-rotations"><h3>Changements de responsable</h3><ul>${proposal.reassignments.map(change => `<li><strong>${esc(change.title)}</strong><span>${esc(memberName(change.from))} → ${esc(memberName(change.to))}</span><small>${esc(dateLabel(change.date))} · dernière réalisation : ${esc(memberName(change.lastCompletedBy))}</small></li>`).join('')}</ul></section>` : ''}<div class="dialog-actions">${button('reorganize', 'Ajuster', 'subtle-button')}${button('close', 'Annuler', 'subtle-button')}${proposal.moves.length || proposal.reassignments.length ? button('confirm-reorganization', 'Appliquer la proposition', 'primary-button') : ''}</div>`);
}
async function confirmReorganization() {
  if (!reorganization) return;
  const {options, proposal} = reorganization, before = structuredClone(state.overrides);
  await perform(() => service.reorganize(options, proposal.revision), null, () => {
    const revision = state.revision;
    undo = () => service.restoreMove(before, revision);
    reorganization = null; closeDialog();
    notify('Planning rééquilibré.', {canUndo:true});
  });
}

function quickMoveDialog(card) {
  quickMoveCard = card;
  const nextDate = addDays(card.date < today() ? today() : card.date, 1);
  const pending = sessionItems(card).filter(item => item.status !== 'done');
  openDialog(`${dialogHeader('Options', card.title)}<div class="quick-move-options">${button('quick-tomorrow', `${icon('calendar')}${nextDate === addDays(today(), 1) ? 'Demain' : 'Le lendemain'}`, 'subtle-button')}</div><form id="quick-move-form"><label>Ou choisir une date<input type="date" name="date" value="${nextDate}" required></label><p class="form-help">Seulement les actions à faire${ui.page === 'today' ? ' qui te sont assignées' : ''}. Les prochaines répétitions restent inchangées.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button">Reporter</button></div></form><div class="remove-occurrence-options">${pending.length === 1 ? button('remove-occurrence', 'Retirer de ce jour', 'text-button muted', `data-id="${esc(pending[0].id)}"`) : `<details><summary>Retirer une action de ce jour</summary>${pending.map(item=>button('remove-occurrence',esc(item.task.title),'text-button muted',`data-id="${esc(item.id)}"`)).join('')}</details>`}</div>`);
}
function prepareOccurrenceRemoval(id) {
  const item = resolveItem(id);
  if (!item || item.status === 'done') { notify('Cette action ne peut pas être retirée : elle est déjà réalisée ou n’est plus présente.',{error:true}); return; }
  occurrenceRemoval = {item,revision:state.revision,householdId:state.household.id};
  openDialog(`${dialogHeader('Retirer de ce jour', item.task.title)}<p>Retirer cette action du ${esc(dateLabel(item.date))} ?</p><p class="form-help">La tâche reste dans le catalogue et ses prochaines répétitions sont conservées. Les autres actions de la séance restent en place.</p><div class="dialog-actions">${button('close','Annuler','subtle-button')}${button('confirm-remove-occurrence','Retirer de ce jour','primary-button')}</div>`);
}
async function quickReport(date) {
  if (!quickMoveCard) return;
  const items = sessionItems(quickMoveCard).map(item => resolveItem(item.id)).filter(item => item && item.status !== 'done');
  await requestMove(items, {date}, true);
}

async function moveCard(card, date) {
  const items = card.items.map(o => resolveItem(o.id)).filter(o => o && o.status !== 'done');
  if (!items.length) { notify('Cette carte est déjà terminée. Son historique est conservé.'); return; }
  await requestMove(items, { date });
}

async function requestMove(items, changes, closeAfter = false) {
  if (!items.length) { notify('Aucune action à déplacer.'); return; }
  const collisions = moveCollisions(state, items, changes.date);
  const move = { items, changes, closeAfter, expectedRevision: state.revision };
  if (collisions.length) {
    pendingMove = move;
    selectedCard = null;
    openDialog(`${dialogHeader('Regrouper les occurrences ?', 'Attention : ces tâches existent déjà ce jour-là.')}<p>Le regroupement conservera une seule occurrence par tâche au ${esc(formatDate(changes.date, { day: 'numeric', month: 'long' }))}.</p><ul>${collisions.map(({ source, target }) => `<li><strong>${esc(source.task.title)}</strong> — ${target.status === 'done' ? 'déjà terminée' : 'à faire'}, ${esc(memberName(target.memberId))}</li>`).join('')}</ul><p>Le responsable et le statut déjà présents sur le jour cible seront conservés. Les autres actions seront déplacées normalement. Les prochaines répétitions ne changent pas ; les occurrences regroupées restent enregistrées dans la sauvegarde.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}${button('confirm-merge', 'Regrouper', 'primary-button')}</div>`);
    return;
  }
  await commitMove(move, false);
}

async function commitMove(move, merge) {
  const before = structuredClone(state.overrides);
  await perform(() => service.update(move.items, move.changes, { merge, expectedRevision: move.expectedRevision }), null, () => {
    const revision = state.revision;
    undo = () => service.restoreMove(before, revision);
    pendingMove = null;
    if (merge || move.closeAfter) closeDialog();
    notify(`${merge ? 'Regroupé' : 'Déplacé'} au ${formatDate(move.changes.date, { day: 'numeric', month: 'long' })}.`, { canUndo: true });
  });
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'stats-period') { ui.statsPeriod=target.dataset.value; ui.statsLimit=20; render(); return; }
  if (action === 'stats-member' || action === 'stats-room') { ui[action==='stats-member'?'statsMember':'statsGroup']=target.dataset.id;ui.statsLimit=20;render();return; }
  if (action === 'stats-reset') { Object.assign(ui,{statsMember:'',statsGroup:'',statsFrequency:'',statsSearch:'',statsLimit:20});render();return; }
  if (action === 'stats-more') { ui.statsLimit+=20;render();return; }
  if (action === 'stats-record') { statisticsRecord(target.dataset.id);return; }
  if (action === 'stats-export') { exportStatistics();return; }
  if (action === 'stats-day') { const records=statsModel?.history.filter(item=>item.completedDate===target.dataset.date)??[];openDialog(`${dialogHeader(dateLabel(target.dataset.date),'Les coups de main de cette journée')}<div class="stats-day-records">${records.map(item=>button('stats-record',`${esc(item.task.title)}<small>${esc(item.actorId?memberName(item.actorId):'Auteur inconnu')}</small>`,'subtle-button',`data-id="${esc(item.id)}"`)).join('')}</div><div class="dialog-actions">${button('close','Fermer','subtle-button')}</div>`);return; }
  if (action === 'toggle-filters') { ui.filtersOpen = !ui.filtersOpen; render(); return; }
  if (action === 'clear-filter') { if (['member','group','frequency','duration','sort','showDone'].includes(target.dataset.key)) ui[target.dataset.key] = target.dataset.key === 'showDone' ? true : ''; render(); return; }
  if (action === 'reset-filters') { Object.assign(ui, {member:'',group:'',frequency:'',duration:'',sort:'',showDone:true}); render(); return; }
  if (action === 'recap-period') { ui.recap = target.dataset.value === 'week' ? 'week' : 'day'; render(); return; }
  if (action === 'reorganize') { reorganizationForm(); return; }
  if (action === 'confirm-reorganization') { await confirmReorganization(); return; }
  if (action === 'quick-move') { const card = renderedCards.get(target.dataset.id); if (card) quickMoveDialog(card); return; }
  if (action === 'quick-tomorrow') { if (quickMoveCard) await quickReport(addDays(quickMoveCard.date < today() ? today() : quickMoveCard.date, 1)); return; }
  if (action === 'weekday-all' || action === 'weekday-workdays') {
    weekdayDraft = new Set(action === 'weekday-all' ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]);
    weekdaysTouched = true; refreshWeekdayPicker();
    dialog.querySelector(`[data-action="${action}"]`)?.focus(); return;
  }
  if (action === 'duration-preset') {
    const input = dialog.querySelector('[name="estimatedMinutes"]');
    input.value = target.dataset.minutes;
    for (const preset of dialog.querySelectorAll('.duration-chip')) preset.setAttribute('aria-pressed', String(preset.dataset.minutes === input.value));
    refreshRoutinePreview(); input.focus({ preventScroll: true }); return;
  }
  if (action === 'toggle-sidebar' || action === 'toggle-calendar') {
    const key = action === 'toggle-sidebar' ? 'sidebarCollapsed' : 'calendarCollapsed';
    ui[key] = !ui[key];
    const shell = action === 'toggle-sidebar' ? document.querySelector('.app-shell') : null;
    if (shell) {
      closeSelectMenu();
      shell.classList.toggle('sidebar-collapsed', ui.sidebarCollapsed);
      target.setAttribute('aria-expanded', String(!ui.sidebarCollapsed));
      target.setAttribute('aria-label', `${ui.sidebarCollapsed ? 'Déplier' : 'Replier'} le volet de navigation`);
      target.innerHTML = icon(ui.sidebarCollapsed ? 'right' : 'left');
    } else render();
    return;
  }
  if (action.startsWith('subtask-')) {
    const index = Number(target.dataset.index);
    if (action === 'subtask-add') {
      if (subtaskDraft.length >= 80) { notify('80 sous-tâches maximum.', { error: true }); return; }
      subtaskDraft.push({ id: uid(), title: '' }); refreshSubtaskEditor(subtaskDraft.length - 1);
    } else if (action === 'subtask-remove') { subtaskDraft.splice(index, 1); refreshSubtaskEditor(Math.min(index, subtaskDraft.length - 1)); }
    else {
      const destination = index + (action === 'subtask-up' ? -1 : 1);
      if (destination >= 0 && destination < subtaskDraft.length) {
        [subtaskDraft[index], subtaskDraft[destination]] = [subtaskDraft[destination], subtaskDraft[index]];
        refreshSubtaskEditor(destination);
      }
    }
    return;
  }
  if (action === 'close') { closeDialog(); selectedCard = null; pendingMove = null; return; }
  if (action === 'confirm-merge') { if (pendingMove) await commitMove(pendingMove, true); return; }
  if (action === 'toggle-catalog-group' || action === 'expand-catalog' || action === 'collapse-catalog') {
    const expanded = ui.search ? catalogSearchOpen : catalogOpen;
    if (action === 'toggle-catalog-group') setCatalogFold(target.dataset.id, !(expanded.get(target.dataset.id) ?? Boolean(ui.search)));
    else for (const group of state.groups) setCatalogFold(group.id, action === 'expand-catalog');
    return;
  }
  if (action === 'demo') { location.href = `${location.pathname}?demo=1`; return; }
  if (action === 'connect') { location.href = location.pathname; return; }
  if (action === 'retry') { location.reload(); return; }
  if (action === 'sign-in') { await perform(() => runtime.auth.signIn()); return; }
  if (action === 'sign-out') { await perform(() => runtime.auth.signOut(), null, () => { state = null; runtime.dispose(); loginScreen(); }); return; }
  if (action === 'switch-family') { await perform(() => switchFamily(target.dataset.id)); return; }
  if (action === 'favorite-family') { await perform(async () => { await runtime.setFavorite(target.dataset.id); if (dialog.open) familyDialog(); else householdScreen(); }); return; }
  if (!state) return;
  if (action === 'families') { await perform(async () => { await runtime.refreshHouseholds(); familyDialog(); }); return; }
  if (action === 'manage-families') { closeDialog(); householdScreen(); return; }
  if (action === 'return-planning') { render(); return; }
  if (action === 'remove-occurrence') { prepareOccurrenceRemoval(target.dataset.id); return; }
  if (action === 'confirm-remove-occurrence' && occurrenceRemoval) {
    await perform(async () => {
      const proposal=occurrenceRemoval;
      if (proposal.householdId !== state.household.id) throw new Error('La famille a changé.');
      const before=structuredClone(state.overrides), updated=await service.removeOccurrence(proposal.item,proposal.revision);
      occurrenceRemoval=null;closeDialog();undo=()=>service.restoreMove(before,updated.revision);
      notify('Action retirée de ce jour.',{canUndo:true});
    }); return;
  }
  if (action === 'clear-catalog-assignments' || action === 'clear-period-assignments') { prepareAssignmentRemoval(action === 'clear-catalog-assignments'); return; }
  if (action === 'suggest-durations') { prepareDurationSuggestions(); return; }
  if (action === 'confirm-clear-assignments' && assignmentRemoval) {
    await perform(async () => {
      const proposal = assignmentRemoval; if (proposal.householdId !== state.household.id) throw new Error('La famille a changé.');
      const before = structuredClone(state), updated = await service.clearAssignments(proposal.options,proposal.revision);
      assignmentRemoval = null; closeDialog();
      undo = () => service.restoreAssignments(before,updated.revision);
      notify('Responsables retirés.',{canUndo:true});
    }); return;
  }
  if (action === 'page') { event.preventDefault(); ui.page = target.dataset.page; if (ui.page === 'today') { ui.recap = 'day'; } ui.search = ''; ui.onlyReview = false; render(); window.scrollTo({ top: 0 }); }
  else if (action === 'view') { ui.view = target.dataset.view; render(); }
  else if (action === 'previous' || action === 'next') { const direction = action === 'next' ? 1 : -1; ui.date = ui.view === 'month' ? addMonths(ui.date, direction) : addDays(ui.date, direction * (ui.view === 'week' ? 7 : 1)); render(); }
  else if (action === 'today') { ui.date = today(); render(); }
  else if (action === 'select-day') { ui.date = target.dataset.date; ui.view = 'day'; render(); }
  else if (action === 'focus-day') { ui.date = target.dataset.date; render(); }
  else if (action === 'new-task') taskForm(null, target.dataset.date ?? (ui.page === 'today' ? today() : ui.date));
  else if (action === 'new-session') sessionForm(ui.group || state.groups[0].id);
  else if (action === 'duplicate-task') taskForm(state.tasks.find(t => t.id === target.dataset.id), today(), true);
  else if (action === 'edit-task') taskForm(state.tasks.find(t => t.id === target.dataset.id));
  else if (action === 'detail') { const card = renderedCards.get(target.dataset.id); if (card) openDetail(card); }
  else if (action === 'review') { ui.page = 'catalog'; ui.onlyReview = true; ui.group = ''; ui.frequency = ''; ui.member = ''; render(); }
  else if (action === 'overdue') { ui.page = 'today'; render(); }
  else if (action === 'mine') { ui.member = ui.member === runtime.memberId ? '' : runtime.memberId; render(); }
  else if (action === 'detach') await perform(() => service.update([resolveItem(target.dataset.id)], { sessionId: '' }), 'L’action est maintenant indépendante.', () => closeDialog());
  else if (action === 'undo' && undo) { const operation = undo; undo = null; await perform(operation, 'Déplacement annulé.'); }
  else if (action === 'archive') {
    const task = state.tasks.find(t => t.id === target.dataset.id);
    openDialog(`${dialogHeader('Archiver cette tâche ?')}<p>${esc(task.title)}</p><p>Les prochaines échéances seront arrêtées. Les réalisations passées restent dans l’historique.</p><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}${button('confirm-archive', 'Archiver', 'primary-button', `data-id="${task.id}"`)}</div>`);
  }
  else if (action === 'confirm-archive') await perform(() => service.archive(target.dataset.id, today()), 'Tâche archivée.', () => closeDialog());
  else if (action === 'add-member' || action === 'rename-member') {
    const member = state.members.find(m => m.id === target.dataset.id);
    openDialog(`${dialogHeader(member ? 'Renommer le membre' : 'Ajouter un membre')}<form id="member-form" data-id="${member?.id ?? ''}"><label>Prénom ou nom<input name="name" value="${esc(member?.name)}" required maxlength="100"></label><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button class="primary-button" type="submit">Enregistrer</button></div></form>`);
  }
  else if (action === 'invite') await perform(() => openInvitation(target.dataset.id));
  else if (action === 'copy-invitation') await perform(async () => { await navigator.clipboard.writeText(target.dataset.token); }, 'Code copié.');
  else if (action === 'export') {
    const blob = new Blob([service.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `maison-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Sauvegarde exportée.');
  }
  else if (action === 'import') openDialog(`${dialogHeader('Importer une sauvegarde', 'Les données du planning seront remplacées après confirmation.')}<form id="import-form"><label>Fichier de sauvegarde<input name="file" type="file" accept="application/json,.json" required></label><label class="confirmation"><input type="checkbox" name="confirm" required>J’ai exporté une copie du planning actuel.</label><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button class="primary-button" type="submit">Importer</button></div></form>`);
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.weekday !== undefined) {
    const day = Number(target.dataset.weekday);
    if (target.checked) weekdayDraft.add(day); else weekdayDraft.delete(day);
    weekdaysTouched = true;
    dialog.querySelector('.weekday-summary').textContent = weekdaySummary(dialog.querySelector('[name="recurrence"]').value);
    refreshRoutinePreview();
  }
  if (target.name === 'recurrence' || target.name === 'anchor') {
    if (dialog.querySelector('#weekday-config')) {
      const recurrence = dialog.querySelector('[name="recurrence"]').value;
      if (!weekdaysTouched) weekdayDraft = new Set(defaultWeekdays(recurrence, dialog.querySelector('[name="anchor"]').value));
      refreshWeekdayPicker();
    }
  }
  if (target.dataset.statFilter) { ui[target.dataset.statFilter]=target.value;ui.statsLimit=20;render(); }
  if (target.dataset.filter) { ui[target.dataset.filter] = target.type === 'checkbox' ? target.checked : target.value; render(); }
  if (target.dataset.toggle) {
    const item = resolveItem(target.dataset.toggle);
    await perform(() => service.update([item], { status: target.checked ? 'done' : 'todo' }), null, () => { if (dialog.open && selectedCard) openDetail(selectedCard); });
  }
  if (target.dataset.toggleSession) {
    const card = renderedCards.get(target.dataset.toggleSession);
    if (!card) return;
    const full = cardsForDate(state, occurrences(state, card.date, card.date), card.date).find(session => session.id === card.id);
    const status = target.checked ? 'done' : 'todo';
    const items = (full?.items ?? card.items).map(item => resolveItem(item.id)).filter(item => item && item.status !== status && (ui.page !== 'today' || item.memberId === runtime.memberId));
    if (!items.length) return;
    await perform(() => service.update(items, { status: target.checked ? 'done' : 'todo' }), null, () => { if (dialog.open && selectedCard) openDetail(selectedCard); });
  }
  if (target.dataset.subtask) {
    const item = resolveItem(target.dataset.occurrence);
    await perform(() => service.setSubtask(item, target.dataset.subtask, target.checked), null, () => { if (dialog.open && selectedCard) openDetail(selectedCard); });
  }
  if (target.dataset.groupColor) await perform(() => service.setGroupColor(target.dataset.groupColor, target.value), 'Couleur enregistrée.');
  if (target.hasAttribute('data-session-group')) {
    const title = dialog.querySelector('[name=title]').value;
    sessionForm(target.value); dialog.querySelector('[name=title]').value = title;
  }
});
document.addEventListener('input', event => {
  if(event.target.id==='stats-search'){ui.statsSearch=event.target.value;ui.statsLimit=20;render();return;}
  if (event.target.name === 'estimatedMinutes') {
    refreshRoutinePreview();
    for (const preset of dialog.querySelectorAll('.duration-chip')) preset.setAttribute('aria-pressed', String(preset.dataset.minutes === event.target.value));
    return;
  }
  if (event.target.dataset.subtaskIndex !== undefined) { subtaskDraft[Number(event.target.dataset.subtaskIndex)].title = event.target.value; return; }
  if (event.target.id !== 'catalog-search') return;
  ui.search = event.target.value;
  catalogSearchOpen.clear();
  const start = event.target.selectionStart;
  render(); const input = document.querySelector('#catalog-search'); input.focus();
  try { input.setSelectionRange(start, start); } catch { /* Search fields may not expose selections. */ }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, data = new FormData(form);
  if (!form.reportValidity()) return;
  if (form.id === 'duration-proposal-form' && durationProposal) {
    await perform(async () => {
      const proposal = durationProposal; if (proposal.householdId !== state.household.id) throw new Error('La famille a changé.');
      const values = proposal.suggestions.map((suggestion,index)=>({...suggestion,minutes:Number(data.get(`minutes-${index}`))}));
      const before = structuredClone(state), updated = await service.applyDurationSuggestions(values,proposal.revision);
      durationProposal = null; closeDialog(); undo = () => service.restoreAssignments(before,updated.revision);
      notify('Durées ajoutées.',{canUndo:true});
    }); return;
  }
  if (form.id === 'reorganization-form') {
    const period = data.get('period'), date = form.dataset.date;
    const start = period === 'month' ? monthStart(date) : weekStart(date), end = period === 'month' ? monthEnd(date) : addDays(start,6);
    try { reorganizationPreview({start, end, notBefore:today(), memberId:form.dataset.personal === 'true' ? runtime.memberId : (data.get('memberId') || ''), fallbackMinutes:Number(data.get('fallbackMinutes')), groupRooms:Boolean(data.get('groupRooms')), rotate:form.dataset.personal !== 'true' && Boolean(data.get('rotate'))}); }
    catch (error) { notify(error.message, {error:true}); }
    return;
  }
  if (form.id === 'quick-move-form') { await quickReport(data.get('date')); return; }
  if (form.id === 'task-form') {
    const task = state.tasks.find(t => t.id === form.dataset.id);
    const recurrence = data.get('recurrence') || null;
    const weekdays = supportsWeekdays(recurrence) ? data.getAll('weekdays').map(Number).sort((a, b) => a - b) : null;
    if (weekdays && !weekdays.length) { notify('Choisis au moins un jour pour cette routine.', { error: true }); return; }
    const anchor = recurrence ? data.get('anchor') : null;
    if (recurrence && !anchor) { notify('Choisis une première date pour programmer la tâche.', { error: true }); return; }
    const titles = data.getAll('subtaskTitle');
    const subtasks = subtaskDraft.map((subtask, index) => ({ ...subtask, title: String(titles[index] ?? subtask.title).trim() })).filter(subtask => subtask.title);
    const duration = String(data.get('estimatedMinutes') ?? '').trim();
    const estimatedMinutes = duration ? Number(duration) : null;
    if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) { notify('Indique une durée de 1 à 1440 minutes, ou laisse le champ vide.', { error: true }); return; }
    const rotationEnabled = Boolean(data.get('rotationEnabled')), rotationMembers = data.getAll('rotationMembers');
    if (rotationEnabled && !rotationMembers.length) { notify('Choisis au moins un participant, ou désactive l’alternance.', {error:true}); return; }
    const values = { title: data.get('title').trim(), groupId: data.get('groupId'), memberId: data.get('memberId'), anchor, recurrence, description: data.get('description').trim(), rotationEnabled, rotationMembers: !rotationMembers.length || rotationMembers.length === state.members.length ? null : rotationMembers, subtasks, estimatedMinutes, weekdays, fixedDay: data.get('fixedDay') !== '' && data.get('fixedDay') !== null };
    if (task?.recurrence && task.anchor && !recurrence) { notify('Pour arrêter une tâche déjà programmée, archive-la. Tu peux conserver ses sous-tâches.', { error: true }); return; }
    const operation = !task ? () => service.createTask(values) : !task.anchor || !task.recurrence ? () => service.editTask(task.id, { ...values, reviewNote: '' }) : () => service.updateSeries({ taskId: task.id, scheduledDate: task.anchor > today() ? task.anchor : today() }, values);
    await perform(operation, task ? 'Tâche mise à jour.' : 'Tâche créée.', () => closeDialog());
  } else if (form.id === 'session-form') {
    const taskIds = data.getAll('taskIds'); if (!taskIds.length) { notify('Sélectionne au moins une action.', { error: true }); return; }
    await perform(() => service.createSession({ title: data.get('title').trim(), groupId: data.get('groupId'), taskIds }), 'Séance créée.', () => closeDialog());
  } else if (form.id === 'detail-form') {
    const fresh = selectedCard.items.map(o => resolveItem(o.id)).filter(o => o && o.status !== 'done');
    const changes = { date: data.get('date') };
    if (data.get('memberId') !== '__keep') changes.memberId = data.get('memberId');
    if (data.get('scope') === 'future') {
      await perform(() => service.updateFuture(fresh, { anchor: changes.date, ...(changes.memberId !== undefined ? { memberId: changes.memberId } : {}) }), 'Les prochaines échéances ont été mises à jour.', () => closeDialog());
    } else await requestMove(fresh, changes, true);
  } else if (form.id === 'member-form') {
    const name = data.get('name').trim(); if (!name) return;
    await perform(() => form.dataset.id ? service.renameMember(form.dataset.id, name) : service.addMember(name), 'Membre enregistré.', () => closeDialog());
  } else if (form.id === 'invite-form') await perform(async () => {
    const email = data.get('email').trim().toLowerCase();
    if (form.dataset.id === runtime.memberId || email === runtime.auth.current()?.email?.trim().toLowerCase()) throw new Error('Tu fais déjà partie de cette famille : tu ne peux pas t’inviter toi-même.');
    const pending = await runtime.pendingInvitation(form.dataset.id, state.household.id);
    if (pending) { showInvitation(form.dataset.id, pending, true); return; }
    const token = await runtime.invite(form.dataset.id, email, state.household.id);
    showInvitation(form.dataset.id, { token, email, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  });
  else if (form.id === 'import-form') {
    const file = data.get('file'); if (file.size > 5_000_000) { notify('Ce fichier est trop volumineux.', { error: true }); return; }
    await perform(async () => service.importData(await file.text()), 'Sauvegarde importée.', () => closeDialog());
  } else if (form.id === 'household-form') await perform(async () => { const next = await runtime.createHousehold(data.get('name').trim()); clearFamilyContext(); service = next; await openService(); });
  else if (form.id === 'join-form') await perform(async () => { const next = await runtime.joinHousehold(data.get('token').trim()); clearFamilyContext(); service = next; await openService(); });
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
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(); } });
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });

function loginScreen(error = '') {
  app.innerHTML = `<main class="welcome"><div class="welcome-brand"><span class="brand-mark">${icon('home')}</span><span>maison</span></div><div class="welcome-panel"><div class="eyebrow">L’agenda du foyer</div><h1>Une maison.<br>Un planning commun<span class="title-dot">.</span></h1><p>Retrouve les tâches du jour, répartis les routines et prépare la semaine avec les membres de ton foyer.</p>${error ? `<div class="login-error" role="alert">${esc(error)}</div>` : ''}${runtime ? button('sign-in', esc(runtime.auth.signInLabel || 'Se connecter'), 'primary-button') : button('retry', 'Réessayer', 'primary-button')}${button('demo', 'Essayer avec un exemple', 'subtle-button')}<p class="form-help">L’exemple est enregistré sur cet appareil. Le planning du foyer nécessite une connexion.</p></div><div class="welcome-preview" aria-hidden="true"><div class="preview-heading">La semaine de la maison</div><div class="preview-week"><span>LUN.</span><span>MAR.</span><span>MER.</span></div><div class="preview-cards"><div style="border-color:#73a166"><span class="preview-room">Cuisine</span><strong>Ménage cuisine</strong><span>Chaque semaine · 4 actions</span></div><div style="border-color:#668dd2"><span class="preview-room">Salle de bain</span><strong>Nettoyer le lavabo</strong><span>Chaque jour</span></div><div style="border-color:#bf69c1"><span class="preview-room">Salon</span><strong>Nettoyer les vitres</strong><span>Tous les 2 mois</span></div></div><div class="preview-caption">Les bonnes habitudes, à leur place.</div></div></main>`;
}
function isMmsFamily() { return /^m\s*&\s*ms$/i.test(state.household.name.trim()); }
function durationSuggestions() {
  const catalog = runtime.durationSuggestions ?? [];
  return state.tasks.filter(task => !task.archived && !task.estimatedMinutes).flatMap(task => {
    const original = catalog.find(source => source.groupId === task.groupId && source.title === task.title && Number.isInteger(source.estimatedMinutes));
    return original ? [{taskId:task.id,title:task.title,minutes:original.estimatedMinutes}] : [];
  });
}
function prepareAssignmentRemoval(catalog) {
  const options = catalog ? {taskIds:state.tasks.filter(task => !task.archived).map(task => task.id)} : (() => {
    const [start,end] = period(); return {start,end,memberId:ui.member,groupId:ui.group,frequency:ui.frequency,duration:ui.duration};
  })();
  const count = catalog ? options.taskIds.length : visibleOccurrences(options.start,options.end).filter(item => item.status !== 'done' && item.memberId).length;
  if (!count) { notify(catalog ? 'Aucune tâche dans le catalogue.' : 'Aucune action à faire avec un responsable sur cette période.'); return; }
  assignmentRemoval = {options,revision:state.revision,householdId:state.household.id};
  openDialog(`${dialogHeader('Retirer les responsables', esc(state.household.name))}<p>${catalog ? `Les ${count} tâches actives du catalogue et leurs exceptions à faire seront sans responsable.` : `${count} actions à faire seront sans responsable du ${esc(formatDate(options.start,{day:'numeric',month:'long'}))} au ${esc(formatDate(options.end,{day:'numeric',month:'long',year:'numeric'}))}, selon les filtres affichés.`}</p><p class="form-help">Les tâches, séances et récurrences sont conservées. Les actions déjà réalisées gardent leur responsable et leur auteur. Tu pourras annuler tant que le planning n’a pas été modifié.</p><div class="dialog-actions">${button('close','Annuler','subtle-button')}${button('confirm-clear-assignments','Retirer les responsables','primary-button')}</div>`);
}
function prepareDurationSuggestions() {
  const suggestions = durationSuggestions();
  durationProposal = {suggestions,revision:state.revision,householdId:state.household.id};
  openDialog(`${dialogHeader('Les durées de M&Ms', `${suggestions.length} tâches sans estimation`)}<p class="form-help">Temps de travail actif proposé, à ajuster selon la taille de la maison. Les cycles de machine, le séchage et les temps de trempage sont exclus. Les durées déjà renseignées restent conservées.</p><form id="duration-proposal-form"><div class="duration-proposal-list">${suggestions.map((suggestion,index)=>`<label><span>${esc(suggestion.title)}</span><span class="duration-input"><input type="number" name="minutes-${index}" min="1" max="1440" step="1" value="${suggestion.minutes}" required aria-label="${esc(`Durée de ${suggestion.title}`)}"><span>min</span></span></label>`).join('')}</div><div class="dialog-actions">${button('close','Annuler','subtle-button')}<button type="submit" class="primary-button">Ajouter ces durées</button></div></form>`);
}
function showInvitation(memberId, invitation, existing = false) {
  const expiration = invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  openDialog(`${dialogHeader(existing ? 'Invitation en attente' : 'Invitation prête')}<p>Transmets ce code à ${esc(memberName(memberId))}. Cette personne devra se connecter avec ${esc(invitation.email)}, puis choisir « Rejoindre un foyer ».</p><label>Code d’invitation<input readonly value="${esc(invitation.token)}" aria-label="Code d’invitation"></label><p class="form-help">${expiration ? `Valable jusqu’au ${esc(expiration)}` : 'Valable sept jours'} · une seule utilisation. Tu peux retrouver ce code depuis « Invitation » à côté du membre. Aucun email n’est envoyé automatiquement.</p><div class="dialog-actions">${button('copy-invitation', 'Copier le code', 'subtle-button', `data-token="${esc(invitation.token)}"`)}${button('close', 'Fermer', 'primary-button')}</div>`);
}
async function openInvitation(memberId) {
  if (memberId === runtime.memberId) throw new Error('Tu fais déjà partie de cette famille.');
  const householdId = state.household.id;
  const pending = await runtime.pendingInvitation(memberId, householdId);
  if (state.household.id !== householdId) return;
  if (pending) { showInvitation(memberId, pending, true); return; }
  openDialog(`${dialogHeader(`Inviter ${memberName(memberId)}`, 'Le code sera réservé à cette adresse.')}<form id="invite-form" data-id="${esc(memberId)}"><label>Adresse email du compte<input name="email" type="email" required></label><div class="dialog-actions">${button('close', 'Annuler', 'subtle-button')}<button type="submit" class="primary-button">Créer le code</button></div></form>`);
}
function familyChoicesHTML() {
  return `<div class="family-choices">${(runtime.households ?? []).map(h => `<div class="family-choice"><button type="button" data-action="switch-family" data-id="${esc(h.householdId)}"><span class="avatar">${icon('home')}</span><span><strong>${esc(h.name)}</strong><small>${h.householdId === state?.household.id ? 'Famille active' : h.canInvite ? 'Administrateur' : 'Membre'}</small></span></button><button type="button" class="family-star" data-action="favorite-family" data-id="${esc(h.householdId)}" aria-label="${esc(`Ouvrir ${h.name} par défaut`)}" aria-pressed="${runtime.favoriteHouseholdId === h.householdId}">${runtime.favoriteHouseholdId === h.householdId ? '★' : '☆'}</button></div>`).join('')}</div>`;
}
function familyDialog() {
  openDialog(`${dialogHeader('Mes familles', 'L’étoile choisit la famille ouverte à ta prochaine connexion.')}${familyChoicesHTML()}<div class="dialog-actions">${button('manage-families', 'Créer ou rejoindre', 'subtle-button')}${button('close', 'Fermer', 'primary-button')}</div>`);
}
async function switchFamily(householdId) {
  const next = await runtime.open(householdId);
  if (!next) throw new Error('Cette famille n’est plus accessible.');
  clearFamilyContext(); service = next; state = null;
  await openService(); window.scrollTo({ top: 0 });
}
function clearFamilyContext() {
  closeDialog(); closeSelectMenu();
  assignmentRemoval = null; durationProposal = null; occurrenceRemoval = null;
  selectedCard = null; undo = null; pendingMove = null; quickMoveCard = null; reorganization = null;
  renderedCards.clear(); sessionCardsCache.clear(); catalogOpen.clear(); catalogSearchOpen.clear(); statsModel = null;
  ui.member = ''; ui.group = ''; ui.frequency = ''; ui.search = ''; ui.duration = ''; ui.sort = ''; ui.onlyReview = false;
  ui.statsMember = ''; ui.statsGroup = ''; ui.statsFrequency = ''; ui.statsSearch = ''; ui.statsLimit = 20;
  ui.date = today(); ui.page = 'today'; ui.recap = 'day'; ui.filtersOpen = false;
}
function householdScreen() {
  householdSetupOpen = true;
  app.innerHTML = `<main class="setup-screen"><span class="brand-mark">${icon('home')}</span><h1>Bienvenue, ${esc(runtime.auth.current()?.name)}</h1><p>Crée le planning de ta maison ou rejoins celui de ton foyer.</p><div class="setup-panels"><form id="household-form"><h2>Créer mon foyer</h2><label>Nom du foyer<input name="name" value="Notre maison" maxlength="100" required></label><button type="submit" class="primary-button">Créer le planning</button><p class="form-help">Ton planning démarre vide. Crée les tâches et les séances adaptées à cette famille.</p></form><form id="join-form"><h2>Rejoindre un foyer</h2><label>Code d’invitation<input name="token" placeholder="Code transmis par ton foyer" required></label><button type="submit" class="subtle-button">Rejoindre</button></form></div>${runtime.households?.length ? familyChoicesHTML() : ''}${state ? button('return-planning', 'Revenir au planning', 'subtle-button') : ''}${button('sign-out', 'Se déconnecter', 'text-button')}</main>`;
}
async function openService() {
  if (!service) service = await runtime.open();
  if (!service) { householdScreen(); return; }
  state = await service.load();
  const openedService = service;
  service.subscribe(value => { if (service !== openedService) return; state = value; if (!householdSetupOpen) render(); });
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
