import Decimal from 'decimal.js';
import { reportCalendar, STRATEGY_REPORT_LIMITS, type ReportBucket, type ReportEquityPoint, type StrategyReportSide } from '../domain/strategy-report';
import { STRATEGY_REPORT_METRICS } from '../domain/strategy-report-catalog';
import { STRATEGY_EVERY_TICK_POLICIES, STRATEGY_MAGNIFIER_POLICY_PREFIX, validateStrategyConfig, type StrategyConfig } from '../domain/strategy';
import { ownArray, ownRecord, reject } from './data';
import { equity, freezeData, openLot, order, trade, validateSummary } from './responses';
import { validateReportStart } from './schema';
import type { ReportOpenLotPage, ReportOrderPage, ReportTradePage, StrategyReportSummary } from './types';

/**
 * A previously exported LV report JSON, verified for shape and re-derived arithmetic.
 * It is display data only: it is never minted as a current report, never re-executed
 * and cannot be exported as the current execution.
 */
export interface RestoredStrategyReport {
  readonly origin: 'saved-report-json';
  readonly bytes: number;
  /** Older exports (checkpoint 4519 and earlier have no trade analysis) restore with `analysis: null`. */
  readonly summary: Omit<StrategyReportSummary, 'analysis'> & { readonly analysis: StrategyReportSummary['analysis'] | null };
  readonly trades: ReportTradePage['rows'];
  readonly openLots: ReportOpenLotPage['rows'];
  readonly orders: ReportOrderPage['rows'];
  readonly equity: readonly ReportEquityPoint[];
  /** Metric ids (`side.key`) that were recomputed from the saved rows and matched. Every other metric is shown as saved. */
  readonly verified: readonly string[];
  /** Short list of the recomputed headline values. */
  readonly checks: readonly string[];
  /** Saved content that could not be recomputed from the saved rows. */
  readonly unverified: readonly string[];
}
const REQUIRED = ['schemaVersion', 'context', 'config', 'fillBasis', 'trades', 'openLots', 'orders', 'equity', 'metrics', 'benchmark', 'drawdown', 'policies', 'diagnostics', 'work'] as const;
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
const round = (value: Decimal) => value.toDecimalPlaces(10).toNumber();
// Saved values are rounded to ten decimal places by the report model; the tolerance covers that rounding only.
const close = (a: number | Decimal, b: number | Decimal, absolute = 1e-8) => { const x = new D(a), y = new D(b); return x.sub(y).abs().lte(D.max(absolute, D.max(x.abs(), y.abs()).mul(1e-12))); };
/** Saved content that cannot be recomputed because the export does not contain bar prices, fills or per-bar positions. */
export const RESTORE_UNVERIFIED = [
  'All nonfinal equity values, including the first row, are as saved (bar prices are not saved). Drawdown and run-up are recomputed from these saved values, not verified against source prices. Closed-net columns are reconciled to saved trades, and only the final equity value is anchored to the saved trade ledger.',
  'Per-trade favorable and adverse excursions (bar ranges are not saved).',
  'Benchmark block and buy-and-hold column (prices are not saved).',
  'Order rows (checked for shape only; fills are not saved).',
  'Margin, maximum units held and path-drawdown metrics (per-bar positions and the intrabar path are not saved).',
  'Margin calls and liquidated volume, intrabar drawdown and run-up, account size, monthly Sharpe/Sortino, CAGR, run-up/drawdown episode averages and calendar period rows (they need bar prices, fills or per-bar equity times the export does not fully carry).',
] as const;
/** Cheap pre-parse bound. Restore runs synchronously on the calling thread; this cap equals the export limit, so every LV export restores. */
export const RESTORE_MAX_BYTES = STRATEGY_REPORT_LIMITS.exportBytes;

/** A saved report from before a metric existed restores that metric as unavailable, never as a number. */
function withLaterMetrics(metrics: unknown): unknown {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return metrics;
  const copy: Record<string, unknown> = { ...(metrics as Record<string, unknown>) };
  for (const side of ['all', 'long', 'short']) {
    const values = copy[side]; if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    const filled: Record<string, unknown> = { ...(values as Record<string, unknown>) };
    for (const definition of STRATEGY_REPORT_METRICS) if (definition.since && !Object.hasOwn(filled, definition.key)) filled[definition.key] = { value: null, status: 'unavailable', unit: definition.unit, basis: 'Unavailable', reason: 'Not in this saved report: it was exported before this metric existed.' };
    copy[side] = filled;
  }
  return copy;
}
export function restoreStrategyReportJson(text: unknown): RestoredStrategyReport {
  if (typeof text !== 'string' || !text.trim()) reject('REPORT_RESTORE_EMPTY', 'Paste the text of an OpenCandle strategy report JSON export.');
  const tooLarge = () => reject('REPORT_RESTORE_SIZE', 'Saved report JSON exceeds the 20 MiB export limit. Nothing was parsed.');
  // Every UTF-16 unit encodes to at least one UTF-8 byte, so this rejects huge pastes before allocating an encoding.
  if ((text as string).length > RESTORE_MAX_BYTES) tooLarge();
  const bytes = new TextEncoder().encode(text as string).byteLength;
  if (bytes > RESTORE_MAX_BYTES) tooLarge();
  let value: unknown;
  try { value = JSON.parse(text as string); } catch { reject('REPORT_RESTORE_JSON', 'The saved report is not valid JSON.'); }
  ownRecord(value, 'Saved report', [...REQUIRED, 'analysis']);
  const raw = value as Record<string, unknown>;
  if (REQUIRED.some(key => !Object.hasOwn(raw, key))) reject('REPORT_RESTORE_SCHEMA', 'The saved report is missing required report sections.');
  if (raw.schemaVersion !== 1) reject('REPORT_RESTORE_VERSION', 'Only OpenCandle strategy report schema version 1 can be restored.');
  ownArray(raw.trades, 'Saved trades', STRATEGY_REPORT_LIMITS.trades); ownArray(raw.openLots, 'Saved open entries', STRATEGY_REPORT_LIMITS.trades); ownArray(raw.orders, 'Saved orders', STRATEGY_REPORT_LIMITS.orders);
  ownArray(raw.equity, 'Saved equity', STRATEGY_REPORT_LIMITS.bars); ownArray(raw.diagnostics, 'Saved diagnostics', 100000);
  ownRecord(raw.config, 'Saved properties');
  const config = raw.config as unknown as StrategyConfig, bars = (raw.equity as unknown[]).length;
  const standard = config.chartType === 'heikin-ashi' && config.fillBasis === 'standard-ohlc';
  const start = validateReportStart({ context: raw.context, config: raw.config, counts: { bars, standardBars: standard ? bars : 0, barIds: bars, proposals: 0 }, chartType: config.chartType });
  // Recalculate on every tick and the Bar Magnifier restore only with the policy line their run recorded.
  const savedPolicies = Array.isArray(raw.policies) ? raw.policies as unknown[] : [], modes = validateStrategyConfig(config, { everyTick: savedPolicies.some(line => (Object.values(STRATEGY_EVERY_TICK_POLICIES) as unknown[]).includes(line)), magnifier: savedPolicies.some(line => typeof line === 'string' && line.startsWith(STRATEGY_MAGNIFIER_POLICY_PREFIX)) });
  if (modes.length) reject('REPORT_CONFIG', modes.join(' '));
  const counts = { bars, trades: (raw.trades as unknown[]).length, orders: (raw.orders as unknown[]).length, openLots: (raw.openLots as unknown[]).length, diagnostics: (raw.diagnostics as unknown[]).length };
  // A current export always carries analysis; only a missing key (checkpoint 4519 and earlier) restores without it.
  const hasAnalysis = Object.hasOwn(raw, 'analysis'), analysis = hasAnalysis ? raw.analysis : null;
  const summary = validateSummary({ context: raw.context, config: raw.config, fillBasis: raw.fillBasis, metrics: withLaterMetrics(raw.metrics), benchmark: raw.benchmark, drawdown: raw.drawdown, analysis, counts, policies: raw.policies, diagnostics: (raw.diagnostics as unknown[]).slice(0, 100), work: raw.work }, start, hasAnalysis);
  for (const row of raw.diagnostics as unknown[]) if (typeof row !== 'string' || row.length > 4096) reject('REPORT_RESTORE_SCHEMA', 'Saved diagnostics must be bounded text.');
  const trades = raw.trades as ReportTradePage['rows'][number][], lots = raw.openLots as ReportOpenLotPage['rows'][number][], orders = raw.orders as ReportOrderPage['rows'][number][], points = raw.equity as ReportEquityPoint[];
  const initial = new D(summary.config.initialCapital), checks: string[] = [], verified = new Set<string>(), unverified: string[] = [...RESTORE_UNVERIFIED];
  const fail = (label: string) => reject('REPORT_RESTORE_ARITHMETIC', `${label} does not agree with the saved rows.`);
  // Validate the location index before comparing any trade or open-lot location against it.
  points.forEach((row, index) => { equity(row, bars); if (row.barIndex !== index) reject('REPORT_RESTORE_EQUITY', 'Saved equity rows are not contiguous.'); });
  const checkLocation = (location: ReportTradePage['rows'][number]['entry'], label: string) => {
    const point = points[location.barIndex];
    if (!point || location.barId !== point.barId || location.time !== point.time) reject('REPORT_RESTORE_LOCATION', `${label} time or bar identity does not match its saved equity row.`);
  };

  // Per-direction totals, mirroring the report model's own definitions.
  type Side = { count: number; wins: number; losses: number; even: number; net: Decimal; profit: Decimal; loss: Decimal; fees: Decimal; bars: number; winBars: number; lossBars: number; largestWin: number | null; largestLoss: number | null; openCount: number; openGross: Decimal; openFees: Decimal; kind: string | null; run: number; runNet: Decimal; longestWins: number; longestLosses: number; best: Decimal | null; worst: Decimal | null; hour: Bucket[]; weekday: Bucket[]; month: Bucket[]; returns: Decimal; winReturns: Decimal; lossReturns: Decimal; largestWinReturn: number | null; largestLossReturn: number | null };
  type Bucket = { trades: number; wins: number; losses: number; even: number; net: Decimal };
  const buckets = (size: number) => Array.from({ length: size }, () => ({ trades: 0, wins: 0, losses: 0, even: 0, net: new D(0) }));
  const sides = Object.fromEntries((['all', 'long', 'short'] as const).map(side => [side, { count: 0, wins: 0, losses: 0, even: 0, net: new D(0), profit: new D(0), loss: new D(0), fees: new D(0), bars: 0, winBars: 0, lossBars: 0, largestWin: null, largestLoss: null, openCount: 0, openGross: new D(0), openFees: new D(0), kind: null, run: 0, runNet: new D(0), longestWins: 0, longestLosses: 0, best: null, worst: null, hour: buckets(24), weekday: buckets(7), month: buckets(12), returns: new D(0), winReturns: new D(0), lossReturns: new D(0), largestWinReturn: null, largestLossReturn: null } as Side])) as Record<StrategyReportSide, Side>;
  const when = summary.analysis ? reportCalendar(summary.context.timezone) : null;
  const closedByBar = new Map<number, Decimal>();
  let cumulative = new D(0);
  trades.forEach((row, index) => {
    trade(row, bars);
    checkLocation(row.entry, `Saved trade ${index + 1} entry`); checkLocation(row.exit, `Saved trade ${index + 1} exit`);
    if (row.number !== index + 1 || row.id !== `trade:${index + 1}`) reject('REPORT_RESTORE_TRADE', 'Saved trades are not in their original chronological numbering.');
    if (row.exit.barIndex < row.entry.barIndex || row.barsHeld !== row.exit.barIndex - row.entry.barIndex + 1) reject('REPORT_RESTORE_TRADE', `Saved trade ${index + 1} has inconsistent entry, exit and duration rows.`);
    const gross = new D(row.exitPrice).sub(row.entryPrice).mul(row.quantity).mul(row.direction === 'long' ? 1 : -1), notional = new D(row.entryPrice).mul(row.quantity);
    cumulative = cumulative.add(row.netProfit);
    // The report divides by its own 10-dp rounded notional, so return % is recomputed from the saved (checked) notional.
    if (!close(gross, row.grossProfit) || !close(notional, row.entryNotional) || !close(new D(row.grossProfit).sub(row.commission), row.netProfit) || !close(cumulative, row.cumulativeNet) || !close(cumulative.div(initial).mul(100), row.cumulativePercent) || !close(new D(row.netProfit).div(row.entryNotional).mul(100), row.returnPercent)) reject('REPORT_RESTORE_ARITHMETIC', `Saved trade ${index + 1} does not reconcile prices, quantity, fees, net and cumulative results.`);
    closedByBar.set(row.exit.barIndex, (closedByBar.get(row.exit.barIndex) ?? new D(0)).add(row.netProfit));
    const kind = row.netProfit > 0 ? 'win' : row.netProfit < 0 ? 'loss' : 'even', at = when?.(row.entry.time);
    for (const side of ['all', row.direction] as const) {
      const t = sides[side]; t.count++; t.net = t.net.add(row.netProfit); t.fees = t.fees.add(row.commission); t.bars += row.barsHeld; t.returns = t.returns.add(row.returnPercent);
      if (kind === 'win') { t.winReturns = t.winReturns.add(row.returnPercent); t.largestWinReturn = Math.max(t.largestWinReturn ?? -Infinity, row.returnPercent); } else if (kind === 'loss') { t.lossReturns = t.lossReturns.sub(row.returnPercent); t.largestLossReturn = Math.max(t.largestLossReturn ?? -Infinity, -row.returnPercent); }
      if (kind === 'win') { t.wins++; t.profit = t.profit.add(row.netProfit); t.winBars += row.barsHeld; t.largestWin = Math.max(t.largestWin ?? 0, row.netProfit); }
      else if (kind === 'loss') { t.losses++; t.loss = t.loss.sub(row.netProfit); t.lossBars += row.barsHeld; t.largestLoss = Math.max(t.largestLoss ?? 0, -row.netProfit); } else t.even++;
      if (t.kind === kind) { t.run++; t.runNet = t.runNet.add(row.netProfit); } else { t.kind = kind; t.run = 1; t.runNet = new D(row.netProfit); }
      if (kind === 'win') { t.longestWins = Math.max(t.longestWins, t.run); t.best = t.best === null ? t.runNet : D.max(t.best, t.runNet); }
      if (kind === 'loss') { t.longestLosses = Math.max(t.longestLosses, t.run); t.worst = t.worst === null ? t.runNet : D.min(t.worst, t.runNet); }
      if (at) for (const bucket of [t.hour[at.hour], t.weekday[at.weekday], t.month[at.month]]) { bucket.trades++; if (kind === 'win') bucket.wins++; else if (kind === 'loss') bucket.losses++; else bucket.even++; bucket.net = bucket.net.add(row.netProfit); }
    }
  });
  const lastMark = lots.length ? lots[0].mark : null;
  for (const row of lots) {
    openLot(row, bars);
    checkLocation(row.entry, 'Saved open entry');
    const gross = new D(row.mark).sub(row.entryPrice).mul(row.quantity).mul(row.direction === 'long' ? 1 : -1);
    if (row.mark !== lastMark || !close(gross, row.grossProfit) || !close(new D(row.entryPrice).mul(row.quantity), row.entryNotional) || !close(new D(row.grossProfit).sub(row.remainingEntryCommission), row.netProfit)) reject('REPORT_RESTORE_ARITHMETIC', 'A saved open entry does not reconcile its mark, gross, fees and net.');
    for (const side of ['all', row.direction] as const) { const t = sides[side]; t.openCount++; t.openGross = t.openGross.add(row.grossProfit); t.openFees = t.openFees.add(row.remainingEntryCommission); t.fees = t.fees.add(row.remainingEntryCommission); }
  }
  for (const row of orders) order(row, bars);

  // Close-equity statistics, replicating the report's rounding and strict comparisons, seeded with initial capital.
  let peak = initial.toNumber(), peakId: string | null = null, trough = peak, maxDrawdown = 0, maxDrawdownPercent = 0, maxRunup = 0, maxRunupPercent = 0, peakForDrawdown = peak, drawdownPeakId: string | null = null, troughId: string | null = null, closedNet = new D(0);
  points.forEach((row, index) => {
    const marked = row.equity; trough = Math.min(trough, marked); maxRunup = Math.max(maxRunup, round(new D(marked).sub(trough))); if (trough > 0) maxRunupPercent = Math.max(maxRunupPercent, round(new D(marked).sub(trough).div(trough).mul(100)));
    if (marked > peak) { peak = marked; peakId = row.barId; }
    const decline = round(new D(peak).sub(marked)), percent = round(new D(decline).div(peak).mul(100));
    if (decline > maxDrawdown) { maxDrawdown = decline; peakForDrawdown = peak; drawdownPeakId = peakId; troughId = row.barId; }
    maxDrawdownPercent = Math.max(maxDrawdownPercent, percent); closedNet = closedNet.add(closedByBar.get(index) ?? 0);
    if (!close(decline, row.drawdown) || !close(percent, row.drawdownPercent) || !close(closedNet, row.closedNet)) reject('REPORT_RESTORE_EQUITY', `Saved equity row ${index} does not reconcile its drawdown or closed net.`);
  });
  const block = summary.drawdown, blockPercent = peakForDrawdown ? round(new D(maxDrawdown).div(peakForDrawdown).mul(100)) : 0;
  if (!close(block.amount, maxDrawdown) || !close(block.percent, blockPercent) || !close(block.peakEquity, peakForDrawdown) || block.peakBarId !== drawdownPeakId || block.troughBarId !== troughId) fail('The drawdown summary (amount, percent, peak and trough)');
  checks.push(`Drawdown summary: ${maxDrawdown} from ${drawdownPeakId ?? 'initial capital'} to ${troughId ?? 'none'}`);

  // Metric comparison. A metric the saved file marks unavailable (for example run-up in a checkpoint 4519 export)
  // is listed as not computed in that file instead of failing; it displays as Unavailable, never as a number.
  const metric = (side: StrategyReportSide, key: string, derived: number | Decimal | null, headline = false) => {
    const saved = summary.metrics[side][key], label = STRATEGY_REPORT_METRICS.find(item => item.key === key)!.label;
    if (saved.status === 'unavailable') { unverified.push(`${label} (${side}): unavailable in this saved report.`); return; }
    if (derived === null ? saved.value !== null : saved.value === null || !close(saved.value, derived)) fail(`${label} (${side})`);
    verified.add(side + '.' + key); if (headline) checks.push(`${label}: ${derived === null ? 'undefined' : new D(derived).toDecimalPlaces(10).toString()}`);
  };
  const ratio = (numerator: Decimal | number, denominator: Decimal | number) => new D(numerator).div(denominator);
  for (const side of ['all', 'long', 'short'] as const) {
    const t = sides[side], head = side === 'all', total = t.net.add(t.openGross).sub(t.openFees);
    metric(side, 'initialCapital', initial, head);
    metric(side, 'closedTrades', t.count, head); metric(side, 'openTrades', t.openCount, head); metric(side, 'winners', t.wins); metric(side, 'losers', t.losses); metric(side, 'evenTrades', t.even);
    metric(side, 'closedNet', t.net, head); metric(side, 'grossProfit', t.profit); metric(side, 'grossLoss', t.loss); metric(side, 'commission', t.fees, head);
    metric(side, 'profitFactor', t.loss.isZero() ? null : ratio(t.profit, t.loss)); metric(side, 'profitablePercent', t.count ? 100 * t.wins / t.count : null);
    metric(side, 'averagePnl', t.count ? ratio(t.net, t.count) : null); metric(side, 'expectedPayoff', t.count ? ratio(t.net, t.count) : null);
    metric(side, 'averageProfit', t.wins ? ratio(t.profit, t.wins) : null); metric(side, 'averageLoss', t.losses ? ratio(t.loss, t.losses) : null);
    metric(side, 'averageWinLoss', t.wins && t.losses && !t.loss.isZero() ? ratio(t.profit, t.wins).div(ratio(t.loss, t.losses)) : null);
    metric(side, 'largestProfit', t.largestWin, head); metric(side, 'largestLoss', t.largestLoss, head);
    metric(side, 'largestProfitShare', t.largestWin === null || t.profit.isZero() ? null : ratio(t.largestWin, t.profit).mul(100)); metric(side, 'largestLossShare', t.largestLoss === null || t.loss.isZero() ? null : ratio(t.largestLoss, t.loss).mul(100));
    metric(side, 'averageBars', t.count ? t.bars / t.count : null); metric(side, 'averageWinnerBars', t.wins ? t.winBars / t.wins : null); metric(side, 'averageLoserBars', t.losses ? t.lossBars / t.losses : null);
    metric(side, 'openGross', t.openGross); metric(side, 'openFees', t.openFees); metric(side, 'openNet', t.openGross.sub(t.openFees));
    // Percent forms, recomputed from the saved (checked) trades and open entries.
    metric(side, 'grossProfitPercent', t.profit.div(initial).mul(100)); metric(side, 'grossLossPercent', t.loss.div(initial).mul(100)); metric(side, 'openNetPercent', t.openGross.sub(t.openFees).div(initial).mul(100));
    metric(side, 'averagePnlPercent', t.count ? t.returns.div(t.count) : null); metric(side, 'averageProfitPercent', t.wins ? t.winReturns.div(t.wins) : null); metric(side, 'averageLossPercent', t.losses ? t.lossReturns.div(t.losses) : null);
    metric(side, 'largestProfitPercent', t.largestWinReturn); metric(side, 'largestLossPercent', t.largestLossReturn);
    metric(side, 'totalProfit', total, head); metric(side, 'totalReturn', total.div(initial).mul(100)); metric(side, 'closedReturn', t.net.div(initial).mul(100));
    if (head) {
      // Anchor the last close to the ledger. Each trade and open entry carries up to ~1e-10 of engine rounding.
      const ledger = initial.add(total), last = points.length ? points.at(-1)!.equity : initial.toNumber();
      if (!close(last, ledger, 1e-8 + (trades.length + lots.length + 1) * 5e-10)) fail('Final close equity versus initial capital plus total marked profit');
      metric(side, 'finalEquity', last, true); metric(side, 'maxDrawdown', maxDrawdown, true); metric(side, 'maxDrawdownPercent', maxDrawdownPercent); metric(side, 'maxRunup', maxRunup, true); metric(side, 'maxRunupPercent', maxRunupPercent);
    }
    if (summary.analysis) {
      const saved = summary.analysis.sides[side], streak = saved.streaks, outcome = saved.outcomes;
      const same = (rows: readonly ReportBucket[], derived: Bucket[]) => rows.every((row, key) => row.trades === derived[key].trades && row.wins === derived[key].wins && row.losses === derived[key].losses && row.even === derived[key].even && close(row.net, derived[key].net) && (row.winRate === null ? derived[key].trades === 0 : close(row.winRate, 100 * derived[key].wins / derived[key].trades)));
      if (outcome.trades !== t.count || outcome.wins !== t.wins || outcome.losses !== t.losses || outcome.even !== t.even || streak.longestWins !== t.longestWins || streak.longestLosses !== t.longestLosses || streak.finalCount !== t.run || streak.finalKind !== t.kind || (streak.bestWinRun === null) !== (t.best === null) || t.best && !close(t.best, streak.bestWinRun!) || (streak.worstLossRun === null) !== (t.worst === null) || t.worst && !close(t.worst, streak.worstLossRun!)) fail(`Trade analysis outcomes and streaks (${side})`);
      const shareMatches = (savedShare: number | null, count: number) => t.count === 0 ? savedShare === null : savedShare !== null && close(savedShare, 100 * count / t.count);
      if (!shareMatches(outcome.winShare, t.wins) || !shareMatches(outcome.lossShare, t.losses) || !shareMatches(outcome.evenShare, t.even)) fail(`Trade analysis outcome percentages (${side})`);
      if (!same(saved.hour, t.hour) || !same(saved.weekday, t.weekday) || !same(saved.month, t.month)) fail(`Entry-time groups (${side})`);
    }
  }
  checks.push(summary.analysis ? 'Trade analysis outcomes, streaks and entry-time groups: recomputed in the saved time zone and matched' : 'Trade analysis: absent from this older export');
  return freezeData({ origin: 'saved-report-json', bytes, summary, trades, openLots: lots, orders, equity: points, verified: [...verified], checks, unverified }) as RestoredStrategyReport;
}
