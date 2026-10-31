import type { CalendarRow } from './calendar';

/**
 * View-only refinements of an already-queried calendar result (nothing here is saved with the query).
 * - Day strip: one chip per display date with its event count; picking a day narrows the table to that date.
 * - Day groups: consecutive rows that share a display date get one header row ("Today, Tue Oct 27").
 * - Importance levels: Low / Medium / High toggles. Rows without a supplied importance stay visible only while every level is on.
 */
export type CalendarImportanceLevel = 'high' | 'medium' | 'low';
export const CALENDAR_IMPORTANCE_LEVELS: readonly CalendarImportanceLevel[] = Object.freeze(['low', 'medium', 'high']);
export interface CalendarDayCount { date: string; count: number; }
export interface CalendarDayGroup { date: string; rows: CalendarRow[]; }

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parse(date: string): number | null {
  const match = DATE.exec(date); if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(time).toISOString().slice(0, 10) === date ? time : null;
}

/** Dates ascending with counts. Rows with an unparseable display date are counted under their raw text, last. */
export function calendarDayCounts(rows: readonly CalendarRow[]): CalendarDayCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.displayDate, (counts.get(row.displayDate) ?? 0) + 1);
  return [...counts].map(([date, count]) => ({ date, count })).sort((a, b) => {
    const left = parse(a.date), right = parse(b.date);
    if (left === null || right === null) return left === null && right === null ? a.date.localeCompare(b.date) : left === null ? 1 : -1;
    return left - right;
  });
}

/** "Today", "Tomorrow", "Yesterday" relative to `today` (YYYY-MM-DD in the display zone), otherwise "Tue, Oct 27". */
export function calendarDayLabel(date: string, today: string | null): string {
  const time = parse(date); if (time === null) return date;
  const base = today ? parse(today) : null;
  const plain = new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (base === null) return plain;
  const offset = Math.round((time - base) / 86400000);
  const relative = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset === -1 ? 'Yesterday' : null;
  return relative ? `${relative}, ${plain}` : plain;
}

/** Consecutive runs by display date, keeping row order (so a non-date sort simply yields more, smaller groups). */
export function groupCalendarRowsByDay(rows: readonly CalendarRow[]): CalendarDayGroup[] {
  const groups: CalendarDayGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.displayDate) last.rows.push(row); else groups.push({ date: row.displayDate, rows: [row] });
  }
  return groups;
}

export function filterCalendarDay(rows: readonly CalendarRow[], day: string | null): CalendarRow[] {
  return day === null ? [...rows] : rows.filter(row => row.displayDate === day);
}

/** All three levels on = no narrowing (unsupplied importance stays). Otherwise only rows whose importance is switched on. */
export function filterCalendarImportance(rows: readonly CalendarRow[], levels: readonly CalendarImportanceLevel[]): CalendarRow[] {
  const wanted = new Set(levels);
  if (CALENDAR_IMPORTANCE_LEVELS.every(level => wanted.has(level))) return [...rows];
  return rows.filter(row => row.event.importance !== null && wanted.has(row.event.importance as CalendarImportanceLevel));
}

/** Toggle one level; turning off the last remaining level is refused (an all-off view would hide everything silently). */
export function toggleCalendarImportance(levels: readonly CalendarImportanceLevel[], level: CalendarImportanceLevel): CalendarImportanceLevel[] {
  const has = levels.includes(level);
  if (has && levels.length === 1) return [...levels];
  const next = has ? levels.filter(item => item !== level) : [...levels, level];
  return CALENDAR_IMPORTANCE_LEVELS.filter(item => next.includes(item));
}
