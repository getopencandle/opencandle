import React, { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {isLiveInputIdentity} from '../chart/bar-input-identity';
import {snapshotSourceKey,registerSnapshotSceneSource,snapshotBindingAtRequest,isSnapshotOwnerCurrent,sameSnapshotObservation,type SnapshotBinding} from '../chart/snapshot-scene';
import { alertLineKeyStep, snapAlertPrice, type AlertLineSlot } from './alert-line-drag';
import { axisTagOffset, type AxisLabelRect, type AxisTagBoard } from '../chart/axis-tag-board';
import { AlertBlinkTracker, type AlertLineState } from '../chart/alert-lines-data';
import { estimateLabelTextWidth, layoutLineLabels, type LineLabelSpot } from './line-label-layout';

/**
 * A handle on every alert line of the charted symbol. Drag a handle (or focus it and press ArrowUp / ArrowDown for one
 * tick) to change that alert's price. The painted line itself stays on the chart canvas; these handles only carry the gesture.
 * Like the virtual order lines, they are not drawings: hide, lock, erase and the object tree never see them.
 */
export interface AlertChartLinesProjection { left: number; top: number; width: number; height: number; priceToY: (price: number) => number; yToPrice: (y: number) => number; /** Main price scale side; absent = right. */ scaleSide?: 'left' | 'right' }
export interface AlertChartLineRow { alertId: string; name: string; slot: AlertLineSlot; price: number; label: string; state?: AlertLineState; labelVisible?: boolean; triggerMark?: string | null }
export interface AlertChartLinesProps {
  /** Guards exports until this layer has actually rendered its current projection and board tags. */
  snapshot?:SnapshotBinding;
  rows: readonly AlertChartLineRow[];
  tickSize: number;
  visible: boolean;
  /** The overlay also draws the dashed line (default). Pass false once the renderer's own alert line layer is installed. */
  drawLine?: boolean;
  /** Reads the active chart's price pane right now; null while the chart is unavailable. */
  projection: () => AlertChartLinesProjection | null;
  /** Returns false when the change was refused (the line snaps back). */
  onReprice: (alertId: string, slot: AlertLineSlot, price: number) => boolean | void;
  /** The chart's shared axis tag layout. Absent: each price tag sits at its price. */
  tagBoard?: AxisTagBoard;
}
/** Pane-relative axis tag requests for the rows that are drawn (a dragged row at its drag price). */
export function alertAxisTagRequests(rows: readonly AlertChartLineRow[], projection: AlertChartLinesProjection, drag: { key: string; price: number } | null) {
  return rows.flatMap(row => { const key = `${row.alertId}:${row.slot}`, y = projection.priceToY(drag?.key === key ? drag.price : row.price) - projection.top; return Number.isFinite(y) && y >= -10 && y <= projection.height + 10 ? [{ id: key, y, height: 16 }] : []; });
}
const sameProjection = (a: AlertChartLinesProjection | null, b: AlertChartLinesProjection | null, probe: number): boolean => {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && (a.scaleSide ?? 'right') === (b.scaleSide ?? 'right') && a.priceToY(probe) === b.priceToY(probe) && a.priceToY(probe * 1.01) === b.priceToY(probe * 1.01);
};
const rowKey = (row: AlertChartLineRow) => `${row.alertId}:${row.slot}`;
/** The chip text of a row (a dragged row shows its drag price first). */
export const alertChipText = (row: AlertChartLineRow, drag: { key: string; price: number } | null) => drag?.key === rowKey(row) ? `${drag.price}  ${row.name}` : row.label;
/**
 * The chip sits at the price-axis end of its line, just inside the axis tag
 * column (ALERT_CHIP_AXIS_GAP px from the scale side), not at the far left over the drawings.
 * Lays the alert chips out together and clear of the virtual order and position
 * chips the board holds (they come first, so an alert chip never covers a Reverse or Close button). The dragged chip keeps its
 * place; the others go top to bottom, each at the nearest free height.
 */
export const ALERT_CHIP_AXIS_GAP = 64;
export type AlertLabelSpot = LineLabelSpot & { side: 'left' | 'right' };
export function alertLabelLayout(rows: readonly AlertChartLineRow[], projection: AlertChartLinesProjection, drag: { key: string; price: number } | null, obstacles: readonly AxisLabelRect[] = [], avoid: readonly AxisLabelRect[] = []): Map<string, AlertLabelSpot> {
  const side: 'left' | 'right' = projection.scaleSide === 'left' ? 'left' : 'right';
  const drawn = rows.flatMap((row, index) => { const key = rowKey(row), y = projection.priceToY(drag?.key === key ? drag.price : row.price) - projection.top; return Number.isFinite(y) && y >= -10 && y <= projection.height + 10 ? [{ row, key, y, index }] : []; });
  drawn.sort((a, b) => (a.key === drag?.key ? 0 : 1) - (b.key === drag?.key ? 0 : 1) || a.y - b.y || a.index - b.index);
  // A chip on a line that passes the quick-trade buttons starts just right of them, still on its line.
  const shifts = new Map<string, number>();
  const requests = drawn.map(({ row, key, y }) => { const width = estimateLabelTextWidth(alertChipText(row, drag)), anchor = side === 'left' ? ALERT_CHIP_AXIS_GAP : projection.width - ALERT_CHIP_AXIS_GAP - width; let left = anchor; for (const box of avoid) if (y + 8 > box.top && y - 8 < box.bottom && left < box.right && left + width > box.left) left = box.right + 8; if (left !== anchor) shifts.set(key, left - anchor); return { id: key, y, height: 16, left, right: left + width, step: side === 'left' ? 'right' as const : 'left' as const, ...(key === drag?.key ? { anchor: true } : {}) }; });
  const laid = layoutLineLabels(requests, projection, obstacles), spots = new Map<string, AlertLabelSpot>();
  for (const [key, spot] of laid) spots.set(key, { ...spot, dx: spot.dx + (shifts.get(key) ?? 0), side });
  return spots;
}

/**
 * The chart's quick-trade Sell/Buy buttons sit at the pane's top left, where the alert chips start. Their
 * pane-relative boxes let alertLabelLayout start a chip just right of them on its own line instead of under them.
 */
export function tradeButtonObstacles(projection: AlertChartLinesProjection, root: { querySelectorAll?: (selector: string) => ArrayLike<{ getBoundingClientRect(): { left: number; top: number; right: number; bottom: number } }> } | null = typeof document !== 'undefined' ? document : null): AxisLabelRect[] {
  const found = root?.querySelectorAll?.('.lv-trade-buttons'); if (!found) return [];
  const out: AxisLabelRect[] = [];
  for (let index = 0; index < found.length; index++) {
    const box = found[index].getBoundingClientRect(), rect = { left: box.left - projection.left, top: box.top - projection.top, right: box.right - projection.left, bottom: box.bottom - projection.top };
    if (rect.right > rect.left && rect.bottom > rect.top && rect.right > 0 && rect.left < projection.width && rect.bottom > 0 && rect.top < projection.height) out.push(rect);
  }
  return out;
}

interface AlertGestureProof {execution:string|null;series:string|null;live:boolean}
interface AlertPointerSession {current:()=>boolean;valid:()=>boolean;cancel:(notify:boolean)=>void}
interface AlertPointerOwner {mounted:boolean;session:AlertPointerSession|null}
const pointerOwners=new WeakMap<object,AlertPointerOwner>();
function pointerOwner(owner:object):AlertPointerOwner{let state=pointerOwners.get(owner);if(!state){state={mounted:true,session:null};pointerOwners.set(owner,state);}return state;}
function cancelPointer(owner:AlertPointerOwner,notify=false){owner.session?.cancel(notify);}
type AlertGestureContext=AlertChartLinesProps&{originalSnapshot:SnapshotBinding|undefined};
function gestureContext(props:AlertChartLinesProps):AlertGestureContext{return{...props,snapshot:props.snapshot?{...props.snapshot}:undefined,originalSnapshot:props.snapshot};}
function sameGestureContext(origin:AlertGestureContext,current:AlertChartLinesProps,row:AlertChartLineRow):boolean{
 if(!current.visible||!Number.isFinite(origin.tickSize)||origin.tickSize<=0||current.tickSize!==origin.tickSize||current.tagBoard!==origin.tagBoard)return false;
 const matches=current.rows.filter(value=>rowKey(value)===rowKey(row));if(matches.length!==1||matches[0].price!==row.price||matches[0].name!==row.name)return false;
 const a=origin.snapshot,b=current.snapshot;
 if(!a||!b)return a===b&&current.projection===origin.projection&&current.onReprice===origin.onReprice;
 if(a.owner!==b.owner||a.chart!==b.chart||a.sourceKey!==b.sourceKey||!isSnapshotOwnerCurrent(b))return false;
 // A reset key permits a fresh current render to supersede an old financial/readout predicate during live growth.
 return a.gestureOwnerKey!==undefined?a.gestureOwnerKey===b.gestureOwnerKey:origin.originalSnapshot===b&&isSnapshotOwnerCurrent(a);
}
function readGestureProof(props:AlertChartLinesProps,stillCurrent:()=>boolean):AlertGestureProof|null{
 if(!stillCurrent())return null;const binding=props.snapshot;if(!binding)return{execution:null,series:null,live:false};
 try{
  if(!isSnapshotOwnerCurrent(binding))return null;const view=binding.chart.getDataWindow();
  if(!stillCurrent()||!isSnapshotOwnerCurrent(binding)||view.pending||snapshotSourceKey(view.source,view.series.style)!==binding.sourceKey)return null;
  if(typeof binding.chart.getExecutionIdentity!=='function')return null;const execution=binding.chart.getExecutionIdentity();
  if(!stillCurrent()||!isSnapshotOwnerCurrent(binding)||typeof execution!=='string'||!execution)return null;
  return{execution,series:JSON.stringify([view.series.count,view.series.firstTime,view.series.lastTime,view.series.style]),live:isLiveInputIdentity(view.source.inputIdentity)};
 }catch{return null;}
}
function sameGestureProof(before:AlertGestureProof,now:AlertGestureProof|null):boolean{return !!now&&before.execution===now.execution&&before.live===now.live&&(before.live||before.series===now.series);}

interface OwnedAlertProjection {value:AlertChartLinesProjection;binding:SnapshotBinding|undefined}
function currentProjection(props:AlertChartLinesProps){return props.snapshot&&!isSnapshotOwnerCurrent(props.snapshot)?null:props.projection();}
export function AlertChartLines(props: AlertChartLinesProps) {
  const rows = props.visible ? props.rows : [];
  const [observedProjection, setProjection] = useState<OwnedAlertProjection | null>(() => {const value=rows.length?currentProjection(props):null;return value?{value,binding:props.snapshot}:null;});
  const [drag, setDrag] = useState<{ key: string; price: number } | null>(null);
  const latest = useRef(props); latest.current = props;
  const gestures=pointerOwner(latest),interaction=gestures.session;
  const ownedProjection=observedProjection&&sameSnapshotObservation(observedProjection.binding,props.snapshot)?observedProjection.value:null;
  // A live readout update can replace the observation while the pointer remains captured. Read only its fresh owned projection.
  const projection=ownedProjection??(interaction?.valid()?currentProjection(props):null);
  const currentDrag=interaction?.current()?drag:null;
  const probe = rows[0]?.price ?? 1;
  // Triggered label blink (2.4 s): remounting the chip restarts its CSS animation.
  const blink = useRef(new AlertBlinkTracker());
  blink.current.observe(rows.map(row => ({ alertId: row.alertId, triggerMark: row.triggerMark ?? null })), Date.now());
  const [, setTagSignature] = useState('');
  // Follows pan, zoom, scale and resize while lines exist; state changes only when the geometry does.
  useEffect(() => {
    if (!rows.length) { cancelPointer(gestures,true);setProjection(null); return; }
    let frame = 0, previous: OwnedAlertProjection | null = null, tags = '';
    const step = () => { const gesture=gestures.session;if(gesture&&!gesture.valid())gesture.cancel(true);let next: OwnedAlertProjection | null = null; try { const value=currentProjection(latest.current);next=value?{value,binding:latest.current.snapshot}:null; } catch { next = null; } if (!sameSnapshotObservation(previous?.binding,next?.binding)||!sameProjection(previous?.value??null, next?.value??null, probe)) { previous = next; setProjection(next); } const board = latest.current.tagBoard; if (board) { const signature = board.signature('alerts') + '|' + (board.labelSignature?.('alerts') ?? '') + '|' + (next ? JSON.stringify(tradeButtonObstacles(next.value).map(rect => [rect.left, rect.top, rect.right, rect.bottom].map(Math.round))) : ''); if (signature !== tags) { tags = signature; setTagSignature(signature); } } frame = requestAnimationFrame(step); };
    step();
    return () => {cancelAnimationFrame(frame);cancelPointer(gestures);};
  }, [rows.length > 0, probe]);
  // Hand this frame's tags to the shared layout (an empty list releases them).
  const tagRequests = props.tagBoard && projection ? alertAxisTagRequests(rows, projection, currentDrag) : [], tagKey = JSON.stringify(tagRequests);
  useEffect(() => { const board = props.tagBoard; if (!board) return; board.submit('alerts', tagRequests, projection?.height ?? 0); }, [props.tagBoard, tagKey, projection?.height]);
  useEffect(() => { const board = props.tagBoard;gestures.mounted=true;return () => {gestures.mounted=false;cancelPointer(gestures);board?.submit('alerts', [], 0);}; }, [props.tagBoard]);
  const spots = props.tagBoard?.placements('alerts');
  const snapshotTags=JSON.stringify([...(spots??new Map())]);
  const snapshotObstacles=JSON.stringify(props.tagBoard?.labelObstacles?.('alerts')??[]);
  const snapshotGeometryOf=(value:AlertChartLinesProjection|null)=>value?JSON.stringify([value.left,value.top,value.width,value.height,value.scaleSide??'right',rows.map(row=>value.priceToY(row.price))]):null;
  const snapshotGeometry=snapshotGeometryOf(projection);
  // Lazy like SnapshotLegendPublisher. App rebinds this layer only after the hover settles, so the
  // publication is made when a snapshot asks, after proving this render's lines, tags and obstacles against the live chart.
  const snapshotValid=()=>!rows.length||(!currentDrag&&!gestures.session&&snapshotGeometry!==null&&snapshotGeometryOf(currentProjection(props))===snapshotGeometry&&JSON.stringify([...(props.tagBoard?.placements('alerts')??new Map())])===snapshotTags&&JSON.stringify(props.tagBoard?.labelObstacles?.('alerts')??[])===snapshotObstacles);
  const snapshotState=useRef({snapshot:props.snapshot,valid:snapshotValid});snapshotState.current={snapshot:props.snapshot,valid:snapshotValid};
  const snapshotSource=useRef<ReturnType<typeof registerSnapshotSceneSource>|null>(null);
  useEffect(()=>{
    const binding=props.snapshot;if(!binding)return;
    const registered=registerSnapshotSceneSource(binding,'alerts',{},{binding:()=>snapshotBindingAtRequest(snapshotState.current.snapshot??binding),connected:()=>true,read:()=>{if(!snapshotState.current.valid())throw Error('The chart alerts are updating. Try the snapshot again after it finishes.');return{texts:[],boxes:[],badges:[]};}});
    snapshotSource.current=registered;
    return()=>{if(snapshotSource.current===registered)snapshotSource.current=null;registered.dispose();};
  },[props.snapshot?.owner,props.snapshot?.chart]);
  useEffect(()=>{snapshotSource.current?.invalidate();},[props.snapshot,projection,props.rows,props.visible,tagKey,snapshotTags,snapshotObstacles,snapshotGeometry,!!currentDrag]);
  if (!rows.length || !projection) return null;
  const labelSpots = alertLabelLayout(rows, projection, currentDrag, props.tagBoard?.labelObstacles?.('alerts') ?? [], tradeButtonObstacles(projection));
  const begin = (rendered: AlertChartLineRow) => {const row={...rendered},origin=gestureContext(props);return(event: React.PointerEvent<HTMLElement>) => {
    if(event.button!==0||event.currentTarget.isConnected===false||!gestures.mounted||!sameGestureContext(origin,latest.current,row))return;
    const current=latest.current,contextCurrent=()=>gestures.mounted&&sameGestureContext(origin,latest.current,row);
    const initial=readGestureProof(current,()=>contextCurrent()&&latest.current===current);if(!initial)return;
    cancelPointer(gestures,true);if(gestures.session||!contextCurrent())return;
    event.preventDefault();event.stopPropagation();const target=event.currentTarget,pointerId=event.pointerId;
    let closed=false,captured=false,price=row.price;
    const currentContext=()=>contextCurrent()&&target.isConnected!==false;
    const validAuthority=()=>{const now=latest.current;return currentContext()&&sameGestureProof(initial,readGestureProof(now,()=>currentContext()&&latest.current===now));};
    const session:AlertPointerSession={current:()=>!closed&&gestures.session===session&&currentContext(),valid:()=>!closed&&gestures.session===session&&validAuthority(),cancel:notify=>cleanup(notify)};
    const matchesPointer=(next:PointerEvent)=>next.pointerId===undefined||next.pointerId===pointerId;
    const listeners:[string,EventListener][]=[];
    const cleanup=(notify:boolean)=>{if(closed)return;closed=true;if(gestures.session===session)gestures.session=null;
      for(const [type,listener]of listeners)try{target.removeEventListener(type,listener);}catch{/* A retained listener is inert after retirement. */}
      if(captured)try{target.releasePointerCapture?.(pointerId);}catch{/* The browser may already have released capture. */}
      if(notify&&gestures.mounted&&!gestures.session)setDrag(null);
    };
    const move=(next:PointerEvent)=>{if(!matchesPointer(next)||closed)return;if(!session.valid()){cleanup(true);return;}
      try{const current=latest.current,value=currentProjection(current);if(!value||!session.current()||latest.current!==current){cleanup(true);return;}
        const converted=value.yToPrice(next.clientY);if(!session.current()||latest.current!==current){cleanup(true);return;}
        const at=snapAlertPrice(converted,origin.tickSize);if(!Number.isFinite(at)){cleanup(true);return;}price=at;setDrag({key:rowKey(row),price});
      }catch{cleanup(true);}
    };
    const end=(next:PointerEvent)=>{if(!matchesPointer(next)||closed)return;
      if(next.type!=='pointerup'||!session.valid()){cleanup(true);return;}const changed=price!==row.price;cleanup(true);
      // Releasing capture can synchronously replace the owner or start another gesture.
      if(changed&&!gestures.session&&validAuthority())latest.current.onReprice(row.alertId,row.slot,price);
    };
    const lost=(next:PointerEvent)=>{if(matchesPointer(next))cleanup(true);};
    gestures.session=session;
    try{try{target.focus({preventScroll:true});}catch{/* Focus is optional. */}if(!session.valid()){cleanup(true);return;}
      captured=true;try{target.setPointerCapture?.(pointerId);}catch{/* Continue with the target listeners when capture is unavailable. */}
      if(!session.valid()){cleanup(true);return;}
      for(const [type,listener]of [['pointermove',move],['pointerup',end],['pointercancel',end],['lostpointercapture',lost]] as const){if(!session.current()){cleanup(true);return;}listeners.push([type,listener as EventListener]);target.addEventListener(type,listener as EventListener);}
      if(!session.valid()){cleanup(true);return;}setDrag({key:rowKey(row),price});
    }catch{cleanup(true);}
  };};
  const keyMove = (rendered: AlertChartLineRow) => {const row={...rendered},origin=gestureContext(props);return(event: React.KeyboardEvent<HTMLElement>) => {
    const step=alertLineKeyStep(event.key);if(!step||event.currentTarget?.isConnected===false||!gestures.mounted||!sameGestureContext(origin,latest.current,row))return;
    const current=latest.current,valid=()=>gestures.mounted&&sameGestureContext(origin,latest.current,row),initial=readGestureProof(current,()=>valid()&&latest.current===current);if(!initial)return;
    event.preventDefault();event.stopPropagation();cancelPointer(gestures,true);const now=latest.current;
    if(gestures.session||!valid()||!sameGestureProof(initial,readGestureProof(now,()=>valid()&&latest.current===now)))return;
    latest.current.onReprice(row.alertId,row.slot,new Decimal(row.price).add(new Decimal(origin.tickSize).mul(step)).toNumber());
  };};
  return (
    <div className="lv-alert-lines" aria-label="Alert lines" role="group" {...(projection.scaleSide === 'left' ? { 'data-scale-side': 'left' } : {})} style={{ position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
      <style>{'.lv-alert-line .leader{position:absolute;width:0;border-left:1px solid var(--lv-alert-line,#f0a030);pointer-events:none}.lv-alert-line .axis-tag{position:absolute;right:0;transform:translateY(-50%);padding:0 5px;font:11px/16px system-ui,sans-serif;color:#000;background:var(--lv-alert-line,#f0a030);pointer-events:none;white-space:nowrap}.lv-alert-lines[data-scale-side="left"] .lv-alert-line .axis-tag{left:0;right:auto}.lv-alert-line{position:absolute;left:0;right:0;height:0}.lv-alert-line.drawn{border-top:1px dashed var(--lv-alert-line,#f0a030)}.lv-alert-line .chip{position:absolute;left:8px;transform:translateY(-50%);pointer-events:auto;font:11px/16px system-ui,sans-serif;color:#fff;background:var(--lv-alert-line,#f0a030);border-radius:2px;padding:0 6px;white-space:nowrap;cursor:ns-resize;user-select:none;opacity:.85}.lv-alert-line.dragging .chip{opacity:1;outline:1px solid #fff}.lv-alert-line .chip[data-alert-state=triggered]{box-shadow:inset 0 0 0 1px var(--lv-notice-text,#e9c27a)}.lv-alert-line .chip[data-alert-state=expired]{box-shadow:inset 0 0 0 1px var(--lv-error-text,#f2736c);text-decoration:line-through}.lv-alert-line .chip[data-label-hidden=true]{opacity:0}.lv-alert-line .chip.blinking{animation:lv-alert-blink 1.2s linear 2}@keyframes lv-alert-blink{0%,100%{opacity:.85}50%{opacity:0}}@media (prefers-reduced-motion:reduce){.lv-alert-line .chip.blinking{animation:none}}'}</style>
      {rows.map(row => {
        const shown = currentDrag?.key === rowKey(row) ? currentDrag.price : row.price, y = projection.priceToY(shown) - projection.top;
        if (!Number.isFinite(y) || y < -10 || y > projection.height + 10) return null;
        // The chip's laid-out place, with a leader back to its line when it moved up or down.
        const blinkStart = blink.current.startedAt(row.alertId, Date.now()), blinkKey = 'chip-' + (blinkStart ?? 0);
        const spot = labelSpots.get(rowKey(row)), offset = spot ? spot.center - y : 0, dx = spot?.dx ?? 0, dragging = currentDrag?.key === rowKey(row);
        const right = (spot?.side ?? (projection.scaleSide === 'left' ? 'left' : 'right')) === 'right';
        const chipStyle: React.CSSProperties = { ...(offset ? { marginTop: offset } : {}), ...(right ? { left: 'auto', right: ALERT_CHIP_AXIS_GAP - dx } : { left: ALERT_CHIP_AXIS_GAP + dx }) };
        return (
          <div key={rowKey(row)} className={'lv-alert-line' + (props.drawLine === false ? '' : ' drawn') + (dragging ? ' dragging' : '')} style={dragging ? { top: y, zIndex: 2 } : { top: y }} data-price={shown} {...(offset || dx ? { 'data-label-moved': 'true' } : {})}>
            {offset !== 0 && <span className="leader" aria-hidden="true" style={{ ...(right ? { right: ALERT_CHIP_AXIS_GAP - dx + 4 } : { left: ALERT_CHIP_AXIS_GAP + dx + 4 }), top: Math.min(0, offset), height: Math.abs(offset) }}/>}
            <span key={blinkKey} className={'chip' + (blinkStart !== null ? ' blinking' : '')} data-alert-state={row.state ?? 'active'} {...(row.labelVisible === false ? { 'data-label-hidden': 'true' } : {})} role="slider" tabIndex={0} data-alert-line={row.alertId} aria-label={`Move alert line ${row.name}`} aria-valuenow={shown} title="Drag to change this alert's price. Arrow keys move it one tick." onPointerDown={begin(row)} onKeyDown={keyMove(row)} style={chipStyle}>{alertChipText(row, currentDrag)}</span>
            {/* With no free place the tag still shows at its price (the alert tag is never dropped), marked as overlapping. */}<span className="axis-tag" aria-hidden="true" {...(spots?.get(rowKey(row))?.hidden ? { 'data-tag-overlap': 'true' } : {})} {...(axisTagOffset(spots?.get(rowKey(row))) ? { 'data-tag-moved': 'true', style: { marginTop: axisTagOffset(spots?.get(rowKey(row))) } } : {})}>{shown.toFixed(Math.min(8, new Decimal(latest.current.tickSize).decimalPlaces()))}</span>
          </div>
        );
      })}
    </div>
  );
}
