import { isIntradayResolution } from './indicators-ext/r40-volume-catalog';
import { newYorkClock, usSessionPhase, type UsSessionPhase } from './us-market-hours';
import type { Bar, BarDataset } from './types';
import type { ScreenerCell } from './screener';

/**
 * Screener session family: change from open, gap, pre-market and post-market filters, and relative volume
 * at time. Every value reads only the supplied bars. Anything that cannot be computed is an unavailable or
 * insufficient-history cell with a reason, never zero. Definitions are readings of the public descriptions of
 * these screener fields and are listed in SCREENER_SESSION_POLICIES.
 */
export const SCREENER_SESSION_METRICS = ['changeFromOpen', 'changeFromOpenPercent', 'gapPercent', 'preMarketChangePercent', 'preMarketVolume', 'postMarketChangePercent', 'postMarketVolume', 'relativeVolumeAtTime'] as const;
export type ScreenerSessionMetric = typeof SCREENER_SESSION_METRICS[number];
export const isSessionMetric = (metric: string): metric is ScreenerSessionMetric => (SCREENER_SESSION_METRICS as readonly string[]).includes(metric);

export const SCREENER_SESSION_LABELS: Record<ScreenerSessionMetric, string> = {
  changeFromOpen: 'Change from open', changeFromOpenPercent: 'Change from open %', gapPercent: 'Gap %',
  preMarketChangePercent: 'Pre-market change %', preMarketVolume: 'Pre-market volume',
  postMarketChangePercent: 'Post-market change %', postMarketVolume: 'Post-market volume',
  relativeVolumeAtTime: 'Relative volume at time',
};
export const SCREENER_SESSION_POLICIES = [
  'Change from open: last close minus the open of the same supplied row (on daily rows, the day). Gap %: 100 x (open / previous supplied close - 1).',
  'Pre-market and post-market values need intraday rows with extended-hours coverage on the US equity calendar (New York time). Pre-market change % compares the last pre-market close of the newest New York date with the last regular-session close before that date; post-market change % compares the last post-market close with the same date\'s last regular close. Volumes sum the session rows of that date.',
  'Relative volume at time: regular-session volume of the newest New York date up to the time of its last regular row, divided by the mean volume of the previous N dates up to the same time of day. Needs intraday rows and N earlier dates.',
];
export function sessionParameters(metric: string): Array<{ key: string; label: string; defaultValue: number }> {
  return metric === 'relativeVolumeAtTime' ? [{ key: 'length', label: 'Earlier New York dates to average', defaultValue: 10 }] : [];
}
/** Rough per-bar work, for the screener calculation budget. */
export function sessionWork(metric: string): number { return ['changeFromOpen', 'changeFromOpenPercent', 'gapPercent'].includes(metric) ? 2 : 24; }

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
interface Phased { bar: Bar; date: string; minutes: number; phase: UsSessionPhase; }

export function sessionCell(dataset: BarDataset, metric: ScreenerSessionMetric, parameters: Record<string, unknown>): ScreenerCell {
  const bars = dataset.bars, last = bars.at(-1), previous = bars.at(-2);
  const base: ScreenerCell = { value: null, previous: null, state: 'unavailable', asOf: last?.time ?? null };
  const ok = (value: number, prev: number | null = null): ScreenerCell => ({ ...base, value, previous: prev, state: 'available' });
  const short = (reason: string): ScreenerCell => ({ ...base, state: 'insufficient-history', reason });
  const unavailable = (reason: string): ScreenerCell => ({ ...base, reason });
  if (!last) return unavailable('No historical bars are loaded for this instrument.');

  if (metric === 'changeFromOpen' || metric === 'changeFromOpenPercent') {
    const at = (bar: Bar | undefined): number | null => !bar || !fin(bar.open) || !fin(bar.close) || bar.open <= 0 ? null : metric === 'changeFromOpen' ? bar.close - bar.open : 100 * (bar.close / bar.open - 1);
    const value = at(last);
    return value === null ? unavailable('The last row has no positive open.') : ok(value, at(previous));
  }
  if (metric === 'gapPercent') {
    if (!previous) return short('Gap % needs a previous supplied row.');
    const gap = (bar: Bar, before: Bar | undefined) => before && fin(before.close) && before.close > 0 && fin(bar.open) ? 100 * (bar.open / before.close - 1) : null;
    const value = gap(last, previous);
    return value === null ? unavailable('The previous close is not positive.') : ok(value, bars.length > 2 ? gap(previous, bars.at(-3)) : null);
  }

  // Session metrics: US equity calendar, intraday rows only.
  if (!isIntradayResolution(dataset.resolution)) return unavailable(`${SCREENER_SESSION_LABELS[metric]} needs intraday rows; this source is ${dataset.resolution}.`);
  if (dataset.instrument.timezone !== 'America/New_York') return unavailable('Session filters use the US equity calendar (New York time) only.');
  const extended = metric !== 'relativeVolumeAtTime';
  if (extended && dataset.provenance.session !== 'extended' && dataset.provenance.session !== 'all') return unavailable('This source does not include extended-hours rows (session basis is ' + dataset.provenance.session + ').');
  const phased: Phased[] = bars.map(bar => { const clock = newYorkClock(bar.time); return { bar, date: clock.date, minutes: clock.minutes, phase: usSessionPhase(bar.time) }; });
  const date = phased.at(-1)!.date, today = phased.filter(row => row.date === date);

  if (metric === 'preMarketChangePercent' || metric === 'preMarketVolume') {
    const pre = today.filter(row => row.phase === 'pre');
    if (!pre.length) return unavailable(`No pre-market rows on ${date}.`);
    if (metric === 'preMarketVolume') return ok(pre.reduce((sum, row) => sum + row.bar.volume, 0));
    const reference = [...phased].reverse().find(row => row.date < date && row.phase === 'regular');
    if (!reference) return short(`No regular-session close before ${date} is loaded.`);
    return reference.bar.close > 0 ? ok(100 * (pre.at(-1)!.bar.close / reference.bar.close - 1)) : unavailable('The previous regular close is not positive.');
  }
  if (metric === 'postMarketChangePercent' || metric === 'postMarketVolume') {
    const post = today.filter(row => row.phase === 'post');
    if (!post.length) return unavailable(`No post-market rows on ${date}.`);
    if (metric === 'postMarketVolume') return ok(post.reduce((sum, row) => sum + row.bar.volume, 0));
    const reference = today.filter(row => row.phase === 'regular').at(-1);
    if (!reference) return unavailable(`No regular-session rows on ${date}.`);
    return reference.bar.close > 0 ? ok(100 * (post.at(-1)!.bar.close / reference.bar.close - 1)) : unavailable('The regular close is not positive.');
  }

  // relativeVolumeAtTime
  const n = parameters.length ?? 10;
  if (!Number.isSafeInteger(n) || (n as number) < 1 || (n as number) > 1000) return { ...base, state: 'invalid', reason: 'Dates to average must be a whole number from 1 to 1000.' };
  const regular = phased.filter(row => row.phase === 'regular');
  if (!regular.length) return unavailable('No regular-session rows are loaded.');
  const current = regular.at(-1)!, cutoff = current.minutes, byDate = new Map<string, number>();
  for (const row of regular) if (row.minutes <= cutoff) byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.bar.volume);
  const earlier = [...byDate.keys()].filter(day => day < current.date).sort().slice(-(n as number));
  if (earlier.length < (n as number)) return short(`Relative volume at time needs ${n} earlier New York dates; ${earlier.length} loaded.`);
  const mean = earlier.reduce((sum, day) => sum + byDate.get(day)!, 0) / earlier.length;
  if (!(mean > 0)) return unavailable('Earlier dates have no volume up to this time of day.');
  return ok(byDate.get(current.date)! / mean);
}
