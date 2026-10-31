import { STRATEGY_REPORT_METRICS } from '../domain/strategy-report-catalog';
import { REPORT_TRADE_COLUMNS } from '../domain/strategy-report-view';
import { boundedText, copyWire, integer, ownArray, ownRecord, reject } from './data';
import { exact, finite, validateReportStart } from './schema';
import { REPORT_WORKER_LIMITS as LIMIT, type ReportStart, type StrategyReportSummary } from './types';

function choice(value: unknown, allowed: readonly unknown[], label: string) {
  if (!allowed.includes(value)) reject('REPORT_REPLY_SCHEMA', `Invalid ${label}.`);
}
function nullableNumber(value: unknown, label: string, minimum = -1e100) { if (value !== null) finite(value, label, minimum); }
function nullableText(value: unknown, label: string, maximum: number) { if (value !== null) boundedText(value, label, maximum); }
function strings(value: unknown, label: string, maximum: number) {
  ownArray(value, label, maximum); for (const item of value) boundedText(item, label, 4096, true);
}
export function location(value: unknown, bars: number) {
  exact(value, 'Fill location', ['barIndex', 'barId', 'time', 'phase', 'timeBasis', 'routePosition']);
  const item = value as Record<string, unknown>;
  integer(item.barIndex, 'Fill row', 0, bars - 1); boundedText(item.barId, 'Fill row identity', 512);
  integer(item.time, 'Fill event time', -62135596800, 253402300799);
  choice(item.phase, ['open', 'intrabar', 'close'], 'fill phase'); choice(item.timeBasis, ['bar-event-open'], 'fill time basis');
  if (item.routePosition !== null) { finite(item.routePosition, 'Route position', 0); if ((item.routePosition as number) > 4) reject('REPORT_REPLY_SCHEMA', 'Invalid fill route position.'); }
}
export function metric(value: unknown, unit?: string) {
  exact(value, 'Report value', ['value', 'status', 'unit', 'basis', 'reason']); const item = value as Record<string, unknown>;
  nullableNumber(item.value, 'Report value'); choice(item.status, ['available', 'undefined', 'unavailable'], 'value status');
  choice(item.unit, unit ? [unit] : ['currency', 'percent', 'ratio', 'count', 'bars', 'seconds'], 'value unit');
  boundedText(item.basis, 'Value basis', 4096, true); nullableText(item.reason, 'Value limitation', 4096);
  if ((item.status === 'available') !== (item.value !== null)) reject('REPORT_REPLY_SCHEMA', 'A report value contradicts its availability.');
}
/** Signal names are newer: reports saved before them carry none, so they are optional together (absent rows fall back to strategyOrderLabel). */
function signalKeys(value: unknown, keys: readonly string[]): string[] { return typeof value === 'object' && value !== null && keys.some(key => Object.hasOwn(value, key)) ? [...keys] : []; }
export function trade(value: unknown, bars: number) {
  exact(value, 'Report trade', [...signalKeys(value, ['entrySignal', 'exitSignal']), 'id', 'number', 'direction', 'quantity', 'entryOrderId', 'exitOrderId', 'entry', 'exit', 'entryPrice', 'exitPrice', 'entryNotional', 'grossProfit', 'commission', 'netProfit', 'returnPercent', 'cumulativeNet', 'cumulativePercent', 'barsHeld', 'favorable', 'adverse', 'favorablePercent', 'adversePercent']);
  const row = value as Record<string, unknown>;
  boundedText(row.id, 'Trade identity', 512); integer(row.number, 'Trade number', 1, 200000); choice(row.direction, ['long', 'short'], 'trade direction');
  boundedText(row.entryOrderId, 'Entry identity', 512); boundedText(row.exitOrderId, 'Exit identity', 512); if (Object.hasOwn(row, 'entrySignal')) { boundedText(row.entrySignal, 'Entry signal', 512); boundedText(row.exitSignal, 'Exit signal', 512); }
  location(row.entry, bars); location(row.exit, bars); integer(row.barsHeld, 'Trade duration', 1, bars);
  for (const key of ['quantity', 'entryPrice', 'exitPrice', 'entryNotional']) finite(row[key], key, Number.MIN_VALUE);
  for (const key of ['grossProfit', 'netProfit', 'returnPercent', 'cumulativeNet', 'cumulativePercent']) finite(row[key], key);
  finite(row.commission, 'Allocated commission', 0);
  for (const key of ['favorable', 'adverse']) metric(row[key], 'currency');
  for (const key of ['favorablePercent', 'adversePercent']) metric(row[key], 'percent');
}
export function openLot(value: unknown, bars: number) {
  exact(value, 'Open allocation', [...signalKeys(value, ['entrySignal']), 'id', 'direction', 'quantity', 'entryOrderId', 'entry', 'entryPrice', 'mark', 'entryNotional', 'grossProfit', 'remainingEntryCommission', 'netProfit']);
  const row = value as Record<string, unknown>; boundedText(row.id, 'Open allocation identity', 512); boundedText(row.entryOrderId, 'Entry identity', 512); if (Object.hasOwn(row, 'entrySignal')) boundedText(row.entrySignal, 'Entry signal', 512);
  choice(row.direction, ['long', 'short'], 'allocation direction'); location(row.entry, bars);
  for (const key of ['quantity', 'entryPrice', 'mark', 'entryNotional']) finite(row[key], key, Number.MIN_VALUE);
  for (const key of ['grossProfit', 'netProfit']) finite(row[key], key);
  finite(row.remainingEntryCommission, 'Open allocation fees', 0);
}
export function order(value: unknown, bars: number) {
  ownRecord(value, 'Report order', ['id', 'action', 'quantity', 'type', 'createdBar', 'eligibleBar', 'status', 'fillBar', 'fillPrice', 'limitPrice', 'stopPrice', 'reduceOnly', 'targetOrderId', 'reason', 'label', 'entryLabel', 'exitLabel']);
  const row = value as Record<string, unknown>; boundedText(row.id, 'Order identity', 512);
  choice(row.action, ['buy', 'sell'], 'order action'); choice(row.type, ['market', 'limit', 'stop', 'stop-limit', 'trailing-stop'], 'order type');
  choice(row.status, ['working', 'triggered', 'filled', 'cancelled', 'rejected'], 'order status');
  finite(row.quantity, 'Order quantity', Number.MIN_VALUE); integer(row.createdBar, 'Created row', 0, bars - 1); integer(row.eligibleBar, 'Eligible row', 0, bars);
  if (row.fillBar !== null) integer(row.fillBar, 'Fill row', 0, bars - 1); nullableNumber(row.fillPrice, 'Fill price', Number.MIN_VALUE);
  for (const key of ['limitPrice', 'stopPrice']) if (Object.hasOwn(row, key)) finite(row[key], key, Number.MIN_VALUE);
  if (Object.hasOwn(row, 'reduceOnly')) choice(row.reduceOnly, [true, false], 'reduce-only');
  if (Object.hasOwn(row, 'targetOrderId')) boundedText(row.targetOrderId, 'Target identity', 512);
  if (Object.hasOwn(row, 'reason')) boundedText(row.reason, 'Order diagnostic', 4096, true);
  for (const key of ['label', 'entryLabel', 'exitLabel']) if (Object.hasOwn(row, key)) boundedText(row[key], 'Order label', 512);
}
export function equity(value: unknown, bars: number) {
  exact(value, 'Equity point', ['barIndex', 'barId', 'time', 'equity', 'closedNet', 'drawdown', 'drawdownPercent', 'buyHoldEquity']); const row = value as Record<string, unknown>;
  integer(row.barIndex, 'Equity row', 0, bars - 1); boundedText(row.barId, 'Equity row identity', 512); integer(row.time, 'Equity time', -62135596800, 253402300799);
  finite(row.equity, 'Equity'); finite(row.closedNet, 'Closed net'); finite(row.drawdown, 'Drawdown', 0); finite(row.drawdownPercent, 'Drawdown percent', 0); nullableNumber(row.buyHoldEquity, 'Benchmark equity');
}
function bucket(value: unknown, key: number) {
  exact(value, 'Analysis group', ['key', 'trades', 'wins', 'losses', 'even', 'net', 'winRate']); const row = value as Record<string, unknown>;
  if (row.key !== key) reject('REPORT_REPLY_SCHEMA', 'Analysis groups must be complete and ordered.');
  for (const field of ['trades', 'wins', 'losses', 'even']) integer(row[field], 'Analysis count', 0, 200000);
  if ((row.wins as number) + (row.losses as number) + (row.even as number) !== row.trades) reject('REPORT_REPLY_SCHEMA', 'Analysis outcome counts do not add up.');
  finite(row.net, 'Analysis net'); nullableNumber(row.winRate, 'Analysis win rate', 0); if ((row.winRate === null) !== (row.trades === 0)) reject('REPORT_REPLY_SCHEMA', 'Analysis win rate contradicts its count.');
}
/** Validates the closed-allocation analysis attached to one report. */
/** Optional calendar periodical/benchmark rows (absent from exports made before they existed). */
function validatePeriods(value: unknown, trades: number) {
  exact(value, 'Report periods', ['basis', 'rows']); const periods = value as Record<string, unknown>; boundedText(periods.basis, 'Period basis', 4096);
  exact(periods.rows, 'Period kinds', ['day', 'week', 'month', 'quarter', 'year']); const kinds = periods.rows as Record<string, unknown>;
  for (const kind of ['day', 'week', 'month', 'quarter', 'year']) {
    if (kinds[kind] === null) continue; ownArray(kinds[kind], 'Period rows', 500); let next = 0, closed = 0;
    for (const entry of kinds[kind] as unknown[]) {
      exact(entry, 'Period row', ['key', 'startBarIndex', 'endBarIndex', 'closedTrades', 'closedNet', 'openingEquity', 'closingEquity', 'returnPercent', 'benchmarkReturnPercent']); const row = entry as Record<string, unknown>;
      boundedText(row.key, 'Period key', 16); if (integer(row.startBarIndex, 'Period start', 0, LIMIT.bars) !== next) reject('REPORT_REPLY_SCHEMA', 'Period rows must be contiguous.');
      next = integer(row.endBarIndex, 'Period end', row.startBarIndex as number, LIMIT.bars) + 1; closed += integer(row.closedTrades, 'Period trades', 0, trades);
      for (const field of ['closedNet', 'openingEquity', 'closingEquity'] as const) finite(row[field], 'Period value'); nullableNumber(row.returnPercent, 'Period return'); nullableNumber(row.benchmarkReturnPercent, 'Period benchmark return');
    }
    if (closed !== trades) reject('REPORT_REPLY_SCHEMA', 'Period rows do not cover every closed allocation.');
  }
}
/** Optional RPST analyses (distribution, margin usage, growth/decline, benchmark); every series is bounded to 500 rows. */
function unavailableRow(value: unknown, label: string): boolean {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).available === false) { exact(value, label, ['available', 'reason']); boundedText((value as Record<string, unknown>).reason, label + ' reason', 4096); return true; }
  return false;
}
function validateRpst(value: unknown, trades: number) {
  exact(value, 'RPST analysis', ['distribution', 'margin', 'growthDecline', 'benchmark']); const item = value as Record<string, Record<string, unknown>>;
  if (!unavailableRow(item.distribution, 'Distribution')) {
    const d = item.distribution; exact(d, 'Distribution', ['available', 'basis', 'binWidthPercent', 'bins', 'averageGainPercent', 'averageLossPercent', 'outliers']);
    if (d.available !== true) reject('REPORT_REPLY_SCHEMA', 'Distribution availability is invalid.'); boundedText(d.basis, 'Distribution basis', 4096); finite(d.binWidthPercent, 'Bin width', Number.MIN_VALUE);
    ownArray(d.bins, 'Distribution bins', 64); let count = 0;
    for (const entry of d.bins as unknown[]) { exact(entry, 'Distribution bin', ['from', 'to', 'winning', 'losing', 'even']); const bin = entry as Record<string, unknown>; finite(bin.from, 'Bin start'); finite(bin.to, 'Bin end'); for (const field of ['winning', 'losing', 'even']) count += integer(bin[field], 'Bin count', 0, trades); }
    if (count > trades) reject('REPORT_REPLY_SCHEMA', 'Distribution counts exceed the closed trades.');
    nullableNumber(d.averageGainPercent, 'Average gain'); nullableNumber(d.averageLossPercent, 'Average loss'); if (!unavailableRow(d.outliers, 'Outliers')) reject('REPORT_REPLY_SCHEMA', 'Outliers must stay unavailable.');
  }
  exact(item.margin, 'Margin usage', ['basis', 'points', 'sampled', 'maxMargin']); boundedText(item.margin.basis, 'Margin basis', 4096); finite(item.margin.maxMargin, 'Maximum margin', 0); if (typeof item.margin.sampled !== 'boolean') reject('REPORT_REPLY_SCHEMA', 'Margin sampling flag is invalid.');
  ownArray(item.margin.points, 'Margin points', 500);
  for (const entry of item.margin.points as unknown[]) { exact(entry, 'Margin point', ['barIndex', 'time', 'position', 'margin', 'openTrades']); const point = entry as Record<string, unknown>; integer(point.barIndex, 'Margin bar', 0, LIMIT.bars); integer(point.time, 'Margin time', -62135596800, 253402300799); finite(point.position, 'Margin position'); finite(point.margin, 'Margin', 0); integer(point.openTrades, 'Open trades', 0, LIMIT.bars); }
  const growth = item.growthDecline; exact(growth, 'Growth and decline', ['basis', 'periods', 'omitted', 'summary']); boundedText(growth.basis, 'Growth basis', 4096); integer(growth.omitted, 'Omitted periods', 0, LIMIT.bars);
  ownArray(growth.periods, 'Growth and decline periods', 500);
  for (const entry of growth.periods as unknown[]) { exact(entry, 'Growth or decline period', ['kind', 'amount', 'percent', 'startTime', 'endTime']); const row = entry as Record<string, unknown>; choice(row.kind, ['growth', 'decline'], 'period kind'); finite(row.amount, 'Period amount', 0); nullableNumber(row.percent, 'Period percent'); integer(row.startTime, 'Period start', -62135596800, 253402300799); integer(row.endTime, 'Period end', row.startTime as number, 253402300799); }
  exact(growth.summary, 'Growth and decline summary', ['growth', 'decline']); const summary = growth.summary as Record<string, unknown>;
  for (const kind of ['growth', 'decline']) { exact(summary[kind], 'Period summary', ['max', 'average', 'current']); const row = summary[kind] as Record<string, unknown>; nullableNumber(row.max, 'Period max', 0); nullableNumber(row.average, 'Period average', 0); finite(row.current, 'Current period', 0); }
  if (!unavailableRow(item.benchmark, 'Benchmark')) {
    exact(item.benchmark, 'Benchmark', ['points', 'sampled']); if (typeof item.benchmark.sampled !== 'boolean') reject('REPORT_REPLY_SCHEMA', 'Benchmark sampling flag is invalid.'); ownArray(item.benchmark.points, 'Benchmark points', 500);
    for (const entry of item.benchmark.points as unknown[]) { exact(entry, 'Benchmark point', ['time', 'strategyPercent', 'benchmarkPercent']); const point = entry as Record<string, unknown>; integer(point.time, 'Benchmark time', -62135596800, 253402300799); finite(point.strategyPercent, 'Strategy return'); nullableNumber(point.benchmarkPercent, 'Benchmark return'); }
  }
}
export function validateAnalysis(value: unknown, trades: number, timezone: string) {
  ownRecord(value, 'Trade analysis', ['basis', 'timezone', 'sides', 'periods', 'rpst']); const item = value as Record<string, unknown>;
  if (Object.hasOwn(item, 'rpst')) validateRpst(item.rpst, trades);
  for (const field of ['basis', 'timezone', 'sides']) if (!Object.hasOwn(item, field)) reject('REPORT_TRANSPORT_FIELDS', 'Trade analysis has missing fields.');
  if (Object.hasOwn(item, 'periods')) validatePeriods(item.periods, trades);
  boundedText(item.basis, 'Analysis basis', 4096); if (item.timezone !== timezone) reject('REPORT_REPLY_SCHEMA', 'Analysis time zone differs from its report.');
  exact(item.sides, 'Analysis directions', ['all', 'long', 'short']); const sides = item.sides as Record<string, Record<string, unknown>>;
  let directional = 0;
  for (const side of ['all', 'long', 'short']) {
    exact(sides[side], 'Direction analysis', ['outcomes', 'streaks', 'hour', 'weekday', 'month']); const row = sides[side];
    exact(row.outcomes, 'Outcomes', ['trades', 'wins', 'losses', 'even', 'winShare', 'lossShare', 'evenShare']); const outcomes = row.outcomes as Record<string, unknown>;
    for (const field of ['trades', 'wins', 'losses', 'even']) integer(outcomes[field], 'Outcome count', 0, trades);
    if ((outcomes.wins as number) + (outcomes.losses as number) + (outcomes.even as number) !== outcomes.trades || side === 'all' && outcomes.trades !== trades) reject('REPORT_REPLY_SCHEMA', 'Outcome counts contradict the report.');
    if (side !== 'all') directional += outcomes.trades as number;
    for (const field of ['winShare', 'lossShare', 'evenShare']) { nullableNumber(outcomes[field], 'Outcome share', 0); if ((outcomes[field] === null) !== (outcomes.trades === 0)) reject('REPORT_REPLY_SCHEMA', 'Outcome share contradicts its count.'); }
    exact(row.streaks, 'Streaks', ['longestWins', 'longestLosses', 'bestWinRun', 'worstLossRun', 'finalKind', 'finalCount']); const streaks = row.streaks as Record<string, unknown>;
    integer(streaks.longestWins, 'Win streak', 0, outcomes.wins as number); integer(streaks.longestLosses, 'Loss streak', 0, outcomes.losses as number); integer(streaks.finalCount, 'Final streak', 0, outcomes.trades as number);
    nullableNumber(streaks.bestWinRun, 'Winning run net', 0); nullableNumber(streaks.worstLossRun, 'Losing run net'); if (streaks.worstLossRun !== null && (streaks.worstLossRun as number) > 0) reject('REPORT_REPLY_SCHEMA', 'A losing run cannot be positive.');
    if ((streaks.bestWinRun === null) !== (outcomes.wins === 0) || (streaks.worstLossRun === null) !== (outcomes.losses === 0)) reject('REPORT_REPLY_SCHEMA', 'Run amounts contradict outcome counts.');
    if (streaks.finalKind !== null) choice(streaks.finalKind, ['win', 'loss', 'even'], 'final streak kind'); if ((streaks.finalKind === null) !== (streaks.finalCount === 0)) reject('REPORT_REPLY_SCHEMA', 'Final streak contradicts its count.');
    for (const [field, size] of [['hour', 24], ['weekday', 7], ['month', 12]] as const) { ownArray(row[field], 'Analysis groups', size); const list = row[field] as unknown[]; if (list.length !== size) reject('REPORT_REPLY_SCHEMA', 'Analysis groups are incomplete.'); let count = 0; list.forEach((entry, key) => { bucket(entry, key); count += (entry as { trades: number }).trades; }); if (count !== outcomes.trades) reject('REPORT_REPLY_SCHEMA', 'Analysis groups do not cover every closed allocation.'); }
  }
  if (directional !== trades) reject('REPORT_REPLY_SCHEMA', 'Long and short analysis do not cover every closed allocation.');
}
export function freezeData<T>(value: T): T {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freezeData(item); Object.freeze(value); }
  return value;
}
export function validateSummary(value: unknown, start: ReportStart, requireAnalysis = true): StrategyReportSummary {
  exact(value, 'Report summary', ['context', 'config', 'fillBasis', 'metrics', 'benchmark', 'drawdown', 'analysis', 'counts', 'policies', 'diagnostics', 'work']);
  const summary = value as StrategyReportSummary;
  const checked = validateReportStart({ context: summary.context, config: summary.config, counts: start.counts, chartType: start.chartType });
  if (JSON.stringify(checked.context) !== JSON.stringify(start.context) || JSON.stringify(checked.config) !== JSON.stringify(start.config) || summary.fillBasis !== start.config.fillBasis) reject('REPORT_REPLY_OWNER', 'The report does not describe its accepted execution and properties.');
  exact(summary.counts, 'Summary counts', ['bars', 'trades', 'orders', 'openLots', 'diagnostics']);
  integer(summary.counts.bars, 'Equity count', 0, LIMIT.bars); if (summary.counts.bars !== start.counts.bars) reject('REPORT_REPLY_PREFIX', 'The report changed its accepted prefix.');
  for (const field of ['trades', 'orders', 'openLots', 'diagnostics'] as const) integer(summary.counts[field], field, 0, field === 'trades' ? 200000 : 100000);
  exact(summary.metrics, 'Direction metrics', ['all', 'long', 'short']);
  const keys = STRATEGY_REPORT_METRICS.map(item => item.key);
  for (const direction of ['all', 'long', 'short'] as const) {
    // Metrics added after earlier exports ('since') may be absent from a saved report; restore fills them as unavailable.
    ownRecord(summary.metrics[direction], 'Metrics', keys, 128);
    if (STRATEGY_REPORT_METRICS.some(definition => !definition.since && !Object.hasOwn(summary.metrics[direction], definition.key))) reject('REPORT_TRANSPORT_FIELDS', 'Metrics has missing fields.');
    // A null unavailable value from an older export may carry the unit that version used (for example liquidated volume
    // was a count before it became a currency notional); available and undefined values must match the current unit.
    for (const definition of STRATEGY_REPORT_METRICS) { const saved = summary.metrics[direction][definition.key] as unknown as Record<string, unknown> | undefined; if (saved === undefined && definition.since) continue; metric(saved, saved && saved.status === 'unavailable' && saved.value === null ? undefined : definition.unit); }
  }
  exact(summary.benchmark, 'Benchmark', ['start', 'entryMark', 'lastMark', 'policy']);
  if (summary.benchmark.start !== null) location(summary.benchmark.start, summary.counts.bars);
  nullableNumber(summary.benchmark.entryMark, 'Benchmark entry', Number.MIN_VALUE); nullableNumber(summary.benchmark.lastMark, 'Benchmark mark', Number.MIN_VALUE); boundedText(summary.benchmark.policy, 'Benchmark policy', 4096);
  exact(summary.drawdown, 'Drawdown', ['amount', 'percent', 'peakBarId', 'troughBarId', 'peakEquity']);
  finite(summary.drawdown.amount, 'Drawdown amount', 0); finite(summary.drawdown.percent, 'Drawdown percent', 0); finite(summary.drawdown.peakEquity, 'Drawdown peak', Number.MIN_VALUE);
  nullableText(summary.drawdown.peakBarId, 'Peak identity', 512); nullableText(summary.drawdown.troughBarId, 'Trough identity', 512);
  strings(summary.policies, 'Report policy', 100); strings(summary.diagnostics, 'Report diagnostic', 100);
  if (summary.diagnostics.length !== Math.min(100, summary.counts.diagnostics)) reject('REPORT_REPLY_SCHEMA', 'The diagnostic sample does not match its count.');
  integer(summary.work, 'Report work', 0, 10000000);
  if (requireAnalysis || summary.analysis !== null) validateAnalysis(summary.analysis, summary.counts.trades, summary.context.timezone);
  return freezeData(summary);
}
export function validateQuery(kind: string, fields: unknown): void {
  ownRecord(fields, 'Query fields'); const input = fields as Record<string, unknown>;
  if (kind === 'trades') {
    exact(input, 'Trade request', ['query']); exact(input.query, 'Trade query', ['side', 'query', 'sort', 'descending', 'page']);
    const query = input.query as Record<string, unknown>; choice(query.side, ['all', 'long', 'short'], 'trade direction'); boundedText(query.query, 'Trade search', 200, true);
    choice(query.sort, REPORT_TRADE_COLUMNS.map(([key]) => key), 'trade sort'); choice(query.descending, [true, false], 'sort direction'); integer(query.page, 'Page', 0, 1000000);
  } else if (kind === 'orders' || kind === 'openLots') {
    exact(input, 'Table request', kind === 'orders' ? ['page'] : ['page', 'side']); integer(input.page, 'Page', 0, 1000000); if (kind === 'openLots') choice(input.side, ['all', 'long', 'short'], 'allocation direction');
  } else if (kind === 'plot') {
    exact(input, 'Plot request', ['query']); exact(input.query, 'Plot query', ['series', 'percent', 'benchmark', 'favorable', 'adverse']); const query = input.query as Record<string, unknown>;
    choice(query.series, ['equity', 'closed', 'drawdown'], 'curve'); for (const key of ['percent', 'benchmark', 'favorable', 'adverse']) choice(query[key], [true, false], key);
  } else if (kind === 'inspect') { exact(input, 'Inspection request', ['barIndex']); integer(input.barIndex, 'Inspected row', 0, LIMIT.bars - 1); }
  else if (kind === 'export') { exact(input, 'Export request', ['format', 'side']); choice(input.format, ['metrics', 'trades', 'orders', 'json', 'xlsx'], 'export format'); choice(input.side, ['all', 'long', 'short'], 'export direction'); }
  else reject('REPORT_QUERY', 'Unsupported report query.');
}
export function validateResult(kind: string, value: unknown, summary: StrategyReportSummary): unknown {
  const bars = summary.counts.bars;
  if (['trades', 'orders', 'openLots'].includes(kind)) {
    exact(value, 'Table page', ['count', 'pages', 'page', 'rows']); const item = value as { count: number; pages: number; page: number; rows: unknown[] };
    integer(item.count, 'Table count', 0, kind === 'trades' ? summary.counts.trades : kind === 'orders' ? summary.counts.orders : summary.counts.openLots);
    const pages = Math.max(1, Math.ceil(item.count / 200)); if (item.pages !== pages) reject('REPORT_REPLY_SCHEMA', 'Invalid table page count.'); integer(item.page, 'Table page', 0, pages - 1);
    ownArray(item.rows, 'Table page rows', 200); if (item.rows.length !== Math.min(200, item.count - item.page * 200)) reject('REPORT_REPLY_SCHEMA', 'Table row count contradicts its page.');
    for (const row of item.rows) (kind === 'trades' ? trade : kind === 'orders' ? order : openLot)(row, bars);
  } else if (kind === 'plot') {
    exact(value, 'Curve response', ['count', 'min', 'max', 'values', 'benchmark', 'excursions']); const item = value as Record<string, unknown>;
    if (item.count !== bars) reject('REPORT_REPLY_PREFIX', 'Curve count changed its execution prefix.'); nullableNumber(item.min, 'Curve minimum'); nullableNumber(item.max, 'Curve maximum');
    if ((item.min === null) !== (item.max === null) || item.min !== null && (item.min as number) > (item.max as number)) reject('REPORT_REPLY_SCHEMA', 'Invalid curve range.');
    for (const key of ['values', 'benchmark']) {
      ownArray(item[key], 'Sampled curve', 2000); let previous = -1;
      for (const point of item[key] as Record<string, unknown>[]) { exact(point, 'Curve point', ['index', 'value', 'breakBefore']); integer(point.index, 'Curve row', previous + 1, bars - 1); previous = point.index as number; finite(point.value, 'Curve value'); choice(point.breakBefore, [true, false], 'curve continuity'); }
    }
    ownArray(item.excursions, 'Sampled excursions', 1000);
    for (const point of item.excursions as Record<string, unknown>[]) { exact(point, 'Excursion point', ['index', 'favorable', 'adverse']); integer(point.index, 'Excursion row', 0, bars - 1); nullableNumber(point.favorable, 'Favorable excursion', 0); nullableNumber(point.adverse, 'Adverse excursion'); if (point.adverse !== null && (point.adverse as number) > 0) reject('REPORT_REPLY_SCHEMA', 'Adverse plotted excursions must be nonpositive.'); }
  } else if (kind === 'inspect') {
    exact(value, 'Row inspection', ['point', 'trade']); const item = value as Record<string, unknown>; equity(item.point, bars); if (item.trade !== null) trade(item.trade, bars);
  } else reject('REPORT_REPLY_SCHEMA', 'Unexpected result command.');
  return freezeData(value);
}
/** Only bounded, detached transport data reaches the typed response validators. */
export function copyReply(value: unknown): Record<string, unknown> {
  const copied = copyWire(value, LIMIT.responseBytes).value; ownRecord(copied, 'Worker response'); return copied;
}
