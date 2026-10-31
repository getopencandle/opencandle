import { afterAll, beforeAll, expect, it } from 'vitest';
import { Worker as NodeWorker } from 'node:worker_threads';
import { build } from 'vite';
import { resolve } from 'node:path';
import { createVwapClient } from '../../src/vwap/client';
import type { VwapCalculationSettings, VwapWorkerPort } from '../../src/vwap/types';

// Executes the actual minified production entry on a separate Node thread with
// a message-event bridge. It does not prove browser or packaged lv:// execution.
let workerUrl: URL;
const workers: NodeWorker[] = [];
beforeAll(async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: true, lib: { entry: resolve('src/vwap/worker.ts'), formats: ['es'], fileName: 'vwap-worker' } } });
  const outputs = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(result => 'output' in result ? result.output : []), chunks = outputs.filter(row => row.type === 'chunk');
  expect(chunks).toHaveLength(1); expect(chunks[0].code).toContain('VWAP_VOLUME');
  const compiled = 'data:text/javascript;base64,' + Buffer.from(chunks[0].code).toString('base64');
  const bridge = `import {parentPort} from 'node:worker_threads';
globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
parentPort.on('message',data=>globalThis.onmessage?.({data}));
await import(${JSON.stringify(compiled)});`;
  workerUrl = new URL('data:text/javascript;base64,' + Buffer.from(bridge).toString('base64'));
}, 30_000);
afterAll(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
function factory(): VwapWorkerPort {
  const worker = new NodeWorker(workerUrl); workers.push(worker);
  const listeners = new Map<(event: any) => void, { type: string; wrapped: (...args: any[]) => void }>();
  return {
    postMessage(message, transfer) { worker.postMessage(message, transfer as ArrayBuffer[]); },
    addEventListener(type, listener) { const wrapped = type === 'message' ? (data: unknown) => listener({ data }) : listener; listeners.set(listener, { type, wrapped }); worker.on(type, wrapped); },
    removeEventListener(_type, listener) { const record = listeners.get(listener); if (record) { worker.off(record.type, record.wrapped); listeners.delete(listener); } },
    terminate() { void worker.terminate(); }
  };
}
const settings: VwapCalculationSettings = { kernelVersion: 2, source: 'hlc3', anchor: 'Session', timezone: 'UTC', transform: 'standard', bandMode: 'Percentage', band1Enabled: true, band1Multiplier: 2, band2Enabled: false, band2Multiplier: 2, band3Enabled: false, band3Multiplier: 3 };
const input = (volume: number) => new Float64Array([1000, 1e308, 1e308, 1e308, 1e308, volume, 1001, 1e308, 1e308, 1e308, 1e308, volume]).buffer;
it('executes exact source and weighted overflow repair plus percentage bands on the actual minified worker', async () => {
  const client = createVwapClient({ factory }), abort = new AbortController();
  try {
    const result = await client.request({ rows: 2, settings, prepare: () => input(1e308) }, { token: {}, signal: abort.signal, assertCurrent() {} }).result;
    expect(result.readChunk('vwap', 0, 2)).toEqual([1e308, 1e308]);
    expect(result.readChunk('upper1', 0, 2)).toEqual([1.02e308, 1.02e308]);
    expect(result.readChunk('lower1', 0, 2)).toEqual([9.8e307, 9.8e307]);
    expect(result.diagnostics).toEqual([]); result.release();
  } finally { client.dispose(); }
}, 10_000);
it('reports missing volume through the actual worker without publishing a partial result', async () => {
  const client = createVwapClient({ factory });
  try { await expect(client.request({ rows: 2, settings, prepare: () => input(NaN) }, { token: {}, signal: new AbortController().signal, assertCurrent() {} }).result).rejects.toThrow(/complete nonnegative finite volume/); }
  finally { client.dispose(); }
}, 10_000);
