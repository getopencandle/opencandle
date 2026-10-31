import type { StrategyReportSide } from '../domain/strategy-report';
import { reportTradeMatches } from '../domain/strategy-report-view';
import { boundedText, copyWire, integer, ownArray, ownAt, ownRecord, reject, ReportWorkerError } from './data';
import { ALL_REPORT_SECTIONS, exact, REPORT_SECTIONS, validateReportRow, validateReportStart } from './schema';
import { copyReply, freezeData, validateQuery, validateResult, validateSummary } from './responses';
import { REPORT_WORKER_LIMITS as LIMIT, type ReportExport, type ReportExportKind, type ReportInspection, type ReportOpenLotPage, type ReportOrderPage, type ReportPlotQuery, type ReportPlotResponse, type ReportSection, type ReportStart, type ReportUploadSection, type ReportTradePage, type ReportTradeQuery, type StrategyReportHandle, type StrategyReportJobInput, type StrategyReportOwner, type StrategyReportProgress, type StrategyReportSummary } from './types';

/** Host execution fields; the Bar Magnifier and forming-bar fields are optional. */
const HOST_EXECUTION_FIELDS = ['bars', 'standardBars', 'barIds', 'proposals', 'context', 'chartType', 'magnifierBars', 'magnifierLabel', 'formingBar', 'fillProposals'];
export interface ReportWorkerPort {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}
export interface StrategyReportClient {
  start(input: StrategyReportJobInput, owner: StrategyReportOwner, onProgress?: (progress: StrategyReportProgress) => void): Promise<StrategyReportHandle>;
  dispose(): void;
}
export interface ReportClientOptions {
  /** Injectable transport for protocol tests. Production always uses the static local worker below. */
  factory?: () => ReportWorkerPort;
  yieldControl?: () => Promise<void>;
}
function defaultWorker(): ReportWorkerPort {
  if (typeof Worker !== 'function') reject('REPORT_WORKER_UNAVAILABLE', 'A local report worker is unavailable. No large calculation was run on the interface thread.');
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}
/** Arrays up to this many rows are checked with one native own-key list (also rejecting named extra properties). */
export const OWN_KEY_SCAN_ROWS = 20000;
const hasOwn = Object.prototype.hasOwnProperty;
const cancelled = () => new ReportWorkerError('REPORT_CANCELLED', 'This report request was cancelled or replaced.');
const boundedError = (cause: unknown) => cause instanceof ReportWorkerError ? cause : new ReportWorkerError('REPORT_CLIENT', cause instanceof Error ? cause.message.slice(0, LIMIT.errorCharacters) : 'Report operation failed.');
type Pending = { sequence: number; kind: string; fields: Record<string, unknown>; timer: ReturnType<typeof setTimeout>; resolve(value: any): void; reject(reason: unknown): void };
type Query = { kind: string; fields: Record<string, unknown>; resolve(value: any): void; reject(reason: unknown): void };

/** One owned worker, one in-flight message and one replaceable queued display query. */
class ReportJob {
  private retired = false; private terminationFailed = false; private retirementError: ReportWorkerError | null = null; private port: ReportWorkerPort | null = null;
  private sequence = 0; private readonly job = crypto.randomUUID(); private pending: Pending | null = null;
  private startup: { resolve(): void; reject(reason: unknown): void; timer: ReturnType<typeof setTimeout> } | null = null;
  private activeQuery: Query | null = null; private queuedQuery: Query | null = null;
  private summary: StrategyReportSummary | null = null; private totalRows = 0; private stagedBytes = 0; private progressPhase = 0;
  private channel: MessageChannel | null = null;
  private yielding: { resolve(): void; reject(reason: unknown): void; timer?: ReturnType<typeof setTimeout> } | null = null;
  private calculationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ownedUploadBytes = new WeakMap<Record<string, unknown>, number>();
  private readonly onMessage = (event: { data: unknown }) => this.message(event.data);
  private readonly onError = () => this.retire(new ReportWorkerError('REPORT_WORKER_FAILURE', 'The local report worker failed or could not load.'));
  private readonly onAbort = () => this.retire(cancelled());
  constructor(private owner: StrategyReportOwner, private factory: () => ReportWorkerPort, private yieldControl: (() => Promise<void>) | undefined, private progress: (progress: StrategyReportProgress) => void) {}
  private assertCurrent() {
    if (this.retired || this.owner.signal.aborted) throw cancelled();
    this.owner.assertCurrent();
    if (this.retired || this.owner.signal.aborted) throw cancelled();
  }
  private publish(progress: StrategyReportProgress) {
    this.assertCurrent(); this.progress(Object.freeze(progress)); this.assertCurrent();
  }
  retire(reason: unknown = cancelled()): boolean {
    if (this.retired) return !this.terminationFailed;
    // Revoke before termination or promise callbacks can reenter this client.
    this.retired = true; this.summary = null;
    const port = this.port, pending = this.pending, startup = this.startup, active = this.activeQuery, queued = this.queuedQuery, yielding = this.yielding;
    this.port = null; this.pending = null; this.startup = null; this.activeQuery = null; this.queuedQuery = null;
    this.yielding = null;
    if (yielding?.timer) clearTimeout(yielding.timer);
    if (this.calculationTimer) clearTimeout(this.calculationTimer); this.calculationTimer = null;
    if (this.channel) { try { this.channel.port1.close(); this.channel.port2.close(); } catch { /* Numerical authority is already retired. */ } this.channel = null; }
    this.owner.signal.removeEventListener('abort', this.onAbort);
    if (pending) clearTimeout(pending.timer); if (startup) clearTimeout(startup.timer);
    let cleanupMessage = '';
    if (port) {
      for (const [type, listener] of [['message', this.onMessage], ['error', this.onError], ['messageerror', this.onError]] as const) try { port.removeEventListener(type, listener); } catch { /* Revoked handlers also reject late events. */ }
      try { port.terminate(); } catch (cause) { this.terminationFailed = true; cleanupMessage = boundedError(cause).message.slice(0, 800); }
    }
    const original = boundedError(reason);
    const error = this.terminationFailed ? new ReportWorkerError('REPORT_TERMINATION', (original.message.slice(0, 900) + ' Worker termination failed: ' + cleanupMessage + '. Report authority is retired; no replacement worker was started.').slice(0, LIMIT.errorCharacters)) : original;
    this.retirementError = error;
    startup?.reject(error); pending?.reject(error); active?.reject(error); queued?.reject(error); yielding?.reject(error);
    return !this.terminationFailed;
  }
  private pause(): Promise<void> {
    this.assertCurrent(); if (this.yielding) reject('REPORT_BACKPRESSURE', 'A report capture yield is already pending.');
    return new Promise((resolve, rejectPromise) => {
      const entry = { resolve, reject: rejectPromise, timer: undefined as ReturnType<typeof setTimeout> | undefined }; this.yielding = entry;
      entry.timer = setTimeout(() => { if (this.yielding === entry) this.retire(new ReportWorkerError('REPORT_TIMEOUT', 'The local capture scheduler stopped responding.')); }, LIMIT.queryMs);
      const complete = () => {
        if (this.yielding !== entry) return;
        this.yielding = null; clearTimeout(entry.timer);
        try { this.assertCurrent(); resolve(); } catch (cause) { this.retire(cause); rejectPromise(cause); }
      };
      try {
        if (this.yieldControl) { void Promise.resolve().then(this.yieldControl).then(complete, cause => { if (this.yielding === entry) this.retire(cause); }); }
        else if (typeof MessageChannel === 'function') {
          this.channel ??= new MessageChannel(); this.channel.port1.onmessage = complete; this.channel.port2.postMessage(null);
        } else setTimeout(complete, 0);
      } catch (cause) { this.retire(cause); }
    });
  }
  private async sourceArray(value: readonly unknown[], maximum: number, assertCapture: () => void) {
    assertCapture();
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) reject('REPORT_TRANSPORT_ARRAY', 'The source must be a bounded plain array.');
    const length = value.length;
    if (length <= OWN_KEY_SCAN_ROWS) {
      // Native own-key enumeration cannot be interrupted; below this bound it stays well under one frame.
      const keys = Reflect.ownKeys(value);
      if (keys.length !== length + 1 || keys[length] !== 'length') reject('REPORT_TRANSPORT_ARRAY', 'Source arrays must be dense and have no extra properties.');
      for (let start = 0; start < length; start += LIMIT.chunkRows) {
        for (let index = start; index < Math.min(length, start + LIMIT.chunkRows); index++) if (keys[index] !== String(index)) reject('REPORT_TRANSPORT_ARRAY', 'Source arrays must have canonical contiguous own indices.');
        await this.pause(); assertCapture();
      }
      return;
    }
    // A large array skips the uninterruptible native key list (40-60 ms at
    // 200,000 rows). Density is checked index by index in yielded slices; named non-index properties are never read
    // (rows are read only by index, through their descriptors), so they cannot reach the worker.
    for (let start = 0; start < length; start += LIMIT.chunkRows) {
      for (let index = start; index < Math.min(length, start + LIMIT.chunkRows); index++) if (!hasOwn.call(value, index)) reject('REPORT_TRANSPORT_ARRAY', 'Source arrays must have canonical contiguous own indices.');
      await this.pause(); assertCapture();
    }
  }
  async start(input: StrategyReportJobInput): Promise<StrategyReportHandle> {
    try {
      this.assertCurrent(); this.owner.signal.addEventListener('abort', this.onAbort, { once: true });
      ownRecord(input, 'Host report input', ['execution', 'config']); ownRecord(input.execution, 'Host execution', HOST_EXECUTION_FIELDS);
      const execution = input.execution, config = input.config, context = execution.context, chartType = execution.chartType;
      // Length equality is checked before inspecting a single source row. The UI
      // must pass the actual prefix, never a full array with a separate cursor.
      const rows: Record<ReportUploadSection, readonly unknown[]> = { bars: execution.bars, standardBars: execution.standardBars ?? [], barIds: execution.barIds, proposals: execution.proposals, magnifierBars: execution.magnifierBars ?? [], fillProposals: execution.fillProposals ?? [] };
      // The optional Bar Magnifier section is declared only when it carries rows, so older-shaped jobs stay byte-identical.
      // So is the after-fill proposal section.
      const sections = rows.magnifierBars.length || rows.fillProposals.length ? ALL_REPORT_SECTIONS.filter(section => REPORT_SECTIONS.includes(section as never) || rows[section].length) : REPORT_SECTIONS, magnifierBars = rows.magnifierBars, fillProposals = rows.fillProposals;
      for (const section of ALL_REPORT_SECTIONS) if (!Array.isArray(rows[section])) reject('REPORT_PREFIX', 'Report sources must be exact plain arrays.');
      const counts = Object.fromEntries(sections.map(section => [section, rows[section].length])) as ReportStart['counts'];
      const header = copyWire({ context: execution.context, config, counts, chartType: execution.chartType, ...(execution.formingBar !== undefined ? { formingBar: execution.formingBar } : {}), ...(execution.magnifierLabel !== undefined ? { magnifierLabel: execution.magnifierLabel } : {}) }, LIMIT.chunkBytes).value;
      const start = freezeData(validateReportStart(header)); this.acceptedStart = start; this.totalRows = sections.reduce((count, section) => count + (counts[section] ?? 0), 0);
      const assertCapture = () => {
        this.assertCurrent(); ownRecord(input, 'Host report input', ['execution', 'config']); ownRecord(execution, 'Host execution', HOST_EXECUTION_FIELDS);
        if (input.execution !== execution || input.config !== config || execution.context !== context || execution.chartType !== chartType || execution.bars !== rows.bars || execution.barIds !== rows.barIds || execution.proposals !== rows.proposals || (execution.standardBars ?? rows.standardBars) !== rows.standardBars || (execution.magnifierBars ?? magnifierBars) !== magnifierBars || (execution.fillProposals ?? fillProposals) !== fillProposals || sections.some(section => rows[section].length !== counts[section])) reject('REPORT_OWNER_CHANGED', 'The owned report prefix changed during transfer.');
      };
      this.publish({ phase: 'starting', completedRows: 0, totalRows: this.totalRows });
      await this.pause(); assertCapture();
      for (const section of sections) await this.sourceArray(rows[section], section === 'proposals' || section === 'fillProposals' ? LIMIT.proposals : section === 'magnifierBars' ? LIMIT.magnifierBars : LIMIT.bars, assertCapture);
      await this.launch(); assertCapture();
      await this.rpc('start', { input: start });
      this.calculationTimer = setTimeout(() => this.retire(new ReportWorkerError('REPORT_TIMEOUT', 'Transfer and calculation exceeded the 60-second accepted-job limit.')), LIMIT.computationMs);
      let completedRows = 0;
      for (const section of sections) {
        let index = 0;
        while (index < counts[section]!) {
          assertCapture(); const from = index, chunk: unknown[] = [];
          let bytes = copyWire({ version: 1, job: this.job, sequence: this.sequence + 1, kind: 'chunk', section, start: from, rows: [] }, LIMIT.chunkBytes).bytes;
          while (index < counts[section]! && chunk.length < LIMIT.chunkRows) {
            const row = copyWire(ownAt(rows[section], index), LIMIT.chunkBytes); validateReportRow(section, row.value);
            const addition = row.bytes + (chunk.length ? 1 : 0);
            if (bytes + addition > LIMIT.chunkBytes) { if (!chunk.length) reject('REPORT_ROW_BYTES', 'One report row exceeds the 256 KiB message bound.'); break; }
            chunk.push(row.value); bytes += addition; index++;
          }
          // Only this private freshly copied chunk can bypass another full
          // descriptor clone. Byte size includes the exact command envelope.
          const fields = { section, start: from, rows: chunk }; this.ownedUploadBytes.set(fields, bytes);
          assertCapture(); await this.rpc('chunk', fields); completedRows += chunk.length;
          this.publish({ phase: 'uploading', completedRows, totalRows: this.totalRows }); await this.pause(); assertCapture();
        }
      }
      const ready = await this.rpc('seal', {}) as StrategyReportSummary; assertCapture();
      if (this.calculationTimer) clearTimeout(this.calculationTimer); this.calculationTimer = null;
      this.summary = ready; const handle = this.handle(ready);
      this.publish({ phase: 'ready', completedRows: this.totalRows, totalRows: this.totalRows }); this.assertCurrent();
      return handle;
    } catch (cause) { this.retire(cause); throw this.retirementError ?? boundedError(cause); }
  }
  private launch(): Promise<void> {
    this.assertCurrent();
    return new Promise<void>((resolve, rejectPromise) => {
      this.startup = { resolve, reject: rejectPromise, timer: setTimeout(() => this.retire(new ReportWorkerError('REPORT_STARTUP_TIMEOUT', 'The local report worker did not start within 10 seconds.')), LIMIT.startupMs) };
      let created: ReportWorkerPort | null = null;
      try {
        created = this.factory();
        if (this.retired) { try { created.terminate(); } catch { this.terminationFailed = true; } return; }
        this.port = created; this.assertCurrent();
        created.addEventListener('message', this.onMessage); created.addEventListener('error', this.onError); created.addEventListener('messageerror', this.onError);
      } catch (cause) { this.retire(cause); }
    });
  }
  private rpc(kind: string, fields: Record<string, unknown>): Promise<unknown> {
    this.assertCurrent(); if (this.pending || !this.port) reject('REPORT_BACKPRESSURE', 'A report command is already in flight or its worker is absent.');
    const sequence = this.sequence + 1, command = { version: 1, job: this.job, sequence, kind, ...fields };
    const ownedBytes = kind === 'chunk' ? this.ownedUploadBytes.get(fields) : undefined;
    this.ownedUploadBytes.delete(fields);
    const detached = ownedBytes === undefined ? copyWire(command, LIMIT.chunkBytes) : { value: command, bytes: ownedBytes };
    if ((kind === 'start' || kind === 'chunk') && this.stagedBytes + detached.bytes > LIMIT.stagedBytes) reject('REPORT_TRANSPORT_BYTES', 'Staged report data exceeds 128 MiB.');
    this.sequence = sequence; if (kind === 'start' || kind === 'chunk') this.stagedBytes += detached.bytes;
    return new Promise((resolve, rejectPromise) => {
      this.pending = { sequence, kind, fields, resolve, reject: rejectPromise, timer: setTimeout(() => this.retire(new ReportWorkerError('REPORT_TIMEOUT', 'The local report operation exceeded its time limit and was cancelled.')), kind === 'seal' ? LIMIT.computationMs : LIMIT.queryMs) };
      try { this.assertCurrent(); this.port!.postMessage(detached.value); } catch (cause) { this.retire(cause); }
    });
  }
  private message(raw: unknown) {
    if (this.retired) return;
    try {
      this.assertCurrent(); ownRecord(raw, 'Worker message'); const envelope = raw as Record<string, unknown>;
      if (envelope.kind === 'started') {
        exact(envelope, 'Worker startup', ['version', 'kind']); if (envelope.version !== 1 || !this.startup) reject('REPORT_REPLY_SCHEMA', 'Unexpected report-worker startup.');
        const startup = this.startup; this.startup = null; clearTimeout(startup.timer); this.assertCurrent(); startup.resolve(); return;
      }
      if (envelope.kind === 'progress') {
        const message = copyReply(raw); exact(message, 'Worker progress', ['version', 'kind', 'job', 'sequence', 'progress']);
        if (message.version !== 1 || message.job !== this.job || message.sequence !== this.pending?.sequence || this.pending?.kind !== 'seal') reject('REPORT_REPLY_OWNER', 'Progress does not belong to the active report calculation.');
        exact(message.progress, 'Progress counters', ['phase', 'completedRows', 'totalRows']); const progress = message.progress as unknown as StrategyReportProgress;
        const phase = ['executing', 'reporting'].indexOf(progress.phase) + 1;
        if (!phase || phase <= this.progressPhase || progress.totalRows !== this.totalRows || progress.completedRows !== this.totalRows) reject('REPORT_REPLY_SCHEMA', 'Invalid report progress counters or phase.');
        this.progressPhase = phase; this.publish(progress); return;
      }
      const pending = this.pending;
      if (envelope.version !== 1 || envelope.job !== this.job) reject('REPORT_REPLY_OWNER', 'A worker response does not belong to this report.');
      const sequence = integer(envelope.sequence, 'Reply sequence', 1, Number.MAX_SAFE_INTEGER);
      // A delayed duplicate cannot complete or consume a newer query owner.
      if (!pending || sequence < pending.sequence) return;
      if (sequence !== pending.sequence) reject('REPORT_REPLY_SEQUENCE', 'The worker response is out of sequence.');
      if (envelope.ok === false) {
        const message = copyReply(raw); exact(message, 'Worker failure', ['version', 'job', 'sequence', 'ok', 'code', 'message']);
        throw new ReportWorkerError(boundedText(message.code, 'Worker error code', 100), boundedText(message.message, 'Worker error', LIMIT.errorCharacters, true));
      }
      if (envelope.ok !== true) reject('REPORT_REPLY_SCHEMA', 'Invalid worker result state.');
      let value: unknown;
      if (pending.kind === 'export') {
        exact(envelope, 'Transferred export', ['version', 'job', 'sequence', 'ok', 'kind', 'bytes', 'format', 'buffer']);
        const bytes = integer(envelope.bytes, 'Export bytes', 0, LIMIT.exportBytes), format = pending.fields.format === 'json' ? 'json' : pending.fields.format === 'xlsx' ? 'xlsx' : 'csv';
        if (envelope.kind !== 'export' || envelope.format !== format || !(envelope.buffer instanceof ArrayBuffer) || Object.getPrototypeOf(envelope.buffer) !== ArrayBuffer.prototype || envelope.buffer.byteLength !== bytes) reject('REPORT_EXPORT_TRANSPORT', 'Invalid or oversized transferred report export.');
        if (format === 'xlsx') { const data = new Uint8Array(envelope.buffer.slice(0)); if (data[0] !== 0x50 || data[1] !== 0x4b) reject('REPORT_EXPORT_TRANSPORT', 'The transferred workbook is not a ZIP package.'); this.assertCurrent(); value = Object.freeze({ text: '', data, bytes, format }); }
        else { const text = new TextDecoder('utf-8', { fatal: true }).decode(envelope.buffer); this.assertCurrent(); value = Object.freeze({ text, bytes, format }); }
      } else {
        const message = copyReply(raw);
        if (pending.kind === 'start' || pending.kind === 'chunk') {
          exact(message, 'Upload acknowledgement', ['version', 'job', 'sequence', 'ok', 'kind', 'received']);
          if (message.kind !== 'ack' || message.received !== (pending.kind === 'start' ? 0 : (pending.fields.rows as unknown[]).length)) reject('REPORT_REPLY_SCHEMA', 'The worker acknowledged a different upload.'); value = message.received;
        } else if (pending.kind === 'seal') {
          exact(message, 'Completed report', ['version', 'job', 'sequence', 'ok', 'kind', 'value']); if (message.kind !== 'ready') reject('REPORT_REPLY_SCHEMA', 'Expected a completed report.');
          // The accepted header is retained separately from mutable caller data.
          value = validateSummary(message.value, this.acceptedStart!);
        } else {
          exact(message, 'Query result', ['version', 'job', 'sequence', 'ok', 'kind', 'value']); if (message.kind !== 'result' || !this.summary) reject('REPORT_REPLY_SCHEMA', 'Expected a completed report query result.');
          value = validateResult(pending.kind, message.value, this.summary!);
          if (pending.kind === 'inspect' && (value as ReportInspection).point.barIndex !== pending.fields.barIndex) reject('REPORT_REPLY_OWNER', 'The inspected row differs from the requested row.');
          if (['trades', 'orders', 'openLots'].includes(pending.kind)) {
            const table = value as ReportTradePage | ReportOrderPage | ReportOpenLotPage;
            const query = pending.kind === 'trades' ? pending.fields.query as unknown as ReportTradeQuery : null;
            const requestedPage = query?.page ?? pending.fields.page as number;
            if (table.page !== Math.min(requestedPage, table.pages - 1)) reject('REPORT_REPLY_OWNER', 'The returned page differs from the requested page.');
            const selectedSide = query?.side ?? (pending.kind === 'openLots' ? pending.fields.side as StrategyReportSide : 'all');
            if (selectedSide !== 'all' && (table.rows as (ReportTradePage['rows'][number] | ReportOpenLotPage['rows'][number])[]).some(row => row.direction !== selectedSide)) reject('REPORT_REPLY_OWNER', 'The returned rows differ from the selected direction.');
            if (pending.kind === 'orders' && table.count !== this.summary!.counts.orders) reject('REPORT_REPLY_OWNER', 'The returned order count differs from this report.');
            if (query?.query.trim()) {
              // The same visible-text / exact-id rule as queryReportTrades.
              if ((table.rows as ReportTradePage['rows']).some(row => !reportTradeMatches(row, query.query))) reject('REPORT_REPLY_OWNER', 'A returned trade does not match the requested search.');
            }
          }
        }
      }
      this.assertCurrent(); this.pending = null; clearTimeout(pending.timer); pending.resolve(value);
    } catch (cause) { this.retire(cause); }
  }
  private acceptedStart: ReportStart | null = null;
  private handle(summary: StrategyReportSummary): StrategyReportHandle {
    const job = this;
    const call = <T>(receiver: unknown, kind: string, fields: Record<string, unknown>): Promise<T> => {
      if (receiver !== handle) return Promise.reject(new ReportWorkerError('REPORT_HANDLE', 'Report methods require their original owned handle.'));
      return job.enqueue(kind, fields) as Promise<T>;
    };
    const handle: StrategyReportHandle = Object.freeze({ summary,
      trades: function(this: unknown, query: ReportTradeQuery) { return call<ReportTradePage>(this, 'trades', { query }); },
      orders: function(this: unknown, page: number) { return call<ReportOrderPage>(this, 'orders', { page }); },
      openLots: function(this: unknown, side: StrategyReportSide, page: number) { return call<ReportOpenLotPage>(this, 'openLots', { side, page }); },
      plot: function(this: unknown, query: ReportPlotQuery) { return call<ReportPlotResponse>(this, 'plot', { query }); },
      inspect: function(this: unknown, barIndex: number) { return call<ReportInspection>(this, 'inspect', { barIndex }); },
      export: function(this: unknown, format: ReportExportKind, side: StrategyReportSide = 'all') { return call<ReportExport>(this, 'export', { format, side }); },
      dispose: function(this: unknown) { if (this !== handle) reject('REPORT_HANDLE', 'Report disposal requires its original handle.'); job.retire(); },
    });
    return handle;
  }
  private enqueue(kind: string, raw: Record<string, unknown>): Promise<unknown> {
    try {
      this.assertCurrent(); const fields = copyWire(raw, LIMIT.chunkBytes).value; validateQuery(kind, fields);
      if (kind === 'inspect' && (fields.barIndex as number) >= this.summary!.counts.bars) reject('REPORT_QUERY', 'The inspected row is outside the accepted prefix.');
      return new Promise((resolve, rejectPromise) => {
        const entry: Query = { kind, fields, resolve, reject: rejectPromise };
        if (this.activeQuery) {
          if (kind === 'export' || this.activeQuery.kind === 'export' || this.queuedQuery?.kind === 'export') { rejectPromise(new ReportWorkerError('REPORT_BUSY', 'Finish the current report query or export before exporting.')); return; }
          this.queuedQuery?.reject(new ReportWorkerError('REPORT_QUERY_SUPERSEDED', 'A newer display query replaced this queued query.')); this.queuedQuery = entry;
        } else this.runQuery(entry);
      });
    } catch (cause) { this.retire(cause); return Promise.reject(boundedError(cause)); }
  }
  private runQuery(entry: Query) {
    this.activeQuery = entry;
    const execute = async () => {
      try {
        this.assertCurrent(); const value = await this.rpc(entry.kind, entry.fields); this.assertCurrent();
        if (this.activeQuery !== entry) throw cancelled();
        this.activeQuery = null; const next = this.queuedQuery; this.queuedQuery = null;
        entry.resolve(value); if (next && !this.retired) this.runQuery(next);
      } catch (cause) { this.retire(cause); entry.reject(boundedError(cause)); }
    };
    void execute();
  }
}

export function createStrategyReportClient(options: ReportClientOptions = {}): StrategyReportClient {
  let active: ReportJob | null = null, disposed = false, replacing = false;
  const client: StrategyReportClient = {
    start(input, owner, onProgress = () => {}) {
      // A borrowed method must not acquire even cancellation authority over the
      // real client. Reject before entering its mutation/cleanup path.
      if (this !== client || disposed || replacing) return Promise.reject(cancelled());
      try {
        replacing = true; const previous = active; active = null;
        if (previous && !previous.retire()) { disposed = true; throw new ReportWorkerError('REPORT_TERMINATION', 'The previous worker could not be terminated; no replacement was started.'); }
        if (disposed) throw cancelled();
        const job = new ReportJob(owner, options.factory ?? defaultWorker, options.yieldControl, onProgress); active = job;
        replacing = false;
        return job.start(input);
      } catch (cause) { replacing = false; active?.retire(cause); return Promise.reject(boundedError(cause)); }
    },
    dispose() { if (this !== client) reject('REPORT_CLIENT_OWNER', 'Client disposal requires its original owner.'); disposed = true; const job = active; active = null; job?.retire(); },
  };
  return Object.freeze(client);
}
