/**
 * The US equity session calendar by New York wall clock. Regular 09:30-16:00, extended
 * 04:00-09:30 and 16:00-20:00 (the hours Alpaca IEX bars can carry trades), closed otherwise, on weekends and on NYSE
 * full-day holidays. On an early-close day the regular session ends at 13:00 and after-hours runs 13:00-17:00.
 *
 * Source: public NYSE holiday and early-close dates for 2015 through 2028 (NYSE_CALENDAR_YEARS), from the NYSE Group
 * holiday and early closings calendar releases (ir.theice.com, NYSE's parent) and the NYSE "Holidays and Trading Hours"
 * page (nyse.com/markets/hours-calendars). Two unscheduled
 * full-day closures are included: 2018-12-05 and 2025-01-09 (national days of mourning, NYSE announcements of
 * 2018-12-01 and 2024-12-30). Years outside the range fall back to weekends only, with no holidays and no early closes.
 *
 * Session-anchored buckets (`usEquitySessionBucket`) split each New York day into segments that no bar crosses:
 * overnight (previous after-hours end to 04:00), pre-market (04:00-09:30), regular (09:30 to the close), after-hours
 * (the close to 20:00, or 17:00 on an early-close day). Bars count from the start of their segment, so 1-hour regular
 * bars open at 09:30, 10:30 and so on, and the last one of the day is shorter (15:30-16:00).
 */
export type UsMarketSession = 'regular' | 'extended' | 'closed';
export type UsSessionPhase = 'pre' | 'regular' | 'post' | 'overnight';
/** First and last calendar year whose NYSE closures and early closes are listed below. */
export const NYSE_CALENDAR_YEARS = Object.freeze({ first: 2015, last: 2028 });
/** NYSE full-day closures by New York date. A Saturday holiday moves to the Friday before, except New Year's Day (2022 and
 * 2028 have no observed New Year holiday); a Sunday holiday moves to the Monday after. Juneteenth from 2022. */
export const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  '2015-01-01', '2015-01-19', '2015-02-16', '2015-04-03', '2015-05-25', '2015-07-03', '2015-09-07', '2015-11-26', '2015-12-25',
  '2016-01-01', '2016-01-18', '2016-02-15', '2016-03-25', '2016-05-30', '2016-07-04', '2016-09-05', '2016-11-24', '2016-12-26',
  '2017-01-02', '2017-01-16', '2017-02-20', '2017-04-14', '2017-05-29', '2017-07-04', '2017-09-04', '2017-11-23', '2017-12-25',
  '2018-01-01', '2018-01-15', '2018-02-19', '2018-03-30', '2018-05-28', '2018-07-04', '2018-09-03', '2018-11-22', '2018-12-05', '2018-12-25',
  '2019-01-01', '2019-01-21', '2019-02-18', '2019-04-19', '2019-05-27', '2019-07-04', '2019-09-02', '2019-11-28', '2019-12-25',
  '2020-01-01', '2020-01-20', '2020-02-17', '2020-04-10', '2020-05-25', '2020-07-03', '2020-09-07', '2020-11-26', '2020-12-25',
  '2021-01-01', '2021-01-18', '2021-02-15', '2021-04-02', '2021-05-31', '2021-07-05', '2021-09-06', '2021-11-25', '2021-12-24',
  '2022-01-17', '2022-02-21', '2022-04-15', '2022-05-30', '2022-06-20', '2022-07-04', '2022-09-05', '2022-11-24', '2022-12-26',
  '2023-01-02', '2023-01-16', '2023-02-20', '2023-04-07', '2023-05-29', '2023-06-19', '2023-07-04', '2023-09-04', '2023-11-23', '2023-12-25',
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25',
]);
/** NYSE 13:00 early closes, exactly as published (each year's list is its own: the day before Independence Day only when
 * NYSE names it, the day after Thanksgiving, and Christmas Eve only when NYSE names it). For example 2016-12-23, 2021-07-02,
 * 2022-07-01 and 2027-12-23 are full days, and 2027 has no Christmas Eve early close because 2027-12-24 is the observed
 * Christmas holiday. */
export const NYSE_EARLY_CLOSES: ReadonlySet<string> = new Set([
  '2015-11-27', '2015-12-24', '2016-11-25', '2017-07-03', '2017-11-24', '2018-07-03', '2018-11-23', '2018-12-24',
  '2019-07-03', '2019-11-29', '2019-12-24', '2020-11-27', '2020-12-24', '2021-11-26', '2022-11-25', '2023-07-03', '2023-11-24',
  '2024-07-03', '2024-11-29', '2024-12-24', '2025-07-03', '2025-11-28', '2025-12-24', '2026-11-27', '2026-12-24', '2027-11-26',
  '2028-07-03', '2028-11-24',
]);
/** Minutes after New York midnight. */
export const US_SESSION_MINUTES = Object.freeze({ preOpen: 240, open: 570, close: 960, earlyClose: 780, postClose: 1200, earlyPostClose: 1020 });
export interface UsSessionDay {
  /** New York calendar date, YYYY-MM-DD. */
  date: string; weekend: boolean; holiday: boolean; earlyClose: boolean;
  /** Minutes after New York midnight. */
  preOpen: number; open: number; close: number; postClose: number;
}
const MINUTE = 60, HOUR = 3600, DAY = 86400;
let formatter: Intl.DateTimeFormat | null = null;
const offsets = new Map<number, number>();
/** New York UTC offset in seconds at a Unix second. America/New_York changes offset only on whole UTC hours, so one
 * lookup per UTC hour is cached. */
function offsetAt(time: number): number {
  const hour = Math.floor(time / HOUR), cached = offsets.get(hour);
  if (cached !== undefined) return cached;
  formatter ??= new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const at = hour * HOUR, parts = Object.fromEntries(formatter.formatToParts(new Date(at * 1000)).map(part => [part.type, part.value]));
  const local = new Date(0); local.setUTCFullYear(Number(parts.year),Number(parts.month) - 1, Number(parts.day)); local.setUTCHours(Number(parts.hour) % 24, Number(parts.minute), Number(parts.second), 0);
  const offset = Math.round(local.getTime() / 1000) - at;
  if (offsets.size > 50000) offsets.clear();
  offsets.set(hour, offset);
  return offset;
}
/** New York wall clock of a Unix second: calendar date, weekday (0 Sunday) and minute of the day. */
export function newYorkClock(time: number): { date: string; weekday: number; minutes: number } {
  const local = new Date((time + offsetAt(time)) * 1000);
  return { date: local.toISOString().slice(0, 10), weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
function dateStart(date: string): number { return Date.parse(date + 'T00:00:00Z') / 1000; }
function shiftDate(date: string, days: number): string { return new Date((dateStart(date) + days * DAY) * 1000).toISOString().slice(0, 10); }
/** Unix second of a New York wall-clock minute on a date. A minute skipped by the spring change maps to the instant
 * after the gap; a repeated autumn minute maps to its first occurrence. Session edges (04:00 onward) are never either. */
export function newYorkWallTime(date: string, minute: number): number {
  const local = dateStart(date) + minute * MINUTE, first = offsetAt(local);
  let time = local - first;
  const second = offsetAt(time);
  if (second !== first && offsetAt(local - second) === second) time = local - second;
  return time;
}
export function usSessionDay(date: string): UsSessionDay {
  const weekday = new Date(dateStart(date) * 1000).getUTCDay(), early = NYSE_EARLY_CLOSES.has(date), m = US_SESSION_MINUTES;
  return { date, weekend: weekday === 0 || weekday === 6, holiday: NYSE_HOLIDAYS.has(date), earlyClose: early, preOpen: m.preOpen, open: m.open, close: early ? m.earlyClose : m.close, postClose: early ? m.earlyPostClose : m.postClose };
}
/** Session phase of an instant by New York wall clock and the early-close calendar (weekends and holidays are not
 * checked here: they carry no bars). */
export function usSessionPhase(time: number): UsSessionPhase {
  const { date, minutes } = newYorkClock(time), day = usSessionDay(date);
  if (minutes >= day.open && minutes < day.close) return 'regular';
  if (minutes >= day.preOpen && minutes < day.open) return 'pre';
  if (minutes >= day.close && minutes < day.postClose) return 'post';
  return 'overnight';
}
export function usMarketSession(nowMs: number = Date.now()): UsMarketSession {
  if (!Number.isFinite(nowMs)) return 'closed';
  const time = Math.floor(nowMs / 1000), { date } = newYorkClock(time), day = usSessionDay(date);
  if (day.weekend || day.holiday) return 'closed';
  const phase = usSessionPhase(time);
  return phase === 'regular' ? 'regular' : phase === 'overnight' ? 'closed' : 'extended';
}
/** The session segment holding an instant, as Unix seconds [start, end). */
export function usSessionSegment(time: number): { phase: UsSessionPhase; start: number; end: number } {
  const { date, minutes } = newYorkClock(time), day = usSessionDay(date);
  if (minutes < day.preOpen) { const previous = usSessionDay(shiftDate(date, -1)); return { phase: 'overnight', start: newYorkWallTime(previous.date, previous.postClose), end: newYorkWallTime(date, day.preOpen) }; }
  if (minutes < day.open) return { phase: 'pre', start: newYorkWallTime(date, day.preOpen), end: newYorkWallTime(date, day.open) };
  if (minutes < day.close) return { phase: 'regular', start: newYorkWallTime(date, day.open), end: newYorkWallTime(date, day.close) };
  if (minutes < day.postClose) return { phase: 'post', start: newYorkWallTime(date, day.close), end: newYorkWallTime(date, day.postClose) };
  return { phase: 'overnight', start: newYorkWallTime(date, day.postClose), end: newYorkWallTime(shiftDate(date, 1), day.preOpen) };
}
/**
 * The session-anchored bucket of a US equity bar for an intraday interval of `minutes`. Buckets count
 * from their segment start and are cut at the segment end, so none crosses 04:00, 09:30, the close or the after-hours
 * end. Times are Unix seconds. The overnight segment holds the daylight-saving change and counts elapsed time from its
 * start, so its buckets stay contiguous across the change.
 */
export function usEquitySessionBucket(time: number, minutes: number): { start: number; end: number } {
  if (!Number.isSafeInteger(minutes) || minutes < 1) throw new RangeError('Session buckets need a whole number of minutes.');
  const segment = usSessionSegment(time), size = minutes * MINUTE;
  const start = segment.start + Math.floor((time - segment.start) / size) * size;
  return { start, end: Math.min(start + size, segment.end) };
}
/** A New York date with a regular session: a weekday that is not an NYSE full-day closure. */
export function isUsTradingDate(date: string): boolean { const day = usSessionDay(date); return !day.weekend && !day.holiday; }
/** The nearest trading date on or after (step 1) or on or before (step -1) a New York date. */
export function usTradingDateFrom(date: string, step: 1 | -1 = 1): string {
  let current = date;
  for (let guard = 0; guard < 30 && !isUsTradingDate(current); guard++) current = shiftDate(current, step);
  return current;
}
/**
 * The US equity trading day a bar belongs to, as a New York date (YYYY-MM-DD). Pine Script's time_tradingday
 * is the day the bar trades for, and that day can start on an earlier calendar day. Bars at or after the day's
 * after-hours end (20:00, or 17:00 on an early-close day) belong to the next trading day, so Sunday 20:00 trades for
 * Monday and a holiday-eve evening trades for the day after the holiday. Earlier bars keep their date, moved forward when
 * it is a weekend or a full-day closure. Pre-market and after-hours stay on their own date. The overnight assignment is
 * inferred from the time_tradingday model (the overnight session's day is not documented).
 */
export function usTradingDate(time: number): string {
  const { date, minutes } = newYorkClock(time), day = usSessionDay(date);
  return usTradingDateFrom(minutes >= day.postClose ? shiftDate(date, 1) : date, 1);
}
/** The instant a US equity trading date's extended window opens: the after-hours end of the trading date before it. */
export function usTradingDayStart(date: string): number {
  const previous = usSessionDay(usTradingDateFrom(shiftDate(date, -1), -1));
  return newYorkWallTime(previous.date, previous.postClose);
}
