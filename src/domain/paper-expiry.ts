import { usMarketSession } from './us-market-hours';
const MAX_FORMATTABLE_EXPIRY_SECONDS = 253402300799;

/** Formats stored Unix seconds without advancing or changing an order. */
export function formatPaperExpiry(value: number | undefined):
  | { kind: 'scheduled'; text: string }
  | { kind: 'missing' }
  | { kind: 'unavailable'; rawSeconds?: number } {
  if (value === undefined) return { kind: 'missing' };
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return { kind: 'unavailable' };
  if (value > MAX_FORMATTABLE_EXPIRY_SECONDS) return { kind: 'unavailable', rawSeconds: value };
  return { kind: 'scheduled', text: new Date(value * 1000).toISOString().replace(/\.000Z$/, 'Z') };
}

/**
 * A Day order ends at the close of its US equity session, not 24 hours after
 * placement. Regular-hours orders end at 16:00 New York time, extended-hours orders at 20:00 (the hours us-market-hours
 * classifies as extended). An order placed after that close, or on a weekend or NYSE holiday, ends at the next trading
 * day's close. Early-close days: us-market-hours does not expose them yet (its header treats 13:00 days as ordinary), so
 * the default close is used; a host that has the early-close calendar passes `earlyClose` (regular close minute for a New
 * York date, or null) and the extended close then follows four hours later, as on ordinary days.
 * Instruments without a US equity session (crypto, synthetic UTC fixtures, other timezones) keep the 86,400 s Day policy.
 */
export const PAPER_DAY_FALLBACK_SECONDS = 86400;
export const US_REGULAR_CLOSE_MINUTE = 960;
export const US_EXTENDED_CLOSE_MINUTE = 1200;
export interface PaperDayExpiryOptions { earlyClose?: (newYorkDate: string) => number | null }
export function paperSessionBound(instrument: { assetClass?: string; timezone?: string }): boolean {
  return ['stock', 'etf', 'option'].includes(instrument.assetClass ?? '') && instrument.timezone === 'America/New_York';
}
let nyFormat: Intl.DateTimeFormat | null = null;
function newYorkCalendar(ms: number): { year: number; month: number; day: number; minutes: number } {
  nyFormat ??= new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(nyFormat.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
/** Epoch ms of a New York wall-clock minute on a calendar date (DST resolved by one correction pass). */
export function newYorkWallClockMs(year: number, month: number, day: number, minuteOfDay: number): number {
  const target = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let guess = target;
  for (let pass = 0; pass < 2; pass++) { const seen = newYorkCalendar(guess), seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, 0, seen.minutes); guess += target - seenAsUtc; }
  return guess;
}
const isoDate = (year: number, month: number, day: number) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
/** Unix seconds at which a Day order accepted at `nowSeconds` expires. */
export function paperDayExpiry(nowSeconds: number, instrument: { assetClass?: string; timezone?: string }, extendedHours: boolean, options: PaperDayExpiryOptions = {}): number {
  const fallback = nowSeconds + PAPER_DAY_FALLBACK_SECONDS;
  if (!Number.isFinite(nowSeconds) || !paperSessionBound(instrument)) return fallback;
  const nowMs = nowSeconds * 1000, start = newYorkCalendar(nowMs);
  for (let offset = 0; offset < 14; offset++) {
    const civil = new Date(Date.UTC(start.year, start.month - 1, start.day + offset)), year = civil.getUTCFullYear(), month = civil.getUTCMonth() + 1, day = civil.getUTCDate();
    // Noon is inside the regular session on every trading day (early-close days included); 'closed' means weekend or holiday.
    if (usMarketSession(newYorkWallClockMs(year, month, day, 720)) === 'closed') continue;
    let early: number | null = null;
    try { early = options.earlyClose?.(isoDate(year, month, day)) ?? null; } catch { early = null; }
    const regularClose = early !== null && Number.isInteger(early) && early > 570 && early < US_REGULAR_CLOSE_MINUTE ? early : US_REGULAR_CLOSE_MINUTE;
    const closeMinute = extendedHours ? regularClose + (US_EXTENDED_CLOSE_MINUTE - US_REGULAR_CLOSE_MINUTE) : regularClose;
    const closeMs = newYorkWallClockMs(year, month, day, closeMinute);
    if (closeMs > nowMs) return Math.floor(closeMs / 1000);
  }
  return fallback;
}

/**
 * Week and Month durations: the order ends at the session close of the last trading day of the current week (Monday to Sunday,
 * New York calendar) or month. If that close has already passed, the next week or month applies. US equity instruments use the
 * holiday and early-close calendar passed in `options`; extended-hours orders end four hours after the regular close, as Day does.
 * Instruments without a US equity session end at the UTC end of the week (Sunday) or month.
 */
export type PaperPeriodKind = 'week' | 'month';
export function paperPeriodExpiry(kind: PaperPeriodKind, nowSeconds: number, instrument: { assetClass?: string; timezone?: string }, extendedHours: boolean, options: PaperDayExpiryOptions = {}): number {
  const periodOf = (civil: Date) => {
    if (kind === 'month') return `${civil.getUTCFullYear()}-${civil.getUTCMonth()}`;
    const monday = new Date(civil.getTime() - ((civil.getUTCDay() + 6) % 7) * 86400000);
    return monday.toISOString().slice(0, 10);
  };
  if (!Number.isFinite(nowSeconds)) return nowSeconds + PAPER_DAY_FALLBACK_SECONDS;
  const nowMs = nowSeconds * 1000;
  if (!paperSessionBound(instrument)) {
    const now = new Date(nowMs);
    const end = kind === 'month' ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - now.getUTCDay()) % 7 + 1);
    return Math.floor(end / 1000) - 1;
  }
  const start = newYorkCalendar(nowMs);
  let key = '', lastClose: number | null = null;
  for (let offset = 0; offset < 75; offset++) {
    const civil = new Date(Date.UTC(start.year, start.month - 1, start.day + offset)), period = periodOf(civil);
    if (period !== key) { if (lastClose !== null && lastClose > nowMs) return Math.floor(lastClose / 1000); key = period; lastClose = null; }
    const year = civil.getUTCFullYear(), month = civil.getUTCMonth() + 1, day = civil.getUTCDate();
    if (usMarketSession(newYorkWallClockMs(year, month, day, 720)) === 'closed') continue;
    let early: number | null = null;
    try { early = options.earlyClose?.(isoDate(year, month, day)) ?? null; } catch { early = null; }
    const regularClose = early !== null && Number.isInteger(early) && early > 570 && early < US_REGULAR_CLOSE_MINUTE ? early : US_REGULAR_CLOSE_MINUTE;
    lastClose = newYorkWallClockMs(year, month, day, extendedHours ? regularClose + (US_EXTENDED_CLOSE_MINUTE - US_REGULAR_CLOSE_MINUTE) : regularClose);
  }
  return nowSeconds + PAPER_DAY_FALLBACK_SECONDS;
}
