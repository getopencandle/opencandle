// Long position and the shared model of Long and Short position.
//
// The native `position` class keeps placement, the entry/stop/target anchors, handles, body drag, the opposite-side rule,
// serialization and undo. This module REPLACES the native `position` registration in place (replacesNative, contract.ts), so
// saved records keep the type id `position` and every consumer (position alerts and drawing-alert-links.ts, alert follow,
// coordinate editing, axis labels) is unchanged. Short position (short-position.ts) is built on the same mixin.
//
// What the LV model adds:
//  * Settings Inputs tab (group "behavior"): Account size, Lot size, Risk with its unit (percent or the account currency),
//    Leverage, Entry price, Profit level in ticks and price, Stop level in ticks and price, Qty precision, Account currency.
//    Style tab: line, Stop color, Target color, text color and size, Price labels, Compact stats mode, Always show stats.
//    The exact control wording is our own choice. The native settings with no visible control (Risk %, Position size,
//    Direction, the native label toggles) stay as hidden fields so saved templates, copy-properties and old patches still apply.
//  * Chart labels painted through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint): a target plate (price offset, percent, ticks, amount),
//    a stop plate (the same), and a middle plate on the entry line (Open or Closed P&L, Qty, Risk/reward ratio). The info-block
//    set is: tp/sl price, percent, tick offsets
//    and amounts, open/closed P&L, qty, risk/reward ratio on; TP PL and SL PL off.
//    The plate wording, the compact wording and the plate placement are our own choice.
//  * Live text while a handle is dragged: every label is computed from the anchors at paint time, and the native drag path
//    mutates the anchors and calls constrainHandleDrag on every move.
//
// Readings:
//  * Quantity in lots = risk amount / (stop distance x lot size), shown with Qty precision; amounts use the rounded quantity.
//  * Ticks use the chart instrument tick size from a registered chart context, else 0.01 (the tick size every LV data source declares).
//  * P&L walks the chart bars from the entry time: the trade opens on the first bar that trades through the entry, closes at the
//    stop or the target (the stop first when one bar reaches both), and when the box ends first it closes at the last close inside
//    the box ("Closed P&L"). While the trade is open and the box still runs, the middle plate reads "Open P&L". While no bar
//    has traded through the entry (the order is still waiting, or the box ended first) it reads "Not filled" instead of a
//    zero P&L (0.8.1).
//  * Stop from ATR (props.lvPositionAtr, off when absent, so saved positions load and save unchanged): the stop sits at
//    entry - k x ATR (long) or entry + k x ATR (short), ATR being Wilder's ATR (the RMA of the true range, as the ATR indicator)
//    over the chart bars up to and including the entry bar, and the quantity is floor(risk amount / (k x ATR x lot size)) whole
//    lots. This is the Turtle "N" unit (C. Faith, Way of the Turtle, 2007: N is the 20-day Wilder ATR, stops at 2N, units sized so
//    that one N move risks a fixed fraction of equity) and Van Tharp's percent-risk position sizing (Trade Your Way to Financial
//    Freedom, 1999; Definitive Guide to Position Sizing, 2008). k defaults to 2 and the ATR length to 14. The middle plate shows
//    the ATR and k x ATR. The stop follows on every paint (a paint that moves it writes it to the saved record once, with no undo
//    step, through the chart context's persist), handle drag and settings edit; a model rebuilt from its record reads the ATR back
//    from the saved stop.
//  * Always show stats off shows the plates only while the drawing is selected (the hook has no hover state). Without a chart
//    context (tests, an unwired chart) the plates always show.
// Fail closed: when the pin or the paint hook is missing, the native `position` registration stays untouched.
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import type {FactoryDefaultDefinition} from '../drawing-factory-defaults';
import type {LvPaintTheme} from '../lv-paint-hook';
import {cloneStyle,fail,inherited,lvKey,method,nativeBase,roles,type Init,type NativeBase,type NativeModel,type Projector} from '../lv-drawing-pin';
import {POSITION_CURRENCY_OPTIONS,POSITION_INPUTS_FACTORY_DEFAULTS,POSITION_INPUTS_FIELD,POSITION_PRECISION_MAX,effectivePositionInputs,readPositionInputs,riskDisplayValue,riskPercentFromDisplay,validatePositionInputs,type EffectivePositionInputs,type PositionInputsState} from '../position-inputs';
import {rma,trueRange} from '../../domain/indicators';
import type {Bar} from '../../domain/types';
import {textInkFor} from '../drawing-text-ink';
import {approxTextWidth,inRect,lineHeight,namedPx,paintPlate,strokePath,type Rect} from './paint-helpers';
import {defineLvDrawingToolModule} from './contract';

export const LV_POSITION_PREFIX='lvPosition.';
/** A settings path no field carries: a field shown only `when` it holds true is never offered (the hidden native settings). */
export const LV_POSITION_HIDDEN_PATH='lvPosition.nativeControls';
export const POSITION_FALLBACK_TICK=0.01;
/** Recorded Long defaults: accountSize 1000, risk 25 (unit percent: riskDisplayMode, inferred, so our own choice). */
export const POSITION_FACTORY_ACCOUNT=1000;
export const POSITION_FACTORY_RISK_PERCENT=25;
/** Zone fill alpha: profitBackground and stopBackground alpha 0.2 (transparency 80) in the Long defaults fact. */
export const POSITION_ZONE_ALPHA=0.2;
const PLATE_GAP=4,DEFAULT_TEXT='#ffffff';
/** The Qty plate with no P&L sign on a light chart background: a light box with dark text (WCAG contrast about 14:1), so it reads
 *  like the other labels on light charts instead of a dark grey box. A dark background keeps the line-colour box with white text. */
export const POSITION_LIGHT_PLATE_FILL='#e0e3eb',POSITION_LIGHT_PLATE_TEXT='#131722';

// ---------------------------------------------------------------- pure numbers and labels

export interface PositionLevels{readonly entry:number;readonly stop:number;readonly target:number}
export interface PositionMoney{readonly accountBalance:number;readonly riskPercent:number;readonly lotSize:number;readonly precision:number;readonly tick:number;/** Floor the quantity to whole lots (Stop from ATR sizing) instead of rounding it to Qty precision. */readonly wholeLots?:boolean}
export interface PositionSide{readonly offset:number;readonly percent:number;readonly ticks:number;readonly amount:number}
export interface PositionStats{readonly direction:'long'|'short';readonly target:PositionSide;readonly stop:PositionSide;readonly riskAmount:number;readonly qty:number;readonly rr:number}
const finiteOr=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
export function validTick(tick:unknown):tick is number{return typeof tick==='number'&&Number.isFinite(tick)&&tick>0&&tick<1e9;}
/** Decimals the tick size needs (0.01 -> 2, 0.25 -> 2, 1 -> 0), at most 8. */
export function tickDecimals(tick:number):number{
 if(!validTick(tick))return 2;
 for(let d=0;d<=POSITION_PRECISION_MAX;d++)if(Math.abs(Math.round(tick*10**d)-tick*10**d)<1e-7)return d;
 return POSITION_PRECISION_MAX;
}
/** Quantity (lots), amounts, ticks, percents and the risk/reward ratio of a position. */
export function positionStats(levels:PositionLevels,money:PositionMoney):PositionStats{
 const {entry,stop,target}=levels,tick=validTick(money.tick)?money.tick:POSITION_FALLBACK_TICK;
 const reward=Math.abs(target-entry),risk=Math.abs(entry-stop),lot=money.lotSize;
 const riskAmount=Math.max(0,finiteOr(money.accountBalance))*Math.max(0,finiteOr(money.riskPercent))/100;
 const raw=risk<1e-12||!(lot>0)?0:riskAmount/(risk*lot);
 // Whole lots: floor, with a relative tolerance so 2.9999999999 from binary fractions reads as the 3 it is.
 const qty=money.wholeLots?Math.max(0,Math.floor(finiteOr(raw)*(1+1e-12))):Number(finiteOr(raw).toFixed(Math.min(POSITION_PRECISION_MAX,Math.max(0,Math.trunc(money.precision)))));
 const side=(offset:number):PositionSide=>({offset,percent:entry!==0?offset/Math.abs(entry)*100:0,ticks:Math.round(offset/tick),amount:qty*lot*offset});
 return{direction:target>=entry?'long':'short',target:side(reward),stop:side(risk),riskAmount,qty,rr:risk<1e-12?0:reward/risk};
}

export interface PositionBar{readonly time:number;readonly high:number;readonly low:number;readonly close:number}
export type PositionTrade=
 | {readonly state:'unavailable'}
 | {readonly state:'waiting'}
 | {readonly state:'open';readonly price:number;readonly pnl:number}
 | {readonly state:'closed';readonly price:number;readonly pnl:number;readonly reason:'target'|'stop'|'end'};
/** The trade the box describes, walked over ascending bars (our own rule, see the file header). */
export function positionTrade(bars:readonly PositionBar[]|null|undefined,levels:PositionLevels,box:{readonly start:number;readonly end:number},size:{readonly qty:number;readonly lotSize:number}):PositionTrade{
 if(!Array.isArray(bars))return{state:'unavailable'};
 const {entry,stop,target}=levels,long=target>=entry,sign=long?1:-1,units=size.qty*size.lotSize;
 const pnl=(price:number)=>(price-entry)*sign*units;
 let active=false,last:number|null=null;
 for(const bar of bars){
  if(!bar||!Number.isFinite(bar.time)||bar.time<box.start)continue;
  if(bar.time>box.end){if(active&&last!==null)return{state:'closed',price:last,pnl:pnl(last),reason:'end'};return{state:'waiting'};}
  if(!active&&bar.low<=entry&&bar.high>=entry)active=true;
  if(active){
   const hitStop=long?bar.low<=stop:bar.high>=stop,hitTarget=long?bar.high>=target:bar.low<=target;
   if(hitStop)return{state:'closed',price:stop,pnl:pnl(stop),reason:'stop'};
   if(hitTarget)return{state:'closed',price:target,pnl:pnl(target),reason:'target'};
   last=bar.close;
  }
 }
 return active&&last!==null?{state:'open',price:last,pnl:pnl(last)}:{state:'waiting'};
}

// ---------------------------------------------------------------- Stop from ATR

export const POSITION_ATR_FIELD='lvPositionAtr';
export interface PositionAtrSettings{readonly enabled:boolean;readonly multiplier:number;readonly length:number}
/** Off, k 2 and length 14 (the Turtle 2N stop on the common 14-bar ATR); our own defaults. */
export const POSITION_ATR_DEFAULTS:PositionAtrSettings=Object.freeze({enabled:false,multiplier:2,length:14});
export const POSITION_ATR_DIAGNOSTIC='Saved Stop from ATR settings are unreadable and kept as is.';
export const POSITION_ATR_MAX_LENGTH=500,POSITION_ATR_MAX_MULTIPLIER=100;
const ATR_KEYS=['enabled','multiplier','length'] as const;
/** Exactly enabled, multiplier and length, plain data: multiplier above 0 up to 100, length a whole number from 1 to 500. */
export function validatePositionAtr(value:unknown):PositionAtrSettings{
 if(value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(POSITION_ATR_DIAGNOSTIC);
 const own=Reflect.ownKeys(value);if(own.length!==ATR_KEYS.length||own.some(key=>typeof key!=='string'||!(ATR_KEYS as readonly string[]).includes(key)))throw Error(POSITION_ATR_DIAGNOSTIC);
 const {enabled,multiplier,length}=value as Record<string,unknown>;
 if(typeof enabled!=='boolean'||typeof multiplier!=='number'||!Number.isFinite(multiplier)||multiplier<=0||multiplier>POSITION_ATR_MAX_MULTIPLIER||!Number.isInteger(length)||(length as number)<1||(length as number)>POSITION_ATR_MAX_LENGTH)throw Error(POSITION_ATR_DIAGNOSTIC);
 return Object.freeze({enabled,multiplier,length:length as number});
}
/** Wilder's ATR (RMA of the true range, seeded by the mean of the first `length` true ranges, as the ATR indicator) at the last
 *  bar with time at or before `entryTime`, over ascending bars. Null with fewer than `length` bars or an unusable value. */
export function positionAtr(bars:readonly PositionBar[]|null|undefined,entryTime:number,length:number):number|null{
 if(!Array.isArray(bars)||!Number.isInteger(length)||length<1)return null;
 let end=bars.length;while(end>0&&!(bars[end-1]&&bars[end-1].time<=entryTime))end--;
 if(end<length)return null;
 const upTo=bars.slice(0,end) as unknown as readonly Bar[],value=rma(trueRange(upTo),length).at(-1);
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
}
/** The ATR stop: entry - k x ATR for a long (target at or above entry), entry + k x ATR for a short; null without a positive distance. */
export function positionAtrStop(levels:Pick<PositionLevels,'entry'|'target'>,atr:number|null,multiplier:number):number|null{
 if(atr===null||!Number.isFinite(atr)||!(multiplier>0))return null;const distance=multiplier*atr;if(!(distance>0)||!Number.isFinite(distance))return null;
 const stop=levels.target>=levels.entry?levels.entry-distance:levels.entry+distance;return Number.isFinite(stop)?stop:null;
}

const money=(value:number)=>finiteOr(value).toFixed(2);
const ratio=(value:number)=>String(Number(finiteOr(value).toFixed(2)));
/** Middle plate wording while no bar has traded through the entry. */
export const POSITION_NOT_FILLED='Not filled';
export interface PositionLabelOptions{readonly compact:boolean;readonly priceDecimals:number;readonly precision:number;/** Stop from ATR on: the ATR (null while the bars are too few) and k, shown on the middle plate. */readonly atr?:{readonly value:number|null;readonly multiplier:number;readonly length:number}}
export interface PositionLabels{readonly target:readonly string[];readonly stop:readonly string[];readonly middle:readonly string[]}
/** Plate text. Full mode names every value; compact mode drops the names and puts the middle plate on one line (our own wording). */
export function positionLabels(stats:PositionStats,trade:PositionTrade,options:PositionLabelOptions):PositionLabels{
 const d=Math.min(POSITION_PRECISION_MAX,Math.max(0,Math.trunc(options.priceDecimals)));
 const side=(s:PositionSide)=>`${s.offset.toFixed(d)} (${s.percent.toFixed(2)}%) ${s.ticks}`;
 const qty=stats.qty.toFixed(Math.min(POSITION_PRECISION_MAX,Math.max(0,Math.trunc(options.precision))));
 const pl=trade.state==='closed'?'Closed P&L':'Open P&L',a=options.atr,k=a?ratio(a.multiplier):'';
 // Stop from ATR: "ATR (14): 1.25, 2 x ATR: 2.50"; with too few bars the stop stays where it is and the plate says so.
 const atr=!a?null:a.value===null?`ATR (${a.length}): needs ${a.length} bars`:`ATR (${a.length}): ${a.value.toFixed(d)}, ${k} x ATR: ${(a.value*a.multiplier).toFixed(d)}`;
 // The trade state as the middle plate leads with it: the P&L of a filled trade, "Not filled" while the entry was never traded.
 const status=trade.state==='open'||trade.state==='closed'?`${pl}: ${money(trade.pnl)}`:trade.state==='waiting'?POSITION_NOT_FILLED:null;
 if(options.compact){
  return{target:[`${side(stats.target)}, ${money(stats.target.amount)}`],stop:[`${side(stats.stop)}, ${money(stats.stop.amount)}`],
   middle:[[status,`Qty: ${qty}`,`R/R: ${ratio(stats.rr)}`,atr].filter(Boolean).join(', ')]};
 }
 return{target:[`Target: ${side(stats.target)}, Amount: ${money(stats.target.amount)}`],stop:[`Stop: ${side(stats.stop)}, Amount: ${money(stats.stop.amount)}`],
  middle:[status===null?`Qty: ${qty}`:`${status}, Qty: ${qty}`,`Risk/reward ratio: ${ratio(stats.rr)}`,...atr?[atr]:[]]};
}

// ---------------------------------------------------------------- chart context (root wiring)

/** What a chart tells its position drawings: its instrument tick size and which drawings are selected. `owns` answers whether the
 *  probe belongs to this chart: a paint passes the canvas it paints on (a chart answers for the canvases inside its container),
 *  other reads pass the model only. A model remembers the context its last paint matched. */
export interface PositionOwnerProbe{readonly model:object;readonly canvas?:unknown}
export interface PositionChartContext{readonly owns:(probe:PositionOwnerProbe)=>boolean;readonly tickSize?:()=>number|undefined;readonly isSelected?:(id:string)=>boolean;readonly isHovered?:(id:string)=>boolean;/** Writes a drawing whose paint moved its Stop from ATR stop to the saved document (quietly: no undo step; coalesced by the chart). */readonly persist?:(id:string)=>void}
const CONTEXTS=new Set<PositionChartContext>();
/** Registers one chart's context; the returned function removes it (call it when the chart is disposed). */
export function registerPositionChartContext(context:PositionChartContext):()=>void{
 if(!context||typeof context.owns!=='function')throw Error('A position chart context needs an owns(model) function.');
 CONTEXTS.add(context);return()=>{CONTEXTS.delete(context);};
}
const LAST=new WeakMap<object,PositionChartContext>();
/** The context a chart registers (adapter.ts): it owns the canvases inside its container, reads its instrument tick size and its selection. */
export function chartPositionContext(chart:{readonly container:{contains(node:unknown):boolean};readonly tickSize:()=>number|undefined;readonly selectedIds:()=>readonly string[];readonly hoveredId?:()=>string|null;readonly persist?:(id:string)=>void}):PositionChartContext{
 return Object.freeze({
  owns:({canvas}:PositionOwnerProbe)=>canvas!=null&&typeof canvas==='object'&&chart.container.contains(canvas),
  tickSize:chart.tickSize,
  isSelected:(id:string)=>chart.selectedIds().includes(id),
  ...(chart.hoveredId?{isHovered:(id:string)=>chart.hoveredId!()===id}:{}),
  ...(chart.persist?{persist:chart.persist}:{}),
 });
}
/** The drawing under the pointer, from a COMPAT-11 renderer (LV-VELA-RENDER-LEFTOVERS-1 lvHoveredDrawingId); null when
 *  the renderer has no such reader (stats then show on selection only, as before). */
export function rendererHoveredDrawingId(renderer:unknown):string|null{
 if(!renderer||typeof renderer!=='object')return null;
 const read=(renderer as {lvHoveredDrawingId?:unknown}).lvHoveredDrawingId;if(typeof read!=='function')return null;
 try{const id=Reflect.apply(read,renderer,[]);return typeof id==='string'?id:null;}catch{return null;}
}
function contextOf(model:object,canvas?:unknown):PositionChartContext|null{
 const last=LAST.get(model);if(canvas===undefined&&last&&CONTEXTS.has(last))return last;
 // Newest first: a chart rebuilt in the same container wins over a context a failed initialization left behind.
 for(const context of [...CONTEXTS].reverse()){try{if(context.owns(canvas===undefined?{model}:{model,canvas})){LAST.set(model,context);return context;}}catch{/* a retired chart answers nothing */}}
 return null;
}
/** The instrument tick size a drawing's prices should be written with (0.8.1 drawing price text). The model's own chart wins (the
 *  context its last paint matched); otherwise the finest valid tick among the registered charts, so a level never prints with fewer
 *  decimals than its instrument has. Undefined when no chart reports a tick (tests, an unwired chart). */
export function chartTickSizeFor(model:object|undefined):number|undefined{
 const own=model?contextOf(model):null;
 const read=(context:PositionChartContext)=>{try{const tick=context.tickSize?.();return validTick(tick)?tick:undefined;}catch{return undefined;}};
 const mine=own?read(own):undefined;if(mine!==undefined)return mine;
 let finest:number|undefined;
 for(const context of CONTEXTS){const tick=read(context);if(tick!==undefined&&(finest===undefined||tickDecimals(tick)>tickDecimals(finest)))finest=tick;}
 return finest;
}

// ---------------------------------------------------------------- the model

interface Box{x1:number;x2:number;ey:number;sy:number;ty:number}
export interface PositionModel extends NativeModel{
 riskPercent:number;accountBalance:number;profitColor:string;lossColor:string;
 direction:'long'|'short';entryPrice:number;stopPrice:number;targetPrice:number;
 prices():PositionLevels|null;
 resolved():{time:number;price:number}[]|null;
 box(proj:Projector):Box|null;
 levelPriceFromDisplay(level:'stop'|'target',mode:'price'|'points',value:number):number;
 constrainHandleDrag(index:number):void;
 onPlaced(proj:Projector):void;
 applySettings(patch:Record<string,unknown>):void;
}
interface ModelState{readonly read:PositionInputsState;readonly raw?:unknown}
/** Per-model member state; also the brand of a model built by this module. */
const STATES=new WeakMap<object,ModelState>();
type AtrState={readonly state:'absent'}|{readonly state:'supported';readonly settings:PositionAtrSettings}|{readonly state:'unavailable';readonly raw:unknown};
const ATR_STATES=new WeakMap<object,AtrState>();
const ATR_PATHS=['atrStop','atrMultiplier','atrLength'];
/** The last projector with bar access that painted or placed a model (a live chart model; models rebuilt from a record have none). */
const PROJECTORS=new WeakMap<object,Projector>();
/** The levels and Stop from ATR settings a model was built with. A paint writes the ATR stop to the saved record (persist), so a
 *  model rebuilt from the record (a settings Apply, a coordinate edit) reads the ATR back as |entry - stop| / k while the entry
 *  time and the ATR length are unchanged. */
const SAVED=new WeakMap<object,{readonly entryTime:number;readonly entry:number;readonly stop:number;readonly settings:PositionAtrSettings|null}>();
const ATR_MEMO=new WeakMap<object,{key:string;value:number|null}>();
const INPUT_KEYS=['lotSize','leverage','precision','compactStats','currency','alwaysShowStats','priceLabels'] as const;
const OWN_KEYS=[...INPUT_KEYS,'risk','riskUnit','profitTicks','stopTicks'];
const tidy=(value:number)=>Number(finiteOr(value).toPrecision(12));

/** The view the settings paths lvPosition.* read. */
export interface LvPositionView{lotSize:number;leverage:number;risk:number;riskUnit:'percentage'|'money';precision:number;compactStats:boolean;currency:string;alwaysShowStats:boolean;priceLabels:boolean;profitTicks:number;stopTicks:number;atrStop:boolean;atrMultiplier:number;atrLength:number}
export interface LvPositionPlate{readonly role:'target'|'stop'|'middle';readonly lines:readonly string[];readonly rect:Rect;readonly fill:string;/** True for the middle plate while it has no P&L sign (its fill is the line colour). */readonly neutral?:boolean}

let nativeCache:(NativeBase&{readonly replaced:boolean})|undefined;
/** The pinned native `position` class, captured before this module replaces its registration (memoized). When another module
 *  instance already replaced the registration (a second module graph), the native class is the nearest prototype that owns
 *  the native `resolved` method, and `replaced` is true: Long then fails closed, Short still builds on the native class. */
export function nativePositionBase():NativeBase&{readonly replaced:boolean}{
 if(nativeCache)return nativeCache;
 let base=nativeBase('position'),replaced=false;
 if(typeof (base.sample as {lvPaint?:unknown}).lvPaint==='function'){
  let owner:object|null=base.prototype;
  for(let depth=0;owner&&depth<8&&!Object.hasOwn(owner,'resolved');depth++)owner=Object.getPrototypeOf(owner);
  if(!owner||typeof (owner as {lvPaint?:unknown}).lvPaint==='function'&&Object.hasOwn(owner,'lvPaint'))fail('position is replaced and its native class is not reachable');
  const ctor=(owner as {constructor:unknown}).constructor;
  if(typeof ctor!=='function'||(ctor as {prototype:unknown}).prototype!==owner)fail('native position constructor is not reachable');
  base={...base,ctor:ctor as NativeBase['ctor'],prototype:owner!};replaced=true;
 }
 for(const key of ['onPlaced','constrainHandleDrag','anchorSchema','resolved','prices','box','levelPriceFromDisplay','readProps','writeProps','schema','serialize','applySettings','hitTest'])method(base.prototype,key);
 for(const key of ['direction','entryPrice','stopPrice','targetPrice']){const d=inherited(base.prototype,key);if(typeof d.get!=='function'||typeof d.set!=='function')fail('position '+key+' accessor changed');}
 const shape=roles(base.sample);
 if(shape.min!==2||shape.max!==2||shape.roles!=='entry/stop/target')fail('position anchor schema changed: '+JSON.stringify(shape));
 const sample=base.sample as unknown as Partial<PositionModel>;
 if(!Number.isFinite(sample.riskPercent)||!Number.isFinite(sample.accountBalance)||typeof sample.profitColor!=='string'||typeof sample.lossColor!=='string')fail('position risk, account or color fields changed');
 const minDrag=(base.ctor as unknown as {MIN_DRAG_PX?:unknown}).MIN_DRAG_PX;
 if(typeof minDrag!=='number'||!Number.isFinite(minDrag)||minDrag<=0)fail('position degenerate-click threshold changed');
 nativeCache=Object.freeze({...base,replaced});return nativeCache;
}

/** A Long/Short position is placed with ONE click and a default-sized box. The native class is
 *  click-move-click (two anchors). The interaction creates the placement draft with exactly the pressed anchor and finalizes
 *  as soon as the draft holds the schema's anchor count, so the draft starts with the press doubled: the placement finishes
 *  on that press, and the native onPlaced reads the degenerate second anchor as "default box" (Long faces long, Short faces
 *  short). Saved records (three anchors) and programmatic creates with other counts are untouched. */
export function singleClickPlacement(init:Init):Init{
 const anchors=init.anchors;
 if(!Array.isArray(anchors)||anchors.length!==1||!anchors[0])return init;
 return{...init,anchors:[anchors[0],{...anchors[0]}]};
}
/** The LV position model on a native position class (Long and Short share it). */
export function withLvPosition(Base:new(init:Init)=>PositionModel):new(init:Init)=>PositionModel{
 class LvPosition extends Base{
  // No class fields: the base constructor calls readProps before they would be initialized.
  constructor(init:Init){super(singleClickPlacement(init));if(!STATES.has(this))STATES.set(this,{read:{state:'legacy',settings:POSITION_INPUTS_FACTORY_DEFAULTS}});
   const [entry,stop]=this.anchors;if(entry&&stop&&this.anchors.length===3)SAVED.set(this,{entryTime:entry.time,entry:entry.price,stop:stop.price,settings:this.lvAtrSettings()});}
  protected readProps(props:Record<string,unknown>):void{
   super.readProps(props);
   const read=readPositionInputs(props);
   STATES.set(this,read.state==='unavailable'?{read,raw:structuredClone(Object.getOwnPropertyDescriptor(props,POSITION_INPUTS_FIELD)?.value)}:{read});
   const atr=props&&typeof props==='object'?Object.getOwnPropertyDescriptor(props,POSITION_ATR_FIELD):undefined;
   if(!atr)ATR_STATES.set(this,{state:'absent'});
   else{let settings:PositionAtrSettings|null=null;try{if(atr.enumerable&&Object.hasOwn(atr,'value'))settings=validatePositionAtr(atr.value);}catch{settings=null;}
    ATR_STATES.set(this,settings?{state:'supported',settings}:{state:'unavailable',raw:structuredClone(atr.value)});}
  }
  protected writeProps():Record<string,unknown>|undefined{
   const props=super.writeProps(),state=STATES.get(this),atr=ATR_STATES.get(this);
   let out=props;
   if(state&&state.read.state!=='legacy')out={...(out??{}),[POSITION_INPUTS_FIELD]:state.read.state==='supported'?{...state.read.settings}:structuredClone(state.raw)};
   if(atr&&atr.state!=='absent')out={...(out??{}),[POSITION_ATR_FIELD]:atr.state==='supported'?{...atr.settings}:structuredClone(atr.raw)};
   return out;
  }
  /** Stop from ATR settings; the defaults (off) when absent, null while the saved member is unreadable (kept verbatim, not editable). */
  lvAtrSettings():PositionAtrSettings|null{const atr=ATR_STATES.get(this);return !atr||atr.state==='absent'?POSITION_ATR_DEFAULTS:atr.state==='supported'?atr.settings:null;}
  /** The ATR at the entry bar while Stop from ATR is on (value null while the bars are too few or unreadable); null when off. */
  lvAtr(proj?:Projector):{settings:PositionAtrSettings;value:number|null}|null{
   if(proj&&typeof proj.barsInRange==='function')PROJECTORS.set(this,proj);
   const settings=this.lvAtrSettings();if(!settings?.enabled)return null;const source=PROJECTORS.get(this),entry=this.anchors[0];
   if(!entry||!Number.isFinite(entry.time))return{settings,value:null};
   if(!source){
    // No bars here (a model rebuilt from its record): the saved stop is the ATR stop the chart wrote.
    const saved=SAVED.get(this),was=saved?.settings,value=saved&&was?.enabled&&was.length===settings.length&&saved.entryTime===entry.time?Math.abs(saved.entry-saved.stop)/was.multiplier:null;
    return{settings,value:value!==null&&Number.isFinite(value)&&value>0?value:null};
   }
   let bars:readonly PositionBar[]|null=null;try{bars=source.barsInRange!(Number.MIN_SAFE_INTEGER,entry.time) as readonly PositionBar[];}catch{bars=null;}
   if(!Array.isArray(bars))return{settings,value:null};
   const head=bars[0],tail=bars.at(-1),key=[settings.length,entry.time,bars.length,head?.time,tail?.time,tail?.high,tail?.low,tail?.close].join('|'),held=ATR_MEMO.get(this);
   if(held&&held.key===key)return{settings,value:held.value};
   const value=positionAtr(bars,entry.time,settings.length);ATR_MEMO.set(this,{key,value});return{settings,value};
  }
  /** With Stop from ATR on and an ATR known, puts the stop anchor at the ATR stop (no opposite-side reflection is needed: the
   *  stop goes opposite the target by construction). True when the stop moved. */
  lvSyncAtrStop(proj?:Projector):boolean{
   const atr=this.lvAtr(proj),levels=atr?this.prices():null,stop=this.anchors[1];
   if(!atr||!levels||!stop||this.anchors.length<3)return false;
   const want=positionAtrStop(levels,atr.value,atr.settings.multiplier);
   if(want===null||stop.price===want)return false;
   stop.price=want;return true;
  }
  /** Effective inputs, or null while the saved member is unreadable (it is then kept verbatim and not editable). */
  lvInputs():EffectivePositionInputs|null{const read=STATES.get(this)?.read;return read&&read.state!=='unavailable'?effectivePositionInputs(read.settings):null;}
  lvDisplay():EffectivePositionInputs{return this.lvInputs()??effectivePositionInputs(POSITION_INPUTS_FACTORY_DEFAULTS);}
  lvTickSize():number{const tick=contextOf(this)?.tickSize?.();return validTick(tick)?tick:POSITION_FALLBACK_TICK;}
  lvStatsVisible():boolean{
   if(this.lvDisplay().alwaysShowStats)return true;
   const context=contextOf(this);if(!context||typeof context.isSelected!=='function')return true;
   // With Always show stats off the stats show while the position is selected or hovered.
   try{if(context.isSelected(this.id)===true)return true;}catch{return true;}
   try{return context.isHovered?.(this.id)===true;}catch{return false;}
  }
  get lvPosition():LvPositionView|undefined{
   const s=this.lvInputs();if(!s)return undefined;
   const p=this.prices(),tick=this.lvTickSize();
   const atr=this.lvAtrSettings()??POSITION_ATR_DEFAULTS;
   return{lotSize:s.lotSize,leverage:s.leverage,risk:tidy(riskDisplayValue(s.riskMode,this.riskPercent,this.accountBalance)),riskUnit:s.riskMode,precision:s.precision,compactStats:s.compactStats,currency:s.currency,
    alwaysShowStats:s.alwaysShowStats,priceLabels:s.priceLabels,profitTicks:p?Math.round(Math.abs(p.target-p.entry)/tick):0,stopTicks:p?Math.round(Math.abs(p.entry-p.stop)/tick):0,
    atrStop:atr.enabled,atrMultiplier:atr.multiplier,atrLength:atr.length};
  }
  schema(){
   const nativeSchema=super.schema(),native=nativeSchema.fields,byPath=new Map(native.map(field=>[field.path,field]));
   const take=(path:string,label?:string):SettingsField|null=>{const field=byPath.get(path);return field?{...field,...label?{label}:{}}:null;};
   const s=this.lvInputs();
   const own=(key:string,label:string,kind:SettingsField['kind'],group:SettingsField['group'],extra:Partial<SettingsField>={}):SettingsField|null=>s?{path:LV_POSITION_PREFIX+key,label,kind,group,...extra}:null;
   const currencies=s&&!POSITION_CURRENCY_OPTIONS.includes(s.currency)?[...POSITION_CURRENCY_OPTIONS,s.currency]:POSITION_CURRENCY_OPTIONS;
   const inputs=[
    take('accountBalance','Account size'),
    own('lotSize','Lot size','number','behavior',{min:0,max:1e12}),
    own('risk','Risk','number','behavior',{min:0,max:1e12}),
    own('riskUnit','Risk unit','select','behavior',{options:[{value:'percentage',label:'%'},{value:'money',label:s?.currency??'USD'}]}),
    own('leverage','Leverage','number','behavior',{min:0,max:1e12}),
    take('entryPrice','Entry price'),
    own('profitTicks','Profit level ticks','number','behavior',{min:0,max:1e12,step:1}),
    take('targetPrice','Profit level price'),
    own('stopTicks','Stop level ticks','number','behavior',{min:0,max:1e12,step:1}),
    take('stopPrice','Stop level price'),
    ...this.lvAtrSettings()?[own('atrStop','Stop from ATR','boolean','behavior'),
     own('atrMultiplier','ATR multiplier (k)','number','behavior',{min:0.01,max:POSITION_ATR_MAX_MULTIPLIER,step:0.1,when:{path:LV_POSITION_PREFIX+'atrStop',in:[true]}}),
     own('atrLength','ATR length','number','behavior',{min:1,max:POSITION_ATR_MAX_LENGTH,step:1,when:{path:LV_POSITION_PREFIX+'atrStop',in:[true]}})]:[],
    own('precision','Qty precision','number','behavior',{min:0,max:POSITION_PRECISION_MAX,step:1}),
    own('currency','Account currency','select','behavior',{options:currencies.map(value=>({value,label:value}))}),
   ];
   const style=[
    {path:'style.lineColor',label:'Line color',kind:'color',group:'line'} as SettingsField,
    take('style.lineWidth'),take('style.lineStyle'),
    take('lossColor','Stop color'),take('profitColor','Target color'),
    take('text.color'),take('text.size'),
    own('priceLabels','Price labels','boolean','text'),
    own('compactStats','Compact stats mode','boolean','text'),
    own('alwaysShowStats','Always show stats','boolean','text'),
   ];
   const shown=[...inputs,...style].filter((field):field is SettingsField=>field!==null),paths=new Set(shown.map(field=>field.path));
   const hidden=native.filter(field=>!paths.has(field.path)).map(field=>({...field,when:{path:LV_POSITION_HIDDEN_PATH,in:[true]}}));
   return{...nativeSchema,fields:[...shown,...hidden]};
  }
  /** lvPosition.* paths are validated as one whole member before anything changes; the rest is the native patch. */
  applySettings(patch:Record<string,unknown>):void{
   const atrPaths=Object.keys(patch).filter(path=>path.startsWith(LV_POSITION_PREFIX)&&ATR_PATHS.includes(path.slice(LV_POSITION_PREFIX.length)));
   if(atrPaths.length){
    // Stop from ATR is its own member: validated whole, then the rest of the patch applies as before, then the stop follows.
    const current=this.lvAtrSettings();if(!current)throw Error(POSITION_ATR_DIAGNOSTIC);
    const draft:Record<string,unknown>={...current};
    for(const path of atrPaths){const key=path.slice(LV_POSITION_PREFIX.length),value=patch[path];draft[key==='atrStop'?'enabled':key==='atrMultiplier'?'multiplier':'length']=value;}
    let next:PositionAtrSettings;try{next=validatePositionAtr(draft);}catch{throw Error('ATR multiplier must be above 0 and at most '+POSITION_ATR_MAX_MULTIPLIER+', ATR length a whole number from 1 to '+POSITION_ATR_MAX_LENGTH+'.');}
    const rest=Object.fromEntries(Object.entries(patch).filter(([path])=>!atrPaths.includes(path)));
    if(Object.keys(rest).length)this.applySettings(rest);
    ATR_STATES.set(this,{state:'supported',settings:next});this.lvSyncAtrStop();return;
   }
   const own=Object.keys(patch).filter(path=>path.startsWith(LV_POSITION_PREFIX));
   if(!own.length){this.lvNative(patch);this.lvSyncAtrStop();return;}
   const read=STATES.get(this)?.read;if(!read||read.state==='unavailable')throw Error(read&&read.state==='unavailable'?read.message:'Position inputs are unavailable.');
   const draft:Record<string,unknown>={...effectivePositionInputs(read.settings),schemaVersion:2};
   let risk:number|undefined,profitTicks:number|undefined,stopTicks:number|undefined;
   const count=(value:unknown,label:string)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12)throw Error(label+' must be a number from 0.');return value;};
   for(const path of own){
    const key=path.slice(LV_POSITION_PREFIX.length),value=patch[path];
    if(!OWN_KEYS.includes(key))throw Error('Property is not supported by this tool: '+path);
    if(key==='risk')risk=count(value,'Risk');
    else if(key==='riskUnit')draft.riskMode=value;
    else if(key==='profitTicks')profitTicks=Math.round(count(value,'Profit level ticks'));
    else if(key==='stopTicks')stopTicks=Math.round(count(value,'Stop level ticks'));
    else draft[key]=value;
   }
   const next=validatePositionInputs(draft);
   const rest=Object.fromEntries(Object.entries(patch).filter(([path])=>!own.includes(path)));
   const accountBefore=this.accountBalance,amountBefore=accountBefore*this.riskPercent/100;
   this.lvNative(rest);
   if(risk!==undefined){
    const percent=riskPercentFromDisplay(next.riskMode,risk,this.accountBalance);
    if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Risk is outside the allowed range for this account size.');
    this.riskPercent=percent;
   }else if(next.riskMode==='money'&&this.accountBalance!==accountBefore&&this.accountBalance>0)this.riskPercent=Math.min(100,amountBefore/this.accountBalance*100);
   const tick=this.lvTickSize();
   if(profitTicks!==undefined)this.targetPrice=this.levelPriceFromDisplay('target','points',profitTicks*tick);
   if(stopTicks!==undefined)this.stopPrice=this.levelPriceFromDisplay('stop','points',stopTicks*tick);
   STATES.set(this,{read:{state:'supported',settings:next}});
   this.lvSyncAtrStop();
  }
  /** The native patch; in money mode an account size change keeps the risk amount (the reference risk is an amount then). */
  lvNative(patch:Record<string,unknown>):void{
   if(!Object.keys(patch).length)return;
   const before=this.accountBalance,amount=before*this.riskPercent/100,mode=this.lvInputs()?.riskMode;
   super.applySettings(patch);
   if(mode==='money'&&Object.hasOwn(patch,'accountBalance')&&!Object.hasOwn(patch,'riskPercent')&&this.accountBalance!==before&&this.accountBalance>0)this.riskPercent=Math.min(100,amount/this.accountBalance*100);
  }
  /** The native opposite-side rule, then one right edge: a dragged stop or target handle carries the other level's end time with it. */
  constrainHandleDrag(index:number):void{
   // Stop from ATR first, so the opposite-side rule sees the stop the entry or target now implies.
   this.lvSyncAtrStop();
   super.constrainHandleDrag(index);
   const me=index===1||index===2?this.anchors[index]:undefined,other=this.anchors[index===1?2:1];
   if(me&&other&&Number.isFinite(me.time))other.time=me.time;
   // Stop from ATR: the stop follows the entry (and snaps back when its own handle is dragged).
   this.lvSyncAtrStop();
  }
  onPlaced(proj:Projector):void{super.onPlaced(proj);this.lvSyncAtrStop(proj);}
  lvStats(proj?:Projector):{stats:PositionStats;trade:PositionTrade;labels:PositionLabels}|null{
   const atr=this.lvAtr(proj),prices=this.prices(),r=this.resolved();if(!prices||!r||r.length<3)return null;
   const s=this.lvDisplay(),tick=this.lvTickSize(),atrStop=atr?positionAtrStop(prices,atr.value,atr.settings.multiplier):null,levels=atrStop===null?prices:{...prices,stop:atrStop};
   const stats=positionStats(levels,{accountBalance:this.accountBalance,riskPercent:this.riskPercent,lotSize:s.lotSize,precision:s.precision,tick,...atrStop!==null?{wholeLots:true}:{}});
   const start=r[0].time,end=Math.max(r[1].time,r[2].time);
   let bars:readonly PositionBar[]|null=null;
   if(proj&&typeof proj.barsInRange==='function'){try{bars=proj.barsInRange(start,Number.MAX_SAFE_INTEGER) as readonly PositionBar[];}catch{bars=null;}}
   const trade=positionTrade(bars,levels,{start,end},{qty:stats.qty,lotSize:s.lotSize});
   return{stats,trade,labels:positionLabels(stats,trade,{compact:s.compactStats,priceDecimals:tickDecimals(tick),precision:s.precision,...atr?{atr:{value:atrStop===null?null:atr.value,multiplier:atr.settings.multiplier,length:atr.settings.length}}:{}})};
  }
  /** Plate rectangles (text width approximated, as the hit boxes of the other LV plates) and fills. Empty while stats are hidden. */
  lvPlates(proj:Projector):LvPositionPlate[]{
   if(!this.lvStatsVisible())return[];
   const b=this.box(proj),view=this.lvStats(proj);if(!b||!view)return[];
   const px=namedPx(this.text?.size??'small'),cx=(b.x1+b.x2)/2;
   const size=(lines:readonly string[])=>({w:Math.max(...lines.map(line=>approxTextWidth(line,px)))+12,h:lines.length*lineHeight(px)+8});
   const away=(edge:number,lines:readonly string[]):Rect=>{const {w,h}=size(lines),up=edge<b.ey||edge===b.ey&&lines===view.labels.target;const y=up?edge-PLATE_GAP-h:edge+PLATE_GAP;return{x:cx-w/2,y,w,h};};
   const mid=size(view.labels.middle),trade=view.trade,pnl=trade.state==='open'||trade.state==='closed'?trade.pnl:0;
   return[
    {role:'target',lines:view.labels.target,rect:away(b.ty,view.labels.target),fill:this.profitColor},
    {role:'middle',lines:view.labels.middle,rect:{x:cx-mid.w/2,y:b.ey-mid.h/2,w:mid.w,h:mid.h},fill:pnl>0?this.profitColor:pnl<0?this.lossColor:this.style.lineColor,neutral:!(pnl>0||pnl<0)},
    {role:'stop',lines:view.labels.stop,rect:away(b.sy,view.labels.stop),fill:this.lossColor},
   ];
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   if(super.hitTest(px,py,proj,tol))return true;
   return this.lvPlates(proj).some(plate=>inRect(px,py,plate.rect));
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const context=CONTEXTS.size?contextOf(this,(ctx as {canvas?:unknown}).canvas??null):null;
   // The ATR at the entry changes only when bars at or before the entry first arrive, so this writes the saved record once.
   if(this.lvSyncAtrStop(proj)){try{context?.persist?.(this.id);}catch{/* a retired chart takes no write */}}
   const b=this.box(proj);if(!b)return;
   const w=b.x2-b.x1;
   const zone=(y1:number,y2:number,color:string)=>{ctx.save();ctx.globalAlpha=POSITION_ZONE_ALPHA*ctx.globalAlpha;ctx.fillStyle=color;ctx.fillRect(b.x1,Math.min(y1,y2),w,Math.abs(y2-y1));ctx.restore();};
   zone(b.ey,b.ty,this.profitColor);zone(b.ey,b.sy,this.lossColor);
   strokePath(ctx,this.style,()=>{ctx.moveTo(b.x1,b.ey);ctx.lineTo(b.x2,b.ey);});
   const px=namedPx(this.text?.size??'small'),font=px+'px '+theme.fontFamily,text=typeof this.text?.color==='string'&&this.text.color?this.text.color:DEFAULT_TEXT;
   const light=textInkFor([theme?.background])==='#000000';
   for(const plate of this.lvPlates(proj)){const lit=light&&plate.neutral===true;paintPlate(ctx,plate.lines,plate.rect.x+plate.rect.w/2,plate.rect.y+plate.rect.h/2,{font,px,fill:lit?POSITION_LIGHT_PLATE_FILL:plate.fill,text:lit?POSITION_LIGHT_PLATE_TEXT:text});}
  }
 }
 return LvPosition as unknown as new(init:Init)=>PositionModel;
}
/** True for a model built by this module (the native fallback has no member state). */
export function isLvPositionModel(model:object):boolean{return STATES.has(model);}

/** A fresh Long or Short position: the recorded account size and risk (risk unit, see POSITION_FACTORY_RISK_PERCENT) and the input defaults. */
export function seedPosition(model:object):void{
 const m=model as Partial<PositionModel>;
 m.accountBalance=POSITION_FACTORY_ACCOUNT;m.riskPercent=POSITION_FACTORY_RISK_PERCENT;
 if(STATES.has(model))STATES.set(model,{read:{state:'supported',settings:POSITION_INPUTS_FACTORY_DEFAULTS}});
}
const probe=(sample:object)=>{const m=sample as Partial<PositionModel>;return Number.isFinite(m.riskPercent)&&Number.isFinite(m.accountBalance)?undefined:'position risk or account fields changed';};
/** Long position: accountSize 1000 and linewidth 1 are facts; risk 25 with the percent unit is our own choice (riskDisplayMode is inferred).
 *  Moved here from drawing-factory-defaults.ts DEFINITIONS so it wraps the replacing registration. */
export const LONG_POSITION_FACTORY:FactoryDefaultDefinition=Object.freeze({type:'position',toolId:'LineToolRiskRewardLong',factId:'tool.LineToolRiskRewardLong.defaults',style:Object.freeze({lineWidth:1}),probe,seed:seedPosition});

function defineLongPosition():DrawingTypeMeta{
 const base=nativePositionBase();
 if(base.replaced)fail('position is already replaced by another module instance');
 const Model=withLvPosition(base.ctor as unknown as new(init:Init)=>PositionModel);
 class LvLongPosition extends (Model as new(init:Init)=>PositionModel){}
 const meta=base.meta;
 return{type:lvKey('position'),group:meta.group,label:meta.label,icon:meta.icon,defaultStyle:cloneStyle(meta),
  ...(meta.coversSeries!==undefined?{coversSeries:meta.coversSeries}:{}),...(meta.placementHint!==undefined?{placementHint:meta.placementHint}:{}),
  create:init=>new LvLongPosition(init)};
}

export const LONG_POSITION_MODULE=defineLvDrawingToolModule({
 id:'long-position',
 types:[{type:'position',base:'position',define:defineLongPosition,requiresPaintHook:true,replacesNative:true}],
 factoryDefaults:[LONG_POSITION_FACTORY],
});
