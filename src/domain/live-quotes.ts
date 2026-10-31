// Live best bid and ask. Alpaca streams quotes on the same feed as its trades
// (IEX on the free plan, SIP on paid) for the same symbols (inside the 30-symbol cap); Coinbase's public ticker carries its
// best bid and ask. Main validates and coalesces them to at most one quote per symbol every 250 ms; this store keeps the
// newest quote per instrument and notifies its listeners at most once per LIVE_QUOTE_MIN_INTERVAL_MS per instrument.
//
// These are display quotes: the price scale Bid and Ask labels and lines, the watchlist Bid and Ask columns, the order
// ticket and the paper DOM's best bid and ask rows. Virtual (paper) fills keep their own bar-feed prices; nothing here
// changes how the virtual account executes. IEX quotes are one venue only and can be wider than the whole market, so every
// display names its source.
import type { Quote } from './types';

export type LiveQuoteFeed = 'iex' | 'sip' | 'coinbase';
export interface LiveQuote {
  instrumentId: string; symbol: string; providerId: string; feed: LiveQuoteFeed;
  /** null: that side has no quote. At least one side is present. */
  bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null;
  /** Quote time, Unix seconds (exchange time). */
  time: number;
  /** Local receipt time, epoch ms. */
  receivedAt: number;
  synthetic: boolean;
}
export const LIVE_QUOTE_MIN_INTERVAL_MS = 250;
/** A quote older than this (by local receipt) is shown as unavailable rather than as a current bid or ask. */
export const LIVE_QUOTE_STALE_MS = 5 * 60 * 1000;

const finitePositive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const finiteSize = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Re-checks a quote row from main. Null for anything unusable (no side, crossed, bad time). */
export function normalizeLiveQuote(raw: { bid?: unknown; ask?: unknown; bidSize?: unknown; askSize?: unknown; time?: unknown }, meta: { instrumentId: string; symbol: string; providerId: string; feed: LiveQuoteFeed; synthetic: boolean; receivedAt: number }): LiveQuote | null {
  if (!raw || typeof raw !== 'object') return null;
  const bid = finitePositive(raw.bid), ask = finitePositive(raw.ask), time = raw.time;
  if (bid === null && ask === null) return null;
  if (bid !== null && ask !== null && ask < bid) return null;
  if (typeof time !== 'number' || !Number.isSafeInteger(time) || time <= 0) return null;
  return { ...meta, bid, ask, bidSize: bid === null ? null : finiteSize(raw.bidSize), askSize: ask === null ? null : finiteSize(raw.askSize), time };
}

/** Plain source name shown next to every bid and ask. */
export function liveQuoteSourceLabel(quote: Pick<LiveQuote, 'feed' | 'synthetic'>): string {
  if (quote.synthetic) return 'SYNTHETIC quote (invented prices)';
  return quote.feed === 'iex' ? 'IEX quote (one exchange; can be wider than the whole market)' : quote.feed === 'sip' ? 'All-exchange quote (SIP)' : 'Coinbase best bid and ask';
}
export const liveQuoteShortSource = (quote: Pick<LiveQuote, 'feed' | 'synthetic'>): string => quote.synthetic ? 'SYNTHETIC' : quote.feed === 'iex' ? 'IEX' : quote.feed === 'sip' ? 'SIP' : 'Coinbase';
export function liveQuoteFresh(quote: LiveQuote | null | undefined, nowMs: number): quote is LiveQuote {
  return !!quote && nowMs - quote.receivedAt <= LIVE_QUOTE_STALE_MS;
}

/** Bid and ask marks for the price scale (labels and lines), in the chart settings' bid and ask colors. */
export function bidAskScaleMarks(quote: LiveQuote | null | undefined, colors: readonly string[], nowMs: number): { bid: { price: number; color: string } | null; ask: { price: number; color: string } | null } | null {
  if (!liveQuoteFresh(quote, nowMs)) return null;
  const bidColor = colors[0] ?? '#2962FF', askColor = colors[1] ?? '#F7525F';
  return { bid: quote.bid === null ? null : { price: quote.bid, color: bidColor }, ask: quote.ask === null ? null : { price: quote.ask, color: askColor } };
}

/**
 * The quote a display-only top of book shows (paper DOM best bid and ask rows, the ticket's market line): the live bid and
 * ask with their sizes, on the account quote's clock fields, so nothing that validates an executable quote mistakes it for
 * one. Null without a fresh two-sided live quote for the instrument.
 */
export function topOfBookDisplayQuote(live: LiveQuote | null | undefined, base: Quote | null | undefined, nowMs: number): Quote | null {
  if (!liveQuoteFresh(live, nowMs) || live.bid === null || live.ask === null || !base || base.instrumentId !== live.instrumentId) return null;
  return { ...base, bid: live.bid, ask: live.ask, ...(live.bidSize !== null ? { bidSize: live.bidSize } : {}), ...(live.askSize !== null ? { askSize: live.askSize } : {}) };
}

type Listener = (quote: LiveQuote | null) => void;
interface Slot { quote: LiveQuote | null; notifiedAt: number; timer: ReturnType<typeof setTimeout> | null; listeners: Set<Listener> }
export interface LiveQuoteClock { now(): number; setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>; clearTimeout(id: ReturnType<typeof setTimeout>): void }
const SYSTEM_CLOCK: LiveQuoteClock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };

/** Newest quote per instrument. Listeners hear at most one update per instrument every LIVE_QUOTE_MIN_INTERVAL_MS (the last one wins). */
export class LiveQuoteStore {
  private slots = new Map<string, Slot>();
  private all = new Set<() => void>();
  constructor(private readonly clock: LiveQuoteClock = SYSTEM_CLOCK, private readonly interval = LIVE_QUOTE_MIN_INTERVAL_MS) {}
  private slot(id: string): Slot { let slot = this.slots.get(id); if (!slot) { slot = { quote: null, notifiedAt: -Infinity, timer: null, listeners: new Set() }; this.slots.set(id, slot); } return slot; }
  get(instrumentId: string): LiveQuote | null { return this.slots.get(instrumentId)?.quote ?? null; }
  /** Stores the quote (an older or identical one is ignored) and schedules the throttled notification. */
  publish(quote: LiveQuote): boolean {
    const slot = this.slot(quote.instrumentId), prior = slot.quote;
    if (prior && (quote.time < prior.time || prior.time === quote.time && prior.bid === quote.bid && prior.ask === quote.ask && prior.bidSize === quote.bidSize && prior.askSize === quote.askSize && prior.feed === quote.feed)) return false;
    slot.quote = quote; this.schedule(quote.instrumentId, slot); return true;
  }
  /** Drops the quotes of these instruments (feed disconnected or closed). Listeners hear null once. */
  clear(instrumentIds?: readonly string[]): void {
    for (const id of instrumentIds ?? [...this.slots.keys()]) { const slot = this.slots.get(id); if (!slot?.quote) continue; slot.quote = null; this.schedule(id, slot); }
  }
  subscribe(instrumentId: string, listener: Listener): () => void {
    const slot = this.slot(instrumentId), was = slot.listeners.size; slot.listeners.add(listener);
    if (!was && slot.listeners.size) this.watchedChanged();
    return () => { const had = slot.listeners.size; slot.listeners.delete(listener); if (had && !slot.listeners.size) this.watchedChanged(); };
  }
  /** True while something shows this instrument's own quote (a chart's Bid and Ask, the order ticket). */
  isWatched(instrumentId: string): boolean { return (this.slots.get(instrumentId)?.listeners.size ?? 0) > 0; }
  /** Called when an instrument gains its first or loses its last own-quote listener. */
  onWatchedChange(listener: () => void): () => void { this.watchers.add(listener); return () => { this.watchers.delete(listener); }; }
  private watchers = new Set<() => void>();
  private watchedChanged(): void { for (const listener of [...this.watchers]) try { listener(); } catch { /* a watcher failure never stops quotes */ } }
  /** Any instrument changed (throttled per instrument). For multi-row views such as the watchlist. */
  subscribeAll(listener: () => void): () => void { this.all.add(listener); return () => { this.all.delete(listener); }; }
  private schedule(id: string, slot: Slot): void {
    if (slot.timer !== null) return;
    const wait = slot.notifiedAt + this.interval - this.clock.now();
    if (wait <= 0) { this.notify(slot); return; }
    slot.timer = this.clock.setTimeout(() => { slot.timer = null; this.notify(slot); }, wait);
  }
  private notify(slot: Slot): void {
    slot.notifiedAt = this.clock.now();
    for (const listener of [...slot.listeners]) try { listener(slot.quote); } catch { /* a listener failure never stops quotes */ }
    for (const listener of [...this.all]) try { listener(); } catch { /* same */ }
  }
  reset(): void { for (const slot of this.slots.values()) if (slot.timer !== null) this.clock.clearTimeout(slot.timer); this.slots.clear(); this.all.clear(); }
}
/** The app-wide store the live providers publish into. */
export const liveQuotes = new LiveQuoteStore();
