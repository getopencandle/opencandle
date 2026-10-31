import Decimal from 'decimal.js';
import { exactDiv, exactMul, exactNumber, exactOf } from './strategy-report-exact';

/**
 * Pure calculators for the close-equity episode, monthly-ratio and annualized strategy metrics.
 * The formulas follow the common published definitions; LV conventions fill the cases they leave open.
 */
const PERIOD_PRECISION = 40;
const D = Decimal.clone({ precision: PERIOD_PRECISION, rounding: Decimal.ROUND_HALF_EVEN });
const round = (value: Decimal) => value.toDecimalPlaces(10).toNumber();
export const SECONDS_PER_DAY = 86400;
/** Documented strategy() risk_free_rate default (2, annual percent). Not yet a user property in LV. */
export const DEFAULT_ANNUAL_RISK_FREE_PERCENT = 2;
export interface EquityObservation { readonly time: number; readonly equity: number }
export interface RunupEpisode { readonly amount: number; readonly seconds: number; readonly troughTime: number; readonly peakTime: number }
export interface DrawdownEpisode { readonly amount: number; readonly seconds: number; readonly peakTime: number; readonly troughTime: number; readonly recoveryTime: number }
export interface CloseEquityEpisodes {
  readonly runups: readonly RunupEpisode[]; readonly drawdowns: readonly DrawdownEpisode[];
  /** A decline that never regained its peak before the final supplied close. Excluded from the drawdown averages. */
  readonly unrecovered: Readonly<{ amount: number; peakTime: number; troughTime: number }> | null;
}
export const EPISODE_BASIS = 'Close equity seeded with initial capital at the first supplied bar time. A drawdown runs from the last close at its peak level to the first later close that regains that level; a run-up runs from the last close at the preceding trough level to the first close reaching its new peak. Equal closes extend a plateau. Durations use bar event times.';

/** Split one close-equity series into completed run-up and drawdown episodes. Times must be nondecreasing. */
export function closeEquityEpisodes(initial: number, startTime: number, points: readonly EquityObservation[], step: () => void = () => {}): CloseEquityEpisodes {
  const runups: RunupEpisode[] = [], drawdowns: DrawdownEpisode[] = [];
  // L5b perf: every level is a finite number, and new D(x) is the exact value of x's shortest decimal string, so comparing
  // the Decimals compares the numbers (same order and equality, -0 equal to 0). Only an episode amount needs Decimal.
  const amount = (high: number, low: number) => round(new D(high).sub(new D(low)));
  let peak = initial, peakFirst = startTime, peakLast = startTime;
  let trough = initial, troughLast = startTime, falling = false, ddTrough = initial, ddTroughTime = startTime;
  for (const point of points) {
    step(); const value = point.equity;
    if (value >= peak) {
      if (falling) {
        // Recovery: the run-up from this drawdown's trough reaches the peak level at this close.
        drawdowns.push(Object.freeze({ amount: amount(peak, ddTrough), seconds: point.time - peakLast, peakTime: peakLast, troughTime: ddTroughTime, recoveryTime: point.time }));
        falling = false; trough = ddTrough; troughLast = ddTroughTime; peakFirst = point.time;
      } else if (value > peak) peakFirst = point.time;
      else if (peak === trough) troughLast = point.time; // flat start: the seed plateau extends the trough
      if (value > peak) peak = value;
      peakLast = point.time;
    } else if (!falling) {
      if (peak > trough) runups.push(Object.freeze({ amount: amount(peak, trough), seconds: peakFirst - troughLast, troughTime: troughLast, peakTime: peakFirst }));
      falling = true; ddTrough = value; ddTroughTime = point.time;
    } else if (value <= ddTrough) { ddTrough = value; ddTroughTime = point.time; }
  }
  if (!falling && peak > trough) runups.push(Object.freeze({ amount: amount(peak, trough), seconds: peakFirst - troughLast, troughTime: troughLast, peakTime: peakFirst }));
  return Object.freeze({ runups: Object.freeze(runups), drawdowns: Object.freeze(drawdowns), unrecovered: falling ? Object.freeze({ amount: amount(peak, ddTrough), peakTime: peakLast, troughTime: ddTroughTime }) : null });
}
export function averageOf(values: readonly number[]): number | null { return values.length ? round(values.reduce((sum, value) => sum.add(value), new D(0)).div(values.length)) : null; }

/** Calendar month key `YYYY-MM` of a Unix-second time in an explicit IANA zone. */
export function monthKeyFormatter(timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit' });
  return (time: number) => {
    let year = '', month = '';
    for (const part of formatter.formatToParts(time * 1000)) { if (part.type === 'year') year = part.value; else if (part.type === 'month') month = part.value; }
    if (!/^\d{1,4}$/.test(year) || !/^\d{2}$/.test(month)) throw new Error('The display time zone did not produce a calendar month.');
    return year.padStart(4, '0') + '-' + month;
  };
}
export interface MonthlyEquity { readonly month: string; readonly time: number; readonly equity: number }
/**
 * Equity at the last supplied close of each calendar month. Month keys are monotone in time, so each month's last
 * row is found by galloping search: O(months log rows) formatter calls instead of one per row.
 */
export function monthEndEquity(points: readonly EquityObservation[], monthKey: (time: number) => string, step: () => void = () => {}): MonthlyEquity[] {
  const months: MonthlyEquity[] = []; let i = 0;
  const key = (index: number) => { step(); return monthKey(points[index].time); };
  while (i < points.length) {
    const current = key(i); let low = i, width = 1;
    while (low + width < points.length && key(low + width) === current) { low += width; width *= 2; }
    let high = Math.min(low + width, points.length - 1);
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (key(middle) === current) low = middle; else high = middle - 1; }
    months.push(Object.freeze({ month: current, time: points[low].time, equity: points[low].equity })); i = low + 1;
  }
  return months;
}
export interface MonthlyRatios { readonly returns: readonly number[]; readonly sharpe: number | null; readonly sortino: number | null; readonly sharpeReason: string | null; readonly sortinoReason: string | null }
/**
 * Sharpe = (MR - RFR) / SD and Sortino = (MR - RFR) / DD over simple monthly returns X_i = E_i / E_(i-1) - 1, with
 * E_0 = initial capital. SD = sqrt(sum((X_i - MR)^2) / N); DD = sqrt(sum(min(0, X_i - T)^2) / N). LV conventions:
 * RFR = annual percent / 100 / 12 and target T = RFR.
 */
export function monthlyRatios(initial: number, monthEnds: readonly MonthlyEquity[], annualRiskFreePercent = DEFAULT_ANNUAL_RISK_FREE_PERCENT): MonthlyRatios {
  const returns: Decimal[] = []; let previous = new D(initial);
  for (const row of monthEnds) { if (previous.lte(0)) return Object.freeze({ returns: [], sharpe: null, sortino: null, sharpeReason: 'A nonpositive month-start equity has no defined simple return.', sortinoReason: 'A nonpositive month-start equity has no defined simple return.' }); const value = new D(row.equity); returns.push(value.div(previous).sub(1)); previous = value; }
  const plain = Object.freeze(returns.map(round));
  if (returns.length < 2) return Object.freeze({ returns: plain, sharpe: null, sortino: null, sharpeReason: 'At least two monthly returns are required.', sortinoReason: 'At least two monthly returns are required.' });
  const n = returns.length, mean = returns.reduce((sum, value) => sum.add(value), new D(0)).div(n), rfr = new D(annualRiskFreePercent).div(100).div(12), excess = mean.sub(rfr);
  const sd = returns.reduce((sum, value) => sum.add(value.sub(mean).pow(2)), new D(0)).div(n).sqrt();
  const dd = returns.reduce((sum, value) => sum.add(Decimal.min(0, value.sub(rfr)).pow(2)), new D(0)).div(n).sqrt();
  return Object.freeze({ returns: plain, sharpe: sd.isZero() ? null : round(excess.div(sd)), sortino: dd.isZero() ? null : round(excess.div(dd)), sharpeReason: sd.isZero() ? 'Monthly returns have zero standard deviation.' : null, sortinoReason: dd.isZero() ? 'No monthly return is below the target return, so downside deviation is zero.' : null });
}
/** CAGR (%) = ((final / initial) ^ (365 / days) - 1) * 100, days = calendar days between first and last supplied bar times. */
export function compoundAnnualGrowth(initial: number, final: number, startTime: number, endTime: number): { value: number | null; reason: string | null } {
  const seconds = endTime - startTime;
  if (!(seconds > 0)) return { value: null, reason: 'The supplied history spans no elapsed calendar time.' };
  if (!(initial > 0) || !(final > 0)) return { value: null, reason: 'A nonpositive equity ratio has no defined annualized growth.' };
  const value = new D(final).div(initial).pow(new D(365).mul(SECONDS_PER_DAY).div(seconds)).sub(1).mul(100);
  if (!value.isFinite() || value.abs().gt(1e100)) return { value: null, reason: 'Annualizing this short history exceeds the finite reporting range.' };
  return { value: round(value), reason: null };
}

export const REPORT_PERIOD_KINDS = Object.freeze(['day', 'week', 'month', 'quarter', 'year'] as const);
export type ReportPeriodKind = typeof REPORT_PERIOD_KINDS[number];
/** At most this many rows per period kind are reported; a longer series reports that kind as null with a reason. */
export const REPORT_PERIOD_ROW_LIMIT = 500;
export interface ReportPeriodRow {
  readonly key: string; readonly startBarIndex: number; readonly endBarIndex: number;
  readonly closedTrades: number; readonly closedNet: number; readonly openingEquity: number; readonly closingEquity: number;
  readonly returnPercent: number | null; readonly benchmarkReturnPercent: number | null;
}
export interface ReportPeriods { readonly basis: string; readonly rows: Readonly<Record<ReportPeriodKind, readonly ReportPeriodRow[] | null>> }
export const PERIOD_BASIS = 'Calendar periods of supplied bar event times in the display time zone; weeks are ISO 8601 (Monday start, ISO week-year). Closed net sums closed allocations by exit bar (realized only). Marked return compares close equity at the period\'s last bar with the previous period\'s (initial capital first). Buy-and-hold return uses the declared local benchmark equity over the same boundaries; null before it starts.';
/** Local calendar date of a Unix-second time in an explicit IANA zone. */
export function localDateFormatter(timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (time: number) => {
    let year = NaN, month = NaN, day = NaN;
    for (const part of formatter.formatToParts(time * 1000)) { if (part.type === 'year') year = Number(part.value); else if (part.type === 'month') month = Number(part.value); else if (part.type === 'day') day = Number(part.value); }
    if (!Number.isSafeInteger(year) || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) throw new Error('The display time zone did not produce a calendar date.');
    return { year, month, day };
  };
}
const pad = (value: number, size = 2) => String(value).padStart(size, '0');
/** Period key of a local calendar date. ISO 8601 weeks: the week containing the year's first Thursday is week 1. */
export function periodKey(kind: ReportPeriodKind, date: { year: number; month: number; day: number }): string {
  if (kind === 'day') return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
  if (kind === 'month') return `${pad(date.year, 4)}-${pad(date.month)}`;
  if (kind === 'quarter') return `${pad(date.year, 4)}-Q${Math.ceil(date.month / 3)}`;
  if (kind === 'year') return pad(date.year, 4);
  const utc = new Date(0); utc.setUTCFullYear(date.year, date.month - 1, date.day); utc.setUTCHours(0, 0, 0, 0);
  const weekday = (utc.getUTCDay() + 6) % 7; utc.setUTCDate(utc.getUTCDate() - weekday + 3); // Thursday of this ISO week
  const weekYear = utc.getUTCFullYear(), firstThursday = new Date(0); firstThursday.setUTCFullYear(weekYear, 0, 4); firstThursday.setUTCHours(0, 0, 0, 0);
  firstThursday.setUTCDate(firstThursday.getUTCDate() - (firstThursday.getUTCDay() + 6) % 7 + 3);
  return `${pad(weekYear, 4)}-W${pad(1 + Math.round((utc.getTime() - firstThursday.getTime()) / (7 * SECONDS_PER_DAY * 1000)))}`;
}
export interface PeriodInputRow { readonly time: number; readonly equity: number; readonly buyHoldEquity: number | null }
/**
 * Groups one close-equity series into calendar periods. Rows must be time-ordered. `closed` maps a bar index to the
 * net and count of allocations closed on that bar. Local dates are found by galloping over day boundaries.
 */
export function buildReportPeriods(initial: number, rows: readonly PeriodInputRow[], closed: ReadonlyMap<number, { net: number; count: number }>, timezone: string, step: () => void = () => {}): ReportPeriods {
  const dateOf = localDateFormatter(timezone), days: { start: number; end: number; date: { year: number; month: number; day: number } }[] = [];
  const dayKey = (index: number) => { step(); return periodKey('day', dateOf(rows[index].time)); };
  let i = 0;
  while (i < rows.length) {
    const current = dayKey(i); let low = i, width = 1;
    while (low + width < rows.length && dayKey(low + width) === current) { low += width; width *= 2; }
    let high = Math.min(low + width, rows.length - 1);
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (dayKey(middle) === current) low = middle; else high = middle - 1; }
    days.push({ start: i, end: low, date: dateOf(rows[i].time) }); i = low + 1;
  }
  const result = {} as Record<ReportPeriodKind, readonly ReportPeriodRow[] | null>;
  for (const kind of REPORT_PERIOD_KINDS) {
    const groups: { key: string; start: number; end: number }[] = [];
    for (const day of days) { step(); const key = periodKey(kind, day.date), last = groups.at(-1); if (last && last.key === key) last.end = day.end; else groups.push({ key, start: day.start, end: day.end }); }
    if (groups.length > REPORT_PERIOD_ROW_LIMIT) { result[kind] = null; continue; }
    let opening = new D(initial), benchmarkOpening: Decimal | null = null;
    result[kind] = Object.freeze(groups.map(group => {
      let net = new D(0), count = 0;
      for (let index = group.start; index <= group.end; index++) { const value = closed.get(index); if (value) { net = net.add(value.net); count += value.count; } }
      const closing = new D(rows[group.end].equity), benchmarkClose = rows[group.end].buyHoldEquity;
      const benchmarkStart = benchmarkOpening ?? (benchmarkClose === null ? null : new D(initial));
      const row: ReportPeriodRow = Object.freeze({ key: group.key, startBarIndex: group.start, endBarIndex: group.end, closedTrades: count, closedNet: round(net), openingEquity: round(opening), closingEquity: round(closing), returnPercent: opening.gt(0) ? round(closing.div(opening).sub(1).mul(100)) : null, benchmarkReturnPercent: benchmarkClose === null || !benchmarkStart || benchmarkStart.lte(0) ? null : round(new D(benchmarkClose).div(benchmarkStart).sub(1).mul(100)) });
      opening = closing; if (benchmarkClose !== null) benchmarkOpening = new D(benchmarkClose);
      return row;
    }));
  }
  return Object.freeze({ basis: PERIOD_BASIS, rows: Object.freeze(result) });
}

// ---------------------------------------------------------------------------------------------------------------
// Report analyses (performance, trade analysis, charts, testing period and account currency).
// Pure calculators over an accepted execution. Every grouping or
// bin rule below is our own choice and labelled in its basis text. Unresolved algorithms return an explicit
// unavailable reason instead of a number.
export interface AnalysisTrade { readonly direction: 'long' | 'short'; readonly quantity: number; readonly entryPrice: number; readonly netProfit: number; readonly entryBar: number; readonly exitBar: number }
export interface Unavailable { readonly available: false; readonly reason: string }
const unavailable = (reason: string): Unavailable => Object.freeze({ available: false as const, reason });
/** Trade return percent: net profit / entry notional (entry price x quantity) x 100, the Trades-tab basis. */
export function tradeReturnPercent(trade: AnalysisTrade): number | null {
  const notional = new D(trade.entryPrice).mul(trade.quantity);
  return notional.gt(0) ? round(new D(trade.netProfit).div(notional).mul(100)) : null;
}
export interface DistributionBin { readonly from: number; readonly to: number; readonly winning: number; readonly losing: number; readonly even: number }
export interface TradeDistribution {
  readonly available: true; readonly basis: string; readonly binWidthPercent: number; readonly bins: readonly DistributionBin[];
  readonly averageGainPercent: number | null; readonly averageLossPercent: number | null; readonly outliers: Unavailable;
}
export const DISTRIBUTION_BASIS = 'Closed-trade returns (net profit / entry notional) grouped into equal-width percent bins aligned to zero; OpenCandle-defined width = the smallest of 0.5, 1, 2, 5, 10, 20, 50, 100 or 1000 percent that needs at most 40 bins. Average gain and loss markers are the means of positive and negative returns.';
/** Outliers stay unavailable until the reference algorithm is established. */
export function tradeDistribution(trades: readonly AnalysisTrade[]): TradeDistribution | Unavailable {
  const returns = trades.map(tradeReturnPercent).filter((value): value is number => value !== null);
  if (!returns.length) return unavailable('No closed trades with a positive entry notional.');
  const low = returns.reduce((a, b) => Math.min(a, b), Infinity), high = returns.reduce((a, b) => Math.max(a, b), -Infinity);
  const width = [0.5, 1, 2, 5, 10, 20, 50, 100, 1000].find(size => Math.floor(high / size) - Math.floor(low / size) + 1 <= 40) ?? 10000;
  const first = Math.floor(low / width), count = Math.floor(high / width) - first + 1;
  const bins = Array.from({ length: count }, (_, index) => ({ from: round(new D(first + index).mul(width)), to: round(new D(first + index + 1).mul(width)), winning: 0, losing: 0, even: 0 }));
  for (const value of returns) { const bin = bins[Math.floor(value / width) - first]; if (value > 0) bin.winning++; else if (value < 0) bin.losing++; else bin.even++; }
  const gains = returns.filter(value => value > 0), losses = returns.filter(value => value < 0);
  return Object.freeze({ available: true as const, basis: DISTRIBUTION_BASIS, binWidthPercent: width, bins: Object.freeze(bins.map(bin => Object.freeze(bin))), averageGainPercent: averageOf(gains), averageLossPercent: averageOf(losses), outliers: unavailable('The reference names an outlier count and result, but its outlier rule is not established, so no outlier figure is calculated.') });
}
// Streaks and time patterns are already computed by strategy-report.ts (ReportSideAnalysis); they are not duplicated here.
export interface MarginPoint { readonly barIndex: number; readonly time: number; readonly position: number; readonly margin: number; readonly openTrades: number }
/**
 * Modeled margin at each supplied close = |position| x close x
 * the long or short margin percent. `openTrades` counts entries open after the bar: closed trades with
 * entry bar <= index < exit bar, plus still-open entries listed in `openEntryBars`.
 */
export function marginUsage(points: readonly { barIndex: number; time: number; position: number }[], closes: readonly number[], trades: readonly AnalysisTrade[], marginLongPercent: number, marginShortPercent: number, openEntryBars: readonly number[] = []): readonly MarginPoint[] {
  const starts = new Map<number, number>(), ends = new Map<number, number>();
  for (const trade of trades) { starts.set(trade.entryBar, (starts.get(trade.entryBar) ?? 0) + 1); ends.set(trade.exitBar, (ends.get(trade.exitBar) ?? 0) + 1); }
  for (const bar of openEntryBars) starts.set(bar, (starts.get(bar) ?? 0) + 1);
  let open = 0;
  return Object.freeze(points.map(point => {
    open += (starts.get(point.barIndex) ?? 0) - (ends.get(point.barIndex) ?? 0);
    const percent = point.position >= 0 ? marginLongPercent : marginShortPercent;
    return Object.freeze({ barIndex: point.barIndex, time: point.time, position: point.position, margin: round(new D(Math.abs(point.position)).mul(closes[point.barIndex]).mul(percent).div(100)), openTrades: open });
  }));
}
export function marginUsageHover(series: readonly MarginPoint[], index: number): { tradeCount: number; margin: number; time: number } | null {
  const point = series[index]; return point ? { tradeCount: point.openTrades, margin: point.margin, time: point.time } : null;
}
export interface EpisodeHover { readonly kind: 'growth' | 'decline'; readonly amount: number; readonly percent: number | null; readonly startTime: number; readonly endTime: number }
function equityAtTime(initial: number, startTime: number, points: readonly EquityObservation[], time: number): number {
  if (time <= startTime) return initial;
  // L5b perf: the first point after `time` by binary search (times are nondecreasing), the same row the forward scan stops at.
  let low = 0, high = points.length; while (low < high) { const middle = (low + high) >> 1; if (points[middle].time > time) high = middle; else low = middle + 1; }
  return low ? points[low - 1].equity : initial;
}
export interface GrowthDecline {
  readonly basis: string; readonly periods: readonly EpisodeHover[];
  readonly summary: { readonly growth: { max: number | null; average: number | null; current: number }; readonly decline: { max: number | null; average: number | null; current: number } };
}
/**
 * completed run-up (growth) and drawdown (decline) episodes under EPISODE_BASIS, each with amount, percent of its
 * starting equity and start/end times. Current decline = peak minus last close while unrecovered (the decline maximum includes it, so max >= current); current growth =
 * the last run-up when it ends at the final close.
 */
export function growthDeclinePeriods(initial: number, startTime: number, points: readonly EquityObservation[]): GrowthDecline {
  const episodes = closeEquityEpisodes(initial, startTime, points), periods: EpisodeHover[] = [];
  for (const row of episodes.runups) { const base = equityAtTime(initial, startTime, points, row.troughTime); periods.push(Object.freeze({ kind: 'growth' as const, amount: row.amount, percent: base > 0 ? round(new D(row.amount).div(base).mul(100)) : null, startTime: row.troughTime, endTime: row.peakTime })); }
  for (const row of episodes.drawdowns) { const base = equityAtTime(initial, startTime, points, row.peakTime); periods.push(Object.freeze({ kind: 'decline' as const, amount: row.amount, percent: base > 0 ? round(new D(row.amount).div(base).mul(100)) : null, startTime: row.peakTime, endTime: row.recoveryTime })); }
  periods.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  const amounts = (kind: 'growth' | 'decline') => periods.filter(row => row.kind === kind).map(row => row.amount);
  const max = (values: number[]) => values.length ? values.reduce((a, b) => Math.max(a, b), -Infinity) : null;
  const lastRunup = episodes.runups.at(-1), endsAtLast = !episodes.unrecovered && !!lastRunup && lastRunup.peakTime === points.at(-1)?.time;
  return Object.freeze({ basis: EPISODE_BASIS, periods: Object.freeze(periods), summary: Object.freeze({
    growth: Object.freeze({ max: max(amounts('growth')), average: averageOf(amounts('growth')), current: endsAtLast ? lastRunup!.amount : 0 }),
    decline: Object.freeze({ max: max([...amounts('decline'), ...(episodes.unrecovered ? [episodes.unrecovered.amount] : [])]), average: averageOf(amounts('decline')), current: episodes.unrecovered ? episodes.unrecovered.amount : 0 }),
  }) });
}
/** Cumulative strategy return beside buy-and-hold of the same supplied bars (the report's benchmark basis). */
export function benchmarkComparison(initial: number, rows: readonly PeriodInputRow[]): readonly { time: number; strategyPercent: number; benchmarkPercent: number | null }[] | Unavailable {
  if (!(initial > 0)) return unavailable('Initial capital must be positive.');
  if (!rows.length) return unavailable('No bars loaded.');
  return Object.freeze(rows.map(row => benchmarkRow(initial, row)));
}
const benchmarkRow = (initial: number, row: PeriodInputRow) => Object.freeze({ time: row.time, strategyPercent: round(new D(row.equity).div(initial).sub(1).mul(100)), benchmarkPercent: row.buyHoldEquity === null ? null : round(new D(row.buyHoldEquity).div(initial).sub(1).mul(100)) });
/** Execution bar range for [from, to] (inclusive, Unix seconds), independent of any table filter. */
export function testingPeriodRange(barTimes: readonly number[], from: number | null, to: number | null): { ok: true; startIndex: number; endIndex: number } | { ok: false; reason: string } {
  if (from !== null && to !== null && from > to) return { ok: false, reason: 'The testing period starts after it ends.' };
  let startIndex = 0, endIndex = barTimes.length - 1;
  if (from !== null) { while (startIndex < barTimes.length && barTimes[startIndex] < from) startIndex++; }
  if (to !== null) { while (endIndex >= 0 && barTimes[endIndex] > to) endIndex--; }
  return startIndex > endIndex ? { ok: false, reason: 'No bars fall inside the testing period.' } : { ok: true, startIndex, endIndex };
}
/** Signals outside the testing period are dropped and indices rebased onto the period's bars. */
export function applyTestingPeriod<T extends { barIndex: number }>(signals: readonly T[], range: { startIndex: number; endIndex: number }): T[] {
  return signals.filter(signal => signal.barIndex >= range.startIndex && signal.barIndex <= range.endIndex).map(signal => ({ ...signal, barIndex: signal.barIndex - range.startIndex }));
}
export interface FxRate { readonly time: number; readonly rate: number }
/**
 * Account currency: convert an amount from the instrument currency at an event time
 * with the latest supplied rate at or before that time (as-of). Missing FX stays unavailable, never 1 or 0.
 */
export function convertAsOf(amount: number, time: number, from: string, to: string, rates: readonly FxRate[] | null): { available: true; value: number; rateTime: number | null } | Unavailable {
  if (from === to) return { available: true, value: amount, rateTime: null };
  if (!rates || !rates.length) return unavailable(`No ${from}/${to} rate is loaded. Account currency conversion is unavailable.`);
  let low = 0, high = rates.length; while (low < high) { const middle = (low + high) >> 1; if (rates[middle].time <= time) low = middle + 1; else high = middle; }
  const rate = rates[low - 1];
  if (!rate) return unavailable(`No ${from}/${to} rate exists at or before this time.`);
  if (!(rate.rate > 0) || !Number.isFinite(rate.rate)) return unavailable(`The ${from}/${to} rate at ${rate.time} is invalid.`);
  return { available: true, value: round(new D(amount).mul(rate.rate)), rateTime: rate.time };
}

/** At most this many rows of each analysis series travel with a report summary; the exact values at the sampled points are kept. */
export const RPST_ANALYSIS_ROW_LIMIT = 500;
export interface ReportRpstAnalysis {
  readonly distribution: TradeDistribution | Unavailable;
  readonly margin: { readonly basis: string; readonly points: readonly MarginPoint[]; readonly sampled: boolean; readonly maxMargin: number };
  readonly growthDecline: { readonly basis: string; readonly periods: readonly EpisodeHover[]; readonly omitted: number; readonly summary: GrowthDecline['summary'] };
  readonly benchmark: { readonly points: readonly { time: number; strategyPercent: number; benchmarkPercent: number | null }[]; readonly sampled: boolean } | Unavailable;
}
/** Evenly spaced indices (first and last included) plus any forced indices, sorted and unique. */
export function sampleIndices(length: number, limit: number, forced: readonly number[] = []): number[] {
  if (length <= limit) return Array.from({ length }, (_, index) => index);
  const out = new Set<number>(forced.filter(index => index >= 0 && index < length)), room = Math.max(2, limit - out.size);
  for (let k = 0; k < room; k++) out.add(Math.round(k * (length - 1) / (room - 1)));
  return [...out].sort((a, b) => a - b);
}
/** Report analyses attached to ReportAnalysis.rpst (bounded for transport). */
export function buildRpstAnalysis(input: {
  initial: number; startTime: number; closes: readonly number[]; positions: readonly { barIndex: number; time: number; position: number }[];
  equity: readonly PeriodInputRow[]; trades: readonly AnalysisTrade[]; openEntryBars: readonly number[]; marginLongPercent: number; marginShortPercent: number;
}): ReportRpstAnalysis {
  // L5b perf: only the sampled rows are built. Every margin value is still calculated (the maximum is always kept), in
  // the exact decimal.js emulation (strategy-report-exact.ts) of marginUsage's formula; the rows equal marginUsage's.
  const positions = input.positions, count = positions.length, values = new Float64Array(count), P = PERIOD_PRECISION, hundred = exactOf(100), longPercent = exactOf(input.marginLongPercent), shortPercent = exactOf(input.marginShortPercent);
  for (let index = 0; index < count; index++) { const point = positions[index]; values[index] = exactNumber(exactDiv(exactMul(exactMul(exactOf(Math.abs(point.position)), exactOf(input.closes[point.barIndex]), P), point.position >= 0 ? longPercent : shortPercent, P), hundred, P)); }
  let maxIndex = -1, maxMargin = 0; for (let index = 0; index < count; index++) if (values[index] > maxMargin) { maxMargin = values[index]; maxIndex = index; }
  const marginRows: MarginPoint[] = [], starts = new Map<number, number>(), ends = new Map<number, number>();
  for (const trade of input.trades) { starts.set(trade.entryBar, (starts.get(trade.entryBar) ?? 0) + 1); ends.set(trade.exitBar, (ends.get(trade.exitBar) ?? 0) + 1); }
  for (const bar of input.openEntryBars) starts.set(bar, (starts.get(bar) ?? 0) + 1);
  { const picked = sampleIndices(count, RPST_ANALYSIS_ROW_LIMIT, [maxIndex]); let open = 0, cursor = 0;
    for (let index = 0; index < count && cursor < picked.length; index++) { const point = positions[index]; open += (starts.get(point.barIndex) ?? 0) - (ends.get(point.barIndex) ?? 0); if (picked[cursor] === index) { cursor++; marginRows.push(Object.freeze({ barIndex: point.barIndex, time: point.time, position: point.position, margin: values[index], openTrades: open })); } } }
  const growth = growthDeclinePeriods(input.initial, input.startTime, input.equity.map(row => ({ time: row.time, equity: row.equity })));
  const bench: Unavailable | { length: number; at(index: number): ReturnType<typeof benchmarkRow> } = !(input.initial > 0) ? unavailable('Initial capital must be positive.') : !input.equity.length ? unavailable('No bars loaded.') : { length: input.equity.length, at: index => benchmarkRow(input.initial, input.equity[index]) };
  return Object.freeze({
    distribution: tradeDistribution(input.trades),
    margin: Object.freeze({ basis: 'Modeled margin at each supplied close = |position| x close x the long or short margin percent. Open trades count entries open after that bar. Series sampled to at most ' + RPST_ANALYSIS_ROW_LIMIT + ' exact points, always including the maximum.', points: Object.freeze(marginRows), sampled: marginRows.length < count, maxMargin }),
    growthDecline: Object.freeze({ basis: growth.basis, periods: Object.freeze(growth.periods.slice(0, RPST_ANALYSIS_ROW_LIMIT)), omitted: Math.max(0, growth.periods.length - RPST_ANALYSIS_ROW_LIMIT), summary: growth.summary }),
    benchmark: 'available' in bench ? bench : Object.freeze({ points: Object.freeze(sampleIndices(bench.length, RPST_ANALYSIS_ROW_LIMIT).map(index => bench.at(index))), sampled: bench.length > RPST_ANALYSIS_ROW_LIMIT }),
  });
}
