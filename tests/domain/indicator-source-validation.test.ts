import {expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';

const bars:Bar[]=[
 {time:1704067200,open:6,high:12,low:3,close:9,volume:2},
 {time:1704067260,open:12,high:24,low:6,close:18,volume:1},
];

it.each([{}, {kernelVersion:1}])('rejects explicit null VWAP source rather than selecting the default: %j',version=>{
 const result=calculateIndicator('vwap',bars,{...version,source:null});
 expect(result.series).toEqual([]);
 expect(result.diagnostics).toEqual(['Unsupported source: null']);
});

it('rejects an invalid source without reading OHLC fields',()=>{
 let priceReads=0;
 const row={time:1704067200,volume:1} as Bar;
 for(const key of ['open','high','low','close'])Object.defineProperty(row,key,{get(){priceReads++;throw new Error('UNUSED PRICE READ');}});
 const result=calculateIndicator('vwap',[row],{source:null});
 expect(result.series).toEqual([]);
 expect(result.diagnostics).toEqual(['Unsupported source: null']);
 expect(priceReads).toBe(0);
});

it('retains omitted and explicit undefined legacy VWAP defaults and explicit close selection',()=>{
 for(const inputs of [{},{source:undefined},{kernelVersion:1},{kernelVersion:1,source:undefined}]){
  const result=calculateIndicator('vwap',bars,inputs);
  expect(result.diagnostics).toEqual([]);
  expect(result.series[0].values).toEqual([8,32/3]);
 }
 const close=calculateIndicator('vwap',bars,{source:'close'});
 expect(close.diagnostics).toEqual([]);
 expect(close.series[0].values).toEqual([9,12]);
});

it('retains scalar-source validation and explicit undefined close defaults for source-based averages',()=>{
 for(const kind of ['sma','ema','rsi','macd','bb']){
  const invalid=calculateIndicator(kind,bars,{source:null});
  expect(invalid.series).toEqual([]);
  expect(invalid.diagnostics).toEqual(['Unsupported source: null']);
 }
 expect(calculateIndicator('sma',bars,{length:1,source:undefined}).series[0].values).toEqual([9,18]);
});

it('keeps Volume calculation independent of unused OHLC fields',()=>{
 let priceReads=0;
 const volumeBars=[2,4].map(volume=>{
  const row={time:1704067200,volume} as Bar;
  for(const key of ['open','high','low','close'])Object.defineProperty(row,key,{get(){priceReads++;throw new Error('UNUSED VOLUME PRICE READ');}});
  return row;
 });
 const result=calculateIndicator('volume',volumeBars,{length:1});
 expect(result.diagnostics).toEqual([]);
 expect(result.series.map(series=>series.values)).toEqual([[2,4],[2,4]]);
 expect(priceReads).toBe(0);
});
