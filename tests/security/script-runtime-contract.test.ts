import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { scriptExamples } from '../../src/ui/ScriptPanel';
import { newScriptTemplate } from '../../src/ui/ScriptLibraryPanel';
import { compileLVScript } from '../../src/ui/script-editor-commands';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import type { ReportReply } from '../../src/strategy-report/types';

// Each case drives the actual restricted worker (electron/script-jobs.cjs -> QuickJS-WASM runtime).
const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const series = (closes: number[], prefix = 'synthetic-runtime-') => closes.map((close, index) => ({ id: prefix + index, revision: 1, time: 1000 + index * 60, open: close, high: close + 1, low: close - 1, close, volume: 1 }));
async function run(source: string, bars = series([1, 2, 3]), extra: Record<string, unknown> = {}) { const jobs = new ScriptJobs(); try { return await jobs.run({ requestId: 'synthetic-runtime', source, bars, ...extra }); } finally { jobs.close(); } }
const values = (result: any, title: string) => result.value.plots.find((plot: any) => plot.title === title).values.map((point: any) => point.value);

describe('SCRIPT.RUNTIME.ISOLATION', () => {
  it('exposes no Node, filesystem, network, timer or dynamic-code capability to the guest', async () => {
    const result = await run(`({ onBar(ctx) { if (ctx.index) return; const probe = ['require','process','module','fetch','XMLHttpRequest','WebSocket','setTimeout','Buffer','eval','Function','Date','Proxy'];
      for (const name of probe) ctx.state[name] = typeof globalThis[name]; ctx.plot('probe', 1); } })`);
    expect(result.ok, result.error?.message).toBe(true);
    expect(Object.values(result.value.state.state)).toEqual(Array(12).fill('undefined'));
  });
  it('gives every job a fresh runtime, so globals written by one run never reach the next', async () => {
    const first = await run(`({ onBar(ctx) { globalThis.synthetic = (globalThis.synthetic || 0) + 1; ctx.state.seen = globalThis.synthetic; } })`);
    const second = await run(`({ onBar(ctx) { ctx.state.seen = typeof globalThis.synthetic; } })`);
    expect(first.value.state.state.seen).toBe(3); expect(second.value.state.state.seen).toBe('undefined');
  });
});

describe('SCRIPT.RUNTIME.LIMITS', () => {
  it('rejects oversized source and bar requests before starting a worker', async () => {
    expect(await run('({ onBar(ctx) {} })' + ' '.repeat(65536))).toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT' } });
    expect(await run('({ onBar(ctx) {} })', series(Array(5001).fill(1)))).toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'Script bar limit is 5000 per request.' } });
  });
  it('interrupts runaway compute and bounds output count and memory', async () => {
    const started = Date.now(), loop = await run('({ onBar(ctx) { for (;;) {} } })');
    expect(loop.ok).toBe(false); expect(Date.now() - started).toBeLessThan(5000);
    expect(await run(`({ onBar(ctx) { for (let i = 0; i < 4000; i++) ctx.plot('p' + i, i); } })`)).toMatchObject({ ok: false, error: { message: 'Output count limit exceeded.' } });
    const memory = await run('({ onBar(ctx) { const keep = []; for (;;) keep.push(new Array(100000).fill(ctx.index)); } })'); expect(memory.ok).toBe(false);
  }, 20000);
  it('cancels an executing request', async () => {
    const jobs = new ScriptJobs();
    try { const pending = jobs.run({ requestId: 'synthetic-cancel', source: '({ onBar(ctx) { for (;;) {} } })', bars: series([1]) }); expect(jobs.cancel('synthetic-cancel')).toBe(true); expect(await pending).toMatchObject({ ok: false, error: { code: 'CANCELLED' } }); }
    finally { jobs.close(); }
  });
});

describe('SCRIPT.RUNTIME.STATE and SCRIPT.RUNTIME.ROLLBACK', () => {
  const counter = `({ init(ctx) { ctx.state.count = 0; ctx.state.inits = (ctx.state.inits || 0) + 1; }, onBar(ctx) { ctx.state.count++; ctx.plot('count', ctx.state.count); } })`;
  it('initializes once per instance and continues explicit state across completed-bar requests', async () => {
    const bars = series([1, 2, 3, 4]), first = await run(counter, bars.slice(0, 2));
    expect(first.value.state.state).toEqual({ count: 2, inits: 1 }); expect(first.value.state.processedIds).toEqual(['synthetic-runtime-0', 'synthetic-runtime-1']);
    const next = await run(counter, bars.slice(2), { snapshot: first.value.state });
    expect(next.value.state.state).toEqual({ count: 4, inits: 1 }); expect(values(next, 'count')).toEqual([3, 4]);
  });
  it('discards a provisional (unconfirmed) bar: state and effects roll back to the committed snapshot', async () => {
    const bars = series([1, 2, 3]), committed = await run(counter, bars.slice(0, 2));
    const provisional = await run(counter, bars.slice(2), { snapshot: committed.value.state, provisional: true });
    expect(provisional.ok).toBe(true); expect(provisional.value.provisional).toBe(true); expect(provisional.value.state).toEqual(committed.value.state);
    expect(provisional.value.plots).toEqual([]); expect(provisional.value.orders).toEqual([]);
  });
  it('refuses to replay an already processed or older bar on a snapshot instead of silently double-counting', async () => {
    const bars = series([1, 2]), committed = await run(counter, bars);
    expect(await run(counter, bars.slice(1), { snapshot: committed.value.state })).toMatchObject({ ok: false, error: { message: 'Replay requires a snapshot before the repeated/corrected bar.' } });
  });
});

describe('SCRIPT.RUNTIME.PLOTS', () => {
  it('emits typed plot series keyed by bar event time with warm-up nulls and validated colors', async () => {
    const result = await run(`({ onBar(ctx) { ctx.plot('SMA 2', ctx.sma('a', ctx.bar.close, 2), '#123456'); } })`);
    expect(result.value.plots).toEqual([{ id: 'lvplot:SMA 2', title: 'SMA 2', color: '#123456', values: [{ time: 1000, value: null }, { time: 1060, value: 1.5 }, { time: 1120, value: 2.5 }] }]);
    expect(await run(`({ onBar(ctx) { ctx.plot('bad', 1, 'red'); } })`)).toMatchObject({ ok: false, error: { message: 'Invalid plot.' } });
    expect(await run(`({ onBar(ctx) { ctx.plot('bad', Infinity); } })`)).toMatchObject({ ok: false, error: { message: 'Invalid plot.' } });
  });
});

describe('SCRIPT.RUNTIME.STRATEGY', () => {
  it('emits only virtual proposals that the strategy report fills at the next bar open, with no paper-account path', async () => {
    const closes = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const bars = series(closes.map(close => close + 10)), executed = await run(scriptExamples['Moving average cross strategy'], bars);
    expect(executed.ok, executed.error?.message).toBe(true);
    expect(executed.value.orders.length).toBeGreaterThan(0); for (const order of executed.value.orders) expect(order).toMatchObject({ virtual: true, side: expect.stringMatching(/^(buy|sell)$/), event: { revision: 1 } });
    const session = new StrategyReportWorkerSession(); let sequence = 0; const send = (fields: Record<string, unknown>): ReportReply => session.handle({ version: 1, job: 'synthetic-strategy-intents', sequence: ++sequence, ...fields });
    const reportBars = bars.map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume })), barIds = bars.map(bar => bar.id), config = { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 1000 };
    expect(send({ kind: 'start', input: { context: { executionId: 'synthetic-intents', sourceLabel: 'Synthetic runtime intents', currency: null, timezone: 'UTC' }, config, chartType: 'standard', counts: { bars: bars.length, standardBars: 0, barIds: bars.length, proposals: executed.value.orders.length } } }).ok).toBe(true);
    for (const [section, rows] of [['bars', reportBars], ['barIds', barIds], ['proposals', executed.value.orders]] as const) { const reply = send({ kind: 'chunk', section, start: 0, rows }); expect(reply, section + ' ' + JSON.stringify(reply)).toMatchObject({ ok: true, kind: 'ack' }); }
    const ready = send({ kind: 'seal' }); expect(ready, JSON.stringify(ready)).toMatchObject({ ok: true, kind: 'ready' });
    const first = executed.value.orders[0], signalIndex = barIds.indexOf(first.event.id), trades = send({ kind: 'orders', page: 0 }) as any;
    expect(trades.value.rows[0]).toMatchObject({ status: 'filled', fillBar: signalIndex + 1, fillPrice: bars[signalIndex + 1].open });
    for (const file of [...readdirSync('src/strategy-report').map(name => 'src/strategy-report/' + name), 'src/ui/ScriptLibraryPanel.tsx', 'src/ui/script-jobs.ts', 'electron/script-runtime.cjs']) expect(readFileSync(file, 'utf8'), file).not.toMatch(/from ['"][^'"]*paper|require\(['"][^'"]*paper/);
  });
});

describe('SCRIPT.RUNTIME.DIAGNOSTICS', () => {
  it('turns unsupported constructs into explicit errors or compile warnings instead of silent wrong values', async () => {
    expect(await run(`({ onBar(ctx) { ctx.plot('r', Math.random()); } })`)).toMatchObject({ ok: false, error: { message: 'Use ctx.random() for deterministic randomness.' } });
    expect(await run('({ init(ctx) {} })')).toMatchObject({ ok: false, error: { message: 'Define an onBar(ctx) function.' } });
    expect(await run(`({ onBar(ctx) { ctx.sma('x', ctx.bar.close, 0); } })`)).toMatchObject({ ok: false, error: { message: 'Invalid SMA parameters.' } });
    expect(await run('({ async onBar(ctx) {} })')).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_SYNTAX' } });
    const silent = `({ onBar(ctx) { ctx.plot('c', ctx.close ?? null); } })`, executed = await run(silent);
    expect(executed.ok).toBe(true); expect(values(executed, 'c')).toEqual([null, null, null]);
    expect(compileLVScript(silent).diagnostics).toEqual([expect.objectContaining({ code: 'UNKNOWN_API', severity: 'warning', line: 1, column: 35 })]);
  });
});

describe('SCRIPT.EXAMPLES and new-script templates execute', () => {
  it('runs the original moving-average band example with hand-computed bands', async () => {
    const result = await run(scriptExamples['Moving average band'], series(Array.from({ length: 30 }, (_, index) => index + 1), 'synthetic-band-'));
    expect(result.ok, result.error?.message).toBe(true);
    // Last 20 closes are 11..30: mean 20.5; population variance (20^2 - 1) / 12 = 33.25; bands 20.5 +/- 2 * sqrt(33.25).
    // The bands are rounded to cents and the basis is no longer plotted (it is the SMA 20 example).
    expect(values(result, 'Upper band').at(-1)).toBe(32.03); expect(values(result, 'Lower band').at(-1)).toBe(8.97); expect(result.value.plots.map((plot: any) => plot.title)).toEqual(['Upper band', 'Lower band']);
    expect(values(result, 'Upper band').slice(0, 19)).toEqual(Array(19).fill(null)); expect(values(result, 'Lower band')[19]).not.toBeNull();
  });
  it('declares the strategy example execution timing and keeps its proposal on the crossing bar', async () => {
    expect(scriptExamples['Moving average cross strategy']).toContain('fills market\n  // proposals at the next bar\'s open');
    const bars = Array.from({ length: 30 }, (_, index) => ({ id: 'synthetic-example-' + index, revision: 1, time: index + 1, open: index + 1, high: index + 2, low: index, close: index + 1, volume: 1 }));
    const result = await run(scriptExamples['Moving average cross strategy'], bars); expect(result.value.orders.map((order: any) => [order.side, order.quantity, order.event.id])).toEqual([['buy', 1, 'synthetic-example-20']]);
  });
  it('creates executable New indicator and New strategy templates', async () => {
    const indicator = await run(newScriptTemplate('indicator')); expect(values(indicator, 'Close')).toEqual([1, 2, 3]);
    expect(newScriptTemplate('strategy')).toBe(scriptExamples['Moving average cross strategy']); expect(compileLVScript(newScriptTemplate('indicator')).ok).toBe(true);
  });
});
