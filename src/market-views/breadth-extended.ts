import type { Bar, BarDataset } from '../domain/types';

/**
 * Extended breadth (net, ratio, up and down volume, extremes and performance; our own definitions where the reference
 * is unresolved). Computed only from loaded bars of the scoped symbols. Missing data is counted apart from zero.
 * - Advance/decline uses the last bar against the bar before it (same rule as breadth()).
 * - Up volume: last-bar volume of advancers; down volume: decliners plus unchanged. Shares are of the volume that is known.
 * - New highs/lows over a calendar lookback (1W = 7 days, 1M/3M/1Y = calendar months back from the last bar, UTC). A symbol is
 *   eligible when its loaded history reaches back to the cutoff. New high: last high >= the highest high of the earlier bars
 *   inside the lookback (ties count). Net = (highs - lows) / all scoped symbols * 100.
 * - Outperformance: return over the lookback = last close / last close on or before the cutoff - 1. A constituent counts when
 *   its return is strictly greater than the benchmark's. The benchmark is picked by the user from loaded symbols; there is no
 *   default index and nothing is substituted.
 */
export type ExtremeWindow = '1W' | '1M' | '3M' | '1Y';
export const EXTREME_WINDOWS: readonly ExtremeWindow[] = ['1W', '1M', '3M', '1Y'];
export type PerfWindow = '1M' | '3M';

export function windowCutoff(lastTime: number, window: ExtremeWindow): number {
  if (window === '1W') return lastTime - 7 * 86400;
  const months = window === '1M' ? 1 : window === '3M' ? 3 : 12, d = new Date(lastTime * 1000);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return Math.floor(target.getTime() / 1000);
}
const valid = (b: Bar) => Number.isFinite(b.close) && Number.isFinite(b.time);

export interface ExtremeRow { window: ExtremeWindow; scoped: number; eligible: number; highs: number; lows: number; net: number | null }
export function extremes(sets: readonly BarDataset[], window: ExtremeWindow): ExtremeRow {
  const row: ExtremeRow = { window, scoped: sets.length, eligible: 0, highs: 0, lows: 0, net: null };
  for (const set of sets) {
    const bars = set.bars.filter(valid); if (bars.length < 2) continue;
    const last = bars[bars.length - 1], cutoff = windowCutoff(last.time, window);
    if (bars[0].time > cutoff) continue;
    const prior = bars.filter(b => b.time >= cutoff && b.time < last.time);
    if (!prior.length) continue;
    row.eligible++;
    if (Number.isFinite(last.high) && last.high >= Math.max(...prior.map(b => b.high))) row.highs++;
    if (Number.isFinite(last.low) && last.low <= Math.min(...prior.map(b => b.low))) row.lows++;
  }
  row.net = row.scoped ? (row.highs - row.lows) / row.scoped * 100 : null;
  return row;
}

/** Percent return over the window, or null when the history does not reach the cutoff. */
export function windowReturn(bars: readonly Bar[], window: ExtremeWindow): number | null {
  const v = bars.filter(valid); if (v.length < 2) return null;
  const last = v[v.length - 1], cutoff = windowCutoff(last.time, window);
  let base: Bar | null = null; for (const b of v) { if (b.time <= cutoff) base = b; else break; }
  if (!base || !(base.close > 0)) return null;
  return (last.close / base.close - 1) * 100;
}

export interface PerfRow { window: PerfWindow; benchmark: string | null; benchmarkReturn: number | null; constituents: number; eligible: number; outperform: number; pct: number | null; meanReturn: number | null; spread: number | null; reason: string | null }
export function outperformance(sets: readonly BarDataset[], benchmark: BarDataset | null, window: PerfWindow): PerfRow {
  const others = benchmark ? sets.filter(s => s.instrument.id !== benchmark.instrument.id) : [...sets];
  const row: PerfRow = { window, benchmark: benchmark?.instrument.symbol ?? null, benchmarkReturn: null, constituents: others.length, eligible: 0, outperform: 0, pct: null, meanReturn: null, spread: null, reason: null };
  if (!benchmark) { row.reason = 'Pick a benchmark from your loaded symbols. No index is assumed.'; return row; }
  row.benchmarkReturn = windowReturn(benchmark.bars, window);
  if (row.benchmarkReturn === null) { row.reason = `${benchmark.instrument.symbol} has no loaded history back to ${window} before its last bar.`; return row; }
  const returns: number[] = [];
  for (const s of others) { const r = windowReturn(s.bars, window); if (r === null) continue; returns.push(r); if (r > row.benchmarkReturn) row.outperform++; }
  row.eligible = returns.length;
  if (!returns.length) { row.reason = `No scoped symbol has loaded history back to ${window} before its last bar.`; return row; }
  row.pct = row.outperform / row.eligible * 100;
  row.meanReturn = returns.reduce((s, x) => s + x, 0) / returns.length;
  row.spread = row.meanReturn - row.benchmarkReturn;
  return row;
}

export interface FlowResult {
  scoped: number; measured: number; advancers: number; decliners: number; unchanged: number;
  net: number; ratio: number | null; ratioNote: string | null;
  volumeKnown: number; upVolume: number; downVolume: number; upShare: number | null; downShare: number | null;
}
export function breadthFlow(sets: readonly BarDataset[]): FlowResult {
  const r: FlowResult = { scoped: sets.length, measured: 0, advancers: 0, decliners: 0, unchanged: 0, net: 0, ratio: null, ratioNote: null, volumeKnown: 0, upVolume: 0, downVolume: 0, upShare: null, downShare: null };
  for (const set of sets) {
    const b = set.bars; if (b.length < 2) continue;
    const last = b[b.length - 1], prev = b[b.length - 2];
    if (!Number.isFinite(last.close) || !Number.isFinite(prev.close)) continue;
    r.measured++; const d = last.close - prev.close, up = d > 0;
    if (up) r.advancers++; else if (d < 0) r.decliners++; else r.unchanged++;
    if (Number.isFinite(last.volume) && last.volume >= 0) { r.volumeKnown++; if (up) r.upVolume += last.volume; else r.downVolume += last.volume; }
  }
  r.net = r.advancers - r.decliners;
  if (r.decliners > 0) r.ratio = r.advancers / r.decliners;
  else r.ratioNote = r.measured ? 'No decliners, so the ratio is undefined.' : 'No symbol has two loaded bars.';
  const total = r.upVolume + r.downVolume;
  if (total > 0) { r.upShare = r.upVolume / total * 100; r.downShare = r.downVolume / total * 100; }
  return r;
}
