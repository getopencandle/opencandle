import {describe,expect,it,afterEach} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar,BarDataset} from '../../src/domain/types';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';
import {createDatasetRequestResolver,installScriptSymbolLoader,type ScriptRequestBase} from '../../src/ui/script-requests';
import {resolveScriptTimeframes} from '../../src/ui/script-series';
import {alertDatasetWithPrefix,alertSourceId,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {createLocalAlert,processAlertEvent,type AlertDefinition} from '../../src/domain/alerts';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {createTechnicalScriptEvaluator} from '../../src/ui/script-alert-evaluator';
import {scriptOutputs,scriptOutputEntry} from '../../src/ui/script-outputs';
import {sourceContextForDataset} from '../../src/chart/source-context';

// SCRIPT.RUNTIME.HISTORY, MTF, MULTISYMBOL and ALERTS through the real restricted worker. Every oracle below is
// computed independently from the SYNTHETIC fixture bars, not from the runtime or the planner. SYNTHETIC data only.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const HOUR=3600,DAY=86400,T0=Date.UTC(2026,0,1)/1000;
const synth=(time:number,i:number):Bar=>{const close=100+((i*37)%23)-(i%5);return {time,open:close-0.5,high:close+1+(i%3),low:close-1-(i%2),close,volume:10+i};};
function dataset(id:string,symbol:string,bars:Bar[],resolution:string,assetClass='crypto',timezone='UTC'):BarDataset{
 return {instrument:{id:'inst-'+symbol,symbol,name:'Synthetic '+symbol,exchange:'LV',currency:'USD',assetClass,tickSize:0.01,lotSize:1,timezone} as BarDataset['instrument'],bars,resolution,
  provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:id,fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
}
let jobs:any=null;
afterEach(()=>{jobs?.close();jobs=null;});
function harness(){jobs=new ScriptJobs();const bridge={executeScript:(value:any)=>jobs.run(value),cancel:async({requestId}:{requestId:string})=>({ok:true as const,value:{cancelled:jobs.cancel(requestId)}})} as any;return {bridge,queue:new ScriptJobQueue()};}
async function run(source:string,bars:readonly Bar[],request:{base:ScriptRequestBase;resolver?:any}|null){
 const {bridge,queue}=harness();
 return (await executeScriptOnBars({source,bars,identity:'synthetic-script-rt',fixture:true,signal:new AbortController().signal,bridge,queue,request})).result;
}
const plot=(result:any,title:string)=>result.plots.find((row:any)=>row.title===title).values.map((row:any)=>row.value);

describe('SCRIPT.RUNTIME.HISTORY',()=>{
 it('ctx.history(n, source) equals the independent n-bars-back oracle and never reaches a later bar',async()=>{
  const bars=Array.from({length:40},(_,i)=>synth(T0+i*HOUR,i));
  const result=await run(`({onBar(ctx){
   ctx.plot('c1',ctx.history(1,'close'));ctx.plot('h2',ctx.history(2,'hl2'));ctx.plot('o0',ctx.history(0,'ohlc4'));ctx.plot('c39',ctx.history(39,'close'));
   let latest=0;for(let n=0;n<=500;n++){const row=ctx.history(n);if(row&&row.time>latest)latest=row.time;}ctx.plot('latest',latest);
   ctx.plot('same',ctx.history(3)===null?null:(ctx.history(3).close===ctx.history(3,'close')?1:0));}})`,bars,null);
  const back=(n:number,f:(b:Bar)=>number)=>bars.map((_,i)=>i>=n?f(bars[i-n]):null);
  expect(plot(result,'c1')).toEqual(back(1,b=>b.close));
  expect(plot(result,'h2')).toEqual(back(2,b=>(b.high+b.low)/2));
  expect(plot(result,'o0')).toEqual(back(0,b=>(b.open+b.high+b.low+b.close)/4));
  expect(plot(result,'c39')).toEqual(back(39,b=>b.close));
  expect(plot(result,'latest')).toEqual(bars.map(b=>b.time));
  expect(plot(result,'same')).toEqual(bars.map((_,i)=>i>=3?1:null));
 },30000);
});

describe('SCRIPT.RUNTIME.MTF',()=>{
 const code=`({timeframes:{day:'1D'},onBar(ctx){const d=ctx.timeframe('day'),p=ctx.timeframe('day',1);ctx.plot('close',d?d.close:null);ctx.plot('high',d?d.high:null);ctx.plot('end',d?d.end:null);ctx.plot('prior',p?p.close:null);}})`;
 // Independent oracle: UTC day buckets; a day is readable once its end is at or before the chart bar end.
 function utcOracle(bars:readonly Bar[]){
  const days=new Map<number,Bar[]>();for(const bar of bars){const key=Math.floor(bar.time/DAY);days.set(key,[...(days.get(key)??[]),bar]);}
  const keys=[...days.keys()].sort((a,b)=>a-b);
  return bars.map(bar=>{const done=keys.filter(key=>(key+1)*DAY<=bar.time+HOUR);if(!done.length)return {close:null,high:null,end:null,prior:null};const last=days.get(done.at(-1)!)!,prior=done.length>1?days.get(done.at(-2)!)!.at(-1)!.close:null;return {close:last.at(-1)!.close,high:Math.max(...last.map(row=>row.high)),end:(done.at(-1)!+1)*DAY,prior};});
 }
 it('a completed UTC day is readable only from the bar that ends it, and earlier values never change when bars are added',async()=>{
  const bars=Array.from({length:72},(_,i)=>synth(T0+i*HOUR,i)).filter((_,i)=>i!==47);// a missing last hour of day 2
  const base={datasetId:'synthetic:SYN:1h',resolution:'1h'};
  const full=await run(code,bars,{base,resolver:null});
  const oracle=utcOracle(bars);
  for(const key of ['close','high','end','prior'] as const)expect(plot(full,key)).toEqual(oracle.map(row=>row[key]));
  // Day 1 appears on its 23:00 bar; day 2 lacks that bar and appears on the first bar of day 3, never earlier.
  expect(plot(full,'end')[22]).toBeNull();expect(plot(full,'end')[23]).toBe(T0+DAY);expect(plot(full,'end')[46]).toBe(T0+DAY);expect(plot(full,'end')[47]).toBe(T0+2*DAY);
  for(const length of [5,24,30,47,60]){const prefix=await run(code,bars.slice(0,length),{base,resolver:null});expect(plot(prefix,'close')).toEqual(plot(full,'close').slice(0,length));}
 },60000);
 it('a New York stock chart confirms the day at the regular close; the UTC policy would wait for the next session',async()=>{
  // 30-minute regular-session bars 09:30..15:30 New York (EDT, UTC-4) on Mon 19 to Wed 21 October 2026.
  const bars:Bar[]=[];[19,20,21].forEach(day=>{for(let slot=0;slot<13;slot++)bars.push(synth(Date.UTC(2026,9,day,13,30)/1000+slot*1800,bars.length));});
  const chart=dataset('synthetic:NYS:30m','NYS',bars,'30m','stock','America/New_York'),resolver=createDatasetRequestResolver({datasets:[chart],load:null});
  expect(resolver.calendarFor!({datasetId:chart.provenance.datasetId,resolution:'30m'})).toBe('us-equity');
  const result=await run(code,bars,{base:{datasetId:chart.provenance.datasetId,resolution:'30m'},resolver});
  const dayClose=(day:number)=>bars[day*13+12].close;
  const expected=bars.map((_,i)=>{const day=Math.floor(i/13),slot=i%13,done=day+(slot===12?1:0);return done?dayClose(done-1):null;});
  expect(plot(result,'close')).toEqual(expected);
  expect(plot(result,'end')[12]).toBe(Date.UTC(2026,9,19,20,0)/1000);// 16:00 New York
  const utc=resolveScriptTimeframes([{id:'day',interval:'1D'}],bars,'30m','utc').feeds.day.visible;
  expect(utc[12]).toBe(0);expect(utc[13]).toBe(1);
 },30000);
 it('refuses a lower or event timeframe, a chart without an interval and a run without a chart',async()=>{
  const bars=Array.from({length:4},(_,i)=>synth(T0+i*HOUR,i));
  await expect(run(`({timeframes:{m:'5m'},onBar(ctx){ctx.timeframe('m');}})`,bars,{base:{datasetId:'x',resolution:'1h'},resolver:null})).rejects.toThrow('lower than the chart interval');
  await expect(run(`({timeframes:{t:'100T'},onBar(ctx){}})`,bars,{base:{datasetId:'x',resolution:'1h'},resolver:null})).rejects.toThrow(/Timeframe t/);
  await expect(run(code,bars,{base:{datasetId:'x',resolution:null},resolver:null})).rejects.toThrow('no time interval');
  await expect(run(code,bars,null)).rejects.toThrow('need a chart');
 },30000);
});

describe('SCRIPT.RUNTIME.MULTISYMBOL',()=>{
 afterEach(()=>installScriptSymbolLoader(()=>{throw new Error('unused');})());
 it('reads another loaded symbol aligned to the chart bar end, and never opens a feed for a missing one',async()=>{
  const chartBars=Array.from({length:12},(_,i)=>synth(T0+i*60,i)),peerBars=Array.from({length:12},(_,i)=>synth(T0+i*60,i+100)).filter((_,i)=>i!==5);
  const chart=dataset('synthetic:SYN:1m','SYN',chartBars,'1m'),peer=dataset('synthetic:PEER:1m','PEER',peerBars,'1m');
  const loads:string[]=[];const restore=installScriptSymbolLoader(symbol=>{loads.push(symbol);return {state:'loading',message:symbol+' is loading.',dataset:null};});
  try{
   const resolver=createDatasetRequestResolver({datasets:[chart,peer]}),base={datasetId:chart.provenance.datasetId,resolution:'1m'};
   const result=await run(`({symbols:{peer:'PEER'},onBar(ctx){const a=ctx.symbol('peer'),b=ctx.symbol('peer',1);ctx.plot('now',a?a.close:null);ctx.plot('time',a?a.time:null);ctx.plot('back',b?b.close:null);}})`,chartBars,{base,resolver});
   // Oracle: the latest peer bar whose minute ended by the end of the chart minute.
   const latest=(i:number,n:number)=>{const done=peerBars.filter(row=>row.time+60<=chartBars[i].time+60);return done.length>n?done[done.length-1-n]:null;};
   expect(plot(result,'now')).toEqual(chartBars.map((_,i)=>latest(i,0)?.close??null));
   expect(plot(result,'back')).toEqual(chartBars.map((_,i)=>latest(i,1)?.close??null));
   expect(plot(result,'time')).toEqual(chartBars.map((_,i)=>latest(i,0)?.time??null));
   expect(plot(result,'time').every((time:number|null,i:number)=>time===null||time<=chartBars[i].time)).toBe(true);
   await expect(run(`({symbols:{gone:'MISSING'},onBar(ctx){}})`,chartBars,{base,resolver})).rejects.toThrow('No loaded data for MISSING');
   expect(loads).toEqual([]);
  }finally{restore();}
 },30000);
});

describe('SCRIPT.RUNTIME.ALERTS',()=>{
 const bars:Bar[]=[10,12,9,14,15,11].map((close,i)=>({time:1_700_000_000+i*60,open:close,high:close+1,low:close-1,close,volume:1}));
 const chart=dataset('synthetic:SYN:1m','SYN',bars,'1m','stock','UTC');
 const code=`({conditions:{'Above prior bar high':'Close above the previous completed bar high','Never set':'Not evaluated'},onBar(ctx){const p=ctx.history(1);ctx.alertcondition('Above prior bar high',p!==null&&ctx.bar.close>p.high);}})`;
 it('declared conditions are listed in declared order; one never set stays unavailable, and a different message is refused',async()=>{
  const result=await run(code,bars,null);
  expect(result.conditions!.map(row=>[row.title,row.message])).toEqual([['Above prior bar high','Close above the previous completed bar high'],['Never set','Not evaluated']]);
  expect(result.conditions![0].values.map(row=>row.value)).toEqual([0,1,0,1,0,0]);expect(result.conditions![1].values).toEqual([]);
  await expect(run(`({conditions:{c:'declared'},onBar(ctx){ctx.alertcondition('c',true,'other');}})`,bars,null)).rejects.toThrow('declared with another message');
  await expect(run(`({conditions:{c:5},onBar(ctx){}})`,bars,null)).rejects.toThrow('needs a message');
  const port={},view={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(chart,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',indicators:{serialize:()=>[]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:port} as any;
  scriptOutputs.publish(port,scriptOutputEntry({bindingId:'binding-rt',title:'Breakout',source:code,result}));
  try{
   const rows=new TechnicalAlertCatalog((()=>{let n=0;return()=>'snapshot-'+(++n);})()).capture(view,chart,bars,[]).filter(row=>row.id.startsWith('script:'));
   expect(rows.map(row=>row.label)).toEqual(['Script Breakout: condition "Above prior bar high"','Script Breakout: condition "Never set"']);
  }finally{scriptOutputs.clear(port);}
 },30000);
 it('a declared condition fires through the ordinary alert observation, honouring its only-once frequency',async()=>{
  const {bridge,queue}=harness(),evaluator=createTechnicalScriptEvaluator({dataset:chart,execute:input=>executeScriptOnBars({...input,bridge,queue})});
  const source:AlertSourceSnapshot={kind:'script',instanceId:'binding-rt',snapshotId:'snap-rt',title:'Breakout',source:code,inputs:{},output:'condition',outputId:'Above prior bar high',transformId:'standard'};
  const observer=new TechnicalAlertObserver(()=>'synthetic-session',()=>Promise.resolve());
  let alert:ReturnType<typeof createLocalAlert>|null=null;const fired:number[]=[];
  for(let end=1;end<=bars.length;end++){
   const prefix=bars.slice(0,end),observed=await observer.observe({dataset:alertDatasetWithPrefix(chart,prefix),bars:prefix,chartId:'chart-rt',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:alert?[alert]:[],script:evaluator},1_800_000_000+end);
   expect(observed.diagnostics).toEqual([]);
   if(!alert){const binding=observed.selectedContext!.binding,definition:AlertDefinition={id:'alert-rt',instrumentId:chart.instrument.id,sourceId:alertSourceId(source),name:'Breakout',message:'Above prior bar high',condition:{kind:'crossing-up',value:0.5},frequency:'only-once',createdAt:1_700_000_000,expiresAt:null,mode:'ordinary',runId:'ordinary:snapshot:'+binding.sessionId,observationBinding:binding,conditionVersion:2};alert=createLocalAlert(definition);}
   for(const event of observed.events){const next=processAlertEvent(alert!,event);alert=next.alert;if(next.notification)fired.push(end);}
  }
  // closes 10,12,9,14,15,11 with highs 11,13,10,15,16,12: above the prior high on bars 2 and 4 (15 is not above 15).
  // The condition crosses up on bars 2 and 4; an only-once alert notifies on bar 2 and then stops.
  expect(fired).toEqual([2]);expect(alert!.status).toBe('stopped');
 },30000);
});
