// Price scale state, defaults and transforms.
import type {PriceScaleMode as ChartOptionsScale} from './navigation';

/** The four radio-like scale modes. */
export type PriceScaleModeId='regular'|'percent'|'indexed'|'logarithmic';
export const PRICE_SCALE_MODES:readonly PriceScaleModeId[]=Object.freeze(['regular','percent','indexed','logarithmic']);

/** One pane's scale as the renderer holds it. `mode` folds Vela's mode + log flag into the radio group. */
export interface PaneScaleView {paneId:string;kind:'price'|'study';mode:PriceScaleModeId;auto:boolean;invert:boolean}

export type PriceScaleLabelId='symbolName'|'symbolLast'|'prevClose'|'prePost'|'highLow'|'avgClose'|'bidAsk'|'indName'|'indValue'|'countdown'|'noOverlap';
export type PriceScaleLineId='priceLine'|'prevCloseLine'|'prePostLine'|'highLowLines'|'bidAskLines';
export type PriceScalePlacement='left'|'right'|'auto';
export interface PriceScaleSettings {
 /** Lock price to bar ratio (default false). */
 lockRatio:boolean;
 /** Price units per bar width captured when the lock was switched on; null while unlocked. */
 ratio:number|null;
 /** Scale price chart only (default false). */
 scaleSeriesOnly:boolean;
 /** Where new scales go (default "auto"). */
 placement:PriceScalePlacement;
 /** The plus button (default true). */
 plusButton:boolean;
 /** Side of the main price scale.
  *  Absent means right; 'right' is normalized away so saved documents stay unchanged.
  *  Separate from `placement`, which is where new scales go. */
 mainSide?:'left';
 labels:Record<PriceScaleLabelId,boolean>;
 lines:Record<PriceScaleLineId,boolean>;
}

/** Factory defaults, each cited to its fact. */
export const DEFAULT_PRICE_SCALE_SETTINGS:Readonly<PriceScaleSettings>=Object.freeze({
 lockRatio:false,ratio:null,scaleSeriesOnly:false,placement:'auto',plusButton:true,
 labels:Object.freeze({
  symbolName:false, // labels.symbolName
  symbolLast:true, // labels.symbolLast
  prevClose:false, // labels.prevClose
  prePost:true, // labels.prePost
  highLow:false, // labels.highLow
  avgClose:false, // labels.avgClose (inferred)
  bidAsk:false, // labels.bidAsk
  indName:false, // labels.indName
  indValue:true, // labels.indValue
  countdown:true, // labels.countdown
  noOverlap:true, // labels.noOverlap
 }),
 lines:Object.freeze({
  priceLine:true, // lines.priceLine
  prevCloseLine:false, // lines.prevCloseLine
  prePostLine:true, // lines.prePostLine
  highLowLines:false, // lines.highLowLines
  bidAskLines:false, // lines.bidAskLines
 }),
}) as Readonly<PriceScaleSettings>;

/** Factory pane scale state (autoScale true, log/percentage/indexedTo100/isInverted false). */
export const DEFAULT_PANE_SCALE:Readonly<Omit<PaneScaleView,'paneId'|'kind'>>=Object.freeze({mode:'regular',auto:true,invert:false});

export function defaultPriceScaleSettings():PriceScaleSettings{return structuredClone(DEFAULT_PRICE_SCALE_SETTINGS) as PriceScaleSettings;}

const LABEL_IDS=Object.keys(DEFAULT_PRICE_SCALE_SETTINGS.labels) as PriceScaleLabelId[];
const LINE_IDS=Object.keys(DEFAULT_PRICE_SCALE_SETTINGS.lines) as PriceScaleLineId[];
export const PRICE_SCALE_LABEL_IDS:readonly PriceScaleLabelId[]=Object.freeze(LABEL_IDS);
export const PRICE_SCALE_LINE_IDS:readonly PriceScaleLineId[]=Object.freeze(LINE_IDS);

function plain(value:unknown,keys:readonly string[],what:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error(what+' must be a plain object.');
 for(const key of Object.keys(value))if(!keys.includes(key))throw Error(what+' has an unknown field: '+key);
 for(const key of keys)if(!Object.hasOwn(value,key))throw Error(what+' is missing '+key+'.');
 return value as Record<string,unknown>;
}
function flags<K extends string>(value:unknown,keys:readonly K[],what:string):Record<K,boolean>{
 const row=plain(value,keys,what),out={} as Record<K,boolean>;
 for(const key of keys){if(typeof row[key]!=='boolean')throw Error(what+'.'+key+' must be true or false.');out[key]=row[key] as boolean;}
 return out;
}
/** Strict validation for a persisted settings document; returns an owned copy. */
export function validatePriceScaleSettings(value:unknown):PriceScaleSettings{
 // Optional mainSide: 'left' is kept, 'right' (the default) is dropped; anything else is refused.
 const hasSide=!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'mainSide');
 const side=hasSide?(value as Record<string,unknown>).mainSide:'right';
 if(side!=='left'&&side!=='right')throw Error('The main price scale side must be left or right.');
 let rest=value;
 if(hasSide&&Object.getPrototypeOf(value)===Object.prototype){const {mainSide:_side,...other}=value as Record<string,unknown>;rest=other;}
 const row=plain(rest,['lockRatio','ratio','scaleSeriesOnly','placement','plusButton','labels','lines'],'Price scale settings');
 for(const key of ['lockRatio','scaleSeriesOnly','plusButton'] as const)if(typeof row[key]!=='boolean')throw Error('Price scale settings.'+key+' must be true or false.');
 if(row.placement!=='left'&&row.placement!=='right'&&row.placement!=='auto')throw Error('Price scale placement must be left, right or auto.');
 const ratio=row.ratio;
 if(row.lockRatio){if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<=0)throw Error('A locked price-to-bar ratio must be a positive finite number.');}
 else if(ratio!==null)throw Error('An unlocked price scale has no stored ratio.');
 return{lockRatio:row.lockRatio as boolean,ratio:ratio as number|null,scaleSeriesOnly:row.scaleSeriesOnly as boolean,placement:row.placement,plusButton:row.plusButton as boolean,labels:flags(row.labels,LABEL_IDS,'Price scale labels'),lines:flags(row.lines,LINE_IDS,'Price scale lines'),...side==='left'?{mainSide:'left' as const}:{}};
}

/** Radio-group transition for one menu/hotkey/toolbar action on the current mode.
 * Percent, Indexed to 100 and Logarithmic toggle (choosing the active one returns to Regular);
 * Regular always selects Regular. */
export function nextScaleMode(current:PriceScaleModeId,chosen:PriceScaleModeId):PriceScaleModeId{
 if(!PRICE_SCALE_MODES.includes(current)||!PRICE_SCALE_MODES.includes(chosen))throw Error('Unknown price scale mode.');
 if(chosen==='regular')return 'regular';
 return current===chosen?'regular':chosen;
}
/** Vela's renderer keeps a mode ('price'|'percent'|'indexed') and an independent log flag; LV keeps them exclusive. */
export function velaScaleFor(mode:PriceScaleModeId):{mode:'price'|'percent'|'indexed';log:boolean}{
 if(mode==='percent'||mode==='indexed')return{mode,log:false};
 return{mode:'price',log:mode==='logarithmic'};
}
/** Read side: log wins over a percent/indexed mode so the persisted value is never ambiguous (matches grid-frame-gesture). */
export function modeFromVela(mode:string,log:boolean):PriceScaleModeId{
 if(log)return 'logarithmic';
 return mode==='percent'?'percent':mode==='indexed'?'indexed':'regular';
}
export function modeFromChartOptions(scale:ChartOptionsScale):PriceScaleModeId{return scale==='linear'?'regular':scale;}
export function chartOptionsScaleFor(mode:PriceScaleModeId):ChartOptionsScale{return mode==='regular'?'linear':mode;}

// Displayed-value transforms. These mirror the arithmetic of the pinned renderer
// (@luxalgo/vela 0.8.4 toPct/toIndex: baseline = close of the first visible bar).
/** Percent change from the baseline: (price / baseline - 1) * 100. */
export function percentFromBaseline(price:number,baseline:number):number|null{
 if(!Number.isFinite(price)||!Number.isFinite(baseline)||baseline===0)return null;
 return(price/baseline-1)*100;
}
/** Indexed to 100 at the baseline: price / baseline * 100. */
export function indexedFromBaseline(price:number,baseline:number):number|null{
 if(!Number.isFinite(price)||!Number.isFinite(baseline)||baseline===0)return null;
 return price/baseline*100;
}
/** Fraction of the pane height from the top for a price on a [min,max] window, honoring log and invert. */
export function priceFraction(price:number,window:{min:number;max:number},log:boolean,invert:boolean):number|null{
 if(![price,window.min,window.max].every(Number.isFinite)||window.max<=window.min)return null;
 let t:number;
 if(log){if(price<=0||window.min<=0)return null;t=(Math.log(price)-Math.log(window.min))/(Math.log(window.max)-Math.log(window.min));}
 else t=(price-window.min)/(window.max-window.min);
 return invert?t:1-t;
}

/** LV price-to-bar ratio: price units spanned by one bar width at the current zoom.
 * (window span / pane height px) * bar pitch px. */
export function priceToBarRatio(window:{min:number;max:number},paneHeightPx:number,barPitchPx:number):number|null{
 const span=window.max-window.min;
 if(!Number.isFinite(span)||span<=0||!(paneHeightPx>0)||!(barPitchPx>0))return null;
 return span/paneHeightPx*barPitchPx;
}
/** The window a locked ratio implies after a zoom: same center, span = ratio * height / pitch. */
export function lockedWindow(center:number,ratio:number,paneHeightPx:number,barPitchPx:number):{min:number;max:number}|null{
 if(![center,ratio].every(Number.isFinite)||!(ratio>0)||!(paneHeightPx>0)||!(barPitchPx>0))return null;
 const half=ratio*paneHeightPx/barPitchPx/2;
 return{min:center-half,max:center+half};
}
/** Lock ratio hint: the ratio formatted to 4 decimals. */
export function formatPriceToBarRatio(ratio:number|null):string{return ratio===null||!Number.isFinite(ratio)?'':ratio.toFixed(4);}

/** Scale price chart only: the autoscale window of the main series alone. Same fit as the
 * pinned renderer's own pane fit (computePaneScale with candles only): visible highs and lows, a flat range padded by 10%
 * of its value, then the top and bottom margins (percent of the pane), in log space when the scale is logarithmic. */
export function seriesOnlyWindow(bars:readonly {high:number;low:number}[],from:number,to:number,margins:{top:number;bottom:number},log:boolean):{min:number;max:number;log?:boolean}|null{
 let min=Infinity,max=-Infinity;
 for(let index=Math.max(0,from);index<=Math.min(bars.length-1,to);index++){const bar=bars[index];if(!bar)continue;for(const value of [bar.high,bar.low])if(Number.isFinite(value)){if(value<min)min=value;if(value>max)max=value;}}
 if(min===Infinity||max===-Infinity)return null;
 if(max-min<=Math.max(Math.abs(min),Math.abs(max))*1e-12){const mid=(min+max)/2,pad=Math.abs(mid)*0.1||1;return{min:mid-pad,max:mid+pad,log:log&&mid-pad>0};}
 const content=Math.max(0.1,1-(margins.top+margins.bottom)/100),above=margins.top/100/content,below=margins.bottom/100/content;
 if(log&&min>0){const lmin=Math.log(min),lmax=Math.log(max),span=lmax-lmin;return{min:Math.exp(lmin-span*below),max:Math.exp(lmax+span*above),log:true};}
 const span=max-min;return{min:min-span*below,max:max+span*above};
}
/** Widen a fitted scale so its data occupies only the pane band between the margins
 * (fractions of the pane height from the top and the bottom). Volume uses top 0.8, bottom 0 (the usual volume overlay band).
 * Linear only; a log scale is returned unchanged. */
export function bandScale<T extends {min:number;max:number;log?:boolean}>(range:T,margins:{top:number;bottom:number}):T{
 const {top,bottom}=margins;if(range.log||!(top>0||bottom>0))return range;
 const span=(range.max-range.min)/(1-top-bottom);if(!Number.isFinite(span))return range;
 return {...range,min:range.min-bottom*span,max:range.max+top*span};
}
