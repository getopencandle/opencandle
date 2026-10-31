import React, { useEffect, useRef, useState } from 'react';
import type { PaperAccount } from '../domain/paper';
import type { Instrument } from '../domain/types';
import type { AlertAudioContextLike } from './alert-sound';
import { isAlpacaStubInstrument } from '../domain/alpaca-live';
import { observePaperFills, paperExecutionMarks, paperExecutionPlacement, PAPER_EXECUTION_ARROW_PX, type PaperExecutionMark, type PaperFillObservation } from '../chart/paper-executions';

/**
 * Buy and sell markers for virtual fills over the active chart's price pane, at the fill's bar and price,
 * with an optional label (side, quantity, price) and an optional sound on each new fill. They follow Chart settings > Trading:
 * Executions, Execution labels and the execution sound (on/off, volume). Like the order lines they are not drawings: hide, lock,
 * erase and the object tree never see them, and they take no pointer input (the chart under them stays usable).
 */
export interface PaperExecutionProjection {
  left: number; top: number; width: number; height: number;
  priceToY: (price: number) => number;
}
export interface PaperExecutionSettings { marks: boolean; labels: boolean; sound: { enabled: boolean; volume: number; melody: string } }
export interface PaperExecutionMarksProps {
  account: PaperAccount;
  instrument: Instrument;
  bars: readonly { time: number }[];
  settings: PaperExecutionSettings;
  /** Reads the active chart's price pane right now; null while the chart is unavailable. */
  projection: () => PaperExecutionProjection | null;
  /** Client x of a bar open time (Unix seconds); null when it is off the time scale. */
  timeToX: (seconds: number) => number | null;
  /** Plays the execution sound; the default is the shared LV player. */
  playSound?: (volume: number, melody: string) => Promise<void> | void;
}

const BUY = '#2f7fd1', SELL = '#c9483f';
interface Geometry { projection: PaperExecutionProjection; xs: Map<number, number | null> }
function readGeometry(props: PaperExecutionMarksProps, marks: readonly PaperExecutionMark[]): Geometry | null {
  const projection = props.projection();
  if (!projection) return null;
  const xs = new Map<number, number | null>();
  for (const mark of marks) if (!xs.has(mark.barTime)) { let x: number | null = null; try { x = props.timeToX(mark.barTime); } catch { x = null; } xs.set(mark.barTime, x === null || !Number.isFinite(x) ? null : x); }
  return { projection, xs };
}
function sameGeometry(a: Geometry | null, b: Geometry | null, probe: number): boolean {
  if (!a || !b) return a === b;
  const p = a.projection, q = b.projection;
  if (p.left !== q.left || p.top !== q.top || p.width !== q.width || p.height !== q.height || p.priceToY(probe) !== q.priceToY(probe) || p.priceToY(probe * 1.01) !== q.priceToY(probe * 1.01) || a.xs.size !== b.xs.size) return false;
  for (const [time, x] of a.xs) if (b.xs.get(time) !== x) return false;
  return true;
}

/** LV's own "Alarm Clock" execution tone: two quick pairs of bright beeps, scaled by the chosen volume (0 to 1). */
export const EXECUTION_TONES: readonly { frequency: number; start: number; duration: number }[] = Object.freeze([
  { frequency: 1568, start: 0, duration: 0.07 }, { frequency: 1568, start: 0.1, duration: 0.07 },
  { frequency: 1568, start: 0.32, duration: 0.07 }, { frequency: 1568, start: 0.42, duration: 0.07 },
]);
const PEAK_GAIN = 0.3;
export function createExecutionSoundPlayer(factory: (() => AlertAudioContextLike) | null = defaultAudioFactory()) {
  let context: AlertAudioContextLike | null = null;
  return async (volume: number, _melody: string) => {
    const level = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (!factory || level === 0) return;
    try { context ??= factory(); } catch { return; }
    if (context.state === 'suspended' && context.resume) { try { await context.resume(); } catch { /* Audio not permitted: silent. */ } }
    if (context.state !== 'running') return;
    const origin = context.currentTime + 0.01;
    for (const item of EXECUTION_TONES) {
      const oscillator = context.createOscillator(), gain = context.createGain(), start = origin + item.start, end = start + item.duration;
      oscillator.type = 'square'; oscillator.frequency.setValueAtTime(item.frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(PEAK_GAIN * level, start + 0.01); gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(end + 0.02);
    }
  };
}
function defaultAudioFactory(): (() => AlertAudioContextLike) | null {
  const scope = globalThis as unknown as { AudioContext?: new () => AlertAudioContextLike; webkitAudioContext?: new () => AlertAudioContextLike };
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext;
  return Constructor ? () => new Constructor() : null;
}
let sharedPlayer: ReturnType<typeof createExecutionSoundPlayer> | null = null;
const sharedExecutionSound = (volume: number, melody: string) => (sharedPlayer ??= createExecutionSoundPlayer())(volume, melody);

/** The sound side on its own: one play per batch of new fills of this account run (never for fills already present). */
export function usePaperExecutionSound(account: PaperAccount, settings: PaperExecutionSettings['sound'], play: (volume: number, melody: string) => Promise<void> | void = sharedExecutionSound) {
  const seen = useRef<PaperFillObservation | null>(null), latest = useRef({ settings, play }); latest.current = { settings, play };
  useEffect(() => {
    const { observation, fresh } = observePaperFills(seen.current, `${account.id}|${account.runId}`, account.fills);
    seen.current = observation;
    const current = latest.current;
    if (fresh.length && current.settings.enabled) { try { void Promise.resolve(current.play(current.settings.volume, current.settings.melody)).catch(() => { /* A blocked audio output stays silent. */ }); } catch { /* Same. */ } }
  }, [account.id, account.runId, account.fills]);
}

/** The marks for one chart; in a keyless Alpaca stub run a US stock execution label says SYNTHETIC. */
export function paperExecutionMarksFor(fills: Parameters<typeof paperExecutionMarks>[0], instrument: { id: string; exchange: string; tickSize: number }, bars: readonly { time: number }[]): PaperExecutionMark[] {
  const marks = paperExecutionMarks(fills, instrument.id, bars, instrument.tickSize);
  return isAlpacaStubInstrument(instrument) ? marks.map(mark => ({ ...mark, label: mark.label + ' SYNTHETIC' })) : marks;
}

export function PaperExecutionMarks(props: PaperExecutionMarksProps) {
  const { account, instrument, settings } = props;
  usePaperExecutionSound(account, settings.sound, props.playSound);
  const marks = settings.marks ? paperExecutionMarksFor(account.fills, instrument, props.bars) : [];
  const [geometry, setGeometry] = useState<Geometry | null>(() => marks.length ? readGeometry(props, marks) : null);
  const latest = useRef({ props, marks }); latest.current = { props, marks };
  const probe = marks[0]?.price ?? 1, key = marks.length ? `${marks.length}:${marks[0].id}:${marks.at(-1)!.id}:${marks.at(-1)!.barTime}` : '';
  // Follows pan, zoom, scale and resize: re-read the geometry each frame while marks exist; state changes only when it moves.
  useEffect(() => {
    if (!key) { setGeometry(null); return; }
    let frame = 0, previous: Geometry | null = null;
    const step = () => { let next: Geometry | null = null; try { next = readGeometry(latest.current.props, latest.current.marks); } catch { next = null; } if (!sameGeometry(previous, next, probe)) { previous = next; setGeometry(next); } frame = requestAnimationFrame(step); };
    step();
    return () => cancelAnimationFrame(frame);
  }, [key, probe]);
  if (!marks.length || !geometry) return null;
  const { projection } = geometry, half = PAPER_EXECUTION_ARROW_PX * 0.6;
  const shown = marks.flatMap(mark => {
    const clientX = geometry.xs.get(mark.barTime) ?? null;
    if (clientX === null) return [];
    const x = clientX - projection.left, y = projection.priceToY(mark.price) - projection.top;
    if (!Number.isFinite(y) || x < -12 || x > projection.width + 12 || y < -40 || y > projection.height + 40) return [];
    return [{ mark, place: paperExecutionPlacement(mark.side, x, y), color: mark.side === 'buy' ? BUY : SELL }];
  });
  if (!shown.length) return null;
  return (
    <div className="lv-paper-executions" aria-label="Virtual executions" role="group" style={{ position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: 3, overflow: 'hidden' }}>
      <svg width={projection.width} height={projection.height} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden="true">
        {shown.map(({ mark, place, color }) => <polygon key={mark.id} data-execution={mark.side} data-bar-time={mark.barTime} data-price={mark.price} points={`${place.x},${place.tipY} ${place.x - half},${place.baseY} ${place.x + half},${place.baseY}`} fill={color}/>)}
      </svg>
      <ul style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', margin: 0, padding: 0 }}>{shown.map(({ mark }) => <li key={mark.id}>{mark.label}</li>)}</ul>
      {settings.labels && shown.map(({ mark, place, color }) => <span key={mark.id} className="lv-paper-execution-label" data-execution-label={mark.side} aria-hidden="true" style={{ position: 'absolute', left: place.x, top: place.direction === 'up' ? place.baseY + 2 : place.baseY - 18, transform: 'translateX(-50%)', font: '11px/16px system-ui,sans-serif', color: '#fff', background: color, borderRadius: 2, padding: '0 4px', whiteSpace: 'nowrap' }}>{mark.label}</span>)}
    </div>
  );
}
