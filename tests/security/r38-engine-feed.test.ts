// (added checks): the Strategy tester's engine feed is bounded plain data, the guest sees it only as
// frozen per-bar copies, and the security contract (LIMITS, fresh runtime, provisional rollback) is unchanged.
// SYNTHETIC bars and scripts only.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { inputForScript, LIMITS } = require('../../electron/script-runtime.cjs');
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const bars = [1, 2, 3].map((close, index) => ({ id: 'synthetic-feed-' + index, revision: 1, time: 1000 + index * 60, open: close, high: close + 1, low: close - 0.5, close, volume: 1 }));
const base = { requestId: 'synthetic-feed', source: '({ onBar(ctx) {} })', bars };
const held = { position: 1, averagePrice: 2, openTrades: 1 };
const fill = (patch: Record<string, unknown> = {}) => ({ bar: 1, ordinal: 0, name: 'Long', kind: 'order', leg: null, side: 'buy', quantity: 1, price: 2, high: 2.5, low: 1.5, close: 2, ...held, ...patch });
const feed = (patch: Record<string, unknown> = {}) => ({ positions: [null, held, held], fills: [fill()], ...patch });
async function run(source: string, extra: Record<string, unknown>) { const jobs = new ScriptJobs(); try { return await jobs.run({ ...base, requestId: 'synthetic-feed-' + Math.random().toString(36).slice(2), source, ...extra }); } finally { jobs.close(); } }

describe(' engine feed boundary', () => {
  it('keeps LIMITS exactly as before', () => {
    expect(LIMITS).toEqual({ sourceBytes: 65536, bars: 5000, memoryBytes: 16 * 1024 * 1024, stackBytes: 256 * 1024, outputBytes: 512 * 1024, computeMilliseconds: 1000, inputs: 32, requests: 4, conditions: 32 });
    expect(Object.isFrozen(LIMITS)).toBe(true);
  });
  it('accepts the documented shape and refuses everything else', () => {
    expect(inputForScript({ ...base, engine: feed() }).engine).toEqual(feed());
    expect(inputForScript({ ...base, engine: null }).engine).toBeNull();
    const refused = [
      [], 'feed', feed({ extra: 1 }), feed({ positions: [null, held] }), feed({ positions: [null, held, { ...held, extra: 1 }] }),
      feed({ positions: [null, held, { ...held, averagePrice: null }] }), feed({ positions: [null, held, { ...held, openTrades: 1.5 }] }), feed({ positions: [null, held, { ...held, position: Infinity }] }),
      JSON.parse('{"positions":[null,null,null],"fills":[],"__proto__":{}}'),
      feed({ fills: [fill(), fill()] }), feed({ fills: [fill({ bar: 2 }), fill({ bar: 1 })] }), feed({ fills: [fill({ bar: 3 })] }), feed({ fills: [fill({ ordinal: 1001 })] }),
      feed({ fills: [fill({ name: 'x'.repeat(65) })] }), feed({ fills: [fill({ name: '' })] }), feed({ fills: [fill({ kind: 'deposit' })] }), feed({ fills: [fill({ leg: 'other' })] }),
      feed({ fills: [fill({ side: 'short' })] }), feed({ fills: [fill({ high: 1.9 })] }), feed({ fills: [fill({ low: 2.1 })] }), feed({ fills: [fill({ quantity: 0 })] }), feed({ fills: [fill({ extra: true })] }),
      feed({ fills: Array.from({ length: 5001 }, (_, index) => fill({ bar: 1, ordinal: index })) }),
    ];
    for (const engine of refused) expect(() => inputForScript({ ...base, engine }), JSON.stringify(engine).slice(0, 120)).toThrow();
  });
  it('the guest sees frozen per-bar copies only, never the feed arrays, and onFill keeps the lockdown', async () => {
    const source = `({ onBar(ctx) { const s = ctx.strategy; if (s) { try { s.position = 99; } catch {} ctx.plot('pos', s.position); ctx.plot('frozen', Object.isFrozen(s) ? 1 : 0); ctx.plot('keys', Object.keys(s).length); } },
      onFill(ctx, fill) { const probe = [typeof Date, typeof eval, typeof Function, typeof ctx.plot, typeof ctx.alert, typeof ctx.request, typeof ctx.ta, Object.isFrozen(fill), Object.isFrozen(ctx.bar), Object.isFrozen(ctx.strategy)];
        ctx.order('buy', 1, { id: probe.map(value => value === 'undefined' ? 'u' : value === true ? 't' : 'x').join('') }); } })`;
    const result = await run(source, { engine: feed() });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.value.plots.map((plot: any) => [plot.title, plot.values.map((point: any) => point.value)])).toEqual([['pos', [1, 1]], ['frozen', [1, 1]], ['keys', [3, 3]]]);
    expect(result.value.orders[0].options.id).toBe('uuuuuuuttt');
    expect(result.value.orders[0].fill).toBe(0);
  });
  it('a provisional run with a feed still emits no orders and keeps the committed snapshot', async () => {
    const source = `({ onBar(ctx) { ctx.order('buy', 1); }, onFill(ctx) { ctx.order('sell', 1); } })`;
    const committed = await run(source, { bars: bars.slice(0, 1) }); expect(committed.ok).toBe(true);
    const provisional = await run(source, { bars: bars.slice(1), snapshot: committed.value.state, provisional: true, engine: { positions: [held, held], fills: [fill({ bar: 0 })] } });
    expect(provisional.ok, provisional.error?.message).toBe(true); expect(provisional.value.orders).toEqual([]); expect(provisional.value.state).toEqual(committed.value.state);
  });
  it('an onFill that never returns is interrupted like onBar', async () => {
    const started = Date.now(), result = await run(`({ onBar(ctx) {}, onFill(ctx) { for (;;) {} } })`, { engine: feed() });
    expect(result.ok).toBe(false); expect(Date.now() - started).toBeLessThan(5000);
  }, 20000);
});
