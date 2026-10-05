const DAY = 86400000;
export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('Date invalide.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) throw new Error('Date invalide.');
  return date;
}
export function isoDate(date) { return date.toISOString().slice(0, 10); }
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(date, count) { return isoDate(new Date(parseDate(date).getTime() + count * DAY)); }
export function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / DAY); }
export function weekStart(date) { return addDays(date, -((parseDate(date).getUTCDay() + 6) % 7)); }
export function monthStart(date) { return `${date.slice(0, 7)}-01`; }
export function addMonths(date, count) {
  const d = parseDate(date);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + count, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d.getUTCDate(), last));
  return isoDate(first);
}
export function monthEnd(date) { return addDays(addMonths(monthStart(date), 1), -1); }
export function datesBetween(start, end) {
  if (daysBetween(start, end) > 3700) throw new Error('Période trop longue.');
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}
export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(parseDate(date));
}
