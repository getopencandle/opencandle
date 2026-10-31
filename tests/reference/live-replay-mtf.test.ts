/**
 * GUARDRAIL 2b-2f: the right data at the right time on the live, replay, multi-timeframe, session and interval-switch
 * paths. Every comparison is against a fresh calculateIndicator on exactly the bars the path may know.
 *
 *  b. Live / incremental: the chart's incremental session (shared, sealed, as src/chart/indicator-port.ts creates it)
 *     fed bar by bar with intrabar ticks (same timestamp, changing high/low/close/volume), in-place mutation, a revised
 *     closed bar and replay-style step-backs equals the full calculation at EVERY step (Object.is per value).
 *  c. Replay: the replay frame reveals exactly the bars closed by the clock, the forming bar aggregates only revealed
 *     step bars, and indicators on the frame equal the full-series values (no bar > t is used).
 *  d. MTF: higher-timeframe values appear only on the chart bar where the HTF bar is confirmed (closed), hold until the
 *     next confirmation, equal the indicator on the right HTF bar (no off-by-one), never change when later bars arrive,
 *     and wait-for-close off changes only the newest bar (the documented developing value).
 *  e. Session: VWAP, TWAP and the pivots reset on the New York trading date for US equities (pre/post-market count toward
 *     their date, across the 2024-11-03 DST change) and on the UTC day for 24/7 crypto.
 *  f. Interval switch: switching interval and back gives identical values (also through the shared session pool).
 */
import {beforeEach,describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorResult} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession,clearIncrementalSessionPool,type IncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import {replayChartFrame} from '../../src/domain/replay-session';
import {planHigherTimeframe} from '../../src/domain/indicator-resample';
import {evaluateIndicatorOnTimeframe} from '../../src/chart/indicator-timeframe';
import {resolveIntervalSwitch} from '../../src/domain/interval-switch';
import {newYorkClock} from '../../src/domain/us-market-hours';
import type {Bar} from '../../src/domain/types';
import {ALL_IDS,BARS,EXPECTED,defaultInputs,definitionOf,firstMismatch,firstExactDifference,describeMismatch,finite} from './harness';
import {optionsFor,datasetOf,finerBars} from './context';
import {REPAINT_EXEMPT,HEADLESS_UNAVAILABLE} from './exemptions';

export const KNOWN_FAILURES:Record<string,string>={
};
/** Kinds left out of the all-kinds MTF run because of an open finding (each also fails its own guardrail elsewhere). */
const MTF_OPEN_FINDINGS:Record<string,string>={};
const flagged=(key:string,title:string)=>{const finding=KNOWN_FAILURES[key];return {run:finding?it.fails:it,title:title+(finding?' [known failure '+finding+']':'')};};
const causal=ALL_IDS.filter(id=>!REPAINT_EXEMPT[id]&&!HEADLESS_UNAVAILABLE[id]);
const sameResult=(actual:IndicatorResult,expected:IndicatorResult,where:string)=>{
 expect(actual.diagnostics,where+' diagnostics').toEqual(expected.diagnostics);
 expect(actual.series.map(row=>row.id+':'+row.label),where+' plots').toEqual(expected.series.map(row=>row.id+':'+row.label));
 for(const [index,row] of expected.series.entries()){const diff=firstExactDifference(actual.series[index].values,row.values);expect(diff,`${where} ${row.id}: ${describeMismatch(diff)}`).toBeNull();}
};
const copy=(rows:readonly Bar[])=>rows.map(bar=>({...bar}));

// ------------------------------------------------------------------------------------------------- b. live
/** The live tick sequence: each new bar arrives as three intrabar updates of the same timestamp, then closes. */
function* liveTicks(source:readonly Bar[],start:number,end:number):Generator<{bars:Bar[];note:string}>{
 const bars=copy(source.slice(0,start));
 for(let i=start;i<end;i++){
  const final=source[i],open=final.open;
  bars.push({time:final.time,open,high:open,low:open,close:open,volume:0});yield {bars:copy(bars),note:`bar ${i} opens`};
  const mid=(final.high+final.low)/2;bars[i]={time:final.time,open,high:Math.max(open,mid,final.high*0.999+open*0.001),low:Math.min(open,mid),close:mid,volume:final.volume/2};yield {bars:copy(bars),note:`bar ${i} tick`};
  bars[i]={...final};yield {bars:copy(bars),note:`bar ${i} final`};
  if(i%25===0&&i>start){bars[i-1]={...bars[i-1],close:bars[i-1].close+0.01,high:Math.max(bars[i-1].high,bars[i-1].close+0.01)};yield {bars:copy(bars),note:`bar ${i-1} revised`};}
 }
}
const LIVE_VARIANTS:Record<string,Record<string,unknown>[]>={
 sma:[{length:9},{length:20,source:'hl2'}],ema:[{length:9},{length:21,source:'ohlc4'}],rsi:[{length:14},{length:2}],macd:[{fast:12,slow:26,signal:9},{fast:5,slow:35,signal:5,oscillatorType:'SMA',signalType:'SMA'}],
 bb:[{length:20,multiplier:2},{length:10,multiplier:1.5,basisType:'EMA'}],atr:[{length:14},{length:5,smoothing:'EMA'},{length:7,smoothing:'WMA'}],stochastic:[{length:14,smoothK:3,smoothD:3},{length:14,smoothK:1,smoothD:3}],
 obv:[{}],volume:[{length:20},{length:10,maType:'EMA'}],
};
describe('guardrail 2b: live / incremental equals full recompute at every tick',()=>{
 beforeEach(()=>clearIncrementalSessionPool());
 for(const [kind,variants] of Object.entries(LIVE_VARIANTS))for(const inputs of variants){
  const {run,title}=flagged(`2b:${kind}:${JSON.stringify(inputs)}`,`${kind} ${JSON.stringify(inputs)} (incremental pipeline)`);
  run(title,()=>{
   for(const series of [BARS.daily,BARS.dailyEdge]){
    const session=createIncrementalIndicatorSession({shared:true,sealed:true}),all={...defaultInputs(kind),...inputs},modes=new Set<string>();
    for(const {bars,note} of liveTicks(series,64,series.length)){
     const live=session.calculate(kind as never,bars,all,{resolution:'1D',calendar:'utc'});modes.add(session.lastMode);
     sameResult(live,calculateIndicator(kind,bars,all,{resolution:'1D',calendar:'utc'}),`${kind} ${note}`);
    }
    // Replay step-back: shorter prefixes of the recorded bars, then forward again.
    for(const count of [250,200,120,64,180,series.length]){const bars=copy(series.slice(0,count));sameResult(session.calculate(kind as never,bars,all,{resolution:'1D',calendar:'utc'}),calculateIndicator(kind,bars,all,{resolution:'1D',calendar:'utc'}),`${kind} step to ${count}`);}
    if(series===BARS.daily)expect([...modes],'the incremental path was actually exercised').toContain('resume');
   }
  });
 }
 it('in-place mutation of the forming bar (same array and objects) is seen',()=>{
  const session=createIncrementalIndicatorSession({shared:true,sealed:true}),bars=copy(BARS.daily.slice(0,100));
  for(const kind of Object.keys(LIVE_VARIANTS)){
   const inputs=defaultInputs(kind);session.calculate(kind as never,bars,inputs,{resolution:'1D'});
   for(const close of [bars[99].close+1,bars[99].close-2,bars[99].close]){bars[99].close=close;bars[99].high=Math.max(bars[99].high,close);bars[99].low=Math.min(bars[99].low,close);bars[99].volume+=10;
    sameResult(session.calculate(kind as never,bars,inputs,{resolution:'1D'}),calculateIndicator(kind,bars,inputs,{resolution:'1D'}),`${kind} in-place ${close}`);}
  }
 });
 for(const id of causal.filter(id=>!LIVE_VARIANTS[id])){
  const {run,title}=flagged('2b:'+id,`${id} (session falls back to the full calculation)`);
  run(title,()=>{
   const session:IncrementalIndicatorSession=createIncrementalIndicatorSession({shared:true,sealed:true}),inputs=defaultInputs(id);
   for(const {bars,note} of liveTicks(BARS.dailyEdge,286,BARS.dailyEdge.length)){
    sameResult(session.calculate(id as never,bars,inputs,optionsFor(id,bars)),calculateIndicator(id,bars,inputs,optionsFor(id,bars)),`${id} ${note}`);
   }
  });
 }
});

// ------------------------------------------------------------------------------------------------ c. replay
describe('guardrail 2c: replay never reveals or uses bars after the clock',()=>{
 const daily=BARS.dailyEdge,dataset=datasetOf(daily,'1D'),fine=datasetOf(finerBars(daily),'360m',{id:'reference-6h'});
 it('the frame holds exactly the bars closed by the clock',()=>{
  for(let t=0;t<daily.length;t+=7){
   const closeTime=daily[t].time+86400;
   expect(replayChartFrame(dataset,closeTime).bars).toEqual(daily.slice(0,t+1));
   expect(replayChartFrame(dataset,closeTime-1).bars,'a bar is not revealed before its close').toEqual(daily.slice(0,t));
  }
 });
 it('the forming bar aggregates only the revealed step bars',()=>{
  for(let t=10;t<daily.length;t+=13)for(const steps of [1,2,3]){
   const clock=daily[t].time+steps*21600,frame=replayChartFrame(dataset,clock,fine),revealed=fine.bars.filter(bar=>bar.time>=daily[t].time&&bar.time+21600<=clock);
   expect(frame.partial).toBe(true);expect(frame.bars.slice(0,-1)).toEqual(daily.slice(0,t));
   const forming=frame.bars.at(-1)!;
   expect(forming).toEqual({time:daily[t].time,open:revealed[0].open,high:Math.max(...revealed.map(bar=>bar.high)),low:Math.min(...revealed.map(bar=>bar.low)),close:revealed.at(-1)!.close,volume:revealed.reduce((sum,bar)=>sum+bar.volume,0)});
  }
 });
 const {run,title}=flagged('2c:all','every causal kind on replay frames equals the full-series values');
 run(title,()=>{
  const full=new Map(causal.map(id=>[id,calculateIndicator(id,daily,defaultInputs(id),optionsFor(id,daily))]));
  for(const t of [40,121,139,150,199,260,299]){
   const frame=replayChartFrame(dataset,daily[t].time+86400).bars;
   for(const id of causal){
    const result=calculateIndicator(id,frame,defaultInputs(id),optionsFor(id,frame));
    for(const row of result.series){const reference=full.get(id)!.series.find(item=>item.id===row.id)!.values.slice(0,t+1);const m=firstMismatch(row.values,reference,0,1e-9);expect(m,`${id}.${row.id} at replay bar ${t}: ${describeMismatch(m,daily)}`).toBeNull();}
   }
  }
 },120000);
});

// --------------------------------------------------------------------------------------------------- d. MTF
interface MtfCase {name:string;bars:readonly Bar[];chart:string;target:string;calendar:'utc'|'us-equity';expectConfirm:(bars:readonly Bar[],last:number,next:number|null)=>number|null}
const evaluate=(id:string,bars:readonly Bar[],c:MtfCase,wait:boolean)=>evaluateIndicatorOnTimeframe({kind:id,inputs:defaultInputs(id),presentation:{timeframe:{schemaVersion:1,interval:c.target,waitForClose:wait}}},c.chart,bars,bars,rows=>rows.map(row=>({...row})),htf=>calculateIndicator(id,htf,defaultInputs(id),optionsFor(id,htf,c.target,c.calendar)),undefined,c.calendar);
const NY=(time:number)=>newYorkClock(time);
const MTF:MtfCase[]=[
 // A weekday-only daily chart on the UTC policy: a week ends Monday 00:00 UTC, so the Friday bar does not reach it and the
 // week is confirmed on the next Monday bar (documented slice approximation in INDICATOR_TIMEFRAME_POLICIES).
 {name:'1D -> 1W, UTC policy',bars:BARS.dailyEdge,chart:'1D',target:'1W',calendar:'utc',expectConfirm:(_b,_last,next)=>next},
 // The same chart on the New York calendar: the week is confirmed on its last trading day (Friday close).
 {name:'1D -> 1W, us-equity',bars:BARS.dailyEdge,chart:'1D',target:'1W',calendar:'us-equity',expectConfirm:(_b,last)=>last},
 // Extended-hours 30m bars: a day is confirmed on the bar that reaches the 20:00 after-hours close.
 {name:'30m -> 1D, us-equity extended hours',bars:BARS.us30m,chart:'30m',target:'1D',calendar:'us-equity',expectConfirm:(bars,last)=>NY(bars[last].time).minutes===19*60+30?last:null},
 // 24/7 1h bars: a 4h bucket is confirmed on its fourth bar.
 {name:'60m -> 240m, crypto UTC',bars:BARS.crypto1h,chart:'60m',target:'240m',calendar:'utc',expectConfirm:(bars,last)=>(bars[last].time+3600)%14400===0?last:null},
];
describe('guardrail 2d: multi-timeframe values appear when the HTF bar closes, on the right bars',()=>{
 for(const c of MTF){
  it(`${c.name}: confirmation bars follow the calendar`,()=>{
   const planned=planHigherTimeframe(c.bars,c.chart,c.target,{calendar:c.calendar});expect(planned.ok).toBe(true);if(!planned.ok)return;
   const plan=planned.plan;
   plan.buckets.forEach((bucket,j)=>{
    const next=j+1<plan.buckets.length?plan.buckets[j+1].first:null,expected=c.expectConfirm(c.bars,bucket.last,next);
    expect(plan.confirmedAt[j],`bucket ${j} (${new Date(bucket.start*1000).toISOString()})`).toBe(expected);
    if(plan.confirmedAt[j]!==null)expect(plan.confirmedAt[j]!,'never confirmed before its last bar').toBeGreaterThanOrEqual(bucket.last);
   });
   // The HTF bars are the aggregate of their chart bars.
   plan.buckets.forEach((bucket,j)=>{const rows=c.bars.slice(bucket.first,bucket.last+1),bar=plan.bars[j];
    expect([bar.open,bar.high,bar.low,bar.close]).toEqual([rows[0].open,Math.max(...rows.map(r=>r.high)),Math.min(...rows.map(r=>r.low)),rows.at(-1)!.close]);});
   if(c.calendar==='us-equity'&&c.chart==='30m')plan.buckets.forEach(bucket=>{const dates=new Set(c.bars.slice(bucket.first,bucket.last+1).map(bar=>NY(bar.time).date));expect(dates.size,'one New York trading date per daily bucket').toBe(1);});
  });
  const {run,title}=flagged('2d:'+c.name,`${c.name}: every causal kind, aligned values are final and from the confirmed HTF bar`);
  run(title,()=>{
   const planned=planHigherTimeframe(c.bars,c.chart,c.target,{calendar:c.calendar});if(!planned.ok)throw new Error(planned.message);const plan=planned.plan;
   const failures:string[]=[];
   for(const id of causal){
    if(definitionOf(id)?.secondSymbol||definitionOf(id)?.finerBars||MTF_OPEN_FINDINGS[id])continue;// their HTF context is chart-supplied (not modelled here)
    const full=evaluate(id,c.bars,c,true);if(full.diagnostics.length&&!full.series.length)continue;
    const htf=calculateIndicator(id,plan.bars,defaultInputs(id),optionsFor(id,plan.bars,c.target,c.calendar));
    for(const row of full.series){
     const htfValues=htf.series.find(item=>item.id===row.id)!.values;let held:number|null=null,bucket=-1;
     for(let t=0;t<c.bars.length;t++){
      const confirmed=plan.confirmedAt.indexOf(t);if(confirmed>=0){bucket=confirmed;held=htfValues[confirmed];}
      const expected=bucket<0?null:held;
      if(!(row.values[t]===expected||finite(row.values[t])&&finite(expected)&&Math.abs(row.values[t]!-expected!)<=1e-9*Math.max(1,Math.abs(expected!)))){failures.push(`${id}.${row.id} bar ${t}: ${row.values[t]} vs HTF bucket ${bucket} value ${expected}`);break;}
     }
    }
    // Later bars never change an aligned value (waitForClose on).
    for(const t of [Math.floor(c.bars.length/3),Math.floor(c.bars.length/2),c.bars.length-40]){
     const prefix=evaluate(id,c.bars.slice(0,t+1),c,true);
     for(const row of prefix.series){const m=firstMismatch(row.values,full.series.find(item=>item.id===row.id)!.values.slice(0,t+1),0,1e-9);if(m){failures.push(`${id}.${row.id} changed after later bars: prefix ${t} ${describeMismatch(m)}`);break;}}
     // Wait-for-close off: only the newest bar may differ, and it is the developing HTF value.
     const live=evaluate(id,c.bars.slice(0,t+1),c,false);
     for(const row of live.series){const waited=prefix.series.find(item=>item.id===row.id)!.values;const m=firstMismatch(row.values.slice(0,t),waited.slice(0,t),0,1e-9);if(m){failures.push(`${id}.${row.id} wait-off differs before the newest bar: ${describeMismatch(m)}`);break;}}
    }
   }
   expect(failures).toEqual([]);
  },300000);
 }
 it('a forming (unclosed) last chart bar never confirms its HTF bar (completeRows)',()=>{
  const bars=BARS.crypto1h.slice(0,24),complete=planHigherTimeframe(bars,'60m','240m',{calendar:'utc'}),forming=planHigherTimeframe(bars,'60m','240m',{calendar:'utc',completeRows:bars.length-1} as never);
  if(!complete.ok||!forming.ok)throw new Error('plan');
  expect(complete.plan.confirmedAt.at(-1)).toBe(23);
  expect(forming.plan.confirmedAt.at(-1),'the bucket whose last row is still forming stays developing').toBeNull();
  expect(forming.plan.developing).toBe(true);
 });
});

// ----------------------------------------------------------------------------------------------- e. session
const nyDate=(time:number)=>NY(time).date,utcDate=(time:number)=>new Date(time*1000).toISOString().slice(0,10);
const regular=(time:number)=>{const m=NY(time).minutes;return m>=570&&m<960;};
describe('guardrail 2e: session-anchored kinds reset at the right boundary',()=>{
 for(const c of EXPECTED.vwap){
  const bars=BARS[c.series],us=c.series==='us30m',options={resolution:us?'30m':'60m',calendar:(us?'us-equity':'utc') as 'us-equity'|'utc',exchangeZone:us?'America/New_York':'Etc/UTC'};
  it(`${c.id}: VWAP with the explicit zone matches the reference`,()=>{
   const result=calculateIndicator('vwap',bars,{...defaultInputs('vwap'),...c.inputs},options);
   const m=firstMismatch(result.series[0].values,c.plots.vwap,0,1e-9);expect(m,c.cite+' '+describeMismatch(m,bars)).toBeNull();
  });
  const {run,title}=flagged('2e:vwap-default:'+c.series,`${c.id}: a new VWAP (app defaults) resets at the ${us?'New York trading date':'UTC day'}`);
  run(title,()=>{
   const result=calculateIndicator('vwap',bars,defaultInputs('vwap'),options);expect(result.diagnostics).toEqual([]);
   const m=firstMismatch(result.series[0].values,c.plots.vwap,0,1e-9);expect(m,c.cite+' '+describeMismatch(m,bars)).toBeNull();
  });
 }
 it('a saved VWAP with the legacy UTC zone on US extended-hours data splits the session at 00:00 UTC (documents the legacy behavior)',()=>{
  const bars=BARS.us30m,result=calculateIndicator('vwap',bars,{anchor:'Session',timezone:'UTC',source:'hlc3'},{resolution:'30m',calendar:'us-equity'}),expected=EXPECTED.vwap.find(row=>row.series==='us30m')!.plots.vwap;
  const m=firstMismatch(result.series[0].values,expected,0,1e-9);expect(m).not.toBeNull();
  expect(Math.floor(NY(bars[m!.index].time).minutes/60),'the first wrong bar is the 19:00 New York post-market bar after the DST change (00:00 UTC)').toBe(19);
 });
 for(const series of ['us30m','crypto1h'] as const){
  const bars=BARS[series],us=series==='us30m',day=us?nyDate:utcDate,options={resolution:us?'30m':'60m',calendar:(us?'us-equity':'utc') as 'us-equity'|'utc',exchangeZone:us?'America/New_York':'Etc/UTC'};
  it(`${series}: TWAP (anchor 1D) is the mean of ohlc4 over the ${us?'New York trading date':'UTC day'} so far`,()=>{
   const result=calculateIndicator('twap',bars,defaultInputs('twap'),options);let key='',sum=0,count=0;
   const expected=bars.map(bar=>{if(day(bar.time)!==key){key=day(bar.time);sum=0;count=0;}sum+=(bar.open+bar.high+bar.low+bar.close)/4;count++;return sum/count;});
   const m=firstMismatch(result.series[0].values,expected,0,1e-9);expect(m,describeMismatch(m,bars)).toBeNull();
  });
  // pivots: on US intraday bars only regular-session bars set the period OHLC (its policy). Since 0.8.1 (R4) rbintrapivots
  // follows the same regular-session rule, so on US data only 'rbintrapivots-regular' applies; UTC data counts every bar.
  for(const [kind,regularOnly,label] of [['pivots',true,'pivots'],['rbintrapivots',false,'rbintrapivots'],['rbintrapivots',true,'rbintrapivots-regular']] as const){
   if(!us&&label==='rbintrapivots-regular'||us&&label==='rbintrapivots')continue;
   const {run,title}=flagged(`2e:${label}:${series}`,`${series}: ${kind} P = (H + L + C) / 3 of the prior ${us?(regularOnly?'regular session':'New York trading date, all bars'):'UTC day'}, constant over the period`);
   run(title,()=>{
    const inputs={...defaultInputs(kind),...(kind==='pivots'?{timeframe:'Daily'}:{})},result=calculateIndicator(kind,bars,inputs,options);expect(result.diagnostics).toEqual([]);
    const p=result.series.find(row=>row.id==='p')!.values,days=[...new Set(bars.map(bar=>day(bar.time)))],agg=new Map<string,{h:number;l:number;c:number}>();
    for(const bar of bars){if(us&&regularOnly&&!regular(bar.time))continue;const k=day(bar.time),row=agg.get(k);agg.set(k,row?{h:Math.max(row.h,bar.high),l:Math.min(row.l,bar.low),c:bar.close}:{h:bar.high,l:bar.low,c:bar.close});}
    const problems:string[]=[];
    bars.forEach((bar,i)=>{const at=days.indexOf(day(bar.time)),prior=at>0?agg.get(days[at-1]):undefined,expected=prior?(prior.h+prior.l+prior.c)/3:null;
     if(!(p[i]===expected||finite(p[i])&&finite(expected)&&Math.abs(p[i]!-expected!)<1e-9*expected!))problems.push(`bar ${i} ${new Date(bar.time*1000).toISOString()}: ${p[i]} vs ${expected}`);});
    expect(problems.slice(0,3)).toEqual([]);
   });
  }
 }
});

// ------------------------------------------------------------------------------------------ f. interval switch
describe('guardrail 2f: switching interval and back gives identical values',()=>{
 const base=datasetOf(BARS.us30m,'30m',{timezone:'America/New_York',exchange:'NASDAQ'});
 it('the local aggregation is deterministic and switching back returns the original bars',()=>{
  const up=resolveIntervalSwitch([base],base,'60m'),again=resolveIntervalSwitch([base],base,'60m'),back=resolveIntervalSwitch([base],base,'30m');
  expect(up.ok&&again.ok&&back.ok).toBe(true);if(!up.ok||!again.ok||!back.ok||up.kind!=='local'||again.kind!=='local'||back.kind!=='local')return;
  expect(again.result.dataset.bars).toEqual(up.result.dataset.bars);expect(back.result.dataset.bars).toEqual(base.bars);
 });
 const {run,title}=flagged('2f:all','every causal kind: 30m -> 60m -> 30m through one shared session per instance and the pool');
 run(title,()=>{
  const up=resolveIntervalSwitch([base],base,'60m'),back=resolveIntervalSwitch([base],base,'30m');if(!up.ok||!back.ok||up.kind!=='local'||back.kind!=='local')throw new Error('switch');
  clearIncrementalSessionPool();
  for(const id of causal){
   const session=createIncrementalIndicatorSession({shared:true,sealed:true}),inputs=defaultInputs(id),o30=optionsFor(id,base.bars,'30m','us-equity'),bars60=up.result.dataset.bars,o60=optionsFor(id,bars60,'60m','us-equity');
   const first=session.calculate(id as never,base.bars,inputs,o30),mid=session.calculate(id as never,bars60,inputs,o60),last=session.calculate(id as never,back.result.dataset.bars,inputs,o30);
   sameResult(first,calculateIndicator(id,base.bars,inputs,o30),id+' 30m');sameResult(mid,calculateIndicator(id,bars60,inputs,o60),id+' 60m');sameResult(last,first,id+' back to 30m');
   // A second chart instance adopting from the pool sees the same values.
   sameResult(createIncrementalIndicatorSession({shared:true,sealed:true}).calculate(id as never,back.result.dataset.bars,inputs,o30),first,id+' adopted');
  }
 },300000);
});
