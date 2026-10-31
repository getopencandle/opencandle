// Oracle tests for the 23 built-in strategies on SYNTHETIC bars. Each source runs in the real restricted
// worker; its proposals go through the same adapter and engine as the Strategy report; the resulting fills must equal an
// independent TypeScript oracle of the strategy's rule (indicators re-implemented here from their formulas).
import { describe, expect, it, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { scriptOrdersToSignals } from '../../src/domain/strategy-script-orders';
import { BUILTIN_STRATEGIES, BUILTIN_STRATEGY_SELECTOR_ROWS, builtinStrategy, builtinStrategyDocument, findBuiltinStrategyDocument } from '../../src/domain/builtin-strategies/catalog';
import { compileLVScript } from '../../src/ui/script-editor-commands';
import { validateReportRow } from '../../src/strategy-report/schema';
import type { Bar } from '../../src/domain/types';
import { addBuiltinStrategyBinding } from '../../src/strategy-report/builtin-strategy-add';
import { createScriptLibrary } from '../../src/ui/script-library';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const jobs = new ScriptJobs();
afterAll(() => jobs.close());

/** SYNTHETIC daily bars: a seeded random walk with slow swings and occasional opening gaps, prices on a 0.01 grid. */
function syntheticBars(count: number, seed: number): Bar[] {
  let state = seed; const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const round = (value: number) => Math.round(value * 100) / 100, out: Bar[] = []; let close = 100;
  for (let i = 0; i < count; i++) {
    const gap = random() < 0.06 ? (random() - 0.5) * 6 : (random() - 0.5) * 0.6, open = round(close + gap);
    const next = round(open + Math.sin(i / 23) * 0.5 + (random() - 0.5) * 2.4);
    out.push({ time: 1_700_000_000 + i * 86400, open, high: round(Math.max(open, next) + random() * 1.2), low: round(Math.min(open, next) - random() * 1.2), close: next, volume: 1000 + Math.floor(random() * 500) });
    close = next;
  }
  return out;
}
const BARS = syntheticBars(600, 7);
const ids = (bars: readonly Bar[]) => bars.map((_, index) => 'synthetic-r36-' + index);

interface Fill { bar: number; side: 'buy' | 'sell'; quantity: number; price: number }
async function engineFills(id: string, bars: readonly Bar[] = BARS, inputs?: Record<string, unknown>) {
  const barIds = ids(bars);
  const run = await jobs.run({ requestId: 'r36-' + Math.random().toString(36).slice(2), source: builtinStrategy(id).source, bars: bars.map((bar, index) => ({ ...bar, id: barIds[index], revision: 1 })), ...(inputs ? { inputs } : {}) });
  expect(run.ok, run.error?.message).toBe(true);
  for (const row of run.value.orders) expect(() => validateReportRow('proposals', row)).not.toThrow();
  const result = backtestStrategy({ bars, barIds, signals: scriptOrdersToSignals(run.value.orders, bars, barIds), config: DEFAULT_STRATEGY_CONFIG });
  expect(result.ok, result.diagnostics.join(' ')).toBe(true);
  return { fills: result.fills.map(fill => ({ bar: fill.barIndex, side: fill.side, quantity: fill.quantity, price: fill.price })), result, proposals: run.value.orders as Record<string, unknown>[] };
}
function expectFills(actual: Fill[], expected: Fill[]) {
  expect(expected.length, 'the oracle finds at least two fills on the synthetic bars').toBeGreaterThanOrEqual(2);
  expect(actual.map(({ bar, side, quantity }) => ({ bar, side, quantity }))).toEqual(expected.map(({ bar, side, quantity }) => ({ bar, side, quantity })));
  actual.forEach((fill, index) => expect(fill.price).toBeCloseTo(expected[index].price, 9));
}

// ---- Oracle indicators (formulas as documented for OpenCandle's ctx.ta; null until defined) ----
type Series = (number | null)[];
const window = (values: Series, i: number, n: number): number[] | null => { if (i < n - 1) return null; const out: number[] = []; for (let j = i - n + 1; j <= i; j++) { const value = values[j]; if (value === null) return null; out.push(value); } return out; };
const sma = (values: Series, n: number): Series => values.map((_, i) => { const w = window(values, i, n); if (!w) return null; let sum = 0; for (const value of w) sum += value; return sum / n; });
const ema = (values: Series, n: number): Series => { const alpha = 2 / (n + 1); let state: number | null = null; return values.map(value => { if (value === null) return null; state = state === null ? value : alpha * value + (1 - alpha) * state; return state; }); };
// Ctx.ta.macd and ctx.ta.kc use the SMA-seeded EMA of the built-in MACD and KC (reference ARM 1D: MACD line first on
// bar 25, signal on bar 33; KC 20 first on bar 19); ctx.ta.ema keeps the first-value seed.
const emaSeeded = (values: Series, n: number): Series => { const alpha = 2 / (n + 1); let count = 0, sum = 0, state: number | null = null; return values.map(value => { if (value === null) return null; if (state === null) { sum += value; count++; if (count === n) state = sum / n; return state; } state = alpha * value + (1 - alpha) * state; return state; }); };
const difference = (a: Series, b: Series): Series => a.map((value, i) => value === null || b[i] === null ? null : value - b[i]!);
const rma = (values: Series, n: number): Series => { let count = 0, sum = 0, state: number | null = null; return values.map(value => { if (value === null) return null; if (state === null) { sum += value; count++; if (count === n) state = sum / n; return state; } state = (state * (n - 1) + value) / n; return state; }); };
const highest = (values: Series, n: number): Series => values.map((_, i) => { const w = window(values, i, n); return w ? Math.max(...w) : null; });
const lowest = (values: Series, n: number): Series => values.map((_, i) => { const w = window(values, i, n); return w ? Math.min(...w) : null; });
const lag = (values: Series, n = 1): Series => values.map((_, i) => i >= n ? values[i - n] : null);
const trueRange = (bars: readonly Bar[]): number[] => bars.map((bar, i) => i === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)));
const populationStdev = (values: Series, n: number): Series => values.map((_, i) => { const w = window(values, i, n); if (!w) return null; const origin = w[0]; let offset = 0; for (const value of w) offset += value - origin; offset /= n; let sum = 0; for (const value of w) { const d = value - origin - offset; sum += d * d; } return Math.sqrt(Math.max(0, sum / n)); });
const rsi = (values: number[], n: number): Series => { const gains: Series = values.map((value, i) => i ? Math.max(value - values[i - 1], 0) : null), losses: Series = values.map((value, i) => i ? Math.max(values[i - 1] - value, 0) : null); const up = rma(gains, n), down = rma(losses, n); return values.map((_, i) => { const u = up[i], d = down[i]; if (u === null || d === null || u === 0 && d === 0) return null; if (d === 0) return 100; if (u === 0) return 0; return 100 - 100 / (1 + u / d); }); };
const stochastic = (bars: readonly Bar[], n: number): Series => bars.map((bar, i) => { const hs = window(bars.map(row => row.high), i, n), ls = window(bars.map(row => row.low), i, n); if (!hs || !ls) return null; const top = Math.max(...hs), bottom = Math.min(...ls); return top === bottom ? null : 100 * (bar.close - bottom) / (top - bottom); });
const momentum = (values: number[], n: number): Series => values.map((value, i) => i >= n ? value - values[i - n] : null);
const crossover = (a: Series, b: Series, i: number) => i > 0 && a[i] !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null && a[i]! > b[i]! && a[i - 1]! <= b[i - 1]!;
const crossunder = (a: Series, b: Series, i: number) => i > 0 && a[i] !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null && a[i]! < b[i]! && a[i - 1]! >= b[i - 1]!;
const constant = (bars: readonly Bar[], value: number): Series => bars.map(() => value);
const pivot = (values: number[], left: number, right: number, high: boolean): Series => values.map((_, i) => { const w = window(values, i, left + right + 1); if (!w) return null; const center = w[w.length - 1 - right]; for (let j = 0; j < w.length; j++) if (j !== w.length - 1 - right && (high ? !(center > w[j]) : !(center < w[j]))) return null; return center; });
function adx(bars: readonly Bar[], di: number, smooth: number): Series {
  const plus: Series = bars.map((bar, i) => { if (!i) return null; const up = bar.high - bars[i - 1].high, down = bars[i - 1].low - bar.low; return up > down && up > 0 ? up : 0; });
  const minus: Series = bars.map((bar, i) => { if (!i) return null; const up = bar.high - bars[i - 1].high, down = bars[i - 1].low - bar.low; return down > up && down > 0 ? down : 0; });
  const range: Series = bars.map((bar, i) => i ? Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)) : null);
  const str = rma(range, di), sp = rma(plus, di), sm = rma(minus, di);
  const dx: Series = bars.map((_, i) => { const t = str[i]; if (t === null || !(t > 0) || sp[i] === null || sm[i] === null) return null; const p = 100 * sp[i]! / t, m = 100 * sm[i]! / t; return p + m === 0 ? null : 100 * Math.abs(p - m) / (p + m); });
  return rma(dx, smooth);
}

// ---- Oracle execution ----
/** Market reversal: a wanted position (1, -1, 0 for a close) on bar k fills at bar k + 1's open; a reversal trades both legs. */
function marketFills(bars: readonly Bar[], wanted: (k: number) => 1 | -1 | 0 | null): Fill[] {
  const out: Fill[] = []; let position = 0;
  for (let k = 0; k < bars.length; k++) {
    const want = wanted(k); if (want === null || want === position) continue;
    if (want === 0 && position === 0) continue;
    if (k + 1 < bars.length) out.push({ bar: k + 1, side: want > 0 || want === 0 && position < 0 ? 'buy' : 'sell', quantity: want === 0 ? 1 : position === 0 ? 1 : 2, price: bars[k + 1].open });
    position = want;
  }
  return out;
}
const fromSignals = (long: (k: number) => boolean, short: (k: number) => boolean) => (k: number) => { const a = long(k), b = short(k); return a && !b ? 1 : b && !a ? -1 : null; };
/** Stop and reverse: stop levels set at bar k's close work from bar k + 1; the bar's route (open, nearer extreme, other extreme, close) orders the hits. */
function stopFills(bars: readonly Bar[], levels: (k: number, position: number, hit: { long: boolean; short: boolean }) => { long: number | null; short: number | null }): Fill[] {
  const out: Fill[] = []; let position = 0, buy: number | null = null, sell: number | null = null;
  for (let k = 0; k < bars.length; k++) {
    const bar = bars[k], path = Math.abs(bar.open - bar.high) < Math.abs(bar.open - bar.low) ? [bar.open, bar.high, bar.low, bar.close] : [bar.open, bar.low, bar.high, bar.close];
    const when = (isBuy: boolean, level: number): [number, number] | null => {
      if (isBuy ? path[0] >= level : path[0] <= level) return [0, path[0]];
      for (let j = 1; j < 4; j++) { const a = path[j - 1], b = path[j]; if (isBuy ? b > a && level > a && level <= b : b < a && level < a && level >= b) return [j, level]; }
      return null;
    };
    const hits: { at: number; price: number; side: 1 | -1 }[] = [];
    if (buy !== null) { const hit = when(true, buy); if (hit) hits.push({ at: hit[0], price: hit[1], side: 1 }); }
    if (sell !== null) { const hit = when(false, sell); if (hit) hits.push({ at: hit[0], price: hit[1], side: -1 }); }
    hits.sort((a, b) => a.at - b.at);
    const seen = { long: false, short: false };
    for (const hit of hits) { out.push({ bar: k, side: hit.side > 0 ? 'buy' : 'sell', quantity: position === 0 ? 1 : 2, price: hit.price }); position = hit.side; if (hit.side > 0) { buy = null; seen.long = true; } else { sell = null; seen.short = true; } }
    const next = levels(k, position, seen);
    buy = position !== 1 && next.long !== null && next.long > 0 ? next.long : null;
    sell = position !== -1 && next.short !== null && next.short > 0 ? next.short : null;
  }
  return out;
}

const O = BARS.map(bar => bar.open), H = BARS.map(bar => bar.high), L = BARS.map(bar => bar.low), C = BARS.map(bar => bar.close);
const ORACLES: Record<string, () => Fill[]> = {
  'bar-up-down': () => marketFills(BARS, fromSignals(k => k > 0 && C[k] > O[k] && C[k] > H[k - 1], k => k > 0 && C[k] < O[k] && C[k] < L[k - 1])),
  'bollinger-bands': () => { const basis = sma(C, 20), deviation = populationStdev(C, 20), upper = basis.map((b, i) => b === null ? null : b + 2 * deviation[i]!), lower = basis.map((b, i) => b === null ? null : b - 2 * deviation[i]!); return marketFills(BARS, fromSignals(k => crossover(C, lower, k), k => crossunder(C, upper, k))); },
  'bollinger-bands-directed': () => ORACLES['bollinger-bands'](),
  'channel-breakout': () => { const hi = lag(highest(H, 20)), lo = lag(lowest(L, 20)); return marketFills(BARS, fromSignals(k => hi[k] !== null && C[k] > hi[k]!, k => lo[k] !== null && C[k] < lo[k]!)); },
  'consecutive-up-down': () => { const ups: number[] = [], downs: number[] = []; C.forEach((close, k) => { ups.push(k && close > C[k - 1] ? (ups[k - 1] ?? 0) + 1 : 0); downs.push(k && close < C[k - 1] ? (downs[k - 1] ?? 0) + 1 : 0); }); return marketFills(BARS, fromSignals(k => k > 0 && ups[k] >= 3, k => k > 0 && downs[k] >= 3)); },
  'greedy': () => marketFills(BARS, fromSignals(k => k > 0 && O[k] > H[k - 1] && C[k] > O[k], k => k > 0 && O[k] < L[k - 1] && C[k] < O[k])),
  'inside-bar': () => marketFills(BARS, fromSignals(k => k > 0 && H[k] < H[k - 1] && L[k] > L[k - 1] && C[k] > O[k], k => k > 0 && H[k] < H[k - 1] && L[k] > L[k - 1] && C[k] < O[k])),
  'keltner-channels': () => { const basis = emaSeeded(C, 20), width = emaSeeded(trueRange(BARS), 20), upper = basis.map((b, i) => b === null || width[i] === null ? null : b + 2 * width[i]!), lower = basis.map((b, i) => b === null || width[i] === null ? null : b - 2 * width[i]!); return marketFills(BARS, fromSignals(k => crossover(C, upper, k), k => crossunder(C, lower, k))); },
  'macd': () => { const fast = emaSeeded(C, 12), slow = emaSeeded(C, 26), line = difference(fast, slow), signal = emaSeeded(line, 9); return marketFills(BARS, fromSignals(k => crossover(line, signal, k), k => crossunder(line, signal, k))); },
  'momentum': () => { const mom = momentum(C, 12), zero = constant(BARS, 0); return marketFills(BARS, fromSignals(k => crossover(mom, zero, k), k => crossunder(mom, zero, k))); },
  'moving-average-crossover': () => { const average = sma(C, 9); return marketFills(BARS, fromSignals(k => crossover(C, average, k), k => crossunder(C, average, k))); },
  'outside-bar': () => marketFills(BARS, fromSignals(k => k > 0 && H[k] > H[k - 1] && L[k] < L[k - 1] && C[k] > O[k], k => k > 0 && H[k] > H[k - 1] && L[k] < L[k - 1] && C[k] < O[k])),
  'parabolic-sar': () => {
    // Wilder: start 0.02, step 0.02, cap 0.2; the first trend from the first two closes; a flip when the bar reaches the SAR.
    const flips: number[] = BARS.map(() => 0); let trend = 0, sar = 0, ep = 0, af = 0, next = 0;
    for (let k = 1; k < BARS.length; k++) {
      if (trend === 0) { trend = C[k] >= C[k - 1] ? 1 : -1; sar = trend > 0 ? Math.min(L[k], L[k - 1]) : Math.max(H[k], H[k - 1]); ep = trend > 0 ? Math.max(H[k], H[k - 1]) : Math.min(L[k], L[k - 1]); af = 0.02; }
      else if (trend > 0 ? L[k] <= next : H[k] >= next) { trend = -trend; sar = ep; ep = trend > 0 ? H[k] : L[k]; af = 0.02; flips[k] = trend; }
      else { sar = next; if (trend > 0 ? H[k] > ep : L[k] < ep) { ep = trend > 0 ? H[k] : L[k]; af = Math.min(af + 0.02, 0.2); } }
      const raw = sar + af * (ep - sar); next = trend > 0 ? Math.min(raw, L[k], L[k - 1]) : Math.max(raw, H[k], H[k - 1]);
    }
    return marketFills(BARS, k => flips[k] === 0 ? null : flips[k] as 1 | -1);
  },
  'pivot-extension': () => { const ph = pivot(H, 4, 2, true), pl = pivot(L, 4, 2, false); return marketFills(BARS, fromSignals(k => pl[k] !== null, k => ph[k] !== null)); },
  'pivot-reversal': () => { const ph = pivot(H, 4, 2, true), pl = pivot(L, 4, 2, false); let high: number | null = null, low: number | null = null; return stopFills(BARS, (k, _position, hit) => { if (hit.long) high = null; if (hit.short) low = null; if (ph[k] !== null) high = ph[k]; if (pl[k] !== null) low = pl[k]; return { long: high, short: low }; }); },
  'price-channel': () => { const hi = lag(highest(H, 20)), lo = lag(lowest(L, 20)), middle = hi.map((h, i) => h === null || lo[i] === null ? null : (h + lo[i]!) / 2); return marketFills(BARS, fromSignals(k => crossover(C, middle, k), k => crossunder(C, middle, k))); },
  'rob-booker-adx-breakout': () => { const strength = adx(BARS, 14, 14), hi = highest(H, 20), lo = lowest(L, 20); return stopFills(BARS, k => { const quiet = strength[k] !== null && strength[k]! < 18; return { long: quiet ? hi[k] : null, short: quiet ? lo[k] : null }; }); },
  'rsi': () => { const value = rsi(C, 14); return marketFills(BARS, fromSignals(k => crossover(value, constant(BARS, 30), k), k => crossunder(value, constant(BARS, 70), k))); },
  'stochastic-slow': () => { const k3 = sma(stochastic(BARS, 14), 3), d3 = sma(k3, 3); return marketFills(BARS, fromSignals(k => crossover(k3, d3, k) && k3[k]! < 20, k => crossunder(k3, d3, k) && k3[k]! > 80)); },
  'supertrend': () => {
    const atr = rma(trueRange(BARS), 10), wanted: (1 | -1 | null)[] = BARS.map(() => null); let upper: number | null = null, lower: number | null = null, trend = 0;
    for (let k = 0; k < BARS.length; k++) {
      if (atr[k] === null) continue;
      const middle = (H[k] + L[k]) / 2, basicUpper = middle + 3 * atr[k]!, basicLower = middle - 3 * atr[k]!;
      if (upper === null || lower === null) { upper = basicUpper; lower = basicLower; } else { upper = basicUpper < upper || C[k - 1] > upper ? basicUpper : upper; lower = basicLower > lower || C[k - 1] < lower ? basicLower : lower; }
      const next = C[k] > upper ? 1 : C[k] < lower ? -1 : trend;
      if (next !== trend && next !== 0) wanted[k] = next as 1 | -1;
      trend = next;
    }
    return marketFills(BARS, k => wanted[k]);
  },
  'technical-ratings': () => {
    const s20 = sma(C, 20), e50 = ema(C, 50), r = rsi(C, 14), fast = emaSeeded(C, 12), slow = emaSeeded(C, 26), line = difference(fast, slow), signal = emaSeeded(line, 9), mom = momentum(C, 10);
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length, vote = (a: number, b: number) => a > b ? 1 : a < b ? -1 : 0;
    const rating: Series = C.map((close, k) => {
      const votes = [s20[k], e50[k]].filter((v): v is number => v !== null).map(v => vote(close, v)), osc: number[] = [];
      if (r[k] !== null && k > 0 && r[k - 1] !== null) osc.push(r[k]! < 30 && r[k]! > r[k - 1]! ? 1 : r[k]! > 70 && r[k]! < r[k - 1]! ? -1 : 0);
      if (line[k] !== null && signal[k] !== null) osc.push(vote(line[k]!, signal[k]!));
      if (mom[k] !== null && k > 0 && mom[k - 1] !== null) osc.push(vote(mom[k]!, mom[k - 1]!));
      return votes.length && osc.length ? (mean(votes) + mean(osc)) / 2 : null;
    });
    return marketFills(BARS, fromSignals(k => k > 0 && rating[k] !== null && rating[k - 1] !== null && rating[k]! > 0.1 && rating[k - 1]! <= 0.1, k => k > 0 && rating[k] !== null && rating[k - 1] !== null && rating[k]! < -0.1 && rating[k - 1]! >= -0.1));
  },
  'two-moving-averages-crossover': () => { const fast = sma(C, 9), slow = sma(C, 21); return marketFills(BARS, fromSignals(k => crossover(fast, slow, k), k => crossunder(fast, slow, k))); },
  'volatility-expansion-close': () => { const range = sma(trueRange(BARS), 5); return marketFills(BARS, fromSignals(k => k > 0 && range[k] !== null && C[k] - C[k - 1] > 0.75 * range[k]!, k => k > 0 && range[k] !== null && C[k - 1] - C[k] > 0.75 * range[k]!)); },
};

describe(' built-in strategies: catalog', () => {
  it('lists the 23 strategy names in the reference order, each with an original source that compiles', () => {
    expect(BUILTIN_STRATEGIES.map(row => row.name)).toEqual(['Bar up/down strategy', 'Bollinger Bands strategy', 'Bollinger Bands strategy directed', 'Channel breakout strategy', 'Consecutive up/down strategy', 'Greedy strategy', 'Inside bar strategy', 'Keltner channels strategy', 'MACD strategy', 'Momentum strategy', 'Moving average crossover', 'Outside bar strategy', 'Parabolic SAR strategy', 'Pivot extension strategy', 'Pivot reversal strategy', 'Price channel strategy', 'Rob Booker - ADX Breakout', 'RSI strategy', 'Stochastic slow strategy', 'Supertrend strategy', 'Technical ratings strategy', 'Two moving averages crossover', 'Volatility expansion-close strategy']);
    for (const row of BUILTIN_STRATEGIES) {
      expect(row.basis).toBe('LV-DEFINED'); expect(row.rule.length, row.id).toBeGreaterThan(20);
      expect(compileLVScript(row.source).ok, row.id).toBe(true);
      expect(row.source, row.id).toContain('original CandleScript, not Pine Script');
      expect(row.source, row.id).not.toMatch(/strategy\.(entry|exit|close)|\/\/@version|study\(/);
    }
    expect(Object.keys(ORACLES).sort()).toEqual(BUILTIN_STRATEGIES.map(row => row.id).sort());
    expect(BUILTIN_STRATEGY_SELECTOR_ROWS[0]).toEqual({ id: 'builtin-strategy:bar-up-down', name: 'Bar up/down strategy' });
    expect(() => builtinStrategy('nope')).toThrow('Unknown built-in strategy.');
  });
  it('a built-in becomes a saved strategy document, found again by name and saved source', () => {
    const doc = builtinStrategyDocument('rsi');
    expect(doc).toMatchObject({ name: 'RSI strategy', kind: 'strategy', pane: 'price' });
    const saved = { id: 'd1', ...doc, history: [{ version: 1, savedAt: '2026-10-23T00:00:00Z', name: doc.name, source: doc.source, pane: 'price' }] };
    expect(findBuiltinStrategyDocument([saved], 'rsi')).toBe(saved);
    expect(findBuiltinStrategyDocument([{ ...saved, source: saved.source + ' ' }], 'rsi')).toBeNull();
    expect(findBuiltinStrategyDocument([{ ...saved, history: [] }], 'rsi')).toBeNull();
  });
  it('adding a built-in saves one strategy document, binds it, and binds the same document again on a second add', () => {
    let counter = 0; const makeId = () => 'synthetic-id-' + ++counter;
    const library = createScriptLibrary({ id: 'first', name: 'SMA and close', source: '({ onBar(ctx) {} })', pane: 'price' });
    const first = addBuiltinStrategyBinding(library, [], 'builtin-strategy:macd', makeId, '2026-10-23T00:00:00.000Z');
    expect(first.name).toBe('MACD strategy'); expect(first.library.documents).toHaveLength(2);
    const doc = first.library.documents[1];
    expect(doc).toMatchObject({ id: 'synthetic-id-1', name: 'MACD strategy', kind: 'strategy', source: builtinStrategy('macd').source });
    expect(first.bindings).toHaveLength(1); expect(first.binding).toMatchObject({ id: 'synthetic-id-2', documentId: 'synthetic-id-1', version: 1, source: doc.source });
    const second = addBuiltinStrategyBinding(first.library, first.bindings, 'macd', makeId, '2026-10-23T00:00:01.000Z');
    expect(second.library.documents).toHaveLength(2); expect(second.bindings.map(row => row.documentId)).toEqual(['synthetic-id-1', 'synthetic-id-1']);
    expect(() => addBuiltinStrategyBinding(library, [], 'builtin-strategy:unknown', makeId, '2026-10-23T00:00:00.000Z')).toThrow('Unknown built-in strategy.');
  });
});

describe(' built-in strategies: oracle fills on SYNTHETIC bars', () => {
  for (const row of BUILTIN_STRATEGIES) {
    it(row.name, async () => {
      const { fills } = await engineFills(row.id);
      expectFills(fills, ORACLES[row.id]());
    });
  }
  it('Bollinger Bands strategy directed: long only closes the long on a short signal instead of reversing', async () => {
    const basis = sma(C, 20), deviation = populationStdev(C, 20), upper = basis.map((b, i) => b === null ? null : b + 2 * deviation[i]!), lower = basis.map((b, i) => b === null ? null : b - 2 * deviation[i]!);
    const longOnly = marketFills(BARS, k => crossover(C, lower, k) ? 1 : crossunder(C, upper, k) ? 0 : null);
    expectFills((await engineFills('bollinger-bands-directed', BARS, { direction: 'Long only' })).fills, longOnly);
    expect(longOnly.every(fill => fill.quantity === 1)).toBe(true);
    const shortOnly = marketFills(BARS, k => crossunder(C, upper, k) ? -1 : crossover(C, lower, k) ? 0 : null);
    expectFills((await engineFills('bollinger-bands-directed', BARS, { direction: 'Short only' })).fills, shortOnly);
  });
  it('inputs change the rule: RSI 7 with 60 and 40 levels', async () => {
    const value = rsi(C, 7);
    expectFills((await engineFills('rsi', BARS, { length: 7, overbought: 60, oversold: 40 })).fills, marketFills(BARS, fromSignals(k => crossover(value, constant(BARS, 40), k), k => crossunder(value, constant(BARS, 60), k))));
  });
  it('runs within the worker limits on 5,000 bars (output and compute)', async () => {
    const long = syntheticBars(5000, 11);
    for (const id of ['moving-average-crossover', 'technical-ratings', 'pivot-reversal', 'stochastic-slow']) {
      const { result } = await engineFills(id, long);
      expect(result.trades.length, id).toBeGreaterThan(10);
    }
  }, 120000);
  it('reversal trades alternate direction and each closes the prior position at the reversal fill', async () => {
    const { result } = await engineFills('macd');
    for (let i = 1; i < result.trades.length; i++) {
      expect(result.trades[i].direction).not.toBe(result.trades[i - 1].direction);
      expect(result.trades[i].entryBar).toBe(result.trades[i - 1].exitBar);
    }
    expect(result.orders.filter(order => order.status === 'rejected')).toEqual([]);
  });
});
