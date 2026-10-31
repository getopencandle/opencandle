import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {chartBuildStaggered,noteChartMounting,queueChartBuild} from './chart-build-queue';
import {useStructuralValue} from './use-structural-value';
import {ChartContextMenu} from './ChartContextMenu';
import type {Instrument} from '../domain/types';
import type {ChartMenuSnapshot,ChartContextActions} from '../chart/context-menu';
import type {Bar} from '../domain/types';
import {createChartProbe,type ChartController,type ChartSourceContext} from '../chart/adapter';
import {createContextMenuExecution} from '../chart/context-menu-execution';
import type {PricePlusRequest} from '../chart/price-scale-plus';
import {serializeAppearance,type ChartAppearance} from './themes';
import {chartInputCommitted,type ChartInputSnapshot} from '../chart/input-visibility';
import {chartSourceContextKey,sameChartSourceBasis} from '../chart/source-context';
import {barInputIdentity,liveLineageOf,sameBarsInput} from '../chart/bar-input-identity';
import {acceptChartExecutionInput} from '../chart/execution-input-lifecycle';
import {retireChart} from '../chart/chart-retirement';
import {connectDrawingPreferences,type DrawingPreferences} from './drawing-preferences';
import {installChartKeyForwarding} from './chart-key-forward';
import {installToolbarTooltips} from './toolbar-tooltip';
import {plainErrorText,stripErrorPrefix} from './user-error';
export interface ChartPanelContextOwner {cellId:string;treeOwner:object;instrument:Instrument;executionIdentity:string;beforeOpen:()=>boolean;ownerCurrent:()=>boolean;
  /** When the open was refused only because the routine background autosave holds the chart tree,
   registers retry to run once that hold ends and returns its cancel; otherwise null (the refusal stands). The grid keeps one
   waiter: a newer registration calls the older one's supersede, which cancels that deferral. */
  afterHold?:(retry:()=>void,supersede:()=>void)=>(()=>void)|null}
/** How long a deferred context-menu open waits for the background hold (the held-key gate's bound). */
export const CONTEXT_MENU_HOLD_WAIT_MS=10000;
/** How long a right-click waits for the chart input being written before it gives up. */
export const CONTEXT_MENU_INPUT_WAIT_MS=2000;
/** How long a refused open's message stays up. */
export const CONTEXT_MENU_NOTICE_MS=6000;
export const CONTEXT_MENU_LOADING_TEXT='The chart is still loading. Try the menu again in a moment.';
export const CONTEXT_ACTION_FAILED_TEXT="That action didn't work. Try again.";
export const CONTEXT_MENU_UNAVAILABLE_TEXT='The menu could not open here. Try again in a moment.';
/** Native geometry reader wording is a developer diagnostic: it goes to the console and the user sees a plain sentence. */
const INTERNAL_CONTEXT_REFUSAL=/^(Pinned native|Native |No native|Context pointer is outside)/;
export function contextMenuRefusalText(cause:unknown):string{const text=plainErrorText(cause);if(!text||INTERNAL_CONTEXT_REFUSAL.test(text)){try{console.debug('[chart context] menu refused:',cause);}catch{/* no console */}return CONTEXT_MENU_UNAVAILABLE_TEXT;}return text;}
/** The refusal notice sits above the canvas (the canvas is absolutely positioned and would cover an in-flow message). */
export const CONTEXT_MENU_NOTICE_STYLE:React.CSSProperties={position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:20,maxWidth:'calc(100% - 32px)',boxSizing:'border-box',padding:'6px 12px',borderRadius:'var(--lv-radius-plate,4px)',border:'1px solid var(--lv-border)',background:'var(--lv-bg-raised)',color:'var(--lv-text-primary)',fontSize:12,boxShadow:'var(--lv-shadow)',pointerEvents:'none'};
export function ChartPanel({bars,appearance,style,source,onReady,onUnavailable,drawingPreferences,onDrawingPreferencesChange,contextActions,contextOwner}:{onUnavailable?:(message:string)=>void;contextOwner?:ChartPanelContextOwner;contextActions?:ChartContextActions;drawingPreferences?:DrawingPreferences;onDrawingPreferencesChange?:(value:DrawingPreferences)=>boolean|void;bars:Bar[];appearance:ChartAppearance;style:string;source:ChartSourceContext;onReady:(controller:ChartController|null,input?:ChartInputSnapshot,executionIdentity?:string)=>void}){
  const menuOwner=useRef<ChartMenuSnapshot|null>(null);
  const [menu,setMenu]=useState<ChartMenuSnapshot|null>(null),[menuError,setMenuError]=useState('');
  const panel=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null),controller=useRef<ChartController|null>(null),[error,setError]=useState(''),[committed,setCommitted]=useState<ChartInputSnapshot|null>(null),[updating,setUpdating]=useState(true),[preferenceError,setPreferenceError]=useState('');
  const latestPreferences=useRef({drawingPreferences,onDrawingPreferencesChange});latestPreferences.current={drawingPreferences,onDrawingPreferencesChange};
  const executionIdentity=contextOwner?.executionIdentity??'ordinary';
  const [committedExecution,setCommittedExecution]=useState<string|null>(null);
  const initial=useRef({bars,appearance,style,source,onReady}),latestReady=useRef(onReady);latestReady.current=onReady;
  // A chart that never constructs, or never becomes ready, can never call onReady; tell the owning cell so it can show the failure.
  // Terminal reports (no chart, or a rejected ready()) stop this panel instance from ever calling onReady; Reopen remounts it.
  // Non-terminal reports (an apply that threw after a successful build, or a rejected input before the first accepted one) clear when a later input reaches onReady.
  const latestUnavailable=useRef(onUnavailable);latestUnavailable.current=onUnavailable;
  const lifecycle=useRef({ready:false,terminal:false});
  const reportUnavailable=(message:string,terminal:boolean)=>{if(lifecycle.current.terminal)return;if(terminal)lifecycle.current.terminal=true;latestUnavailable.current?.(message);};
  // Panels that mount in one commit (a layout switch) build one per task; `built` re-runs the effects below once a queued build lands.
  const [built,setBuilt]=useState(false);
  useLayoutEffect(()=>{noteChartMounting();},[]);
  useEffect(()=>{
    let disposed=false;let release:(()=>void)|undefined;let cancelBuild:(()=>void)|undefined;
    const build=(queued:boolean)=>{
    try{const probe=createChartProbe(host.current!,initial.current.bars,initial.current.source);controller.current=probe.controller;release=probe.dispose;probe.controller.applyAppearance(serializeAppearance(initial.current.appearance));probe.controller.setStyle(initial.current.style);probe.controller.ready().catch(e=>{if(disposed)return;const message=String(e);setError(message);reportUnavailable(message,true);});}
    catch(e){const message=e instanceof Error?e.message:String(e);setError(message);reportUnavailable(message,controller.current===null);}
    if(queued&&!disposed)setBuilt(true);
    };
    if(chartBuildStaggered())cancelBuild=queueChartBuild(()=>{if(!disposed)build(true);});else build(false);
    return()=>{cancelBuild?.();retireChart({retire(){disposed=true;controller.current=null;},ready(){initial.current.onReady(null);},dispose(){release?.();},report(message){console.error(message);}});};
  },[]);
  useEffect(()=>{const chart=controller.current;if(!chart||!latestPreferences.current.drawingPreferences)return;try{return connectDrawingPreferences(chart.drawingPreferences,()=>latestPreferences.current.drawingPreferences!,value=>{if(controller.current!==chart)return false;const notify=latestPreferences.current.onDrawingPreferencesChange;if(notify?.(value)===false)return false;latestPreferences.current={...latestPreferences.current,drawingPreferences:value};return true;},e=>setPreferenceError(plainErrorText(e)));}catch(e){setPreferenceError(plainErrorText(e));}},[!!drawingPreferences,built]);
  useLayoutEffect(()=>{if(!drawingPreferences)return;try{controller.current?.drawingPreferences.apply({magnet:drawingPreferences.magnet,stay:drawingPreferences.stay});setPreferenceError('');}catch(e){setPreferenceError(plainErrorText(e));}},[drawingPreferences,built]);
  const sourceKey=chartSourceContextKey(source);
  // A newer snapshot of the committed live input keeps the canvas visible while it is written.
  const latestCommitted=useRef(committed);latestCommitted.current=committed;
  // A newer snapshot of the input being written waits for that write instead of cancelling it. Before,
  // a first live write slower than the stream was cancelled by every snapshot and the chart never committed (stayed hidden).
  // One write is in flight per panel; when it settles, the newest snapshot is written (writeKick).
  const writeRun=useRef<{bars:readonly Bar[];source:ChartSourceContext;style:string;execution:string;done:boolean}|null>(null);
  const latestInput=useRef(bars);latestInput.current=bars;
  const [writeKick,setWriteKick]=useState(0);
  useEffect(()=>()=>{writeRun.current=null;},[]);
  useEffect(()=>{const chart=controller.current;if(!chart||lifecycle.current.terminal){writeRun.current=null;return;}
   const active=writeRun.current;
   if(active&&!active.done&&active.execution===executionIdentity&&active.style===style&&sameBarsInput(active.bars,bars)&&sameChartSourceBasis(active.source,source,true))return;
   // The not-yet-connected live shell (0 bars, already on the feed lineage) is never written. A renderer write
   // of zero bars never settles and would block the backfill behind it; the chart stays hidden until the first bars arrive.
   if(bars.length===0&&liveLineageOf(bars)){writeRun.current=null;setUpdating(true);setError('');return;}
   const prior=latestCommitted.current,growth=!!prior&&sameBarsInput(prior.bars,bars)&&prior.style===style&&sameChartSourceBasis(prior.source,source,true);if(!growth){setUpdating(true);setError('');}
   const run={bars,source,style,execution:executionIdentity,done:false};writeRun.current=run;const current=()=>writeRun.current===run;
   const settle=()=>{run.done=true;if(current()&&latestInput.current!==run.bars)setWriteKick(value=>value+1);};
   acceptChartExecutionInput(chart,{bars,source,style},executionIdentity,current).then(result=>{if(!current()||!result.accepted||lifecycle.current.terminal){settle();return;}lifecycle.current.ready=true;setUpdating(false);setCommitted(result.input);setCommittedExecution(result.executionIdentity);setError('');latestReady.current(chart,result.input,result.executionIdentity);settle();}).catch(e=>{if(current()){setUpdating(false);const message=String(e);setError(message);if(!lifecycle.current.ready)reportUnavailable(message,false);}settle();});
  },[bars,sourceKey,style,executionIdentity,writeKick,built]);
  // Re-applied when the appearance value changes, not on each new copy of it.
  const appliedAppearance=useStructuralValue(appearance);
  useEffect(()=>{controller.current?.applyAppearance(serializeAppearance(appliedAppearance));},[appliedAppearance,built]);
  // Chart keys pressed on a plain toolbar button (for example the opener a closed dialog refocused) reach the
  // active chart, and the toolbars show LV tooltips with hotkeys. Both are installed once per document while any chart is mounted.
  useEffect(()=>{const keys=installChartKeyForwarding(),tips=installToolbarTooltips();return()=>{keys();tips();};},[]);
  // Observe() always delivers once at the start. That first delivery skips the resize when the host still has the
  // size (and device pixel ratio) it had when the chart was built in the effect above, which the renderer has already sized
  // to. Every later delivery, and a first one at another size, resizes as before.
  useEffect(()=>{const node=host.current,built=controller.current;let first=node&&built?{w:node.clientWidth,h:node.clientHeight,dpr:window.devicePixelRatio||1}:null;
   const observer=new ResizeObserver(()=>{const at=first;first=null;if(at&&node&&controller.current===built&&node.clientWidth===at.w&&node.clientHeight===at.h&&(window.devicePixelRatio||1)===at.dpr)return;controller.current?.resize();});if(node)observer.observe(node);return()=>observer.disconnect();},[built]);
  const pending=updating||committedExecution!==executionIdentity||!chartInputCommitted(committed,{bars,source,style});
  const focusTarget=React.useCallback(()=>panel.current,[]);
  /** A refused menu choice: the menu has closed; its reason shows in the chart notice (internal wording becomes a plain retry line). */
  const reportMenuFailure=React.useCallback((message:string)=>{const text=plainErrorText(message);setMenuError(!text||INTERNAL_CONTEXT_REFUSAL.test(text)?CONTEXT_ACTION_FAILED_TEXT:text);},[]);
  const closeMenu=React.useCallback((expected?:ChartMenuSnapshot)=>{if(expected&&menuOwner.current!==expected)return;menuOwner.current=null;controller.current?.contextMenu.retire();setMenu(null);},[]);
  // A right-click refused only by the background autosave's tree hold opens once the hold ends, with every
  // check run again then. A newer open request, an input change or unmount cancels it.
  const deferredOpen=useRef<{token:object;cancel:()=>void}|null>(null),latestOpen=useRef<(client:{x:number;y:number}|null)=>void>(()=>{});
  const latestPlus=useRef<(request:PricePlusRequest)=>{ok:boolean;message?:string}>(()=>({ok:false}));
  // A right-click that lands while a new input is still being written (live updates write often) waits for that write and
  // then opens, instead of being refused. It gives up after CONTEXT_MENU_INPUT_WAIT_MS with a visible message.
  const waitingOpen=useRef<{client:{x:number;y:number}|null;timer:ReturnType<typeof setTimeout>}|null>(null);
  const cancelWaitingOpen=()=>{const waiting=waitingOpen.current;waitingOpen.current=null;if(waiting)clearTimeout(waiting.timer);};
  const cancelDeferredOpen=()=>{cancelWaitingOpen();const held=deferredOpen.current;deferredOpen.current=null;held?.cancel();};
  // Live growth (same input identity) never closes an open context menu.
  const inputToken=barInputIdentity(bars);
  useEffect(()=>{cancelDeferredOpen();closeMenu();},[inputToken,sourceKey,style,executionIdentity,closeMenu]);
  useEffect(()=>()=>cancelDeferredOpen(),[]);
  /** Defers one open. The token is checked when the retry runs, so a retry the grid already copied cannot run after a
   cancel, a replacement or unmount. The deferral ends at once on a click elsewhere, Escape, blur, scroll or resize, and
   after CONTEXT_MENU_HOLD_WAIT_MS with a visible refusal; it never opens at a stale position. */
  const deferOpen=(client:{x:number;y:number}|null):boolean=>{
   const owner=contextOwner;if(!owner?.afterHold)return false;
   const token={};let off:(()=>void)|null=null,timer:ReturnType<typeof setTimeout>|undefined,listening:Array<()=>void>=[];
   const teardown=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;for(const stop of listening.splice(0))stop();};
   const cancel=()=>{teardown();const release=off;off=null;release?.();if(deferredOpen.current?.token===token)deferredOpen.current=null;};
   const retry=()=>{if(deferredOpen.current?.token!==token)return;deferredOpen.current=null;teardown();off=null;latestOpen.current(client);};
   const release=owner.afterHold(retry,()=>{if(deferredOpen.current?.token===token)cancelDeferredOpen();});
   if(!release)return false;
   off=release;deferredOpen.current={token,cancel};
   const listen=(target:EventTarget|undefined,type:string,handler:(event:Event)=>void,capture=false)=>{if(!target)return;target.addEventListener(type,handler,capture);listening.push(()=>target.removeEventListener(type,handler,capture));};
   const doc=typeof document==='undefined'?undefined:document,win=typeof window==='undefined'?undefined:window;
   const dismiss=()=>{if(deferredOpen.current?.token===token)cancelDeferredOpen();};
   listen(doc,'pointerdown',dismiss,true);listen(doc,'keydown',event=>{if((event as KeyboardEvent).key==='Escape')dismiss();},true);listen(doc,'scroll',dismiss,true);listen(win,'blur',dismiss);listen(win,'resize',dismiss);
   timer=setTimeout(()=>{if(deferredOpen.current?.token!==token)return;cancelDeferredOpen();setMenuError('Context menu unavailable: the workspace is still saving. Try again in a moment.');},CONTEXT_MENU_HOLD_WAIT_MS);
   return true;
  };
  const openMenu=(client:{x:number;y:number}|null)=>{cancelDeferredOpen();try{const chart=controller.current;
   if(chart&&contextOwner&&contextActions&&!error&&!lifecycle.current.terminal&&(pending||!committed)){
    const timer=setTimeout(()=>{if(waitingOpen.current?.timer!==timer)return;waitingOpen.current=null;setMenuError(CONTEXT_MENU_LOADING_TEXT);},CONTEXT_MENU_INPUT_WAIT_MS);
    waitingOpen.current={client,timer};setMenuError('');return;}
   if(pending||!chart||!committed||!contextOwner||!contextActions)throw Error(CONTEXT_MENU_LOADING_TEXT);
   // Only a refusal from beforeOpen (the background hold) may be deferred; a stale owner refuses at once.
   if(!contextOwner.beforeOpen()){if(deferOpen(client)){setMenuError('');return;}throw Error('Context target is not ready. Wait for this chart input to commit.');}
   if(!contextOwner.ownerCurrent())throw Error('Context target is not ready. Wait for this chart input to commit.');
   const snapshot=chart.contextMenu.capture({...contextOwner,input:committed,client});menuOwner.current=snapshot;setMenuError('');setMenu(snapshot);}catch(cause){closeMenu();setMenuError(contextMenuRefusalText(cause));}};
  latestOpen.current=openMenu;
  useEffect(()=>{const waiting=waitingOpen.current;if(!waiting||pending||!committed)return;cancelWaitingOpen();latestOpen.current(waiting.client);},[pending,committed]);
  useEffect(()=>()=>cancelWaitingOpen(),[]);
  // A refused open says why where it can be seen (above the chart canvas), then clears.
  useEffect(()=>{if(!menuError)return;const timer=setTimeout(()=>setMenuError(current=>current===menuError?'':current),CONTEXT_MENU_NOTICE_MS);return()=>clearTimeout(timer);},[menuError]);
  // The price scale + menu's alert and paper order rows run through the same context snapshot path.
  latestPlus.current=request=>{try{const chart=controller.current;
   if(pending||!chart||!committed||!contextOwner||!contextActions||!contextOwner.beforeOpen()||!contextOwner.ownerCurrent())return{ok:false,message:'Context target is not ready. Wait for this chart input to commit.'};
   closeMenu();const snapshot=chart.contextMenu.capture({...contextOwner,input:committed,client:request.client});menuOwner.current=snapshot;
   const execution=createContextMenuExecution(snapshot,{current:()=>menuOwner.current===snapshot,actions:()=>contextActions,close:()=>closeMenu(snapshot),error:setMenuError,busy:()=>{}});
   const preset=request.action==='order'&&request.side&&request.orderType?{order:{side:request.side,orderType:request.orderType}}:undefined;
   void execution.execute(request.action==='alert'?'price-alert':'paper-ticket',preset).finally(()=>{execution.dispose();closeMenu(snapshot);});return{ok:true};
  }catch(cause){return{ok:false,message:String(cause)};}};
  // Shift+Alt+B / Shift+Alt+S place a limit order at the price under the pointer through the same price-scale + path.
  // Only the panel the pointer is over answers; the App event carries the answer back.
  const pointerAt=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{const node=panel.current;if(!node)return;const move=(event:PointerEvent)=>{pointerAt.current={x:event.clientX,y:event.clientY};},leave=()=>{pointerAt.current=null;};
   const order=(event:Event)=>{const detail=(event as CustomEvent<{side:'buy'|'sell';handled:boolean;result?:{ok:boolean;message?:string}}>).detail,at=pointerAt.current;if(!detail||detail.handled||!at)return;detail.handled=true;detail.result=latestPlus.current({action:'order',side:detail.side,orderType:'limit',price:0,client:at,paneId:'price'});};
   node.addEventListener('pointermove',move);node.addEventListener('pointerleave',leave);window.addEventListener('lv:cursor-order',order);
   return()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerleave',leave);window.removeEventListener('lv:cursor-order',order);};},[]);
  useEffect(()=>{const chart=controller.current;if(!chart||typeof chart.priceScale?.bindPlus!=='function')return;let release:(()=>void)|undefined;
   try{release=chart.priceScale.bindPlus(request=>latestPlus.current(request));}catch(cause){setMenuError(plainErrorText(cause));}return()=>release?.();},[committed]);
  return <div className="chart-panel" ref={panel} tabIndex={0} onContextMenu={event=>{if(event.defaultPrevented||(event.target as Element|null)?.closest?.('[data-lv-context-menu],[data-lv-chart-menu-notice]'))return;event.preventDefault();openMenu({x:event.clientX,y:event.clientY});}} onKeyDown={event=>{if(!event.nativeEvent.isComposing&&(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)&&!(event.target as Element).closest('[data-lv-context-menu]')){event.preventDefault();event.stopPropagation();openMenu(null);}}} onBlur={event=>{const next=event.relatedTarget as Node|null;if(next&&panel.current?.contains(next))return;cancelDeferredOpen();}} data-testid="chart-panel" data-bars={bars.length} aria-busy={pending&&!error}><div className="chart-canvas" ref={host} style={{visibility:pending?'hidden':'visible'}}/>{error||preferenceError?<div className="chart-error" role="alert">Chart unavailable: {stripErrorPrefix(error||preferenceError)}</div>:pending&&<div className="chart-error" role="status">Loading chart...</div>}{menu&&contextActions&&<ChartContextMenu focusTarget={focusTarget} snapshot={menu} actions={contextActions} onClose={closeMenu} onFailure={reportMenuFailure}/>} {menuError&&<output role="alert" data-lv-chart-menu-notice="" style={CONTEXT_MENU_NOTICE_STYLE}>{menuError}</output>}</div>;
}
