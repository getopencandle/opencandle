// A Bar Replay step back or forward inside history already calculated is answered from the recorded
// values (prefix path) and is exactly the reference calculation. SYNTHETIC data throughout.
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import type {Bar} from '../../src/domain/types';

function rng(seed:number){let state=seed>>>0||1;return()=>{state^=state<<13;state>>>=0;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};}
function syntheticBars(count:number,seed:number):Bar[]{
 const next=rng(seed);let close=100;
 return Array.from({length:count},(_,index)=>{close=Math.max(0.01,close+(next()-0.5)*2);const open=close+(next()-0.5),high=Math.max(open,close)+next(),low=Math.min(open,close)-next();return{time:1700000000+index*86400,open,high,low,close,volume:Math.floor(next()*1000)};});
}
function exactly(actual:unknown,expected:unknown,label:string){
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(label+': text differs');
 const walk=(a:unknown,b:unknown,path:string)=>{
  if(typeof b==='number'){if(!Object.is(a,b))throw new Error(`${label} ${path}: ${String(a)} is not ${String(b)}`);return;}
  if(b&&typeof b==='object'){expect(Object.keys(a as object)).toEqual(Object.keys(b as object));for(const key of Object.keys(b as object))walk((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],path+'.'+key);return;}
  expect(a).toBe(b);
 };
 walk(actual,expected,'$');
}
const configurations:Array<[IndicatorId,Record<string,unknown>]>=[
 ['sma',{length:9,source:'close'}],['sma',{length:20,source:'ohlc4',smoothingType:'SMA+BB',smoothingLength:5,smoothingMultiplier:2}],['ema',{length:50,source:'hlc3'}],
 ['rsi',{length:14,source:'close'}],['rsi',{length:7,source:'open',smoothingType:'EMA',smoothingLength:3,smoothingMultiplier:2}],['rsi',{length:14,source:'close',divergence:true}],
 ['macd',{fast:12,slow:26,signal:9,source:'close',oscillatorType:'EMA',signalType:'EMA'}],['volume',{length:20}],
 ['bb',{length:20,source:'close',multiplier:2,basisType:'SMA'}],['bb',{length:10,source:'close',multiplier:2,basisType:'VWMA'}],
 ['obv',{}],['atr',{length:14,smoothing:'RMA'}],['stochastic',{length:14,smoothK:3,smoothD:3}],
];

describe('FIX-LAYOUT-REPLAY replay prefix path',()=>{
 it('replay walks (back, forward inside the history, forward past it, copies of the bars) match the reference exactly',()=>{
  const full=syntheticBars(400,7);
  for(const [kind,inputs] of configurations){
   const session=createIncrementalIndicatorSession({shared:true}),next=rng(kind.length*31+Object.keys(inputs).length);let cursor=300,prefixes=0;
   const at=(count:number,label:string)=>{const bars=full.slice(0,count).map(bar=>({...bar})),options={resolution:'1D',calendar:'us-equity' as const};exactly(session.calculate(kind,bars,inputs,options),calculateIndicator(kind,bars,inputs,options),`${kind} ${JSON.stringify(inputs)} ${label} ${count}`);if(session.lastMode==='prefix')prefixes++;};
   at(cursor,'start');
   for(let index=0;index<80;index++){const r=next();cursor=Math.max(70,Math.min(full.length,cursor+(r<0.45?-1:r<0.9?1:r<0.95?-12:5)));at(cursor,'step '+index);}
   at(60,'below the minimum');at(cursor,'back');
   const plainOnly=inputs.divergence===true||inputs.basisType==='VWMA';
   if(plainOnly)expect(prefixes).toBe(0);else expect(prefixes,`${kind} ${JSON.stringify(inputs)}`).toBeGreaterThan(20);
  }
 });
 it('a changed bar inside the prefix is never answered from the recorded values',()=>{
  const full=syntheticBars(300,3),inputs={length:9,source:'close'},session=createIncrementalIndicatorSession();
  session.calculate('sma',full,inputs);
  const shorter=full.slice(0,250);shorter[100]={...shorter[100],close:shorter[100].close+1};
  exactly(session.calculate('sma',shorter,inputs),calculateIndicator('sma',shorter,inputs),'changed');expect(session.lastMode).not.toBe('prefix');
  const result=session.calculate('sma',full.slice(0,200),inputs);expect(session.lastMode).not.toBe('prefix');exactly(result,calculateIndicator('sma',full.slice(0,200),inputs),'after');
 });
 it('returns fresh arrays: a caller writing to a prefix result does not change later answers',()=>{
  const full=syntheticBars(300,5),inputs={length:9,source:'close'},session=createIncrementalIndicatorSession();
  session.calculate('sma',full,inputs);const first=session.calculate('sma',full.slice(0,280),inputs);expect(session.lastMode).toBe('prefix');
  (first.series[0].values as (number|null)[])[279]=-1;first.policies.push('note');
  exactly(session.calculate('sma',full.slice(0,280),inputs),calculateIndicator('sma',full.slice(0,280),inputs),'fresh');
 });
});

describe('FIX-LAYOUT-REPLAY resize and replay dock (source checks)',()=>{
 const adapter=readFileSync(new URL('../../src/chart/adapter.ts',import.meta.url),'utf8'),css=readFileSync(new URL('../../src/ui/replay-panel.css',import.meta.url),'utf8');
 it('skips only the host resize that repeats the renderer\'s own resize of the same size in the same delivery',()=>{
  expect(adapter).toMatch(/override resize\(\)\{super\.resize\(\);if\(lvResize\.forwarding\)return;/);
  expect(adapter).toMatch(/resize: \(\) => \{const last=lvResize\.native;lvResize\.native=null;if\(last&&performance\.now\(\)-last\.at<2\)try\{[^\n]*wrapper\.clientWidth===last\.w&&wrapper\.clientHeight===last\.h&&\(window\.devicePixelRatio\|\|1\)===last\.dpr\)return;\}catch\{[^}]*\}lvResize\.forwarding=true;try\{chart\.resize\(\);\}finally\{lvResize\.forwarding=false;\}\},/);
 });
 it('the replay panel rises with transform, so the dock (and the chart) take their final size at once',()=>{
  expect(css).toMatch(/@keyframes lv-replay-in\{from\{opacity:0;transform:translateY\(8px\)\}to\{opacity:1;transform:none\}\}/);
  expect(css).not.toMatch(/lv-replay-in\{[^}]*margin/);
 });
});

describe('FIX-LAYOUT-REPLAY VWAP date recalculation guard (source checks)',()=>{
 const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8'),port=readFileSync(new URL('../../src/chart/indicator-port.ts',import.meta.url),'utf8');
 it('recalculates for VWAP dates except on a chart of date-free built-ins on its own timeframe and a non-derived type',()=>{
  expect(app).not.toContain('try{chart?.indicators.recompute();}catch');
  expect(app.match(/recomputeForVwapDates\(chart\);/g)).toHaveLength(3);
  expect(app).toMatch(/if\(port\.kindsWithin\?\.\(VWAP_DATE_FREE_KINDS\)===true&&!isDerivedStyle\(chart\.getStyle\(\)\)\)return;chart\.indicators\.recompute\(\);/);
  expect(app).not.toMatch(/VWAP_DATE_FREE_KINDS[^\n]*'vwap'/);
  expect(port).toMatch(/kindsWithin\(kinds:readonly string\[\]\)\{for\(const \{model\} of instances\.values\(\)\)if\(!model\.removed&&\(!kinds\.includes\(model\.settings\.kind\)\|\|model\.settings\.presentation\?\.timeframe!==undefined\)\)return false;return true;\}/);
 });
});
