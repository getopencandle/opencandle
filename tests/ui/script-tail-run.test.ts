import {afterEach,describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {executeScriptOnBars,ScriptJobQueue,SCRIPT_TAIL_NOTE,SCRIPT_BAR_LIMIT,scriptRunBars} from '../../src/ui/script-jobs';
import {scriptExamples} from '../../src/ui/ScriptPanel';
import {makeDemoIntraday,DEMO_INTRADAY_RESOLUTIONS} from '../../src/domain/fixtures';
import {logicalScriptFixture,logicalSourceRows} from '../fixtures/script-derived-position';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC example data only. A chart longer than the script limit runs on its newest 5,000 bars with a plain note.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const DAY=86400;
const held:Array<{dispose():void}>=[];afterEach(()=>{for(const f of held.splice(0).reverse())f.dispose();});
function workerBridge(){const jobs=new ScriptJobs();return{jobs,bridge:{executeScript:(payload:any)=>jobs.run(payload),cancel:async()=>({ok:true as const,value:{cancelled:true}})} as any};}
async function run(source:string,bars:readonly Bar[]){
 const {jobs,bridge}=workerBridge();
 try{return await executeScriptOnBars({source,bars,identity:'SYNTHETIC-tail',fixture:true,signal:new AbortController().signal,bridge,queue:new ScriptJobQueue(1)});}finally{jobs.close();}
}
/** Independent reference: UTC days, true range of each completed day, Wilder RMA 14 (mean of the days while fewer than 14). */
function atrReference(bars:readonly Bar[]){
 const days:{high:number;low:number;close:number}[]=[];let key:number|null=null;
 for(const bar of bars){const k=Math.floor(bar.time/DAY);if(k!==key){days.push({high:bar.high,low:bar.low,close:bar.close});key=k;}else{const d=days.at(-1)!;d.high=Math.max(d.high,bar.high);d.low=Math.min(d.low,bar.low);d.close=bar.close;}}
 const done=days.slice(0,-1),today=days.at(-1)!;let atr=NaN,sum=0;
 done.forEach((d,i)=>{const p=i?done[i-1].close:null,tr=p===null?d.high-d.low:Math.max(d.high-d.low,Math.abs(d.high-p),Math.abs(d.low-p));sum+=tr;if(i<14){if(i===13)atr=sum/14;}else atr=(atr*13+tr)/14;});
 return done.length<14?{atr:sum/done.length,today:today.high-today.low}:{atr,today:today.high-today.low};
}

describe('script runs over the 5,000-bar limit',{timeout:180000},()=>{
 it('the 5,460-bar 1m example runs without error on its newest 5,000 bars, equal to a run on those bars alone',async()=>{
  const all=makeDemoIntraday('SPY')['1m'];expect(all.length).toBe(5460);
  const source='({onBar(ctx){const s=ctx.ta.sma("s",ctx.bar.close,20);ctx.plot("SMA",s===null?null:Math.round(s*100)/100);}})';
  const long=await run(source,all),tail=await run(source,all.slice(-SCRIPT_BAR_LIMIT));
  expect(long.barIds).toHaveLength(SCRIPT_BAR_LIMIT);expect(long.bars!.map(bar=>bar.time)).toEqual(all.slice(-SCRIPT_BAR_LIMIT).map(bar=>bar.time));
  expect(long.result.plots).toEqual(tail.result.plots);
  expect(long.result.logs!.entries[0]).toMatchObject({level:'info',message:SCRIPT_TAIL_NOTE,time:all[460].time});
  expect(tail.result.logs!.entries.some(row=>row.message===SCRIPT_TAIL_NOTE)).toBe(false);
 });
 it('an under-limit chart runs unchanged: every bar, no note',async()=>{
  const bars=makeDemoIntraday('SPY')['1m'].slice(0,300),out=await run('({onBar(ctx){ctx.plot("c",ctx.bar.close);}})',bars);
  expect(out.barIds).toHaveLength(300);expect(out.result.plots[0].values).toHaveLength(300);expect(out.result.logs!.entries).toEqual([]);
  expect(scriptRunBars(bars)).toBe(bars);
 });
 for(const resolution of DEMO_INTRADAY_RESOLUTIONS)it(`Daily ATR panel on the full ${resolution} example data matches the reference on the newest 5,000 bars`,async()=>{
  const all=makeDemoIntraday('SPY')[resolution],out=await run(scriptExamples['Daily ATR panel'],all),want=atrReference(all.slice(-SCRIPT_BAR_LIMIT));
  const texts=JSON.stringify(out.result.objects!.tables[0].cells);
  expect(texts).toContain(JSON.stringify(want.atr.toFixed(2)));expect(texts).toContain(JSON.stringify(want.today.toFixed(2)));expect(texts).toContain(JSON.stringify((100*want.today/want.atr).toFixed(0)+'%'));
 });
});

describe('chart bindings over the limit present the newest bars',{timeout:180000},()=>{
 for(const style of ['renko','candles'])it(style+': a 5,004-row chart reaches ready on the newest 5,000 rows, with the plain note',async()=>{
  const f=await logicalScriptFixture({style,rows:logicalSourceRows(Array.from({length:5004},(_,index)=>10+2*index))});held.push(f);
  await f.start();
  const status=f.statuses.at(-1).find((row:any)=>row.id===f.binding.id);expect(status.status).toBe('ready');expect(status.message).toContain(SCRIPT_TAIL_NOTE);
  const execution=f.executions.at(-1);expect(execution.bars).toHaveLength(SCRIPT_BAR_LIMIT);expect(execution.barIds).toHaveLength(SCRIPT_BAR_LIMIT);
  expect(f.record()).toBeDefined();
 });
});
