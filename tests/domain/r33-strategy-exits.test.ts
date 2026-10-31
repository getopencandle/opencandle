// Exits in ticks and prices, trailing stops, named entries, one-cancels-all groups, Bar Magnifier
// coverage and recalculation modes in the local engine. All bars are SYNTHETIC.
import { describe, expect, it } from 'vitest';
import { backtestStrategy, magnifierGroups, STRATEGY_EVERY_TICK_POLICIES, validateStrategyConfig, DEFAULT_STRATEGY_CONFIG, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { scriptOrdersToSignals } from '../../src/domain/strategy-script-orders';
import type { Bar } from '../../src/domain/types';

const DAY = 86400, T0 = Date.UTC(2024, 0, 2) / 1000;
const bars = (rows: Array<[number, number, number, number]>, start = T0, step = DAY): Bar[] => rows.map(([open, high, low, close], index) => ({ time: start + index * step, open, high, low, close, volume: 1000 }));
const ids = (rows: readonly Bar[]) => rows.map((_, index) => 'synthetic:' + index);
const order = (result: ReturnType<typeof backtestStrategy>, id: string) => result.orders.find(row => row.id === id)!;
const tick = { tickSize: 0.5 };

describe(' exits: ticks, prices, named entries (STRATEGY.ORDER.EXIT)', () => {
  const rows = bars([[100, 101, 99, 100], [100, 101, 99, 100], [100, 106, 99.5, 104], [104, 105, 103, 104]]);
  it('profit and loss in ticks count from the named entry fill and wait for that entry to fill', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 'e1', name: 'Long', action: 'buy', quantity: 2 }, { id: 'x1', action: 'exit', name: 'Bracket', fromEntry: 'Long', profitTicks: 10, lossTicks: 4 }] }];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    expect(result.ok).toBe(true); expect(result.diagnostics).toEqual([]);
    // Entry fills at the bar 1 open (100); the exit arms there: profit 100 + 10 x 0.5 = 105, loss 100 - 4 x 0.5 = 98.
    expect(order(result, 'x1:profit')).toMatchObject({ type: 'limit', limitPrice: 105, quantity: 2, status: 'filled', fillBar: 2, fillPrice: 105, label: 'Exit Bracket take profit' });
    expect(order(result, 'x1:loss')).toMatchObject({ type: 'stop', stopPrice: 98, status: 'cancelled' });
    expect(order(result, 'e1').label).toBe('Long');
    expect(result.trades).toEqual([expect.objectContaining({ entryOrderId: 'e1', exitOrderId: 'x1:profit', entryPrice: 100, exitPrice: 105, grossProfit: 10 })]);
    expect(order(result, 'x1:profit').reason).toContain('Protects Long');
  });
  it('an armed exit can fill later on the entry bar, never at the entry fill price', () => {
    // Bar 1 route: open 100, high 101 (nearer), low 97, close 100. The stop 98 arms at the 100 open fill and fills on the way down.
    const path = bars([[100, 100.5, 99.5, 100], [100, 101, 97, 100], [100, 100.5, 99.5, 100]]);
    const result = backtestStrategy({ bars: path, signals: [{ barIndex: 0, orders: [{ id: 'e', name: 'L', action: 'buy', quantity: 1 }, { id: 'x', action: 'exit', name: 'S', fromEntry: 'L', lossTicks: 4 }] }], config: tick });
    expect(order(result, 'x:loss')).toMatchObject({ status: 'filled', fillBar: 1, fillPrice: 98 });
    expect(result.trades[0]).toMatchObject({ entryBar: 1, exitBar: 1, netProfit: -2 });
  });
  it('without a named entry the ticks count from the average open price; a percent exits part of the position', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ action: 'buy', quantity: 4 }] }, { barIndex: 1, orders: [{ id: 'p', action: 'exit', name: 'Half', quantityPercent: 50, profitTicks: 8 }] }];
    const result = backtestStrategy({ bars: rows, signals, config: { ...tick, lotSize: 1 } });
    expect(order(result, 'p:profit')).toMatchObject({ quantity: 2, limitPrice: 104, status: 'filled', fillBar: 2 });
    expect(result.equity.at(-1)!.position).toBe(2);
  });
  it('refuses conflicting or incomplete specifications with reasons', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [
      { id: 'a', action: 'exit', name: 'A', profitTicks: 4, profitPrice: 103 },
      { id: 'b', action: 'exit', name: 'B', trailTicks: 4 },
      { id: 'c', action: 'exit', name: 'C' },
      { id: 'd', action: 'exit', name: 'D', fromEntry: 'missing', lossTicks: 2 },
      { id: 'e', action: 'exit', name: 'E', lossTicks: 1000 },
    ] }];
    const text = backtestStrategy({ bars: rows, signals, config: tick }).diagnostics.join(' ');
    expect(text).toContain('exit A: give each leg a price or a tick distance, not both.');
    expect(text).toContain('exit B: a trailing stop needs an activation (price or ticks) and a trailing offset in ticks.');
    expect(text).toContain('exit C needs a profit, loss or trailing stop.');
    expect(text).toContain('exit D names entry missing, which is not an order of this run.');
    expect(text).toContain('exit E prices must be positive and tick-aligned; a tick distance must not reach zero.');
  });
  it('a named exit while flat does nothing and is counted once; a resent identical exit keeps its bracket', () => {
    const signals: StrategySignal[] = [
      { barIndex: 0, orders: [{ id: 'f0', action: 'exit', name: 'Guard', lossTicks: 4 }, { action: 'buy', quantity: 1 }] },
      { barIndex: 1, orders: [{ id: 'f1', action: 'exit', name: 'Guard', lossTicks: 4 }] },
      { barIndex: 2, orders: [{ id: 'f2', action: 'exit', name: 'Guard', lossTicks: 4 }] },
    ];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    expect(result.orders.filter(row => row.id.startsWith('f')).map(row => row.id)).toEqual(['f1:loss']);
    expect(result.diagnostics).toEqual(['1 named exit call while flat and without a named entry did nothing (OpenCandle-defined).']);
  });
  it('a changed same-name exit replaces the bracket; cancel by name removes it', () => {
    const signals: StrategySignal[] = [
      { barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] },
      { barIndex: 1, orders: [{ id: 'g1', action: 'exit', name: 'Guard', lossTicks: 4 }] },
      { barIndex: 2, orders: [{ id: 'g2', action: 'exit', name: 'Guard', lossTicks: 2 }] },
      { barIndex: 3, orders: [{ action: 'cancel', targetName: 'Guard' }] },
    ];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    expect(order(result, 'g1:loss')).toMatchObject({ status: 'cancelled', reason: 'Replaced by a newer exit named Guard.' });
    expect(order(result, 'g2:loss')).toMatchObject({ status: 'cancelled', reason: 'Cancelled by the strategy.', label: 'Exit Guard stop loss' });
  });
});

describe(' trailing stop', () => {
  it('activates at its level, trails the best price by the offset and fills as a stop-market order', () => {
    // Long from 100.5 (one tick of slippage). Activation 100.5 + 4 ticks = 102.5, offset 2 ticks = 1. Bar 2 runs to 106 (stop 105) and falls to 104.
    const rows = bars([[100, 100.5, 99.5, 100], [100, 101, 99.5, 100.5], [100.5, 106, 100, 104], [104, 104.5, 103.5, 104]]);
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 'e', name: 'L', action: 'buy', quantity: 1 }, { id: 't', action: 'exit', name: 'Trail', fromEntry: 'L', trailTicks: 4, trailOffsetTicks: 2 }] }];
    const result = backtestStrategy({ bars: rows, signals, config: { ...tick, slippageTicks: 1 } });
    // Bar 2 route: 100.5 -> 100 (low nearer) -> 106 -> 104. The stop rises to 105 at the high and fills on the fall, minus one tick of slippage.
    expect(order(result, 't:trail')).toMatchObject({ type: 'trailing-stop', status: 'filled', fillBar: 2, fillPrice: 104.5, stopPrice: 105, label: 'Exit Trail trailing stop' });
    expect(order(result, 't:trail').reason).toContain('activates at 102.5, then trails the best price by 1');
    expect(result.fills.at(-1)).toMatchObject({ marketPrice: 105, routeSegment: 3, routeBasis: 'ohlc-nearest-extreme-low-tie-v1' });
  });
  it('a short trailing stop mirrors it; a gap through the stop fills at the open', () => {
    const rows = bars([[100, 100.5, 99.5, 100], [100, 100.5, 95, 96], [99, 99.5, 98.5, 99]]);
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 's', name: 'S', action: 'sell', quantity: 1 }, { id: 't', action: 'exit', name: 'T', fromEntry: 'S', trailPrice: 99, trailOffsetTicks: 4 }] }];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    // Activated on bar 1 (low 95, stop 97); bar 2 opens at 99 above the stop: it fills at the open.
    expect(order(result, 't:trail')).toMatchObject({ status: 'filled', fillBar: 2, fillPrice: 99 });
    expect(result.fills.at(-1)).toMatchObject({ phase: 'open' });
  });
});

describe(' one-cancels-all groups for entries and exits', () => {
  const rows = bars([[100, 100.5, 99.5, 100], [100, 103, 97, 101], [101, 101.5, 100.5, 101]]);
  it('cancel: the first fill cancels the other members', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [
      { id: 'up', name: 'Up', action: 'buy', quantity: 1, type: 'stop', stopPrice: 102, ocaName: 'Breakout', ocaType: 'cancel' },
      { id: 'down', name: 'Down', action: 'sell', quantity: 1, type: 'stop', stopPrice: 98, ocaName: 'Breakout', ocaType: 'cancel' },
    ] }];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    // Bar 1 route: 100 -> 97 (low first on a tie) -> 103: the sell stop fills first.
    expect(order(result, 'down')).toMatchObject({ status: 'filled', fillPrice: 98 });
    expect(order(result, 'up')).toMatchObject({ status: 'cancelled', reason: 'One-cancels-all group Breakout: Down filled.' });
  });
  it('reduce: a fill reduces the other members by its quantity', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [
      { id: 'a', name: 'A', action: 'sell', quantity: 1, type: 'stop', stopPrice: 98, ocaName: 'Scale', ocaType: 'reduce' },
      { id: 'b', name: 'B', action: 'buy', quantity: 3, type: 'limit', limitPrice: 90, ocaName: 'Scale', ocaType: 'reduce' },
    ] }];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    expect(order(result, 'b')).toMatchObject({ status: 'working', quantity: 2 });
    expect(order(result, 'b').reason).toBe('Reduced to 2 when A of one-cancels-all group Scale filled.');
  });
  it('a member may not change a group type, and a type needs a name', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [
      { id: 'a', action: 'buy', quantity: 1, type: 'limit', limitPrice: 90, ocaName: 'G', ocaType: 'cancel' },
      { id: 'b', action: 'buy', quantity: 1, type: 'limit', limitPrice: 90, ocaName: 'G', ocaType: 'reduce' },
      { id: 'c', action: 'buy', quantity: 1, type: 'limit', limitPrice: 90, ocaType: 'reduce' },
    ] }];
    const result = backtestStrategy({ bars: rows, signals, config: { ...tick, pyramiding: 3 } });
    expect(order(result, 'b')).toMatchObject({ status: 'rejected', reason: 'One-cancels-all group G is a cancel group; this order asked for reduce.' });
    expect(order(result, 'c')).toMatchObject({ status: 'rejected', reason: 'A one-cancels-all type needs a group name.' });
  });
  it('exits in one reduce group share the position: a filled exit shrinks the other', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ action: 'buy', quantity: 2 }] }, { barIndex: 1, orders: [
      { id: 'near', action: 'exit', name: 'Near', quantity: 1, profitPrice: 100.5, ocaName: 'Out' },
      { id: 'far', action: 'exit', name: 'Far', quantity: 1, lossPrice: 95, ocaName: 'Out' },
    ] }];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    expect(order(result, 'near:profit')).toMatchObject({ status: 'filled' });
    expect(order(result, 'far:loss')).toMatchObject({ status: 'cancelled' });
    expect(order(result, 'far:loss').reason).toContain('One-cancels-all group Out reduced this exit by 1');
  });
  it('a newer same-name entry replaces a working one', () => {
    const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ id: 'l1', name: 'Limit', action: 'buy', quantity: 1, type: 'limit', limitPrice: 90 }] }, { barIndex: 1, orders: [{ id: 'l2', name: 'Limit', action: 'buy', quantity: 1, type: 'limit', limitPrice: 100.5 }] }];
    const result = backtestStrategy({ bars: rows, signals, config: tick });
    expect(order(result, 'l1')).toMatchObject({ status: 'cancelled', reason: 'Replaced by a newer order named Limit.' });
    expect(order(result, 'l2')).toMatchObject({ status: 'filled', fillBar: 2, label: 'Limit' });
  });
});

describe(' CandleScript proposals carry options, exits and cancels', () => {
  const rows = bars([[100, 100.5, 99.5, 100], [100, 101, 99.5, 100.5], [100.5, 106, 100, 104]]), barIds = ids(rows);
  const event = (index: number) => ({ id: barIds[index], revision: 1, time: rows[index].time });
  it('maps each shape onto engine intents; plain proposals stay exactly as before', () => {
    const signals = scriptOrdersToSignals([
      { sequence: 1, side: 'buy', quantity: 1, event: event(0), virtual: true },
      { sequence: 2, side: 'buy', quantity: 2, event: event(0), virtual: true, options: { id: 'Long', type: 'limit', limit: 99.5, ocaName: 'G', ocaType: 'cancel' } },
      { sequence: 3, side: 'exit', target: 'TP', exit: { fromEntry: 'Long', profit: 8, loss: 4, trailPoints: 6, trailOffset: 2, quantityPercent: 50 }, event: event(0), virtual: true },
      { sequence: 4, side: 'cancel', target: 'TP', event: event(1), virtual: true },
    ], rows, barIds);
    expect(signals.map(signal => signal.orders[0])).toEqual([
      { id: 'script-1', action: 'buy', quantity: 1, type: 'market' },
      { id: 'script-2', action: 'buy', quantity: 2, type: 'limit', limitPrice: 99.5, name: 'Long', ocaName: 'G', ocaType: 'cancel' },
      { id: 'script-3', action: 'exit', name: 'TP', fromEntry: 'Long', quantityPercent: 50, profitTicks: 8, lossTicks: 4, trailTicks: 6, trailOffsetTicks: 2 },
      { action: 'cancel', targetName: 'TP' },
    ]);
  });
  it('rejects malformed options and specifications', () => {
    const bad = [
      { sequence: 1, side: 'buy', quantity: 1, event: event(0), virtual: true, options: { id: '' } },
      { sequence: 1, side: 'buy', quantity: 1, event: event(0), virtual: true, options: { secret: 1 } },
      { sequence: 1, side: 'exit', target: 'X', exit: { profit: -1 }, event: event(0), virtual: true },
      { sequence: 1, side: 'exit', target: 'X', exit: { quantityPercent: 150 }, event: event(0), virtual: true },
      { sequence: 1, side: 'cancel', event: event(0), virtual: true },
      { sequence: 1, side: 'close', quantity: 1, event: event(0), virtual: true },
    ];
    for (const proposal of bad) expect(() => scriptOrdersToSignals([proposal], rows, barIds), JSON.stringify(proposal)).toThrow();
  });
});

describe(' Bar Magnifier coverage and the report route', () => {
  const chart = bars([[100, 101, 99, 100], [100, 101, 99, 100], [100, 110, 90, 105], [105, 106, 104, 105]]);
  const lower: Bar[] = [
    { time: chart[0].time, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    { time: chart[2].time, open: 100, high: 110, low: 99, close: 109, volume: 1 }, { time: chart[2].time + 43200, open: 108, high: 109, low: 90, close: 105, volume: 1 },
    { time: chart[3].time, open: 105, high: 106, low: 104, close: 104.5, volume: 1 },
  ];
  const signals: StrategySignal[] = [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'exit', id: 'e', profitPrice: 108, lossPrice: 95 }] }];
  it("'available' coverage magnifies the bars it can and keeps the OHLC route for the rest, saying how many", () => {
    expect(magnifierGroups(chart, lower, 'available').groups.map(group => group?.length ?? null)).toEqual([1, null, 2, null]);
    const all = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true }, magnifierBars: lower });
    expect(all.ok).toBe(false);
    const result = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true }, magnifierBars: lower, magnifierCoverage: 'available', magnifierLabel: 'SYN 12h' });
    expect(result.ok).toBe(true); expect(result.execution).toMatchObject({ magnifiedBars: 2, magnifierCoverage: 'available' });
    expect(result.policies).toContain("Bar Magnifier coverage: 2 of 4 execution bars used lower-timeframe bars (SYN 12h). The other 2 kept the OHLC route: no lower-timeframe bars, or bars that do not reproduce the execution bar's open, high, low and close. Missing data is never manufactured.");
    // Bar 2 is magnified: the target at 108 fills in the first lower bar (segment 2 of its route), before the drop to 90.
    expect(order(result, 'e:profit')).toMatchObject({ status: 'filled', fillBar: 2, fillPrice: 108 });
    expect(result.fills.at(-1)).toMatchObject({ routeBasis: 'lower-timeframe-ohlc-v1', routeSegment: 2 });
  });
  it('the report verifies magnified fills against the same lower-timeframe bars and keeps route positions on the 0 to 4 scale', () => {
    const result = backtestStrategy({ bars: chart, signals, config: { barMagnifier: true }, magnifierBars: lower, magnifierCoverage: 'available' });
    const context = { executionId: 'synthetic-magnifier', sourceLabel: 'Synthetic magnifier', currency: null, timezone: 'UTC' };
    const report = buildStrategyReport({ result, bars: chart, barIds: ids(chart), context, magnifierBars: lower });
    expect(report.trades).toHaveLength(1);
    const exit = report.trades[0].exit; expect(exit.routePosition).toBeGreaterThan(0); expect(exit.routePosition).toBeLessThan(4);
    expect(report.trades[0].favorable.value).toBe(8); // the run-up inside the magnified bar reaches the 108 fill, not the chart high 110
    expect(() => buildStrategyReport({ result, bars: chart, barIds: ids(chart), context })).toThrow(/route provenance/);
    expect(() => buildStrategyReport({ result, bars: chart, barIds: ids(chart), context, magnifierBars: lower.slice(0, 2) })).toThrow(/coverage contradicts/);
  });
});

describe(' recalculation modes (STRATEGY.CONFIG.EVERY_TICK)', () => {
  const rows = bars([[100, 101, 99, 100], [100, 101, 99, 100.5]]);
  it('every tick needs the host realtime declaration; the policy says whether a forming bar is in the run', () => {
    expect(backtestStrategy({ bars: rows, signals: [], config: { calcOnEveryTick: true } }).ok).toBe(false);
    const historical = backtestStrategy({ bars: rows, signals: [], config: { calcOnEveryTick: true }, everyTick: { formingBar: false } });
    expect(historical.ok).toBe(true); expect(historical.policies).toContain(STRATEGY_EVERY_TICK_POLICIES.historical);
    expect(backtestStrategy({ bars: rows, signals: [], config: { calcOnEveryTick: true }, everyTick: { formingBar: true } }).policies).toContain(STRATEGY_EVERY_TICK_POLICIES.forming);
  });
  it('a request with no bars validates configuration only (Apply and saved workspaces)', () => {
    for (const config of [{ calcOnEveryTick: true }, { barMagnifier: true }, { calcOnOrderFills: true }]) expect(backtestStrategy({ bars: [], signals: [], config }).ok).toBe(true);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, calcOnEveryTick: true, barMagnifier: true }, { everyTick: true, magnifier: true })).toEqual([]);
  });
});
