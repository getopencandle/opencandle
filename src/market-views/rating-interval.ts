import type { Bar } from '../domain/types';

/**
 * Rate the loaded bars as they are, or grouped into weekly (UTC weeks starting
 * Monday) or monthly (UTC calendar months) bars: first open, highest high, lowest low, last close, summed volume. Grouping
 * never makes bars finer: when the loaded bars are already as coarse as the target, the interval is unavailable with a reason.
 */
export type RatingInterval = 'loaded' | '1W' | '1M';
export const RATING_INTERVALS: readonly RatingInterval[] = ['loaded', '1W', '1M'];
const DAY = 86400;
const weekKey = (t: number) => { const day = Math.floor(t / DAY); return Math.floor((day + 3) / 7); };
const monthKey = (t: number) => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

export function medianSpacing(bars: readonly Bar[]): number | null {
  if (bars.length < 2) return null;
  const gaps = bars.slice(1).map((b, i) => b.time - bars[i].time).sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}
export function resampleBars(bars: readonly Bar[], interval: RatingInterval): { bars: Bar[]; reason: string | null } {
  if (interval === 'loaded') return { bars: [...bars], reason: null };
  const spacing = medianSpacing(bars), target = interval === '1W' ? 7 * DAY : 28 * DAY;
  if (spacing !== null && spacing >= target * 0.9) return { bars: [], reason: `The loaded bars are already ${interval === '1W' ? 'weekly' : 'monthly'} or coarser. Use the loaded interval.` };
  const key = interval === '1W' ? weekKey : monthKey, out: Bar[] = [];
  let k: number | null = null;
  for (const b of bars) {
    if (![b.open, b.high, b.low, b.close].every(Number.isFinite)) continue;
    const kk = key(b.time), last = out[out.length - 1];
    if (kk !== k || !last) { out.push({ ...b, volume: Number.isFinite(b.volume) ? b.volume : 0 }); k = kk; continue; }
    last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close;
    if (Number.isFinite(b.volume)) last.volume += b.volume;
  }
  return { bars: out, reason: null };
}
