import React, { useEffect, useRef, useState } from 'react';
import {registerSnapshotSceneSource,snapshotBindingAtRequest,isSnapshotOwnerCurrent,type SnapshotBinding,type SnapshotPublishedScene} from '../chart/snapshot-scene';
import { CHART_EVENT_STYLE, chartEventMarkers, createChartEventsLoader, markerOffset, type ChartEventMarker, type ChartEventsBridge, type ChartEventSettings, type CorporateActionEvent } from '../domain/chart-events';

/**
 * Split and dividend markers along the bottom of the active chart's price pane (model, sources and citations in
 * src/domain/chart-events.ts). A marker sits over the bar of its ex-date; hovering it shows the type, ratio or amount and the
 * dates. Like the paper execution marks they are not drawings, and only the small badges take the pointer.
 *
 * The layer always says what it is doing. While a source is wanted it renders its host element with
 * `data-lv-chart-events-state` = loading | ok | empty | error:<CODE>, and a failed load is reported through `onDiagnostic`
 * (the App status line) instead of being dropped. A failure is retried after RETRY_MS (at most MAX_RETRIES times), and again
 * when the chart's source changes (`sourceKey`).
 */
export interface ChartEventProjection { left: number; top: number; width: number; height: number }
export interface ChartEventMarkersProps {
  /** Publishes only already loaded and actually displayed badges, without another request. */
  snapshot?:SnapshotBinding;
  /** The Alpaca US stock symbol of the active chart, or null when the chart has no corporate-action source. */
  symbol: string | null;
  bars: readonly { time: number }[];
  settings: ChartEventSettings;
  /** The keyless synthetic stub run: every marker says SYNTHETIC. */
  synthetic: boolean;
  projection: () => ChartEventProjection | null;
  timeToX: (seconds: number) => number | null;
  /** Loads one symbol's events; the default goes through window.lv (main process, owner key). */
  load?: (symbol: string) => ReturnType<ReturnType<typeof createChartEventsLoader>>;
  /** The chart's dataset; a new one retries a failed load. */
  sourceKey?: string;
  /** A plain sentence for the status line when splits and dividends could not be loaded. */
  onDiagnostic?: (message: string) => void;
}
export type ChartEventsState = 'loading' | 'ok' | 'empty' | `error:${string}`;
export const CHART_EVENTS_RETRY_MS = 15000, CHART_EVENTS_MAX_RETRIES = 3;
/** The marker overlay stacks above the chart's bottom controls (navigation buttons and Scroll to latest, z-index 8),
 * so a badge stays hit-testable and its tooltip draws over them. The overlay itself takes no pointer events; only the 16 px badges do. */
export const CHART_EVENTS_Z_INDEX = 9;
/** Event badges hide while bars are drawn closer than this many pixels apart and come
 * back when the chart is zoomed in again. Threshold (the reference value is not published). */
export const EVENTS_MIN_BAR_SPACING = 2;
/** Pixels between the last two loaded bars on the current viewport, or null when it cannot be read. */
export function eventBarSpacing(timeToX: (seconds: number) => number | null, bars: readonly { time: number }[]): number | null {
  if (bars.length < 2) return null;
  try { const a = timeToX(bars[bars.length - 2].time), b = timeToX(bars[bars.length - 1].time); return a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) ? null : Math.abs(b - a); } catch { return null; }
}
/** True when the badges should hide at the current zoom (unknown or degenerate zero spacing never hides them). */
export const eventsCompressed = (spacing: number | null | undefined): boolean => typeof spacing === 'number' && spacing > 0 && spacing < EVENTS_MIN_BAR_SPACING;

let sharedLoader: ReturnType<typeof createChartEventsLoader> | null = null;
const defaultLoad = (symbol: string) => (sharedLoader ??= createChartEventsLoader(() => (typeof window !== 'undefined' ? (window as unknown as { lv?: Partial<ChartEventsBridge> }).lv : undefined)))(symbol);
/** The same memoized load, for the VWAP Dividends and Splits anchors (one request per symbol for both). */
export const loadChartEvents = defaultLoad;

type Loaded = { symbol: string; ok: true; events: CorporateActionEvent[]; synthetic: boolean } | { symbol: string; ok: false; code: string; message: string };
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,47}$/;
const safeCode = (value: unknown) => typeof value === 'string' && ERROR_CODE.test(value) ? value : 'FAILED';
const safeMessage = (value: unknown) => typeof value === 'string' ? value.replace(/[^\x20-\x7e]/g, '').slice(0, 200) : '';
/** The status-line sentence for a failed load. */
export function chartEventsDiagnostic(symbol: string, code: string, message: string): string {
  const said = message.trim().replace(/\.$/, '');
  return `Splits and dividends for ${symbol} did not load${said ? ': ' + said : ''} (${code}).`;
}

// Geometry contains only copied numbers, never a retained native conversion closure. Current publication still rechecks every coordinate.
function sameGeometryOwner(a:SnapshotBinding|undefined,b:SnapshotBinding|undefined):boolean{if(!a||!b)return a===b;return a.owner===b.owner&&a.chart===b.chart&&isSnapshotOwnerCurrent(a)&&isSnapshotOwnerCurrent(b);}
interface Geometry { binding?:SnapshotBinding;projection: ChartEventProjection; xs: Map<number, number | null>; spacing: number | null }
function readGeometry(props: ChartEventMarkersProps, markers: readonly ChartEventMarker[]): Geometry | null {
  if(props.snapshot&&!isSnapshotOwnerCurrent(props.snapshot))return null;
  const projection = props.projection();
  if (!projection) return null;
  const xs = new Map<number, number | null>();
  for (const marker of markers) if (!xs.has(marker.barTime)) { let x: number | null = null; try { x = props.timeToX(marker.barTime); } catch { x = null; } xs.set(marker.barTime, x === null || !Number.isFinite(x) ? null : x); }
  return { binding:props.snapshot,projection: { left: projection.left, top: projection.top, width: projection.width, height: projection.height }, xs, spacing: eventBarSpacing(props.timeToX, props.bars) };
}
function sameGeometry(a: Geometry | null, b: Geometry | null): boolean {
  if (!a || !b) return a === b;
  if(!sameGeometryOwner(a.binding,b.binding))return false;
  const p = a.projection, q = b.projection;
  if (p.left !== q.left || p.top !== q.top || p.width !== q.width || p.height !== q.height || a.xs.size !== b.xs.size || eventsCompressed(a.spacing) !== eventsCompressed(b.spacing)) return false;
  for (const [time, x] of a.xs) if (b.xs.get(time) !== x) return false;
  return true;
}

export function ChartEventMarkers(props: ChartEventMarkersProps) {
  const { symbol, settings } = props, load = props.load ?? defaultLoad;
  const wanted = !!symbol && (settings.dividends || settings.splits);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const failedNow = !!loaded && !loaded.ok && loaded.symbol === symbol;
  // A failed load is tried again (with a fresh retry budget) when the chart's source changes; a loaded one is kept.
  const failedRef = useRef(failedNow); failedRef.current = failedNow;
  useEffect(() => { if (failedRef.current) { setAttempt(0); setNonce(value => value + 1); } }, [props.sourceKey]);
  useEffect(() => {
    if (!wanted || !symbol) return;
    let active = true;
    const failed = (code: unknown, message: unknown) => { if (active) setLoaded({ symbol, ok: false, code: safeCode(code), message: safeMessage(message) }); };
    let pending: ReturnType<typeof load>;
    try { pending = load(symbol); } catch (error) { failed('FAILED', error instanceof Error ? error.message : String(error)); return () => { active = false; }; }
    void Promise.resolve(pending).then(result => {
      if (!active) return;
      if (result && result.ok && Array.isArray(result.value?.events)) setLoaded({ symbol, ok: true, events: result.value.events, synthetic: result.value.synthetic === true });
      else failed(result && !result.ok ? result.error?.code : 'ALPACA_SCHEMA_INVALID', result && !result.ok ? result.error?.message : 'The splits and dividends answer had an unexpected shape.');
    }, error => failed('FAILED', error instanceof Error ? error.message : String(error)));
    return () => { active = false; };
  }, [wanted, symbol, load, attempt, nonce]);
  // A failure is retried a few times on a timer; a new symbol starts over.
  useEffect(() => { setAttempt(0); }, [symbol]);
  useEffect(() => {
    if (!wanted || !failedNow || attempt >= CHART_EVENTS_MAX_RETRIES) return;
    const timer = setTimeout(() => setAttempt(value => value + 1), CHART_EVENTS_RETRY_MS);
    return () => clearTimeout(timer);
  }, [wanted, failedNow, attempt, loaded]);
  // The status line hears about each distinct failure once (not every retry of the same one).
  const reported = useRef('');
  const failureKey = wanted && failedNow && loaded && !loaded.ok ? loaded.symbol + '|' + loaded.code + '|' + loaded.message : '';
  const diagnosticRef = useRef(props.onDiagnostic); diagnosticRef.current = props.onDiagnostic;
  useEffect(() => {
    if (!failureKey) { reported.current = ''; return; }
    if (reported.current === failureKey || !loaded || loaded.ok) return;
    reported.current = failureKey;
    try { diagnosticRef.current?.(chartEventsDiagnostic(loaded.symbol, loaded.code, loaded.message)); } catch { /* The status line is advisory. */ }
  }, [failureKey]);
  const current = wanted && loaded && loaded.symbol === symbol ? loaded : null;
  const events = current && current.ok ? current.events : [];
  const synthetic = props.synthetic || !!(current && current.ok && current.synthetic);
  const markers = events.length ? chartEventMarkers(events, props.bars, settings, synthetic) : [];
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const latest = useRef({ props, markers }); latest.current = { props, markers };
  const key = markers.length ? `${markers.length}:${markers[0].key}:${markers.at(-1)!.key}` : '';
  // Follows pan, zoom and resize: the geometry is read every frame while markers exist; state changes only when it moves.
  useEffect(() => {
    if (!key) { setGeometry(null); return; }
    let frame = 0, previous: Geometry | null = null;
    const step = () => { let next: Geometry | null = null; try { next = readGeometry(latest.current.props, latest.current.markers); } catch { next = null; } if (!sameGeometry(previous, next)) { previous = next; setGeometry(next); } frame = requestAnimationFrame(step); };
    step();
    return () => cancelAnimationFrame(frame);
  }, [key]);
  const state: ChartEventsState = !current ? 'loading' : !current.ok ? `error:${current.code}` : markers.length ? 'ok' : 'empty';
  const size = CHART_EVENT_STYLE.size;
  const projection = markers.length && geometry && sameGeometryOwner(geometry.binding,props.snapshot) ? geometry.projection : null;
  const compressed = !!projection && !!geometry && eventsCompressed(geometry.spacing);
  const shown = projection && geometry && !compressed ? markers.flatMap((marker, index) => {
    const clientX = geometry.xs.get(marker.barTime) ?? null;
    if (clientX === null) return [];
    const x = clientX - projection.left + markerOffset(markers, index);
    return x < -size || x > projection.width + size ? [] : [{ marker, x }];
  }) : [];
  const note = current && !current.ok ? chartEventsDiagnostic(current.symbol, current.code, current.message)
    : state === 'empty' ? `No ${settings.dividends && settings.splits ? 'splits or dividends' : settings.dividends ? 'dividends' : 'splits'} on the loaded bars of ${symbol}.`
    : state === 'loading' ? `Loading splits and dividends for ${symbol}.`
    : compressed ? `The splits and dividends of ${symbol} are hidden while the bars are this compressed. Zoom in to see them.`
    : shown.length ? undefined : `The splits and dividends of ${symbol} are outside the visible range.`;
  const top = projection ? projection.height - size - CHART_EVENT_STYLE.bottomGap : 0;
  const hovered = shown.find(row => row.marker.key === hover) ?? null;
  // Appends hooks after the established marker hooks. A viewport move retires the old geometry immediately at export.
  // Lazy like SnapshotLegendPublisher. App rebinds this layer only after the hover settles, so the
  // scene is built when a snapshot asks, from this render's markers and geometry, after proving that geometry against the live chart.
  const snapshotState=useRef({props,markers,geometry,projection,shown,top});snapshotState.current={props,markers,geometry,projection,shown,top};
  const snapshotSource=useRef<ReturnType<typeof registerSnapshotSceneSource>|null>(null);
  useEffect(()=>{
    const binding=props.snapshot;if(!binding)return;
    const registered=registerSnapshotSceneSource(binding,'events',{},{binding:()=>snapshotBindingAtRequest(snapshotState.current.props.snapshot??binding),connected:()=>true,read:():SnapshotPublishedScene=>{
      const s=snapshotState.current;if(s.markers.length&&!sameGeometry(s.geometry,readGeometry(s.props,s.markers)))throw Error('The chart events are updating. Try the snapshot again after it finishes.');
      return{texts:[],boxes:[],badges:s.projection?s.shown.map(({marker,x})=>({left:s.projection!.left+x-size/2,top:s.projection!.top+s.top,size,letter:marker.letter,color:marker.color})):[]};}});
    snapshotSource.current=registered;
    return()=>{if(snapshotSource.current===registered)snapshotSource.current=null;registered.dispose();};
  },[props.snapshot?.owner,props.snapshot?.chart]);
  useEffect(()=>{snapshotSource.current?.invalidate();},[props.snapshot,geometry,markers,wanted,symbol]);
  if (!wanted || !symbol) return null;
  return (
    <div className="lv-chart-events" {...(shown.length ? { role: 'group', 'aria-label': synthetic ? 'SYNTHETIC splits and dividends' : 'Splits and dividends' } : { 'aria-hidden': true })}
      data-lv-chart-events={shown.length} data-lv-chart-events-state={state} data-lv-chart-events-markers={markers.length} data-lv-chart-events-total={events.length} data-lv-chart-events-symbol={symbol} data-lv-chart-events-compressed={compressed ? 'true' : undefined}
      title={note} style={projection ? { position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: CHART_EVENTS_Z_INDEX, overflow: 'hidden' } : { position: 'fixed', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {shown.map(({ marker, x }) => (
        <span key={marker.key} role="img" aria-label={marker.label} data-lv-chart-event={marker.type} data-bar-time={marker.barTime}
          onPointerEnter={() => setHover(marker.key)} onPointerLeave={() => setHover(current => current === marker.key ? null : current)}
          style={{ position: 'absolute', left: x - size / 2, top, width: size, height: size, boxSizing: 'border-box', borderRadius: '50%', border: `1px solid ${marker.color}`, background: 'var(--lv-legend-bg)', color: marker.color, font: `600 10px/${size - 2}px system-ui,sans-serif`, textAlign: 'center', pointerEvents: 'auto', cursor: 'default', userSelect: 'none' }}>
          {marker.letter}
        </span>
      ))}
      {hovered && projection && (
        <div role="tooltip" className="lv-chart-event-tooltip" data-lv-chart-event-tooltip={hovered.marker.type}
          style={{ position: 'absolute', left: Math.max(4, Math.min(hovered.x - 90, projection.width - 184)), bottom: size + CHART_EVENT_STYLE.bottomGap + 6, width: 180, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, background: 'var(--lv-bg-tooltip)', border: `1px solid ${hovered.marker.color}`, color: 'var(--lv-text-primary)', font: '12px/17px system-ui,sans-serif', pointerEvents: 'none' }}>
          {hovered.marker.lines.map((line, index) => line ? <div key={index} style={index === 0 || hovered.marker.lines[index - 1] === '' ? { fontWeight: 600, color: hovered.marker.color } : undefined}>{line}</div> : <hr key={index} style={{ border: 0, borderTop: '1px solid var(--lv-border)', margin: '4px 0' }} />)}
        </div>
      )}
    </div>
  );
}
