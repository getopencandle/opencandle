import { copyDiagnostics, copyVwapSettings, errorText, exactBuffer, integer, ownData, ownList, reject, text, VwapError, vwapPlots, VWAP_EXACT_POLICIES } from './protocol';
import { VWAP_WORKER_LIMITS as LIMIT, type VwapCalculationSettings, type VwapClient, type VwapClientOptions, type VwapDiagnostic, type VwapJob, type VwapOwner, type VwapPlot, type VwapPlotId, type VwapRequest, type VwapResultLease, type VwapWorkerPort } from './types';

type Phase = 'queued' | 'preparing' | 'starting' | 'calculating' | 'validating' | 'complete' | 'retired';
type YieldTask = { cleanup: (() => void) | null; resolve(): void; reject(cause: unknown): void; consumed: boolean };
interface JobState {
  id: string; owner: VwapOwner; rows: number; settings: Readonly<VwapCalculationSettings>; plots: readonly VwapPlot[]; prepare: VwapRequest['prepare']; phase: Phase;
  admitted: number; reserved: number; controller: AbortController; handle: VwapJob; resolve(lease: VwapResultLease): void; reject(cause: unknown): void;
  totalTimer: ReturnType<typeof setTimeout> | null; startupTimer: ReturnType<typeof setTimeout> | null;
  abortAttempted: boolean; abortListener: () => void; port: VwapWorkerPort | null; listeners: Array<[string, (event: any) => void]>;
  values: Float64Array | null; mask: Uint8Array | null; diagnostics: readonly VwapDiagnostic[]; yieldTask: YieldTask | null; messages: number;
  retirement: { cause: unknown; cleanup: unknown[]; task: YieldTask | null } | null;
}
const defaultFactory = (): VwapWorkerPort => {
  if (typeof Worker !== 'function') reject('VWAP_WORKER_UNAVAILABLE', 'A local VWAP worker is unavailable. The exact kernel was not run on the interface thread.');
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
};
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const messageDataGetter = typeof MessageEvent === 'function' ? Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data')?.get : undefined;
const detachedClone = structuredClone;
const cancelled = (message = 'This VWAP calculation was cancelled or replaced.') => new VwapError('VWAP_CANCELLED', message);
function error(cause: unknown): VwapError { try { if (cause instanceof VwapError) return cause; } catch { /* A thrown Proxy must not break terminal settlement. */ } return new VwapError('VWAP_CLIENT', errorText(cause)); }
const leases = new WeakMap<object, { assertCurrent(): void; release(): void; rows: number; settings: Readonly<VwapCalculationSettings> }>();
/** Genuine service identity plus current lifetime. Source/run correlation remains the host's separate responsibility. */
export function assertVwapResultLease(value: unknown, expected?: { rows: number; settings: VwapCalculationSettings }): asserts value is VwapResultLease {
  const record = value !== null && typeof value === 'object' ? leases.get(value) : undefined;
  if (!record) reject('VWAP_LEASE', 'A genuine current VWAP result lease is required.');
  record.assertCurrent();
  if (expected) {
    const data = ownData(expected, ['rows', 'settings'], 'Expected VWAP result'), settings = copyVwapSettings(data.settings);
    if (data.rows !== record.rows || (Object.keys(settings) as Array<keyof VwapCalculationSettings>).some(key => !Object.is(settings[key], record.settings[key]))) reject('VWAP_LEASE', 'The VWAP lease does not match the requested prefix length and calculation settings.');
  }
  record.assertCurrent();
}
/** Cleanup uses the retained genuine method even when source retirement made reads unavailable. */
export function releaseVwapResultLease(value: unknown): void {
  const record = value !== null && typeof value === 'object' ? leases.get(value) : undefined;
  if (!record) reject('VWAP_LEASE', 'A genuine VWAP result lease is required for release.');
  record.release();
}

/** Application-owned FIFO service. Packed inputs and result buffers never escape their exact job. */
export function createVwapClient(options: VwapClientOptions = {}): VwapClient {
  const optionKeys = Reflect.ownKeys(options);
  if (optionKeys.some(key => typeof key !== 'string' || !['factory', 'schedule', 'clock'].includes(key))) reject('VWAP_OPTIONS', 'Unsupported VWAP client option.');
  const configuration = ownData(options, optionKeys as string[], 'VWAP client options');
  for (const key of optionKeys as string[]) if (typeof configuration[key] !== 'function') reject('VWAP_OPTIONS', 'VWAP test seams must be functions.');
  const factory = (configuration.factory ?? defaultFactory) as () => VwapWorkerPort;
  const schedule = (configuration.schedule ?? ((resume: () => void) => { const timer = setTimeout(resume, 0); return () => clearTimeout(timer); })) as (resume: () => void) => () => void;
  const clock = (configuration.clock ?? (() => performance.now())) as () => number;
  let disposed = false, quarantined = false, quarantineDraining = false, barrier = 0, sequence = 0, reservedBytes = 0, lastClock = -Infinity, active: JobState | null = null, pumpPending = false;
  const queue: JobState[] = [], owners = new Map<object, JobState>();
  function now(): number {
    const value = clock();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value < lastClock) reject('VWAP_CLOCK', 'The VWAP clock is not finite and monotonic.');
    lastClock = value; return value;
  }
  function signalAborted(signal: AbortSignal): boolean {
    try { return abortedGetter.call(signal); } catch { reject('VWAP_OWNER', 'An actual AbortSignal is required.'); }
  }
  function live(job: JobState): void {
    if (disposed || quarantined || job.phase === 'retired' || owners.get(job.owner.token) !== job || signalAborted(job.owner.signal)) throw cancelled();
  }
  function check(job: JobState, deadline = true): void {
    live(job); job.owner.assertCurrent(); live(job);
    if (deadline && job.phase !== 'complete') { const time = now(); live(job); if (time - job.admitted >= LIMIT.totalMs) reject('VWAP_TIMEOUT', 'The VWAP request exceeded its queue-inclusive time budget.'); }
  }
  function kick(): void {
    if (pumpPending || disposed || quarantined) return;
    pumpPending = true; queueMicrotask(() => { pumpPending = false; if (!barrier && !active && !disposed && !quarantined) { const next = queue.shift(); if (next) { active = next; next.phase = 'preparing'; void start(next); } } });
  }
  function cleanupPort(job: JobState, failures: unknown[]): void {
    const port = job.port, listeners = job.listeners.splice(0); job.port = null;
    if (!port) return;
    for (const [type, listener] of listeners) try { port.removeEventListener(type, listener); } catch (cause) { failures.push(cause); }
    try { port.terminate(); } catch (cause) { failures.push(cause); quarantined = true; }
  }
  function combined(cause: unknown, failures: unknown[]): VwapError {
    const first = error(cause), suffix = failures.slice(0, 3).map(errorText).join(' | ');
    return suffix ? new VwapError('VWAP_CLEANUP', `${first.message.slice(0, 700)} | Cleanup: ${suffix}`.slice(0, 2048)) : first;
  }
  function quarantineRemaining(): void {
    if (!quarantined || quarantineDraining) return;
    quarantineDraining = true;
    try { for (const waiting of [...owners.values()]) retire(waiting, new VwapError('VWAP_QUARANTINED', 'Worker cleanup failed; no replacement calculation was started.')); }
    finally { quarantineDraining = false; }
  }
  function retire(job: JobState, cause: unknown = cancelled()): VwapError | null {
    if (job.phase === 'retired') return null;
    job.phase = 'retired'; if (owners.get(job.owner.token) === job) owners.delete(job.owner.token);
    const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
    if (active === job) active = null;
    reservedBytes -= job.reserved; job.reserved = 0; job.values = null; job.mask = null;
    if (job.totalTimer !== null) clearTimeout(job.totalTimer); job.totalTimer = null;
    if (job.startupTimer !== null) clearTimeout(job.startupTimer); job.startupTimer = null;
    const task = job.yieldTask; job.yieldTask = null;
    const failures: unknown[] = []; job.retirement = { cause, cleanup: failures, task }; barrier++;
    try {
      if (job.abortAttempted) try { job.owner.signal.removeEventListener('abort', job.abortListener); } catch (failure) { failures.push(failure); }
      job.abortAttempted = false;
      try { job.controller.abort(); } catch (failure) { failures.push(failure); }
      if (task?.cleanup) try { task.cleanup(); } catch (failure) { failures.push(failure); }
      cleanupPort(job, failures);
    } finally { barrier--; }
    // Synchronous acquisition can return a late resource after cancellation.
    // Settle after that stack unwinds so its cleanup failure is not lost.
    queueMicrotask(() => { const record = job.retirement; if (!record) return; job.retirement = null; const failure = combined(record.cause, record.cleanup); record.task?.reject(failure); job.reject(failure); });
    const failure = combined(cause, failures);
    if (quarantined) quarantineRemaining();
    else kick();
    return failures.length ? failure : null;
  }
  function pause(job: JobState): Promise<void> {
    check(job);
    if (job.yieldTask) reject('VWAP_SCHEDULER', 'A VWAP yield is already pending.');
    return new Promise((resolve, rejectPromise) => {
      const task: YieldTask = { cleanup: null, resolve, reject: rejectPromise, consumed: false }; job.yieldTask = task;
      let acquiring = true, synchronous = false;
      const resume = () => {
        if (job.yieldTask !== task || task.consumed || job.phase === 'retired') return;
        task.consumed = true;
        if (acquiring) { synchronous = true; return; }
        job.yieldTask = null;
        try { if (task.cleanup) task.cleanup(); check(job); resolve(); } catch (cause) { rejectPromise(cause); retire(job, cause); }
      };
      try {
        barrier++; let cleanup: () => void;
        try { cleanup = schedule(resume); } finally { barrier--; acquiring = false; }
        if (typeof cleanup !== 'function') reject('VWAP_SCHEDULER', 'The VWAP scheduler did not return cleanup.');
        task.cleanup = cleanup;
        if (job.phase === 'retired' || job.yieldTask !== task) { try { cleanup(); } catch (cause) { job.retirement?.cleanup.push(cause); quarantined = true; quarantineRemaining(); } return; }
        if (synchronous) reject('VWAP_SCHEDULER', 'The VWAP scheduler must resume asynchronously.');
      } catch (cause) { retire(job, cause); rejectPromise(cause); }
    });
  }
  function eventData(event: unknown): unknown {
    if (messageDataGetter) try { return messageDataGetter.call(event); } catch { /* Controlled test ports use an own data field. */ }
    if (event === null || typeof event !== 'object') reject('VWAP_PROTOCOL', 'The VWAP message event is invalid.');
    const descriptor = Object.getOwnPropertyDescriptor(event, 'data');
    if (!descriptor || !('value' in descriptor)) reject('VWAP_PROTOCOL', 'The VWAP message data must not be an accessor.');
    return descriptor.value;
  }
  async function start(job: JobState): Promise<void> {
    try {
      check(job);
      const prepared = await job.prepare(job.controller.signal); check(job);
      const buffer = exactBuffer(prepared, job.rows * 6 * 8, 'Packed VWAP input'); check(job);
      job.phase = 'starting';
      barrier++;
      try {
        const port = factory(); job.port = port;
        if (!port || typeof port.postMessage !== 'function' || typeof port.addEventListener !== 'function' || typeof port.removeEventListener !== 'function' || typeof port.terminate !== 'function') reject('VWAP_WORKER', 'The VWAP worker transport is incomplete.');
        check(job);
        const onMessage = (event: unknown) => {
          if (job.phase === 'retired') return;
          try {
            const payload = eventData(event);
            if (++job.messages > 2) reject('VWAP_PROTOCOL', 'The VWAP worker sent too many messages.');
            // A throwing postMessage/acquisition must retire before a synchronous fake reply is handled.
            queueMicrotask(() => { if (job.phase !== 'retired') void receive(job, payload, buffer); });
          } catch (cause) { retire(job, cause); }
        };
        const onError = () => retire(job, new VwapError('VWAP_WORKER', 'The local VWAP worker failed or could not load.'));
        for (const [type, listener] of [['message', onMessage], ['error', onError], ['messageerror', onError]] as const) { job.listeners.push([type, listener]); port.addEventListener(type, listener); check(job); }
        job.startupTimer = setTimeout(() => { if (job.phase === 'starting') retire(job, new VwapError('VWAP_STARTUP', 'The VWAP worker did not start within its deadline.')); }, LIMIT.startupMs);
      } finally { barrier--; }
    } catch (cause) {
      // Acquisition may return a transport after reentrant cancellation; still dispose that exact port.
      if (job.phase === 'retired') {
        if (error(cause).code !== 'VWAP_CANCELLED') job.retirement?.cleanup.push(cause);
        if (job.port) { const failures: unknown[] = []; barrier++; try { cleanupPort(job, failures); } finally { barrier--; } job.retirement?.cleanup.push(...failures); if (failures.length) quarantined = true; }
        quarantineRemaining();
      } else retire(job, cause);
      kick();
    }
  }
  async function receive(job: JobState, payload: unknown, input: ArrayBuffer): Promise<void> {
    try {
      check(job);
      if (job.phase === 'starting') {
        const ready = ownData(payload, ['v', 'type'], 'VWAP ready reply');
        if (ready.v !== 1 || ready.type !== 'ready') reject('VWAP_PROTOCOL', 'Unexpected VWAP startup reply.');
        if (job.startupTimer !== null) clearTimeout(job.startupTimer); job.startupTimer = null;
        job.phase = 'calculating'; check(job); exactBuffer(input, job.rows * 6 * 8, 'Packed VWAP input');
        barrier++;
        try { job.port!.postMessage({ v: 1, type: 'calculate', job: job.id, rows: job.rows, settings: job.settings, buffer: input }, [input]); } finally { barrier--; }
        check(job); return;
      }
      if (job.phase !== 'calculating') reject('VWAP_PROTOCOL', 'Unexpected VWAP result phase.');
      const typeDescriptor = payload !== null && typeof payload === 'object' ? Object.getOwnPropertyDescriptor(payload, 'type') : undefined;
      if (!typeDescriptor || !('value' in typeDescriptor)) reject('VWAP_PROTOCOL', 'VWAP reply type must be own data.');
      if (typeDescriptor.value === 'error') {
        const failure = ownData(payload, ['v', 'type', 'code', 'message'], 'VWAP error reply');
        if (failure.v !== 1) reject('VWAP_PROTOCOL', 'Unsupported VWAP error protocol.');
        throw new VwapError(text(failure.code, 64, 'VWAP error code'), text(failure.message, LIMIT.errorCharacters, 'VWAP error message'));
      }
      const result = ownData(payload, ['v', 'type', 'job', 'rows', 'plotIds', 'values', 'mask', 'diagnostics'], 'VWAP result');
      if (result.v !== 1 || result.type !== 'result' || result.job !== job.id || result.rows !== job.rows) reject('VWAP_PROTOCOL', 'VWAP result does not belong to this calculation.');
      const plotIds = ownList(result.plotIds, 7, 'VWAP plot IDs');
      if (plotIds.length !== job.plots.length || plotIds.some((id, index) => id !== job.plots[index].id)) reject('VWAP_PROTOCOL', 'VWAP result plots do not match the captured settings.');
      const cells = job.rows * job.plots.length;
      const values = exactBuffer(result.values, cells * 8, 'VWAP values'), mask = exactBuffer(result.mask, cells, 'VWAP mask');
      const diagnostics = copyDiagnostics(result.diagnostics, job.plots); check(job);
      const detached = detachedClone({ values, mask }, { transfer: [values, mask] });
      job.values = new Float64Array(detached.values); job.mask = new Uint8Array(detached.mask); job.diagnostics = diagnostics; job.phase = 'validating';
      const chunkCells = LIMIT.chunkRows * job.plots.length;
      for (let start = 0; start < cells; start += chunkCells) {
        check(job);
        for (let index = start; index < Math.min(cells, start + chunkCells); index++) {
          const flag = job.mask![index], value = job.values![index];
          if ((flag !== 0 && flag !== 1) || !Number.isFinite(value) || (flag === 0 && !Object.is(value, 0))) reject('VWAP_PROTOCOL', 'VWAP output mask/value is invalid.');
        }
        if (start + chunkCells < cells) await pause(job);
      }
      check(job);
      const failures: unknown[] = []; barrier++; try { cleanupPort(job, failures); } finally { barrier--; }
      if (failures.length) throw combined(new VwapError('VWAP_CLEANUP', 'The completed worker could not be cleaned up.'), failures);
      check(job); job.phase = 'complete'; if (job.totalTimer !== null) clearTimeout(job.totalTimer); job.totalTimer = null; active = null;
      const lease = makeLease(job); job.resolve(lease); kick();
    } catch (cause) { retire(job, cause); }
  }
  function makeLease(job: JobState): VwapResultLease {
    const before = (receiver: VwapResultLease) => { if (receiver !== lease) reject('VWAP_RECEIVER', 'Foreign VWAP result receiver.'); check(job, false); if (job.phase !== 'complete' || !job.values || !job.mask) throw cancelled(); };
    const position = (plot: VwapPlotId, index: number) => { const column = job.plots.findIndex(row => row.id === plot); if (column < 0) reject('VWAP_PLOT', 'Inactive VWAP plot.'); integer(index, 0, job.rows - 1, 'VWAP value index'); return column * job.rows + index; };
    const lease: VwapResultLease = Object.freeze({
      rows: job.rows, plots: job.plots, plotIds: Object.freeze(job.plots.map(plot => plot.id)), policies: VWAP_EXACT_POLICIES, diagnostics: job.diagnostics,
      assertCurrent(this: VwapResultLease) { before(this); },
      valueAt(this: VwapResultLease, plot: VwapPlotId, index: number) { before(this); const offset = position(plot, index), value = job.mask![offset] ? job.values![offset] : null; before(this); return value; },
      readChunk(this: VwapResultLease, plot: VwapPlotId, start: number, count: number) { before(this); integer(count, 0, LIMIT.chunkRows, 'VWAP chunk size'); integer(start, 0, job.rows, 'VWAP chunk start'); if (start + count > job.rows) reject('VWAP_RANGE', 'VWAP chunk exceeds the prefix.'); const column = job.plots.findIndex(row => row.id === plot); if (column < 0) reject('VWAP_PLOT', 'Inactive VWAP plot.'); const output: (number | null)[] = []; for (let index = start; index < start + count; index++) { const offset = column * job.rows + index; output.push(job.mask![offset] ? job.values![offset] : null); } before(this); return Object.freeze(output); },
      release(this: VwapResultLease) { if (this !== lease) reject('VWAP_RECEIVER', 'Foreign VWAP result receiver.'); if (job.phase === 'retired') return; const failure = retire(job, cancelled('The VWAP result was released.')); if (failure) throw failure; }
    });
    leases.set(lease, { rows: job.rows, settings: job.settings, assertCurrent: () => before(lease), release: () => lease.release() });
    return lease;
  }
  const client: VwapClient = Object.freeze({
    request(this: VwapClient, input: VwapRequest, owner: VwapOwner): VwapJob {
      if (this !== client) reject('VWAP_RECEIVER', 'Foreign VWAP client receiver.');
      if (disposed || quarantined || barrier) reject('VWAP_UNAVAILABLE', 'The VWAP client is disposed, quarantined or acquiring an owned operation.');
      barrier++;
      try {
        const fields = ownData(input, ['rows', 'settings', 'prepare'], 'VWAP input'), ownerFields = ownData(owner, ['token', 'signal', 'assertCurrent'], 'VWAP owner');
        const rows = integer(fields.rows, 0, LIMIT.rows, 'VWAP rows'), settings = copyVwapSettings(fields.settings), plots = vwapPlots(settings);
        if (typeof fields.prepare !== 'function' || ownerFields.token === null || typeof ownerFields.token !== 'object' || typeof ownerFields.assertCurrent !== 'function') reject('VWAP_OWNER', 'Invalid VWAP prepare/owner authority.');
        const captured: VwapOwner = Object.freeze({ token: ownerFields.token as object, signal: ownerFields.signal as AbortSignal, assertCurrent: ownerFields.assertCurrent as () => void });
        if (signalAborted(captured.signal)) throw cancelled(); captured.assertCurrent(); if (disposed || quarantined || signalAborted(captured.signal)) throw cancelled();
        if (rows === 0) reject('VWAP_EMPTY_PREFIX', 'VWAP is unavailable until the current prefix contains bars.');
        const admitted = now(), previous = owners.get(captured.token), bytes = rows * plots.length * 9;
        if (rows * 6 * 8 + bytes > LIMIT.activeBytes || reservedBytes - (previous?.reserved ?? 0) + bytes > LIMIT.resultBytes) reject('VWAP_BUDGET', 'VWAP owned buffer capacity is exhausted. Release old results or reduce history.');
        if (queue.length - (previous?.phase === 'queued' ? 1 : 0) >= LIMIT.queued) reject('VWAP_QUEUE', 'The local VWAP calculation queue is full.');
        if (previous) retire(previous);
        if (quarantined || disposed) reject('VWAP_UNAVAILABLE', 'The previous VWAP worker could not be retired.');
        let resolve!: (lease: VwapResultLease) => void, rejectPromise!: (cause: unknown) => void;
        const result = new Promise<VwapResultLease>((yes, no) => { resolve = yes; rejectPromise = no; });
        const job = {} as JobState;
        const handle: VwapJob = Object.freeze({ result,
          assertCurrent(this: VwapJob) { if (this !== handle) reject('VWAP_RECEIVER', 'Foreign VWAP job receiver.'); check(job); },
          cancel(this: VwapJob, reason = 'This VWAP calculation was cancelled.') { if (this !== handle) reject('VWAP_RECEIVER', 'Foreign VWAP job receiver.'); text(reason, 512, 'VWAP cancellation reason'); const failure = retire(job, cancelled(reason)); if (failure) throw failure; }
        });
        Object.assign(job, { id: `lv-vwap-${++sequence}`, owner: captured, rows, settings, plots, prepare: fields.prepare as VwapRequest['prepare'], phase: 'queued', admitted, reserved: bytes, controller: new AbortController(), handle, resolve, reject: rejectPromise, totalTimer: null, startupTimer: null, abortAttempted: false, abortListener: () => retire(job), port: null, listeners: [], values: null, mask: null, diagnostics: Object.freeze([]), yieldTask: null, messages: 0, retirement: null });
        owners.set(captured.token, job); reservedBytes += bytes; queue.push(job);
        try {
          job.abortAttempted = true; captured.signal.addEventListener('abort', job.abortListener, { once: true }); check(job);
          job.totalTimer = setTimeout(() => retire(job, new VwapError('VWAP_TIMEOUT', 'The VWAP request exceeded its queue-inclusive deadline.')), LIMIT.totalMs);
        } catch (cause) { retire(job, cause); }
        return handle;
      } finally { barrier--; kick(); }
    },
    dispose(this: VwapClient) {
      if (this !== client) reject('VWAP_RECEIVER', 'Foreign VWAP client receiver.');
      if (disposed) return; disposed = true; barrier++; const failures: string[] = [];
      try { for (const job of [...owners.values()]) { const failure = retire(job, cancelled('The VWAP service was disposed.')); if (failure) failures.push(failure.message); } } finally { barrier--; }
      if (failures.length) throw new VwapError('VWAP_CLEANUP', failures.slice(0, 3).join(' | ').slice(0, 2048));
    }
  });
  return client;
}
