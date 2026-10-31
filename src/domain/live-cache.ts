import type { Bar } from './types';
import type { LiveBridgeResult } from './live-provider';

/**
 * The renderer side of the local bar cache. The cache itself lives in the main process
 * (electron/bar-cache.cjs, the app profile's market-data-cache folder, never the workspace JSON). This module holds only the
 * key shape, the bridge calls and the pure rules a live provider uses:
 *  - only CLOSED bars that came from the provider's history are cached, never the forming bar, never the IEX tail newer
 *    than the all-exchange boundary;
 *  - a launch shows cached bars at once, labelled cached, and fetches only the gap since the last cached bar plus an
 *    overlap of the last few cached bars; a different overlap bar (a split or dividend re-adjustment, a corrected print)
 *    discards that symbol's cache and reloads the whole window;
 *  - keys carry the provider namespace, symbol, interval, feed, adjustment and data plan, so raw, split-adjusted and
 *    total-return bars, free and paid plans, and the SYNTHETIC stub ('alpaca-stub') never share a record.
 * The overlap size, the write delay and the 200 MB cap.
 */
/** Alpaca keys use feed sip|iex, the three adjustments and free|paid. Coinbase keys ('coinbase-public') use the
 * 'spot' feed, 'raw' prices and the 'public' plan (electron/bar-cache.cjs checks the combination per provider). */
export interface BarCacheKey { provider: string; symbol: string; interval: string; feed: 'sip' | 'iex' | 'spot'; adjustment: 'raw' | 'split' | 'split,dividend'; plan: 'free' | 'paid' | 'public' }
export interface BarCacheRecord { schemaVersion: 1; key: BarCacheKey; savedAt: string; synthetic: boolean; bars: Bar[] }
export interface BarCacheStatus { schemaVersion: 1; bytes: number; entries: number; maxBytes: number }
/** Trusted IPC calls (electron/preload.cjs). All optional: a bridge without them simply has no cache. */
export interface BarCacheBridge {
  readBarCache?(input: { key: BarCacheKey }): Promise<LiveBridgeResult<BarCacheRecord | null>>;
  writeBarCache?(input: { key: BarCacheKey; bars: Bar[] }): Promise<LiveBridgeResult<BarCacheStatus>>;
  discardBarCache?(input: { provider: string; symbol: string }): Promise<LiveBridgeResult<{ removed: number }>>;
  barCacheStatus?(): Promise<LiveBridgeResult<BarCacheStatus>>;
  clearBarCache?(): Promise<LiveBridgeResult<BarCacheStatus>>;
}
/** How many of the newest cached bars are fetched again and compared before cached history is trusted. */
export const BAR_CACHE_OVERLAP_BARS = 5;
/** Writes are batched: at most one per chart per this many milliseconds (and one when the chart closes). */
export const BAR_CACHE_WRITE_DELAY_MS = 5000;
/** At most this many bars per cached chart (electron/bar-cache.cjs MAX_RECORD_BARS). */
export const BAR_CACHE_MAX_BARS = 20000;
export const BAR_CACHE_DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
/** The note that labels a dataset showing cached bars. It stays until the refresh from the provider completes. */
export const LIVE_CACHED_NOTE = 'Cached: these bars were saved on this computer earlier and are shown until the refresh from the provider completes.';
export const isCachedLiveDataset = (provenance: { notes?: readonly string[] }): boolean => Array.isArray(provenance.notes) && provenance.notes.includes(LIVE_CACHED_NOTE);

export function hasBarCache(bridge: unknown): bridge is Required<Pick<BarCacheBridge, 'readBarCache' | 'writeBarCache'>> & BarCacheBridge {
  const value = bridge as BarCacheBridge | null;
  return !!value && typeof value.readBarCache === 'function' && typeof value.writeBarCache === 'function';
}

/** Bars as the cache returns them: finite, positive, consistent and strictly ascending (main validates too). */
export function validCachedBars(bars: unknown): bars is Bar[] {
  if (!Array.isArray(bars) || !bars.length || bars.length > BAR_CACHE_MAX_BARS) return false;
  let previous = -Infinity;
  for (const bar of bars as Bar[]) {
    if (!bar || typeof bar !== 'object' || !Number.isSafeInteger(bar.time) || bar.time <= previous) return false;
    const prices = [bar.open, bar.high, bar.low, bar.close];
    if (!prices.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0) || typeof bar.volume !== 'number' || !Number.isFinite(bar.volume) || bar.volume < 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) return false;
    previous = bar.time;
  }
  return true;
}
const TOLERANCE = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
/** The same closed bar on the same basis: equal time, prices within 1e-6 relative, volume within 1e-6 relative. */
export function sameCachedBar(a: Bar, b: Bar): boolean {
  return a.time === b.time && near(a.open, b.open) && near(a.high, b.high) && near(a.low, b.low) && near(a.close, b.close) && near(a.volume, b.volume);
}
/** The first time of the overlap window: the oldest of the last `count` cached bars. */
export function cacheOverlapStart(cached: readonly Bar[], count = BAR_CACHE_OVERLAP_BARS): number | null {
  return cached.length ? cached[Math.max(0, cached.length - count)].time : null;
}
/** Every cached bar from `start` on must come back unchanged in the fresh fetch; a missing or different bar fails. */
export function cacheOverlapMatches(cached: readonly Bar[], fetched: readonly Bar[], start: number): boolean {
  const byTime = new Map(fetched.map(bar => [bar.time, bar] as const));
  const overlap = cached.filter(bar => bar.time >= start);
  return overlap.length > 0 && overlap.every(bar => { const fresh = byTime.get(bar.time); return !!fresh && sameCachedBar(bar, fresh); });
}
/** Cached bars before the overlap window, then the fresh fetch (which repeats the overlap). Ascending, one bar per time. */
export function mergeCachedHistory(cached: readonly Bar[], fetched: readonly Bar[], start: number): Bar[] {
  const out: Bar[] = [];
  for (const bar of [...cached.filter(row => row.time < start), ...fetched]) if (!out.length || bar.time > out[out.length - 1].time) out.push(bar);
  return out;
}
const plain = (bar: Bar): Bar => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
/** Closed bars to cache: strictly before the forming (last) bar, each bucket ended by `boundary`, minus provisional ones. */
export function closedBarsForCache(bars: readonly Bar[], boundary: number, bucketEnd: (time: number) => number, provisional: readonly number[] = []): Bar[] {
  const forming = bars.at(-1)?.time, skip = new Set(provisional);
  if (forming === undefined) return [];
  return bars.filter(bar => bar.time < forming && bucketEnd(bar.time) <= boundary && !skip.has(bar.time)).map(plain);
}

/** Short, human sizes: "51 KB", "3.2 MB", "200 MB", "1.5 GB" (one decimal below 10, no trailing ".0"). */
export function formatCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const short = (value: number) => (value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value)));
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? `${short(mb)} MB` : `${short(mb / 1024)} GB`;
}
export function describeCacheStatus(status: BarCacheStatus | null, available: boolean): string {
  if (!available) return 'Cached market data needs the desktop app.';
  if (!status) return 'Checking cached market data...';
  if (!status.entries) return `Empty (limit ${formatCacheSize(status.maxBytes)})`;
  return `${formatCacheSize(status.bytes)} of ${formatCacheSize(status.maxBytes)} used, ${status.entries} chart${status.entries === 1 ? '' : 's'}`;
}
