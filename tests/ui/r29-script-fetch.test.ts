import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Bar,BarDataset} from '../../src/domain/types';
import {createDatasetRequestResolver,resolveScriptRequests,scriptRequestBase,scriptRequestKey,leasedScriptRequestKeys,notifyScriptRequestData,scriptRequestRevision,SCRIPT_REQUEST_LIMIT,type ScriptSymbolFeed} from '../../src/ui/script-requests';
import {scriptRequestDemand} from '../../src/ui/script-request-demand';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';
import {secondSymbolKey} from '../../src/ui/second-symbol-demand';

// goal 1: script requests open their symbols on demand through the second-symbol loader.
// SYNTHETIC fixture datasets only; the loader is a mock, nothing is fetched and no key is read.
const H=3600,D=86400,T0=D*20000;
const bar=(time:number,close:number):Bar=>({time,open:close,high:close+1,low:close-1,close,volume:1});
function dataset(symbol:string,resolution:string,bars:Bar[],extra:Partial<BarDataset['provenance']>={}):BarDataset{
 return{instrument:{id:'inst-'+symbol,symbol,name:symbol+' synthetic',exchange:'LV',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'} as BarDataset['instrument'],bars,resolution,
  provenance:{providerId:'synthetic-provider',providerName:'Synthetic fixture',datasetId:symbol+':'+resolution,fixture:true,coverage:'synthetic',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'r1',notes:[],...extra} as unknown as BarDataset['provenance']};
}
const hourly=Array.from({length:48},(_,index)=>bar(T0+index*H,100+index));
const gme=dataset('GME','60m',hourly);
const base={datasetId:gme.provenance.datasetId,resolution:'60m'};

describe(' script requests load symbols on demand',()=>{
 it('an unloaded symbol asks the loader, reads "loading" first, then aligns the loaded bars with no lookahead',()=>{
  const calls:string[]=[];let feed:ScriptSymbolFeed={state:'loading',message:'SPY is loading.',dataset:null};
  const resolve=createDatasetRequestResolver({datasets:[gme],load:(symbol,resolution)=>{calls.push(symbol+' '+resolution);return feed;}});
  expect(()=>resolve({id:'spy',symbol:'spy',interval:'1D'},base)).toThrow('SPY is loading.');
  expect(calls).toEqual(['SPY 1D']);
  const daily=[bar(T0,500),bar(T0+D,501)];
  feed={state:'ready',message:null,dataset:dataset('SPY','1D',daily,{fixture:false,providerName:'Alpaca IEX',providerId:'alpaca-iex'})};
  const resolved=resolveScriptRequests([{id:'spy',symbol:'spy',interval:'1D'}],hourly,base,resolve);
  // A daily bar is visible only on the hourly bar that closes its day (rule, unchanged).
  expect(resolved.rows.spy.slice(0,23)).toEqual(Array(23).fill(null));
  expect(resolved.rows.spy[23]?.close).toBe(500);expect(resolved.rows.spy[47]?.close).toBe(501);
  expect(resolved.labels).toEqual(['spy = SPY 1D from Alpaca IEX']);expect(resolved.fixture).toBe(false);
 });
 it('synthetic loaded data (the keyless stub) keeps the run synthetic',()=>{
  const stub=dataset('SPY','60m',hourly,{fixture:false,providerId:'alpaca-stub',providerName:'SYNTHETIC Alpaca stub'});
  const resolve=createDatasetRequestResolver({datasets:[gme],load:()=>({state:'ready',message:null,dataset:stub})});
  const resolved=resolveScriptRequests([{id:'s',symbol:'SPY',interval:null}],hourly,base,resolve);
  expect(resolved.fixture).toBe(true);expect(resolved.labels[0]).toMatch(/\(synthetic\)$/);
 });
 it('a loader refusal is shown as is, and with no loader the message stays',()=>{
  const refused=createDatasetRequestResolver({datasets:[gme],load:()=>({state:'unavailable',message:'The Alpaca Basic plan streams at most 30 symbols at once.',dataset:null})});
  expect(()=>refused({id:'x',symbol:'XYZ',interval:null},base)).toThrow('at most 30 symbols');
  const none=createDatasetRequestResolver({datasets:[gme],load:null});
  expect(()=>none({id:'x',symbol:'XYZ',interval:null},base)).toThrow('No loaded data for XYZ');
 });
 it('a loaded symbol at an interval the app cannot build is loaded at that interval',()=>{
  const calls:string[]=[];
  const fiveMinute=dataset('GME','5m',Array.from({length:24},(_,index)=>bar(T0+index*300,10+index)),{datasetId:'live:alpaca-iex:GME:5m'});
  const resolve=createDatasetRequestResolver({datasets:[gme],load:(symbol,resolution)=>{calls.push(symbol+' '+resolution);return{state:'ready',message:null,dataset:fiveMinute};}});
  const series=resolve({id:'fast',symbol:'GME',interval:'5m'},base);
  expect(calls).toEqual(['GME 5m']);expect(series.bars).toHaveLength(24);expect(series.resolution).toBe('5m');
 });
 it('a bar from a loaded series must be at the asked interval',()=>{
  const resolve=createDatasetRequestResolver({datasets:[gme],load:()=>({state:'ready',message:null,dataset:dataset('SPY','1D',[bar(T0,1)])})});
  expect(()=>resolve({id:'s',symbol:'SPY',interval:'60m'},base)).toThrow(/interval/);
 });
 it('derived expressions are requested by their canonical text, and the limit stays 4',()=>{
  const calls:string[]=[];
  const resolve=createDatasetRequestResolver({datasets:[gme],load:symbol=>{calls.push(symbol);return{state:'loading',message:symbol+' is loading.',dataset:null};}});
  expect(()=>resolve({id:'r',symbol:'gme / spy',interval:null},base)).toThrow('GME/SPY is loading.');
  expect(calls).toEqual(['GME/SPY']);
  expect(SCRIPT_REQUEST_LIMIT).toBe(4);
  expect(()=>resolveScriptRequests(Array.from({length:5},(_,i)=>({id:'r'+i,symbol:'SPY',interval:null})),hourly,base,resolve)).toThrow('at most 4 requests');
 });
 it('chart lookups are not leased (the grid demand owns them); other lookups hold a lease',()=>{
  const resolve=createDatasetRequestResolver({datasets:[gme],load:()=>({state:'loading',message:'loading',dataset:null}),now:()=>1000});
  expect(()=>resolve({id:'a',symbol:'AAA',interval:null},{...scriptRequestBase({datasetId:gme.provenance.datasetId,resolution:'60m'},'candles'),owner:'chart'})).toThrow();
  expect(leasedScriptRequestKeys(1000).has(scriptRequestKey('AAA','60m'))).toBe(false);
  expect(()=>resolve({id:'b',symbol:'BBB',interval:null},base)).toThrow();
  expect(leasedScriptRequestKeys(1000).has(scriptRequestKey('BBB','60m'))).toBe(true);
  expect(leasedScriptRequestKeys(1000+10*60_000).has(scriptRequestKey('BBB','60m'))).toBe(false);
  expect(scriptRequestKey('SPY','1D')).toBe(secondSymbolKey('SPY','1D'));
 });
 it('new requested data bumps the request revision so scripts recalculate',()=>{
  const before=scriptRequestRevision();notifyScriptRequestData();expect(scriptRequestRevision()).toBe(before+1);
 });
 it('grid demand lists each bound script request once its declarations are known',async()=>{
  const source="({requests:{spy:{symbol:'SPY',interval:'1D'},own:{interval:'5m'}},onBar(ctx){ctx.plot('x',1);}})";
  const bridge={executeScript:async(payload:{bars:unknown[]})=>({ok:true as const,value:{declarations:{inputs:[],requests:payload.bars.length?[]:[{id:'spy',symbol:'SPY',interval:'1D'},{id:'own',symbol:null,interval:'5m'}]},plots:[]} as never}),cancel:async()=>({ok:true as const,value:undefined})} as never;
  const grid=(datasetId:string)=>({layout:{cells:[{id:'c1',symbol:'GME',interval:'60m'}]},cells:{c1:{datasetId,scriptBindings:[{id:'b1',source}]}}}) as never;
  expect([...scriptRequestDemand(grid('live:alpaca-iex:GME:60m'))]).toEqual([]);
  await executeScriptOnBars({source,bars:hourly,identity:'r29-synthetic',fixture:true,signal:new AbortController().signal,bridge,queue:new ScriptJobQueue(),request:{base,resolver:()=>({bars:hourly,resolution:'60m',label:'x',fixture:true})}}).catch(()=>{});
  expect([...scriptRequestDemand(grid('live:alpaca-iex:GME:60m'))].sort()).toEqual([scriptRequestKey('GME','5m'),scriptRequestKey('SPY','1D')].sort());
  // On an imported chart the chart's own symbol is never streamed for it.
  expect([...scriptRequestDemand(grid('import:gme'))]).toEqual([scriptRequestKey('SPY','1D')]);
 });
});

describe(' App wiring (source checks)',()=>{
 const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
 it('installs the script symbol loader over the second-symbol feeds and prunes with script demand',()=>{
  expect(app).toContain('installScriptSymbolLoader(');
  expect(app).toMatch(/scriptRequestDemand\(/);
  expect(app).toMatch(/leasedScriptRequestKeys\(/);
  expect(app).toContain('notifyScriptRequestData');
 });
 it('chart script runs mark their requests as chart-owned',()=>{
  const runner=readFileSync(new URL('../../src/ui/ScriptBindingsRunner.tsx',import.meta.url),'utf8');
  expect(runner).toContain("({...scriptRequestBase(source,style),owner:'chart' as const})");
 });
 it('counts open second-symbol Alpaca feeds toward the 30-symbol limit',()=>{
  expect(app).toMatch(/alpacaChartSymbols=\(\)=>new Set\(\[[^;]*secondSymbolAlpaca\.current\(\)/);
 });
});
