import type { VwapExactSource } from '../domain/vwap-exact';

export const VWAP_WORKER_LIMITS = Object.freeze({ rows: 100_000, queued: 16, activeBytes: 16 * 1024 * 1024, resultBytes: 32 * 1024 * 1024, startupMs: 10_000, totalMs: 60_000, chunkRows: 128, sliceMs: 4, errorCharacters: 1024 });
export const VWAP_ANCHORS = ['Session', 'Week', 'Month', 'Quarter', 'Year', 'Decade', 'Century'] as const;
export type VwapAnchor = typeof VWAP_ANCHORS[number];
export type VwapPlotId = 'vwap' | 'upper1' | 'lower1' | 'upper2' | 'lower2' | 'upper3' | 'lower3';
export interface VwapCalculationSettings {
  kernelVersion: 2;
  source: VwapExactSource;
  anchor: VwapAnchor;
  timezone: string;
  transform: 'standard' | 'heikin-ashi';
  bandMode: 'Percentage' | 'Standard Deviation';
  band1Enabled: boolean; band1Multiplier: number;
  band2Enabled: boolean; band2Multiplier: number;
  band3Enabled: boolean; band3Multiplier: number;
}
export interface VwapPlot { readonly id: VwapPlotId; readonly label: string }
export interface VwapDiagnostic { readonly plotId: VwapPlotId; readonly message: string }
export interface VwapRequest {
  readonly rows: number;
  readonly settings: VwapCalculationSettings;
  /** Trusted host callback: private prefix packing occurs only after FIFO activation. */
  readonly prepare: (signal: AbortSignal) => Promise<ArrayBuffer> | ArrayBuffer;
}
export interface VwapOwner { readonly token: object; readonly signal: AbortSignal; readonly assertCurrent: () => void }
export interface VwapResultLease {
  readonly rows: number;
  readonly plotIds: readonly VwapPlotId[];
  readonly plots: readonly VwapPlot[];
  readonly policies: readonly string[];
  readonly diagnostics: readonly VwapDiagnostic[];
  assertCurrent(): void;
  valueAt(plot: VwapPlotId, index: number): number | null;
  /** At most 128 detached values; caller must preflight its complete output allocation. */
  readChunk(plot: VwapPlotId, start: number, count: number): readonly (number | null)[];
  release(): void;
}
export interface VwapJob { readonly result: Promise<VwapResultLease>; assertCurrent(): void; cancel(reason?: string): void }
export interface VwapClient { request(input: VwapRequest, owner: VwapOwner): VwapJob; dispose(): void }
export interface VwapWorkerPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  terminate(): void;
}
export interface VwapClientOptions {
  /** Controlled transport/scheduler for lifecycle tests; production uses the fixed local worker. */
  factory?: () => VwapWorkerPort;
  schedule?: (resume: () => void) => () => void;
  clock?: () => number;
}
export interface VwapWireRequest { v: 1; type: 'calculate'; job: string; rows: number; settings: VwapCalculationSettings; buffer: ArrayBuffer }
export interface VwapWireResult { v: 1; type: 'result'; job: string; rows: number; plotIds: VwapPlotId[]; values: ArrayBuffer; mask: ArrayBuffer; diagnostics: VwapDiagnostic[] }
