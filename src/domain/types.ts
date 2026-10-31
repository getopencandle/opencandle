/** Domain time is Unix seconds. Providers and files must normalize explicitly. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AssetClass = 'stock' | 'etf' | 'index' | 'option' | 'future' | 'forex' | 'crypto' | 'commodity' | 'bond' | 'other';

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  assetClass: AssetClass;
  tickSize: number;
  lotSize: number;
  timezone: string;
}

export type AdjustmentBasis = 'raw' | 'split-adjusted' | 'total-return' | 'unknown';
export type SessionBasis = 'regular' | 'extended' | 'all' | 'unknown';
export type DataState = 'ready' | 'loading' | 'stale' | 'disconnected' | 'unavailable' | 'error';

export interface DataProvenance {
  providerId: string;
  providerName: string;
  datasetId: string;
  fixture: boolean;
  coverage: string;
  asOf: number;
  delaySeconds: number | null;
  adjustment: AdjustmentBasis;
  session: SessionBasis;
  timezone: string;
  state: DataState;
  license: string;
  revision: string;
  notes: string[];
}

export interface ProviderCapabilities {
  id: string;
  assets: AssetClass[];
  universe: string;
  fields: ('ohlcv' | 'trades' | 'quotes' | 'depth' | 'fundamentals' | 'news' | 'events' | 'corporate-actions')[];
  resolutions: string[];
  streaming: boolean;
  delaySeconds: number | null;
  sessions: SessionBasis[];
  adjustmentBases: AdjustmentBasis[];
  earliestHistory: Record<string, string | null>;
  requiresKey: boolean;
  redistributable: boolean | null;
  limits: string[];
  verifiedLive: boolean;
}

export interface BarDataset {
  instrument: Instrument;
  bars: Bar[];
  resolution: string;
  provenance: DataProvenance;
}

/** Display time alone cannot identify multiple non-time bars from one event. */
export interface BarIdentity {
  datasetId: string;
  revision: string;
  transformId: string;
  ordinal: number;
  sourceFirstSequence: number;
  sourceLastSequence: number;
}

export interface MarketEventClock {
  eventTime: number;
  receivedAt: number;
  availableAt: number;
  sequence: number;
}

export interface Quote extends MarketEventClock {
  instrumentId: string;
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
  session: SessionBasis;
  fixture: boolean;
}

export type StrategyFillBasis = 'chart-prices' | 'standard-ohlc';
export interface ExecutionBasis {
  mode: 'paper' | 'replay-paper' | 'strategy';
  accountId: string;
  runId: string;
  signalDatasetId: string;
  fillDatasetId: string;
  /** Nonstandard strategy charts default to chart prices; HA can opt into standard OHLC. */
  strategyFillBasis?: StrategyFillBasis;
  adjustment: AdjustmentBasis;
  intrabarPolicy: 'quotes' | 'ohlc-path' | 'lower-timeframe' | 'unresolved';
}

export interface DomainDiagnostic {
  code: string;
  message: string;
  row?: number;
  field?: string;
  severity: 'error' | 'warning';
}

export type NumericSeries = Array<number | null>;
export type PriceSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';
