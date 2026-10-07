// Date helpers. Everything is displayed in Europe/Lisbon time with the
// Portuguese conventions: dd/mm/aaaa and 24-hour clock.
import { TIME_ZONE, LOCALE, SEASON_START_MONTH, DEFAULT_KICKOFF } from './config.js';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Wall-clock parts of an instant in Lisbon.
export function zonedParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = {};
  for (const p of partsFormatter.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS_EN.indexOf(parts.weekday),
  };
}

const pad = (n) => String(n).padStart(2, '0');

// Offset (minutes) between Lisbon wall-clock time and UTC at a given instant.
function offsetMinutes(date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

// "2026-10-14T21:00" (Lisbon wall clock) -> ISO string in UTC.
export function localInputToIso(value) {
  const [d, t = '00:00'] = value.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  let ts = guess - offsetMinutes(new Date(guess)) * 60000;
  // Second pass handles the days when the clock changes.
  const corrected = guess - offsetMinutes(new Date(ts)) * 60000;
  if (corrected !== ts) ts = corrected;
  return new Date(ts).toISOString();
}

// ISO string -> "2026-10-14T21:00" for <input type="datetime-local">.
export function isoToLocalInput(iso) {
  const p = zonedParts(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// "14/10/2026"
export function formatDate(iso) {
  const p = zonedParts(iso);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

// "14/10"
export function formatDayMonth(iso) {
  const p = zonedParts(iso);
  return `${pad(p.day)}/${pad(p.month)}`;
}

// "21:00"
export function formatTime(iso) {
  const p = zonedParts(iso);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// "14/10/2026, 21:00"
export function formatDateTime(iso) {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

const weekdayLong = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: 'long' });
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const monthYear = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, month: 'long', year: 'numeric' });

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "Quarta-feira"
export function formatWeekday(iso) {
  return capitalize(weekdayLong.format(new Date(iso)));
}

// "Qua"
export function formatWeekdayShort(iso) {
  return WEEKDAYS_SHORT[zonedParts(iso).weekday];
}

// "Outubro de 2026"
export function formatMonthYear(iso) {
  return capitalize(monthYear.format(new Date(iso)));
}

// Key for grouping by month: "2026-10"
export function monthKey(iso) {
  const p = zonedParts(iso);
  return `${p.year}-${pad(p.month)}`;
}

// Calendar-day difference between two instants, in Lisbon time.
function dayNumber(iso) {
  const p = zonedParts(iso);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
}

// "Hoje", "Amanhã", "Daqui a 5 dias", "Ontem", "Há 3 dias"
export function relativeDay(iso, now = new Date()) {
  const diff = dayNumber(iso) - dayNumber(now);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff > 1) return `Daqui a ${diff} dias`;
  return `Há ${-diff} dias`;
}

// Season label for a date: matches from September 2026 to August 2027
// belong to "2026/27".
export function seasonOf(iso) {
  const p = zonedParts(iso);
  const start = p.month >= SEASON_START_MONTH ? p.year : p.year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

export function currentSeason(now = new Date()) {
  return seasonOf(now);
}

// Next default kick-off (e.g. Wednesday 21:00) after `after`, skipping
// any dates in `taken` (array of ISO strings), as a datetime-local value.
export function nextKickoffInput(after = new Date(), taken = []) {
  const takenDays = new Set(taken.map((iso) => dayNumber(iso)));
  const p = zonedParts(after);
  let day = Date.UTC(p.year, p.month - 1, p.day);
  for (let i = 0; i < 60; i++, day += 86400000) {
    const d = new Date(day);
    if (d.getUTCDay() !== DEFAULT_KICKOFF.weekday) continue;
    const value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(DEFAULT_KICKOFF.hour)}:${pad(DEFAULT_KICKOFF.minute)}`;
    const iso = localInputToIso(value);
    if (new Date(iso) <= after) continue;
    if (takenDays.has(dayNumber(iso))) continue;
    return value;
  }
  return isoToLocalInput(new Date(after.getTime() + 7 * 86400000).toISOString());
}
