import { afterAll, beforeAll, expect, it } from 'vitest';
import { Worker as NodeWorker } from 'node:worker_threads';
import { build } from 'vite';
import { resolve } from 'node:path';
import { createStrategyReportClient, type ReportWorkerPort } from '../../src/strategy-report/client';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import type { StrategyReportJobInput } from '../../src/strategy-report/types';

// Actual separate-thread execution of the Vite-bundled production worker entry.
// The Node event bridge does not prove Electron's private-origin worker loading.
let workerUrl: URL;
const workers: NodeWorker[] = [];
beforeAll(async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: resolve('src/strategy-report/worker.ts'), formats: ['es'], fileName: 'report-worker' } } });
  const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(result => 'output' in result ? result.output : []);
  const chunks = outputs.filter(output => output.type === 'chunk'); expect(chunks).toHaveLength(1);
  const code = chunks[0].code; expect(code).toContain('StrategyReportWorkerSession');
  const compiled = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const bridge = `import { parentPort } from 'node:worker_threads';
globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
globalThis.addEventListener=(type,listener)=>{if(type==='message')parentPort.on('message',data=>listener({data}));};
await import(${JSON.stringify(compiled)});`;
  workerUrl = new URL('data:text/javascript;base64,' + Buffer.from(bridge).toString('base64'));
}, 30000);
afterAll(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
function factory(): ReportWorkerPort {
  const worker = new NodeWorker(workerUrl); workers.push(worker);
  const listeners = new Map<(event: any) => void, { type: string; listener: (...args: any[]) => void }>();
  return {
    postMessage: message => worker.postMessage(message), terminate: () => { void worker.terminate(); },
    addEventListener(type, listener) { const wrapped = type === 'message' ? (data: unknown) => listener({ data }) : listener; listeners.set(listener, { type, listener: wrapped }); worker.on(type, wrapped); },
    removeEventListener(type, listener) { const entry = listeners.get(listener); if (entry) worker.off(type, entry.listener); },
  };
}
function input(count = 6): StrategyReportJobInput {
  const bars = Array.from({ length: count }, (_, index) => { const price = [2, 4, 8, 10, 6, 12][index % 6]; return { time: 1000 + index, open: price, high: price + 1, low: price - 1, close: price, volume: index + 1 }; });
  const barIds = bars.map((_, index) => 'synthetic-thread:' + index);
  return { execution: { bars, barIds, chartType: 'standard', context: { executionId: 'synthetic-thread-oracle', sourceLabel: 'Deterministic synthetic actual-worker test', currency: 'USD', timezone: 'UTC' }, proposals: [
    { sequence: 1, side: 'buy', quantity: 1, event: { id: barIds[0], time: bars[0].time, revision: 1 }, virtual: true },
    { sequence: 2, side: 'sell', quantity: 1, event: { id: barIds[3], time: bars[3].time, revision: 1 }, virtual: true },
  ] }, config: { ...DEFAULT_STRATEGY_CONFIG, commission: { kind: 'fixed', value: 0 }, initialCapital: 1000 } };
}
it('executes the production entry on a real worker and preserves literal next-open fills, equity and export', async () => {
  const client = createStrategyReportClient({ factory }), abort = new AbortController(); let beats = 0;
  const heartbeat = setInterval(() => beats++, 1);
  try {
    const handle = await client.start(input(), { signal: abort.signal, assertCurrent() {} });
    expect(handle.summary.metrics.all.closedNet.value).toBe(2);
    const table = await handle.trades({ side: 'all', query: '', sort: 'number', descending: false, page: 0 });
    expect(table.rows[0]).toMatchObject({ entryPrice: 4, exitPrice: 6, entry: { barIndex: 1 }, exit: { barIndex: 4 }, netProfit: 2 });
    const curve = await handle.plot({ series: 'equity', percent: false, benchmark: false, favorable: false, adverse: false });
    expect(curve.values.map(point => point.value)).toEqual([1000, 1000, 1004, 1006, 1002, 1002]);
    const exported = await handle.export('json'); expect(JSON.parse(exported.text).metrics.all.closedNet.value).toBe(2); expect(exported.bytes).toBe(Buffer.byteLength(exported.text, 'utf8')); expect(beats).toBeGreaterThan(0);
  } finally { clearInterval(heartbeat); client.dispose(); }
}, 20000);
it('terminates an actual worker after execution starts and never returns a completed report from the cancelled job', async () => {
  const client = createStrategyReportClient({ factory }), abort = new AbortController(), phases: string[] = [];
  try {
    await expect(client.start(input(10000), { signal: abort.signal, assertCurrent() {} }, progress => { phases.push(progress.phase); if (progress.phase === 'executing') abort.abort(); })).rejects.toThrow(/cancel/i);
    expect(phases).toContain('executing'); expect(phases).not.toContain('ready');
  } finally { client.dispose(); }
}, 20000);
