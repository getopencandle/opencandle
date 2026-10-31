import { afterEach, expect, it, vi } from 'vitest';
import { assertVwapResultLease, createVwapClient } from '../../src/vwap/client';
import { calculateVwapWorkerMessage } from '../../src/vwap/worker-core';
import type { VwapCalculationSettings, VwapClient, VwapOwner, VwapWorkerPort } from '../../src/vwap/types';

const settings = (): VwapCalculationSettings => ({ kernelVersion: 2, source: 'close', anchor: 'Century', timezone: 'UTC', transform: 'standard', bandMode: 'Percentage', band1Enabled: false, band1Multiplier: 1, band2Enabled: false, band2Multiplier: 2, band3Enabled: false, band3Multiplier: 3 });
const pack = (rows = 2) => new Float64Array(Array.from({ length: rows }, (_, index) => [1000 + index, 10 + index * 10, 10 + index * 10, 10 + index * 10, 10 + index * 10, 1]).flat()).buffer;
const owner = (token = {}): VwapOwner => ({ token, signal: new AbortController().signal, assertCurrent() {} });
const input = (rows = 2) => ({ rows, settings: settings(), prepare: () => pack(rows) });
const drain = async () => { for (let index = 0; index < 24; index++) await Promise.resolve(); };
class FakeWorker implements VwapWorkerPort {
  listeners = new Map<string, Set<(event: any) => void>>(); request: any; output: any; terminations = 0; sends = 0;
  onPost?: () => void; onTerminate?: () => void; onAdd?: (type: string) => void;
  constructor() { queueMicrotask(() => this.emit({ v: 1, type: 'ready' })); }
  addEventListener(type: string, listener: (event: any) => void) { const list = this.listeners.get(type) ?? new Set(); list.add(listener); this.listeners.set(type, list); this.onAdd?.(type); }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  postMessage(message: unknown, transfer: Transferable[]) { this.sends++; this.request = structuredClone(message, { transfer }); this.onPost?.(); }
  terminate() { this.terminations++; this.onTerminate?.(); }
  emit(data: unknown) { for (const listener of this.listeners.get('message') ?? []) listener({ data }); }
  finish(change?: (output: any) => any) { this.output = calculateVwapWorkerMessage(this.request); this.emit(change ? change(this.output) : this.output); }
}
const clients: VwapClient[] = [];
function setup() { const ports: FakeWorker[] = []; const client = createVwapClient({ factory: () => { const port = new FakeWorker(); ports.push(port); return port; } }); clients.push(client); return { client, ports }; }
afterEach(() => { for (const client of clients.splice(0)) try { client.dispose(); } catch { /* Tests assert expected cleanup failures. */ } vi.useRealTimers(); });

it('returns only private complete leases and takes ownership of transferred buffers', async () => {
  const { client, ports } = setup(), request = input(), buffer = pack(); request.prepare = () => buffer;
  const job = client.request(request, owner()); await drain(); expect(buffer.byteLength).toBe(0); ports[0].finish(); const result = await job.result;
  expect(result.readChunk('vwap', 0, 2)).toEqual([10, 15]); expect(result.plots).toEqual([{ id: 'vwap', label: 'VWAP' }]); expect(result.policies.length).toBeGreaterThan(0);
  expect(ports[0].output.values.byteLength).toBe(0); expect(ports[0].output.mask.byteLength).toBe(0);
  for (const invoke of [() => result.valueAt.call({ ...result }, 'vwap', 0), () => result.release.call({ ...result }), () => job.cancel.call({ ...job })]) expect(invoke).toThrow(/receiver/);
  expect(result.valueAt('vwap', 1)).toBe(15); result.release(); result.release(); expect(() => result.valueAt('vwap', 0)).toThrow(/cancel/i);
});
it('the private registry rejects DTO copies, mismatched genuine results and released leases without getters', async () => {
  const { client, ports } = setup(), job = client.request(input(), owner()); await drain(); ports[0].finish(); const lease = await job.result;
  expect(() => assertVwapResultLease(lease, { rows: 2, settings: settings() })).not.toThrow();
  expect(() => assertVwapResultLease(lease, { rows: 2, settings: { ...settings(), source: 'open' } })).toThrow(/match/);
  let reads = 0; const fake = { get assertCurrent() { reads++; return lease.assertCurrent; } };
  expect(() => assertVwapResultLease(fake)).toThrow(/genuine/); expect(() => assertVwapResultLease({ ...lease })).toThrow(/genuine/); expect(reads).toBe(0);
  lease.release(); expect(() => assertVwapResultLease(lease)).toThrow(/cancel/);
});
it('snapshots settings before queueing and only packs active FIFO requests', async () => {
  const { client, ports } = setup(); let packs = 0;
  const first = client.request(input(), owner()), secondInput = input(); secondInput.prepare = () => { packs++; return pack(); };
  const second = client.request(secondInput, owner()); secondInput.settings.band1Enabled = true;
  await drain(); expect(packs).toBe(0); ports[0].finish(); (await first.result).release(); await drain(); expect(packs).toBe(1);
  expect(ports[1].request.settings.band1Enabled).toBe(false); ports[1].finish(); expect((await second.result).plotIds).toEqual(['vwap']);
});
it('replaces an owner at the FIFO tail without letting copied client methods retire it', async () => {
  const { client, ports } = setup(), a = owner(), b = owner();
  const first = client.request(input(), a); const rejected = expect(first.result).rejects.toThrow(/cancel|replaced/i); await drain();
  const second = client.request(input(), b), replacement = client.request(input(), a); await rejected; await drain();
  expect(() => client.request.call({ ...client }, input(), a)).toThrow(/receiver/); expect(ports).toHaveLength(2);
  ports[1].finish(); (await second.result).release(); await drain(); ports[2].finish(); expect((await replacement.result).valueAt('vwap', 1)).toBe(15);
});
it('has explicit empty-prefix unavailability and rejects getters without calling them', () => {
  const { client, ports } = setup(); let calls = 0;
  expect(() => client.request({ ...input(0), prepare: () => { calls++; return pack(0); } }, owner())).toThrow(/prefix/);
  const bad = input(); Object.defineProperty(bad.settings, 'source', { enumerable: true, get() { calls++; return 'close'; } });
  expect(() => client.request(bad, owner())).toThrow(/data/); expect(calls).toBe(0); expect(ports).toHaveLength(0);
});
it('cancels during private packing and never starts a worker for the retired prefix', async () => {
  const { client, ports } = setup(); let complete!: (value: ArrayBuffer) => void;
  const job = client.request({ ...input(), prepare: () => new Promise(resolve => { complete = resolve; }) }, owner());
  const rejected = expect(job.result).rejects.toThrow(/cancel/i); await drain(); job.cancel(); complete(pack()); await rejected; await drain(); expect(ports).toHaveLength(0);
});
it('does not retry a throwing transfer, and retains original plus termination diagnostics', async () => {
  const ports: FakeWorker[] = [], client = createVwapClient({ factory() { const port = new FakeWorker(); ports.push(port); port.onPost = () => { throw new Error('post after detach'); }; port.onTerminate = () => { throw new Error('terminate failed'); }; return port; } }); clients.push(client);
  const buffer = pack(), job = client.request({ ...input(), prepare: () => buffer }, owner());
  await expect(job.result).rejects.toThrow(/post after detach.*terminate failed/); expect(buffer.byteLength).toBe(0); expect(ports[0].sends).toBe(1);
  expect(() => client.request(input(), owner())).toThrow(/quarantined/);
});
it('rejects altered plots, masks and hidden reply fields before any usable result', async () => {
  for (const alter of [(reply: any) => ({ ...reply, plotIds: ['upper1'] }), (reply: any) => { new Uint8Array(reply.mask)[0] = 2; return reply; }, (reply: any) => { Object.defineProperty(reply, 'hidden', { value: true }); return reply; }]) {
    const { client, ports } = setup(), job = client.request(input(), owner()); const rejected = expect(job.result).rejects.toThrow(/plots|mask|fields/);
    await drain(); ports[0].finish(alter); await rejected; client.dispose();
  }
});
it('rechecks parent ownership after final reads and prevents an old result borrowing a replacement', async () => {
  const { client, ports } = setup(); let replace = false, replacement: ReturnType<VwapClient['request']> | undefined;
  const authority: VwapOwner = { ...owner(), assertCurrent: () => { if (replace) { replace = false; replacement = client.request(input(), owner(authority.token)); } } };
  const job = client.request(input(), authority); await drain(); ports[0].finish(); const result = await job.result;
  replace = true; expect(() => result.readChunk('vwap', 0, 2)).toThrow(/cancel/); await drain(); ports[1].finish(); expect((await replacement!.result).valueAt('vwap', 0)).toBe(10);
});
it('includes queued time in deadline and keeps stale callbacks inert', async () => {
  vi.useFakeTimers(); const { client, ports } = setup();
  const first = client.request(input(), owner()), firstFailure = expect(first.result).rejects.toThrow(/start|deadline/);
  await drain(); const second = client.request(input(), owner()), secondFailure = expect(second.result).rejects.toThrow(/deadline|budget/);
  await vi.advanceTimersByTimeAsync(60_001); await firstFailure; await secondFailure;
  for (const port of ports) port.emit({ v: 1, type: 'ready' }); expect(ports.every(port => port.terminations === 1)).toBe(true);
});
it('cleans every attempted listener registration, including write-then-throw acquisition', async () => {
  let port!: FakeWorker;
  const client = createVwapClient({ factory() { port = new FakeWorker(); port.onAdd = type => { if (type === 'error') throw new Error('register after write'); }; return port; } }); clients.push(client);
  const job = client.request(input(), owner()); await expect(job.result).rejects.toThrow(/register after write/);
  expect([...port.listeners.values()].every(set => set.size === 0)).toBe(true); expect(port.terminations).toBe(1);
});
it('preserves cancellation and cleanup failure when a factory returns after reentrant retirement', async () => {
  const abort = new AbortController(); let port!: FakeWorker;
  const client = createVwapClient({ factory() { port = new FakeWorker(); abort.abort(); port.onTerminate = () => { throw new Error('late acquired termination'); }; return port; } }); clients.push(client);
  const job = client.request(input(), { ...owner(), signal: abort.signal });
  await expect(job.result).rejects.toThrow(/cancel.*late acquired termination/); expect(port.terminations).toBe(1); expect(() => client.request(input(), owner())).toThrow(/quarantined/);
});
it('bounds queued requests and reserves complete-result bytes before private packing', async () => {
  const { client } = setup(); let packed = 0;
  const request = { ...input(), prepare: () => { packed++; return new Promise<ArrayBuffer>(() => {}); } };
  const jobs = [client.request(request, owner())]; void jobs[0].result.catch(() => {}); await drain();
  for (let index = 0; index < 16; index++) { const job = client.request(request, owner()); void job.result.catch(() => {}); jobs.push(job); }
  expect(() => client.request(request, owner())).toThrow(/queue is full/); expect(packed).toBe(1); jobs.forEach(job => job.cancel());
  const allBands = { ...settings(), band1Enabled: true, band2Enabled: true, band3Enabled: true };
  const large = { rows: 100000, settings: allBands, prepare: () => new Promise<ArrayBuffer>(() => {}) }, reserved = [];
  for (let index = 0; index < 5; index++) { const job = client.request(large, owner()); void job.result.catch(() => {}); reserved.push(job); }
  expect(() => client.request(large, owner())).toThrow(/buffer capacity/); reserved[0].cancel();
  const next = client.request(large, owner()); void next.result.catch(() => {}); reserved.slice(1).forEach(job => job.cancel()); next.cancel();
});
it('revokes pending validation tasks and ignores their retained callbacks against a replacement', async () => {
  const ports: FakeWorker[] = [], tasks: Array<() => void> = []; let cleanups = 0;
  const client = createVwapClient({ factory() { const port = new FakeWorker(); ports.push(port); return port; }, schedule(resume) { tasks.push(resume); return () => { cleanups++; }; } }); clients.push(client);
  const job = client.request(input(256), owner()), failure = expect(job.result).rejects.toThrow(/cancel/); await drain(); ports[0].finish(); await drain(); expect(tasks).toHaveLength(1);
  job.cancel(); await failure; expect(cleanups).toBe(1);
  const replacement = client.request(input(), owner()); await drain(); tasks[0](); ports[1].finish(); expect((await replacement.result).valueAt('vwap', 0)).toBe(10);
});
it('a hostile thrown Proxy still settles the request and releases the queue', async () => {
  const { client, ports } = setup(), thrown = new Proxy({}, { getPrototypeOf() { throw new Error('no prototype'); }, getOwnPropertyDescriptor() { throw new Error('no descriptors'); } });
  const job = client.request({ ...input(), prepare() { throw thrown; } }, owner()); await expect(job.result).rejects.toThrow(/inspectable/);
  const next = client.request(input(), owner()); await drain(); ports[0].finish(); expect((await next.result).valueAt('vwap', 1)).toBe(15);
});
