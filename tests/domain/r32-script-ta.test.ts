import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import type {Bar} from '../../src/domain/types';
import {calculateIndicator,ema,rma,sma,wma,vwma,standardDeviation,trueRange} from '../../src/domain/indicators';
import {pearson} from '../../src/domain/indicators-ext/r28-catalog';
import {compileLVScript} from '../../src/ui/script-editor-commands';
import {scriptExamples} from '../../src/ui/ScriptPanel';

// Ctx.ta.* and bar history, run through the real restricted worker (electron/script-jobs.cjs) and
// compared with the app's own indicator kernels on the same SYNTHETIC bars.
const require=createRequire(import.meta.url);
const {ScriptJobs}=require('../../electron/script-jobs.cjs');
type Row={id:string;revision:number;time:number;open:number;high:number;low:number;close:number;volume:number};
/** Deterministic synthetic walk: trends, flat stretches and gaps in direction so every branch is reached. */
function syntheticBars(count:number):Row[]{
 let seed=20261022,close=100;const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
 return Array.from({length:count},(_,i)=>{const open=close;const drift=i%40<15?0.4:i%40<25?-0.5:0;close=Math.round((open+drift+(random()-0.5)*3)*100)/100;if(i>=60&&i<64)close=open;
  const high=Math.max(open,close)+Math.round(random()*150)/100,low=Math.min(open,close)-Math.round(random()*150)/100;return{id:'synthetic-r32-'+i,revision:1,time:1_700_000_000+i*60,open,high,low,close,volume:1000+Math.round(random()*5000)};});
}
const bars=syntheticBars(220);
const domainBars:Bar[]=bars.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume}));
const closes=bars.map(bar=>bar.close);
async function run(source:string,input:Row[]=bars,extra:Record<string,unknown>={}){const jobs=new ScriptJobs();try{return await jobs.run({requestId:'synthetic-r32-ta',source,bars:input,...extra});}finally{jobs.close();}}
async function plots(body:string,input:Row[]=bars){const result=await run(`({ onBar(ctx) { const b = ctx.bar; ${body} } })`,input);expect(result.ok,result.error?.message).toBe(true);
 return Object.fromEntries(result.value.plots.map((plot:any)=>[plot.title,plot.values.map((point:any)=>point.value)])) as Record<string,(number|null)[]>;}
function expectSeries(actual:readonly (number|null)[],expected:readonly (number|null|undefined)[],label:string){
 expect(actual.length,label).toBe(expected.length);
 for(let i=0;i<expected.length;i++){const want=expected[i]??null,got=actual[i];
  if(want===null){expect(got,`${label} bar ${i}`).toBeNull();continue;}
  expect(got,`${label} bar ${i}`).not.toBeNull();expect(Math.abs((got as number)-want),`${label} bar ${i}: ${got} vs ${want}`).toBeLessThanOrEqual(1e-9*Math.max(1,Math.abs(want)));}
}
const series=(id:string,inputs:Record<string,unknown>={},kind=id)=>{const result=calculateIndicator(kind,domainBars,inputs);expect(result.diagnostics).toEqual([]);return Object.fromEntries(result.series.map(row=>[row.id,row.values]));};

describe(' moving averages match the OpenCandle kernels', () => {
 it('sma, ema, rma, wma, vwma and hma', async () => {
  const out=await plots(`ctx.plot('sma', ctx.ta.sma('s', b.close, 20)); ctx.plot('ema', ctx.ta.ema('e', b.close, 10)); ctx.plot('rma', ctx.ta.rma('r', b.close, 14));
   ctx.plot('wma', ctx.ta.wma('w', b.close, 9)); ctx.plot('vwma', ctx.ta.vwma('v', b.close, 20)); ctx.plot('hma', ctx.ta.hma('h', b.close, 9));`);
  expectSeries(out.sma,sma(closes,20),'sma');expectSeries(out.ema,ema(closes,10),'ema');expectSeries(out.rma,rma(closes,14),'rma');expectSeries(out.wma,wma(closes,9),'wma');
  expectSeries(out.vwma,vwma(closes,bars.map(bar=>bar.volume),20),'vwma');expectSeries(out.hma,series('hma',{length:9}).hma,'hma');
 });
});

describe(' oscillators and bands match the OpenCandle built-in indicators', () => {
 it('rsi, macd, stochastic %K and %D, cci and mfi', async () => {
  const out=await plots(`ctx.plot('rsi', ctx.ta.rsi('r', b.close, 14)); const m = ctx.ta.macd('m', b.close, 12, 26, 9); ctx.plot('macd', m.macd); ctx.plot('signal', m.signal); ctx.plot('hist', m.histogram);
   const k = ctx.ta.sma('k', ctx.ta.stoch('st', b.close, b.high, b.low, 14), 3); ctx.plot('k', k); ctx.plot('d', ctx.ta.sma('d', k, 3));
   ctx.plot('cci', ctx.ta.cci('c', b.close, 20)); ctx.plot('mfi', ctx.ta.mfi('f', (b.high + b.low + b.close) / 3, 14));`);
  expectSeries(out.rsi,series('rsi',{length:14}).rsi,'rsi');
  const macd=series('macd');expectSeries(out.macd,macd.macd,'macd');expectSeries(out.signal,macd.signal,'signal');expectSeries(out.hist,macd.histogram,'histogram');
  const stoch=series('stoch',{length:14,smoothK:3,smoothD:3});expectSeries(out.k,stoch.k,'%K');expectSeries(out.d,stoch.d,'%D');
  expectSeries(out.cci,series('cci',{length:20,source:'close'}).cci,'cci');expectSeries(out.mfi,series('mfi',{length:14}).mfi,'mfi');
 });
 it('tr, atr, bb, kc, dmi and obv', async () => {
  const out=await plots(`ctx.plot('tr', ctx.ta.tr(true)); ctx.plot('trna', ctx.ta.tr()); ctx.plot('atr', ctx.ta.atr('a', 14)); const bb = ctx.ta.bb('b', b.close, 20, 2); ctx.plot('basis', bb.basis); ctx.plot('upper', bb.upper); ctx.plot('lower', bb.lower);`),out2=await plots(`const kc = ctx.ta.kc('k', b.close, 20, 1.5); ctx.plot('kcu', kc.upper); ctx.plot('kcl', kc.lower); const d = ctx.ta.dmi('d', 14, 14); ctx.plot('plus', d.plusDI); ctx.plot('minus', d.minusDI); ctx.plot('adx', d.adx); ctx.plot('obv', ctx.ta.obv('o'));`);Object.assign(out,out2);
  expectSeries(out.tr,trueRange(domainBars),'tr');expect(out.trna[0]).toBeNull();expectSeries(out.trna.slice(1),trueRange(domainBars).slice(1),'tr(false)');
  expectSeries(out.atr,series('atr',{length:14}).atr,'atr');
  const bb=series('bb',{length:20,multiplier:2});expectSeries(out.basis,bb.basis,'bb basis');expectSeries(out.upper,bb.upper,'bb upper');expectSeries(out.lower,bb.lower,'bb lower');
  const kc=series('kc',{length:20,multiplier:1.5,exponential:true,bandsStyle:'true range'});expectSeries(out.kcu,kc.upper,'kc upper');expectSeries(out.kcl,kc.lower,'kc lower');
  const dmi=series('dmi',{diLength:14,adxSmoothing:14});expectSeries(out.plus,dmi.plusDI,'+DI');expectSeries(out.minus,dmi.minusDI,'-DI');expectSeries(out.adx,dmi.adx,'ADX');
  expectSeries(out.obv,series('obv').obv,'obv');
 });
 it('mom, roc, stdev, variance, correlation and the window extremes', async () => {
  const out=await plots(`ctx.plot('mom', ctx.ta.mom('m', b.close, 10)); ctx.plot('roc', ctx.ta.roc('r', b.close, 9)); ctx.plot('change', ctx.ta.change('c', b.close)); ctx.plot('stdev', ctx.ta.stdev('s', b.close, 20));
   ctx.plot('var', ctx.ta.variance('v', b.close, 20)); ctx.plot('svar', ctx.ta.variance('u', b.close, 20, false)); ctx.plot('corr', ctx.ta.correlation('x', b.close, b.volume, 20));`),out2=await plots(`ctx.plot('hi', ctx.ta.highest('h', b.high, 10)); ctx.plot('lo', ctx.ta.lowest('l', b.low, 10)); ctx.plot('hib', ctx.ta.highestbars('hb', b.high, 10)); ctx.plot('lob', ctx.ta.lowestbars('lb', b.low, 10));
   ctx.plot('sum', ctx.ta.sum('sum', b.close, 5)); ctx.plot('cum', ctx.ta.cum('cum', b.close));`);Object.assign(out,out2);
  expectSeries(out.mom,series('mom',{length:10}).mom,'mom');expectSeries(out.roc,series('roc',{length:9}).roc,'roc');
  expectSeries(out.change,closes.map((value,i)=>i?value-closes[i-1]:null),'change');
  const deviation=standardDeviation(closes,20);expectSeries(out.stdev,deviation,'stdev');expectSeries(out.var,deviation.map(value=>value===null?null:value*value),'variance');
  expectSeries(out.svar,closes.map((_,i)=>{if(i<19)return null;const w=closes.slice(i-19,i+1),mean=w.reduce((a,b)=>a+b,0)/20;return w.reduce((a,b)=>a+(b-mean)**2,0)/19;}),'sample variance');
  expectSeries(out.corr,closes.map((_,i)=>pearson(closes,bars.map(bar=>bar.volume),i,20)),'correlation');
  const window=(i:number,key:'high'|'low')=>bars.slice(i-9,i+1).map(bar=>bar[key]);
  expectSeries(out.hi,bars.map((_,i)=>i<9?null:Math.max(...window(i,'high'))),'highest');expectSeries(out.lo,bars.map((_,i)=>i<9?null:Math.min(...window(i,'low'))),'lowest');
  // Offsets are 0 or negative; ties pick the most recent bar.
  expectSeries(out.hib,bars.map((_,i)=>{if(i<9)return null;const w=window(i,'high'),best=Math.max(...w);return -(9-w.lastIndexOf(best));}),'highestbars');
  expectSeries(out.lob,bars.map((_,i)=>{if(i<9)return null;const w=window(i,'low'),best=Math.min(...w);return -(9-w.lastIndexOf(best));}),'lowestbars');
  expectSeries(out.sum,closes.map((_,i)=>i<4?null:closes.slice(i-4,i+1).reduce((a,b)=>a+b,0)),'sum');
  expectSeries(out.cum,closes.map((_,i)=>closes.slice(0,i+1).reduce((a,b)=>a+b,0)),'cum');
 });
});

describe(' events and pivots (OpenCandle-defined, hand-computed)', () => {
 const row=(close:number,i:number):Row=>({id:'synthetic-r32-event-'+i,revision:1,time:1000+i*60,open:close,high:close+1,low:close-1,close,volume:10});
 const closesA=[1,2,3,2,1,2,5,4,3,3,4];const eventBars=closesA.map(row);
 it('crossover, crossunder, cross, rising, falling, barssince and valuewhen', async () => {
  const out=await plots(`const up = ctx.ta.crossover('o', b.close, 2.5), down = ctx.ta.crossunder('u', b.close, 2.5);
   ctx.plot('over', up ? 1 : 0); ctx.plot('under', down ? 1 : 0); ctx.plot('cross', ctx.ta.cross('c', b.close, 2.5) ? 1 : 0);
   ctx.plot('rising', ctx.ta.rising('r', b.close, 2) ? 1 : 0); ctx.plot('falling', ctx.ta.falling('f', b.close, 2) ? 1 : 0);
   ctx.plot('since', ctx.ta.barssince('s', up)); ctx.plot('when', ctx.ta.valuewhen('w', up, b.close, 0)); ctx.plot('when1', ctx.ta.valuewhen('w1', up, b.close, 1));`,eventBars);
  expect(out.over).toEqual([0,0,1,0,0,0,1,0,0,0,0]);expect(out.under).toEqual([0,0,0,1,0,0,0,0,0,0,0]);expect(out.cross).toEqual([0,0,1,1,0,0,1,0,0,0,0]);
  expect(out.rising).toEqual([0,0,1,0,0,0,1,0,0,0,1]);expect(out.falling).toEqual([0,0,0,0,1,0,0,0,1,0,0]);
  expect(out.since).toEqual([null,null,0,1,2,3,0,1,2,3,4]);expect(out.when).toEqual([null,null,3,3,3,3,5,5,5,5,5]);expect(out.when1).toEqual([null,null,null,null,null,null,3,3,3,3,3]);
 });
 it('pivots are reported only once the right bars have closed, never on the pivot bar itself', async () => {
  const out=await plots(`ctx.plot('ph', ctx.ta.pivothigh('h', b.close, 2, 2)); ctx.plot('pl', ctx.ta.pivotlow('l', b.close, 2, 2));`,eventBars);
  // Close 3 at bar 2 is a pivot high confirmed at bar 4; 1 at bar 4 a pivot low at bar 6; 5 at bar 6 at bar 8. Equal values never qualify.
  expect(out.ph).toEqual([null,null,null,null,3,null,null,null,5,null,null]);expect(out.pl).toEqual([null,null,null,null,null,null,1,null,null,null,null]);
 });
});

describe(' history access without lookahead', () => {
 it('ctx.history(n) reads only the current and earlier bars, and null before the first bar', async () => {
  const out=await plots(`const p = ctx.history(1), q = ctx.history(3), now = ctx.history(0); ctx.plot('p', p ? p.close : null); ctx.plot('q', q ? q.high : null); ctx.plot('now', now.close);`,bars.slice(0,8));
  expect(out.p).toEqual([null,...closes.slice(0,7)]);expect(out.q).toEqual([null,null,null,...bars.slice(0,5).map(bar=>bar.high)]);expect(out.now).toEqual(closes.slice(0,8));
 });
 it('the last bar value never depends on later bars: every prefix run gives the same values', async () => {
  const source=`const c = ctx.series('c', b.close, 5); ctx.plot('lag', c(2)); ctx.plot('rsi', ctx.ta.rsi('r', b.close, 5)); ctx.plot('ph', ctx.ta.pivothigh('p', b.high, 3, 2)); const h = ctx.history(4); ctx.plot('h', h ? h.low : null);`;
  const full=await plots(source,bars.slice(0,60));
  for(const cut of [20,37,59]){const prefix=await plots(source,bars.slice(0,cut));for(const name of Object.keys(full))expect(prefix[name],name+' at '+cut).toEqual(full[name].slice(0,cut));}
  expect(full.lag.slice(0,4)).toEqual([null,null,closes[0],closes[1]]);
 });
 it('continues history and TA state across snapshots, and refuses depth the snapshot does not keep', async () => {
  const source=`({ onBar(ctx) { const p = ctx.history(2); ctx.plot('p', p ? p.close : null); ctx.plot('ema', ctx.ta.ema('e', ctx.bar.close, 5)); ctx.plot('atr', ctx.ta.atr('a', 3)); } })`;
  const whole=await run(source,bars.slice(0,12)),first=await run(source,bars.slice(0,7));expect(first.ok,first.error?.message).toBe(true);
  const next=await run(source,bars.slice(7,12),{snapshot:first.value.state});expect(next.ok,next.error?.message).toBe(true);
  const values=(result:any,title:string)=>result.value.plots.find((plot:any)=>plot.title===title).values.map((point:any)=>point.value);
  for(const title of ['p','ema','atr'])expect(values(next,title),title).toEqual(values(whole,title).slice(7));
  // A snapshot keeps as many bars as the script reached back so far (here 1); reaching further back from the first
  // continued bar is refused, not guessed.
  const growing=`({ onBar(ctx) { const p = ctx.history(ctx.index < 7 ? 1 : 3); ctx.plot('p', p ? p.close : null); } })`,start=await run(growing,bars.slice(0,7));expect(start.ok).toBe(true);
  const deeper=await run(growing,bars.slice(7,9),{snapshot:start.value.state});expect(deeper.ok).toBe(false);expect(deeper.error.message).toMatch(/snapshot keeps only the last 1/);
 });
 it('ctx.series keeps any computed value, including null gaps and booleans', async () => {
  const out=await plots(`const e = ctx.ta.sma('s', b.close, 3); const s = ctx.series('e', e, 3); ctx.plot('e1', s(1)); const up = ctx.series('up', b.close > b.open, 2); ctx.plot('up1', up(1) === null ? null : up(1) ? 1 : 0);`,[1,2,3,4,5].map((close,i)=>({id:'synthetic-r32-s-'+i,revision:1,time:1000+i,open:i%2?close+1:close-1,high:close+2,low:close-2,close,volume:1})));
  expect(out.e1).toEqual([null,null,null,2,3]);expect(out.up1).toEqual([null,1,0,1,0]);
 });
});

describe(' misuse is an explicit error, never a silent wrong value', () => {
 it('refuses a key updated twice on one bar with different values, changed parameters and bad arguments', async () => {
  const fails=async(body:string,message:RegExp)=>{const result=await run(`({ onBar(ctx) { ${body} } })`,bars.slice(0,5));expect(result.ok,body).toBe(false);expect(result.error.message).toMatch(message);};
  await fails(`ctx.ta.ema('e', ctx.bar.close, 5); ctx.ta.ema('e', ctx.bar.open + 7, 5);`,/already updated on this bar/);
  await fails(`ctx.ta.ema('e', ctx.bar.close, 5 + ctx.index);`,/changed its parameters/);
  await fails(`ctx.ta.sma('s', ctx.bar.close, 0);`,/length must be an integer from 1 to 5000/);
  await fails(`ctx.ta.rsi('', ctx.bar.close, 14);`,/needs a key first/);
  await fails(`ctx.ta.ema('e', NaN, 5);`,/finite number or null/);
  await fails(`ctx.ta.crossover('x', 1, '2');`,/finite number or null/);
  await fails(`ctx.history(501);`,/integer from 0/);
  await fails(`ctx.series('s', 1, 0);`,/depth must be an integer/);
  // The same values twice on one bar return the same result instead of advancing twice.
  const same=await plots(`const a = ctx.ta.ema('e', b.close, 3), c = ctx.ta.ema('e', b.close, 3); ctx.plot('same', a === c ? 1 : 0); ctx.plot('ema', c);`,bars.slice(0,6));
  expect(same.same).toEqual([1,1,1,1,1,1]);expectSeries(same.ema,ema(closes.slice(0,6),3),'repeated ema');
  const init=await run(`({ init(ctx) { ctx.ta.ema('e', 1, 3); }, onBar(ctx) {} })`,bars.slice(0,2));expect(init.ok).toBe(false);
 });
});

describe(' editor knows the new surface', () => {
 it('accepts ctx.ta, history, series and visual members, and warns on an unknown ctx.ta function', () => {
  expect(compileLVScript(scriptExamples['RSI with levels and markers']).diagnostics).toEqual([]);
  const unknown=compileLVScript(`({ onBar(ctx) { ctx.plot('x', ctx.ta.emaa('e', ctx.bar.close, 5)); } })`);
  expect(unknown.diagnostics).toEqual([expect.objectContaining({code:'UNKNOWN_API',severity:'warning',message:expect.stringContaining('ctx.ta.emaa is not part of the CandleScript TA library')})]);
 });
});
