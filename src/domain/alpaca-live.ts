import {planSeasonalityDailyHistory,inspectSeasonalityDailyEcho,closedSeasonalityDailyPage,type SeasonalityDailyHistoryPlan,type SeasonalityDailyEcho,type SeasonalityDailySentRequest} from './seasonality-daily-history';
import {compileLiveSeasonalityDays,calculateLiveSeasonality,calculateOwnedLiveSeasonality,ownedLiveAlignmentCost,type SeasonalityLiveMonthCache,type SeasonalityLiveGrid} from './indicators-ext/seasonality-live-input';
import {reserveSeasonality,type SeasonalitySettings,type SeasonalityResult} from './indicators-ext/seasonality-types';
import type {SeasonalitySourcePoint} from './indicators-ext/seasonality-months';
import {seasonalityIntradayFrontier,seasonalityIntradayFrontierCost,type SeasonalityIntradayFrontier,type SeasonalityFrontierPage} from './seasonality-intraday-frontier';
import {inspectSeasonalityFrontierResponse,SEASONALITY_FRONTIER_RESPONSE_COST} from './seasonality-frontier-response';
import type {SyntheticMarketClock,SyntheticMarketClockSample} from './synthetic-market-clock';
import type { AdjustmentBasis, Bar, BarDataset, Instrument, ProviderCapabilities } from './types';
import { LiveBarSeries } from './live-bars';
import { liveQuotes, normalizeLiveQuote } from './live-quotes';
import { newYorkClock, usSessionPhase, usMarketSession, usSessionDay, newYorkWallTime, NYSE_CALENDAR_YEARS } from './us-market-hours';
export { usMarketSession, type UsMarketSession } from './us-market-hours';
import { foldBars, planAlpacaInterval, type LiveIntervalPlan } from './live-intervals';
import { LiveDailyForming, newYorkDayStart, type DailyTickSession } from './live-daily';
import { buildLiveDataset, dataStateOf, liveSessionId, notify, renewLiveRevision, type LiveBridgeResult, type LiveEntry, type LiveFeedStatus, type LiveHandle } from './live-provider';
import { LIVE_HISTORY_PAGE_BARS, LiveHistoryPager, registerLiveHistory, unregisterLiveHistory, type LiveHistoryPage } from './live-history';
import { BAR_CACHE_MAX_BARS, BAR_CACHE_OVERLAP_BARS, BAR_CACHE_WRITE_DELAY_MS, LIVE_CACHED_NOTE, cacheOverlapMatches, cacheOverlapStart, closedBarsForCache, hasBarCache, isCachedLiveDataset, mergeCachedHistory, validCachedBars, type BarCacheBridge, type BarCacheKey } from './live-cache';

/**
 * Alpaca Market Data with the owner's own free Basic plan key (entered by the owner, stored encrypted in
 * the desktop process; never visible here). Real-time is IEX only: one venue, so volume is thin compared with
 * the consolidated tape. SIP (all exchanges) is history only and ends at least 15 minutes ago on this plan.
 */
/** `let` so that a run on the keyless test stub relabels every Alpaca live dataset (see selectAlpacaSyntheticStub). */
export let ALPACA_IEX_PROVIDER_ID = 'alpaca-iex';
export const ALPACA_SIP_PROVIDER_ID = 'alpaca-sip-delayed';
export let ALPACA_PROVIDER_NAME = 'Alpaca Market Data (owner key, Basic plan)';
export const ALPACA_STUB_PROVIDER_ID = 'alpaca-stub', ALPACA_STUB_PROVIDER_NAME = 'SYNTHETIC Alpaca stub (invented prices)';
/** Main reports the keyless synthetic stub (key status synthetic:true). From then on this app session's Alpaca
 * live datasets use the live:alpaca-stub:* namespace and the SYNTHETIC provider name, so headings, watchlist rows, alerts and
 * paper fills say SYNTHETIC. fixture stays false: paper fills keep the live rules. `false` restores the real identity (tests). */
/** In a keyless stub run every US stock order fills on invented prices, so its labels say SYNTHETIC. */
export function isAlpacaStubInstrument(instrument: { exchange: string }): boolean { return isAlpacaSyntheticStub() && instrument.exchange === 'US'; }
let marketClock:SyntheticMarketClock|null=null;
export function selectAlpacaSyntheticStub(on = true,clock:SyntheticMarketClock|null=null): void { ALPACA_IEX_PROVIDER_ID = on ? ALPACA_STUB_PROVIDER_ID : 'alpaca-iex'; ALPACA_PROVIDER_NAME = on ? ALPACA_STUB_PROVIDER_NAME : 'Alpaca Market Data (owner key, Basic plan)';marketClock=on?clock:null; }
/** Only the startup-admitted synthetic transport may replace Alpaca's market clock. */
export function alpacaMarketNow():number{return marketClock?.now()??Date.now();}
export const isAlpacaSyntheticStub = (): boolean => ALPACA_IEX_PROVIDER_ID === ALPACA_STUB_PROVIDER_ID;
export const ALPACA_SIP_DELAY_SECONDS = 900;
export const ALPACA_MAX_SYMBOLS = 30;
export const ALPACA_CAP_MESSAGE = 'The Alpaca Basic plan streams at most 30 symbols at once.';
/** `yielding` opens a watchlist quote feed. It never takes a slot a chart, alert or paper feed needs: opening one
 * of those over the cap first closes the most recently opened symbol held only by yielding handles, and `onEvicted` tells
 * that handle's owner. A yielding open over the cap is refused with ALPACA_CAP_MESSAGE. */
export interface AlpacaOpenOptions { yielding?: boolean; onEvicted?: () => void }
export type AlpacaTimeframe = '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';
export const ALPACA_RESOLUTIONS: Readonly<Record<string, { timeframe: AlpacaTimeframe; seconds: number; window: number }>> = Object.freeze({
  // Windows reach past a four-day holiday weekend so a chart opened before the open shows the last session.
  // 1m: at most about 5 sessions x 960 extended-hours minutes, under one 10,000-bar page.
  // '60m' (1Hour) stays a published resolution for capabilities, but live 1h charts fold 15Min bars
  // because Alpaca hour bars start on the clock hour, not at the 09:30 open (live-intervals.ts ALPACA_SHAPE).
  '1m': { timeframe: '1Min', seconds: 60, window: 7 * 86400 }, '5m': { timeframe: '5Min', seconds: 300, window: 14 * 86400 },
  '15m': { timeframe: '15Min', seconds: 900, window: 30 * 86400 }, '60m': { timeframe: '1Hour', seconds: 3600, window: 60 * 86400 },
  '1D': { timeframe: '1Day', seconds: 86400, window: 450 * 86400 },
});
const NATIVE_BY_SECONDS: Readonly<Record<number, { timeframe: AlpacaTimeframe; window: number }>> = Object.freeze(Object.fromEntries(Object.values(ALPACA_RESOLUTIONS).map(row => [row.seconds, { timeframe: row.timeframe, window: row.window }])));
/** Canonical interval id when a live Alpaca chart can show it (natively or by aggregation from minute/daily bars), else null. */
export function alpacaResolution(value: string): string | null { const plan = planAlpacaInterval(value); return plan.ok ? plan.plan.id : null; }
/** US equity symbols as Alpaca writes them: a 1-5 letter root plus up to two dotted suffixes of 1-3 letters, covering
 * share classes (BRK.B), warrants (GME.WS, XYZ.WS.A), units (ABC.U) and preferreds (ABC.PRA). At most 13 characters;
 * electron/public-alpaca.cjs SYMBOL is the same expression. */
export const ALPACA_SYMBOL = /^[A-Z]{1,5}(?:\.[A-Z]{1,3}){0,2}$/;
export const ALPACA_SYMBOL_MAX_LENGTH = 13;
export const ALPACA_LICENSE = 'Alpaca Market Data (owner account): personal display only; not redistributable. Do not export or share.';
export const ALPACA_IEX_COVERAGE = 'IEX exchange only: thin volume and missing prints compared with the consolidated tape';
export const ALPACA_SETTING = Object.freeze({ id: 'liveStocksAlpaca', label: 'Live US stocks (Alpaca, your own key)', defaultValue: false,
  disclosure: 'Uses your own Alpaca key. The key is encrypted by Windows in your OpenCandle profile and is never shown again, exported or logged. Alpaca sees your IP address and the symbols charted.' });
const NOTES_IEX = [
  'Real-time prices from the IEX exchange only. Volume is a fraction of consolidated volume and some prints are missing.',
  'Bars include IEX pre-market and after-hours trades as published; the session basis is not filtered.',
  'The forming bar is built from IEX trades and replaced by the published minute bar when the minute closes.',
  'Tick size and lot size are OpenCandle display assumptions.',
];
const NOTES_SIP = ['Consolidated SIP history (all exchanges), ending at least 15 minutes ago on the Basic plan. Not live.', 'Tick size and lot size are OpenCandle display assumptions.'];

export function alpacaInstrument(symbol: string): Instrument {
  return { id: `US:${symbol}`, symbol, name: `${symbol} (Alpaca, US equity)`, exchange: 'US', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'America/New_York' };
}
export const alpacaDatasetId = (symbol: string, resolution: string, feed: 'iex' | 'sip' = 'iex') => feed === 'iex' ? `live:${ALPACA_IEX_PROVIDER_ID}:${symbol}:${resolution}` : `${ALPACA_SIP_PROVIDER_ID}:${symbol}:${resolution}`;
export const ALPACA_CAPABILITIES: ProviderCapabilities = {
  id: ALPACA_IEX_PROVIDER_ID, assets: ['stock', 'etf'], universe: 'US equities traded on IEX (you choose up to 30 symbols)', fields: ['ohlcv', 'trades'],
  resolutions: Object.keys(ALPACA_RESOLUTIONS), streaming: true, delaySeconds: 0, sessions: ['unknown'], adjustmentBases: ['split-adjusted', 'total-return'],
  earliestHistory: Object.fromEntries(Object.keys(ALPACA_RESOLUTIONS).map(id => [id, null])), requiresKey: true, redistributable: false,
  limits: ['30 WebSocket symbols', '200 historical requests per minute', 'SIP history excludes the latest 15 minutes', 'one stream connection per account'],
  verifiedLive: false,
};

/**
 * The corporate-action adjustment Alpaca applies to historical bars (its documented
 * `adjustment` query parameter: raw, split, dividend, spin-off, all, or a comma-separated combination). Stock prices are
 * shown split-adjusted by default, and the "Adjust data for dividends" setting is off by default (the ADJ tooltip reads
 * "Main symbol data is adjusted for splits only"). So history is requested with `split`, and with
 * `split,dividend` when the owner turns that setting on. Spin-offs are not adjusted (no fact covers them), and
 * the setting applies to every Alpaca feed of the app session (OpenCandle keeps chart settings per workspace).
 * Stream bars and trades are as traded, which is the adjusted basis for today: adjustment only rescales bars before a
 * corporate action's effective date. A feed whose history was fetched on an older basis is reloaded, never stitched.
 */
export type AlpacaAdjustment = 'split' | 'split,dividend';
export const alpacaAdjustment = (dividends: boolean): AlpacaAdjustment => dividends ? 'split,dividend' : 'split';
export const alpacaAdjustmentBasis = (adjustment: AlpacaAdjustment): AdjustmentBasis => adjustment === 'split,dividend' ? 'total-return' : 'split-adjusted';
let preferredAdjustment: AlpacaAdjustment = 'split';
const openProviders = new Set<AlpacaLiveProvider>();
/** The adjustment new Alpaca requests use (the "Adjust data for dividends" setting). */
export const currentAlpacaAdjustment = (): AlpacaAdjustment => preferredAdjustment;
/** Applies "Adjust data for dividends" to every open Alpaca provider (their feeds reload on the new basis) and to later ones. */
export function preferAlpacaDividendAdjustment(on: boolean): void {
  preferredAdjustment = alpacaAdjustment(on === true);
  for (const provider of [...openProviders]) provider.setDividendAdjustment(on === true);
}
/**
 * Where Alpaca bars
 * come from. Free (the Basic plan, default): history from all exchanges (SIP), which the plan serves when a request ends
 * at least 15 minutes ago; the newest 15 minutes and the live stream from IEX. Each IEX bar is re-read from all exchanges
 * once it is 15 minutes old, so the seam moves forward and closed bars end up consolidated. Paid: SIP for everything,
 * including the stream. A paid plan is the owner's statement; Alpaca refuses the SIP stream on a free key.
 */
export type AlpacaDataPlan = 'free' | 'paid';
export const ALPACA_DATA_PLAN_SETTING = Object.freeze({ id: 'alpacaDataPlan', label: 'Data plan', defaultValue: 'free' as AlpacaDataPlan,
  options: Object.freeze([
    { value: 'free' as AlpacaDataPlan, label: 'Free (live prices from IEX)', note: 'History: all exchanges (15 min delayed). Live: IEX.' },
    { value: 'paid' as AlpacaDataPlan, label: 'Paid (live prices from all exchanges)', note: 'History and live: all exchanges. Needs a paid Alpaca market data plan; a free key stops the live stream with a plan error.' },
  ]) });
/** The Data sources heading names the sources of the chosen plan (free: all-exchange history and IEX live). */
export const alpacaSettingLabel = (plan: AlpacaDataPlan): string => plan === 'paid' ? 'Live US stocks (Alpaca Paid plan: all exchanges, your own key)' : 'Live US stocks (Alpaca Free plan: all-exchange history, IEX live prices, your own key)';
export const ALPACA_HYBRID_COVERAGE = 'History: all exchanges (15 min delayed). Live: IEX.';
export const ALPACA_SIP_LIVE_COVERAGE = 'History and live: all exchanges (SIP, paid plan).';
let preferredPlan: AlpacaDataPlan = 'free';
export const currentAlpacaDataPlan = (): AlpacaDataPlan => preferredPlan;
/** Applies the Data plan choice to every open Alpaca provider (feeds reload, the stream reconnects on the plan's feed). */
export function preferAlpacaDataPlan(plan: AlpacaDataPlan): void {
  preferredPlan = plan === 'paid' ? 'paid' : 'free';
  for (const provider of [...openProviders]) provider.setDataPlan(preferredPlan);
}
/**
 * Which trades move the forming daily bar of a daily, weekly or monthly Alpaca chart (live-daily.ts). App
 * passes Chart settings > Symbol > Extended trading hours (the bottom toolbar ETH button): 'extended' (on, the default) folds
 * 04:00-20:00 New York trades, 'regular' only 09:30-16:00. Like "Adjust data for dividends", it applies to every
 * Alpaca feed of the app session. The published daily bar is taken as Alpaca publishes it either way.
 */
let preferredDailySession: DailyTickSession = 'extended';
export const currentAlpacaDailySession = (): DailyTickSession => preferredDailySession;
/** Applies the session rule to every open Alpaca provider (forming daily bars refold at once; nothing reloads) and to later ones. */
export function preferAlpacaDailySession(session: DailyTickSession): void {
  preferredDailySession = session === 'regular' ? 'regular' : 'extended';
  for (const provider of [...openProviders]) provider.setDailySession(preferredDailySession);
}
/** Wall clock HH:MM in New York for a Unix second. */
function newYorkHhMm(time: number): string { const minutes = newYorkClock(time).minutes; return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'); }
const TIMEFRAME_SECONDS: Readonly<Record<AlpacaTimeframe, number>> = Object.freeze({ '1Min': 60, '5Min': 300, '15Min': 900, '1Hour': 3600, '1Day': 86400 });
const NOTE_ADJUSTMENT: Record<AlpacaAdjustment, string> = {
  split: 'History is adjusted for splits (Alpaca adjustment=split); live bars for today are as traded.',
  'split,dividend': 'History is adjusted for splits and dividends (Alpaca adjustment=split,dividend); live bars for today are as traded.',
};

/** One Alpaca listing from GET /v2/assets (main process, cached for the New York day). chartable: the symbol passes ALPACA_SYMBOL. */
export interface AlpacaAsset { symbol: string; name: string; exchange: string; tradable: boolean; status: string; chartable: boolean; warrant: boolean }
export interface AlpacaAssetSearchValue { schemaVersion: 1; query: string; assets: AlpacaAsset[]; total: number; listedAt: string }
/** Plain words for a listing that may not chart well on the free IEX feed; null for an ordinary active, tradable listing. */
export function alpacaAssetNotice(asset: AlpacaAsset): string | null {
  if (!asset.chartable) return `OpenCandle cannot chart the symbol format ${asset.symbol} yet.`;
  if (asset.status !== 'active') return `Alpaca says ${asset.symbol} is no longer active, so there may be no data for it.`;
  if (/^OTC/i.test(asset.exchange)) return `${asset.symbol} trades over the counter (OTC). The free IEX feed has no data for OTC symbols.`;
  if (!asset.tradable) return `Alpaca lists ${asset.symbol} but marks it not tradable, so IEX may have no trades for it. The chart says so if none arrive.`;
  return null;
}
const looseKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** The Alpaca listing for a requested symbol: the exact symbol, else the same spelling with dots for separators, else the
 * one listing spelled the same apart from separators (GME-WS, GME WS, GME/WS or GMEWS all find GME.WS). An ambiguous
 * loose spelling gives null rather than a guess. */
export function matchAlpacaAsset(requested: string, assets: readonly AlpacaAsset[]): AlpacaAsset | null {
  const upper = String(requested ?? '').trim().toUpperCase();
  const exact = assets.find(asset => asset.symbol === upper); if (exact) return exact;
  const dotted = upper.replace(/[\s/_-]+/g, '.'), byDot = assets.find(asset => asset.symbol === dotted); if (byDot) return byDot;
  const key = looseKey(upper); if (!key) return null;
  const loose = assets.filter(asset => looseKey(asset.symbol) === key);
  return loose.length === 1 ? loose[0] : null;
}
/** Shown on a live chart whose IEX backfill came back empty. */
export function alpacaNoIexDataMessage(symbol: string): string {
  return `IEX has no recent trades for ${symbol}. The free Alpaca plan carries IEX only, so this chart stays empty until IEX trades it.`;
}

export interface AlpacaKeyStatus { configured: boolean; keyIdHint: string | null; encryption: boolean; /** A saved key file exists but could not be unlocked on this computer (the file is kept). */ unreadable?: true; /** The keyless synthetic test stub (main process). */ synthetic?: true; /** Optional only in an explicit named keyless startup scenario. No new IPC method. */ syntheticClock?:SyntheticMarketClockSample }
export interface AlpacaBarsValue { schemaVersion: 1; symbol: string; timeframe: AlpacaTimeframe; seconds: number; feed: 'iex' | 'sip'; bars: Bar[]; nextPageToken: string | null; provenance: { provider: string; kind: 'owner-key'; feed: 'iex' | 'sip'; delaySeconds: number; sourceUrl: string; retrievedAt: string; bytes: number; license: string } }
export interface AlpacaStatus extends LiveFeedStatus { symbols: string[]; feed: 'iex' | 'sip'; /** How much bid and ask the stream still carries. Absent from older mains (read as 'all'). */ quoteLevel?: 'all' | 'shown' | 'none' }
export type AlpacaEvent =
  | { schemaVersion: 1; kind: 'status'; status: AlpacaStatus }
  | { schemaVersion: 1; kind: 'batch'; bars: Array<Bar & { symbol: string; kind: 'minute' | 'updated' | 'daily'; seconds: number }>; trades: Array<{ symbol: string; time: number; price: number; high: number; low: number; size: number }>;
      /** Newest best bid and ask per symbol since the last batch (absent when none). */
      quotes?: AlpacaQuoteRow[]; receivedAt: string };
/** One stream quote as main sends it (a side without a quote is null). */
export interface AlpacaQuoteRow { symbol: string; time: number; bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null; feed: 'iex' | 'sip' }
export interface AlpacaBridge {
  alpacaKeyStatus(): Promise<LiveBridgeResult<AlpacaKeyStatus>>;
  saveAlpacaKey(input: { keyId: string; secret: string }): Promise<LiveBridgeResult<AlpacaKeyStatus>>;
  clearAlpacaKey(): Promise<LiveBridgeResult<AlpacaKeyStatus>>;
  testAlpacaConnection(): Promise<LiveBridgeResult<{ connected: true; feed: 'iex'; checkedAt: string }>>;
  fetchAlpacaBars(input: { requestId: string; symbol: string; timeframe: AlpacaTimeframe; feed: 'iex' | 'sip'; start: number; end: number; pageToken?: string; /** Main defaults to 'raw' when absent. */ adjustment?: 'raw' | AlpacaAdjustment; /** Sent only for a paid plan (no SIP delay). */ plan?: AlpacaDataPlan }): Promise<LiveBridgeResult<AlpacaBarsValue>>;
  /** `feed` is sent only for a paid plan ('sip'); main defaults to 'iex'. `quotes` adds the quote channel. */
  /** `quotesFor` names the subscribed symbols whose bid and ask are on screen; main sheds the others' quotes first under quote overload. */
  subscribeAlpaca(input: { symbols: string[]; feed?: 'iex' | 'sip'; quotes?: boolean; quotesFor?: string[] }): Promise<LiveBridgeResult<AlpacaStatus>>;
  unsubscribeAlpaca(): Promise<LiveBridgeResult<AlpacaStatus | null>>;
  onAlpacaEvent(handler: (event: AlpacaEvent) => void): () => void;
  /** Listings matching a symbol or company name (main process, owner key). Optional: older bridges lack it. */
  searchAlpacaAssets?(input: { query: string }): Promise<LiveBridgeResult<AlpacaAssetSearchValue>>;
}

/** The US equity session of an Alpaca bar or trade by its start time in Unix seconds (New York wall clock,
 * weekends and the listed NYSE holidays closed). Alpaca IEX publishes pre-market and after-hours prints without a session
 * field, so virtual fills take the session from here: 'regular' 09:30-16:00, 'extended' 04:00-09:30 and 16:00-20:00. */
export function alpacaBarSession(time: number): 'regular' | 'extended' | 'closed' { return usMarketSession(time * 1000); }
/** Heading label for an Alpaca IEX chart: a connected feed outside US trading hours (weekend, holiday, overnight) says
 * "Market closed" (the chart shows the last session; not an error). Disconnected and error states win. */
export function alpacaStatusLabel(provenance: { state: string; delaySeconds: number | null; notes?: readonly string[] }, nowMs: number = alpacaMarketNow()): 'Live' | 'Disconnected' | 'Market closed' | 'Cached' {
  // Bars from the local cache are labelled until the refresh completes (live-provider.ts liveStatusLabel).
  if (isCachedLiveDataset(provenance)) return 'Cached';
  if (provenance.state === 'disconnected' || provenance.state === 'error') return 'Disconnected';
  return usMarketSession(nowMs) === 'closed' ? 'Market closed' : 'Live';
}
/** Symbol-search rows for owner-chosen symbols, only once a key is saved. */
export function alpacaSearchDatasets(keyConfigured: boolean, symbols: readonly string[], resolution = '5m'): BarDataset[] {
  const id = alpacaResolution(resolution) ?? '5m';
  if (!keyConfigured) return [];
  return [...new Set(symbols)].filter(symbol => ALPACA_SYMBOL.test(symbol)).slice(0, ALPACA_MAX_SYMBOLS).map(symbol => ({ instrument: alpacaInstrument(symbol), bars: [], resolution: id, provenance: {
    providerId: ALPACA_IEX_PROVIDER_ID, providerName: ALPACA_PROVIDER_NAME, datasetId: alpacaDatasetId(symbol, id), fixture: false, coverage: ALPACA_IEX_COVERAGE + '; not connected until opened',
    asOf: 0, delaySeconds: 0, adjustment: alpacaAdjustmentBasis(preferredAdjustment), session: 'unknown', timezone: 'America/New_York', state: 'disconnected', license: ALPACA_LICENSE, revision: 'live-v1:not-connected', notes: [...NOTES_IEX] } }));
}

const BACKFILL_BARS = 300, MAX_PAGES = 3, STREAM_PREFIX = 'Live stream: ';
/** The IEX tail is re-read from all exchanges at most this often (or once per fetched base bar, if longer). */
export const TAIL_REFRESH_SECONDS = 300;
/** Backfill retries after a BUSY (main request queue full) answer. */
export const BUSY_RETRIES = 5, BUSY_RETRY_MS = 1000;
/** Oldest bar start the main-process bridge accepts (electron/public-alpaca.cjs EARLIEST): the provider limit. */
export const ALPACA_EARLIEST_HISTORY = Date.UTC(2015, 0, 1) / 1000;
/** `reserve`: fetched bars older than the first loaded bar that are not shown yet (one REST window holds several pages). */
/** `basis` is the adjustment the loaded bars were fetched with; `epoch` changes on every reload so a
 * request started on an older basis is dropped; `basisDay` is the New York date the basis was last confirmed;
 * `reloadedOn` limits seam-triggered reloads to one per New York day. */
type Entry = LiveEntry & { timeframe: AlpacaTimeframe; window: number; plan: LiveIntervalPlan; reserve: Bar[]; reserveAtLimit: boolean; strongRefs: number; yielders: Set<{ order: number; evict: () => void }>;
  makeSeries: () => LiveBarSeries; basis: AlpacaAdjustment; epoch: number; basisDay: string; reloadedOn: string | null;
  /** The data plan the loaded bars follow; `hybrid` when history is all-exchange and the tail IEX;
   * `sipLast` the newest base bar time taken from all exchanges; `sipCut` the instant that history reached; `sipNote` why
   * all-exchange history is missing (then the feed is IEX only); `refreshing` while the tail is being re-read. */
  dataPlan: AlpacaDataPlan; hybrid: boolean; sipLast: number | null; sipCut: number | null; sipNote: string | null; refreshing: boolean;
  /** The cache namespace fixed at open (`alpaca-stub` in a SYNTHETIC stub run); `fromCache` while cached bars are
   * shown and the refresh has not completed; `restThrough` the bucket end up to which the bars came from cacheable history
   * (all exchanges), null when nothing may be cached (an IEX-only feed); a pending batched write. */
  cacheProvider: string; fromCache: boolean; restThrough: number | null; cacheDirty: boolean; cacheTimer: ReturnType<typeof setTimeout> | null;
  /** The history load failed (for example Alpaca rejected the key); loaded again when the stream next authenticates. */
  historyFailed: boolean;
  /** The forming New York day of a daily-based plan (dayTicks), set at each backfill; null otherwise. */
  daily: LiveDailyForming | null };
/** `lastDay` is the newest fetched daily bar before any folding (1Day backfills only): today's published bar when there is one. */
type HistoryLoad = { bars: Bar[]; hybrid: boolean; sipLast: number | null; sipCut: number | null; sipNote: string | null; lastDay?: Bar | null };
/** Private request facts are observations of published rows, not exchange finality. */
interface MtfRestWindow {entry:WeakRef<Entry>|null;epoch:number;start:number;end:number;feed:'iex'|'sip';basis:AlpacaAdjustment;plan:AlpacaDataPlan;symbol:string;timeframe:AlpacaTimeframe}
interface MtfCoverage {epoch:number;basis:AlpacaAdjustment;plan:AlpacaDataPlan;from:number;through:number;feed:'iex'|'sip';blocked?:true;sipThrough?:number;readonly cachedPrefixUnobserved?:true}
const MTF_HEADER=['id','symbol','exchange','assetClass','timezone'] as const,MTF_PROVENANCE=['providerId','datasetId','revision','session','timezone','adjustment'] as const;
interface MtfSnapshot {provider:WeakRef<AlpacaLiveProvider>;instrument:object;provenance:object;header:readonly unknown[];facts:readonly unknown[];resolution:string;dataset:WeakRef<BarDataset>;rows:WeakRef<Bar[]>;entry:WeakRef<Entry>;coverage:MtfCoverage;revision:number;count:number;current:()=>boolean;demand:()=>void}
const mtfRestWindows=new WeakMap<Bar[],MtfRestWindow>(),mtfLoads=new WeakMap<HistoryLoad,{windows:readonly MtfRestWindow[];seam:number|null}>(),mtfCoverage=new WeakMap<Entry,MtfCoverage>(),mtfSnapshots=new WeakMap<BarDataset,MtfSnapshot>();
/** An exact private producer/window planning key. It carries no rows, user
 * resolver, mutable clock, budget amount, native membership or attach method. */
export interface AlpacaSeasonalityDailyPlan {
 readonly facts:Readonly<SeasonalityDailyHistoryPlan>;
 readonly sourceRows:number;
 assertCurrent():void;
}
interface SeasonalityDailyPlanning {
 snapshot:WeakRef<MtfSnapshot>;dataset:WeakRef<BarDataset>;rows:WeakRef<readonly Bar[]>;
 plan:Readonly<SeasonalityDailyHistoryPlan>;informationTime:number;live:boolean;
}
interface DailyMonthOwner {
 entry:WeakRef<Entry>;series:WeakRef<LiveBarSeries>;epoch:number;basis:AlpacaAdjustment;plan:AlpacaDataPlan;hybrid:boolean;feed:'iex'|'sip';
 startYear:number;endYear:number;coveredFrom:number;coveredThrough:number;closedThrough:number;
 cache:Readonly<SeasonalityLiveMonthCache>|null;live:boolean;working:boolean;work:number;slots:number;
 off:(()=>void)|null;key:object;clients:number;active:number;scope:WeakRef<DailyScope>;
 leases:Set<DailyWindowRecord>;
}
interface DailyScope {entry:WeakRef<Entry>;series:WeakRef<LiveBarSeries>;epoch:number;basis:AlpacaAdjustment;plan:AlpacaDataPlan;hybrid:boolean;controller:AbortController;signal:AbortSignal;live:boolean;demands:Set<DailyDemandRecord>;developing:Readonly<SeasonalitySourcePoint>|null;observedAt:number;observationKind:'daily'|'minute'|'trade'|null;observationVersion:number;wakePending:boolean;periodKey:string;frontiers:Map<string,DailyFrontierOwner>}
export interface AlpacaSeasonalityFrontierRequest {readonly firstLoadedTime:number;readonly session:'regular'|'extended'}
export interface AlpacaSeasonalityGeometryFacts {readonly firstObservedTime:number;readonly firstLoadedTime:number;readonly prefixBars:number;readonly session:'regular'|'extended'}
export interface AlpacaSeasonalityPreparationCost {readonly sourceRows:number;readonly monthFrames:number;readonly providerOperations:number;readonly providerNumericSlots:number;readonly additionalPeakOperations:number;readonly additionalPeakNumericSlots:number;readonly dailyCached:boolean;readonly frontierCached:boolean}
export interface AlpacaSeasonalityPreparationGroup {readonly opaqueDailyPreparation:unique symbol}
export interface AlpacaSeasonalityFrozenHistoryOrigin {readonly opaqueFrozenDailyOrigin:unique symbol}
export interface AlpacaSeasonalityFrozenHistoryHold {readonly opaqueFrozenDailyBorrow:unique symbol}
export interface AlpacaSeasonalityFrozenMonthLease {readonly opaqueFrozenMonths:unique symbol}
export interface AlpacaSeasonalityFrozenFrameHold {readonly opaqueFrozenFrame:unique symbol}
export const ALPACA_SEASONALITY_FROZEN_HOLD_COST=Object.freeze({operations:1024,numericSlots:128});
/** Existing shared New York offset/calendar cache has module lifetime. This
 * fixed baseline is ALWAYS deducted from each closed provider operation's
 *2M headroom; per-owner balances below do not own or physically retire it.
 * This is a closed-operation bound, not a process/OS-wide memory assertion. */
export const ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE=100002;
export interface AlpacaSeasonalityFrozenHistoryFacts {readonly informationTime:number;readonly observedThrough:number;readonly sourceRows:number;readonly resolution:string;readonly symbol:string;readonly feed:'iex'|'sip';readonly adjustment:AlpacaAdjustment}
interface DailyFrozenMonthDocument {readonly startYear:number;readonly endYear:number;readonly coveredFrom:number;readonly coveredThrough:number;readonly closedThrough:number;readonly cache:Readonly<SeasonalityLiveMonthCache>}
interface DailyFrozenOriginRecord {months:readonly Readonly<DailyFrozenMonthDocument>[]|null;provider:WeakRef<AlpacaLiveProvider>;snapshot:WeakRef<MtfSnapshot>|null;dataset:WeakRef<BarDataset>|null;rows:WeakRef<readonly Bar[]>|null;facts:Readonly<AlpacaSeasonalityFrozenHistoryFacts>|null;live:boolean;revoked:boolean;preparing:boolean;sealed:boolean;active:boolean;borrowers:number;calendarReserved:boolean;unwindPending:boolean;work:number;slots:number}
interface DailyFrozenFrameHoldRecord {provider:WeakRef<AlpacaLiveProvider>;parent:WeakRef<DailyFrozenOriginRecord>;finer:WeakRef<DailyFrozenOriginRecord>|null;construction:boolean;finishRequested:boolean;releaseRequested:boolean;queued:boolean;released:boolean;work:number;slots:number}
interface DailyFrozenMonthLeaseRecord {provider:WeakRef<AlpacaLiveProvider>;origin:WeakRef<DailyFrozenOriginRecord>;cache:Readonly<SeasonalityLiveMonthCache>|null;live:boolean;consumed:boolean;released:boolean;work:number;slots:number}
interface DailyFrozenBorrow {provider:WeakRef<AlpacaLiveProvider>;origin:WeakRef<DailyFrozenOriginRecord>;live:boolean;released:boolean;work:number;slots:number}
interface DailyPreparationGroupRecord {provider:WeakRef<AlpacaLiveProvider>;key:AlpacaSeasonalityPreparationGroup;demand:WeakRef<DailyDemandRecord>;plan:AlpacaSeasonalityDailyPlan|null;frameSignal:WeakRef<AbortSignal>;target:Readonly<AlpacaSeasonalityFrontierRequest>|undefined;controller:AbortController|null;signal:AbortSignal|null;started:boolean;settled:boolean;cancelled:boolean;releaseRequested:boolean;released:boolean;off:(()=>void)|null;subscribers:Set<DailySettlementSubscriber>;notifyPending:boolean;activeNotifications:number;preparationWork:number;window:WeakRef<AlpacaSeasonalityDailyWindow>|null}
interface DailySettlementSubscriber {provider:WeakRef<AlpacaLiveProvider>;group:WeakRef<DailyPreparationGroupRecord>;wake:WeakRef<()=>void>|null;live:boolean;active:number;released:boolean}
interface DailyPendingTicket {done:Promise<DailyMonthOwner>;scope:DailyScope;settled:boolean}
interface DailyFrontierFacts {symbol:string;resolution:string;timeframe:'1Min'|'5Min'|'15Min';feed:'iex'|'sip';adjustment:AlpacaAdjustment;plan:AlpacaDataPlan;count:number;requestFrom:number;requestThrough:number;session:'regular'|'extended'}
interface DailyFrontierOwner {scope:WeakRef<DailyScope>;key:string;firstLoadedTime:number;session:'regular'|'extended';result:Extract<SeasonalityIntradayFrontier,{status:'ready'}>|null;live:boolean;working:boolean;clients:number;work:number;slots:number;pending:Promise<void>|null}
interface DailyHistoryBuild {provider:WeakRef<AlpacaLiveProvider>;owner:DailyMonthOwner;signal:AbortSignal;request:Readonly<SeasonalityDailyHistoryPlan>;settings:SeasonalitySettings;rowBound:number;symbol:string;feed:'iex'|'sip';key:string;description:string;pageActive:boolean}
interface DailyPreparationRun {provider:WeakRef<AlpacaLiveProvider>;demand:WeakRef<DailyDemandRecord>;scope:WeakRef<DailyScope>;history:Promise<DailyMonthOwner>;key:AlpacaSeasonalityDailyPlan;signal:AbortSignal;target:Readonly<AlpacaSeasonalityFrontierRequest>|undefined;frameSignal:WeakRef<AbortSignal>|undefined}
interface DailyFrontierLoad {provider:WeakRef<AlpacaLiveProvider>;owner:DailyFrontierOwner;facts:DailyFrontierFacts}
export interface AlpacaSeasonalityDailyDemand {readonly opaqueDailyDemand:unique symbol}
export interface AlpacaSeasonalityDailyWindow {readonly opaqueDailyWindow:unique symbol}
export type AlpacaSeasonalityChoices=Omit<SeasonalitySettings,'externalNumericSlots'>;
interface DailyDemandRecord {provider:WeakRef<AlpacaLiveProvider>;scope:DailyScope|null;key:AlpacaSeasonalityDailyDemand;startYear:number;endYear:number;live:boolean;off:(()=>void)|null;leases:Set<DailyWindowRecord>;wake:WeakRef<()=>void>|null;wakeToken:object|null}
interface DailyWindowRecord {alignment?:object|null;provider:WeakRef<AlpacaLiveProvider>;demand:DailyDemandRecord|null;owner:DailyMonthOwner|null;planning:WeakRef<AlpacaSeasonalityDailyPlan>;key:AlpacaSeasonalityDailyWindow;live:boolean;retired:boolean;active:number;consumed:boolean;unwindPending:boolean;computeWork:number;completedComputeWork:number;frontier:DailyFrontierOwner|null;geometry:Readonly<AlpacaSeasonalityGeometryFacts>|null;observationVersion:number;off:(()=>void)|null;result:Readonly<SeasonalityResult>|null;work:number;slots:number}
interface DailyServiceOperations {
 acquire(plan:SeasonalityDailyPlanning,signal:AbortSignal):AlpacaSeasonalityDailyDemand;
 prepare(demand:DailyDemandRecord,plan:SeasonalityDailyPlanning,key:AlpacaSeasonalityDailyPlan,signal:AbortSignal,frontier?:Readonly<AlpacaSeasonalityFrontierRequest>):Promise<AlpacaSeasonalityDailyWindow>;
 consume(window:DailyWindowRecord,grid:Readonly<SeasonalityLiveGrid>,choices:AlpacaSeasonalityChoices):Readonly<SeasonalityResult>;
 consumeOwned(window:DailyWindowRecord,grid:Readonly<SeasonalityLiveGrid>,choices:AlpacaSeasonalityChoices):Readonly<SeasonalityResult>;
 releaseDemand(demand:DailyDemandRecord):void;
 releaseWindow(window:DailyWindowRecord):void;
 currentWindow(window:DailyWindowRecord):void;
 subscribe(demand:DailyDemandRecord,wake:()=>void):()=>void;
 matches(demand:DailyDemandRecord,planning:SeasonalityDailyPlanning):boolean;
 retireHistory(owner:DailyMonthOwner):void;
 notify(scope:DailyScope):void;
 settle(map:Map<string,DailyPendingTicket>,key:string,ticket:DailyPendingTicket):void;
 clock(token:object):void;
 group(demand:DailyDemandRecord,plan:AlpacaSeasonalityDailyPlan,signal:AbortSignal,target?:Readonly<AlpacaSeasonalityFrontierRequest>):AlpacaSeasonalityPreparationGroup;
 beginGroup(group:DailyPreparationGroupRecord):Promise<AlpacaSeasonalityDailyWindow>;
 finishGroupRun(group:DailyPreparationGroupRecord):void;
 cancelGroup(group:DailyPreparationGroupRecord):void;
 subscribeGroup(group:DailyPreparationGroupRecord,wake:()=>void):()=>void;
 releaseSubscriber(subscriber:DailySettlementSubscriber):void;
 notifyGroup(group:DailyPreparationGroupRecord):void;
 preview(demand:DailyDemandRecord,planning:SeasonalityDailyPlanning,target?:Readonly<AlpacaSeasonalityFrontierRequest>):Readonly<AlpacaSeasonalityPreparationCost>;
 previewPlan(planning:SeasonalityDailyPlanning,target?:Readonly<AlpacaSeasonalityFrontierRequest>):Readonly<AlpacaSeasonalityPreparationCost>;
 captureFrozenOrigin(snapshot:MtfSnapshot):AlpacaSeasonalityFrozenHistoryOrigin|null;
 sealFrozenOrigin(record:DailyFrozenOriginRecord):boolean;
 releaseFrozenOrigin(record:DailyFrozenOriginRecord):void;
 finishFrozenOrigin(record:DailyFrozenOriginRecord):void;
 borrowFrozenOrigin(record:DailyFrozenOriginRecord,selection:boolean):AlpacaSeasonalityFrozenHistoryHold|null;
 finishFrozenBorrow(record:DailyFrozenBorrow):void;
 frozenMonths(record:DailyFrozenOriginRecord,startYear:number,endYear:number):AlpacaSeasonalityFrozenMonthLease|null;
 finishFrozenMonths(record:DailyFrozenMonthLeaseRecord):void;
 frozenFrame(parent:DailyFrozenOriginRecord,finer:DailyFrozenOriginRecord|null):AlpacaSeasonalityFrozenFrameHold|null;
 finishFrozenFrame(record:DailyFrozenFrameHoldRecord):void;
 checkHistory(build:DailyHistoryBuild):void;
 reserveHistoryPage(build:DailyHistoryBuild):void;
 requestHistoryPage(build:DailyHistoryBuild,sent:Readonly<SeasonalityDailySentRequest>):Promise<LiveBridgeResult<AlpacaBarsValue>>;
 releaseHistoryPage(build:DailyHistoryBuild):void;
 commitHistory(build:DailyHistoryBuild,compiled:Readonly<SeasonalityLiveMonthCache>,echo:Readonly<SeasonalityDailyEcho>):void;
 finishHistory(build:DailyHistoryBuild,failed:boolean):void;
 preparationFrontier(run:DailyPreparationRun,owner:DailyMonthOwner):DailyFrontierOwner|null;
 captureWindow(run:DailyPreparationRun,owner:DailyMonthOwner,frontier:DailyFrontierOwner|null):AlpacaSeasonalityDailyWindow;
 checkFrontier(load:DailyFrontierLoad):void;
 reserveFrontierPage(load:DailyFrontierLoad):void;
 requestFrontierPage(load:DailyFrontierLoad,sent:Readonly<{symbol:string;timeframe:'1Min'|'5Min'|'15Min';feed:'iex'|'sip';adjustment:AlpacaAdjustment;start:number;end:number;pageToken?:string}>):Promise<LiveBridgeResult<AlpacaBarsValue>>;
 reserveFrontierInspection(load:DailyFrontierLoad):void;
 finishFrontier(load:DailyFrontierLoad,failed:boolean):void;
 unwindWindow(window:DailyWindowRecord):void;
 usage():Readonly<{operations:number;numericSlots:number;pendingOwners:number}>;
}
const dailyDemands=new WeakMap<object,DailyDemandRecord>(),dailyWindows=new WeakMap<object,DailyWindowRecord>(),dailyOperations=new WeakMap<object,DailyServiceOperations>();
const dailyConsumedResults=new WeakMap<object,{window:WeakRef<AlpacaSeasonalityDailyWindow>;grid:WeakRef<object>}>();
const dailyPreparationGroups=new WeakMap<object,DailyPreparationGroupRecord>();
const dailyFrozenOrigins=new WeakMap<object,DailyFrozenOriginRecord>();
const dailyFrozenMonthLeases=new WeakMap<object,DailyFrozenMonthLeaseRecord>();
const dailyFrozenFrameHolds=new WeakMap<object,DailyFrozenFrameHoldRecord>();
const dailyFrozenBorrows=new WeakMap<object,DailyFrozenBorrow>();
const dailyGeometryFacts=new WeakMap<object,WeakRef<AlpacaSeasonalityDailyWindow>>();
const dailySetTimer=setTimeout,dailyClearTimer=clearTimeout;
const DailyNativeAbort=AbortController,dailyControllerSignal=Object.getOwnPropertyDescriptor(AbortController.prototype,'signal')!.get!,dailyControllerAbort=AbortController.prototype.abort;
const dailyAbortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,dailyAbortAdd=EventTarget.prototype.addEventListener,dailyAbortRemove=EventTarget.prototype.removeEventListener;
function dailyAborted(signal:AbortSignal):boolean{return Reflect.apply(dailyAbortGetter,signal,[]) as boolean;}
// Retained callbacks are created in separate functions whose ONLY arguments
// are weak private ownership keys, native signals, or fixed ticket metadata.
// They cannot capture an acquisition/build activation's Entry/M/D locals.
function dailyPlanHandle(record:SeasonalityDailyPlanning,sourceRows:number):AlpacaSeasonalityDailyPlan{
 const key:AlpacaSeasonalityDailyPlan=Object.freeze({facts:record.plan,sourceRows,assertCurrent(){dailyPlanning(key);}});seasonalityDailyPlans.set(key,record);dailyPlanning(key);return key;
}
function dailyIgnoreRejection():void{}
function dailyWeakClock(provider:WeakRef<AlpacaLiveProvider>,token:object):()=>void{return()=>{const actual=provider.deref();if(actual)dailyOperations.get(actual)?.clock(token);};}
function dailyWeakAbort(provider:WeakRef<AlpacaLiveProvider>,key:WeakRef<object>,kind:'demand'|'window'):()=>void{return()=>{
 const actual=provider.deref(),token=key.deref(),operation=actual&&dailyOperations.get(actual);if(!token||!operation)return;
 if(kind==='demand'){const record=dailyDemands.get(token);if(record?.live)operation.releaseDemand(record);}else{const record=dailyWindows.get(token);if(record?.live)operation.releaseWindow(record);}
};}
function dailyWeakHistoryAbort(provider:WeakRef<AlpacaLiveProvider>,owner:WeakRef<DailyMonthOwner>):()=>void{return()=>{const actual=provider.deref(),record=owner.deref();if(actual&&record)dailyOperations.get(actual)?.retireHistory(record);};}
function dailyWeakAbortOff(signal:WeakRef<AbortSignal>,callback:()=>void):()=>void{return()=>{const actual=signal.deref();if(actual)Reflect.apply(dailyAbortRemove,actual,['abort',callback]);};}
function dailyWeakNoticeOff(record:WeakRef<DailyDemandRecord>,token:object):()=>void{return()=>{const actual=record.deref();if(actual?.wakeToken===token){actual.wake=null;actual.wakeToken=null;}};}
function dailyWeakWake(provider:WeakRef<AlpacaLiveProvider>,scope:WeakRef<DailyScope>):()=>void{return()=>{const actual=provider.deref(),source=scope.deref();if(!actual||!source?.live)return;source.wakePending=false;dailyOperations.get(actual)?.notify(source);};}
function dailyWeakGroupAbort(provider:WeakRef<AlpacaLiveProvider>,group:WeakRef<DailyPreparationGroupRecord>):()=>void{return()=>{const actual=provider.deref(),record=group.deref();if(actual&&record)dailyOperations.get(actual)?.cancelGroup(record);};}
function dailyWeakGroupNotice(provider:WeakRef<AlpacaLiveProvider>,group:WeakRef<DailyPreparationGroupRecord>):()=>void{return()=>{const actual=provider.deref(),record=group.deref();if(actual&&record){record.notifyPending=false;dailyOperations.get(actual)?.notifyGroup(record);}};}
function dailyWeakSettlementOff(provider:WeakRef<AlpacaLiveProvider>,subscriber:WeakRef<DailySettlementSubscriber>):()=>void{return()=>{const actual=provider.deref(),record=subscriber.deref();if(actual&&record)dailyOperations.get(actual)?.releaseSubscriber(record);};}
function dailyFrozenFrameUnwind(provider:WeakRef<AlpacaLiveProvider>,hold:WeakRef<DailyFrozenFrameHoldRecord>):()=>void{return()=>{const actual=provider.deref(),record=hold.deref();if(actual&&record)dailyOperations.get(actual)?.finishFrozenFrame(record);};}
function dailyFrozenMonthUnwind(provider:WeakRef<AlpacaLiveProvider>,lease:WeakRef<DailyFrozenMonthLeaseRecord>):()=>void{return()=>{const actual=provider.deref(),record=lease.deref();if(actual&&record)dailyOperations.get(actual)?.finishFrozenMonths(record);};}
function dailyFrozenUnwind(provider:WeakRef<AlpacaLiveProvider>,origin:WeakRef<DailyFrozenOriginRecord>):()=>void{return()=>{const actual=provider.deref(),record=origin.deref();if(actual&&record)dailyOperations.get(actual)?.finishFrozenOrigin(record);};}
function dailyFrozenBorrowUnwind(provider:WeakRef<AlpacaLiveProvider>,borrow:WeakRef<DailyFrozenBorrow>):()=>void{return()=>{const actual=provider.deref(),record=borrow.deref();if(actual&&record)dailyOperations.get(actual)?.finishFrozenBorrow(record);};}
function dailyWindowUnwind(provider:WeakRef<AlpacaLiveProvider>,window:WeakRef<DailyWindowRecord>):()=>void{return()=>{const actual=provider.deref(),record=window.deref();if(actual&&record)dailyOperations.get(actual)?.unwindWindow(record);};}
function dailyBeginGroup(group:DailyPreparationGroupRecord):Promise<AlpacaSeasonalityDailyWindow>{
 const provider=group.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!operation)throw Error('The physical preparation provider retired.');return operation.beginGroup(group);
}
function dailyFinishGroupRun(group:DailyPreparationGroupRecord):void{
 const provider=group.provider.deref(),operation=provider&&dailyOperations.get(provider);group.settled=true;if(operation)operation.finishGroupRun(group);
}
async function dailyRunGroup(group:DailyPreparationGroupRecord):Promise<AlpacaSeasonalityDailyWindow>{
 if(group.started||group.released||group.cancelled||group.settled)throw Error('The actual preparation is retired or already started.');group.started=true;
 // This activation owns only the fixed record. Provider acquisition and
 // finalization occur in separate synchronous activations across the await.
 let failed=false,failure:unknown;
 try{const window=await dailyBeginGroup(group);group.window=new WeakRef(window);return window;}catch(error){failed=true;failure=error;throw error;}
 finally{try{dailyFinishGroupRun(group);}catch(cleanup){if(failed)throw new AggregateError([failure,cleanup],'Preparation and settlement cleanup failed.');throw cleanup;}}
}
// These synchronous gateways never return the provider/bridge/Entry. Await
// activations below hold only the already funded owner, weak provider and
// close-only compiler/response data; no implicit class `this` survives an IPC.
function dailyHistoryOperations(build:DailyHistoryBuild):DailyServiceOperations{
 const provider=build.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!operation)throw Error('The actual daily provider retired.');return operation;
}
function dailyCheckHistory(build:DailyHistoryBuild):void{dailyHistoryOperations(build).checkHistory(build);}
function dailyReserveHistoryPage(build:DailyHistoryBuild):void{dailyHistoryOperations(build).reserveHistoryPage(build);}
function dailyRequestHistoryPage(build:DailyHistoryBuild,sent:Readonly<SeasonalityDailySentRequest>):Promise<LiveBridgeResult<AlpacaBarsValue>>{return dailyHistoryOperations(build).requestHistoryPage(build,sent);}
function dailyReleaseHistoryPage(build:DailyHistoryBuild):void{dailyHistoryOperations(build).releaseHistoryPage(build);}
function dailyCommitHistory(build:DailyHistoryBuild,compiled:Readonly<SeasonalityLiveMonthCache>,echo:Readonly<SeasonalityDailyEcho>):void{dailyHistoryOperations(build).commitHistory(build,compiled,echo);}
function dailyFinishHistory(build:DailyHistoryBuild,failed:boolean):void{dailyHistoryOperations(build).finishHistory(build,failed);}
async function dailyLoadHistory(build:DailyHistoryBuild):Promise<DailyMonthOwner>{
 let points:Readonly<SeasonalitySourcePoint>[]|null=[],compiled:Readonly<SeasonalityLiveMonthCache>|null=null,failed=false,failure:unknown;
 try{
  let token:string|undefined,echo:Readonly<SeasonalityDailyEcho>|null=null,complete=false;const tokens=new Set<string>();
  for(let page=0;page<3;page++){
   dailyCheckHistory(build);const sent={symbol:build.symbol,feed:build.feed,adjustment:build.owner.basis,start:build.request.coveredRequestFrom,end:build.request.requestedThrough,...(token?{pageToken:token}:{})};
   dailyReserveHistoryPage(build);let result:LiveBridgeResult<AlpacaBarsValue>|null=null,value:AlpacaBarsValue|null=null,received:readonly Readonly<SeasonalitySourcePoint>[]|null=null;
   try{
    result=await dailyRequestHistoryPage(build,sent);dailyCheckHistory(build);
    if(!result||mtfData(result,'ok')!==true)throw Error('The complete daily history request failed; no page prefix was promoted.');value=mtfData(result,'value') as AlpacaBarsValue;
    const observed=inspectSeasonalityDailyEcho(value,sent);dailyCheckHistory(build);if(echo&&(echo.from!==observed.from||echo.through!==observed.through))throw Error('Daily response pages did not observe one coherent window.');echo=observed;
    received=closedSeasonalityDailyPage(value,observed,build.rowBound);dailyCheckHistory(build);
    for(const point of received){const previous=points.at(-1);if(previous&&point.time<=previous.time){if(point.time===previous.time&&Object.is(point.close,previous.close)&&point.availableAt===previous.availableAt)continue;throw Error('Daily page overlap is conflicting or out of order.');}if(points.length>=build.rowBound)throw Error('The daily response exceeded its complete-window bound.');points.push(point);}
    if(observed.nextPageToken===null){complete=true;break;}if(tokens.has(observed.nextPageToken))throw Error('Daily page token cycle.');tokens.add(observed.nextPageToken);token=observed.nextPageToken;
   }finally{received=null;value=null;result=null;dailyReleaseHistoryPage(build);}
  }
  dailyCheckHistory(build);if(!complete||!echo)throw Error('The complete daily window did not finish within three coherent pages.');
  Object.freeze(points);compiled=compileLiveSeasonalityDays(points,build.settings,build.request.requestedThrough,build.description);dailyCheckHistory(build);dailyCommitHistory(build,compiled,echo);return build.owner;
 }catch(error){failed=true;failure=error;throw error;}
 finally{points=null;compiled=null;try{dailyFinishHistory(build,failed);}catch(cleanup){if(failed)throw new AggregateError([failure,cleanup],'Daily build and cleanup failed.');throw cleanup;}}
}
function dailyPreparationOperations(run:DailyPreparationRun):DailyServiceOperations{
 const provider=run.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!operation)throw Error('The actual daily preparation provider retired.');return operation;
}
function dailyPreparationFrontier(run:DailyPreparationRun,owner:DailyMonthOwner):DailyFrontierOwner|null{return dailyPreparationOperations(run).preparationFrontier(run,owner);}
function dailyCaptureWindow(run:DailyPreparationRun,owner:DailyMonthOwner,frontier:DailyFrontierOwner|null):AlpacaSeasonalityDailyWindow{return dailyPreparationOperations(run).captureWindow(run,owner,frontier);}
async function dailyPrepareWindow(run:DailyPreparationRun):Promise<AlpacaSeasonalityDailyWindow>{
 const owner=await run.history,frontier=dailyPreparationFrontier(run,owner);
 if(frontier?.pending)await frontier.pending;
 return dailyCaptureWindow(run,owner,frontier);
}
function dailyFrontierOperations(load:DailyFrontierLoad):DailyServiceOperations{
 const provider=load.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!operation)throw Error('The actual oldest-month provider retired.');return operation;
}
function dailyCheckFrontier(load:DailyFrontierLoad):void{dailyFrontierOperations(load).checkFrontier(load);}
function dailyReserveFrontierPage(load:DailyFrontierLoad):void{dailyFrontierOperations(load).reserveFrontierPage(load);}
function dailyRequestFrontierPage(load:DailyFrontierLoad,sent:Parameters<DailyServiceOperations['requestFrontierPage']>[1]):Promise<LiveBridgeResult<AlpacaBarsValue>>{return dailyFrontierOperations(load).requestFrontierPage(load,sent);}
function dailyReserveFrontierInspection(load:DailyFrontierLoad):void{dailyFrontierOperations(load).reserveFrontierInspection(load);}
function dailyFinishFrontier(load:DailyFrontierLoad,failed:boolean):void{dailyFrontierOperations(load).finishFrontier(load,failed);}
async function dailyLoadFrontier(load:DailyFrontierLoad):Promise<void>{
 let pages:Readonly<SeasonalityFrontierPage>[]|null=[],response:LiveBridgeResult<AlpacaBarsValue>|null=null,failed=false,failure:unknown;
 try{
  dailyCheckFrontier(load);
  if(load.facts.requestFrom===load.facts.requestThrough){load.owner.result=Object.freeze({status:'ready',firstObservedTime:load.owner.firstLoadedTime,firstLoadedTime:load.owner.firstLoadedTime,prefixBars:0,sourceRows:0,selectedBars:1});return;}
  let token:string|undefined,complete=false;
  for(let page=0;page<3;page++){
   dailyReserveFrontierPage(load);const facts=load.facts,sent={symbol:facts.symbol,timeframe:facts.timeframe,feed:facts.feed,adjustment:facts.adjustment,start:facts.requestFrom,end:facts.requestThrough,...(token?{pageToken:token}:{})};
   response=await dailyRequestFrontierPage(load,sent);dailyCheckFrontier(load);
   if(!response||mtfData(response,'ok')!==true)throw Error('The actual oldest-month time request failed.');dailyReserveFrontierInspection(load);
   const current=inspectSeasonalityFrontierResponse(mtfData(response,'value'),sent);dailyCheckFrontier(load);pages.push(current);response=null;
   if(current.nextPageToken===null){complete=true;break;}token=current.nextPageToken;
  }
  dailyCheckFrontier(load);if(!complete)throw Error('The oldest-month prefix did not finish within three pages.');
  const result=seasonalityIntradayFrontier({resolution:load.facts.resolution,session:load.owner.session,firstLoadedTime:load.owner.firstLoadedTime,requestFrom:load.facts.requestFrom,requestThrough:load.facts.requestThrough,pages});dailyCheckFrontier(load);
  if(result.status!=='ready')throw Error('The actual oldest-month frontier is '+result.status+'.');load.owner.result=result;
 }catch(error){failed=true;failure=error;throw error;}
 finally{response=null;pages=null;try{dailyFinishFrontier(load,failed);}catch(cleanup){if(failed)throw new AggregateError([failure,cleanup],'Time-only frontier and cleanup failed.');throw cleanup;}}
}
function dailyTwoOff(first:()=>void,second:()=>void):()=>void{return()=>{const errors:unknown[]=[];for(const off of [first,second])try{off();}catch(error){errors.push(error);}if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Native daily-frame subscriptions failed to retire.');};}
function dailyTicketCallbacks(provider:WeakRef<AlpacaLiveProvider>,map:Map<string,DailyPendingTicket>,key:string,ticket:DailyPendingTicket,resolve:(owner:DailyMonthOwner)=>void,reject:(error:unknown)=>void){
 return{fulfilled(owner:DailyMonthOwner){const actual=provider.deref();if(actual)dailyOperations.get(actual)?.settle(map,key,ticket);resolve(owner);},rejected(error:unknown){const actual=provider.deref();if(actual)dailyOperations.get(actual)?.settle(map,key,ticket);reject(error);}};
}
function dailyPlanning(key:AlpacaSeasonalityDailyPlan):SeasonalityDailyPlanning{
 const record=seasonalityDailyPlans.get(key),snapshot=record?.snapshot.deref(),dataset=record?.dataset.deref(),rows=record?.rows.deref();
 if(!record?.live||!snapshot||!dataset||!rows||mtfSnapshots.get(dataset)!==snapshot||snapshot.rows.deref()!==rows)throw Error('No current actual daily-history planning owner.');
 try{mtfSnapshotCurrent(snapshot);return record;}catch(error){record.live=false;throw error;}
}
function dailyDemandOperation(key:AlpacaSeasonalityDailyDemand):{record:DailyDemandRecord;operation:DailyServiceOperations}{
 const record=dailyDemands.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);
 if(!record?.live||!operation)throw Error('The actual daily-history demand retired.');return{record,operation};
}
/** Constructor-only opaque source keys. No callback, raw rows, external clock,
 * resolver, registrar or caller-supplied budget enters these operations. Actual
 * native M-frame ownership is separate and mandatory in the closed C consumer. */
export function acquireAlpacaSeasonalityDailyDemand(key:AlpacaSeasonalityDailyPlan,signal:AbortSignal):AlpacaSeasonalityDailyDemand{
 const planning=dailyPlanning(key),provider=planning.snapshot.deref()?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!operation)throw Error('No actual daily-history provider.');return operation.acquire(planning,signal);
}
export function prepareAlpacaSeasonalityDailyWindow(demand:AlpacaSeasonalityDailyDemand,plan:AlpacaSeasonalityDailyPlan,signal:AbortSignal,frontier?:Readonly<AlpacaSeasonalityFrontierRequest>):Promise<AlpacaSeasonalityDailyWindow>{
 const {record,operation}=dailyDemandOperation(demand);return operation.prepare(record,dailyPlanning(plan),plan,signal,frontier);
}
export function consumeAlpacaSeasonalityDailyWindow(key:AlpacaSeasonalityDailyWindow,grid:Readonly<SeasonalityLiveGrid>,choices:AlpacaSeasonalityChoices):Readonly<SeasonalityResult>{
 const record=dailyWindows.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!record?.live||!operation)throw Error('No actual daily-history window.');return operation.consume(record,grid,choices);
}
export function consumeAlpacaSeasonalityDailyWindowOwned(key:AlpacaSeasonalityDailyWindow,grid:Readonly<SeasonalityLiveGrid>,choices:AlpacaSeasonalityChoices):Readonly<SeasonalityResult>{
 const record=dailyWindows.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!record?.live||!operation)throw Error('No actual daily-history window.');return operation.consumeOwned(record,grid,choices);
}
export function assertAlpacaSeasonalityDailyWindow(key:AlpacaSeasonalityDailyWindow):void{
 const record=dailyWindows.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!record?.live||!operation)throw Error('The actual daily-history window retired.');operation.currentWindow(record);
}
export function releaseAlpacaSeasonalityDailyWindow(key:AlpacaSeasonalityDailyWindow):void{
 const record=dailyWindows.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(record?.live&&operation)operation.releaseWindow(record);
}
export function releaseAlpacaSeasonalityDailyDemand(key:AlpacaSeasonalityDailyDemand):void{
 const record=dailyDemands.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(record?.live&&operation)operation.releaseDemand(record);
}
/** Fixed private service accounting, not source/price permission. Unknown and
 * copied providers are rejected without invoking any supplied method/property.
 * Disposed providers can still have a genuinely pending uncancellable response. */
export function alpacaSeasonalityDailyUsage(provider:AlpacaLiveProvider):Readonly<{operations:number;numericSlots:number;pendingOwners:number}>|null{
 const operation=dailyOperations.get(provider);return operation?operation.usage():null;
}
/** Notification ONLY. No result/clock/row/currentness callback can supply
 * source permission. One weak subscriber belongs to an actual live demand. */
export function subscribeAlpacaSeasonalityDailyDemand(key:AlpacaSeasonalityDailyDemand,wake:()=>void):()=>void{
 const {record,operation}=dailyDemandOperation(key);if(typeof wake!=='function')throw Error('A daily demand notification requires a function.');return operation.subscribe(record,wake);
}
/** Stable private source identity across ordinary bar revisions. This cannot
 * rebase a dead demand: an actual source/basis/plan/entry transition is terminal.
 * Chart/model/native ownership remains the closed C consumer's separate duty. */
export function alpacaSeasonalityDailyDemandMatches(key:AlpacaSeasonalityDailyDemand,plan:AlpacaSeasonalityDailyPlan):boolean{
 try{const {record,operation}=dailyDemandOperation(key);return operation.matches(record,dailyPlanning(plan));}catch{return false;}
}
/** Create ONLY fixed preparation metadata. The closed C owner arms its actual
 * source reservation against this genuine key BEFORE run starts any history or
 * prefix work. Each frame/client gets a distinct group; physical sharing does
 * not let an old A retain a later B operation after its own await unwinds. */
export function createAlpacaSeasonalityPreparationGroup(demand:AlpacaSeasonalityDailyDemand,plan:AlpacaSeasonalityDailyPlan,signal:AbortSignal,target?:Readonly<AlpacaSeasonalityFrontierRequest>):AlpacaSeasonalityPreparationGroup{
 const {record,operation}=dailyDemandOperation(demand);dailyPlanning(plan);return operation.group(record,plan,signal,target);
}
function preparationOperation(key:AlpacaSeasonalityPreparationGroup){const record=dailyPreparationGroups.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!record||!operation)throw Error('No genuine daily preparation group.');return{record,operation};}
export function runAlpacaSeasonalityPreparationGroup(key:AlpacaSeasonalityPreparationGroup):Promise<AlpacaSeasonalityDailyWindow>{const {record}=preparationOperation(key);return dailyRunGroup(record);}
export function releaseAlpacaSeasonalityPreparationGroup(key:AlpacaSeasonalityPreparationGroup):void{const record=dailyPreparationGroups.get(key),provider=record?.provider.deref();if(record&&provider)dailyOperations.get(provider)?.cancelGroup(record);}
/** Physical lifetime facts ONLY, never prices/currentness or a budget credit.
 * Unknown/copy/proxy group keys are not a settled source (fail closed). */
export function alpacaSeasonalityPreparationSettled(key:AlpacaSeasonalityPreparationGroup):boolean{const record=dailyPreparationGroups.get(key);return !!record&&record.settled;}
/** O(1) descriptive membership only. No fields are inspected or source grant made. */
export function alpacaSeasonalityPreparationGroupKnown(key:object):boolean{return dailyPreparationGroups.has(key);}
/** Authenticated lifecycle facts, not a supplied refund/credit amount. The
 * closed source consumer separately binds the SAME result/reservation and
 * derives peak-minus-retained from its actual private phased source plan. */
export function alpacaSeasonalityPreparationWorkFacts(group:object,result:object):Readonly<{preparationOperations:number;computationOperations:number;unwound:boolean}>|null{
 const record=dailyPreparationGroups.get(group),key=record?.window?.deref(),window=key&&dailyWindows.get(key);if(!record||!key||!window||!window.live||record.cancelled||!record.settled||window.result!==result||!window.consumed)return null;
 try{assertAlpacaSeasonalityDailyWindow(key);return Object.freeze({preparationOperations:record.preparationWork,computationOperations:window.completedComputeWork,unwound:!window.unwindPending&&window.computeWork===0});}catch{return null;}
}
export function subscribeAlpacaSeasonalityPreparationSettled(key:AlpacaSeasonalityPreparationGroup,wake:()=>void):()=>void{const {record,operation}=preparationOperation(key);if(typeof wake!=='function')throw Error('A physical settlement notice requires a function.');return operation.subscribeGroup(record,wake);}
/** Private-source forecast for the closed C owner's COMBINED pre-admission.
 * All actual provider debits remain mandatory. These figures cannot lower a
 * limit, waive a charge or grant M/native publication/source permission. */
export function previewAlpacaSeasonalityDailyPreparation(key:AlpacaSeasonalityDailyDemand,plan:AlpacaSeasonalityDailyPlan,target?:Readonly<AlpacaSeasonalityFrontierRequest>):Readonly<AlpacaSeasonalityPreparationCost>{
 const {record,operation}=dailyDemandOperation(key);return operation.preview(record,dailyPlanning(plan),target);
}
/** The closed C owner uses this BEFORE demand/group allocation. Actual private
 * constructor/currentness is required; reported headroom cannot waive a debit. */
export function previewAlpacaSeasonalityDailyPlanPreparation(plan:AlpacaSeasonalityDailyPlan,target?:Readonly<AlpacaSeasonalityFrontierRequest>):Readonly<AlpacaSeasonalityPreparationCost>{
 const planning=dailyPlanning(plan),provider=planning.snapshot.deref()?.provider.deref(),operation=provider&&dailyOperations.get(provider);if(!operation)throw Error('The actual daily source retired.');return operation.previewPlan(planning,target);
}
/** Genuine time-only prefix facts. These never qualify native indexOffset0,
 * prices or a display row. A copied/proxy fact object cannot join a receipt. */
export function captureAlpacaSeasonalityGeometryFacts(key:AlpacaSeasonalityDailyWindow):Readonly<AlpacaSeasonalityGeometryFacts>|null{
 assertAlpacaSeasonalityDailyWindow(key);return dailyWindows.get(key)!.geometry;
}
export function alpacaSeasonalityGeometryFactsMatch(facts:object,key:AlpacaSeasonalityDailyWindow):boolean{
 if(dailyGeometryFacts.get(facts)?.deref()!==key)return false;try{assertAlpacaSeasonalityDailyWindow(key);return dailyWindows.get(key)?.geometry===facts;}catch{return false;}
}
/** D-history computation association ONLY. This never qualifies native M or
 * grants a scalar/native/CSV/alert publication. The actual C producer combines
 * it with its independent accepted model/frame/reservation witness. */
export function alpacaSeasonalityHistoryResultMatches(result:object,window:AlpacaSeasonalityDailyWindow,grid:object):boolean{
 const record=dailyConsumedResults.get(result);if(!record||record.window.deref()!==window||record.grid.deref()!==grid)return false;
 try{assertAlpacaSeasonalityDailyWindow(window);return true;}catch{return false;}
}
const seasonalityDailyPlans=new WeakMap<object,SeasonalityDailyPlanning>();
const seasonalityDailyProviderPlans=new WeakMap<object,(snapshot:MtfSnapshot,startYear:number,endYear:number)=>Readonly<{facts:SeasonalityDailyHistoryPlan;informationTime:number}>|null>();
/** Constructor admission only. No rows are read here. The returned key reserves
 * the actual replay constructor's full six-field validation/copy/freeze walk
 * BEFORE that walk: 512N+32768W and 16N+1024U. It grants no numerical source or
 * publication authority. Only the private replay constructor may associate its
 * own successfully validated immutable output with this origin. */
export function captureAlpacaSeasonalityFrozenHistoryOrigin(dataset:BarDataset,expectedRows:readonly Bar[]):AlpacaSeasonalityFrozenHistoryOrigin|null{
 const snapshot=mtfSnapshots.get(dataset);if(!snapshot||snapshot.rows.deref()!==expectedRows)return null;
 try{mtfSnapshotCurrent(snapshot);const provider=snapshot.provider.deref(),operation=provider&&dailyOperations.get(provider);return operation?.captureFrozenOrigin(snapshot)??null;}catch{return null;}
}
/** Pre/post-copy check of the ORIGINAL producer only. It never terminalizes a
 * sealed frozen origin because a normal later tick changes that producer. */
export function alpacaSeasonalityFrozenHistoryOriginCurrent(key:AlpacaSeasonalityFrozenHistoryOrigin,dataset:BarDataset,expectedRows:readonly Bar[]):boolean{
 const record=dailyFrozenOrigins.get(key);if(!record?.live||record.revoked||!record.preparing||record.dataset?.deref()!==dataset||record.rows?.deref()!==expectedRows)return false;
 try{const snapshot=record.snapshot?.deref();if(!snapshot||mtfSnapshots.get(dataset)!==snapshot)return false;mtfSnapshotCurrent(snapshot);return record.live&&record.preparing;}catch{return false;}
}
/** Call after the constructor's validation/copy/freeze stack has unwound.
 * Success seals the fixed captured cutoff, drops original graph handles and
 * releases preparation W. The OWN frozen graph U remains until actual drop. */
export function sealAlpacaSeasonalityFrozenHistoryOrigin(key:AlpacaSeasonalityFrozenHistoryOrigin):boolean{
 const record=dailyFrozenOrigins.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);return !!record&&!!operation&&operation.sealFrozenOrigin(record);
}
/** Fixed descriptive facts only; no rows, resolver, callback or mutable clock.
 * These facts never advance when the live producer receives a newer tick. */
export function alpacaSeasonalityFrozenHistoryOriginFacts(key:AlpacaSeasonalityFrozenHistoryOrigin):Readonly<AlpacaSeasonalityFrozenHistoryFacts>|null{
 const record=dailyFrozenOrigins.get(key);return record?.live&&!record.revoked&&record.sealed?record.facts:null;
}
/** Descriptive fixed membership only. No later cache lookup can qualify an
 * origin that had no already-qualified F cache at its genuine freeze. The
 * immutable monthly graphs are separately retained and paid by that origin. */
export function alpacaSeasonalityFrozenHistoryHasMonths(key:AlpacaSeasonalityFrozenHistoryOrigin):boolean{
 const record=dailyFrozenOrigins.get(key);return !!record?.live&&!record.revoked&&(record.preparing||record.sealed)&&!!record.months?.length;
}
export function releaseAlpacaSeasonalityFrozenHistoryOrigin(key:AlpacaSeasonalityFrozenHistoryOrigin):void{
 const record=dailyFrozenOrigins.get(key),provider=record?.provider.deref();if(!record)return;if(provider)dailyOperations.get(provider)?.releaseFrozenOrigin(record);else{record.live=false;record.snapshot=null;record.dataset=null;record.rows=null;record.facts=null;if(!record.active&&!record.borrowers)record.months=null;}
}
/** Logical permission revocation ONLY. Actual owned arrays/frozen views may
 * still be held by UI/native/clone aliases; resource release stays separate. */
export function revokeAlpacaSeasonalityFrozenHistoryOrigin(key:AlpacaSeasonalityFrozenHistoryOrigin):void{const record=dailyFrozenOrigins.get(key);if(record)record.revoked=true;}
/** Resource lifetime only: the actual closed replay consumer separately proves
 * source/run/currentness and prepays its full comparisons/projection. */
export function acquireAlpacaSeasonalityFrozenHistoryHold(key:AlpacaSeasonalityFrozenHistoryOrigin):AlpacaSeasonalityFrozenHistoryHold|null{
 const record=dailyFrozenOrigins.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);return record&&operation?operation.borrowFrozenOrigin(record,false):null;
}
/** Resource-only admission for an OWN immutable selected-reference constructor.
 * N comes from the captured origin, never a supplied traversal/budget amount.
 * The first selection also retains the complete100002 NY calendar allowance. */
export function acquireAlpacaSeasonalityFrozenSelectionHold(key:AlpacaSeasonalityFrozenHistoryOrigin):AlpacaSeasonalityFrozenHistoryHold|null{
 const record=dailyFrozenOrigins.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);return record&&operation?operation.borrowFrozenOrigin(record,true):null;
}
export function releaseAlpacaSeasonalityFrozenHistoryHold(key:AlpacaSeasonalityFrozenHistoryHold):void{
 const record=dailyFrozenBorrows.get(key);if(!record?.live)return;record.live=false;queueMicrotask(dailyFrozenBorrowUnwind(record.provider,new WeakRef(record)));
}
/** Resource-only qualified frame birth. Counts are derived from genuine
 * sealed origins, never caller traversal amounts or budget credits. */
export function acquireAlpacaSeasonalityFrozenFrameHold(parentKey:AlpacaSeasonalityFrozenHistoryOrigin,finerKey?:AlpacaSeasonalityFrozenHistoryOrigin):AlpacaSeasonalityFrozenFrameHold|null{
 const parent=dailyFrozenOrigins.get(parentKey),finer=finerKey?dailyFrozenOrigins.get(finerKey):null,provider=parent?.provider.deref();if(!parent||finerKey&&!finer)return null;return provider?dailyOperations.get(provider)?.frozenFrame(parent,finer??null)??null:null;
}
function queueFrozenFrameHold(record:DailyFrozenFrameHoldRecord):void{if(record.queued||record.released)return;record.queued=true;queueMicrotask(dailyFrozenFrameUnwind(record.provider,new WeakRef(record)));}
/** Constructor finally requests W retirement; callback stack must unwind first.
 * Parent frame-array U remains until the actual resource-only finalizer. */
export function finishAlpacaSeasonalityFrozenFrameConstruction(key:AlpacaSeasonalityFrozenFrameHold):void{const record=dailyFrozenFrameHolds.get(key);if(!record||record.released)return;record.finishRequested=true;queueFrozenFrameHold(record);}
export function releaseAlpacaSeasonalityFrozenFrameHold(key:AlpacaSeasonalityFrozenFrameHold):void{const record=dailyFrozenFrameHolds.get(key);if(!record||record.released)return;record.releaseRequested=true;record.finishRequested=true;queueFrozenFrameHold(record);}
/** Internal closed-consumer F access, never an M/native/source registrar.
 * Years are requested settings, not budget credit. Only documents captured at
 * genuine freeze can be selected; there is no provider request or cache lookup. */
export function captureAlpacaSeasonalityFrozenMonthLease(key:AlpacaSeasonalityFrozenHistoryOrigin,startYear:number,endYear:number):AlpacaSeasonalityFrozenMonthLease|null{
 const record=dailyFrozenOrigins.get(key),provider=record?.provider.deref(),operation=provider&&dailyOperations.get(provider);return record&&operation?operation.frozenMonths(record,startYear,endYear):null;
}
/** Once only. The actual replay consumer keeps this alias local to its admitted
 * synchronous projection stack, checks real source/run before and after, then
 * clears it before release. No D/M rows or caller callback are exposed. */
export function consumeAlpacaSeasonalityFrozenMonthLease(key:AlpacaSeasonalityFrozenMonthLease):Readonly<SeasonalityLiveMonthCache>{
 const record=dailyFrozenMonthLeases.get(key),origin=record?.origin.deref();if(!record?.live||record.consumed||!record.cache||!origin?.live||origin.revoked||!origin.sealed)throw Error('The frozen monthly source is unavailable.');record.consumed=true;return record.cache;
}
export function releaseAlpacaSeasonalityFrozenMonthLease(key:AlpacaSeasonalityFrozenMonthLease):void{
 const record=dailyFrozenMonthLeases.get(key);if(!record?.live)return;record.live=false;queueMicrotask(dailyFrozenMonthUnwind(record.provider,new WeakRef(record)));
}
/** Read-only genuine constructor membership. Unknown/copy/proxy datasets are
 * refused before consulting their fields. Native chart acceptance is separate.
 * The opaque key pins the exact sent-end plan; time/ticks cannot advance it. */
export function captureAlpacaSeasonalityDailyPlan(dataset:BarDataset,expectedRows:readonly Bar[],startYear:number,endYear:number):AlpacaSeasonalityDailyPlan|null{
 const snapshot=mtfSnapshots.get(dataset);if(!snapshot||snapshot.rows.deref()!==expectedRows)return null;
 try{
  mtfSnapshotCurrent(snapshot);const provider=snapshot.provider.deref();if(!provider)return null;
  const operation=seasonalityDailyProviderPlans.get(provider);if(!operation)return null;const actual=operation(snapshot,startYear,endYear),plan=actual?.facts;
  if(!plan||!actual)return null;
  const record:SeasonalityDailyPlanning={snapshot:new WeakRef(snapshot),dataset:new WeakRef(dataset),rows:new WeakRef(expectedRows),plan,informationTime:actual.informationTime,live:true};
  return dailyPlanHandle(record,snapshot.count);
 }catch{return null;}
}
const mtfSnapshotHandles=new WeakMap<object,{snapshot:MtfSnapshot;dataset:WeakRef<BarDataset>;rows:WeakRef<readonly Bar[]>;count:number}>();
interface MtfDemand {epoch:number;basis:AlpacaAdjustment;plan:AlpacaDataPlan;lastAttempt:number;completedClose:number;pending:boolean}
const mtfDemand=new WeakMap<Entry,MtfDemand>(),mtfRefreshing=new WeakMap<Entry,MtfDemand>();
let mtfLastRefreshRequest=-Infinity; // Shared transport pacing across provider instances; never a completion fact.
const mtfHistoryWindows=new WeakMap<Entry,{window:MtfRestWindow;series:WeakRef<LiveBarSeries>;reserve:WeakRef<Bar[]>}>();
export interface AlpacaClosedSnapshot {readonly rows:number;readonly coveredFrom:number;readonly coveredThrough:number;assertCurrent():void}
function mtfData(value:unknown,key:string):any{if(!value||typeof value!=='object')throw Error('REST observation requires own data.');const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('REST observation requires own data.');return field.value;}
function mtfWindow(value:unknown,received:Bar[],request:MtfRestWindow):MtfRestWindow|null{
 try{
  if(mtfData(value,'bars')!==received||mtfData(value,'symbol')!==request.symbol||mtfData(value,'timeframe')!==request.timeframe||mtfData(value,'feed')!==request.feed)return null;
  const provenance=mtfData(value,'provenance'),text=mtfData(provenance,'sourceUrl');if(typeof text!=='string'||text.length>8192)return null;
  const url=new URL(text),query=url.searchParams;
  if(url.origin!=='https://data.alpaca.markets'||url.pathname!=='/v2/stocks/'+encodeURIComponent(request.symbol)+'/bars'||query.getAll('start').length!==1||query.getAll('end').length!==1||query.get('timeframe')!==request.timeframe||query.get('feed')!==request.feed||query.get('adjustment')!==request.basis)return null;
  const start=Date.parse(query.get('start')!)/1000,end=Date.parse(query.get('end')!)/1000;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start!==request.start||end<=start||end>request.end)return null;
  return Object.freeze({...request,end:Math.min(request.end,end)});
 }catch{return null;}
}
function mtfLoad(value:HistoryLoad,arrays:readonly Bar[][],seam:number|null=null):HistoryLoad{
 const windows=arrays.map(array=>mtfRestWindows.get(array));
 if(windows.length&&windows.every((window):window is MtfRestWindow=>!!window))mtfLoads.set(value,Object.freeze({windows:Object.freeze(windows),seam}));
 return value;
}
function mtfJoin(windows:readonly MtfRestWindow[],seam:number|null):{from:number;through:number;feed:'iex'|'sip'}|null{
 if(!windows.length||windows.length>2)return null;const first=windows[0];
 for(let index=1;index<windows.length;index++){const next=windows[index];if(next.symbol!==first.symbol||next.timeframe!==first.timeframe||next.basis!==first.basis||next.plan!==first.plan||next.entry?.deref()!==first.entry?.deref()||next.epoch!==first.epoch)return null;}
 // The actual constructor's last consumed SIP opening + its requested timeframe bounds EVERY
 // consumed SIP row. Only when that whole prefix is covered may the IEX suffix extend the range.
 // A reduced echo ending inside that last SIP row cannot be repaired by an IEX start after its opening.
 const tail=windows[1],joined=tail&&seam!==null&&Number.isSafeInteger(seam)&&first.feed==='sip'&&tail.feed==='iex'&&seam<=first.end&&tail.start<=seam&&tail.end>=seam;
 return {from:first.start,through:joined?Math.max(first.end,tail.end):first.end,feed:joined&&tail.end>first.end?tail.feed:first.feed};
}
function mtfSnapshotCurrent(snapshot:MtfSnapshot):void{
 const dataset=snapshot.dataset.deref(),rows=snapshot.rows.deref(),entry=snapshot.entry.deref();
 if(!dataset||!rows||!entry||!snapshot.current()||mtfSnapshots.get(dataset)!==snapshot||mtfData(dataset,'bars')!==rows||rows.length!==snapshot.count||entry.series.revision!==snapshot.revision||mtfCoverage.get(entry)!==snapshot.coverage||mtfData(dataset,'instrument')!==snapshot.instrument||mtfData(dataset,'provenance')!==snapshot.provenance||mtfData(dataset,'resolution')!==snapshot.resolution||!MTF_HEADER.every((key,index)=>Object.is(mtfData(snapshot.instrument,key),snapshot.header[index]))||!MTF_PROVENANCE.every((key,index)=>Object.is(mtfData(snapshot.provenance,key),snapshot.facts[index])))throw Error('REST completion observation retired.');
}
/** Fixed private producer membership only. No completion/result is published by this query. */
export function alpacaClosedSnapshotInputFacts(dataset:BarDataset,expectedRows:readonly Bar[]):Readonly<{sourceRows:number;inputRows:number}>|null{
 try{const snapshot=mtfSnapshots.get(dataset);if(!snapshot||snapshot.rows.deref()!==expectedRows)return null;mtfSnapshotCurrent(snapshot);return Object.freeze({sourceRows:snapshot.count,inputRows:snapshot.count});}catch{return null;}
}
/** Actual constructor membership only. Session-view numeric verification occurs only after consumer admission. */
export function captureAlpacaClosedSnapshot(expectedDataset:BarDataset,expectedRows:readonly Bar[]):AlpacaClosedSnapshot|null{
 try{
  if(mtfData(expectedDataset,'bars')!==expectedRows)return null;
  const snapshot=mtfSnapshots.get(expectedDataset);if(!snapshot)return null;mtfSnapshotCurrent(snapshot);if(snapshot.coverage.blocked||snapshot.coverage.cachedPrefixUnobserved===true)return null;
  const entry=snapshot.entry.deref()!;
  // One bounded temporary list; it is discarded before returning the scalar lease.
  for(const time of entry.series.provisionalTimes){if(time>=snapshot.coverage.through)continue;const end=entry.plan.bucketRange?.(time).end??time+entry.seconds;if(end<=snapshot.coverage.through)return null;}
  snapshot.demand();mtfSnapshotCurrent(snapshot);
  const key=Object.freeze({});mtfSnapshotHandles.set(key,{snapshot,dataset:new WeakRef(expectedDataset),rows:new WeakRef(expectedRows),count:expectedRows.length});
  return Object.freeze({rows:expectedRows.length,coveredFrom:snapshot.coverage.from,coveredThrough:snapshot.coverage.through,assertCurrent(){const record=mtfSnapshotHandles.get(key),dataset=record?.dataset.deref(),rows=record?.rows.deref();if(!record||!dataset||!rows||mtfData(dataset,'bars')!==rows||rows.length!==record.count)throw Error('REST completion selection retired.');mtfSnapshotCurrent(record.snapshot);}});
 }catch{return null;}
}

const sameCacheKey = (a: BarCacheKey | null | undefined, b: BarCacheKey): boolean => !!a && a.provider === b.provider && a.symbol === b.symbol && a.interval === b.interval && a.feed === b.feed && a.adjustment === b.adjustment && a.plan === b.plan;
/** Two prices of the same bar on the same basis are equal; a relative difference above this means the basis moved. */
const BASIS_TOLERANCE = 1e-6;
const sameBasisPrice = (a: number, b: number): boolean => Math.abs(a - b) <= BASIS_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

export class AlpacaLiveProvider {
  private entries = new Map<string, Entry>();
  private status: AlpacaStatus | null = null;
  private unlisten: (() => void) | null = null;
  private subscribed = '';
  private subscriptionGeneration = 0;
  private counter = 0;
  private disposed = false;
  private everReady = false;
  private yieldOrder = 0;
  private syncHeld = false;
  readonly session: string;
  private readonly now: () => number;
  private readonly receivedNow: () => number;
  // Additional PRIVATE service bounds; the actual C pipeline must independently
  // fund its own calculation/output. No caller supplies a budget or raises caps.
  #dailyWork=0;#dailySlots=0;#dailyDisposed=false;
  #dailyClockTimer:ReturnType<typeof setTimeout>|null=null;#dailyClockToken:object|null=null;
  #dailyOwners=new Set<DailyMonthOwner>();
  #dailyCache=new WeakMap<Entry,Map<string,DailyMonthOwner>>();
  #dailyScopes=new WeakMap<Entry,DailyScope>();
  #dailyScopeOwners=new Set<DailyScope>();
  #dailyFrontierOwners=new Set<DailyFrontierOwner>();
  #dailyGroups=new Set<DailyPreparationGroupRecord>();#dailySettlementSubscribers=new Set<DailySettlementSubscriber>();
  #dailyFrozenOrigins=new Set<DailyFrozenOriginRecord>();
  #dailyFrozenMonthLeases=new Set<DailyFrozenMonthLeaseRecord>();
  #dailyFrozenFrameHolds=new Set<DailyFrozenFrameHoldRecord>();
  #dailyFrozenBorrows=new Set<DailyFrozenBorrow>();
  #dailyDemands=new Set<DailyDemandRecord>();
  #dailyPending=new WeakMap<Entry,Map<string,DailyPendingTicket>>();

  private readonly fixtureBusinessTime:boolean;
  private marketCoverage=0;
  private mtfTimer:ReturnType<typeof setTimeout>|null=null;
  private adjustment: AlpacaAdjustment;
  private dataPlan: AlpacaDataPlan;
  private dailySession: DailyTickSession;
  /** The main-process bar cache, when the bridge offers it (the desktop app). Tests and older bridges have none. */
  private readonly cache: (BarCacheBridge & Required<Pick<BarCacheBridge, 'readBarCache' | 'writeBarCache'>>) | null;
  /** `dividends` overrides the app-wide "Adjust data for dividends" preference (preferAlpacaDividendAdjustment); `plan`
   * overrides the Data plan preference (preferAlpacaDataPlan). */
  constructor(private bridge: AlpacaBridge & BarCacheBridge, options: { now?: () => number; dividends?: boolean; plan?: AlpacaDataPlan; /** Overrides preferAlpacaDailySession. */ session?: DailyTickSession } = {}) {
    this.cache = hasBarCache(bridge) ? bridge : null;
    this.now = options.now ?? alpacaMarketNow;
    // Receipt age is local elapsed wall time, independent of the fixture's exchange/business epoch. Existing explicit unit clocks retain their contract.
    this.receivedNow = options.now ?? (() => Date.now());this.fixtureBusinessTime=options.now===undefined&&marketClock!==null;this.session = liveSessionId(this.now());
    this.adjustment = options.dividends === undefined ? preferredAdjustment : alpacaAdjustment(options.dividends);
    this.dataPlan = options.plan === undefined ? preferredPlan : options.plan === 'paid' ? 'paid' : 'free';
    this.dailySession = options.session === undefined ? preferredDailySession : options.session === 'regular' ? 'regular' : 'extended';
    openProviders.add(this);
    this.offWatched = liveQuotes.onWatchedChange(() => this.queueQuotePriority());
    seasonalityDailyProviderPlans.set(this,(snapshot,startYear,endYear)=>this.#seasonalityDailyPlanAtCurrentOrigin(snapshot,startYear,endYear));
    dailyOperations.set(this,{
      acquire:(plan,signal)=>this.#dailyAcquire(plan,signal),
      prepare:(demand,plan,key,signal,frontier)=>this.#dailyPrepare(demand,plan,key,signal,frontier),
      consume:(window,grid,choices)=>this.#dailyConsume(window,grid,choices),
      consumeOwned:(window,grid,choices)=>this.#dailyConsumeOwned(window,grid,choices),
      releaseDemand:demand=>this.#dailyReleaseDemand(demand),
      releaseWindow:window=>this.#dailyReleaseWindow(window),
      currentWindow:window=>this.#dailyCurrentWindow(window),
      subscribe:(demand,wake)=>this.#dailySubscribe(demand,wake),
      matches:(demand,planning)=>this.#dailyDemandMatches(demand,planning),
      retireHistory:owner=>this.#retireDailyOwner(owner),
      notify:scope=>this.#notifyDailyWake(scope),
      settle:(map,key,ticket)=>this.#dailyTicketSettled(map,key,ticket),
      clock:token=>this.#dailyClockTick(token),
      preview:(demand,planning,target)=>this.#dailyPreparationCost(demand,planning,target),
      previewPlan:(planning,target)=>this.#dailyPreparationCost(null,planning,target),
      group:(demand,plan,signal,target)=>this.#createDailyGroup(demand,plan,signal,target),
      beginGroup:group=>this.#beginDailyGroup(group),
      finishGroupRun:group=>this.#finishDailyGroupRun(group),
      cancelGroup:group=>this.#cancelDailyGroup(group),
      subscribeGroup:(group,wake)=>this.#subscribeDailyGroup(group,wake),
      releaseSubscriber:subscriber=>this.#retireSettlementSubscriber(subscriber),
      notifyGroup:group=>this.#notifyDailyGroup(group),
      captureFrozenOrigin:snapshot=>this.#captureDailyFrozenOrigin(snapshot),
      sealFrozenOrigin:record=>this.#sealDailyFrozenOrigin(record),
      releaseFrozenOrigin:record=>this.#releaseDailyFrozenOrigin(record),
      finishFrozenOrigin:record=>this.#finishDailyFrozenOrigin(record),
      frozenMonths:(record,startYear,endYear)=>this.#captureDailyFrozenMonths(record,startYear,endYear),
      finishFrozenMonths:record=>this.#finishDailyFrozenMonths(record),
      frozenFrame:(parent,finer)=>this.#captureDailyFrozenFrame(parent,finer),
      finishFrozenFrame:record=>this.#finishDailyFrozenFrame(record),
      borrowFrozenOrigin:(record,selection)=>this.#borrowDailyFrozenOrigin(record,selection),
      finishFrozenBorrow:record=>this.#finishDailyFrozenBorrow(record),
      checkHistory:build=>this.#checkDailyHistory(build),
      reserveHistoryPage:build=>this.#reserveDailyHistoryPage(build),
      requestHistoryPage:(build,sent)=>this.#requestDailyHistoryPage(build,sent),
      releaseHistoryPage:build=>this.#releaseDailyHistoryPage(build),
      commitHistory:(build,compiled,echo)=>this.#commitDailyHistory(build,compiled,echo),
      finishHistory:(build,failed)=>this.#finishDailyHistory(build,failed),
      preparationFrontier:(run,owner)=>this.#preparationDailyFrontier(run,owner),
      captureWindow:(run,owner,frontier)=>this.#captureDailyWindow(run,owner,frontier),
      checkFrontier:load=>this.#checkDailyFrontier(load),
      reserveFrontierPage:load=>this.#reserveDailyFrontierPage(load),
      requestFrontierPage:(load,sent)=>this.#requestDailyFrontierPage(load,sent),
      reserveFrontierInspection:load=>this.#reserveDailyFrontierInspection(load),
      finishFrontier:(load,failed)=>this.#finishDailyFrontierLoad(load,failed),
      unwindWindow:window=>this.#unwindDailyWindow(window),
      usage:()=>Object.freeze({operations:this.#dailyWork,numericSlots:this.#dailySlots,pendingOwners:this.#dailyOwners.size}),
    });
  }
  /** The Data plan. A change resubscribes the stream on the plan's feed and reloads every open feed. */
  setDataPlan(plan: AlpacaDataPlan): void {
    const next: AlpacaDataPlan = plan === 'paid' ? 'paid' : 'free';
    if (this.disposed || next === this.dataPlan) return;
    this.dataPlan = next;
    this.subscribed = ''; this.syncSubscription();
    for (const entry of this.entries.values()) void this.reload(entry);
  }
  dataPlanChoice(): AlpacaDataPlan { return this.dataPlan; }
  /** The session rule for trades on forming daily bars. A change refolds each forming day from the trades it holds. */
  setDailySession(session: DailyTickSession): void {
    const next: DailyTickSession = session === 'regular' ? 'regular' : 'extended';
    if (this.disposed || next === this.dailySession) return;
    this.dailySession = next;
    const touched = new Set<Entry>();
    for (const entry of this.entries.values()) if (entry.daily) { entry.daily.session = next; this.applyDay(entry, entry.daily.bar(), touched); }
    for (const entry of touched) this.changed(entry);
  }
  dailySessionChoice(): DailyTickSession { return this.dailySession; }
  /** "Adjust data for dividends". A change reloads every open feed on the new basis (a new revision). */
  setDividendAdjustment(on: boolean): void {
    const next = alpacaAdjustment(on);
    if (this.disposed || next === this.adjustment) return;
    this.adjustment = next;
    for (const entry of this.entries.values()) void this.reload(entry);
  }
  adjustmentBasis(): AdjustmentBasis { return alpacaAdjustmentBasis(this.adjustment); }
  private today(): string { return newYorkClock(Math.floor(this.now() / 1000)).date; }

  open(symbol: string, resolution: string, options: AlpacaOpenOptions = {}): LiveHandle {
    if (this.disposed) throw new Error('The Alpaca provider is closed.');
    if (!ALPACA_SYMBOL.test(symbol)) throw new Error('Enter a US stock symbol such as AAPL, BRK.B or GME.WS.');
    const planned = planAlpacaInterval(resolution);
    if (!planned.ok) throw new Error(planned.reason);
    const plan = planned.plan, id = plan.id;
    const key = alpacaDatasetId(symbol, id);
    let entry = this.entries.get(key);
    if (!entry) {
      if (new Set([...this.entries.values()].map(row => row.symbol).concat(symbol)).size > ALPACA_MAX_SYMBOLS && (options.yielding || !this.yieldSymbol())) throw new Error(ALPACA_CAP_MESSAGE);
      const { timeframe, window } = NATIVE_BY_SECONDS[plan.backfillSeconds], seconds = plan.nominalSeconds;
      // Native daily bars start at New York midnight, so they are taken as published ('d' messages) without UTC bucketing.
      const nativeDaily = plan.native && plan.baseSeconds === 86400;
      const makeSeries = () => new LiveBarSeries({ seconds, baseSeconds: plan.baseSeconds, ticks: plan.ticks, aligned: !nativeDaily, ...(plan.bucketOf ? { bucketOf: plan.bucketOf } : {}) });
      entry = { key, symbol, resolution: id, seconds, timeframe, window, plan, series: makeSeries(), refs: 0, listeners: new Set(), cached: null, cachedRevision: -1, backfilled: false, lastError: null, seeding: new Set(), reconcileAfter: null, reserve: [], reserveAtLimit: false, strongRefs: 0, yielders: new Set(),
        makeSeries, basis: this.adjustment, epoch: 0, basisDay: this.today(), reloadedOn: null, dataPlan: this.dataPlan, hybrid: false, sipLast: null, sipCut: null, sipNote: null, refreshing: false,
        cacheProvider: ALPACA_IEX_PROVIDER_ID, fromCache: false, restThrough: null, cacheDirty: false, cacheTimer: null, historyFailed: false, daily: null };
      this.newPager(entry);
      this.entries.set(key, entry);
      void this.start(entry);
    }
    entry.refs++;
    const owned = entry; let closed = false;
    const listeners = new Set<(dataset: BarDataset) => void>();
    const close = () => { if (closed) return; closed = true; for (const listener of listeners) owned.listeners.delete(listener); if (yielder) owned.yielders.delete(yielder); else owned.strongRefs--; if(owned.strongRefs===0)this.retireMtfDemand(owned); if (--owned.refs <= 0) { this.entries.delete(owned.key); unregisterLiveHistory(owned.key, owned.history); void this.writeCache(owned); } const failures:unknown[]=[];if(owned.strongRefs===0)try{this.#retireEntryDaily(owned);}catch(error){failures.push(error);}try{this.syncSubscription();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Feed close and daily source cleanup failed.'); };
    const yielder = options.yielding ? { order: ++this.yieldOrder, evict: () => { close(); try { options.onEvicted?.(); } catch { /* the owner's notice never breaks the open that preempted it */ } } } : null;
    if (yielder) entry.yielders.add(yielder); else entry.strongRefs++;
    this.syncSubscription();
    return {
      datasetId: key,
      dataset: () => this.dataset(owned),
      formingTime: () => owned.series.formingTime,
      onChange: listener => { owned.listeners.add(listener); listeners.add(listener); return () => { owned.listeners.delete(listener); listeners.delete(listener); }; },
      close,
      loadOlder: () => owned.history!.load(),
      historyState: () => owned.history!.state(),
    };
  }
  /** Consolidated SIP history, delayed 15 minutes, as a static dataset (no streaming). */
  async history(symbol: string, resolution: string): Promise<BarDataset> {
    const planned = planAlpacaInterval(resolution);
    if (!ALPACA_SYMBOL.test(symbol) || !planned.ok) throw new Error('Unsupported Alpaca symbol or interval.');
    const id = planned.plan.id, seconds = planned.plan.nominalSeconds, { timeframe, window } = NATIVE_BY_SECONDS[planned.plan.backfillSeconds];
    const end = Math.floor(this.now() / 1000) - ALPACA_SIP_DELAY_SECONDS;
    const adjustment = this.adjustment, fetched = await this.pages(symbol, timeframe, 'sip', end - window, end, undefined, undefined, adjustment);
    const bars = planned.plan.native ? fetched : foldBars(fetched, planned.plan.bucketOf!);
    const kept = bars.slice(-BACKFILL_BARS * 4);
    return { instrument: alpacaInstrument(symbol), bars: kept, resolution: id, provenance: {
      providerId: ALPACA_SIP_PROVIDER_ID, providerName: ALPACA_PROVIDER_NAME, datasetId: alpacaDatasetId(symbol, id, 'sip'), fixture: false,
      coverage: `${kept.length} bars; consolidated SIP history, ${seconds}s bars, ending ${ALPACA_SIP_DELAY_SECONDS / 60} minutes before retrieval`, asOf: kept.at(-1)?.time ?? 0,
      delaySeconds: ALPACA_SIP_DELAY_SECONDS, adjustment: alpacaAdjustmentBasis(adjustment), session: 'unknown', timezone: 'America/New_York', state: 'ready', license: ALPACA_LICENSE,
      revision: `sip-v1:${end}:${adjustment}`, notes: [...NOTES_SIP, NOTE_ADJUSTMENT[adjustment]] } };
  }
  feedStatus(): AlpacaStatus | null { return this.status; }
  dispose(): void {
    const failures:unknown[]=[];this.#dailyDisposed=true;
    // Permission retirement is NOT frozen graph detachment. Actual replay
    // Close/drop must clear its own copies/cache and release the exact key.
    for(const origin of this.#dailyFrozenOrigins)origin.revoked=true;
    for(const group of [...this.#dailyGroups])try{this.#cancelDailyGroup(group);}catch(error){failures.push(error);}
    for(const scope of [...this.#dailyScopeOwners])try{this.#closeDailyScope(scope);}catch(error){failures.push(error);}
    for(const owner of [...this.#dailyOwners])try{this.#retireDailyOwner(owner);}catch(error){failures.push(error);}
    // Preserve the original provider disposal even when optional C cleanup
    // fails. Pending uncancellable IPC owners stay charged until settle.
    try{seasonalityDailyProviderPlans.delete(this);if(this.mtfTimer!==null){clearTimeout(this.mtfTimer);this.mtfTimer=null;}for(const entry of this.entries.values())mtfDemand.delete(entry); for (const entry of this.entries.values()) void this.writeCache(entry); this.subscriptionGeneration++; this.disposed = true; openProviders.delete(this); for (const entry of this.entries.values()) unregisterLiveHistory(entry.key, entry.history); this.entries.clear(); this.offWatched(); this.syncSubscription();}catch(error){failures.unshift(error);}
    if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Provider disposal and daily source cleanup failed.');
  }
  /** Write every pending cache batch now (tests; the app writes on a timer, on close and on dispose). */
  async flushBarCache(): Promise<void> { await Promise.all([...this.entries.values()].map(entry => this.writeCache(entry))); }

  /** The next 300 older bars. One IEX window (the backfill window before the first loaded bar) is fetched
   * through the bridge (which spaces requests for the 200-per-minute limit) and shown a page at a time. An incomplete
   * window (a failed later page) is never used: it would leave a hole before the first loaded bar. */
  private async olderPage(entry: Entry): Promise<LiveHistoryPage> {
    // The page is tagged with the entry and series it was measured from (see coinbase-live olderPage).
    const series = entry.series, firstBar = series.bars[0], first = firstBar?.time, epoch = entry.epoch;
    if (!entry.backfilled || first === undefined) return { kind: 'error', message: 'History is not loaded yet.' };
    if (entry.basis !== this.adjustment || entry.dataPlan !== this.dataPlan) return { kind: 'error', message: 'Prices are being re-adjusted.' };
    if (entry.series.bars.length >= entry.series.maxBars) return { kind: 'exhausted' };
    const retainedWindow=mtfHistoryWindows.get(entry),priorReserve=entry.reserve;
    entry.reserve = entry.reserve.filter(bar => bar.time < first);
    if(retainedWindow?.reserve.deref()===priorReserve)retainedWindow.reserve=new WeakRef(entry.reserve);else mtfHistoryWindows.delete(entry);
    if (!entry.reserve.length) {
      if (entry.reserveAtLimit) return { kind: 'exhausted' };
      const start = Math.max(ALPACA_EARLIEST_HISTORY, first - entry.window);
      if (start >= first) return { kind: 'exhausted' };
      const report = { complete: false };
      let bars: Bar[];
      try { bars = await this.pages(entry.symbol, entry.timeframe, this.historyFeed(entry), start, first, entry, report, entry.basis); }
      catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); return { kind: 'error', message, rateLimited: /too many|limit/i.test(message) }; }
      if (this.entries.get(entry.key) !== entry || this.disposed) return { kind: 'error', message: 'The live chart closed.' };
      if (entry.epoch !== epoch) return { kind: 'error', message: 'Prices were re-adjusted.' };
      if (entry.series !== series) return { kind: 'error', message: 'The live chart was reloaded.' };
      // Alpaca's `end` is inclusive, so the window repeats the first loaded bar (when that base bar exists).
      // The same bar on the same basis has the same open; a different open means a split or dividend took effect since the
      // backfill, so the feed reloads on the new basis instead of stitching two bases at this seam.
      const anchor = bars.find(bar => bar.time === first);
      if (anchor && !sameBasisPrice(anchor.open, firstBar.open) && this.reloadOnSeam(entry)) return { kind: 'error', message: 'Prices were re-adjusted for a new corporate action.' };
      if (!report.complete) return { kind: 'error', message: entry.lastError ?? 'Alpaca history was incomplete.', rateLimited: /too many|limit/i.test(entry.lastError ?? '') };
      const closedWindow=mtfRestWindows.get(bars);
      // A folded bucket that starts before `start` is partial; the next window covers it whole.
      if (!entry.plan.native) bars = foldBars(bars, entry.plan.bucketOf!);
      entry.reserve = bars.filter(bar => bar.time >= start && bar.time < first);
      entry.reserveAtLimit = start <= ALPACA_EARLIEST_HISTORY;
      if(closedWindow)mtfHistoryWindows.set(entry,{window:closedWindow,series:new WeakRef(entry.series),reserve:new WeakRef(entry.reserve)});else mtfHistoryWindows.delete(entry);
      if (!entry.reserve.length) return { kind: 'exhausted' };
    }
    const historyObservation=mtfHistoryWindows.get(entry),ownedReserve=entry.reserve;
    const page = entry.reserve.slice(-LIVE_HISTORY_PAGE_BARS);
    entry.reserve = entry.reserve.slice(0, entry.reserve.length - page.length);
    if(historyObservation?.reserve.deref()===ownedReserve)historyObservation.reserve=new WeakRef(entry.reserve);
    const { added, capped } = entry.series.prependHistory(page);
    if (added) {
      const coverage=mtfCoverage.get(entry),window=historyObservation?.window;
      if(coverage&&window&&historyObservation?.reserve.deref()===entry.reserve&&historyObservation.series.deref()===entry.series&&window.entry?.deref()===entry&&window.epoch===entry.epoch&&window.basis===entry.basis&&window.plan===entry.dataPlan&&window.start<=coverage.from&&window.end>=coverage.from)mtfCoverage.set(entry,Object.freeze({...coverage,from:window.start}));
      this.changed(entry); this.scheduleCacheWrite(entry);
    }
    if (!added || capped || (!entry.reserve.length && entry.reserveAtLimit)) return { kind: 'exhausted' };
    return { kind: 'added', added };
  }

  private dataset(entry: Entry): BarDataset {
    const dataset=buildLiveDataset(entry, alpacaInstrument(entry.symbol), this.session, { providerId: ALPACA_IEX_PROVIDER_ID, providerName: ALPACA_PROVIDER_NAME, datasetId: entry.key,
      coverage: entry.dataPlan === 'paid' ? ALPACA_SIP_LIVE_COVERAGE : entry.hybrid ? ALPACA_HYBRID_COVERAGE : ALPACA_IEX_COVERAGE, delaySeconds: 0, session: 'unknown', timezone: 'America/New_York', license: ALPACA_LICENSE, adjustment: alpacaAdjustmentBasis(entry.basis),
      notes: [...(entry.fromCache ? [LIVE_CACHED_NOTE] : []), ...(entry.backfilled && !entry.series.bars.length ? [alpacaNoIexDataMessage(entry.symbol)] : []), ...this.sourceNotes(entry), NOTE_ADJUSTMENT[entry.basis], this.status?.liveMessages ? 'Live messages received in this session.' : 'No live message received yet in this session.', ...(usMarketSession(this.now()) === 'closed' ? ['Market closed: showing the last session. Live updates resume when US trading opens (04:00 New York time for IEX extended hours).'] : [])], asOf: this.fixtureBusinessTime?this.marketCoverage:this.status?.lastMessageAt ? Math.floor(this.status.lastMessageAt / 1000) : 0 });
    this.retainMtfSnapshot(entry,dataset);return dataset;
  }
  private retainMtfSnapshot(entry:Entry,dataset:BarDataset):void{
   try{
    const coverage=mtfCoverage.get(entry);if(!coverage||entry.fromCache||!entry.backfilled||coverage.epoch!==entry.epoch||coverage.basis!==entry.basis||coverage.plan!==entry.dataPlan)return;
    const prior=mtfSnapshots.get(dataset);if(prior?.coverage===coverage&&prior.revision===entry.series.revision)return;
    const provider=new WeakRef(this),weakEntry=new WeakRef(entry),series=new WeakRef(entry.series),key=entry.key,epoch=entry.epoch,basis=entry.basis,plan=entry.dataPlan;
    const current=()=>{const owner=provider.deref(),value=weakEntry.deref();return !!owner&&!!value&&!owner.disposed&&owner.entries.get(key)===value&&value.epoch===epoch&&value.basis===basis&&value.dataPlan===plan&&!value.fromCache&&value.series===series.deref();};
    const instrument=mtfData(dataset,'instrument'),provenance=mtfData(dataset,'provenance');
    mtfSnapshots.set(dataset,{provider,instrument,provenance,header:Object.freeze(MTF_HEADER.map(key=>mtfData(instrument,key))),facts:Object.freeze(MTF_PROVENANCE.map(key=>mtfData(provenance,key))),resolution:dataset.resolution,dataset:new WeakRef(dataset),rows:new WeakRef(dataset.bars),entry:weakEntry,coverage,revision:entry.series.revision,count:dataset.bars.length,current,demand:()=>{const owner=provider.deref(),value=weakEntry.deref();if(owner&&value&&current())owner.retainMtfDemand(value);}});
   }catch{/* Optional observation never changes an existing dataset result. */}
  }
  private retainMtfLoad(entry:Entry,load:HistoryLoad,epoch:number,cachedPrefixUnobserved=false):void{
   const observed=mtfLoads.get(load),windows=observed?.windows,bounds=windows&&mtfJoin(windows,observed!.seam);mtfCoverage.delete(entry);
   if(!bounds||this.disposed||this.entries.get(entry.key)!==entry||entry.epoch!==epoch||!windows!.every(window=>window.entry?.deref()===entry&&window.epoch===epoch&&window.basis===entry.basis&&window.plan===entry.dataPlan))return;
   // Composition only: the real constructor consumed SIP rows before this seam. It never extends observed coverage.
   mtfCoverage.set(entry,Object.freeze({epoch,basis:entry.basis,plan:entry.dataPlan,from:bounds.from,through:bounds.through,feed:bounds.feed,...(entry.hybrid&&observed!.seam!==null?{sipThrough:observed!.seam}:{}),...(cachedPrefixUnobserved?{cachedPrefixUnobserved:true as const}:{})}));
  }
  /** Only an actual admitted source consumption can request close-boundary work. No row cache is retained. */
  private retainMtfDemand(entry:Entry):void{
   if(this.disposed||this.entries.get(entry.key)!==entry||entry.strongRefs<1||!entry.backfilled||entry.fromCache)return;
   const prior=mtfDemand.get(entry);if(!prior||prior.epoch!==entry.epoch||prior.basis!==entry.basis||prior.plan!==entry.dataPlan)mtfDemand.set(entry,{epoch:entry.epoch,basis:entry.basis,plan:entry.dataPlan,lastAttempt:-Infinity,completedClose:-Infinity,pending:false});
   this.queueMtfRefresh();
  }
  private retireMtfDemand(entry:Entry):void{
   const prior=mtfDemand.get(entry);mtfDemand.delete(entry);mtfHistoryWindows.delete(entry);if(prior&&mtfRefreshing.get(entry)===prior){mtfRefreshing.delete(entry);entry.refreshing=false;}if(this.mtfTimer!==null&&!Array.from(this.entries.values()).some(value=>value.strongRefs>0&&mtfDemand.has(value))){clearTimeout(this.mtfTimer);this.mtfTimer=null;}
  }
  private queueMtfRefresh(delay=60000):void{
   if(this.disposed||this.mtfTimer!==null||!Array.from(this.entries.values()).some(entry=>entry.strongRefs>0&&mtfDemand.has(entry)))return;
   this.mtfTimer=setTimeout(()=>{this.mtfTimer=null;if(this.disposed)return;const now=Date.now();
    for(const entry of this.entries.values()){const demand=mtfDemand.get(entry);if(!demand||entry.strongRefs<1||demand.pending||demand.epoch!==entry.epoch||demand.basis!==entry.basis||demand.plan!==entry.dataPlan||now-demand.lastAttempt<60000||now-mtfLastRefreshRequest<1500)continue;
     const close=this.mtfClosedBoundary(entry);if(close===null||close<=demand.completedClose)continue;
     demand.lastAttempt=now;mtfLastRefreshRequest=now;void this.refreshMtfCompletion(entry,demand,close);break;}
    this.queueMtfRefresh(1500);
   },delay);
  }
  private mtfClosedBoundary(entry:Entry):number|null{
   const coverage=mtfCoverage.get(entry),now=Math.floor(this.now()/1000);
   if(!coverage||entry.fromCache||!entry.backfilled||entry.refreshing||entry.history?.state().status==='loading'||!['ready','stale'].includes(this.status?.state??'')||entry.plan.baseSeconds!==60||entry.seconds%60!==0||23400%entry.seconds!==0||12600%entry.seconds!==0)return null;
   let date=newYorkClock(now).date;for(let index=0;index<10;index++){
    const year=Number(date.slice(0,4));if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)return null;
    const day=usSessionDay(date),close=newYorkWallTime(date,day.close),available=entry.dataPlan==='free'&&entry.hybrid?now-ALPACA_SIP_DELAY_SECONDS:now;
    if(!day.weekend&&!day.holiday&&close<=available)return close>coverage.through?close:null;
    date=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
   }return null;
  }
  private async refreshMtfCompletion(entry:Entry,demand:MtfDemand,close:number):Promise<void>{
   const coverage=mtfCoverage.get(entry),epoch=entry.epoch,series=entry.series,basis=entry.basis,plan=entry.dataPlan;
   const current=()=>!this.disposed&&this.entries.get(entry.key)===entry&&entry.series===series&&entry.epoch===epoch&&entry.basis===basis&&entry.dataPlan===plan&&entry.strongRefs>0&&mtfDemand.get(entry)===demand;
   if(!coverage||!current()||demand.pending||entry.refreshing)return;
   // A recent window must actually overlap the previously observed range. Never bridge a missing week by max(end).
   const bucket=(time:number)=>entry.plan.bucketOf?entry.plan.bucketOf(time):Math.floor(time/entry.seconds)*entry.seconds;
   const recentFrom=bucket(coverage.through-entry.seconds),sipFrom=plan==='free'&&entry.hybrid&&coverage.sipThrough!==undefined?bucket(coverage.sipThrough):null;
   // Mark fuller-source reconciliation only when EVERY replaced target contains an IEX contribution.
   // Keep the genuine overlap on reduced echoes / later closes, using unmarked corrections if needed.
   const from=sipFrom!==null&&sipFrom>recentFrom&&sipFrom<coverage.through?sipFrom:recentFrom;
   if(from<coverage.from||from>=coverage.through||close<=from||close-from>7*86400)return;
   const K=Math.ceil((close-from)/60)+1,N=series.bars.length,width=N+K;
   if(512*width+64*width*Math.ceil(Math.log2(width+1))+65536>20000000||12*N+48*K+16*N+2048>2000000)return;
   demand.pending=true;mtfRefreshing.set(entry,demand);entry.refreshing=true;
   try{
    const feed=entry.dataPlan==='paid'||entry.hybrid?'sip':'iex',report={complete:false};
    const observed=await this.pages(entry.symbol,'1Min',feed,from,close,entry,report,basis),window=mtfRestWindows.get(observed);
    if(!current()||mtfCoverage.get(entry)!==coverage||!report.complete||!window||window.entry?.deref()!==entry||window.epoch!==epoch||window.feed!==feed||window.basis!==basis||window.plan!==plan||window.start!==from||window.end<close)return;
    const complete=observed.filter(row=>row.time>=from&&row.time+60<=close),fuller=sipFrom!==null&&from>=sipFrom;
    if(!current()||mtfCoverage.get(entry)!==coverage||entry.history?.state().status==='loading')return;
    const applied=series.replaceCompleteBaseWindow(complete,{from,through:close,consolidated:fuller});
    if(!current())return;
    if(!applied.ok){if(applied.reason==='empty-closed-bucket'){mtfCoverage.set(entry,Object.freeze({...coverage,blocked:true}));entry.cached=null;this.changed(entry);}return;}
    mtfCoverage.set(entry,Object.freeze({epoch,basis,plan,from:coverage.from,through:close,feed,...(feed==='sip'&&entry.hybrid?{sipThrough:Math.max(coverage.sipThrough??-Infinity,close)}:{}),...(coverage.cachedPrefixUnobserved?{cachedPrefixUnobserved:true as const}:{})}));demand.completedClose=close;
    // The existing pager/reserve/origin/forming base survive the one atomic series mutation.
    entry.cached=null;this.changed(entry);this.scheduleCacheWrite(entry);
   }catch{/* A request failure cannot advance or manufacture a completion observation. */}
   finally{demand.pending=false;if(mtfRefreshing.get(entry)===demand){mtfRefreshing.delete(entry);entry.refreshing=false;}}
  }
  /** Plain words for where the bars of this feed come from, including the moving all-exchange / IEX boundary. */
  #assertDailyScope(scope:DailyScope):Entry{
   const entry=scope.entry.deref(),series=scope.series.deref();
   if(!scope.live||this.#dailyDisposed||this.disposed||!entry||!series||this.#dailyScopes.get(entry)!==scope||this.entries.get(entry.key)!==entry||entry.series!==series||entry.epoch!==scope.epoch||entry.basis!==scope.basis||entry.dataPlan!==scope.plan||entry.hybrid!==scope.hybrid||this.adjustment!==scope.basis||this.dataPlan!==scope.plan||entry.strongRefs<1||entry.fromCache||!entry.backfilled||entry.historyFailed)throw Error('The actual daily source demand changed.');return entry;
  }
  #captureDailyFrozenOrigin(snapshot:MtfSnapshot):AlpacaSeasonalityFrozenHistoryOrigin|null{
   const N=snapshot.count,W=512*N+32768,U=16*N+1024;
   if(this.#dailyDisposed||this.disposed||snapshot.provider.deref()!==this||snapshot.coverage.cachedPrefixUnobserved===true||!Number.isSafeInteger(N)||N<1||N>100000||!Number.isSafeInteger(W)||!Number.isSafeInteger(U)||this.#dailyWork+W>20000000||this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE||this.#dailyFrozenOrigins.size>=1000)return null;
   this.#dailyWork+=W;this.#dailySlots+=U;let accepted=false,extraW=0,extraU=0;
   try{
    const actual=this.#seasonalityDailyPlanAtCurrentOrigin(snapshot,2015,2028),dataset=snapshot.dataset.deref(),rows=snapshot.rows.deref(),entry=snapshot.entry.deref();
    if(!actual||!dataset||!rows||!entry||this.#dailyDisposed||this.disposed)return null;mtfSnapshotCurrent(snapshot);
    const facts=Object.freeze({informationTime:actual.informationTime,observedThrough:actual.facts.requestedThrough,sourceRows:N,resolution:snapshot.resolution,symbol:entry.symbol,feed:this.historyFeed(entry),adjustment:entry.basis});
    // This private map is consulted ONCE at genuine freeze. Existing immutable
    // F graphs contain no D points/response/sample aliases. No later live cache
    // or request may fill an absent document in the sealed replay source.
    const caches=this.#dailyCache.get(entry),C=caches?.size??0;
    if(!Number.isSafeInteger(C)||C<0||C>105)return null;
    // Full closed cache graph bound (<=168 monthly frames per certified range),
    // references/wrappers and capture scratch are admitted BEFORE allocation or
    // map traversal. These are independent holds, not credits from live caches.
    const monthW=C?4096*C+32768:0,monthU=C?32*168*C+512*C+4096:0;
    if(this.#dailyWork+monthW>20000000||this.#dailySlots+monthU>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)return null;
    this.#dailyWork+=monthW;this.#dailySlots+=monthU;extraW=monthW;extraU=monthU;
    let documents:readonly Readonly<DailyFrozenMonthDocument>[]|null=null,monthAccepted=false;
    try{
     const captured:Readonly<DailyFrozenMonthDocument>[]=[];
     if(caches)for(const owner of caches.values()){
      const cache=owner.cache;
      if(!this.#dailyOwnerCurrent(owner)||owner.working||!cache||owner.entry.deref()!==entry||owner.feed!==facts.feed||owner.basis!==facts.adjustment||owner.closedThrough>actual.facts.closedThrough||owner.coveredThrough>facts.observedThrough)continue;
      if(owner.startYear<2015||owner.endYear>2028||owner.startYear>owner.endYear||!Object.isFrozen(cache)||!Object.isFrozen(cache.months)||cache.months.length>168||cache.lastClosedDay!==null&&cache.lastClosedDay>facts.informationTime)return null;
      captured.push(Object.freeze({startYear:owner.startYear,endYear:owner.endYear,coveredFrom:owner.coveredFrom,coveredThrough:owner.coveredThrough,closedThrough:owner.closedThrough,cache}));
     }
     mtfSnapshotCurrent(snapshot);if(this.#dailyDisposed||this.disposed)return null;
     documents=Object.freeze(captured);monthAccepted=true;
    }finally{if(!monthAccepted){documents=null;this.#dailyWork-=monthW;this.#dailySlots-=monthU;extraW=0;extraU=0;}}
    const record:DailyFrozenOriginRecord={months:documents,provider:new WeakRef(this),snapshot:new WeakRef(snapshot),dataset:new WeakRef(dataset),rows:new WeakRef(rows),facts,live:true,revoked:false,preparing:true,sealed:false,active:true,borrowers:0,calendarReserved:false,unwindPending:false,work:W+monthW,slots:U+monthU};
    const key=Object.freeze({}) as AlpacaSeasonalityFrozenHistoryOrigin;dailyFrozenOrigins.set(key,record);this.#dailyFrozenOrigins.add(record);accepted=true;return key;
   }finally{if(!accepted){this.#dailyWork-=W+extraW;this.#dailySlots-=U+extraU;}}
  }
  #scheduleDailyFrozenUnwind(record:DailyFrozenOriginRecord):void{
   if(!record.active||record.unwindPending)return;record.unwindPending=true;queueMicrotask(dailyFrozenUnwind(new WeakRef(this),new WeakRef(record)));
  }
  #sealDailyFrozenOrigin(record:DailyFrozenOriginRecord):boolean{
   if(record.provider.deref()!==this||!record.live||record.revoked||!record.preparing||record.sealed)return false;
   try{const snapshot=record.snapshot?.deref(),dataset=record.dataset?.deref(),rows=record.rows?.deref();if(!snapshot||!dataset||!rows||this.#dailyDisposed||this.disposed||mtfSnapshots.get(dataset)!==snapshot||snapshot.rows.deref()!==rows)throw Error('The original replay source changed while freezing.');mtfSnapshotCurrent(snapshot);}
   catch{this.#releaseDailyFrozenOrigin(record);return false;}
   record.preparing=false;record.sealed=true;record.snapshot=null;record.dataset=null;record.rows=null;this.#scheduleDailyFrozenUnwind(record);return true;
  }
  #releaseDailyFrozenOrigin(record:DailyFrozenOriginRecord):void{
   if(record.provider.deref()!==this||!record.live)return;record.live=false;record.preparing=false;record.sealed=false;record.snapshot=null;record.dataset=null;record.rows=null;record.facts=null;
   if(record.active)this.#scheduleDailyFrozenUnwind(record);else this.#finishDailyFrozenOrigin(record);
  }
  #finishDailyFrozenOrigin(record:DailyFrozenOriginRecord):void{
   if(record.provider.deref()!==this)return;record.unwindPending=false;record.active=false;const W=record.work;record.work=0;this.#dailyWork-=W;
   if(!record.live&&!record.borrowers){record.months=null;const U=record.slots;record.slots=0;this.#dailySlots-=U;this.#dailyFrozenOrigins.delete(record);}
  }
  #borrowDailyFrozenOrigin(origin:DailyFrozenOriginRecord,selection:boolean):AlpacaSeasonalityFrozenHistoryHold|null{
   if(origin.provider.deref()!==this||!origin.live||origin.revoked||!origin.facts||(!origin.sealed&&(selection||!origin.preparing)))return null;
   const W=selection?512*origin.facts.sourceRows+32768:ALPACA_SEASONALITY_FROZEN_HOLD_COST.operations,U=ALPACA_SEASONALITY_FROZEN_HOLD_COST.numericSlots,calendar=selection&&!origin.calendarReserved?100002:0;
   if(!Number.isSafeInteger(W)||this.#dailyFrozenBorrows.size>=1000||this.#dailyWork+W>20000000||this.#dailySlots+U+calendar>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)return null;
   this.#dailyWork+=W;this.#dailySlots+=U+calendar;origin.borrowers++;origin.slots+=calendar;if(calendar)origin.calendarReserved=true;
   let record:DailyFrozenBorrow|null=null;
   try{record={provider:new WeakRef(this),origin:new WeakRef(origin),live:true,released:false,work:W,slots:U};const key=Object.freeze({}) as AlpacaSeasonalityFrozenHistoryHold;dailyFrozenBorrows.set(key,record);this.#dailyFrozenBorrows.add(record);return key;}
   catch(error){if(record){record.live=false;record.released=true;this.#dailyFrozenBorrows.delete(record);}origin.borrowers--;this.#dailyWork-=W;this.#dailySlots-=U;if(!origin.active)this.#finishDailyFrozenOrigin(origin);throw error;}
  }
  #finishDailyFrozenBorrow(record:DailyFrozenBorrow):void{
   if(record.provider.deref()!==this||record.live||record.released)return;record.released=true;this.#dailyFrozenBorrows.delete(record);const origin=record.origin.deref();if(origin)origin.borrowers--;this.#dailyWork-=record.work;this.#dailySlots-=record.slots;record.work=0;record.slots=0;
   if(origin&&!origin.active)this.#finishDailyFrozenOrigin(origin);
  }
  #captureDailyFrozenFrame(parent:DailyFrozenOriginRecord,finer:DailyFrozenOriginRecord|null):AlpacaSeasonalityFrozenFrameHold|null{
   const valid=(origin:DailyFrozenOriginRecord)=>origin.provider.deref()===this&&origin.live&&!origin.revoked&&origin.sealed&&!!origin.facts;
   if(this.#dailyDisposed||this.disposed||!valid(parent)||finer&&(finer===parent||!valid(finer))||this.#dailyFrozenFrameHolds.size>=1000)return null;
   const Np=parent.facts!.sourceRows,Nf=finer?.facts?.sourceRows??0,W=1024*(Np+Nf)+32768,U=Np+256;
   if(!Number.isSafeInteger(W)||!Number.isSafeInteger(U)||this.#dailyWork+W>20000000||this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)return null;
   this.#dailyWork+=W;this.#dailySlots+=U;let accepted=false;
   try{
    const record:DailyFrozenFrameHoldRecord={provider:new WeakRef(this),parent:new WeakRef(parent),finer:finer?new WeakRef(finer):null,construction:true,finishRequested:false,releaseRequested:false,queued:false,released:false,work:W,slots:U},key=Object.freeze({}) as AlpacaSeasonalityFrozenFrameHold;
    dailyFrozenFrameHolds.set(key,record);this.#dailyFrozenFrameHolds.add(record);parent.borrowers++;if(finer)finer.borrowers++;accepted=true;return key;
   }finally{if(!accepted){this.#dailyWork-=W;this.#dailySlots-=U;}}
  }
  #finishDailyFrozenFrame(record:DailyFrozenFrameHoldRecord):void{
   if(record.provider.deref()!==this||record.released)return;record.queued=false;
   if(record.construction&&record.finishRequested){
    record.construction=false;const fine=record.finer?.deref();record.finer=null;const W=record.work;record.work=0;this.#dailyWork-=W;if(fine){fine.borrowers--;if(!fine.active)this.#finishDailyFrozenOrigin(fine);}
   }
   if(record.releaseRequested&&!record.construction){record.released=true;this.#dailyFrozenFrameHolds.delete(record);const parent=record.parent.deref(),U=record.slots;record.slots=0;this.#dailySlots-=U;if(parent){parent.borrowers--;if(!parent.active)this.#finishDailyFrozenOrigin(parent);}}
  }
  #captureDailyFrozenMonths(origin:DailyFrozenOriginRecord,startYear:number,endYear:number):AlpacaSeasonalityFrozenMonthLease|null{
   if(origin.provider.deref()!==this||!origin.live||origin.revoked||!origin.sealed||!origin.facts||!origin.months?.length||this.#dailyDisposed||this.disposed||!Number.isSafeInteger(startYear)||!Number.isSafeInteger(endYear)||startYear<1||endYear>9999||startYear>endYear||endYear>2028||this.#dailyFrozenMonthLeases.size>=1000)return null;
   const first=Math.max(2015,startYear),last=Math.min(2028,endYear);if(first>last)return null;
   // <=105 private fixed headers; no F price/count is read while selecting.
   // Header traversal, output key and full F consumption are prepaid together
   // BEFORE traversing the captured document list or allocating a lease.
   const upperF=168,W=2048*upperF+4096*105+32768,U=32*upperF+1024;
   if(this.#dailyWork+W>20000000||this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)return null;
   this.#dailyWork+=W;this.#dailySlots+=U;let accepted=false;
   try{
    let selected:Readonly<DailyFrozenMonthDocument>|null=null;
    for(const document of origin.months)if(document.startYear<=first&&document.endYear>=last&&(!selected||document.endYear-document.startYear<selected.endYear-selected.startYear))selected=document;
    if(!selected||selected.coveredThrough>origin.facts.observedThrough||selected.closedThrough>origin.facts.informationTime||!Object.isFrozen(selected.cache)||!Object.isFrozen(selected.cache.months)||selected.cache.months.length>upperF)return null;
    const record:DailyFrozenMonthLeaseRecord={provider:new WeakRef(this),origin:new WeakRef(origin),cache:selected.cache,live:true,consumed:false,released:false,work:W,slots:U},key=Object.freeze({}) as AlpacaSeasonalityFrozenMonthLease;
    dailyFrozenMonthLeases.set(key,record);this.#dailyFrozenMonthLeases.add(record);origin.borrowers++;accepted=true;return key;
   }finally{if(!accepted){this.#dailyWork-=W;this.#dailySlots-=U;}}
  }
  #finishDailyFrozenMonths(record:DailyFrozenMonthLeaseRecord):void{
   if(record.provider.deref()!==this||record.live||record.released)return;record.released=true;const origin=record.origin.deref();
   // The original caller projection/finally stack has unwound. Clear every
   // strong F alias BEFORE either its own debit or the last origin graph debit.
   record.cache=null;this.#dailyFrozenMonthLeases.delete(record);if(origin)origin.borrowers--;const W=record.work,U=record.slots;record.work=0;record.slots=0;this.#dailyWork-=W;this.#dailySlots-=U;if(origin&&!origin.active)this.#finishDailyFrozenOrigin(origin);
  }
  #createDailyGroup(demand:DailyDemandRecord,plan:AlpacaSeasonalityDailyPlan,frameSignal:AbortSignal,target?:Readonly<AlpacaSeasonalityFrontierRequest>):AlpacaSeasonalityPreparationGroup{
   const planning=dailyPlanning(plan);if(!this.#dailyDemandMatches(demand,planning)||dailyAborted(frameSignal))throw Error('The actual preparation owner is unavailable.');
   if(this.#dailyWork+4096>20000000||this.#dailySlots+1024>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE||this.#dailyGroups.size>=1000)throw Error('The fixed preparation owner cannot be admitted.');this.#dailyWork+=4096;this.#dailySlots+=1024;
   let group:DailyPreparationGroupRecord|null=null;
   try{
    let projection:Readonly<AlpacaSeasonalityFrontierRequest>|undefined;if(target){const firstLoadedTime=mtfData(target,'firstLoadedTime'),session=mtfData(target,'session');if(!Number.isSafeInteger(firstLoadedTime)||(session!=='regular'&&session!=='extended'))throw Error('The projection request is invalid.');projection=Object.freeze({firstLoadedTime,session});}
    const preparation=this.#dailyPreparationCost(demand,planning,projection);
    if(this.#dailyGroups.size>=1000||!this.#dailyDemandMatches(demand,planning)||dailyAborted(frameSignal))throw Error('The actual preparation changed during its fixed forecast.');
    const controller=new DailyNativeAbort(),signal=Reflect.apply(dailyControllerSignal,controller,[]) as AbortSignal,key=Object.freeze({}) as AlpacaSeasonalityPreparationGroup;
    group={provider:new WeakRef(this),key,demand:new WeakRef(demand),plan,frameSignal:new WeakRef(frameSignal),target:projection,controller,signal,started:false,settled:false,cancelled:false,releaseRequested:false,released:false,off:null,subscribers:new Set(),notifyPending:false,activeNotifications:0,preparationWork:Math.max(0,preparation.additionalPeakOperations-4096),window:null};dailyPreparationGroups.set(key,group);this.#dailyGroups.add(group);
    const abort=dailyWeakGroupAbort(new WeakRef(this),new WeakRef(group));group.off=dailyWeakAbortOff(new WeakRef(frameSignal),abort);Reflect.apply(dailyAbortAdd,frameSignal,['abort',abort,{once:true}]);
    if(dailyAborted(frameSignal)||!this.#dailyDemandMatches(demand,planning))throw Error('The actual preparation retired during acquisition.');return key;
   }catch(error){if(group){try{this.#cancelDailyGroup(group);}catch(cleanup){throw new AggregateError([error,cleanup],'Preparation acquisition and cleanup failed.');}}else{this.#dailyWork-=4096;this.#dailySlots-=1024;}throw error;}
  }
  #finishDailyGroup(group:DailyPreparationGroupRecord):void{
   if(group.released||!group.releaseRequested||!group.settled||group.subscribers.size||group.activeNotifications)return;group.released=true;group.plan=null;group.target=undefined;group.controller=null;group.signal=null;group.window=null;const off=group.off;group.off=null;this.#dailyGroups.delete(group);
   try{off?.();}finally{this.#dailyWork-=4096;this.#dailySlots-=1024;}
  }
  #cancelDailyGroup(group:DailyPreparationGroupRecord):void{
   if(group.released)return;group.cancelled=true;group.releaseRequested=true;const off=group.off;group.off=null;const failures:unknown[]=[];
   try{off?.();}catch(error){failures.push(error);}if(group.controller)try{Reflect.apply(dailyControllerAbort,group.controller,[]);}catch(error){failures.push(error);}
   if(!group.started){group.settled=true;this.#scheduleDailyGroup(group);}try{this.#finishDailyGroup(group);}catch(error){failures.push(error);}
   if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Preparation cancellation and cleanup failed.');
  }
  #beginDailyGroup(group:DailyPreparationGroupRecord):Promise<AlpacaSeasonalityDailyWindow>{
   const demand=group.demand.deref(),plan=group.plan;if(group.cancelled||!demand?.live||!plan||!group.signal||!group.frameSignal.deref()||dailyAborted(group.frameSignal.deref()!))throw Error('The native preparation frame retired.');
   return this.#dailyPrepare(demand,dailyPlanning(plan),plan,group.signal,group.target,group.frameSignal);
  }
  #finishDailyGroupRun(group:DailyPreparationGroupRecord):void{
   const failures:unknown[]=[];try{this.#scheduleDailyGroup(group);}catch(error){failures.push(error);}try{this.#finishDailyGroup(group);}catch(error){failures.push(error);}
   if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Physical preparation settlement failed.');
  }
  #subscribeDailyGroup(group:DailyPreparationGroupRecord,wake:()=>void):()=>void{
   if(group.released||group.settled)return dailyIgnoreRejection;
   if(this.#dailyWork+1024>20000000||this.#dailySlots+128>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE||this.#dailySettlementSubscribers.size>=1000)throw Error('The physical settlement observer cannot be admitted.');this.#dailyWork+=1024;this.#dailySlots+=128;
   const subscriber:DailySettlementSubscriber={provider:new WeakRef(this),group:new WeakRef(group),wake:new WeakRef(wake),live:true,active:0,released:false};this.#dailySettlementSubscribers.add(subscriber);group.subscribers.add(subscriber);return dailyWeakSettlementOff(new WeakRef(this),new WeakRef(subscriber));
  }
  #finishSettlementSubscriber(subscriber:DailySettlementSubscriber):void{
   if(subscriber.released||subscriber.live||subscriber.active)return;subscriber.released=true;subscriber.wake=null;this.#dailySettlementSubscribers.delete(subscriber);this.#dailyWork-=1024;this.#dailySlots-=128;const group=subscriber.group.deref();if(group)this.#finishDailyGroup(group);
  }
  #retireSettlementSubscriber(subscriber:DailySettlementSubscriber):void{
   if(subscriber.released)return;subscriber.live=false;subscriber.group.deref()?.subscribers.delete(subscriber);subscriber.wake=null;this.#finishSettlementSubscriber(subscriber);
  }
  #scheduleDailyGroup(group:DailyPreparationGroupRecord):void{
   if(group.notifyPending||!group.settled)return;group.notifyPending=true;queueMicrotask(dailyWeakGroupNotice(new WeakRef(this),new WeakRef(group)));
  }
  #notifyDailyGroup(group:DailyPreparationGroupRecord):void{
   if(!group.settled)return;let remaining=group.subscribers.size;
   // Each observer's existing1024W reservation prepays its one terminal loop,
   // weak dereference, retire, callback and all cleanup. Do not debit while its
   // callback is active. New subscriptions to a settled group allocate nothing.
   for(const subscriber of group.subscribers){if(remaining--<=0)break;if(!subscriber.live)continue;subscriber.active++;group.activeNotifications++;const callback=subscriber.wake?.deref();this.#retireSettlementSubscriber(subscriber);try{callback?.();}catch{/* Physical settlement never mints a result or disrupts other releases. */}finally{subscriber.active--;group.activeNotifications--;this.#finishSettlementSubscriber(subscriber);}}
   this.#finishDailyGroup(group);
  }
  #dailyServicePeriod():string{
   const now=Math.floor(this.now()/1000);if(!Number.isSafeInteger(now))throw Error('The actual provider clock is unavailable.');const clock=newYorkClock(now),year=Number(clock.date.slice(0,4));if(year<2015||year>2028)throw Error('The current NYSE calendar is not certified.');
   return String(newYorkDayStart(now))+':'+newYorkDayStart(now-(this.dataPlan==='paid'?0:ALPACA_SIP_DELAY_SECONDS));
  }
  #stopDailyClock():void{
   const timer=this.#dailyClockTimer;this.#dailyClockTimer=null;this.#dailyClockToken=null;if(timer!==null)dailyClearTimer(timer);
  }
  #ensureDailyClock():void{
   if(this.#dailyDisposed||this.disposed||!this.#dailyScopeOwners.size||this.#dailyClockToken)return;const token=Object.freeze({});this.#dailyClockToken=token;
   try{this.#dailyClockTimer=dailySetTimer(dailyWeakClock(new WeakRef(this),token),60000);}catch(error){if(this.#dailyClockToken===token)this.#dailyClockToken=null;throw error;}
  }
  #dailyClockTick(token:object):void{
   if(this.#dailyClockToken!==token||this.#dailyDisposed||this.disposed)return;this.#dailyClockToken=null;this.#dailyClockTimer=null;
   const W=32768+2048*(this.#dailyScopeOwners.size+this.#dailyDemands.size);if(this.#dailyWork+W>20000000){this.#ensureDailyClock();return;}this.#dailyWork+=W;
   try{
    let period:string;try{period=this.#dailyServicePeriod();}catch{period='unsupported';}
    let remaining=this.#dailyScopeOwners.size;for(const scope of this.#dailyScopeOwners){if(remaining--<=0)break;if(!scope.live||scope.periodKey===period)continue;scope.periodKey=period;scope.developing=null;scope.observationKind=null;scope.observationVersion++;this.#scheduleDailyWake(scope);}
   }finally{this.#dailyWork-=W;this.#ensureDailyClock();}
  }
  #dailySubscribe(record:DailyDemandRecord,wake:()=>void):()=>void{
   const scope=record.scope;if(!record.live||!scope)throw Error('Daily demand retired.');this.#assertDailyScope(scope);
   const token=Object.freeze({});record.wakeToken=token;record.wake=new WeakRef(wake);const weak=new WeakRef(record);
   return dailyWeakNoticeOff(weak,token);
  }
  #dailyPreparationCost(demand:DailyDemandRecord|null,planning:SeasonalityDailyPlanning,target?:Readonly<AlpacaSeasonalityFrontierRequest>):Readonly<AlpacaSeasonalityPreparationCost>{
   const snapshot=planning.snapshot.deref(),entry=snapshot?.entry.deref();if(!snapshot||!entry||snapshot.provider.deref()!==this||this.#dailyDisposed||this.disposed||this.entries.get(entry.key)!==entry||entry.basis!==this.adjustment||entry.dataPlan!==this.dataPlan||demand&&!this.#dailyDemandMatches(demand,planning))throw Error('The actual daily preparation source changed.');mtfSnapshotCurrent(snapshot);const scope=demand?.scope??this.#dailyScopes.get(entry);if(scope)this.#assertDailyScope(scope);const request=planning.plan,N=entry.series.bars.length,D=request.dailyRowUpperBound,F=12*(request.calendarEndYear-request.calendarStartYear+1)+Number(request.calendarStartYear>2015);
   const settings:SeasonalitySettings={startYear:request.calendarStartYear,endYear:request.calendarEndYear,excludedMonths:'',includeDevelopingInSummaries:false,meanRow:false,deviationRow:false,positiveFrequencyRow:false,projectionGeometry:false,externalNumericSlots:0},forecast=reserveSeasonality({chartBars:D,sourceRows:D,monthFrames:F,calendarDays:F*31,settings,compiler:true}),key=String(request.calendarStartYear)+':'+request.calendarEndYear,cache=this.#dailyCache.get(entry)?.get(key);
   const dailyCached=!!cache&&this.#dailyOwnerCurrent(cache)&&!!cache.cache&&cache.closedThrough>=request.closedThrough&&cache.coveredThrough<=request.requestedThrough;
   const pending=this.#dailyPending.get(entry)?.get(key),dailyPending=!!pending&&!pending.settled&&!!scope&&pending.scope===scope;
   let first:number|undefined,session:'regular'|'extended'|undefined,frontierCached=!target;
   if(target){first=mtfData(target,'firstLoadedTime');session=mtfData(target,'session');if(!Number.isSafeInteger(first)||(session!=='regular'&&session!=='extended'))throw Error('The actual frontier forecast is invalid.');const prior=scope?.frontiers.get(String(first)+':'+session);frontierCached=!!prior?.live&&!!prior.result&&prior.scope.deref()===scope;}
   const cacheSlots=dailyCached||dailyPending?0:24*F+100002+4096,buildW=dailyCached||dailyPending?0:4096+2048+3072*D+forecast.operations+131072,buildU=dailyCached||dailyPending?0:512+1024+16*D+forecast.numericSlots+4096+100000;
   const counter=seasonalityIntradayFrontierCost(30000),prefixW=frontierCached?0:counter.operations+512*N+3*SEASONALITY_FRONTIER_RESPONSE_COST.operations+65536,prefixU=frontierCached?0:counter.numericSlots+2048+3*(100000+SEASONALITY_FRONTIER_RESPONSE_COST.numericSlots);
   const W=Math.max(buildW,prefixW)+4096,U=Math.max(buildU,cacheSlots+prefixU,cacheSlots+128)+1024;
   if(!Number.isSafeInteger(N)||N<1||N>100000||!Number.isSafeInteger(W)||!Number.isSafeInteger(U))throw Error('The actual complete preparation bound is unavailable.');
   mtfSnapshotCurrent(snapshot);if(demand&&!this.#dailyDemandMatches(demand,planning))throw Error('The actual source changed during preparation forecast.');
   // The closed C owner adds its own simultaneously retained old/new native,
   // alignment, geometry and frame stacks BEFORE it starts this preparation.
   return Object.freeze({sourceRows:N,monthFrames:F,providerOperations:this.#dailyWork,providerNumericSlots:this.#dailySlots+ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE,additionalPeakOperations:W,additionalPeakNumericSlots:U,dailyCached,frontierCached});
  }
  #dailyDemandMatches(record:DailyDemandRecord,planning:SeasonalityDailyPlanning):boolean{
   try{const scope=record.scope,snapshot=planning.snapshot.deref();if(!record.live||!scope||!planning.live||!snapshot||snapshot.provider.deref()!==this||snapshot.entry.deref()!==scope.entry.deref()||planning.plan.calendarStartYear!==record.startYear||planning.plan.calendarEndYear!==record.endYear)return false;this.#assertDailyScope(scope);mtfSnapshotCurrent(snapshot);return true;}catch{return false;}
  }
  #scheduleDailyWake(scope:DailyScope):void{
   if(!scope.live||scope.wakePending)return;scope.wakePending=true;const provider=new WeakRef(this),owner=new WeakRef(scope);
   queueMicrotask(dailyWeakWake(provider,owner));
  }
  #notifyDailyWake(scope:DailyScope):void{
   if(!scope.live)return;const W=1024*scope.demands.size+2048;if(this.#dailyWork+W>20000000)return;this.#dailyWork+=W;
   try{this.#assertDailyScope(scope);let remaining=scope.demands.size;for(const demand of scope.demands){if(!scope.live||remaining--<=0)break;if(demand.live&&demand.scope===scope){const callback=demand.wake?.deref();try{callback?.();}catch{/* A notice cannot disrupt the actual producer. */}}}}
   catch{/* Changed source cannot notify as a current owner. */}finally{this.#dailyWork-=W;}
  }
  #observeDailyDeveloping(entry:Entry,event:Extract<AlpacaEvent,{kind:'batch'}>):void{
   const scope=this.#dailyScopes.get(entry);if(!scope?.live)return;
   const count=event.bars.length+event.trades.length,W=1024*count+8192;
   if(!Number.isSafeInteger(W)||this.#dailyWork+W>20000000){scope.developing=null;scope.observationKind=null;scope.observationVersion++;this.#scheduleDailyWake(scope);return;}
   this.#dailyWork+=W;
   try{
    this.#assertDailyScope(scope);const now=Math.floor(this.now()/1000),clock=newYorkClock(now),year=Number(clock.date.slice(0,4));this.#assertDailyScope(scope);
    if(year<2015||year>2028)return;
    let changed=false;
    const accept=(time:number,close:number,kind:'daily'|'minute'|'trade')=>{
     if(!Number.isSafeInteger(time)||time>now||!Number.isFinite(close)||close<=0)return;
     const date=newYorkClock(time).date;if(date!==clock.date)return;const day=usSessionDay(date);if(day.weekend||day.holiday)return;
     // Daily aggregate messages have no actual last-trade cutoff. They may
     // initialize an observation, never overwrite a genuine timed minute/trade.
     const opening=newYorkWallTime(date,0);
     if(kind==='daily'&&scope.developing?.time===opening&&(scope.observationKind==='minute'||scope.observationKind==='trade'))return;
     if(scope.observationKind!=='daily'&&time<scope.observedAt||time===scope.observedAt&&kind==='minute'&&scope.observationKind==='trade')return;
     if(scope.developing?.time===opening&&scope.observedAt===time&&Object.is(scope.developing.close,close)&&scope.observationKind===kind)return;
     scope.developing=Object.freeze({time:opening,close,availableAt:time,finalized:false});scope.observedAt=time;scope.observationKind=kind;scope.observationVersion++;changed=true;
    };
    for(const row of event.bars){if(row.symbol!==entry.symbol)continue;if(row.kind==='daily'){if(newYorkClock(row.time).date===clock.date)accept(now,row.close,'daily');}else if(row.seconds===60)accept(row.time+60,row.close,'minute');}
    for(const row of event.trades)if(row.symbol===entry.symbol)accept(row.time,row.price,'trade');
    this.#assertDailyScope(scope);if(changed)this.#scheduleDailyWake(scope);
   }catch{if(scope.live){scope.developing=null;scope.observationKind=null;scope.observationVersion++;this.#scheduleDailyWake(scope);}}
   finally{if(!scope.live)scope.developing=null;this.#dailyWork-=W;}
  }
  #dailyAcquire(planning:SeasonalityDailyPlanning,signal:AbortSignal):AlpacaSeasonalityDailyDemand{
   const snapshot=planning.snapshot.deref(),entry=snapshot?.entry.deref();if(this.#dailyDisposed||this.disposed||!planning.live||!snapshot||!entry||dailyAborted(signal))throw Error('No actual daily source demand.');mtfSnapshotCurrent(snapshot);
   if(snapshot.provider.deref()!==this)throw Error('Foreign daily provider.');
   let scope=this.#dailyScopes.get(entry);
   if(scope)try{this.#assertDailyScope(scope);}catch{this.#closeDailyScope(scope);scope=undefined;}
   const extra=scope?512:1024,W=scope?1024:2048;if(this.#dailyWork+W>20000000||this.#dailySlots+extra>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE||this.#dailyDemands.size>=1000)throw Error('Daily demand metadata exceeds the current budget.');
   // Admit fixed scope+client ownership before containers/controllers/listeners.
   this.#dailyWork+=W;this.#dailySlots+=extra;
   if(!scope){scope={entry:new WeakRef(entry),series:new WeakRef(entry.series),epoch:entry.epoch,basis:entry.basis,plan:entry.dataPlan,hybrid:entry.hybrid,controller:new DailyNativeAbort(),signal:null as unknown as AbortSignal,live:true,demands:new Set(),developing:null,observedAt:-Infinity,observationKind:null,observationVersion:0,wakePending:false,periodKey:'',frontiers:new Map()};scope.signal=Reflect.apply(dailyControllerSignal,scope.controller,[]) as AbortSignal;this.#dailyScopes.set(entry,scope);this.#dailyScopeOwners.add(scope);}
   const key=Object.freeze({}) as AlpacaSeasonalityDailyDemand,record:DailyDemandRecord={provider:new WeakRef(this),scope,key,startYear:planning.plan.calendarStartYear,endYear:planning.plan.calendarEndYear,live:true,off:null,leases:new Set(),wake:null,wakeToken:null};dailyDemands.set(key,record);this.#dailyDemands.add(record);scope.demands.add(record);
   let failed=false,failure:unknown;
   try{const abort=dailyWeakAbort(new WeakRef(this),new WeakRef(key),'demand');record.off=dailyWeakAbortOff(new WeakRef(signal),abort);Reflect.apply(dailyAbortAdd,signal,['abort',abort,{once:true}]);this.#assertDailyScope(scope);if(!scope.periodKey)scope.periodKey=this.#dailyServicePeriod();this.#assertDailyScope(scope);this.#ensureDailyClock();if(dailyAborted(signal))throw Error('Daily demand retired during acquisition.');return key;}
   catch(error){failed=true;failure=error;throw error;}
   finally{if(failed)try{this.#dailyReleaseDemand(record);}catch(cleanup){throw new AggregateError([failure,cleanup],'Daily demand acquisition and cleanup failed.');}}
  }
  #finishDailyWindow(window:DailyWindowRecord):void{
   if(!window.retired||window.active||window.unwindPending)return;const owner=window.owner,frontier=window.frontier;window.frontier=null;if(frontier){frontier.clients--;this.#finishDailyFrontier(frontier);}window.owner=null;window.demand=null;window.geometry=null;window.result=null;if(window.alignment)window.alignment=null;if(owner){owner.leases.delete(window);owner.clients--;}
   this.#dailyWork-=window.work;this.#dailySlots-=window.slots;window.work=0;window.slots=0;if(owner)this.#finishDailyOwner(owner);
  }
  #dailyReleaseWindow(window:DailyWindowRecord):void{
   if(window.retired){this.#finishDailyWindow(window);return;}window.live=false;window.retired=true;const demand=window.demand,off=window.off;window.off=null;window.demand=null;demand?.leases.delete(window);
   try{off?.();}finally{this.#finishDailyWindow(window);}
  }
  #unwindDailyWindow(window:DailyWindowRecord):void{
   if(!window.unwindPending||window.active)return;window.unwindPending=false;const W=window.computeWork;window.computeWork=0;window.work-=W;this.#dailyWork-=W;this.#finishDailyWindow(window);
  }
  #dailyReleaseDemand(record:DailyDemandRecord):void{
   if(!record.live)return;record.live=false;const scope=record.scope,off=record.off;record.scope=null;record.off=null;record.wake=null;record.wakeToken=null;this.#dailyDemands.delete(record);scope?.demands.delete(record);
   const failures:unknown[]=[];for(const lease of [...record.leases])try{this.#dailyReleaseWindow(lease);}catch(error){failures.push(error);}record.leases.clear();try{off?.();}catch(error){failures.push(error);}
   // Client metadata retires before its debit; scope metadata is separate.
   this.#dailyWork-=1024;this.#dailySlots-=512;
   if(scope){if(!scope.demands.size)try{this.#closeDailyScope(scope);}catch(error){failures.push(error);}else{const remaining=[...scope.demands].some(value=>value.live&&value.startYear===record.startYear&&value.endYear===record.endYear);if(!remaining)for(const owner of [...this.#dailyOwners])if(owner.scope.deref()===scope&&owner.startYear===record.startYear&&owner.endYear===record.endYear)try{this.#retireDailyOwner(owner);}catch(error){failures.push(error);}}}
   if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily demand cleanup failed.');
  }
  #closeDailyScope(scope:DailyScope):void{
   if(!scope.live)return;scope.live=false;scope.developing=null;scope.observationKind=null;scope.observationVersion++;scope.wakePending=false;this.#dailyScopeOwners.delete(scope);const entry=scope.entry.deref();if(entry&&this.#dailyScopes.get(entry)===scope)this.#dailyScopes.delete(entry);
   const failures:unknown[]=[];if(!this.#dailyScopeOwners.size)try{this.#stopDailyClock();}catch(error){failures.push(error);}for(const demand of [...scope.demands])try{this.#dailyReleaseDemand(demand);}catch(error){failures.push(error);}scope.demands.clear();
   for(const owner of [...scope.frontiers.values()])try{this.#retireDailyFrontier(owner);}catch(error){failures.push(error);}scope.frontiers.clear();
   // Abort only the last actual source scope. IPC remains funded until settle.
   try{Reflect.apply(dailyControllerAbort,scope.controller,[]);}catch(error){failures.push(error);}
   for(const owner of [...this.#dailyOwners])if(owner.scope.deref()===scope)try{this.#retireDailyOwner(owner);}catch(error){failures.push(error);}
   this.#dailyWork-=1024;this.#dailySlots-=512;
   if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily source scope cleanup failed.');
  }
  #dailyCurrentWindow(window:DailyWindowRecord):void{
   const demand=window.demand,owner=window.owner,plan=window.planning.deref();
   if(!window.live||!demand?.live||!demand.scope||!owner||!plan||!this.#dailyOwnerCurrent(owner)||!owner.cache||owner.scope.deref()!==demand.scope)throw Error('The actual daily-history lease retired.');this.#assertDailyScope(demand.scope);const planning=dailyPlanning(plan),snapshot=planning.snapshot.deref();
   if(window.frontier&&(!window.frontier.live||!window.frontier.result||window.frontier.scope.deref()!==demand.scope))throw Error('The actual first-loaded frontier retired.');
   if(window.observationVersion!==demand.scope.observationVersion||snapshot?.provider.deref()!==this||snapshot.entry.deref()!==demand.scope.entry.deref()||planning.plan.calendarStartYear!==demand.startYear||planning.plan.calendarEndYear!==demand.endYear)throw Error('The native-frame daily source changed.');
  }
  #finishDailyFrontier(owner:DailyFrontierOwner):void{
   if(owner.live||owner.working||owner.clients)return;
   owner.result=null;owner.pending=null;this.#dailyFrontierOwners.delete(owner);this.#dailyWork-=owner.work;this.#dailySlots-=owner.slots;owner.work=0;owner.slots=0;
  }
  #retireDailyFrontier(owner:DailyFrontierOwner):void{
   owner.live=false;const scope=owner.scope.deref();if(scope?.frontiers.get(owner.key)===owner)scope.frontiers.delete(owner.key);this.#finishDailyFrontier(owner);
  }
  #dailyFrontierCurrent(owner:DailyFrontierOwner):DailyScope{
   const scope=owner.scope.deref();if(!owner.live||!scope||scope.frontiers.get(owner.key)!==owner)throw Error('The actual time-only frontier retired.');this.#assertDailyScope(scope);return scope;
  }
  #dailyFrontierFacts(scope:DailyScope,firstLoadedTime:number,session:'regular'|'extended'):DailyFrontierFacts{
   const entry=this.#assertDailyScope(scope),resolution=entry.resolution,plan=entry.plan,count=entry.series.bars.length,feed=this.historyFeed(entry),timeframe=entry.timeframe;
   if(!Number.isSafeInteger(firstLoadedTime)||!Number.isSafeInteger(count)||count<1||count>100000||plan.calendar||plan.nominalSeconds>=86400||![60,300,900].includes(plan.backfillSeconds)||timeframe!=='1Min'&&timeframe!=='5Min'&&timeframe!=='15Min')throw Error('The actual intraday frontier shape is unsupported.');
   const date=newYorkClock(firstLoadedTime).date,requestFrom=newYorkWallTime(date.slice(0,7)+'-01',0),coverage=mtfCoverage.get(entry);
   // A hybrid actual chart cannot borrow a same-symbol feed as a coherent
   // prefix. The target must be inside this actual observed SIP prefix; an
   // all-IEX entry requests its own IEX window instead.
   if(entry.dataPlan==='free'&&entry.hybrid&&(!coverage||!Number.isSafeInteger(coverage.sipThrough)||firstLoadedTime+plan.backfillSeconds>coverage.sipThrough!))throw Error('The chart has no coherent same-feed oldest-month frontier.');
   if(firstLoadedTime<requestFrom||firstLoadedTime-requestFrom>32*86400)throw Error('The actual first-loaded month is outside the supported frontier.');
   return{symbol:entry.symbol,resolution,timeframe,feed,adjustment:entry.basis,plan:entry.dataPlan,count,requestFrom,requestThrough:firstLoadedTime,session};
  }
  #verifyDailyFrontierFirst(scope:DailyScope,expected:number,session:'regular'|'extended',count:number):void{
   const entry=this.#assertDailyScope(scope),rows=entry.series.bars;if(rows.length!==count)throw Error('The actual first-loaded source changed.');let first:number|null=null,previous=-Infinity;
   for(let index=0;index<count;index++){
    const row=mtfData(rows,String(index)),time=mtfData(row,'time');if(!Number.isSafeInteger(time)||time<=previous)throw Error('The actual intraday source times changed.');previous=time;
    if(first===null&&(session==='extended'||usSessionPhase(time)==='regular'))first=time;
   }
   this.#assertDailyScope(scope);if(entry.series.bars!==rows||rows.length!==count||first!==expected)throw Error('The requested first-loaded bar is not this actual selected source.');
  }
  #dailyFrontierTicket(scope:DailyScope,target:Readonly<AlpacaSeasonalityFrontierRequest>):DailyFrontierOwner{
   const W=32768,U=1024;if(this.#dailyWork+W>20000000||this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The fixed frontier preparation cannot be admitted.');this.#dailyWork+=W;this.#dailySlots+=U;
   try{return this.#dailyFrontierTicketOwned(scope,target);}finally{this.#dailyWork-=W;this.#dailySlots-=U;}
  }
  #dailyFrontierTicketOwned(scope:DailyScope,target:Readonly<AlpacaSeasonalityFrontierRequest>):DailyFrontierOwner{
   this.#assertDailyScope(scope);const firstLoadedTime=mtfData(target,'firstLoadedTime'),session=mtfData(target,'session');
   if(!Number.isSafeInteger(firstLoadedTime)||(session!=='regular'&&session!=='extended'))throw Error('The actual frontier request is invalid.');
   const key=String(firstLoadedTime)+':'+session,prior=scope.frontiers.get(key);if(prior){this.#dailyFrontierCurrent(prior);return prior;}
   const facts=this.#dailyFrontierFacts(scope,firstLoadedTime,session),forecast=seasonalityIntradayFrontierCost(30000),W=forecast.operations+512*facts.count+3*SEASONALITY_FRONTIER_RESPONSE_COST.operations+32768,U=forecast.numericSlots+1024;
   // Full worst first time pass/counter admission. Each of up to3 ACTUAL raw
   // responses is additionally charged100000 BEFORE its request. Previously
   // received pages stay live+charged through final counter/unwind.
   if(this.#dailyWork+W>20000000||this.#dailySlots+U+300000+3*SEASONALITY_FRONTIER_RESPONSE_COST.numericSlots>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE||this.#dailyFrontierOwners.size>=1000)throw Error('The full oldest-month prefix cannot be admitted.');this.#dailyWork+=W;this.#dailySlots+=U;
   const owner:DailyFrontierOwner={scope:new WeakRef(scope),key,firstLoadedTime,session,result:null,live:true,working:true,clients:0,work:W,slots:U,pending:null};this.#dailyFrontierOwners.add(owner);
   // Register BEFORE source-row/bridge access. At most4 completed/pending
   // frontiers per actual source scope. Old leases keep their own128 slots.
   if(scope.frontiers.size>=4){const oldest=scope.frontiers.values().next().value as DailyFrontierOwner|undefined;if(oldest)this.#retireDailyFrontier(oldest);}scope.frontiers.set(key,owner);
   let resolve!:()=>void,reject!:(error:unknown)=>void;const done=new Promise<void>((a,b)=>{resolve=a;reject=b;});owner.pending=done;void done.catch(dailyIgnoreRejection);
   // The ONE prepaid512N check runs while this funded owner and its actual
   // deferred promise are registered, before loader/IPC. Reentrant joins can
   // await the same promise; an eager failure cannot erase its own cause by
   // clearing owner.pending before the caller gets back from this function.
   try{this.#verifyDailyFrontierFirst(scope,firstLoadedTime,session,facts.count);}
   catch(error){owner.working=false;let failure=error;try{this.#retireDailyFrontier(owner);}catch(cleanup){failure=new AggregateError([error,cleanup],'First-loaded source validation and frontier cleanup failed.');}reject(failure);throw failure;}
   void dailyLoadFrontier({provider:new WeakRef(this),owner,facts}).then(resolve,reject);return owner;
  }
  #checkDailyFrontier(load:DailyFrontierLoad):void{
   if(load.provider.deref()!==this)throw Error('The actual frontier provider changed.');this.#dailyFrontierCurrent(load.owner);
  }
  #reserveDailyFrontierPage(load:DailyFrontierLoad):void{
   this.#checkDailyFrontier(load);if(this.#dailySlots+100000>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The actual frontier response cannot be admitted.');this.#dailySlots+=100000;load.owner.slots+=100000;
  }
  #requestDailyFrontierPage(load:DailyFrontierLoad,sent:Parameters<DailyServiceOperations['requestFrontierPage']>[1]):Promise<LiveBridgeResult<AlpacaBarsValue>>{
   this.#checkDailyFrontier(load);const fetch=this.bridge.fetchAlpacaBars;this.#checkDailyFrontier(load);return Reflect.apply(fetch,this.bridge,[{requestId:this.requestId(),...sent,...(load.facts.plan==='paid'?{plan:'paid' as const}:{})}]);
  }
  #reserveDailyFrontierInspection(load:DailyFrontierLoad):void{
   this.#checkDailyFrontier(load);const U=SEASONALITY_FRONTIER_RESPONSE_COST.numericSlots;if(this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The fixed frontier response inspection cannot be admitted.');this.#dailySlots+=U;load.owner.slots+=U;
  }
  #finishDailyFrontierLoad(load:DailyFrontierLoad,failed:boolean):void{
   const owner=load.owner;owner.working=false;owner.pending=null;if(failed){this.#retireDailyFrontier(owner);return;}
   this.#dailyWork-=owner.work;this.#dailySlots-=owner.slots-128;owner.work=0;owner.slots=128;this.#finishDailyFrontier(owner);
  }
  #dailyTicketSettled(map:Map<string,DailyPendingTicket>,key:string,ticket:DailyPendingTicket):void{if(ticket.settled)return;ticket.settled=true;if(map.get(key)===ticket)map.delete(key);this.#dailyWork-=2048;this.#dailySlots-=1024;}
  #dailyTicket(demand:DailyDemandRecord,planning:SeasonalityDailyPlanning){
   const scope=demand.scope;if(!demand.live||!scope)throw Error('Daily demand retired.');const entry=this.#assertDailyScope(scope),snapshot=planning.snapshot.deref();
   if(!planning.live||!snapshot||snapshot.entry.deref()!==entry||snapshot.provider.deref()!==this||planning.plan.calendarStartYear!==demand.startYear||planning.plan.calendarEndYear!==demand.endYear)throw Error('Foreign or changed actual daily source.');mtfSnapshotCurrent(snapshot);
   const cacheKey=String(demand.startYear)+':'+demand.endYear;let pending=this.#dailyPending.get(entry);if(!pending){pending=new Map();this.#dailyPending.set(entry,pending);}let ticket=pending.get(cacheKey);
   if(!ticket){
    // A deferred owned completion is registered BEFORE the real bridge can
    // reenter. Nested B joins this actual ticket; no duplicate history request.
    if(this.#dailyWork+2048>20000000||this.#dailySlots+1024>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The pending daily ticket cannot be admitted.');this.#dailyWork+=2048;this.#dailySlots+=1024;
    let resolve!:(owner:DailyMonthOwner)=>void,reject!:(error:unknown)=>void;const done=new Promise<DailyMonthOwner>((a,b)=>{resolve=a;reject=b;});ticket={done,scope,settled:false};pending.set(cacheKey,ticket);const owned=ticket;
    void done.catch(dailyIgnoreRejection);const callbacks=dailyTicketCallbacks(new WeakRef(this),pending,cacheKey,owned,resolve,reject);
    try{void this.#loadSeasonalityDailyMonths(planning,scope.signal,scope).then(callbacks.fulfilled,callbacks.rejected);}catch(error){callbacks.rejected(error);}
   }else if(ticket.scope!==scope)throw Error('A prior daily source request is still settling.');
   return{scope,ticket};
  }
  #dailyPrepare(demand:DailyDemandRecord,planning:SeasonalityDailyPlanning,key:AlpacaSeasonalityDailyPlan,signal:AbortSignal,target?:Readonly<AlpacaSeasonalityFrontierRequest>,frameSignal?:WeakRef<AbortSignal>):Promise<AlpacaSeasonalityDailyWindow>{
   if(dailyAborted(signal))return Promise.reject(Error('The frame retired before daily preparation.'));
   try{const {scope,ticket}=this.#dailyTicket(demand,planning);return dailyPrepareWindow({provider:new WeakRef(this),demand:new WeakRef(demand),scope:new WeakRef(scope),history:ticket.done,key,signal,target,frameSignal});}catch(error){return Promise.reject(error);}
  }
  #checkDailyPreparation(run:DailyPreparationRun,owner:DailyMonthOwner):{demand:DailyDemandRecord;scope:DailyScope}{
   const demand=run.demand.deref(),scope=run.scope.deref();if(run.provider.deref()!==this||!demand?.live||!scope||demand.scope!==scope||dailyAborted(run.signal)||!this.#dailyOwnerCurrent(owner))throw Error('The source/frame retired while history was pending.');
   this.#assertDailyScope(scope);dailyPlanning(run.key);return{demand,scope};
  }
  #preparationDailyFrontier(run:DailyPreparationRun,owner:DailyMonthOwner):DailyFrontierOwner|null{
   const {scope}=this.#checkDailyPreparation(run,owner);return run.target?this.#dailyFrontierTicket(scope,run.target):null;
  }
  #captureDailyWindow(run:DailyPreparationRun,owner:DailyMonthOwner,frontier:DailyFrontierOwner|null):AlpacaSeasonalityDailyWindow{
   const {demand,scope}=this.#checkDailyPreparation(run,owner),signal=run.signal,key=run.key,frameSignal=run.frameSignal;
   if(frontier){this.#dailyFrontierCurrent(frontier);if(!frontier.result)throw Error('The actual oldest-month prefix is incomplete.');}
   if(this.#dailyWork+1024>20000000||this.#dailySlots+512>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The daily history view cannot be admitted.');this.#dailyWork+=1024;this.#dailySlots+=512;
   const token=Object.freeze({}) as AlpacaSeasonalityDailyWindow,window:DailyWindowRecord={provider:new WeakRef(this),demand,owner,planning:new WeakRef(key),key:token,live:true,retired:false,active:0,consumed:false,unwindPending:false,computeWork:0,completedComputeWork:0,frontier,geometry:frontier?.result?Object.freeze({firstObservedTime:frontier.result.firstObservedTime,firstLoadedTime:frontier.result.firstLoadedTime,prefixBars:frontier.result.prefixBars,session:frontier.session}):null,observationVersion:scope.observationVersion,off:null,result:null,work:1024,slots:512};dailyWindows.set(token,window);if(window.geometry)dailyGeometryFacts.set(window.geometry,new WeakRef(token));demand.leases.add(window);owner.leases.add(window);owner.clients++;if(frontier)frontier.clients++;
   let failed=false,failure:unknown;
   try{const abort=dailyWeakAbort(new WeakRef(this),new WeakRef(token),'window'),off=dailyWeakAbortOff(new WeakRef(signal),abort);window.off=off;Reflect.apply(dailyAbortAdd,signal,['abort',abort,{once:true}]);if(frameSignal){const external=frameSignal.deref();if(!external||dailyAborted(external))throw Error('The original native frame retired.');const externalOff=dailyWeakAbortOff(frameSignal,abort);window.off=dailyTwoOff(off,externalOff);Reflect.apply(dailyAbortAdd,external,['abort',abort,{once:true}]);}if(dailyAborted(signal))throw Error('The frame retired during history view capture.');this.#dailyCurrentWindow(window);return token;}
   catch(error){failed=true;failure=error;throw error;}finally{if(failed)try{this.#dailyReleaseWindow(window);}catch(cleanup){throw new AggregateError([failure,cleanup],'Daily view capture and cleanup failed.');}}
  }
  #dailyConsume(window:DailyWindowRecord,grid:Readonly<SeasonalityLiveGrid>,choices:AlpacaSeasonalityChoices):Readonly<SeasonalityResult>{
   this.#dailyCurrentWindow(window);if(window.consumed)throw Error('The actual daily window is single-consumption.');
   const owner=window.owner!,plan=window.planning.deref()!,planning=dailyPlanning(plan);owner.active++;window.active++;window.consumed=true;window.unwindPending=true;
   let failed=false,failure:unknown;
   try{
    const names=['startYear','endYear','excludedMonths','includeDevelopingInSummaries','meanRow','deviationRow','positiveFrequencyRow','projectionGeometry'] as const,values=names.map(name=>mtfData(choices,name)),settings=Object.fromEntries(names.map((name,index)=>[name,values[index]])) as Omit<SeasonalitySettings,'externalNumericSlots'>;
    this.#dailyCurrentWindow(window);
    if(settings.startYear!==planning.plan.requestedStartYear||settings.endYear!==planning.plan.requestedEndYear||settings.startYear<1900||settings.endYear>2028)throw Error('The saved requested years have no currently certified complete calendar.');
    // Native indexOffset0 and sparse future geometry remain the closed C
    // consumer's separate proof. This window authenticates ONLY its own actual
    // provider time-prefix; copied first-time metadata cannot substitute it.
    if(settings.projectionGeometry&&!window.frontier?.result)throw Error('The actual oldest-month source frontier is unavailable.');
    const times=mtfData(grid,'times'),first=mtfData(grid,'firstObservedTime'),M=times&&typeof times==='object'?Object.getOwnPropertyDescriptor(times,'length')?.value:null;
    if(!Array.isArray(times)||Object.getPrototypeOf(times)!==Array.prototype||!Number.isSafeInteger(M)||M<1||M>100000||!Number.isSafeInteger(first))throw Error('The actual chart alignment grid is unavailable.');
    if(settings.projectionGeometry&&(window.frontier!.result!.firstObservedTime!==first||mtfData(times,'0')!==window.frontier!.result!.firstLoadedTime))throw Error('The actual frontier does not match this loaded chart grid.');
    const cache=owner.cache!,F=cache.months.length,model=reserveSeasonality({chartBars:0,sourceRows:0,monthFrames:F,calendarDays:0,settings:{...settings,externalNumericSlots:0},compiler:false}),W=256*M+2048*F+model.operations+65536,U=32*F+model.numericSlots+1024;
    if(this.#dailyWork+W>20000000||this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The current daily-to-intraday result cannot be admitted.');
    this.#dailyWork+=W;this.#dailySlots+=U;window.work+=W;window.computeWork+=W;window.completedComputeWork=W;window.slots+=U;this.#dailyCurrentWindow(window);
    // Calendar storage already belongs to the retained cache. The pure model
    // adds that same100002 itself, so exclude it from external slots exactly
    // once; this does NOT release or lend the actual retained cache charge.
    const external=this.#dailySlots-U-cache.calendarCacheSlots;
    const observation=window.demand!.scope!.developing,developing=observation&&observation.availableAt<=planning.informationTime&&newYorkClock(observation.time).date===newYorkClock(planning.informationTime).date?observation:null;
    const result=calculateLiveSeasonality(cache,developing,{times:times as number[],firstObservedTime:first as number},{...settings,externalNumericSlots:external},planning.informationTime,(owner.feed==='sip'?'Provider-published New York daily prices from coherent all-exchange SIP history. ':'Provider-published New York daily prices from coherent IEX-only history. ')+(this.#dailySynthetic(owner)?'SYNTHETIC invented prices. ':'')+'Full New York day observation; not RTH relabeling or exchange finality. '+(developing?(owner.plan==='paid'?'Current developing price is a separately observed SIP stream close.':'Current developing price is a separately observed IEX stream close, not a consolidated SIP close.'):'No separately observed current-day developing price is available yet.'));
    this.#dailyCurrentWindow(window);window.result=result;dailyConsumedResults.set(result,{window:new WeakRef(window.key),grid:new WeakRef(grid)});return result;
   }catch(error){failed=true;failure=error;throw error;}
   finally{
    owner.active--;window.active--;const failures:unknown[]=[];
    if(failed)try{this.#dailyReleaseWindow(window);}catch(error){failures.push(error);}
    try{queueMicrotask(dailyWindowUnwind(new WeakRef(this),new WeakRef(window)));}catch(error){failures.push(error);}
    try{this.#finishDailyWindow(window);}catch(error){failures.push(error);}try{this.#finishDailyOwner(owner);}catch(error){failures.push(error);}
    if(failures.length)throw new AggregateError(failed?[failure,...failures]:failures,'Daily consumption and cleanup failed.');
   }
  }

  #dailyConsumeOwned(window:DailyWindowRecord,grid:Readonly<SeasonalityLiveGrid>,choices:AlpacaSeasonalityChoices):Readonly<SeasonalityResult>{
   this.#dailyCurrentWindow(window);if(window.consumed)throw Error('The actual daily window is single-consumption.');
   const owner=window.owner!,plan=window.planning.deref()!,planning=dailyPlanning(plan);owner.active++;window.active++;window.consumed=true;window.unwindPending=true;
   let failed=false,failure:unknown;
   try{
    const names=['startYear','endYear','excludedMonths','includeDevelopingInSummaries','meanRow','deviationRow','positiveFrequencyRow','projectionGeometry'] as const,values=names.map(name=>mtfData(choices,name)),settings=Object.fromEntries(names.map((name,index)=>[name,values[index]])) as Omit<SeasonalitySettings,'externalNumericSlots'>;
    this.#dailyCurrentWindow(window);
    if(settings.startYear!==planning.plan.requestedStartYear||settings.endYear!==planning.plan.requestedEndYear||settings.startYear<1900||settings.endYear>2028)throw Error('The saved requested years have no currently certified complete calendar.');
    // Native indexOffset0 and sparse future geometry remain the closed C
    // consumer's separate proof. This window authenticates ONLY its own actual
    // provider time-prefix; copied first-time metadata cannot substitute it.
    if(settings.projectionGeometry&&!window.frontier?.result)throw Error('The actual oldest-month source frontier is unavailable.');
    const times=mtfData(grid,'times'),first=mtfData(grid,'firstObservedTime'),M=times&&typeof times==='object'?Object.getOwnPropertyDescriptor(times,'length')?.value:null;
    if(!Array.isArray(times)||Object.getPrototypeOf(times)!==Array.prototype||!Number.isSafeInteger(M)||M<1||M>100000||!Number.isSafeInteger(first))throw Error('The actual chart alignment grid is unavailable.');
    if(settings.projectionGeometry&&(window.frontier!.result!.firstObservedTime!==first||mtfData(times,'0')!==window.frontier!.result!.firstLoadedTime))throw Error('The actual frontier does not match this loaded chart grid.');
    const cache=owner.cache!,F=cache.months.length,model=reserveSeasonality({chartBars:0,sourceRows:0,monthFrames:F,calendarDays:0,settings:{...settings,externalNumericSlots:0},compiler:false}),bins=ownedLiveAlignmentCost(F),W=256*M+2048*F+model.operations+65536+bins.operations,U=32*F+model.numericSlots+1024+bins.numericSlots;
    if(this.#dailyWork+W>20000000||this.#dailySlots+U>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The current daily-to-intraday result cannot be admitted.');
    this.#dailyWork+=W;this.#dailySlots+=U;window.work+=W;window.computeWork+=W-bins.operations;window.completedComputeWork=W;window.slots+=U;this.#dailyCurrentWindow(window);
    // Calendar storage already belongs to the retained cache. The pure model
    // adds that same100002 itself, so exclude it from external slots exactly
    // once; this does NOT release or lend the actual retained cache charge.
    const external=this.#dailySlots-U-cache.calendarCacheSlots;
    const observation=window.demand!.scope!.developing,developing=observation&&observation.availableAt<=planning.informationTime&&newYorkClock(observation.time).date===newYorkClock(planning.informationTime).date?observation:null;
    const materialized=calculateOwnedLiveSeasonality(cache,developing,{times:times as number[],firstObservedTime:first as number},{...settings,externalNumericSlots:external},planning.informationTime,(owner.feed==='sip'?'Provider-published New York daily prices from coherent all-exchange SIP history. ':'Provider-published New York daily prices from coherent IEX-only history. ')+(this.#dailySynthetic(owner)?'SYNTHETIC invented prices. ':'')+'Full New York day observation; not RTH relabeling or exchange finality. '+(developing?(owner.plan==='paid'?'Current developing price is a separately observed SIP stream close.':'Current developing price is a separately observed IEX stream close, not a consolidated SIP close.'):'No separately observed current-day developing price is available yet.'));
    const result=materialized.result;this.#dailyCurrentWindow(window);window.alignment=materialized.alignment;window.result=result;dailyConsumedResults.set(result,{window:new WeakRef(window.key),grid:new WeakRef(grid)});return result;
   }catch(error){failed=true;failure=error;throw error;}
   finally{
    owner.active--;window.active--;const failures:unknown[]=[];
    if(failed)try{this.#dailyReleaseWindow(window);}catch(error){failures.push(error);}
    try{queueMicrotask(dailyWindowUnwind(new WeakRef(this),new WeakRef(window)));}catch(error){failures.push(error);}
    try{this.#finishDailyWindow(window);}catch(error){failures.push(error);}try{this.#finishDailyOwner(owner);}catch(error){failures.push(error);}
    if(failures.length)throw new AggregateError(failed?[failure,...failures]:failures,'Daily consumption and cleanup failed.');
   }
  }

  #dailySynthetic(owner:DailyMonthOwner):boolean{return owner.entry.deref()?.cacheProvider===ALPACA_STUB_PROVIDER_ID;}
  #dailyOwnerCurrent(owner:DailyMonthOwner):boolean{
   const entry=owner.entry.deref(),series=owner.series.deref(),scope=owner.scope.deref();return owner.live&&!!scope&&scope.live&&!!entry&&this.#dailyScopes.get(entry)===scope&&!this.#dailyDisposed&&!this.disposed&&!!entry&&!!series&&this.entries.get(entry.key)===entry&&entry.series===series&&entry.strongRefs>0&&!entry.fromCache&&entry.backfilled&&!entry.historyFailed&&entry.epoch===owner.epoch&&entry.basis===owner.basis&&entry.dataPlan===owner.plan&&entry.hybrid===owner.hybrid&&(entry.dataPlan==='paid'||entry.hybrid?'sip':'iex')===owner.feed&&this.adjustment===owner.basis&&this.dataPlan===owner.plan;
  }
  #finishDailyOwner(owner:DailyMonthOwner):void{
   if(owner.working||owner.active||owner.live||owner.clients>0)return;
   owner.cache=null;owner.off=null;this.#dailyOwners.delete(owner);this.#dailyWork-=owner.work;this.#dailySlots-=owner.slots;owner.work=0;owner.slots=0;
  }
  #retireDailyOwner(owner:DailyMonthOwner):void{
   if(!owner.live){this.#finishDailyOwner(owner);return;}owner.live=false;
   const entry=owner.entry.deref(),key=String(owner.startYear)+':'+owner.endYear,map=entry&&this.#dailyCache.get(entry);
   if(map?.get(key)===owner)map.delete(key);
   const off=owner.off;owner.off=null;try{off?.();}finally{this.#finishDailyOwner(owner);}
  }
  #retireEntryDaily(entry:Entry):void{
   const failures:unknown[]=[];const scope=this.#dailyScopes.get(entry);if(scope)try{this.#closeDailyScope(scope);}catch(error){failures.push(error);}for(const owner of [...this.#dailyOwners])if(owner.entry.deref()===entry)try{this.#retireDailyOwner(owner);}catch(error){failures.push(error);}
   if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily history retirement failed.');
  }
  /** Private source build. Its native AbortSignal belongs to a STABLE C model
   * semantic demand, not a bar/frame job: ticks must not restart this request.
   * No D rows escape. Actual M native acceptance remains independently required.
   * Consumer/refcount/refresh and all owner lifecycle wiring must close before
   * this method is exposed to the actual C host or accepted as a full feature. */
  // These synchronous fact/commit scopes deliberately keep actual Entry and
  // MtfSnapshot objects OUT of the async request environment. Retained transport
  // state has weak original/series references + fixed primitives only.
  #dailyBuildFacts(planning:SeasonalityDailyPlanning,scope:DailyScope){
   const snapshot=planning.snapshot.deref(),entry=snapshot?.entry.deref();if(!snapshot||!entry||!planning.live||snapshot.provider.deref()!==this||scope.entry.deref()!==entry)throw Error('The actual daily-history origin retired.');mtfSnapshotCurrent(snapshot);this.#assertDailyScope(scope);
   const key=String(planning.plan.calendarStartYear)+':'+planning.plan.calendarEndYear;
   return{entry:new WeakRef(entry),series:new WeakRef(entry.series),epoch:entry.epoch,basis:entry.basis,plan:entry.dataPlan,hybrid:entry.hybrid,symbol:entry.symbol,feed:entry.dataPlan==='paid'||entry.hybrid?'sip' as const:'iex' as const,key,existing:this.#dailyCache.get(entry)?.get(key)};
  }
  #installDailyCache(owner:DailyMonthOwner,key:string):void{
   const entry=owner.entry.deref();if(!entry||!this.#dailyOwnerCurrent(owner))throw Error('The original daily source retired before complete cache commit.');let map=this.#dailyCache.get(entry);if(!map){map=new Map();this.#dailyCache.set(entry,map);}const previous=map.get(key);map.set(key,owner);if(previous&&previous!==owner)this.#retireDailyOwner(previous);
  }
  #loadSeasonalityDailyMonths(planning:SeasonalityDailyPlanning,signal:AbortSignal,scope:DailyScope):Promise<DailyMonthOwner>{
   if(dailyAborted(signal))throw Error('The actual daily-history origin retired.');const initial=this.#dailyBuildFacts(planning,scope),request=planning.plan,key=initial.key,existing=initial.existing;
   if(existing&&this.#dailyOwnerCurrent(existing)&&existing.cache&&existing.closedThrough>=request.closedThrough&&existing.coveredThrough<=request.requestedThrough)return Promise.resolve(existing);
   if(this.#dailyWork+4096>20000000||this.#dailySlots+512>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE||this.#dailyOwners.size>=1000)throw Error('The daily-history preparation cannot be admitted.');this.#dailyWork+=4096;this.#dailySlots+=512;
   const owner:DailyMonthOwner={entry:initial.entry,series:initial.series,epoch:initial.epoch,basis:initial.basis,plan:initial.plan,hybrid:initial.hybrid,feed:initial.feed,startYear:request.calendarStartYear,endYear:request.calendarEndYear,coveredFrom:request.coveredRequestFrom,coveredThrough:request.requestedThrough,closedThrough:request.closedThrough,cache:null,live:true,working:true,work:4096,slots:512,off:null,key:Object.freeze({}),clients:0,active:0,scope:new WeakRef(scope),leases:new Set()};this.#dailyOwners.add(owner);
   try{
    const abort=dailyWeakHistoryAbort(new WeakRef(this),new WeakRef(owner));owner.off=dailyWeakAbortOff(new WeakRef(signal),abort);Reflect.apply(dailyAbortAdd,signal,['abort',abort,{once:true}]);
    if(!this.#dailyOwnerCurrent(owner)||dailyAborted(signal))throw Error('The actual daily-history provider/basis/demand changed.');
    const settings:SeasonalitySettings={startYear:request.calendarStartYear,endYear:request.calendarEndYear,excludedMonths:'',includeDevelopingInSummaries:false,meanRow:false,deviationRow:false,positiveFrequencyRow:false,projectionGeometry:false,externalNumericSlots:0},F=(settings.endYear-settings.startYear+1)*12+Number(settings.startYear>2015),D=request.dailyRowUpperBound;
    const forecast=reserveSeasonality({chartBars:D,monthFrames:F,sourceRows:D,calendarDays:F*31,settings,compiler:true}),work=3072*D+forecast.operations+131072,slots=16*D+forecast.numericSlots+4096;
    if(!Number.isSafeInteger(work)||!Number.isSafeInteger(slots)||this.#dailyWork+work>20000000||this.#dailySlots+slots+100000>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The complete daily history and response overlap exceed the current budget.');this.#dailyWork+=work;this.#dailySlots+=slots;owner.work+=work;owner.slots+=slots;
    const description=(initial.feed==='sip'?'Provider-published New York daily closes from coherent all-exchange SIP history. ':'Provider-published New York daily closes from coherent IEX-only history. ')+(this.#dailySynthetic(owner)?'SYNTHETIC invented prices. ':'')+'Full New York day completion; no regular-session relabel or exchange-finality claim.';
    return dailyLoadHistory({provider:new WeakRef(this),owner,signal,request,settings,rowBound:D,symbol:initial.symbol,feed:initial.feed,key,description,pageActive:false});
   }catch(error){owner.working=false;try{this.#retireDailyOwner(owner);}catch(cleanup){throw new AggregateError([error,cleanup],'Daily build acquisition and cleanup failed.');}throw error;}
  }
  #checkDailyHistory(build:DailyHistoryBuild):void{
   if(build.provider.deref()!==this||!this.#dailyOwnerCurrent(build.owner)||dailyAborted(build.signal))throw Error('The actual daily-history provider/basis/demand changed.');
  }
  #reserveDailyHistoryPage(build:DailyHistoryBuild):void{
   this.#checkDailyHistory(build);if(build.pageActive||this.#dailySlots+100000>2000000-ALPACA_SEASONALITY_CALENDAR_MODULE_BASELINE)throw Error('The actual next daily response cannot be admitted.');this.#dailySlots+=100000;build.pageActive=true;
  }
  #requestDailyHistoryPage(build:DailyHistoryBuild,sent:Readonly<SeasonalityDailySentRequest>):Promise<LiveBridgeResult<AlpacaBarsValue>>{
   this.#checkDailyHistory(build);if(!build.pageActive)throw Error('The actual page has no response admission.');const fetch=this.bridge.fetchAlpacaBars;this.#checkDailyHistory(build);
   return Reflect.apply(fetch,this.bridge,[{requestId:this.requestId(),symbol:sent.symbol,timeframe:'1Day',feed:sent.feed,start:sent.start,end:sent.end,adjustment:sent.adjustment,...(build.owner.plan==='paid'?{plan:'paid' as const}:{}),...(sent.pageToken?{pageToken:sent.pageToken}:{})}]);
  }
  #releaseDailyHistoryPage(build:DailyHistoryBuild):void{if(build.provider.deref()===this&&build.pageActive){build.pageActive=false;this.#dailySlots-=100000;}}
  #commitDailyHistory(build:DailyHistoryBuild,compiled:Readonly<SeasonalityLiveMonthCache>,echo:Readonly<SeasonalityDailyEcho>):void{
   this.#checkDailyHistory(build);const owner=build.owner;owner.coveredFrom=echo.from;owner.coveredThrough=echo.through;owner.closedThrough=newYorkDayStart(echo.through);owner.cache=compiled;this.#installDailyCache(owner,build.key);
  }
  #finishDailyHistory(build:DailyHistoryBuild,failed:boolean):void{
   const owner=build.owner;owner.working=false;if(failed){this.#retireDailyOwner(owner);return;}
   const retained=24*((owner.endYear-owner.startYear+1)*12+Number(owner.startYear>2015))+100002+4096;this.#dailyWork-=owner.work;this.#dailySlots-=owner.slots-retained;owner.work=0;owner.slots=retained;this.#finishDailyOwner(owner);
  }

  /** Constructor helper only. The opaque snapshot must be the exact one this
   * provider published; plain objects/foreign snapshots cannot select an entry.
   * Rows are not read and no request, demand or budget is created here. */
  #seasonalityDailyPlanAtCurrentOrigin(snapshot:MtfSnapshot,startYear:number,endYear:number):Readonly<{facts:SeasonalityDailyHistoryPlan;informationTime:number}>|null{
   try{const dataset=snapshot.dataset.deref(),entry=snapshot.entry.deref();if(this.#dailyDisposed||this.disposed||snapshot.provider.deref()!==this||!dataset||mtfSnapshots.get(dataset)!==snapshot||!entry||this.entries.get(entry.key)!==entry||entry.strongRefs<1||entry.fromCache||!entry.backfilled||entry.historyFailed||entry.epoch!==snapshot.coverage.epoch||entry.basis!==this.adjustment||entry.dataPlan!==this.dataPlan||entry.plan.calendar||entry.plan.baseSeconds>=86400)return null;
    mtfSnapshotCurrent(snapshot);
    const informationTime=Math.floor(this.now()/1000),observedThrough=informationTime-(entry.dataPlan==='paid'?0:ALPACA_SIP_DELAY_SECONDS);
    const plan=planSeasonalityDailyHistory(startYear,endYear,observedThrough);mtfSnapshotCurrent(snapshot);return Object.freeze({facts:plan,informationTime});
   }catch{return null;}
  }
  private sourceNotes(entry: Entry): string[] {
    if (entry.dataPlan === 'paid') return ['History and live prices from all exchanges (SIP), as the paid data plan allows.', ...NOTES_IEX.slice(1).map(note => note.replace(/IEX /g, ''))];
    const boundary = entry.hybrid && entry.sipCut !== null
      ? [`History: all exchanges (15 min delayed) up to ${newYorkHhMm(entry.sipCut)} New York time. Live: IEX. Bars after that come from IEX only (less volume) until they are re-read from all exchanges 15 minutes later.`]
      : entry.sipNote ? [`All-exchange history is unavailable (${entry.sipNote}), so this chart shows IEX only.`] : [];
    return [...boundary, ...NOTES_IEX];
  }
  /** History (backfill, paging, basis checks) comes from all exchanges unless all-exchange history failed for this feed. */
  private historyFeed(entry: Entry): 'iex' | 'sip' { return entry.dataPlan === 'paid' || entry.hybrid ? 'sip' : 'iex'; }
  private changed(entry: Entry): void { notify(entry, () => this.dataset(entry)); }
  private requestId(): string { return 'al-' + this.session + '-' + (++this.counter); }
  private async pages(symbol: string, timeframe: AlpacaTimeframe, feed: 'iex' | 'sip', start: number, end: number, entry: Entry | undefined, report: { complete: boolean } | undefined, adjustment: AlpacaAdjustment): Promise<Bar[]> {
    const bars: Bar[] = []; let pageToken: string | undefined;
    const request:MtfRestWindow={entry:entry?new WeakRef(entry):null,epoch:entry?.epoch??-1,start,end,feed,basis:adjustment,plan:this.dataPlan,symbol,timeframe};let observation:MtfRestWindow|null=null,coherent=true,complete=false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.bridge.fetchAlpacaBars({ requestId: this.requestId(), symbol, timeframe, feed, start, end, adjustment, ...(this.dataPlan === 'paid' ? { plan: 'paid' as const } : {}), ...(pageToken ? { pageToken } : {}) });
      if (!result.ok) { if (entry) entry.lastError = `Alpaca request failed: ${result.error.message}`; if (!bars.length) throw Object.assign(new Error(result.error.message), { code: result.error.code }); break; }
      const received=result.value.bars;
      for (const bar of received) if (!bars.length || bar.time > bars[bars.length - 1].time) bars.push(bar);
      const window=mtfWindow(result.value,received,request);if(!window||observation&&(window.start!==observation.start||window.end!==observation.end))coherent=false;else if(window)observation=window;
      if (!result.value.nextPageToken) { if (report) report.complete = true;complete=true; break; }
      pageToken = result.value.nextPageToken;
    }
    if(coherent&&complete&&observation&&this.dataPlan===request.plan)mtfRestWindows.set(bars,observation);
    return bars;
  }
  /** A new feed first reads the local cache. A hit is shown at once (labelled cached, never 'ready', so paper
   * tickets and alert sources wait for the refresh) and only the gap plus an overlap is fetched; a miss backfills as before. */
  private async start(entry: Entry): Promise<void> {
    const cache = this.cache;
    if (!cache) return this.backfill(entry);
    const epoch = entry.epoch, key = this.cacheKey(entry);
    let cached: Bar[] | null = null;
    try {
      const result = await cache.readBarCache({ key });
      // A record of another namespace or key, or one whose SYNTHETIC flag disagrees with the namespace, is never used.
      if (result.ok && result.value && result.value.synthetic === (key.provider === ALPACA_STUB_PROVIDER_ID) && sameCacheKey(result.value.key, key) && validCachedBars(result.value.bars)) cached = result.value.bars;
    } catch { /* an unreadable cache is a miss */ }
    if (this.entries.get(entry.key) !== entry || entry.epoch !== epoch || this.disposed) return;
    const now = Math.floor(this.now() / 1000);
    // A prior process (or a backwards clock) may have closed these bars after the current market instant.
    // Use the writer's exact bucket-end rule; an unsafe record is a full miss before any cached publication.
    const bucketEnd = (time: number) => entry.plan.bucketRange?.(time).end ?? time + entry.seconds;
    const closed = cached?.every(bar => { try { const end = bucketEnd(bar.time); return Number.isFinite(end) && end > bar.time && end <= now; } catch { return false; } }) ?? false;
    if (!cached || !closed || cached.length <= BAR_CACHE_OVERLAP_BARS || cached[cached.length - 1].time < now - entry.window || entry.basis !== key.adjustment || entry.dataPlan !== key.plan) return this.backfill(entry);
    entry.series.setBackfill(cached.slice(-BACKFILL_BARS)); entry.reserve = cached.slice(0, Math.max(0, cached.length - BACKFILL_BARS));
    entry.fromCache = true; entry.series.setState('loading'); entry.cached = null;
    this.changed(entry);
    return this.backfill(entry, 0, cached);
  }
  private async backfill(entry: Entry, attempt = 0, cachedBars: Bar[] | null = null): Promise<void> {
    const now = Math.floor(this.now() / 1000), epoch = entry.epoch;
    // With cached bars, fetch only from the oldest of the last few cached bars (the overlap) to now.
    const overlap = cachedBars ? cacheOverlapStart(cachedBars, BAR_CACHE_OVERLAP_BARS) : null;
    let load: HistoryLoad;
    try { load = await this.loadHistory(entry, now, entry.basis, entry.dataPlan, overlap ?? undefined); }
    catch (cause) {
      if (this.disposed || this.entries.get(entry.key) !== entry || entry.epoch !== epoch) return;
      // Many feeds opening at once (a cold start with a long watchlist) can fill the main process's request queue.
      // A BUSY answer is retried with backoff (1, 2, 4, 8, 16 s, plus a stagger by feed) instead of leaving the feed empty.
      if ((cause as { code?: unknown })?.code === 'BUSY' && attempt < BUSY_RETRIES && !this.disposed) {
        entry.lastError = null;
        setTimeout(() => { if (this.entries.get(entry.key) === entry && !this.disposed && entry.epoch === epoch) void this.backfill(entry, attempt + 1, cachedBars); }, BUSY_RETRY_MS * 2 ** attempt + (this.counter % 8) * 125);
        return;
      }
      // Cached bars stay on screen, still labelled cached, with the reason (offline, rate-limited).
      entry.lastError = `Alpaca request failed: ${cause instanceof Error ? cause.message : String(cause)}`; entry.historyFailed = true; entry.series.setState('error'); this.changed(entry); return; }
    if (this.disposed || this.entries.get(entry.key) !== entry || entry.epoch !== epoch) return;
    // Completion keeps the genuine fresh load; the display may separately
    // merge its bars with cache. Cached rows never widen these request bounds.
    const observedLoad = load;
    if (cachedBars && overlap !== null) {
      // All-exchange history refused: the IEX-only fallback (never cached) loads the whole window instead.
      if (entry.dataPlan !== 'paid' && !load.hybrid) return this.backfill(entry, attempt, null);
      // A changed overlap bar means the cached basis is gone (a split or dividend re-adjustment, a corrected print): this
      // symbol's cache is discarded and the whole window reloads; cached bars are never stitched to another basis.
      if (!cacheOverlapMatches(cachedBars, load.bars, overlap)) { void this.discardCache(entry); return this.backfill(entry, attempt, null); }
      load = { ...load, bars: mergeCachedHistory(cachedBars, load.bars, overlap).slice(-BAR_CACHE_MAX_BARS) };
    }
    if (entry.fromCache) {
      // The cached snapshot was its own source: the refreshed bars get a new series, pager and revision (as a reload does).
      const series = entry.makeSeries();
      series.setBackfill(load.bars.slice(-BACKFILL_BARS)); series.setState(dataStateOf(this.status?.state));
      entry.series = series; entry.fromCache = false; entry.lastError = null; entry.seeding.clear();
      entry.reserve = load.bars.slice(0, Math.max(0, load.bars.length - BACKFILL_BARS)); entry.reserveAtLimit = false;
      renewLiveRevision(entry); this.newPager(entry);
    } else entry.series.setBackfill(load.bars.slice(-BACKFILL_BARS));
    this.startDay(entry, load);
    entry.backfilled = true; entry.basisDay = this.today();
    // The coverage (IEX only, or the hybrid all-exchange history) is part of the chart basis identity, so it must not change
    // within one live revision: App's universe and the chart cell keep the snapshot of a revision, and an alert or chart action
    // compares the basis exactly. A backfill that changes it (the first all-exchange backfill of a free-plan feed: hybrid goes
    // from false to true) starts a new revision and lineage, as a reload does.
    if (entry.hybrid !== load.hybrid) renewLiveRevision(entry);
    entry.hybrid = load.hybrid; entry.sipLast = load.sipLast; entry.sipCut = load.sipCut; entry.sipNote = load.sipNote;
    entry.restThrough = this.cacheBoundary(entry, now);
    this.retainMtfLoad(entry,observedLoad,epoch,load!==observedLoad);
    entry.series.setState(dataStateOf(this.status?.state));
    this.changed(entry);
    this.scheduleCacheWrite(entry);
  }
  /** The bucket end up to which bars came from cacheable history. Free plan: the all-exchange boundary (the IEX
   * tail after it is never cached). Paid: the backfill instant. An IEX-only feed (all-exchange history refused): nothing. */
  private cacheBoundary(entry: Entry, now: number): number | null {
    if (entry.dataPlan === 'paid') return now;
    return entry.hybrid && entry.sipLast !== null ? entry.sipLast + TIMEFRAME_SECONDS[entry.timeframe] : null;
  }
  private cacheKey(entry: Entry): BarCacheKey { return { provider: entry.cacheProvider, symbol: entry.symbol, interval: entry.resolution, feed: 'sip', adjustment: entry.basis, plan: entry.dataPlan }; }
  /** Closed history bars to cache: older paging reserve, then the series' closed bars up to the boundary (no forming bar,
   * no provisional bar, no IEX tail). Null while cached bars are still shown, mid-reload, or for an IEX-only feed. */
  private cacheBars(entry: Entry): Bar[] | null {
    if (!entry.backfilled || entry.fromCache || entry.restThrough === null || entry.basis !== this.adjustment || entry.dataPlan !== this.dataPlan) return null;
    const bucketEnd = (time: number) => entry.plan.bucketRange?.(time).end ?? time + entry.seconds;
    const closed = closedBarsForCache(entry.series.bars, entry.restThrough, bucketEnd, entry.series.provisionalTimes);
    if (!closed.length) return null;
    const first = entry.series.bars[0].time, older = entry.reserve.filter(bar => bar.time < first).map(bar => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }));
    return [...older, ...closed].slice(-BAR_CACHE_MAX_BARS);
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
    try { await this.cache.writeBarCache({ key: this.cacheKey(entry), bars }); } catch { /* a failed write only costs a download next launch */ }
  }
  private async discardCache(entry: Entry): Promise<void> {
    try { await this.cache?.discardBarCache?.({ provider: entry.cacheProvider, symbol: entry.symbol }); } catch { /* best effort */ }
  }
  /**
   * One backfill window. Paid: all exchanges to now. Free: all exchanges up to 15 minutes ago (only
   * bars that closed by then), then IEX strictly after the last all-exchange bar, so the seam has no gap and no duplicate.
   * All-exchange history that is refused (other than a busy queue) falls back to IEX for the whole window, with a note.
   */
  private async loadHistory(entry: Entry, now: number, basis: AlpacaAdjustment, plan: AlpacaDataPlan, from?: number): Promise<HistoryLoad> {
    // `from` (the cache overlap start, a bar or bucket start) replaces the window start for a gap fill.
    const start = from ?? now - entry.window, fold = (bars: Bar[]) => entry.plan.native ? bars : foldBars(bars, entry.plan.bucketOf!);
    const lastDay = (raw: Bar[]) => entry.timeframe === '1Day' ? raw.at(-1) ?? null : null;
    if (plan === 'paid') { const raw = await this.pages(entry.symbol, entry.timeframe, 'sip', start, now, entry, undefined, basis); return mtfLoad({ bars: fold(raw), hybrid: false, sipLast: null, sipCut: null, sipNote: null, lastDay: lastDay(raw) },[raw]); }
    const cut = now - ALPACA_SIP_DELAY_SECONDS, step = TIMEFRAME_SECONDS[entry.timeframe];
    let sip: Bar[] = [], sipResponse:Bar[]|null=null, sipNote: string | null = null, hybrid = cut > start;
    if (hybrid) {
      try { sipResponse=await this.pages(entry.symbol, entry.timeframe, 'sip', start, cut, entry, undefined, basis);sip=sipResponse.filter(bar => bar.time + step <= cut); }
      catch (cause) {
        if ((cause as { code?: unknown })?.code === 'BUSY') throw cause;
        sipNote = cause instanceof Error ? cause.message : String(cause); hybrid = false; entry.lastError = null;
      }
    }
    const sipLast = sip.at(-1)?.time ?? null, iexStart = sipLast === null ? start : sipLast + 1;
    const iexResponse=iexStart<now?await this.pages(entry.symbol,entry.timeframe,'iex',iexStart,now,entry,undefined,basis):null,iex=iexResponse?iexResponse.filter(bar=>sipLast===null||bar.time>sipLast):[];
    const raw = [...sip, ...iex];
    return mtfLoad({ bars: fold(raw), hybrid, sipLast, sipCut: hybrid ? cut : null, sipNote, lastDay: lastDay(raw) },[...(hybrid&&sipResponse?[sipResponse]:[]),...(iexResponse?[iexResponse]:[])],hybrid?(sipLast===null?start:sipLast+step):null);
  }
  /** Re-read from all exchanges the IEX bars that are now at least 15 minutes old, and replace them. A
   * folded interval re-reads from the start of the bucket holding the first IEX bar and replaces only buckets that ended. */
  private async refreshTail(entry: Entry): Promise<void> {
    if (entry.refreshing || !entry.hybrid || entry.dataPlan !== 'free' || entry.sipLast === null) return;
    const epoch = entry.epoch, now = Math.floor(this.now() / 1000), cut = now - ALPACA_SIP_DELAY_SECONDS, step = TIMEFRAME_SECONDS[entry.timeframe];
    const from = entry.plan.native ? entry.sipLast + 1 : entry.plan.bucketOf!(entry.sipLast + 1);
    if (from >= cut) return;
    entry.refreshing = true;
    try {
      let sip: Bar[],observed:Bar[];
      try { observed=await this.pages(entry.symbol, entry.timeframe, 'sip', from, cut, entry, undefined, entry.basis);sip=observed.filter(bar => bar.time + step <= cut); }
      catch { entry.lastError = null; entry.sipCut = cut; return; } // try again after the next refresh interval
      if (!this.entries.has(entry.key) || entry.epoch !== epoch) return;
      const bucketEnd = (time: number) => entry.plan.bucketRange?.(time).end ?? time + entry.seconds;
      const target = (entry.plan.native ? sip : foldBars(sip, entry.plan.bucketOf!)).filter(bar => bucketEnd(bar.time) <= cut);
      const forming = entry.series.bars.at(-1)?.time ?? Infinity, applied = target.filter(bar => bar.time < forming);
      if (applied.length) {
        const lastBucket = applied.at(-1)!.time, newest = sip.filter(bar => (entry.plan.native ? bar.time : entry.plan.bucketOf!(bar.time)) <= lastBucket).at(-1)?.time;
        if (newest !== undefined && newest > entry.sipLast) entry.sipLast = entry.plan.native ? newest : bucketEnd(lastBucket) - 1;
        const changed=entry.series.replaceClosed(applied),prior=mtfCoverage.get(entry),window=mtfRestWindows.get(observed);let observationChanged=false;
        // A genuine complete REST replacement may extend coverage; clocks/ticks never enter this path.
        if(prior&&window&&window.entry?.deref()===entry&&window.epoch===epoch&&prior.epoch===epoch&&window.feed==='sip'&&window.basis===entry.basis&&window.plan===entry.dataPlan&&window.start<=prior.through){const through=Math.min(window.end,bucketEnd(lastBucket)),sipThrough=entry.hybrid&&prior.sipThrough!==undefined&&window.start<=prior.sipThrough?Math.max(prior.sipThrough,through):prior.sipThrough;
         // A real SIP replacement can advance composition inside an already observed IEX range.
         // Neither request/arrival time nor a gap advances either boundary.
         if(through>prior.through||sipThrough!==prior.sipThrough){mtfCoverage.set(entry,Object.freeze({...prior,through:Math.max(prior.through,through),...(sipThrough!==undefined?{sipThrough}:{})}));observationChanged=true;}}
        if(changed||observationChanged){entry.cached=null;this.changed(entry);}
        // The cacheable boundary follows the all-exchange re-read.
        entry.restThrough = this.cacheBoundary(entry, now); this.scheduleCacheWrite(entry);
      }
      entry.sipCut = cut; entry.cached = null;
    } finally { entry.refreshing = false; }
  }
  /** A backfill (or reload) starts the forming day afresh. Today's published bar from that backfill covers
   * every trade before the instant the backfill completed; later trades and minute bars fold on top of it. */
  private startDay(entry: Entry, load: HistoryLoad): void {
    if (!entry.plan.dayTicks) { entry.daily = null; return; }
    const daily = new LiveDailyForming(this.dailySession), coverage = Math.floor(this.now() / 1000), today = load.lastDay;
    if (today && today.time === newYorkDayStart(coverage)) daily.official({ time: today.time, open: today.open, high: today.high, low: today.low, close: today.close, volume: today.volume }, coverage);
    entry.daily = daily;
  }
  /** The forming day's bar is the series' daily base bar (the bar itself on 1D; one day of a week or month). */
  private applyDay(entry: Entry, bar: Bar | null, touched: Set<Entry>): void {
    if (!bar) return;
    const result = entry.series.applyBase(bar);
    if (result.changed) touched.add(entry);
    if (result.seed !== null) void this.seed(entry, result.seed);
  }
  private newPager(entry: Entry): void {
    entry.history = new LiveHistoryPager(() => this.olderPage(entry), this.now);
    registerLiveHistory(entry.key, entry.history);
  }
  /** Reload a feed's history on the provider's current adjustment. The old bars stay on screen (and keep
   * taking stream updates) until the new backfill arrives; then the series, the paging reserve and the pager are replaced
   * together and the dataset gets a new revision, so no consumer ever sees two bases in one series. */
  private async reload(entry: Entry, discard = false): Promise<void> {
    // Invalidate daily authority before starting the actual source replacement.
    // Optional cleanup cannot skip the original reload or replace its error.
    let cleanupFailed=false,cleanupError:unknown;
    try{this.#retireEntryDaily(entry);}catch(error){cleanupFailed=true;cleanupError=error;}
    try{await this.#reloadAfterDailyRetirement(entry,discard);}catch(error){if(cleanupFailed)throw new AggregateError([error,cleanupError],'Source reload and daily retirement failed.');throw error;}
    if(cleanupFailed)throw cleanupError;
  }
  async #reloadAfterDailyRetirement(entry: Entry, discard = false): Promise<void> {
    this.retireMtfDemand(entry);const epoch = ++entry.epoch, basis = this.adjustment, plan = this.dataPlan, now = Math.floor(this.now() / 1000);
    // A basis change seen at a seam invalidates every cached record of the symbol (all on the old basis).
    if (discard) void this.discardCache(entry);
    let load: HistoryLoad;
    try { load = await this.loadHistory(entry, now, basis, plan); }
    catch (cause) {
      if (this.disposed || this.entries.get(entry.key) !== entry || entry.epoch !== epoch) return;
      entry.lastError = `Prices could not be re-adjusted: ${cause instanceof Error ? cause.message : String(cause)}`; entry.series.setState('error'); this.changed(entry); return;
    }
    if (this.disposed || this.entries.get(entry.key) !== entry || entry.epoch !== epoch) return;
    const series = entry.makeSeries();
    series.setBackfill(load.bars.slice(-BACKFILL_BARS)); series.setState(dataStateOf(this.status?.state));
    entry.dataPlan = plan; entry.hybrid = load.hybrid; entry.sipLast = load.sipLast; entry.sipCut = load.sipCut; entry.sipNote = load.sipNote;
    entry.series = series; entry.basis = basis; entry.basisDay = this.today(); entry.backfilled = true; entry.lastError = null;
    entry.reserve = []; entry.reserveAtLimit = false; entry.seeding.clear(); entry.fromCache = false;
    this.startDay(entry, load);
    entry.restThrough = this.cacheBoundary(entry, now);
    this.retainMtfLoad(entry,load,epoch);
    renewLiveRevision(entry); this.newPager(entry);
    this.changed(entry);
    this.scheduleCacheWrite(entry);
  }
  /** A seam check found another basis: reload once per New York day (a second mismatch the same day is not chased). */
  private reloadOnSeam(entry: Entry): boolean {
    const today = this.today();
    if (entry.reloadedOn === today) return false;
    entry.reloadedOn = today; void this.reload(entry, true);
    return true;
  }
  /** On the first live message of a new New York day, re-read the oldest loaded bar on the feed's basis.
   * A split or dividend that took effect overnight changes it, and the feed reloads before today's bars sit beside it. */
  private async verifyBasis(entry: Entry): Promise<void> {
    const firstBar = entry.series.bars[0], epoch = entry.epoch;
    if (!firstBar || entry.basis !== this.adjustment || entry.dataPlan !== this.dataPlan) return;
    let bars: Bar[];
    try { bars = await this.pages(entry.symbol, entry.timeframe, this.historyFeed(entry), firstBar.time, firstBar.time, entry, undefined, entry.basis); } catch { return; }
    if (!this.entries.has(entry.key) || entry.epoch !== epoch) return;
    const anchor = bars.find(bar => bar.time === firstBar.time);
    if (anchor && !sameBasisPrice(anchor.open, firstBar.open)) this.reloadOnSeam(entry);
  }
  private async seed(entry: Entry, bucket: number): Promise<void> {
    if (entry.seeding.has(bucket) || entry.seconds === entry.plan.baseSeconds) return;
    entry.seeding.add(bucket);
    try {
      // A session bucket can end before its nominal length (09:00-09:30 pre-market, 15:30-16:00 regular).
      const end = Math.min(entry.plan.bucketRange?.(bucket).end ?? bucket + entry.seconds, Math.floor(this.now() / 1000));
      if (end <= bucket) return;
      const epoch = entry.epoch, bars = await this.pages(entry.symbol, entry.plan.baseSeconds === 86400 ? '1Day' : '1Min', entry.dataPlan === 'paid' ? 'sip' : 'iex', bucket, end, entry, undefined, entry.basis).catch(() => null);
      if (bars && this.entries.has(entry.key) && entry.epoch === epoch && entry.series.seedBucket(bucket, bars)) this.changed(entry);
    } finally { entry.seeding.delete(bucket); }
  }
  /** Frees one stream slot by closing the most recently opened symbol that only yielding handles hold. */
  private yieldSymbol(): boolean {
    let pick: { symbol: string; order: number } | null = null;
    const strong = new Set([...this.entries.values()].filter(row => row.strongRefs > 0).map(row => row.symbol));
    for (const row of this.entries.values()) for (const yielder of row.yielders) if (!strong.has(row.symbol) && (!pick || yielder.order > pick.order)) pick = { symbol: row.symbol, order: yielder.order };
    if (!pick) return false;
    const symbol = pick.symbol;
    this.syncHeld = true;
    try { for (const row of [...this.entries.values()]) if (row.symbol === symbol) for (const yielder of [...row.yielders]) yielder.evict(); }
    finally { this.syncHeld = false; }
    return ![...this.entries.values()].some(row => row.symbol === symbol);
  }
  private syncSubscription(): void {
    if (this.syncHeld) return;
    const symbols = [...new Set([...this.entries.values()].map(entry => entry.symbol))].sort();
    // The on-screen quote symbols: a chart or ticket shows its bid and ask, or a watchlist row (a yielding feed).
    const shown = symbols.filter(symbol => liveQuotes.isWatched(alpacaInstrument(symbol).id) || [...this.entries.values()].some(entry => entry.symbol === symbol && entry.yielders.size > 0));
    const signature = symbols.join(',') + (this.dataPlan === 'paid' ? '|sip' : '') + (shown.length ? '|shown:' + shown.join(',') : '');
    if (signature === this.subscribed) return;
    const generation = ++this.subscriptionGeneration; this.subscribed = signature;
    // A symbol leaving the stream takes its quote with it.
    const dropped = [...this.quoted].filter(symbol => !symbols.includes(symbol)); if (dropped.length) { liveQuotes.clear(dropped.map(symbol => alpacaInstrument(symbol).id)); for (const symbol of dropped) this.quoted.delete(symbol); }
    if (!symbols.length) { this.unlisten?.(); this.unlisten = null; void this.bridge.unsubscribeAlpaca().catch(() => undefined); return; }
    if (!this.unlisten) this.unlisten = this.bridge.onAlpacaEvent(event => this.receive(event));
    void this.bridge.subscribeAlpaca({ symbols, ...(this.dataPlan === 'paid' ? { feed: 'sip' as const } : {}), quotes: true, ...(shown.length ? { quotesFor: shown } : {}) }).then(result => {
      if (this.disposed || generation !== this.subscriptionGeneration) return;
      if (result.ok) this.applyStatus(result.value);
      else for (const entry of this.entries.values()) { entry.lastError = `Alpaca stream unavailable: ${result.error.message}`; entry.cached = null; if (entry.backfilled) entry.series.setState('disconnected'); this.changed(entry); }
    }).catch(() => undefined);
  }
  private applyStatus(status: AlpacaStatus): void {
    const previous = this.status?.state; this.status = status;
    // A stream that is not delivering has no current bid or ask.
    if (status.state !== 'ready' && status.state !== 'stale' && this.quoted.size) { liveQuotes.clear([...this.quoted].map(symbol => alpacaInstrument(symbol).id)); this.quoted.clear(); }
    const authenticated = status.state === 'ready' && previous !== 'ready' && previous !== 'stale', resumed = authenticated && this.everReady;
    if (status.state === 'ready') this.everReady = true;
    // A feed whose history failed (Alpaca rejected the key it had) loads again once the stream accepts a key,
    // for example after the owner saves the right key over a rejected one: the key stays "configured", so App never reopens it.
    // Only on the transition to ready, so a key that is still refused (the stream stops with auth failed) never loops.
    const retry = authenticated ? [...this.entries.values()].filter(entry => entry.historyFailed && !entry.backfilled) : [];
    for (const entry of retry) { entry.historyFailed = false; entry.lastError = null; void this.start(entry); }
    // The stream's own reason (key rejected, connection limit, unreachable) goes on every chart; it clears once connected.
    const streamError = (status.state === 'auth-failed' || status.state === 'disconnected') && status.lastError ? STREAM_PREFIX + status.lastError : null;
    for (const entry of this.entries.values()) {
      entry.cached = null;
      if (streamError) entry.lastError = streamError;
      else if (status.state === 'ready' && entry.lastError?.startsWith(STREAM_PREFIX)) entry.lastError = null;
      if (entry.backfilled) entry.series.setState(dataStateOf(status.state));
      if (resumed && entry.backfilled) for (const bucket of entry.series.resetLive()) void this.seed(entry, bucket);
      this.changed(entry);
    }
  }
  /** A chart or ticket started or stopped showing a quote; the next microtask tells main (coalesced). */
  private readonly offWatched: () => void;
  private priorityQueued = false;
  private queueQuotePriority(): void {
    if (this.priorityQueued || this.disposed) return;
    this.priorityQueued = true;
    queueMicrotask(() => { this.priorityQueued = false; if (!this.disposed) this.syncSubscription(); });
  }
  /** Symbols whose quotes this provider published (cleared when they leave the stream). */
  private readonly quoted = new Set<string>();
  private receiveQuotes(rows: readonly AlpacaQuoteRow[]): void {
    const streamed = new Set([...this.entries.values()].map(entry => entry.symbol)), receivedAt = this.receivedNow(), synthetic = isAlpacaSyntheticStub();
    for (const row of rows) {
      if (!row || typeof row.symbol !== 'string' || !streamed.has(row.symbol)) continue;
      const quote = normalizeLiveQuote(row, { instrumentId: alpacaInstrument(row.symbol).id, symbol: row.symbol, providerId: ALPACA_IEX_PROVIDER_ID, feed: row.feed === 'sip' ? 'sip' : 'iex', synthetic, receivedAt });
      if (quote) { liveQuotes.publish(quote); this.quoted.add(row.symbol); }
    }
  }
  receive(event: AlpacaEvent): void {
    if (this.disposed || !event || event.schemaVersion !== 1) return;
    if (event.kind === 'status') { this.applyStatus(event.status); return; }
    if (event.kind !== 'batch') return;
    if(this.fixtureBusinessTime&&(event.bars.length||event.trades.length))this.marketCoverage=Math.floor(this.now()/1000);
    if (Array.isArray(event.quotes) && event.quotes.length) this.receiveQuotes(event.quotes);
    const touched = new Set<Entry>(), today = event.bars.length || event.trades.length ? this.today() : null;
    for (const entry of this.entries.values()) {
      if (!entry.backfilled) continue;
      this.#observeDailyDeveloping(entry,event);
      if (today && entry.basisDay !== today) { entry.basisDay = today; void this.verifyBasis(entry); }
      if (today && entry.hybrid && entry.sipCut !== null && Math.floor(this.now() / 1000) - ALPACA_SIP_DELAY_SECONDS - entry.sipCut >= Math.max(TAIL_REFRESH_SECONDS, TIMEFRAME_SECONDS[entry.timeframe])) void this.refreshTail(entry);
      const daily = entry.plan.baseSeconds === 86400;
      if (daily && entry.daily) {
        // A published daily bar ('d') covers every minute before the one it arrived in; minute bars and trades
        // from then on fold on top of it (live-daily.ts), so the forming day moves on every trade and nothing is counted twice.
        const forming = entry.daily, coverage = Math.floor(Math.floor(this.now() / 1000) / 60) * 60;
        for (const bar of event.bars) {
          if (bar.symbol !== entry.symbol) continue;
          const value = { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
          this.applyDay(entry, bar.kind === 'daily' ? forming.official(value, coverage) : forming.minute(value), touched);
        }
        for (const trade of event.trades) if (trade.symbol === entry.symbol) this.applyDay(entry, forming.trade(trade), touched);
        continue;
      }
      for (const bar of event.bars) {
        if (bar.symbol !== entry.symbol || (daily ? bar.kind !== 'daily' : bar.kind === 'daily')) continue;
        const result = entry.series.applyBase({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
        if (result.changed) touched.add(entry);
        if (result.seed !== null) void this.seed(entry, result.seed);
      }
      if (entry.plan.ticks) for (const trade of event.trades) {
        if (trade.symbol !== entry.symbol) continue;
        const result = entry.series.applyTick({ time: trade.time, price: trade.price, high: trade.high, low: trade.low, size: trade.size });
        if (result.changed) touched.add(entry);
        if (result.seed !== null) void this.seed(entry, result.seed);
      }
    }
    if (this.status && !this.status.liveMessages && (event.bars.length || event.trades.length)) { this.status = { ...this.status, liveMessages: true }; for (const entry of this.entries.values()) { entry.cached = null; touched.add(entry); } }
    for (const entry of touched) this.changed(entry);
  }
}
