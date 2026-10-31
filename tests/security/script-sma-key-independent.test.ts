import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars=[2,99].map((close,index)=>({id:'synthetic-key-'+index,revision:1,time:100+index,open:close,high:close,low:close,close,volume:1}));

// Independent numerical and state oracles, using the actual worker when run.
// These cases are authored only while the root storage preflight refuses tests.
describe('ordinary SMA keys that shadow Object prototype members',()=>{
 for(const key of ['toString','valueOf','hasOwnProperty'])it('keeps '+key+' consistent across fresh and resumed execution',async()=>{
  const jobs=new ScriptJobs();
  const source='({onBar(ctx){ctx.plot("Synthetic mean",ctx.sma('+JSON.stringify(key)+',ctx.bar.close,2));}})';
  try{
   const first=await jobs.run({requestId:'synthetic-key-first',source,bars:bars.slice(0,1)});
   expect(first.ok,first.error?.message).toBe(true);
   expect(first.value.plots[0].values).toEqual([{time:100,value:null}]);
   expect(Object.keys(first.value.state.ta)).toEqual([key]);
   expect(first.value.state.ta[key]).toEqual({length:2,values:[2],sum:2});
   const resumed=await jobs.run({requestId:'synthetic-key-resumed',source,bars:bars.slice(1),snapshot:first.value.state});
   expect(resumed.ok,resumed.error?.message).toBe(true);
   expect(resumed.value.plots[0].values).toEqual([{time:101,value:50.5}]);
   expect(resumed.value.state.ta[key]).toEqual({length:2,values:[2,99],sum:101});
   const full=await jobs.run({requestId:'synthetic-key-full',source,bars});
   expect(full.ok,full.error?.message).toBe(true);
   expect(full.value.plots[0].values).toEqual([{time:100,value:null},{time:101,value:50.5}]);
   expect(full.value.state).toEqual(resumed.value.state);
  }finally{jobs.close();}
 });

 it('keeps a prototype-named window separate from an ordinary window',async()=>{
  const jobs=new ScriptJobs();
  try{
   const source='({onBar(ctx){ctx.plot("Synthetic price",ctx.sma("toString",ctx.bar.close,2));ctx.plot("Synthetic constant",ctx.sma("ordinary",10,2));}})';
   const result=await jobs.run({requestId:'synthetic-key-separate',source,bars});
   expect(result.ok,result.error?.message).toBe(true);
   expect(result.value.plots.map((plot:any)=>[plot.title,plot.values.map((point:any)=>point.value)])).toEqual([['Synthetic price',[null,50.5]],['Synthetic constant',[null,10]]]);
   expect(result.value.state.ta.toString).toEqual({length:2,values:[2,99],sum:101});
   expect(result.value.state.ta.ordinary).toEqual({length:2,values:[10,10],sum:20});
  }finally{jobs.close();}
 });

 it('still refuses changing the period of an existing prototype-named window',async()=>{
  const jobs=new ScriptJobs();
  try{
   const result=await jobs.run({requestId:'synthetic-key-period',bars,source:'({onBar(ctx){ctx.plot("Synthetic",ctx.sma("hasOwnProperty",ctx.bar.close,ctx.index===0?2:3));}})'});
   expect(result.ok).toBe(false);expect(result.error.code).toBe('SCRIPT_FAILED');
   expect(result.error.message).toContain('SMA key parameters changed');expect(result.value).toBeUndefined();
  }finally{jobs.close();}
 });

 it('uses trusted property operations after the guest replaces global helpers',async()=>{
  const jobs=new ScriptJobs();
  try{
   const source='(()=>{Object.getOwnPropertyDescriptor=()=>{throw "guest descriptor called"};Object.defineProperty=()=>{throw "guest definition called"};return{onBar(ctx){ctx.plot("Synthetic",ctx.sma("valueOf",ctx.bar.close,2));}};})()';
   const result=await jobs.run({requestId:'synthetic-key-trusted',source,bars});
   expect(result.ok,result.error?.message).toBe(true);
   expect(result.value.plots[0].values.map((point:any)=>point.value)).toEqual([null,50.5]);
   expect(result.value.state.ta.valueOf).toEqual({length:2,values:[2,99],sum:101});
  }finally{jobs.close();}
 });
});
