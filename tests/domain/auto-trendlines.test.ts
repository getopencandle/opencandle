import {expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {calculateAutoTrendlines,compareAutoTrendLines,autoTrendBaseConflict,autoTrendBaseInStrip,scanAutoTrendExtension,type AutoTrendInputs} from '../../src/domain/indicators-ext/auto-trendlines';
import {AUTO_TREND_POLICY,AutoTrendMeter,type AutoTrendLine} from '../../src/domain/indicators-ext/auto-trendlines-scene';
const inputs:AutoTrendInputs={sourceKey:'SYNTHETIC:AUTOTREND:standard:regular',lineSize:'Small',barsToBreakout:3,showPivots:true};
import {syntheticTrendBars} from './auto-trendlines-fixture';

function ready(bars:readonly Bar[],edit:Partial<AutoTrendInputs>={}){const result=calculateAutoTrendlines(bars,{...inputs,...edit});expect(result.status,result.status==='unavailable'?result.diagnostic:'').toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);return result;}
function line(from=20,to=80,edit:Partial<AutoTrendLine>={}):AutoTrendLine{return{key:`small:support:${from}:${to}`,family:'small',side:'support',from:{index:from,time:from*60,price:90,actualSize:20,confirmedAt:from+5},to:{index:to,time:to*60,price:95,actualSize:30,confirmedAt:to+5},slope:5/(to-from),touchWidth:1,touches:2,endIndex:139,endPrice:90+5/(to-from)*(139-from),breakoutIndex:null,extended:true,...edit};}
it('builds the original small support vector with known anchors, source and retrospective confirmation',()=>{
 const bars=syntheticTrendBars().slice(0,86),before=JSON.stringify(bars),result=ready(bars),selected=result.scene.lines.find(row=>row.from.index===20&&row.to.index===80&&row.side==='support');expect(selected).toBeDefined();expect(selected!.from.price).toBe(89.75);expect(selected!.to.price).toBe(94.75);expect(selected!.from.actualSize).toBe(20);expect(selected!.to.actualSize).toBe(5);const ranges=bars.map((bar,i)=>i?Math.max(bar.high-bar.low,Math.abs(bar.high-bars[i-1].close),Math.abs(bar.low-bars[i-1].close)):bar.high-bar.low),closedAtr=(at:number)=>ranges.slice(0,14).reduce((sum,tr)=>sum+tr,0)/14*Math.pow(13/14,at-13)+ranges.slice(14,at+1).reduce((sum,tr,k)=>sum+tr/14*Math.pow(13/14,at-(k+14)),0);expect(selected!.touchWidth).toBeCloseTo((closedAtr(20)+closedAtr(80))/4,12);expect(selected!.slope).toBe(5/60);expect(selected!.from.confirmedAt).toBe(25);expect(selected!.to.confirmedAt).toBe(85);expect(selected!.breakoutIndex).toBeNull();expect(selected!.extended).toBe(true);expect(result.scene.sourceKey).toBe(inputs.sourceKey);expect(result.scene.policy).toBe(AUTO_TREND_POLICY);expect(result.scene.asOfIndex).toBe(85);expect(JSON.stringify(bars)).toBe(before);expect(Object.isFrozen(result.scene.lines)).toBe(true);expect(Object.isFrozen(selected!.from)).toBe(true);expect(result.scene.pivots.some(p=>p.index===80)).toBe(true);const ranked=ready(syntheticTrendBars());expect(ranked.scene.lines.some(row=>row.from.index===44&&row.to.index===120&&row.touches===1)).toBe(true);expect(ranked.scene.lines.some(row=>row.from.index===20&&row.to.index===80)).toBe(false);expect(ranked.scene.lines.map(row=>[row.from.index,row.to.index,row.touches])).toEqual([[44,120,1]]);
});
it('does not confirm a small anchor before the final required right observation',()=>{
 const bars=syntheticTrendBars();expect(ready(bars.slice(0,85)).scene.lines.some(row=>row.to.index===80)).toBe(false);expect(ready(bars.slice(0,86)).scene.lines.some(row=>row.to.index===80&&row.from.index===20)).toBe(true);
});
it('large geometry waits for its own right observations and uses the original larger vector',()=>{
 const bars=syntheticTrendBars(true);expect(ready(bars.slice(0,425),{lineSize:'Large'}).scene.lines.some(row=>row.to.index===400)).toBe(false);const result=ready(bars.slice(0,426),{lineSize:'Large'}),selected=result.scene.lines.find(row=>row.from.index===100&&row.to.index===400);expect(selected).toBeDefined();expect(selected!.family).toBe('large');expect(selected!.to.confirmedAt).toBe(425);expect(result.scene.lines.every(row=>row.family==='large')).toBe(true);const ranked=ready(bars,{lineSize:'Large'});expect(ranked.scene.lines.some(row=>row.from.index===224&&row.to.index===600&&row.touches===1)).toBe(true);expect(ranked.scene.lines.some(row=>row.from.index===100&&row.to.index===400)).toBe(false);expect(ranked.scene.lines.map(row=>[row.from.index,row.to.index,row.touches])).toEqual([[224,600,1],[100,276,0]]);
});
it('empty, warmup and flat observations are successful empty scenes, never fabricated scalar plots',()=>{
 for(const bars of [[],syntheticTrendBars().slice(0,13),Array.from({length:5000},(_,i)=>({time:i+1,open:100,high:100,low:100,close:100,volume:0}))]){const result=ready(bars);expect(result.scene.lines).toEqual([]);expect(result.scene.pivots).toEqual([]);expect(Object.hasOwn(result,'series')).toBe(false);}expect(ready([]).scene.asOfTime).toBeNull();
});
it('show pivots changes only marker publication and every marker belongs to a selected confirmed anchor',()=>{
 const on=ready(syntheticTrendBars()),off=ready(syntheticTrendBars(),{showPivots:false});expect(off.scene.lines).toEqual(on.scene.lines);expect(off.scene.pivots).toEqual([]);for(const pivot of on.scene.pivots)expect(on.scene.lines.some(row=>row.family===pivot.family&&row.side===pivot.side&&(row.from.index===pivot.index||row.to.index===pivot.index))).toBe(true);
});
it('prefix recalculation never reads an observation beyond its supplied causal prefix',()=>{
 const bars=syntheticTrendBars();for(let end=50;end<=bars.length;end+=5){const prefix=bars.slice(0,end),result=ready(prefix);expect(result.scene.asOfIndex).toBe(end-1);for(const row of result.scene.lines){expect(row.from.confirmedAt).toBeLessThan(end);expect(row.to.confirmedAt).toBeLessThan(end);expect(row.endIndex).toBeLessThan(end);}expect(result.scene).toEqual(ready(prefix.map(bar=>({...bar}))).scene);}
});
it('keeps all anchors inside the exact loaded search horizon and preserves absolute logical indices',()=>{
 const bars=Array.from({length:5500},(_,i)=>({time:i*60+1,open:100,high:100,low:100,close:100,volume:0}));const result=ready(bars);expect(result.scene.fromIndex).toBe(500);expect(result.scene.asOfIndex).toBe(5499);expect(result.scene.lines).toEqual([]);
});
it('ranking preferences are independent of viewport units and complete ties are deterministic',()=>{
 const base=line();expect(compareAutoTrendLines({...base,touches:3},base)).toBeLessThan(0);expect(compareAutoTrendLines({...base,endIndex:140},base)).toBeLessThan(0);expect(compareAutoTrendLines({...base,to:{...base.to,actualSize:31}},base)).toBeLessThan(0);expect(compareAutoTrendLines({...base,slope:-1},base)).toBeLessThan(0);expect(compareAutoTrendLines(base,{...base,from:{...base.from,index:21}})).toBeLessThan(0);expect(compareAutoTrendLines(base,{...base})).toBe(0);
});
it('the overlap threshold is strict and uses the recorded shorter-base OpenCandle policy',()=>{
 expect(autoTrendBaseConflict(line(0,100),line(70,170))).toBe(false);expect(autoTrendBaseConflict(line(0,100),line(69,169))).toBe(true);expect(autoTrendBaseConflict(line(0,100),line(80,120))).toBe(true);expect(autoTrendBaseConflict(line(0,100),line(100,200))).toBe(false);
});
it('full affine base containment, not a midpoint sample, determines suppression',()=>{
 const large=line(0,100,{family:'large',slope:0,from:{...line().from,index:0,price:100},to:{...line().to,index:100,price:100},endIndex:200,touchWidth:2});
 expect(autoTrendBaseInStrip(line(20,80,{slope:0,from:{...line().from,index:20,price:101},to:{...line().to,index:80,price:101}}),large)).toBe(true);expect(autoTrendBaseInStrip(line(20,80,{slope:.1,from:{...line().from,index:20,price:101}}),large)).toBe(false);expect(autoTrendBaseInStrip(line(20,80,{slope:0,from:{...line().from,index:20,price:99}}),large)).toBe(false);
});
it('strict consecutive closes confirm breakout only on its final observation and equality resets it',()=>{
 const closes=[110,110,110,110,110,110,99,100,99,99,99,110],bars=closes.map((close,i)=>({time:i+1,open:close,high:close+1,low:close-1,close,volume:1})),scan=(values:readonly Bar[])=>scanAutoTrendExtension(values,{index:0,price:100},4,'support',0,3,new AutoTrendMeter());
 expect(scan(bars.slice(0,10))).toMatchObject({breakoutIndex:null,endIndex:9});expect(scan(bars)).toMatchObject({breakoutIndex:10,endIndex:10,endPrice:100,extended:true});expect(scan(bars.slice(0,11))).toEqual(scan(bars));
 const opposite=bars.map(bar=>({...bar,close:200-bar.close}));expect(scanAutoTrendExtension(opposite,{index:0,price:100},4,'resistance',0,3,new AutoTrendMeter()).breakoutIndex).toBe(10);
});
it('data gaps, out of order observations, invalid controls and arithmetic overflow fail atomically',()=>{
 const bars=syntheticTrendBars();for(const [data,edit]of [[bars.map((bar,i)=>i===50?{...bar,low:NaN}:bar),{}],[bars.map((bar,i)=>i===50?{...bar,time:bars[49].time}:bar),{}],[bars,{barsToBreakout:0}],[bars,{lineSize:'Unknown'}],[bars.map(bar=>({...bar,high:Number.MAX_VALUE,low:-Number.MAX_VALUE})),{}]] as const){const result=calculateAutoTrendlines(data,{...inputs,...edit} as AutoTrendInputs);expect(result.status).toBe('unavailable');expect(result.scene).toBeNull();}
 const trapped=bars.slice();Object.defineProperty(trapped[5]={...bars[5]},'close',{get(){throw Error('must not read');}});expect(calculateAutoTrendlines(trapped,inputs).status).toBe('unavailable');
});
