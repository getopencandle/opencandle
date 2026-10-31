// Performance and allocation., labelled in the dialog.
// TWR (time-weighted return): daily chain-linking. Day i return = V_end(i) / (V_end(i-1) + F(i)) - 1, where F is the net external
//   cash flow (deposits minus withdrawals) of day i, treated as arriving at the start of the day. Dividends and fees are performance.
// MWR (money-weighted return): the annualized internal rate of return (XIRR, actual/365) of the dated external flows, with the
//   value at the range start as an opening outflow and the value at the end of the last day as the closing inflow.
import type { Bar, BarDataset } from '../domain/types';
import { applyTransaction, newBook, pickSeries, type Book, type Portfolio, type PortfolioRange, type PortfolioTx } from './portfolio';

export const DAY = 86400;
export const MAX_PERFORMANCE_DAYS = 3660;
export const dayStart = (time: number) => Math.floor(time / DAY) * DAY;

/** Close of the last bar at or before `time`, or null when the series starts later. */
export function closeAt(bars: readonly Bar[], time: number): number | null {
  let lo = 0, hi = bars.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].time <= time) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  return best < 0 ? null : bars[best].close;
}
/** Bars per symbol that may be used to value this portfolio (same currency only; other currencies are never converted). */
export function seriesBook(portfolio: Portfolio, datasets: readonly BarDataset[]): Record<string, readonly Bar[]> {
  const out: Record<string, readonly Bar[]> = {};
  for (const [symbol, dataset] of Object.entries(pickSeries(datasets))) if (!dataset.instrument.currency || dataset.instrument.currency.toUpperCase() === portfolio.currency.toUpperCase()) out[symbol] = dataset.bars;
  return out;
}

export interface DayPoint { dayStart: number; value: number; flow: number; returnPct: number; index: number; }
/** One point per UTC day from the first transaction to `asOf`. A holding with no loaded bar yet is valued at its last trade price. */
export function dailySeries(portfolio: Portfolio, series: Record<string, readonly Bar[]>, asOf: number): { ok: true; points: DayPoint[] } | { ok: false; error: string } {
  const rows = portfolio.transactions; if (!rows.length) return { ok: true, points: [] };
  const first = dayStart(rows[0].time), last = Math.max(dayStart(asOf), first), days = (last - first) / DAY + 1;
  if (days > MAX_PERFORMANCE_DAYS) return { ok: false, error: `Performance covers at most ${MAX_PERFORMANCE_DAYS} days; this history spans ${days}.` };
  const book: Book = newBook();
  const points: DayPoint[] = []; let cursor = 0, prevValue = 0, index = 1;
  for (let day = first; day <= last; day += DAY) {
    const end = day + DAY - 1; let flow = 0;
    while (cursor < rows.length && rows[cursor].time <= end) {
      const tx = rows[cursor++]; applyTransaction(book, tx);
      if (tx.type === 'deposit') flow += tx.amount!; else if (tx.type === 'withdrawal') flow -= tx.amount!;
    }
    let value = book.cash;
    for (const [symbol, lot] of book.lots) if (lot.quantity > 0) value += lot.quantity * (closeAt(series[symbol] ?? [], end) ?? lot.lastPrice);
    const base = prevValue + flow, returnPct = base > 1e-9 ? value / base - 1 : 0;
    index *= 1 + returnPct; points.push({ dayStart: day, value, flow, returnPct, index }); prevValue = value;
  }
  return { ok: true, points };
}

/** Annualized internal rate of return by bisection. Null when the flows do not change sign or are too few. */
export function xirr(flows: readonly { time: number; amount: number }[]): number | null {
  const usable = flows.filter(flow => Number.isFinite(flow.amount) && flow.amount !== 0);
  if (usable.length < 2 || !usable.some(f => f.amount > 0) || !usable.some(f => f.amount < 0)) return null;
  const t0 = Math.min(...usable.map(f => f.time));
  const npv = (rate: number) => usable.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, (f.time - t0) / (365 * DAY)), 0);
  let lo = -0.9999, hi = 1000, fLo = npv(lo), fHi = npv(hi);
  // Short ranges annualize to enormous rates: widen the bracket until the sign changes.
  while (Number.isFinite(fHi) && fLo * fHi > 0 && hi < 1e15) { hi *= 10; fHi = npv(hi); }
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let step = 0; step < 200; step++) {
    const mid = (lo + hi) / 2, fMid = npv(mid);
    if (Math.abs(fMid) < 1e-10 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

export function rangeStart(range: PortfolioRange, asOf: number, firstTime: number): number {
  const end = dayStart(asOf);
  if (range === 'ALL') return dayStart(firstTime);
  if (range === 'YTD') return Date.UTC(new Date(end * 1000).getUTCFullYear(), 0, 1) / 1000;
  const days = range === '1M' ? 30 : range === '3M' ? 91 : range === '6M' ? 182 : 365;
  return end - days * DAY;
}

export interface PerformancePoint { time: number; portfolio: number; benchmark: number | null; }
export interface PerformanceResult {
  startTime: number; endTime: number; startValue: number; endValue: number; netFlows: number;
  /** Change in value over the range with deposits and withdrawals removed (realized + unrealized + dividends - fees). */
  pnl: number; twr: number | null; mwr: number | null; benchmarkReturn: number | null; benchmarkSymbol: string | null;
  points: PerformancePoint[]; notes: string[];
}
export function computePerformance(portfolio: Portfolio, datasets: readonly BarDataset[], asOf: number, range = portfolio.range, benchmark = portfolio.benchmark): { ok: true; value: PerformanceResult } | { ok: false; error: string } {
  if (!portfolio.transactions.length) return { ok: false, error: 'Add transactions to see performance.' };
  const series = seriesBook(portfolio, datasets), daily = dailySeries(portfolio, series, asOf); if (!daily.ok) return daily;
  const pts = daily.points, notes: string[] = [];
  const wanted = rangeStart(range, asOf, portfolio.transactions[0].time);
  let i0 = pts.findIndex(point => point.dayStart >= wanted); if (i0 < 0) i0 = pts.length - 1; if (i0 < 0) return { ok: false, error: 'No data in range.' };
  const baseIndex = i0 > 0 ? pts[i0 - 1].index : 1, baseValue = i0 > 0 ? pts[i0 - 1].value : 0, endPoint = pts[pts.length - 1];
  const inRange = pts.slice(i0), netFlows = inRange.reduce((sum, point) => sum + point.flow, 0);
  const twr = endPoint.index / baseIndex - 1;
  const bars = benchmark ? (series[benchmark] ?? pickSeries(datasets)[benchmark]?.bars) : undefined;
  let benchmarkBase: number | null = null;
  if (benchmark) {
    if (!bars) notes.push(`Benchmark ${benchmark} is not loaded.`);
    else { benchmarkBase = closeAt(bars, pts[i0].dayStart - 1);
      if (benchmarkBase === null && i0 === 0) { benchmarkBase = closeAt(bars, pts[0].dayStart + DAY - 1); if (benchmarkBase !== null) notes.push(`Benchmark ${benchmark} starts from the close of the first day.`); }
      if (benchmarkBase === null) notes.push(`Benchmark ${benchmark} has no bars before the start of this range.`); }
  }
  const points: PerformancePoint[] = [{ time: pts[i0].dayStart, portfolio: 100, benchmark: benchmarkBase === null ? null : 100 }];
  for (const point of inRange) {
    const close = benchmarkBase !== null && bars ? closeAt(bars, point.dayStart + DAY - 1) : null;
    points.push({ time: point.dayStart + DAY - 1, portfolio: point.index / baseIndex * 100, benchmark: close === null || benchmarkBase === null ? null : close / benchmarkBase * 100 });
  }
  const benchmarkClose = benchmarkBase !== null && bars ? closeAt(bars, endPoint.dayStart + DAY - 1) : null;
  const flows: { time: number; amount: number }[] = [];
  if (baseValue > 1e-9) flows.push({ time: pts[i0].dayStart, amount: -baseValue });
  for (const tx of portfolio.transactions) if ((tx.type === 'deposit' || tx.type === 'withdrawal') && tx.time >= pts[i0].dayStart && tx.time < endPoint.dayStart + DAY) flows.push({ time: tx.time, amount: tx.type === 'deposit' ? -tx.amount! : tx.amount! });
  flows.push({ time: endPoint.dayStart + DAY, amount: endPoint.value });
  const mwr = xirr(flows);
  if (mwr === null) notes.push('Money-weighted return needs at least one deposit and a positive ending value.');
  return { ok: true, value: { startTime: pts[i0].dayStart, endTime: endPoint.dayStart + DAY - 1, startValue: baseValue, endValue: endPoint.value, netFlows, pnl: endPoint.value - baseValue - netFlows, twr, mwr, benchmarkReturn: benchmarkClose !== null && benchmarkBase !== null ? benchmarkClose / benchmarkBase - 1 : null, benchmarkSymbol: benchmark, points, notes } };
}

// ---------------------------------------------------------------- allocation

export type AllocationBy = 'assetClass' | 'sector' | 'country';
export interface InstrumentMeta { assetClass?: string; sector?: string; country?: string; }
export interface AllocationRow { label: string; value: number; percent: number; }
export const ALLOCATION_LABELS: Record<AllocationBy, string> = { assetClass: 'Asset class', sector: 'Sector', country: 'Country' };
/** Builds symbol metadata from loaded instruments, then overlays supplied sector and country values (for example from heatmap metadata). */
export function metaFromDatasets(datasets: readonly BarDataset[], extra: Record<string, InstrumentMeta> = {}): Record<string, InstrumentMeta> {
  const out: Record<string, InstrumentMeta> = {};
  for (const [symbol, dataset] of Object.entries(pickSeries(datasets))) out[symbol] = { assetClass: dataset.instrument.assetClass, ...extra[symbol] };
  for (const [symbol, meta] of Object.entries(extra)) if (!out[symbol]) out[symbol] = { ...meta };
  return out;
}
export function allocate(holdings: readonly { symbol: string; value: number | null; sold: boolean }[], cash: number, meta: Record<string, InstrumentMeta>, by: AllocationBy): { ok: true; rows: AllocationRow[]; excluded: string[] } | { ok: false; reason: string } {
  const open = holdings.filter(row => !row.sold && row.value !== null);
  if (by !== 'assetClass' && !open.some(row => meta[row.symbol]?.[by])) return { ok: false, reason: `${ALLOCATION_LABELS[by]} is unavailable: no ${by} was supplied for these holdings. Import heatmap metadata to add it.` };
  const sums = new Map<string, number>();
  const add = (label: string, value: number) => sums.set(label, (sums.get(label) ?? 0) + value);
  for (const row of open) add(meta[row.symbol]?.[by] ? String(meta[row.symbol]![by]) : by === 'assetClass' ? 'Unknown' : 'Unclassified', row.value!);
  if (cash > 0) add('Cash', cash);
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  const rows = [...sums].map(([label, value]) => ({ label, value, percent: total > 0 ? value / total * 100 : 0 })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { ok: true, rows, excluded: holdings.filter(row => !row.sold && row.value === null).map(row => row.symbol) };
}
export type { PortfolioTx };
