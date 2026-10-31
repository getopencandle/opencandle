import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar,BarDataset} from '../../src/domain/types';
import {alignScriptRequest,createDatasetRequestResolver,resolveScriptRequests,scriptRequestBase,type ScriptRequestResolver} from '../../src/ui/script-requests';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';

// Other symbols and intervals for LVScript. SYNTHETIC fixture datasets only; nothing is fetched.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const H=3600,D=86400,T0=D*20000;// 2024-10-04 00:00 UTC, a whole UTC day
const bar=(time:number,close:number,volume=1):Bar=>({time,open:close,high:close+1,low:close-1,close,volume});
function dataset(symbol:string,resolution:string,bars:Bar[],datasetId=symbol+':'+resolution,providerId='synthetic-provider'):BarDataset{
 return{instrument:{id:'inst-'+symbol,symbol,name:symbol+' synthetic',exchange:'LV',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'} as BarDataset['instrument'],bars,resolution,
  provenance:{providerId,providerName:'Synthetic fixture',datasetId,fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[]} as unknown as BarDataset['provenance']};
}
// 3 synthetic days of hourly bars; day d closes at 100+d*10+hour.
const hourly=Array.from({length:72},(_,index)=>bar(T0+index*H,100+Math.floor(index/24)*10+index%24));
const daily=[0,1,2].map(day=>bar(T0+day*D,1000+day));

describe(' request alignment has no lookahead',()=>{
 it('a daily bar first appears on the hourly bar that closes its day, never earlier',()=>{
  const rows=alignScriptRequest(hourly,'60m',{bars:daily,resolution:'1D',label:'daily',fixture:true});
  expect(rows).toHaveLength(72);
  expect(rows.slice(0,23)).toEqual(Array(23).fill(null));// day 0 is still open through 22:00-23:00
  expect(rows[23]?.close).toBe(1000);// 23:00 bar ends at the day end: day 0 is complete
  expect(rows[24]?.close).toBe(1000);expect(rows[46]?.close).toBe(1000);
  expect(rows[47]?.close).toBe(1001);expect(rows[71]?.close).toBe(1002);
  // Every row the script could see on bar i ended no later than bar i's own end.
  rows.forEach((row,index)=>{if(row)expect(row.time+D).toBeLessThanOrEqual(hourly[index].time+H);});
 });
 it('a lower interval gives the last finer bar that closed inside the chart bar',()=>{
  const minutes=Array.from({length:120},(_,index)=>bar(T0+index*60,index));
  const rows=alignScriptRequest(hourly.slice(0,2),'60m',{bars:minutes,resolution:'1m',label:'1m',fixture:true});
  expect(rows.map(row=>row?.close)).toEqual([59,119]);
 });
 it('another symbol at the same interval is matched bar for bar, and a later requested bar never leaks back',()=>{
  const other=hourly.map(row=>bar(row.time,row.close*2));
  const rows=alignScriptRequest(hourly.slice(0,10),'60m',{bars:other,resolution:'60m',label:'other',fixture:true});
  expect(rows.map(row=>row?.close)).toEqual(other.slice(0,10).map(row=>row.close));
 });
 it('refuses event intervals, unknown chart intervals and unordered requested bars',()=>{
  expect(()=>alignScriptRequest(hourly,null,{bars:daily,resolution:'1D',label:'x',fixture:true})).toThrow('time interval');
  expect(()=>alignScriptRequest(hourly,'60m',{bars:daily,resolution:'100T',label:'x',fixture:true})).toThrow('event bars');
  expect(()=>alignScriptRequest(hourly,'60m',{bars:[daily[1],daily[0]],resolution:'1D',label:'x',fixture:true})).toThrow('increasing');
  expect(scriptRequestBase({datasetId:'a',resolution:'60m'},'renko').resolution).toBeNull();
  expect(scriptRequestBase({datasetId:'a',resolution:'60m'},'candles').resolution).toBe('60m');
 });
});

describe(' requests read only loaded datasets, with the interval menu rules',()=>{
 const gme=dataset('GME','60m',hourly),spy=dataset('SPY','60m',hourly.map(row=>bar(row.time,row.close+1))),spyDaily=dataset('SPY','1D',daily);
 const resolve=createDatasetRequestResolver({datasets:[gme,spy,spyDaily]}),base={datasetId:gme.provenance.datasetId,resolution:'60m'};
 it('resolves another symbol (any case), an exact interval, and aggregates the chart symbol when no exact interval is loaded',()=>{
  expect(resolve({id:'s',symbol:'spy',interval:null},base).bars[0].close).toBe(hourly[0].close+1);
  expect(resolve({id:'s',symbol:'SPY',interval:'1D'},base).bars).toEqual(daily);
  const derived=resolve({id:'d',symbol:null,interval:'1D'},base);
  expect(derived.bars.map(row=>row.close)).toEqual([123,133,143]);// last hourly close of each synthetic day
  expect(derived.ends).toEqual([T0+D,T0+2*D,T0+3*D]);expect(derived.fixture).toBe(true);
 });
 it('refuses symbols that are not loaded, and ambiguous sources from different providers',()=>{
  expect(()=>resolve({id:'x',symbol:'AAPL',interval:null},base)).toThrow('No loaded data for AAPL');
  const second=dataset('GME','15m',Array.from({length:8},(_,index)=>bar(T0+index*900,50+index)),'GME:15m','other-provider');
  const both=createDatasetRequestResolver({datasets:[gme,second]});
  expect(()=>both({id:'x',symbol:null,interval:'1D'},base)).toThrow('Several loaded sources');
 });
 it('caps a script at four requests and names the failing request',()=>{
  const fake:ScriptRequestResolver=()=>({bars:daily,resolution:'1D',label:'d',fixture:true});
  const five=['a','b','c','d','e'].map(id=>({id,symbol:null,interval:'1D'}));
  expect(()=>resolveScriptRequests(five,hourly,base,fake)).toThrow('at most 4 requests');
  expect(()=>resolveScriptRequests([{id:'x',symbol:'AAPL',interval:null}],hourly,base,resolve)).toThrow('Request x: No loaded data');
 });
});

describe(' ctx.request end to end through the restricted worker',()=>{
 const gme=dataset('GME','60m',hourly),spy=dataset('SPY','60m',hourly.map(row=>bar(row.time,row.close+1)));
 const jobs=new ScriptJobs(),bridge={executeScript:(value:any)=>jobs.run(value),cancel:async({requestId}:{requestId:string})=>({ok:true as const,value:{cancelled:jobs.cancel(requestId)}})} as any;
 const source=`({requests:{daily:{interval:'1D'},spy:{symbol:'SPY'}},inputs:{gap:{type:'float',default:0.5}},onBar(ctx){const d=ctx.request('daily'),s=ctx.request('spy');ctx.plot('Daily close',d?d.close:null);ctx.plot('Relative',s?ctx.bar.close-s.close+ctx.input('gap'):null);ctx.alertcondition('Above daily',d!==null&&ctx.bar.close>d.close,'Above the last daily close');}})`;
 it('declares, resolves, aligns and runs with the requested series; plots match the no-lookahead oracle',async()=>{
  try{
   const {result}=await executeScriptOnBars({source,bars:hourly,identity:'synthetic-r25',fixture:true,signal:new AbortController().signal,bridge,queue:new ScriptJobQueue(),inputs:{gap:1},request:{base:{datasetId:gme.provenance.datasetId,resolution:'60m'},resolver:createDatasetRequestResolver({datasets:[gme,spy]})}});
   const daily=result.plots.find(plot=>plot.title==='Daily close')!.values.map(point=>point.value);
   expect(daily.slice(0,23)).toEqual(Array(23).fill(null));expect(daily[23]).toBe(123);expect(daily[47]).toBe(133);expect(daily[71]).toBe(143);
   expect(result.plots.find(plot=>plot.title==='Relative')!.values.every(point=>point.value===0)).toBe(true);// close - (close+1) + gap 1
   expect(result.declarations?.requests).toEqual([{id:'daily',symbol:null,interval:'1D'},{id:'spy',symbol:'SPY',interval:null}]);
   expect(result.inputs).toEqual({gap:1});
   const condition=result.conditions!.find(row=>row.title==='Above daily')!;
   expect(condition.message).toBe('Above the last daily close');expect(condition.values).toHaveLength(72);expect(condition.values[23].value).toBe(0);expect(condition.values[37].value).toBe(0);expect(condition.values[38].value).toBe(1);
   expect(result.provenance.kind).toBe('synthetic');expect(result.provenance.label).toContain('requests: daily = GME 1D');
  }finally{jobs.close();}
 },20000);
 it('a script that declares requests is refused where no chart data is available',async()=>{
  const local=new ScriptJobs(),own={executeScript:(value:any)=>local.run(value),cancel:async()=>({ok:true as const,value:{cancelled:false}})} as any;
  try{await expect(executeScriptOnBars({source:source.replace("inputs:{gap:{type:'float',default:0.5}},",'')+' ',bars:hourly.slice(0,4),identity:'synthetic-r25',fixture:true,signal:new AbortController().signal,bridge:own,queue:new ScriptJobQueue(),request:null})).rejects.toThrow('need a chart and loaded data');}
  finally{local.close();}
 },20000);
});
