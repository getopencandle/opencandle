import type { Bar, BarDataset, Instrument, ProviderCapabilities, Quote } from './types';
import { demoDataMode } from './demo-mode';

export const DEMO_SYMBOLS = ['GME', 'SPY', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'IWM', 'QQQ', 'DIA', 'XLF', 'XLK'];
/** User-facing provider name of the built-in generator. The DEMO badge and this name carry the synthetic marking. */
export const FIXTURE_PROVIDER_NAME = 'OpenCandle synthetic demo data';
/** A synthetic instrument's display name is its plain ticker; the one DEMO badge per surface carries the honesty marking. */
export const DEMO_BADGE = 'DEMO';
export const DEMO_BADGE_TITLE = 'Synthetic demo data: generated prices, not market data.';
/** Display text for an exchange: the built-in synthetic namespace reads "Demo", never the internal
 * SYNTHETIC id prefix. Every other exchange is shown as declared. */
export function displayExchange(exchange: string): string { return exchange === 'SYNTHETIC' ? (demoDataMode() === 'legacy' ? 'Demo' : 'Example') : exchange; }
export const FIXTURE_NOTICE = 'SYNTHETIC DEMO. Generated test prices, volume and quotes. Not actual market data.';

export const FIXTURE_CAPABILITIES: ProviderCapabilities = {
  id: 'lv-synthetic-v1', assets: ['stock', 'etf'], universe: '12 named synthetic training instruments; arbitrary local synthetic symbols can also be generated',
  fields: ['ohlcv'], resolutions: ['1D'], streaming: false, delaySeconds: null,
  sessions: ['unknown'], adjustmentBases: ['raw'], earliestHistory: { '1D': '2024-01-02' },
  requiresKey: false, redistributable: true, limits: ['100000 generated bars per request', 'No real exchange calendar, quotes, fundamentals, news or corporate actions'], verifiedLive: false,
};

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text.toUpperCase()) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0 || 1;
}

export function fixtureInstrument(symbol: string): Instrument {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized || normalized.length > 64) throw new RangeError('Synthetic symbol must contain 1 to 64 characters.');
  return { id: `SYNTHETIC:${normalized}`, symbol: normalized, name: normalized, exchange: 'SYNTHETIC', currency: 'USD', assetClass: ['SPY', 'IWM', 'QQQ', 'DIA', 'XLF', 'XLK'].includes(normalized) ? 'etf' : 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
}

/** Prefix-stable, original synthetic weekday data. Weekdays do not imply an exchange calendar. */
export function makeFixture(symbol: string, count = 500): Bar[] {
  const instrument = fixtureInstrument(symbol);
  if (!Number.isSafeInteger(count) || count < 0 || count > 100000) throw new RangeError('Fixture count must be an integer from 0 to 100000.');
  if (exampleShape(instrument.symbol)) return exampleDaily(instrument.symbol, count);
  let seed = hash(instrument.symbol);
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const round = (v: number) => Math.round(v * 100) / 100;
  const bars: Bar[] = [];
  let time = Date.UTC(2024, 0, 2) / 1000;
  let previous = 20 + hash(instrument.symbol) % 18000 / 100;
  for (let index = 0; index < count; index++) {
    while ([0, 6].includes(new Date(time * 1000).getUTCDay())) time += 86400;
    const open = round(Math.max(1, previous * (1 + (random() - 0.5) * 0.015)));
    const close = round(Math.max(1, open * (1 + (random() - 0.48) * 0.045 + Math.sin(index / 23) * 0.002)));
    const high = round(Math.max(open, close) * (1 + random() * 0.015));
    const low = round(Math.max(0.01, Math.min(open, close) * (1 - random() * 0.015)));
    const volume = Math.floor(100000 + random() * 4900000);
    bars.push({ time, open, high, low, close, volume });
    previous = close;
    time += 86400;
  }
  return bars;
}

export function fixtureDataset(symbol: string, count = 500): BarDataset {
  const instrument = fixtureInstrument(symbol);
  const bars = makeFixture(symbol, count), crypto = isExampleCrypto(instrument.symbol);
  return { instrument, bars, resolution: '1D', provenance: { providerId: FIXTURE_CAPABILITIES.id, providerName: FIXTURE_PROVIDER_NAME, datasetId: `${FIXTURE_CAPABILITIES.id}:${instrument.symbol}`, fixture: true, coverage: `${bars.length} generated ${crypto ? 'daily bars, every day of the week' : 'weekday bars'}; no real market coverage`, asOf: bars.at(-1)?.time ?? Date.UTC(2024, 0, 2) / 1000, delaySeconds: null, adjustment: 'raw', session: 'unknown', timezone: 'UTC', state: 'ready', license: 'Original OpenCandle generated fixtures, PolyForm-Noncommercial-1.0.0', revision: '1', notes: [FIXTURE_NOTICE, crypto ? 'Trades every day, around the clock, like a crypto market.' : 'Weekends skipped for chart demonstration only; exchange holidays are not modeled.'] } };
}

/** Explicitly synthetic quote construction for deterministic simulation only. */
export function fixtureQuote(instrumentId: string, bar: Bar, sequence: number): Quote {
  return { instrumentId, bid: Math.max(0.01, Math.round((bar.close - 0.01) * 100) / 100), ask: Math.round((bar.close + 0.01) * 100) / 100, eventTime: bar.time, receivedAt: bar.time, availableAt: bar.time, sequence, session: 'unknown', fixture: true };
}

/* ---- Example-mode shapes. In example mode (demo-mode.ts) the five example tickers get their own generated history:
 * BTC and ETH trade every day around the clock, and every ticker sits at a plausible price level. Legacy and off modes are unchanged. ---- */
interface ExampleProfile { crypto: boolean; first: number; last: number; sigma: number; volume: number }
const EXAMPLE_PROFILES: Record<string, ExampleProfile> = {
  BTC: { crypto: true, first: 320, last: 67850, sigma: 0.034, volume: 32000 },
  ETH: { crypto: true, first: 11, last: 3420, sigma: 0.044, volume: 420000 },
  SPY: { crypto: false, first: 112, last: 578.4, sigma: 0.0105, volume: 72000000 },
  GME: { crypto: false, first: 6.5, last: 24.3, sigma: 0.045, volume: 6500000 },
  AAPL: { crypto: false, first: 11.5, last: 228.4, sigma: 0.017, volume: 58000000 },
};
/** The newest example bar's day (UTC midnight), the same day the legacy 500-bar fixture ends on. */
const EXAMPLE_END = Date.UTC(2025, 11, 1) / 1000;
function exampleShape(symbol: string): ExampleProfile | null {
  return demoDataMode() === 'example' ? EXAMPLE_PROFILES[String(symbol ?? '').trim().toUpperCase()] ?? null : null;
}
/** True when `symbol` is currently served as an example crypto series (bars every day, around the clock). */
export function isExampleCrypto(symbol: string): boolean { return exampleShape(symbol)?.crypto === true; }
/** True when `symbol` is currently served with an example-mode shape (cache keys use it so legacy and example series never mix). */
export function isExampleShaped(symbol: string): boolean { return exampleShape(symbol) !== null; }
const exampleMemo = new Map<string, Bar[]>();
function exampleDaily(symbol: string, count: number): Bar[] {
  const key = symbol.trim().toUpperCase(), profile = EXAMPLE_PROFILES[key]!, n = Math.max(count, DEMO_DAILY_BARS), memoKey = `${key}:${n}`;
  let bars = exampleMemo.get(memoKey);
  if (!bars) {
    const times: number[] = [];
    for (let time = EXAMPLE_END; times.length < n; time -= 86400) if (profile.crypto || ![0, 6].includes(new Date(time * 1000).getUTCDay())) times.push(time);
    times.reverse();
    const random = rng(hash(`${key}:example`)), gauss = () => (random() + random() + random() + random() - 2) * 1.732;
    // Log price = a straight trend from `first` to `last` + a slow cycle + a mean-reverting wander, bridged so both ends are exact.
    const cycle = Math.min(0.5, profile.sigma * 11), period = profile.crypto ? 1460 : 1000, phase = random() * Math.PI * 2;
    const wander: number[] = []; let dev = 0;
    for (let k = 0; k < n; k++) { dev = dev * 0.994 + profile.sigma * gauss(); wander.push(dev + cycle * Math.sin(2 * Math.PI * k / period + phase)); }
    const a = Math.log(profile.first), b = Math.log(profile.last), last = Math.max(1, n - 1);
    bars = [];
    let previous = 0;
    for (let k = 0; k < n; k++) {
      const f = k / last, log = a + (b - a) * f + wander[k]! - wander[0]! * (1 - f) - wander[n - 1]! * f;
      const close = cents(Math.max(0.01, Math.exp(log)));
      const open = k === 0 ? cents(close * (1 + profile.sigma * 0.3 * gauss())) : profile.crypto ? previous : cents(Math.max(0.01, previous * (1 + profile.sigma * 0.25 * gauss())));
      const high = Math.max(cents(Math.max(open, close) * (1 + Math.abs(gauss()) * profile.sigma * 0.45)), open, close);
      const low = Math.min(cents(Math.max(0.01, Math.min(open, close) * (1 - Math.abs(gauss()) * profile.sigma * 0.45))), open, close);
      const move = previous > 0 ? Math.abs(close / previous - 1) / profile.sigma : 1;
      bars.push({ time: times[k]!, open, high, low, close, volume: Math.max(1, Math.floor(profile.volume * (0.5 + random()) * (1 + Math.min(2, move * 0.35)))) });
      previous = close;
    }
    if (exampleMemo.size >= 16) exampleMemo.clear();
    exampleMemo.set(memoKey, bars);
  }
  return bars.slice(bars.length - count).map(bar => ({ ...bar }));
}

/* ---- Deep, deterministic demo history for the app's demo provider (tests keep using makeFixture/fixtureDataset). ---- */
/** Daily bars the app's demo charts hold: about 15 years of weekdays (more makes every per-bar pipeline stage slower). The newest 500 are exactly makeFixture(symbol, 500). */
export const DEMO_DAILY_BARS = 3900;
/** Intraday session of the demo: weekdays 14:30-21:00 UTC (09:30-16:00 New York standard time). Holidays and DST are not modeled. */
export const DEMO_SESSION_START = 14.5 * 3600, DEMO_SESSION_SECONDS = 6.5 * 3600;
/** Intraday resolutions the demo serves as original sources (ids as the interval menu spells them). */
export const DEMO_INTRADAY_RESOLUTIONS = ['1m', '5m', '15m', '60m'] as const;
const SESSIONS_1M = 14, SESSIONS_5M = 100, SESSIONS_15M = 200, SESSIONS_60M = 720;

function rng(seed: number) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }; }
const cents = (v: number) => Math.round(v * 100) / 100;
function memo<T>(limit: number) {
  const map = new Map<string, T>();
  return {
    get: (key: string) => { const hit = map.get(key); if (hit !== undefined) { map.delete(key); map.set(key, hit); } return hit; },
    set: (key: string, value: T) => { map.set(key, value); while (map.size > limit) map.delete(map.keys().next().value!); return value; },
  };
}

/** makeFixture's walk, extended backwards in time. Only weekday bars older than the 500-bar tail are new; the tail is untouched. */
export function makeDeepDaily(symbol: string, count = DEMO_DAILY_BARS): Bar[] {
  if (exampleShape(symbol)) { if (!Number.isSafeInteger(count) || count < 0 || count > 100000) throw new RangeError('Deep daily count must be an integer up to 100000.'); return exampleDaily(symbol, count); }
  const tail = makeFixture(symbol, Math.min(count, 500));
  if (count <= 500) return tail;
  if (!Number.isSafeInteger(count) || count > 100000) throw new RangeError('Deep daily count must be an integer up to 100000.');
  const instrument = fixtureInstrument(symbol), random = rng(hash(`${instrument.symbol}:history`));
  const older: Bar[] = [];
  let time = tail[0]!.time, nextOpen = tail[0]!.open;
  for (let index = 0; index < count - 500; index++) {
    time -= 86400; while ([0, 6].includes(new Date(time * 1000).getUTCDay())) time -= 86400;
    const close = cents(Math.max(1, nextOpen / (1 + (random() - 0.5) * 0.015)));
    // Walking backwards with a mild upward forward drift, so older prices sit lower; the floor keeps them positive.
    const open = cents(Math.max(1, close / (1 + (random() - 0.4985) * 0.045 + Math.sin(index / 23) * 0.002)));
    const high = Math.max(cents(Math.max(open, close) * (1 + random() * 0.015)), open, close);
    const low = Math.min(cents(Math.max(0.01, Math.min(open, close) * (1 - random() * 0.015))), open, close);
    older.push({ time, open, high, low, close, volume: Math.floor(100000 + random() * 4900000) });
    nextOpen = open;
  }
  return older.reverse().concat(tail);
}

const dailyMemo = memo<Bar[]>(24);
function deepDaily(symbol: string): Bar[] {
  const key = symbol.trim().toUpperCase(), memoKey = (isExampleShaped(key) ? 'x:' : '') + key;
  return dailyMemo.get(memoKey) ?? dailyMemo.set(memoKey, makeDeepDaily(key));
}

/** The app's demo daily dataset: DEMO_DAILY_BARS bars, same instrument and dataset id as fixtureDataset(symbol). */
export function demoDailyDataset(symbol: string): BarDataset {
  const base = fixtureDataset(symbol, 0), bars = deepDaily(symbol);
  return { ...base, bars, provenance: { ...base.provenance, coverage: `${bars.length} generated ${isExampleCrypto(symbol) ? 'daily bars, every day of the week' : 'weekday bars'}; no real market coverage`, asOf: bars.at(-1)?.time ?? base.provenance.asOf } };
}

const volumeShape = (n: number) => {
  const raw = Array.from({ length: n }, (_, k) => 1 + 1.2 * Math.pow(Math.abs(2 * (k + 0.5) / n - 1), 2)), sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => v / sum);
};
const shapeCache = new Map<number, number[]>();
/** One session of n steps bridging the day's open to its close inside the day's range. Seeded by symbol and day only, so the
 * same day always yields the same bars however many sessions are requested. `offsets` (seconds from the session start) overrides equal steps. */
function sessionBars(symbolSeed: number, day: Bar, n: number, step: number, offsets?: number[], shareOf?: number[], sessionStart = DEMO_SESSION_START): Bar[] {
  const random = rng((symbolSeed ^ Math.imul((day.time / 86400) | 0, 2654435761)) >>> 0 || 1);
  random(); random();
  const lo = day.low, hi = day.high, span = Math.log(hi / lo) || 0.001, sd = span * 0.3 / Math.sqrt(n);
  const walk = [0]; for (let k = 1; k <= n; k++) walk.push(walk[k - 1]! + (random() + random() + random() - 1.5) * sd);
  const a = Math.log(day.open), b = Math.log(day.close), path: number[] = [];
  for (let k = 0; k <= n; k++) {
    const raw = k === 0 ? day.open : k === n ? day.close : Math.exp(a + (b - a) * k / n + walk[k]! - walk[n]! * k / n);
    path.push(cents(Math.min(hi, Math.max(lo, raw))));
  }
  let shape = shareOf; if (!shape) { shape = shapeCache.get(n); if (!shape) { shape = volumeShape(n); shapeCache.set(n, shape); } }
  const wick = span * 0.12 / Math.sqrt(n), start = day.time + sessionStart, out: Bar[] = [];
  for (let k = 0; k < n; k++) {
    const open = path[k]!, close = path[k + 1]!;
    const high = Math.min(hi, Math.max(cents(Math.max(open, close) * (1 + random() * wick)), open, close));
    const low = Math.max(lo, Math.min(cents(Math.min(open, close) * (1 - random() * wick)), open, close));
    out.push({ time: start + (offsets ? offsets[k]! : k * step), open, high, low, close, volume: Math.max(1, Math.floor(day.volume * shape[k]!)) });
  }
  return out;
}

/** Equal-width UTC clock buckets, the grouping the interval engine applies to an unanchored source. */
function regroup(bars: readonly Bar[], seconds: number): Bar[] {
  const out: Bar[] = [];
  for (const bar of bars) {
    const stamp = Math.floor(bar.time / seconds) * seconds, last = out.at(-1);
    if (last && last.time === stamp) { if (bar.high > last.high) last.high = bar.high; if (bar.low < last.low) last.low = bar.low; last.close = bar.close; last.volume += bar.volume; }
    else out.push({ ...bar, time: stamp });
  }
  return out;
}

export type DemoIntradaySet = Record<(typeof DEMO_INTRADAY_RESOLUTIONS)[number], Bar[]>;
const intradayMemo = memo<DemoIntradaySet>(6);
// Hour buckets by UTC clock: 14:00 holds the half hour 14:30-15:00, then six full hours (offsets from the 14:30 start).
const HOUR_OFFSETS = [0, 1800, 5400, 9000, 12600, 16200, 19800];
const HOUR_SHARES = [1, 2, 2, 2, 2, 2, 2].map((v, _, all) => v / all.reduce((a, b) => a + b, 0));
/** Deterministic intraday history. The newest 14 sessions are built minute by minute, the 186 before them five minutes at a
 * time, the 520 before those hourly. Coarser series regroup the finer one, so 5m/15m/60m agree with the 1m bars where they overlap. */
export function makeDemoIntraday(symbol: string): DemoIntradaySet {
  const key = symbol.trim().toUpperCase(), crypto = isExampleCrypto(key), memoKey = (isExampleShaped(key) ? 'x:' : '') + key, hit = intradayMemo.get(memoKey);
  if (hit) return hit;
  const days = deepDaily(key).slice(-SESSIONS_60M), seed = hash(`${key}:intraday`), total = days.length;
  if (crypto) {
    // An example crypto day is one 24-hour session from 00:00 UTC.
    const minute: Bar[] = [], five: Bar[] = [], hour: Bar[] = [];
    for (let d = 0; d < total; d++) {
      const age = total - 1 - d, day = days[d]!;
      if (age < SESSIONS_1M) { const bars = sessionBars(seed, day, 1440, 60, undefined, undefined, 0); for (const bar of bars) minute.push(bar); for (const bar of regroup(bars, 300)) five.push(bar); }
      else if (age < SESSIONS_15M) for (const bar of sessionBars(seed, day, 288, 300, undefined, undefined, 0)) five.push(bar);
      else for (const bar of sessionBars(seed, day, 24, 3600, undefined, undefined, 0)) hour.push(bar);
    }
    return intradayMemo.set(memoKey, { '1m': minute, '5m': five.slice(-SESSIONS_5M * 288), '15m': regroup(five, 900), '60m': hour.concat(regroup(five, 3600)) });
  }
  const oneMin: Bar[] = [], fiveMin: Bar[] = [], hourly: Bar[] = [];
  for (let d = 0; d < total; d++) {
    const age = total - 1 - d, day = days[d]!;
    if (age < SESSIONS_1M) { const bars = sessionBars(seed, day, 390, 60); for (const bar of bars) oneMin.push(bar); for (const bar of regroup(bars, 300)) fiveMin.push(bar); }
    else if (age < SESSIONS_15M) for (const bar of sessionBars(seed, day, 78, 300)) fiveMin.push(bar);
    else for (const bar of sessionBars(seed, day, 7, 0, HOUR_OFFSETS, HOUR_SHARES)) hourly.push({ ...bar, time: Math.floor(bar.time / 3600) * 3600 });
  }
  return intradayMemo.set(memoKey, { '1m': oneMin, '5m': fiveMin.slice(-SESSIONS_5M * 78), '15m': regroup(fiveMin, 900), '60m': hourly.concat(regroup(fiveMin, 3600)) });
}

/** The datasets for one demo symbol at each intraday resolution. Same instrument and provider as the daily dataset. */
export function demoIntradayDatasets(symbol: string): BarDataset[] {
  const instrument = fixtureInstrument(symbol), set = makeDemoIntraday(symbol), crypto = isExampleCrypto(symbol);
  const hours = crypto ? 'every day, around the clock' : 'on weekdays 14:30-21:00 UTC';
  return DEMO_INTRADAY_RESOLUTIONS.map(resolution => {
    const bars = set[resolution];
    return { instrument, bars, resolution, provenance: { providerId: FIXTURE_CAPABILITIES.id, providerName: FIXTURE_PROVIDER_NAME, datasetId: `${FIXTURE_CAPABILITIES.id}:${instrument.symbol}:${resolution}`, fixture: true, coverage: `${bars.length} generated ${resolution} bars ${hours}; no real market coverage`, asOf: bars.at(-1)?.time ?? 0, delaySeconds: null, adjustment: 'raw', session: 'unknown', timezone: 'UTC', state: 'ready', license: 'Original OpenCandle generated fixtures, PolyForm-Noncommercial-1.0.0', revision: '1', notes: [FIXTURE_NOTICE, crypto ? 'Trades every day, around the clock, like a crypto market.' : 'Weekdays 14:30-21:00 UTC only; exchange holidays and daylight saving are not modeled.'] } } as BarDataset;
  });
}

/** True for the exact synthetic demo sources the app generates (daily, legacy 500-bar daily, or one of the intraday series). */
export function isDemoSourceShape(dataset: BarDataset): boolean {
  const expected = fixtureInstrument(dataset.instrument.symbol), p = dataset.provenance;
  if (!(['id', 'symbol', 'exchange', 'currency', 'assetClass'] as const).every(key => dataset.instrument[key] === expected[key])) return false;
  if (!(p.fixture === true && p.providerId === FIXTURE_CAPABILITIES.id && p.revision === '1' && p.session === 'unknown' && p.adjustment === 'raw' && p.timezone === 'UTC')) return false;
  const base = `${FIXTURE_CAPABILITIES.id}:${expected.symbol}`;
  // A placeholder (no bars) keeps the demo identity, so saved charts still resolve while generated prices are hidden.
  if (dataset.resolution === '1D') return (dataset.bars.length === 0 || dataset.bars.length === 500 || dataset.bars.length === DEMO_DAILY_BARS) && p.datasetId === base;
  return (DEMO_INTRADAY_RESOLUTIONS as readonly string[]).includes(dataset.resolution) && p.datasetId === `${base}:${dataset.resolution}` && (dataset.bars.length === 0 || dataset.bars.length === makeDemoIntraday(expected.symbol)[dataset.resolution as keyof DemoIntradaySet].length);
}

/* ---- Placeholders. Same instrument and dataset id as the demo source, no bars, so a saved chart or watchlist row
 * keeps resolving while generated prices are hidden (src/domain/demo-mode.ts). The chart says it needs live data instead. ---- */
export const DEMO_PLACEHOLDER_COVERAGE = 'No data. This chart needs a live data source.';
export function demoPlaceholderDataset(symbol: string, resolution = '1D'): BarDataset {
  const base = fixtureDataset(symbol, 0), daily = resolution === '1D';
  if (!daily && !(DEMO_INTRADAY_RESOLUTIONS as readonly string[]).includes(resolution)) throw new RangeError('Unknown demo resolution.');
  return { ...base, bars: [], resolution, provenance: { ...base.provenance, datasetId: daily ? base.provenance.datasetId : `${base.provenance.datasetId}:${resolution}`, coverage: DEMO_PLACEHOLDER_COVERAGE, asOf: 0, notes: [DEMO_PLACEHOLDER_COVERAGE] } };
}
/** A saved dataset id on the demo source (daily or intraday), whose chart needs live data outside the legacy demo. */
export function isHiddenDemoSourceId(datasetId: string | null | undefined): boolean {
  return typeof datasetId === 'string' && datasetId.startsWith(`${FIXTURE_CAPABILITIES.id}:`);
}
/** A saved chart source that needs live data when it cannot be resolved: the hidden demo source, or a saved live
 *  feed ("live:<provider>:...", restored from the workspace's live chart record) that has not loaded. */
export function needsLiveSourceId(datasetId: string | null | undefined): boolean {
  return isHiddenDemoSourceId(datasetId) || typeof datasetId === 'string' && datasetId.startsWith('live:');
}
/** True for a demo-shaped source that holds no bars (the hidden-demo placeholder). */
export function isDemoPlaceholder(dataset: BarDataset | null | undefined): boolean {
  return !!dataset && dataset.provenance.fixture === true && dataset.provenance.providerId === FIXTURE_CAPABILITIES.id && dataset.instrument.exchange === 'SYNTHETIC' && dataset.bars.length === 0;
}
