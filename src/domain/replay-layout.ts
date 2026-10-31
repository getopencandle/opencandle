// Bar Replay across every chart of the layout: "All charts" (synchronize event time across layout symbols and
// timeframes) and "Current chart" (replay the selected chart only). Both are a
// choice on the Bar Replay panel; OpenCandle only picks the starting value:
// A new replay starts on All charts when the layout has more than one chart and its Time sync is on,
//   otherwise on Current chart.
// Every chart reveals bars up to the one shared clock on its own interval (replayChartFrame, no lookahead). Live (streaming)
// charts and chart types the reference excludes keep their current data and are left out of All charts.
import { markReplayFrameBars } from '../chart/bar-input-identity';
import { resolveReplayStepSource, replayIntervalDivides } from './replay-intervals';
import { replayChartFrame, replayChartView, replayParticipantSupport, replayTimeline, type ReplayParticipant, type ReplayScope, type ReplaySession } from './replay-session';
import type { Bar, BarDataset } from './types';

/** Starting scope (see the header): All charts for a multi-chart layout with Time sync on. */
export function replayDefaultScope(layout: { cells: readonly unknown[]; sync: { time: boolean } } | null | undefined): ReplayScope {
  return layout && layout.cells.length > 1 && layout.sync.time ? 'all' : 'current';
}
/** The charts that can take part in All charts: the active chart, plus every other chart that is not live and is replayable. */
export function replayLayoutParticipants(rows: readonly ReplayParticipant[], activeCellId: string, isLive: (datasetId: string) => boolean): ReplayParticipant[] {
  return rows.filter(row => row.cellId === activeCellId || (!isLive(row.datasetId) && replayParticipantSupport(row).supported));
}
/** The loaded dataset a participant replays (exact source, instrument and interval), or null. */
export function replayParticipantDataset(row: Pick<ReplayParticipant, 'datasetId' | 'instrumentId' | 'interval'>, datasets: readonly BarDataset[]): BarDataset | null {
  return datasets.find(data => data.provenance.datasetId === row.datasetId && data.instrument.id === row.instrumentId && data.resolution === row.interval) ?? null;
}
/** The replay-interval series of the same instrument when it is finer than the chart and divides it (it forms the chart's current bar), else null. */
export function replayStepSourceFor(interval: string | null, chart: BarDataset, datasets: readonly BarDataset[]): BarDataset | null {
  if (!interval || interval === chart.resolution) return null;
  try {
    const step = resolveReplayStepSource(datasets, chart.instrument.id, interval);
    return step.ok && step.dataset !== chart && step.dataset.resolution !== chart.resolution && replayIntervalDivides(step.dataset.resolution, chart.resolution) ? step.dataset : null;
  } catch { return null; }
}
function participantSources(session: ReplaySession, datasets: readonly BarDataset[]): Array<{ row: ReplayParticipant; chart: BarDataset; step: BarDataset | null }> {
  return session.participants.flatMap(row => { const chart = replayParticipantDataset(row, datasets); return chart ? [{ row, chart, step: replayStepSourceFor(session.interval, chart, datasets) }] : []; });
}
/**
 * The step boundaries of an All charts replay: the union of every participant's replay-interval closes (its finer step series
 * when loaded, else its own bars). Forward, Play and Step back move the one shared clock along this list, so every chart moves.
 */
export function replayLayoutTimeline(session: ReplaySession, datasets: readonly BarDataset[]): number[] {
  if (!session.interval) return [];
  return replayTimeline(participantSources(session, datasets).map(source => source.step ?? source.chart));
}
/**
 * What each OTHER chart of an All charts replay shows: its bars whose periods ended by the clock, plus a forming bar built
 * from revealed step bars when a finer series is loaded. Keyed by cell id; the active chart is projected by the host
 * (replayChartView). Empty for Current chart, before a start bar, and after Jump to real time.
 */
export function replayLayoutFrames(session: ReplaySession | null, datasets: readonly BarDataset[]): Record<string, Bar[]> {
  if (!session || session.scope !== 'all' || session.phase !== 'active' || session.clock === null) return {};
  const out: Record<string, Bar[]> = {};
  for (const { row, chart, step } of participantSources(session, datasets)) if (row.cellId !== session.activeCellId) { const bars = replayChartFrame(chart, session.clock, step).bars; markReplayFrameBars(bars); out[row.cellId] = bars; }
  return out;
}
/**
 * Selecting another chart that takes part in an All charts replay keeps the run (same clock, run identity and
 * replay account) and makes that chart the active one. Null when the replay must end instead (Current chart, a chart outside
 * the replay, or no chosen start bar), which keeps the earlier behaviour.
 */
export function replayFocusSession(session: ReplaySession | null, cellId: string): ReplaySession | null {
  if (!session || session.scope !== 'all' || session.phase !== 'active' || session.clock === null) return null;
  if (session.activeCellId === cellId) return session;
  return session.participants.some(row => row.cellId === cellId) ? { ...session, activeCellId: cellId } : null;
}
/** The newly active chart's replay view after replayFocusSession: its revealed bars and the projected guard state, or null
 * when it has no completed bar at the clock yet (the replay then ends as before). */
export function replayFocusView(session: ReplaySession, chart: BarDataset, datasets: readonly BarDataset[]): { bars: Bar[]; state: NonNullable<ReturnType<typeof replayChartView>['state']> } | null {
  try { const view = replayChartView(session, chart, replayStepSourceFor(session.interval, chart, datasets)); return view.state ? { bars: view.frame.bars, state: view.state } : null; } catch { return null; }
}
