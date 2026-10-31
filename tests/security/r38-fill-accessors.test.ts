// (added checks): accessors a script installs on ctx never run host-driven guest code at fill
// time, so nothing reads the complete bar behind the onFill guard. SYNTHETIC bars and scripts only.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
// Bar 1 ends at close 106, high 107, low 98, volume 500; its two fills are fed at the route price 100 (high 101, low 99).
const bars = [
  { id: 'synthetic-acc-0', revision: 1, time: 1000, open: 100, high: 101, low: 99, close: 100, volume: 10 },
  { id: 'synthetic-acc-1', revision: 1, time: 1060, open: 100, high: 107, low: 98, close: 106, volume: 500 },
];
const fill = (ordinal: number) => ({ bar: 1, ordinal, name: 'Long', kind: 'order', leg: null, side: 'buy', quantity: 1, price: 100, high: 101, low: 99, close: 100, position: 1, averagePrice: 100, openTrades: 1 });
const engine = { positions: [null, { position: 2, averagePrice: 100, openTrades: 2 }], fills: [fill(0), fill(1)] };
async function run(source: string) { const jobs = new ScriptJobs(); try { return await jobs.run({ requestId: 'synthetic-acc-' + Math.random().toString(36).slice(2), source, bars, engine }); } finally { jobs.close(); } }
const ids = (result: any) => result.value.orders.map((order: any) => order.options?.id);
// A setter or getter that, if the host ever ran it at fill time, would read the complete bar and leak it into an order name.
const spy = `const leak = ctx => { try { const row = ctx.history(0); return 'LEAK' + row.close + ':' + ctx.ta.tr(true); } catch (error) { return 'blocked'; } };`;

describe(' accessors on ctx at fill time', () => {
  it('ctx.bar, ctx.strategy and ctx.index cannot become accessors; onFill sees only the bar so far', async () => {
    const result = await run(`(() => { ${spy} return { init(ctx) { this.full = ctx; this.seen = [];
        for (const name of ['bar', 'strategy', 'index']) { try { let held = null; Object.defineProperty(ctx, name, { configurable: true, enumerable: true, get: () => held, set: value => { held = value; this.seen.push(leak(ctx)); } }); this.seen.push(name + ':installed'); } catch (error) { this.seen.push(name + ':refused'); } } },
      onBar(ctx) {},
      onFill(ctx, fill) { ctx.order('buy', 1, { id: (fill.price + ':' + this.full.bar.close + ':' + this.seen.join(',')).slice(0, 64) }); } }; })()`);
    expect(result.ok, result.error?.message).toBe(true);
    expect(ids(result)).toEqual(['100:100:bar:refused,strategy:refused,index:refused', '100:100:bar:refused,strategy:refused,index:refused']);
    expect(JSON.stringify(result.value)).not.toContain('LEAK');
  });
  it('an accessor installed on ctx.state is refused at the fill without running it', async () => {
    const result = await run(`(() => { ${spy} return { init(ctx) { let held = {};
        Object.defineProperty(ctx, 'state', { configurable: true, enumerable: true, get() { throw new Error('GETTER_RAN ' + leak(ctx)); }, set(value) { throw new Error('SETTER_RAN ' + leak(ctx)); } }); },
      onBar(ctx) {}, onFill(ctx) { ctx.order('buy', 1); } }; })()`);
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('own data');
    expect(result.error.message).not.toMatch(/GETTER_RAN|SETTER_RAN|LEAK/);
  });
  it('multi-fill: a state accessor installed during fill 0 is overwritten by the restore, never called, and cannot re-arm fill 1', async () => {
    const result = await run(`(() => { ${spy} return { init(ctx) { this.full = ctx; ctx.state.count = 0; },
      onBar(ctx) { ctx.state.count++; },
      onFill(ctx, fill) { const full = this.full, self = this;
        try { Object.defineProperty(full, 'state', { configurable: true, enumerable: true, get() { throw new Error('GETTER_RAN'); }, set(value) { self.armed = leak(full); Object.defineProperty(full, 'state', { value, writable: true, enumerable: true, configurable: true }); } }); } catch (error) { this.armed = 'refused'; }
        ctx.order('buy', 1, { id: ('f' + fill.price + ':' + full.bar.close + ':' + String(this.armed)).slice(0, 64) }); } }; })()`);
    expect(result.ok, result.error?.message).toBe(true);
    // Fill 0 sees no earlier arming; fill 1 shows the setter never ran (armed is still unset).
    expect(ids(result)).toEqual(['f100:100:undefined', 'f100:100:undefined']);
    expect(JSON.stringify(result.value)).not.toContain('LEAK');
    expect(result.value.state.state).toEqual({ count: 2 });
  });
});
