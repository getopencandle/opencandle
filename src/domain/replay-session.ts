// Bar Replay session model: start selection, shared event clock (current chart or all charts), stepping by the
// replay interval, playback, jump to real time, close/remember and continue session, shortcuts, chart-type and
// drawing applicability, and paper/alert isolation. The toolbar button is "Replay" (tooltip "Bar replay") and the
// chart shows a "Replay mode" watermark. Choices such as speed presets, panel layout and hotkeys are marked.
// Speeds 0.1x to 10x, Shift+Left steps back, Close while choosing a new start keeps
// the replay, and the replay account carries across seeks (ui/replay-paper-carry.ts).
//
// Information boundary: the session clock is an event-time watermark. A chart bar is revealed only when its
// whole period has ended at or before the clock; the forming bar of a coarser chart is built only from revealed
// replay-interval bars. Nothing past the clock reaches indicators, scripts, the data window or simulation.
import { isLegacyLocalRevision, LEGACY_LOCAL_IMPORT_REVISION, LOCAL_IMPORT_LEGACY_NOTICE } from './data';
import { aggregateInterval, parseInterval, US_EQUITY_EXCHANGES, type DerivedIntervalDataset, type IntervalSpec } from './intervals';
import type { ReplayState } from './replay';
import { completedBarsDataset } from './live-provider';
import { isSymbolMathDatasetId } from './symbol-math-live';
import type { Bar, BarDataset } from './types';
import {nyseRegularBarRange} from './nyse-session-bars';

export type ReplayScope = 'current' | 'all';
export type ReplayPhase = 'selecting-start' | 'active' | 'realtime';
export interface ReplayParticipant { cellId: string; instrumentId: string; symbol: string; interval: string; chartType: string; datasetId: string; revision: string }
export interface ReplaySession {
  schemaVersion: 1; sessionId: string; generation: number; runId: string;
  phase: ReplayPhase; scope: ReplayScope; activeCellId: string; participants: ReplayParticipant[];
  intervalChoice: string; interval: string | null;
  /** Event-time watermark in Unix seconds; null until a start bar is chosen and after jumping to real time. */
  clock: number | null;
  playing: boolean; stepsPerSecond: number; remainderMilliseconds: number;
}
/** Remembered by Close (X or the Replay toggle) and restored by Continue session. Chart type and style are not part of it. */
export interface ReplaySavedSession {
  schemaVersion: 1; sessionId: string; scope: ReplayScope; activeCellId: string;
  participants: Array<Omit<ReplayParticipant, 'chartType'>>; intervalChoice: string; clock: number; stepsPerSecond: number; savedAt: number;
}
export interface ReplayFrame { bars: Bar[]; completeBars: number; partial: boolean; cursor: number; clock: number }

/**
 * The replay speeds, 0.1x to 10x, in replay-interval steps per second
 * (1x is one step per second). The intermediate entries are our own choice.
 */
export const REPLAY_SPEEDS = [0.1, 0.3, 0.5, 1, 3, 5, 7, 10] as const;
/** The earlier name of REPLAY_SPEEDS. */
export const REPLAY_SPEEDS_LV = REPLAY_SPEEDS;
/** A speed of the earlier catalog (0.5, 1, 2, 5, 10) that a remembered session may hold, read as the nearest current one. */
const RETIRED_SPEEDS: Readonly<Record<number, number>> = { 2: 3 };
const knownSpeed = (value: unknown): value is number => REPLAY_SPEEDS.includes(value as typeof REPLAY_SPEEDS[number]);
/**
 * Chart types refused by Bar Replay. Renko, Kagi, Point and figure, Range and Line break are commonly refused too;
 * LV replays those five, because they are built by LV's own derived transforms from the time-based source bars (src/chart/derived): during
 * a replay run the transform reads only the revealed source bars, and the last one counts as forming (lastBarOpen), so a brick,
 * line, column or range bar is confirmed only by revealed data. Volume footprint and TPO stay refused: they read finer bars of
 * the forming period, which a replay frame does not limit.
 */
export const REPLAY_UNSUPPORTED_CHART_TYPES: Readonly<Record<string, string>> = {
  footprint: 'Volume footprint', tpo: 'Time price opportunity',
};
/** The derived chart types the reference refuses and LV replays (see REPLAY_UNSUPPORTED_CHART_TYPES). */
export const REPLAY_LV_DERIVED_CHART_TYPES: readonly string[] = Object.freeze(['renko', 'kagi', 'pointfigure', 'range', 'linebreak']);
/** Tools inactive during replay per the record; the others stay available on revealed bars. */
export const REPLAY_INACTIVE_DRAWINGS: Readonly<Record<string, string>> = {
  'DW.CHANNEL.REGRESSION_TREND': 'Regression trend', LineToolRegressionTrend: 'Regression trend',
  'DW.VOLUME.FIXED_RANGE_VOLUME_PROFILE': 'Fixed range volume profile', LineToolFixedRangeVolumeProfile: 'Fixed range volume profile',
};
export const REPLAY_SESSION_POLICIES = [
  'The replay clock is an event-time watermark. A bar is revealed only when its whole period has ended; the forming bar of a coarser chart is built from revealed replay-interval bars only.',
  'Every seek, start selection, interval change or restore creates a new replay run identity, so replay consumers recompute from the new clock; replay alerts belong to that run. The replay account carries across seeks of one session: a seek forward keeps it as it is, and a seek back returns the replay account to its state at that time.',
  'Normal Paper Trading and quote lists keep using current data while a chart replays. Replay trading uses a separate, labelled replay account that is never merged into ordinary funds.',
  'Existing ordinary alerts keep their live basis. New ordinary alerts cannot be created from a replaying chart; replay alerts are local to the replay run.',
  'Speeds run from 0.1x to 10x replay-interval steps per second. The clicked bar becomes the last revealed bar (OpenCandle-defined).',
];

const DAY = 86400;
function runIdFor(sessionId: string, generation: number) { return `replay-session:${sessionId}:${generation}`; }
function addUtcMonths(time: number, months: number): number { const date = new Date(time * 1000); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1) / 1000; }
/** End of a bar's period under LV's UTC calendar policy; bar time is the opening label. */
export function barCloseTime(bar: Pick<Bar, 'time'>, interval: IntervalSpec | string): number {
  const spec = typeof interval === 'string' ? parseInterval(interval) : interval;
  if (spec.seconds !== null) return bar.time + spec.seconds;
  if (spec.unit === 'day') return bar.time + spec.multiplier * DAY;
  if (spec.unit === 'week') return bar.time + spec.multiplier * 7 * DAY;
  if (spec.unit === 'month') return addUtcMonths(bar.time, spec.multiplier);
  throw new Error('Tick and range bars have no time period and cannot be replayed.');
}
/** Dataset-aware event boundary only; metadata selects calendar arithmetic, never observation authority.
 * Raw Alpaca feeds declare an unknown session while folding their regular-hour segment on the NYSE grid. */
export function replayBarCloseTime(dataset:BarDataset,bar:Pick<Bar,'time'>,interval:IntervalSpec|string=dataset.resolution):number{
 const spec=typeof interval==='string'?parseInterval(interval):interval;
 if(spec.seconds===3600){
  const own=(value:unknown,key:string):unknown=>{if(!value||typeof value!=='object')return undefined;const field=Object.getOwnPropertyDescriptor(value,key);return field&&Object.hasOwn(field,'value')?field.value:undefined;};
  try{
   const instrument=own(dataset,'instrument'),provenance=own(dataset,'provenance'),asset=own(instrument,'assetClass'),exchange=own(instrument,'exchange'),session=own(provenance,'session');
   if((asset==='stock'||asset==='etf')&&typeof exchange==='string'&&US_EQUITY_EXCHANGES.has(exchange.toUpperCase())&&own(instrument,'timezone')==='America/New_York'&&own(provenance,'timezone')==='America/New_York'&&(session==='regular'||session==='extended'||session==='unknown'&&['alpaca-iex','alpaca-stub','alpaca-sip-delayed'].includes(own(provenance,'providerId') as string))){
    const time=own(bar,'time'),range=typeof time==='number'?nyseRegularBarRange(time,3600):null;if(range)return range.barEnd;
   }
  }catch{/* Unsupported or redirected descriptors retain the existing nominal boundary. */}
 }
 return barCloseTime(bar,spec);
}
/**
 * Start of the bucket containing `time`. Default: DEFAULT_AGGREGATION_POLICY (UTC epoch anchor, weeks start Monday).
 * `anchor` is a known bar start of the same series (session-anchored rows such as hourly bars at :30); intraday,
 * daily and weekly buckets then align to it. Months stay calendar months.
 */
export function bucketStart(time: number, interval: IntervalSpec | string, anchor?: number): number {
  const spec = typeof interval === 'string' ? parseInterval(interval) : interval;
  const floor = (size: number, offset = 0) => time - ((((time - offset) % size) + size) % size);
  const known = anchor !== undefined && Number.isFinite(anchor) ? anchor : undefined;
  if (spec.seconds !== null) return floor(spec.seconds, known ?? 0);
  if (spec.unit === 'day') return floor(spec.multiplier * DAY, known ?? 0);
  if (spec.unit === 'week') return floor(spec.multiplier * 7 * DAY, known ?? 4 * DAY);
  if (spec.unit === 'month') {
    const date = new Date(time * 1000), months = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const start = months - ((((months - 1970 * 12) % spec.multiplier) + spec.multiplier) % spec.multiplier);
    return Date.UTC(Math.floor(start / 12), start % 12, 1) / 1000;
  }
  throw new Error('Tick and range bars have no time bucket.');
}
/** A derived chart (symbol math) is a live chart, so it replays its frozen copy like any live chart
 *, whatever operators its expression uses (`GME/SPY` and `GME-SPY` alike). Only symbol text that cannot be
 * a ticker (an operator other than a dash, parentheses or spaces) without its derived chart is refused, with one reason. A dash-only
 * text such as `BRK-B` or `BTC-USD` off a derived chart is a ticker: only the dataset can tell `GME-SPY` the expression apart. */
export const REPLAY_DERIVED_REFUSAL = 'A derived symbol replays only on its live derived chart. Open it from Symbol search to replay it.';
const notTicker = (symbol: string) => /[*/+()\s]/.test(symbol);

export function replayChartTypeSupport(chartType: string): { supported: true } | { supported: false; reason: string } {
  const name = REPLAY_UNSUPPORTED_CHART_TYPES[chartType];
  return name ? { supported: false, reason: `${name} charts are not available in Bar Replay. Switch to a time-based chart type to replay.` } : { supported: true };
}
/** Chart types, spreads and tick/range intervals are refused visibly, never emulated. */
export function replayParticipantSupport(participant: Pick<ReplayParticipant, 'chartType' | 'symbol' | 'interval'> & { datasetId?: string }): { supported: true } | { supported: false; reason: string } {
  const type = replayChartTypeSupport(participant.chartType); if (!type.supported) return type;
  if (!isSymbolMathDatasetId(participant.datasetId) && notTicker(participant.symbol)) return { supported: false, reason: REPLAY_DERIVED_REFUSAL };
  let spec: IntervalSpec; try { spec = parseInterval(participant.interval); } catch { return { supported: false, reason: `Interval ${participant.interval} cannot be replayed.` }; }
  if (spec.kind !== 'time') return { supported: false, reason: 'Tick and range charts are not available in Bar Replay.' };
  return { supported: true };
}
export function replayDrawingApplicability(toolId: string): { active: true } | { active: false; reason: string } {
  const name = REPLAY_INACTIVE_DRAWINGS[toolId];
  return name ? { active: false, reason: `${name} is inactive during Bar Replay.` } : { active: true };
}

function checkParticipants(participants: readonly ReplayParticipant[]) {
  if (!participants.length) throw new Error('Bar Replay needs at least one chart.');
  const ids = new Set<string>();
  for (const row of participants) {
    if (!row.cellId || ids.has(row.cellId)) throw new Error('Replay charts need unique chart identities.'); ids.add(row.cellId);
    const support = replayParticipantSupport(row); if (!support.supported) throw new Error(support.reason);
  }
}
/** The Replay button enters start selection (the chart shows the vertical scissors line). */
export function openReplay(input: { participants: ReplayParticipant[]; activeCellId: string; scope?: ReplayScope; intervalChoice?: string; stepsPerSecond?: number; sessionId?: string }): ReplaySession {
  const scope = input.scope ?? 'current', participants = scope === 'current' ? input.participants.filter(row => row.cellId === input.activeCellId) : input.participants;
  if (!participants.some(row => row.cellId === input.activeCellId)) throw new Error('The active chart must take part in replay.');
  checkParticipants(participants);
  const speed = input.stepsPerSecond ?? 1; if (!knownSpeed(speed)) throw new RangeError('Unknown replay speed.');
  const sessionId = input.sessionId ?? crypto.randomUUID();
  return { schemaVersion: 1, sessionId, generation: 1, runId: runIdFor(sessionId, 1), phase: 'selecting-start', scope, activeCellId: input.activeCellId, participants: participants.map(row => ({ ...row })), intervalChoice: input.intervalChoice ?? 'auto', interval: null, clock: null, playing: false, stepsPerSecond: speed, remainderMilliseconds: 0 };
}
function nextGeneration(session: ReplaySession, patch: Partial<ReplaySession>): ReplaySession {
  const generation = session.generation + 1, prior = runIdFor(session.sessionId,session.generation);
  const incarnation = typeof session.runId==='string'&&session.runId.startsWith(prior+':continued:')?session.runId.slice(prior.length):'';
  return { ...session, ...patch, generation, runId: runIdFor(session.sessionId, generation)+incarnation, playing: false, remainderMilliseconds: 0 };
}
/** Scissors-line hover: the bar under the pointer and whether it can start replay. */
export function replayStartCandidate(liveChart: BarDataset, time: number): { ok: true; index: number; time: number } | { ok: false; reason: string } {
  const chart = completedBarsDataset(liveChart); // a still-forming live bar is never a replay start
  if (!Number.isFinite(time)) return { ok: false, reason: 'Choose a bar on the chart.' };
  const bars = chart.bars; if (!bars.length) return { ok: false, reason: 'The chart has no history to replay.' };
  if (time < bars[0].time) return { ok: false, reason: 'Choose a bar inside the loaded history.' };
  let low = 0, high = bars.length; while (low < high) { const middle = (low + high) >> 1; if (bars[middle].time <= time) low = middle + 1; else high = middle; }
  const index = low - 1;
  if (index === bars.length - 1 && time >= replayBarCloseTime(chart,bars[index],chart.resolution)) return { ok: false, reason: 'Choose a bar inside the loaded history.' };
  return { ok: true, index, time: bars[index].time };
}
/** The clicked bar becomes the last revealed bar; a new run starts paused. */
export function selectReplayStart(session: ReplaySession, chart: BarDataset, time: number, interval: string): ReplaySession {
  const participant = session.participants.find(row => row.cellId === session.activeCellId)!;
  if (chart.provenance.datasetId !== participant.datasetId || chart.provenance.revision !== participant.revision) throw new Error('The chart source changed. Start replay again.');
  const candidate = replayStartCandidate(chart, time); if (!candidate.ok) throw new RangeError(candidate.reason);
  parseInterval(interval);
  return nextGeneration(session, { phase: 'active', interval: parseInterval(interval).id, clock: replayBarCloseTime(chart,chart.bars[candidate.index],chart.resolution) });
}
/**
 * Start-point menu (select a different historical starting point while a replay exists, or click a bar).
 * Entries and wording are our own choice. Every
 * entry picks a completed bar that becomes the last revealed bar, exactly as a click does.
 */
export type ReplayStartPoint = { kind: 'date'; time: number } | { kind: 'first' } | { kind: 'random' };
export const REPLAY_START_POINTS_LV: ReadonlyArray<{ kind: ReplayStartPoint['kind']; label: string }> = [
  { kind: 'date', label: 'Select date' }, { kind: 'first', label: 'First available date' }, { kind: 'random', label: 'Random bar' },
];
const OUTSIDE_HISTORY = 'The chosen date is outside the loaded history.';
/**
 * The start bar for a menu entry. Select date: the bar containing the chosen time (outside the loaded history is refused,
 * never clamped). First available date: the first completed bar. Random bar (our own range): a uniformly drawn
 * completed bar other than the last one, so at least one step remains to replay; a one-bar history gives that bar.
 */
export function replayStartPointTime(liveChart: BarDataset, point: ReplayStartPoint, random: () => number = Math.random): { ok: true; index: number; time: number } | { ok: false; reason: string } {
  if (point.kind === 'date') { const candidate = replayStartCandidate(liveChart, point.time); return candidate.ok ? candidate : { ok: false, reason: Number.isFinite(point.time) && completedBarsDataset(liveChart).bars.length ? OUTSIDE_HISTORY : candidate.reason }; }
  const bars = completedBarsDataset(liveChart).bars; if (!bars.length) return { ok: false, reason: 'The chart has no history to replay.' };
  if (point.kind === 'first') return { ok: true, index: 0, time: bars[0].time };
  const last = Math.max(0, bars.length - 2), drawn = random(), unit = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 1) : 0;
  const index = Math.min(last, Math.floor(unit * (last + 1)));
  return { ok: true, index, time: bars[index].time };
}
/** Start (or, while a replay exists, move) the replay at a start-point menu entry: a new run, paused. */
export function startReplayAt(session: ReplaySession, chart: BarDataset, point: ReplayStartPoint, interval: string, random: () => number = Math.random): ReplaySession {
  const start = replayStartPointTime(chart, point, random); if (!start.ok) throw new RangeError(start.reason);
  return selectReplayStart(session, chart, start.time, interval);
}
/** Re-enter start selection while a session exists (Select bar). Revealed state is kept until a new bar is clicked. */
export function beginReplayStartSelection(session: ReplaySession): ReplaySession { return { ...session, phase: 'selecting-start', playing: false, remainderMilliseconds: 0 }; }
/** Change the replay interval. Requires a new run because step boundaries change. */
export function setReplaySessionInterval(session: ReplaySession, choice: string, interval: string): ReplaySession {
  return nextGeneration(session, { intervalChoice: choice, interval: parseInterval(interval).id });
}
/** Switching scope keeps the clock (all charts sync to it) under a new run. */
export function setReplayScope(session: ReplaySession, scope: ReplayScope, layout: readonly ReplayParticipant[]): ReplaySession {
  const participants = scope === 'current' ? layout.filter(row => row.cellId === session.activeCellId) : [...layout];
  if (!participants.some(row => row.cellId === session.activeCellId)) throw new Error('The active chart must take part in replay.');
  checkParticipants(participants);
  return nextGeneration(session, { scope, participants: participants.map(row => ({ ...row })) });
}

/** Sorted unique step boundaries (close times of the replay-interval bars) across the given step sources. */
export function replayTimeline(stepSources: readonly BarDataset[]): number[] {
  const out = new Set<number>();
  for (const live of stepSources) { const source = completedBarsDataset(live); const spec = parseInterval(source.resolution); for (const bar of source.bars) out.add(replayBarCloseTime(source,bar,spec)); }
  return [...out].sort((a, b) => a - b);
}
function nextBoundary(timeline: readonly number[], clock: number): number | null {
  let low = 0, high = timeline.length; while (low < high) { const middle = (low + high) >> 1; if (timeline[middle] <= clock) low = middle + 1; else high = middle; }
  return low < timeline.length ? timeline[low] : null;
}
/** Reveal exactly one more replay-interval step on the shared clock. */
export function stepReplaySession(session: ReplaySession, timeline: readonly number[], count = 1): ReplaySession {
  if (session.phase !== 'active' || session.clock === null) throw new Error('Choose a start bar before stepping.');
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Step count must be a positive integer.');
  let clock = session.clock, moved = 0;
  for (; moved < count; moved++) { const next = nextBoundary(timeline, clock); if (next === null) break; clock = next; }
  const atEnd = nextBoundary(timeline, clock) === null;
  return { ...session, clock, playing: atEnd ? false : session.playing, remainderMilliseconds: 0 };
}
function previousBoundary(timeline: readonly number[], clock: number): number | null {
  let low = 0, high = timeline.length; while (low < high) { const middle = (low + high) >> 1; if (timeline[middle] < clock) low = middle + 1; else high = middle; }
  return low > 0 ? timeline[low - 1] : null;
}
/** Step back: true while an earlier replay step exists before the clock. */
export function replayCanStepBack(session: ReplaySession | null, timeline: readonly number[]): boolean {
  return !!session && session.phase === 'active' && session.clock !== null && previousBoundary(timeline, session.clock) !== null;
}
/**
 * Step back (a backward seek): hide the last revealed replay-interval step(s). It is a seek, so it starts a
 * new run, paused (REPLAY_SESSION_POLICIES[1]): replay consumers are recomputed from the earlier clock, the old run's
 * replay orders and account are not carried back, and ordinary paper fills are untouched. Refused at the first bar.
 */
export function stepBackReplaySession(session: ReplaySession, timeline: readonly number[], count = 1): ReplaySession {
  if (session.phase !== 'active' || session.clock === null) throw new Error('Choose a start bar before stepping back.');
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Step count must be a positive integer.');
  let clock = session.clock;
  for (let moved = 0; moved < count; moved++) { const previous = previousBoundary(timeline, clock); if (previous === null) break; clock = previous; }
  if (clock === session.clock) throw new RangeError('The replay is at the first bar of the loaded history.');
  return nextGeneration(session, { clock });
}
/** Pausing keeps the session; playing at the end of history is refused. */
export function setReplaySessionPlaying(session: ReplaySession, playing: boolean, timeline: readonly number[]): ReplaySession {
  if (session.phase !== 'active' || session.clock === null) return { ...session, playing: false, remainderMilliseconds: 0 };
  return { ...session, playing: playing && nextBoundary(timeline, session.clock) !== null, remainderMilliseconds: 0 };
}
/** Changeable before or during playback; the fractional step remainder is reset. */
export function setReplaySessionSpeed(session: ReplaySession, stepsPerSecond: number): ReplaySession {
  if (!knownSpeed(stepsPerSecond)) throw new RangeError('Unknown replay speed.');
  return { ...session, stepsPerSecond, remainderMilliseconds: 0 };
}
export function advanceReplaySession(session: ReplaySession, elapsedMilliseconds: number, timeline: readonly number[]): ReplaySession {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) throw new RangeError('Elapsed replay time must be finite and nonnegative.');
  if (!session.playing || elapsedMilliseconds === 0) return session;
  const perStep = 1000 / session.stepsPerSecond, accumulated = session.remainderMilliseconds + elapsedMilliseconds, count = Math.floor(accumulated / perStep);
  if (count === 0) return { ...session, remainderMilliseconds: accumulated };
  const stepped = stepReplaySession(session, timeline, Math.min(count, timeline.length || 1));
  return { ...stepped, remainderMilliseconds: stepped.playing ? accumulated - count * perStep : 0 };
}
/**
 * Return every chart to its current source. The replay run ends; its replay account and replay
 * alerts are discarded, never merged into ordinary paper or ordinary alerts. The panel stays open.
 */
export function jumpReplayToRealtime(session: ReplaySession): { session: ReplaySession; endedRunId: string; mergedIntoOrdinary: false } {
  return { session: nextGeneration(session, { phase: 'realtime', clock: null }), endedRunId: session.runId, mergedIntoOrdinary: false };
}
/**
 * Close: X or the Replay toggle closes the panel and remembers the session (when a bar was chosen). A
 * replay choosing a new start bar (Select bar while it runs) still has its revealed bar, so it is remembered at that bar.
 */
export function closeReplay(session: ReplaySession, now: number): { saved: ReplaySavedSession | null; endedRunId: string } {
  if (session.phase === 'realtime' || session.clock === null) return { saved: null, endedRunId: session.runId };
  return { endedRunId: session.runId, saved: { schemaVersion: 1, sessionId: session.sessionId, scope: session.scope, activeCellId: session.activeCellId, participants: session.participants.map(({ chartType: _type, ...row }) => ({ ...row })), intervalChoice: session.intervalChoice, clock: session.clock, stepsPerSecond: session.stepsPerSecond, savedAt: now } };
}
const SAVED_KEYS = ['schemaVersion', 'sessionId', 'scope', 'activeCellId', 'participants', 'intervalChoice', 'clock', 'stepsPerSecond', 'savedAt'];
const PARTICIPANT_KEYS = ['cellId', 'instrumentId', 'symbol', 'interval', 'datasetId', 'revision'];
function text(value: unknown, label: string, limit = 4096): string { if (typeof value !== 'string' || !value || value.length > limit) throw new Error(`Saved replay ${label} is invalid.`); return value; }
/** Strict reader for the remembered session (local only; exportable and deletable). */
export function readReplaySavedSession(input: unknown): ReplaySavedSession {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Saved replay session is invalid.');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(key => !SAVED_KEYS.includes(key)) || row.schemaVersion !== 1) throw new Error('Saved replay session has unknown fields or version.');
  if (row.scope !== 'current' && row.scope !== 'all') throw new Error('Saved replay scope is invalid.');
  if (!Array.isArray(row.participants) || !row.participants.length || row.participants.length > 16) throw new Error('Saved replay charts are invalid.');
  const participants = row.participants.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !PARTICIPANT_KEYS.includes(key))) throw new Error('Saved replay chart is invalid.');
    const item = value as Record<string, unknown>;
    return { cellId: text(item.cellId, 'chart'), instrumentId: text(item.instrumentId, 'instrument'), symbol: text(item.symbol, 'symbol', 64), interval: parseInterval(text(item.interval, 'interval', 40)).id, datasetId: text(item.datasetId, 'source'), revision: text(item.revision, 'revision') };
  });
  if (new Set(participants.map(item => item.cellId)).size !== participants.length || !participants.some(item => item.cellId === row.activeCellId)) throw new Error('Saved replay charts are inconsistent.');
  if (typeof row.clock !== 'number' || !Number.isSafeInteger(row.clock) || typeof row.savedAt !== 'number' || !Number.isFinite(row.savedAt)) throw new Error('Saved replay time is invalid.');
  const speed = typeof row.stepsPerSecond === 'number' ? RETIRED_SPEEDS[row.stepsPerSecond] ?? row.stepsPerSecond : row.stepsPerSecond;
  if (!knownSpeed(speed)) throw new Error('Saved replay speed is invalid.');
  const choice = text(row.intervalChoice, 'interval choice', 40); if (choice !== 'auto') parseInterval(choice);
  return { schemaVersion: 1, sessionId: text(row.sessionId, 'session'), scope: row.scope, activeCellId: text(row.activeCellId, 'chart'), participants, intervalChoice: choice, clock: row.clock, stepsPerSecond: speed, savedAt: row.savedAt };
}
/**
 * Continue session: restores symbols, intervals, the last revealed bar (clock) and replay state,
 * paused, under a new run identity. Chart types come from the current charts (not saved). A missing or revised
 * source refuses the restore instead of replaying different data.
 * A session saved before local imports carried content revisions (legacy revision '1')
 * cannot tell whether the file changed. It continues on the loaded data, adopts the current revision so later guards
 * hold, and reports LOCAL_IMPORT_LEGACY_NOTICE once through onNotice. Every other revision mismatch still refuses.
 * A participant on a derived interval of such an import is legacy too when re-deriving the loaded import
 * under revision '1' reproduces the saved derived revision exactly (so the derived content is unchanged); the
 * import must be loaded. onAdopt receives the saved record with the adopted revisions; the host persists it
 * at once so the notice is not repeated on the next Continue.
 */
function legacyDerived(savedRevision: string, dataset: BarDataset, available: readonly BarDataset[]): boolean {
  const derivation = (dataset as Partial<DerivedIntervalDataset>).derivation;
  if (!derivation || !savedRevision.startsWith('utc-v1:') || savedRevision === dataset.provenance.revision) return false;
  const origin = available.find(row => row.provenance.datasetId === derivation.sourceDatasetId && row.provenance.revision === derivation.sourceRevision && row.instrument.id === dataset.instrument.id && row.resolution === derivation.sourceResolution);
  if (!origin || !isLegacyLocalRevision(LEGACY_LOCAL_IMPORT_REVISION, origin)) return false;
  try { return aggregateInterval({ ...origin, provenance: { ...origin.provenance, revision: LEGACY_LOCAL_IMPORT_REVISION } }, derivation.target, derivation.policy).dataset.provenance.revision === savedRevision; } catch { return false; }
}
export function continueReplaySession(saved: ReplaySavedSession, available: readonly BarDataset[], chartTypes: Readonly<Record<string, string>>, interval: string, options: { onNotice?: (message: string) => void; onAdopt?: (saved: ReplaySavedSession) => void } = {}): ReplaySession {
  const checked = readReplaySavedSession(saved);
  let legacy = false;
  const participants = checked.participants.map(row => {
    const source = available.find(dataset => dataset.provenance.datasetId === row.datasetId && dataset.instrument.id === row.instrumentId);
    if (!source) throw new Error(`The saved ${row.symbol} ${row.interval} source is no longer loaded.`);
    if (isLegacyLocalRevision(row.revision, source) || legacyDerived(row.revision, source, available)) { legacy = true; return { ...row, revision: source.provenance.revision, chartType: chartTypes[row.cellId] ?? 'candles' }; }
    if (source.provenance.revision !== row.revision) throw new Error(`The saved ${row.symbol} source was revised. Start a new replay.`);
    return { ...row, chartType: chartTypes[row.cellId] ?? 'candles' };
  });
  checkParticipants(participants);
  const restored: ReplaySession = { schemaVersion: 1, sessionId: checked.sessionId, generation: 1, runId: runIdFor(checked.sessionId, 1), phase: 'active', scope: checked.scope, activeCellId: checked.activeCellId, participants, intervalChoice: checked.intervalChoice, interval: parseInterval(interval).id, clock: checked.clock, playing: false, stepsPerSecond: checked.stepsPerSecond, remainderMilliseconds: 0 };
  const continued = nextGeneration(restored, {});
  // A saved session does not persist its old execution authority. Carry this new incarnation across later seeks.
  continued.runId += ':continued:'+crypto.randomUUID();
  // Every check above can throw; the callbacks run only once the continue is certain.
  if (legacy) { const adopted = { ...checked, participants: checked.participants.map((row, index) => ({ ...row, revision: participants[index].revision })) }; options.onNotice?.(LOCAL_IMPORT_LEGACY_NOTICE); options.onAdopt?.(adopted); }
  return continued;
}
/** The restore needs the saved symbols and intervals applied to the layout first; this lists what to apply. */
export function replayRestoreLayout(saved: ReplaySavedSession): Array<{ cellId: string; symbol: string; interval: string; datasetId: string }> {
  return readReplaySavedSession(saved).participants.map(row => ({ cellId: row.cellId, symbol: row.symbol, interval: row.interval, datasetId: row.datasetId }));
}

/**
 * The only view replay consumers (chart, indicators, scripts, data window, simulation) may receive. Copies the
 * chart bars whose periods ended by the clock, plus a forming bar aggregated from revealed step bars when the chart
 * is coarser than the replay interval. Future bars are never read past the boundary search.
 */
export function replayChartFrame(liveChart: BarDataset, clock: number, liveStepSource: BarDataset | null = null): ReplayFrame {
  const chart = completedBarsDataset(liveChart), stepSource = liveStepSource && completedBarsDataset(liveStepSource);
  if (!Number.isFinite(clock)) throw new RangeError('Replay clock must be a Unix second.');
  const spec = parseInterval(chart.resolution), bars: Bar[] = [];
  let index = 0;
  for (; index < chart.bars.length; index++) { const bar = chart.bars[index]; if (replayBarCloseTime(chart,bar,spec) > clock) break; bars.push({ ...bar }); }
  const completeBars = bars.length;
  let partial = false;
  if (stepSource && stepSource.instrument.id === chart.instrument.id) {
    // Once the next chart row has opened (its time label <= clock) it labels the forming bar and bounds it
    // by its own period; only that row's TIME is read, never its prices or volume. This follows session opens,
    // DST shifts, gaps and first-trading-day months. Past the last supplied row, the bucket falls back to the
    // grid of the last complete bar (session anchor) or the UTC policy.
    const stepSpec = parseInterval(stepSource.resolution), next = chart.bars[completeBars];
    let start: number | null = null, formingEnd = Infinity;
    if (next !== undefined) { const openedAt = next.time; if (openedAt <= clock) { start = openedAt; formingEnd = replayBarCloseTime(chart,{time:openedAt},spec); } }
    let built: Bar | null = null;
    if (next === undefined || start !== null) {
      const after = completeBars ? replayBarCloseTime(chart,bars[completeBars-1],spec) : -Infinity, anchor = completeBars ? bars[completeBars - 1].time : undefined;
      for (const bar of stepSource.bars) {
        if (bar.time < (start ?? after)) continue;
        if (bar.time >= formingEnd || replayBarCloseTime(stepSource,bar,stepSpec) > clock) break;
        if (!built) { if (start === null) { start = bucketStart(bar.time, spec, anchor); formingEnd = replayBarCloseTime(chart,{time:start},spec); if (bar.time >= formingEnd) break; } built = { time: start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }; continue; }
        built = { ...built, high: Math.max(built.high, bar.high), low: Math.min(built.low, bar.low), close: bar.close, volume: built.volume + bar.volume };
      }
    }
    if (built && formingEnd > clock) { bars.push(built); partial = true; }
  }
  return { bars, completeBars, partial, cursor: completeBars - 1, clock };
}
/** Nonportable completion observations are minted only by the actual session view constructor.
 * They describe the revealed logical snapshot, never provider finality or a caller-supplied clock. */
export interface ReplayFrameCompletion {readonly rows:number;readonly completeRows:number;readonly closedThrough:number;readonly execution:string;assertCurrent():void}
interface ReplayCompletionOwner {token:object;run:string;clock:number;session:string;source:WeakRef<Bar[]>}
interface ReplayCompletionRecord {chart:WeakRef<BarDataset>;session:WeakRef<ReplaySession>;rows:WeakRef<Bar[]>;owner:ReplayCompletionOwner;count:number;complete:number}
const replayCompletionOwners=new WeakMap<BarDataset,ReplayCompletionOwner>(),replayCompletionRows=new WeakMap<readonly Bar[],ReplayCompletionRecord>(),replayCompletionHandles=new WeakMap<object,ReplayCompletionRecord>();
function replayCompletionData(value:object,key:string):unknown{const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('The replay completion observation requires own data.');return field.value;}
function retainReplayCompletion(session:ReplaySession,chart:BarDataset,frame:ReplayFrame):void{
 const run=replayCompletionData(session,'runId'),clock=frame.clock,sessionId=replayCompletionData(session,'sessionId'),source=replayCompletionData(chart,'bars');
 if(typeof run!=='string'||!run||typeof sessionId!=='string'||!sessionId||!Array.isArray(source)||!Number.isSafeInteger(clock))return;
 let owner=replayCompletionOwners.get(chart);if(!owner||owner.run!==run||owner.clock!==clock||owner.session!==sessionId||owner.source.deref()!==source){owner={token:Object.freeze({}),run,clock,session:sessionId,source:new WeakRef(source)};replayCompletionOwners.set(chart,owner);}
 replayCompletionRows.set(frame.bars,{chart:new WeakRef(chart),session:new WeakRef(session),rows:new WeakRef(frame.bars),owner,count:frame.bars.length,complete:frame.completeBars});
}
function currentReplayCompletion(record:ReplayCompletionRecord):void{
 const chart=record.chart.deref(),session=record.session.deref(),rows=record.rows.deref();
 if(!chart||!session||!rows||replayCompletionOwners.get(chart)!==record.owner||replayCompletionData(chart,'bars')!==record.owner.source.deref()||replayCompletionData(session,'runId')!==record.owner.run||replayCompletionData(session,'sessionId')!==record.owner.session||replayCompletionData(session,'clock')!==record.owner.clock||replayCompletionData(rows,'length')!==record.count||replayCompletionRows.get(rows)!==record)throw Error('The replay completion observation retired.');
}
function replayCompletionHandle(key:object):ReplayFrameCompletion{
 const record=replayCompletionHandles.get(key);if(!record)throw Error('The replay completion observation is unavailable.');currentReplayCompletion(record);
 return Object.freeze({rows:record.count,completeRows:record.complete,closedThrough:record.owner.clock,execution:record.owner.run,assertCurrent(){const current=replayCompletionHandles.get(key);if(!current)throw Error('The replay completion observation retired.');currentReplayCompletion(current);}});
}
/** Fixed actual frame membership for pre-admission route selection; not numerical authority. */
export function replayFrameCompletionInputMatches(expectedRows:readonly Bar[],expectedChart:BarDataset):boolean{const record=replayCompletionRows.get(expectedRows);if(!record||record.chart.deref()!==expectedChart)return false;try{currentReplayCompletion(record);return true;}catch{return false;}}
/** Expected array identity only. No attach, source resolver or supplied completion callback. */
export function captureReplayFrameCompletion(expectedRows:readonly Bar[],expectedChart:BarDataset):ReplayFrameCompletion|null{
 const record=replayCompletionRows.get(expectedRows);if(!record||record.chart.deref()!==expectedChart)return null;
 try{currentReplayCompletion(record);const key=Object.freeze({});replayCompletionHandles.set(key,record);return replayCompletionHandle(key);}catch{return null;}
}
/** Data-window lookup bounded by the frame: a time past the clock has no row (never the full-history bar). */
export function replayDataWindowBar(frame: ReplayFrame, time: number): Bar | null {
  const bar = frame.bars.find(row => row.time === time); return bar ? { ...bar } : null;
}
function replayParticipantFor(session: ReplaySession, chart: BarDataset): number {
  if (session.clock === null) throw new Error('Replay has no chosen start bar.');
  const participant = session.participants.find(row => row.datasetId === chart.provenance.datasetId);
  if (!participant || participant.revision !== chart.provenance.revision) throw new Error('This chart is not part of the replay session.');
  return session.clock;
}
function projectState(session: ReplaySession, chart: BarDataset, cursor: number): ReplayState {
  return { schemaVersion: 1, datasetId: chart.provenance.datasetId, revision: chart.provenance.revision, totalBars: chart.bars.length, cursor, playing: session.playing, barsPerSecond: session.stepsPerSecond, remainderMilliseconds: 0, generation: session.generation, sessionId: session.sessionId, runId: session.runId };
}
const NO_COMPLETED_BAR = 'This chart has no completed bar at the replay point yet.', NO_COMPLETED_BAR_FORMING = 'This chart has no completed bar at the replay point yet; it shows only its forming bar.';
/**
 * Projection onto the existing per-chart ReplayState so prefix-based hosts keep their owner/run guards. A chart
 * with no completed bar at the clock is refused (never cursor -1); use replayChartView for such charts.
 */
export function replayStateForChart(session: ReplaySession, chart: BarDataset): ReplayState {
  const clock = replayParticipantFor(session, chart), frame = replayChartFrame(chart, clock);
  if (frame.cursor < 0 && chart.bars.length > 0) throw new Error(NO_COMPLETED_BAR);
  return projectState(session, chart, frame.cursor);
}
/**
 * What a replaying chart cell renders: the revealed frame (with the forming bar when `stepSource` is a finer
 * series of the same instrument, for the active chart too) plus the projected state for owner/run guards. `state`
 * is null, with a plain notice, while the chart has no completed bar yet.
 */
export function replayChartView(session: ReplaySession, chart: BarDataset, stepSource: BarDataset | null): { frame: ReplayFrame; state: ReplayState | null; notice: string | null } {
  const clock = replayParticipantFor(session, chart), frame = replayChartFrame(chart, clock, stepSource);
  try{retainReplayCompletion(session,chart,frame);}catch{/* Optional observation cannot change legacy frame construction. */}
  if (frame.cursor < 0 && chart.bars.length > 0) return { frame, state: null, notice: frame.partial ? NO_COMPLETED_BAR_FORMING : NO_COMPLETED_BAR };
  return { frame, state: projectState(session, chart, frame.cursor), notice: null };
}

export interface ReplayKeyInput { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; isComposing: boolean; focus: 'chart' | 'editor' | 'text-input' | 'dialog' | 'other' }
export type ReplayKeyAction = 'toggle-play' | 'step' | 'step-back';
/**
 * Play (Shift+Down) and Step (Shift+Right), only with chart focus and an active replay.
 * Shift+Left steps back, the mirror of Shift+Right; the record cites no key for it, so the
 * binding is our own choice. Without an active replay Shift+Left and Shift+Right keep scrolling the chart.
 */
export function replayShortcut(event: ReplayKeyInput, session: ReplaySession | null): ReplayKeyAction | null {
  if (!session || session.phase !== 'active' || event.isComposing || event.focus !== 'chart') return null;
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;
  return event.key === 'ArrowDown' ? 'toggle-play' : event.key === 'ArrowRight' ? 'step' : event.key === 'ArrowLeft' ? 'step-back' : null;
}

/** Which account a trading surface uses while this session exists. */
export function replayPaperRouting(session: ReplaySession | null, surface: 'paper-panel' | 'quote-list' | 'replay-trading'): { account: 'ordinary' | 'replay'; runId: string | null; label: string } {
  if (surface !== 'replay-trading' || !session || session.phase !== 'active') return { account: 'ordinary', runId: null, label: 'Paper Trading (current data)' };
  return { account: 'replay', runId: session.runId, label: 'Replay trading (separate replay account)' };
}
/** Existing ordinary alerts stay live; new ordinary alerts from a replaying chart are unavailable. */
export function replayAlertCreation(session: ReplaySession | null, mode: 'ordinary' | 'replay'): { allowed: true; runId: string } | { allowed: false; reason: string } {
  const replaying = !!session && session.phase === 'active';
  if (mode === 'ordinary') return replaying ? { allowed: false, reason: 'New alerts are unavailable while this chart is in Bar Replay. Existing alerts keep running on current data.' } : { allowed: true, runId: 'ordinary' };
  return replaying ? { allowed: true, runId: session!.runId } : { allowed: false, reason: 'Replay alerts need an active replay.' };
}
/** Existing ordinary alerts are evaluated on the current (live) source only, never on replay frames. */
export function replayAlertEvaluationBasis(alertMode: 'ordinary' | 'replay', alertRunId: string, session: ReplaySession | null): 'live' | 'replay' | 'skip' {
  if (alertMode === 'ordinary') return 'live';
  return session && session.phase === 'active' && session.runId === alertRunId ? 'replay' : 'skip';
}
