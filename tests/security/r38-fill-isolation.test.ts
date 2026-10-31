// (F1, added checks): a ctx kept from init or onBar gives onFill no lookahead, no effects beyond
// ctx.order, ctx.exit and ctx.cancel, and no lasting ctx.state change. SYNTHETIC bars and scripts only.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
// Bar 1 ends at close 106 with volume 500; its fill is fed at the route price 100 (high 101, low 99).
const bars = [
  { id: 'synthetic-iso-0', revision: 1, time: 1000, open: 100, high: 101, low: 99, close: 100, volume: 10 },
  { id: 'synthetic-iso-1', revision: 1, time: 1060, open: 100, high: 107, low: 99, close: 106, volume: 500 },
];
const fill = { bar: 1, ordinal: 0, name: 'Long', kind: 'order', leg: null, side: 'buy', quantity: 1, price: 100, high: 101, low: 99, close: 100, position: 1, averagePrice: 100, openTrades: 1 };
const engine = { positions: [null, { position: 3, averagePrice: 104, openTrades: 2 }], fills: [fill] };
async function run(source: string) { const jobs = new ScriptJobs(); try { return await jobs.run({ requestId: 'synthetic-iso-' + Math.random().toString(36).slice(2), source, bars, engine }); } finally { jobs.close(); } }
const ids = (result: any) => result.value.orders.map((order: any) => order.options?.id);

describe(' onFill isolation from a stashed ctx', () => {
  it('a ctx kept from init shows the bar so far and the position after the fill, never the bar end', async () => {
    const result = await run(`({ init(ctx) { this.full = ctx; }, onBar(ctx) { if (ctx.index === 1) ctx.order('buy', 1, { id: 'bar:' + ctx.bar.close + ':' + ctx.bar.volume + ':' + ctx.strategy.position }); },
      onFill(ctx, fill) { const full = this.full; ctx.order('buy', 1, { id: 'fill:' + full.bar.close + ':' + full.bar.high + ':' + full.bar.volume + ':' + full.strategy.position }); } })`);
    expect(result.ok, result.error?.message).toBe(true);
    expect(ids(result)).toEqual(['fill:100:101:0:1', 'bar:106:500:3']);
  });
  it('every other effect, TA, history and request throws in onFill, through the kept ctx too', async () => {
    const probes = ['plot("p", 1)', 'alert("a", "m")', 'alertcondition("c", true)', 'request("r")', 'ta.sma("k", 1, 2)', 'sma("s", 1, 2)', 'history(1)', 'series("v", 1, 2)', 'hline("h", 1)', 'bgcolor("#112233")', 'plotshape("s", true)', 'barcolor("#112233")', 'label.new({ x: 0, y: 1, text: "t" })', 'line.all()', 'box.all()', 'table.all()', 'log.info("m")', 'random()'];
    const result = await run(`({ init(ctx) { this.full = ctx; }, onBar(ctx) {},
      onFill(ctx, fill) { const full = this.full; let flags = '';
        ${probes.map(probe => `try { full.${probe}; flags += 'x'; } catch (error) { flags += String(error && error.message).startsWith('Inside onFill only') ? 'b' : 'o'; }`).join('\n        ')}
        ctx.order('buy', 1, { id: flags }); } })`);
    expect(result.ok, result.error?.message).toBe(true);
    expect(ids(result)).toEqual(['b'.repeat(probes.length)]);
    expect(result.value.plots).toEqual([]); expect(result.value.alerts).toEqual([]);
  });
  it('ctx.state changes made through either ctx in onFill are rolled back; orders still carry the fill', async () => {
    const result = await run(`({ init(ctx) { this.full = ctx; ctx.state.count = 0; }, onBar(ctx) { ctx.state.count++; },
      onFill(ctx) { this.full.state.leak = 1; ctx.state.count = 99; ctx.state.other = 1; ctx.cancel('Nothing'); } })`);
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.value.state.state).toEqual({ count: 2 });
    expect(result.value.orders).toMatchObject([{ side: 'cancel', target: 'Nothing', fill: 0 }]);
  });
});
