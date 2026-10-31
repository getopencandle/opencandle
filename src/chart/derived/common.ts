// Shared pieces of the LV non-time (derived) chart transforms: Renko, Kagi, Point and figure,
// Line break and Range. Every transform is a pure, deterministic function of the supplied
// standard bars and settings. Original LV code; construction rules that the reference facts do
// not pin down are listed in DERIVED_UNRESOLVED and never presented as reference behavior.
import type {Bar} from '../../domain/types';
import type {ChartDiagnostic} from '../contracts';

export const DERIVED_STYLES=['renko','kagi','pointfigure','linebreak','range'] as const;
export type DerivedStyle=typeof DERIVED_STYLES[number];
export function isDerivedStyle(style:string):style is DerivedStyle{return (DERIVED_STYLES as readonly string[]).includes(style);}

/** One display bar of a derived topology. Its time is the source bar that confirmed it (projection: the last source bar). */
export interface DerivedBar extends Bar {
  direction:'up'|'down';
  /** Inclusive source-bar index span [first, last] that built this display bar. */
  span:[number,number];
  /** True for the trailing, still-forming bar: kept apart from confirmed bars and repaints. */
  projection:boolean;
  /** Source-bar index at which this bar became final (no later price can change it). Its time is that bar's time:
   *  a bar is never stamped earlier than the moment it is knowable. Absent on still-forming projection bars. */
  confirmedAt?:number;
  /** Range only: the bar fills a price gap between source bars (phantom bars on). */
  phantom?:boolean;
  /** Point and figure only: number of boxes in the column. */
  boxes?:number;
  /** Kagi only: thick (yang) state at the start and end of the segment and the price where it switched. */
  yangStart?:boolean;yangEnd?:boolean;switchPrice?:number|null;
}
export type Construction='source-close'|'ohlc-path-approximation'|'high-low-approximation';
export interface DerivedSeries {
  style:DerivedStyle;
  /** Stable calculation identity: style plus canonical construction parameters. */
  transformId:string;
  confirmed:DerivedBar[];
  projection:DerivedBar[];
  /** Resolved price step (box size, reversal amount or range size); null for Line break. */
  step:number|null;
  construction:Construction;
}
export type DerivedResult={ok:true;value:DerivedSeries}|{ok:false;diagnostic:ChartDiagnostic};
export function unavailable(style:string,code:string,message:string):DerivedResult{return {ok:false,diagnostic:{code,feature:style,message,severity:'unavailable'}};}
export function validBars(bars:readonly Bar[]):boolean{return bars.every(bar=>[bar.time,bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)&&bar.high>=bar.low);}

/** ATR at the last source bar: Wilder moving average of true range, seeded with the simple mean of the first `length` true ranges; the first true range is high minus low. */
export function lastAtr(bars:readonly Bar[],length:number):number|null{
  if(!Number.isInteger(length)||length<1||bars.length<length)return null;
  let value=0;
  for(let index=0;index<bars.length;index++){
    const bar=bars[index],previous=bars[index-1],range=previous?Math.max(bar.high-bar.low,Math.abs(bar.high-previous.close),Math.abs(bar.low-previous.close)):bar.high-bar.low;
    if(index<length){value+=range;if(index===length-1)value/=length;}else value=(value*(length-1)+range)/length;
  }
  return value;
}
export type StepMethod='ATR'|'Traditional'|'Percentage';
export const STEP_METHODS:readonly StepMethod[]=['ATR','Traditional','Percentage'];
/** Resolve a box size or reversal amount. ATR: ATR(atrLength) at the last source bar. Traditional: the fixed value. Percentage: percent of the last close (last traded price). */
export function resolveStep(style:string,bars:readonly Bar[],method:unknown,input:{atrLength:unknown;fixed:unknown;percentage:unknown}):{ok:true;value:number}|{ok:false;diagnostic:ChartDiagnostic}{
  const fail=(code:string,message:string)=>unavailable(style,code,message) as {ok:false;diagnostic:ChartDiagnostic};
  if(!bars.length)return fail('DERIVED_INPUT_EMPTY','No source bars are available for this chart type.');
  let value:number;
  if(method==='ATR'){const length=Number(input.atrLength),atr=lastAtr(bars,length);if(atr===null)return fail('DERIVED_ATR_UNAVAILABLE',`ATR(${String(input.atrLength)}) needs at least that many source bars.`);value=atr;}
  else if(method==='Traditional')value=Number(input.fixed);
  else if(method==='Percentage')value=bars.at(-1)!.close*Number(input.percentage)/100;
  else return fail('DERIVED_SETTING_INVALID',`Unknown step method ${String(method)}.`);
  if(!Number.isFinite(value)||value<=0)return fail('DERIVED_STEP_UNAVAILABLE','The resolved step is not a positive finite price.');
  return {ok:true,value};
}
/** Intrabar price path used when a construction reads OHLC: rising bars O-L-H-C, falling bars O-H-L-C. An approximation of tick order, labelled as such. */
export function ohlcPath(bar:Bar):number[]{return bar.close>=bar.open?[bar.open,bar.low,bar.high,bar.close]:[bar.open,bar.high,bar.low,bar.close];}
const EPSILON=1e-9;
/** Number of whole steps in a distance, tolerant of binary floating point. */
export function wholeSteps(distance:number,step:number):number{return Math.floor(distance/step+EPSILON);}
export function canonicalTransformId(style:DerivedStyle,parameters:Record<string,unknown>):string{
  return style+':'+JSON.stringify(Object.keys(parameters).sort().map(key=>[key,parameters[key]]));
}
/** Slice approximations (decision D1 convention, pending reference observation): construction choices with no recorded reference fact. */
export interface DerivedSliceApproximation{readonly id:string;readonly styles:readonly DerivedStyle[];readonly subject:string;readonly value:string;readonly factIds:readonly string[];readonly status:'pending reference observation'}
export const DERIVED_SLICE_APPROXIMATIONS:readonly DerivedSliceApproximation[]=Object.freeze(([
  {id:'CTX-SA-1',styles:['renko','pointfigure','kagi'],subject:'box anchor',value:'Renko and Kagi start at the first source price; Point and figure boxes sit on a zero-anchored grid of whole box multiples.',factIds:['static-chart-defaults#style.renkoStyle','static-chart-defaults#style.pnfStyle','static-chart-defaults#style.kagiStyle']},
  {id:'CTX-SA-2',styles:['renko','pointfigure','kagi'],subject:'ATR evaluation point',value:'ATR(atrLength) (Wilder, SMA seed, first TR = high - low) evaluated once at the last source bar; no tick rounding.',factIds:['static-chart-defaults#style.renkoStyle','static-chart-defaults#style.pnfStyle','static-chart-defaults#style.kagiStyle']},
  {id:'CTX-SA-3',styles:['range'],subject:'Range unit',value:'inputs.range is read as instrument ticks (range x tickSize); a missing tick size is unavailable.',factIds:['static-chart-defaults#style.rangeStyle']},
  {id:'CTX-SA-4',styles:['range','renko'],subject:'gap and intrabar handling',value:'OHLC path O-L-H-C (rising) / O-H-L-C (falling); Range gaps close the forming bar at its last price (phantom off) or are walked as phantom bars (phantom on).',factIds:['static-chart-defaults#style.rangeStyle']},
  {id:'CTX-SA-6',styles:['renko','kagi','pointfigure','linebreak','range'],subject:'confirmation time',value:'A confirmed bar is stamped with the time of the source bar that confirmed it (Kagi/Point and figure: the reversal bar, not the extreme bar; Range gap close: the gapping bar); projection bars carry the last source bar time. With a forming last bar, every bar confirmed by it is projection. No reference fact records this.',factIds:['static-chart-defaults#style.kagiStyle','static-chart-defaults#style.pnfStyle']},
  {id:'R34-SA-1',styles:['renko','kagi','pointfigure'],subject:'step while the last bar is forming',value:'With a forming last bar, ATR and Percentage steps are read on the completed bars (all bars when the completed bars cannot resolve one), and the adapter pins the first resolved step for the life of one live subscription and one setting set, so ticks and newly closed bars never re-brick the history. Traditional steps are fixed anyway.',factIds:['static-chart-defaults#style.renkoStyle','static-chart-defaults#style.kagiStyle','static-chart-defaults#style.pnfStyle']},
  {id:'R34-SA-2',styles:['pointfigure'],subject:'one step back building',value:'On: a reversal column starts in the row of the previous column extreme (sharing that row) instead of one box beyond it; the reversal threshold is unchanged. The fact gives only the name and the default (off).',factIds:['static-chart-defaults#style.pnfStyle']},
  {id:'R34-SA-3',styles:['pointfigure'],subject:'box rows',value:'Box label L is the row [(L-1)*box, L*box] for X and O columns; X box L fills at price >= L*box, O box L at price <= L*box. The first X box is the first label above the first price, the first O box the first label below it.',factIds:['static-chart-defaults#style.pnfStyle']},
  {id:'CTX-SA-5',styles:['renko','kagi','pointfigure','linebreak','range'],subject:'projection meaning',value:'Projection = the still-forming bar (partial brick, last segment, last column, current range bar) plus, with lastBarOpen, bars completed by the last source bar; drawn in the projection colors and never fed to calculations.',factIds:['static-chart-defaults#style.renkoStyle','static-chart-defaults#style.pbStyle','static-chart-defaults#style.rangeStyle']},
] as Omit<DerivedSliceApproximation,'status'>[]).map(row=>Object.freeze({...row,status:'pending reference observation' as const})));
export function derivedBar(time:number,open:number,close:number,high:number,low:number,span:[number,number],extra:Partial<DerivedBar>={}):DerivedBar{
  return {time,open,high:Math.max(high,open,close),low:Math.min(low,open,close),close,volume:NaN,direction:close>=open?'up':'down',span,projection:false,...extra};
}
