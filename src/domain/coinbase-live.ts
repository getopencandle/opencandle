import { COINBASE_PRODUCTS } from './coinbase-products';
import type { Bar, BarDataset, Instrument, ProviderCapabilities } from './types';
import { LiveBarSeries } from './live-bars';
import { liveQuotes, normalizeLiveQuote } from './live-quotes';
import { foldBars, planCoinbaseInterval, type LiveIntervalPlan } from './live-intervals';
import { buildLiveDataset, dataStateOf, liveSessionId, notify, renewLiveRevision, type LiveBridgeResult, type LiveEntry, type LiveFeedStatus, type LiveHandle } from './live-provider';
import { BAR_CACHE_MAX_BARS, BAR_CACHE_OVERLAP_BARS, BAR_CACHE_WRITE_DELAY_MS, LIVE_CACHED_NOTE, cacheOverlapMatches, cacheOverlapStart, closedBarsForCache, hasBarCache, mergeCachedHistory, validCachedBars, type BarCacheBridge, type BarCacheKey } from './live-cache';
import { LIVE_HISTORY_PAGE_BARS, LiveHistoryPager, registerLiveHistory, unregisterLiveHistory, type LiveHistoryPage } from './live-history';

/**
 * Coinbase Advanced Trade PUBLIC market data (no account, key or JWT). The network lives in
 * electron/public-coinbase.cjs; this module turns its validated events into a BarDataset.
 * Live engine: candles channel (5-minute buckets, updated every second) for 5m and above, aggregated into
 * UTC-aligned 15m/1h/6h/1d buckets; ticker channel for 1m price updates with REST reconciliation each minute.
 */
export const COINBASE_PROVIDER_ID = 'coinbase-public';
export const COINBASE_PROVIDER_NAME = 'Coinbase Advanced Trade public market data';
export { COINBASE_PRODUCTS } from './coinbase-products';
export type CoinbaseProduct = typeof COINBASE_PRODUCTS[number];
export type CoinbaseGranularity = 'ONE_MINUTE' | 'FIVE_MINUTE' | 'FIFTEEN_MINUTE' | 'ONE_HOUR' | 'SIX_HOUR' | 'ONE_DAY';
/** LV interval ids (parseInterval canonical form) to Coinbase granularity enum. */
export const COINBASE_RESOLUTIONS: Readonly<Record<string, { granularity: CoinbaseGranularity; seconds: number }>> = Object.freeze({
  '1m': { granularity: 'ONE_MINUTE', seconds: 60 }, '5m': { granularity: 'FIVE_MINUTE', seconds: 300 }, '15m': { granularity: 'FIFTEEN_MINUTE', seconds: 900 },
  '60m': { granularity: 'ONE_HOUR', seconds: 3600 }, '360m': { granularity: 'SIX_HOUR', seconds: 21600 }, '1D': { granularity: 'ONE_DAY', seconds: 86400 },
});
const NATIVE_BY_SECONDS: Readonly<Record<number, CoinbaseGranularity>> = Object.freeze(Object.fromEntries(Object.values(COINBASE_RESOLUTIONS).map(row => [row.seconds, row.granularity])));
/** Canonical interval id when a live Coinbase chart can show it (natively or by aggregation from the finest feed), else null. */
export function coinbaseResolution(value: string): string | null { const plan = planCoinbaseInterval(value); return plan.ok ? plan.plan.id : null; }
export const COINBASE_LICENSE = 'Coinbase Market Data Terms: personal, internal use only; not redistributable. Do not share or resell.';
export const LIVE_CRYPTO_SETTING = Object.freeze({ id: 'liveCryptoCoinbase', label: 'Live crypto data (Coinbase public feed)', defaultValue: false,
  disclosure: 'When on, OpenCandle connects to Coinbase public market data from this computer. Coinbase sees your IP address and the products charted. No account or key is used.' });

const NAMES: Record<CoinbaseProduct, string> = { 'BTC-USD': 'Bitcoin / US Dollar', 'ETH-USD': 'Ether / US Dollar', 'SOL-USD': 'Solana / US Dollar' };
export function coinbaseInstrument(productId: CoinbaseProduct): Instrument {
  return { id: `COINBASE:${productId}`, symbol: productId, name: `${NAMES[productId]} (Coinbase public feed)`, exchange: 'COINBASE', currency: 'USD', assetClass: 'crypto', tickSize: 0.01, lotSize: 0.00000001, timezone: 'UTC' };
}
export const coinbaseDatasetId = (productId: string, resolution: string) => `live:${COINBASE_PROVIDER_ID}:${productId}:${resolution}`;
export const COINBASE_CAPABILITIES: ProviderCapabilities = {
  id: COINBASE_PROVIDER_ID, assets: ['crypto'], universe: COINBASE_PRODUCTS.join(', ') + ' (fixed allow-list)', fields: ['ohlcv'],
  resolutions: Object.keys(COINBASE_RESOLUTIONS), streaming: true, delaySeconds: 0, sessions: ['all'], adjustmentBases: ['raw'],
  earliestHistory: Object.fromEntries(Object.keys(COINBASE_RESOLUTIONS).map(id => [id, null])), requiresKey: false, redistributable: false,
  limits: ['350 candles per REST request', '8 WebSocket connections and 8 unauthenticated messages per second per IP', 'candles channel is 5-minute buckets updated every second'],
  // No captured live session has passed review yet; the runtime reports observed live messages separately.
  verifiedLive: false,
};
const NOTES = [
  'Real-time public Coinbase spot data; prices are Coinbase venue prices, not a consolidated index.',
  'Tick size and lot size are OpenCandle display assumptions, not read from the Coinbase products endpoint.',
  'Higher intervals are built from Coinbase 5-minute candles in UTC buckets; 1m bars update from the ticker and reconcile from public REST candles.',
  'Forming 1m bar volume comes from REST reconciliation; ticker messages carry price only.',
];

export interface CoinbaseCandlesValue { schemaVersion: 1; productId: string; granularity: CoinbaseGranularity; seconds: number; bars: Bar[]; provenance: { provider: string; kind: 'public-unauthenticated'; sourceUrl: string; retrievedAt: string; bytes: number; license: string } }
export interface CoinbaseStatus extends LiveFeedStatus { productIds: string[] }
export type CoinbaseEvent =
  | { schemaVersion: 1; kind: 'status'; status: CoinbaseStatus }
  | { schemaVersion: 1; kind: 'batch'; candles: Array<Bar & { productId: string; seconds: number }>; tickers: Array<{ productId: string; price: number; time: number; high: number; low: number;
      /** The ticker's best bid and ask, when Coinbase sent them. */
      bid?: number | null; ask?: number | null; bidSize?: number | null; askSize?: number | null }>; gap: boolean; receivedAt: string };
/** The preload surface this provider needs (window.lv members). */
export interface CoinbaseBridge {
  fetchCoinbaseCandles(input: { requestId: string; productId: string; granularity: CoinbaseGranularity; start: number; end: number }): Promise<LiveBridgeResult<CoinbaseCandlesValue>>;
  subscribeCoinbase(input: { productIds: string[] }): Promise<LiveBridgeResult<CoinbaseStatus>>;
  unsubscribeCoinbase(): Promise<LiveBridgeResult<CoinbaseStatus>>;
  onCoinbaseEvent(handler: (event: CoinbaseEvent) => void): () => void;
  /** Drops a queued or running candle request (preload `cancelCoinbaseRequest`). Optional: older bridges
   * and tests have none, and a request then simply runs to the end and is ignored. */
  cancelCoinbaseRequest?(input: { requestId: string }): Promise<unknown>;
}
/** Seconds per Coinbase granularity enum. */
const SECONDS_BY_GRANULARITY: Readonly<Record<CoinbaseGranularity, number>> = Object.freeze({ ONE_MINUTE: 60, FIVE_MINUTE: 300, FIFTEEN_MINUTE: 900, ONE_HOUR: 3600, SIX_HOUR: 21600, ONE_DAY: 86400 });
/** The desktop bridge refuses every candle request for this long after Coinbase answers 429/403
 * (electron/public-coinbase.cjs REST_DENIED_BACKOFF_MS), so a rate-limited history page waits it out once. */
export const COINBASE_RATE_LIMIT_PAUSE_MS = 60_000;
/** Closed candles kept per product and granularity for this session; past this many the key starts over. */
export const COINBASE_CANDLE_MEMORY_MAX = 60_000;
/** Closed candles fetched this session for one product and granularity: the candle start times fetched, as merged
 * [from, to) spans (Coinbase windows include both ends; every candle in a span was closed when fetched), and the candles. */
interface CandleMemory { spans: Array<[number, number]>; bars: Map<number, Bar> }
/** One bridge request shared by every feed that asks for the same window while it runs. */
interface CandleFlight { requestId: string; owners: Set<object>; promise: Promise<LiveBridgeResult<CoinbaseCandlesValue>> }

/** Placeholder rows for symbol search when the setting is on; empty when off (the default). */
export function coinbaseSearchDatasets(enabled: boolean, resolution = '5m'): BarDataset[] {
  const id = coinbaseResolution(resolution) ?? '5m';
  if (!enabled) return [];
  return COINBASE_PRODUCTS.map(productId => ({ instrument: coinbaseInstrument(productId), bars: [], resolution: id, provenance: {
    providerId: COINBASE_PROVIDER_ID, providerName: COINBASE_PROVIDER_NAME, datasetId: coinbaseDatasetId(productId, id), fixture: false,
    coverage: 'Live public feed; not connected until opened', asOf: 0, delaySeconds: 0, adjustment: 'raw', session: 'all', timezone: 'UTC',
    state: 'disconnected', license: COINBASE_LICENSE, revision: 'live-v1:not-connected', notes: [...NOTES] } }));
}
export function isCoinbaseProduct(value: string): value is CoinbaseProduct { return (COINBASE_PRODUCTS as readonly string[]).includes(value); }

/** The local bar cache key of one Coinbase chart. Coinbase has one venue feed, raw prices
 * and no plan, so those fields are fixed ('spot', 'raw', 'public'); the namespace keeps the records apart from Alpaca's. */
export function coinbaseCacheKey(productId: string, interval: string): BarCacheKey {
  return { provider: COINBASE_PROVIDER_ID, symbol: productId, interval, feed: 'spot', adjustment: 'raw', plan: 'public' };
}
const sameKey = (a: BarCacheKey | null | undefined, b: BarCacheKey): boolean => !!a && a.provider === b.provider && a.symbol === b.symbol && a.interval === b.interval && a.feed === b.feed && a.adjustment === b.adjustment && a.plan === b.plan;

const BACKFILL_BARS = 300;
/** `fromCache` while cached bars are shown and the refresh has not completed; `restThrough` the instant up to
 * which bars came from public REST history (the backfill instant), null before a backfill; a pending batched write. */
type Entry = LiveEntry & { productId: CoinbaseProduct; granularity: CoinbaseGranularity; plan: LiveIntervalPlan;
  fromCache: boolean; restThrough: number | null; cacheDirty: boolean; cacheTimer: ReturnType<typeof setTimeout> | null;
  /** A failed first load retries while the chart stays open (a rate limit used to leave it empty for good). */
  backfillTries?: number; backfillRetry?: ReturnType<typeof setTimeout> | null };
const CANDLES_PER_REQUEST = 300, BACKFILL_CHUNKS = 6, SEED_CHUNKS = 4;
/** Oldest candle start the main-process bridge accepts (electron/public-coinbase.cjs EARLIEST): the provider limit. */
export const COINBASE_EARLIEST_HISTORY = Date.UTC(2015, 0, 1) / 1000;
const alignUp = (time: number, size: number) => Math.ceil(time / size) * size;

export class CoinbaseLiveProvider {
  private entries = new Map<string, Entry>();
  private status: CoinbaseStatus | null = null;
  private unlisten: (() => void) | null = null;
  private subscribed = '';
  private counter = 0;
  private disposed = false;
  readonly session: string;
  private readonly now: () => number;
  /** The main-process bar cache, when the bridge offers it (the desktop app). Tests and older bridges have none. */
  private readonly cache: (BarCacheBridge & Required<Pick<BarCacheBridge, 'readBarCache' | 'writeBarCache'>>) | null;
  constructor(private bridge: CoinbaseBridge & BarCacheBridge, options: { now?: () => number } = {}) { this.now = options.now ?? (() => Date.now()); this.session = liveSessionId(this.now()); this.cache = hasBarCache(bridge) ? bridge : null; }

  open(productId: string, resolution: string): LiveHandle {
    if (this.disposed) throw new Error('The live crypto provider is closed.');
    if (!isCoinbaseProduct(productId)) throw new Error(`${productId} is not on the Coinbase live allow-list (${COINBASE_PRODUCTS.join(', ')}).`);
    const planned = planCoinbaseInterval(resolution);
    if (!planned.ok) throw new Error(planned.reason);
    const plan = planned.plan, id = plan.id;
    const key = coinbaseDatasetId(productId, id);
    let entry = this.entries.get(key);
    if (!entry) {
      const seconds = plan.nominalSeconds, granularity = NATIVE_BY_SECONDS[plan.backfillSeconds];
      const series = new LiveBarSeries({ seconds, baseSeconds: plan.baseSeconds, ticks: plan.ticks, aligned: true, ...(plan.bucketOf ? { bucketOf: plan.bucketOf } : {}) });
      entry = { key, symbol: productId, productId, resolution: id, seconds, granularity, plan, series, refs: 0, listeners: new Set(), cached: null, cachedRevision: -1, backfilled: false, lastError: null, seeding: new Set(), reconcileAfter: null,
        fromCache: false, restThrough: null, cacheDirty: false, cacheTimer: null };
      this.newPager(entry);
      this.entries.set(key, entry);
      void this.start(entry);
    }
    entry.refs++;
    this.syncSubscription();
    const owned = entry; let closed = false;
    const listeners = new Set<(dataset: BarDataset) => void>();
    return {
      datasetId: key,
      dataset: () => this.dataset(owned),
      formingTime: () => owned.series.formingTime,
      onChange: listener => { owned.listeners.add(listener); listeners.add(listener); return () => { owned.listeners.delete(listener); listeners.delete(listener); }; },
      close: () => { if (closed) return; closed = true; for (const listener of listeners) owned.listeners.delete(listener); if (--owned.refs <= 0) { this.entries.delete(owned.key); unregisterLiveHistory(owned.key, owned.history); this.cancelFlights(owned); if (owned.backfillRetry) { clearTimeout(owned.backfillRetry); owned.backfillRetry = null; } void this.writeCache(owned); } this.syncSubscription(); },
      loadOlder: () => owned.history!.load(),
      historyState: () => owned.history!.state(),
    };
  }
  /** Current feed status as last reported by the main process. */
  feedStatus(): CoinbaseStatus | null { return this.status; }
  dispose(): void { for (const entry of this.entries.values()) void this.writeCache(entry); this.disposed = true; for (const entry of this.entries.values()) unregisterLiveHistory(entry.key, entry.history); this.cancelFlights(null); this.flights.clear(); this.memory.clear(); this.entries.clear(); this.syncSubscription(); }
  /** Write every pending cache batch now (tests; the app writes on a timer, on close and on dispose). */
  async flushBarCache(): Promise<void> { await Promise.all([...this.entries.values()].map(entry => this.writeCache(entry))); }
  private newPager(entry: Entry): void {
    if (entry.history) unregisterLiveHistory(entry.key, entry.history);
    const owned = entry;
    entry.history = new LiveHistoryPager(() => this.olderPage(owned), this.now);
    registerLiveHistory(entry.key, entry.history);
  }

  /** The page of up to LIVE_HISTORY_PAGE_BARS bars (1000) before the first loaded bar, from public REST candles at the backfill size.
   * Folded intervals fetch whole buckets only; the provider limit is the bridge's earliest accepted candle. */
  private async olderPage(entry: Entry): Promise<LiveHistoryPage> {
    // A page belongs to the entry and series it was computed from. The same key can be closed and
    // reopened while a page is in flight (4h -> 1D -> 4h), and a cached snapshot's series is replaced by the REST refresh;
    // a page for either never lands in the newer series (it was measured from another first bar and would leave a hole).
    const series = entry.series, first = series.bars[0]?.time;
    // Before the first history lands (or while cached bars wait for their refresh) no page can start:
    // 'wait' makes no request and no 30 s error pause.
    if (!entry.backfilled || first === undefined) return { kind: 'wait' };
    if (entry.series.bars.length >= entry.series.maxBars) return { kind: 'exhausted' };
    const plan = entry.plan, nominal = entry.seconds, size = plan.native ? nominal : plan.backfillSeconds, earliest = alignUp(COINBASE_EARLIEST_HISTORY, size);
    let bars: Bar[] | null, start: number;
    if (plan.native) {
      start = Math.max(earliest, first - LIVE_HISTORY_PAGE_BARS * nominal);
      if (start >= first) return { kind: 'exhausted' };
      // A page is several 300-candle requests, newest first, so a request that fails part way still leaves
      // the fetched bars contiguous with the first loaded bar (no hole). The next page starts from the new first bar.
      const parts: Bar[][] = []; let cursor = first;
      while (cursor > start) {
        const from = Math.max(start, cursor - CANDLES_PER_REQUEST * nominal);
        const got = await this.request(entry, entry.granularity, from, cursor);
        if (!got) break;
        parts.unshift(got); cursor = from;
      }
      if (cursor > start) start = Number.POSITIVE_INFINITY; // incomplete: never read as the provider limit below
      bars = parts.length ? parts.flat() : null;
    } else {
      const pageBars = Math.max(1, Math.min(LIVE_HISTORY_PAGE_BARS, Math.floor(BACKFILL_CHUNKS * CANDLES_PER_REQUEST * size / nominal)));
      start = Math.max(earliest, plan.bucketOf!(first - pageBars * nominal));
      if (start >= first) return { kind: 'exhausted' };
      const raw = await this.candles(entry, entry.granularity, size, start, first, BACKFILL_CHUNKS, false, true);
      // A bucket that starts before `start` (only at the provider limit) is partial: it is not shown.
      bars = raw ? foldBars(raw.filter(bar => bar.time >= start && bar.time < first), plan.bucketOf!).filter(bar => bar.time >= start) : null;
    }
    if (this.entries.get(entry.key) !== entry || this.disposed) return { kind: 'error', message: 'The live chart closed.' };
    if (entry.series !== series) return { kind: 'error', message: 'The live chart was reloaded.' };
    if (!bars) { const message = entry.lastError ?? 'Coinbase request failed.', rateLimited = /limit/i.test(message); return { kind: 'error', message, rateLimited, ...(rateLimited ? { retryMs: COINBASE_RATE_LIMIT_PAUSE_MS } : {}) }; }
    const { added, capped } = series.prependHistory(bars);
    if (added) { this.changed(entry); this.scheduleCacheWrite(entry); }
    if (!added || capped || start <= earliest) return { kind: 'exhausted' };
    return { kind: 'added', added };
  }

  private dataset(entry: Entry): BarDataset {
    return buildLiveDataset(entry, coinbaseInstrument(entry.productId), this.session, { providerId: COINBASE_PROVIDER_ID, providerName: COINBASE_PROVIDER_NAME, datasetId: entry.key,
      coverage: `Coinbase spot ${entry.productId} only`, delaySeconds: 0, session: 'all', timezone: 'UTC', license: COINBASE_LICENSE,
      notes: [...(entry.fromCache ? [LIVE_CACHED_NOTE] : []), ...NOTES, this.status?.liveMessages ? 'Live messages received in this session.' : 'No live message received yet in this session.'], asOf: this.status?.lastMessageAt ? Math.floor(this.status.lastMessageAt / 1000) : 0 });
  }
  private changed(entry: Entry): void { notify(entry, () => this.dataset(entry)); }
  private requestId(): string { return 'cb-' + this.session + '-' + (++this.counter); }
  /**
   * One candle window. A window whose candles this session already fetched closed is served from memory
   * with no request (2h and 4h fold the same 1h candles, 1W folds 1D's, a revisited interval re-reads its own pages); a window
   * already being fetched for another feed joins that request; a feed that closes cancels the requests only it was waiting on,
   * so a chart the user has left stops paging at once instead of draining the bridge queue.
   */
  private async request(entry: Entry, granularity: CoinbaseGranularity, start: number, end: number): Promise<Bar[] | null> {
    const memoryKey = entry.productId + ':' + granularity, remembered = this.recall(memoryKey, granularity, start, end);
    if (remembered) { if (this.entries.get(entry.key) !== entry) return null; entry.lastError = null; return remembered; }
    const flightKey = memoryKey + ':' + start + ':' + end;
    let flight = this.flights.get(flightKey);
    if (!flight) {
      const requestId = this.requestId();
      const promise = this.bridge.fetchCoinbaseCandles({ requestId, productId: entry.productId, granularity, start, end }).then(result => {
        if (result.ok) this.remember(memoryKey, granularity, start, end, result.value.bars);
        return result;
      });
      const created: CandleFlight = { requestId, owners: new Set(), promise };
      this.flights.set(flightKey, created);
      void promise.catch(() => undefined).finally(() => { if (this.flights.get(flightKey) === created) this.flights.delete(flightKey); });
      flight = created;
    }
    flight.owners.add(entry);
    let result: LiveBridgeResult<CoinbaseCandlesValue>;
    try { result = await flight.promise; } finally { flight.owners.delete(entry); }
    if (this.entries.get(entry.key) !== entry) return null; // closed (or closed and reopened) while the request was in flight: no commit
    if (!result.ok) { entry.lastError = `Coinbase request failed: ${result.error.message}`; return null; }
    entry.lastError = null;
    return result.value.bars;
  }
  private readonly flights = new Map<string, CandleFlight>();
  private readonly memory = new Map<string, CandleMemory>();
  /** Cancel the bridge requests that only this (closing) feed is waiting on. */
  private cancelFlights(entry: Entry | null): void {
    for (const flight of this.flights.values()) {
      if (entry) { if (!flight.owners.delete(entry) || flight.owners.size) continue; }
      try { void this.bridge.cancelCoinbaseRequest?.({ requestId: flight.requestId })?.catch?.(() => undefined); } catch { /* best effort */ }
    }
  }
  /** Keep the candles of a fetched window that were closed when it came back (a forming candle still changes). */
  private remember(key: string, granularity: CoinbaseGranularity, start: number, end: number, bars: readonly Bar[]): void {
    const size = SECONDS_BY_GRANULARITY[granularity], closedBefore = Math.floor(Math.floor(this.now() / 1000) / size) * size, until = Math.min(end + 1, closedBefore);
    if (!(until > start) || this.disposed) return;
    let memory = this.memory.get(key);
    if (!memory || memory.bars.size > COINBASE_CANDLE_MEMORY_MAX) { memory = { spans: [], bars: new Map() }; this.memory.set(key, memory); }
    for (const bar of bars) if (bar.time >= start && bar.time < until && bar.time % size === 0) memory.bars.set(bar.time, Object.freeze({ ...bar }));
    const spans = [...memory.spans, [start, until] as [number, number]].sort((a, b) => a[0] - b[0]), merged: Array<[number, number]> = [];
    for (const span of spans) { const last = merged.at(-1); if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([span[0], span[1]]); }
    memory.spans = merged;
  }
  /** The candles of [start, end] (both ends, as Coinbase) when one remembered span holds all of it, else null (fetched). */
  private recall(key: string, granularity: CoinbaseGranularity, start: number, end: number): Bar[] | null {
    const memory = this.memory.get(key);
    if (!memory || !memory.spans.some(([from, to]) => from <= start && to > end)) return null;
    const size = SECONDS_BY_GRANULARITY[granularity], out: Bar[] = [];
    for (let time = alignUp(start, size); time <= end; time += size) { const bar = memory.bars.get(time); if (bar) out.push({ ...bar }); }
    return out;
  }
  /** How far back the backfill reaches; a cached record must end inside it to be used. */
  private backfillWindow(entry: Entry): number {
    return entry.plan.native ? BACKFILL_BARS * entry.seconds : Math.min(BACKFILL_BARS * entry.seconds, BACKFILL_CHUNKS * CANDLES_PER_REQUEST * entry.plan.backfillSeconds);
  }
  /** A new feed first reads the local cache. A hit is shown at once (labelled cached, never 'ready', so paper
   * tickets and alert sources wait for the refresh) and only the gap plus an overlap is fetched; a miss backfills as before. */
  private async start(entry: Entry): Promise<void> {
    const cache = this.cache;
    if (!cache) return this.backfill(entry);
    const key = coinbaseCacheKey(entry.productId, entry.resolution);
    let cached: Bar[] | null = null;
    try {
      const result = await cache.readBarCache({ key });
      // A record of another key, or one flagged SYNTHETIC (Coinbase has no stub), is never used.
      if (result.ok && result.value && result.value.synthetic === false && sameKey(result.value.key, key) && validCachedBars(result.value.bars)) cached = result.value.bars;
    } catch { /* an unreadable cache is a miss */ }
    if (this.entries.get(entry.key) !== entry || this.disposed) return;
    const now = Math.floor(this.now() / 1000);
    if (!cached || cached.length <= BAR_CACHE_OVERLAP_BARS || cached[cached.length - 1].time < now - this.backfillWindow(entry)) return this.backfill(entry);
    entry.series.setBackfill(cached); entry.fromCache = true; entry.series.setState('loading'); entry.cached = null;
    this.changed(entry);
    return this.backfill(entry, cached);
  }
  private async backfill(entry: Entry, cachedBars: Bar[] | null = null): Promise<void> {
    const now = Math.floor(this.now() / 1000), end = now;
    // With cached bars, fetch only from the oldest of the last few cached bars (the overlap) to now.
    const overlap = cachedBars ? cacheOverlapStart(cachedBars, BAR_CACHE_OVERLAP_BARS) : null;
    let bars: Bar[] | null;
    if (entry.plan.native) bars = overlap !== null
      ? await this.candles(entry, entry.granularity, entry.seconds, overlap, end, BACKFILL_CHUNKS)
      : await this.request(entry, entry.granularity, Math.floor(now / entry.seconds) * entry.seconds - (BACKFILL_BARS - 1) * entry.seconds, end);
    else {
      const source = entry.plan.backfillSeconds, wanted = (entry.plan.bucketOf!(now)) - (BACKFILL_BARS - 1) * entry.seconds;
      const raw = await this.candles(entry, entry.granularity, source, overlap ?? Math.max(wanted, now - BACKFILL_CHUNKS * CANDLES_PER_REQUEST * source), end, BACKFILL_CHUNKS);
      bars = raw ? foldBars(raw, entry.plan.bucketOf!) : null;
    }
    if (this.entries.get(entry.key) !== entry) return;
    // A failed refresh keeps cached bars on screen, still labelled cached, with the reason in lastError.
    if (!bars) { entry.series.setState('error'); this.changed(entry); this.retryBackfill(entry, cachedBars); return; }
    if (cachedBars && overlap !== null) {
      // A changed or missing overlap bar (a corrected print): the product's cache is discarded and the whole window
      // reloads; cached bars are never stitched to different history.
      if (!cacheOverlapMatches(cachedBars, bars, overlap)) { void this.discardCache(entry); return this.backfill(entry, null); }
      bars = mergeCachedHistory(cachedBars, bars, overlap).slice(-BAR_CACHE_MAX_BARS);
    }
    if (entry.fromCache) {
      // The cached snapshot was its own source: the refreshed bars get a new series, pager and revision.
      const plan = entry.plan;
      entry.series = new LiveBarSeries({ seconds: entry.seconds, baseSeconds: plan.baseSeconds, ticks: plan.ticks, aligned: true, ...(plan.bucketOf ? { bucketOf: plan.bucketOf } : {}) });
      entry.fromCache = false; entry.lastError = null; entry.seeding.clear();
      renewLiveRevision(entry); this.newPager(entry);
    }
    entry.series.setBackfill(bars); entry.backfilled = true; entry.restThrough = now;
    entry.series.setState(dataStateOf(this.status?.state));
    entry.reconcileAfter = entry.plan.baseSeconds === 60 ? Math.floor(now / 60) * 60 : null;
    this.changed(entry);
    this.scheduleCacheWrite(entry);
  }
  /** A failed first load tries again every 10 s, up to 12 times. While the bridge refuses after a rate limit
   * (60 s) a try is answered at once with no network request, so the chart loads within 10 s of the refusal ending. */
  private retryBackfill(entry: Entry, cachedBars: Bar[] | null): void {
    const tries = entry.backfillTries ?? 0;
    if (tries >= 12 || this.disposed || this.entries.get(entry.key) !== entry || entry.backfillRetry) return;
    entry.backfillTries = tries + 1;
    const wait = 10_000;
    entry.backfillRetry = setTimeout(() => { entry.backfillRetry = null; if (!this.disposed && this.entries.get(entry.key) === entry && !entry.backfilled) void this.backfill(entry, cachedBars); }, wait);
  }
  /** Closed REST history bars to cache: strictly before the forming bar, each bucket ended by the backfill instant, minus
   * provisional ones. Null while cached bars are still shown or before a backfill. */
  private cacheBars(entry: Entry): Bar[] | null {
    if (!entry.backfilled || entry.fromCache || entry.restThrough === null) return null;
    const bucketEnd = (time: number) => entry.plan.bucketRange?.(time).end ?? time + entry.seconds;
    const closed = closedBarsForCache(entry.series.bars, entry.restThrough, bucketEnd, entry.series.provisionalTimes);
    return closed.length ? closed.slice(-BAR_CACHE_MAX_BARS) : null;
  }
  private scheduleCacheWrite(entry: Entry): void {
    if (!this.cache || this.disposed) return;
    entry.cacheDirty = true;
    if (entry.cacheTimer !== null) return;
    entry.cacheTimer = setTimeout(() => { entry.cacheTimer = null; void this.writeCache(entry); }, BAR_CACHE_WRITE_DELAY_MS);
  }
  private async writeCache(entry: Entry): Promise<void> {
    if (entry.cacheTimer !== null) { clearTimeout(entry.cacheTimer); entry.cacheTimer = null; }
    if (!this.cache || !entry.cacheDirty) return;
    entry.cacheDirty = false;
    const bars = this.cacheBars(entry);
    if (!bars) return;
    try { await this.cache.writeBarCache({ key: coinbaseCacheKey(entry.productId, entry.resolution), bars }); } catch { /* a failed write only costs a download next launch */ }
  }
  private async discardCache(entry: Entry): Promise<void> {
    try { await this.cache?.discardBarCache?.({ provider: COINBASE_PROVIDER_ID, symbol: entry.productId }); } catch { /* best effort */ }
  }
  private async seed(entry: Entry, bucket: number): Promise<void> {
    if (entry.seeding.has(bucket)) return;
    entry.seeding.add(bucket);
    try {
      const end = Math.min(bucket + entry.seconds, Math.floor(this.now() / 1000));
      if (end <= bucket) return;
      const base = entry.plan.baseSeconds;
      const bars = await this.candles(entry, NATIVE_BY_SECONDS[base], base, bucket, end, SEED_CHUNKS, true);
      if (bars && entry.series.seedBucket(bucket, bars)) this.changed(entry);
    } finally { entry.seeding.delete(bucket); }
  }
  /** Candles over [start, end] in requests of at most 300. `all` makes a span beyond `chunks` requests a skip (null) instead of a truncation. */
  private async candles(entry: Entry, granularity: CoinbaseGranularity, size: number, start: number, end: number, chunks: number, all = false, strict = false): Promise<Bar[] | null> {
    const step = CANDLES_PER_REQUEST * size, count = Math.ceil((end - start) / step);
    if (count > chunks && all) return null;
    const out: Bar[] = [];
    for (let index = Math.max(0, count - chunks); index < count; index++) {
      const bars = await this.request(entry, granularity, start + index * step, Math.min(end, start + (index + 1) * step));
      if (!bars) return out.length && !strict ? out : null; // strict (an older page): a partial window would leave a hole
      out.push(...bars);
    }
    const seen = new Set<number>();
    return out.filter(bar => !seen.has(bar.time) && seen.add(bar.time));
  }
  private async reconcile(entry: Entry): Promise<void> {
    const now = Math.floor(this.now() / 1000), last = entry.series.formingTime ?? now;
    if (!entry.plan.native) {
      // Folded interval: closed-minute volume comes from base (1-minute) REST bars, never from target-size bars.
      const bars = await this.request(entry, NATIVE_BY_SECONDS[entry.plan.baseSeconds], Math.max(0, now - entry.plan.baseSeconds * 4), now);
      if (bars && entry.series.replaceBase(bars)) this.changed(entry);
      return;
    }
    const bars = await this.request(entry, entry.granularity, Math.max(0, Math.min(last, now) - entry.seconds * 3), now);
    if (bars && entry.series.reconcile(bars)) this.changed(entry);
  }
  private syncSubscription(): void {
    const products = [...new Set([...this.entries.values()].map(entry => entry.productId))].sort();
    const signature = products.join(',');
    if (signature === this.subscribed) return;
    this.subscribed = signature;
    // A product leaving the stream takes its quote with it, as on Alpaca.
    const left = [...this.quoted].filter(id => !products.includes(id as CoinbaseProduct)); if (left.length) { liveQuotes.clear(left.map(id => coinbaseInstrument(id as CoinbaseProduct).id)); for (const id of left) this.quoted.delete(id); }
    if (!products.length) { this.unlisten?.(); this.unlisten = null; void this.bridge.unsubscribeCoinbase().catch(() => undefined); return; }
    if (!this.unlisten) this.unlisten = this.bridge.onCoinbaseEvent(event => this.receive(event));
    void this.bridge.subscribeCoinbase({ productIds: products }).then(result => { if (result.ok) this.applyStatus(result.value); }).catch(() => undefined);
  }
  private applyStatus(status: CoinbaseStatus): void {
    const previous = this.status?.state; this.status = status;
    const state = dataStateOf(status.state);
    if (status.state !== 'ready' && status.state !== 'stale' && this.quoted.size) { liveQuotes.clear([...this.quoted].map(id => coinbaseInstrument(id as CoinbaseProduct).id)); this.quoted.clear(); }
    const resumed = status.state === 'ready' && (previous === 'disconnected' || previous === 'connecting') && this.everReady;
    if (status.state === 'ready') this.everReady = true;
    for (const entry of this.entries.values()) {
      let changed = entry.backfilled ? entry.series.setState(state) : false;
      if (resumed && entry.backfilled) { for (const bucket of entry.series.resetLive()) void this.seed(entry, bucket); void this.reconcile(entry); }
      changed = this.refreshNotes(entry) || changed;
      if (changed) this.changed(entry);
    }
  }
  private everReady = false;
  /** Products whose quotes this provider published. */
  private readonly quoted = new Set<string>();
  private refreshNotes(entry: Entry): boolean { const before = entry.cached; entry.cached = null; return before !== null; }
  /** Main-process events are validated there; this re-checks the product and drops anything for closed series. */
  receive(event: CoinbaseEvent): void {
    if (this.disposed || !event || event.schemaVersion !== 1) return;
    if (event.kind === 'status') { this.applyStatus(event.status); return; }
    if (event.kind !== 'batch') return;
    // The public ticker's best bid and ask, for the products this provider streams.
    const streamed = new Set([...this.entries.values()].map(entry => entry.productId as string)), receivedAt = Date.now();
    for (const ticker of event.tickers) {
      if (!streamed.has(ticker.productId) || (ticker.bid == null && ticker.ask == null)) continue;
      const quote = normalizeLiveQuote(ticker, { instrumentId: coinbaseInstrument(ticker.productId as CoinbaseProduct).id, symbol: ticker.productId, providerId: COINBASE_PROVIDER_ID, feed: 'coinbase', synthetic: false, receivedAt });
      if (quote) { liveQuotes.publish(quote); this.quoted.add(ticker.productId); }
    }
    const touched = new Set<Entry>();
    for (const entry of this.entries.values()) {
      if (!entry.backfilled) continue;
      if (entry.plan.baseSeconds === 300) {
        for (const candle of event.candles) {
          if (candle.productId !== entry.productId || candle.seconds !== 300) continue;
          const result = entry.series.applyBase({ time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume });
          if (result.changed) touched.add(entry);
          if (result.seed !== null) void this.seed(entry, result.seed);
        }
      } else {
        for (const ticker of event.tickers) {
          if (ticker.productId !== entry.productId) continue;
          const minute = Math.floor(ticker.time / 60) * 60;
          // A new minute closes the previous one: reconcile closed volume from public REST candles.
          if (entry.reconcileAfter !== null && minute > entry.reconcileAfter) { entry.reconcileAfter = minute; void this.reconcile(entry); }
          if (entry.series.applyTick({ time: ticker.time, price: ticker.price, high: ticker.high, low: ticker.low, size: null }).changed) touched.add(entry);
        }
      }
      if (event.gap) { for (const bucket of entry.series.resetLive()) void this.seed(entry, bucket); void this.reconcile(entry); }
    }
    if (this.status && !this.status.liveMessages && (event.candles.length || event.tickers.length)) { this.status = { ...this.status, liveMessages: true }; for (const entry of this.entries.values()) { entry.cached = null; touched.add(entry); } }
    for (const entry of touched) this.changed(entry);
  }
}
