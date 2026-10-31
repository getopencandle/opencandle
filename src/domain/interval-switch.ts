import type { BarDataset } from './types';
import { chooseIntervalSource, probeIntervalSource, intervalDatasetKey, intervalLabel, intervalOrderSeconds, parseInterval, DEFAULT_AGGREGATION_POLICY, type AggregationPolicy, type IntervalResult } from './intervals';
import { ALPACA_SHAPE, COINBASE_SHAPE, planLiveInterval, type LiveIntervalPlan } from './live-intervals';
import { isLiveDatasetId } from './live-provider';
import { symbolMathComponentSource } from './symbol-math';
import { symbolMathRefOf } from './symbol-math-live';

/** One place that decides how an interval choice (menu row, toolbar favorite, typed entry) becomes a chart: live feed plan or local aggregation. */
export type IntervalSwitch =
  | { ok: true; kind: 'live'; providerId: string; symbol: string; interval: string; plan: LiveIntervalPlan }
  | { ok: true; kind: 'local'; interval: string; result: Extract<IntervalResult, { ok: true }> }
  | { ok: false; interval: string; reason: string };

const COINBASE = 'coinbase-public', ALPACA = 'alpaca-iex';
export function liveShapeOf(dataset: Pick<BarDataset, 'provenance'>) {
  if (!isLiveDatasetId(dataset.provenance.datasetId)) return null;
  // A derived chart follows its components' feeds: Coinbase intervals when every component is a Coinbase product.
  const derived = symbolMathRefOf(dataset.provenance.datasetId);
  if (derived) return derived.expression.symbols.every(symbol => symbolMathComponentSource(symbol) === 'coinbase') ? COINBASE_SHAPE : ALPACA_SHAPE;
  return dataset.provenance.providerId === COINBASE ? COINBASE_SHAPE : dataset.provenance.providerId === ALPACA || dataset.provenance.providerId === 'alpaca-stub' ? ALPACA_SHAPE : null;
}
function safeOrder(resolution: string): number | null { try { const spec = parseInterval(resolution); return spec.kind === 'time' ? intervalOrderSeconds(spec) : null; } catch { return null; } }
/** The finest original (not derived) time-bar source of the chart's instrument; the chart's own dataset wins ties and is the fallback. */
export function finestIntervalSource(datasets: readonly BarDataset[], current: BarDataset): BarDataset {
  let best = current, bestOrder = isDerivedDataset(current) ? Infinity : safeOrder(current.resolution) ?? Infinity;
  for (const row of datasets) {
    if (row.instrument.id !== current.instrument.id || isDerivedDataset(row) || !row.bars.length) continue;
    const order = safeOrder(row.resolution);
    if (order !== null && order < bestOrder) { best = row; bestOrder = order; }
  }
  return best;
}
/** Original same-instrument time sources no coarser than `target` seconds, coarsest first (ties: the chart's own dataset first). */
function aggregationSources(datasets: readonly BarDataset[], current: BarDataset, target: number): BarDataset[] {
  const rows: { row: BarDataset; order: number }[] = [];
  for (const row of [current, ...datasets]) {
    if (row.instrument.id !== current.instrument.id || isDerivedDataset(row) || !row.bars.length) continue;
    const order = safeOrder(row.resolution); if (order !== null && order <= target) rows.push({ row, order });
  }
  return rows.sort((a, b) => b.order - a.order).map(item => item.row);
}
const isDerivedDataset = (dataset: BarDataset) => 'derivation' in dataset || dataset.provenance.providerId === 'lv-local-aggregation';

/** `probe`: availability checks (menu rows) get the same ok/reason without copying bars; the click path keeps the copying result. */
export function resolveIntervalSwitch(datasets: readonly BarDataset[], current: BarDataset, target: string, policy: AggregationPolicy = DEFAULT_AGGREGATION_POLICY, probe = false): IntervalSwitch {
  const choose = probe ? probeIntervalSource : chooseIntervalSource;
  let spec;
  try { spec = parseInterval(target); } catch (cause) { return { ok: false, interval: target, reason: cause instanceof Error ? cause.message : String(cause) }; }
  if (spec.kind === 'event') return { ok: false, interval: spec.id, reason: 'Needs trade-by-trade data.' };
  const shape = liveShapeOf(current);
  if (shape) {
    const plan = planLiveInterval(shape, spec.id);
    return plan.ok ? { ok: true, kind: 'live', providerId: current.provenance.providerId, symbol: current.instrument.symbol, interval: spec.id, plan: plan.plan } : { ok: false, interval: spec.id, reason: plan.reason };
  }
  const request = { instrumentId: current.instrument.id, target: spec.id, policy };
  let result = choose(datasets, request);
  if (!result.ok && result.code === 'SOURCE_REQUIRED') {
    // With several original sources (demo 1m/5m/15m/60m/1D), 1W from the finest (14 sessions of 1m) gave
    // 4 weekly bars. The coarsest original source at or below the target goes first (it covers the most history), then finer
    // ones; a source whose bars do not fit the target buckets (15m for 10m) refuses and the next is tried.
    const target = intervalOrderSeconds(spec), tried = new Set<string>();
    for (const row of aggregationSources(datasets, current, target)) {
      const key = intervalDatasetKey(row); if (tried.has(key)) continue; tried.add(key);
      const attempt = choose(datasets, { ...request, sourceKey: key });
      if (attempt.ok) { result = attempt; break; }
    }
    const source = finestIntervalSource(datasets, current);
    if (!result.ok) result = choose(datasets, { ...request, sourceKey: intervalDatasetKey(source) });
    if (!result.ok) {
      const finer = safeOrder(source.resolution);
      return { ok: false, interval: spec.id, reason: finer !== null && intervalOrderSeconds(spec) < finer ? `Needs finer data than the loaded ${intervalLabel(source.resolution)} bars.` : result.message };
    }
  }
  return result.ok ? { ok: true, kind: 'local', interval: spec.id, result } : { ok: false, interval: spec.id, reason: result.message };
}
