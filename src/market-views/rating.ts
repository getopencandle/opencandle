import type { Bar } from '../domain/types';

export type Vote = 1 | 0 | -1;
export interface RatingVote { name: string; group: 'average' | 'oscillator'; value: number; vote: Vote }
export interface RatingResult {
  votes: RatingVote[]; buy: number; sell: number; neutral: number; score: number | null; label: string;
  groups: { average: number | null; oscillator: number | null }; needed: number; have: number;
}
const MA_PERIODS = [10, 20, 30, 50, 100, 200] as const;
export const RATING_MIN_BARS = 30;

export function smaLastOf(v: number[], p: number): number | null {
  if (v.length < p) return null; let s = 0; for (let i = v.length - p; i < v.length; i++) s += v[i]; return s / p;
}
/** Seeded with the first value, alpha = 2/(p+1). */
export function emaSeries(v: number[], p: number): number[] {
  const a = 2 / (p + 1), out: number[] = []; v.forEach((x, i) => out.push(i === 0 ? x : a * x + (1 - a) * out[i - 1])); return out;
}
/** Wilder RSI: first average is the simple mean of the first p changes. */
export function rsiLast(c: number[], p = 14): number | null {
  if (c.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= p; l /= p;
  for (let i = p + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; }
  return l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l);
}
export function stochLast(b: Bar[], p = 14): number | null {
  if (b.length < p) return null; const w = b.slice(-p), hi = Math.max(...w.map(x => x.high)), lo = Math.min(...w.map(x => x.low));
  return hi === lo ? null : (b[b.length - 1].close - lo) / (hi - lo) * 100;
}
export function williamsLast(b: Bar[], p = 14): number | null { const k = stochLast(b, p); return k === null ? null : k - 100; }
/** CCI with typical price and the 0.015 constant over a simple mean deviation. */
export function cciLast(b: Bar[], p = 20): number | null {
  if (b.length < p) return null; const tp = b.slice(-p).map(x => (x.high + x.low + x.close) / 3), m = tp.reduce((s, x) => s + x, 0) / p;
  const md = tp.reduce((s, x) => s + Math.abs(x - m), 0) / p; return md === 0 ? null : (tp[p - 1] - m) / (0.015 * md);
}
export function macdLast(c: number[]): { macd: number; signal: number } | null {
  if (c.length < 35) return null; const f = emaSeries(c, 12), s = emaSeries(c, 26), line = c.map((_, i) => f[i] - s[i]), sig = emaSeries(line, 9);
  return { macd: line[line.length - 1], signal: sig[sig.length - 1] };
}
const label = (s: number) => s >= 0.5 ? 'Strong buy' : s >= 0.1 ? 'Buy' : s > -0.1 ? 'Neutral' : s > -0.5 ? 'Sell' : 'Strong sell';

/**
 * A technical rating computed only from the loaded bars. Moving averages vote buy when the last close is above them, sell when below;
 * oscillators vote by common thresholds. Score is (buy - sell) / votes in -1..1 per group, and the overall score is the mean of the groups present.
 */
export function technicalRating(bars: readonly Bar[]): RatingResult {
  const b = bars.filter(x => [x.high, x.low, x.close].every(Number.isFinite)), c = b.map(x => x.close);
  const votes: RatingVote[] = [], last = c[c.length - 1];
  const add = (name: string, group: RatingVote['group'], value: number | null, vote: Vote) => { if (value !== null && Number.isFinite(value)) votes.push({ name, group, value, vote }); };
  if (b.length >= 2) {
    const side = (x: number): Vote => last > x ? 1 : last < x ? -1 : 0;
    for (const p of MA_PERIODS) { const m = smaLastOf(c, p); add('SMA ' + p, 'average', m, m === null ? 0 : side(m)); }
    for (const p of MA_PERIODS) { const m = c.length >= p ? emaSeries(c, p)[c.length - 1] : null; add('EMA ' + p, 'average', m, m === null ? 0 : side(m)); }
    const r = rsiLast(c); add('RSI 14', 'oscillator', r, r === null ? 0 : r < 30 ? 1 : r > 70 ? -1 : 0);
    const k = stochLast(b); add('Stochastic %K 14', 'oscillator', k, k === null ? 0 : k < 20 ? 1 : k > 80 ? -1 : 0);
    const cc = cciLast(b); add('CCI 20', 'oscillator', cc, cc === null ? 0 : cc < -100 ? 1 : cc > 100 ? -1 : 0);
    const w = williamsLast(b); add('Williams %R 14', 'oscillator', w, w === null ? 0 : w < -80 ? 1 : w > -20 ? -1 : 0);
    const mom = c.length > 10 ? last - c[c.length - 11] : null; add('Momentum 10', 'oscillator', mom, mom === null ? 0 : mom > 0 ? 1 : mom < 0 ? -1 : 0);
    const md = macdLast(c); add('MACD 12 26 9', 'oscillator', md ? md.macd - md.signal : null, md ? (md.macd > md.signal ? 1 : md.macd < md.signal ? -1 : 0) : 0);
  }
  const part = (g: RatingVote['group']) => { const v = votes.filter(x => x.group === g); return v.length ? v.reduce((s, x) => s + x.vote, 0) / v.length : null; };
  const groups = { average: part('average'), oscillator: part('oscillator') };
  const present = [groups.average, groups.oscillator].filter((x): x is number => x !== null);
  const enough = b.length >= RATING_MIN_BARS && present.length > 0;
  const score = enough ? present.reduce((s, x) => s + x, 0) / present.length : null;
  return { votes, buy: votes.filter(x => x.vote > 0).length, sell: votes.filter(x => x.vote < 0).length, neutral: votes.filter(x => x.vote === 0).length,
    score, label: score === null ? 'Unavailable' : label(score), groups, needed: RATING_MIN_BARS, have: b.length };
}
