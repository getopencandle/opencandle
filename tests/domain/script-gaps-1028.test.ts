import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {pivotLevels} from '../../src/domain/indicators-ext/r23-catalog';

// The added LVScript capabilities, run through the real restricted worker on SYNTHETIC bars.
// Oracles: Node's Intl time-zone database for ctx.calendar, the LV built-in Pivot Points formulas for
// pivot_point_levels, and plain reference loops (written here from each definition) for the volume functions.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
type Row={id:string;revision:number;time:number;open:number;high:number;low:number;close:number;volume:number};
function synthetic(rows:readonly (readonly number[])[],start=1_700_000_000,step=60):Row[]{
 return rows.map(([open,high,low,close,volume=100],i)=>({id:'synthetic-gaps-'+i,revision:1,time:start+i*step,open,high,low,close,volume}));
}
const flat=(n:number,start?:number,step?:number)=>synthetic(Array.from({length:n},()=>[10,11,9,10,100]),start,step);
async function run(source:string,bars:Row[]){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-gaps',source,bars});}finally{jobs.close();}}
async function plots(body:string,bars:Row[],values:readonly (number|null)[]=[]){
 const result=await run(`({ onBar(ctx) { const b = ctx.bar, x = ${JSON.stringify(values)}[ctx.index]; ${body} } })`,bars);
 expect(result.ok,result.error?.message).toBe(true);
 return Object.fromEntries(result.value.plots.map((plot:any)=>[plot.title,plot.values.map((point:any)=>point.value)])) as Record<string,(number|null)[]>;
}
function near(actual:readonly (number|null)[]|undefined,expected:readonly (number|null)[],label:string){
 expect(actual,label).toBeDefined();expect(actual!.length,label).toBe(expected.length);
 for(let i=0;i<expected.length;i++){const want=expected[i],got=actual![i];
  if(want===null){expect(got,`${label} bar ${i}`).toBeNull();continue;}
  expect(got,`${label} bar ${i}`).not.toBeNull();expect(Math.abs((got as number)-want),`${label} bar ${i}: ${got} vs ${want}`).toBeLessThanOrEqual(1e-9*Math.max(1,Math.abs(want)));}
}
const BARS=synthetic([[10,12,9,11,100],[11,13,10,12,80],[12,12,8,9,120],[9,10,9,10,60],[10,14,10,13,200],[13,13,11,11,50],[11,12,10,12,90]]);

describe('SCRIPT-GAPS-1028 ta additions',()=>{
 it('fixnan carries the latest finite value and mode takes the most frequent (ties: smallest)',async()=>{
  const out=await plots(`ctx.plot('f', ctx.ta.fixnan('f', x)); ctx.plot('m', ctx.ta.mode('m', x === null ? 0 : x, 4));`,flat(6),[null,3,null,null,5,null]);
  near(out.f,[null,3,3,3,5,5],'fixnan');
  // windows: [0,3,0,0] -> 0; [3,0,0,5] -> 0; [0,0,5,0] -> 0
  near(out.m,[null,null,null,0,0,0],'mode');
  const tie=await plots(`ctx.plot('m', ctx.ta.mode('m', x, 4));`,flat(5),[4,2,2,4,7]);
  near(tie.m,[null,null,null,2,2],'mode tie');
 });
 it('wad, wvad, iii, nvi and pvi match reference loops',async()=>{
  const out=await plots(`ctx.plot('wad', ctx.ta.wad('w')); ctx.plot('wvad', ctx.ta.wvad()); ctx.plot('iii', ctx.ta.iii()); ctx.plot('nvi', ctx.ta.nvi('n')); ctx.plot('pvi', ctx.ta.pvi('p'));`,BARS);
  const wad:number[]=[],wvad:(number|null)[]=[],iii:(number|null)[]=[],nvi:number[]=[],pvi:number[]=[];let w=0,n=1,p=1;
  BARS.forEach((b,i)=>{const q=BARS[i-1];
   if(q){if(b.close>q.close)w+=b.close-Math.min(b.low,q.close);else if(b.close<q.close)w+=b.close-Math.max(b.high,q.close);
    const r=(b.close-q.close)/q.close;if(b.volume<q.volume)n+=r*n;if(b.volume>q.volume)p+=r*p;}
   wad.push(w);nvi.push(n);pvi.push(p);
   wvad.push(b.high===b.low?null:(b.close-b.open)/(b.high-b.low)*b.volume);
   iii.push(b.high===b.low?null:(2*b.close-b.high-b.low)/((b.high-b.low)*b.volume));});
  near(out.wad,wad,'wad');near(out.wvad,wvad,'wvad');near(out.iii,iii,'iii');near(out.nvi,nvi,'nvi');near(out.pvi,pvi,'pvi');
 });
 it('pivot_point_levels equals the built-in Pivot Points formulas for every type',async()=>{
  // Anchors at bars 0, 3 and 5: period A = bars 0-2, period B = bars 3-4.
  const anchors=[true,false,false,true,false,true,false];
  for(const type of ['Traditional','Fibonacci','Woodie','Classic','DM','Camarilla']){
   const result=await run(`({ onBar(ctx) { const a = ${JSON.stringify(anchors)}[ctx.index]; const l = ctx.ta.pivot_point_levels('p', '${type}', a); const d = ctx.ta.pivot_point_levels('d', '${type}', a, true); for (let i = 0; i < 11; i++) { ctx.plot('l' + i, l[i]); ctx.plot('d' + i, d[i]); } } })`,BARS);
   expect(result.ok,result.error?.message).toBe(true);
   const got=Object.fromEntries(result.value.plots.map((plot:any)=>[plot.title,plot.values.map((point:any)=>point.value)]));
   const order=['p','r1','s1','r2','s2','r3','s3','r4','s4','r5','s5'] as const;
   const agg=(from:number,to:number)=>({open:BARS[from].open,high:Math.max(...BARS.slice(from,to+1).map(b=>b.high)),low:Math.min(...BARS.slice(from,to+1).map(b=>b.low)),close:BARS[to].close});
   const want=(levels:Record<string,number>|null)=>order.map(k=>levels&&Number.isFinite(levels[k])?levels[k]:null);
   const A=agg(0,2),B=agg(3,4);
   const settled=[null,null,null,want(pivotLevels(type,A,BARS[3].open)),want(pivotLevels(type,A,BARS[3].open)),want(pivotLevels(type,B,BARS[5].open)),want(pivotLevels(type,B,BARS[5].open))];
   const developing=[[0,0],[0,1],[0,2],[3,3],[3,4],[5,5],[5,6]].map(([f,t])=>{const c=agg(f,t);return want(pivotLevels(type,c,c.open));});
   for(let k=0;k<11;k++){
    near(got['l'+k],settled.map(row=>row===null?null:row[k]),`${type} level ${order[k]}`);
    near(got['d'+k],developing.map(row=>row[k]),`${type} developing ${order[k]}`);
   }
  }
 });
 it('pivot_point_levels refuses an unknown type',async()=>{
  const result=await run(`({ onBar(ctx) { ctx.ta.pivot_point_levels('p', 'Weekly', true); } })`,flat(1));
  expect(result.ok).toBe(false);expect(result.error.message).toContain('Traditional');
 });
});

describe('SCRIPT-GAPS-1028 calendar and sessions',()=>{
 const zones=['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Berlin','Australia/Sydney','Asia/Tokyo','Asia/Kolkata'];
 // Synthetic sample instants: every 31 hours 13 minutes across 2023-2025 (covers every daylight transition),
 // plus the exact US and EU transition instants of 2024 and a 2005 (old US rule) sample.
 const samples:number[]=[];for(let t=1_672_531_200;t<1_767_225_600;t+=31*3600+13*60+17)samples.push(t);
 samples.push(1_710_054_000-1,1_710_054_000,1_730_613_600-1,1_730_613_600,1_711_846_800-1,1_711_846_800,1_729_990_800-1,1_729_990_800,1_112_000_000,1_130_000_000,1_131_000_000);
 const oracle=(t:number,tz:string)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',weekday:'short'}).formatToParts(new Date(t*1000)).map(p=>[p.type,p.value]));
  return [Number(parts.year),Number(parts.month),Number(parts.day),['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday)+1,Number(parts.hour),Number(parts.minute),Number(parts.second)];};
 it('ctx.calendar matches the Intl time-zone database in every supported named zone',async()=>{
  const result=await run(`({ onBar(ctx) { if (ctx.index > 0) return; const zones = ${JSON.stringify(zones)}, times = ${JSON.stringify(samples)}; ctx.state.rows = []; for (const z of zones) for (const t of times) { const c = ctx.calendar(t, z); ctx.state.rows.push([c.year, c.month, c.dayofmonth, c.dayofweek, c.hour, c.minute, c.second]); } } })`,flat(1));
  expect(result.ok,result.error?.message).toBe(true);
  const rows=result.value.state.state.rows as number[][];let k=0;
  for(const z of zones)for(const t of samples){expect(rows[k++],`${z} ${t}`).toEqual(oracle(t,z));}
 });
 it('ctx.calendar defaults to the bar time in UTC and accepts fixed offsets',async()=>{
  // 2024-01-01T00:00:00Z is a Monday.
  const result=await run(`({ onBar(ctx) { ctx.state.a = ctx.calendar(); ctx.state.b = ctx.calendar(ctx.bar.time, 'UTC-05:30'); ctx.state.c = ctx.calendar(ctx.bar.time, '+0900'); } })`,flat(1,1_704_067_200));
  expect(result.ok,result.error?.message).toBe(true);
  expect(result.value.state.state.a).toEqual({year:2024,month:1,dayofmonth:1,dayofweek:2,dayofyear:1,hour:0,minute:0,second:0,offset:0});
  expect(result.value.state.state.b).toMatchObject({year:2023,month:12,dayofmonth:31,dayofweek:1,dayofyear:365,hour:18,minute:30,offset:-330});
  expect(result.value.state.state.c).toMatchObject({hour:9,offset:540});
  const bad=await run(`({ onBar(ctx) { ctx.calendar(ctx.bar.time, 'Mars/Olympus'); } })`,flat(1));
  expect(bad.ok).toBe(false);expect(bad.error.message).toContain('not supported');
 });
 it('ctx.insession follows the New York regular session across a daylight change, with days and overnight ranges',async()=>{
  // 30-minute synthetic bars from 2024-03-08 12:00Z (Friday) for four days: covers the 2024-03-10 US change.
  const bars=flat(4*48,1_709_899_200,1800);
  const result=await run(`({ onBar(ctx) { ctx.plot('rth', ctx.insession('0930-1600:23456', 'America/New_York') ? 1 : 0); ctx.plot('night', ctx.insession('1800-0200', 'UTC') ? 1 : 0); ctx.plot('all', ctx.insession('24x7') ? 1 : 0); } })`,bars);
  expect(result.ok,result.error?.message).toBe(true);
  const got=Object.fromEntries(result.value.plots.map((plot:any)=>[plot.title,plot.values.map((point:any)=>point.value)]));
  const ny=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',hour:'numeric',minute:'numeric',weekday:'short'});
  const rth=bars.map(b=>{const p=Object.fromEntries(ny.formatToParts(new Date(b.time*1000)).map(x=>[x.type,x.value])),m=Number(p.hour)*60+Number(p.minute);return ['Mon','Tue','Wed','Thu','Fri'].includes(p.weekday)&&m>=570&&m<960?1:0;});
  expect(got.rth).toEqual(rth);
  expect(rth.filter(v=>v).length).toBe(2*13);// Friday and Monday regular sessions, 13 half hours each
  expect(got.night).toEqual(bars.map(b=>{const m=Math.floor((b.time%86400)/60);return m>=1080||m<120?1:0;}));
  expect(got.all.every((v:number)=>v===1)).toBe(true);
  const bad=await run(`({ onBar(ctx) { ctx.insession('9:30-16:00'); } })`,flat(1));
  expect(bad.ok).toBe(false);expect(bad.error.message).toContain('HHMM-HHMM');
 });
});

describe('SCRIPT-GAPS-1028 ctx helpers',()=>{
 it('barstate marks the first and last processed bar; nz replaces null, undefined and NaN',async()=>{
  const out=await plots(`ctx.plot('first', ctx.barstate.isfirst ? 1 : 0); ctx.plot('last', ctx.barstate.islast ? 1 : 0); ctx.plot('nz', ctx.nz(x)); ctx.plot('nz5', ctx.nz(x, 5));`,flat(4),[null,2,NaN as unknown as number,3]);
  expect(out.first).toEqual([1,0,0,0]);expect(out.last).toEqual([0,0,0,1]);
  // JSON turns NaN into null; both are replaced.
  expect(out.nz).toEqual([0,2,0,3]);expect(out.nz5).toEqual([5,2,5,3]);
 });
 it('barstate cannot be replaced by the guest',async()=>{
  const result=await run(`({ onBar(ctx) { Object.defineProperty(ctx, 'barstate', { get() { return 1; } }); } })`,flat(1));
  expect(result.ok).toBe(false);
 });
 it('plotarrow draws up arrows below and down arrows above, nothing for zero or null',async()=>{
  const result=await run(`({ onBar(ctx) { const x = [1, -2, 0, null, 3][ctx.index]; ctx.plotarrow('Flow', x, { colorup: '#00aa00', colordown: '#aa0000' }); } })`,flat(5));
  expect(result.ok,result.error?.message).toBe(true);
  const markers=result.value.visuals.markers;
  expect(markers.map((row:any)=>[row.title,row.shape,row.location,row.color])).toEqual([['Flow','arrowup','belowbar','#00aa00'],['Flow','arrowdown','abovebar','#aa0000'],['Flow','arrowup','belowbar','#00aa00']]);
  const bad=await run(`({ onBar(ctx) { ctx.plotarrow('Flow', 'up'); } })`,flat(1));
  expect(bad.ok).toBe(false);
 });
 it('a keyed ta series can be advanced only on chosen bars (the higher-timeframe recipe)',async()=>{
  // Advance an SMA(2) only on every third bar, as a script does once per completed higher-timeframe bar.
  const out=await plots(`if (ctx.index % 3 === 2) ctx.state.avg = ctx.ta.sma('gated', x, 2); ctx.plot('avg', ctx.nz(ctx.state.avg, null));`,flat(9),[1,1,4,1,1,8,1,1,2]);
  near(out.avg,[null,null,null,null,null,6,6,6,5],'gated sma');
 });
});
