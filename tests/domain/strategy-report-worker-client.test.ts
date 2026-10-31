import { afterEach, expect, it, vi } from 'vitest';
import { createStrategyReportClient } from '../../src/strategy-report/client';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import type { StrategyReportJobInput, StrategyReportOwner } from '../../src/strategy-report/types';

import { ReportLoopbackPort } from './strategy-report-test-port';
function input(): StrategyReportJobInput {
  const bars = [100, 100, 120].map((close, index) => ({ time: 1000 + index, open: close, high: close, low: close, close, volume: 1 })), barIds = ['synthetic:a', 'synthetic:b', 'synthetic:c'];
  return { execution: { bars, barIds, chartType: 'standard', context: { executionId: 'synthetic-owned-report', sourceLabel: 'Explicit synthetic worker test', currency: null, timezone: 'UTC' }, proposals: ['buy', 'sell'].map((side, index) => ({ sequence: index + 1, side, quantity: 1, event: { id: barIds[index], time: bars[index].time, revision: 1 }, virtual: true })) }, config: { ...DEFAULT_STRATEGY_CONFIG, commission: { kind: 'fixed', value: 0 }, initialCapital: 1000 } };
}
const cleanups: (() => void)[] = [];
function setup(factory?: () => ReportLoopbackPort) {
  const ports: ReportLoopbackPort[] = [], abort = new AbortController(); let current = true;
  const owner: StrategyReportOwner = { signal: abort.signal, assertCurrent() { if (!current) throw Error('Source owner retired'); } };
  const client = createStrategyReportClient({ factory: () => { const port = factory?.() ?? new ReportLoopbackPort(); ports.push(port); return port; }, yieldControl: () => Promise.resolve() });
  cleanups.push(() => client.dispose()); return { client, owner, abort, ports, retireOwner() { current = false; } };
}
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.useRealTimers(); });
it('returns bounded owned summaries/pages/curves/inspection and full UTF-8 export with the literal twenty-unit profit', async () => {
  const test = setup(), phases: string[] = [], handle = await test.client.start(input(), test.owner, value => phases.push(value.phase));
  expect(handle.summary.metrics.all.closedNet.value).toBe(20); expect(handle.summary.metrics.all.finalEquity.value).toBe(1020);
  expect(Object.isFrozen(handle.summary.metrics.all)).toBe(true);
  const page = await handle.trades({ side: 'all', query: '', sort: 'number', descending: false, page: 0 }); expect(page.rows[0].netProfit).toBe(20);
  expect((await handle.orders(0)).count).toBe(2); expect((await handle.openLots('all', 0)).count).toBe(0);
  const plot = await handle.plot({ series: 'equity', percent: false, benchmark: true, favorable: false, adverse: false }); expect(plot.values.map(value => value.value)).toEqual([1000, 1000, 1020]);
  expect((await handle.inspect(2)).trade?.netProfit).toBe(20);
  const exported = await handle.export('trades'); expect(exported.format).toBe('csv'); expect(exported.bytes).toBe(new TextEncoder().encode(exported.text).byteLength); expect(exported.text).toContain('Explicit synthetic worker test');
  expect(phases).toEqual(['starting', 'uploading', 'uploading', 'uploading', 'executing', 'reporting', 'ready']);
  expect(test.ports[0].messages.every(message => !Object.hasOwn(message, 'sourceCode'))).toBe(true);
});
it('rejects a full future tail before reading any rows, and never executes element getters or custom serializers', async () => {
  for (const mode of ['tail', 'getter', 'serializer', 'sparse'] as const) {
    const test = setup(), data = input(); let reads = 0;
    if (mode === 'tail') Object.defineProperty(data.execution.bars, '3', { enumerable: true, get() { reads++; return data.execution.bars[0]; } });
    if (mode === 'getter') Object.defineProperty(data.execution.bars, '1', { enumerable: true, get() { reads++; return {}; } });
    if (mode === 'serializer') Object.defineProperty(data.execution.bars[0], 'toJSON', { enumerable: true, value() { reads++; return {}; } });
    if (mode === 'sparse') delete (data.execution.bars as any)[1];
    await expect(test.client.start(data, test.owner)).rejects.toThrow(); expect(reads, mode).toBe(0);
    if (mode === 'tail') expect(test.ports).toHaveLength(0);
  }
});
it('rejects a single oversized row and changed source-array ownership without partial completed output', async () => {
  const test = setup(), data = input(); (data.execution.barIds as string[])[0] = 'x'.repeat(300000);
  await expect(test.client.start(data, test.owner)).rejects.toThrow(/bounded text|byte/); expect(test.ports[0].messages.some(row => row.kind === 'seal')).toBe(false);
  const next = setup(), mutable = input(); await expect(next.client.start(mutable, next.owner, progress => { if (progress.phase === 'uploading') (mutable.execution as any).bars = [...mutable.execution.bars]; })).rejects.toThrow(/changed/);
  expect(next.ports[0].terminated).toBe(1);
});
it('terminates a previous worker before constructing a replacement and rejects its late responses', async () => {
  const order: string[] = [], first = new ReportLoopbackPort(false); const original = first.terminate.bind(first); first.terminate = () => { order.push('terminate:first'); original(); };
  let number = 0; const test = setup(() => { order.push('construct:' + ++number); return number === 1 ? first : new ReportLoopbackPort(); });
  const old = test.client.start(input(), test.owner).catch(error => error); await vi.waitFor(() => expect(test.ports).toHaveLength(1));
  const second = await test.client.start(input(), test.owner); expect(await old).toBeInstanceOf(Error); expect(order).toEqual(['construct:1', 'terminate:first', 'construct:2']);
  first.emit({ version: 1, kind: 'started' }); expect((await second.inspect(2)).point.equity).toBe(1020);
});
it('retirement precedes reentrant terminate callbacks and a failed termination prevents a replacement worker', async () => {
  const test = setup(), handle = await test.client.start(input(), test.owner), port = test.ports[0]; port.throwTerminate = true;
  await expect(test.client.start(input(), test.owner)).rejects.toThrow(/terminated/); expect(test.ports).toHaveLength(1);
  await expect(handle.inspect(0)).rejects.toThrow(); await expect(test.client.start(input(), test.owner)).rejects.toThrow();
  const other = setup(), ready = await other.client.start(input(), other.owner); let reentry: Promise<unknown> | null = null;
  const terminate = other.ports[0].terminate.bind(other.ports[0]); other.ports[0].terminate = () => { reentry = ready.inspect(0).catch(error => error); terminate(); };
  ready.dispose(); expect(await reentry).toBeInstanceOf(Error);
});
it('cancels between chunks and rejects handle copying, owner changes and retained queries after disposal', async () => {
  const test = setup(); await expect(test.client.start(input(), test.owner, progress => { if (progress.phase === 'uploading') test.abort.abort(); })).rejects.toThrow(/cancel/i);
  expect(test.ports[0].messages.some(value => value.kind === 'seal')).toBe(false);
  const next = setup(), handle = await next.client.start(input(), next.owner), copy = { ...handle };
  await expect(copy.inspect(0)).rejects.toThrow(/original/); expect(() => copy.dispose()).toThrow(/original/);
  next.retireOwner(); await expect(handle.inspect(0)).rejects.toThrow(/owner/); expect(next.ports[0].terminated).toBe(1);
});
it('bounds the queued display query and does not let an earlier duplicate response consume the later query', async () => {
  const test = setup(), handle = await test.client.start(input(), test.owner), port = test.ports[0]; port.hold.add('inspect');
  const a = handle.inspect(0), b = handle.inspect(1).catch(error => error), c = handle.inspect(2);
  expect(await b).toMatchObject({ code: 'REPORT_QUERY_SUPERSEDED' });
  const first = port.held.shift()!; first(); expect((await a).point.barIndex).toBe(0); first();
  port.held.shift()!(); expect((await c).point.barIndex).toBe(2);
  expect(port.terminated).toBe(0);
});
it('rejects malformed progress, forged result owners, invalid UTF-8 and oversized export transfers', async () => {
  for (const mode of ['owner', 'schema', 'utf8', 'oversize'] as const) {
    const test = setup(), handle = await test.client.start(input(), test.owner), port = test.ports[0];
    port.reply = (reply, request) => {
      if (mode === 'owner') return { ...reply, job: 'foreign' };
      if (mode === 'schema') return { ...reply, value: { point: { equity: 9 }, trade: null } };
      if (request.kind === 'export') return { ...reply, bytes: mode === 'oversize' ? 20 * 1024 * 1024 + 1 : 2, buffer: new Uint8Array([0xc3, 0x28]).buffer };
      return reply;
    };
    await expect(mode === 'owner' || mode === 'schema' ? handle.inspect(0) : handle.export('json')).rejects.toThrow(); expect(port.terminated).toBe(1);
  }
});
it('handles factory/post failures, owner-reentrant progress and startup/computation watchdog cancellation', async () => {
  const failed = setup(() => { throw Error('Factory failure'); }); await expect(failed.client.start(input(), failed.owner)).rejects.toThrow(/Factory/);
  const posting = setup(() => { const port = new ReportLoopbackPort(); port.throwPost = true; return port; }); await expect(posting.client.start(input(), posting.owner)).rejects.toThrow(/post/);
  const callback = setup(); await expect(callback.client.start(input(), callback.owner, progress => { if (progress.phase === 'ready') callback.client.dispose(); })).rejects.toThrow(/cancel/i);
  vi.useFakeTimers();
  const never = setup(() => new ReportLoopbackPort(false)), pending = never.client.start(input(), never.owner).catch(error => error); await vi.advanceTimersByTimeAsync(10001); expect(await pending).toMatchObject({ code: 'REPORT_STARTUP_TIMEOUT' });
  const stalled = setup(() => { const port = new ReportLoopbackPort(); port.hold.add('seal'); return port; }), computation = stalled.client.start(input(), stalled.owner).catch(error => error); await vi.advanceTimersByTimeAsync(60001); expect(await computation).toMatchObject({ code: 'REPORT_TIMEOUT' });
});
