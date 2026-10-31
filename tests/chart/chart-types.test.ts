import { it,expect } from 'vitest';
import { hollowState,selectedPrice,volumeWidths,CHART_TYPES,verticalBody,hollowOutlineVisible } from '../../src/chart/chart-types';
it('hollow candles independently encode previous-close direction and body fill',()=>{
  expect(hollowState(90,95,94)).toEqual({direction:'up',filled:false});
  expect(hollowState(100,95,94)).toEqual({direction:'up',filled:true});
  expect(hollowState(90,95,96)).toEqual({direction:'down',filled:false});
  expect(hollowState(100,95,96)).toEqual({direction:'down',filled:true});
});
it('all seven selectable OHLC price sources have independent literal values',()=>{
  const bar={time:1,open:7,high:19,low:3,close:11};
  expect(['open','high','low','close','hl2','hlc3','ohlc4'].map(source=>selectedPrice(bar,source as any))).toEqual([7,19,3,11,11,11,10]);
});
it('volume widths preserve relative volume and reject unavailable values',()=>{
  expect(volumeWidths([10,20,40],20)).toEqual([5,10,20]);
  expect(()=>volumeWidths([20,NaN],20)).toThrow();
  expect(volumeWidths([0,0],20)).toEqual([1,1]);
  expect(()=>volumeWidths([1],NaN)).toThrow();
  expect(()=>volumeWidths([1],-1)).toThrow();
  expect(volumeWidths([1,2],0)).toEqual([0,0]);
  expect(volumeWidths(new Array(200000).fill(5),10).length).toBe(200000);
});
it('highlow rect stays between price endpoints on inverted scales',()=>{expect(verticalBody(20,80)).toEqual({top:20,height:60});expect(verticalBody(80,20)).toEqual({top:20,height:60});});
it('hollow candle complete hide respects separate body and border controls',()=>{expect(hollowOutlineVisible(false,false,false)).toBe(false);expect(hollowOutlineVisible(false,false,true)).toBe(false);expect(hollowOutlineVisible(true,false,false)).toBe(true);});
// HLC bars joins the catalog (22 types).
it('catalog identifies exactly 22 distinct requested chart types',()=>{expect(CHART_TYPES).toHaveLength(22);expect(new Set(CHART_TYPES.map(row=>row[0])).size).toBe(22);expect(CHART_TYPES.at(-1)).toEqual(['hlcbars','HLC bars']);});
