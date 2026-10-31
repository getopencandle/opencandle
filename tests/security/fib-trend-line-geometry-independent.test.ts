import {expect,it} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';

it('actual native query keeps the original six-pixel segment tolerance on the added diagonal',async()=>{
 const f=await fibBaselineHarness();try{
  const row=fibBaselineRecord();f.sync([row]);
  // Diagonal(200,200)-(400,100): vertical offsets6.5/7.5 have
  // perpendicular distances5.81/6.71, straddling original native tolerance6.
  // Both points remain well clear of the two original horizontal levels.
  expect(f.interaction.hitAt(300,143.5)?.id).toBe(row.id);
  expect(f.interaction.hitAt(300,142.5)).toBeNull();
  (row.props!.lvFibTrendLine as {enabled:boolean}).enabled=false;f.sync([row]);
  expect(f.interaction.hitAt(300,143.5)).toBeNull();
 }finally{f.cleanup();}
});
it('actual native body drag preserves the literal millisecond and price deltas without snapping',async()=>{
 const f=await fibBaselineHarness();try{
  f.sync([fibBaselineRecord()]);f.interaction.down(300,150,'off',false,false);f.interaction.move(320,170);
  expect(f.interaction.state.moved).toBe(true);
  expect(f.controller.drawings[0].anchors).toStrictEqual([{time:1024000,price:80},{time:1264000,price:180}]);
  expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();}
});
it('actual native anchor drag changes only the selected anchor by the literal unsnapped delta',async()=>{
 const f=await fibBaselineHarness();try{
  f.sync([fibBaselineRecord()]);f.interaction.down(200,200,'off',false,false);expect(f.interaction.state.handle).toBe(0);f.interaction.move(220,220);
  const anchors=f.controller.drawings[0].anchors;
  expect(anchors[0].time).toBe(1024000);
  // Original yToPrice(220) is80.00000000000001 in binary64. Preserve
  // the exact time and untouched anchor; allow only1e-10 price roundoff.
  expect(Math.abs(anchors[0].price-80)).toBeLessThanOrEqual(1e-10);
  expect(anchors[1]).toStrictEqual({time:1240000,price:200});
  expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();}
});
it('actual destination stroke keeps independent baseline RGBA and width while preserving native level strokes',async()=>{
 const f=await fibBaselineHarness();const ctx=f.top.ctx as Record<string,any>,previous=ctx.stroke;
 const strokes:{color:string;width:number;alpha:number}[]=[];
 try{
  ctx.stroke=function(...args:unknown[]){strokes.push({color:ctx.strokeStyle,width:ctx.lineWidth,alpha:ctx.globalAlpha});return Reflect.apply(previous,this,args);};
  const levels=[{color:'#123456',width:3,alpha:1},{color:'#abcdef',width:3,alpha:1}];
  const row=fibBaselineRecord();row.style.lineWidth=3;f.sync([row]);strokes.length=0;f.render();
  expect(strokes).toStrictEqual([{color:'rgba(20,40,60,0.25)',width:5,alpha:1},...levels]);
  (row.props!.lvFibTrendLine as {enabled:boolean}).enabled=false;f.sync([row]);strokes.length=0;f.render();expect(strokes).toStrictEqual(levels);
  row.props!.lvFibTrendLine={schemaVersion:2,future:{retained:undefined,zero:-0}};f.sync([row]);strokes.length=0;f.render();expect(strokes).toStrictEqual(levels);
 }finally{ctx.stroke=previous;f.cleanup();}
});
