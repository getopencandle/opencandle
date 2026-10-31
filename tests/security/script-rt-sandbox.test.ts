import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

// Ctx.timeframe, ctx.symbol, ctx.history(n, source) and declared conditions inside the unchanged restricted
// worker, plus the main-process refusals of malformed or lookahead series. SYNTHETIC fixture bars only.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const {inputForScript,LIMITS,SERIES_LIMITS}=require('../../electron/script-runtime.cjs');
const bars=[10,11,12,13].map((close,index)=>({id:'synthetic-rt-'+index,revision:1,time:3600*(10+index),open:close,high:close+1,low:close-1,close,volume:1}));
const row=(time:number,end:number,close=1)=>({time,open:close,high:close+1,low:close-1,close,volume:null,end});
const feed=()=>({rows:[row(0,36000),row(36000,43200,2)],visible:[1,1,2,2]});
const base={requestId:'synthetic-rt',source:'({onBar(){}})',bars};
async function run(source:string,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-rt',source,bars,...extra});}finally{jobs.close();}}

describe('SCRIPT-RT main-process boundary',()=>{
 it('keeps every existing resource cap and adds separate series caps',()=>{
  expect(LIMITS).toEqual({sourceBytes:65536,bars:5000,memoryBytes:16*1024*1024,stackBytes:256*1024,outputBytes:512*1024,computeMilliseconds:1000,inputs:32,requests:4,conditions:32});
  expect(SERIES_LIMITS).toEqual({timeframes:4,symbols:4,rows:5500,totalRows:20000,depth:500});
 });
 it('refuses malformed, oversized and prototype-named series',()=>{
  expect(()=>inputForScript({...base,timeframes:{d:feed()}})).not.toThrow();
  expect(()=>inputForScript({...base,timeframes:Object.fromEntries(['a','b','c','d','e'].map(name=>[name,feed()]))})).toThrow('series limit');
  expect(()=>inputForScript({...base,symbols:JSON.parse('{"__proto__":{"rows":[],"visible":[0,0,0,0]}}')})).toThrow();
  expect(()=>inputForScript({...base,timeframes:{d:{...feed(),extra:1}}})).toThrow();
  expect(()=>inputForScript({...base,timeframes:{d:{rows:[],visible:[0,0,0]}}})).toThrow('one visible count per script bar');
  expect(()=>inputForScript({...base,timeframes:{d:{rows:[{...row(0,36000),secret:1}],visible:[1,1,1,1]}}})).toThrow();
  expect(()=>inputForScript({...base,timeframes:{d:{rows:[row(0,36000),row(0,43200)],visible:[1,1,1,1]}}})).toThrow('series row');
  expect(()=>inputForScript({...base,timeframes:{d:{rows:[{...row(0,36000),high:0}],visible:[1,1,1,1]}}})).toThrow('series row');
  expect(()=>inputForScript({...base,symbols:{d:{rows:Array.from({length:5501},(_,i)=>row(i,i+1)),visible:[0,0,0,0]}}})).toThrow('5500');
  const many=()=>({rows:Array.from({length:5000},(_,i)=>row(i,i+1)),visible:[0,0,0,0]});
  expect(()=>inputForScript({...base,timeframes:{a:many(),b:many()},symbols:{c:many(),d:many(),e:{rows:[row(0,1)],visible:[0,0,0,0]}}})).toThrow('20000');
 });
 it('refuses visible counts that move backwards, overrun the rows, or expose a row before it completed',()=>{
  expect(()=>inputForScript({...base,timeframes:{d:{...feed(),visible:[1,0,2,2]}}})).toThrow('visible counts');
  expect(()=>inputForScript({...base,timeframes:{d:{...feed(),visible:[1,1,2,3]}}})).toThrow('visible counts');
  expect(()=>inputForScript({...base,timeframes:{d:{...feed(),visible:[2,2,2,2]}}})).toThrow('before it completed');// ends 43200 > next bar 39600
  expect(()=>inputForScript({...base,symbols:{d:{rows:[row(50000,50060)],visible:[1,1,1,1]}}})).toThrow('before it completed');// starts after the bar
 });
});

describe('SCRIPT-RT guest surface',{timeout:30000},()=>{
 it('scripts using the new readers still see no Node, DOM, network, timer or dynamic-code globals, and cannot reach constructors',async()=>{
  const result=await run(`({timeframes:{d:'1D'},symbols:{q:'QQQ'},conditions:{c:'m'},onBar(ctx){ctx.timeframe('d');ctx.symbol('q');ctx.history(0,'close');ctx.alertcondition('c',true);if(ctx.index)return;
   for(const name of ['require','process','module','fetch','XMLHttpRequest','WebSocket','document','window','navigator','setTimeout','Buffer','eval','Function','Date','Proxy','Pro'+'mise'])ctx.state[name]=typeof globalThis[name];
   ctx.state.ctor=[typeof ctx.timeframe.constructor,typeof ctx.symbol.constructor,typeof ctx.history.constructor];ctx.state.seen=[typeof input,typeof feeds,typeof seriesReader,typeof timeframesDeclared];}})`,{timeframes:{d:feed()},symbols:{q:feed()}});
  expect(result.ok,result.error?.message).toBe(true);
  const {ctor,seen,...types}=result.value.state.state;
  expect(Object.values(types)).toEqual(Array(16).fill('undefined'));expect(ctor).toEqual(['undefined','undefined','undefined']);expect(seen).toEqual(['undefined','undefined','undefined','undefined']);
  for(const [index,escape] of ["ctx.timeframe.constructor('return process')()","Object.getPrototypeOf(ctx.symbol).constructor('return 1')()"].entries()){
   const escaped=await run(`({timeframes:{d:'1D'},onBar(ctx){ctx.state.escape=${escape};}})`,{timeframes:{d:feed()}});
   expect(escaped.ok,'escape '+index).toBe(false);
  }
 });
 it('returns only completed rows, frozen, and never a row beyond the visible count',async()=>{
  const result=await run(`({timeframes:{d:'1D'},onBar(ctx){const now=ctx.timeframe('d'),back=ctx.timeframe('d',1),far=ctx.timeframe('d',500);ctx.state.seen=(ctx.state.seen||[]).concat([[now&&now.close,back&&back.close,far]]);ctx.state.frozen=Object.isFrozen(now);try{now.close=999;}catch(e){}ctx.state.after=ctx.timeframe('d').close;}})`,{timeframes:{d:feed()}});
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.state.state.seen).toEqual([[1,null,null],[1,null,null],[2,1,null],[2,1,null]]);expect(result.value.state.state.frozen).toBe(true);expect(result.value.state.state.after).toBe(2);
 });
 it('refuses undeclared, unsupplied and out-of-range reads, init-time reads and bad declarations',async()=>{
  const cases:Array<[string,Record<string,unknown>,string]>=[
   [`({onBar(ctx){ctx.timeframe('d');}})`,{},'Unknown timeframe'],
   [`({timeframes:{d:'1D'},onBar(ctx){}})`,{},'has no supplied data'],
   [`({onBar(ctx){}})`,{symbols:{q:feed()}},'not declared'],
   [`({timeframes:{d:'1D'},onBar(ctx){ctx.timeframe('d',-1);}})`,{timeframes:{d:feed()}},'needs n'],
   [`({timeframes:{d:'1D'},onBar(ctx){ctx.timeframe('d',501);}})`,{timeframes:{d:feed()}},'needs n'],
   [`({timeframes:{d:'1D'},onBar(ctx){ctx.timeframe('d',0.5);}})`,{timeframes:{d:feed()}},'needs n'],
   [`({timeframes:{d:'1D'},init(ctx){ctx.timeframe('d');},onBar(ctx){}})`,{timeframes:{d:feed()}},'require onBar'],
   [`({timeframes:{d:'1 D'},onBar(ctx){}})`,{},'must be an interval'],
   [`({symbols:{q:'bad symbol'},onBar(ctx){}})`,{},'must be a loaded symbol'],
   [`({timeframes:{a:'1D',b:'1D',c:'1D',d:'1D',e:'1D'},onBar(ctx){}})`,{},'at most 4'],
   [`({get timeframes(){return {d:'1D'};},onBar(ctx){}})`,{},'plain data property'],
   [`({onBar(ctx){ctx.history(-1);}})`,{},'ctx.history(n)'],
   [`({onBar(ctx){ctx.history(1,'volume');}})`,{},'needs a price source'],
   [`({conditions:{c:'declared'},onBar(ctx){ctx.alertcondition('c',true,'other');}})`,{},'declared with another message']
  ];
  for(const [source,extra,message] of cases){const result=await run(source,extra);expect(result.ok,source).toBe(false);expect(result.error.message,source).toContain(message);}
 });
});
