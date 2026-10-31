import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{ScriptJobs}=require('../../electron/script-jobs.cjs');
const bars=Array.from({length:12},(_,i)=>{const close=10+[0,2,1,4,2,-1,0,5,3,1,-2,4][i];return{id:'synthetic-r40-chunk-'+i,revision:1,time:1700000000+i*60,open:close,high:close+2,low:close-1,close,volume:50+i};});
async function run(source:string,input=bars,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-r40-continuation',source,bars:input,...extra});}finally{jobs.close();}}
const expressions=["alma('a',x,3)","dema('d',x,3)","tema('t',x,3)","swma('s',x)","linreg('l',x,3)","vwap('v',x,ctx.index===5)","wpr('w',3)","cmo('c',x,3)","tsi('t',x,2,3)","percentrank('p',x,3)","cog('c',x,3)","median('m',x,3)","dev('d',x,3)","range('r',x,3)","percentile_nearest_rank('n',x,3,75)","percentile_linear_interpolation('i',x,3,75)","max('m',x)","min('m',x)","bbw('b',x,3)","kcw('k',x,3,2)","sar('s',0.02,0.02,0.2)","supertrend('s',1,3).value","accdist('a')","pvt('p')","source('ohlc4')"];
const source=`({onBar(ctx){const x=ctx.bar.close;${expressions.map((value,i)=>`ctx.plot('p${i}',ctx.ta.${value});`).join('')}}})`;
describe(' new TA functions preserve streaming and snapshot behavior',{timeout:60000},()=>{
 it('a snapshot continuation is equivalent to a single calculation for every added function',async()=>{
  const complete=await run(source),first=await run(source,bars.slice(0,6));expect(complete.ok,complete.error?.message).toBe(true);expect(first.ok,first.error?.message).toBe(true);
  const rest=await run(source,bars.slice(6),{snapshot:first.value.state});expect(rest.ok,rest.error?.message).toBe(true);expect(rest.value.state.ta).toEqual(complete.value.state.ta);
  expect(rest.value.plots).toEqual(complete.value.plots.map((plot:any)=>({...plot,values:plot.values.slice(6)})));
 });
 it('a provisional run leaves the committed snapshot unchanged',async()=>{
  const first=await run(source,bars.slice(0,6)),copy=structuredClone(first.value.state),rest=await run(source,bars.slice(6,7),{snapshot:first.value.state,provisional:true});expect(rest.ok,rest.error?.message).toBe(true);expect(rest.value.state).toEqual(copy);expect(first.value.state).toEqual(copy);
 });
 it('future supplied bars cannot affect prefix outputs',async()=>{
  const prefix=await run(source,bars.slice(0,7)),whole=await run(source);expect(prefix.ok,prefix.error?.message).toBe(true);expect(whole.ok,whole.error?.message).toBe(true);expect(prefix.value.plots).toEqual(whole.value.plots.map((plot:any)=>({...plot,values:plot.values.slice(0,7)})));
 });
 it('repeating a keyed call on the same bar reuses the value while changed input is refused',async()=>{
  const repeated=await run(`({onBar(ctx){ctx.plot('a',ctx.ta.median('m',ctx.bar.close,3));ctx.plot('b',ctx.ta.median('m',ctx.bar.close,3));}})`);expect(repeated.ok,repeated.error?.message).toBe(true);expect(repeated.value.plots[0].values).toEqual(repeated.value.plots[1].values);
  const changed=await run(`({onBar(ctx){ctx.ta.median('m',1,3);ctx.ta.median('m',2,3);}})`);expect(changed.ok).toBe(false);expect(changed.error.message).toMatch(/already updated/);
 });
 it('a missing source makes a finite window unavailable until the gap ages out',async()=>{
  const result=await run(`({onBar(ctx){ctx.plot('m',ctx.ta.median('m',ctx.index===3?null:ctx.bar.close,3));}})`);expect(result.ok,result.error?.message).toBe(true);expect(result.value.plots[0].values.slice(2,7).map((row:any)=>row.value)).toEqual([11,null,null,null,10]);
 });
});
