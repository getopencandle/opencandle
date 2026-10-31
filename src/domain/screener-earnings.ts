import type { CalendarDocument } from './calendar';
import { isIntradayResolution } from './indicators-ext/r40-volume-catalog';
import { newYorkClock } from './us-market-hours';
import type { BarDataset } from './types';
import type { ScreenerCell } from './screener';

/**
 * Screener earnings-date filters. Dates come only from the local calendar documents the user imported or
 * auto-filled (Calendar). No earnings date is ever invented: a symbol without a matching supplied event is unavailable,
 * never "no earnings".
 */
export const SCREENER_EARNINGS_METRICS = ['earningsUpcomingDays', 'earningsRecentDays'] as const;
export type ScreenerEarningsMetric = typeof SCREENER_EARNINGS_METRICS[number];
export const isEarningsMetric = (metric: string): metric is ScreenerEarningsMetric => (SCREENER_EARNINGS_METRICS as readonly string[]).includes(metric);
export const SCREENER_EARNINGS_LABELS: Record<ScreenerEarningsMetric, string> = {
  earningsUpcomingDays: 'Upcoming earnings, days ahead', earningsRecentDays: 'Recent earnings, days ago',
};
export const SCREENER_EARNINGS_POLICIES = [
  'Earnings dates come from local Calendar documents only (imported files, saved SEC reported quarters, or synthetic demos). An event matches by instrument id, or by ticker with the same synthetic status. Cancelled events are ignored; each event uses its newest revision.',
  'Upcoming earnings counts calendar days from the date of the last supplied row to the next earnings date on or after it (0 = same date). Recent earnings counts days back to the latest earnings date on or before it. Daily rows use their UTC date; intraday rows use the New York date.',
];
const DAY = 86400;
/** Sorted unique earnings dates (YYYY-MM-DD) per instrument id and per ticker+synthetic key. */
export function screenerEarningsIndex(documents: readonly CalendarDocument[]): (dataset: BarDataset) => string[] {
  const latest = new Map<string, { revision: number; date: string; status: string; symbol: string | null; instrumentId: string | null; fixture: boolean }>();
  for (const document of documents ?? []) for (const event of document?.events ?? []) {
    if (event?.kind !== 'earnings' || typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) continue;
    const key = JSON.stringify([document.id, event.id]), old = latest.get(key);
    if (!old || event.revision > old.revision) latest.set(key, { revision: event.revision, date: event.date, status: event.status, symbol: event.symbol, instrumentId: event.instrumentId, fixture: !!document.provenance?.fixture });
  }
  const byInstrument = new Map<string, Set<string>>(), bySymbol = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, date: string) => { const set = map.get(key) ?? new Set<string>(); set.add(date); map.set(key, set); };
  for (const event of latest.values()) {
    if (event.status === 'cancelled') continue;
    if (event.instrumentId) add(byInstrument, event.instrumentId, event.date);
    else if (event.symbol) add(bySymbol, JSON.stringify([event.symbol.toUpperCase(), event.fixture]), event.date);
  }
  return dataset => [...new Set([...(byInstrument.get(dataset.instrument.id) ?? []), ...(bySymbol.get(JSON.stringify([dataset.instrument.symbol.toUpperCase(), !!dataset.provenance.fixture])) ?? [])])].sort();
}
export function rowDate(dataset: BarDataset, time: number): string {
  return isIntradayResolution(dataset.resolution) ? newYorkClock(time).date : new Date(time * 1000).toISOString().slice(0, 10);
}
const days = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 1000 / DAY);

export function earningsCell(dataset: BarDataset, metric: ScreenerEarningsMetric, earningsOf?: (dataset: BarDataset) => readonly string[]): ScreenerCell {
  const last = dataset.bars.at(-1);
  const base: ScreenerCell = { value: null, previous: null, state: 'unavailable', asOf: last?.time ?? null };
  if (!earningsOf) return { ...base, reason: 'No local calendar is connected to this screener.' };
  if (!last) return { ...base, reason: 'No historical bars are loaded for this instrument.' };
  let dates: readonly string[];
  try { dates = earningsOf(dataset); } catch (cause) { return { ...base, reason: `Earnings dates could not be read: ${cause instanceof Error ? cause.message : String(cause)}` }; }
  if (!dates.length) return { ...base, reason: 'No supplied earnings event matches this symbol. Import or auto-fill earnings in Calendar.' };
  const today = rowDate(dataset, last.time);
  if (metric === 'earningsUpcomingDays') {
    const next = dates.find(date => date >= today);
    return next === undefined ? { ...base, reason: `No supplied earnings date on or after ${today}.` } : { ...base, value: days(today, next), state: 'available' };
  }
  const recent = [...dates].reverse().find(date => date <= today);
  return recent === undefined ? { ...base, reason: `No supplied earnings date on or before ${today}.` } : { ...base, value: days(recent, today), state: 'available' };
}
