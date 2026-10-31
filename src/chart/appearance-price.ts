import type {PriceSource} from '../domain/types';
import {HIGHLOW_LV_FIELDS,STYLE_FACT_DEFAULTS} from './chart-settings-style-defaults';
type Data=Record<string,any>;
type PriceBar={open:number;high:number;low:number;close:number};
export const PREVIOUS_CLOSE_STYLE='lv-candles-previous-close';
export const PREVIOUS_CLOSE_HA_STYLE='lv-heikinashi-previous-close';
export const PRICE_APPEARANCE_DEFAULTS={source:'close' as PriceSource,color:'#22ab94',downColor:'#f7525f',highColor:'#22ab94',lowColor:'#f7525f',closeColor:'#d1d4dc',previousClose:false,baseLevel:50};
const supported=new Set(['tpo','sessionvp','footprint','line','linemarkers','step','area','hlcarea','baseline','columns','bars','hlcbars','highlow','candles','hollow','volumecandles','heikinashi',PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE]);
const sourceTypes=new Set(['line','linemarkers','step','area','baseline','columns']);
const priceSources=new Set(['open','high','low','close','hl2','hlc3','ohlc4']);
export function selectedDisplayedPrice(bar:PriceBar,source:PriceSource):number{if(source==='hl2')return(bar.high+bar.low)/2;if(source==='hlc3')return(bar.high+bar.low+bar.close)/3;if(source==='ohlc4')return(bar.open+bar.high+bar.low+bar.close)/4;return bar[source];}
/** Heikin Ashi "Show real last price" (appearance setting, default off). */
export const HA_REAL_LAST_PRICE_SETTING='mainSeriesProperties.haStyle.showRealLastPrice';
const HA_STYLES=new Set(['heikinashi',PREVIOUS_CLOSE_HA_STYLE]);
export interface RealLastPrice{bar:PriceBar;previousClose:number|undefined}
/** The raw (not Heikin Ashi) last bar when the setting is on and a COMPAT-11 renderer supplies the raw bars (lvRealBars, index
 * aligned with the view bars); null otherwise, so the latest price stays the drawn one. */
export function realLastPrice(priceStyle:unknown,settings:unknown,realBars:unknown,viewBars:readonly {time?:number}[]):RealLastPrice|null{
 if(typeof priceStyle!=='string'||!HA_STYLES.has(priceStyle)||!settings||typeof settings!=='object')return null;
 const on=(settings as Data)[HA_REAL_LAST_PRICE_SETTING];if(on!==true&&on!==1&&on!=='1')return null;
 if(!Array.isArray(realBars)||!realBars.length||realBars.length!==viewBars.length)return null;
 const bar=realBars[realBars.length-1] as PriceBar&{time?:number};if(!bar||bar.time!==viewBars[viewBars.length-1]?.time||![bar.open,bar.close].every(Number.isFinite))return null;
 const previous=realBars.length>1?(realBars[realBars.length-2] as PriceBar).close:undefined;return{bar,previousClose:Number.isFinite(previous)?previous:undefined};
}
export function candlePriceDirection(open:number,close:number,previousClose:number|undefined,previousMode:boolean):'up'|'down'{return close>=(previousMode&&previousClose!==undefined?previousClose:open)?'up':'down';}
/** Shared render-only value and ink policy. Saved numerical/source identities are never rewritten. */
export function latestPricePresentation(scene:Data,coords:Data,theme:Data,pane:Data,real:RealLastPrice|null=null):{value:number;color:string}|null{
 const type=scene.priceStyle;if(!supported.has(type))return null;const last=scene.bars.at(-1);if(!last)return null;
 const settings={...PRICE_APPEARANCE_DEFAULTS,...STYLE_FACT_DEFAULTS[type],...(type==='highlow'?HIGHLOW_LV_FIELDS:{}),...scene.style.chartTypes?.[type]},source=sourceTypes.has(type)?settings.source:'close';if(!priceSources.has(source))throw Error('Committed chart price source is unsupported');
 if(real&&HA_STYLES.has(type)){const previous=type===PREVIOUS_CLOSE_HA_STYLE,up=candlePriceDirection(real.bar.open,real.bar.close,real.previousClose,previous)==='up',override=scene.candleOverride??{},ink=up?override.upColor??theme.upColor:override.downColor??theme.downColor;if(typeof ink!=='string'||ink.length===0||ink.length>200)throw Error('Committed chart has no bounded latest-price color');return{value:real.bar.close,color:ink};}
 const value=selectedDisplayedPrice(last,source);if(!Number.isFinite(value))throw Error('Committed chart source has no finite latest display value');let color:string;
 if(['line','linemarkers','step','area'].includes(type))color=settings.color;
 else if(type==='baseline'){const threshold=pane.bounds.top+pane.bounds.height*(1-settings.baseLevel/100),above=coords.priceToY(value,pane.scale,pane.bounds)<=threshold;color=above?settings.highColor:settings.lowColor;}
 else if(type==='hlcarea')color=settings.closeColor;
 else if(type==='highlow')color=settings.previousClose===true&&candlePriceDirection(last.open,last.close,scene.bars.at(-2)?.close,true)==='down'?settings.downColor:settings.color;
 else if(type==='hlcbars')color=settings.color;
 else if(type==='candles'||type==='tpo'||type==='sessionvp'||type==='footprint'||type==='heikinashi'||type===PREVIOUS_CLOSE_STYLE||type===PREVIOUS_CLOSE_HA_STYLE){const previous=type===PREVIOUS_CLOSE_STYLE||type===PREVIOUS_CLOSE_HA_STYLE,up=candlePriceDirection(last.open,last.close,scene.bars.at(-2)?.close,previous)==='up',override=scene.candleOverride??{};color=up?override.upColor??theme.upColor:override.downColor??theme.downColor;}
 else{const previous=type==='hollow'||settings.previousClose,up=candlePriceDirection(last.open,last.close,scene.bars.at(-2)?.close,previous)==='up';color=up?settings.color:settings.downColor;}
 if(typeof color!=='string'||color.length===0||color.length>200)throw Error('Committed chart has no bounded latest-price color');return{value,color};
}
