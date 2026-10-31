import type { Bar, SessionBasis } from '../domain/types';
import { newYorkClock, usSessionPhase, usSessionSegment } from '../domain/us-market-hours';

/**
 * Heatmap color metrics
 * computed only from loaded bars. Nothing is fetched and nothing is estimated: a missing input returns null with a reason.
 *
 * Extended hours: US-listed instruments quoted in New York time, intraday bars of at most 30 minutes that divide 30 minutes
 * (so no bar straddles 09:30 or 16:00), from a dataset whose session basis includes extended hours. A bar is classified by
 * its open with the LV New York session calendar (pre 04:00-09:30, regular 09:30-16:00, post 16:00-20:00, NYSE holidays and
 * early closes) and must end inside that segment.
 * - Pre-market change: last pre-market close on the latest loaded New York date versus the last regular-session close before it.
 * - Post-market change: last post-market close versus the last regular-session close of the latest New York date with regular bars.
 *
 * Beta: daily closes against the benchmark's daily closes on the same UTC dates. Simple returns between consecutive loaded
 * bars that both series have; the latest BETA_LOOKBACK returns, at least BETA_MIN_RETURNS. beta = cov(r, rb) / var(rb).
 */
export const HEATMAP_BETA_BENCHMARK = 'SPY';
export const BETA_LOOKBACK = 252;
export const BETA_MIN_RETURNS = 60;
const DAY = 86400;
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

export interface MetricValue { value: number | null; reason: string | null; baseTime: number | null }
const none = (reason: string): MetricValue => ({ value: null, reason, baseTime: null });

/** Why extended-hours change cannot be computed for this dataset at all, or null when it can be attempted. */
export function extendedHoursReason(input: { timezone: string; assetClass: string; session: SessionBasis; resolutionSeconds: number | null }): string | null {
  if (!['stock', 'etf'].includes(input.assetClass) || input.timezone !== 'America/New_York') return 'Extended-hours sessions are known only for US stocks and ETFs quoted in New York time.';
  if (input.session !== 'extended' && input.session !== 'all') return input.session === 'regular' ? 'This dataset holds regular-session bars only. Load bars that include extended hours.' : 'The dataset does not say whether it includes extended hours.';
  const seconds = input.resolutionSeconds;
  if (seconds === null || seconds <= 0 || seconds > 1800 || 1800 % seconds !== 0) return 'Needs intraday bars of 30 minutes or less that divide 30 minutes (1, 5, 15 or 30 minutes, for example).';
  return null;
}

type Phase = 'pre' | 'regular' | 'post' | 'overnight';
function phaseOf(bar: Bar, seconds: number): Phase {
  const phase = usSessionPhase(bar.time);
  if (phase === 'overnight') return phase;
  return bar.time + seconds <= usSessionSegment(bar.time).end ? phase : 'overnight';
}

export function extendedHoursChange(bars: readonly Bar[], seconds: number, kind: 'pre' | 'post'): MetricValue {
  if (!bars.length) return none('No loaded bars.');
  const tagged = bars.filter(bar => finitePositive(bar.close)).map(bar => ({ bar, phase: phaseOf(bar, seconds), date: newYorkClock(bar.time).date }));
  if (!tagged.length) return none('No loaded bar has a valid close.');
  if (kind === 'pre') {
    const date = tagged[tagged.length - 1].date, pre = tagged.filter(row => row.date === date && row.phase === 'pre');
    if (!pre.length) return none(`No pre-market bars on the latest loaded New York date (${date}).`);
    const first = pre[0].bar.time, base = [...tagged].reverse().find(row => row.phase === 'regular' && row.bar.time < first);
    if (!base) return none('No regular-session close is loaded before that pre-market session.');
    return { value: 100 * (pre[pre.length - 1].bar.close / base.bar.close - 1), reason: null, baseTime: base.bar.time };
  }
  const lastRegular = [...tagged].reverse().find(row => row.phase === 'regular');
  if (!lastRegular) return none('No regular-session bars are loaded.');
  const post = tagged.filter(row => row.date === lastRegular.date && row.phase === 'post' && row.bar.time > lastRegular.bar.time);
  if (!post.length) return none(`No post-market bars after the regular close of ${lastRegular.date}.`);
  return { value: 100 * (post[post.length - 1].bar.close / lastRegular.bar.close - 1), reason: null, baseTime: lastRegular.bar.time };
}

const utcDay = (time: number) => Math.floor(time / DAY);
export function dailyBeta(bars: readonly Bar[], benchmark: readonly Bar[]): MetricValue {
  const bench = new Map<number, number>();
  for (const bar of benchmark) if (finitePositive(bar.close)) bench.set(utcDay(bar.time), bar.close);
  const pairs: [number, number][] = [];
  let previous: { day: number; close: number } | null = null;
  for (const bar of bars) {
    if (!finitePositive(bar.close)) { previous = null; continue; }
    const day = utcDay(bar.time);
    if (previous && bench.has(day) && bench.has(previous.day)) pairs.push([bar.close / previous.close - 1, bench.get(day)! / bench.get(previous.day)! - 1]);
    previous = { day, close: bar.close };
  }
  const window = pairs.slice(-BETA_LOOKBACK);
  if (window.length < BETA_MIN_RETURNS) return none(`Needs at least ${BETA_MIN_RETURNS} daily returns on dates the ${HEATMAP_BETA_BENCHMARK} benchmark also has (found ${window.length}).`);
  const mean = (index: 0 | 1) => window.reduce((sum, row) => sum + row[index], 0) / window.length;
  const mx = mean(0), mb = mean(1);
  let cov = 0, variance = 0;
  for (const [x, b] of window) { cov += (x - mx) * (b - mb); variance += (b - mb) ** 2; }
  if (!(variance > 0)) return none('The benchmark returns do not vary over the window.');
  return { value: cov / variance, reason: null, baseTime: null };
}
