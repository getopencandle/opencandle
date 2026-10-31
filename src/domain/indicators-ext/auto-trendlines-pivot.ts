import type {Bar} from '../types';
import type {AutoTrendInputs} from './auto-trendlines';
import {AUTO_TREND_LIMITS,AUTO_TREND_POLICY,AutoTrendMeter,AutoTrendUnavailable,autoTrendKey,autoTrendRecord,type AutoTrendAnchor,type AutoTrendFamily,type AutoTrendLimits,type AutoTrendLine,type AutoTrendPivot,type AutoTrendResult,type AutoTrendScene,type AutoTrendSide} from './auto-trendlines-scene';

/**
 * Pivot-based Auto trendlines kernel (original code).
 *
 * Public facts: lines are built from swing pivots of a
 * Small and a Large size, a line is broken by a configurable count of consecutive closes beyond it (initial value 3), and
 * the pivots used can be marked. Everything else below is our own choice:
 *  - pivot radius 5 (Small) / 25 (Large) bars each side, same as the legacy scene contract (confirmedAt = index + radius);
 *  - an alternating Zig Zag over those pivots keeps a reversal only when it moves more than 2 (Small) / 5 (Large) ATR(14,RMA);
 *  - only the newest SEEDS_PER_SIDE zig zag pivots per family and side are anchor candidates (bounded pair count);
 *  - between its anchors a candidate base may not be pierced by more than its touch width = (ATR(from)+ATR(to))/4;
 *  - touches are same-side pivots (size >= 3) inside the strip up to the line end; the line extends right until breakout;
 *  - ranking: unbroken first, then touches, then the more recent second anchor, then the longer base, then earliest anchors;
 *  - at most LINES_PER_SIDE lines per family and side; bases of one family and side may not overlap (legacy 30% rule);
 *    with Both, a Small line whose base lies inside a selected Large line's strip is suppressed.
 * Cost is linear in bars plus O(families x sides x SEEDS^2 x horizon). Resource exhaustion refuses the whole scene.
 */
export const AUTO_TREND_PIVOT_RULES=Object.freeze({radius:Object.freeze({small:5,large:25}),deviation:Object.freeze({small:2,large:5}),touchPivot:3,seedsPerSide:10,linesPerSide:2,atrLength:14});
interface Seed {index:number;price:number;actualSize:number;side:AutoTrendSide}
const FAMILIES:readonly AutoTrendFamily[]=['large','small'];
const SIDES:readonly AutoTrendSide[]=['resistance','support'];

/** Exposed for tests: unbroken, touches, recency, length, then anchor order. */
export function compareAutoTrendPivotLines(a:AutoTrendLine,b:AutoTrendLine):number{
 return (a.breakoutIndex===null?0:1)-(b.breakoutIndex===null?0:1)||b.touches-a.touches||b.to.index-a.to.index||(b.to.index-b.from.index)-(a.to.index-a.from.index)||a.from.index-b.from.index;
}
const overlaps=(a:AutoTrendLine,b:AutoTrendLine)=>Math.max(0,Math.min(a.to.index,b.to.index)-Math.max(a.from.index,b.from.index))*10>3*Math.min(a.to.index-a.from.index,b.to.index-b.from.index);
const yAt=(line:AutoTrendLine,index:number)=>line.from.price+line.slope*(index-line.from.index);
function inStrip(small:AutoTrendLine,large:AutoTrendLine):boolean{
 if(small.from.index<large.from.index||small.to.index>large.endIndex)return false;
 const a=yAt(small,small.from.index)-yAt(large,small.from.index),b=yAt(small,small.to.index)-yAt(large,small.to.index);
 return large.side==='support'?Math.min(a,b)>=0&&Math.max(a,b)<=large.touchWidth:Math.max(a,b)<=0&&Math.min(a,b)>=-large.touchWidth;
}

export function calculateAutoTrendlinesPivot(bars:readonly Bar[],inputs:AutoTrendInputs,limits:AutoTrendLimits={}):AutoTrendResult{
 let meter:AutoTrendMeter;try{meter=new AutoTrendMeter(limits);}catch(error){return{status:'unavailable',scene:null,diagnostic:String(error),usage:Object.freeze({operations:0,numericSlots:0,peakNumericSlots:0})};}
 try{
  meter.reserve(48);meter.work(80);
  if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype||bars.length>AUTO_TREND_LIMITS.bars)throw new AutoTrendUnavailable('Auto trendlines requires at most 100000 ordered supplied bars.');
  autoTrendRecord(inputs,Object.hasOwn(inputs,'externalNumericSlots')?['sourceKey','lineSize','barsToBreakout','showPivots','externalNumericSlots']:['sourceKey','lineSize','barsToBreakout','showPivots'],meter);
  if(typeof inputs.sourceKey!=='string'||!inputs.sourceKey.length||inputs.sourceKey.length>4096||!['Small','Large','Both'].includes(inputs.lineSize)||typeof inputs.showPivots!=='boolean'||!Number.isSafeInteger(inputs.barsToBreakout)||inputs.barsToBreakout<1||inputs.barsToBreakout>100||!Number.isSafeInteger(inputs.externalNumericSlots??0)||(inputs.externalNumericSlots??0)<0)throw new AutoTrendUnavailable('Invalid Auto trendlines inputs.');
  const external=inputs.externalNumericSlots??0;meter.reserve(external);
  const n=bars.length,start=Math.max(0,n-AUTO_TREND_LIMITS.horizon),count=n-start,breakout=inputs.barsToBreakout;
  // Phase 1: validate every supplied row (no accessor is invoked) and run ATR(14, RMA) over the full history.
  meter.work(n*12);meter.reserve(count*2);const atr=new Float64Array(count),hasAtr=new Uint8Array(count),rows:Bar[]=new Array(count);
  let seed=0,previousAtr:number|null=null,previousClose:number|null=null,previousTime:number|null=null;
  for(let i=0;i<n;i++){
   const field=Object.getOwnPropertyDescriptor(bars,i);if(!field||!Object.hasOwn(field,'value'))throw new AutoTrendUnavailable('Auto trendlines bars must be dense data rows.');const bar=field.value as Bar;
   if(!bar||typeof bar!=='object')throw new AutoTrendUnavailable('Auto trendlines has an unavailable observation.');
   for(const key of ['time','open','high','low','close'] as const){const d=Object.getOwnPropertyDescriptor(bar,key);if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value))throw new AutoTrendUnavailable('Auto trendlines requires finite supplied OHLC and time.');}
   if(previousTime!==null&&bar.time<=previousTime||bar.high<bar.low||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close))throw new AutoTrendUnavailable('Auto trendlines requires ordered valid OHLC observations.');
   const tr=previousClose===null?bar.high-bar.low:Math.max(bar.high-bar.low,Math.abs(bar.high-previousClose),Math.abs(bar.low-previousClose));
   if(previousAtr===null){seed+=tr;if(i===AUTO_TREND_PIVOT_RULES.atrLength-1)previousAtr=seed/AUTO_TREND_PIVOT_RULES.atrLength;}else previousAtr=(previousAtr*(AUTO_TREND_PIVOT_RULES.atrLength-1)+tr)/AUTO_TREND_PIVOT_RULES.atrLength;
   if(!Number.isFinite(tr)||!Number.isFinite(seed)||previousAtr!==null&&!Number.isFinite(previousAtr))throw new AutoTrendUnavailable('Auto trendlines ATR arithmetic overflowed.');
   if(i>=start){const local=i-start;rows[local]={time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close} as Bar;if(previousAtr!==null){atr[local]=previousAtr;hasAtr[local]=1;}}
   previousClose=bar.close;previousTime=bar.time;
  }
  // Phase 2: confirmed pivot size per side (bars to the nearest strictly more extreme bar, clamped to the causal prefix).
  meter.reserve(count*4);const size:Record<AutoTrendSide,Int32Array>={resistance:new Int32Array(count),support:new Int32Array(count)},stack=new Int32Array(count),left=new Int32Array(count);
  for(const side of SIDES){
   const price=side==='support'?(i:number)=>rows[i].low:(i:number)=>rows[i].high,beyond=side==='support'?(a:number,b:number)=>a<b:(a:number,b:number)=>a>b,out=size[side];
   for(const reverse of [false,true]){let top=0;meter.work(count*6);
    for(let step=0;step<count;step++){const i=reverse?count-1-step:step,current=price(i);while(top&&!beyond(price(stack[top-1]),current))top--;
     const distance=top?Math.abs(i-stack[top-1]):reverse?count-i:i+1;if(reverse)out[i]=Math.min(i,count-1-i,left[i]-1,distance-1);else left[i]=distance;stack[top++]=i;}
   }
  }
  meter.release(count*2); // stack and left scratch
  // Phase 3: Zig Zag seeds per family; Phase 4: bounded candidate pairs among the newest seeds of each side.
  const wanted=FAMILIES.filter(family=>inputs.lineSize==='Both'||inputs.lineSize.toLowerCase()===family),selected:AutoTrendLine[]=[];
  let scratch=0;
  for(const family of wanted){
   const radius=AUTO_TREND_PIVOT_RULES.radius[family],multiple=AUTO_TREND_PIVOT_RULES.deviation[family],seeds:Seed[]=[];meter.work(count*6);
   for(let local=0;local<count;local++)for(const side of SIDES){const actual=size[side][local];if(actual<radius||!hasAtr[local])continue;
    const point:Seed={index:local,price:side==='support'?rows[local].low:rows[local].high,actualSize:actual,side},last=seeds[seeds.length-1];
    if(!last){meter.reserve(4);scratch+=4;seeds.push(point);continue;}
    if(last.side===side){if(side==='support'?point.price<=last.price:point.price>=last.price)seeds[seeds.length-1]=point;continue;}
    if(Math.abs(point.price-last.price)>multiple*atr[last.index]){meter.reserve(4);scratch+=4;seeds.push(point);}
   }
   const familyLines:AutoTrendLine[]=[];
   for(const side of SIDES){
    const anchors=seeds.filter(row=>row.side===side).slice(-AUTO_TREND_PIVOT_RULES.seedsPerSide),candidates:AutoTrendLine[]=[];meter.work(seeds.length*2);
    const support=side==='support',edge=support?(i:number)=>rows[i].low:(i:number)=>rows[i].high;
    for(let a=0;a<anchors.length;a++)for(let b=a+1;b<anchors.length;b++){
     meter.work(48);const from=anchors[a],to=anchors[b],slope=(to.price-from.price)/(to.index-from.index),touchWidth=(atr[from.index]+atr[to.index])/4;
     if(!Number.isFinite(slope)||!Number.isFinite(touchWidth))throw new AutoTrendUnavailable('Auto trendlines price arithmetic overflowed.');
     let touches=0,pierced=false;meter.work((to.index-from.index)*3);
     for(let i=from.index+1;i<to.index;i++){const y=from.price+slope*(i-from.index),value=edge(i);
      if(support?value<y-touchWidth:value>y+touchWidth){pierced=true;break;}
      if(size[side][i]>=AUTO_TREND_PIVOT_RULES.touchPivot&&(support?value<=y+touchWidth:value>=y-touchWidth))touches++;}
     if(pierced)continue;
     let endIndex=count-1,run=0,breakoutIndex:number|null=null;
     for(let i=to.index+1;i<count;i++){meter.work(4);const y=from.price+slope*(i-from.index);if(!Number.isFinite(y))throw new AutoTrendUnavailable('Auto trendlines extension arithmetic overflowed.');
      const close=rows[i].close;run=(support?close<y:close>y)?run+1:0;if(run===breakout){endIndex=i;breakoutIndex=i;break;}
      const value=edge(i);if(size[side][i]>=AUTO_TREND_PIVOT_RULES.touchPivot&&(support?value<=y+touchWidth&&value>=y-touchWidth:value>=y-touchWidth&&value<=y+touchWidth))touches++;}
     const absFrom=start+from.index,absTo=start+to.index,absEnd=start+endIndex,endPrice=from.price+slope*(endIndex-from.index);
     if(!Number.isFinite(endPrice))throw new AutoTrendUnavailable('Auto trendlines endpoint arithmetic overflowed.');
     const anchor=(row:Seed):AutoTrendAnchor=>({index:start+row.index,time:rows[row.index].time,price:row.price,actualSize:row.actualSize,confirmedAt:start+row.index+radius});
     meter.reserve(30);scratch+=30;
     candidates.push({key:autoTrendKey(family,side,absFrom,absTo),family,side,from:anchor(from),to:anchor(to),slope,touchWidth,touches,endIndex:absEnd,endPrice,breakoutIndex:breakoutIndex===null?null:start+breakoutIndex,extended:absEnd-absTo<=2*(absTo-absFrom)});
    }
    meter.work(candidates.length*candidates.length*4+16);candidates.sort(compareAutoTrendPivotLines);
    const kept:AutoTrendLine[]=[];
    for(const line of candidates){if(kept.length>=AUTO_TREND_PIVOT_RULES.linesPerSide)break;meter.work(16*(kept.length+1));
     if(kept.some(prior=>overlaps(line,prior)))continue;
     if(family==='small'&&selected.some(large=>large.family==='large'&&large.side===side&&inStrip(line,large)))continue;
     kept.push(line);}
    familyLines.push(...kept);
   }
   selected.push(...familyLines);seeds.length=0;
  }
  // Phase 5: publish. Reserve the published geometry before releasing scratch so the receipt always covers the scene.
  const lines:AutoTrendLine[]=[],pivots:AutoTrendPivot[]=[],seen=new Set<string>();meter.reserve(selected.length*30);
  for(const line of selected){meter.work(96);const clone=(point:AutoTrendAnchor):AutoTrendAnchor=>Object.freeze({...point});
   lines.push(Object.freeze({...line,from:clone(line.from),to:clone(line.to)}));
   if(inputs.showPivots)for(const point of [line.from,line.to]){meter.work(32);const key=`${line.family}:${line.side}:${point.index}`;if(seen.has(key))continue;seen.add(key);meter.reserve(8);pivots.push(Object.freeze({...clone(point),family:line.family,side:line.side,key}));}
  }
  meter.release(count*4+scratch);
  const scene:AutoTrendScene=Object.freeze({schemaVersion:1,policy:AUTO_TREND_POLICY,sourceKey:inputs.sourceKey,fromIndex:start,asOfIndex:n-1,asOfTime:n?rows[count-1].time:null,lines:Object.freeze(lines),pivots:Object.freeze(pivots)});
  meter.work(24);return Object.freeze({status:'ready',scene,usage:meter.usage()});
 }catch(error){return Object.freeze({status:'unavailable',scene:null,diagnostic:error instanceof Error?error.message:String(error),usage:meter.usage()});}
}
