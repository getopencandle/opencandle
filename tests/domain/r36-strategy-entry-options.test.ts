// The engine's strategy-entry and close-only orders (modelled on strategy.entry reversal
// behaviour), their proposal adapter and the restricted worker's ctx.order options. SYNTHETIC bars only.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG, type StrategySignal } from '../../src/domain/strategy';
import { scriptOrdersToSignals, scriptProposalIntent, validateScriptProposalShape } from '../../src/domain/strategy-script-orders';
import { validateReportRow } from '../../src/strategy-report/schema';
import type { Bar } from '../../src/domain/types';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
// Opens 100, 101, ...; every bar spans open - 2 to open + 2 and closes at open + 1.
const bars: Bar[] = Array.from({ length: 10 }, (_, index) => ({ time: 1_700_000_000 + index * 60, open: 100 + index, high: 102 + index, low: 98 + index, close: 101 + index, volume: 1 }));
const run = (signals: StrategySignal[], config = {}) => backtestStrategy({ bars, signals, config: { ...DEFAULT_STRATEGY_CONFIG, ...config } });
const at = (barIndex: number, ...orders: StrategySignal['orders']): StrategySignal => ({ barIndex, orders });

describe(' strategy entries', () => {
  it('an entry against an open position reverses it at the fill and keeps order records to their field set', () => {
    const result = run([at(0, { id: 'a', action: 'buy', quantity: 1, entry: true, name: 'Long' }), at(2, { id: 'b', action: 'sell', quantity: 1, entry: true, name: 'Short' })]);
    expect(result.ok).toBe(true);
    expect(result.fills.map(fill => [fill.barIndex, fill.side, fill.quantity, fill.price])).toEqual([[1, 'buy', 1, 101], [3, 'sell', 2, 103]]);
    expect(result.trades).toHaveLength(1); expect(result.equity.at(-1)!.position).toBe(-1);
    const reversal = result.orders.find(order => order.id === 'b')!;
    expect(reversal).toMatchObject({ quantity: 2, status: 'filled', reason: 'Reversal: the fill also closes the open 1 units.' });
    for (const order of result.orders) { expect(order).not.toHaveProperty('entry'); expect(order).not.toHaveProperty('closeOnly'); }
  });
  it('an entry in the direction of a position at the pyramiding limit is not placed; pyramiding 2 places it', () => {
    const signals = [at(0, { id: 'a', action: 'buy', quantity: 1, entry: true }), at(2, { id: 'b', action: 'buy', quantity: 1, entry: true }), at(3, { id: 'c', action: 'buy', quantity: 1, entry: true })];
    const one = run(signals);
    expect(one.orders.map(order => order.id)).toEqual(['a']);
    expect(one.diagnostics).toContain('2 entry calls in the direction of a position already at the pyramiding limit were not placed (OpenCandle-defined).');
    const two = run(signals, { pyramiding: 2 });
    expect(two.fills.map(fill => fill.barIndex)).toEqual([1, 3]); expect(two.equity.at(-1)!.position).toBe(2);
    expect(two.diagnostics).toContain('1 entry call in the direction of a position already at the pyramiding limit was not placed (OpenCandle-defined).');
  });
  it('a plain buy keeps the netting contract (it flattens a short instead of reversing it)', () => {
    const result = run([at(0, { id: 'a', action: 'sell', quantity: 1 }), at(2, { id: 'b', action: 'buy', quantity: 1 })]);
    expect(result.equity.at(-1)!.position).toBe(0); expect(result.orders.find(order => order.id === 'b')!.quantity).toBe(1);
  });
  it('an entry stop works at an untick-aligned level and fills there; a plain stop at that level is still refused', () => {
    const entry = run([at(0, { id: 'a', action: 'buy', quantity: 1, type: 'stop', stopPrice: 102.3333, entry: true })]);
    expect(entry.fills.map(fill => [fill.barIndex, fill.price])).toEqual([[1, 102.3333]]);
    const plain = run([at(0, { id: 'a', action: 'buy', quantity: 1, type: 'stop', stopPrice: 102.3333 })]);
    expect(plain.orders[0]).toMatchObject({ status: 'rejected', reason: 'stopPrice must be positive and tick-aligned when applicable, and omitted otherwise.' });
  });
  it('a close-only order sizes to the open position, is not placed when flat, and is cancelled when nothing is left at the fill', () => {
    const closes = run([at(0, { id: 'a', action: 'buy', quantity: 3 }), at(2, { id: 'b', action: 'sell', quantity: 1, closeOnly: true })]);
    expect(closes.fills.map(fill => [fill.barIndex, fill.side, fill.quantity])).toEqual([[1, 'buy', 3], [3, 'sell', 3]]);
    expect(closes.orders.find(order => order.id === 'b')).toMatchObject({ reduceOnly: true, status: 'filled' });
    const flat = run([at(0, { id: 'b', action: 'sell', quantity: 1, closeOnly: true })]);
    expect(flat.orders).toEqual([]); expect(flat.diagnostics).toContain('1 close call with no open position on that side was not placed (OpenCandle-defined).');
    const same = run([at(0, { id: 'a', action: 'buy', quantity: 1 }), at(2, { id: 'b', action: 'buy', quantity: 1, closeOnly: true })]);
    expect(same.orders.map(order => order.id)).toEqual(['a']);
    // Placed while long; a market sell at the same open fills first and flattens, so the close finds nothing.
    const gone = run([at(0, { id: 'a', action: 'buy', quantity: 1 }), at(2, { id: 'x', action: 'sell', quantity: 1 }, { id: 'b', action: 'sell', quantity: 1, closeOnly: true })]);
    expect(gone.orders.find(order => order.id === 'b')).toMatchObject({ status: 'cancelled', reason: 'Nothing to close: the position is flat or on the same side at the fill.' });
  });
  it('refuses entry and close together, or on a non-order intent', () => {
    const result = run([at(0, { id: 'a', action: 'buy', quantity: 1, entry: true, closeOnly: true })]);
    expect(result.orders).toEqual([]); expect(result.diagnostics).toContain('Bar 0: entry and close options apply to a buy or a sell, one at a time.');
  });
});

describe(' proposal adapter and worker options', () => {
  const event = { id: 'synthetic-0', revision: 1, time: bars[0].time };
  it('maps entry and close options to the engine intent and refuses other values', () => {
    expect(scriptProposalIntent({ sequence: 1, side: 'buy', quantity: 1, event, virtual: true, options: { id: 'Long', entry: true } })).toEqual({ id: 'script-1', action: 'buy', quantity: 1, type: 'market', name: 'Long', entry: true });
    expect(scriptProposalIntent({ sequence: 2, side: 'sell', quantity: 1, event, virtual: true, options: { close: true } })).toEqual({ id: 'script-2', action: 'sell', quantity: 1, type: 'market', closeOnly: true });
    for (const options of [{ entry: false }, { entry: 'yes' }, { close: 1 }, { entry: true, close: true }]) {
      const proposal = { sequence: 3, side: 'buy', quantity: 1, event, virtual: true, options };
      expect(() => validateScriptProposalShape(proposal), JSON.stringify(options)).toThrow('Order options are invalid.');
      expect(() => validateReportRow('proposals', proposal), JSON.stringify(options)).toThrow();
    }
    expect(() => validateReportRow('proposals', { sequence: 4, side: 'buy', quantity: 1, event, virtual: true, options: { entry: true } })).not.toThrow();
    expect(scriptOrdersToSignals([{ sequence: 1, side: 'buy', quantity: 1, event, virtual: true, options: { entry: true } }], [bars[0]], ['synthetic-0'])[0].orders[0]).toMatchObject({ entry: true });
  });
  it('the restricted worker emits entry and close options as plain copies and refuses bad ones with a reason', async () => {
    const jobs = new ScriptJobs(), scriptBars = bars.map((bar, index) => ({ ...bar, id: 'synthetic-' + index, revision: 1 }));
    const exec = (source: string) => jobs.run({ requestId: 'r36-' + Math.random().toString(36).slice(2), source, bars: scriptBars });
    try {
      const ok = await exec(`({ onBar(ctx) { if (ctx.index === 0) { ctx.order('buy', 1, { id: 'Long', entry: true }); ctx.order('sell', 1, { close: true }); } } })`);
      expect(ok.ok, ok.error?.message).toBe(true);
      expect(ok.value.orders.map((order: { options: unknown }) => order.options)).toEqual([{ id: 'Long', entry: true }, { close: true }]);
      for (const [call, reason] of [
        [`ctx.order('buy', 1, { entry: 1 })`, 'Order options entry must be true or omitted.'],
        [`ctx.order('buy', 1, { close: false })`, 'Order options close must be true or omitted.'],
        [`ctx.order('buy', 1, { entry: true, close: true })`, 'Order options cannot set both entry and close.'],
      ] as const) {
        const result = await exec(`({ onBar(ctx) { if (ctx.index === 0) ${call}; } })`);
        expect(result.ok, call).toBe(false); expect(result.error.message, call).toContain(reason);
      }
    } finally { jobs.close(); }
  });
});
