import {describe,expect,it} from 'vitest';
import {parseJson} from '../../src/domain/data';
import {calculateIndicator,sma,sourceValues,standardDeviation,stochastic,type IndicatorResult} from '../../src/domain/indicators';
import type {Bar,PriceSource} from '../../src/domain/types';

// Synthetic finite-input regressions. These exact power-of-two identities are
// independent mathematical literals, not claims of the reference app rounding parity.
const syntheticBars=(prices:readonly number[],volumes:readonly number[]=prices.map(()=>1)):Bar[]=>prices.map((price,index)=>({time:1700000000+index*60,open:price,high:price,low:price,close:price,volume:volumes[index]}));
function admitted(rows:Bar[]):Bar[]{
 const imported=parseJson(JSON.stringify(rows));
 expect(imported.ok).toBe(true);expect(imported.diagnostics).toEqual([]);expect(imported.bars).toEqual(rows);
 return imported.bars;
}
const plot=(result:IndicatorResult,id:string)=>result.series.find(series=>series.id===id)?.values;

describe('synthetic extreme finite indicator literals',()=>{
 it.each([
  {length:1,values:[2**53,1,1],expected:[2**53,1,1]},
  // (2**53+1)/2 is halfway and rounds to the even binary64 value 2**52.
  {length:2,values:[2**53,1,1,1],expected:[null,2**52,1,1]},
 ])('SMA length $length retains the small window after a large value leaves',({length,values,expected})=>{
  const priceRows=admitted(syntheticBars(values)),volumeRows=admitted(syntheticBars(values.map(()=>10),values));
  const priceBefore=structuredClone(priceRows),volumeBefore=structuredClone(volumeRows);
  const average=calculateIndicator('sma',priceRows,{length,source:'close'}),volume=calculateIndicator('volume',volumeRows,{length});
  expect(average.diagnostics).toEqual([]);expect(volume.diagnostics).toEqual([]);
  expect.soft(plot(average,'sma')).toEqual(expected);
  expect.soft(plot(volume,'ma')).toEqual(expected);
  expect.soft(sma(values,length)).toEqual(expected);
  expect(plot(volume,'volume')).toEqual(values);expect(priceRows).toEqual(priceBefore);expect(volumeRows).toEqual(volumeBefore);
 });

 it('Stochastic returns 100 at the finite upper endpoint without intermediate overflow',()=>{
  const high=2**1023,rows=admitted([{time:1700000000,open:1,high,low:1,close:high,volume:1}]);
  const result=calculateIndicator('stochastic',rows,{length:1,smoothK:1,smoothD:1}),direct=stochastic(rows,1,1,1);
  expect(result.diagnostics).toEqual([]);
  expect.soft(plot(result,'k')).toEqual([100]);expect.soft(plot(result,'d')).toEqual([100]);
  expect.soft(direct.k).toEqual([100]);expect.soft(direct.d).toEqual([100]);
 });

 it.each(['hl2','hlc3','ohlc4'] as const)('%s of equal finite prices retains their exact value',source=>{
  const price=2**1023,rows=admitted(syntheticBars([price]));
  expect.soft(sourceValues(rows,source as PriceSource)).toEqual([price]);
  for(const kind of ['sma','ema'] as const){
   const result=calculateIndicator(kind,rows,{length:1,source});expect(result.diagnostics).toEqual([]);
   expect.soft(plot(result,kind)).toEqual([price]);
  }
 });

 it('Bollinger population deviation keeps a representable tiny range',()=>{
  const a=2**-600,values=[a,3*a],rows=admitted(syntheticBars(values));
  // Mean=2*a; deviations=-a,+a; population deviation=a. Squaring a
  // directly is below binary64's smallest subnormal, but a itself is normal.
  const result=calculateIndicator('bb',rows,{length:2,multiplier:1,basisType:'SMA',source:'close'});
  expect(result.diagnostics).toEqual([]);expect(plot(result,'basis')).toEqual([null,2*a]);
  expect.soft(standardDeviation(values,2)).toEqual([null,a]);
  expect.soft(plot(result,'lower')).toEqual([null,a]);expect.soft(plot(result,'upper')).toEqual([null,3*a]);
 });
});
