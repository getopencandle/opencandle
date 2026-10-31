import {afterEach,describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar} from '../../src/domain/types';
import {executeScriptOnBars,ScriptJobQueue} from '../../src/ui/script-jobs';
import {installScriptRequestResolver,type ScriptRequestResolver} from '../../src/ui/script-requests';
import {replayClippedResolver} from '../../src/chart/indicator-history-lookup';

// 0.8.1: ctx.timeframe waits for the close of a forming last chart bar (live or replay), through the real restricted
// worker. SYNTHETIC bars only.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const HOUR=3600,DAY=86400,T0=Date.UTC(2026,0,1)/1000;
let jobs:any=null,uninstall:(()=>void)|null=null;
afterEach(()=>{jobs?.close();jobs=null;uninstall?.();uninstall=null;});
async function run(source:string,bars:readonly Bar[],datasetId:string){
 jobs=new ScriptJobs();const bridge={executeScript:(value:any)=>jobs.run(value),cancel:async({requestId}:{requestId:string})=>({ok:true as const,value:{cancelled:jobs.cancel(requestId)}})} as any;
 return (await executeScriptOnBars({source,bars,identity:'synthetic-script-wait',fixture:true,signal:new AbortController().signal,bridge,queue:new ScriptJobQueue(),request:{base:{datasetId,resolution:'1h'},resolver:null}})).result;
}
const plot=(result:any,title:string)=>result.plots.find((row:any)=>row.title===title).values.map((row:any)=>row.value);

describe('script higher timeframes and a forming last bar (SYNTHETIC)',()=>{
 // 1 January 2026, 24 hourly bars 00:00..23:00 UTC: one UTC day. The 23:00 bar's nominal end is the day's end.
 const bars=Array.from({length:24},(_,i)=>({time:T0+i*HOUR,open:100+i,high:101+i,low:99+i,close:100.5+i,volume:10}));
 const code=`({timeframes:{day:'1D'},onBar(ctx){const d=ctx.timeframe('day');ctx.plot('end',d?d.end:null);}})`;
 const inner:ScriptRequestResolver=()=>{throw new Error('No requests in this test.');};
 it('while the replay clock is inside the 23:00 bar, the day is not visible yet',async()=>{
  uninstall=installScriptRequestResolver(replayClippedResolver(inner,id=>id==='synthetic:1h'?T0+23*HOUR+30*60:null));
  expect(plot(await run(code,bars,'synthetic:1h'),'end').at(-1)).toBeNull();
 },30000);
 it('once that bar has closed, the day is visible on it',async()=>{
  uninstall=installScriptRequestResolver(replayClippedResolver(inner,id=>id==='synthetic:1h'?T0+DAY:null));
  expect(plot(await run(code,bars,'synthetic:1h'),'end').at(-1)).toBe(T0+DAY);
 },30000);
});
