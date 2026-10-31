import {rawLiveSessionSource} from './live-session-source';
import type { BarDataset, DataProvenance, DataState, Instrument } from './types';
import { LiveBarSeries } from './live-bars';
import { stampLiveLineage } from '../chart/bar-input-identity';
import { recordLiveOrigin, type LiveHistoryPager, type LiveHistoryState } from './live-history';
import { isCachedLiveDataset } from './live-cache';

/** Shared bookkeeping for main-process live feeds (Coinbase public, Alpaca IEX). Pure renderer code: no network. */
export type LiveBridgeResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export type LiveFeedState = 'idle' | 'connecting' | 'authenticating' | 'ready' | 'stale' | 'disconnected' | 'auth-failed' | 'closed';
export interface LiveFeedStatus { schemaVersion: 1; state: LiveFeedState; attempt: number; lastMessageAt: number | null; liveMessages: boolean; lastError: string | null; counters: Record<string, number> }

export function dataStateOf(state: LiveFeedState | undefined): DataState {
  switch (state) {
    case 'ready': return 'ready';
    case 'stale': return 'stale';
    case 'connecting': case 'authenticating': return 'loading';
    case 'auth-failed': return 'error';
    default: return 'disconnected';
  }
}

export interface LiveHandle {
  readonly datasetId: string;
  /** Snapshot whose identity changes only when bars, state or revision change. */
  dataset(): BarDataset;
  /** Last bar time while it is still forming (null when empty). Closed-bar consumers stop before it. */
  formingTime(): number | null;
  onChange(listener: (dataset: BarDataset) => void): () => void;
  close(): void;
  /** Fetch and prepend the previous page of history (one page in flight; "No more data" at the provider's limit). */
  loadOlder?(): Promise<LiveHistoryState>;
  historyState?(): LiveHistoryState;
}

export interface LiveEntry {
  key: string; symbol: string; resolution: string; seconds: number;
  series: LiveBarSeries; refs: number; listeners: Set<(dataset: BarDataset) => void>;
  cached: BarDataset | null; cachedRevision: number; backfilled: boolean; lastError: string | null;
  seeding: Set<number>; reconcileAfter: number | null;
  /** Lazy older-history paging for this subscription (created with the entry). */
  history?: LiveHistoryPager;
}

export interface ProvenanceTemplate {
  providerId: string; providerName: string; datasetId: string; coverage: string; delaySeconds: number;
  session: DataProvenance['session']; timezone: string; license: string; notes: string[]; asOf: number;
  /** The price basis of the bars (default 'raw'). */
  adjustment?: DataProvenance['adjustment'];
}

let sessionCounter = 0;
/** Revisions of live data are sequences, never content hashes: the forming bar mutates. */
export function liveSessionId(now: number): string { return Math.floor(now / 1000).toString(36) + (++sessionCounter).toString(36); }

/** One number per subscription (feed entry) so a closed and reopened feed is a new source. */
const incarnations = new WeakMap<LiveEntry, number>();
let incarnationCounter = 0;
function incarnationOf(entry: LiveEntry): number { let value = incarnations.get(entry); if (value === undefined) { value = ++incarnationCounter; incarnations.set(entry, value); } return value; }
/** The source revision of a live subscription. It is fixed for the life of the subscription: forming-bar updates and
 * appended bars are growth of the same source, never a new revision (LIVE-CB-spec section 0). */
export function liveRevision(entry: LiveEntry, session: string): string { return `live-v1:${session}:${incarnationOf(entry)}`; }
/** The subscription's bars were replaced on a new price basis (a re-adjusted reload), so it is a new
 * source: the next snapshot carries a new revision and lineage, exactly as a closed and reopened feed would. */
export function renewLiveRevision(entry: LiveEntry): void { incarnations.delete(entry); entry.cached = null; }

export function buildLiveDataset(entry: LiveEntry, instrument: Instrument, session: string, template: ProvenanceTemplate): BarDataset {
  if (entry.cached && entry.cachedRevision === entry.series.revision) return entry.cached;
  const series = entry.series, provisional = series.provisionalTimes;
  const notes = [...template.notes, `${series.bars.length} bars loaded.`];
  if (provisional.length) notes.push(`Provisional bar(s) awaiting public REST reconciliation: ${provisional.join(', ')} (Unix seconds).`);
  if (entry.lastError) notes.push(entry.lastError);
  const revision = liveRevision(entry, session);
  // Coverage is part of the chart basis identity, so it must stay constant: the bar count lives in the notes.
  const provenance: DataProvenance = {
    providerId: template.providerId, providerName: template.providerName, datasetId: template.datasetId, fixture: false,
    coverage: `${template.coverage}; the last bar is forming until its interval closes`,
    asOf: template.asOf || (series.bars.at(-1)?.time ?? 0), delaySeconds: template.delaySeconds, adjustment: template.adjustment ?? 'raw', session: template.session,
    timezone: template.timezone, state: series.state, license: template.license, revision, notes,
  };
  try { stampLiveLineage(series.bars, `${template.datasetId}|${revision}`, series.revision); } catch { /* an unstampable array stays an ordinary input */ }
  recordLiveOrigin(series.bars, series.originTime);
  entry.cached = { instrument: { ...instrument }, bars: series.bars, resolution: entry.resolution, provenance };
  entry.cachedRevision = series.revision;
  return entry.cached;
}

export function notify(entry: LiveEntry, build: () => BarDataset): void {
  if (!entry.listeners.size) return;
  const dataset = build();
  for (const listener of [...entry.listeners]) { try { listener(dataset); } catch { /* a listener failure never stops the feed */ } }
}

/** Providers whose rows are live feeds. Search shows exactly these as "Live". */
export const LIVE_SEARCH_PROVIDER_IDS: readonly string[] = Object.freeze(['coinbase-public', 'alpaca-iex', 'alpaca-stub']);
/** Providers whose license forbids redistribution (live feeds plus Alpaca delayed history). */
export const LIVE_LICENSED_PROVIDER_IDS: readonly string[] = Object.freeze(['coinbase-public', 'alpaca-iex', 'alpaca-sip-delayed', 'alpaca-stub']);
export const isLiveProviderId = (providerId: unknown): boolean => typeof providerId === 'string' && LIVE_SEARCH_PROVIDER_IDS.includes(providerId);
export const isLicensedLiveProviderId = (providerId: unknown): boolean => typeof providerId === 'string' && LIVE_LICENSED_PROVIDER_IDS.includes(providerId);
/** An on-demand FRED economic series (`fred:fred-public:<series>:1D`). Registered like a live dataset so it is never a local
 * import and is saved as a small reference, but it has no feed and no forming bar. */
export const isFredDatasetId = (datasetId: unknown): boolean => typeof datasetId === 'string' && datasetId.startsWith('fred:');
/** Live dataset ids start with `live:` (or `fred:`, see above) and are never local imports. */
export const isLiveDatasetId = (datasetId: unknown): boolean => typeof datasetId === 'string' && (datasetId.startsWith('live:') || datasetId.startsWith('fred:'));
export const LIVE_EXPORT_NOTICE = 'Live market data is for personal display only and cannot be exported or shared.';
/** A FRED series is refused for export too (FRED terms), but it is economic data, not live market data. */
export const FRED_EXPORT_NOTICE = "FRED economic data can't be exported from OpenCandle. Download it from FRED directly.";
/** The refusal wording for a dataset id that is already known to be refused (live or FRED). */
export const exportNoticeFor = (datasetId: unknown): string => (isFredDatasetId(datasetId) ? FRED_EXPORT_NOTICE : LIVE_EXPORT_NOTICE);
/** Plain heading status for a live dataset. A dataset still showing cached bars says "Cached" until its refresh
 * completes (a failed refresh keeps it, with the reason in the notes), so cached bars are never presented as live. */
export function liveStatusLabel(provenance: Pick<DataProvenance, 'state' | 'delaySeconds'> & { notes?: readonly string[] }): 'Live' | 'Delayed 15 min' | 'Delayed' | 'Connecting' | 'Disconnected' | 'Cached' {
  if (isCachedLiveDataset(provenance)) return 'Cached';
  if (provenance.state === 'disconnected' || provenance.state === 'error') return 'Disconnected';
  // A feed that stopped delivering (stale) or has not connected yet is never presented as LIVE.
  if (provenance.state === 'stale') return 'Delayed';
  if (provenance.state === 'loading') return 'Connecting';
  return typeof provenance.delaySeconds === 'number' && provenance.delaySeconds >= 60 ? 'Delayed 15 min' : 'Live';
}

/** A live feed's last bar is always treated as forming: consumers of completed bars (replay, alerts, strategy fills) stop before it.
 * Real-time alert triggers (not "once per bar close") may still use it. Non-live datasets are returned unchanged (same object). */
export function isFormingLiveDataset(dataset: Pick<BarDataset, 'bars' | 'provenance'>): boolean {
  const raw=rawLiveSessionSource(dataset);
  if(!isLiveDatasetId(dataset.provenance.datasetId)||isFredDatasetId(dataset.provenance.datasetId)||dataset.bars.length===0)return false;
  const tail=raw.bars.at(-1),shown=dataset.bars.at(-1);
  // Only the exact raw forming row is withheld. A session view may already have excluded it.
  return shown===tail&&shown?.time===tail?.time;
}
export function completedBarsDataset<T extends Pick<BarDataset, 'bars' | 'provenance'>>(dataset: T): T {
  return isFormingLiveDataset(dataset) ? { ...dataset, bars: dataset.bars.slice(0, -1) } : dataset;
}

/** The dataset as of a just-closed live bar: bars through `closedTime` inclusive, so that bar is the last one an alert observes.
 * Pair with `AlertSnapshotInput.barClosed`. Returns null when the bar is not in the dataset or the dataset is not live. */
export function closedBarDataset<T extends Pick<BarDataset, 'bars' | 'provenance'>>(dataset: T, closedTime: number): T | null {
  if (!isLiveDatasetId(dataset.provenance.datasetId) || isFredDatasetId(dataset.provenance.datasetId)) return null;
  const index = dataset.bars.findIndex(bar => bar.time === closedTime);
  return index < 0 ? null : { ...dataset, bars: dataset.bars.slice(0, index + 1) };
}
