import { it,expect } from 'vitest';
import { calculateIndicator } from '../../src/domain/indicators';
import { renderIndicatorSeries,evaluateDomainIndicator,defaultPlotStyle,indicatorInputSchema } from '../../src/chart/indicator-port';
const bars=[1,2,3,4,5].map((close,index)=>({time:1700000000+index*60,open:close-0.5,high:close+1,low:close-1,close,volume:10}));
it('render port preserves literal domain signal values and offsets only timestamps',()=>{
  const result=calculateIndicator('sma',bars,{length:3});
  const before=structuredClone(result),plots=renderIndicatorSeries('stable-instance','sma',result,bars,{},2);
  expect((plots[0] as any).points.map((point:any)=>point.value)).toEqual([null,null,2,3,4]);
  expect((plots[0] as any).points.map((point:any)=>point.time)).toEqual(bars.map(bar=>(bar.time+120)*1000));
  expect(result).toEqual(before);
});
it('multiple same-kind instances have distinct IDs, edits preserve a plot identity',()=>{
  const result=calculateIndicator('ema',bars,{length:3});
  const one=renderIndicatorSeries('instance-one','ema',result,bars,{},0),two=renderIndicatorSeries('instance-two','ema',result,bars,{},0);
  expect(one[0].id).not.toBe(two[0].id);
  const edited=renderIndicatorSeries('instance-one','ema',result,bars,{ema:{...defaultPlotStyle('ema','ema',0),color:'#ff0000',width:4,kind:'area'}},1);
  expect(edited[0].id).toBe(one[0].id);
});
it('volume-dependent render calculations return unavailable for absent volume',()=>{
  expect(evaluateDomainIndicator('obv',bars.map(bar=>({...bar,volume:NaN})),{})).toMatchObject({series:[],diagnostics:['This calculation requires nonnegative volume for every source bar.']});
});
it('exposes only currently supported calculator inputs',()=>{
  expect(indicatorInputSchema('rsi').map(row=>row.key)).toEqual(['length','source','smoothingType','smoothingLength','smoothingMultiplier','divergence','divergenceLeft','divergenceRight','divergenceRangeMin','divergenceRangeMax','divergenceRegularBullish','divergenceRegularBearish','divergenceHiddenBullish','divergenceHiddenBearish','divergenceBodyOnly','divergenceLabels','divergencePricePane','divergenceBackground','divergenceForming']);// RSI options
  expect(indicatorInputSchema('macd').map(row=>row.key)).toEqual(['fast','slow','signal','source','oscillatorType','signalType']);
  // RSI divergence is implemented (LV rule); the input is accepted for RSI only.
  expect(evaluateDomainIndicator('rsi',bars,{divergence:true})).toMatchObject({diagnostics:[]});
  expect(evaluateDomainIndicator('sma',bars,{divergence:true})).toMatchObject({series:[],diagnostics:['Unsupported indicator inputs: divergence']});
  expect(evaluateDomainIndicator('atr',bars,{smoothing:'VWMA'})).toMatchObject({series:[],diagnostics:['VWMA smoothing is not a documented ATR option.']});
});
it('offsets beyond an irregular series extrapolate from its boundary index',()=>{
  const irregular=bars.slice(0,3).map((bar,index)=>({...bar,time:1700000000+[0,60,240][index]}));
  const result=calculateIndicator('sma',irregular,{length:1});
  const positive=renderIndicatorSeries('stable','sma',result,irregular,{},3),negative=renderIndicatorSeries('stable','sma',result,irregular,{},-3);
  expect((positive[0] as any).points.map((p:any)=>p.time/1000-1700000000)).toEqual([420,600,780]);
  expect((negative[0] as any).points.map((p:any)=>p.time/1000-1700000000)).toEqual([-180,-120,-60]);
});
