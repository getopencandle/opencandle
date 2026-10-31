// RPST strategy lane: order sizing, exit brackets, Bar Magnifier and recalculate-after-fill in the local engine.
import { describe, expect, it } from 'vitest';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG, MAX_FILL_RECALCULATIONS_PER_BAR, validateStrategyConfig, type StrategyFillContext } from '../../src/domain/strategy';
import type { Bar } from '../../src/domain/types';

const DAY = 86400, T0 = Date.UTC(2024, 0, 2) / 1000;
function bars(rows: Array<[number, number, number, number]>, start = T0, step = DAY): Bar[] { return rows.map(([open, high, low, close], index) => ({ time: start + index * step, open, high, low, close, volume: 1000 })); }
const flat = bars([[30, 31, 29, 30], [30, 31, 29, 30], [30, 31, 29, 30]]);

describe('RPST order size: contracts, cash and percent of equity (STRATEGY.CONFIG.SIZE_FIXED/SIZE_CASH/SIZE_PERCENT)', () => {
  it('cash allocation divides by the signal-bar close and rounds down to the lot size', () => {
    const result = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, defaultQuantity: { kind: 'cash', value: 1000 } } });
    expect(result.ok).toBe(true); expect(result.fills[0]).toMatchObject({ quantity: 33, price: 30, barIndex: 1 });
    expect(result.orders[0].reason).toContain('Size from the signal bar: 1000 / 30 (signal close)');
  });
  it('the signal close, not the slippage-adjusted fill price, is the divisor; lot size 10 rounds down', () => {
    const result = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, slippageTicks: 1, lotSize: 10, defaultQuantity: { kind: 'cash', value: 1000 } } });
    expect(result.fills[0]).toMatchObject({ quantity: 30, price: 30.01 }); // floor(1000 / 30 / 10) x 10; the fill keeps its slippage
    const single = backtestStrategy({ bars: bars([[30, 31, 24, 25], [30, 31, 29, 30]]), signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, slippageTicks: 1, defaultQuantity: { kind: 'cash', value: 1000 } } });
    expect(single.fills[0]).toMatchObject({ quantity: 40, price: 30.01 }); // 1000 / 25 (signal close); the fill-price rule gave 33
  });
  it('percent of equity uses the strategy equity and close at the signal bar', () => {
    const rows = bars([[30, 31, 29, 30], [30, 41, 29, 40], [40, 41, 39, 40], [40, 41, 39, 40]]);
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }, { barIndex: 1, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, pyramiding: 2, defaultQuantity: { kind: 'percent-of-equity', value: 25 } } });
    expect(result.fills.map(fill => fill.quantity)).toEqual([83, 67]); // 2500 / 30 = 83.3; then at bar 1 close cash 7510 + 83 x 40 = 10830 equity, 2707.5 / 40 = 67.7
  });
  it('reference-FACTS Q1: a gap open sizes from the signal close, unlike fill-price sizing', () => {
    // Signal bar closes at 40; the next bar gaps down to open at 20. Fill-price sizing would buy 2500 / 20 = 125.
    const gap = bars([[40, 41, 39, 40], [20, 21, 19, 20], [20, 21, 19, 20]]);
    const cash = backtestStrategy({ bars: gap, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, defaultQuantity: { kind: 'cash', value: 2500 } } });
    expect(cash.fills[0]).toMatchObject({ quantity: 62, price: 20, barIndex: 1 }); // floor(2500 / 40)
    // Percent of equity: equity is read at the signal bar too. Hold 100 units (cash 6000 at 40), equity at the bar 1 close of 20 is 8000.
    const held = bars([[40, 41, 39, 40], [40, 41, 19, 20], [50, 51, 49, 50], [50, 51, 49, 50]]);
    const percent = backtestStrategy({ bars: held, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 100 }] }, { barIndex: 1, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, pyramiding: 2, defaultQuantity: { kind: 'percent-of-equity', value: 25 } } });
    expect(percent.fills.map(fill => [fill.quantity, fill.price])).toEqual([[100, 40], [100, 50]]); // 25% of 8000 = 2000 / 20; fill-price sizing gave 2750 / 50 = 55
  });
  it('reference-FACTS Q1: with process_orders_on_close the sizing price equals the fill price', () => {
    const rows = bars([[30, 33, 29, 32], [30, 41, 29, 37], [40, 41, 39, 40]]);
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }, { barIndex: 1, orders: [{ action: 'buy' }] }], config: { initialCapital: 10000, pyramiding: 2, processOrdersOnClose: true, defaultQuantity: { kind: 'percent-of-equity', value: 25 } } });
    expect(result.fills.map(fill => [fill.barIndex, fill.price, fill.quantity])).toEqual([[0, 32, 78], [1, 37, 70]]); // 2500 / 32; (7504 + 78 x 37 = 10390) x 25% / 37
    for (const order of result.orders) expect(order.reason).toContain(`/ ${order.fillPrice} (signal close)`);
  });
  it('an allocation below one lot is rejected; explicit quantities and contracts keep the existing contract', () => {
    const small = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }], config: { defaultQuantity: { kind: 'cash', value: 10 } } });
    expect(small.orders[0].status).toBe('rejected'); expect(small.orders[0].reason).toContain('less than one lot'); expect(small.fills).toHaveLength(0);
    const contracts = backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy' }, { action: 'buy', quantity: 2 }] }], config: { pyramiding: 2, defaultQuantity: { kind: 'contracts', value: 5 } } });
    expect(contracts.fills.map(fill => fill.quantity)).toEqual([5, 2]);
    expect(backtestStrategy({ bars: flat, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }] }).orders[0].status).toBe('rejected');
  });
  it('validation names invalid sizes', () => {
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, defaultQuantity: { kind: 'percent-of-equity', value: 150 } }).join(' ')).toContain('at most 100');
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, defaultQuantity: { kind: 'cash', value: -1 } }).join(' ')).toContain('positive value');
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, lotSize: 10, defaultQuantity: { kind: 'contracts', value: 15 } }).join(' ')).toContain('lot size');
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, defaultQuantity: { kind: 'cash', value: 500 } })).toEqual([]);
  });
});

describe('RPST exit brackets (STRATEGY.ORDER.EXIT)', () => {
  const rows = bars([[100, 101, 99, 100], [100, 101, 99, 100], [100, 111, 99, 105], [105, 106, 104, 105], [105, 106, 104, 105]]);
  it('take profit fills and cancels its stop loss (one-cancels-all)', () => {
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'tp', profitPrice: 110, lossPrice: 95 }] }] });
    expect(result.ok).toBe(true);
    const profit = result.orders.find(order => order.id === 'tp:profit')!, loss = result.orders.find(order => order.id === 'tp:loss')!;
    expect(profit).toMatchObject({ status: 'filled', fillBar: 2, fillPrice: 110, reduceOnly: true }); expect(loss).toMatchObject({ status: 'cancelled', reason: 'One-cancels-all: the take profit of Exit tp filled.' });
    expect(result.trades).toHaveLength(1); expect(result.trades[0]).toMatchObject({ exitOrderId: 'tp:profit', netProfit: 100 });
  });
  it('partial exits reserve quantity; over-reservation is refused with the reserved amount', () => {
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'a', quantity: 4, profitPrice: 110 }, { action: 'exit', id: 'b', quantity: 7, lossPrice: 95 }, { action: 'exit', id: 'c', quantity: 6, lossPrice: 95 }] }] });
    expect(result.diagnostics.join(' ')).toContain('exit b quantity 7 exceeds the unreserved position 6');
    expect(result.orders.map(order => order.id)).toEqual(['strategy-order-1', 'a:profit', 'c:loss']);
    expect(result.orders.find(order => order.id === 'a:profit')).toMatchObject({ status: 'filled', quantity: 4 });
    expect(result.orders.find(order => order.id === 'c:loss')).toMatchObject({ status: 'working' });
    expect(result.equity.at(-1)!.position).toBe(6);
  });
  it('closing the position cancels remaining brackets; exits without a position or prices are refused', () => {
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 10 }, { action: 'exit', id: 'early', lossPrice: 90 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'x', lossPrice: 90 }, { action: 'exit', id: 'y' }] }, { barIndex: 2, orders: [{ action: 'close' }] }] });
    expect(result.diagnostics.join(' ')).toContain('exit early has no open position'); expect(result.diagnostics.join(' ')).toContain('exit y needs a profit or loss price');
    expect(result.orders.find(order => order.id === 'x:loss')).toMatchObject({ status: 'cancelled', reason: 'Position closed; exit bracket cancelled.' });
  });
});

describe('RPST Bar Magnifier (STRATEGY.CONFIG.MAGNIFIER)', () => {
  const chart = bars([[100, 101, 99, 100], [100, 101, 99, 100], [100, 110, 90, 105], [105, 106, 104, 105]]);
  const lower: Bar[] = [
    { time: chart[0].time, open: 100, high: 101, low: 99, close: 100, volume: 1 }, { time: chart[1].time, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { time: chart[2].time, open: 100, high: 110, low: 99, close: 109, volume: 1 }, { time: chart[2].time + 43200, open: 109, high: 109, low: 90, close: 105, volume: 1 },
    { time: chart[3].time, open: 105, high: 106, low: 104, close: 105, volume: 1 },
  ];
  const signals = [{ barIndex: 0, orders: [{ action: 'buy' as const, quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'exit' as const, id: 'e', profitPrice: 108, lossPrice: 95 }] }];
  it('actual lower-timeframe bars change the intrabar order: the target fills before the stop', () => {
    const route = backtestStrategy({ bars: chart, signals });
    expect(route.orders.find(order => order.id === 'e:loss')).toMatchObject({ status: 'filled', fillBar: 2, fillPrice: 95 }); // equidistant open: low first
    const magnified = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true }, magnifierBars: lower });
    expect(magnified.ok).toBe(true);
    expect(magnified.orders.find(order => order.id === 'e:profit')).toMatchObject({ status: 'filled', fillBar: 2, fillPrice: 108 });
    expect(magnified.orders.find(order => order.id === 'e:loss')).toMatchObject({ status: 'cancelled' });
    expect(magnified.policies.join(' ')).toContain('Bar Magnifier routes each execution bar');
  });
  it('missing or inconsistent lower-timeframe data is refused, never manufactured', () => {
    const missing = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true } });
    expect(missing.ok).toBe(false); expect(missing.diagnostics.join(' ')).toContain('never manufactured');
    const gap = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true }, magnifierBars: lower.filter((_, index) => index !== 4) });
    expect(gap.ok).toBe(false); expect(gap.diagnostics.join(' ')).toContain('no lower-timeframe data for execution bar 3');
    const wrong = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true }, magnifierBars: lower.map((row, index) => index === 3 ? { ...row, low: 91 } : row) });
    expect(wrong.ok).toBe(false); expect(wrong.diagnostics.join(' ')).toContain('does not reproduce execution bar 2');
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, barMagnifier: true }, { magnifier: true })).toEqual([]);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, barMagnifier: true }).join(' ')).toMatch(/Bar Magnifier/);
  });
});

describe('RPST recalculate after order fills (STRATEGY.CONFIG.AFTER_FILL) and every tick (STRATEGY.CONFIG.EVERY_TICK)', () => {
  const rows = bars([[100, 101, 99, 100], [100, 105, 99, 104], [104, 105, 103, 104]]);
  it('a same-bar decision fills at the next route point and sees no future OHLC', () => {
    const seen: StrategyFillContext[] = [];
    const result = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }], config: { calcOnOrderFills: true }, onFill: context => { seen.push(context); return context.position > 0 ? [{ action: 'close' }] : []; } });
    expect(result.ok).toBe(true);
    expect(result.trades[0]).toMatchObject({ entryBar: 1, exitBar: 1, entryPrice: 100, exitPrice: 99 }); // route 100 -> 99 -> 105 -> 104; exit at the next point
    expect(seen[0].completedBars).toHaveLength(1); expect(seen[0].currentBar).toEqual({ time: rows[1].time, open: 100, high: 100, low: 100, price: 100 });
    expect(seen[1].currentBar).toMatchObject({ high: 100, low: 99, price: 99 }); expect(seen).toHaveLength(2);
    expect(result.policies.join(' ')).toContain('only up to the fill price');
  });
  it('recalculation is bounded per bar and requires a callback', () => {
    const loop = backtestStrategy({ bars: rows, signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }], config: { calcOnOrderFills: true, pyramiding: 100000 }, onFill: context => context.fill.orderId === 'strategy-order-1' ? Array.from({ length: 150 }, () => ({ action: 'buy' as const, quantity: 1 })) : [] });
    expect(loop.diagnostics.join(' ')).toContain(`more than ${MAX_FILL_RECALCULATIONS_PER_BAR} recalculations`);
    expect(backtestStrategy({ bars: rows, signals: [], config: { calcOnOrderFills: true } }).ok).toBe(false);
  });
  it('every-tick recalculation stays unavailable with its reason (no realtime ticks reach the local engine)', () => {
    const result = backtestStrategy({ bars: rows, signals: [], config: { calcOnEveryTick: true } });
    expect(result.ok).toBe(false); expect(result.diagnostics.join(' ')).toContain('historical bars calculate once per bar');
  });
});
