import { it,expect } from 'vitest';
import { candleDirection,visibleExtremes } from '../../src/chart/appearance-layer';
it('previous close can select down ink for an up body and up ink for a down body',()=>{
  expect(candleDirection(90,95,100,true)).toBe('down');
  expect(candleDirection(110,105,100,true)).toBe('up');
  expect(candleDirection(90,95,100,false)).toBe('up');
});
it('visible high low considers included logical bars and excludes loaded offscreen extremes',()=>{
  const bars=[{time:1,open:1,close:1,high:900,low:-900},{time:2,open:10,close:20,high:30,low:5},{time:3,open:20,close:21,high:25,low:8},{time:4,open:1,close:1,high:800,low:-800}];
  expect(visibleExtremes(bars,0.5,2.4)).toEqual({high:30,low:5});
  expect(visibleExtremes(bars,8,9)).toBeNull();
});
