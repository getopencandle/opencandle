import {afterEach,expect,it,vi} from 'vitest';
import {drawingCommands,drawingProjection,nativeDrawingHarness} from './drawing-native-harness';

afterEach(()=>vi.resetModules());

// Real public SDK imports and the unchanged raw-native harness must share the
// original drawing classes/registry, even when Vitest resets application modules.
// The renderer still runs the canonical future-calendar Vite transform. The
// in-memory controller port and canvas recorder do not claim executable UI proof.
it('keeps native drawing identity across resets while composing the canonical calendar renderer',async()=>{
 const first=await import('@luxalgo/vela');
 const types=await import('../../src/chart/lv-drawing-types');
 const price=first.getDrawingType(types.LV_PRICE_RANGE)!;
 const position=first.getDrawingType('position')!;
 expect(price).toBeDefined();expect(position).toBeDefined();
 const native=await nativeDrawingHarness();
 try{
  vi.resetModules();
  const second=await import('@luxalgo/vela');
  expect(second.Drawing).toBe(first.Drawing);
  expect(second.createDrawing).toBe(first.createDrawing);
  expect(second.getDrawingType).toBe(first.getDrawingType);
  expect(second.getDrawingType(types.LV_PRICE_RANGE)).toBe(price);
  expect(second.getDrawingType('position')).toBe(position);
  const repeated=await import('../../src/chart/lv-drawing-types');
  expect(repeated.lvDrawingTypeStatus().find(row=>row.type==='position')).toMatchObject({state:'unavailable',reason:expect.stringContaining('already replaced')});
  expect(repeated.lvDrawingTypeStatus().find(row=>row.type===types.LV_PRICE_RANGE)).toMatchObject({state:'unavailable',reason:expect.stringContaining('already registered')});
  expect(second.getDrawingType(types.LV_PRICE_RANGE)).toBe(price);
  expect(second.getDrawingType('position')).toBe(position);

  const model=second.createDrawing(types.LV_PRICE_RANGE as Parameters<typeof second.createDrawing>[0],{paneId:'price',anchors:[{time:1_020_000,price:100},{time:1_120_000,price:150}]})!;
  expect(model).toBeInstanceOf(first.Drawing);
  expect(model).toBeInstanceOf(second.Drawing);
  const doc=model.serialize();
  native.controller.setTool(types.LV_PRICE_RANGE);
  native.controller.onIntent({kind:'create',doc});
  native.controller.onIntent({kind:'tool-finished',type:types.LV_PRICE_RANGE});
  const created=native.controller.all().find((row:any)=>row.type===types.LV_PRICE_RANGE);
  expect(created).toBeDefined();expect(created.anchors).toEqual(doc.anchors);
  expect(native.controller.store.get(created.id)).toBeInstanceOf(second.Drawing);
  const record=drawingCommands();
  record.ctx.strokeRect=(...values:unknown[])=>record.commands.push({op:'strokeRect',values});
  native.painter.paintAll(record.ctx,[native.controller.store.get(created.id)],drawingProjection,{fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'});
  expect(record.commands.filter((command:any)=>command.op==='fillText').map((command:any)=>String(command.values[0])).join(' | ')).toContain('%');

  const renderer=new second.NativeRenderer(),coords=(renderer as any).coords;
  const friday=Date.parse('2017-03-31T04:00:00Z'),monday=Date.parse('2017-04-03T04:00:00Z');
  coords.setBars([Date.parse('2017-03-30T04:00:00Z'),friday]);
  const frame=renderer.lvCaptureTimeFrame(2,friday),lease=renderer.lvSetFutureTimeSpine(frame,new Float64Array([monday]));
  try{expect(lease.isCurrent()).toBe(true);expect(coords.timeToLogical(Date.parse('2017-04-01T04:00:00Z'))).toBeCloseTo(1+1/3,14);}finally{lease.dispose();}
 }finally{native.dispose();}
});
