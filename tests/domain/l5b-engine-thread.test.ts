// L5b: the chart's trade marks and the feedback traces run the engine off the interface thread. A loopback port
// stands in for the Worker (structured clone with the same transfer list), so these check the packed protocol, that the
// worker's numbers equal a run on this thread, and that a newer or cancelled request terminates the stale run.
// SYNTHETIC bars and proposals only.
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { strategyChartResult, strategyChartResultAsync } from '../../src/chart/strategy-marks-view';
import { engineMarksOffThread, engineTraceOffThread, handleEngineRequest, marksOf, packEngineJob, setEngineWorkerFactory, unpackEngineJob, type EnginePort, type EngineRequest } from '../../src/strategy-report/engine-thread';
import { engineFeedFor } from '../../src/strategy-report/feedback';
import { runReportJob } from '../../src/strategy-report/backtest';
import { strategyReportJobInput } from '../../src/strategy-report/use-report';
import type { StrategyReportJobInput } from '../../src/strategy-report/types';
import type { StrategyExecution } from '../../src/ui/StrategyDialog';

let state = 5; const next = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
const round2 = (x: number) => Math.round(x * 100) / 100;
const bars = Array.from({ length: 600 }, (_, index) => { const open = round2(100 + Math.sin(index / 9) * 5), close = round2(open + next() - 0.5); return { time: 1_700_000_000 + index * 3600, open, high: round2(Math.max(open, close) + next()), low: round2(Math.min(open, close) - next()), close, volume: 10 }; });
const barIds = bars.map((_, index) => 'synthetic-l5b:' + index);
const event = (index: number) => ({ id: barIds[index], revision: 1, time: bars[index].time });
const proposals = Array.from({ length: 40 }, (_, n) => ({ sequence: n + 1, side: n % 2 ? 'sell' : 'buy', quantity: 1 + (n % 3), event: event(n * 14), virtual: true, options: { id: n % 2 ? 'Short' : 'Long', entry: true } }));
function execution(id = 'synthetic-l5b', orders: Record<string, unknown>[] = proposals): StrategyExecution {
  return { bars, barIds, identity: id, source: 'Explicit synthetic provider; no real security prices', currency: null, timezone: 'UTC', chartType: 'standard', result: { plots: [], alerts: [], state: null, diagnostics: [], elapsedMs: 0, provisional: false, provenance: { kind: 'synthetic', label: 'Synthetic L5b' }, orders } } as unknown as StrategyExecution;
}
const job = (): StrategyReportJobInput => { const prepared = strategyReportJobInput(execution(), DEFAULT_STRATEGY_CONFIG); if (prepared.waiting) throw new Error('waiting'); return prepared.input; };

/** A Worker stand-in: the request and reply each cross a structured clone with their transfer lists, one macrotask apart. */
function loopback(log: { posted: number; terminated: number; transferred: number }): EnginePort {
  const listeners: ((event: { data: unknown }) => void)[] = []; let dead = false;
  return {
    postMessage(message, transfer) {
      log.posted++; log.transferred += transfer.length; const request = structuredClone(message, { transfer }) as EngineRequest;
      setTimeout(() => { if (dead) return; const { reply, transfer: back } = handleEngineRequest(request, engineFeedFor); const data = structuredClone(reply, { transfer: back }); setTimeout(() => { if (!dead) for (const listener of listeners) listener({ data }); }, 0); }, 0);
    },
    terminate() { dead = true; log.terminated++; },
    addEventListener(type, listener) { if (type === 'message') listeners.push(listener); },
  };
}
afterEach(() => setEngineWorkerFactory(null));

describe('L5b engine off the interface thread', () => {
  it('packs bars into one transferred Float64Array and unpacks the same job', () => {
    const input = job(), packed = packEngineJob(input);
    expect(packed.transfer).toHaveLength(1); expect('packed' in packed.job.bars && packed.job.bars.packed.length).toBe(bars.length * 6);
    const back = unpackEngineJob(structuredClone(packed.job, { transfer: packed.transfer }));
    expect(back.execution.bars).toEqual(input.execution.bars); expect(back.execution.barIds).toEqual(input.execution.barIds); expect(back.config).toEqual(input.config);
    expect(runReportJob(back)).toEqual(runReportJob(job()));
    // Bars that are not plain numbers travel unchanged.
    const odd = { ...input, execution: { ...input.execution, bars: [{ ...bars[0], volume: undefined as unknown as number }, ...bars.slice(1)] } };
    expect('rows' in packEngineJob(odd).job.bars).toBe(true);
  });
  it('the worker marks equal the marks rows of a run on this thread', async () => {
    const log = { posted: 0, terminated: 0, transferred: 0 }; setEngineWorkerFactory(() => loopback(log));
    const local = strategyChartResult(execution(), DEFAULT_STRATEGY_CONFIG)!;
    const remote = await engineMarksOffThread(job());
    expect(remote).toEqual(marksOf(local.result as never)); expect(remote!.fills.length).toBeGreaterThan(10); expect(log.posted).toBe(1); expect(log.transferred).toBe(1);
    const chart = await strategyChartResultAsync(execution(), DEFAULT_STRATEGY_CONFIG);
    expect(chart!.result).toEqual(remote); expect(chart!.bars).toBe(bars);
    expect(await strategyChartResultAsync(execution('none', []), DEFAULT_STRATEGY_CONFIG)).toBeNull();
  });
  it('a newer marks request terminates the stale run; the stale promise rejects with an AbortError', async () => {
    const log = { posted: 0, terminated: 0, transferred: 0 }; setEngineWorkerFactory(() => loopback(log));
    const first = engineMarksOffThread(job());
    await new Promise(resolve => setTimeout(resolve, 0)); // the first request is now posted and running
    const second = engineMarksOffThread(job());
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(await second).toEqual(marksOf(runReportJob(job()))); expect(log.terminated).toBe(1);
  });
  it('a feedback trace from the worker has the same text and feed as engineFeedFor, and its signal terminates it', async () => {
    const log = { posted: 0, terminated: 0, transferred: 0 }; setEngineWorkerFactory(() => loopback(log));
    const local = engineFeedFor(job(), bars.length), controller = new AbortController();
    const traced = await engineTraceOffThread(job(), bars.length, controller.signal, engineFeedFor);
    expect(traced.ok).toBe(local.ok); expect(traced.text).toBe(JSON.stringify(local.feed)); expect(traced.feed()).toEqual(local.feed); expect(traced.fillCount).toBe(local.feed.fills.length);
    expect(log.transferred).toBe(1);
    const pending = engineTraceOffThread(job(), bars.length, controller.signal, engineFeedFor);
    await new Promise(resolve => setTimeout(resolve, 0)); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(log.terminated).toBe(1);
  });
  it('without a Worker the trace runs on this thread after a macrotask', async () => {
    const traced = await engineTraceOffThread(job(), bars.length, new AbortController().signal, engineFeedFor);
    expect(traced.text).toBe(JSON.stringify(engineFeedFor(job(), bars.length).feed));
  });
  it('two requests in one macrotask: the first settles as superseded, only the second runs, and no abort listener is left (REVIEW-1027 #3)', async () => {
    const log = { posted: 0, terminated: 0, transferred: 0 }; setEngineWorkerFactory(() => loopback(log));
    const marksA = engineMarksOffThread(job()), marksB = engineMarksOffThread(job());
    await expect(marksA).rejects.toMatchObject({ name: 'AbortError' });
    expect(await marksB).toEqual(marksOf(runReportJob(job()))); expect(log.posted).toBe(1); expect(log.terminated).toBe(0);
    // The feed lane with signals: every listener added is removed once its request settles.
    const counted = () => { const controller = new AbortController(), live = new Set<unknown>(), signal = controller.signal, add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
      signal.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => { live.add(listener); add(type, listener, options); }) as typeof signal.addEventListener;
      signal.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions) => { live.delete(listener); remove(type, listener, options); }) as typeof signal.removeEventListener;
      return { signal, live }; };
    const a = counted(), b = counted();
    const traceA = engineTraceOffThread(job(), bars.length, a.signal, engineFeedFor), traceB = engineTraceOffThread(job(), bars.length, b.signal, engineFeedFor);
    await expect(traceA).rejects.toMatchObject({ name: 'AbortError' });
    expect((await traceB).text).toBe(JSON.stringify(engineFeedFor(job(), bars.length).feed));
    expect(log.posted).toBe(2); expect(log.terminated).toBe(0); expect(a.live.size).toBe(0); expect(b.live.size).toBe(0);
  });
});
