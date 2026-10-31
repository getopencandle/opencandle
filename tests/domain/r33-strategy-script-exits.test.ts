// LVScript ctx.order options, ctx.exit and ctx.cancel through the real restricted worker, the report
// worker and the strategy fill alert. SYNTHETIC bars and scripts only.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { freezeStrategyConfig, strategyFillAtEndpoint } from '../../src/domain/strategy-alert';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
import { validateReportRow } from '../../src/strategy-report/schema';
import { scriptExamples } from '../../src/ui/ScriptPanel';
import { compileLVScript } from '../../src/ui/script-editor-commands';
import type { Bar } from '../../src/domain/types';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
// Closes 100, 101, ... 111; each bar spans close - 1 to close + 2 around an open one below the close.
const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
const bars: Bar[] = closes.map((close, index) => ({ time: 1_700_000_000 + index * 60, open: close - 1, high: close + 2, low: close - 1.5, close, volume: 1 }));
const ids = bars.map((_, index) => 'synthetic-r33-' + index), scriptBars = bars.map((bar, index) => ({ ...bar, id: ids[index], revision: 1 }));
const source = `({
  onBar(ctx) {
    if (ctx.index === 1) {
      ctx.order('buy', 2, { id: 'Long', type: 'limit', limit: 101.5 });
      ctx.exit('Bracket', { fromEntry: 'Long', profit: 200, loss: 300 });
      ctx.cancel('Nothing');
    }
  }
})`;
async function run(code: string) { const jobs = new ScriptJobs(); try { return await jobs.run({ requestId: 'r33-' + Math.random().toString(36).slice(2), source: code, bars: scriptBars }); } finally { jobs.close(); } }

describe(' script exits through the restricted worker', () => {
  it('ctx.order options, ctx.exit and ctx.cancel emit exact virtual proposals', async () => {
    const result = await run(source); expect(result.ok, result.error?.message).toBe(true);
    const event = { id: ids[1], revision: 1, time: bars[1].time };
    expect(result.value.orders).toEqual([
      { sequence: 1, side: 'buy', quantity: 2, event, virtual: true, options: { id: 'Long', type: 'limit', limit: 101.5 } },
      { sequence: 2, side: 'exit', target: 'Bracket', exit: { fromEntry: 'Long', profit: 200, loss: 300 }, event, virtual: true },
      { sequence: 3, side: 'cancel', target: 'Nothing', event, virtual: true },
    ]);
    for (const row of result.value.orders) expect(() => validateReportRow('proposals', row)).not.toThrow();
  });
  it('the guest refuses malformed options with a reason', async () => {
    for (const [call, reason] of [
      [`ctx.order('buy', 1, { id: '' })`, 'Order options id must be text of 1 to 64 characters.'],
      [`ctx.order('buy', 1, { secret: 1 })`, 'Order options has an unsupported field.'],
      [`ctx.order('buy', 1, { type: 'iceberg' })`, 'Order options type must be market, limit, stop or stop-limit.'],
      [`ctx.exit('X', { profit: -1 })`, 'Exit profit must be a positive number.'],
      [`ctx.exit('X', { quantityPercent: 150 })`, 'Exit quantityPercent must be a percent above 0 and at most 100.'],
      [`ctx.exit('', { profit: 1 })`, 'ctx.exit needs a name of 1 to 64 characters.'],
      [`ctx.exit('X', { get profit() { return 1; } })`, 'Exit must be a plain data property.'],
      [`ctx.cancel(5)`, 'ctx.cancel needs the name of an order or exit.'],
    ] as const) {
      const result = await run(`({ onBar(ctx) { if (ctx.index === 0) ${call}; } })`);
      expect(result.ok, call).toBe(false); expect(result.error.message, call).toContain(reason);
    }
  });
  it('the report worker fills the limit entry, arms the bracket and closes it at its take profit', async () => {
    const result = await run(source); expect(result.ok).toBe(true);
    const session = new StrategyReportWorkerSession(); let sequence = 0;
    const send = (fields: Record<string, unknown>) => session.handle({ version: 1, job: 'r33-script-exits', sequence: ++sequence, ...fields }) as any;
    const config = { ...DEFAULT_STRATEGY_CONFIG, tickSize: 0.01 };
    expect(send({ kind: 'start', input: { context: { executionId: 'r33', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' }, config, chartType: 'standard', counts: { bars: bars.length, standardBars: 0, barIds: bars.length, proposals: result.value.orders.length } } })).toMatchObject({ ok: true });
    for (const [section, rows] of [['bars', bars], ['barIds', ids], ['proposals', result.value.orders]] as const) expect(send({ kind: 'chunk', section, start: 0, rows })).toMatchObject({ ok: true, kind: 'ack' });
    const ready = send({ kind: 'seal' }); expect(ready, JSON.stringify(ready)).toMatchObject({ ok: true, kind: 'ready' });
    const orders = send({ kind: 'orders', page: 0 }).value.rows;
    // Bar 2 opens at 101 below the 101.5 limit: the entry fills at the open, 101. The bracket arms at 101 + 2 = 103 and 101 - 3 = 98.
    expect(orders.map((row: any) => [row.label, row.type, row.status, row.fillPrice])).toEqual([
      ['Long', 'limit', 'filled', 101], ['Exit Bracket take profit', 'limit', 'filled', 103], ['Exit Bracket stop loss', 'stop', 'cancelled', null],
    ]);
    expect(orders[1]).toMatchObject({ limitPrice: 103, fillBar: 2 });
    expect(ready.value.metrics.all.closedNet.value).toBe(4);
  });
});

describe(' strategy fill alerts report exit fills', () => {
  it('the endpoint fill of a bracket leg names the exit and the flat position after it', async () => {
    const result = await run(source); expect(result.ok).toBe(true);
    const config = freezeStrategyConfig(DEFAULT_STRATEGY_CONFIG, 'standard');
    const at = (end: number) => strategyFillAtEndpoint({ orders: result.value.orders.filter((order: any) => ids.indexOf(order.event.id) < end), bars: bars.slice(0, end), barIds: ids.slice(0, end), standardBars: bars.slice(0, end), config });
    // Bar 2 (prefix of three bars): the entry and its take profit both fill on it; the record describes the last fill.
    expect(at(3)).toEqual({ fill: { action: 'sell', contracts: 2, price: 103, orderId: 'Exit Bracket take profit', positionSize: 0, prevPositionSize: 2, fills: 2 }, diagnostics: [] });
    expect(at(2)).toEqual({ fill: null, diagnostics: [] });
  });
});

describe(' shipped bracket example', () => {
  it('compiles cleanly, and its exit arms when the breakout entry fills', async () => {
    const example = scriptExamples['Breakout with bracket exit'];
    expect(compileLVScript(example)).toEqual({ ok: true, diagnostics: [] });
    const stepped = bars.map((bar, index) => ({ ...scriptBars[index], ...(index === 11 ? { close: 130, high: 131 } : {}) }));
    const jobs = new ScriptJobs(); let result;
    try { result = await jobs.run({ requestId: 'r33-example', source: example, bars: stepped }); } finally { jobs.close(); }
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.value.orders.map((order: any) => [order.side, order.options?.id ?? order.target])).toEqual([['buy', 'Breakout'], ['exit', 'Bracket']]);
  });
});

describe(' alerts and the report keep trailing exits and modes explicit', () => {
  it('a fill alert refuses Bar Magnifier and every-tick properties with a reason', () => {
    for (const patch of [{ barMagnifier: true }, { calcOnEveryTick: true }]) expect(() => freezeStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, ...patch }, 'standard')).toThrow('Strategy fill alerts replay fills on the bar-close OHLC route. Turn off Bar Magnifier and Recalculate on every tick in the Strategy tester properties to alert on these fills.');
  });
  it('a trailing exit travels through the report worker and its orders page', async () => {
    const trail = `({ onBar(ctx) { if (ctx.index === 1) { ctx.order('buy', 1, { id: 'Long' }); ctx.exit('Trail', { fromEntry: 'Long', trailPoints: 100, trailOffset: 50 }); } } })`;
    const result = await run(trail); expect(result.ok, result.error?.message).toBe(true);
    const session = new StrategyReportWorkerSession(); let sequence = 0;
    const send = (fields: Record<string, unknown>) => session.handle({ version: 1, job: 'r33-trail', sequence: ++sequence, ...fields }) as any;
    send({ kind: 'start', input: { context: { executionId: 'r33', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' }, config: DEFAULT_STRATEGY_CONFIG, chartType: 'standard', counts: { bars: bars.length, standardBars: 0, barIds: bars.length, proposals: result.value.orders.length } } });
    for (const [section, rows] of [['bars', bars], ['barIds', ids], ['proposals', result.value.orders]] as const) send({ kind: 'chunk', section, start: 0, rows });
    expect(send({ kind: 'seal' })).toMatchObject({ ok: true, kind: 'ready' });
    const leg = send({ kind: 'orders', page: 0 }).value.rows[1];
    // Entry at the bar 2 open (101). Bar 2 runs 101, 100.5, 104, 102: it activates at 101 + 1 = 102, trails the 104 high by
    // 0.5 and fills at 103.5 on the way to the close.
    expect(leg).toMatchObject({ label: 'Exit Trail trailing stop', type: 'trailing-stop', status: 'filled', fillBar: 2, fillPrice: 103.5, stopPrice: 103.5 });
  });
});
