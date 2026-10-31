// Every fast path returns exactly what the code it replaces returned. SYNTHETIC data throughout.
import {describe,expect,it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {cloneBarList,cloneBarArray,cloneMarketInput} from '../../src/chart/bar-clone';
import {asDomainBars} from '../../src/chart/indicator-port';
import {renderIndicatorSeries} from '../../src/chart/indicator-rendering';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {calculateIndicator,sma,ema,rma,wma,standardDeviation,trueRange,stochastic,obv,sourceValues,type IndicatorId} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import {scriptBarIds,clearScriptBarIdCache} from '../../src/ui/script-input';
import {sessionZonesFor,sessionBreakTimes} from '../../src/chart/session-zones';
import {newYorkClock,usSessionPhase,usSessionSegment} from '../../src/domain/us-market-hours';
import * as oracle from '../fixtures/r27-indicator-oracle';
import type {Bar} from '../../src/domain/types';

/** Deterministic SYNTHETIC generator (no Math.random). */
function rng(seed:number){let state=seed>>>0||1;return()=>{state^=state<<13;state>>>=0;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};}
function syntheticBars(count:number,seed:number,start=1700000000):Bar[]{
 const next=rng(seed);let close=100;
 return Array.from({length:count},(_,index)=>{close=Math.max(0.01,close+(next()-0.5)*2);const open=close+(next()-0.5),high=Math.max(open,close)+next(),low=Math.min(open,close)-next();return{time:start+index*60,open,high,low,close,volume:Math.floor(next()*1000)};});
}
/** Same text (key order, -0 as 0, NaN as null) and the same numbers (Object.is: -0 and NaN kept). */
function exactly(actual:unknown,expected:unknown){
 expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
 const walk=(a:unknown,b:unknown,path:string)=>{
  if(typeof b==='number'){if(!Object.is(a,b))throw new Error(`${path}: ${String(a)} is not ${String(b)}`);return;}
  if(b&&typeof b==='object'){expect(Object.keys(a as object)).toEqual(Object.keys(b as object));for(const key of Object.keys(b as object))walk((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],path+'.'+key);return;}
  expect(a).toBe(b);
 };
 walk(actual,expected,'$');
}
const outcome=(run:()=>unknown)=>{try{return{value:run()};}catch(error){return{error:String(error)};}};

describe(' exact bar copies',()=>{
 const plain=syntheticBars(50,1);
 it('equal structuredClone for plain bars, fresh objects',()=>{
  const copy=cloneBarList(plain);exactly(copy,structuredClone([...plain]));expect(copy[0]).not.toBe(plain[0]);
  exactly(cloneBarArray(plain),structuredClone(plain));
  const input={bars:plain,source:{datasetId:'synthetic',revision:'1',fixture:true,label:'SYNTHETIC'}},cloned=cloneMarketInput(input);
  exactly(cloned,structuredClone(input));expect(cloned.bars).not.toBe(plain);expect(cloned.source).not.toBe(input.source);
  copy[0].close=-1;expect(plain[0].close).not.toBe(-1);
 });
 it('keep -0, NaN and other key orders',()=>{
  const odd=[{time:1,open:-0,high:NaN,low:Infinity,close:-Infinity,volume:0},{volume:5,close:1,time:2,open:1,high:1,low:1} as Bar];
  for(const copy of [cloneBarList(odd),cloneBarArray(odd)]){expect(copy.map(row=>Object.keys(row))).toEqual(odd.map(row=>Object.keys(row)));expect(Object.is(copy[0].open,-0)).toBe(true);expect(Number.isNaN(copy[0].high)).toBe(true);}
 });
 it('fall back to structuredClone for every other shape, including its errors',()=>{
  class Row{time=1;open=1;high=1;low=1;close=1;volume=1;}
  const shared={time:1,open:1,high:1,low:1,close:1,volume:1};
  const holes=[...plain.slice(0,3)];delete (holes as unknown as Record<number,unknown>)[1];
  const extra=[...plain.slice(0,3)] as Bar[]&{note?:string};extra.note='x';
  const cases:unknown[][]=[[shared,shared],[new Row()],[{...plain[0],meta:{a:1}}],[{...plain[1]},{...plain[0]}],[{...plain[0],flag:true}],holes,extra,[{...plain[0],f:()=>1}],[{...plain[0],[Symbol('s')]:1}],[null],[1]];
  for(const rows of cases){
   exactly(outcome(()=>cloneBarList(rows as Bar[])),outcome(()=>structuredClone([...rows])));
   exactly(outcome(()=>cloneBarArray(rows as Bar[])),outcome(()=>structuredClone(rows)));
   const input={bars:rows,source:{datasetId:'s'}};exactly(outcome(()=>cloneMarketInput(input as never)),outcome(()=>structuredClone(input)));
  }
  const copied=cloneBarList([shared,shared]);expect(copied[0]).toBe(copied[1]);// structuredClone keeps the shared reference
  const sparse=cloneBarArray(holes as Bar[]);expect(1 in sparse).toBe(false);
  expect((cloneBarArray(extra) as typeof extra).note).toBe('x');
 });
});

describe(' stepper kernels equal the pre-lane kernels',()=>{
 const series=(count:number,seed:number,mode:'plain'|'gaps'|'extreme')=>{const next=rng(seed);return Array.from({length:count},(_,index)=>{const r=next();if(mode==='gaps'&&r<0.08)return null;if(mode==='gaps'&&r<0.1)return NaN as unknown as number;if(mode==='extreme'){if(r<0.05)return 1e308;if(r<0.1)return -1e308;if(r<0.15)return 5e-324;if(r<0.2)return -0;}return 100+Math.sin(index/7)*10+r;});};
 const periods=[1,2,3,9,14,20,50];
 it('sma, ema, rma, wma and standard deviation, including gaps, -0 and exact-sum ranges',()=>{
  for(const mode of ['plain','gaps','extreme'] as const)for(let seed=1;seed<=6;seed++){const values=series(400,seed,mode);
   for(const period of periods)for(const [name,next,prior] of [['sma',sma,oracle.sma],['ema',ema,oracle.ema],['rma',rma,oracle.rma],['wma',wma,oracle.wma],['stdev',standardDeviation,oracle.standardDeviation]] as const)
    try{exactly(outcome(()=>next(values,period)),outcome(()=>prior(values,period)));}catch(error){throw new Error(`${name} ${mode} seed ${seed} period ${period}: ${String(error)}`);}}
  for(const bad of [0,1.5,100001,NaN])for(const [next,prior] of [[sma,oracle.sma],[ema,oracle.ema],[rma,oracle.rma],[wma,oracle.wma],[standardDeviation,oracle.standardDeviation]] as const)exactly(outcome(()=>next([1,2,3],bad)),outcome(()=>prior([1,2,3],bad)));
  exactly(outcome(()=>sma(new Array(100001).fill(1),3)),outcome(()=>oracle.sma(new Array(100001).fill(1),3)));
  const sparse=[1,2,3,4,5];delete (sparse as unknown as Record<number,unknown>)[2];
  for(const [next,prior] of [[sma,oracle.sma],[ema,oracle.ema],[rma,oracle.rma],[wma,oracle.wma],[standardDeviation,oracle.standardDeviation]] as const){const a=outcome(()=>next(sparse,2)),b=outcome(()=>prior(sparse,2));exactly(a,b);if('value' in a&&'value' in b)expect(2 in (a.value as object)).toBe(2 in (b.value as object));}
 });
 it('trueRange, stochastic, obv and every price source',()=>{
  for(let seed=1;seed<=8;seed++){const bars=syntheticBars(300,seed);if(seed%2)for(const index of [5,50,51,200])bars[index]={...bars[index],close:NaN,volume:index%3?NaN:-1};
   exactly(trueRange(bars),oracle.trueRange(bars));exactly(obv(bars),oracle.obv(bars));
   for(const [length,k,d] of [[14,3,3],[5,1,2],[30,9,4]])exactly(outcome(()=>stochastic(bars,length,k,d)),outcome(()=>oracle.stochastic(bars,length,k,d)));
   for(const source of ['open','high','low','close','hl2','hlc3','ohlc4','typo'] as const)exactly(outcome(()=>sourceValues(bars,source as never)),outcome(()=>oracle.sourceValues(bars,source as never)));}
  const huge=[{time:1,open:1.7e308,high:1.7e308,low:1.7e308,close:1.7e308,volume:1}];
  for(const source of ['hl2','hlc3','ohlc4'] as const)exactly(outcome(()=>sourceValues(huge,source)),outcome(()=>oracle.sourceValues(huge,source)));
 });
});

describe(' incremental indicator sessions equal calculateIndicator on every live step',()=>{
 const configurations:Array<[IndicatorId,Record<string,unknown>]>=[
  ['sma',{length:9,source:'close'}],['sma',{length:1,source:'hl2',smoothingType:'SMA+BB',smoothingLength:5,smoothingMultiplier:2}],['sma',{length:20,source:'ohlc4',smoothingType:'WMA',smoothingLength:4,smoothingMultiplier:2}],
  ['ema',{length:9,source:'close'}],['ema',{length:50,source:'hlc3',smoothingType:'RMA',smoothingLength:14,smoothingMultiplier:2}],
  ['rsi',{length:14,source:'close'}],['rsi',{length:7,source:'open',smoothingType:'EMA',smoothingLength:3,smoothingMultiplier:2}],['rsi',{length:14,source:'close',divergence:true}],
  ['macd',{fast:12,slow:26,signal:9,source:'close',oscillatorType:'EMA',signalType:'EMA'}],['macd',{fast:5,slow:13,signal:4,source:'close',oscillatorType:'SMA',signalType:'SMA'}],
  ['volume',{length:20}],['volume',{length:10,maType:'EMA'}],['volume',{length:6,maType:'WMA'}],
  ['bb',{length:20,source:'close',multiplier:2,basisType:'SMA'}],['bb',{length:10,source:'close',multiplier:1.5,basisType:'WMA'}],['bb',{length:10,source:'close',multiplier:2,basisType:'VWMA'}],
  ['obv',{}],['obv',{smoothingType:'SMA',smoothingLength:9,smoothingMultiplier:2}],
  ['atr',{length:14,smoothing:'RMA'}],['atr',{length:5,smoothing:'WMA'}],['stochastic',{length:14,smoothK:3,smoothD:3}],
 ];
 /** One live step: replace the forming bar, revise the two newest, append, or a rarer change (gap, earlier revision, shrink). */
 function step(bars:Bar[],next:()=>number,index:number):Bar[]{
  const r=next(),last=bars.at(-1)!,repaired=(volume:number)=>Number.isFinite(volume)&&volume>=0?volume+1:1,move=(bar:Bar,amount:number)=>({...bar,close:bar.close+amount,high:Math.max(bar.high,bar.close+amount),low:Math.min(bar.low,bar.close+amount),volume:repaired(bar.volume)});
  if(r<0.5)return [...bars.slice(0,-1),move(last,(next()-0.5)/10)];
  if(r<0.65)return [...bars.slice(0,-2),move(bars.at(-2)!,0.01),move(last,-0.01)];
  if(r<0.85)return [...bars.slice(0,-1),{...last,volume:repaired(last.volume)-1},{time:last.time+60,open:last.close,high:last.close+0.1,low:last.close-0.1,close:last.close,volume:1}];
  if(r<0.89)return [...bars.slice(0,-1),{...last,volume:index%2?NaN:-5}];
  if(r<0.92)return [...bars.slice(0,-1),{...last,close:NaN}];
  if(r<0.95){const at=Math.floor(next()*(bars.length-5));const copy=bars.slice();copy[at]=move(copy[at],0.5);return copy;}
  if(r<0.97)return bars.slice(0,-3);
  return [...bars.slice(0,-1),{...last,close:-0,open:-0,high:0,low:-0}];
 }
 it('across 150 random live steps per configuration (fast path used)',()=>{
  for(const [kind,inputs] of configurations){
   const next=rng(kind.length*977+Object.keys(inputs).length*13),session=createIncrementalIndicatorSession();let bars=syntheticBars(260,kind.length+3),resumed=0;
   for(let index=0;index<150;index++){
    bars=step(bars,next,index);
    const fast=session.calculate(kind,bars,inputs,{resolution:'1',calendar:'us-equity'}),reference=calculateIndicator(kind,bars,inputs,{resolution:'1',calendar:'us-equity'});
    try{exactly(fast,reference);}catch(error){throw new Error(`${kind} ${JSON.stringify(inputs)} step ${index}: ${String(error)}`);}
    if(session.lastMode==='resume')resumed++;
   }
   const plainOnly=inputs.divergence===true||inputs.basisType==='VWMA';
   if(plainOnly)expect(resumed,kind).toBe(0);else expect(resumed,`${kind} ${JSON.stringify(inputs)}`).toBeGreaterThan(50);
  }
 });
 it('boundary cases: the checkpoint bar itself changes, a revised bar later reverts, appends after revisions',()=>{
  for(const [kind,inputs] of configurations){
   const session=createIncrementalIndicatorSession(),check=(bars:Bar[],label:string)=>{try{exactly(session.calculate(kind,bars,inputs),calculateIndicator(kind,bars,inputs));}catch(error){throw new Error(`${kind} ${JSON.stringify(inputs)} ${label}: ${String(error)}`);}};
   let bars=syntheticBars(200,11);check(bars,'seed');
   const original=bars.at(-2)!;
   bars=[...bars.slice(0,-2),{...original,close:original.close+3,high:original.high+3},bars.at(-1)!];check(bars,'revise n-2');
   bars=[...bars,{...bars.at(-1)!,time:bars.at(-1)!.time+60}];check(bars,'append 1');
   {const reverted=bars.slice();reverted[reverted.length-3]=original;check(reverted,'revert right after the append');check(bars,'revise again');}
   bars=[...bars,{...bars.at(-1)!,time:bars.at(-1)!.time+60}];check(bars,'append 2');
   const back=bars.slice();back[back.length-4]=original;check(back,'revert into the prefix');
   bars=back;const at=bars.length-3,moved=bars.slice();moved[at]={...moved[at],close:moved[at].close-1,low:moved[at].low-1};check(moved,'checkpoint bar changed');
   bars=moved;const before=bars.slice();before[at-1]={...before[at-1],open:before[at-1].open+1};check(before,'bar before the checkpoint changed');
   check(before.slice(0,-1),'one bar fewer');check(before.slice(0,-4),'four bars fewer');check(before,'grown back');
  }
 });
 it('returns fresh arrays and policies (a caller may push to them)',()=>{
  const session=createIncrementalIndicatorSession(),inputs={length:9,source:'close'};let bars=syntheticBars(300,9);
  session.calculate('sma',bars,inputs);bars=[...bars.slice(0,-1),{...bars.at(-1)!,close:1}];
  const first=session.calculate('sma',bars,inputs);expect(session.lastMode).toBe('resume');first.policies.push('caller note');(first.series[0].values as (number|null)[]).push(123);
  bars=[...bars.slice(0,-1),{...bars.at(-1)!,close:2}];exactly(session.calculate('sma',bars,inputs),calculateIndicator('sma',bars,inputs));
 });
 it('changed inputs, options, sources and catalog kinds always match the reference',()=>{
  const session=createIncrementalIndicatorSession(),bars=syntheticBars(300,4);
  for(const [kind,inputs,options] of [['sma',{length:9,source:'close'},{}],['sma',{length:10,source:'close'},{}],['sma',{length:10,source:'close'},{sourceValues:bars.map(row=>row.open)}],['sma',{length:-1,source:'close'},{}],['sma',{length:9,source:'nope'},{}],['ema',{length:9,source:'close',extra:1},{}],['sma',{length:9,source:'close'},{resolution:'5'}]] as const)
   exactly(session.calculate(kind as IndicatorId,bars,inputs as Record<string,unknown>,options as never),calculateIndicator(kind as IndicatorId,bars,inputs as Record<string,unknown>,options as never));
 });
});

describe(' native bar conversion memo',()=>{
 const fresh=(rows:readonly {time:number;open:number;high:number;low:number;close:number;volume?:number}[])=>rows.map(bar=>({...bar,time:bar.time/1000,volume:bar.volume??NaN}));
 it('equals a full conversion while the native array grows in place; earlier results never change',()=>{
  const native=syntheticBars(200,3).map(bar=>({...bar,time:bar.time*1000})) as Array<{time:number;open:number;high:number;low:number;close:number;volume?:number}>;
  const held:Array<[Bar[],string]>=[];const next=rng(5);
  for(let index=0;index<120;index++){
   const r=next();
   if(r<0.4)native[native.length-1]={...native.at(-1)!,close:r};
   else if(r<0.6)native.push({...native.at(-1)!,time:native.at(-1)!.time+60000});
   else if(r<0.7)native.at(-1)!.high=r;// in-place mutation of the same object
   else if(r<0.75)delete native.at(-1)!.volume;
   else if(r<0.8)native[10]={...native[10],open:-0};
   else if(r<0.85)native.length-=1;
   const converted=asDomainBars(native as never);exactly(converted,fresh(native));held.push([converted,JSON.stringify(converted)]);
  }
  for(const [rows,text] of held)expect(JSON.stringify(rows)).toBe(text);
  const extra=[...native.slice(0,5),{...native[5],note:'x'}] as never;exactly(asDomainBars(extra),fresh(extra));
  const tag=Symbol('tag'),tagged=[...native.slice(0,5),{...native[5],[tag]:1}];const first=asDomainBars(tagged as never);expect((first[5] as unknown as Record<symbol,unknown>)[tag]).toBe(1);
  (tagged[5] as unknown as Record<symbol,unknown>)[tag]=2;expect((asDomainBars(tagged as never)[5] as unknown as Record<symbol,unknown>)[tag]).toBe(2);
 });
});

describe(' plot point reuse',()=>{
 it('equals freshly built points on every tick, offsets and recolored plots included',()=>{
  let bars=syntheticBars(400,6);const next=rng(8);
  for(let index=0;index<60;index++){
   const r=next(),last=bars.at(-1)!;bars=r<0.5?[...bars.slice(0,-1),{...last,close:last.close+r}]:r<0.8?[...bars,{...last,time:last.time+60}]:r<0.9?bars.slice(0,-2):[...bars.slice(0,-1),{...last,time:last.time+1}];
   for(const [kind,inputs,offset] of [['sma',{length:9,source:'close'},0],['macd',{fast:12,slow:26,signal:9,source:'close',oscillatorType:'EMA',signalType:'EMA'},0],['volume',{length:20},0],['ema',{length:5,source:'close'},3],['ema',{length:5,source:'close'},-2]] as const){
    const result=calculateIndicator(kind,bars,inputs);
    const reused=renderIndicatorSeries('r27-'+kind+offset,kind,result,bars,{},offset),built=renderIndicatorSeries(`fresh-${index}-${kind}-${offset}`,kind,result,bars,{},offset);
    exactly(reused.map(row=>({...row,id:''})),built.map(row=>({...row,id:''})));
   }
  }
 });
});

describe(' plot point reuse through the full presentation (palettes recolor points in place)',()=>{
 it('equals a fresh presentation on every tick for Volume direction colors and the MACD histogram palette',()=>{
  let bars=syntheticBars(300,14);const next=rng(15);
  const rows:IndicatorInstanceSettings[]=[
   {id:'r27-volume',kind:'volume',inputs:{...indicatorDefaults.volume},plots:{},offset:0,visible:true,presentation:{...defaultIndicatorPresentation('volume'),volumePalette:{schemaVersion:1,mode:'previous-close',upColor:'#26a69a',downColor:'#ef5350'}}},
   {id:'r27-macd',kind:'macd',inputs:{...indicatorDefaults.macd},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('macd')},
   {id:'r27-sma',kind:'sma',inputs:{...indicatorDefaults.sma},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('sma')}];
  for(let index=0;index<50;index++){
   const r=next(),last=bars.at(-1)!;bars=r<0.4?[...bars.slice(0,-1),{...last,close:last.close+(r-0.2)*4}]:r<0.6?[...bars.slice(0,-1),{...last,close:NaN}]:r<0.9?[...bars,{...last,time:last.time+60,open:last.close}]:[...bars.slice(0,-1),{...last,open:NaN}];
   for(const row of rows){const result=calculateIndicator(row.kind,bars,row.inputs),reused=renderIndicatorPresentation(row,result,bars),built=renderIndicatorPresentation({...row,id:row.id+'-fresh-'+index},result,bars);
    const strip=(value:typeof reused)=>JSON.parse(JSON.stringify(value).split(row.id+'-fresh-'+index).join(row.id));exactly(strip(built),JSON.parse(JSON.stringify(reused)));}
  }
 });
});

describe(' session zones and breaks',()=>{
 // The pre-lane loops, verbatim, as the oracle.
 const zonesBefore=(bars:readonly {time:number}[],intervalMs:number)=>{
  const zones:{pre:[number,number][];post:[number,number][];extended:[number,number][]}={pre:[],post:[],extended:[]};let run:{phase:'pre'|'post';from:number;to:number}|null=null;
  const close=()=>{if(run)zones[run.phase].push([run.from,run.to]);run=null;};
  for(const row of bars){const open=row.time*1000,phase=Number.isFinite(open)?usSessionPhase(Math.floor(open/1000)):'overnight';
   if(phase!=='pre'&&phase!=='post'){close();continue;}
   const end=Math.min(open+intervalMs,usSessionSegment(row.time).end*1000);
   if(run&&run.phase===phase)run.to=end;else{close();run={phase,from:open,to:end};}}
  close();return zones;
 };
 const breaksBefore=(bars:readonly {time:number}[])=>{const out:number[]=[];let previous:string|null=null;for(const row of bars){if(!Number.isFinite(row.time))continue;const date=newYorkClock(row.time).date;if(previous!==null&&date!==previous)out.push(row.time*1000);previous=date;}return out;};
 it('equal the pre-lane computation while one array grows and changes in place',()=>{
  const start=Date.UTC(2026,2,6,9,0)/1000,bars=Array.from({length:3000},(_,index)=>({time:start+index*300}));const next=rng(12);
  for(let step=0;step<80;step++){
   const r=next();
   if(r<0.4)bars.push({time:bars.at(-1)!.time+300});else if(r<0.6)bars[bars.length-1]={time:bars.at(-1)!.time+1};else if(r<0.7){const at=Math.floor(next()*bars.length);bars[at].time+=Math.floor(next()*4)*21600+60;}else if(r<0.8)bars.length-=2;else if(r<0.85)bars[5]={time:NaN};else if(r<0.9)bars[5]={time:start+5*300};
   for(const interval of [60000,300000,3600000])exactly(sessionZonesFor(bars,interval),zonesBefore(bars,interval));
   exactly(sessionBreakTimes(bars),breaksBefore(bars));
  }
  const holes=[{time:start},{time:start+60}];delete (holes as unknown as Record<number,unknown>)[1];
  exactly(outcome(()=>sessionZonesFor(holes,60000)),outcome(()=>zonesBefore(holes,60000)));exactly(outcome(()=>sessionBreakTimes(holes)),outcome(()=>breaksBefore(holes)));
 });
});

describe(' script bar IDs',()=>{
 async function reference(identity:string,bars:readonly Bar[]):Promise<string[]>{
  const encoder=new TextEncoder();return Promise.all(bars.map(async(bar,index)=>{const digest=await webcrypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify([identity,index,bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume])));return 'b:'+Array.from(new Uint8Array(digest,0,16),value=>value.toString(16).padStart(2,'0')).join('');}));
 }
 it('are the same digests on first and repeated runs, per identity',async()=>{
  clearScriptBarIdCache();const bars=syntheticBars(300,2),identity=JSON.stringify(['synthetic','1',null,true,'["x\\u2028"]','SYNTHETIC','candles','run']);
  expect(await scriptBarIds(identity,bars)).toEqual(await reference(identity,bars));
  const ticked=[...bars.slice(0,-1),{...bars.at(-1)!,close:-0}];expect(await scriptBarIds(identity,ticked)).toEqual(await reference(identity,ticked));
  expect(await scriptBarIds('other',ticked)).toEqual(await reference('other',ticked));
  const odd=[{...bars[0],volume:NaN},{...bars[1],volume:undefined as unknown as number}];expect(await scriptBarIds(identity,odd)).toEqual(await reference(identity,odd));
  const sparse=[bars[0],bars[1],bars[2]];delete (sparse as unknown as Record<number,unknown>)[1];expect(await scriptBarIds(identity,sparse)).toEqual(await reference(identity,sparse));
  expect(await scriptBarIds(identity,[])).toEqual([]);
 });
});
