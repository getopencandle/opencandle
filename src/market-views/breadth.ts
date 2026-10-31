import type { BarDataset } from '../domain/types';

export const SMA_PERIODS = [20, 50, 200] as const;
export interface BreadthResult {
  scoped: number; measured: number; advancers: number; decliners: number; unchanged: number;
  above: { period: number; eligible: number; above: number; pct: number | null }[];
  highLow: { window: number; eligible: number; highs: number; lows: number };
}
function smaLast(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  let sum = 0; for (let i = closes.length - period; i < closes.length; i++) sum += closes[i];
  return sum / period;
}
/** New high/low: the last bar's high (low) goes beyond the extreme of the `window` bars before it. Needs window+1 bars. */
export function breadth(sets: readonly BarDataset[], highLowWindow = 252): BreadthResult {
  const r: BreadthResult = { scoped: sets.length, measured: 0, advancers: 0, decliners: 0, unchanged: 0,
    above: SMA_PERIODS.map(period => ({ period, eligible: 0, above: 0, pct: null })), highLow: { window: highLowWindow, eligible: 0, highs: 0, lows: 0 } };
  for (const set of sets) {
    const b = set.bars; if (b.length < 1) continue;
    const closes = b.map(x => x.close), last = b[b.length - 1];
    if (!Number.isFinite(last.close)) continue;
    if (b.length >= 2 && Number.isFinite(b[b.length - 2].close)) {
      r.measured++; const d = last.close - b[b.length - 2].close;
      if (d > 0) r.advancers++; else if (d < 0) r.decliners++; else r.unchanged++;
    }
    for (const row of r.above) { const m = smaLast(closes, row.period); if (m === null) continue; row.eligible++; if (last.close > m) row.above++; }
    if (b.length > highLowWindow) {
      const prior = b.slice(b.length - 1 - highLowWindow, b.length - 1);
      r.highLow.eligible++;
      if (last.high > Math.max(...prior.map(x => x.high))) r.highLow.highs++;
      if (last.low < Math.min(...prior.map(x => x.low))) r.highLow.lows++;
    }
  }
  for (const row of r.above) row.pct = row.eligible ? row.above / row.eligible * 100 : null;
  return r;
}
