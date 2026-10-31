import {describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import type {AutoTrendInputs} from '../../src/domain/indicators-ext/auto-trendlines';
import {AUTO_TREND_PIVOT_RULES,calculateAutoTrendlinesPivot,compareAutoTrendPivotLines} from '../../src/domain/indicators-ext/auto-trendlines-pivot';
import {AUTO_TREND_LIMITS,AutoTrendMeter,validateAutoTrendScene,type AutoTrendLine} from '../../src/domain/indicators-ext/auto-trendlines-scene';
import {presentAutoTrendlines} from '../../src/chart/auto-trendlines-presentation';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {selectorCategoryOf} from '../../src/domain/indicator-selector-catalog';
import {patternMarksNative} from '../../src/chart/indicator-presentation';

const inputs:AutoTrendInputs={sourceKey:'SYNTHETIC:AUTOTREND:pivot',lineSize:'Small',barsToBreakout:3,showPivots:true};
/** Piecewise-linear closes; high/low = close +/- 0.25. Lows at 20, 50, 80 are collinear (slope 10/60). */
function knotted(knots:readonly (readonly [number,number])[]):Bar[]{
 const out:Bar[]=[];let k=1;const last=knots[knots.length-1][0];
 for(let i=0;i<=last;i++){while(k<knots.length-1&&i>knots[k][0])k++;const [a,y]=knots[k-1],[b,z]=knots[k],close=y+(z-y)*(i-a)/(b-a);out.push({time:1_700_000_000+i*60,open:close,high:close+.25,low:close-.25,close,volume:100});}
 return out;
}
const SUPPORT=[[0,100],[20,90],[30,120],[50,95],[60,125],[80,100],[100,130],[124,95]] as const;
function ready(bars:readonly Bar[],edit:Partial<AutoTrendInputs>={}){const result=calculateAutoTrendlinesPivot(bars,{...inputs,...edit});expect(result.status,result.status==='unavailable'?result.diagnostic:'').toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);return result;}
/** Seeded PRNG + GBM with volatility regimes; 'gme' adds squeezes and gaps. Original synthetic data only. */
function market(count:number,kind:'spy'|'gme',seed=7):Bar[]{
 let s=seed>>>0;const rand=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
 const normal=()=>Math.sqrt(-2*Math.log(rand()+1e-12))*Math.cos(2*Math.PI*rand());
 const out:Bar[]=[];let close=kind==='spy'?400:20,vol=kind==='spy'?0.01:0.04;
 for(let i=0;i<count;i++){
  if(i%250===0)vol=(kind==='spy'?0.006:0.025)+rand()*(kind==='spy'?0.012:0.06);
  let r=vol*normal()+(kind==='spy'?0.0003:0);if(kind==='gme'&&rand()<0.004)r+=(rand()<0.6?1:-1)*(0.2+rand()*0.5);
  const open=close*(1+vol*0.2*normal()),next=Math.max(0.5,close*Math.exp(r)),high=Math.max(open,next)*(1+Math.abs(normal())*vol*0.5),low=Math.min(open,next)*(1-Math.abs(normal())*vol*0.5);
  out.push({time:1_500_000_000+i*86400,open,high,low:Math.max(0.01,low),close:next,volume:1000});close=next;
 }
 return out;
}
const dense=()=>Array.from({length:5000},(_,i)=>{const close=1000+100*Math.cos(i*Math.PI/6);return{time:i+1,open:close,high:close+.1,low:close-.1,close,volume:100};});

describe('AUTOTREND pivot kernel: hand-checkable geometry',()=>{
 it('connects the collinear swing lows into one unbroken support line with a middle touch',()=>{
  const bars=knotted(SUPPORT.slice(0,7)),result=ready(bars),support=result.scene.lines.filter(line=>line.side==='support');
  expect(support).toHaveLength(1);const line=support[0];
  expect([line.from.index,line.to.index]).toEqual([20,80]);expect(line.from.price).toBe(89.75);expect(line.to.price).toBe(99.75);expect(line.slope).toBe(10/60);
  expect(line.touches).toBe(1);expect(line.breakoutIndex).toBeNull();expect(line.endIndex).toBe(100);expect(line.from.confirmedAt).toBe(25);expect(line.to.confirmedAt).toBe(85);
  expect(line.endPrice).toBe(89.75+(10/60)*80);expect(result.scene.lines.every(row=>row.family==='small')).toBe(true);
 });
 it('ends the line on the bar that completes N strictly beyond closes (independent brute-force oracle)',()=>{
  const bars=knotted(SUPPORT);for(const n of [1,3,5]){
   const line=ready(bars,{barsToBreakout:n}).scene.lines.find(row=>row.side==='support'&&row.from.index===20&&row.to.index===80)!;expect(line).toBeDefined();
   let run=0,expected:number|null=null;for(let i=81;i<bars.length;i++){run=bars[i].close<89.75+(i-20)*(10/60)?run+1:0;if(run===n){expected=i;break;}}
   expect(expected).not.toBeNull();expect(line.breakoutIndex).toBe(expected);expect(line.endIndex).toBe(expected);
  }
 });
 it('never anchors on an unconfirmed pivot and each prefix scene validates and presents',()=>{
  const bars=knotted(SUPPORT);expect(ready(bars.slice(0,85)).scene.lines.some(row=>row.to.index===80)).toBe(false);expect(ready(bars.slice(0,86)).scene.lines.some(row=>row.to.index===80&&row.side==='support')).toBe(true);
  for(let end=10;end<=bars.length;end+=7){const result=ready(bars.slice(0,end));validateAutoTrendScene(result.scene,new AutoTrendMeter());
   for(const row of result.scene.lines){expect(row.to.confirmedAt).toBeLessThan(end);expect(row.endIndex).toBeLessThan(end);}
   const shown=presentAutoTrendlines(result,{instanceId:'t',paneId:'',supportColor:'#089981',resistanceColor:'#f23645',width:1,lineStyle:'solid'});expect(shown.status).toBe('ready');expect(shown.lines).toHaveLength(result.scene.lines.length);}
 });
 it('show pivots changes only markers; empty, warmup and flat inputs are empty scenes',()=>{
  const bars=knotted(SUPPORT),on=ready(bars),off=ready(bars,{showPivots:false});expect(off.scene.lines).toEqual(on.scene.lines);expect(off.scene.pivots).toEqual([]);expect(on.scene.pivots.length).toBeGreaterThan(0);
  for(const pivot of on.scene.pivots)expect(on.scene.lines.some(row=>row.side===pivot.side&&(row.from.index===pivot.index||row.to.index===pivot.index))).toBe(true);
  for(const data of [[],bars.slice(0,13),Array.from({length:5000},(_,i)=>({time:i+1,open:100,high:100,low:100,close:100,volume:0}))]){const result=ready(data,{lineSize:'Both'});expect(result.scene.lines).toEqual([]);expect(result.scene.pivots).toEqual([]);}
 });
 it('ranks unbroken, then touches, then recency, deterministically',()=>{
  const base=ready(knotted(SUPPORT.slice(0,7))).scene.lines.find(row=>row.side==='support')!,edit=(e:Partial<AutoTrendLine>)=>({...base,...e}) as AutoTrendLine;
  expect(compareAutoTrendPivotLines(base,edit({breakoutIndex:90}))).toBeLessThan(0);expect(compareAutoTrendPivotLines(edit({touches:4}),base)).toBeLessThan(0);
  expect(compareAutoTrendPivotLines(edit({to:{...base.to,index:base.to.index+1}}),base)).toBeLessThan(0);expect(compareAutoTrendPivotLines(base,{...base})).toBe(0);
 });
 it('bad data, bad controls and accessor traps fail atomically',()=>{
  const bars=knotted(SUPPORT);for(const [data,edit] of [[bars.map((bar,i)=>i===50?{...bar,low:NaN}:bar),{}],[bars.map((bar,i)=>i===50?{...bar,time:bars[49].time}:bar),{}],[bars,{barsToBreakout:0}],[bars,{barsToBreakout:101}],[bars,{lineSize:'Unknown'}],[bars.map(bar=>({...bar,high:Number.MAX_VALUE,low:-Number.MAX_VALUE})),{}]] as const){
   const result=calculateAutoTrendlinesPivot(data,{...inputs,...edit} as AutoTrendInputs);expect(result.status).toBe('unavailable');expect(result.scene).toBeNull();}
  const trapped=bars.slice();Object.defineProperty(trapped[5]={...bars[5]},'close',{get(){throw Error('must not read');}});expect(calculateAutoTrendlinesPivot(trapped,inputs).status).toBe('unavailable');
 });
});

describe('AUTOTREND pivot kernel: resources and performance',()=>{
 it('refuses atomically one unit below its exact receipt and never lets callers raise the ceiling',()=>{
  const bars=market(5000,'gme'),full={...inputs,lineSize:'Both' as const},result=ready(bars,full);
  expect(calculateAutoTrendlinesPivot(bars,full,{operations:result.usage.operations,numericSlots:result.usage.peakNumericSlots}).status).toBe('ready');
  for(const limits of [{operations:result.usage.operations-1},{numericSlots:result.usage.peakNumericSlots-1},{operations:0},{numericSlots:0}]){const denied=calculateAutoTrendlinesPivot(bars,full,limits);expect(denied.status).toBe('unavailable');expect(denied.scene).toBeNull();expect(denied.usage.operations).toBeLessThanOrEqual(limits.operations??AUTO_TREND_LIMITS.operations);expect(denied.usage.peakNumericSlots).toBeLessThanOrEqual(limits.numericSlots??AUTO_TREND_LIMITS.numericSlots);}
  expect(calculateAutoTrendlinesPivot(bars,{...full,externalNumericSlots:200000}).status).toBe('unavailable');
  for(const limits of [{operations:12000001},{numericSlots:200001}])expect(calculateAutoTrendlinesPivot([],inputs,limits).status).toBe('unavailable');
  expect(calculateAutoTrendlinesPivot(market(100001,'spy'),full).status).toBe('unavailable');
 });
 it('ordinary SPY/GME-like 5k and 100k charts finish under the unchanged budget; 5k well under 100 ms',()=>{
  const timings:Record<string,number>={};
  for(const kind of ['spy','gme'] as const)for(const count of [5000,100000]){
   const bars=market(count,kind),full={...inputs,lineSize:'Both' as const};ready(bars,full);
   const t0=performance.now(),result=ready(bars,full),ms=performance.now()-t0;timings[`${kind}${count}`]=ms;timings[`${kind}${count}ops`]=result.usage.operations;
   expect(result.usage.operations).toBeLessThanOrEqual(AUTO_TREND_LIMITS.operations);expect(result.usage.peakNumericSlots).toBeLessThanOrEqual(AUTO_TREND_LIMITS.numericSlots);
   expect(result.scene.lines.length).toBeGreaterThan(0);expect(result.scene.lines.length).toBeLessThanOrEqual(2*2*AUTO_TREND_PIVOT_RULES.linesPerSide);
   expect(ready(bars,full)).toEqual(result);if(count===5000)expect(ms).toBeLessThan(100);
  }
  console.info('AUTOTREND timings ms',JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,k.endsWith('ops')?v:Math.round(v*10)/10]))));
 });
 it('dense alternating input is bounded by the anchor cap, deterministic and under budget',()=>{
  const result=ready(dense(),{lineSize:'Both'});expect(result.usage.operations).toBeLessThan(AUTO_TREND_LIMITS.operations);expect(ready(dense(),{lineSize:'Both'})).toEqual(result);
 });
});

describe('AUTOTREND catalog registration',()=>{
 it('is an Indicators-tab overlay with the public breakout default and value-free plots',()=>{
  const definition=catalogDefinition('autotrendlines')!;expect(definition).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain('autotrendlines');expect(selectorCategoryOf({id:'autotrendlines'})).toBe('indicators');
  expect(definition.name).toBe('Auto trendlines');expect(definition.overlay).toBe(true);
  expect(Object.fromEntries(definition.inputs.map(row=>[row.key,row.defval]))).toEqual({lineSize:'Both',barsToBreakout:3,showPivots:false});
  expect(definition.inputs.find(row=>row.key==='lineSize')!.options).toEqual(['Small','Large','Both']);
 });
 it('draws lines through the marks path and leaves every plot value unavailable',()=>{
  const bars=market(5000,'spy'),result=calculateIndicator('autotrendlines',bars,{lineSize:'Both',barsToBreakout:3,showPivots:true});
  expect(result.series.map(row=>row.id)).toEqual(['bullish','bearish']);for(const row of result.series)expect(row.values.every(value=>value===null)).toBe(true);
  expect(result.marks!.lines.length).toBeGreaterThan(0);expect(result.marks!.markers.length).toBeGreaterThan(0);
  const scene=ready(bars,{lineSize:'Both'}).scene;// An unbroken line is a ray through its two pivots (its projection stays off the price scale); a broken one ends at the breakout.
  expect(result.marks!.lines.map(row=>[row.from.index,row.to.index,row.extendRight===true])).toEqual(scene.lines.map(row=>row.breakoutIndex===null?[row.from.index,row.to.index,true]:[row.from.index,row.endIndex,false]));
  const drawn=patternMarksNative('i1',result,bars,()=>({visible:true,color:'#089981',opacity:100,width:1,lineStyle:'solid'}) as never);expect(drawn.lines).toHaveLength(result.marks!.lines.length);
  const broken=calculateIndicator('autotrendlines',bars.map((bar,i)=>i===10?{...bar,close:NaN}:bar),{});expect(broken.marks?.lines??[]).toEqual([]);
 });
});
