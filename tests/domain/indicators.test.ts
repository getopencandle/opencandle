import { describe, expect, it } from 'vitest';
import { atr, bollingerBands, calculateIndicator, ema, macd, movingAverage, obv, rma, rsi, sma, sourceValues, standardDeviation, stochastic, trueRange, vwap } from '../../src/domain/indicators';
import { makeFixture } from '../../src/domain/fixtures';
import type { Bar } from '../../src/domain/types';
import { NUMERIC_TOLERANCE, ORACLES } from './oracle-cases';

function equalSeries(actual: readonly (number | null)[], expected: readonly (number | null)[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expected[i] === null ? expect(value).toBeNull() : expect(Math.abs((value as number) - (expected[i] as number))).toBeLessThanOrEqual(NUMERIC_TOLERANCE));
}
function bars(close: readonly number[], high = close, low = close, volumes: readonly number[] = close.map(() => 1)): Bar[] {
  return close.map((value, i) => ({ time: i * 86400, open: value, high: high[i], low: low[i], close: value, volume: volumes[i] }));
}

describe('independent literal numerical oracles', () => {
  it('calculates volume and volume SMA', () => {
    const result = calculateIndicator('volume', bars([1, 1, 1], undefined, undefined, ORACLES.volume.values), { length: 2 });
    equalSeries(result.series[0].values, ORACLES.volume.values);
    equalSeries(result.series[1].values, ORACLES.volume.ma2);
  });
  it('calculates SMA with full-window warmup', () => equalSeries(sma(ORACLES.sma.values, 3), ORACLES.sma.expected));
  it('calculates EMA with the declared first-value seed', () => equalSeries(ema(ORACLES.ema.values, 3), ORACLES.ema.expected));
  it('calculates Wilder RSI from explicit gains and losses', () => equalSeries(rsi(ORACLES.rsi.values, 3), ORACLES.rsi.expected));
  it('calculates all three MACD series', () => {
    const result = macd(ORACLES.macd.values, 2, 3, 2);
    equalSeries(result.line, ORACLES.macd.line);
    equalSeries(result.signal, ORACLES.macd.signalLine);
    equalSeries(result.histogram, ORACLES.macd.histogram);
  });
  it('calculates Bollinger bands using population variance', () => {
    const result = bollingerBands(ORACLES.bb.values, 3, 2);
    equalSeries(result.basis, [null, null, ORACLES.bb.basis]);
    equalSeries(result.upper, [null, null, ORACLES.bb.upper]);
    equalSeries(result.lower, [null, null, ORACLES.bb.lower]);
  });
  it('resets VWAP on explicit session keys', () => {
    const o = ORACLES.vwap;
    equalSeries(vwap(bars(o.prices, undefined, undefined, o.volumes), o.sessions, 'close'), o.expected);
  });
  it('calculates stochastic K and D independently', () => {
    const o = ORACLES.stochastic;
    const result = stochastic(bars(o.close, o.high, o.low), 3, 1, 2);
    equalSeries(result.k, o.k); equalSeries(result.d, o.d);
  });
  it('includes overnight gaps in ATR and seeds Wilder averaging', () => {
    const o = ORACLES.atr, input = bars(o.close, o.high, o.low);
    equalSeries(trueRange(input), o.trueRange); equalSeries(atr(input, 3), o.expected);
    equalSeries(trueRange(bars([10, 20], [11, 21], [9, 19])), [2, 11]);
  });
  it('treats unchanged OBV closes as zero contribution', () => {
    const o = ORACLES.obv;
    equalSeries(obv(bars(o.close, undefined, undefined, o.volume)), o.expected);
  });
  // Integration-pass fix L1-20261016-fix-obv. Literal hand-computed values. A bar whose close or volume is
  // missing has unavailable OBV (null, never a carried total or zero). LV resume rule: the next valid bar applies the
  // reference rule (close above/below/equal the prior close adds/subtracts/keeps the volume) with
  // "Previous OBV" and "Prior Closing Price" both taken from the most recent valid bar. The help article states no
  // starting value and no missing-data rule; the zero seed on the first valid bar is the existing LV policy.
  it('keeps a missing-close or missing-volume bar unavailable and resumes from the last valid total and close', () => {
    // 0; 11>10 +150 = 150; NaN close -> null; 12>11 (last valid close) 150+50 = 200; 9<12 200-75 = 125.
    expect(obv(bars([10, 11, NaN, 12, 9], undefined, undefined, [100, 150, 200, 50, 75]))).toEqual([0, 150, null, 200, 125]);
    // 0; +150 = 150; NaN volume -> null; 13>11 150+50 = 200.
    expect(obv(bars([10, 11, 12, 13], undefined, undefined, [100, 150, NaN, 50]))).toEqual([0, 150, null, 200]);
    // Infinite and negative volume are unavailable too; 12>10 0+30 = 30.
    expect(obv(bars([10, 11, 12], undefined, undefined, [100, -1, 30]))).toEqual([0, null, 30]);
    expect(obv(bars([10, 11, 12], undefined, undefined, [100, Infinity, 30]))).toEqual([0, null, 30]);
    // Leading gap: no valid total yet, so the first valid bar is the zero seed; 9<10 0-20 = -20.
    expect(obv(bars([NaN, 10, 9], undefined, undefined, [5, 100, 20]))).toEqual([null, 0, -20]);
    // Two missing closes; 10 equals the last valid close 10 so the total stays 0; 11>10 0+5 = 5.
    expect(obv(bars([10, NaN, NaN, 10, 11], undefined, undefined, [1, 2, 3, 4, 5]))).toEqual([0, null, null, 0, 5]);
    // Trailing gap leaves the latest value unavailable; an all-missing series has no value at all.
    expect(obv(bars([10, 11, NaN], undefined, undefined, [1, 2, 3]))).toEqual([0, 2, null]);
    expect(obv(bars([NaN], undefined, undefined, [1]))).toEqual([null]);
    // The same separation reaches the calculated plot (volume is valid, so OBV is not refused).
    expect(calculateIndicator('obv', bars([10, 11, NaN, 12, 9], undefined, undefined, [100, 150, 200, 50, 75])).series[0].values).toEqual([0, 150, null, 200, 125]);
  });
});

describe('indicator input, information timing and failure contracts', () => {
  it('supports seven documented OHLC source choices', () => {
    const input = [{ time: 0, open: 2, high: 8, low: 1, close: 5, volume: 1 }];
    for (const [key, value] of Object.entries({ open: 2, high: 8, low: 1, close: 5, hl2: 4.5, hlc3: 14 / 3, ohlc4: 4 })) equalSeries(sourceValues(input, key as Parameters<typeof sourceValues>[1]), [value]);
  });
  it('uses missing observations as gaps, never zeros', () => {
    equalSeries(sma([1, null, 3, 4, 5], 3), [null, null, null, null, 4]);
    equalSeries(ema([1, null, 3], 3), [1, null, 2]);
    equalSeries(rma([1, null, 3, 5], 2), [null, null, 2, 3.5]);
  });
  it('reports unavailable ratios for flat or zero-volume inputs', () => {
    equalSeries(rsi([1, 1, 1, 1], 2), [null, null, null, null]);
    equalSeries(stochastic(bars([1, 1, 1]), 2, 1, 1).k, [null, null, null]);
    equalSeries(vwap(bars([1, 2, 3], undefined, undefined, [0, 0, 1])), [null, null, 3]);
  });
  it('bounds RSI and stochastic without clamping legitimate values', () => {
    const input = makeFixture('BOUNDARY', 400);
    const output = [...rsi(input.map(b => b.close)), ...stochastic(input).k, ...stochastic(input).d];
    for (const value of output) if (value !== null) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100); }
    equalSeries(rsi([1, 2, 3, 4], 2), [null, null, 100, 100]);
    equalSeries(rsi([4, 3, 2, 1], 2), [null, null, 0, 0]);
  });
  it('keeps small price variance stable at a large price origin', () => equalSeries(standardDeviation([1000000000001, 1000000000002, 1000000000003], 3), [null, null, 0.816496580927726]));
  it('supports alternate smoothing types with independent values', () => {
    equalSeries(movingAverage([1, 2, 3], 3, 'WMA'), [null, null, 14 / 6]);
    equalSeries(movingAverage([10, 20, 30], 3, 'VWMA', [1, 2, 1]), [null, null, 20]);
    equalSeries(movingAverage([1, 2, 3, 4], 3, 'RMA'), [null, null, 2, 8 / 3]);
  });
  it('has no future-data leakage for any built-in calculation', () => {
    const input = makeFixture('PREFIX', 120);
    for (const id of ['volume', 'sma', 'ema', 'rsi', 'macd', 'bb', 'vwap', 'stochastic', 'atr', 'obv']) {
      const prefix = calculateIndicator(id, input.slice(0, 70)), full = calculateIndicator(id, input);
      expect(prefix.diagnostics).toEqual([]);
      for (let i = 0; i < prefix.series.length; i++) equalSeries(prefix.series[i].values, full.series[i].values.slice(0, 70));
    }
  });
  it('does not alter numerical signals when display offset changes', () => {
    const input = makeFixture('OFFSET', 50);
    for (const id of ['sma', 'ema', 'bb']) expect(calculateIndicator(id, input, { offset: 3 }).series).toEqual(calculateIndicator(id, input, { offset: -5 }).series);
  });
  it('rejects unsupported data-dependent anchors and invalid lengths', () => {
    const input = makeFixture('ERROR', 10);
    for (const length of [0, -1, 1.2, NaN, Infinity, '5']) {
      const result = calculateIndicator('sma', input, { length });
      expect(result.series).toEqual([]); expect(result.diagnostics).toHaveLength(1);
    }
    expect(calculateIndicator('vwap', input, { anchor: 'Earnings' }).diagnostics[0]).toContain('needs earnings dates');// User-facing Earnings anchor copy
    expect(calculateIndicator('rsi', input, { source: 'future' }).diagnostics[0]).toContain('Unsupported source');
    expect(() => vwap(input, ['one'])).toThrow('Anchor keys');
  });
  it('returns independent instance state and does not mutate bars', () => {
    const input = makeFixture('ISOLATION', 50), copy = structuredClone(input);
    const first = calculateIndicator('ema', input, { length: 3 });
    calculateIndicator('ema', input, { length: 19 });
    expect(calculateIndicator('ema', input, { length: 3 })).toEqual(first);
    expect(input).toEqual(copy);
  });
});
