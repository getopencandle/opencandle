import type { Bar, BarDataset, Instrument } from './types';
import { demoDataMode } from './demo-mode';
import { newYorkClock, newYorkWallTime, usEquitySessionBucket, usSessionPhase, usTradingDate, usTradingDayStart } from './us-market-hours';

export type IntervalUnit = 'second' | 'minute' | 'day' | 'week' | 'month' | 'tick' | 'range';
export interface IntervalSpec { id: string; unit: IntervalUnit; multiplier: number; kind: 'time' | 'event'; seconds: number | null; }
export interface AggregationPolicy {
  mode: 'utc-calendar'; timezone: 'UTC'; fixedAnchor: number; calendarAnchor: string;
  weekStartsOn: number; sourceCalendarLabels: 'utc-period'; sessionPolicy: 'preserve-source';
  /** Minute buckets anchor at the US equity session segments (09:30 open) instead of the UTC clock.
   * Absent on every other policy, so their stored identities are unchanged.
   * 'us-equity-trading-day' groups intraday US equity bars into day, week and month
   * buckets by their New York calendar date (bucket edges at New York midnight, DST-aware), so winter after-hours
   * minutes after 19:00 New York (00:00 UTC) stay on their own trading date instead of starting a UTC-dated bar.
   * It builds from regular-session bars only (the usual 1D for US stocks is regular session; extended
   * hours show only on intraday charts). Pre-market, after-hours and overnight source rows are left out of the buckets.
   * 'us-equity-trading-day-extended' is the opt-in alternative that folds every bar into its trading day
   * (usTradingDate): pre-market and after-hours on their own date, overnight from 20:00 on the next trading day. Its
   * buckets run from the previous trading day's after-hours end and are stamped at New York midnight of the first date. */
  anchor?: 'us-equity-session' | 'us-equity-trading-day' | 'us-equity-trading-day-extended';
}
export interface IntervalMenuState { schemaVersion: 1; custom: string[]; favorites: string[]; hidden: string[]; policy: AggregationPolicy; }
export interface IntervalBucket {
  start: number; end: number; sourceFirstIndex: number; sourceLastIndex: number;
  sourceFirstTime: number; sourceLastTime: number; observedBars: number;
  expectedClockSlots: number | null; clockCoverage: 'full-clock' | 'partial-clock' | 'unknown';
  terminal: boolean; availableAt: null; completion: 'unknown';
}
export interface IntervalDerivation {
  schemaVersion: 1; sourceKey: string; sourceDatasetId: string; sourceRevision: string;
  sourceResolution: string; target: string; policy: AggregationPolicy;
  inputBars: number; contentFingerprint: string; buckets: IntervalBucket[];
  historicalAvailability: 'unknown';
}
export interface DerivedIntervalDataset extends BarDataset { derivation: IntervalDerivation; }
export interface IntervalSourceChoice { key: string; label: string; resolution: string; exact: boolean; derived: boolean; }
export interface IntervalSuccess {
  ok: true; kind: 'exact' | 'derived'; dataset: BarDataset | DerivedIntervalDataset;
  derivation: IntervalDerivation | null; policies: string[];
  coverage: { inputBars: number; outputBars: number; partialClockBuckets: number; availability: 'unknown' };
}
export interface IntervalFailure { ok: false; code: string; message: string; candidates: IntervalSourceChoice[]; }
export type IntervalResult = IntervalSuccess | IntervalFailure;

const MIN_TIME = -62135596800, MAX_TIME = 253402300799, DAY = 86400;
const SECONDS = [1, 5, 10, 15, 30, 45], EVENT_COUNTS = [1, 10, 100, 1000];
const SUFFIX: Record<IntervalUnit, string> = { second: 's', minute: 'm', day: 'D', week: 'W', month: 'M', tick: 'T', range: 'R' };
export const DEFAULT_AGGREGATION_POLICY: AggregationPolicy = {
  mode: 'utc-calendar', timezone: 'UTC', fixedAnchor: 0, calendarAnchor: '1970-01-01',
  weekStartsOn: 1, sourceCalendarLabels: 'utc-period', sessionPolicy: 'preserve-source',
};
export const INTERVAL_POLICIES = [
  'Exact supplied intervals retain their original bars, timestamp convention, session and adjustment basis. Multiple matching sources require an explicit selection.',
  'Local aggregation uses UTC clock and calendar boundaries. Minute buckets of US equities (stocks and ETFs on a US exchange) anchor at the New York session instead: 1-hour bars open at 09:30, 10:30 and so on, and pre-market (04:00), regular (09:30), after-hours (the close) and overnight segments each start their own buckets, with New York daylight saving and listed 13:00 early closes applied. Daily, weekly and monthly bars built from intraday US equity bars use regular-session bars only, dated by the New York trading day; an extended-hours option folds pre-market and after-hours into the same trading day and overnight bars from 20:00 into the next one. Other daily and longer buckets stay on UTC calendar dates.',
  'Fixed source bars are opening timestamps with the declared duration. Single calendar-period source labels identify their UTC date, week or month under this explicit local policy.',
  'The source session and adjustment basis are preserved. Missing or extended-session prices are never added, and missing buckets are not filled.',
  'Loaded OHLC values are final snapshots or supplied revisions. Opening/event timestamps do not establish when those values became available. This is not point-in-time historical reconstruction.',
  'Continuous-clock coverage counts include weekends and closures. A partial clock count does not establish missing exchange data. All completion states remain unknown.',
  'Coarser bars cannot supply finer bars. A source bar crossing a requested boundary is rejected rather than split. Derived snapshots must be rebuilt from an original source.',
];

function object(input: unknown): input is Record<string, unknown> { return typeof input === 'object' && input !== null && !Array.isArray(input); }
function keys(input: Record<string, unknown>, allowed: string[], label: string) { if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error(`Unknown ${label} field.`); }
function timestamp(value: unknown, label: string) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < MIN_TIME || value > MAX_TIME) throw new Error(`${label} must be a Unix second in years 0001 to 9999.`); return value; }
/** Calendar anchors are a handful of fixed strings evaluated once per bucket; only valid results are kept. */
const anchorSeconds = new Map<string, number>();
function dateSeconds(value: unknown): number {
  if (typeof value === 'string') { const known = anchorSeconds.get(value); if (known !== undefined) return known; }
  const result = checkedDateSeconds(value);
  if (anchorSeconds.size > 256) anchorSeconds.clear();
  anchorSeconds.set(value as string, result);
  return result;
}
function checkedDateSeconds(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new Error('Calendar anchor must be YYYY-MM-DD in years 0001 to 9999.');
  const result = Date.parse(value + 'T00:00:00Z') / 1000;
  if (!Number.isFinite(result) || new Date(result * 1000).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar anchor date.');
  return timestamp(result, 'Calendar anchor');
}

/** LV input syntax. Uppercase M is months; lowercase m and bare integers are minutes. */
export function parseInterval(input: string): IntervalSpec {
  if (typeof input !== 'string' || input.length > 40) throw new Error('Interval text is limited to 40 characters.');
  const match = input.trim().match(/^(\d+(?:\.\d+)?)?\s*([A-Za-z]+)?$/);
  if (!match || !match[1] && !match[2]) throw new Error('Enter a time interval such as 5, 150m, 2.5h, 1D, 1W or 3M.');
  let multiplier = match[1] ? Number(match[1]) : 1;
  const suffix = match[2] ?? ''; let unit: IntervalUnit;
  if (suffix === 'M' || /^(mo|mon|month|months)$/i.test(suffix)) unit = 'month';
  else if (/^(h|hr|hour|hours)$/i.test(suffix)) {
    unit = 'minute'; const [whole, fraction = ''] = (match[1] ?? '1').split('.');
    const denominator = 10n ** BigInt(fraction.length), minutes = BigInt(whole + fraction) * 60n;
    if (minutes % denominator !== 0n) throw new Error('Decimal hours must resolve to an integer minute.');
    multiplier = Number(minutes / denominator);
  }
  else if (suffix === '' || /^(m|min|minute|minutes)$/i.test(suffix)) unit = 'minute';
  else if (/^(s|sec|second|seconds)$/i.test(suffix)) unit = 'second';
  else if (/^(d|day|days)$/i.test(suffix)) unit = 'day';
  else if (/^(w|week|weeks)$/i.test(suffix)) unit = 'week';
  else if (/^(t|tick|ticks)$/i.test(suffix)) unit = 'tick';
  else if (/^(r|range|ranges)$/i.test(suffix)) unit = 'range';
  else throw new Error('Unknown interval unit. Uppercase M means months; lowercase m means minutes.');
  if (!Number.isSafeInteger(multiplier) || multiplier < 1) throw new Error('Interval multiplier must resolve to a positive integer.');
  if (unit === 'second' && !SECONDS.includes(multiplier)) throw new Error('Supported second intervals are 1, 5, 10, 15, 30 and 45.');
  if ((unit === 'tick' || unit === 'range') && !EVENT_COUNTS.includes(multiplier)) throw new Error('Supported tick/range interval labels are 1, 10, 100 and 1000; construction requires actual event data.');
  const maximum: Partial<Record<IntervalUnit, number>> = { minute: 1440, day: 365, week: 52, month: 12 };
  if (maximum[unit] !== undefined && multiplier > maximum[unit]!) throw new Error(`${unit} multiplier exceeds the declared local limit of ${maximum[unit]}.`);
  return { id: `${multiplier}${SUFFIX[unit]}`, unit, multiplier, kind: unit === 'tick' || unit === 'range' ? 'event' : 'time', seconds: unit === 'second' ? multiplier : unit === 'minute' ? multiplier * 60 : null };
}
export function intervalLabel(value: IntervalSpec | string) { const spec = typeof value === 'string' ? parseInterval(value) : value; const hours = spec.unit === 'minute' && spec.multiplier % 60 === 0 ? spec.multiplier / 60 : null; return hours !== null ? `${hours} hour${hours === 1 ? '' : 's'}` : `${spec.multiplier} ${spec.unit}${spec.multiplier === 1 ? '' : 's'}`; }
export const STANDARD_INTERVALS = ['1T', '10T', '100T', '1000T', '1s', '5s', '10s', '15s', '30s', '45s', '1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m', '60m', '120m', '180m', '240m', '1D', '1W', '1M', '3M', '6M', '12M', '1R', '10R', '100R', '1000R'].map(parseInterval);
const STANDARD_IDS = new Set(STANDARD_INTERVALS.map(interval => interval.id));
export function restoreAggregationPolicy(input: unknown): AggregationPolicy {
  if (!object(input)) throw new Error('Invalid aggregation policy.');
  keys(input, ['mode', 'timezone', 'fixedAnchor', 'calendarAnchor', 'weekStartsOn', 'sourceCalendarLabels', 'sessionPolicy', 'anchor'], 'aggregation policy');
  if (input.mode !== 'utc-calendar' || input.timezone !== 'UTC' || input.sourceCalendarLabels !== 'utc-period' || input.sessionPolicy !== 'preserve-source') throw new Error('Only the explicit UTC calendar/preserve-source policy is implemented. Exchange calendar aggregation remains unavailable.');
  timestamp(input.fixedAnchor, 'Fixed anchor'); dateSeconds(input.calendarAnchor);
  if (typeof input.weekStartsOn !== 'number' || !Number.isInteger(input.weekStartsOn) || input.weekStartsOn < 0 || input.weekStartsOn > 6) throw new Error('Week starts on an integer weekday from 0 Sunday to 6 Saturday.');
  if (input.anchor !== undefined && input.anchor !== 'us-equity-session' && input.anchor !== 'us-equity-trading-day' && input.anchor !== 'us-equity-trading-day-extended') throw new Error('Unknown aggregation anchor.');
  return { mode: 'utc-calendar', timezone: 'UTC', fixedAnchor: input.fixedAnchor as number, calendarAnchor: input.calendarAnchor as string, weekStartsOn: input.weekStartsOn, sourceCalendarLabels: 'utc-period', sessionPolicy: 'preserve-source', ...(input.anchor ? { anchor: input.anchor } : {}) };
}
/** Exchange codes LV treats as US equity venues (Alpaca writes 'US'; imports name the listing exchange). */
export const US_EQUITY_EXCHANGES: ReadonlySet<string> = new Set(['US', 'NYSE', 'NASDAQ', 'AMEX', 'NYSEAMERICAN', 'NYSE-AMERICAN', 'NYSEARCA', 'NYSE-ARCA', 'ARCA', 'BATS', 'CBOE', 'CBOE-BZX', 'BZX', 'IEX', 'NMS', 'NGS', 'NCM', 'XNYS', 'XNAS', 'XASE', 'ARCX', 'BATS-BZX']);
/** A stock or ETF on a US exchange. Its intraday buckets anchor at the New York session. */
export function isUsEquityInstrument(instrument: Pick<Instrument, 'exchange' | 'assetClass'> | null | undefined): boolean {
  return !!instrument && (instrument.assetClass === 'stock' || instrument.assetClass === 'etf') && typeof instrument.exchange === 'string' && US_EQUITY_EXCHANGES.has(instrument.exchange.toUpperCase());
}
/** The policy local aggregation applies: US equity minute targets gain the session anchor; everything else keeps the
 * supplied policy unchanged (same identity as before). */
export function effectiveAggregationPolicy(policy: AggregationPolicy, instrument: Pick<Instrument, 'exchange' | 'assetClass'> | null | undefined, target: string, sourceResolution?: string): AggregationPolicy {
  const checked = restoreAggregationPolicy(policy);
  if (checked.anchor === 'us-equity-trading-day-extended') {
    // The extended-hours option only replaces the regular-session trading-day anchor where that would apply.
    const { anchor: _anchor, ...plain } = checked, effective = effectiveAggregationPolicy(plain, instrument, target, sourceResolution);
    return effective.anchor === 'us-equity-trading-day' ? { ...effective, anchor: 'us-equity-trading-day-extended' } : effective;
  }
  if (checked.anchor || !isUsEquityInstrument(instrument)) return checked;
  const unit = parseInterval(target).unit;
  if (unit === 'minute') return { ...checked, anchor: 'us-equity-session' };
  // EXCHANGE_GAP: only an intraday source is regrouped by New York trading date. Date-labelled daily sources keep the
  // UTC calendar labels they were imported with (re-dating them in New York would move every bar a day back).
  if ((unit === 'day' || unit === 'week' || unit === 'month') && sourceResolution !== undefined) {
    const source = parseInterval(sourceResolution);
    if (source.kind === 'time' && source.seconds !== null && source.seconds < DAY) return { ...checked, anchor: 'us-equity-trading-day' };
  }
  return checked;
}
export function createIntervalMenuState(): IntervalMenuState { return { schemaVersion: 1, custom: [], favorites: [], hidden: [], policy: { ...DEFAULT_AGGREGATION_POLICY } }; }
function ids(input: unknown, limit: number, label: string): string[] {
  if (!Array.isArray(input) || input.length > limit || input.some(value => typeof value !== 'string')) throw new Error(`Invalid or oversized ${label} list.`);
  const output = input.map(value => parseInterval(value).id); if (new Set(output).size !== output.length) throw new Error(`Duplicate ${label} interval.`); return output;
}
export function restoreIntervalMenuState(input: unknown): IntervalMenuState {
  if (!object(input) || input.schemaVersion !== 1) throw new Error('Invalid interval menu state.');
  keys(input, ['schemaVersion', 'custom', 'favorites', 'hidden', 'policy'], 'interval state');
  const custom = ids(input.custom, 100, 'custom'), favorites = ids(input.favorites, 132, 'favorite'), hidden = ids(input.hidden, 132, 'hidden');
  if (custom.some(id => STANDARD_IDS.has(id))) throw new Error('Standard presets do not belong in the custom list.');
  const known = new Set([...STANDARD_IDS, ...custom]);
  if ([...favorites, ...hidden].some(id => !known.has(id)) || favorites.some(id => hidden.includes(id))) throw new Error('Favorite/hidden intervals must exist in the menu and cannot overlap.');
  return { schemaVersion: 1, custom, favorites, hidden, policy: restoreAggregationPolicy(input.policy) };
}
export type IntervalMenuAction = { type: 'add' | 'favorite' | 'hide' | 'remove'; interval: string } | { type: 'reset' } | { type: 'policy'; policy: AggregationPolicy };
export function editIntervalMenu(state: IntervalMenuState, action: IntervalMenuAction): IntervalMenuState {
  const next = restoreIntervalMenuState(state);
  if (action.type === 'reset') return createIntervalMenuState();
  if (action.type === 'policy') return restoreIntervalMenuState({ ...next, policy: action.policy });
  if (!['add', 'favorite', 'hide', 'remove'].includes(action.type)) throw new Error('Unknown interval menu action.');
  const id = parseInterval(action.interval).id;
  if (action.type === 'remove') {
    if (!next.custom.includes(id)) throw new Error('Only custom intervals can be removed; hide a standard interval instead.');
    return restoreIntervalMenuState({ ...next, custom: next.custom.filter(value => value !== id), favorites: next.favorites.filter(value => value !== id), hidden: next.hidden.filter(value => value !== id) });
  }
  if (!STANDARD_IDS.has(id) && !next.custom.includes(id)) next.custom.push(id);
  if (action.type === 'hide') { if (!next.hidden.includes(id)) next.hidden.push(id); next.favorites = next.favorites.filter(value => value !== id); }
  else { next.hidden = next.hidden.filter(value => value !== id); if (action.type === 'favorite') next.favorites = sortIntervalIds(next.favorites.includes(id) ? next.favorites.filter(value => value !== id) : [...next.favorites, id]); }
  return restoreIntervalMenuState(next);
}
/** Nominal length for ordering only (month = 30 days). Event intervals sort after every time interval. */
export function intervalOrderSeconds(value: IntervalSpec | string): number {
  const spec = typeof value === 'string' ? parseInterval(value) : value;
  if (spec.kind === 'event') return 1e12 + spec.multiplier;
  if (spec.seconds !== null) return spec.seconds;
  return spec.multiplier * (spec.unit === 'day' ? DAY : spec.unit === 'week' ? 7 * DAY : 30 * DAY);
}
/** Toolbar order: ascending duration. Unparseable ids are dropped. */
export function sortIntervalIds(ids: readonly string[]): string[] {
  const rows: { id: string; order: number }[] = [];
  for (const id of ids) { try { rows.push({ id, order: intervalOrderSeconds(id) }); } catch { /* skipped */ } }
  return rows.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1)).map(row => row.id);
}
/** Start of the UTC-policy bucket holding `time` for `target`, and its end. Used by live aggregation so live bars match local aggregation. */
export function intervalBucketRange(time: number, target: string, policy: AggregationPolicy = DEFAULT_AGGREGATION_POLICY): { start: number; end: number } {
  return bucket(time, parseInterval(target), restoreAggregationPolicy(policy));
}
export function intervalMenuEntries(state: IntervalMenuState): IntervalSpec[] { const checked = restoreIntervalMenuState(state); return [...STANDARD_INTERVALS, ...checked.custom.map(parseInterval)].filter(spec => !checked.hidden.includes(spec.id)).map(spec => ({ ...spec })); }

function canonicalResolution(value: string) { try { return parseInterval(value).id; } catch { return value; } }
/** Excludes revision so an explicit source choice survives corrections; resolution remains part of identity. */
export function intervalDatasetKey(dataset: BarDataset): string {
  const values = [dataset.instrument?.id, dataset.provenance?.providerId, dataset.provenance?.datasetId, dataset.resolution];
  if (values.some(value => typeof value !== 'string' || !value || value.length > 4096)) throw new Error('Dataset identity requires bounded instrument, provider, dataset and resolution strings.');
  return JSON.stringify([values[0], values[1], values[2], canonicalResolution(values[3])]);
}
/** Outside the legacy demo the source reads as a name and an interval (no dataset id, no SYNTHETIC tag);
 *  a demo-identity source is Example data in example mode, otherwise No data. */
function intervalSourceLabel(dataset: BarDataset): string {
  if (demoDataMode() === 'legacy') return `${dataset.provenance.providerName} | ${dataset.resolution} | ${dataset.provenance.datasetId}${dataset.provenance.fixture ? ' | SYNTHETIC' : ''}`;
  const minutes = /^(\d+)m$/.exec(dataset.resolution), interval = minutes && Number(minutes[1]) > 0 && Number(minutes[1]) % 60 === 0 ? Number(minutes[1]) / 60 + 'h' : dataset.resolution;
  const name = dataset.provenance.fixture ? (demoDataMode() === 'example' ? 'Example data' : 'No data') : dataset.provenance.providerName;
  return `${name} | ${interval}${isDerived(dataset) ? ' | built from finer bars' : ''}`;
}
function isDerived(dataset: BarDataset): boolean { return 'derivation' in dataset || dataset.provenance.providerId === 'lv-local-aggregation'; }
export function listIntervalSources(datasets: readonly BarDataset[], instrumentId: string, target: string): IntervalSourceChoice[] {
  const spec = parseInterval(target);
  if (datasets.length > 2000) throw new Error('Too many loaded datasets.');
  return datasets.filter(dataset => dataset.instrument.id === instrumentId).map(dataset => ({ key: intervalDatasetKey(dataset), label: intervalSourceLabel(dataset), resolution: dataset.resolution, exact: canonicalResolution(dataset.resolution) === spec.id, derived: isDerived(dataset) }));
}
/** Per-array memo of the bar scan results. An entry is trusted only while the same bar objects still hold the
 * recorded values (sameBars), so in-place edits, appends and replacements all miss; identity answers never skip that check. */
const barMemo = new WeakMap<readonly Bar[], { refs: readonly Bar[]; values: Float64Array; validated: boolean; fingerprints: Map<string, string> }>();
function memoFor(bars: readonly Bar[]) {
  const hit = barMemo.get(bars);
  if (hit && sameBars(bars, hit.refs, hit.values)) return hit;
  const values = barValues(bars);
  if (!values) { barMemo.delete(bars); return null; }
  const entry = { refs: bars.slice(), values, validated: false, fingerprints: new Map<string, string>() };
  barMemo.set(bars, entry);
  return entry;
}
function validateBars(dataset: BarDataset): void {
  intervalDatasetKey(dataset);
  if (!Array.isArray(dataset.bars) || !dataset.bars.length) throw new Error('This chart has no data yet. Set up live data in Data sources.');
  if (dataset.bars.length > 100000) throw new Error('An interval source needs 1 to 100000 supplied bars.');
  const memo = memoFor(dataset.bars);
  if (memo?.validated) return;
  let previous = -Infinity;
  for (const bar of dataset.bars) {
    if (!object(bar) || ['time', 'open', 'high', 'low', 'close', 'volume'].some(key => typeof bar[key] !== 'number' || !Number.isFinite(bar[key]))) throw new Error('Source bars require finite numeric OHLCV and time.');
    timestamp(bar.time, 'Bar time');
    if (bar.time <= previous || Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high) || bar.volume < 0 || Number.isInteger(bar.volume) && !Number.isSafeInteger(bar.volume)) throw new Error('Source bars must be chronological, unique and contain consistent positive equity OHLC and nonnegative safe volume.');
    previous = bar.time;
  }
  if (memo) memo.validated = true;
}
function monthIndex(time: number) { const date = new Date(time * 1000); return date.getUTCFullYear() * 12 + date.getUTCMonth(); }
function monthTime(index: number) { const date = new Date(0); date.setUTCFullYear(Math.floor(index / 12), ((index % 12) + 12) % 12, 1); date.setUTCHours(0, 0, 0, 0); return date.getTime() / 1000; }
/** Date.parse(date + 'T00:00:00Z') / 1000 by civil-day arithmetic (proleptic Gregorian, as Date uses). Any text that
 * is not a plain YYYY-MM-DD with a valid month and day still goes through Date.parse, so its result is unchanged. */
export function isoDaySeconds(date: string): number {
  if (date.length !== 10 || date[4] !== '-' || date[7] !== '-') return Date.parse(date + 'T00:00:00Z') / 1000;
  let y = 0, m = 0, d = 0;
  for (let i = 0; i < 10; i++) { if (i === 4 || i === 7) continue; const c = date.charCodeAt(i) - 48; if (c < 0 || c > 9) return Date.parse(date + 'T00:00:00Z') / 1000; if (i < 4) y = y * 10 + c; else if (i < 7) m = m * 10 + c; else d = d * 10 + c; }
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (!days || d < 1 || d > days) return Date.parse(date + 'T00:00:00Z') / 1000;
  const yy = y - (m <= 2 ? 1 : 0), era = Math.floor(yy / 400), yoe = yy - era * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return (era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468) * DAY;
}
const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const tradingDayAnchor = (policy: AggregationPolicy) => policy.anchor === 'us-equity-trading-day' || policy.anchor === 'us-equity-trading-day-extended';
/** The bucket [start, end) holding an instant, and the timestamp its output bar carries (the start unless stated). */
function bucket(time: number, spec: IntervalSpec, policy: AggregationPolicy): { start: number; end: number; label?: number } {
  let start: number, end: number, label: number | undefined;
  if (tradingDayAnchor(policy) && spec.seconds === null && (spec.unit === 'day' || spec.unit === 'week' || spec.unit === 'month')) {
    // The trading date, bucketed with the ordinary calendar rule. Regular-session buckets edge at New York midnight
    // (a regular bar's trading date is its New York calendar date, so usTradingDate and the clock date agree there).
    // Extended buckets run from the after-hours end of the trading day before the first date to that of the last one.
    const extended = policy.anchor === 'us-equity-trading-day-extended', { anchor: _anchor, ...calendar } = policy;
    const dated = bucket(isoDaySeconds(extended ? usTradingDate(time) : newYorkClock(time).date), spec, calendar);
    if (extended) { start = usTradingDayStart(isoDate(dated.start)); end = usTradingDayStart(isoDate(dated.end)); label = newYorkWallTime(isoDate(dated.start), 0); }
    else { start = newYorkWallTime(isoDate(dated.start), 0); end = newYorkWallTime(isoDate(dated.end), 0); }
  }
  else if (policy.anchor === 'us-equity-session' && spec.unit === 'minute') ({ start, end } = usEquitySessionBucket(time, spec.multiplier));
  else if (spec.seconds !== null) { start = Math.floor((time - policy.fixedAnchor) / spec.seconds) * spec.seconds + policy.fixedAnchor; end = start + spec.seconds; }
  else if (spec.unit === 'day' || spec.unit === 'week') {
    const anchor = dateSeconds(policy.calendarAnchor), weekday = new Date(anchor * 1000).getUTCDay();
    const origin = spec.unit === 'day' ? anchor : anchor - ((weekday - policy.weekStartsOn + 7) % 7) * DAY;
    const duration = DAY * spec.multiplier * (spec.unit === 'week' ? 7 : 1);
    start = Math.floor((time - origin) / duration) * duration + origin; end = start + duration;
  } else if (spec.unit === 'month') {
    const anchor = monthIndex(dateSeconds(policy.calendarAnchor)), index = anchor + Math.floor((monthIndex(time) - anchor) / spec.multiplier) * spec.multiplier;
    start = monthTime(index); end = monthTime(index + spec.multiplier);
  } else throw new Error('Tick and range construction needs actual event data; OHLCV resampling cannot create it.');
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < MIN_TIME || end > MAX_TIME + 1 || end <= start) throw new Error('An aggregation boundary falls outside years 0001 to 9999.');
  return label === undefined ? { start, end } : { start, end, label };
}
/** The regular-session trading-day anchor leaves non-regular intraday rows out of day, week and month bars. */
function regularOnly(spec: IntervalSpec, policy: AggregationPolicy) { return policy.anchor === 'us-equity-trading-day' && spec.seconds === null && (spec.unit === 'day' || spec.unit === 'week' || spec.unit === 'month'); }
function sourceWindow(bar: Bar, spec: IntervalSpec, policy: AggregationPolicy) {
  // Session-anchored sources (for example 1-hour bars opening 09:30 ... 15:30) end at their own segment cut; a bar that
  // does not open on a session bucket keeps its full duration and is rejected if it crosses a target boundary.
  if (policy.anchor === 'us-equity-session' && spec.unit === 'minute') { const own = usEquitySessionBucket(bar.time, spec.multiplier); if (own.start === bar.time) return own; }
  if (spec.seconds !== null) return { start: bar.time, end: bar.time + spec.seconds };
  if (spec.multiplier !== 1) throw new Error('Resampling multi-day/week/month source bars needs their original period anchors. Choose single-period or intraday source bars instead.');
  return bucket(bar.time, spec, policy);
}
function expectedSlots(window: { start: number; end: number }, source: IntervalSpec): number | null {
  if (source.seconds !== null) { const value = (window.end - window.start) / source.seconds; return Number.isSafeInteger(value) ? value : null; }
  if (source.unit === 'day' || source.unit === 'week') { const value = (window.end - window.start) / (DAY * (source.unit === 'week' ? 7 : 1)); return Number.isSafeInteger(value) ? value : null; }
  if (source.unit === 'month') return monthIndex(window.end) - monthIndex(window.start);
  return null;
}
/** Non-cryptographic deterministic content identity, not a security or release artifact hash. */
function contentFingerprint(dataset: BarDataset): string {
  const head = JSON.stringify([dataset.provenance.revision, dataset.resolution, dataset.provenance.adjustment, dataset.provenance.session, dataset.provenance.timezone, dataset.provenance.asOf, dataset.provenance.fixture, dataset.instrument.currency, dataset.instrument.timezone]);
  const memo = memoFor(dataset.bars), cached = memo?.fingerprints.get(head);
  if (cached !== undefined) return cached;
  let a = 2166136261, b = 2246822519;
  const feed = (text: string) => { for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 3266489917); } };
  feed(head);
  for (const bar of dataset.bars) feed(`${bar.time},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume};`);
  const result = (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  if (memo) { if (memo.fingerprints.size > 8) memo.fingerprints.clear(); memo.fingerprints.set(head, result); }
  return result;
}
function derivedId(sourceKey: string, target: string, policy: AggregationPolicy) {
  const id = 'lv-aggregate:' + encodeURIComponent(JSON.stringify([sourceKey, target, policy]));
  if (id.length > 4096) throw new Error('Derived source identity exceeds the supported 4096-character limit.');
  return id;
}
/** Validates declared lineage structure and consistency, not the truth of an imported source. */
export function restoreIntervalDerivation(input: unknown, dataset?: BarDataset): IntervalDerivation {
  if (!object(input) || input.schemaVersion !== 1) throw new Error('Invalid interval derivation.');
  keys(input, ['schemaVersion', 'sourceKey', 'sourceDatasetId', 'sourceRevision', 'sourceResolution', 'target', 'policy', 'inputBars', 'contentFingerprint', 'buckets', 'historicalAvailability'], 'interval derivation');
  for (const [name, max] of [['sourceKey', 20000], ['sourceDatasetId', 4096], ['sourceRevision', 1024], ['sourceResolution', 40], ['target', 40]] as const) if (typeof input[name] !== 'string' || !input[name] || (input[name] as string).length > max) throw new Error(`Invalid derivation ${name}.`);
  const policy = restoreAggregationPolicy(input.policy), target = parseInterval(input.target as string), source = parseInterval(input.sourceResolution as string);
  if (target.kind !== 'time' || source.kind !== 'time' || target.id === source.id || source.seconds === null && source.multiplier !== 1 || target.id !== input.target || input.historicalAvailability !== 'unknown' || typeof input.contentFingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(input.contentFingerprint) || typeof input.inputBars !== 'number' || !Number.isSafeInteger(input.inputBars) || input.inputBars < 1 || input.inputBars > 100000) throw new Error('Invalid interval derivation metadata or unresolved source-period anchors.');
  let identity: unknown; try { identity = JSON.parse(input.sourceKey as string); } catch { throw new Error('Invalid source identity in derivation.'); }
  if (!Array.isArray(identity) || identity.length !== 4 || identity.some(value => typeof value !== 'string' || !value || value.length > 4096) || identity[2] !== input.sourceDatasetId || identity[3] !== source.id || identity[1] === 'lv-local-aggregation') throw new Error('Derivation source identity disagrees with its declared original source.');
  if (!Array.isArray(input.buckets) || !input.buckets.length || input.buckets.length > input.inputBars) throw new Error('Invalid derivation bucket count.');
  let previousEnd = -Infinity, nextSourceIndex = 0;
  const regular = regularOnly(target, policy) && source.seconds !== null && source.seconds < DAY;
  const buckets: IntervalBucket[] = input.buckets.map((value: unknown, index: number) => {
    if (!object(value)) throw new Error('Invalid derivation bucket.');
    keys(value, ['start', 'end', 'sourceFirstIndex', 'sourceLastIndex', 'sourceFirstTime', 'sourceLastTime', 'observedBars', 'expectedClockSlots', 'clockCoverage', 'terminal', 'availableAt', 'completion'], 'derivation bucket');
    const start = timestamp(value.start, 'Bucket start'), firstTime = timestamp(value.sourceFirstTime, 'First source time'), lastTime = timestamp(value.sourceLastTime, 'Last source time');
    if (typeof value.end !== 'number' || !Number.isSafeInteger(value.end) || value.end > MAX_TIME + 1 || value.end <= start || start < previousEnd || firstTime > lastTime || firstTime < start || lastTime >= value.end) throw new Error('Invalid or overlapping derivation bucket boundaries.');
    const expected = bucket(start, target, policy);
    if (expected.start !== start || expected.end !== value.end) throw new Error('Derivation bucket boundaries disagree with its interval policy.');
    for (const key of ['sourceFirstIndex', 'sourceLastIndex', 'observedBars'] as const) if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid derivation source indices.');
    const first = value.sourceFirstIndex as number, last = value.sourceLastIndex as number, observed = value.observedBars as number;
    // A regular-session lineage skips the extended rows between its regular rows; the rows it names must then open in the
    // regular session. A contiguous lineage (every row, as saved by older versions) keeps the exact-cover rule.
    const contiguous = first === nextSourceIndex && observed === last - first + 1;
    if (last < first || last >= (input.inputBars as number) || !contiguous && !(regular && first >= nextSourceIndex && observed <= last - first + 1 && usSessionPhase(firstTime) === 'regular' && usSessionPhase(lastTime) === 'regular')) throw new Error('Derivation indices must cover each source row exactly once in order.');
    const firstWindow = sourceWindow({ time: firstTime } as Bar, source, policy), lastWindow = sourceWindow({ time: lastTime } as Bar, source, policy);
    if (firstWindow.start < start || lastWindow.end > value.end || observed === 1 && firstTime !== lastTime || observed > 1 && firstWindow.end > lastWindow.start || source.seconds !== null && !policy.anchor && observed * source.seconds > lastWindow.end - firstWindow.start) throw new Error('Declared source windows cross a bucket boundary or cannot contain the claimed nonoverlapping source rows.');
    const slots = expectedSlots(expected, source), coverage = slots === null ? 'unknown' : slots === observed ? 'full-clock' : 'partial-clock';
    if (value.expectedClockSlots !== slots || slots !== null && observed > slots || value.clockCoverage !== coverage || value.terminal !== (index === (input.buckets as unknown[]).length - 1) || value.availableAt !== null || value.completion !== 'unknown') throw new Error('Derivation coverage or availability claims are inconsistent.');
    previousEnd = value.end; nextSourceIndex = last + 1;
    return { start, end: value.end, sourceFirstIndex: first, sourceLastIndex: last, sourceFirstTime: firstTime, sourceLastTime: lastTime, observedBars: observed, expectedClockSlots: slots, clockCoverage: coverage, terminal: value.terminal, availableAt: null, completion: 'unknown' };
  });
  if (regular ? nextSourceIndex > (input.inputBars as number) : nextSourceIndex !== input.inputBars) throw new Error('Derivation lineage does not cover all declared source bars.');
  if (dataset && (dataset.instrument.id !== identity[0] || canonicalResolution(dataset.resolution) !== target.id || dataset.provenance.providerId !== 'lv-local-aggregation' || dataset.provenance.datasetId !== derivedId(input.sourceKey as string, target.id, policy) || dataset.provenance.revision !== `utc-v1:${input.contentFingerprint}` || dataset.provenance.timezone !== 'UTC' || dataset.bars.length !== buckets.length || dataset.bars.some((bar, index) => bar.time !== (bucket(buckets[index].start, target, policy).label ?? buckets[index].start)))) throw new Error('Derived dataset and lineage identity, revision or output timestamps disagree.');
  return { schemaVersion: 1, sourceKey: input.sourceKey as string, sourceDatasetId: input.sourceDatasetId as string, sourceRevision: input.sourceRevision as string, sourceResolution: input.sourceResolution as string, target: target.id, policy, inputBars: input.inputBars, contentFingerprint: input.contentFingerprint, buckets, historicalAvailability: 'unknown' };
}
/** An aggregation is a pure function of its source content, target and policy. A result is reused only when every
 * bar holds exactly the same six values in the canonical key order (the output spreads bar objects) and every scalar source
 * field serializes identically (undefined, NaN, Infinity and -0 kept distinct), so switching back to an interval or opening
 * a fresh clone of the same source skips validation, bucketing and fingerprinting. Each hit returns a fresh deep copy, so
 * callers still own what they receive. A failure is replayed as a new plain Error with the same message (only plain Error
 * failures are kept), so asking a daily source for 1m on every render no longer revalidates it. */
const AGGREGATION_CACHE_LIMIT = 64, AGGREGATION_VALUE_LIMIT = 3_000_000, BAR_KEYS = ['time', 'open', 'high', 'low', 'close', 'volume'];
const aggregationCache = new Map<string, { values: Float64Array; refs: readonly Bar[]; result: IntervalSuccess | null; failure: string | null }>();
function exactJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item === undefined ? '\u0000undefined' : typeof item === 'number' && (!Number.isFinite(item) || Object.is(item, -0)) ? '\u0000' + (Object.is(item, -0) ? '-0' : String(item)) : typeof item === 'string' && item.startsWith('\u0000') ? '\u0000' + item : item);
}
function barValues(bars: readonly Bar[]): Float64Array | null {
  const values = new Float64Array(bars.length * 6);
  for (let i = 0, o = 0; i < bars.length; i++, o += 6) {
    const bar = bars[i];
    if (typeof bar !== 'object' || bar === null || Object.getPrototypeOf(bar) !== Object.prototype) return null;
    let count = 0; for (const name in bar) { if (name !== BAR_KEYS[count]) return null; count++; }
    if (count !== 6) return null;
    values[o] = bar.time; values[o + 1] = bar.open; values[o + 2] = bar.high; values[o + 3] = bar.low; values[o + 4] = bar.close; values[o + 5] = bar.volume;
  }
  return values;
}
/** The same bar objects in the same slots still holding the recorded values (no key walk needed for unchanged objects). */
function sameBars(bars: readonly Bar[], refs: readonly Bar[], values: Float64Array): boolean {
  if (bars.length !== refs.length) return false;
  for (let i = 0, o = 0; i < bars.length; i++, o += 6) { const bar = bars[i]; if (bar !== refs[i] || !Object.is(bar.time, values[o]) || !Object.is(bar.open, values[o + 1]) || !Object.is(bar.high, values[o + 2]) || !Object.is(bar.low, values[o + 3]) || !Object.is(bar.close, values[o + 4]) || !Object.is(bar.volume, values[o + 5])) return false; }
  return true;
}
function sameValues(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}
export function aggregateInterval(source: BarDataset, target: string, suppliedPolicy: AggregationPolicy = DEFAULT_AGGREGATION_POLICY): IntervalSuccess { return aggregateCore(source, target, suppliedPolicy, false); }
function aggregateCore(source: BarDataset, target: string, suppliedPolicy: AggregationPolicy, share: boolean): IntervalSuccess {
  let key: string;
  try {
    if (!Array.isArray(source?.bars) || !source.bars.length || source.bars.length > 100000) return buildAggregateInterval(source, target, suppliedPolicy);
    key = exactJson([target, suppliedPolicy, source.resolution, source.instrument, source.provenance, Object.keys(source)]);
  } catch { return buildAggregateInterval(source, target, suppliedPolicy); }
  const hit = aggregationCache.get(key);
  let values: Float64Array | null = null;
  const same = !!hit && (sameBars(source.bars, hit.refs, hit.values) || (values = barValues(source.bars)) !== null && sameValues(hit.values, values));
  if (hit && same) { aggregationCache.delete(key); aggregationCache.set(key, hit); if (hit.failure !== null) throw new Error(hit.failure); return share ? hit.result! : structuredClone(hit.result!); }
  if (!values) values = barValues(source.bars);
  if (!values) return buildAggregateInterval(source, target, suppliedPolicy);
  const refs = source.bars.slice();
  let result: IntervalSuccess;
  try { result = buildAggregateInterval(source, target, suppliedPolicy); }
  catch (cause) { if (cause instanceof Error && Object.getPrototypeOf(cause) === Error.prototype) { aggregationCache.delete(key); aggregationCache.set(key, { values, refs, result: null, failure: cause.message }); trimAggregationCache(); } throw cause; }
  aggregationCache.delete(key); aggregationCache.set(key, { values, refs, result: structuredClone(result), failure: null });
  trimAggregationCache();
  return result;
}
function trimAggregationCache() {
  let held = 0; for (const entry of aggregationCache.values()) held += entry.values.length;
  while (aggregationCache.size > 1 && (aggregationCache.size > AGGREGATION_CACHE_LIMIT || held > AGGREGATION_VALUE_LIMIT)) { const oldest = aggregationCache.keys().next().value as string; held -= aggregationCache.get(oldest)!.values.length; aggregationCache.delete(oldest); }
  if (held > AGGREGATION_VALUE_LIMIT) aggregationCache.clear();
}
function buildAggregateInterval(source: BarDataset, target: string, suppliedPolicy: AggregationPolicy): IntervalSuccess {
  validateBars(source); const spec = parseInterval(target), input = parseInterval(source.resolution), policy = effectiveAggregationPolicy(suppliedPolicy, source.instrument, spec.id, source.resolution);
  if (spec.kind !== 'time' || input.kind !== 'time') throw new Error('Tick/range bars require actual event data and are not constructed or regrouped from OHLCV.');
  if (isDerived(source)) throw new Error('Choose an original source to rebuild derived intervals; repeated aggregation would hide source coverage and alignment assumptions.');
  if (spec.id === input.id) throw new Error('Use the exact-source selection path for an unchanged interval.');
  if (spec.seconds !== null && (input.seconds === null || spec.seconds < input.seconds)) throw new Error('Finer bars cannot be created from a coarser source.');
  const output: Bar[] = [], buckets: IntervalBucket[] = []; let previousEnd = -Infinity, compensation = 0;
  const regular = regularOnly(spec, policy) && input.seconds !== null && input.seconds < DAY;
  for (let index = 0; index < source.bars.length; index++) {
    const bar = source.bars[index], window = sourceWindow(bar, input, policy);
    if (regular && usSessionPhase(bar.time) !== 'regular') { if (window.start < previousEnd) throw new Error('Source intervals overlap under the declared timestamp/UTC-label policy.'); previousEnd = window.end; continue; }
    const { label, ...targetWindow } = bucket(window.start, spec, policy), stamp = label ?? targetWindow.start;
    if (window.start < previousEnd) throw new Error('Source intervals overlap under the declared timestamp/UTC-label policy.');
    previousEnd = window.end;
    if (window.start < targetWindow.start || window.end > targetWindow.end) throw new Error('A source bar crosses a target boundary. Import finer bars or choose compatible explicit anchors; source OHLC cannot be split.');
    let last = output.at(-1), record = buckets.at(-1);
    if (last?.time === stamp && record) {
      last.high = Math.max(last.high, bar.high); last.low = Math.min(last.low, bar.low); last.close = bar.close;
      const adjusted = bar.volume - compensation, sum = last.volume + adjusted; compensation = (sum - last.volume) - adjusted; last.volume = sum;
      record.sourceLastIndex = index; record.sourceLastTime = bar.time; record.observedBars++;
    } else {
      compensation = 0; last = { ...bar, time: stamp }; output.push(last);
      record = { ...targetWindow, sourceFirstIndex: index, sourceLastIndex: index, sourceFirstTime: bar.time, sourceLastTime: bar.time, observedBars: 1, expectedClockSlots: expectedSlots(targetWindow, input), clockCoverage: 'unknown', terminal: false, availableAt: null, completion: 'unknown' }; buckets.push(record);
    }
    if (!Number.isFinite(last.volume) || Number.isInteger(last.volume) && !Number.isSafeInteger(last.volume)) throw new Error('Aggregated volume exceeds supported numeric precision.');
  }
  if (!buckets.length) throw new Error('The source has no regular-session bars to build this interval from. US equity day, week and month bars use the regular session; choose the extended-hours option to include pre-market, after-hours and overnight bars.');
  for (const record of buckets) record.clockCoverage = record.expectedClockSlots === null ? 'unknown' : record.expectedClockSlots === record.observedBars ? 'full-clock' : 'partial-clock';
  buckets[buckets.length - 1].terminal = true;
  const sourceKey = intervalDatasetKey(source), fingerprint = contentFingerprint(source);
  const derivation: IntervalDerivation = { schemaVersion: 1, sourceKey, sourceDatasetId: source.provenance.datasetId, sourceRevision: source.provenance.revision, sourceResolution: source.resolution, target: spec.id, policy, inputBars: source.bars.length, contentFingerprint: fingerprint, buckets, historicalAvailability: 'unknown' };
  const dataset: DerivedIntervalDataset = {
    instrument: { ...source.instrument }, bars: output, resolution: spec.id, derivation: structuredClone(derivation),
    provenance: { ...structuredClone(source.provenance), providerId: 'lv-local-aggregation', providerName: `${policy.anchor === 'us-equity-trading-day' ? 'OpenCandle New York trading-day aggregation (regular session)' : policy.anchor === 'us-equity-trading-day-extended' ? 'OpenCandle New York trading-day aggregation (extended hours)' : policy.anchor ? 'OpenCandle US session aggregation' : 'OpenCandle UTC aggregation'} from ${source.provenance.providerName}`, datasetId: derivedId(sourceKey, spec.id, policy), revision: `utc-v1:${fingerprint}`, timezone: 'UTC', coverage: `${output.length} derived ${spec.id} bars from ${regular ? 'the regular-session rows of ' : ''}${source.bars.length} supplied ${source.resolution} bars; no absent bars or sessions added`, notes: [...source.provenance.notes, ...INTERVAL_POLICIES, `Original source: ${sourceKey}; revision ${source.provenance.revision}.`] },
  };
  return { ok: true, kind: 'derived', dataset, derivation, policies: [...INTERVAL_POLICIES], coverage: { inputBars: source.bars.length, outputBars: output.length, partialClockBuckets: buckets.filter(record => record.clockCoverage === 'partial-clock').length, availability: 'unknown' } };
}
/** ChooseIntervalSource without the defensive deep copies, for availability probes that only read ok/code/message and
 * coverage. The returned dataset and derivation may be the cached objects: callers must not mutate or retain them. */
export function probeIntervalSource(datasets: readonly BarDataset[], request: { instrumentId: string; target: string; sourceKey?: string | null; policy?: AggregationPolicy }): IntervalResult { return chooseCore(datasets, request, true); }
export function chooseIntervalSource(datasets: readonly BarDataset[], request: { instrumentId: string; target: string; sourceKey?: string | null; policy?: AggregationPolicy }): IntervalResult { return chooseCore(datasets, request, false); }
function chooseCore(datasets: readonly BarDataset[], request: { instrumentId: string; target: string; sourceKey?: string | null; policy?: AggregationPolicy }, share: boolean): IntervalResult {
  let candidates: IntervalSourceChoice[] = [];
  try {
    const spec = parseInterval(request.target); candidates = listIntervalSources(datasets, request.instrumentId, spec.id);
    let matches = datasets.filter(dataset => dataset.instrument.id === request.instrumentId);
    if (request.sourceKey) matches = matches.filter(dataset => intervalDatasetKey(dataset) === request.sourceKey);
    else matches = matches.filter(dataset => canonicalResolution(dataset.resolution) === spec.id);
    if (!matches.length) return { ok: false, code: request.sourceKey ? 'SOURCE_UNAVAILABLE' : 'SOURCE_REQUIRED', message: request.sourceKey ? 'The selected source is no longer available for this instrument.' : 'No exact interval source is loaded. Select an original source and review the explicit UTC aggregation policy.', candidates };
    if (matches.length !== 1) return { ok: false, code: 'AMBIGUOUS_SOURCE', message: 'More than one supplied source has this identity or exact interval. Choose a unique source; no provider or correction is selected automatically.', candidates };
    const source = matches[0]; validateBars(source);
    if (canonicalResolution(source.resolution) === spec.id) { const derivation = isDerived(source) ? restoreIntervalDerivation((source as DerivedIntervalDataset).derivation, source) : null; return { ok: true, kind: 'exact', dataset: share ? source : structuredClone(source), derivation, policies: ['Exact supplied bars selected without resampling. Existing derived snapshots retain their stored policy.', ...(derivation ? INTERVAL_POLICIES : INTERVAL_POLICIES.slice(3, 6))], coverage: { inputBars: derivation?.inputBars ?? source.bars.length, outputBars: source.bars.length, partialClockBuckets: derivation?.buckets.filter(row => row.clockCoverage === 'partial-clock').length ?? 0, availability: 'unknown' } }; }
    return aggregateCore(source, spec.id, request.policy ?? DEFAULT_AGGREGATION_POLICY, share);
  } catch (cause) { return { ok: false, code: 'INTERVAL_UNAVAILABLE', message: cause instanceof Error ? cause.message : String(cause), candidates }; }
}

/** WSX interval typing (STS top.left.intervals hint: type a number or comma). Pure helpers; the entry box and its timing are our own choice. */
export type IntervalEntryResult = { ok: true; interval: string; label: string } | { ok: false; message: string };
/** The text an entry box opens with for a key: a digit prefills itself, a comma opens empty; any other key opens nothing. */
export function intervalEntrySeed(key: string): string | null { return /^[0-9]$/.test(key) ? key : key === ',' ? '' : null; }
/** Parses typed text with the same grammar as the interval dialog (a bare number is minutes). The parser's own message is returned for bad text. */
export function parseIntervalEntry(text: string): IntervalEntryResult {
  try { const spec = parseInterval(text); return { ok: true, interval: spec.id, label: intervalLabel(spec) }; }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }; }
}
/** Enter in the entry box: parse, then hand the interval to the SAME handler the interval dialog's Apply uses (so the live-chart rule applies unchanged). */
export function submitIntervalEntry(text: string, apply: (interval: string) => { ok: boolean; message?: string }): { ok: boolean; interval: string | null; message: string | null } {
  const parsed = parseIntervalEntry(text);
  if (!parsed.ok) return { ok: false, interval: null, message: parsed.message };
  const result = apply(parsed.interval);
  return result.ok ? { ok: true, interval: parsed.interval, message: null } : { ok: false, interval: null, message: result.message ?? 'The interval could not be applied.' };
}
