// Bar Replay panel. Presentational only: the host owns the session, the timer, the shortcut
// dispatch and the chart. Wording and layout are OpenCandle's own. The toolbar button (text "Replay",
// tooltip "Bar replay") stays in App.
// A floating control bar over the bottom of the chart with icon buttons and tooltips:
// Select bar and the start-point menu, Step back, Play/Pause
// (Shift+Down), Forward (Shift+Right), the speed menu (LV catalog), the replay interval (a menu like the speed menu), the replay
// account badge, Jump to real time and Close. The menus have no
// cited shortcut, so none is bound.
// Speeds 0.1x to 10x; Step back announces Shift+Left (replayShortcut); the
// interval button carries the "Update interval" tooltip; Jump to real time stays available while a running replay
// chooses a new start bar.
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import type { ReplayIntervalMenu } from '../domain/replay-intervals';
import { REPLAY_SPEEDS, REPLAY_START_POINTS_LV, type ReplaySavedSession, type ReplayScope, type ReplaySession, type ReplayStartPoint } from '../domain/replay-session';
import { zonedDateInput } from './DateNavigationDialog';
import { chartDateTimeInputValue, chartZoneName } from './chart-time-text';
import { parseReplayQuickQuantity, type ReplayQuickPosition } from '../domain/replay-quick-trade';
import { formatTimeScaleLabel, DEFAULT_TIME_SCALE_SETTINGS, type TimeScaleSettings } from '../chart/time-axis-format';
import { intervalOrderSeconds } from '../domain/intervals';
import { shortIntervalText } from './interval-display';
/** The Select bar label in the crosshair time label format ("Tue 8 Jul '25" on a daily
 * chart, with "HH:MM" below a daily interval), in the chart timezone and the chart's time scale settings. */
export function replayStartLabel(timeSeconds: number, timezone: string, resolution: string, scales: Partial<TimeScaleSettings> = DEFAULT_TIME_SCALE_SETTINGS): string {
  let barMs = 86400000;
  try { const seconds = intervalOrderSeconds(resolution); if (Number.isFinite(seconds) && seconds > 0 && seconds < 1e12) barMs = seconds * 1000; } catch { /* unknown interval: date only */ }
  const settings: TimeScaleSettings = { ...DEFAULT_TIME_SCALE_SETTINGS, ...scales };
  const label = formatTimeScaleLabel(timeSeconds * 1000, timezone || 'UTC', barMs, settings);
  if (label.ok) return label.text;
  const fallback = formatTimeScaleLabel(timeSeconds * 1000, 'UTC', barMs, settings);
  return fallback.ok ? fallback.text + ' (UTC)' : new Date(timeSeconds * 1000).toISOString().slice(0, 16).replace('T', ' ');
}
import { ReplayCloseIcon, ReplayForwardIcon, ReplayMenuIcon, ReplayPauseIcon, ReplayPlayIcon, ReplayRealtimeIcon, ReplaySelectBarIcon, ReplayStepBackIcon } from './replay-icons';
import './replay-panel.css';

/** The replay virtual account shown on the bar, formatted by the host. */
export interface ReplayAccountBadge { equity: string; currency: string }
export interface ReplayPanelProps {
  session: ReplaySession | null;
  saved: ReplaySavedSession | null;
  intervalMenu: ReplayIntervalMenu;
  multiChart: boolean;
  /** True when no replay step remains (play and forward disabled). */
  atEnd: boolean;
  /** Visible refusal for an unsupported chart; never a silent emulation. */
  unsupportedReason: string | null;
  /** No longer shown. The panel formats the replay date itself from session.clock (chart timezone, crosshair label
   * format, no timezone id), so the label follows every step of play. Kept optional for hosts that still pass it. */
  clockLabel?: string;
  onSelectStart(): void; onTogglePlay(): void; onStep(): void; onSpeed(stepsPerSecond: number): void;
  onInterval(choice: string): void; onScope(scope: ReplayScope): void; onRealtime(): void; onClose(): void; onContinue(): void;
  /** Step back; the button is disabled while canStepBack is false. */
  onStepBack?(): void; canStepBack?: boolean;
  /** Start-point menu; the menu is hidden without a handler. */
  onStartPoint?(point: ReplayStartPoint): void;
  /** Replay account badge and the action that opens replay trading. */
  account?: ReplayAccountBadge | null; onTrading?(): void;
  /** Set while the replay reads a frozen copy of a live chart; shown as a short badge with this text as its tooltip. */
  liveNote?: string | null;
  /** The chart timezone (resolved IANA zone) the Select date form reads and shows. Default UTC. */
  timezone?: string;
  /** Replay quick trading: Sell, quantity, Buy and Flatten on the bar (hidden without a handler). The host submits a
   * market order on the replay account (domain/replay-quick-trade.ts) and returns false when it refused. */
  quickTrade?: ReplayQuickTradeProps | null;
}
export interface ReplayQuickTradeProps {
  /** Instrument lot size: the quantity step and the default quantity. */
  lotSize: number;
  /** Executable prices shown on the buttons (ask on Buy, bid on Sell), formatted by the host; null hides them. */
  bid: string | null; ask: string | null;
  position: ReplayQuickPosition | null;
  onOrder(side: 'buy' | 'sell', quantity: number): boolean | void;
  onFlatten(): boolean | void;
}

const ISOLATION = 'Replay trading uses a separate replay account. Ordinary Paper Trading keeps current data.';
/** Closes an open bar menu on a press outside its slot. */
function useOutsideClose(open: boolean, close: () => void) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!open) return; const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); }; document.addEventListener('pointerdown', outside, true); return () => document.removeEventListener('pointerdown', outside, true); }, [open]);
  return root;
}
/** A bar button that opens a menu above the bar; Escape and an outside press close it. */
function MenuSlot(props: { label: string; title: string; disabled: boolean; className?: string; button: React.ReactNode; menu: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false), close = () => setOpen(false), root = useOutsideClose(open, close);
  return <span className="lv-replay-slot" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } }}>
    <button type="button" className={'lv-replay-icon' + (props.className ? ' ' + props.className : '')} aria-label={props.label} title={props.title} aria-haspopup="menu" aria-expanded={open && !props.disabled} disabled={props.disabled} onClick={() => setOpen(!open)}>{props.button}</button>
    {open && !props.disabled && props.menu(close)}
  </span>;
}
/** Start-point menu entries (our own wording and order, REPLAY_START_POINTS_LV). Select date opens the date form. */
export function ReplayStartPointList(props: { onStartPoint(point: ReplayStartPoint): void; onDate(): void }) {
  return <div className="lv-replay-menu lv-popup-menu" role="menu" aria-label="Start point">
    {REPLAY_START_POINTS_LV.map(row => <button key={row.kind} type="button" role="menuitem" onClick={() => row.kind === 'date' ? props.onDate() : props.onStartPoint({ kind: row.kind })}>{row.label}</button>)}
  </div>;
}
/** Select date: a date and time in the chart timezone (UTC by default), the convention of the Go to date dialog.
 * Returns the refusal text, or null when started. */
export function replayDateSubmit(value: string, onStartPoint: (point: ReplayStartPoint) => void, timezone = 'UTC'): string | null {
  try { onStartPoint({ kind: 'date', time: zonedDateInput(value, timezone) }); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}
function ReplayDateForm(props: { initialTime: number; timezone: string; onStartPoint(point: ReplayStartPoint): void; onDone(): void }) {
  const [value, setValue] = useState(() => chartDateTimeInputValue(props.initialTime, props.timezone)), [error, setError] = useState(''), zoneName = chartZoneName(props.timezone);
  return <form className="lv-replay-menu lv-popup-menu lv-replay-date" role="dialog" aria-label="Select date" onSubmit={event => { event.preventDefault(); const refusal = replayDateSubmit(value, props.onStartPoint, props.timezone); if (refusal) setError(refusal); else props.onDone(); }}>
    <label>Start date and time ({zoneName})<input type="datetime-local" aria-label={zoneName === 'UTC' ? 'Replay start date and time in UTC' : `Replay start date and time in ${zoneName} time`} value={value} onChange={event => { setValue(event.target.value); setError(''); }} autoFocus /></label>
    {error && <span className="lv-replay-date-error" role="alert">{error}</span>}
    <span className="lv-replay-date-actions"><button type="button" onClick={props.onDone}>Cancel</button><button type="submit" className="primary">Start</button></span>
  </form>;
}
function StartPointMenu(props: { close(): void; initialTime: number; timezone: string; onStartPoint(point: ReplayStartPoint): void }) {
  const [dating, setDating] = useState(false), pick = (point: ReplayStartPoint) => { props.close(); props.onStartPoint(point); };
  return dating ? <ReplayDateForm initialTime={props.initialTime} timezone={props.timezone} onStartPoint={props.onStartPoint} onDone={props.close} /> : <ReplayStartPointList onStartPoint={pick} onDate={() => setDating(true)} />;
}
/** Speed menu: 0.1x to 10x (REPLAY_SPEEDS, steps per second), slowest first. */
export function ReplaySpeedList(props: { value: number; onSpeed(stepsPerSecond: number): void }) {
  return <div className="lv-replay-menu lv-popup-menu" role="menu" aria-label="Replay speed">
    {REPLAY_SPEEDS.map(speed => <button key={speed} type="button" role="menuitemradio" aria-checked={speed === props.value} onClick={() => props.onSpeed(speed)}>{`${speed}x`}</button>)}
  </div>;
}

/** The date of the last revealed bar, in the chart's crosshair label format and timezone, without the timezone id.
 * The session clock is that bar's close (an event-time watermark), so an intraday bar shows its open (clock minus the
 * interval: the 08:00 bar of a 4h chart reads 08:00, not 12:00) and a daily or longer bar its last day (clock minus 1 s). */
export function replayClockText(clock: number, timezone: string, interval: string): string {
  let seconds = 0;
  try { seconds = intervalOrderSeconds(interval); } catch { seconds = 0; }
  const at = Number.isFinite(seconds) && seconds > 0 && seconds < 86400 ? clock - seconds : clock - 1;
  return replayStartLabel(at, timezone, interval);
}
/** The plain tooltip of the replay date on a live chart (replaces the "Frozen live history" badge). */
export const LIVE_NOTE_TITLE = 'The replay uses the live bars loaded when it started. The live feed keeps running; Jump to real time shows the new bars.';
/** The label of an interval choice, as the menu button and the menu show it. */
export function replayIntervalLabel(menu: ReplayIntervalMenu, choice: string): string {
  // Intervals read as the toolbar shows them (240m is 4h).
  if (choice === 'auto') return menu.auto.id ? `Auto (${shortIntervalText(menu.auto.id)})` : 'Auto (unavailable)';
  return shortIntervalText(menu.options.find(option => option.id === choice)?.label ?? choice);
}
/**
 * Replay interval menu: Auto first, then the candidate intervals. An unavailable entry
 * stays in the list with aria-disabled and its reason as the tooltip; choosing it does nothing.
 */
export function ReplayIntervalList(props: { menu: ReplayIntervalMenu; value: string; onInterval(choice: string): void }) {
  const rows = [{ id: 'auto', available: !!props.menu.auto.id, reason: props.menu.auto.reason }, ...props.menu.options.map(option => ({ id: option.id, available: option.available, reason: option.reason }))];
  return <div className="lv-replay-menu lv-popup-menu" role="menu" aria-label="Replay interval">
    {rows.map(row => <button key={row.id} type="button" role="menuitemradio" aria-checked={row.id === props.value} aria-disabled={!row.available} title={row.reason ?? undefined} data-interval={row.id} onClick={() => { if (row.available) props.onInterval(row.id); }}>{replayIntervalLabel(props.menu, row.id)}</button>)}
  </div>;
}

/** Sell / quantity / Buy / Flatten and the open replay position with its P&L. */
export function ReplayQuickTrade(props: ReplayQuickTradeProps & { disabled: boolean }) {
  const [text, setText] = useState(() => String(props.lotSize > 0 ? props.lotSize : 1)), [error, setError] = useState('');
  const order = (side: 'buy' | 'sell') => { try { const quantity = parseReplayQuickQuantity(text, props.lotSize); setError(''); props.onOrder(side, quantity); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  const position = props.position;
  return <span className="lv-replay-trade" role="group" aria-label="Replay trading">
    <button type="button" className="lv-replay-sell" aria-label="Sell" title="Sell at market on the replay account" disabled={props.disabled} onClick={() => order('sell')}><span>Sell</span>{props.bid && <span className="lv-replay-trade-price">{props.bid}</span>}</button>
    <input className="lv-replay-qty" aria-label="Replay order quantity" aria-invalid={!!error} title={error || 'Quantity'} inputMode="decimal" value={text} disabled={props.disabled} onChange={event => { setText(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } event.stopPropagation(); }} />
    <button type="button" className="lv-replay-buy" aria-label="Buy" title="Buy at market on the replay account" disabled={props.disabled} onClick={() => order('buy')}><span>Buy</span>{props.ask && <span className="lv-replay-trade-price">{props.ask}</span>}</button>
    {/* The position slot is always there at a fixed width, so a fill never widens or shifts the bar. */}
    <span className="lv-replay-position" data-tone={position?.tone} data-flat={position ? undefined : 'true'} aria-live="polite" title={position ? `${position.label}${position.pnl !== null ? ' ' + position.pnl : ''}` : 'No open replay position'}>{position ? <>{position.label}{position.pnl !== null && <strong>{position.pnl}</strong>}</> : 'Flat'}</span>
    <button type="button" className="lv-replay-flatten" aria-label="Flatten" title={position ? 'Close the replay position at market' : 'No open replay position'} disabled={props.disabled || !position} onClick={() => props.onFlatten()}>Flatten</button>
    {error && <span className="lv-replay-date-error" role="alert">{error}</span>}
  </span>;
}

/** Drag handle offset: the bar can be moved from its bottom-centre anchor; double click resets. Presentation only. */
function useBarDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 }), start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const handlers = {
    onPointerDown: (event: React.PointerEvent) => { start.current = { px: event.clientX, py: event.clientY, x: offset.x, y: offset.y }; try { (event.currentTarget as Element).setPointerCapture?.(event.pointerId); } catch { /* not capturable */ } },
    onPointerMove: (event: React.PointerEvent) => { const from = start.current; if (from) setOffset({ x: from.x + event.clientX - from.px, y: Math.min(0, from.y + event.clientY - from.py) }); },
    onPointerUp: () => { start.current = null; },
    onPointerCancel: () => { start.current = null; },
    onDoubleClick: () => setOffset({ x: 0, y: 0 })
  };
  return { offset, handlers };
}

export function ReplayPanel(props: ReplayPanelProps) {
  const drag = useBarDrag();
  const { session } = props, active = session?.phase === 'active' && session.clock !== null, selecting = session?.phase === 'selecting-start';
  const choice = session?.intervalChoice ?? 'auto', phase = session?.phase ?? 'closed', startBlocked = !!props.unsupportedReason || (!session && !props.saved);
  const speed = session?.stepsPerSecond ?? 1, onStartPoint = props.onStartPoint, revealed = !!session && session.phase !== 'realtime' && session.clock !== null;
  return (
    <div className="lv-replay-dock" data-replay-phase={phase}>
    <div className="lv-replay-panel lv-replay-floating" role="toolbar" aria-label="Bar replay" data-replay-phase={phase} style={drag.offset.x || drag.offset.y ? { translate: `${drag.offset.x}px ${drag.offset.y}px` } : undefined}>
      <span className="lv-replay-grip" aria-hidden="true" title="Drag to move (double-click to reset)" {...drag.handlers} />
      {props.unsupportedReason && <p className="lv-replay-refusal" role="alert">{props.unsupportedReason}</p>}
      {!session && props.saved && !props.unsupportedReason && <button type="button" className="lv-replay-continue" onClick={props.onContinue}>Continue session</button>}
      {/* With no session the host starts a new start selection, and the panel says so; with nothing to act on the control is disabled, never dead. */}
      {!session && props.saved && !props.unsupportedReason && <span className="lv-replay-hint">or select a bar to start a new replay</span>}
      <span className="lv-replay-group">
        <button type="button" aria-label="Select bar" title={session ? 'Select bar' : 'Select bar to start a new replay'} className={'lv-replay-icon' + (selecting ? ' active' : '')} aria-pressed={selecting} disabled={startBlocked} onClick={props.onSelectStart}><ReplaySelectBarIcon /></button>
        {onStartPoint && <MenuSlot label="Start point" title="Choose where the replay starts" className="lv-replay-chevron" disabled={startBlocked} button={<ReplayMenuIcon />} menu={close => <StartPointMenu close={close} initialTime={session?.clock ?? Math.floor(Date.now() / 1000)} timezone={props.timezone ?? 'UTC'} onStartPoint={onStartPoint} />} />}
      </span>
      <span className="lv-replay-divider" aria-hidden="true" />
      <span className="lv-replay-group">
        <button type="button" className="lv-replay-icon" aria-label="Step back" title="Step back (Shift+Left)" aria-keyshortcuts="Shift+ArrowLeft" disabled={!active || !props.onStepBack || !props.canStepBack} onClick={props.onStepBack}><ReplayStepBackIcon /></button>
        <button type="button" className="lv-replay-icon" aria-label={session?.playing ? 'Pause' : 'Play'} title={session?.playing ? 'Pause (Shift+Down)' : 'Play (Shift+Down)'} aria-keyshortcuts="Shift+ArrowDown" disabled={!active || (props.atEnd && !session?.playing)} onClick={props.onTogglePlay}>{session?.playing ? <ReplayPauseIcon /> : <ReplayPlayIcon />}</button>
        <button type="button" className="lv-replay-icon" aria-label="Forward" title="Forward (Shift+Right)" aria-keyshortcuts="Shift+ArrowRight" disabled={!active || props.atEnd} onClick={props.onStep}><ReplayForwardIcon /></button>
        <MenuSlot label="Replay speed" title="Replay speed (steps per second)" className="lv-replay-speed" disabled={!session} button={`${speed}x`} menu={close => <ReplaySpeedList value={speed} onSpeed={value => { close(); props.onSpeed(value); }} />} />
      </span>
      <MenuSlot label="Replay interval" title="Update interval" className="lv-replay-interval" disabled={!session} button={replayIntervalLabel(props.intervalMenu, choice)} menu={close => <ReplayIntervalList menu={props.intervalMenu} value={choice} onInterval={value => { close(); props.onInterval(value); }} />} />
      {props.multiChart && <span className="lv-replay-scope" role="radiogroup" aria-label="Replay charts">
        {(['current', 'all'] as const).map(scope => <button key={scope} type="button" role="radio" aria-checked={(session?.scope ?? 'current') === scope} disabled={!session} onClick={() => props.onScope(scope)}>{scope === 'current' ? 'Current chart' : 'All charts'}</button>)}
      </span>}
      {/* One reserved layout for the whole session. The date slot, the trade group and the account button
          are there from the start selection on (disabled until a bar is picked), at fixed widths, so picking the start bar never
          adds a row or moves Play under the pointer. The start hint and the live note live in the date slot. */}
      {session && <span className="lv-replay-clock" aria-live="polite" data-replay-clock={active ? 'date' : selecting ? 'hint' : 'empty'} title={props.liveNote ? LIVE_NOTE_TITLE : undefined}>{active ? replayClockText(session.clock!, props.timezone ?? 'UTC', session.interval ?? '1D') : selecting ? 'Click a bar to start' : ''}{props.liveNote ? <span className="lv-sr-only lv-replay-live-frozen">{' ' + LIVE_NOTE_TITLE}</span> : null}</span>}
      {session && (active && props.quickTrade ? <ReplayQuickTrade key="live" {...props.quickTrade} disabled={false} /> : <ReplayQuickTrade key="reserved" lotSize={1} bid={null} ask={null} position={null} onOrder={() => {}} onFlatten={() => {}} disabled />)}
      {session && <button type="button" className="lv-replay-account" aria-label="Replay account" title={ISOLATION} disabled={!active || !props.onTrading} onClick={props.onTrading}>
        <span className="lv-replay-account-name">Replay account</span><span className="lv-replay-account-equity">{active && props.account ? `${props.account.equity} ${props.account.currency}` : ''}</span>
      </button>}
      <span className="lv-replay-divider" aria-hidden="true" />
      <span className="lv-replay-group">
        <button type="button" className="lv-replay-icon" aria-label="Jump to real time" title="Jump to real time" disabled={!revealed} onClick={props.onRealtime}><ReplayRealtimeIcon /></button>
        <button type="button" className="lv-replay-icon lv-replay-close" aria-label="Close replay" title="Close replay" onClick={props.onClose}><ReplayCloseIcon /></button>
      </span>
    </div>
    </div>
  );
}

/** Vela's TIME_AXIS_H (0.8.4). */
const AXIS_HEIGHT=22,REPLAY_PICK_SLOP=4;
/** Vertical start-selection line drawn over the chart at the pointer. The host supplies the x.
 * The line is clipped to the pane stack of the chart under the pointer (it ended past
 * the time axis, over the bottom toolbar and panel), and the date label sits in that chart's time axis, centred on the line
 * and kept inside the chart, like the other axis labels, so it covers the tick text under it instead of overlapping it.
 * The geometry is read from the DOM: the renderer's mount (.chart-canvas) publishes --vela-bottom-gutter (time axis
 * height, plus any collapsed lower pane space). Without it (static render, no chart) the line keeps the full host height. */
export type ScissorsBox={top:number;height:number;labelTop:number;axisHeight:number;labelShift:number};
export function scissorsGeometry(host:{left:number;top:number},canvas:{left:number;top:number;width:number;height:number},gutter:number,x:number,labelWidth:number):ScissorsBox{
  // The time axis is the bottom AXIS_HEIGHT px; a larger gutter also holds collapsed lower panes, which the line skips too.
  const axisHeight=Math.max(0,Math.min(AXIS_HEIGHT,gutter,canvas.height)),top=canvas.top-host.top,height=Math.max(0,canvas.height-Math.max(axisHeight,Math.min(gutter,canvas.height)));
  const lineX=host.left+x,half=labelWidth/2,lo=canvas.left,hi=canvas.left+canvas.width;
  const left=Math.max(lo,Math.min(lineX-half,hi-labelWidth));
  return{top,height,labelTop:canvas.height-axisHeight,axisHeight,labelShift:Math.round(left-(lineX-half))};
}
function chartCanvasAt(clientX:number,clientY:number|null):HTMLElement|null{
  if(typeof document==='undefined')return null;
  const canvases=Array.from(document.querySelectorAll<HTMLElement>('[data-chart-tree]:not([aria-hidden="true"]) .chart-canvas'));
  const inX=canvases.filter(element=>{const r=element.getBoundingClientRect();return r.width>0&&clientX>=r.left&&clientX<=r.right;});
  return inX.find(element=>{if(clientY===null)return false;const r=element.getBoundingClientRect();return clientY>=r.top&&clientY<=r.bottom;})??inX[0]??null;
}
export function ReplayScissors(props: { x: number; valid: boolean; label: string }) {
  const ref=useRef<HTMLDivElement>(null),labelRef=useRef<HTMLSpanElement>(null),pointerY=useRef<number|null>(null);
  const [box,setBox]=useState<ScissorsBox|null>(null);
  // A press that drags pans the chart while looking for the start; only a click without
  // movement picks the bar (it used to start the replay at the release point). The host's pick runs on the click, so the
  // click after a drag over a chart is stopped here, before React sees it. Mounted only while a start is being selected.
  useEffect(()=>{
    let down:{x:number;y:number}|null=null,dragged=false;
    const press=(event:PointerEvent)=>{down=event.button===0?{x:event.clientX,y:event.clientY}:null;dragged=false;};
    const track=(event:PointerEvent)=>{pointerY.current=event.clientY;if(down&&(event.buttons&1)&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>REPLAY_PICK_SLOP)dragged=true;};
    const click=(event:MouseEvent)=>{const panned=dragged;down=null;dragged=false;if(panned&&(event.target as Element|null)?.closest?.('[data-chart-tree]')){event.preventDefault();event.stopPropagation();}};
    window.addEventListener('pointerdown',press,true);window.addEventListener('pointermove',track,true);window.addEventListener('click',click,true);
    return()=>{window.removeEventListener('pointerdown',press,true);window.removeEventListener('pointermove',track,true);window.removeEventListener('click',click,true);};
  },[]);
  useLayoutEffect(()=>{
    const node=ref.current,host=node?.offsetParent as HTMLElement|null;if(!node||!host)return;
    const hostBox=host.getBoundingClientRect(),canvas=chartCanvasAt(hostBox.left+props.x,pointerY.current);
    if(!canvas){if(box)setBox(null);return;}
    const rect=canvas.getBoundingClientRect(),gutter=Number.parseFloat(canvas.style.getPropertyValue('--vela-bottom-gutter'));
    const next=scissorsGeometry(hostBox,rect,Number.isFinite(gutter)?gutter:AXIS_HEIGHT,props.x,labelRef.current?.offsetWidth??0);
    if(!box||(Object.keys(next) as (keyof ScissorsBox)[]).some(key=>box[key]!==next[key]))setBox(next);
  });
  return (
    <div ref={ref} className={'lv-replay-scissors' + (props.valid ? '' : ' invalid') + (box ? ' lv-replay-scissors-clipped' : '')} style={box ? { left: `${props.x}px`, top: `${box.top}px`, bottom: 'auto', height: `${box.height}px` } : { left: `${props.x}px` }} aria-hidden="true">
      <span className="lv-replay-scissors-glyph">✂</span>
      <span ref={labelRef} className="lv-replay-scissors-label" style={box ? { top: `${box.labelTop}px`, height: `${box.axisHeight}px`, lineHeight: `${box.axisHeight}px`, transform: `translateX(calc(-50% + ${box.labelShift}px))` } : undefined}>{props.label}</span>
    </div>
  );
}
