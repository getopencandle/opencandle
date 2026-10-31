// Price scale port: reads and changes each pane's scale on the pinned Vela renderer,
// routes right-clicks on the price axis to the price scale menu, handles the
// Alt+I/P/L/R hotkeys and the axis A/L buttons, and keeps the price-to-bar lock.
import type {AppearanceSettings} from './appearance';
import {defaultPriceScaleSettings,bandScale,lockedWindow,modeFromVela,nextScaleMode,priceToBarRatio,seriesOnlyWindow,validatePriceScaleSettings,velaScaleFor,DEFAULT_PANE_SCALE,type PaneScaleView,type PriceScaleModeId,type PriceScaleSettings} from './price-scale-state';
import {focusableEntries,priceScaleHotkey,priceScaleMenuEntries,priceScaleToolbarButtons,type PriceScaleActionId,type PriceScaleHotkeyAction,type PriceScaleMenuEntry,type PriceScaleMenuItem,type PriceScaleSubmenu,type PriceScaleToolbarButton} from './price-scale-menu';
import {mountPriceScaleMenu,placePriceScaleMenu,submenuKey,type PriceScaleMenuMount,type PriceScaleMenuViewProps,type PriceScaleSubmenuId} from './price-scale-menu-view';
import {pricePlusMenu,pricePlusRequest,PLUS_BUTTON_PX,type PricePlusAction,type PricePlusItem,type PricePlusMount,type PricePlusRequest} from './price-scale-plus';
import {mountPricePlus} from './price-scale-plus-view';
import {axisMintick,clearTickLabels,reservedAxisPanes,reservedAxisRanges,roundToTick,subscribeReservedAxisRanges,tickDecimals as tickDecimalsOf} from './axis-labels';
import {precisionAxisTicks,precisionMintick,type PrecisionAxisTicks} from './symbol-precision';

/** Factory-owned descriptive precision. This is not price/source/readout authority. */
export interface PriceScaleDisplayPrecision {readonly precision:string|undefined;assertCurrent():void}
interface PriceScalePrecisionState {active:boolean;ready:boolean;precision:string|undefined;epoch:object;attempt:object|null}
const displayPrecisions=new WeakMap<object,PriceScalePrecisionState>();
/** The retained receipt closes only over this small primitive state, never the native port/chart activation. */
function precisionReceipt(state:PriceScalePrecisionState):PriceScaleDisplayPrecision{const precision=state.precision,epoch=state.epoch;let alive=true;return Object.freeze({precision,assertCurrent(){if(!alive||!state.active||!state.ready||state.epoch!==epoch||state.precision!==precision){alive=false;throw Error('The current display precision changed.');}}});}
export function capturePriceScaleDisplayPrecision(port:object):PriceScaleDisplayPrecision|null{const state=displayPrecisions.get(port);if(!state||!state.active)return null;if(!state.ready)throw Error('Current display precision is waiting for native synchronization.');return precisionReceipt(state);}
export const PRICE_PANE_ID='price';
/** Width of a pane's master scale column in the pinned renderer (@luxalgo/vela 0.8.4 AXIS_MASTER_W). */
export const AXIS_MASTER_COLUMN_PX=64;

/** Where an action came from. Pointer input inside the chart cell is already wrapped by the cell's
 * frame gesture; keyboard and toolbar input need the bound gesture host to be saved. */
export type PriceScaleOrigin='chart-pointer'|'keyboard'|'toolbar';
export type PriceScaleCommand=PriceScaleActionId|PriceScaleHotkeyAction;
export interface PriceScaleResult {ok:boolean;message?:string}
/** Workspace binding supplied by the chart cell that owns this chart. */
export type PricePlusHandler=(request:PricePlusRequest)=>boolean|{ok:boolean;message?:string}|void;
export interface PriceScaleHost {
 /** Opens and closes one saved frame edit around a scale change (the cell's begin/finish gesture). `flush` saves the
  * open edit now; a change that also writes the settings document (lock, reset of a lock) flushes with that document,
  * so the frame and saved scale controls are never behind the document. `flush` returns true when it saved
  * the document in the same publication as the frame (one undo step); otherwise the port saves it next, which
  * happens only when the frame publication carried no change. */
 gesture?:{begin():boolean;finish():void;flush?(settings?:PriceScaleSettings):boolean|void};
 /** Saves the price scale settings document with the chart. Returning false refuses the change. */
 commitSettings?(settings:PriceScaleSettings):boolean;
 /** Saves appearance keys (price line, countdown, high/low lines) through the workspace appearance. */
 commitAppearance?(patch:Record<string,boolean>):boolean;
 /** Opens Chart settings at its scales section. */
 openSettings?():boolean|void;
 /** Instrument data availability for conditional labels; currency/unit feed the Currency and Unit label (null: not known). */
 data?:{prePost:boolean;bidAsk:boolean;currency?:string|null;unit?:string|null};
 /** Plus button actions that leave the chart: Add alert and the paper Buy/Sell orders at the clicked price. The
  * client point is the plus button, on the main price axis column. Returning false or {ok:false} keeps the menu open with the message. */
 plusAction?:PricePlusHandler;
}
/** Currency and Unit label and auto/log buttons visibility (both default
 * "Visible on mouse over"); option ids are the Chart settings document values (chart-settings-document.ts). */
export type ScaleChromeVisibility='mouseover'|'always'|'never';
export interface PriceScaleChrome {modeButtons:ScaleChromeVisibility;currencyUnit:ScaleChromeVisibility}
export const DEFAULT_PRICE_SCALE_CHROME:Readonly<PriceScaleChrome>=Object.freeze({modeButtons:'mouseover',currencyUnit:'mouseover'});
export interface PriceScaleChromeState extends PriceScaleChrome {
 /** Text of the Currency and Unit label ("USD", "USD · Shares"), or null when the source names no currency. */
 currencyLabel:string|null;
 /** Why the label cannot show, or null. */
 currencyReason:string|null;
 /** Whether the label is on screen now. */
 currencyShown:boolean;
 /** Why the A and L buttons cannot follow the setting (renderer without them), or null. */
 modeButtonsReason:string|null;
}
const CHROME_VALUES:readonly ScaleChromeVisibility[]=['mouseover','always','never'];
/** A/L cluster height: 30 px, as the patched renderer now draws it
 * (AxisScaleButtons BTN_PX 18 + PAD_TOP 7 + PAD_BOTTOM 5). */
export const AXIS_BUTTONS_CLUSTER_PX=30;
/** Height of the LV Currency and Unit label (one 12px scale text line). */
export const CURRENCY_LABEL_PX=20;
export function currencyUnitText(currency:string|null|undefined,unit:string|null|undefined):string|null{
 const c=typeof currency==='string'?currency.trim():'',u=typeof unit==='string'?unit.trim():'';
 if(!c&&!u)return null;
 return c&&u?`${c} · ${u}`:c||u;
}
export interface PriceScalePort {
 panes():PaneScaleView[];
 state(paneId?:string):PaneScaleView;
 settings():PriceScaleSettings;
 ratio():number|null;
 applySettings(value:unknown):PriceScaleSettings;
 execute(command:PriceScaleCommand,options?:{paneId?:string;origin?:PriceScaleOrigin}):PriceScaleResult;
 menuEntries(paneId?:string):PriceScaleMenuEntry[];
 toolbar():PriceScaleToolbarButton[];
 axisPaneAt(clientX:number,clientY:number):string|null;
 openMenu(paneId:string,client:{x:number;y:number}):void;
 closeMenu(restoreFocus?:boolean):void;
 isMenuOpen():boolean;
 bindHost(host:PriceScaleHost):()=>void;
 /** The chart panel (which owns the context snapshot capture) handles plus alerts and paper orders. It wins over the
  * grid host's plusAction; one handler at a time. */
 bindPlus(handler:PricePlusHandler):()=>void;
 subscribe(listener:()=>void):()=>void;
 /** Why a pane's live scale differs from the requested one for now (Log with Auto off and no bars yet), or null. */
 scaleNotice(paneId?:string):string|null;
 /** Scale chrome: A/L button and Currency and Unit label visibility. */
 chrome():PriceScaleChromeState;
 setChrome(next:Partial<PriceScaleChrome>):PriceScaleChromeState;
 /** The stored Chart settings Precision ('default' or absent: the instrument tick). */
 setPrecision(precision:string|undefined):void;
 /** Re-pushes the price scale tick after the instrument changed. */
 refreshPrecision():void;
 /** The tick every price label uses now (undefined: the zoom-based fallback). */
 priceTick():number|undefined;
 /** The plus button state (null while hidden). */
 plus():{paneId:string;price:number;text:string;top:number;menuOpen:boolean}|null;
 /** Opens the plus button menu at a main-axis client point, or runs one of its items. */
 plusOpen(client:{x:number;y:number}):boolean;
 plusActivate(action:PricePlusAction):PriceScaleResult;
 dispose():void;
}

type Window2={min:number;max:number;log?:boolean;invert?:boolean};
interface NativePane {id:string;kind:string;bounds:{top:number;height:number};scale:Window2;scaleTarget?:Window2|null;manualScale:Window2|null;collapsed?:boolean;scaleMode?:string;logScale?:boolean;invert?:boolean}
interface NativeScene {orderedPanes():NativePane[];panes:Map<string,NativePane>;scaleMode:string;logScale:boolean;invertScale:boolean}
interface AxisPaneView {id:string;top:number;height:number;collapsed?:boolean}
interface AxisButtons {deps:{onToggleAuto:(paneId:string)=>void;onToggleLog:(paneId:string)=>void;panes?:()=>AxisPaneView[];rightAxis?:()=>number};autoBtn?:Element;logBtn?:Element;sync?:()=>void;cluster?:{style:Record<string,string>};hoverPaneId?:string|null;reposition?:()=>void}
interface LabelElement {style:Record<string,string>;textContent:string|null;className:string;dataset?:Record<string,string>;setAttribute?(name:string,value:string):void;remove():void}
interface FeatureControl {get(key:string):unknown;set(key:string,value:unknown):void}
interface EventTargetLike {addEventListener(type:string,listener:(event:any)=>void,options?:boolean|AddEventListenerOptions):void;removeEventListener(type:string,listener:(event:any)=>void,options?:boolean|EventListenerOptions):void}
export interface PriceScalePortOptions {
 renderer:object;
 features:FeatureControl;
 onViewportChanged:(listener:()=>void)=>()=>void;
 container:HTMLElement;
 /** Reason the chart cannot change now (closed, unavailable or updating), or null. */
 availability?:()=>string|null;
 /** Current chart appearance (source of truth for price line, countdown and high/low lines). */
 appearance?:()=>AppearanceSettings|null;
 mount?:(host:HTMLElement)=>PriceScaleMenuMount;
 /** Instrument tick size of the current source, or undefined when unknown. */
 tickSize?:()=>number|undefined;
 /** Symbol and last price for the plus menu wording and order side. */
 instrument?:()=>{symbol:string|null;last:number|null;paperRefusal?:string|null};
 /** Draws a horizontal line at a price on the main pane (plus menu). */
 drawHorizontalLine?:(price:number)=>PriceScaleResult;
 plusMount?:(host:HTMLElement)=>PricePlusMount;
 /** Merge all scales into one: pins the given mounted indicators (renderer ids) back to their pane's
  *  shared scale through the indicator port, so the change is saved like a Pin to scale edit. Throws when refused. */
 mergeScales?:(rendererIds:readonly string[])=>void;
}

const KEYBOARD_UNBOUND='Keyboard and toolbar scale changes are not connected to this chart’s saved workspace yet. Use the price scale menu with the pointer.';
const SCALE_COMMANDS=new Set<PriceScaleCommand>(['auto','reset','lockRatio','invert','regular','percent','indexed','logarithmic','resetChart']);
const APPEARANCE_KEYS={'labels.countdown':'mainSeriesProperties.showCountdown','lines.priceLine':'mainSeriesProperties.showPriceLine','lines.highLowLines':'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible'} as const;
const SETTINGS_TOGGLES=new Set<string>(['labels.symbolLast','labels.prePost','labels.bidAsk','lines.prePostLine','lines.bidAskLines','labels.symbolName','labels.prevClose','labels.highLow','labels.indName','labels.indValue','labels.noOverlap','lines.prevCloseLine']);
const truthy=(value:unknown)=>value===true||value===1||value==='1';
const own=(value:unknown,key:string):any=>{if(!value||typeof value!=='object')throw Error('Price scale renderer member is unavailable: '+key);const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Price scale renderer member must be data: '+key);return field.value;};

const paneLog=(scene:NativeScene,pane:NativePane)=>pane.kind==='price'?scene.logScale===true:pane.logScale===true;
const logDrawable=(window:Window2)=>Number.isFinite(window.min)&&Number.isFinite(window.max)&&window.min>0&&window.max>window.min;
/** Keeps each pane's frozen (manual) window in step with its log flag. The pinned renderer draws a manual window through
 * `manualScale.log` and silently falls back to linear when that tag is missing or the bottom is at or below zero (a
 * linear autoscale frozen with its lower margin under zero), while the menu, toolbar and saved scale read the scene flag
 * as Logarithmic. A window that log space cannot draw stays manual on a positive window derived from the
 * data: the renderer's own log fit of the visible bars (its computeScales pass), frozen with the window's other fields.
 * The reference keeps Auto and Logarithmic independent (static-price-scale.json defaults.axisProperties: separate
 * autoScale/log flags, menu.auto disabled only by autoScaleDisabled), so turning Log on never turns Auto on;
 * the saved Auto off and the live chart agree. Only when there is nothing to fit (no bars) is the window released to
 * autoscale. Returns true when a window changed (and then invalidates a full frame). Exported for paths that change
 * the log flag outside this port (Chart options). */
const awaitingLogFit=new WeakMap<NativePane,Window2>();
/** Notice for a pane released only because there were no bars to fit. */
export const LOG_FIT_PENDING='Auto scale is on until bars load. The logarithmic scale with Auto off that was requested applies when they do.';
export function logFitPending(renderer:object,paneId:string):boolean{try{const pane=(own(renderer,'scene') as NativeScene).orderedPanes().find(row=>row.id===paneId);return !!pane&&awaitingLogFit.has(pane);}catch{return false;}}
/** An explicit Auto on or reset ends the wait, so the arriving bars do not turn Auto off again. */
export function cancelLogFit(renderer:object,paneId?:string):void{try{for(const pane of (own(renderer,'scene') as NativeScene).orderedPanes())if(paneId===undefined||pane.id===paneId)awaitingLogFit.delete(pane);}catch{/* No scene yet. */}}
/**
 * With no bars there is nothing to fit, so an unloggable manual window is still released (live Auto), but no
 * longer silently: the pane is recorded as awaiting its fit (reported by the port and the scale menu), and once bars
 * arrive the requested window is refrozen from the renderer's own log fit, so the live chart rejoins the saved Auto off.
 * origin 'options' (the default; Chart options and other callers that set autoScale first) treats a pane that is still
 * released as an explicit Auto on and ends the wait. origin 'port' (this port's viewport and mode passes) keeps waiting.
 * The wait also ends when the pane gets a manual window by other means or leaves Logarithmic.
 */
export function reconcileManualScales(renderer:object,origin:'options'|'port'='options'):boolean{
 const scene=own(renderer,'scene') as NativeScene;let changed=false;const unloggable:Array<{pane:NativePane;manual:Window2;target:Window2|null|undefined;waiting?:boolean}>=[];
 for(const pane of scene.orderedPanes()){const waiting=awaitingLogFit.get(pane);if(!waiting)continue;
  if(pane.manualScale||!paneLog(scene,pane)||origin==='options'){awaitingLogFit.delete(pane);continue;}
  unloggable.push({pane,manual:waiting,target:pane.scaleTarget,waiting:true});
 }
 for(const pane of scene.orderedPanes()){
  const manual=pane.manualScale;if(!manual)continue;const log=paneLog(scene,pane);
  if(log&&!logDrawable(manual)){unloggable.push({pane,manual,target:pane.scaleTarget});changed=true;continue;}
  if((manual.log===true)!==log){pane.manualScale={...manual,log};changed=true;}
 }
 if(unloggable.length){
  for(const row of unloggable){row.pane.manualScale=null;row.pane.scaleTarget=null;}
  const fit=(renderer as {computeScales?:()=>void}).computeScales;
  try{if(typeof fit==='function')fit.call(renderer);}catch{/* No fit available (renderer not attached yet): released below. */}
  for(const row of unloggable){const target=row.pane.scaleTarget;
   if(target&&logDrawable(target)){row.pane.manualScale={...row.manual,min:target.min,max:target.max,log:true};awaitingLogFit.delete(row.pane);changed=true;}
   else{row.pane.scaleTarget=row.target;awaitingLogFit.set(row.pane,row.manual);}// nothing to fit: released to autoscale until bars arrive (visible)
  }
 }
 if(changed)(renderer as {scheduler?:{invalidate?:(level:number)=>void}|null}).scheduler?.invalidate?.(4);
 return changed;
}

function flatItems(entries:readonly PriceScaleMenuEntry[]):PriceScaleMenuItem[]{return entries.flatMap(row=>row.kind==='item'?[row]:row.kind==='submenu'?row.items.filter((item):item is PriceScaleMenuItem=>item.kind==='item'):[]);}
const entryKey=(row:PriceScaleMenuItem|PriceScaleSubmenu)=>row.kind==='submenu'?submenuKey(row.id):row.id;

/** The installed port of a renderer feature surface (the Vela chart.renderer the adapter passes as
 * `features`). The comparison port uses it to return the main scale to its prior mode when the last Same % scale comparison
 * goes away. Null before install and after disposal. */
const portsByFeatures=new WeakMap<object,PriceScalePort>();
export function priceScalePortFor(features:object|null|undefined):PriceScalePort|null{return features&&(typeof features==='object'||typeof features==='function')?portsByFeatures.get(features)??null:null;}
export function installPriceScalePort(options:PriceScalePortOptions):PriceScalePort{
 const renderer=options.renderer as Record<string,unknown>,container=options.container,features=options.features;
 const scene=():NativeScene=>own(renderer,'scene');
 const invalidate=()=>{const scheduler=renderer.scheduler as {invalidate?:(level:number)=>void}|null|undefined;scheduler?.invalidate?.(4);};
 const doc=container.ownerDocument as Document|undefined,win=doc?.defaultView??undefined;
 let settings=defaultPriceScaleSettings(),host:PriceScaleHost|null=null,disposed=false,lastSignature='';
 const listeners=new Set<()=>void>();
 let chromeState:PriceScaleChrome={...DEFAULT_PRICE_SCALE_CHROME},modeButtonsBound:AxisButtons|null=null,axisHover=false,currencyNode:LabelElement|null=null;
 let menu:{paneId:string;client:{x:number;y:number};submenu:PriceScaleSubmenuId|null;focusKey:string|null;status:string;returnFocus:Element|null}|null=null,mount:PriceScaleMenuMount|null=null;

 const nativePanes=():NativePane[]=>{try{return scene().orderedPanes();}catch{return[];}};
 const nativePane=(paneId:string):NativePane|null=>nativePanes().find(pane=>pane.id===paneId)??null;
 const viewOf=(pane:NativePane):PaneScaleView=>{const s=scene(),price=pane.kind==='price';return{paneId:pane.id,kind:price?'price':'study',mode:modeFromVela(price?s.scaleMode:pane.scaleMode??'price',price?s.logScale:pane.logScale??false),auto:pane.manualScale==null,invert:price?s.invertScale:pane.invert??false};};
 const panes=()=>nativePanes().map(viewOf);
 const state=(paneId=PRICE_PANE_ID):PaneScaleView=>{const pane=nativePane(paneId);if(pane)return viewOf(pane);if(paneId!==PRICE_PANE_ID)throw Error('That price scale is no longer on the chart.');
  let mode:PriceScaleModeId=DEFAULT_PANE_SCALE.mode,invert=DEFAULT_PANE_SCALE.invert;try{const s=scene();mode=modeFromVela(s.scaleMode,s.logScale);invert=s.invertScale;}catch{/* No scene yet: factory defaults. */}
  return{paneId,kind:'price',mode,auto:true,invert};};
 const pitch=():number=>{try{const coords=own(renderer,'coords');const value=typeof coords.pxPerBar==='function'?coords.pxPerBar():coords.viewport?.barSpacing;return Number.isFinite(value)&&value>0?value:0;}catch{return 0;}};
 const currentRatio=():number|null=>{const pane=nativePane(PRICE_PANE_ID);if(!pane)return null;return priceToBarRatio(pane.manualScale??pane.scale,pane.bounds.height,pitch());};
 const appearanceFlag=(key:string):boolean|null=>{const value=options.appearance?.();return value&&Object.hasOwn(value,key)?truthy(value[key]):null;};
 const readSettings=():PriceScaleSettings=>{const copy=structuredClone(settings);copy.labels.countdown=appearanceFlag(APPEARANCE_KEYS['labels.countdown'])??copy.labels.countdown;copy.lines.priceLine=appearanceFlag(APPEARANCE_KEYS['lines.priceLine'])??copy.lines.priceLine;copy.lines.highLowLines=appearanceFlag(APPEARANCE_KEYS['lines.highLowLines'])??copy.lines.highLowLines;return copy;};
 // LV-VELA-SCALE-LEFT-1: the renderer's actual main scale side, or undefined when it cannot move the scale.
 const rendererSide=():'left'|'right'|undefined=>{try{const set=renderer.lvSetMainScaleSide,side=renderer.lvMainScaleSide;if(typeof set!=='function'||typeof side!=='function')return undefined;return Reflect.apply(side,renderer,[])==='left'?'left':'right';}catch{return undefined;}};
 const mainLeft=()=>rendererSide()==='left';
 // The stacked indicator scale columns of a pane (vela's own-scale columns on the right and the
 // LV-VELA-SCALE-PLACEMENT-1 left columns). "No scale" indicators have no column and are not counted or merged.
 const stackedScaleIds=(paneId:string):string[]=>{try{const s=scene() as unknown as {ownScaleIndicatorsForPane?:(id:string)=>{id:string}[];lvLeftScaleIndicatorsForPane?:(id:string)=>{id:string}[]};
  const read=(fn:((id:string)=>{id:string}[])|undefined)=>typeof fn==='function'?Reflect.apply(fn,s,[paneId]).map(model=>String(model.id)):[];
  return [...read(s.ownScaleIndicatorsForPane),...read(s.lvLeftScaleIndicatorsForPane)];}catch{return[];}};
 // A shared extra scale is one column (stackedScaleIds lists its holder), but merging pins every member back:
 // the column holders, then the other members COMPAT-10 renderers report through lvPrivateScaleIndicatorsForPane (minus axis-free ones).
 const mergeScaleIds=(paneId:string):string[]=>{try{const s=scene() as unknown as {lvPrivateScaleIndicatorsForPane?:(id:string)=>{id:string}[];lvScaleKey?:unknown;lvScalePlacements?:Map<string,unknown>};
  if(typeof s.lvScaleKey!=='function'||typeof s.lvPrivateScaleIndicatorsForPane!=='function')return stackedScaleIds(paneId);
  const members=Reflect.apply(s.lvPrivateScaleIndicatorsForPane,s,[paneId]).map(model=>String(model.id)).filter(id=>s.lvScalePlacements?.get(id)!=='none');
  return [...new Set([...stackedScaleIds(paneId),...members])];}catch{return stackedScaleIds(paneId);}};
 const menuEntries=(paneId=PRICE_PANE_ID)=>priceScaleMenuEntries({pane:state(paneId),settings:readSettings(),ratio:currentRatio(),scaleCount:1+stackedScaleIds(paneId).length,host:{appearance:!!host?.commitAppearance,openSettings:!!host?.openSettings,mainSide:!!host?.commitSettings,merge:!!options.mergeScales},mainSide:rendererSide(),data:host?.data});
 const scaleNotice=(paneId=PRICE_PANE_ID):string|null=>logFitPending(renderer,paneId)?LOG_FIT_PENDING:null;
 const signature=()=>{try{return JSON.stringify([panes(),readSettings(),panes().map(view=>scaleNotice(view.paneId)),chromeState]);}catch{return '';}};
 const emit=()=>{const next=signature();if(next===lastSignature)return;lastSignature=next;for(const listener of [...listeners])try{listener();}catch(error){console.error('Price scale observer failed: '+String(error));}};
 const deferEmit=()=>queueMicrotask(()=>{if(!disposed)emit();});

 // Freezing copies the last painted window; its log tag follows the pane's current mode (a mode change since the last
 // frame would otherwise freeze the stale linear window under a Logarithmic menu state).
 const setAuto=(paneId:string,on:boolean)=>{const pane=nativePane(paneId);if(!pane)throw Error('That price scale is no longer on the chart.');if(on)cancelLogFit(renderer,paneId);if((pane.manualScale==null)===on)return;
  if(on){pane.manualScale=null;invalidate();return;}
  const frozen:Window2={...pane.scale},log=paneLog(scene(),pane);if(log){if(!logDrawable(frozen))throw Error('The logarithmic scale is still being drawn. Try again in a moment.');frozen.log=true;}else delete frozen.log;
  pane.manualScale=frozen;invalidate();};
 const setMode=(paneId:string,mode:PriceScaleModeId)=>{const target=velaScaleFor(mode);features.set('scaleMode',{pane:paneId,mode:target.mode});features.set('logScale',{pane:paneId,value:target.log});reconcileManualScales(renderer,'port');};
 const enforceLock=()=>{if(!settings.lockRatio||settings.ratio===null)return;const pane=nativePane(PRICE_PANE_ID),px=pitch();if(!pane||!px||!(pane.bounds.height>0))return;const window=pane.manualScale??pane.scale,next=lockedWindow((window.min+window.max)/2,settings.ratio,pane.bounds.height,px);if(!next)return;if(pane.manualScale&&Math.abs(pane.manualScale.min-next.min)<1e-9&&Math.abs(pane.manualScale.max-next.max)<1e-9)return;pane.manualScale={...window,...next};invalidate();};
 // A staged document is live in memory (the lock is enforced at once) and is saved by publish; a refusal restores the prior.
 type Staged={prior:PriceScaleSettings;next:PriceScaleSettings};
 const stage=(next:PriceScaleSettings):Staged=>{const prior=settings;settings=next;return{prior,next};};
 const publish=(staged:Staged)=>{if(host?.commitSettings&&host.commitSettings(structuredClone(staged.next))===false){if(settings===staged.next)settings=staged.prior;throw Error('The workspace did not accept this price scale change.');}};
 const commitSettings=(next:PriceScaleSettings)=>publish(stage(next));
 const applyRendererSettings=()=>{features.set('priceLabel',settings.labels.symbolLast);
  // The main price scale side follows the document (load, undo, redo, workspace switch). A renderer without the API stays right.
  try{const set=renderer.lvSetMainScaleSide;if(typeof set==='function')Reflect.apply(set,renderer,[settings.mainSide??'right']);}catch{/* Renderer not laid out yet: the side applies on the next settings pass. */}};
 /** The document with the main scale on `side`; the right side is the absent key. */
 const withSide=(value:PriceScaleSettings,side:'left'|'right'):PriceScaleSettings=>{const {mainSide:_prior,...rest}=value;return side==='left'?{...rest,mainSide:'left'}:rest;};

 /** Applies one command to the renderer. A scale command that also changes the settings document returns it staged:
  * execute saves it only after the frame gesture is flushed. Other commands save their document here. */
 function perform(command:PriceScaleCommand,paneId:string):Staged|null{
  const pane=state(paneId),main=pane.kind==='price',unlocked=()=>stage({...settings,lockRatio:false,ratio:null});
  switch(command){
   case 'auto':setAuto(paneId,!pane.auto);return null;
   case 'reset':setAuto(paneId,true);return main&&settings.lockRatio?unlocked():null;
   case 'resetChart':{const staged=settings.lockRatio?unlocked():null;try{cancelLogFit(renderer);for(const row of nativePanes())row.manualScale=null;const reset=renderer.resetView;if(typeof reset==='function')Reflect.apply(reset,renderer,[]);else invalidate();}catch(error){if(staged&&settings===staged.next)settings=staged.prior;throw error;}return staged;}
   case 'invert':features.set('invertScale',{pane:paneId,value:!pane.invert});return null;
   case 'regular':case 'percent':case 'indexed':case 'logarithmic':setMode(paneId,nextScaleMode(pane.mode,command));return null;
   case 'lockRatio':{
    if(settings.lockRatio)return unlocked();
    const ratio=currentRatio();if(ratio===null)throw Error('The price to bar ratio is unavailable until the chart shows bars.');
    const native=nativePane(PRICE_PANE_ID)!;if(!native.manualScale){native.manualScale={...native.scale};invalidate();}
    return stage({...settings,lockRatio:true,ratio});
   }
   case 'labels.symbolLast':commitSettings({...settings,labels:{...settings.labels,symbolLast:!settings.labels.symbolLast}});applyRendererSettings();return null;
   case 'scaleSeriesOnly':commitSettings({...settings,scaleSeriesOnly:!settings.scaleSeriesOnly});invalidate();return null;
   case 'plusButton':commitSettings({...settings,plusButton:!settings.plusButton});if(!settings.plusButton)hidePlus(true);return null;
   // Move the single price scale left or right. One settings change (one undo step); a refusal moves nothing.
   case 'moveLeft':case 'moveRight':commitSettings(withSide(settings,command==='moveLeft'?'left':'right'));applyRendererSettings();hidePlus(true);placeCurrency();return null;
   // Merge all scales into one. The indicator scales go first; a refusal there moves nothing else.
   case 'mergeLeft':case 'mergeRight':{const merge=options.mergeScales;if(!merge)throw Error('This chart cannot merge its price scales.');
    merge(mergeScaleIds(paneId));invalidate();const side=command==='mergeLeft'?'left':'right';
    if(main&&(settings.mainSide??'right')!==side){commitSettings(withSide(settings,side));applyRendererSettings();hidePlus(true);placeCurrency();}
    return null;}
   case 'more':{const open=host?.openSettings;if(!open)throw Error('Chart settings are not connected to this chart.');if(open.call(host)===false)throw Error('Chart settings could not open.');return null;}
  }
  if(command in APPEARANCE_KEYS){const key=APPEARANCE_KEYS[command as keyof typeof APPEARANCE_KEYS],commit=host?.commitAppearance;if(!commit)throw Error('This chart is not connected to its saved workspace settings.');const current=readSettings(),value=command==='labels.countdown'?current.labels.countdown:command==='lines.priceLine'?current.lines.priceLine:current.lines.highLowLines;if(commit.call(host,{[key]:!value})===false)throw Error('The workspace did not accept this change.');return null;}
  if(SETTINGS_TOGGLES.has(command)){const [group,id]=command.split('.') as ['labels'|'lines',string];const next=structuredClone(settings);(next[group] as Record<string,boolean>)[id]=!(next[group] as Record<string,boolean>)[id];commitSettings(next);invalidate();return null;}
  throw Error('This price scale action is not available.');
 }

 function execute(command:PriceScaleCommand,request:{paneId?:string;origin?:PriceScaleOrigin}={}):PriceScaleResult{
  const paneId=request.paneId??PRICE_PANE_ID,origin=request.origin??'chart-pointer';
  try{
   if(disposed)return{ok:false,message:'This chart is closed.'};
   const reason=options.availability?.();if(reason)return{ok:false,message:reason};
   state(paneId);
   if(command!=='resetChart'){const item=flatItems(menuEntries(paneId)).find(row=>row.id===command);
    if(!item&&command!=='reset')return{ok:false,message:'This price scale action is not available here.'};
    if(item?.disabled)return{ok:false,message:item.disabled};}
   const scale=SCALE_COMMANDS.has(command),gesture=scale?host?.gesture:undefined;
   if(scale&&origin!=='chart-pointer'&&!gesture)return{ok:false,message:KEYBOARD_UNBOUND};
   if(gesture&&!gesture.begin())return{ok:false,message:'This chart cannot save a scale change right now. Try again when it finishes updating.'};
   // The menu is mounted inside the chart cell, so the press on a row opens a native frame gesture there. A
   // command that is not itself a frame gesture (Merge all scales into one, Move scale, the toggles) runs after that gesture:
   // it is ended first (a press that moved nothing publishes nothing). Merge used to change the native frame inside it, and the
   // indicator capture then quarantined the chart as "a dirty gesture was interrupted".
   if(!scale)host?.gesture?.flush?.();
   // A document change inside the gesture would invalidate the unsaved frame edit (quarantine) or leave the saved auto
   // flag and frame behind the renderer: the frame, auto flag and document are saved as one publication.
   let staged:Staged|null=null,folded=false;
   // A scale command is one discrete change: it is saved now. Left on the host's 200 ms coalescing timer,
   // the save landed under the next right-click, whose pointerdown flushes it and briefly hides the re-verifying cell.
   try{staged=perform(command,paneId);}finally{if(gesture){if(staged&&gesture.flush)folded=gesture.flush(structuredClone(staged.next))===true;else if(gesture.flush)gesture.flush();else gesture.finish();}}
   if(staged&&!folded)publish(staged);
   emit();return{ok:true};
  }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
 }

 // Right-click hit test against the master scale column of each pane.
 function axisPaneAt(clientX:number,clientY:number):string|null{
  try{const input=renderer.input as {el?:Element|null}|null|undefined,element=input?.el;if(!element)return null;const rect=element.getBoundingClientRect(),coords=own(renderer,'coords'),x=clientX-rect.left,y=clientY-rect.top,dataW=Number(coords.width),dataH=Number(coords.height);
   // 0 is a real right gutter width while the main scale is left on a single pane (LV-VELA-SCALE-LEFT-1).
   const width=Number(renderer.rightAxisW??AXIS_MASTER_COLUMN_PX),right=Math.min(AXIS_MASTER_COLUMN_PX,Number.isFinite(width)?width:AXIS_MASTER_COLUMN_PX),left=mainLeft();
   const inPane=(pane:NativePane)=>!pane.collapsed&&y>=pane.bounds.top&&y<=pane.bounds.top+pane.bounds.height;
   if(left&&x>=-AXIS_MASTER_COLUMN_PX&&x<0&&y>=0&&y<=dataH){const price=nativePane(PRICE_PANE_ID);return price&&inPane(price)?PRICE_PANE_ID:null;}
   if(!(x>dataW&&x<=dataW+right&&y>=0&&y<=dataH))return null;
   return nativePanes().find(pane=>inPane(pane)&&!(left&&pane.kind==='price'))?.id??null;
  }catch{return null;}
 }

 // Menu state machine; the view is a pure function of these props.
 const levelEntries=():{sub:PriceScaleSubmenu|null;rows:(PriceScaleMenuItem|PriceScaleSubmenu)[]}=>{
  if(!menu)return{sub:null,rows:[]};const entries=menuEntries(menu.paneId),sub=menu.submenu?entries.find((row):row is PriceScaleSubmenu=>row.kind==='submenu'&&row.id===menu!.submenu)??null:null;
  const inSub=!!sub&&!!menu.focusKey&&sub.items.some(item=>item.kind==='item'&&item.id===menu!.focusKey);
  return inSub?{sub,rows:focusableEntries(sub!.items)}:{sub:null,rows:focusableEntries(entries)};
 };
 function render(){
  if(!menu||disposed)return;
  let entries:PriceScaleMenuEntry[];try{entries=menuEntries(menu.paneId);}catch{closeMenu(false);return;}
  const viewport={width:win?.innerWidth??1024,height:win?.innerHeight??768},position=placePriceScaleMenu(menu.client,viewport,entries.length);
  const props:PriceScaleMenuViewProps={entries,left:position.left,top:position.top,client:menu.client,openSubmenu:menu.submenu,focusKey:menu.focusKey,status:menu.status,
   onActivate:(id,from)=>activate(id,from),
   onSubmenu:(id,focusFirst)=>{if(!menu)return;menu.submenu=id;if(id&&focusFirst){const sub=menuEntries(menu.paneId).find((row):row is PriceScaleSubmenu=>row.kind==='submenu'&&row.id===id);const first=sub?focusableEntries(sub.items)[0]:undefined;if(first)menu.focusKey=entryKey(first);}render();},
   onFocusKey:key=>{if(!menu||menu.focusKey===key)return;menu.focusKey=key;const entries=menuEntries(menu.paneId);if(!key.startsWith('submenu:')&&entries.some(row=>row.kind!=='separator'&&entryKey(row as PriceScaleMenuItem)===key))menu.submenu=null;render();},
   onKeyDown:event=>menuKey(event)};
  mount??=(options.mount??mountPriceScaleMenu)(container);
  mount.render(props);mount.focus(menu.focusKey);
 }
 function activate(id:PriceScaleActionId,from:'pointer'|'keyboard'){
  if(!menu)return;const paneId=menu.paneId,result=execute(id,{paneId,origin:from==='pointer'?'chart-pointer':'keyboard'});
  if(result.ok){closeMenu(true);return;}
  if(menu){menu.status=result.message??'This price scale action is not available.';render();}
 }
 function menuKey(event:{key:string;altKey?:boolean;ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean;code?:string;preventDefault():void;stopPropagation():void;nativeEvent?:{isComposing?:boolean}}){
  event.stopPropagation();if(!menu||event.nativeEvent?.isComposing)return;
  const hotkey=priceScaleHotkey({code:event.code,key:event.key,altKey:!!event.altKey,ctrlKey:!!event.ctrlKey,metaKey:!!event.metaKey,shiftKey:!!event.shiftKey});
  if(hotkey){event.preventDefault();const paneId=menu.paneId,result=execute(hotkey,{paneId,origin:'keyboard'});if(result.ok)closeMenu(true);else if(menu){menu.status=result.message??'';render();}return;}
  const {sub,rows}=levelEntries(),keys=rows.map(entryKey),index=menu.focusKey?keys.indexOf(menu.focusKey):-1,focused=index>=0?rows[index]:undefined;
  const move=(next:number)=>{if(!keys.length)return;menu!.focusKey=keys[(next+keys.length)%keys.length];if(!sub&&!menu!.focusKey.startsWith('submenu:'))menu!.submenu=null;render();};
  switch(event.key){
   case 'ArrowDown':event.preventDefault();move(index+1);return;
   case 'ArrowUp':event.preventDefault();move(index<0?keys.length-1:index-1);return;
   case 'Home':event.preventDefault();move(0);return;
   case 'End':event.preventDefault();move(keys.length-1);return;
   case 'ArrowRight':if(focused?.kind==='submenu'){event.preventDefault();openSubmenu(focused.id);}return;
   case 'ArrowLeft':if(sub){event.preventDefault();menu.focusKey=submenuKey(sub.id);menu.submenu=null;render();}return;
   case 'Enter':case ' ':event.preventDefault();if(!focused)return;if(focused.kind==='submenu')openSubmenu(focused.id);else activate(focused.id,'keyboard');return;
   case 'Escape':event.preventDefault();if(sub){menu.focusKey=submenuKey(sub.id);menu.submenu=null;render();}else closeMenu(true);return;
   case 'Tab':event.preventDefault();closeMenu(true);return;
  }
 }
 function openSubmenu(id:PriceScaleSubmenuId){if(!menu)return;const sub=menuEntries(menu.paneId).find((row):row is PriceScaleSubmenu=>row.kind==='submenu'&&row.id===id);if(!sub||sub.disabled)return;menu.submenu=id;const first=focusableEntries(sub.items)[0];if(first)menu.focusKey=entryKey(first);render();}
 const outside=(event:Event)=>{if(menu&&!mount?.contains(event.target))closeMenu(false);};
 const dismiss=()=>{if(menu)closeMenu(false);};
 function openMenu(paneId:string,client:{x:number;y:number}){
  if(disposed)return;state(paneId);const reopening=!!menu;
  const first=focusableEntries(menuEntries(paneId))[0];
  menu={paneId,client:{x:client.x,y:client.y},submenu:null,focusKey:first?entryKey(first):null,status:options.availability?.()??scaleNotice(paneId)??'',returnFocus:reopening?menu!.returnFocus:(doc?.activeElement??null)};
  if(!reopening){doc?.addEventListener('pointerdown',outside,true);win?.addEventListener('blur',dismiss);win?.addEventListener('resize',dismiss);}
  render();
 }
 function closeMenu(restoreFocus=false){
  if(!menu)return;const back=menu.returnFocus;menu=null;
  doc?.removeEventListener('pointerdown',outside,true);win?.removeEventListener('blur',dismiss);win?.removeEventListener('resize',dismiss);
  mount?.render(null);
  // When the element focused at open is gone (a Symbol search dialog the right press closed),
  // focus the renderer's own keyboard target (its data canvas, tabIndex 0) so chart keyboard navigation keeps working; the
  // focusable panel ancestor stays the last fallback.
  if(restoreFocus){const target=back&&(back as Element).isConnected&&back!==doc?.body?back:(container.querySelector?.('canvas[tabindex="0"]')??container.closest?.('[tabindex]'));(target as HTMLElement|null|undefined)?.focus?.({preventScroll:true});}
 }

 // Currency and Unit label (scales.scalesCurrencyUnit): the source currency (and unit when the source names one) at the
 // bottom of the main price scale column, above the renderer's A/L cluster. The reference's exact label position was not
 // measured; the LV position keeps it clear of the A/L buttons.
 const plotElement=():{appendChild(node:unknown):unknown}|null=>{const plot=renderer.plot as {appendChild?:unknown}|null|undefined;return plot&&typeof plot.appendChild==='function'?plot as {appendChild(node:unknown):unknown}:null;};
 const currencyText=()=>currencyUnitText(host?.data?.currency,host?.data?.unit);
 const currencyReason=():string|null=>{if(!currencyText())return 'This source does not name a currency or unit.';if(!plotElement()||typeof doc?.createElement!=='function')return 'The chart has no price scale to label yet.';return null;};
 const currencyVisible=()=>chromeState.currencyUnit==='always'||chromeState.currencyUnit==='mouseover'&&axisHover;
 // Rows the A/L cluster and the Currency and Unit label cover in the scale column (see the clearance below).
 let clearanceKey='';
 const axisChromeZones=():Array<readonly [number,number]>=>{
  const zones:Array<readonly [number,number]>=[],shown=(node:{style:Record<string,string>}|null|undefined,display:string,height:number)=>{if(!node||node.style.display!==display)return;const top=parseFloat(node.style.top);if(Number.isFinite(top))zones.push([top,top+height]);};
  shown((renderer.axisScaleButtons as AxisButtons|null|undefined)?.cluster,'flex',AXIS_BUTTONS_CLUSTER_PX);shown(currencyNode,'block',CURRENCY_LABEL_PX);
  return zones;
 };
 const syncAxisClearance=()=>{const key=JSON.stringify(axisChromeZones());if(key===clearanceKey)return;clearanceKey=key;(renderer.scheduler as {invalidate?:(level:number)=>void}|null|undefined)?.invalidate?.(2);};
 function placeCurrency():boolean{
  const text=currencyText(),pane=nativePane(PRICE_PANE_ID);
  if(!text||!pane||pane.collapsed||!currencyVisible()||currencyReason()){if(currencyNode)currencyNode.style.display='none';syncAxisClearance();return false;}
  if(!currencyNode){const node=doc!.createElement('div') as unknown as LabelElement;node.className='lv-scale-currency';node.setAttribute?.('aria-hidden','true');if(node.dataset)node.dataset.lvScaleCurrency='true';plotElement()!.appendChild(node);currencyNode=node;}
  let dataW=0,axisW=AXIS_MASTER_COLUMN_PX;try{dataW=Number(own(renderer,'coords').width)||0;axisW=Math.min(AXIS_MASTER_COLUMN_PX,Number(renderer.rightAxisW)||AXIS_MASTER_COLUMN_PX);}catch{/* No coordinates yet. */}
  // The node is a plot child: on a left main scale its column is [-64, 0) (LV-VELA-SCALE-LEFT-1).
  if(mainLeft()){dataW=-AXIS_MASTER_COLUMN_PX;axisW=AXIS_MASTER_COLUMN_PX;}
  const top=Math.max(pane.bounds.top,pane.bounds.top+pane.bounds.height-AXIS_BUTTONS_CLUSTER_PX-CURRENCY_LABEL_PX);
  Object.assign(currencyNode.style,{display:'block',left:dataW+'px',width:axisW+'px',top:top+'px'});
  currencyNode.textContent=text;syncAxisClearance();return true;
 }
 const chromeView=():PriceScaleChromeState=>({...chromeState,currencyLabel:currencyText(),currencyReason:currencyReason(),currencyShown:currencyNode?.style.display==='block',modeButtonsReason:modeButtonsBound?null:'This chart renderer has no A and L scale buttons.'});
 function setChrome(next:Partial<PriceScaleChrome>):PriceScaleChromeState{
  if(disposed)throw Error('This chart is closed.');
  if(!next||typeof next!=='object')throw Error('Scale chrome settings must be an object.');
  for(const key of Object.keys(next))if(key!=='modeButtons'&&key!=='currencyUnit')throw Error('Unknown scale chrome setting: '+key);
  for(const value of Object.values(next))if(!CHROME_VALUES.includes(value as ScaleChromeVisibility))throw Error('Scale chrome visibility must be mouseover, always or never.');
  chromeState={...chromeState,...next};
  try{modeButtonsBound?.reposition?.();}catch{/* Renderer not laid out yet. */}
  placeCurrency();emit();return chromeView();
 }
 /** The pointer is on the + (or crossing the edge between the scale and it), so it stays put to be clicked. */
 const onPlus=(event:{clientX:number;clientY:number;target?:EventTarget|null})=>{if(!plusState||plusState.edgeX===undefined)return false;if(event.target!=null&&plusMount?.contains(event.target))return true;const dx=plusState.side==='left'?event.clientX-plusState.edgeX:plusState.edgeX-event.clientX;return dx>=-2&&dx<=PLUS_BUTTON_PX+2&&Math.abs(event.clientY-plusState.client.y)<=PLUS_BUTTON_PX/2;};
 const onAxisMove=(event:{clientX:number;clientY:number;target?:EventTarget|null})=>{if(disposed)return;const over=axisPaneAt(event.clientX,event.clientY)===PRICE_PANE_ID;
  if(!plusState?.items){if(over)placePlus(event.clientX,event.clientY);else if(!onPlus(event))hidePlus();}
  if(over===axisHover)return;axisHover=over;placeCurrency();};
 const onAxisLeave=()=>{hidePlus();if(!axisHover)return;axisHover=false;placeCurrency();};

 // "Scale price chart only" refits the main pane's autoscale to the main series after the renderer's own fit, so
 // indicators, overlays and comparisons no longer stretch it. A manual (Auto off) window is never touched.
 const seriesOnlyFit=()=>{
  if(!settings.scaleSeriesOnly||disposed)return;const pane=nativePane(PRICE_PANE_ID);if(!pane||pane.manualScale)return;
  const s=scene() as NativeScene&{candlesHidden?:boolean;style?:{margins?:{top:number;bottom:number}}};if(s.candlesHidden)return;
  const coords=own(renderer,'coords'),bars=renderer.bars as {high:number;low:number}[]|undefined;if(!Array.isArray(bars)||!bars.length)return;
  const range=coords.visibleLogicalRange(),from=Math.max(0,Math.floor(range.from)),to=Math.min(bars.length-1,Math.ceil(range.to));if(to<from)return;
  const margins=s.style?.margins??{top:10,bottom:10},target=seriesOnlyWindow(bars,from,to,margins,paneLog(s,pane));if(!target)return;
  pane.scaleTarget=target;const animator=renderer.animator as {active?:boolean}|null|undefined;if(!animator?.active)pane.scale={...target};
 };
 // A study pane whose indicators are all hidden has nothing to fit, and the renderer fell back to its
 // placeholder 0..1 window (a 0.20 to 0.80 axis). The pane keeps the window it last fitted to visible content.
 const lastStudyWindows=new WeakMap<object,{min:number;max:number;log?:boolean}>();
 const hiddenStudyHold=()=>{
  if(disposed)return;const s=scene() as NativeScene&{indicatorsForPane?:(id:string)=>Array<{series?:Array<{points?:unknown[];bars?:unknown[]}>;priceLines?:unknown[];fills?:unknown[]}>};
  if(typeof s.indicatorsForPane!=='function')return;const animator=renderer.animator as {active?:boolean}|null|undefined;
  for(const pane of s.orderedPanes() as Array<NativePane&{kind?:string;scaleTarget:{min:number;max:number;log?:boolean}}>){
   if(pane.kind==='price'||pane.manualScale)continue;const models=s.indicatorsForPane(pane.id);if(!Array.isArray(models)||!models.length)continue;
   const content=models.some(model=>(model.series??[]).some(row=>((row.points??row.bars)??[]).length>0)||(model.priceLines??[]).length>0||(model.fills??[]).length>0);
   if(content){lastStudyWindows.set(pane,{...pane.scaleTarget});continue;}
   const kept=lastStudyWindows.get(pane);if(!kept)continue;pane.scaleTarget={...kept};if(!animator?.active)pane.scale={...kept};
  }
 };
 // Per-indicator scale bands (lvSetIndicatorScaleMargins), applied to the private scale after the renderer fit.
 const scaleBands=new Map<string,{top:number;bottom:number}>();
 const bandFit=()=>{
  if(!scaleBands.size||disposed)return;const scales=(scene() as {indicatorScales?:Map<string,{scale:{min:number;max:number};scaleTarget:{min:number;max:number};manualScale:unknown}>}).indicatorScales;
  if(!(scales instanceof Map))return;
  for(const [id,margins] of scaleBands){const slot=scales.get(id);if(!slot||slot.manualScale)continue;const fitted=slot.scaleTarget,settled=slot.scale.min===fitted.min&&slot.scale.max===fitted.max;
   slot.scaleTarget=bandScale(fitted,margins);if(settled)slot.scale={...slot.scaleTarget};}
 };
 const setScaleMargins=(id:string,margins:{top:number;bottom:number})=>{
  const top=Number(margins?.top),bottom=Number(margins?.bottom);
  if(![top,bottom].every(value=>Number.isFinite(value)&&value>=0&&value<=1)||top+bottom>=1)throw new Error('Scale margins must be fractions from 0 to 1 that leave room for the plot.');
  if(top===0&&bottom===0)scaleBands.delete(id);else scaleBands.set(id,{top,bottom});invalidate();
 };
 Object.defineProperty(renderer,'lvSetIndicatorScaleMargins',{configurable:true,writable:true,value:setScaleMargins});
 const restoreScaleMargins=()=>{scaleBands.clear();const now=Object.getOwnPropertyDescriptor(renderer,'lvSetIndicatorScaleMargins');if(now&&now.value===setScaleMargins)delete (renderer as {lvSetIndicatorScaleMargins?:unknown}).lvSetIndicatorScaleMargins;};
 let restoreComputeScales=()=>{};let plusHandler:PricePlusHandler|null=null;
 {const fit=(renderer as {computeScales?:unknown}).computeScales;
  if(typeof fit==='function'&&!Object.hasOwn(renderer,'computeScales')){
   const wrapped=function(this:unknown,...args:unknown[]){const result=Reflect.apply(fit,this,args);try{seriesOnlyFit();}catch{/* Geometry not ready: the renderer's own fit stays. */}try{bandFit();}catch{/* Same: the indicator keeps its full-height scale. */}try{hiddenStudyHold();}catch{/* No scene yet: the renderer's own fit stays. */}return result;};
   Object.defineProperty(renderer,'computeScales',{configurable:true,writable:true,value:wrapped});
   restoreComputeScales=()=>{const now=Object.getOwnPropertyDescriptor(renderer,'computeScales');if(now&&now.value===wrapped)delete (renderer as {computeScales?:unknown}).computeScales;};
  }}

 // Every price label follows the instrument tick unless Chart settings > Symbol > Precision overrides it.
 let storedPrecision:string|undefined;const precisionState:PriceScalePrecisionState={active:true,ready:false,precision:undefined,epoch:{},attempt:null};
 const priceTick=():number|undefined=>{let tick:number|undefined;try{tick=options.tickSize?.();}catch{tick=undefined;}return axisMintick(precisionMintick(storedPrecision),tick);};
 // Vela's own post-load refreshPriceFormat() pushes the feed's symbolInfo mintick, and LV's feed has
 // none, so every completed load reset the renderer to its zoom decimals (SPY 142.63 printed as 142.6) until the next viewport
 // change re-synced. The port owns the price tick: a native call takes the port tick whenever one is known.
 let restorePricePrecision=()=>{};
 {const native=(renderer as {setPricePrecision?:unknown}).setPricePrecision;
  if(typeof native==='function'&&!Object.hasOwn(renderer,'setPricePrecision')){
   const wrapped=function(this:unknown,mintick:unknown){let tick:number|undefined;try{tick=priceTick();}catch{tick=undefined;}return Reflect.apply(native,this,[tick??mintick]);};
   Object.defineProperty(renderer,'setPricePrecision',{configurable:true,writable:true,value:wrapped});
   restorePricePrecision=()=>{const now=Object.getOwnPropertyDescriptor(renderer,'setPricePrecision');if(now&&now.value===wrapped)delete (renderer as {setPricePrecision?:unknown}).setPricePrecision;};
  }}
 // Integer, 9 to 15 decimals and 1/N relabel the axis ticks through the renderer's public priceAxisTicks
 // feature (symbol-precision.ts precisionAxisTicks). Only a hook this port set is ever cleared.
 let axisTicksHook:unknown=null;
 const setAxisTicks=(hook:unknown)=>{const apply=(renderer as {applyFeature?:unknown}).applyFeature,features=(renderer as {features?:unknown}).features;if(typeof apply!=='function'||!Array.isArray(features)||!features.includes('priceAxisTicks'))return;Reflect.apply(apply,renderer,['priceAxisTicks',hook]);axisTicksHook=hook;};
 // While value tags are drawn in a scale column (published by the indicator label
 // painter, axis-labels.ts), the tick labels under them are blanked, as the reference hides a tick label a value label covers.
 // The grid line of that tick stays. The renderer memoizes ticks per scale window, so a changed set of tags installs a fresh
 // hook (dropping the memo) once that frame finished publishing, and repaints. Nothing is installed while no tag is drawn.
 let reservedSignature='',reservedScene:object|null=null,offReserved:(()=>void)|null=null,reservedQueued=false;
 const reservedSnapshot=():string=>{try{const s=scene() as unknown as object;return JSON.stringify(reservedAxisPanes(s).sort().map(id=>[id,reservedAxisRanges(s,id).map(([a,b])=>[Math.round(a),Math.round(b)])]));}catch{return '[]';}};
 const collisionHook=(base:PrecisionAxisTicks|null):PrecisionAxisTicks=>context=>{
  const ticks=[...((base?base(context):null)??context.defaults)],view=context as typeof context&{pane:{id?:unknown};priceToY?:(price:number)=>number;fontSize?:number},yOf=view.priceToY,paneId=view.pane.id;
  if(typeof yOf!=='function'||typeof paneId!=='string')return ticks;
  let ranges:[number,number][];try{const pane=nativePane(paneId);if(!pane)return ticks;const top=pane.bounds.top;ranges=reservedAxisRanges(scene() as unknown as object,paneId).map(([a,b])=>[a-top,b-top]);}catch{return ticks;}
  return clearTickLabels(ticks,price=>yOf(price),ranges,Math.max(5,(Number(view.fontSize)||11)/2+1));
 };
 const watchReserved=()=>{let s:object;try{s=scene() as unknown as object;}catch{return;}if(reservedScene===s)return;offReserved?.();reservedScene=s;
  offReserved=subscribeReservedAxisRanges(s,()=>{if(reservedQueued||disposed)return;reservedQueued=true;queueMicrotask(()=>{reservedQueued=false;if(disposed||reservedSnapshot()===reservedSignature)return;try{syncAxisTicks();invalidate();}catch{/* Renderer without the tick feature. */}});});};
 const syncAxisTicks=()=>{watchReserved();const hook=precisionAxisTicks(storedPrecision);reservedSignature=reservedSnapshot();if(reservedSignature!=='[]'){setAxisTicks(collisionHook(hook));return;}if(hook)setAxisTicks(hook);else if(axisTicksHook)setAxisTicks(null);};
 const syncPrecision=()=>{
  if(precisionState.precision!==storedPrecision){precisionState.precision=storedPrecision;precisionState.epoch={};}
  const epoch=precisionState.epoch,attempt={};precisionState.attempt=attempt;precisionState.ready=false;
  try{const set=renderer.setPricePrecision;if(typeof set==='function')Reflect.apply(set,renderer,[priceTick()]);syncAxisTicks();if(precisionState.attempt===attempt&&precisionState.epoch===epoch&&precisionState.precision===storedPrecision)precisionState.ready=true;}
  catch(error){if(precisionState.attempt===attempt){precisionState.epoch={};precisionState.ready=false;}throw error;}
  finally{if(precisionState.attempt===attempt)precisionState.attempt=null;}
 };

 // The plus button on the main price scale at the pointer price.
 let plusState:{paneId:string;price:number;text:string;top:number;left:number;side:'left'|'right';client:{x:number;y:number};/** Client x of the scale edge the button touches. */edgeX?:number;items:PricePlusItem[]|null;status:string}|null=null,plusMount:PricePlusMount|null=null;
 const plusText=(price:number)=>{const tick=priceTick();return tick?price.toFixed(tickDecimalsOf(tick)):price.toFixed(2);};
 const plusItems=(price:number,text:string)=>{let info:{symbol:string|null;last:number|null;paperRefusal?:string|null}={symbol:null,last:null};try{info=options.instrument?.()??info;}catch{/* No instrument: generic wording. */}return pricePlusMenu({price,text,last:info.last,symbol:info.symbol,host:!!(plusHandler??host?.plusAction),line:!!options.drawHorizontalLine,paperRefusal:info.paperRefusal??null});};
 const renderPlus=()=>{
  if(disposed)return;if(!plusState){plusMount?.render(null);return;}
  plusMount??=(options.plusMount??mountPricePlus)(container);
  const state=plusState;plusMount.render({left:state.left,top:state.top,side:state.side,text:state.text,items:state.items,status:state.status,onOpen:()=>{if(plusState===state)plusOpen(state.client);},onActivate:action=>{const result=plusActivate(action);if(!result.ok&&plusState){plusState.status=result.message??'';renderPlus();}}});
 };
 function hidePlus(force=false){if(!plusState||!force&&plusState.items)return;plusState=null;doc?.removeEventListener('pointerdown',plusOutside,true);renderPlus();}
 const plusOutside=(event:Event)=>{if(plusState?.items&&!plusMount?.contains(event.target)){plusState=null;doc?.removeEventListener('pointerdown',plusOutside,true);renderPlus();}};
 function placePlus(clientX:number,clientY:number):boolean{
  if(disposed||!settings.plusButton||options.availability?.())return false;
  try{const input=renderer.input as {el?:Element|null}|null|undefined,element=input?.el;if(!element)return false;const rect=element.getBoundingClientRect(),coords=own(renderer,'coords'),pane=nativePane(PRICE_PANE_ID);if(!pane||pane.collapsed)return false;
   const y=clientY-rect.top;if(y<pane.bounds.top||y>pane.bounds.top+pane.bounds.height)return false;
   const raw=coords.yToPrice(y,pane.scale,pane.bounds);if(!Number.isFinite(raw))return false;
   const tick=priceTick(),price=roundToTick(raw,tick),text=plusText(price);
   // `left` is container-relative: the input element can start right of the container (a left scale gutter).
   const box=typeof (container as {getBoundingClientRect?:unknown}).getBoundingClientRect==='function'?container.getBoundingClientRect():null,base=box&&Number.isFinite(rect.left-box.left)?rect.left-box.left:0,side=mainLeft()?'left' as const:'right' as const;
   // The + sits just inside the plot, flush against the scale edge on the pointer row, so it never covers the
   // scale labels and a press on the scale itself always drags the scale.
   const edge=side==='left'?0:Number(coords.width);
   plusState={paneId:PRICE_PANE_ID,price,text,top:y,left:base+(side==='left'?edge:edge-PLUS_BUTTON_PX),side,client:{x:clientX,y:clientY},edgeX:rect.left+edge,items:null,status:''};renderPlus();return true;
  }catch{return false;}
 }
 function plusOpen(client:{x:number;y:number}):boolean{
  if(disposed||!settings.plusButton)return false;
  if(!plusState||plusState.client.x!==client.x||plusState.client.y!==client.y){if(!placePlus(client.x,client.y))return false;}
  const state=plusState!;state.items=plusItems(state.price,state.text);state.status=options.availability?.()??'';
  doc?.addEventListener('pointerdown',plusOutside,true);renderPlus();return true;
 }
 function plusActivate(action:PricePlusAction):PriceScaleResult{
  try{
   if(disposed)return{ok:false,message:'This chart is closed.'};const reason=options.availability?.();if(reason)return{ok:false,message:reason};
   const state=plusState;if(!state)return{ok:false,message:'Hover the price scale to choose a price first.'};
   const item=plusItems(state.price,state.text).find(row=>row.id===action);if(!item)return{ok:false,message:'This price action is not available here.'};if(item.disabled)return{ok:false,message:item.disabled};
   let result:PriceScaleResult;
   if(action==='hline')result=options.drawHorizontalLine!(state.price);
   else{const request=pricePlusRequest(action,state.price,state.client,state.paneId) as PricePlusRequest,outcome=plusHandler?plusHandler(request):host!.plusAction!.call(host,request);result=outcome===false?{ok:false,message:'That price action could not start.'}:outcome&&typeof outcome==='object'?{ok:outcome.ok,...outcome.message?{message:outcome.message}:{}}:{ok:true};}
   if(result.ok)hidePlus(true);
   return result;
  }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
 }
 const plusView=()=>plusState?{paneId:plusState.paneId,price:plusState.price,text:plusState.text,top:plusState.top,menuOpen:!!plusState.items}:null;

 // Native wiring.
 const onContextMenu=(event:MouseEvent)=>{if(event.defaultPrevented||disposed)return;const paneId=axisPaneAt(event.clientX,event.clientY);if(!paneId)return;event.preventDefault();openMenu(paneId,{x:event.clientX,y:event.clientY});};
 const editable=(target:EventTarget|null)=>{const element=target as HTMLElement|null;if(!element||typeof element.closest!=='function')return false;return !!element.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[data-lv-inline-editor]');};
 const chartFocused=()=>{const active=doc?.activeElement as Element|null|undefined;if(!active||active===doc?.body||active===doc?.documentElement)return false;return container.contains(active)||(typeof active.contains==='function'&&active.contains(container));};
 const onKeyDown=(event:KeyboardEvent)=>{if(disposed||menu||event.defaultPrevented||event.repeat)return;const action=priceScaleHotkey(event);if(!action||editable(event.target)||!chartFocused())return;event.preventDefault();const result=execute(action,{paneId:PRICE_PANE_ID,origin:'keyboard'});if(!result.ok&&result.message)console.warn(result.message);};
 const onPointerSettled=()=>deferEmit();
 container.addEventListener('contextmenu',onContextMenu);
 container.addEventListener('pointerup',onPointerSettled);
 container.addEventListener('pointermove',onAxisMove);
 container.addEventListener('pointerleave',onAxisLeave);
 container.addEventListener('dblclick',onPointerSettled);
 doc?.addEventListener('keydown',onKeyDown);
 // A log flag changed outside this port (Chart options, restore) is reconciled on the next viewport change too.
 const offViewport=options.onViewportChanged(()=>{if(disposed)return;try{reconcileManualScales(renderer,'port');}catch{/* No scene yet. */}enforceLock();placeCurrency();try{syncPrecision();}catch{/* Renderer without a tick setter. */}if(plusState&&!plusState.items)hidePlus();emit();});
 // Axis A/L buttons keep their renderer chrome but change scales through this port (radio-exclusive log).
 let restoreAxisButtons=()=>{};
 try{const buttons=renderer.axisScaleButtons as AxisButtons|null|undefined;if(buttons&&buttons.deps){const deps=buttons.deps,priorAuto=deps.onToggleAuto,priorLog=deps.onToggleLog;
  deps.onToggleAuto=paneId=>{const result=execute('auto',{paneId:paneId||PRICE_PANE_ID,origin:'chart-pointer'});if(!result.ok&&result.message)console.warn(result.message);};
  deps.onToggleLog=paneId=>{const result=execute('logarithmic',{paneId:paneId||PRICE_PANE_ID,origin:'chart-pointer'});if(!result.ok&&result.message)console.warn(result.message);};
  const priorAutoLabel=buttons.autoBtn?.getAttribute('aria-label')??null,priorLogLabel=buttons.logBtn?.getAttribute('aria-label')??null;
  // Accessible labels of the axis buttons.
  buttons.autoBtn?.setAttribute('aria-label','Toggle auto scale');buttons.logBtn?.setAttribute('aria-label','Toggle log scale');
  // scales.autoLogButtonsVisibility: the renderer shows its one cluster for the hovered pane. 'never' keeps it hidden;
  // 'always' parks it on the main price pane whenever no pane is hovered (the renderer has a single cluster, so
  // other panes still show theirs on hover). The prior own member, if any, is restored on dispose.
  const ownReposition=Object.getOwnPropertyDescriptor(buttons,'reposition'),priorReposition=buttons.reposition;
  if(typeof priorReposition==='function'&&buttons.cluster){
   modeButtonsBound=buttons;
   buttons.reposition=function(this:AxisButtons){
    try{placeButtons();}finally{syncAxisClearance();}
   };
   const placeButtons=()=>{
    Reflect.apply(priorReposition,buttons,[]);
    const cluster=buttons.cluster;if(!cluster)return;
    if(chromeState.modeButtons==='never'){cluster.style.display='none';return;}
    if(chromeState.modeButtons==='always'&&!buttons.hoverPaneId&&cluster.style.display==='none'){
     const price=buttons.deps.panes?.().find(row=>row.id===PRICE_PANE_ID);
     if(price&&!price.collapsed){buttons.hoverPaneId=PRICE_PANE_ID;try{Reflect.apply(priorReposition,buttons,[]);}finally{buttons.hoverPaneId=null;}}
    }
   };
  }
  restoreAxisButtons=()=>{deps.onToggleAuto=priorAuto;deps.onToggleLog=priorLog;if(priorAutoLabel!==null)buttons.autoBtn?.setAttribute('aria-label',priorAutoLabel);if(priorLogLabel!==null)buttons.logBtn?.setAttribute('aria-label',priorLogLabel);
   if(modeButtonsBound===buttons){modeButtonsBound=null;if(ownReposition)Object.defineProperty(buttons,'reposition',ownReposition);else delete (buttons as {reposition?:unknown}).reposition;try{buttons.reposition?.();}catch{/* Renderer already torn down. */}}};}
 }catch{/* Renderer without hover buttons: the menu, hotkeys and toolbar still work. */}
 // The renderer's A/L cluster (solid background) and the LV Currency and Unit label sit at the bottom of the
 // scale column and covered the lowest tick labels, leaving clipped digits. While either is shown, the axis ticks whose text box
 // reaches into their rows are left out of the price-axis TEXT pass (the chrome layer only: gridlines read the same tick source
 // from the backdrop layer and are unchanged). A visibility change asks for one chrome repaint, so the labels return on leave.
 let restoreAxisClearance=()=>{};
 try{
  const chrome=renderer.chrome as Record<string,unknown>|null|undefined,ticks=chrome?.axisTicks as Record<string,unknown>|null|undefined,render=chrome?.render,ticksFor=ticks?.ticksFor;
  if(chrome&&ticks&&typeof render==='function'&&typeof ticksFor==='function'&&!Object.hasOwn(chrome,'render')&&!Object.hasOwn(ticks,'ticksFor')){
   let painting=0;
   const ownRender=function(this:unknown,...args:unknown[]){painting++;try{return Reflect.apply(render,this,args);}finally{painting--;}};
   const ownTicks=function(this:unknown,scene:{style?:{fontSize?:unknown}},pane:{scale:unknown;bounds:unknown},coords:{priceToY(price:number,scale:unknown,bounds:unknown):number}){
    const out=Reflect.apply(ticksFor,this,[scene,pane,coords]) as Array<{price:number}>;
    if(!painting||!Array.isArray(out)||!out.length)return out;
    const zones=axisChromeZones();if(!zones.length)return out;
    const half=Math.ceil((Number(scene?.style?.fontSize)||12)/2)+1;
    return out.filter(tick=>{const y=coords.priceToY(tick.price,pane.scale,pane.bounds);return !zones.some(([top,bottom])=>y+half>top&&y-half<bottom);});
   };
   Object.defineProperty(chrome,'render',{configurable:true,writable:true,value:ownRender});Object.defineProperty(ticks,'ticksFor',{configurable:true,writable:true,value:ownTicks});
   restoreAxisClearance=()=>{for(const [owner,key,value] of [[chrome,'render',ownRender],[ticks,'ticksFor',ownTicks]] as const){const now=Object.getOwnPropertyDescriptor(owner,key);if(now&&now.value===value)delete owner[key];}};
  }
 }catch{/* Renderer without a chrome tick source: the labels keep the renderer's own drawing. */}
 applyRendererSettings();try{syncPrecision();}catch{/* Renderer without a tick setter. */}lastSignature=signature();

 const port:PriceScalePort={
  panes,state,settings:readSettings,ratio:()=>settings.lockRatio?settings.ratio:currentRatio(),
  applySettings(value){const next=validatePriceScaleSettings(value);settings=next;applyRendererSettings();if(settings.lockRatio){const pane=nativePane(PRICE_PANE_ID);if(pane&&!pane.manualScale){pane.manualScale={...pane.scale};invalidate();}enforceLock();}emit();return readSettings();},
  execute,menuEntries,
  toolbar:()=>priceScaleToolbarButtons(state(PRICE_PANE_ID)),
  axisPaneAt,openMenu,closeMenu,isMenuOpen:()=>!!menu,
  bindPlus(handler){if(disposed)throw Error('This chart is closed.');if(typeof handler!=='function')throw Error('Plus handler must be a function.');if(plusHandler)throw Error('Price scale plus handler is already bound.');plusHandler=handler;return()=>{if(plusHandler===handler)plusHandler=null;};},
  bindHost(next){if(disposed)throw Error('This chart is closed.');if(host)throw Error('Price scale host is already bound.');host=next;if(menu)render();placeCurrency();const bound=next;return()=>{if(host===bound){host=null;placeCurrency();if(menu)render();}};},
  scaleNotice,
  chrome:chromeView,setChrome,
  setPrecision(precision){if(disposed)throw Error('This chart is closed.');if(precision!==undefined&&typeof precision!=='string')throw Error('Precision must be a stored precision value.');precisionMintick(precision);storedPrecision=precision;syncPrecision();emit();},
  refreshPrecision(){if(!disposed)syncPrecision();},
  priceTick,
  plus:plusView,plusOpen,plusActivate,
  subscribe(listener){if(typeof listener!=='function')throw Error('Price scale listener must be a function.');listeners.add(listener);return()=>{listeners.delete(listener);};},
  dispose(){if(disposed)return;closeMenu(false);disposed=true;offReserved?.();offReserved=null;reservedScene=null;try{if(axisTicksHook)setAxisTicks(null);}catch{/* The renderer is gone. */}precisionState.active=false;displayPrecisions.delete(port);if(features&&typeof features==='object'&&portsByFeatures.get(features)===port)portsByFeatures.delete(features);plusHandler=null;listeners.clear();host=null;container.removeEventListener('contextmenu',onContextMenu);container.removeEventListener('pointerup',onPointerSettled);container.removeEventListener('dblclick',onPointerSettled);container.removeEventListener('pointermove',onAxisMove);container.removeEventListener('pointerleave',onAxisLeave);try{currencyNode?.remove();}catch{/* Already detached. */}currencyNode=null;doc?.removeEventListener('keydown',onKeyDown);doc?.removeEventListener('pointerdown',plusOutside,true);plusState=null;try{offViewport();}finally{try{restoreAxisButtons();}finally{try{restoreComputeScales();restoreScaleMargins();restorePricePrecision();restoreAxisClearance();}finally{mount?.dispose();mount=null;plusMount?.dispose();plusMount=null;}}}},
 };
 displayPrecisions.set(port,precisionState);
 if(features&&typeof features==='object')portsByFeatures.set(features,port);
 return port;
}

/** Controller surface (`controller.priceScale`) that stays valid before install and after disposal. */
export type PriceScaleController=Omit<PriceScalePort,'dispose'>;
export function priceScaleFacade(read:()=>PriceScalePort|null):PriceScaleController{
 const port=()=>{const value=read();if(!value)throw Error('The price scale is unavailable for this chart.');return value;};
 return Object.freeze({
  panes:()=>port().panes(),state:(paneId?:string)=>port().state(paneId),settings:()=>port().settings(),ratio:()=>port().ratio(),
  applySettings:(value:unknown)=>port().applySettings(value),
  execute:(command:PriceScaleCommand,options?:{paneId?:string;origin?:PriceScaleOrigin})=>{const value=read();return value?value.execute(command,options):{ok:false,message:'The price scale is unavailable for this chart.'};},
  menuEntries:(paneId?:string)=>port().menuEntries(paneId),toolbar:()=>port().toolbar(),axisPaneAt:(x:number,y:number)=>read()?.axisPaneAt(x,y)??null,
  openMenu:(paneId:string,client:{x:number;y:number})=>port().openMenu(paneId,client),closeMenu:(restoreFocus?:boolean)=>read()?.closeMenu(restoreFocus),isMenuOpen:()=>read()?.isMenuOpen()??false,
  bindHost:(host:PriceScaleHost)=>port().bindHost(host),bindPlus:(handler:PricePlusHandler)=>port().bindPlus(handler),subscribe:(listener:()=>void)=>port().subscribe(listener),
  scaleNotice:(paneId?:string)=>read()?.scaleNotice(paneId)??null,
  chrome:()=>port().chrome(),setChrome:(next:Partial<PriceScaleChrome>)=>port().setChrome(next),
  setPrecision:(precision:string|undefined)=>port().setPrecision(precision),refreshPrecision:()=>read()?.refreshPrecision(),priceTick:()=>read()?.priceTick(),
  plus:()=>read()?.plus()??null,plusOpen:(client:{x:number;y:number})=>read()?.plusOpen(client)??false,
  plusActivate:(action:PricePlusAction)=>{const value=read();return value?value.plusActivate(action):{ok:false,message:'The price scale is unavailable for this chart.'};},
 });
}
