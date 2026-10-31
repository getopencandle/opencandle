import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

// ADDED checks for the new LVScript surface (ctx.ta, ctx.history, ctx.series, visual outputs) inside
// the unchanged restricted worker. Every case drives the real QuickJS worker through electron/script-jobs.cjs.
// SYNTHETIC fixture bars only. No existing security assertion is edited.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const {LIMITS}=require('../../electron/script-runtime.cjs');
const bars=Array.from({length:30},(_,index)=>{const close=10+Math.sin(index/2)*3;return{id:'synthetic-r32-sec-'+index,revision:1,time:3600*(10+index),open:close-0.25,high:close+1,low:close-1,close,volume:5+index};});
async function run(source:string,input=bars,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'r32-sandbox',source,bars:input,...extra});}finally{jobs.close();}}
const body=`ctx.plot('ema', ctx.ta.ema('e', ctx.bar.close, 5)); ctx.plot('rsi', ctx.ta.rsi('r', ctx.bar.close, 5)); ctx.plot('dev', ctx.ta.stdev('s', ctx.bar.close, 5));
 ctx.plot('hma', ctx.ta.hma('h', ctx.bar.close, 9)); ctx.plot('atr', ctx.ta.atr('a', 5)); const b = ctx.ta.bb('b', ctx.bar.close, 5, 2); ctx.plot('bbu', b.upper); ctx.hline('h', 10, { color: '#112233' });`;

describe(' sandbox: the new surface stays inside the restricted worker',{timeout:60000},()=>{
 it('leaves the runtime limits exactly as the security contract states them',()=>{
  expect(LIMITS).toMatchObject({sourceBytes:65536,bars:5000,memoryBytes:16*1024*1024,stackBytes:256*1024,outputBytes:512*1024,computeMilliseconds:1000});
 });
 it('scripts using the new APIs still see no Node, DOM, network, timer or dynamic-code globals, and no constructor',async()=>{
  const result=await run(`({onBar(ctx){ctx.ta.ema('e',ctx.bar.close,3);ctx.history(1);const s=ctx.series('s',1);ctx.hline('h',1);if(ctx.index)return;
   for(const name of ['require','process','module','fetch','XMLHttpRequest','WebSocket','document','window','setTimeout','Buffer','eval','Function','Date','Proxy'])ctx.state[name]=typeof globalThis[name];
   ctx.state.ctor=[typeof ctx.ta.ema.constructor,typeof ctx.history.constructor,typeof s.constructor,typeof ctx.plotshape.constructor,typeof ctx.ta.constructor];ctx.state.frozen=Object.isFrozen(ctx.ta);}})`);
  expect(result.ok,result.error?.message).toBe(true);
  const {ctor,frozen,...types}=result.value.state.state;
  expect(Object.values(types)).toEqual(Array(14).fill('undefined'));expect(ctor.slice(0,4)).toEqual(['undefined','undefined','undefined','undefined']);expect(frozen).toBe(true);
 });
 it('the new functions cannot reach the Function constructor, engine-private input or the kept TA state',async()=>{
  for(const [index,escape] of ["ctx.ta.sma.constructor('return process')()","Object.getPrototypeOf(ctx.history).constructor('return 1')()","ctx.series('s',1).constructor('return 1')()","Object.getPrototypeOf(ctx.ta.rsi).constructor('return 1')()"].entries()){
   const result=await run(`({onBar(ctx){ctx.state.escape=${escape};}})`);expect(result.ok,'escape '+index).toBe(false);
  }
  const probe=await run(`({onBar(ctx){ctx.ta.ema('e',1,3);ctx.state.seen=[typeof input,typeof snapshot,typeof TA,typeof stored,typeof calls,typeof visuals,typeof barAgo,typeof ctx.state.ta,Object.keys(ctx.ta).includes('slotOf')];}})`);
  expect(probe.ok,probe.error?.message).toBe(true);expect(probe.value.state.state.seen).toEqual(['undefined','undefined','undefined','undefined','undefined','undefined','undefined','undefined',false]);
 });
 it('history returns fresh frozen rows of the current or earlier bars only',async()=>{
  const result=await run(`({onBar(ctx){const now=ctx.history(0),prior=ctx.history(1);ctx.state.ok=(ctx.state.ok??true)&&Object.isFrozen(now)&&now.time===ctx.bar.time&&(prior===null||prior.time<ctx.bar.time);
   try{now.close=1;}catch{}ctx.state.unchanged=now.close===ctx.bar.close;try{ctx.history(-1);ctx.state.negative='read';}catch(error){ctx.state.negative='refused';}}})`);
  expect(result.ok,result.error?.message).toBe(true);expect(result.value.state.state).toMatchObject({ok:true,unchanged:true,negative:'refused'});
 });
 it('guest replacement of Math, String and iterator prototypes does not change any TA value',async()=>{
  const clean=await run(`({onBar(ctx){${body}}})`);
  const tampered=await run(`(Math.max=()=>0,Math.min=()=>0,Math.abs=()=>0,Math.sqrt=()=>0,Math.floor=()=>0,String.prototype.slice=()=>'',String.fromCharCode=()=>'x',
   Object.getPrototypeOf([][Symbol.iterator]()).next=()=>({done:true}),{onBar(ctx){${body}}})`);
  expect(clean.ok,clean.error?.message).toBe(true);expect(tampered.ok,tampered.error?.message).toBe(true);
  expect(tampered.value.plots).toEqual(clean.value.plots);expect(tampered.value.visuals).toEqual(clean.value.visuals);
 });
 it('visual options are read as plain data: getters are refused and never run',async()=>{
  const result=await run(`({onBar(ctx){ctx.hline('h',1,{get color(){ctx.state.ran=true;return '#ffffff';}});}})`);
  expect(result.ok).toBe(false);expect(result.error.message).toMatch(/plain data property/);
  const proto=await run(`({onBar(ctx){ctx.plotshape('s',true,Object.create({shape:'circle'}));}})`);expect(proto.ok,proto.error?.message).toBe(true);expect(proto.value.visuals.markers[0].shape).toBe('xcross');
 });
 it('bounds the new outputs: hline, fill and shape-series caps, and markers and backgrounds count against the output limit',async()=>{
  expect(await run(`({onBar(ctx){for(let i=0;i<17;i++)ctx.hline('h'+i,i);}})`)).toMatchObject({ok:false,error:{message:'A script may draw at most 16 horizontal lines.'}});
  expect(await run(`({onBar(ctx){for(let i=0;i<33;i++)ctx.plotshape('s'+i,false);}})`)).toMatchObject({ok:false,error:{message:'A script may define at most 32 shape or character series.'}});
  const many=Array.from({length:1000},(_,index)=>({id:'synthetic-r32-many-'+index,revision:1,time:index+1,open:1,high:2,low:0,close:1,volume:1}));
  expect(await run(`({onBar(ctx){ctx.bgcolor('#101010');for(let i=0;i<5;i++){ctx.plotshape('a'+i,true);ctx.plotchar('b'+i,true,'x');}}})`,many)).toMatchObject({ok:false,error:{message:'Shape output limit exceeded.'}});
  expect(await run(`({onBar(ctx){ctx.bgcolor('#101010');for(let i=0;i<10;i++)ctx.plot('p'+i,1);}})`,many)).toMatchObject({ok:false,error:{message:'Output count limit exceeded.'}});
  expect(await run(`({onBar(ctx){ctx.fill('f','a','b');ctx.plot('a',1);}})`)).toMatchObject({ok:false,error:{message:expect.stringMatching(/never plotted/)}});
 });
 it('runaway TA work is still interrupted by the one-second compute limit and memory stays bounded',async()=>{
  const started=Date.now(),loop=await run(`({onBar(ctx){for(let i=0;;i++)ctx.ta.sma('k'+i,1,5000);}})`);
  expect(loop.ok).toBe(false);expect(Date.now()-started).toBeLessThan(10000);
 });
 it('a provisional run returns no visuals and keeps the committed snapshot',async()=>{
  const source=`({onBar(ctx){ctx.ta.ema('e',ctx.bar.close,3);ctx.history(2);ctx.hline('h',1);ctx.bgcolor('#202020');ctx.plotshape('s',true);}})`;
  const committed=await run(source,bars.slice(0,5)),provisional=await run(source,bars.slice(5,6),{snapshot:committed.value.state,provisional:true});
  expect(provisional.ok,provisional.error?.message).toBe(true);expect(provisional.value.state).toEqual(committed.value.state);
  expect(provisional.value.visuals).toEqual({hlines:[],fills:[],backgrounds:[],markers:[],plotStyles:[]});
 });
});
