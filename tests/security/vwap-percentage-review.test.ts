import {expect,it} from 'vitest';
import {calculateIndicator,indicatorVwapBandSettings} from '../../src/domain/indicators';
import {vwapPercentageDistance,vwapPercentageBounds} from '../../src/domain/vwap-percentage';
import {validateFrozenIndicatorInputs,indicatorLegacyDefaults} from '../../src/chart/indicator-settings';
const tuple={bandMode:'Percentage',band1Enabled:true,band1Multiplier:100000,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3};
it('one hundred percent retains exact magnitude across normal and subnormal finite bases',()=>{
 for(const base of [Number.MIN_VALUE,3*Number.MIN_VALUE,2**-1022,1,2**1023,Number.MAX_VALUE]){expect(vwapPercentageDistance(base,100)).toBe(base);expect(vwapPercentageDistance(-base,100)).toBe(base);}
});
it('tiny percent of a huge base remains representable without premature multiplier underflow',()=>{
 const expected=((2-2**-52)*2**-51)/100,actual=vwapPercentageDistance(Number.MAX_VALUE,Number.MIN_VALUE);expect(Math.abs(actual/expected-1)).toBeLessThan(2e-15);expect(actual).toBeGreaterThan(0);
});
it('handles binary64 subnormal ties and diagnoses an actually unrepresentable distance',()=>{
 expect(vwapPercentageDistance(3*Number.MIN_VALUE,50)).toBe(2*Number.MIN_VALUE);expect(()=>vwapPercentageDistance(Number.MIN_VALUE,50)).toThrow(/underflow|precision/i);expect(vwapPercentageBounds(-20,5)).toEqual({upper:-19,lower:-21});
});
it('a later overflowing pair cannot erase earlier available values or change a prefix result',()=>{
 const bars=[10,1e308].map((close,i)=>({time:1700000000+i*60,open:close,high:close,low:close,close,volume:1})),inputs={source:'close',...tuple};
 const prefix=calculateIndicator('vwap',bars.slice(0,1),inputs),complete=calculateIndicator('vwap',bars,inputs),series=(result:typeof complete,id:string)=>result.series.find(row=>row.id===id)!.values;
 expect(series(prefix,'upper1')).toEqual([10010]);expect(series(complete,'upper1')).toEqual([10010,null]);expect(series(complete,'lower1')).toEqual([-9990,null]);expect(series(complete,'vwap')).toEqual([10,5e307]);expect(complete.plotDiagnostics?.upper1.join(' ')).toMatch(/overflow|representable/i);
});
it('legacy frozen input membership remains exact while malformed or behavioral band tuples reject',()=>{
 const legacy={...indicatorLegacyDefaults.vwap},keys=Reflect.ownKeys(legacy);validateFrozenIndicatorInputs('vwap',legacy,'vwap');expect(Reflect.ownKeys(legacy)).toEqual(keys);expect(()=>validateFrozenIndicatorInputs('vwap',legacy,'upper1')).toThrow();
 expect(()=>indicatorVwapBandSettings({...legacy,band1Enabled:false})).toThrow();let reads=0;const unsafe={...tuple};Object.defineProperty(unsafe,'band1Multiplier',{enumerable:true,get(){reads++;return 2;}});expect(()=>indicatorVwapBandSettings(unsafe)).toThrow();expect(reads).toBe(0);
});
