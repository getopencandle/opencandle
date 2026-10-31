import { it,expect } from 'vitest';
import { calculationBarsForStyle,heikinAshiBars,createCalculationBarCache,calculationTransformId } from '../../src/chart/calculation-bars';
import {identifyDisplayBars} from '../../src/chart/contracts';
const bars=[{time:1,open:100,high:110,low:90,close:104,volume:10},{time:2,open:110,high:120,low:100,close:116,volume:20}];
it('pure pre-DOM HA input recurrence preserves time/volume and original standard bars',()=>{
  const before=structuredClone(bars),actual=calculationBarsForStyle(bars,'heikinashi');
  expect(actual).toEqual([{time:1,open:102,high:110,low:90,close:101,volume:10},{time:2,open:101.5,high:120,low:100,close:111.5,volume:20}]);
  expect(actual).toEqual(heikinAshiBars(bars));expect(bars).toEqual(before);
});
it('cached HA calculations reuse the immutable input, and invalidate on source or style replacement',()=>{
 let calls=0;const cache=createCalculationBarCache((input,style)=>{calls++;return calculationBarsForStyle(input,style);});
 const first=cache(bars,'heikinashi');expect(cache(bars,'heikinashi')).toBe(first);expect(calls).toBe(1);
 cache(bars,'candles');expect(calls).toBe(2);const next=structuredClone(bars);next[1].close=117;
 expect(cache(next,'heikinashi')[1].close).toBe(111.75);expect(calls).toBe(3);
 const context={datasetId:'synthetic-cached',revision:'1'},standard=identifyDisplayBars(bars,{...context,transformId:calculationTransformId('candles')}),ha=identifyDisplayBars(cache(next,'heikinashi'),{...context,transformId:calculationTransformId('heikinashi')});
 expect(ha[0].id).not.toBe(standard[0].id);expect(ha[0].identity.transformId).toBe('heikinashi');expect(ha[0].close).toBe(101);expect(ha[0].sourceTime).toBe(standard[0].sourceTime);
});
it('line/area source presentation does not replace underlying script OHLC inputs',()=>{
  for(const style of ['line','area','baseline','columns'])expect(calculationBarsForStyle(bars,style)).toEqual(bars);
  expect(()=>calculationBarsForStyle(bars,'renko')).toThrow('No standard-bar substitute');
});
