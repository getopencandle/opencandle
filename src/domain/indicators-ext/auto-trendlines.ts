import type {Bar} from '../types';
import {AUTO_TREND_LIMITS,AUTO_TREND_POLICY,AutoTrendMeter,AutoTrendUnavailable,autoTrendKey,autoTrendRecord,type AutoTrendAnchor,type AutoTrendFamily,type AutoTrendLine,type AutoTrendLimits,type AutoTrendPivot,type AutoTrendResult,type AutoTrendScene,type AutoTrendSide} from './auto-trendlines-scene';

export interface AutoTrendInputs {sourceKey:string;lineSize:'Small'|'Large'|'Both';barsToBreakout:number;showPivots:boolean;/** Future integration charges inherited full-history scratch before the kernel. */externalNumericSlots?:number}
interface Pivot {index:number;time:number;price:number;actualSize:number;side:AutoTrendSide}
interface Seed extends Pivot {confirmedAt:number}
interface Candidate extends AutoTrendLine {}
const radius=(family:AutoTrendFamily)=>family==='small'?5:25;
const betterExtreme=(a:Pivot,b:Pivot)=>a.side==='support'?a.price<=b.price:a.price>=b.price;
const valueAt=(line:AutoTrendLine,index:number)=>line.from.price+line.slope*(index-line.from.index);
function intersectsStrip(line:AutoTrendLine,index:number,bar:Bar,meter:AutoTrendMeter){meter.work(32);const y=valueAt(line,index),low=line.side==='support'?y:y-line.touchWidth,high=line.side==='support'?y+line.touchWidth:y;return bar.low<=high&&bar.high>=low;}
function allocationSort<T>(input:readonly T[],compare:(a:T,b:T)=>number,meter:AutoTrendMeter):T[]{
 meter.reserve(input.length*2);const output:T[]=[],scratch:T[]=[];for(let i=0;i<input.length;i++){meter.work(8);output.push(input[i]);}
 for(let width=1;width<input.length;width*=2){meter.work(8);for(let left=0;left<input.length;left+=width*2){meter.work(12);const middle=Math.min(left+width,input.length),right=Math.min(left+width*2,input.length);let a=left,b=middle;
  for(let at=left;at<right;at++){meter.work(24);scratch[at]=a<middle&&(b>=right||compare(output[a],output[b])<=0)?output[a++]:output[b++];}
 }for(let i=0;i<input.length;i++){meter.work(8);output[i]=scratch[i];}}
 scratch.length=0;meter.release(input.length);return output;
}
/** Exposed for independent ordering oracles; no screen geometry enters selection. */
export function compareAutoTrendLines(a:AutoTrendLine,b:AutoTrendLine):number {
 return b.touches-a.touches||(b.endIndex-b.from.index)-(a.endIndex-a.from.index)||b.to.actualSize-a.to.actualSize||Math.abs(b.slope)-Math.abs(a.slope)||a.from.index-b.from.index||a.to.index-b.to.index||(a.side===b.side?0:a.side==='support'?-1:1)||(a.family===b.family?0:a.family==='large'?-1:1);
}
export function autoTrendBaseConflict(a:AutoTrendLine,b:AutoTrendLine):boolean {return Math.max(0,Math.min(a.to.index,b.to.index)-Math.max(a.from.index,b.from.index))*10>3*Math.min(a.to.index-a.from.index,b.to.index-b.from.index);}
/** LV policy: small base must lie wholly in a qualifying large candidate's observed one-sided strip. */
export function autoTrendBaseInStrip(small:AutoTrendLine,large:AutoTrendLine):boolean {
 if(small.from.index<large.from.index||small.to.index>large.endIndex)return false;
 const a=valueAt(small,small.from.index)-valueAt(large,small.from.index),b=valueAt(small,small.to.index)-valueAt(large,small.to.index);
 return large.side==='support'?Math.min(a,b)>=0&&Math.max(a,b)<=large.touchWidth:Math.max(a,b)<=0&&Math.min(a,b)>=-large.touchWidth;
}
/** Internal pure extension kernel. Call only after the supplied OHLC and anchor tuple have passed admission. */
export function scanAutoTrendExtension(bars:readonly Bar[],from:{index:number;price:number},toIndex:number,side:AutoTrendSide,slope:number,breakout:number,meter:AutoTrendMeter){
 let endIndex=bars.length-1,run=0,breakoutIndex:number|null=null;
 for(let i=toIndex+1;i<bars.length;i++){meter.work(32);const y=from.price+slope*(i-from.index);if(!Number.isFinite(y))throw new AutoTrendUnavailable('Auto trendlines extension arithmetic overflowed.');const beyond=side==='support'?bars[i].close<y:bars[i].close>y;run=beyond?run+1:0;if(run===breakout){endIndex=i;breakoutIndex=i;break;}}
 const endPrice=from.price+slope*(endIndex-from.index);meter.work(24);if(!Number.isFinite(endPrice))throw new AutoTrendUnavailable('Auto trendlines endpoint arithmetic overflowed.');
 return{endIndex,endPrice,breakoutIndex,extended:endIndex-toIndex<=2*(toIndex-from.index)};
}
function distance(values:readonly Bar[],start:number,count:number,side:AutoTrendSide,reverse:boolean,meter:AutoTrendMeter):number[]{
 meter.reserve(count*2);const result:number[]=new Array(count),stack:number[]=[];const price=(i:number)=>side==='support'?values[start+i].low:values[start+i].high;
 for(let step=0;step<count;step++){meter.work(24);const i=reverse?count-1-step:step,current=price(i);while(stack.length){meter.work(20);const other=price(stack[stack.length-1]);if(side==='support'?other<current:other>current)break;stack.pop();}
  result[i]=stack.length?Math.abs(i-stack[stack.length-1]):reverse?count-i:i+1;stack.push(i);
 }stack.length=0;meter.release(count);return result;
}
function zigzag(points:readonly Pivot[],family:AutoTrendFamily,atr:readonly (number|null)[],start:number,meter:AutoTrendMeter):Seed[]{
 const result:Seed[]=[],size=radius(family),multiple=family==='large'?5:2;
 for(const point of points){meter.work(36);const volatility=atr[point.index-start];if(point.actualSize<size||volatility===null)continue;
  const last=result[result.length-1],next={...point,confirmedAt:point.index+size};
  if(!last){meter.reserve(7);result.push(next);continue;}
  if(last.side===point.side){if(betterExtreme(point,last)){meter.work(8);result[result.length-1]=next;}continue;}
  const previousAtr=atr[last.index-start];if(previousAtr!==null&&Math.abs(point.price-last.price)>multiple*previousAtr){meter.reserve(7);result.push(next);}
 }return result;
}
function buildCandidates(seeds:readonly Seed[],points:readonly Pivot[],family:AutoTrendFamily,bars:readonly Bar[],atr:readonly (number|null)[],start:number,breakout:number,meter:AutoTrendMeter):Candidate[]{
 const result:Candidate[]=[],size=radius(family);
 for(let a=0;a<seeds.length;a++){meter.work(8);for(let b=a+1;b<seeds.length;b++){meter.work(48);const from=seeds[a],to=seeds[b];if(from.side!==to.side||from.index>=to.index)continue;
  const slope=(to.price-from.price)/(to.index-from.index),touchWidth=(atr[from.index-start]!+atr[to.index-start]!)/4;if(!Number.isFinite(slope)||!Number.isFinite(touchWidth))throw new AutoTrendUnavailable('Auto trendlines price arithmetic overflowed.');
  const extension=scanAutoTrendExtension(bars,from,to.index,from.side,slope,breakout,meter),endIndex=extension.endIndex;
  const line:Candidate={key:autoTrendKey(family,from.side,from.index,to.index),family,side:from.side,from,to,slope,touchWidth,touches:0,...extension};
  if(!Number.isFinite(line.endPrice))throw new AutoTrendUnavailable('Auto trendlines endpoint arithmetic overflowed.');let hasSize=false,blocked=false,touchCount=0;
  for(const point of points){meter.work(32);if(point.side!==from.side||point.index<=from.index||point.index>endIndex||point.index===to.index)continue;
   const inside=point.index<to.index;if(inside&&point.actualSize===size)hasSize=true;const hit=intersectsStrip(line,point.index,bars[point.index],meter);if(inside&&point.actualSize===to.actualSize&&hit){blocked=true;break;}if(hit)touchCount++;
  }
  if(hasSize&&!blocked){meter.reserve(30);result.push({...line,touches:touchCount});}
 }}return result;
}
/**
 * Original detector from public definitions. Every ambiguity is resolved by our own choice.
 * Exhaustive admitted search: resource exhaustion returns no scene, never a truncated candidate/line set.
 * Work weights deliberately overcount bounded primitive groups; the ledger is not a CPU-time promise.
 */
export function calculateAutoTrendlines(bars:readonly Bar[],inputs:AutoTrendInputs,limits:AutoTrendLimits={}):AutoTrendResult {
 let meter:AutoTrendMeter;try{meter=new AutoTrendMeter(limits);}catch(error){return{status:'unavailable',scene:null,diagnostic:String(error),usage:Object.freeze({operations:0,numericSlots:0,peakNumericSlots:0})};}
 try{
  meter.reserve(48);meter.work(80);
  if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype||bars.length>AUTO_TREND_LIMITS.bars)throw new AutoTrendUnavailable('Auto trendlines requires at most 100000 ordered supplied bars.');
  autoTrendRecord(inputs,Object.hasOwn(inputs,'externalNumericSlots')?['sourceKey','lineSize','barsToBreakout','showPivots','externalNumericSlots']:['sourceKey','lineSize','barsToBreakout','showPivots'],meter);
  if(typeof inputs.sourceKey!=='string'||!inputs.sourceKey.length||inputs.sourceKey.length>4096||!['Small','Large','Both'].includes(inputs.lineSize)||typeof inputs.showPivots!=='boolean'||!Number.isSafeInteger(inputs.barsToBreakout)||inputs.barsToBreakout<1||inputs.barsToBreakout>100||!Number.isSafeInteger(inputs.externalNumericSlots??0)||(inputs.externalNumericSlots??0)<0)throw new AutoTrendUnavailable('Invalid Auto trendlines inputs.');
  meter.reserve(inputs.externalNumericSlots??0);const start=Math.max(0,bars.length-AUTO_TREND_LIMITS.horizon),count=bars.length-start;meter.reserve(count);const atr:(number|null)[]=[];let seed=0,previousAtr:number|null=null,previousClose:number|null=null,previousTime:number|null=null;
  for(let i=0;i<bars.length;i++){meter.work(96);const field=Object.getOwnPropertyDescriptor(bars,String(i));if(!field||!Object.hasOwn(field,'value'))throw new AutoTrendUnavailable('Auto trendlines bars must be dense data rows.');const bar=field.value as Bar;
   if(!bar||typeof bar!=='object')throw new AutoTrendUnavailable('Auto trendlines has an unavailable observation.');
   for(const key of ['time','open','high','low','close'] as const){const descriptor=Object.getOwnPropertyDescriptor(bar,key);if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='number'||!Number.isFinite(descriptor.value))throw new AutoTrendUnavailable('Auto trendlines requires finite supplied OHLC and time.');}
   if(previousTime!==null&&bar.time<=previousTime||bar.high<bar.low||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close))throw new AutoTrendUnavailable('Auto trendlines requires ordered valid OHLC observations.');
   const tr=previousClose===null?bar.high-bar.low:Math.max(bar.high-bar.low,Math.abs(bar.high-previousClose),Math.abs(bar.low-previousClose));
   if(previousAtr===null){seed+=tr;if(i===13)previousAtr=seed/14;}else previousAtr=(previousAtr*13+tr)/14;
   if(!Number.isFinite(tr)||!Number.isFinite(seed)||previousAtr!==null&&!Number.isFinite(previousAtr))throw new AutoTrendUnavailable('Auto trendlines ATR arithmetic overflowed.');
   if(i>=start)atr.push(previousAtr);previousClose=bar.close;previousTime=bar.time;
  }
  const points:Pivot[]=[];
  // Each side retains two neighbor arrays; stack reservations are released by distance().
  for(const side of ['resistance','support'] as const){const left=distance(bars,start,count,side,false,meter),right=distance(bars,start,count,side,true,meter);
   for(let local=0;local<count;local++){meter.work(28);const actualSize=Math.min(local,count-1-local,left[local]-1,right[local]-1);if(actualSize<3)continue;meter.reserve(6);const index=start+local;points.push({index,time:bars[index].time,price:side==='support'?bars[index].low:bars[index].high,actualSize,side});}
   left.length=0;right.length=0;meter.release(count*2);
  }
  const ordered=allocationSort(points,(a,b)=>a.index-b.index||(a.side===b.side?0:a.side==='resistance'?-1:1),meter);points.length=0;meter.release(ordered.length); // sorted reference array replaces the original reference storage already included in each pivot reservation
  const large=zigzag(ordered,'large',atr,start,meter),largeLines=buildCandidates(large,ordered,'large',bars,atr,start,inputs.barsToBreakout,meter);let small:Seed[]=[],smallLines:Candidate[]=[];
  if(inputs.lineSize!=='Large'){small=zigzag(ordered,'small',atr,start,meter);smallLines=buildCandidates(small,ordered,'small',bars,atr,start,inputs.barsToBreakout,meter);}
  meter.reserve(largeLines.length+smallLines.length);const eligible:Candidate[]=[];
  if(inputs.lineSize!=='Small')for(const line of largeLines){meter.work(8);eligible.push(line);}
  for(const line of smallLines){let suppressed=false;for(const other of largeLines){meter.work(64);if(autoTrendBaseInStrip(line,other)){suppressed=true;break;}}if(!suppressed){meter.work(8);eligible.push(line);}}
  const sorted=allocationSort(eligible,compareAutoTrendLines,meter),selected:Candidate[]=[];meter.reserve(sorted.length);
  for(const line of sorted){let conflict=false;for(const prior of selected){meter.work(48);if(autoTrendBaseConflict(line,prior)){conflict=true;break;}}if(!conflict){meter.work(8);selected.push(line);}}
  const lines:AutoTrendLine[]=[],pivots:AutoTrendPivot[]=[],seen=new Set<string>();meter.reserve(selected.length*30);
  for(const line of selected){meter.work(96);const clone=(point:AutoTrendAnchor):AutoTrendAnchor=>Object.freeze({index:point.index,time:point.time,price:point.price,actualSize:point.actualSize,confirmedAt:point.confirmedAt});
   lines.push(Object.freeze({...line,from:clone(line.from),to:clone(line.to)}));if(inputs.showPivots)for(const point of [line.from,line.to]){meter.work(32);const key=`${line.family}:${line.side}:${point.index}`;if(seen.has(key))continue;seen.add(key);meter.reserve(8);pivots.push(Object.freeze({...clone(point),family:line.family,side:line.side,key}));}
  }
  // Candidate/scratch reservations may be dropped only after every referenced scratch collection is cleared.
  const scratch=count+ordered.length*6+large.length*7+small.length*7+largeLines.length*30+smallLines.length*30+largeLines.length+smallLines.length+eligible.length+sorted.length;
  atr.length=0;ordered.length=0;large.length=0;small.length=0;largeLines.length=0;smallLines.length=0;eligible.length=0;sorted.length=0;selected.length=0;seen.clear();meter.release(scratch);
  const scene:AutoTrendScene=Object.freeze({schemaVersion:1,policy:AUTO_TREND_POLICY,sourceKey:inputs.sourceKey,fromIndex:start,asOfIndex:bars.length-1,asOfTime:bars.at(-1)?.time??null,lines:Object.freeze(lines),pivots:Object.freeze(pivots)});
  meter.work(24);return Object.freeze({status:'ready',scene,usage:meter.usage()});
 }catch(error){return Object.freeze({status:'unavailable',scene:null,diagnostic:error instanceof Error?error.message:String(error),usage:meter.usage()});}
}
