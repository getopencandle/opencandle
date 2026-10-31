// The Volume footprint model. Pure functions, bars in any time unit.
// Defaults: inputs (rowSize Auto, atrLength 14, ticksPerRow 100, imbalancePercent 300,
// showVA true, vaPercent 70, calcStackedImbalance false, stackedImbalanceCount 3, showUnfinishedAuction false,
// ignore_zero_volume_for_imbalance_calc false, minimal_imbalance_volume 0) and styles (type Buy and sell /
// Delta / Total / Ladder, deltaAdjust, pointOfControl, imbalanceHighlight, showSummary, summary volume / delta /
// session CVD / POC price). Everything below beyond those names and defaults is our own choice.
//
// Construction (OpenCandle loads no tick or bid/ask data, so buy and sell volume is an approximation):
//  * Intrabar path. Each bar (or each lower-timeframe bar inside it, when supplied) is walked as a price path:
//    an up bar (close >= open) goes open -> low -> high -> close, a down bar open -> high -> low -> close. The bar's volume
//    is spread evenly along the path length; volume on rising legs counts as buy, on falling legs as sell. A bar with no
//    range puts its volume in one row, half buy and half sell. This is the same up/down split the TPO session volume profile uses, applied along
//    the bar's path so each price row gets its own buy and sell share.
//  * Rows. Row k covers [k*row, (k+1)*row). A bar uses the rows its range overlaps with positive length (a high on a
//    row boundary does not open the row above). A leg's volume goes to rows by overlap length.
//  * Row size Auto: ATR(atrLength) (Wilder) at the last bar divided by 8, rounded up to whole ticks when the tick size
//    is known, else up to a 1, 2 or 5 step. Ticks per row = ticks * tick size; without a tick size Auto is used.
//  * POC: the row with the most volume; ties go to the row nearest the bar middle, then the lower row. Value area:
//    from the POC add the two rows above or the two below, whichever pair holds more volume (ties go up), until the value
//    area holds at least Value area percent of the bar's volume. VAH = top of its highest row, VAL = bottom of its lowest.
//  * Imbalance (diagonal): row k is a buy imbalance when buy[k] * 100 >= ratio * sell[k-1] (the row below), a sell
//    imbalance when sell[k] * 100 >= ratio * buy[k+1] (the row above). The row needs at least Minimal imbalance volume
//    and more than zero; a zero opposite side counts unless Ignore zero volume is on. The bottom row has no buy
//    comparison and the top row no sell comparison.
//  * Stacked imbalance: a run of at least Stacked count adjacent imbalance rows of one side.
//  * Unfinished auction: the top (bottom) row of a bar holds both buy and sell volume.
//  * Session CVD: the sum of bar deltas since the start of the bar's trading date (the Session volume profile's
//    Extended session runs, src/domain/volume-profile.ts).
import type {Bar} from './types';
import {sessionProfilePeriods} from './volume-profile';
import type {PivotCalendar} from './indicators-ext/r23-catalog';

export const FOOTPRINT_TYPES=['Buy and sell','Delta','Total','Ladder'] as const;
export const FOOTPRINT_ROW_SIZE_MODES=['Auto','Ticks per row'] as const;
export const FOOTPRINT_AUTO_ROWS_PER_ATR=8;
/** A bar never gets more rows than this; a smaller row size is refused (footprintRowSize reports it). */
export const FOOTPRINT_MAX_ROWS=400;
const EPS=1e-9;

export interface FootprintRow {index:number;low:number;high:number;buy:number;sell:number}
export interface FootprintBar {
 rows:FootprintRow[];buy:number;sell:number;volume:number;delta:number;
 /** Index into rows; -1 without volume. */
 poc:number;pocPrice:number|null;vaFrom:number;vaTo:number;vah:number|null;val:number|null;
 buyImbalance:boolean[];sellImbalance:boolean[];stackedBuy:boolean[];stackedSell:boolean[];
 unfinishedHigh:boolean;unfinishedLow:boolean;
 /** False when the bar's volume is unavailable (no footprint is invented). */
 volumeAvailable:boolean;
}
export interface FootprintImbalanceOptions {imbalancePercent:number;stackedImbalanceCount:number;ignoreZeroVolume:boolean;minimalImbalanceVolume:number}
export interface FootprintOptions extends FootprintImbalanceOptions {rowSize:number;vaPercent:number}
export const FOOTPRINT_MODEL_DEFAULTS:Readonly<Omit<FootprintOptions,'rowSize'>>=Object.freeze({imbalancePercent:300,stackedImbalanceCount:3,ignoreZeroVolume:false,minimalImbalanceVolume:0,vaPercent:70});

type Ohlcv={open:number;high:number;low:number;close:number;volume?:number};
const volumeOf=(bar:Ohlcv)=>typeof bar.volume==='number'&&Number.isFinite(bar.volume)&&bar.volume>=0?bar.volume:null;
const rowOf=(price:number,row:number)=>Math.floor(price/row+EPS);
const topRowOf=(price:number,row:number)=>Math.ceil(price/row-EPS)-1;

/** The path legs of one bar as [from, to] prices. */
export function footprintPath(bar:Ohlcv):[number,number][]{
 const {open,high,low,close}=bar;
 return close>=open?[[open,low],[low,high],[high,close]]:[[open,high],[high,low],[low,close]];
}
/** Total buy and sell of one bar without building rows (equal to the row sums). */
export function footprintBuySell(bar:Ohlcv):{buy:number;sell:number}|null{
 const volume=volumeOf(bar);if(volume===null)return null;
 let up=0,down=0;for(const [a,b] of footprintPath(bar)){if(b>a)up+=b-a;else down+=a-b;}
 const total=up+down;if(!(total>0))return {buy:volume/2,sell:volume/2};
 return {buy:volume*up/total,sell:volume*down/total};
}
/** Add one bar's (or one lower-timeframe bar's) volume to the rows map. */
function addPathVolume(rows:Map<number,{buy:number;sell:number}>,bar:Ohlcv,row:number,lowRow:number,highRow:number):void{
 const volume=volumeOf(bar);if(volume===null||volume===0)return;
 const cell=(k:number)=>{const key=Math.max(lowRow,Math.min(highRow,k));let found=rows.get(key);if(!found){found={buy:0,sell:0};rows.set(key,found);}return found;};
 const legs=footprintPath(bar);let total=0;for(const [a,b] of legs)total+=Math.abs(b-a);
 if(!(total>0)){const target=cell(rowOf(bar.close,row));target.buy+=volume/2;target.sell+=volume/2;return;}
 const perUnit=volume/total;
 for(const [a,b] of legs){
  const lo=Math.min(a,b),hi=Math.max(a,b);if(!(hi>lo))continue;const buy=b>a;
  for(let k=rowOf(lo,row);k<=topRowOf(hi,row);k++){const overlap=Math.min(hi,(k+1)*row)-Math.max(lo,k*row);if(overlap<=0)continue;const target=cell(k);if(buy)target.buy+=overlap*perUnit;else target.sell+=overlap*perUnit;}
 }
}
/** Imbalance and stacked flags of ascending rows. */
export function footprintImbalances(rows:readonly {buy:number;sell:number}[],options:FootprintImbalanceOptions):{buy:boolean[];sell:boolean[];stackedBuy:boolean[];stackedSell:boolean[]}{
 const ratio=options.imbalancePercent,min=Math.max(0,options.minimalImbalanceVolume);
 const test=(side:number,other:number)=>side>0&&side>=min&&(other>0?side*100>=ratio*other:!options.ignoreZeroVolume);
 const buy=rows.map((row,k)=>k>0&&test(row.buy,rows[k-1].sell));
 const sell=rows.map((row,k)=>k<rows.length-1&&test(row.sell,rows[k+1].buy));
 const stacked=(flags:boolean[])=>{const out=flags.map(()=>false),count=Math.max(1,Math.floor(options.stackedImbalanceCount));let start=-1;
  for(let k=0;k<=flags.length;k++){if(k<flags.length&&flags[k]){if(start<0)start=k;continue;}if(start>=0&&k-start>=count)for(let j=start;j<k;j++)out[j]=true;start=-1;}
  return out;};
 return {buy,sell,stackedBuy:stacked(buy),stackedSell:stacked(sell)};
}
/** POC and value area of ascending rows by total volume. */
export function footprintValueArea(rows:readonly FootprintRow[],middle:number,vaPercent:number):{poc:number;vaFrom:number;vaTo:number}{
 const total=rows.map(row=>row.buy+row.sell),sum=total.reduce((a,b)=>a+b,0);
 if(!(sum>0))return {poc:-1,vaFrom:-1,vaTo:-1};
 let poc=0;for(let k=1;k<rows.length;k++){const t=total[k],best=total[poc];if(t>best+EPS||Math.abs(t-best)<=EPS&&Math.abs((rows[k].low+rows[k].high)/2-middle)<Math.abs((rows[poc].low+rows[poc].high)/2-middle)-EPS)poc=k;}
 let from=poc,to=poc,held=total[poc];const target=sum*Math.max(0,Math.min(100,vaPercent))/100;
 while(held+EPS<target&&(from>0||to<rows.length-1)){
  const up=(to+1<rows.length?total[to+1]:0)+(to+2<rows.length?total[to+2]:0),down=(from-1>=0?total[from-1]:0)+(from-2>=0?total[from-2]:0);
  const canUp=to<rows.length-1,canDown=from>0;
  if(canUp&&(!canDown||up>=down)){const step=Math.min(2,rows.length-1-to);for(let s=0;s<step;s++)held+=total[++to];}
  else{const step=Math.min(2,from);for(let s=0;s<step;s++)held+=total[--from];}
 }
 return {poc,vaFrom:from,vaTo:to};
}
/** One bar's footprint. `intrabar`: the lower-timeframe bars inside it (optional; their own paths replace the bar's path). */
export function footprintBar(bar:Ohlcv,options:FootprintOptions,intrabar?:readonly Ohlcv[]|null):FootprintBar{
 const row=options.rowSize;if(!(row>0)||!Number.isFinite(row))throw new Error('Footprint row size must be a positive number.');
 const lowRow=rowOf(bar.low,row),highRow=Math.max(lowRow,topRowOf(bar.high,row));
 if(highRow-lowRow+1>FOOTPRINT_MAX_ROWS)throw new Error(`Footprint row size is too small: a bar would need more than ${FOOTPRINT_MAX_ROWS} rows.`);
 const volume=volumeOf(bar),cells=new Map<number,{buy:number;sell:number}>();
 const parts=intrabar?.length?intrabar:[bar];
 if(volume!==null)for(const part of parts)addPathVolume(cells,part,row,lowRow,highRow);
 const rows:FootprintRow[]=[];for(let k=lowRow;k<=highRow;k++){const cell=cells.get(k);rows.push({index:k,low:k*row,high:(k+1)*row,buy:cell?.buy??0,sell:cell?.sell??0});}
 let buy=0,sell=0;for(const r of rows){buy+=r.buy;sell+=r.sell;}
 const va=footprintValueArea(rows,(bar.high+bar.low)/2,options.vaPercent),flags=footprintImbalances(rows,options);
 const top=rows.at(-1)!,bottom=rows[0];
 return {rows,buy,sell,volume:buy+sell,delta:buy-sell,poc:va.poc,pocPrice:va.poc>=0?(rows[va.poc].low+rows[va.poc].high)/2:null,vaFrom:va.vaFrom,vaTo:va.vaTo,
  vah:va.vaTo>=0?rows[va.vaTo].high:null,val:va.vaFrom>=0?rows[va.vaFrom].low:null,
  buyImbalance:flags.buy,sellImbalance:flags.sell,stackedBuy:flags.stackedBuy,stackedSell:flags.stackedSell,
  unfinishedHigh:rows.length>1&&top.buy>0&&top.sell>0,unfinishedLow:rows.length>1&&bottom.buy>0&&bottom.sell>0,volumeAvailable:volume!==null};
}
/** Wilder ATR at the last bar (fewer bars than the length: the mean true range). Null without bars. */
export function footprintAtr(bars:readonly Ohlcv[],length:number):number|null{
 if(!bars.length)return null;const n=Math.max(1,Math.floor(length));let atr=0;
 for(let i=0;i<bars.length;i++){const b=bars[i],prev=i?bars[i-1].close:null,tr=prev===null?b.high-b.low:Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));atr=i<n?(atr*i+tr)/(i+1):(atr*(n-1)+tr)/n;}
 return atr;
}
const niceStep=(value:number)=>{const power=10**Math.floor(Math.log10(value)),scaled=value/power;return (scaled<=1?1:scaled<=2?2:scaled<=5?5:10)*power;};
/** The row size for the settings, and a note when the choice could not be honored. */
export function footprintRowSize(bars:readonly Ohlcv[],settings:{rowSize?:unknown;atrLength?:unknown;ticksPerRow?:unknown},tickSize:number|null):{rowSize:number|null;note:string|null}{
 const tick=typeof tickSize==='number'&&tickSize>0&&Number.isFinite(tickSize)?tickSize:null;
 let note:string|null=null;
 const maxRange=bars.reduce((m,b)=>Math.max(m,b.high-b.low),0);
 const fits=(row:number)=>maxRange/row<=FOOTPRINT_MAX_ROWS-1;
 if(settings.rowSize==='Ticks per row'){
  const ticks=Number(settings.ticksPerRow);
  if(!tick)note='Ticks per row needs the instrument tick size, which this source does not declare. Auto row size is used.';
  else if(!(ticks>=1))note='Ticks per row must be 1 or more. Auto row size is used.';
  else{const row=ticks*tick;if(fits(row))return {rowSize:row,note:null};note=`Ticks per row is too small for these bars (more than ${FOOTPRINT_MAX_ROWS} rows in a bar). Auto row size is used.`;}
 }
 const atr=footprintAtr(bars,Number(settings.atrLength)||14);
 if(atr===null)return {rowSize:null,note};
 let row=atr>0?atr/FOOTPRINT_AUTO_ROWS_PER_ATR:(tick??(Math.abs(bars.at(-1)!.close)*1e-4||1));
 row=tick?Math.max(1,Math.ceil(row/tick-EPS))*tick:niceStep(row);
 while(!fits(row))row*=2;
 return {rowSize:row,note};
}
/** Bar deltas and session CVD for every bar (bars in Unix seconds). Unavailable volume reads null. */
export function footprintSessionCvd(bars:readonly Bar[],options:{resolution?:string|null;calendar?:PivotCalendar|null}={}):{delta:(number|null)[];cvd:(number|null)[]}{
 const delta=bars.map(bar=>{const split=footprintBuySell(bar);return split?split.buy-split.sell:null;}),cvd:(number|null)[]=bars.map(()=>null);
 for(const run of sessionProfilePeriods(bars,'Extended',options)){let sum=0,ok=true;for(let i=run.from;i<=run.to;i++){const d=delta[i];if(d===null)ok=false;else sum+=d;cvd[i]=ok?sum:null;}}
 return {delta,cvd};
}
