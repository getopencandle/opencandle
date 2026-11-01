import {expect,it} from 'vitest';
import {calculateIndicator,indicatorActivePlotIds} from '../../src/domain/indicators';
import {validateIndicatorInputs,validateFrozenIndicatorInputs,indicatorDefaults,indicatorLegacyDefaults,indicatorEstimatedSlots,assertIndicatorBatchBudget,defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';
import {vwapPercentageDistance} from '../../src/domain/vwap-percentage';

const tuple=(extra:Record<string,unknown>={})=>({bandMode:'Percentage',band1Enabled:true,band1Multiplier:1,band2Enabled:true,band2Multiplier:2,band3Enabled:true,band3Multiplier:0,...extra});
const bars=(prices:number[],volumes=prices.map(()=>1),dates?:string[]):Bar[]=>prices.map((close,i)=>({time:dates?Date.parse(dates[i])/1000:1700000000+i*60,open:close,high:close,low:close,close,volume:volumes[i]}));
const values=(result:ReturnType<typeof calculateIndicator>,id:string)=>{expect(result.diagnostics).toEqual([]);const plot=result.series.find(row=>row.id===id);expect(plot).toBeDefined();return plot!.values;};
const relative=(actual:number|null,expected:number)=>{expect(actual).not.toBeNull();expect(Math.abs(actual!/expected-1)).toBeLessThanOrEqual(2e-15);};

it('uses independently checked Fraction literals for three percentage pairs and zero multiplier',()=>{
 const result=calculateIndicator('vwap',bars([10,20,30],[1,3,2]),{source:'close',...tuple()});
 for(const [id,expected]of Object.entries({vwap:[10,35/2,65/3],upper1:[101/10,707/40,1313/60],lower1:[99/10,693/40,429/20],upper2:[51/5,357/20,221/10],lower2:[49/5,343/20,637/30],upper3:[10,35/2,65/3],lower3:[10,35/2,65/3]}))values(result,id).forEach((value,i)=>relative(value,expected[i]));
 expect(result.plotDiagnostics).toBeUndefined();
});
it('preserves legacy omission and validates all seven fields even when a pair is inactive',()=>{
 const legacy={...indicatorLegacyDefaults.vwap},saved=JSON.stringify(legacy);validateIndicatorInputs('vwap',legacy);validateFrozenIndicatorInputs('vwap',legacy,'vwap');expect(JSON.stringify(legacy)).toBe(saved);
 expect(indicatorActivePlotIds('vwap',legacy)).toEqual(['vwap']);expect(()=>validateFrozenIndicatorInputs('vwap',legacy,'upper1')).toThrow();
 for(const key of Object.keys(tuple())){expect(()=>validateIndicatorInputs('vwap',{...legacy,[key]:tuple()[key as keyof ReturnType<typeof tuple>]})).toThrow();for(const invalid of [null,undefined])expect(()=>validateIndicatorInputs('vwap',{...legacy,...tuple(),[key]:invalid})).toThrow();}
 expect(()=>validateIndicatorInputs('vwap',{...tuple({band1Enabled:false,band1Multiplier:-1})})).toThrow();expect(()=>validateIndicatorInputs('vwap',tuple({bandMode:'Median'}))).toThrow();expect(()=>validateIndicatorInputs('vwap',tuple({bandMode:'Standard Deviation'}))).not.toThrow();
 expect(indicatorDefaults.vwap).toMatchObject(tuple({band1Enabled:false,band2Enabled:false,band3Enabled:false,band3Multiplier:3}));
});
it('uses absolute distances for negative bases and keeps representable extreme percentage results',()=>{
 const negative=calculateIndicator('vwap',bars([-20]),{source:'close',...tuple({band1Multiplier:5})});expect(values(negative,'upper1')).toEqual([-19]);expect(values(negative,'lower1')).toEqual([-21]);
 const huge=calculateIndicator('vwap',bars([1e308]),{source:'close',...tuple({band1Multiplier:2,band2Enabled:false,band3Enabled:false})});relative(values(huge,'upper1')[0],1.02e308);relative(values(huge,'lower1')[0],9.8e307);
 const tiny=calculateIndicator('vwap',bars([1e308]),{source:'close',...tuple({band1Multiplier:Number.MIN_VALUE,band2Enabled:false,band3Enabled:false})});expect(tiny.plotDiagnostics).toBeUndefined();expect(values(tiny,'upper1')).toEqual([1e308]);
 // Python Fraction.from_float(1e308)*Fraction.from_float(2**-1074)/100, rounded once.
 relative(vwapPercentageDistance(1e308,Number.MIN_VALUE),4.9406564584124655e-18);
});
it('reports only failed pairs while retaining the base and other enabled pairs',()=>{
 const result=calculateIndicator('vwap',bars([1e308]),{source:'close',...tuple({band1Multiplier:100000,band2Multiplier:1})});expect(values(result,'vwap')).toEqual([1e308]);expect(values(result,'upper1')).toEqual([null]);expect(values(result,'lower1')).toEqual([null]);expect(result.plotDiagnostics?.upper1.join(' ')).toMatch(/overflow|representable/i);relative(values(result,'upper2')[0],1.01e308);
 const under=calculateIndicator('vwap',bars([Number.MIN_VALUE]),{source:'close',...tuple({band1Multiplier:Number.MIN_VALUE,band2Enabled:false,band3Enabled:false})});expect(values(under,'vwap')).toEqual([Number.MIN_VALUE]);expect(values(under,'upper1')).toEqual([null]);expect(under.plotDiagnostics?.upper1.join(' ')).toMatch(/precision|underflow/i);
});
it('retains zero-volume semantics, resets anchors and never reads a future tail',()=>{
 const input=bars([10,20,30],[0,3,0]);const result=calculateIndicator('vwap',input,{source:'close',...tuple()});expect(values(result,'vwap')).toEqual([null,20,20]);expect(values(result,'upper1')).toEqual([null,20.2,20.2]);
 const reset=calculateIndicator('vwap',bars([10,20,30],[1,3,2],['2026-01-01T10:00:00Z','2026-01-01T11:00:00Z','2026-01-02T10:00:00Z']),{source:'close',...tuple()});expect(values(reset,'upper1')[2]).toBe(30.3);
 let reads=0;const future=Object.defineProperty({},'close',{get(){reads++;throw Error('future read');}}) as Bar;const history=[...input,future];for(let size=1;size<=input.length;size++){const prefix=calculateIndicator('vwap',history.slice(0,size),{source:'close',...tuple()});expect(values(prefix,'upper1')).toEqual(values(result,'upper1').slice(0,size));}expect(reads).toBe(0);
 for(const volume of [-1,NaN,Infinity])expect(calculateIndicator('vwap',bars([10],[volume]),tuple()).series).toEqual([]);
});
it('anchors literal early-year weeks without the Date.UTC 1900 substitution',()=>{
 const early=calculateIndicator('vwap',bars([10,20,40],[1,1,1],['0042-01-01T12:00:00Z','0042-01-05T12:00:00Z','0042-01-06T12:00:00Z']),{source:'close',anchor:'Week',timezone:'UTC',...tuple()});expect(values(early,'vwap')).toEqual([10,15,40]);
 const century=calculateIndicator('vwap',bars([10,20,40],[1,1,1],['0099-12-31T12:00:00Z','0100-01-01T12:00:00Z','0100-01-04T12:00:00Z']),{source:'close',anchor:'Week',timezone:'UTC'});expect(values(century,'vwap')).toEqual([10,15,40]);
});
it('counts every enabled numeric/native pair and fill before the batch allocates',()=>{
 const presentation=defaultIndicatorPresentation('vwap'),inputs=tuple();expect(indicatorEstimatedSlots('vwap',10,inputs,presentation)).toBe(330);expect(indicatorEstimatedSlots('vwap',10,inputs,presentation,'render',{},3)).toBe(408);expect(indicatorEstimatedSlots('vwap',10,inputs,presentation,'calculation')).toBe(70);
 expect(()=>assertIndicatorBatchBudget([{kind:'vwap',inputs,presentation}],100000)).toThrow(/limit/);
 expect(assertIndicatorBatchBudget([{kind:'vwap',inputs,presentation,offset:76918}],4).numericSlots).toBe(2000000);
 expect(()=>assertIndicatorBatchBudget([{kind:'vwap',inputs,presentation,offset:76919}],4)).toThrow(/limit/);
 // The batch holds four single-study caps; one more study past them is refused.
 const full=Array.from({length:4},()=>({kind:'vwap' as const,inputs,presentation,offset:76918}));expect(assertIndicatorBatchBudget(full,4).numericSlots).toBe(8000000);
 expect(()=>assertIndicatorBatchBudget([...full,{kind:'vwap',inputs:{},offset:0}],4)).toThrow(/limit/);
});
