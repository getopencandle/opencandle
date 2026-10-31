import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { StrategyConfig, StrategyResult } from '../domain/strategy';
import type { Bar } from '../domain/types';
import type { StrategyExecution } from '../ui/StrategyDialog';
import { strategyReportJobInput } from '../strategy-report/use-report';
import { runReportJob } from '../strategy-report/backtest';
import { engineMarksOffThread } from '../strategy-report/engine-thread';
import { strategyFeedbackVersion, subscribeStrategyFeedback } from '../strategy-report/feedback';
import { STRATEGY_MARK_ARROW_PX, STRATEGY_MARK_SETTING_LABELS, strategyMarkPlacement, strategyMarkStore, strategyTradeMarks, type StrategyMarkStore, type StrategyTradeLine, type StrategyTradeMark } from './strategy-marks';

/**
 * Strategy trades over the active chart's price pane: an arrow per fill (a buy below its bar, a sell above
 * it) with the order name and signed quantity, and optional lines joining each closed trade's entry and exit. They come
 * from the same engine run as the Strategy report (the applied properties), whether or not the report is open. Like the
 * paper execution marks they are not drawings and take no pointer input.
 */
export interface StrategyMarkProjection { left: number; top: number; width: number; height: number; priceToY: (price: number) => number }
export interface StrategyTradeMarksProps {
  execution: StrategyExecution | null;
  config: StrategyConfig;
  projection: () => StrategyMarkProjection | null;
  timeToX: (seconds: number) => number | null;
  store?: StrategyMarkStore;
}

/** The engine result behind the marks and the bars it ran on (synchronous, on the calling thread): the report's job input; null while the Bar Magnifier waits or when the run fails. The view uses strategyChartResultAsync. */
export function strategyChartResult(execution: StrategyExecution | null, config: StrategyConfig): { result: StrategyResult; bars: readonly Bar[] } | null {
  if (!execution || !execution.result.orders.length && !execution.forming?.orders.length) return null;
  try {
    const prepared = strategyReportJobInput(execution, config);
    if (prepared.waiting) return null;
    const result = runReportJob(prepared.input);
    return result.ok ? { result, bars: prepared.input.execution.bars } : null;
  } catch { return null; }
}

/**
 * L5b: the same run off the interface thread (engine-thread.ts worker). One run per (execution, properties, settled
 * feedback version); a newer request supersedes (terminates) an older one still running. Resolves null when there is
 * nothing to draw, the Bar Magnifier waits or the run fails.
 */
type ChartRun = { result: Pick<StrategyResult, 'fills' | 'orders' | 'trades'>; bars: readonly Bar[] } | null;
let lastRun: { execution: StrategyExecution | null; config: StrategyConfig; version: number; value: Promise<ChartRun> } | null = null;
export function strategyChartResultAsync(execution: StrategyExecution | null, config: StrategyConfig, version = strategyFeedbackVersion()): Promise<ChartRun> {
  if (lastRun && lastRun.execution === execution && lastRun.config === config && lastRun.version === version) return lastRun.value;
  const value = (async (): Promise<ChartRun> => {
    if (!execution || !execution.result.orders.length && !execution.forming?.orders.length) return null;
    let prepared: ReturnType<typeof strategyReportJobInput>;
    try { prepared = strategyReportJobInput(execution, config); } catch { return null; }
    if (prepared.waiting) return null;
    const bars = prepared.input.execution.bars;
    try { const result = await engineMarksOffThread(prepared.input); return result ? { result, bars } : null; }
    catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') throw cause; return null; }
  })();
  lastRun = { execution, config, version, value };
  return value;
}

const NO_BARS: readonly Bar[] = [];
const BUY = '#2962ff', SELL = '#e91e63', WIN = '#26a69a', LOSS = '#ef5350';
interface Geometry { projection: StrategyMarkProjection; xs: Map<number, number | null> }
function readGeometry(props: StrategyTradeMarksProps, times: readonly number[]): Geometry | null {
  const projection = props.projection(); if (!projection) return null;
  const xs = new Map<number, number | null>();
  for (const time of times) if (!xs.has(time)) { let x: number | null = null; try { x = props.timeToX(time); } catch { x = null; } xs.set(time, x === null || !Number.isFinite(x) ? null : x); }
  return { projection, xs };
}
function sameGeometry(a: Geometry | null, b: Geometry | null, probe: number): boolean {
  if (!a || !b) return a === b;
  const p = a.projection, q = b.projection;
  if (p.left !== q.left || p.top !== q.top || p.width !== q.width || p.height !== q.height || p.priceToY(probe) !== q.priceToY(probe) || p.priceToY(probe * 1.01) !== q.priceToY(probe * 1.01) || a.xs.size !== b.xs.size) return false;
  for (const [time, x] of a.xs) if (b.xs.get(time) !== x) return false;
  return true;
}

export function StrategyTradeMarks(props: StrategyTradeMarksProps) {
  const store = props.store ?? strategyMarkStore;
  const settings = useSyncExternalStore(store.subscribe, store.settings, store.settings), selected = useSyncExternalStore(store.subscribe, store.selected, store.selected);
  // A script that reads the engine settles first; the marks follow when it does.
  const feedback = useSyncExternalStore(subscribeStrategyFeedback, strategyFeedbackVersion, strategyFeedbackVersion);
  const [current, setCurrent] = useState<{ execution: StrategyExecution | null; run: ChartRun }>({ execution: null, run: null });
  useEffect(() => {
    let live = true;
    strategyChartResultAsync(props.execution, props.config, feedback).then(run => { if (live) setCurrent({ execution: props.execution, run }); }, () => { /* superseded by a newer run */ });
    return () => { live = false; };
  }, [props.execution, props.config, feedback]);
  // Marks of another execution are never drawn while this one's run is still on its way.
  const run = current.execution === props.execution ? current.run : null;
  const result = run?.result ?? null, runBars = run?.bars ?? NO_BARS;
  const { marks, lines } = useMemo(() => strategyTradeMarks(result, runBars, settings), [result, runBars, settings]);
  // The selected trade (from the List of trades) always shows its line.
  const shownLines = useMemo(() => {
    if (!selected || !result || !settings.trades) return lines;
    if (lines.some(line => line.entryBar === selected.entryBar && line.exitBar === selected.exitBar)) return lines;
    const extra = strategyTradeMarks(result, runBars, { ...settings, lines: true }).lines.filter(line => line.entryBar === selected.entryBar && line.exitBar === selected.exitBar);
    return [...lines, ...extra];
  }, [lines, selected, result, settings, runBars]);
  const times = useMemo(() => [...new Set([...marks.map(mark => mark.barTime), ...shownLines.flatMap(line => [line.fromTime, line.toTime])])], [marks, shownLines]);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const latest = useRef({ props, times }); latest.current = { props, times };
  const probe = marks[0]?.price ?? 1, key = times.length ? `${times.length}:${times[0]}:${times.at(-1)}:${marks.length}:${shownLines.length}` : '';
  // Follows pan, zoom, scale and resize: re-read the geometry each frame while marks exist; state changes only when it moves.
  useEffect(() => {
    if (!key) { setGeometry(null); return; }
    let frame = 0, previous: Geometry | null = null;
    const step = () => { let next: Geometry | null = null; try { next = readGeometry(latest.current.props, latest.current.times); } catch { next = null; } if (!sameGeometry(previous, next, probe)) { previous = next; setGeometry(next); } frame = requestAnimationFrame(step); };
    step();
    return () => cancelAnimationFrame(frame);
  }, [key, probe]);
  if (!geometry || !marks.length && !shownLines.length) return null;
  const { projection } = geometry, half = STRATEGY_MARK_ARROW_PX * 0.6;
  const xOf = (time: number) => { const x = geometry.xs.get(time); return x === null || x === undefined ? null : x - projection.left; };
  const inside = (x: number, y: number) => Number.isFinite(y) && x >= -12 && x <= projection.width + 12 && y >= -60 && y <= projection.height + 60;
  const isSelected = (mark: StrategyTradeMark) => !!selected && (mark.barIndex === selected.entryBar || mark.barIndex === selected.exitBar);
  const shown = marks.flatMap(mark => { const x = xOf(mark.barTime); if (x === null) return []; const y = projection.priceToY(mark.anchor) - projection.top; if (!inside(x, y)) return []; return [{ mark, place: strategyMarkPlacement(mark.side, x, y, mark.stack), color: mark.side === 'buy' ? BUY : SELL }]; });
  const drawn = shownLines.flatMap(line => { const x1 = xOf(line.fromTime), x2 = xOf(line.toTime); if (x1 === null || x2 === null) return []; const y1 = projection.priceToY(line.fromPrice) - projection.top, y2 = projection.priceToY(line.toPrice) - projection.top; if (!Number.isFinite(y1) || !Number.isFinite(y2) || Math.max(x1, x2) < -12 || Math.min(x1, x2) > projection.width + 12) return []; return [{ line, x1, x2, y1, y2 }]; });
  if (!shown.length && !drawn.length) return null;
  const lineSelected = (line: StrategyTradeLine) => !!selected && line.entryBar === selected.entryBar && line.exitBar === selected.exitBar;
  return (
    <div className="lv-strategy-marks" aria-label="Strategy trades" role="group" style={{ position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: 3, overflow: 'hidden' }}>
      <svg width={projection.width} height={projection.height} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden="true">
        {drawn.map(({ line, x1, x2, y1, y2 }) => <line key={line.id} data-strategy-trade-line={line.profit ? 'profit' : 'loss'} x1={x1} y1={y1} x2={x2} y2={y2} stroke={line.profit ? WIN : LOSS} strokeWidth={lineSelected(line) ? 2.5 : 1.5} strokeDasharray="4 3"/>)}
        {shown.map(({ mark, place, color }) => <polygon key={mark.id + ':' + mark.stack} data-strategy-mark={mark.side} data-bar-time={mark.barTime} data-price={mark.price} points={`${place.x},${place.tipY} ${place.x - half},${place.baseY} ${place.x + half},${place.baseY}`} fill={color} stroke={isSelected(mark) ? '#ffffff' : 'none'} strokeWidth={isSelected(mark) ? 1.5 : 0}/>)}
      </svg>
      <ul style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', margin: 0, padding: 0 }}>{shown.map(({ mark }) => <li key={mark.id + ':' + mark.stack}>{mark.title}</li>)}</ul>
      {shown.filter(({ mark }) => mark.label).map(({ mark, place, color }) => <span key={mark.id + ':' + mark.stack} className="lv-strategy-mark-label" data-strategy-mark-label={mark.side} aria-hidden="true" style={{ position: 'absolute', left: place.x, top: place.labelY, transform: 'translateX(-50%)', font: '11px/14px system-ui,sans-serif', color, whiteSpace: 'nowrap', textShadow: '0 0 2px #000' }}>{mark.label}</span>)}
    </div>
  );
}

/** The "Trades on chart" settings block (per viewer, applied at once). */
export function StrategyMarkSettingsPanel({ store = strategyMarkStore }: { store?: StrategyMarkStore }) {
  const settings = useSyncExternalStore(store.subscribe, store.settings, store.settings);
  return <fieldset className="lv-strategy-mark-settings"><legend>Trades on chart</legend>
    {STRATEGY_MARK_SETTING_LABELS.map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} disabled={key !== 'trades' && !settings.trades} onChange={event => store.setSettings({ [key]: event.target.checked })}/> {label}</label>)}
    <small className="help" style={{ display: 'block' }}>Arrows mark each virtual fill of the strategy on the chart: a buy below its bar, a sell above it, with the order name and the signed quantity. Trade lines join each closed trade's entry and exit. These apply at once and are kept on this computer.</small>
  </fieldset>;
}
