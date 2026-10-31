import type { Bar } from '../domain/types';
import type { StrategyConfig, StrategyOrder } from '../domain/strategy';
import type { StrategyReport, StrategyReportContext, StrategyReportSide, ReportEquityPoint, ReportOpenLot, ReportTrade } from '../domain/strategy-report';
import type { ReportTradeColumn } from '../domain/strategy-report-view';

export const REPORT_WORKER_LIMITS = Object.freeze({
  version: 1, bars: 200000, proposals: 100000, chunkRows: 512,
  /** Bar Magnifier rows per report (our own bound; the engine itself accepts up to 2000000). */
  magnifierBars: 200000,
  /** Fields per transported record; the metric records carry one field per catalog metric (70). */
  recordFields: 96,
  chunkBytes: 256 * 1024, stagedBytes: 128 * 1024 * 1024,
  responseBytes: 2 * 1024 * 1024, exportBytes: 20 * 1024 * 1024,
  startupMs: 10000, computationMs: 60000, queryMs: 20000,
  errorCharacters: 2000, messageNodes: 100000, messageDepth: 20,
});
export interface StrategyReportJobInput {
  readonly execution: {
    readonly bars: readonly Bar[]; readonly standardBars?: readonly Bar[];
    readonly barIds: readonly string[]; readonly proposals: readonly Record<string, unknown>[];
    readonly context: StrategyReportContext; readonly chartType: StrategyConfig['chartType'];
    /** Lower-timeframe bars for the Bar Magnifier, and where they came from. */
    readonly magnifierBars?: readonly Bar[]; readonly magnifierLabel?: string;
    /** The last bar is the still-forming realtime bar, included because Recalculate on every tick is on. */
    readonly formingBar?: boolean;
    /** The script's onFill proposals, each with `fill` (its fill's ordinal on the bar); with "Recalculate after order is filled" only. */
    readonly fillProposals?: readonly Record<string, unknown>[];
  };
  readonly config: StrategyConfig;
}
/** The host owns immutable references for the entire capture. This is not an arbitrary-input snapshot API. */
export interface StrategyReportOwner { assertCurrent(): void; readonly signal: AbortSignal }
export type StrategyReportPhase = 'starting' | 'uploading' | 'executing' | 'reporting' | 'ready';
export interface StrategyReportProgress { readonly phase: StrategyReportPhase; readonly completedRows: number; readonly totalRows: number }
export interface StrategyReportSummary {
  readonly context: StrategyReport['context']; readonly config: StrategyReport['config']; readonly fillBasis: StrategyReport['fillBasis'];
  readonly metrics: StrategyReport['metrics']; readonly benchmark: StrategyReport['benchmark']; readonly drawdown: StrategyReport['drawdown']; readonly analysis: StrategyReport['analysis'];
  readonly counts: Readonly<{ bars: number; trades: number; orders: number; openLots: number; diagnostics: number }>;
  readonly policies: readonly string[]; readonly diagnostics: readonly string[]; readonly work: number;
}
export interface ReportTradeQuery { side: StrategyReportSide; query: string; sort: ReportTradeColumn; descending: boolean; page: number }
export interface ReportTradePage { readonly count: number; readonly pages: number; readonly page: number; readonly rows: readonly ReportTrade[] }
export interface ReportOrderPage { readonly count: number; readonly pages: number; readonly page: number; readonly rows: readonly Readonly<StrategyOrder>[] }
export interface ReportOpenLotPage { readonly count: number; readonly pages: number; readonly page: number; readonly rows: readonly ReportOpenLot[] }
export interface ReportPlotQuery { series: 'equity' | 'closed' | 'drawdown'; percent: boolean; benchmark: boolean; favorable: boolean; adverse: boolean }
export interface ReportPlotPoint { readonly index: number; readonly value: number; readonly breakBefore: boolean }
export interface ReportPlotResponse {
  readonly count: number; readonly min: number | null; readonly max: number | null;
  readonly values: readonly ReportPlotPoint[]; readonly benchmark: readonly ReportPlotPoint[];
  readonly excursions: readonly { index: number; favorable: number | null; adverse: number | null }[];
}
export interface ReportInspection { readonly point: ReportEquityPoint; readonly trade: ReportTrade | null }
export type ReportExportKind = 'metrics' | 'trades' | 'orders' | 'json' | 'xlsx';
/** Text exports carry `text`; an XLSX workbook carries `data` (its `text` is empty). */
export interface ReportExport { readonly text: string; readonly bytes: number; readonly format: 'csv' | 'json' | 'xlsx'; readonly data?: Uint8Array }
export interface StrategyReportHandle {
  readonly summary: StrategyReportSummary;
  trades(query: ReportTradeQuery): Promise<ReportTradePage>;
  orders(page: number): Promise<ReportOrderPage>;
  openLots(side: StrategyReportSide, page: number): Promise<ReportOpenLotPage>;
  plot(query: ReportPlotQuery): Promise<ReportPlotResponse>;
  inspect(barIndex: number): Promise<ReportInspection>;
  export(kind: ReportExportKind, side?: StrategyReportSide): Promise<ReportExport>;
  dispose(): void;
}
export type ReportSection = 'bars' | 'standardBars' | 'barIds' | 'proposals';
/** Every uploadable section, including the optional Bar Magnifier rows. */
export type ReportUploadSection = ReportSection | 'magnifierBars' | 'fillProposals';
export interface ReportStart {
  context: StrategyReportContext; config: StrategyConfig;
  /** 'magnifierBars' is optional; an absent count is zero. */
  counts: Record<ReportSection, number> & Partial<Record<'magnifierBars' | 'fillProposals', number>>; chartType: StrategyConfig['chartType'];
  formingBar?: boolean; magnifierLabel?: string;
}
export type ReportCommand =
  | { version: 1; job: string; sequence: number; kind: 'start'; input: ReportStart }
  | { version: 1; job: string; sequence: number; kind: 'chunk'; section: ReportUploadSection; start: number; rows: readonly unknown[] }
  | { version: 1; job: string; sequence: number; kind: 'seal' }
  | { version: 1; job: string; sequence: number; kind: 'trades'; query: ReportTradeQuery }
  | { version: 1; job: string; sequence: number; kind: 'orders'; page: number }
  | { version: 1; job: string; sequence: number; kind: 'openLots'; side: StrategyReportSide; page: number }
  | { version: 1; job: string; sequence: number; kind: 'plot'; query: ReportPlotQuery }
  | { version: 1; job: string; sequence: number; kind: 'inspect'; barIndex: number }
  | { version: 1; job: string; sequence: number; kind: 'export'; format: ReportExportKind; side: StrategyReportSide };
export type ReportReply =
  | { version: 1; job: string; sequence: number; ok: true; kind: 'ack'; received: number }
  | { version: 1; job: string; sequence: number; ok: true; kind: 'ready'; value: StrategyReportSummary }
  | { version: 1; job: string; sequence: number; ok: true; kind: 'result'; value: unknown }
  | { version: 1; job: string; sequence: number; ok: true; kind: 'export'; bytes: number; format: 'csv' | 'json' | 'xlsx'; buffer: ArrayBuffer }
  | { version: 1; job: string; sequence: number; ok: false; code: string; message: string };
