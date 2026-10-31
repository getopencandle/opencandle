import type { Bar, BarDataset } from './types';

export interface ReplayState {
  schemaVersion: 1; datasetId: string; revision: string; totalBars: number; cursor: number;
  playing: boolean; barsPerSecond: number; remainderMilliseconds: number; generation: number; sessionId: string; runId: string;
}
export const REPLAY_POLICIES = [
  'Replay passes only the visible information prefix to indicators, scripts and simulation.',
  'Seeking creates a new replay run identity. Replay orders and alerts must reset or restore a matching checkpoint; ordinary paper state remains separate.',
  'Bar timestamps label supplied data. They do not prove that a daily close was knowable at midnight.',
  'Playback speeds are measured in supplied rows per second. Actual bar completion and exact reference speed presets remain unverified.',
];
function validIndex(value: number, total: number): boolean { return Number.isSafeInteger(value) && value >= -1 && value < total; }
function assertState(state: ReplayState, dataset: BarDataset): void {
  if (state.datasetId !== dataset.provenance.datasetId || state.revision !== dataset.provenance.revision || state.totalBars !== dataset.bars.length) throw new Error('Replay dataset identity, revision or length changed. Start a new replay run.');
  if (!validIndex(state.cursor, state.totalBars) && !(state.totalBars === 0 && state.cursor === -1)) throw new Error('Replay cursor is outside the supplied dataset.');
}
export function createReplay(dataset: BarDataset, startIndex = Math.min(0, dataset.bars.length - 1), sessionId: string = crypto.randomUUID()): ReplayState {
  if (!validIndex(startIndex, dataset.bars.length) && !(dataset.bars.length === 0 && startIndex === -1)) throw new RangeError('Replay start index must be from -1 to the final supplied bar.');
  if (!sessionId) throw new Error('Replay session identity is required.');
  return { schemaVersion: 1, datasetId: dataset.provenance.datasetId, revision: dataset.provenance.revision, totalBars: dataset.bars.length, cursor: startIndex, playing: false, barsPerSecond: 1, remainderMilliseconds: 0, generation: 1, sessionId, runId: `${dataset.provenance.datasetId}:${dataset.provenance.revision}:${sessionId}:replay:1` };
}
/** Returns copied prefix data; the future tail is never exposed to downstream execution. */
export function replayPrefix(dataset: BarDataset, state: ReplayState): Bar[] { assertState(state, dataset); return dataset.bars.slice(0, state.cursor + 1).map(bar => ({ ...bar })); }
export function replayDataset(dataset: BarDataset, state: ReplayState): BarDataset {
  const bars = replayPrefix(dataset, state);
  return { ...dataset, instrument: { ...dataset.instrument }, bars, provenance: { ...structuredClone(dataset.provenance), datasetId: `${dataset.provenance.datasetId}:${state.runId}`, asOf: bars.at(-1)?.time ?? 0, notes: [...dataset.provenance.notes, `Replay shows ${bars.length} of ${state.totalBars} supplied bars. Historical fixtures remain synthetic.`] } };
}
export function seekReplay(state: ReplayState, index: number): ReplayState {
  if (!validIndex(index, state.totalBars) && !(state.totalBars === 0 && index === -1)) throw new RangeError('Replay target index is outside the supplied history.');
  const generation = state.generation + 1;
  return { ...state, cursor: index, playing: false, remainderMilliseconds: 0, generation, runId: `${state.datasetId}:${state.revision}:${state.sessionId}:replay:${generation}` };
}
export function seekReplayTime(state: ReplayState, dataset: BarDataset, time: number): ReplayState {
  assertState(state, dataset);
  if (!Number.isFinite(time)) throw new RangeError('Replay date must be a finite Unix timestamp.');
  let low = 0, high = dataset.bars.length;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (dataset.bars[middle].time <= time) low = middle + 1; else high = middle; }
  return seekReplay(state, low - 1);
}
export function stepReplay(state: ReplayState, count = 1): ReplayState {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Step count must be a positive integer. Use seek for backward navigation.');
  const cursor = Math.min(state.totalBars - 1, state.cursor + count);
  return { ...state, cursor, playing: cursor === state.totalBars - 1 ? false : state.playing, remainderMilliseconds: 0 };
}
export function setReplayPlaying(state: ReplayState, playing: boolean): ReplayState { return { ...state, playing: playing && state.cursor < state.totalBars - 1, remainderMilliseconds: 0 }; }
export function setReplaySpeed(state: ReplayState, barsPerSecond: number): ReplayState {
  if (!Number.isFinite(barsPerSecond) || barsPerSecond < 0.1 || barsPerSecond > 100) throw new RangeError('Playback speed must be between 0.1 and 100 supplied bars per second.');
  return { ...state, barsPerSecond, remainderMilliseconds: 0 };
}
export function advanceReplay(state: ReplayState, elapsedMilliseconds: number): ReplayState {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) throw new RangeError('Elapsed replay time must be finite and nonnegative.');
  if (!state.playing || elapsedMilliseconds === 0) return state;
  const millisecondsPerBar = 1000 / state.barsPerSecond, accumulated = state.remainderMilliseconds + elapsedMilliseconds, count = Math.floor(accumulated / millisecondsPerBar);
  if (count === 0) return { ...state, remainderMilliseconds: accumulated };
  const stepped = stepReplay(state, Math.min(count, state.totalBars));
  return { ...stepped, remainderMilliseconds: stepped.playing ? accumulated - count * millisecondsPerBar : 0 };
}
