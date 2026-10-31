import {createDrawing,getDrawingType,registerDrawingType} from '@luxalgo/vela';
import {expect,it,vi} from 'vitest';
const original=getDrawingType('fibretracement')!;
it.each(['native','runtime'] as const)('initializes the lazy %s-first cycle before early virtual readProps',(async(order)=>{
 vi.resetModules();registerDrawingType(original);
 try{
  if(order==='runtime')await import('../../src/chart/fib-trend-line-runtime');
  const native=await import('../../src/chart/fib-level-format-native'),defaults=native.nativeFibTrendLineDefaults();
  const drawing=createDrawing('fibretracement',{id:'SYNTHETIC import order',paneId:'price',createdAt:0,anchors:[{time:1,price:100},{time:2,price:200}],props:{lvFibLevelFormat:'percent',lvFibTrendLine:{...defaults,enabled:true}}})!;
  expect(drawing.serialize().props!.lvFibTrendLine).toEqual({...defaults,enabled:true});expect(drawing.serialize().props!.lvFibLevelFormat).toBe('percent');expect(()=>native.assertNativeFibTrendLineModel(drawing)).not.toThrow();
  // the recorded facts (levels 8-11 visible: 1.618, 2.618, 3.618, 4.236): fresh levels reach 4.236. 0.8.1: a new drawing whose carried props
  // omit `reverse` starts unreversed (0 at the second point, 200), so the levels run down to 200 - 4.236 x 100 = -223.6.
  const range=drawing.priceRange()!;expect(range.min).toBeCloseTo(-223.6,9);expect(range.max).toBe(200);
 }finally{registerDrawingType(original);vi.resetModules();}
}));
