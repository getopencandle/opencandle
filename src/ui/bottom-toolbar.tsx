import React,{useEffect,useRef,useState} from 'react';
import {GoToDateIcon,ChevronDownIcon} from './icons';
import {BOTTOM_ADJ,BOTTOM_GO_TO,BOTTOM_SESSION,BOTTOM_RANGES,BOTTOM_RANGE_MENU,BOTTOM_TIMEZONE,adjustmentButton,bottomRangesCollapsed,formatToolbarClock,resolveTimezoneChoice,timezoneMenuRows,type BottomRange} from '../chart/bottom-toolbar';
import type {RangePreset} from '../chart/navigation';
import {runIdleSteps} from './startup-idle';

type ServedRow={interval:string;tooltip:string}|null;
type ServedMap=Partial<Record<RangePreset,ServedRow>>;
/** The range tooltips as one thunk per row. Answering them aggregates every range interval of the chart's data
 * (about 100 ms on a cold cache), so App hands them over unevaluated and the toolbar answers them in idle slices. */
export interface LazyServed{readonly lazyRows:ReadonlyArray<readonly [RangePreset,()=>ServedRow]>}
export function lazyServedRows(rows:ReadonlyArray<readonly [RangePreset,()=>ServedRow]>):LazyServed{return{lazyRows:rows};}
const isLazyServed=(value:unknown):value is LazyServed=>!!value&&typeof value==='object'&&Array.isArray((value as {lazyRows?:unknown}).lazyRows);

/** Bottom toolbar: date ranges, Go to date, timezone and adjustment.
 * The %, log and auto toggles stay out; see price-scale-toolbar.tsx. */
export interface ChartBottomToolbarProps {
 /** False while no chart is open: every chart action is disabled. */
 chartReady:boolean;
 timezone:string;
 /** The chart hour cycle (scales.timeHours); the clock reads "8:18:04 PM UTC-7" on 12-hours. Default 24-hours. */
 timeHours?:'24'|'12';
 exchangeTimezone?:string|null;
 adjustment:string;
 /** Pressed range button, or null. */
 activeRange?:RangePreset|null;
 /** Measured toolbar width; below the full width the ranges collapse into one menu. */
 availableWidth?:number;
 now?:()=>number;
 /** Chosen range: the host switches to `row.interval` when it can and shows the range. */
 onRange(row:BottomRange):void;
 /** Per preset, the interval the button opens on this chart's data and its tooltip; null disables it. */
 served?:ServedMap|LazyServed;
 onGoTo():void;
 onTimezone(zone:string):void;
 onMessage?(message:string):void;
 /** Session mode of the active chart; absent when its bars have no sessions (the ETH button is then left out). */
 session?:'regular'|'extended';
 onSession?(mode:'regular'|'extended'):void|Promise<void>;
 /** Availability is presentation only; the existing source transaction still validates the action. */
 sessionDisabled?:boolean;sessionReason?:string;sessionOwner?:unknown;
 /** Chart settings > Symbol > "Adjust data for dividends". With onAdjust, ADJ toggles it on a source with a dividend basis. */
 dividendsAdjustment?:boolean;
 onAdjust?(next:boolean):void;
}
type Popup='ranges'|'timezone'|null;

export function ChartBottomToolbar(props:ChartBottomToolbarProps){
 const now=props.now??Date.now;
 const [clock,setClock]=useState(()=>now());
 const [popup,setPopup]=useState<Popup>(null);
 // The toolbar clips its overflow, so an absolutely placed menu opened invisibly. Menus are placed
 // fixed against the button that opened them (escapes the clip; no portal, so outside-click and focus stay in the root).
 const [anchor,setAnchor]=useState<{top:number;left:number;right:number}|null>(null);
 const toggle=(next:Exclude<Popup,null>,target:EventTarget|null)=>{if(popup===next){setPopup(null);return;}try{const box=(target as HTMLElement|null)?.getBoundingClientRect?.();setAnchor(box?{top:box.top,left:box.left,right:box.right}:null);}catch{setAnchor(null);}setPopup(next);};
 const placed=(side:'left'|'right'):React.CSSProperties|undefined=>{if(!anchor)return undefined;const win=root.current?.ownerDocument?.defaultView;const width=win?.innerWidth??0,height=win?.innerHeight??0;if(!width||!height)return undefined;return{position:'fixed',top:'auto',bottom:Math.max(0,height-anchor.top+4),left:side==='left'?Math.max(4,anchor.left):'auto',right:side==='right'?Math.max(4,width-anchor.right):'auto',maxHeight:Math.max(160,Math.min(480,anchor.top-12))};};
 const root=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{const id=setInterval(()=>setClock(now()),1000);return()=>clearInterval(id);},[now]);
 useEffect(()=>{
  if(!popup)return;
  const doc=root.current?.ownerDocument;if(!doc)return;
  const outside=(event:Event)=>{if(!root.current?.contains(event.target as Node))setPopup(null);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setPopup(null);}};
  doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',key);
  return()=>{doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',key);};
 },[popup]);
 // Appended after all five existing hooks. No optimistic session-mode change.
 const [sessionState,setSessionState]=useState({pending:false,error:'',owner:props.sessionOwner,mode:props.session});
 const sessionFlight=useRef({live:true,busy:false,epoch:{},props});sessionFlight.current.props=props;
 useEffect(()=>{sessionFlight.current.live=true;return()=>{sessionFlight.current.live=false;sessionFlight.current.epoch={};};},[]);
 const sessionShown=props.session!==undefined&&!!props.onSession,sessionDisabled=!props.chartReady||!!props.sessionDisabled||!!props.sessionReason||sessionState.pending;
 const sessionError=sessionState.owner===props.sessionOwner&&sessionState.mode===props.session?sessionState.error:'';
 const changeSession=()=>{const flight=sessionFlight.current,callback=props.onSession;if(flight.busy||sessionDisabled||!callback||props.session===undefined)return;const epoch={},owner=props.sessionOwner,mode=props.session;flight.busy=true;flight.epoch=epoch;setSessionState({pending:true,error:'',owner,mode});const finish=(cause?:unknown)=>{if(!flight.live||flight.epoch!==epoch)return;flight.busy=false;setSessionState({pending:false,error:flight.props.sessionOwner===owner&&cause?(cause instanceof Error?cause.message:String(cause)):'',owner,mode});};try{Promise.resolve(callback(mode==='extended'?'regular':'extended')).then(()=>finish(),finish);}catch(cause){finish(cause);}};
 // Lazy tooltips resolve once a chart is open, a few rows per idle slice. Until the first set resolves the buttons
 // show the plain row tooltip and stay enabled (the click resolves the interval itself). A newer set keeps showing the previous
 // answers until it resolves, as PERF5's deferred copy did.
 const lazy=isLazyServed(props.served)?props.served:null,[lazyAnswers,setLazyAnswers]=useState<{from:LazyServed;map:ServedMap}|null>(null);
 useEffect(()=>{if(!lazy||!props.chartReady)return;const map:ServedMap={};return runIdleSteps(lazy.lazyRows.map(([preset,answer])=>()=>{map[preset]=answer();}),()=>setLazyAnswers({from:lazy,map}));},[lazy,props.chartReady]);
 const servedMap:ServedMap|undefined=lazy?lazyAnswers?.map:props.served as ServedMap|undefined;
 const collapsed=bottomRangesCollapsed((props.availableWidth??Number.POSITIVE_INFINITY)-(sessionShown?112:0),sessionShown);
 const clockText=formatToolbarClock(clock,props.timezone,props.timeHours)??props.timezone;
 const adj=adjustmentButton(props.adjustment,props.dividendsAdjustment),adjOn=adj.toggle&&props.chartReady&&!!props.onAdjust;
 const range=(row:BottomRange)=>{setPopup(null);props.onRange(row);};
 const zone=(value:string)=>{setPopup(null);try{props.onTimezone(resolveTimezoneChoice(value,props.exchangeTimezone));}catch(error){props.onMessage?.(error instanceof Error?error.message:String(error));}};
 const served=(row:BottomRange)=>servedMap?.[row.preset],tip=(row:BottomRange)=>{const s=served(row);return s===null?row.tooltip.split(' in ')[0]+': not available for this data':s?.tooltip??row.tooltip;},off=(row:BottomRange)=>!props.chartReady||served(row)===null;
 const rangeButton=(row:BottomRange)=><button key={row.preset} type="button" data-name={row.dataName} data-lv-fact={row.factId} title={tip(row)} aria-label={tip(row)} aria-pressed={props.activeRange===row.preset} className={props.activeRange===row.preset?'active':undefined} disabled={off(row)} onClick={()=>range(row)}>{row.label}</button>;
 return <div className="chart-bottom lv-bottom-toolbar" ref={root} role="toolbar" aria-label="Chart bottom toolbar">
  {collapsed
   ?<div className="ranges lv-bottom-ranges-collapsed"><button type="button" data-name={BOTTOM_RANGE_MENU.dataName} data-lv-fact={BOTTOM_RANGE_MENU.factId} aria-haspopup="menu" aria-expanded={popup==='ranges'} disabled={!props.chartReady} onClick={event=>toggle('ranges',event?.currentTarget??null)}>{BOTTOM_RANGE_MENU.label}<ChevronDownIcon/></button>
    {popup==='ranges'&&<div role="menu" aria-label={BOTTOM_RANGE_MENU.label} className="lv-bottom-menu" style={placed('left')}>{BOTTOM_RANGES.map(row=><button key={row.preset} type="button" role="menuitemradio" aria-checked={props.activeRange===row.preset} data-name={row.dataName} disabled={off(row)} onClick={()=>range(row)}><span>{row.label}</span><span className="lv-bottom-menu-hint">{tip(row)}</span></button>)}</div>}</div>
   :<div className="ranges" role="group" aria-label="Date ranges">{BOTTOM_RANGES.map(rangeButton)}</div>}
  <span className="toolbar-divider" aria-hidden="true"/>
  <button type="button" className="lv-icon-button" data-name={BOTTOM_GO_TO.dataName} data-lv-fact={BOTTOM_GO_TO.factId} title={BOTTOM_GO_TO.tooltip} aria-label={BOTTOM_GO_TO.label} disabled={!props.chartReady} onClick={props.onGoTo}><GoToDateIcon/></button>
  <span className="topbar-spacer"/>
  <div className="lv-bottom-timezone">
   <button type="button" data-name={BOTTOM_TIMEZONE.dataName} data-lv-fact={BOTTOM_TIMEZONE.factId} title={BOTTOM_TIMEZONE.tooltip} aria-label={BOTTOM_TIMEZONE.tooltip+': '+props.timezone} aria-haspopup="menu" aria-expanded={popup==='timezone'} onClick={event=>toggle('timezone',event?.currentTarget??null)}><span className="lv-bottom-clock">{clockText}</span></button>
   {popup==='timezone'&&<div role="menu" aria-label={BOTTOM_TIMEZONE.tooltip} className="lv-bottom-menu lv-bottom-menu-up" style={placed('right')} data-lv-approximation="timezone-menu-contents-unobserved">{timezoneMenuRows(props.timezone,{exchangeTimezone:props.exchangeTimezone,at:new Date(clock)}).map(row=><button key={row.value} type="button" role="menuitemradio" aria-checked={row.checked} aria-disabled={row.disabled?true:undefined} title={row.disabled} onClick={()=>{if(!row.disabled)zone(row.value);}}><span aria-hidden="true" className="lv-bottom-menu-check">{row.checked?'✓':''}</span><span>{row.label}</span></button>)}</div>}
  </div>
  <span className="toolbar-divider" aria-hidden="true"/>
  {sessionShown&&<span style={{position:'relative',display:'inline-flex',minWidth:148,flexShrink:0}}><button type="button" data-name={BOTTOM_SESSION.dataName} title={props.sessionReason??(sessionState.pending?'Updating trading hours...':BOTTOM_SESSION.tooltip[props.session!])} aria-label="Extended trading hours" aria-pressed={props.session==='extended'} aria-busy={sessionState.pending||undefined} disabled={sessionDisabled} style={{minWidth:148,whiteSpace:'nowrap'}} className={'lv-bottom-session'+(props.session==='extended'?' active':'')} onClick={changeSession}>{props.session==='extended'?'Extended hours: On':'Extended hours: Off'}</button>{(sessionError||props.sessionReason||sessionState.pending)&&<span role={sessionError?'alert':'status'} style={{position:'absolute',bottom:'calc(100% + 4px)',right:0,maxWidth:320,padding:'6px 8px',fontSize:12,whiteSpace:'normal',borderRadius:4,background:'var(--lv-bg-tooltip)',color:'var(--lv-tooltip-text)',zIndex:7}}>{sessionError||props.sessionReason||'Updating trading hours...'}</span>}</span>}
  <button type="button" data-name={BOTTOM_ADJ.dataName} data-lv-fact={BOTTOM_ADJ.factId} title={adjOn?adj.tooltip:adj.tooltip+'. '+adj.disabled} aria-label={adj.tooltip} aria-pressed={adj.pressed} aria-disabled={adjOn?undefined:true} className={'lv-bottom-adj'+(adj.pressed?' active':'')} onClick={adjOn?()=>props.onAdjust!(adj.next):undefined}>{adj.label}</button>
 </div>;
}
