import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {compileLVScript,LVSCRIPT_TA_FUNCTIONS} from '../../src/ui/script-editor-commands';

// The added ctx.ta functions, run through the real restricted worker (electron/script-jobs.cjs) on
// small SYNTHETIC bars. Every expected value below is computed by hand from the definition written next to it.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
type Row={id:string;revision:number;time:number;open:number;high:number;low:number;close:number;volume:number};
/** Synthetic bars from [high, low, close, volume] rows; open is the close of the row before (the first opens at its close). */
function synthetic(rows:readonly (readonly number[])[]):Row[]{
 return rows.map(([high,low,close,volume=100],i)=>{const open=i?rows[i-1][2]:close;return{id:'synthetic-r40-'+i,revision:1,time:1_700_000_000+i*60,open:Math.min(Math.max(open,low),high),high,low,close,volume};});
}
/** n flat synthetic bars, for functions that read a value array instead of the bar. */
const flat=(n:number)=>synthetic(Array.from({length:n},()=>[11,9,10,100]));
async function run(source:string,bars:Row[]){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-r40-ta',source,bars});}finally{jobs.close();}}
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

describe(' moving averages',()=>{
 it('dema and tema chain the OpenCandle ema (first value seeds; alpha 2 / (n + 1))',async()=>{
  // n = 3, alpha 0.5. e1 = 1, 1.5, 2.25, 3.125; e2 = 1, 1.25, 1.75, 2.4375; e3 = 1, 1.125, 1.4375, 1.9375.
  const out=await plots(`ctx.plot('dema', ctx.ta.dema('d', x, 3)); ctx.plot('tema', ctx.ta.tema('t', x, 3));`,flat(4),[1,2,3,4]);
  near(out.dema,[1,1.75,2.75,3.8125],'dema');near(out.tema,[1,1.875,2.9375,4],'tema');
 });
 it('alma weights the window with a Gaussian centred at offset x (n - 1), width n / sigma',async()=>{
  // n = 3, offset 0.5, sigma 1: m = 1, s = 3, weights exp(-(i - 1)^2 / 18) = w, 1, w with w = exp(-1/18), oldest first.
  const w=Math.exp(-1/18),expect3=(a:number,b:number,c:number)=>(a*w+b+c*w)/(2*w+1);
  // floor = true with offset 0.85: m = floor(1.7) = 1, the same centre; floor = false: m = 1.7, s = 3.
  const g=(i:number)=>Math.exp(-((i-1.7)**2)/18),skew=(1*g(0)+2*g(1)+6*g(2))/(g(0)+g(1)+g(2));
  const out=await plots(`ctx.plot('a', ctx.ta.alma('a', x, 3, 0.5, 1)); ctx.plot('f', ctx.ta.alma('f', x, 3, 0.85, 1, true)); ctx.plot('k', ctx.ta.alma('k', x, 3, 0.85, 1));`,flat(4),[1,2,6,3]);
  near(out.a,[null,null,expect3(1,2,6),expect3(2,6,3)],'alma');near(out.f,[null,null,expect3(1,2,6),expect3(2,6,3)],'alma floor');near(out.k.slice(0,3),[null,null,skew],'alma offset 0.85');
 });
 it('swma is (x[3] + 2 x[2] + 2 x[1] + x) / 6',async()=>{
  const out=await plots(`ctx.plot('s', ctx.ta.swma('s', x));`,flat(5),[6,12,0,6,18]);
  near(out.s,[null,null,null,(6+24+0+6)/6,(12+0+12+18)/6],'swma');
 });
 it('linreg is the least-squares line over the window, read at x = n - 1 - offset',async()=>{
  // window 1, 2, 4 at x = 0, 1, 2: slope 1.5, intercept 5/6; x = 2 gives 23/6, offset 1 gives 7/3. Next window 2, 4, 4: slope 1, intercept 7/3.
  const out=await plots(`ctx.plot('l', ctx.ta.linreg('l', x, 3)); ctx.plot('o', ctx.ta.linreg('o', x, 3, 1));`,flat(4),[1,2,4,4]);
  near(out.l,[null,null,23/6,13/3],'linreg');near(out.o,[null,null,7/3,10/3],'linreg offset');
 });
 it('vwap accumulates source x volume over volume from the last reset, with optional deviation bands',async()=>{
  const bars=synthetic([[11,9,10,100],[13,11,12,300],[21,19,20,50]]);
  // bar 1: (10 x 100 + 12 x 300) / 400 = 11.5; variance 53200 / 400 - 11.5^2 = 0.75. bar 2 resets: 20, deviation 0.
  const out=await plots(`ctx.plot('v', ctx.ta.vwap('v', b.close, ctx.index === 2)); const band = ctx.ta.vwap('b', b.close, ctx.index === 2, 2); ctx.plot('u', band.upper); ctx.plot('d', band.lower); ctx.plot('m', band.vwap);`,bars);
  near(out.v,[10,11.5,20],'vwap');near(out.m,[10,11.5,20],'vwap bands basis');near(out.u,[10,11.5+2*Math.sqrt(0.75),20],'vwap upper');near(out.d,[10,11.5-2*Math.sqrt(0.75),20],'vwap lower');
 });
});

describe(' oscillators',()=>{
 it('wpr is 100 x (close - highest high) / (highest high - lowest low); a flat range is null',async()=>{
  const bars=synthetic([[10,8,9],[11,9,10],[12,10,12],[10,10,10],[10,10,10]]);
  // bar 1: 100 x (10 - 11) / (11 - 8); bar 2: 0; bar 3: 100 x (10 - 12) / (12 - 10) = -100; bar 4: high 10, low 10 is flat.
  const out=await plots(`ctx.plot('w', ctx.ta.wpr('w', 2));`,bars);
  near(out.w,[null,-100/3,0,-100,null],'wpr');
 });
 it('cmo is 100 x (sum of gains - sum of losses) / (their total) over n changes',async()=>{
  const out=await plots(`ctx.plot('c', ctx.ta.cmo('c', x, 2));`,flat(5),[1,3,2,2,2]);
  // changes: -, 2, -1, 0, 0. bar 2: (2 - 1) / 3; bar 3: (0 - 1) / 1; bar 4: no movement is null.
  near(out.c,[null,null,100/3,-100,null],'cmo');
 });
 it('tsi is the double-smoothed change over the double-smoothed absolute change (a ratio from -1 to 1)',async()=>{
  // changes 1, 2, -1. ema3: 1, 1.5, 0.25 and |.| 1, 1.5, 1.25. short 1 keeps them; short 3 gives 1, 1.25, 0.75 over 1, 1.25, 1.25.
  const out=await plots(`ctx.plot('a', ctx.ta.tsi('a', x, 1, 3)); ctx.plot('b', ctx.ta.tsi('b', x, 3, 3));`,flat(4),[1,2,4,3]);
  near(out.a,[null,1,1,0.2],'tsi short 1');near(out.b,[null,1,1,0.6],'tsi short 3');
 });
 it('percentrank is the percent of the previous n values at or below the current one',async()=>{
  const out=await plots(`ctx.plot('p', ctx.ta.percentrank('p', x, 3));`,flat(5),[1,3,2,5,2]);
  near(out.p,[null,null,null,100,100/3],'percentrank');
 });
 it('cog is -sum(x[i] x (i + 1)) / sum(x) over i = 0 (this bar) to n - 1',async()=>{
  const out=await plots(`ctx.plot('c', ctx.ta.cog('c', x, 3));`,flat(4),[1,2,3,0]);
  near(out.c,[null,null,-10/6,-(0*1+3*2+2*3)/5],'cog');
 });
});

describe(' window statistics',()=>{
 it('median, dev, range and the two percentiles',async()=>{
  const body=`ctx.plot('med', ctx.ta.median('m', x, 4)); ctx.plot('dev', ctx.ta.dev('d', x, 4)); ctx.plot('rng', ctx.ta.range('r', x, 4));
   ctx.plot('nr', ctx.ta.percentile_nearest_rank('n', x, 4, 50)); ctx.plot('nr0', ctx.ta.percentile_nearest_rank('z', x, 4, 0)); ctx.plot('li', ctx.ta.percentile_linear_interpolation('l', x, 4, 50)); ctx.plot('li25', ctx.ta.percentile_linear_interpolation('q', x, 4, 25));`;
  const out=await plots(body,flat(5),[4,1,3,2,10]);
  // window 4, 1, 3, 2: sorted 1, 2, 3, 4; mean 2.5; mean |dev| 1. Window 1, 3, 2, 10: sorted 1, 2, 3, 10; mean 4; |dev| 3, 1, 2, 6 = 3.
  near(out.med,[null,null,null,2.5,2.5],'median');near(out.dev,[null,null,null,1,3],'dev');near(out.rng,[null,null,null,3,9],'range');
  // nearest rank: ceil(0.5 x 4) = rank 2; rank 0 is the lowest. Linear: position p / 100 x (n - 1) = 1.5 and 0.75.
  near(out.nr,[null,null,null,2,2],'nearest rank');near(out.nr0,[null,null,null,1,1],'nearest rank 0');near(out.li,[null,null,null,2.5,2.5],'linear 50');near(out.li25,[null,null,null,1.75,1.75],'linear 25');
 });
 it('median of an odd window is its middle value',async()=>{
  const out=await plots(`ctx.plot('m', ctx.ta.median('m', x, 3));`,flat(3),[9,1,5]);
  near(out.m,[null,null,5],'odd median');
 });
 it('max and min are running extremes of the finite values',async()=>{
  const out=await plots(`ctx.plot('hi', ctx.ta.max('h', x)); ctx.plot('lo', ctx.ta.min('l', x));`,flat(5),[null,3,1,4,2]);
  near(out.hi,[null,3,3,4,4],'max');near(out.lo,[null,3,1,1,1],'min');
 });
});

describe(' band widths',()=>{
 it('bbw is (upper - lower) / basis of the OpenCandle Bollinger bands; kcw the same for Keltner channels',async()=>{
  // window 1, 2, 3: basis 2, population deviation sqrt(2/3); multiplier 2: width 4 sqrt(2/3) / 2.
  const out=await plots(`ctx.plot('w', ctx.ta.bbw('w', x, 3, 2));`,flat(3),[1,2,3]);
  near(out.w,[null,null,2*Math.sqrt(2/3)],'bbw');
  // kc with n = 1 (alpha 1): basis = close, width = true range. Bars: TR 2, then max(2, |12 - 10|, |10 - 10|) = 2.
  const bars=synthetic([[11,9,10],[12,10,11]]);
  const kc=await plots(`ctx.plot('k', ctx.ta.kcw('k', b.close, 1, 1.5)); ctx.plot('hl', ctx.ta.kcw('h', b.close, 1, 1, false));`,bars);
  near(kc.k,[2*1.5*2/10,2*1.5*2/11],'kcw');near(kc.hl,[2*2/10,2*2/11],'kcw high-low');
 });
});

describe(' trend systems',()=>{
 it('sar follows the Wilder parabolic stop and reverse',async()=>{
  const bars=synthetic([[10,8,9],[11,9,10.5],[12,10,11.5],[12.5,11,12],[11,7,7.5],[8,6,6.5]]);
  // Hand trace (start 0.02, step 0.02, max 0.2): bar 1 rises, so the stop starts at the prior low 8 with extreme 11;
  // 8.06 is capped at low[1] = 8. Bar 2: 8.06, new high 12 (af 0.04), capped at 8. Bar 3: 8 + 0.04 x 4 = 8.16, af 0.06.
  // Bar 4: 8.4204 is above the low 7, so it reverses to the extreme 12.5. Bar 5: 12.39, raised to high[2] = 12.5.
  const out=await plots(`ctx.plot('s', ctx.ta.sar('s', 0.02, 0.02, 0.2));`,bars);
  near(out.s,[null,8,8,8.16,12.5,12.5],'sar');
 });
 it('supertrend bands hl2 +/- factor x the OpenCandle atr and flips direction (-1 up, 1 down)',async()=>{
  const bars=synthetic([[10,8,9],[11,9,10],[13,11,12.5],[12,10,10.5],[10,7,7.5]]);
  // atr 2: null, 2, 2.5, 2.5, 3. Bands (upper, lower): (12, 8), (12, 9.5), (13.5, 9.5), (11.5, 9.5).
  const out=await plots(`const s = ctx.ta.supertrend('s', 1, 2); ctx.plot('v', s.value); ctx.plot('d', s.direction);`,bars);
  near(out.v,[null,12,9.5,9.5,11.5],'supertrend');near(out.d,[null,1,-1,-1,1],'direction');
 });
});

describe(' volume accumulators and sources',()=>{
 it('accdist and pvt',async()=>{
  const bars=synthetic([[12,8,11,100],[12,10,10,200],[10,10,10,50],[15,10,15,10]]);
  // accdist: (2c - l - h) / (h - l) x v: 0.5 x 100 = 50; -1 x 200 = -200; flat bar 0; 1 x 10 = 10.
  // pvt: (change / prior close) x volume: -, -1/11 x 200, 0, 0.5 x 10.
  const out=await plots(`ctx.plot('ad', ctx.ta.accdist('a')); ctx.plot('pvt', ctx.ta.pvt('p'));`,bars);
  near(out.ad,[50,-150,-150,-140],'accdist');near(out.pvt,[null,-200/11,-200/11,-200/11+5],'pvt');
 });
 it('ctx.ta.source reads one price source of the current bar',async()=>{
  const bars=synthetic([[12,8,11,100]]);
  const out=await plots(`for (const name of ['open','high','low','close','hl2','hlc3','ohlc4','hlcc4']) ctx.plot(name, ctx.ta.source(name));`,bars);
  // open 11 (its own close), high 12, low 8, close 11.
  expect(Object.fromEntries(Object.entries(out).map(([key,value])=>[key,value[0]]))).toEqual({open:11,high:12,low:8,close:11,hl2:10,hlc3:31/3,ohlc4:42/4,hlcc4:42/4});
 });
});

describe(' argument rules and the editor list',()=>{
 it('refuses bad lengths, sigma and percentages with a clear message',async()=>{
  for(const [call,text] of [["ctx.ta.alma('a', 1, 3, 0.85, 0)",'sigma'],["ctx.ta.percentile_nearest_rank('p', 1, 3, 101)",'percentage'],["ctx.ta.median('m', 1, 0)",'length'],["ctx.ta.sar('s', -1, 0.02, 0.2)",'start'],["ctx.ta.supertrend('s', 0, 10)",'factor'],["ctx.ta.source('volume2')",'source']] as const){
   const result=await run(`({ onBar(ctx) { ${call}; } })`,flat(1));expect(result.ok,call).toBe(false);expect(result.error.message,call).toContain(text);
  }
 });
 it('keys keep their parameters like every other ctx.ta function',async()=>{
  const result=await run(`({ onBar(ctx) { ctx.ta.alma('a', 1, ctx.index ? 4 : 3); } })`,flat(2));
  expect(result.ok).toBe(false);expect(result.error.message).toContain('changed');
 });
 it('the editor check knows every new function',()=>{
  const added=['alma','dema','tema','swma','linreg','vwap','wpr','cmo','tsi','percentrank','cog','median','dev','range','percentile_nearest_rank','percentile_linear_interpolation','max','min','bbw','kcw','sar','supertrend','accdist','pvt','source'];
  for(const name of added)expect(LVSCRIPT_TA_FUNCTIONS,name).toContain(name);
  const result=compileLVScript(`({onBar(ctx){${added.map(name=>`ctx.ta.${name};`).join('')}}})`);
  expect(result.diagnostics.filter(row=>row.code==='UNKNOWN_API')).toEqual([]);
 });
});
