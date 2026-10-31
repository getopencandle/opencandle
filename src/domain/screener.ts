import { calculateIndicator, sma } from './indicators';
import type { BarDataset, DataProvenance, DomainDiagnostic } from './types';
import { SCREENER_FORMULA_METRICS, formulaCell, formulaParameters, formulaWork, isFormulaMetric, type ScreenerFormulaMetric } from './screener-formulas';
import { SCREENER_SESSION_METRICS, SCREENER_SESSION_POLICIES, isSessionMetric, sessionCell, sessionParameters, sessionWork, type ScreenerSessionMetric } from './screener-session';
import { SCREENER_EARNINGS_METRICS, SCREENER_EARNINGS_POLICIES, earningsCell, isEarningsMetric, type ScreenerEarningsMetric } from './screener-earnings';
import { SCREENER_FUNDAMENTAL_METRICS, SCREENER_FUNDAMENTAL_POLICIES, fundamentalsCell, isFundamentalMetric, type ScreenerFundamentalMetric, type ScreenerFundamentalsLookup } from './screener-fundamentals';
import { SCREENER_CURRENCY_POLICY, convertScreenerCell, type ScreenerCurrencyContext } from './screener-currency';

export type ScreenerMetric = 'symbol' | 'name' | 'exchange' | 'currency' | 'assetClass' | 'baseCurrency' | 'quoteCurrency' | 'lastTradeTime' | 'last' | 'change' | 'changePercent' | 'open' | 'high' | 'low' | 'volume' | 'averageVolume' | 'relativeVolume' | 'sma' | 'ema' | 'rsi' | 'atr' | 'macd' | 'performance' | 'periodHigh' | 'periodLow' | 'flag' | ScreenerFormulaMetric | ScreenerSessionMetric | ScreenerEarningsMetric | ScreenerFundamentalMetric;
/**
 * Optional local membership context. `flagOf` returns the market's local flag color, or 'none' when the
 * market is known to be unflagged. Without it, flag cells are unavailable (never treated as unflagged).
 */
export interface ScreenerContext {
  flagOf?: (dataset: BarDataset) => string;
  /** Sorted supplied earnings dates (YYYY-MM-DD) from local Calendar documents. Without it, earnings cells are unavailable. */
  earningsOf?: (dataset: BarDataset) => readonly string[];
  /** Saved, explicitly linked SEC companyfacts (screener-fundamentals). Without it, valuation, dividend and margin cells are unavailable. */
  fundamentalsOf?: ScreenerFundamentalsLookup;
  /** Currency menu: convert eligible money cells to this currency (screener-currency). Absent means Default (instrument currency). */
  currency?: ScreenerCurrencyContext;
}
export const SCREENER_FLAG_VALUES = ['none', 'red', 'orange', 'green', 'blue', 'purple', 'cyan', 'pink'] as const;
export interface ScreenerColumn { id: string; metric: ScreenerMetric | string; label?: string; parameters?: Record<string, unknown>; }
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'outside' | 'in' | 'not-in' | 'contains' | 'starts-with' | 'crosses-above' | 'crosses-below';
export interface ScreenerFilter { id: string; columnId: string; operator: FilterOperator; value: string | number | Array<string | number>; active: boolean; }
export interface ScreenerSort { columnId: string; direction: 'asc' | 'desc'; }
export interface ScreenerCell { value: string | number | null; previous: string | number | null; state: 'available' | 'unavailable' | 'insufficient-history' | 'invalid'; reason?: string; asOf: number | null; /** Source and as-of note for the cell tooltip (fundamentals). */ note?: string; }
export interface ScreenerRow { instrumentId: string; symbol: string; cells: Record<string, ScreenerCell>; provenance: DataProvenance; resolution: string; currency: string; adjustment: string; }
export interface ScreenerResult {
  rows: ScreenerRow[]; unknownRows: ScreenerRow[]; diagnostics: DomainDiagnostic[];
  coverage: { universe: number; evaluated: number; matched: number; excluded: number; unavailablePredicate: number; fixtures: number; providerIds: string[] };
  policies: string[];
}
export const SCREENER_METRICS: ScreenerMetric[] = ['symbol', 'name', 'exchange', 'currency', 'assetClass', 'baseCurrency', 'quoteCurrency', 'lastTradeTime', 'last', 'change', 'changePercent', 'open', 'high', 'low', 'volume', 'averageVolume', 'relativeVolume', 'sma', 'ema', 'rsi', 'atr', 'macd', 'performance', 'periodHigh', 'periodLow', 'flag', ...SCREENER_FORMULA_METRICS, ...SCREENER_SESSION_METRICS, ...SCREENER_EARNINGS_METRICS, ...SCREENER_FUNDAMENTAL_METRICS];
export const DEFAULT_SCREENER_COLUMNS: ScreenerColumn[] = [{ id: 'symbol', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'changePercent', metric: 'changePercent' }, { id: 'volume', metric: 'volume' }, { id: 'rsi', metric: 'rsi', parameters: { length: 14 } }];
export const SCREENER_CALCULATION_LIMITS = { datasets: 10000, bars: 2000000, operations: 20000000, cells: 500000, columns: 100, filters: 500 } as const;
export const SCREENER_OPERATORS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'outside', 'in', 'not-in', 'contains', 'starts-with', 'crosses-above', 'crosses-below'];
export interface ScreenerParameter { key: string; label: string; defaultValue: number | string; options?: string[]; }
const sourceParameter: ScreenerParameter = { key: 'source', label: 'Source', defaultValue: 'close', options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'] };
export function screenerParameters(metric: string): ScreenerParameter[] {
  const length = (value: number) => ({ key: 'length', label: 'Length in supplied rows', defaultValue: value });
  if (['sma', 'ema', 'rsi'].includes(metric)) return [length(metric === 'rsi' ? 14 : 9), { ...sourceParameter, options: [...sourceParameter.options!] }];
  if (metric === 'atr') return [length(14), { key: 'smoothing', label: 'Smoothing', defaultValue: 'RMA', options: ['RMA', 'SMA', 'EMA', 'WMA'] }];
  if (metric === 'macd') return [{ key: 'fast', label: 'Fast length', defaultValue: 12 }, { key: 'slow', label: 'Slow length', defaultValue: 26 }, { key: 'signal', label: 'Signal length', defaultValue: 9 }, { ...sourceParameter, options: [...sourceParameter.options!] }, { key: 'oscillatorType', label: 'Oscillator average', defaultValue: 'EMA', options: ['EMA', 'SMA'] }, { key: 'signalType', label: 'Signal average', defaultValue: 'EMA', options: ['EMA', 'SMA'] }, { key: 'plot', label: 'Plot', defaultValue: 'macd', options: ['macd', 'signal', 'histogram'] }];
  if (['averageVolume', 'relativeVolume', 'performance', 'periodHigh', 'periodLow'].includes(metric)) return [length(metric === 'performance' ? 20 : 10)];
  if (isSessionMetric(metric)) return sessionParameters(metric);
  return formulaParameters(metric);
}
const diagnostic = (code: string, message: string): DomainDiagnostic => ({ code, message, severity: 'error' });
const availableNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const textMetrics = new Set(['symbol', 'name', 'exchange', 'currency', 'assetClass']);
/**
 * Base and quote currency read from the instrument metadata only;
 * nothing is converted. A pair symbol (crypto BASE-QUOTE or BASE/QUOTE, a 6-letter forex symbol) gives both; any other instrument
 * has no base currency and is quoted in its declared currency. The parsing rule and the unavailable wording.
 */
export function instrumentCurrencies(instrument: Pick<BarDataset['instrument'], 'symbol' | 'currency' | 'assetClass'>): { base: string | null; quote: string | null } {
  const symbol = instrument.symbol.trim().toUpperCase(), declared = instrument.currency.trim().toUpperCase() || null;
  if (instrument.assetClass === 'crypto' || instrument.assetClass === 'forex') {
    const pair = /^([A-Z0-9]{2,12})[-/]([A-Z0-9]{2,12})$/.exec(symbol) ?? (instrument.assetClass === 'forex' ? /^([A-Z]{3})([A-Z]{3})$/.exec(symbol) : null);
    if (pair) return { base: pair[1], quote: pair[2] };
  }
  return { base: null, quote: declared };
}
const currencyMetrics = new Set(['baseCurrency', 'quoteCurrency']);
function instrumentText(dataset: BarDataset, metric: string): string | null {
  if (currencyMetrics.has(metric)) { const pair = instrumentCurrencies(dataset.instrument); return metric === 'baseCurrency' ? pair.base : pair.quote; }
  return String(dataset.instrument[metric as 'symbol' | 'name' | 'exchange' | 'currency' | 'assetClass']);
}
/** Metrics that never read bars: instrument text and local membership. Invalid OHLCV does not invalidate them. */
const barFreeMetrics = new Set([...textMetrics, ...currencyMetrics, 'flag']);
const sharedIndicatorMetrics = new Set<string>(['sma','ema','rsi','atr','macd','averageVolume','relativeVolume',...SCREENER_FORMULA_METRICS]);
function sharedSmaLegs(column:ScreenerColumn):number{
  if(['sma','averageVolume','relativeVolume'].includes(column.metric))return 1;
  if(column.metric==='atr')return column.parameters?.smoothing==='SMA'?1:0;
  if(column.metric==='macd')return (column.parameters?.oscillatorType==='SMA'?2:0)+(column.parameters?.signalType==='SMA'?1:0);
  return 0;
}
function columnWork(column:ScreenerColumn):number{
  if(isFormulaMetric(column.metric))return formulaWork(column.metric);
  if(isSessionMetric(column.metric))return sessionWork(column.metric);
  if(isEarningsMetric(column.metric)||isFundamentalMetric(column.metric))return 1;
  const baseline=column.metric==='atr'&&column.parameters?.smoothing==='WMA'?2+Number(column.parameters.length??14):['sma','ema','rsi','atr','macd','averageVolume','relativeVolume','change','changePercent'].includes(column.metric)?8:column.metric==='periodHigh'||column.metric==='periodLow'?2+2*Number(column.parameters?.length??10):1;
  return baseline+64*sharedSmaLegs(column);
}
const safeId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && !['__proto__', 'constructor', 'prototype'].includes(id);
export function screenerValueKind(metric: string): 'text' | 'number' | 'unknown' { return barFreeMetrics.has(metric) ? 'text' : SCREENER_METRICS.includes(metric as ScreenerMetric) ? 'number' : 'unknown'; }
export function screenerOperatorsFor(metric: string): FilterOperator[] {
  const type = screenerValueKind(metric);
  return SCREENER_OPERATORS.filter(operator => type === 'unknown' || (type === 'text' ? ['eq', 'neq', 'in', 'not-in', 'contains', 'starts-with'].includes(operator) : !['contains', 'starts-with'].includes(operator)));
}
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
export function validateScreenerColumn(column: ScreenerColumn): string | null {
  if (!plain(column) || Object.values(Object.getOwnPropertyDescriptors(column)).some(property => property.get || property.set) || Object.keys(column).some(key => !['id', 'metric', 'label', 'parameters'].includes(key)) || !safeId(column.id) || typeof column.metric !== 'string' || !column.metric.length || column.metric.length > 100 || column.label !== undefined && (typeof column.label !== 'string' || !column.label.trim() || column.label.length > 200)) return 'A column needs a safe identity, metric and bounded optional label.';
  const parameters = column.parameters ?? {};
  if (!plain(parameters) || Object.keys(parameters).length > 100 || Object.entries(Object.getOwnPropertyDescriptors(parameters)).some(([key, property]) => property.get || property.set || ['__proto__', 'prototype', 'constructor'].includes(key) || key.length > 100 || property.value !== null && typeof property.value !== 'boolean' && !(typeof property.value === 'string' && property.value.length <= 1000) && !availableNumber(property.value))) return 'Column parameters must be bounded JSON scalars.';
  if (!SCREENER_METRICS.includes(column.metric as ScreenerMetric)) return null; // Unknown metric is retained as unavailable, never executed.
  const schema = screenerParameters(column.metric);
  for (const [key, value] of Object.entries(parameters)) {
    const parameter = schema.find(item => item.key === key);
    if (!parameter) return `${column.metric}: unsupported parameter ${key}.`;
    if (parameter.options ? !parameter.options.includes(value as string) : !Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100000) return `${column.metric}: invalid ${key}.`;
  }
  return null;
}

function flagCell(dataset: BarDataset, context: ScreenerContext): ScreenerCell {
  const unavailable = (reason: string): ScreenerCell => ({ value: null, previous: null, state: 'unavailable', reason, asOf: null });
  if (!context.flagOf) return unavailable('Local watchlist flags are not connected to this screener.');
  let value: unknown;
  try { value = context.flagOf(dataset); } catch (cause) { return unavailable(`Flag state could not be read: ${cause instanceof Error ? cause.message : String(cause)}`); }
  return SCREENER_FLAG_VALUES.includes(value as typeof SCREENER_FLAG_VALUES[number]) ? { value: value as string, previous: value as string, state: 'available', asOf: null } : unavailable('Flag state is not a known local color.');
}
function metricCell(dataset: BarDataset, column: ScreenerColumn, readRows=true, context: ScreenerContext = {}): ScreenerCell {
  if (column.metric === 'flag') return flagCell(dataset, context);
  const bars=dataset.bars;
  if(bars.length>100000&&sharedIndicatorMetrics.has(column.metric))return {value:null,previous:null,state:'unavailable',asOf:null,reason:'This shared indicator requires at most 100000 supplied rows per dataset. Reduce the selected history.'};
  const current = readRows?bars.at(-1):undefined, previous = readRows?bars.at(-2):undefined, parameters = column.parameters ?? {};
  const result: ScreenerCell = { value: null, previous: null, state: 'unavailable', asOf: current?.time ?? null };
  const number = (value: number | null | undefined, prev?: number | null) => ({ ...result, value: availableNumber(value) ? value : null, previous: availableNumber(prev) ? prev : null, state: availableNumber(value) ? 'available' : 'insufficient-history' } as ScreenerCell);
  if (currencyMetrics.has(column.metric)) { const text = instrumentText(dataset, column.metric); return text === null ? { ...result, reason: column.metric === 'baseCurrency' ? 'This instrument is not a currency pair, so it has no base currency.' : 'The instrument metadata declares no currency.' } : { ...result, value: text, previous: text, state: 'available' }; }
  if (textMetrics.has(column.metric)) return { ...result, value: dataset.instrument[column.metric as 'symbol' | 'name' | 'exchange' | 'currency' | 'assetClass'], previous: dataset.instrument[column.metric as 'symbol' | 'name' | 'exchange' | 'currency' | 'assetClass'], state: 'available' };
  if (!SCREENER_METRICS.includes(column.metric as ScreenerMetric)) return { ...result, reason: `Metric ${column.metric} is not implemented for this dataset.` };
  if (!current) return { ...result, reason: 'No historical bars are loaded for this instrument.' };
  if (['error', 'unavailable', 'loading'].includes(dataset.provenance.state)) return { ...result, reason: `Dataset is ${dataset.provenance.state}.` };
  if (isFormulaMetric(column.metric)) return formulaCell(dataset, column.metric, parameters);
  if (isSessionMetric(column.metric)) return sessionCell(dataset, column.metric, parameters);
  if (isEarningsMetric(column.metric)) return earningsCell(dataset, column.metric, context.earningsOf);
  if (isFundamentalMetric(column.metric)) return fundamentalsCell(dataset, column.metric, context.fundamentalsOf);
  // The time of the newest supplied bar (Unix seconds), the data's own time, never the wall clock.
  if (column.metric === 'lastTradeTime') return number(current.time, previous?.time);
  if (column.metric === 'last') return number(current.close, previous?.close);
  if (['open', 'high', 'low', 'volume'].includes(column.metric)) return number(current[column.metric as 'open' | 'high' | 'low' | 'volume'], previous?.[column.metric as 'open' | 'high' | 'low' | 'volume']);
  if (column.metric === 'change' || column.metric === 'changePercent') {
    const changes = bars.map((bar, i) => i === 0 || bars[i - 1].close === 0 ? null : column.metric === 'change' ? bar.close - bars[i - 1].close : 100 * (bar.close / bars[i - 1].close - 1));
    return number(changes.at(-1), changes.at(-2));
  }
  if (['sma', 'ema', 'rsi', 'atr', 'macd'].includes(column.metric)) {
    const { plot, ...calculationInputs } = parameters;
    const calculated = calculateIndicator(column.metric, bars, calculationInputs);
    if (calculated.diagnostics.length) return { ...result, state: 'invalid', reason: calculated.diagnostics.join('; ') };
    const series = calculated.series.find(s => s.id === (plot ?? column.metric));
    return series ? number(series.values.at(-1), series.values.at(-2)) : { ...result, state: 'invalid', reason: 'The selected indicator plot is unavailable.' };
  }
  const period = parameters.length ?? (column.metric === 'performance' ? 20 : 10);
  if (!Number.isSafeInteger(period) || (period as number) < 1 || (period as number) > 100000) return { ...result, state: 'invalid', reason: 'Metric length must be a positive integer at most 100000.' };
  const length = period as number;
  if (column.metric === 'averageVolume' || column.metric === 'relativeVolume') {
    // Daily bars of an unstated session are the same basis Symbol details and the watchlist use (daily volume over the
    // mean of earlier daily bars), so they qualify. Intraday bars still need explicitly regular-session input; extended or all-session coverage never does.
    const dailyBasis = dataset.provenance.session === 'unknown' && dataset.resolution === '1D';
    if (dataset.provenance.session !== 'regular' && !dailyBasis) return { ...result, reason: 'Average and relative volume need regular-session bars or daily bars. Extended, all-session and intraday bars of an unknown session cannot establish that basis.' };
    const average = sma(bars.map(b => b.volume), length);
    if (column.metric === 'averageVolume') return number(average.at(-1), average.at(-2));
    const relative = bars.map((bar, i) => i > 0 && availableNumber(average[i - 1]) && average[i - 1] !== 0 ? bar.volume / (average[i - 1] as number) : null);
    const cell = number(relative.at(-1), relative.at(-2));
    // Never presented as a regular-session result: the basis is stated on the cell.
    return dailyBasis && cell.state === 'available' ? { ...cell, reason: 'Daily bars of an unstated session: the daily volume over the mean of the earlier daily bars, as in Symbol details. Not a regular-session figure.' } : cell;
  }
  const at = (index: number): number | null => {
    if (index < 0) return null;
    if (column.metric === 'performance') return index >= length && bars[index - length].close !== 0 ? 100 * (bars[index].close / bars[index - length].close - 1) : null;
    if (index < length - 1) return null;
    let extreme = column.metric === 'periodHigh' ? -Infinity : Infinity;
    for (let i = index - length + 1; i <= index; i++) extreme = column.metric === 'periodHigh' ? Math.max(extreme, bars[i].high) : Math.min(extreme, bars[i].low);
    return extreme;
  };
  return number(at(bars.length - 1), at(bars.length - 2));
}

export function validateScreenerFilter(filter: ScreenerFilter, column?: ScreenerColumn): string | null {
  if (!plain(filter) || Object.values(Object.getOwnPropertyDescriptors(filter)).some(property => property.get || property.set) || Object.keys(filter).some(key => !['id', 'columnId', 'operator', 'value', 'active'].includes(key)) || !safeId(filter.id) || !safeId(filter.columnId) || typeof filter.active !== 'boolean' || !SCREENER_OPERATORS.includes(filter.operator)) return 'Filter identity, active state or operator is invalid.';
  if (column && !screenerOperatorsFor(column.metric).includes(filter.operator)) return `${filter.id}: operator does not support this metric type.`;
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  if (values.length > 1000 || values.some(value => !availableNumber(value) && !(typeof value === 'string' && value.length > 0 && value.length <= 1000))) return `${filter.id}: values require bounded nonempty strings or finite numbers.`;
  const kind = column ? screenerValueKind(column.metric) : 'unknown';
  if (kind !== 'unknown' && values.some(value => typeof value !== (kind === 'text' ? 'string' : 'number'))) return `${filter.id}: value type does not match the column.`;
  if (column?.metric === 'flag' && ['eq', 'neq', 'in', 'not-in'].includes(filter.operator) && values.some(value => !SCREENER_FLAG_VALUES.includes(value as typeof SCREENER_FLAG_VALUES[number]))) return `${filter.id}: flag values are none, red, orange, green, blue, purple, cyan or pink.`;
  if (['gt', 'gte', 'lt', 'lte', 'crosses-above', 'crosses-below'].includes(filter.operator) && !availableNumber(filter.value)) return `${filter.id}: numeric operator requires a finite number.`;
  if (['between', 'outside'].includes(filter.operator) && (!Array.isArray(filter.value) || filter.value.length !== 2 || !filter.value.every(availableNumber) || filter.value[0] > filter.value[1])) return `${filter.id}: range requires ordered finite lower and upper bounds.`;
  if (['in', 'not-in'].includes(filter.operator) && (!Array.isArray(filter.value) || !filter.value.length)) return `${filter.id}: set operator requires at least one value.`;
  if (['contains', 'starts-with'].includes(filter.operator) && typeof filter.value !== 'string') return `${filter.id}: text operator requires a string.`;
  if (['eq', 'neq'].includes(filter.operator) && (Array.isArray(filter.value) || typeof filter.value !== 'string' && !availableNumber(filter.value))) return `${filter.id}: equality requires one string or finite number.`;
  return null;
}
export function parseScreenerFilterValue(metric: string, operator: FilterOperator, input: string): ScreenerFilter['value'] {
  const kind = screenerValueKind(metric), list = ['between', 'outside', 'in', 'not-in'].includes(operator), parts = list ? input.split(',').map(value => value.trim()) : [input.trim()];
  if (parts.some(value => value === '')) throw new Error('Filter input cannot contain blank values.');
  const values = parts.map(value => metric === 'flag' ? value.toLowerCase() : kind === 'text' ? value : Number(value)), parsed = list ? values : values[0];
  const invalid = validateScreenerFilter({ id: 'draft-filter', columnId: 'draft-column', operator, value: parsed, active: true }, { id: 'draft-column', metric });
  if (invalid) throw new Error(invalid); return parsed;
}

/** Unknown input produces unknown predicate, never true, false or zero substitution. */
export function evaluateScreenerFilter(cell: ScreenerCell, filter: ScreenerFilter): boolean | null {
  if (!filter.active) return true;
  if (cell.state !== 'available' || cell.value === null) return null;
  const value = cell.value, target = filter.value;
  if (filter.operator === 'eq') return value === target;
  if (filter.operator === 'neq') return value !== target;
  if (filter.operator === 'in' || filter.operator === 'not-in') { const included = (target as Array<string | number>).includes(value); return filter.operator === 'in' ? included : !included; }
  if (filter.operator === 'contains' || filter.operator === 'starts-with') {
    if (typeof value !== 'string') return null;
    const normalized = value.toLocaleLowerCase('en-US'), needle = String(target).toLocaleLowerCase('en-US');
    return filter.operator === 'contains' ? normalized.includes(needle) : normalized.startsWith(needle);
  }
  if (!availableNumber(value)) return null;
  if (filter.operator === 'between' || filter.operator === 'outside') { const [lower, upper] = target as number[]; return filter.operator === 'between' ? value >= lower && value <= upper : value < lower || value > upper; }
  if (filter.operator === 'crosses-above' || filter.operator === 'crosses-below') {
    if (!availableNumber(cell.previous)) return null;
    return filter.operator === 'crosses-above' ? cell.previous <= (target as number) && value > (target as number) : cell.previous >= (target as number) && value < (target as number);
  }
  if (filter.operator === 'gt') return value > (target as number);
  if (filter.operator === 'gte') return value >= (target as number);
  if (filter.operator === 'lt') return value < (target as number);
  if (filter.operator === 'lte') return value <= (target as number);
  return null;
}

function predicateWork(datasets: readonly BarDataset[], columns: readonly ScreenerColumn[], filters: readonly ScreenerFilter[]): number {
  const columnMap = new Map(columns.map(column => [column.id, column])), lengths = new Map<string, number>();
  const textLength = (metric: string) => {
    if (!lengths.has(metric)) {
      let largest = 0;
      for (const dataset of datasets) largest = Math.max(largest, (instrumentText(dataset, metric) ?? '').length);
      lengths.set(metric, largest);
    }
    return lengths.get(metric)!;
  };
  return filters.reduce((sum, filter) => {
    if (!filter.active) return sum + 1;
    const metric = columnMap.get(filter.columnId)!.metric, values = Array.isArray(filter.value) ? filter.value : [filter.value], count = Math.max(1, values.length);
    if (metric === 'flag') return sum + count * Math.max(6, ...values.map(value => String(value).length)); // Longest flag value is 6 characters.
    if (!textMetrics.has(metric) && !currencyMetrics.has(metric)) return sum + count;
    const longestValue = values.reduce<number>((longest, value) => Math.max(longest, String(value).length), 0), length = textLength(metric);
    return sum + (filter.operator === 'contains' ? Math.max(1, length) * Math.max(1, longestValue) : count * Math.max(1, length, longestValue));
  }, 0);
}

export function runScreener(datasets: readonly BarDataset[], columns: readonly ScreenerColumn[] = DEFAULT_SCREENER_COLUMNS, filters: readonly ScreenerFilter[] = [], sort?: ScreenerSort, context: ScreenerContext = {}): ScreenerResult {
  const result: ScreenerResult = { rows: [], unknownRows: [], diagnostics: [], coverage: { universe: datasets.length, evaluated: 0, matched: 0, excluded: 0, unavailablePredicate: 0, fixtures: datasets.filter(d => d.provenance.fixture).length, providerIds: [...new Set(datasets.map(d => d.provenance.providerId))] }, policies: ['Universe is exactly the supplied datasets, never a claimed exchange-wide universe.', 'Each column instance has independent parameters and a persistent ID. Sort and filters bind to that ID.', 'Change and performance use final supplied bar-close snapshots with the disclosed adjustment and session basis. Actual completion and historical publication time are unknown.', 'Relative volume excludes the current bar from the denominator. Unknown session basis remains unknown in provenance.', 'Missing filter data is separate from an empty matching result. Numeric ranges include their boundaries; text matching is case-insensitive.', 'Callers must supply only information available to the current replay or live evaluation. This function does not infer bar completion from display time.', 'Flag cells read local watchlist flags by exchange and ticker. Without a connected local watchlist book they are unavailable, never "not flagged".'] };
  if (columns?.some?.(column => isSessionMetric(column?.metric))) result.policies.push(...SCREENER_SESSION_POLICIES);
  if (columns?.some?.(column => isEarningsMetric(column?.metric))) result.policies.push(...SCREENER_EARNINGS_POLICIES);
  if (columns?.some?.(column => isFundamentalMetric(column?.metric))) result.policies.push(...SCREENER_FUNDAMENTAL_POLICIES);
  if (context.currency) result.policies.push(SCREENER_CURRENCY_POLICY);
  if (!Array.isArray(columns) || !columns.length || columns.length > SCREENER_CALCULATION_LIMITS.columns || !Array.isArray(filters) || filters.length > SCREENER_CALCULATION_LIMITS.filters) { result.diagnostics.push(diagnostic('CONFIGURATION_LIMIT', 'Screener requires 1 to100 columns and at most500 filters.')); return result; }
  const columnIds = new Set(columns.map(c => c?.id)), filterIds = new Set(filters.map(f => f?.id));
  if (columnIds.size !== columns.length || columns.some(c => !c || !safeId(c.id))) result.diagnostics.push(diagnostic('COLUMN_ID', 'Column instance identities must be unique and safe.'));
  if (filterIds.size !== filters.length || filters.some(f => !f || !safeId(f.id))) result.diagnostics.push(diagnostic('FILTER_ID', 'Filter identities must be unique and safe.'));
  for (const column of columns) { const invalid = validateScreenerColumn(column); if (invalid) result.diagnostics.push(diagnostic('COLUMN_PARAMETER', invalid)); }
  if (new Set(datasets.map(d => d.instrument.id)).size !== datasets.length) result.diagnostics.push(diagnostic('UNIVERSE_ID', 'Each instrument must appear once in the supplied universe.'));
  for (const filter of filters) { if (!filter || !columnIds.has(filter.columnId)) result.diagnostics.push(diagnostic('FILTER_COLUMN', `Missing column instance ${filter?.columnId}.`)); const invalid = validateScreenerFilter(filter, columns.find(column => column?.id === filter?.columnId)); if (invalid) result.diagnostics.push(diagnostic('FILTER_VALUE', invalid)); }
  if (sort && (!columnIds.has(sort.columnId) || !['asc', 'desc'].includes(sort.direction))) result.diagnostics.push(diagnostic('SORT_COLUMN', 'Sort column instance or direction is invalid.'));
  if (result.diagnostics.length) return result;
  const bars = datasets.reduce((total, dataset) => total + dataset.bars.length, 0);
  const cost=columns.reduce((total,column)=>total+columnWork(column),0);
  // Oversized shared calculations emit metadata-only unavailable cells and do not invoke a kernel.
  const unavailableCost=columns.reduce((total,column)=>total+(sharedIndicatorMetrics.has(column.metric)?1:columnWork(column)),0);
  const work=datasets.reduce((total,dataset)=>total+dataset.bars.length*(dataset.bars.length>100000?unavailableCost:cost),0);
  if (datasets.length > SCREENER_CALCULATION_LIMITS.datasets || bars > SCREENER_CALCULATION_LIMITS.bars || work + datasets.length * predicateWork(datasets, columns, filters) > SCREENER_CALCULATION_LIMITS.operations || datasets.length * columns.length > SCREENER_CALCULATION_LIMITS.cells) result.diagnostics.push(diagnostic('WORKLOAD_LIMIT', 'Screener workload exceeds 10000 instruments, 2 million bars, 20 million estimated operations or 500000 cells. Predicate estimates include set size and text-comparison lengths. Reduce the selected universe, history or calculations.'));
  if (result.diagnostics.length) return result;
  for (const dataset of datasets) {
    const readRows=dataset.bars.length<=100000||columns.some(column=>SCREENER_METRICS.includes(column.metric as ScreenerMetric)&&!barFreeMetrics.has(column.metric)&&!sharedIndicatorMetrics.has(column.metric));
    const invalidBars = readRows&&dataset.bars.some((bar, index) => !bar || !Number.isSafeInteger(bar.time) || bar.time < -62135596800 || bar.time > 253402300799 || index > 0 && bar.time <= dataset.bars[index - 1].time || ['open', 'high', 'low', 'close', 'volume'].some(key => !availableNumber(bar[key as keyof typeof bar])) || Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 || bar.volume < 0 || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close));
    const row: ScreenerRow = { instrumentId: dataset.instrument.id, symbol: dataset.instrument.symbol, cells: Object.fromEntries(columns.map(column => [column.id, invalidBars && !barFreeMetrics.has(column.metric) ? { value: null, previous: null, state: 'invalid', reason: 'Supplied OHLCV contains invalid numeric rows.', asOf: null } : convertScreenerCell(metricCell(dataset, column,readRows,context), column.metric, dataset, context.currency)])), provenance: structuredClone(dataset.provenance), resolution: dataset.resolution, currency: dataset.instrument.currency, adjustment: dataset.provenance.adjustment };
    result.coverage.evaluated++;
    const predicates = filters.map(filter => evaluateScreenerFilter(row.cells[filter.columnId], filter));
    if (predicates.includes(false)) result.coverage.excluded++;
    else if (predicates.includes(null)) { result.unknownRows.push(row); result.coverage.unavailablePredicate++; }
    else result.rows.push(row);
  }
  if (sort) result.rows.sort((a, b) => {
    const aCell = a.cells[sort.columnId], bCell = b.cells[sort.columnId], aValue = aCell.value, bValue = bCell.value;
    const aMissing = aCell.state !== 'available' || aValue === null, bMissing = bCell.state !== 'available' || bValue === null;
    if (aMissing || bMissing) return aMissing === bMissing ? a.instrumentId.localeCompare(b.instrumentId) : aMissing ? 1 : -1;
    const comparison = typeof aValue === 'number' && typeof bValue === 'number' ? aValue - bValue : String(aValue).localeCompare(String(bValue));
    return comparison === 0 ? a.instrumentId.localeCompare(b.instrumentId) : sort.direction === 'asc' ? comparison : -comparison;
  });
  result.coverage.matched = result.rows.length;
  return result;
}

/** Reset keeps the chip; remove deletes its identity. Both remove its predicate effect. */
export function resetScreenerFilter(filters: readonly ScreenerFilter[], id: string): ScreenerFilter[] { return filters.map(filter => filter.id === id ? { ...filter, active: false } : structuredClone(filter)); }
export function removeScreenerFilter(filters: readonly ScreenerFilter[], id: string): ScreenerFilter[] { return filters.filter(filter => filter.id !== id).map(filter => structuredClone(filter)); }

/** Spreadsheet-safe export: text that could become a formula is explicitly prefixed. */
export function screenerToCsv(result: ScreenerResult, columns: readonly ScreenerColumn[]): string {
  const cell = (value: string | number | null): string => {
    if (value === null) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.map(c => cell(c.label ?? c.metric)).join(','), ...result.rows.map(row => columns.map(column => cell(row.cells[column.id]?.value ?? null)).join(','))].join('\n') + '\n';
}
