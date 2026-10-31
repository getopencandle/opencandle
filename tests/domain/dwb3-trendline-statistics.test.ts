import {describe,expect,it} from 'vitest';
import {calculateTrendlineDistance,calculateTrendlineAngle,calculateChangeInPips,prepareTrendlineStatisticsGrid,TRENDLINE_PIPS_UNAVAILABLE_REASON} from '../../src/domain/trendline-statistics';
// SYNTHETIC bars and anchors. (distance = bars and price as a pair), (angle in screen space).
const grid=prepareTrendlineStatisticsGrid([0,60,120,180].map(second=>({time:1000+second,open:1,high:1,low:1,close:1,volume:1})));
const anchors=[{time:1_000_000,price:100},{time:1_180_000,price:130}];
describe('trendline distance ',()=>{
 it('is the bar count and the absolute price difference as a pair',()=>{
  const result=calculateTrendlineDistance(anchors,{grid});
  expect(result).toEqual({state:'available',value:{bars:3,price:30}});
  expect(calculateTrendlineDistance([anchors[1],anchors[0]],{grid})).toEqual({state:'available',value:{bars:3,price:30}});
 });
 it('is unavailable with a reason when the bar grid is missing',()=>{
  const result=calculateTrendlineDistance(anchors,{});
  expect(result.state).toBe('unavailable');
 });
});
describe('trendline angle ',()=>{
 it('reports degrees of the segment on screen, positive when the line rises to the right',()=>{
  expect(calculateTrendlineAngle({x:0,y:100},{x:100,y:0})).toEqual({state:'available',value:45});
  expect(calculateTrendlineAngle({x:100,y:0},{x:0,y:100})).toEqual({state:'available',value:45});
  expect(calculateTrendlineAngle({x:0,y:0},{x:100,y:100})).toEqual({state:'available',value:-45});
  expect(calculateTrendlineAngle({x:0,y:50},{x:100,y:50})).toEqual({state:'available',value:0});
  expect(calculateTrendlineAngle({x:5,y:50},{x:5,y:0})).toEqual({state:'available',value:90});
 });
 it('is recomputed from the new projection, so a different viewport gives a different angle',()=>{
  const wide=calculateTrendlineAngle({x:0,y:100},{x:200,y:0}),narrow=calculateTrendlineAngle({x:0,y:100},{x:50,y:0});
  expect(wide.state==='available'&&narrow.state==='available'&&narrow.value>wide.value).toBe(true);
 });
 it('is unavailable for a zero-length or non-finite segment',()=>{
  expect(calculateTrendlineAngle({x:1,y:1},{x:1,y:1}).state).toBe('unavailable');
  expect(calculateTrendlineAngle({x:NaN,y:1},{x:1,y:1}).state).toBe('unavailable');
 });
});
describe('change in pips is not claimed: pip size is unavailable',()=>{
 it('is always unavailable without instrument pip-size metadata',()=>{
  const result=calculateChangeInPips(anchors,undefined);
  expect(result).toEqual({state:'unavailable',reason:TRENDLINE_PIPS_UNAVAILABLE_REASON});
  for(const bad of [0,-1,NaN,Infinity,'0.0001'])expect(calculateChangeInPips(anchors,bad as never).state).toBe('unavailable');
  expect(TRENDLINE_PIPS_UNAVAILABLE_REASON).not.toMatch(/—|–/);
 });
});
