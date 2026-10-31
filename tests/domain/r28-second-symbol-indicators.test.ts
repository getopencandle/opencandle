import {afterEach,describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {ALL_CATALOG_INDICATOR_IDS,catalogDefinition} from '../../src/domain/indicator-catalog';
import {R28_INDICATOR_IDS,pearson} from '../../src/domain/indicators-ext/r28-catalog';
import {alignSecondCloses,notifySecondSymbols,secondSymbolSeries,setSecondSymbolLoader,subscribeSecondSymbols,type SecondSeries} from '../../src/domain/second-symbol';
import type {Bar} from '../../src/domain/types';

// Second-symbol indicators. All bars are SYNTHETIC fixtures made up for these tests (no market data). Each
// expected value is worked out in the comment next to it.
const D0=19700*86400;
const closes=(values:number[],start=0)=>values.map((close,i)=>({time:D0+(start+i)*86400,open:close,high:close+1,low:close-1,close,volume:100}) as Bar);
const ready=(bars:Bar[]):((symbol:string)=>SecondSeries)=>()=>({bars,state:'ready',message:null});
const run=(kind:string,bars:Bar[],inputs:Record<string,unknown>,second?:(symbol:string)=>SecondSeries)=>calculateIndicator(kind,bars,inputs,{resolution:'1D',...(second?{secondSeries:second}:{})});
const plot=(result:ReturnType<typeof calculateIndicator>,id:string)=>{expect(result.diagnostics).toEqual([]);return result.series.find(row=>row.id===id)!.values;};
afterEach(()=>setSecondSymbolLoader(null));

describe(' second-symbol catalog shape',()=>{
 it('adds three kinds with a Symbol context input (default SPY) and OpenCandle-defined unknowns',()=>{
  expect(R28_INDICATOR_IDS).toEqual(['correlation','relstrength','spread']);
  for(const kind of R28_INDICATOR_IDS){
   expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);
   const definition=catalogDefinition(kind)!;expect(definition.secondSymbol).toBe(true);
   expect(definition.inputs[0]).toMatchObject({key:'symbol',type:'string',defval:'SPY'});
   expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);expect(definition.provenance.length).toBeGreaterThan(0);
  }
  expect(catalogDefinition('correlation')!.inputs[0].title).toBe('Symbol');
  expect(catalogDefinition('relstrength')!.inputs[0].title).toBe('Benchmark');
 });
});

describe(' second-symbol oracles (SYNTHETIC)',()=>{
 it('Correlation coefficient is the Pearson r over Length bars',()=>{
  const chart=closes([1,2,3,4,5]),other=closes([2,4,6,8,10]),inverse=closes([5,4,3,2,1]);
  expect(plot(run('correlation',chart,{length:3},ready(other)),'correlation')).toEqual([null,null,1,1,1]);
  expect(plot(run('correlation',chart,{length:3},ready(inverse)),'correlation')).toEqual([null,null,-1,-1,-1]);
  // x=[1,2,3], y=[1,3,2]: means 2 and 2; cov=(-1)(-1)+0+(1)(0)=1; var x=2, var y=2 -> r=1/2
  expect(plot(run('correlation',closes([1,2,3]),{length:3},ready(closes([1,3,2]))),'correlation')).toEqual([null,null,0.5]);
  // a flat window is unavailable, not 0
  expect(pearson([1,1,1],[1,2,3],2,3)).toBeNull();
 });
 it('Relative strength is the source over the benchmark close, with its SMA',()=>{
  const result=run('relstrength',closes([10,20,30]),{length:2},ready(closes([5,5,10])));
  expect(plot(result,'rs')).toEqual([2,4,3]);// 10/5, 20/5, 30/10
  expect(plot(result,'ma')).toEqual([null,3,3.5]);// (2+4)/2, (4+3)/2
 });
 it('Spread is the source minus Multiplier x the second close',()=>{
  expect(plot(run('spread',closes([10,20]),{multiplier:2},ready(closes([3,4]))),'spread')).toEqual([4,12]);// 10-6, 20-8
  expect(plot(run('spread',closes([10,20]),{},ready(closes([3,4]))),'spread')).toEqual([7,16]);// multiplier 1
 });
 it('aligns on exact bar times: a chart bar without a second-symbol bar is unavailable',()=>{
  const chart=closes([10,20,30]),other=[closes([2],0)[0],closes([5],2)[0]];
  expect(alignSecondCloses(chart,other)).toEqual([2,null,5]);
  expect(plot(run('spread',chart,{},ready(other)),'spread')).toEqual([8,null,25]);
 });
 it('loading, unavailable and invalid symbols are plain diagnostics, never invented values',()=>{
  const chart=closes([1,2,3]);
  expect(run('spread',chart,{},()=>({bars:null,state:'loading',message:'SPY is loading.'})).diagnostics).toEqual(['SPY is loading.']);
  expect(run('spread',chart,{symbol:'GME/'}).diagnostics[0]).toMatch(/^Symbol: The expression ends too early/);
  // no loader installed: the registry says why
  expect(run('correlation',chart,{}).diagnostics[0]).toMatch(/SPY is not loaded/);
 });
 it('the second symbol can be symbol math, passed to the loader in canonical form',()=>{
  const asked:string[]=[];
  run('spread',closes([10]),{symbol:'gme / spy'},symbol=>{asked.push(symbol);return{bars:closes([4]),state:'ready',message:null};});
  expect(asked).toEqual(['GME/SPY']);
 });
});

describe(' second-symbol registry',()=>{
 it('routes lookups to the installed loader at the calculated interval and notifies subscribers',()=>{
  const asked:string[]=[];let calls=0;
  setSecondSymbolLoader({series(symbol,resolution){asked.push(symbol+'@'+resolution);return{bars:closes([3,4]),state:'ready',message:null};}});
  const off=subscribeSecondSymbols(()=>{calls++;});
  expect(plot(run('spread',closes([10,20]),{symbol:'qqq'}),'spread')).toEqual([7,16]);
  expect(asked).toEqual(['QQQ@1D']);
  notifySecondSymbols();expect(calls).toBe(1);off();notifySecondSymbols();expect(calls).toBe(1);
  expect(secondSymbolSeries('QQQ',null).message).toMatch(/interval is unknown/);
  setSecondSymbolLoader({series(){throw new Error('Alpaca is off.');}});
  expect(secondSymbolSeries('QQQ','1D')).toEqual({bars:null,state:'unavailable',message:'Alpaca is off.'});
 });
});
