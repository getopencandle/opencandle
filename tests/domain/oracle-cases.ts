/** Independently specified examples. Expected values are literals, never computed by LV functions.
 * Decimal arithmetic checked with Python decimal precision=40 on 2026-10-14.
 * EMA first-value seed, BB population variance and OBV zero seed are explicit LV policies,
 * with reference-initialization comparison still outstanding.
 */
export const ORACLES = {
  volume: { values: [10, 20, 30], ma2: [null, 15, 25] },
  sma: { values: [1, 2, 3, 4, 5], length: 3, expected: [null, null, 2, 3, 4] },
  ema: { values: [1, 2, 3, 4, 5], length: 3, expected: [1, 1.5, 2.25, 3.125, 4.0625] },
  rsi: { values: [10, 11, 12, 11, 13, 12], length: 3, expected: [null, null, null, 66.66666666666667, 83.33333333333333, 60.60606060606061] },
  macd: {
    values: [1, 2, 3, 4, 5], fast: 2, slow: 3, signal: 2,
    // the reference app's MACD EMAs are SMA-seeded (ARM 1D: MACD line first on bar 25, signal on bar 33), so the
    // hand oracle is: EMA2 = 1.5, 2.5, 3.5, 4.5 from bar 1; EMA3 = 2, 3, 4 from bar 2; line 0.5 from bar 2; signal EMA2 of the
    // line seeded by its first two values = 0.5 from bar 3. (Was the first-value seed: line 0, 0.1667, 0.3056, ...)
    line: [null, null, 0.5, 0.5, 0.5],
    signalLine: [null, null, null, 0.5, 0.5],
    histogram: [null, null, null, 0, 0],
  },
  bb: { values: [1, 2, 3], length: 3, multiplier: 2, basis: 2, upper: 3.632993161855452, lower: 0.3670068381445479 },
  vwap: { prices: [10, 20, 30, 40], volumes: [1, 2, 1, 2], sessions: ['a', 'a', 'a', 'b'], expected: [10, 16.666666666666668, 20, 40] },
  stochastic: { high: [3, 4, 5, 7], low: [1, 2, 3, 4], close: [2, 3, 4, 6], length: 3, smoothK: 1, smoothD: 2, k: [null, null, 75, 80], d: [null, null, null, 77.5] },
  atr: { high: [11, 13, 12, 15], low: [9, 10, 8, 9], close: [10, 12, 9, 14], length: 3, trueRange: [2, 3, 4, 6], expected: [null, null, 3, 4] },
  obv: { close: [10, 11, 11, 9, 12], volume: [100, 150, 200, 50, 75], expected: [0, 150, 150, 100, 175] },
  paper: { initialCash: 1000, buyQuantity: 10, buyPrice: 10.02, fee: 1, cashAfterBuy: 898.8, equityAtBid998: 998.6, partialSellQuantity: 4, partialSellPrice: 11.98, cashAfterPartial: 945.72, finalSellQuantity: 6, finalSellPrice: 9.98, finalCash: 1004.6, totalFees: 3, netProfit: 4.6 },
} as const;

export const NUMERIC_TOLERANCE = 1e-10;
