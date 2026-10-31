// Bar Replay interval menu (select, Auto, seconds, intraday, week and month).
// The rules below are made explicit; anything chosen by OpenCandle is marked.
import { aggregateInterval, intervalDatasetKey, parseInterval, STANDARD_INTERVALS, type IntervalSpec } from './intervals';
import type { BarDataset } from './types';

export type ReplayIntervalFamily = 'seconds' | 'intraday' | 'daily' | 'week-month';
export interface ReplayIntervalParticipant { cellId: string; instrumentId: string; interval: string }
export interface ReplayIntervalOption { id: string; label: string; family: ReplayIntervalFamily; available: boolean; reason: string | null }
export interface ReplayIntervalMenu { auto: { id: string | null; reason: string }; options: ReplayIntervalOption[] }
export type ReplayStepSourceResult =
  | { ok: true; kind: 'exact' | 'derived'; dataset: BarDataset; sourceKey: string }
  | { ok: false; code: 'NO_SOURCE' | 'AMBIGUOUS_SOURCE' | 'UNSUPPORTED'; message: string };

const DAY = 86400;
/** Approximate ordering span only (never used for stepping): weeks are 7 days, months 31 days. */
function orderSpan(spec: IntervalSpec): number {
  if (spec.seconds !== null) return spec.seconds;
  if (spec.unit === 'day') return spec.multiplier * DAY;
  if (spec.unit === 'week') return spec.multiplier * 7 * DAY;
  if (spec.unit === 'month') return spec.multiplier * 31 * DAY;
  return Number.POSITIVE_INFINITY;
}
export function replayIntervalFamily(spec: IntervalSpec): ReplayIntervalFamily {
  return spec.unit === 'second' ? 'seconds' : spec.unit === 'minute' ? 'intraday' : spec.unit === 'day' ? 'daily' : 'week-month';
}
function fixedSeconds(spec: IntervalSpec): number | null { return spec.seconds !== null ? spec.seconds : spec.unit === 'day' ? spec.multiplier * DAY : null; }

/**
 * True when every boundary of `chart` is also a boundary of `step` under LV's UTC calendar policy
 * (intervals.ts INTERVAL_POLICIES), so stepping by `step` never splits a chart bar.
 * Weekly and monthly charts accept only one-day steps or sub-day steps that divide a day
 * (one-day steps); a replay interval equal to the chart interval is always accepted.
 */
export function replayIntervalDivides(step: IntervalSpec | string, chart: IntervalSpec | string): boolean {
  const s = typeof step === 'string' ? parseInterval(step) : step, c = typeof chart === 'string' ? parseInterval(chart) : chart;
  if (s.kind !== 'time' || c.kind !== 'time') return false;
  if (s.id === c.id) return true;
  if (c.unit === 'week' || c.unit === 'month') {
    if (s.unit === 'day') return s.multiplier === 1;
    const seconds = fixedSeconds(s); return seconds !== null && DAY % seconds === 0;
  }
  if (s.unit === 'week' || s.unit === 'month') return false;
  const stepSeconds = fixedSeconds(s)!, chartSeconds = fixedSeconds(c)!;
  if (c.unit === 'day' && s.unit !== 'day' && DAY % stepSeconds !== 0) return false;
  return chartSeconds % stepSeconds === 0 && stepSeconds <= chartSeconds;
}

function originalSources(datasets: readonly BarDataset[], instrumentId: string): BarDataset[] {
  return datasets.filter(dataset => dataset.instrument.id === instrumentId && !('derivation' in dataset) && dataset.provenance.providerId !== 'lv-local-aggregation');
}
/** Actual supplied data that can produce `interval` exactly: an exact source or a finer source whose bars divide it. */
function sourcesFor(datasets: readonly BarDataset[], instrumentId: string, interval: IntervalSpec): { exact: BarDataset[]; finer: BarDataset[] } {
  const exact: BarDataset[] = [], finer: BarDataset[] = [];
  for (const dataset of datasets.filter(row => row.instrument.id === instrumentId)) {
    let spec: IntervalSpec; try { spec = parseInterval(dataset.resolution); } catch { continue; }
    if (spec.id === interval.id) exact.push(dataset);
    else if (originalSources([dataset], instrumentId).length && replayIntervalDivides(spec, interval) && orderSpan(spec) < orderSpan(interval)) finer.push(dataset);
  }
  return { exact, finer };
}

/**
 * Resolve the data that drives replay steps for one chart. Exact supplied bars are used unchanged; otherwise a
 * single finer original source is aggregated with the explicit UTC policy. Coarser data never manufactures finer
 * steps (seconds and intraday steps only with actual data). Several finer sources require a choice.
 */
export function resolveReplayStepSource(datasets: readonly BarDataset[], instrumentId: string, interval: string, sourceKey: string | null = null): ReplayStepSourceResult {
  let spec: IntervalSpec;
  try { spec = parseInterval(interval); } catch (cause) { return { ok: false, code: 'UNSUPPORTED', message: cause instanceof Error ? cause.message : String(cause) }; }
  if (spec.kind !== 'time') return { ok: false, code: 'UNSUPPORTED', message: 'Tick and range intervals are not available in Bar Replay.' };
  let { exact, finer } = sourcesFor(datasets, instrumentId, spec);
  if (sourceKey) { exact = exact.filter(row => intervalDatasetKey(row) === sourceKey); finer = finer.filter(row => intervalDatasetKey(row) === sourceKey); }
  if (exact.length === 1) return { ok: true, kind: 'exact', dataset: exact[0], sourceKey: intervalDatasetKey(exact[0]) };
  if (exact.length > 1) return { ok: false, code: 'AMBIGUOUS_SOURCE', message: `More than one loaded ${spec.id} source exists. Choose one; no source is selected automatically.` };
  if (finer.length > 1) return { ok: false, code: 'AMBIGUOUS_SOURCE', message: `Several finer sources can build ${spec.id} replay steps. Choose one; no source is selected automatically.` };
  if (!finer.length) return { ok: false, code: 'NO_SOURCE', message: `No loaded ${spec.id} or finer data for this symbol. Replay steps are never built from coarser bars.` };
  try { const built = aggregateInterval(finer[0], spec.id); return { ok: true, kind: 'derived', dataset: built.dataset, sourceKey: intervalDatasetKey(finer[0]) }; }
  catch (cause) { return { ok: false, code: 'NO_SOURCE', message: cause instanceof Error ? cause.message : String(cause) }; }
}

/** Candidate ids: time presets from the interval menu plus the participating chart intervals themselves. */
function candidates(participants: readonly ReplayIntervalParticipant[]): IntervalSpec[] {
  const seen = new Map<string, IntervalSpec>();
  for (const spec of STANDARD_INTERVALS) if (spec.kind === 'time' && spec.unit !== 'week' && spec.unit !== 'month') seen.set(spec.id, spec);
  for (const row of participants) { try { const spec = parseInterval(row.interval); if (spec.kind === 'time') seen.set(spec.id, spec); } catch { /* invalid chart interval is reported by the session */ } }
  return [...seen.values()].sort((a, b) => orderSpan(a) - orderSpan(b));
}

/**
 * An option is available when it divides every participating chart interval and every
 * participant has actual data at that interval or finer. One chart uses its own interval
 * (weekly/monthly charts use one-day steps when daily or finer data exists); several charts use the largest
 * available common interval.
 */
export function replayIntervalMenu(participants: readonly ReplayIntervalParticipant[], datasets: readonly BarDataset[]): ReplayIntervalMenu {
  if (!participants.length) return { auto: { id: null, reason: 'No chart participates in replay.' }, options: [] };
  const charts = participants.map(row => { try { return parseInterval(row.interval); } catch { return null; } });
  const options = candidates(participants).map((spec): ReplayIntervalOption => {
    const family = replayIntervalFamily(spec), base = { id: spec.id, label: spec.id, family };
    for (let index = 0; index < participants.length; index++) {
      const chart = charts[index];
      if (!chart || chart.kind !== 'time') return { ...base, available: false, reason: `${participants[index].interval} charts cannot be replayed.` };
      if (!replayIntervalDivides(spec, chart)) return { ...base, available: false, reason: `${spec.id} does not divide the ${chart.id} chart interval.` };
      const { exact, finer } = sourcesFor(datasets, participants[index].instrumentId, spec);
      if (!exact.length && !finer.length) return { ...base, available: false, reason: family === 'seconds' ? 'Second steps need actual second data for every chart.' : family === 'intraday' ? 'Intraday steps need actual minute (or finer) data for every chart.' : `${spec.id} steps need ${spec.id} or finer data for every chart.` };
    }
    return { ...base, available: true, reason: null };
  });
  const available = options.filter(row => row.available);
  if (!available.length) return { auto: { id: null, reason: 'No replay interval divides every chart with the loaded data.' }, options };
  if (participants.length === 1) {
    const chart = charts[0]!;
    if (chart.unit === 'week' || chart.unit === 'month') {
      const daily = available.find(row => row.id === '1D');
      if (daily) return { auto: { id: '1D', reason: 'Weekly and monthly charts replay in one-day steps.' }, options };
      const own = available.find(row => row.id === chart.id);
      if (own) return { auto: { id: own.id, reason: 'No daily data is loaded, so replay steps one whole chart bar (OpenCandle-defined fallback).' }, options };
    }
    const own = available.find(row => row.id === chart.id);
    if (own) return { auto: { id: own.id, reason: 'Auto uses the chart interval.' }, options };
    return { auto: { id: null, reason: 'The chart interval has no replayable source.' }, options };
  }
  const largest = available.at(-1)!;
  return { auto: { id: largest.id, reason: 'Auto uses the largest interval every chart supports.' }, options };
}

/** Resolve the menu choice ('auto' or an option id) to a concrete replay interval or a visible refusal. */
export function chooseReplayInterval(menu: ReplayIntervalMenu, choice: string): { ok: true; id: string } | { ok: false; message: string } {
  if (choice === 'auto') return menu.auto.id ? { ok: true, id: menu.auto.id } : { ok: false, message: menu.auto.reason };
  let id: string; try { id = parseInterval(choice).id; } catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }; }
  const option = menu.options.find(row => row.id === id);
  if (!option) return { ok: false, message: `${id} is not a replay interval for these charts.` };
  return option.available ? { ok: true, id } : { ok: false, message: option.reason ?? `${id} is unavailable.` };
}
