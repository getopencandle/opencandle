// Bar Replay on live charts. Opening replay on a live chart freezes a copy of
// the bars it has loaded (a pinned snapshot with its own revision) and replays that copy. The live subscription keeps
// running underneath (ordinary alerts and ordinary paper fills stay on the live feed), but the replaying chart never shows
// a bar that arrived after the freeze. Jump to real time and Close drop the snapshot, so the chart returns to the live
// feed with every bar that arrived meanwhile.
//
// The snapshot copies every loaded bar. The last bar of a live feed is always treated as forming
// (completedBarsDataset), so it is kept only as the boundary marker and is never revealed by replay. The snapshot
// revision names the frozen closed history (`<live revision>|replay-snapshot:<closed count>:<last closed time>`), so a
// remembered session continues on a later freeze as long as that freeze still holds the remembered history.
import {rawLiveSessionSource} from './live-session-source';
import { completedBarsDataset, isLiveDatasetId } from './live-provider';
import { replayBarCloseTime, type ReplaySavedSession, type ReplaySession } from './replay-session';
import type { BarDataset } from './types';

export type ReplayLiveSnapshots = Readonly<Record<string, BarDataset>>;
export const REPLAY_SNAPSHOT_MARK = '|replay-snapshot:';
export const REPLAY_SNAPSHOT_NOTE = 'Bar Replay shows a frozen copy of the live history loaded when replay started. The live feed keeps running for alerts and paper trading; Jump to real time or Close shows the bars that arrived meanwhile.';
export const REPLAY_LIVE_NO_HISTORY = 'This live chart has no closed bars to replay yet. Wait for its history to load.';

export const isReplaySnapshotRevision = (revision: unknown): boolean => typeof revision === 'string' && revision.includes(REPLAY_SNAPSHOT_MARK);
const liveRevisionOf = (revision: string): string => { const at = revision.indexOf(REPLAY_SNAPSHOT_MARK); return at < 0 ? revision : revision.slice(0, at); };
/**
 * True when `frozen` is the held replay copy of `live`: the same feed (dataset id, instrument, interval, session and
 * adjustment) frozen from exactly this live revision. The chart grid draws a held copy's bars under its live feed's source
 * (saved frames stay keyed to the live source), while the root input names the copy itself, so both describe one chart.
 */
export function isReplaySnapshotOf(frozen: BarDataset, live: BarDataset): boolean {
  const copy = frozen.provenance, feed = live.provenance;
  return isReplaySnapshotRevision(copy.revision) && !isReplaySnapshotRevision(feed.revision) && isLiveDatasetId(feed.datasetId)
    && copy.datasetId === feed.datasetId && liveRevisionOf(copy.revision) === feed.revision && copy.session === feed.session && copy.adjustment === feed.adjustment
    && frozen.instrument.id === live.instrument.id && frozen.resolution === live.resolution;
}

/** The frozen replay copy of one live dataset (null when it has no closed bar yet). Non-live datasets are refused. */
export function freezeLiveDataset(live: BarDataset): BarDataset | null {
  const raw=rawLiveSessionSource(live);
  if (!isLiveDatasetId(raw.provenance.datasetId)) throw new Error('Only a live chart is frozen for Bar Replay.');
  const closed = completedBarsDataset(raw).bars, last = closed.at(-1);
  if (!last) return null;
  const revision = `${liveRevisionOf(raw.provenance.revision)}${REPLAY_SNAPSHOT_MARK}${closed.length}:${last.time}`;
  return { ...raw, instrument: { ...raw.instrument }, bars: raw.bars.map(bar => ({ ...bar })), provenance: { ...raw.provenance, revision, notes: [...raw.provenance.notes, REPLAY_SNAPSHOT_NOTE] } };
}

/** Freezes every live dataset of the list that has closed bars. `keep` entries are reused as they are (never refrozen). */
export function freezeLiveDatasets(datasets: readonly BarDataset[], keep: ReplayLiveSnapshots | null = null): Record<string, BarDataset> {
  const out: Record<string, BarDataset> = { ...(keep ?? {}) };
  for (const dataset of datasets) {
    const id = dataset.provenance.datasetId;
    if (!isLiveDatasetId(id) || out[id]) continue;
    const frozen = freezeLiveDataset(dataset); if (frozen) out[id] = frozen;
  }
  return out;
}

/** The dataset replay reads: the frozen copy when one exists for it, else the dataset itself (same object). */
export function pinReplayDataset<T extends BarDataset>(dataset: T, snapshots: ReplayLiveSnapshots | null | undefined): T {
  const frozen = snapshots?.[dataset.provenance.datasetId];
  return frozen && frozen.instrument.id === dataset.instrument.id && frozen.resolution === dataset.resolution ? frozen as T : dataset;
}
/** The list with every frozen dataset substituted. The same array is returned when nothing is substituted. */
export function pinReplayDatasets(datasets: readonly BarDataset[], snapshots: ReplayLiveSnapshots | null | undefined): BarDataset[] {
  if (!snapshots || !Object.keys(snapshots).length) return datasets as BarDataset[];
  let changed = false;
  const out = datasets.map(row => { const pinned = pinReplayDataset(row, snapshots); if (pinned !== row) changed = true; return pinned; });
  return changed ? out : datasets as BarDataset[];
}

/**
 * The snapshots a session holds: one per live dataset of an instrument that takes part (its chart and any finer replay
 * interval series of it), kept from `prior` once frozen, frozen from `datasets` when missing. No session, or Jump to real
 * time, holds none (null). The same `prior` object is returned when nothing changes, so memoized consumers keep identity.
 */
export function replaySnapshotsFor(prior: ReplayLiveSnapshots | null, session: Pick<ReplaySession, 'phase' | 'participants'> | null, datasets: readonly BarDataset[]): ReplayLiveSnapshots | null {
  if (!session || session.phase === 'realtime') return null;
  const instruments = new Set(session.participants.map(row => row.instrumentId)), out: Record<string, BarDataset> = {};
  for (const [id, frozen] of Object.entries(prior ?? {})) if (instruments.has(frozen.instrument.id)) out[id] = frozen;
  for (const dataset of datasets) {
    const id = dataset.provenance.datasetId;
    if (out[id] || !isLiveDatasetId(id) || !instruments.has(dataset.instrument.id)) continue;
    const frozen = freezeLiveDataset(dataset); if (frozen) out[id] = frozen;
  }
  const keys = Object.keys(out);
  if (!keys.length) return null;
  if (prior && keys.length === Object.keys(prior).length && keys.every(key => prior[key] === out[key])) return prior;
  return out;
}

/** True while the session replays at least one frozen live chart. */
export function replayHoldsLive(snapshots: ReplayLiveSnapshots | null | undefined): boolean { return !!snapshots && Object.keys(snapshots).length > 0; }

/**
 * Whether the chart's own alert observer runs. A frozen copy keeps the live alert basis (the v2 binding
 * key has no revision), so outside an active replay the chart observer would keep evaluating ordinary alerts on the frozen
 * bars while the background watcher evaluates the same alerts on the live feed: two owners with separate event sequences.
 * While a copy is held without an active replay (choosing the start bar), the chart observer is off (and reset), so the
 * background watcher is the only owner; it re-adopts from the saved sequence when the copy is released. During an active
 * replay it runs for replay alerts and already skips ordinary ones.
 */
export function chartAlertObservationEnabled(replaying: boolean, liveReplayHeld: boolean): boolean { return replaying || !liveReplayHeld; }

/**
 * How virtual accounts are fed. While a frozen live copy is held, ordinary paper of every instrument
 * (the charted one too) follows its background 1m series, whether the replay is active or a start bar is being chosen;
 * the chart's bars feed only the replay account, and only while the replay is active.
 */
export function liveReplayPaperRouting(replaying: boolean, liveReplayHeld: boolean): { chart: 'ordinary' | 'replay' | 'none'; background: 'others' | 'all' | 'none' } {
  if (liveReplayHeld) return { chart: replaying ? 'replay' : 'none', background: 'all' };
  return replaying ? { chart: 'replay', background: 'none' } : { chart: 'ordinary', background: 'others' };
}

/**
 * Continue session on a live chart: a live feed gets a new revision whenever it is reopened, so a remembered
 * snapshot revision is replaced by the current freeze of the same feed (same dataset id: provider, symbol and interval)
 * when that freeze's closed history covers the saved clock (its first bar opened before the clock and its last closed
 * bar ends at or after it). Anything else keeps the saved revision, so continueReplaySession refuses it with its
 * ordinary "source was revised" message.
 */
export function adoptLiveSnapshotRevisions(saved: ReplaySavedSession, snapshots: ReplayLiveSnapshots | null | undefined): ReplaySavedSession {
  if (!snapshots) return saved;
  let changed = false;
  const participants = saved.participants.map(row => {
    const frozen = snapshots[row.datasetId];
    if (!frozen || !isReplaySnapshotRevision(row.revision) || frozen.provenance.revision === row.revision || frozen.instrument.id !== row.instrumentId) return row;
    const closed = completedBarsDataset(frozen).bars, first = closed[0], last = closed.at(-1);
    let end: number; try { end = last ? replayBarCloseTime(frozen,last,frozen.resolution) : -Infinity; } catch { return row; }
    if (!first || first.time >= saved.clock || end < saved.clock) return row;
    changed = true; return { ...row, revision: frozen.provenance.revision };
  });
  return changed ? { ...saved, participants } : saved;
}
