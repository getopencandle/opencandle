// Ctx.strategy and onFill(ctx, fill) through the real restricted worker, and the Strategy tester's
// feedback replay (src/strategy-report/feedback.ts). SYNTHETIC bars and scripts only.
import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from '../../src/domain/strategy';
import { BUILTIN_STRATEGY_SOURCES } from '../../src/domain/builtin-strategies/sources';
import { runReportJob } from '../../src/strategy-report/backtest';
import { scriptNeedsEngineFeed, subscribeStrategyFeedback, type EngineFeed } from '../../src/strategy-report/feedback';
import { strategyReportJobInput } from '../../src/strategy-report/use-report';
import { executeScriptOnBars, ScriptJobQueue } from '../../src/ui/script-jobs';
import type { StrategyExecution } from '../../src/ui/StrategyDialog';
import type { Bar } from '../../src/domain/types';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const jobs = new ScriptJobs();
afterAll(() => jobs.close());
const bridge = { executeScript: (payload: any) => jobs.run(payload), cancel: async (value: { requestId: string }) => { jobs.cancel(value.requestId); return { ok: true as const, value: null }; } };
const queue = new ScriptJobQueue(1);
const t0 = 1_700_000_000;
// Each bar opens 1 below its close and spans close - 1.5 to close + 2 (route: open, low, high, close).
const closes = [100, 101, 102, 103, 104, 105, 106, 107];
const bars: Bar[] = closes.map((close, index) => ({ time: t0 + index * 60, open: close - 1, high: close + 2, low: close - 1.5, close, volume: 1 }));
const scriptBars = (ids: string[]) => bars.map((bar, index) => ({ ...bar, id: ids[index], revision: 1 }));
async function raw(source: string, engine?: unknown) { return jobs.run({ requestId: 'r38-' + Math.random().toString(36).slice(2), source, bars: scriptBars(bars.map((_, index) => 'synthetic-r38-' + index)), ...(engine !== undefined ? { engine } : {}) }); }
const held = (position: number, averagePrice: number | null = position ? 100 : null, openTrades = position ? 1 : 0) => ({ position, averagePrice, openTrades });
async function execution(source: string, rows: Bar[] = bars): Promise<StrategyExecution> {
  const signal = new AbortController().signal, input = { source, bars: rows, identity: 'synthetic-r38-feedback', fixture: true, signal, bridge: bridge as never, queue };
  const { result, barIds } = await executeScriptOnBars(input);
  return { result, bars: rows, barIds, identity: 'r38-' + Math.random(), source: 'Synthetic', chartType: 'standard', currency: 'USD', timezone: 'UTC', ...(scriptNeedsEngineFeed(source) ? { rerun: (engine: EngineFeed, rerunSignal: AbortSignal) => executeScriptOnBars({ ...input, engine, signal: rerunSignal }).then(value => value.result) } : {}) };
}
async function settled(value: StrategyExecution, config: StrategyConfig) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const wait = new Promise<void>(resolve => { const off = subscribeStrategyFeedback(() => { off(); resolve(); }); });
    const prepared = strategyReportJobInput(value, config);
    if (!prepared.waiting) return prepared.input;
    await wait;
  }
  throw new Error('The feedback loop did not finish.');
}

describe(' ctx.strategy and onFill in the restricted worker', () => {
  it('without a feed ctx.strategy is null and the output is unchanged; with one it is the fed position of each bar', async () => {
    const source = `({ onBar(ctx) { const s = ctx.strategy; ctx.plot('pos', s === null ? -1 : s.position); ctx.plot('avg', s === null || s.averagePrice === null ? -1 : s.averagePrice); if (ctx.index === 1) ctx.order('buy', 1); } })`;
    const plain = await raw(source); expect(plain.ok, plain.error?.message).toBe(true);
    expect(plain.value.plots[0].values.map((point: any) => point.value)).toEqual(Array(8).fill(-1));
    expect(plain.value.orders).toEqual([{ sequence: 1, side: 'buy', quantity: 1, event: { id: 'synthetic-r38-1', revision: 1, time: bars[1].time }, virtual: true }]);
    const fed = await raw(source, { positions: [null, held(0), held(1), held(1), held(2, 100.5, 2), held(0), held(0), held(0)], fills: [] });
    expect(fed.ok, fed.error?.message).toBe(true);
    expect(fed.value.plots[0].values.map((point: any) => point.value)).toEqual([-1, 0, 1, 1, 2, 0, 0, 0]);
    expect(fed.value.plots[1].values.map((point: any) => point.value)).toEqual([-1, -1, 100, 100, 100.5, -1, -1, -1]);
    expect(fed.value.orders).toEqual(plain.value.orders);
  });
  it('onFill runs once per fed fill before that bar onBar, on the bar so far, and its state changes are discarded', async () => {
    const source = `({ init(ctx) { ctx.state.seen = 0; }, onBar(ctx) { ctx.state.seen++; ctx.plot('seen', ctx.state.seen); },
      onFill(ctx, fill) { ctx.state.seen = 1000; ctx.state.fills = (ctx.state.fills || 0) + 1;
        if (typeof ctx.plot !== 'undefined' || typeof ctx.ta !== 'undefined' || Object.isFrozen(ctx) !== true) throw new Error('the onFill ctx is reduced and frozen');
        if (fill.name === 'Long') ctx.order('sell', fill.quantity, { id: 'Flat', close: true });
        ctx.exit('Guard', { fromEntry: 'Long', loss: 50 }); ctx.cancel('Nothing');
        ctx.state.last = [ctx.bar.open, ctx.bar.high, ctx.bar.low, ctx.bar.close, ctx.bar.volume, ctx.strategy.position, fill.kind, fill.leg, fill.side, fill.price]; } })`;
    const fill = (bar: number, ordinal: number, name: string | null, close: number) => ({ bar, ordinal, name, kind: 'order', leg: null, side: 'buy', quantity: 2, price: close + 0.01, high: close + 0.5, low: close - 0.5, close, ...held(2) });
    const fed = await raw(source, { positions: Array(8).fill(null), fills: [fill(2, 0, 'Long', 101), fill(2, 1, null, 101.5), fill(5, 0, 'Other', 104)] });
    expect(fed.ok, fed.error?.message).toBe(true);
    // State: onFill changes were discarded (seen keeps counting bars, no fills key).
    expect(fed.value.state.state).toEqual({ seen: 8 });
    expect(fed.value.plots[0].values.map((point: any) => point.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const event = (index: number) => ({ id: 'synthetic-r38-' + index, revision: 1, time: bars[index].time });
    expect(fed.value.orders).toEqual([
      { sequence: 1, side: 'sell', quantity: 2, event: event(2), virtual: true, options: { id: 'Flat', close: true }, fill: 0 },
      { sequence: 2, side: 'exit', target: 'Guard', exit: { fromEntry: 'Long', loss: 50 }, event: event(2), virtual: true, fill: 0 },
      { sequence: 3, side: 'cancel', target: 'Nothing', event: event(2), virtual: true, fill: 0 },
      { sequence: 4, side: 'exit', target: 'Guard', exit: { fromEntry: 'Long', loss: 50 }, event: event(2), virtual: true, fill: 1 },
      { sequence: 5, side: 'cancel', target: 'Nothing', event: event(2), virtual: true, fill: 1 },
      { sequence: 6, side: 'exit', target: 'Guard', exit: { fromEntry: 'Long', loss: 50 }, event: event(5), virtual: true, fill: 0 },
      { sequence: 7, side: 'cancel', target: 'Nothing', event: event(5), virtual: true, fill: 0 },
    ]);
    // The bar so far: open, the fed high, low and route close, no volume yet; the position after the fill.
    const probe = await raw(`({ onBar(ctx) {}, onFill(ctx, fill) { ctx.order('buy', 1, { id: JSON.stringify([ctx.bar.open, ctx.bar.high, ctx.bar.low, ctx.bar.close, ctx.bar.volume, ctx.strategy.position, fill.kind, fill.side, fill.price]).slice(0, 64) }); } })`, { positions: Array(8).fill(null), fills: [fill(3, 0, 'Long', 102)] });
    expect(probe.ok, probe.error?.message).toBe(true);
    expect(JSON.parse(probe.value.orders[0].options.id)).toEqual([102, 102.5, 101.5, 102, 0, 2, 'order', 'buy', 102.01]);
  });
  it('a script without onFill ignores fed fills, and an error in onFill fails the run', async () => {
    const fills = [{ bar: 1, ordinal: 0, name: null, kind: 'order', leg: null, side: 'buy', quantity: 1, price: 100, high: 100, low: 100, close: 100, ...held(1) }];
    const quiet = await raw(`({ onBar(ctx) {} })`, { positions: Array(8).fill(null), fills }); expect(quiet.ok).toBe(true); expect(quiet.value.orders).toEqual([]);
    expect(await raw(`({ onBar(ctx) {}, onFill(ctx) { throw new Error('boom'); } })`, { positions: Array(8).fill(null), fills })).toMatchObject({ ok: false, error: { message: 'boom' } });
  });
});

describe(' feedback replay in the Strategy tester', () => {
  it('a rejected entry: the script sees the engine position and enters again, where its own record would not', async () => {
    // Bar 1 asks for 5 units (500 of value against 150 of virtual capital): rejected at the bar 2 open.
    const source = `({ init(ctx) { ctx.state.pos = 0; }, onBar(ctx) {
      const pos = ctx.strategy ? Math.sign(ctx.strategy.position) : ctx.state.pos;
      if (ctx.index >= 1 && pos === 0) { ctx.order('buy', ctx.index === 1 ? 5 : 1, { id: 'Long', entry: true }); ctx.state.pos = 1; } } })`;
    const config = { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 150 };
    const value = await execution(source);
    const before = runReportJob({ execution: { bars, barIds: value.barIds, proposals: value.result.orders, chartType: 'standard', context: { executionId: 'x', sourceLabel: 'Synthetic', currency: 'USD', timezone: 'UTC' } }, config });
    expect(before.fills).toEqual([]); expect(before.orders.map(order => order.status)).toEqual(['rejected']);
    const job = await settled(value, config), after = runReportJob(job);
    expect(after.ok, after.diagnostics.join(' ')).toBe(true);
    // The bar 2 retry fills at the bar 3 open (102); the script then sees a long position and stops.
    expect(after.orders.map(order => [order.quantity, order.status, order.fillBar, order.fillPrice])).toEqual([[5, 'rejected', null, null], [1, 'filled', 3, 102]]);
    expect(after.equity.at(-1)!.position).toBe(1);
  });
  it('onFill: a close placed at the entry fill fills later on the same bar; with the setting off no onFill runs', async () => {
    const source = `({ onBar(ctx) { if (ctx.index === 1) ctx.order('buy', 1, { id: 'Long' }); },
      onFill(ctx, fill) { if (fill.name === 'Long') ctx.order('sell', 1, { id: 'Flat', close: true }); } })`;
    const value = await execution(source);
    const on = runReportJob(await settled(value, { ...DEFAULT_STRATEGY_CONFIG, calcOnOrderFills: true }));
    expect(on.ok, on.diagnostics.join(' ')).toBe(true);
    // Bar 2 route: 101 (open, entry), 100.5 (low: the close fills), 104, 102.
    expect(on.trades.map(trade => [trade.entryBar, trade.exitBar, trade.entryPrice, trade.exitPrice])).toEqual([[2, 2, 101, 100.5]]);
    expect(on.policies.join(' ')).toContain('After each fill the strategy callback');
    const off = runReportJob(await settled(value, DEFAULT_STRATEGY_CONFIG));
    expect(off.trades).toEqual([]); expect(off.equity.at(-1)!.position).toBe(1);
  });
  it('a built-in strategy settles in one extra run when nothing is rejected, with the same fills as its own record', async () => {
    const source = BUILTIN_STRATEGY_SOURCES['moving-average-crossover'];
    expect(scriptNeedsEngineFeed(source)).toBe(true);
    const wave: Bar[] = Array.from({ length: 120 }, (_, index) => { const close = 100 + 8 * Math.sin(index / 6); return { time: t0 + index * 60, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1 }; });
    const value = await execution(source, wave);
    const own = runReportJob({ execution: { bars: wave, barIds: value.barIds, proposals: value.result.orders, chartType: 'standard', context: { executionId: 'x', sourceLabel: 'Synthetic', currency: 'USD', timezone: 'UTC' } }, config: DEFAULT_STRATEGY_CONFIG });
    const fed = runReportJob(await settled(value, DEFAULT_STRATEGY_CONFIG));
    expect(own.fills.length).toBeGreaterThan(4); expect(fed.fills).toEqual(own.fills);
  });
  it('a built-in strategy whose first short is rejected enters at the next signal bar instead of believing it is short', async () => {
    // Consecutive up/down (3 downs): the short signal at bar 3 fills at the bar 4 open (101.5) and is rejected for margin
    // with 101 of virtual capital. Its own record then believes it is short; the engine position makes it sell again at bar 4.
    const falling = [105, 104, 103, 102, 101, 100, 99, 98, 97, 96].map((close, index) => ({ time: t0 + index * 60, open: close + 0.5, high: close + 0.6, low: close - 0.5, close, volume: 1 }));
    const value = await execution(BUILTIN_STRATEGY_SOURCES['consecutive-up-down'], falling), config = { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 101 };
    const own = runReportJob({ execution: { bars: falling, barIds: value.barIds, proposals: value.result.orders, chartType: 'standard', context: { executionId: 'x', sourceLabel: 'Synthetic', currency: 'USD', timezone: 'UTC' } }, config });
    expect(own.orders.map(order => [order.label, order.status])).toEqual([['Short', 'rejected']]);
    const fed = runReportJob(await settled(value, config));
    expect(fed.orders.map(order => [order.label, order.status, order.fillBar, order.fillPrice])).toEqual([['Short', 'rejected', null, null], ['Short', 'filled', 5, 100.5]]);
    expect(fed.equity.at(-1)!.position).toBe(-1);
  });
  it('a script that never mentions the engine runs once (no rerun)', async () => {
    const value = await execution(`({ onBar(ctx) { if (ctx.index === 1) ctx.order('buy', 1); } })`);
    expect(value.rerun).toBeUndefined();
    const prepared = strategyReportJobInput(value, DEFAULT_STRATEGY_CONFIG); expect(prepared.waiting).toBe(false);
  });
});
