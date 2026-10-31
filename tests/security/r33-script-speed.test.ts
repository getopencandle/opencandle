import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';

// ADDED checks. The runtime is linear in bars (private Sets for processed IDs and alert dedupe,
// cached TA slots, ring windows, compact plot rows), so multi-call scripts run to the existing 5,000-bar limit
// inside the existing 1 s compute budget. LIMITS and every existing security assertion are unchanged.
// SYNTHETIC fixture bars only. Every run goes through the real restricted worker (electron/script-jobs.cjs).
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
const {LIMITS}=require('../../electron/script-runtime.cjs');

const synthetic=(count:number)=>Array.from({length:count},(_,index)=>{const close=100+Math.sin(index/7)*5+index*0.001;return{id:'synthetic-r33-'+index,revision:1,time:1700000000+3600*index,open:close-0.25,high:close+1,low:close-1,close,volume:1000+index};});
async function run(source:string,bars=synthetic(5000),extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'r33-speed',source,bars,...extra});}finally{jobs.close();}}

// The interpreter speed of this machine right now, measured the way a job runs: one restricted worker job of one bar
// whose onBar runs a fixed 1,000,000-iteration loop (about 100-170 ms elapsed on the development machine, idle to
// busy). Per-bar engine work is negligible at one bar, so the same calibration applies before and after the change.
// It is taken just before and just after each timed run; past 200 ms the machine is too loaded for the timing to
// mean anything (for example a parallel suite) and the case is skipped.
const CALIBRATION=`({onBar(ctx){let s=0;for(let i=0;i<1000000;i++)s+=i&7;ctx.state.s=s;}})`;
async function interpreterMs(){const result=await run(CALIBRATION,synthetic(1));return result.ok?result.value.elapsedMs:Infinity;}
const TOO_LOADED_MS=200;
async function timed(context:{skip:(note?:string)=>void},job:()=>Promise<any>){
 const before=await interpreterMs();if(before>TOO_LOADED_MS)context.skip('machine too loaded: calibration '+before.toFixed(0)+' ms');
 const result=await job(),after=await interpreterMs();if(after>TOO_LOADED_MS)context.skip('machine too loaded: calibration '+after.toFixed(0)+' ms');
 return{result,note:'interpreter calibration '+before.toFixed(0)+' / '+after.toFixed(0)+' ms'};
}

const FIVE_TA=`const c=ctx.bar.close;const e=ctx.ta.ema('e',c,20),r=ctx.ta.rsi('r',c,14),s=ctx.ta.stdev('s',c,20),a=ctx.ta.atr('a',14),m=ctx.ta.sma('m',c,50);`;
// Two decimals, as an indicator readout shows them: the plot rows then fit the unchanged 512 KiB output budget.
const round2='(x=>x===null?null:Math.round(x*100)/100)';

describe('linear script runtime inside the unchanged limits',{timeout:60000},()=>{
 it('leaves the runtime limits exactly as the security contract states them',()=>{
  expect(LIMITS).toEqual({sourceBytes:65536,bars:5000,memoryBytes:16*1024*1024,stackBytes:256*1024,outputBytes:512*1024,computeMilliseconds:1000,inputs:32,requests:4,conditions:32});
 });

 it('runs a 5,000-bar script with 5 TA calls and 2 plots without interrupt, well inside the 1 s budget',async context=>{
  const {result,note}=await timed(context,()=>run(`({onBar(ctx){${FIVE_TA}const q=${round2};ctx.plot('EMA',q(e));ctx.plot('RSI',q(r));ctx.state.last=[s,a,m];}})`));
  expect(result.ok,result.error?.message+' ('+note+')').toBe(true);
  expect(result.value.plots.map((plot:any)=>[plot.title,plot.values.length])).toEqual([['EMA',5000],['RSI',5000]]);
  expect(result.value.state.state.last.every(Number.isFinite)).toBe(true);
  // elapsedMs covers the whole job in the worker: runtime start, input, compute, output checks. The compute
  // limit is 1,000 ms; this asks for 15% of it to spare.
  expect(result.value.elapsedMs,note).toBeLessThan(850);
 });

 it('runs a plain one-plot ctx.sma script over 5,000 bars (measured an interrupt at 3,000)',async context=>{
  const {result,note}=await timed(context,()=>run(`({onBar(ctx){ctx.plot('SMA',ctx.sma('s',ctx.bar.close,20));}})`));
  expect(result.ok,result.error?.message+' ('+note+')').toBe(true);
  expect(result.value.plots[0].values).toHaveLength(5000);expect(result.value.elapsedMs,note).toBeLessThan(850);
 });

 it('at full precision, 5 TA calls and 2 plots over 5,000 bars finish computing: the only refusal left is the unchanged output budget',async context=>{
  const {result,note}=await timed(context,()=>run(`({onBar(ctx){${FIVE_TA}ctx.plot('EMA',e);ctx.plot('RSI',r);}})`));
  if(!result.ok){expect(result.error,note).toEqual({code:'OUTPUT_LIMIT',message:'Script output exceeds 512 KiB.'});}
  else expect(result.value.plots).toHaveLength(2);
 });

 it('snapshot.plots keeps one entry per plot point (its title); the result keeps every value',async()=>{
  const bars=synthetic(6),result=await run(`({onBar(ctx){ctx.plot('A',ctx.index);if(ctx.index%2)ctx.plot('B',-ctx.index,'#112233');}})`,bars);
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.state.plots).toEqual(['A','A','B','A','A','B','A','A','B']);
  expect(result.value.plots).toEqual([
   {id:'lvplot:A',title:'A',color:'#6fa8ff',values:bars.map((bar,index)=>({time:bar.time,value:index}))},
   {id:'lvplot:B',title:'B',color:'#112233',values:[1,3,5].map(index=>({time:bars[index].time,value:-index}))},
  ]);
 });

 it('continues a 1,999-bar snapshot and still refuses replay of any processed bar',async()=>{
  const bars=synthetic(2000),source=`({onBar(ctx){ctx.state.n=(ctx.state.n||0)+1;if(ctx.index%500===0)ctx.alert('k','synthetic');}})`;
  const first=await run(source,bars.slice(0,1999));expect(first.ok,first.error?.message).toBe(true);
  const next=await run(source,bars.slice(1999),{snapshot:first.value.state});
  expect(next.ok,next.error?.message).toBe(true);expect(next.value.state.state.n).toBe(2000);expect(next.value.state.processedIds).toHaveLength(2000);
  // an older bar, the last processed bar (same time), and a processed ID on a newer time: all refused
  for(const bar of [bars[0],bars[1998],{...bars[1999],id:bars[1000].id}]){
   const replay=await run(source,[bar],{snapshot:first.value.state});
   expect(replay).toMatchObject({ok:false,error:{message:'Replay requires a snapshot before the repeated/corrected bar.'}});
  }
  // a stored dedupe key (here crafted for the next bar) still suppresses that alert; other bars still alert
  const key=JSON.stringify([bars[1999].id,bars[1999].revision,'k']);
  const alerting=`({onBar(ctx){if(ctx.index%100===0||ctx.index===1999)ctx.alert('k','synthetic');}})`,stored=await run(alerting,bars.slice(0,1999));expect(stored.ok,stored.error?.message).toBe(true);
  expect(stored.value.alerts).toHaveLength(20);
  const suppressed=await run(alerting,bars.slice(1999),{snapshot:{...stored.value.state,alertDedupe:[...stored.value.state.alertDedupe,key]}});
  expect(suppressed.ok,suppressed.error?.message).toBe(true);expect(suppressed.value.alerts).toEqual([]);
  const plain=await run(alerting,bars.slice(1999),{snapshot:stored.value.state});expect(plain.value.alerts).toHaveLength(1);
 });

 it('ctx.sma and the ctx.ta window kernels give the sequential values across many ring wraps',async()=>{
  const bars=synthetic(400);
  const result=await run(`({onBar(ctx){const c=ctx.bar.close;ctx.plot('sma7',ctx.sma('k',c,7));ctx.plot('ta7',ctx.ta.sma('t',c,7));ctx.plot('sd7',ctx.ta.stdev('d',c,7));ctx.plot('wma7',ctx.ta.wma('w',c,7));}})`,bars);
  expect(result.ok,result.error?.message).toBe(true);
  const closes=bars.map(bar=>bar.close),values=(title:string)=>result.value.plots.find((plot:any)=>plot.title===title).values.map((point:any)=>point.value);
  // the pre- arithmetic, step by step: running sum for ctx.sma, a fresh oldest-to-newest pass for the windows
  let sum=0;const kept:number[]=[],sma:Array<number|null>=[],ta:Array<number|null>=[],sd:Array<number|null>=[],wma:Array<number|null>=[];
  closes.forEach((close,index)=>{kept.push(close);sum+=close;if(kept.length>7){sum-=kept[0];kept.shift();}sma.push(kept.length===7?sum/7:null);
   const w=index>=6?closes.slice(index-6,index+1):null;
   ta.push(w?w.reduce((a,b)=>a+b,0)/7:null);
   wma.push(w?w.reduce((a,b,k)=>a+b*(k+1),0)/28:null);
   if(!w){sd.push(null);return;}const origin=w[0];let offset=0;for(const x of w)offset+=x-origin;offset/=7;let s=0;for(const x of w){const d=(x-origin)-offset;s+=d*d;}sd.push(Math.sqrt(Math.max(0,s/7)));});
  expect(values('sma7')).toEqual(sma);expect(values('ta7')).toEqual(ta);expect(values('wma7')).toEqual(wma);expect(values('sd7')).toEqual(sd);
  const accumulator=result.value.state.ta.k;
  expect(accumulator).toEqual({length:7,values:closes.slice(-7),sum});
 });

 it('guest tampering with Set, Object and Map providers before the runner changes no replay, dedupe or plot result',async()=>{
  const bars=synthetic(40),body=`ctx.plot('c',ctx.ta.sma('t',ctx.bar.close,3));ctx.plot('s',ctx.sma('k',ctx.bar.close,4));ctx.alert('a','m');ctx.alert('a','again');`;
  const tamper=`const fail=()=>{throw 'guest provider invoked';};
   Set.prototype.has=()=>false;Set.prototype.add=fail;Map.prototype.get=fail;Map.prototype.set=fail;Object.create=fail;Object.defineProperty=fail;Object.getOwnPropertyDescriptor=fail;Reflect.apply=fail;String.prototype.charCodeAt=fail;`;
  const clean=await run(`(()=>{return {onBar(ctx){${body}}};})()`,bars),source=`(()=>{${tamper}return {onBar(ctx){${body}}};})()`,tampered=await run(source,bars);
  expect(clean.ok,clean.error?.message).toBe(true);expect(tampered.ok,tampered.error?.message).toBe(true);
  expect(tampered.value.plots).toEqual(clean.value.plots);expect(tampered.value.alerts).toEqual(clean.value.alerts);expect(tampered.value.alerts).toHaveLength(40);
  expect({...tampered.value.state,scriptHash:null}).toEqual({...clean.value.state,scriptHash:null});
  // the same tampering source, continued: a processed bar is still refused, the next one still runs
  const head=await run(source,bars.slice(0,39));expect(head.ok,head.error?.message).toBe(true);
  expect(await run(source,bars.slice(38,39),{snapshot:head.value.state})).toMatchObject({ok:false,error:{message:'Replay requires a snapshot before the repeated/corrected bar.'}});
  const tail=await run(source,bars.slice(39),{snapshot:head.value.state});expect(tail.ok,tail.error?.message).toBe(true);
  expect(tail.value.plots.map((plot:any)=>plot.values[0])).toEqual(clean.value.plots.map((plot:any)=>plot.values[39]));
 });
});
