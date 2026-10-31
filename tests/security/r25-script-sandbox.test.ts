import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

// The new LVScript surface (inputs, requests, alert conditions) inside the unchanged restricted worker.
// Every case drives the real QuickJS worker through electron/script-jobs.cjs. SYNTHETIC fixture bars only.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const {inputForScript,LIMITS}=require('../../electron/script-runtime.cjs');
const bars=[10,11,12,13].map((close,index)=>({id:'synthetic-r25-'+index,revision:1,time:3600*(10+index),open:close,high:close+1,low:close-1,close,volume:1}));
const rows=(count=bars.length)=>Array.from({length:count},(_,index)=>index===0?null:{time:3600*index,open:index,high:index+1,low:index-1,close:index,volume:null});
async function run(source:string,extra:Record<string,unknown>={},input=bars){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'r25-sandbox',source,bars:input,...extra});}finally{jobs.close();}}

describe(' sandbox: new API surface stays inside the restricted worker',{timeout:30000},()=>{
 it('scripts using inputs, requests and alert conditions still see no Node, DOM, network, timer or dynamic-code globals',async()=>{
  const result=await run(`({inputs:{n:{type:'int',default:2}},requests:{d:{interval:'1D'}},onBar(ctx){ctx.request('d');ctx.input('n');ctx.alertcondition('c',true,'m');if(ctx.index)return;
   for(const name of ['require','process','module','fetch','XMLHttpRequest','WebSocket','document','window','navigator','setTimeout','Buffer','eval','Function','Date','Proxy','Pro'+'mise'])ctx.state[name]=typeof globalThis[name];
   ctx.state.ctor=[typeof ctx.input.constructor,typeof ctx.request.constructor,typeof ctx.alertcondition.constructor];}})`,{requests:{d:rows()}});
  expect(result.ok,result.error?.message).toBe(true);
  const {ctor,...types}=result.value.state.state;
  expect(Object.values(types)).toEqual(Array(16).fill('undefined'));expect(ctor).toEqual(['undefined','undefined','undefined']);
 });
 it('the new ctx functions cannot reach the Function constructor or engine-private input',async()=>{
  for(const [index,escape] of ["ctx.input.constructor('return process')()","ctx.request.constructor('return process')()","Object.getPrototypeOf(ctx.alertcondition).constructor('return 1')()"].entries()){
   const result=await run(`({requests:{d:{symbol:'SPY'}},onBar(ctx){ctx.state.escape=${escape};}})`,{requests:{d:rows()}});
   expect(result.ok,'escape '+index).toBe(false);
  }
  const probe=await run(`({requests:{d:{symbol:'SPY'}},onBar(ctx){ctx.state.seen=[typeof input,typeof supplied,typeof inputValues,typeof requested];}})`,{requests:{d:rows()}});
  expect(probe.ok).toBe(true);expect(probe.value.state.state.seen).toEqual(['undefined','undefined','undefined','undefined']);
 });
 it('ctx.request exposes only the current aligned row, frozen, never a later one',async()=>{
  const result=await run(`({requests:{d:{interval:'1D'}},onBar(ctx){const row=ctx.request('d');ctx.state.seen=(ctx.state.seen||[]).concat([row===null?null:row.close]);ctx.state.frozen=row===null||Object.isFrozen(row);if(row){try{row.close=999;}catch(e){}ctx.state.after=ctx.request('d').close;}}})`,{requests:{d:rows()}});
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.state.state.seen).toEqual([null,1,2,3]);expect(result.value.state.state.frozen).toBe(true);expect(result.value.state.state.after).toBe(3);
 });
 it('declarations with accessors are refused, so a getter cannot feed the engine changing values',async()=>{
  const getter=await run(`({get inputs(){return {n:{type:'int',default:1}};},onBar(){}})`);
  expect(getter.ok).toBe(false);expect(getter.error.message).toContain('plain data property');
  const nested=await run(`({inputs:{n:{type:'int',get default(){return 1;}}},onBar(){}})`);
  expect(nested.ok).toBe(false);expect(nested.error.message).toContain('plain data property');
 });
 it('guest tampering with String, RegExp and iterator prototypes does not loosen declaration checks',async()=>{
  const tamper="x:(String.prototype.charCodeAt=function(){return 97;},RegExp.prototype.test=function(){return true;},RegExp.prototype.exec=function(){return [];},Array.prototype.includes,1)";
  for(const bad of ["inputs:{'bad-name':{type:'int',default:1}}","inputs:{__proto__x:{type:'int',default:1}}","requests:{d:{symbol:'S P Y'}}","requests:{d:{interval:'1 D'}}"]){
   const result=await run(`({${tamper},${bad},onBar(){}})`);
   expect(result.ok,bad).toBe(false);
  }
 });
 it('the host boundary refuses oversize, misaligned, prototype-named and malformed request and input data',()=>{
  const source='({onBar(){}})',base={requestId:'r25-host',source,bars};
  expect(LIMITS.requests).toBe(4);expect(LIMITS.inputs).toBe(32);
  expect(()=>inputForScript({...base,requests:Object.fromEntries(['a','b','c','d','e'].map(name=>[name,rows()]))})).toThrow('request limit');
  expect(()=>inputForScript({...base,requests:{a:rows(3)}})).toThrow('align');
  expect(()=>inputForScript({...base,requests:JSON.parse('{"__proto__":[null,null,null,null]}')})).toThrow();
  expect(()=>inputForScript({...base,requests:{a:[null,{time:1,open:1,high:0,low:2,close:1,volume:1},null,null]}})).toThrow('requested bar');
  expect(()=>inputForScript({...base,requests:{a:[null,{time:1,open:1,high:2,low:0,close:1,volume:1,extra:1},null,null]}})).toThrow();
  expect(()=>inputForScript({...base,requests:{a:[null,{time:5,open:1,high:2,low:0,close:1,volume:1},{time:4,open:1,high:2,low:0,close:1,volume:1},null]}})).toThrow('requested bar');
  expect(()=>inputForScript({...base,inputs:Object.fromEntries(Array.from({length:33},(_,index)=>['i'+index,1]))})).toThrow('input limit');
  expect(()=>inputForScript({...base,inputs:{n:Infinity}})).toThrow();
  expect(()=>inputForScript({...base,inputs:{n:{nested:true}}})).toThrow();
  expect(()=>inputForScript({...base,inputs:{n:'x'.repeat(201)}})).toThrow();
 });
 it('declared caps hold inside the engine: at most 4 requests, 32 inputs and 32 alert conditions',async()=>{
  const requests=Object.fromEntries(['a','b','c','d','e'].map(name=>[name,{interval:'1D'}]));
  expect((await run(`({requests:${JSON.stringify(requests)},onBar(){}})`)).error.message).toContain('at most 4 requests');
  const inputs=Object.fromEntries(Array.from({length:33},(_,index)=>['i'+index,{type:'int',default:1}]));
  expect((await run(`({inputs:${JSON.stringify(inputs)},onBar(){}})`)).error.message).toContain('at most 32 inputs');
  expect((await run(`({onBar(ctx){for(let i=0;i<33;i++)ctx.alertcondition('c'+i,true,'');}})`)).error.message).toContain('at most 32 alert conditions');
  expect((await run(`({init(ctx){ctx.alertcondition('c',true,'');},onBar(){}})`)).error.message).toContain('require onBar');
  expect((await run(`({init(ctx){ctx.request('d');},requests:{d:{interval:'1D'}},onBar(){}})`,{requests:{d:rows()}})).error.message).toContain('require onBar');
 });
});
