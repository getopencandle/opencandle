import {expect,it} from 'vitest';
import {calculateIndicator,sourceValues,standardDeviation,stochastic,vwap,indicatorCalculationWork} from '../../src/domain/indicators';
import {assertIndicatorBatchBudget} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';

const maximum=Number.MAX_VALUE,minimum=Number.MIN_VALUE;
const bar=(value:number,index=0):Bar=>({time:1700000000+index*60,open:value,high:value,low:value,close:value,volume:3+index});

it.each(['hl2','hlc3','ohlc4'] as const)('finite identical MAX OHLC keeps the finite %s average',source=>{
 expect(sourceValues([bar(maximum)],source)).toEqual([maximum]);
});

it('exceptional four-price averaging retains exact cancellation instead of an overflow gap',()=>{
 const row={...bar(maximum),low:-maximum,close:-maximum};
 expect(sourceValues([row],'ohlc4')).toEqual([0]);
});

it('huge finite stochastic endpoints and interior retain100/0/50 after smoothing',()=>{
 const rows=[maximum,0,maximum/2].map((close,index)=>({...bar(close,index),high:maximum,low:0}));
 expect(stochastic(rows,1,1,1)).toEqual({k:[100,0,50],d:[100,0,50]});
 const result=calculateIndicator('stochastic',rows,{length:1,smoothK:1,smoothD:1});
 expect(result.diagnostics).toEqual([]);expect(result.series.map(row=>row.values)).toEqual([[100,0,50],[100,0,50]]);
});

it.each([2**-600,minimum,3*2**-538])('scaled population deviation retains a representable tiny nonzero spread %s',scale=>{
 expect(standardDeviation([scale,scale*3],2)).toEqual([null,scale]);
});

it.each([[0,minimum],[minimum,minimum*2]])('unrepresentable positive population spread is diagnosed, never silently zero or one quantum: %s',(...values)=>{
 expect(()=>standardDeviation(values,2)).toThrow(/underflow|represent|unavailable/i);
 const result=calculateIndicator('bb',values.map((value,index)=>bar(value,index)),{length:2,multiplier:1});
 expect(result.series).toEqual([]);expect(result.diagnostics.join(' ')).toMatch(/underflow|represent|unavailable/i);
});

it('constant tiny values keep exact zero deviation without an unavailable diagnostic',()=>{
 expect(standardDeviation([minimum,minimum],2)).toEqual([null,0]);
});

it('legacy VWAP omitted and explicit1 keep original overflow-source gaps',()=>{
 const rows=[bar(maximum)];expect(vwap(rows,undefined,'hlc3')).toEqual([null]);
 for(const inputs of [{source:'hlc3'},{source:'hlc3',kernelVersion:1}]){
  const result=calculateIndicator('vwap',rows,inputs);expect(result.diagnostics).toEqual([]);expect(result.series[0].values).toEqual([null]);
 }
});

it('Volume numerical outputs do not depend on unused missing prices or directional presentation availability',()=>{
 const rows=[0,1].map(index=>({...bar(NaN,index)}));
 const result=calculateIndicator('volume',rows,{length:1});
 expect(result.diagnostics).toEqual([]);expect(result.series.map(row=>row.values)).toEqual([[3,4],[3,4]]);
});

it('still diagnoses finite stochastic denominator overflow instead of smoothing it into silent gaps',()=>{
 const result=calculateIndicator('stochastic',[{...bar(0),high:maximum,low:-maximum}],{length:1,smoothK:1,smoothD:1});
 expect(result.series).toEqual([]);expect(result.diagnostics.length).toBeGreaterThan(0);
});

it('rejects expensive calculator work before reading any bar price or volume',()=>{
 let reads=0;const rows=Array<Bar>(100000);Object.defineProperty(rows,'0',{get(){reads++;throw Error('SYNTHETIC forbidden preflight bar read');},enumerable:true,configurable:true});
 const result=calculateIndicator('bb',rows,{length:20});
 expect(reads).toBe(0);expect(result.series).toEqual([]);expect(result.diagnostics.join(' ')).toMatch(/estimated operations|local.*limit/);
});

it('real aggregate admission includes native output work beyond the calculator-only SMA estimate',()=>{
 expect(indicatorCalculationWork('sma',100000,{length:9})).toBe(9600000);
 const item={kind:'sma' as const,inputs:{length:9}};
 expect(assertIndicatorBatchBudget([item],100000)).toMatchObject({operations:10800000,numericSlots:300000});
 expect(()=>assertIndicatorBatchBudget(Array.from({length:8},()=>item),100000)).toThrow(/limits/);
 const volume={kind:'volume' as const,inputs:{length:20}};
 expect(assertIndicatorBatchBudget([volume],100000)).toMatchObject({operations:12000000,numericSlots:600000});
 expect(()=>assertIndicatorBatchBudget(Array.from({length:7},()=>volume),100000)).toThrow(/limits/);
});
