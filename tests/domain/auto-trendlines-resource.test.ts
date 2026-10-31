import {expect,it} from 'vitest';
import {calculateAutoTrendlines} from '../../src/domain/indicators-ext/auto-trendlines';
import {AUTO_TREND_LIMITS,AutoTrendMeter} from '../../src/domain/indicators-ext/auto-trendlines-scene';
import {syntheticTrendBars} from './auto-trendlines-fixture';
const inputs={sourceKey:'SYNTHETIC:resource',lineSize:'Small' as const,barsToBreakout:3,showPivots:true};
it('refuses before exceeding either unchanged per-study reservation',()=>{
 const result=calculateAutoTrendlines(syntheticTrendBars(),inputs);expect(result.status).toBe('ready');const exact=calculateAutoTrendlines(syntheticTrendBars(),inputs,{operations:result.usage.operations,numericSlots:result.usage.peakNumericSlots});expect(exact.status).toBe('ready');
 for(const limits of [{operations:result.usage.operations-1},{numericSlots:result.usage.peakNumericSlots-1},{operations:0},{numericSlots:0}]){const denied=calculateAutoTrendlines(syntheticTrendBars(),inputs,limits);expect(denied.status).toBe('unavailable');expect(denied.scene).toBeNull();expect(denied.usage.operations).toBeLessThanOrEqual(limits.operations??AUTO_TREND_LIMITS.operations);expect(denied.usage.peakNumericSlots).toBeLessThanOrEqual(limits.numericSlots??AUTO_TREND_LIMITS.numericSlots);}
});
it('charges inherited full-history scratch and never allows callers to raise the local ceiling',()=>{
 const ordinary=calculateAutoTrendlines(syntheticTrendBars(),inputs),inherited=calculateAutoTrendlines(syntheticTrendBars(),{...inputs,externalNumericSlots:200000});expect(ordinary.status).toBe('ready');expect(inherited.status).toBe('unavailable');expect(inherited.scene).toBeNull();for(const limits of [{operations:12000001},{numericSlots:200001}])expect(calculateAutoTrendlines([],inputs,limits).status).toBe('unavailable');
});
it('dense input refuses the whole scene rather than shortening the search or returning the first candidates',()=>{
 const bars=Array.from({length:5000},(_,i)=>{const close=1000+100*Math.cos(i*Math.PI/6);return{time:i+1,open:close,high:close+.1,low:close-.1,close,volume:100};});
 const result=calculateAutoTrendlines(bars,inputs);expect(result.status).toBe('unavailable');expect(result.scene).toBeNull();expect(result.usage.operations).toBeLessThanOrEqual(12000000);expect(result.usage.peakNumericSlots).toBeLessThanOrEqual(200000);const again=calculateAutoTrendlines(bars,inputs);expect(again).toEqual(result);
});
it('the ledger refuses unsafe counters and releases only owned reservations',()=>{
 const meter=new AutoTrendMeter({operations:100,numericSlots:10});meter.reserve(10);expect(meter.usage().peakNumericSlots).toBe(10);expect(()=>meter.reserve(1)).toThrow('numeric');meter.release(10);expect(meter.usage().numericSlots).toBe(0);expect(()=>meter.release(1)).toThrow('release');expect(()=>meter.work(Number.MAX_SAFE_INTEGER)).toThrow('operation');expect(()=>new AutoTrendMeter({}, {operations:0,numericSlots:2,peakNumericSlots:1})).toThrow('receipt');
});
