import { strategyOrderLabel } from './strategy';
import { STRATEGY_REPORT_LIMITS, type ReportBucket, type ReportTrade, type StrategyReport, type StrategyReportSide } from './strategy-report';
export const REPORT_TRADE_COLUMNS = [
  ['number', 'Trade #'], ['direction', 'Direction'], ['entryTime', 'Entry bar time / phase'], ['exitTime', 'Exit bar time / phase'],
  ['entryOrderId', 'Entry signal'], ['exitOrderId', 'Exit signal'], ['quantity', 'Units'], ['entryPrice', 'Entry price'], ['exitPrice', 'Exit price'],
  ['entryNotional', 'Entry notional'], ['grossProfit', 'Gross price PnL'], ['commission', 'Allocated fees'], ['netProfit', 'Net PnL'], ['returnPercent', 'Return %'],
  ['favorable', 'Favorable gross'], ['adverse', 'Adverse gross'], ['cumulativeNet', 'Cumulative closed PnL'], ['cumulativePercent', 'Cumulative / initial %'], ['barsHeld', 'Inclusive bars'],
  // The List of trades run-up and drawdown percents (excursion / entry notional).
  ['favorablePercent', 'Favorable %'], ['adversePercent', 'Adverse %'],
] as const;
export type ReportTradeColumn = typeof REPORT_TRADE_COLUMNS[number][0];
export const DEFAULT_REPORT_COLUMNS: readonly ReportTradeColumn[] = ['number', 'direction', 'entryTime', 'exitTime', 'quantity', 'entryPrice', 'exitPrice', 'netProfit', 'returnPercent', 'favorable', 'adverse', 'cumulativeNet'];
export function tradeColumnValue(trade: ReportTrade, column: ReportTradeColumn): string | number | null {
  if (column === 'entryTime') return trade.entry.barIndex;
  if (column === 'exitTime') return trade.exit.barIndex;
  if (column === 'favorable' || column === 'adverse' || column === 'favorablePercent' || column === 'adversePercent') return trade[column].value;
  // The signal columns show readable labels, so sorting uses them too (ids stay internal).
  if (column === 'entryOrderId') return trade.entrySignal ?? strategyOrderLabel({ id: trade.entryOrderId });
  if (column === 'exitOrderId') return trade.exitSignal ?? strategyOrderLabel({ id: trade.exitOrderId });
  return trade[column];
}
/**
 * A trade matches when the query is a substring of what people see (trade number and signal labels); an
 * internal order id matches only when the query equals it exactly (case-insensitive), so hidden text never leaks.
 * The report client applies this same function to worker replies.
 */
export function reportTradeMatches(trade: { number: number; entryOrderId: string; exitOrderId: string; entrySignal?: string; exitSignal?: string }, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase(); if (!query) return true;
  const visible = [String(trade.number), trade.entrySignal ?? strategyOrderLabel({ id: trade.entryOrderId }), trade.exitSignal ?? strategyOrderLabel({ id: trade.exitOrderId })];
  return visible.some(value => value.toLocaleLowerCase().includes(query)) || [trade.entryOrderId, trade.exitOrderId].some(id => id.toLocaleLowerCase() === query);
}
export function queryReportTrades(report: StrategyReport, options: { side: StrategyReportSide; query: string; sort: ReportTradeColumn; descending: boolean; page: number }) {
  if (!['all', 'long', 'short'].includes(options.side) || !REPORT_TRADE_COLUMNS.some(([key]) => key === options.sort) || typeof options.query !== 'string' || options.query.length > 200 || !Number.isSafeInteger(options.page) || options.page < 0) throw new Error('Invalid report table controls.');
  const query = options.query, matched = report.trades.filter(trade => (options.side === 'all' || trade.direction === options.side) && reportTradeMatches(trade, query));
  matched.sort((a, b) => {
    const av = tradeColumnValue(a, options.sort), bv = tradeColumnValue(b, options.sort);
    if (av === null || bv === null) return av === null && bv === null ? a.number - b.number : av === null ? 1 : -1;
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return comparison ? comparison * (options.descending ? -1 : 1) : a.number - b.number;
  });
  const pages = Math.max(1, Math.ceil(matched.length / STRATEGY_REPORT_LIMITS.pageSize)), page = Math.min(options.page, pages - 1);
  return { count: matched.length, pages, page, rows: matched.slice(page * STRATEGY_REPORT_LIMITS.pageSize, (page + 1) * STRATEGY_REPORT_LIMITS.pageSize) };
}
/** Keep endpoints and chronological bucket extrema without changing source values. */
export function reportPlotIndices(values: readonly (number | null)[], maximum: number = STRATEGY_REPORT_LIMITS.plotPoints): number[] {
  if (!Number.isSafeInteger(maximum) || maximum < 4 || maximum > STRATEGY_REPORT_LIMITS.plotPoints) throw new Error('Invalid report plot bound.');
  if (values.length <= maximum) return values.map((_, index) => index);
  const buckets = Math.floor((maximum - 2) / 2), width = (values.length - 2) / buckets, chosen = [0];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor(bucket * width), end = 1 + Math.floor((bucket + 1) * width); let low = -1, high = -1;
    for (let i = start; i < end; i++) if (values[i] !== null) { if (low < 0 || values[i]! < values[low]!) low = i; if (high < 0 || values[i]! > values[high]!) high = i; }
    if (low >= 0) { chosen.push(Math.min(low, high)); if (low !== high) chosen.push(Math.max(low, high)); }
  }
  chosen.push(values.length - 1); return chosen;
}
/**
 * Best entry period by closed-trade win rate. LV ranking policy (reference tie and sample rules are unpublished):
 * groups with at least one closed allocation; higher win rate, then higher net PnL, then more trades, then the
 * earlier key. Null when no group has a closed allocation.
 */
export function bestEntryPeriod(buckets: readonly ReportBucket[]): ReportBucket | null {
  let best: ReportBucket | null = null;
  for (const bucket of buckets) {
    if (!bucket.trades || bucket.winRate === null) continue;
    if (!best || bucket.winRate > best.winRate! || bucket.winRate === best.winRate && (bucket.net > best.net || bucket.net === best.net && (bucket.trades > best.trades || bucket.trades === best.trades && bucket.key < best.key))) best = bucket;
  }
  return best;
}
