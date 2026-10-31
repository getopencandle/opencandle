import {expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';
import {validateFrozenIndicatorInputs,validateIndicatorInputs,defaultIndicatorPresentation,validateIndicatorPresentation} from '../../src/chart/indicator-settings';
const bars=(values:number[],volumes=values.map(()=>1)):Bar[]=>values.map((close,index)=>({time:1700000000+index*86400,open:close,high:close,low:close,close,volume:volumes[index]}));
it('uses the unshifted base SMA for addon smoothing and population bands with independent literal values',()=>{
 const result=calculateIndicator('sma',bars([3,9,6,12]),{length:2,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:2});
 expect(result.diagnostics).toEqual([]);expect(Object.fromEntries(result.series.map(row=>[row.id,row.values]))).toEqual({sma:[null,6,7.5,9],smooth:[null,null,6.75,8.25],smoothUpper:[null,null,8.25,9.75],smoothLower:[null,null,5.25,6.75]});
});
it('preserves available base values when VWMA addon volume is unavailable or band variance overflows',()=>{
 const input=bars([3,9,6,12],[1,Number.NaN,2,3]),missing=calculateIndicator('sma',input,{length:2,smoothingType:'VWMA',smoothingLength:2,smoothingMultiplier:2});
 expect(missing.series.find(row=>row.id==='sma')!.values).toEqual([null,6,7.5,9]);expect(missing.series.find(row=>row.id==='smooth')!.values).toEqual([null,null,null,null]);expect(missing.plotDiagnostics!.smooth[0]).toMatch(/volume/i);expect(missing.diagnostics).toEqual([]);
 const large=calculateIndicator('sma',bars([1e304,2e304]),{length:1,smoothingType:'SMA+BB',smoothingLength:2,smoothingMultiplier:100000});
 const base=large.series.find(row=>row.id==='sma')!.values;expect(base).toHaveLength(2);for(const [index,expected] of [1e304,2e304].entries())expect(Math.abs(base[index]!/expected-1)).toBeLessThanOrEqual(1e-12);for(const id of ['smoothUpper','smoothLower']){expect(large.series.find(row=>row.id===id)!.values).toEqual([null,null]);expect(large.plotDiagnostics?.[id]?.[0]).toMatch(/overflow/i);}
});
it('rejects explicit null or undefined smoothing fields and add-ons attached to ineligible calculations',()=>{
 for(const key of ['smoothingType','smoothingLength','smoothingMultiplier'])for(const value of [null,undefined]){const result=calculateIndicator('sma',bars([3,9]),{length:1,[key]:value});expect(result.series).toEqual([]);expect(result.diagnostics.length).toBeGreaterThan(0);}
 const wrong=calculateIndicator('volume',bars([3,9]),{length:1,smoothingType:'SMA',smoothingLength:2,smoothingMultiplier:2});expect(wrong.series).toEqual([]);expect(wrong.diagnostics.length).toBeGreaterThan(0);
});
it('keeps original legacy frozen calculation tuples unchanged and rejects partial/new disabled plot captures',()=>{
 const legacy={length:2,source:'close'},original=JSON.stringify(legacy);validateFrozenIndicatorInputs('sma',legacy,'sma');expect(JSON.stringify(legacy)).toBe(original);
 expect(()=>validateFrozenIndicatorInputs('sma',legacy,'smooth')).toThrow();expect(()=>validateFrozenIndicatorInputs('sma',{...legacy,smoothingType:'SMA'},'smooth')).toThrow();
 const complete={...legacy,smoothingType:'SMA',smoothingLength:2,smoothingMultiplier:2};validateFrozenIndicatorInputs('sma',complete,'smooth');
 for(const key of ['smoothingType','smoothingLength','smoothingMultiplier'])expect(()=>validateIndicatorInputs('sma',{...complete,[key]:null})).toThrow();
});
it('rejects hidden/accessor presentation fields before reading and invalid precision after formatter admission',()=>{
 const valid=defaultIndicatorPresentation('rsi');validateIndicatorPresentation('rsi',valid);let reads=0;
 const hostile=structuredClone(valid);Object.defineProperty(hostile.guides.upper!,'value',{enumerable:true,get(){reads++;return 70;}});expect(()=>validateIndicatorPresentation('rsi',hostile)).toThrow();
 const hidden=structuredClone(valid);Object.defineProperty(hidden.fills.band!,'extra',{enumerable:false,value:1});expect(()=>validateIndicatorPresentation('rsi',hidden)).toThrow();expect(reads).toBe(0);
 expect(()=>validateIndicatorPresentation('rsi',{...valid,precision:2})).not.toThrow();
 expect(()=>validateIndicatorPresentation('rsi',{...valid,precision:17})).toThrow();
});
