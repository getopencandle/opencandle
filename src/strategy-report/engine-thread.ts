import type { StrategyResult } from '../domain/strategy';
import type { Bar } from '../domain/types';
import { STRATEGY_MARK_LIMIT } from '../chart/strategy-marks';
import { runReportJob } from './backtest';
import type { StrategyReportJobInput } from './types';
import type { EngineFeed, FeedPosition } from './feedback';

/**
 * The strategy engine runs the chart's trade marks and the feedback traces off the interface thread. One
 * dedicated local worker per lane ('marks', 'feed') runs the same `runReportJob` the report worker runs, so results are
 * the same numbers. A newer request on a lane, or its signal, terminates a stale run instead of waiting for it.
 * Bars travel as one transferred Float64Array (6 numbers per bar), not 200k cloned records; only the rows the marks
 * draw come back. Without a Worker (tests, or a worker that failed to load) the job runs here after a macrotask, as before.
 */
export type EngineLane = 'marks' | 'feed';
/** What the chart's trade marks read: the last STRATEGY_MARK_LIMIT fills and trades, and the orders those fills name. */
export type EngineMarks = Pick<StrategyResult, 'fills' | 'orders' | 'trades'>;
export interface EngineTrace { ok: boolean; diagnostics: readonly string[]; fillCount: number; /** JSON text of the feed: the settle comparison key. */ text: string; feed(): EngineFeed }

const FIELDS = 6;
type PackedBars = { packed: Float64Array } | { rows: readonly Bar[] };
interface PackedJob { bars: PackedBars; standardBars?: PackedBars; magnifierBars?: PackedBars; execution: Omit<StrategyReportJobInput['execution'], 'bars' | 'standardBars' | 'magnifierBars'>; config: StrategyReportJobInput['config'] }
export interface EngineRequest { id: number; kind: EngineLane; scriptBars: number; job: PackedJob }
export type EngineReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string };

function packBars(bars: readonly Bar[], transfer: Transferable[]): PackedBars {
  const packed = new Float64Array(bars.length * FIELDS);
  for (let i = 0, o = 0; i < bars.length; i++, o += FIELDS) {
    const bar = bars[i];
    // Anything but plain numbers in the six fields keeps the rows as they are (the engine sees exactly what it was given).
    if (!bar || typeof bar.time !== 'number' || typeof bar.open !== 'number' || typeof bar.high !== 'number' || typeof bar.low !== 'number' || typeof bar.close !== 'number' || typeof bar.volume !== 'number') return { rows: bars };
    packed[o] = bar.time; packed[o + 1] = bar.open; packed[o + 2] = bar.high; packed[o + 3] = bar.low; packed[o + 4] = bar.close; packed[o + 5] = bar.volume;
  }
  transfer.push(packed.buffer); return { packed };
}
function unpackBars(value: PackedBars): Bar[] {
  if ('rows' in value) return value.rows as Bar[];
  const packed = value.packed, bars: Bar[] = new Array(packed.length / FIELDS);
  for (let i = 0, o = 0; i < bars.length; i++, o += FIELDS) bars[i] = { time: packed[o], open: packed[o + 1], high: packed[o + 2], low: packed[o + 3], close: packed[o + 4], volume: packed[o + 5] };
  return bars;
}
export function packEngineJob(job: StrategyReportJobInput): { job: PackedJob; transfer: Transferable[] } {
  const transfer: Transferable[] = [], { bars, standardBars, magnifierBars, ...execution } = job.execution;
  return { job: { bars: packBars(bars, transfer), ...(standardBars ? { standardBars: packBars(standardBars, transfer) } : {}), ...(magnifierBars ? { magnifierBars: packBars(magnifierBars, transfer) } : {}), execution, config: job.config }, transfer };
}
export function unpackEngineJob(job: PackedJob): StrategyReportJobInput {
  const { bars, standardBars, magnifierBars } = job;
  const execution = { bars: unpackBars(bars), ...(standardBars ? { standardBars: unpackBars(standardBars) } : {}), ...job.execution, ...(magnifierBars ? { magnifierBars: unpackBars(magnifierBars) } : {}) };
  return { execution, config: job.config };
}

/** The marks' rows of an engine result (null when the run failed). */
export function marksOf(result: StrategyResult): EngineMarks | null {
  if (!result.ok) return null;
  const fills = result.fills.slice(-STRATEGY_MARK_LIMIT), named = new Set(fills.map(fill => fill.orderId));
  return { fills, orders: result.orders.filter(order => named.has(order.id)), trades: result.trades.slice(-STRATEGY_MARK_LIMIT) };
}
interface PackedFeed { ok: boolean; diagnostics: readonly string[]; text: string; fills: EngineFeed['fills']; numbers: Float64Array; kinds: Uint8Array }
/** Positions as numbers plus a kind per bar: 0 no position record, 1 average price present, 2 average price null. */
function packFeed(trace: { feed: EngineFeed; ok: boolean; diagnostics: readonly string[] }, transfer: Transferable[]): PackedFeed {
  const positions = trace.feed.positions, numbers = new Float64Array(positions.length * 3), kinds = new Uint8Array(positions.length);
  for (let i = 0; i < positions.length; i++) { const row = positions[i]; if (!row) continue; kinds[i] = row.averagePrice === null ? 2 : 1; numbers[i * 3] = row.position; numbers[i * 3 + 1] = row.averagePrice ?? 0; numbers[i * 3 + 2] = row.openTrades; }
  transfer.push(numbers.buffer, kinds.buffer);
  return { ok: trace.ok, diagnostics: trace.diagnostics, text: JSON.stringify(trace.feed), fills: trace.feed.fills, numbers, kinds };
}
function unpackFeed(value: PackedFeed): EngineTrace {
  let feed: EngineFeed | null = null;
  return { ok: value.ok, diagnostics: value.diagnostics, fillCount: value.fills.length, text: value.text, feed: () => {
    if (feed) return feed;
    const { numbers, kinds } = value, positions: (FeedPosition | null)[] = new Array(kinds.length);
    for (let i = 0; i < kinds.length; i++) positions[i] = kinds[i] ? { position: numbers[i * 3], averagePrice: kinds[i] === 2 ? null : numbers[i * 3 + 1], openTrades: numbers[i * 3 + 2] } : null;
    return feed = { positions, fills: value.fills };
  } };
}
function localTrace(trace: { feed: EngineFeed; ok: boolean; diagnostics: readonly string[] }): EngineTrace {
  return { ok: trace.ok, diagnostics: trace.diagnostics, fillCount: trace.feed.fills.length, text: JSON.stringify(trace.feed), feed: () => trace.feed };
}

/** Worker side: one request, one reply (with its transferables). `trace` is feedback.ts's engineFeedFor (injected to avoid an import cycle). */
export function handleEngineRequest(request: EngineRequest, trace: (job: StrategyReportJobInput, scriptBars: number) => { feed: EngineFeed; ok: boolean; diagnostics: readonly string[] }): { reply: EngineReply; transfer: Transferable[] } {
  const transfer: Transferable[] = [];
  try {
    const job = unpackEngineJob(request.job);
    const value = request.kind === 'marks' ? marksOf(runReportJob(job)) : packFeed(trace(job, request.scriptBars), transfer);
    return { reply: { id: request.id, ok: true, value }, transfer };
  } catch (cause) { return { reply: { id: request.id, ok: false, message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 2000) }, transfer: [] }; }
}

// ----- host side -----
export interface EnginePort { postMessage(message: unknown, transfer: Transferable[]): void; terminate(): void; addEventListener(type: string, listener: (event: any) => void): void }
let factory: (() => EnginePort) | null = null, broken = false, sequence = 0;
/** Tests inject a transport; null restores the production worker. */
export function setEngineWorkerFactory(next: (() => EnginePort) | null) { factory = next; broken = false; for (const lane of [...lanes.keys()]) retireLane(lane, abortError()); }
function defaultFactory(): EnginePort | null {
  if (typeof Worker !== 'function') return null;
  return new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' }) as unknown as EnginePort;
}
type Lane = { port: EnginePort; pending: { id: number; resolve(value: unknown): void; reject(reason: unknown): void } | null };
const lanes = new Map<EngineLane, Lane>();
const abortError = () => new DOMException('The engine run was replaced or cancelled.', 'AbortError');
const macrotask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function retireLane(name: EngineLane, reason: unknown) {
  const lane = lanes.get(name); if (!lane) return;
  lanes.delete(name); const pending = lane.pending; lane.pending = null;
  try { lane.port.terminate(); } catch { /* already gone */ }
  pending?.reject(reason);
}
function laneFor(name: EngineLane): Lane | null {
  const existing = lanes.get(name); if (existing) return existing;
  if (broken) return null;
  let port: EnginePort | null;
  try { port = (factory ?? defaultFactory)(); } catch { port = null; }
  if (!port) return null;
  const lane: Lane = { port, pending: null };
  port.addEventListener('message', (event: { data: EngineReply }) => {
    const reply = event.data, pending = lane.pending; if (!pending || !reply || reply.id !== pending.id) return;
    lane.pending = null; if (reply.ok) pending.resolve(reply.value); else pending.reject(new Error(reply.message));
  });
  // A worker that cannot load or crashes: later runs fall back to this thread rather than never drawing.
  port.addEventListener('error', () => { broken = true; retireLane(name, new Error('ENGINE_WORKER_FAILURE')); });
  lanes.set(name, lane); return lane;
}
/** The newest request per lane: a request superseded while it waited for its macrotask settles as stale instead of running. */
const latest = new Map<EngineLane, object>();
async function run(kind: EngineLane, job: StrategyReportJobInput, scriptBars: number, signal: AbortSignal | undefined, local: () => unknown): Promise<unknown> {
  const ticket = {}; latest.set(kind, ticket);
  // A newer request on this lane makes the running one stale: terminate it now.
  if (lanes.get(kind)?.pending) retireLane(kind, abortError());
  await macrotask();
  // Two requests in one macrotask both passed the check above: only the newest proceeds, the older rejects as superseded.
  if (latest.get(kind) !== ticket) throw abortError();
  if (signal?.aborted) throw abortError();
  // Never overwrite a pending request: settle (reject) and terminate it before this one takes the lane.
  if (lanes.get(kind)?.pending) retireLane(kind, abortError());
  const lane = laneFor(kind);
  if (!lane) return local();
  const id = ++sequence, packed = packEngineJob(job);
  try {
    return await new Promise((resolve, reject) => {
      const stop = () => retireLane(kind, abortError());
      signal?.addEventListener('abort', stop, { once: true });
      const settle = (fn: (value: any) => void) => (value: unknown) => { signal?.removeEventListener('abort', stop); fn(value); };
      lane.pending = { id, resolve: settle(resolve), reject: settle(reject) };
      try { lane.port.postMessage({ id, kind, scriptBars, job: packed.job } satisfies EngineRequest, packed.transfer); } catch (cause) { retireLane(kind, cause); }
    });
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'ENGINE_WORKER_FAILURE' && !signal?.aborted) return local();
    throw cause;
  }
}
/** The chart's trade marks for a job, computed off this thread. Rejects with an AbortError when superseded. */
export async function engineMarksOffThread(job: StrategyReportJobInput): Promise<EngineMarks | null> {
  return await run('marks', job, 0, undefined, () => marksOf(runReportJob(job))) as EngineMarks | null;
}
/** A feedback trace (feedback.ts engineFeedFor) computed off this thread. */
export async function engineTraceOffThread(job: StrategyReportJobInput, scriptBars: number, signal: AbortSignal, local: (job: StrategyReportJobInput, scriptBars: number) => { feed: EngineFeed; ok: boolean; diagnostics: readonly string[] }): Promise<EngineTrace> {
  const value = await run('feed', job, scriptBars, signal, () => localTrace(local(job, scriptBars)));
  return 'feed' in (value as object) ? value as EngineTrace : unpackFeed(value as PackedFeed);
}
