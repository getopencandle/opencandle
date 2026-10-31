import type { Bar } from '../domain/types';
import { buildStrategyReport, type StrategyReport, type StrategyReportContext, type StrategyReportSide } from '../domain/strategy-report';
import { strategyReportCsv, strategyReportJson, strategyReportXlsx } from '../domain/strategy-report-export';
import { queryReportTrades, reportPlotIndices } from '../domain/strategy-report-view';
import { runReportBacktest } from './backtest';
import { boundedText, copyWire, integer, ownArray, ownRecord, reject, ReportWorkerError } from './data';
import { REPORT_WORKER_LIMITS as LIMIT, type ReportCommand, type ReportPlotPoint, type ReportPlotQuery, type ReportPlotResponse, type ReportReply, type ReportSection, type ReportStart, type ReportUploadSection, type StrategyReportProgress, type StrategyReportSummary } from './types';

export { REPORT_SECTIONS, validateReportStart, validateReportRow } from './schema';
import { ALL_REPORT_SECTIONS, REPORT_SECTIONS, sectionCount, validateReportStart, validateReportRow, exact, finite } from './schema';
function side(value: unknown): StrategyReportSide { if (!['all', 'long', 'short'].includes(value as string)) reject('REPORT_SIDE', 'Unknown report direction.'); return value as StrategyReportSide; }
function page<T>(rows: readonly T[], requested: unknown) {
  integer(requested, 'Page', 0, 1000000); const pages = Math.max(1, Math.ceil(rows.length / 200)), selected = Math.min(requested as number, pages - 1);
  return { count: rows.length, pages, page: selected, rows: rows.slice(selected * 200, (selected + 1) * 200) };
}
function summary(report: StrategyReport): StrategyReportSummary {
  return { context: report.context, config: report.config, fillBasis: report.fillBasis, metrics: report.metrics, benchmark: report.benchmark, drawdown: report.drawdown, analysis: report.analysis, counts: { bars: report.equity.length, trades: report.trades.length, orders: report.orders.length, openLots: report.openLots.length, diagnostics: report.diagnostics.length }, policies: report.policies, diagnostics: report.diagnostics.slice(0, 100), work: report.work };
}
function plot(report: StrategyReport, query: ReportPlotQuery): ReportPlotResponse {
  exact(query, 'Plot query', ['series', 'percent', 'benchmark', 'favorable', 'adverse']);
  if (!['equity', 'closed', 'drawdown'].includes(query.series) || [query.percent, query.benchmark, query.favorable, query.adverse].some(value => typeof value !== 'boolean')) reject('REPORT_PLOT', 'Invalid report plot controls.');
  if (query.series === 'drawdown' && (query.benchmark || query.favorable || query.adverse)) reject('REPORT_PLOT', 'The drawdown curve has no benchmark or excursion layers.');
  const convert = (value: number) => finite(query.percent ? value / report.config.initialCapital * 100 : value, 'Plot value');
  // Drawdown is plotted below zero. Its percent mode uses each close's own prior peak, not initial capital.
  const values = report.equity.map(point => query.series === 'drawdown' ? finite(0 - (query.percent ? point.drawdownPercent : point.drawdown), 'Plot value') : convert(query.series === 'equity' ? point.equity : point.closedNet));
  const benchmark = query.benchmark ? report.equity.map(point => point.buyHoldEquity === null ? null : convert(query.series === 'equity' ? point.buyHoldEquity : point.buyHoldEquity - report.config.initialCapital)) : [];
  let min = Infinity, max = -Infinity;
  for (const value of [...values, ...benchmark]) if (value !== null) { min = Math.min(min, value); max = Math.max(max, value); }
  const excursions = query.series === 'closed' && (query.favorable || query.adverse) ? reportPlotIndices(report.trades.map(trade => trade.netProfit), 1000).map(index => {
    const trade = report.trades[index], favorable = query.favorable && trade.favorable.value !== null ? convert(trade.favorable.value) : null, adverse = query.adverse && trade.adverse.value !== null ? -convert(trade.adverse.value) : null;
    min = Math.min(min, 0, favorable ?? 0, adverse ?? 0); max = Math.max(max, 0, favorable ?? 0, adverse ?? 0);
    return { index: trade.exit.barIndex, favorable, adverse };
  }) : [];
  const sampled = (items: readonly (number | null)[]): ReportPlotPoint[] => {
    const result: ReportPlotPoint[] = []; let previous = -1;
    for (const index of reportPlotIndices(items)) {
      const value = items[index]; if (value === null) { previous = -1; continue; }
      let breakBefore = previous < 0;
      if (!breakBefore) for (let cursor = previous + 1; cursor < index; cursor++) if (items[cursor] === null) { breakBefore = true; break; }
      result.push({ index, value, breakBefore }); previous = index;
    }
    return result;
  };
  return { count: report.equity.length, min: min === Infinity ? null : min, max: max === -Infinity ? null : max, values: sampled(values), benchmark: sampled(benchmark), excursions };
}

/** Trusted worker state machine. All input stays staged until the complete, sequential upload is sealed. */
export class StrategyReportWorkerSession {
  private job = ''; private sequence = 0; private state: 'idle' | 'staging' | 'ready' | 'failed' = 'idle';
  private start: ReportStart | null = null; private staged: Record<ReportUploadSection, unknown[]> = { bars: [], standardBars: [], barIds: [], proposals: [], magnifierBars: [], fillProposals: [] };
  private bytes = 0; private report: StrategyReport | null = null;
  constructor(private progress: (progress: StrategyReportProgress, job: string, sequence: number) => void = () => {}) {}
  handle(raw: unknown): ReportReply {
    let receivedSequence = this.sequence, receivedJob = this.job;
    try {
      const copied = copyWire(raw, LIMIT.chunkBytes), command = copied.value as ReportCommand;
      ownRecord(command, 'Worker command');
      const fields: Record<string, string[]> = { start: ['input'], chunk: ['section', 'start', 'rows'], seal: [], trades: ['query'], orders: ['page'], openLots: ['side', 'page'], plot: ['query'], inspect: ['barIndex'], export: ['format', 'side'] };
      if (typeof command.kind !== 'string' || !Object.hasOwn(fields, command.kind)) reject('REPORT_COMMAND', 'Unknown report-worker command.');
      exact(command, 'Worker command', ['version', 'job', 'sequence', 'kind', ...fields[command.kind]]);
      if (command.version !== 1) reject('REPORT_VERSION', 'Unsupported report-worker protocol version.');
      receivedJob = boundedText(command.job, 'Worker job identity', 200); receivedSequence = integer(command.sequence, 'Worker command sequence', 1, Number.MAX_SAFE_INTEGER);
      if (this.state === 'failed' || receivedSequence !== this.sequence + 1 || this.job && receivedJob !== this.job) reject('REPORT_SEQUENCE', 'This report job is retired or its command is stale/out of order.');
      this.sequence = receivedSequence;
      if (command.kind === 'start') {
        if (this.state !== 'idle') reject('REPORT_PHASE', 'A worker accepts one report job only.');
        this.job = command.job; this.start = validateReportStart(command.input); this.bytes = copied.bytes; this.state = 'staging';
        return this.ack(0);
      }
      if (command.kind === 'chunk') {
        if (this.state !== 'staging' || !this.start || !ALL_REPORT_SECTIONS.includes(command.section)) reject('REPORT_PHASE', 'Report rows require a valid staged job.');
        const currentSection = ALL_REPORT_SECTIONS.find(section => this.staged[section].length < sectionCount(this.start!.counts, section));
        if (command.section !== currentSection) reject('REPORT_SECTION', 'Report sections must arrive in declared order.');
        ownArray(command.rows, 'Upload rows', LIMIT.chunkRows);
        if (!command.rows.length || command.start !== this.staged[command.section].length || command.start + command.rows.length > sectionCount(this.start!.counts, command.section)) reject('REPORT_PREFIX', 'Upload rows overlap, skip or exceed the declared prefix.');
        if (this.bytes + copied.bytes > LIMIT.stagedBytes) reject('REPORT_TRANSPORT_BYTES', 'Staged report data exceeds 128 MiB.');
        for (const row of command.rows) validateReportRow(command.section, row);
        this.staged[command.section].push(...command.rows); this.bytes += copied.bytes;
        return this.ack(command.rows.length);
      }
      if (command.kind === 'seal') {
        if (this.state !== 'staging' || !this.start || ALL_REPORT_SECTIONS.some(section => this.staged[section].length !== sectionCount(this.start!.counts, section))) reject('REPORT_PREFIX', 'Only a complete staged prefix can be executed.');
        const bars = this.staged.bars as Bar[], standardBars = this.start.counts.standardBars ? this.staged.standardBars as Bar[] : undefined, barIds = this.staged.barIds as string[];
        const totalRows = ALL_REPORT_SECTIONS.reduce((total, section) => total + sectionCount(this.start!.counts, section), 0);
        this.progress({ phase: 'executing', completedRows: totalRows, totalRows }, this.job, this.sequence);
        // With the Bar Magnifier on, uncovered bars keep the OHLC route ('available'); every-tick runs declare whether the last bar is forming.
        const config = this.start.config, magnifierBars = config.barMagnifier ? this.staged.magnifierBars as Bar[] : undefined;
        const result = runReportBacktest({ bars, standardBars, barIds, proposals: this.staged.proposals as Record<string, unknown>[], config, ...(magnifierBars ? { magnifierBars } : {}), ...(this.start.magnifierLabel ? { magnifierLabel: this.start.magnifierLabel } : {}), formingBar: this.start.formingBar === true, ...(this.staged.fillProposals.length ? { fillProposals: this.staged.fillProposals as Record<string, unknown>[] } : {}) });
        if (!result.ok) reject('REPORT_EXECUTION', result.diagnostics.join(' '));
        this.progress({ phase: 'reporting', completedRows: totalRows, totalRows }, this.job, this.sequence);
        this.report = buildStrategyReport({ result, bars, standardBars, barIds, context: this.start.context as StrategyReportContext, ...(magnifierBars ? { magnifierBars } : {}) });
        this.state = 'ready'; this.staged = { bars: [], standardBars: [], barIds: [], proposals: [], magnifierBars: [], fillProposals: [] }; this.start = null;
        return this.bounded({ version: 1, job: this.job, sequence: this.sequence, ok: true, kind: 'ready', value: summary(this.report) });
      }
      if (this.state !== 'ready' || !this.report) reject('REPORT_PHASE', 'A completed report is required.');
      const report = this.report!; let value: unknown;
      if (command.kind === 'trades') {
        exact(command.query, 'Trade query', ['side', 'query', 'sort', 'descending', 'page']);
        side(command.query.side); if (typeof command.query.descending !== 'boolean') reject('REPORT_QUERY', 'Sort direction must be boolean.');
        value = queryReportTrades(report, command.query);
      } else if (command.kind === 'orders') {
        const selected = page(report.orders, command.page);
        // Legacy engine records may own optional fields with undefined values.
        // They are absent in the wire schema; never weaken input serialization.
        value = { ...selected, rows: selected.rows.map(order => Object.fromEntries(Object.entries(order).filter(([, item]) => item !== undefined))) };
      }
      else if (command.kind === 'openLots') { const selected = side(command.side); value = page(report.openLots.filter(lot => selected === 'all' || lot.direction === selected), command.page); }
      else if (command.kind === 'plot') value = plot(report, command.query);
      else if (command.kind === 'inspect') {
        const index = integer(command.barIndex, 'Inspection row', 0, report.equity.length - 1); let low = 0, high = report.trades.length;
        while (low < high) { const mid = (low + high) >>> 1; if (report.trades[mid].exit.barIndex <= index) low = mid + 1; else high = mid; }
        value = { point: report.equity[index], trade: low ? report.trades[low - 1] : null };
      } else if (command.kind === 'export') {
        side(command.side);
        const buffer = command.format === 'xlsx' ? strategyReportXlsx(report).slice().buffer : new TextEncoder().encode(command.format === 'json' ? strategyReportJson(report) : strategyReportCsv(report, command.format, command.side)).buffer;
        if (buffer.byteLength > LIMIT.exportBytes) reject('REPORT_EXPORT_LIMIT', 'The report export exceeds 20 MiB UTF-8.');
        return { version: 1, job: this.job, sequence: this.sequence, ok: true, kind: 'export', bytes: buffer.byteLength, format: command.format === 'json' ? 'json' : command.format === 'xlsx' ? 'xlsx' : 'csv', buffer };
      } else reject('REPORT_COMMAND', 'Unsupported report query.');
      return this.bounded({ version: 1, job: this.job, sequence: this.sequence, ok: true, kind: 'result', value });
    } catch (cause) {
      this.state = 'failed'; this.report = null; this.start = null; this.staged = { bars: [], standardBars: [], barIds: [], proposals: [], magnifierBars: [], fillProposals: [] };
      const message = cause instanceof Error ? cause.message : 'Report worker failed.';
      return { version: 1, job: receivedJob, sequence: receivedSequence, ok: false, code: cause instanceof ReportWorkerError ? cause.code : 'REPORT_FAILED', message: message.slice(0, LIMIT.errorCharacters) };
    }
  }
  private ack(received: number): ReportReply { return { version: 1, job: this.job, sequence: this.sequence, ok: true, kind: 'ack', received }; }
  private bounded(reply: ReportReply): ReportReply { return copyWire(reply, LIMIT.responseBytes).value; }
}
