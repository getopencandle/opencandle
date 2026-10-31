import {describe,expect,it} from 'vitest';
import {createDrawing,deserializeDrawing,getDrawingType,type SerializedDrawing} from '@luxalgo/vela';
import '../../src/chart/drawing-port';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {lvDrawingTypeStatus,registerLvDrawingToolModules} from '../../src/chart/lv-drawing-types';
import {FIB_CHANNEL_FACTORY,FIB_CHANNEL_FIELD,FIB_CHANNEL_LEGACY,FIB_CHANNEL_MODULE,FIB_CHANNEL_PATHS as P,extendSegment,readFibChannel} from '../../src/chart/lv-types/fib-channel';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';
import {fixtureDataset} from '../../src/domain/fixtures';
import {drawingCommands,drawingProjection,nativeDrawingHarness} from './drawing-native-harness';

// The Fib channel presentation (bands, extension, Levels toggle). Every record here is SYNTHETIC.
const THEME={fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'};
// drawingProjection: x = 20 + (time - 1e6) / 1000, y = 300 - price. Pixels p1 (20,200), p2 (80,180), offset (20,240).
const ANCHORS=[{time:1_000_000,price:100},{time:1_060_000,price:120},{time:1_000_000,price:60}];
const fresh=(anchors=ANCHORS)=>createDrawing('fibchannel',{id:'SYNTHETIC fib channel',paneId:'price',createdAt:1,anchors})!;
const legacyRecord=():SerializedDrawing=>{const row=fresh().serialize();const props={...row.props!};delete props[FIB_CHANNEL_FIELD];return{...row,props};};
const member=(row:SerializedDrawing)=>(row.props as Record<string,unknown>|undefined)?.[FIB_CHANNEL_FIELD];
const nativeTwin=(row:SerializedDrawing)=>{const lv=deserializeDrawing(row)!;const Native=Object.getPrototypeOf(Object.getPrototypeOf(lv)).constructor;return new Native(structuredClone(row));};
async function painted(models:unknown[]){
 const t=await nativeDrawingHarness();try{const record=drawingCommands();t.painter.paintAll(record.ctx,models,drawingProjection,THEME);return record.commands;}finally{t.dispose();}
}
const ops=(commands:any[],op:string)=>commands.filter(row=>row.op===op);

describe('Fib channel: registration and toolbar',()=>{
 it('replaces the native registration in place, keeps the type id and label, and paints through the hook',()=>{
  expect(lvDrawingTypeStatus().find(row=>row.type==='fibchannel')).toEqual({type:'fibchannel',base:'fibchannel',state:'registered'});
  const model:any=fresh();expect(model.type).toBe('fibchannel');expect(typeof model.lvPaint).toBe('function');
  expect(getDrawingType('fibchannel')!.label).toBe('Fib Channel');
  const leaf=DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(section=>section.leaves)).find(row=>row.id==='DW.FIB.FIB_CHANNEL')!;
  expect(leaf.target).toEqual({kind:'tool',type:'fibchannel'});
 });
 it('a fresh drawing carries the OpenCandle-defined presentation; three anchors, three handles',()=>{
  const model:any=fresh();expect(member(model.serialize())).toEqual({...FIB_CHANNEL_FACTORY});
  expect(FIB_CHANNEL_FACTORY).toEqual({schemaVersion:1,background:true,opacity:20,extendLeft:false,extendRight:false,showLevels:true});
  expect(model.anchorSchema().min).toBe(3);expect(model.handlePoints(drawingProjection)).toEqual([[20,200],[80,180],[20,240]]);
 });
});

describe('Fib channel: painting',()=>{
 it('a legacy record paints exactly the native picture and serializes byte-identically',async()=>{
  const saved=legacyRecord(),model=deserializeDrawing(saved)!;
  expect(model.serialize()).toEqual(saved);
  expect(await painted([model])).toEqual(await painted([nativeTwin(saved)]));
 });
 it('a fresh drawing fills one parallelogram band per neighbouring level pair at 20 percent of the frame alpha',async()=>{
  const model:any=fresh(),commands=await painted([model]),enabled=model.levels.filter((level:any)=>level.enabled);
  expect(ops(commands,'fill')).toHaveLength(enabled.length-1);
  expect(ops(commands,'fill').every((row:any)=>Math.abs(row.alpha-0.2)<1e-9)).toBe(true);
  // The first band (ratios 0 and 0.236): p1->p2 and the same line shifted by 0.236 * (offset - p1) = 0.236 * 40 px down.
  const first=commands.findIndex((row:any)=>row.op==='fill');const path=commands.slice(0,first).filter((row:any)=>row.op==='moveTo'||row.op==='lineTo').slice(-4).map((row:any)=>row.values);
  expect(path[0]).toEqual([20,200]);expect(path[1]).toEqual([80,180]);expect(path[2][0]).toBe(80);expect(path[2][1]).toBeCloseTo(180+0.236*40);expect(path[3][0]).toBe(20);
  // Lines and ratio text are still one per enabled level, after the bands.
  expect(ops(commands,'stroke')).toHaveLength(enabled.length);expect(ops(commands,'fillText').map((row:any)=>row.values[0])).toEqual(enabled.map((level:any)=>String(level.ratio)));
  expect(commands.findIndex((row:any)=>row.op==='stroke')).toBeGreaterThan(commands.map((row:any)=>row.op).lastIndexOf('fill'));
 });
 it('Background off paints the native picture; Levels off drops only the ratio text',async()=>{
  const model:any=fresh();model.applySettings({[P.background]:false});
  expect(await painted([model])).toEqual(await painted([nativeTwin(legacyRecord())]));
  model.applySettings({[P.showLevels]:false});const commands=await painted([model]);
  expect(ops(commands,'fillText')).toEqual([]);expect(ops(commands,'stroke')).toHaveLength(model.levels.filter((level:any)=>level.enabled).length);
 });
 it('Extend left/right stretch every level line along its own slope to the pane edges; labels stay at the anchor end',()=>{
  const near=(a:any,b:any)=>{for(const key of ['x1','y1','x2','y2'])expect(a[key],key).toBeCloseTo(b[key],9);};
  near(extendSegment({x1:20,y1:200,x2:80,y2:180},400,true,true),{x1:0,y1:200+20/3,x2:400,y2:200-380/3});
  near(extendSegment({x1:80,y1:180,x2:20,y2:200},400,false,true),{x1:400,y1:180-320/3,x2:20,y2:200});
  expect(extendSegment({x1:50,y1:10,x2:50,y2:90},400,true,true)).toEqual({x1:50,y1:10,x2:50,y2:90});
  const model:any=fresh(),before=model.entryLines(drawingProjection);model.applySettings({[P.extendRight]:true});
  const after=model.entryLines(drawingProjection);
  expect(after.map((line:any)=>line.x2)).toEqual(before.map(()=>400));expect(after.map((line:any)=>line.x1)).toEqual(before.map((line:any)=>line.x1));
  expect(after.map((line:any)=>line.numberX)).toEqual(before.map((line:any)=>line.numberX));
  // The extended part is hit-testable: a point on the 0 level beyond p2.
  expect(model.hitTest(200,200-180/3,drawingProjection,4)).toBe(true);
 });
 it('a click inside a band selects the channel; outside the channel it does not',()=>{
  const model:any=fresh();expect(model.hitTest(50,203,drawingProjection,2)).toBe(true);expect(model.hitTest(300,20,drawingProjection,2)).toBe(false);
  model.applySettings({[P.background]:false});expect(model.hitTest(50,203,drawingProjection,2)).toBe(false);
 });
});

describe('Fib channel: settings, persistence, undo',()=>{
 const bars=fixtureDataset('GME',4).bars;
 it('lists the five channel settings with their values and patches them as one member',()=>{
  const saved=fresh().serialize(),editor=drawingEditor(saved,bars);
  expect(editor.fields.filter(field=>field.path.startsWith(FIB_CHANNEL_FIELD+'.')).map(field=>[field.path,field.label,field.kind])).toEqual([[P.extendLeft,'Extend left','boolean'],[P.extendRight,'Extend right','boolean'],[P.showLevels,'Levels','boolean'],[P.background,'Background','boolean'],[P.opacity,'Background opacity','number']]);
  expect([P.extendLeft,P.extendRight,P.showLevels,P.background,P.opacity].map(path=>editor.values[path])).toEqual([false,false,true,true,20]);
  const next=patchDrawingEdit(saved,bars,{[P.extendLeft]:true,[P.opacity]:45});
  expect(member(next)).toEqual({...FIB_CHANNEL_FACTORY,extendLeft:true,opacity:45});
  expect((deserializeDrawing(next) as any).lvFibChannel).toEqual(member(next));
 });
 it('refuses invalid values and leaves the record unchanged',()=>{
  const saved=fresh().serialize(),copy=structuredClone(saved);
  for(const patch of [{[P.opacity]:-1},{[P.opacity]:101},{[P.opacity]:2.5},{[P.background]:'yes'},{[P.extendLeft]:1}])expect(()=>patchDrawingEdit(saved,bars,patch),JSON.stringify(patch)).toThrow();
  expect(saved).toEqual(copy);
 });
 it('a legacy record gains the member only when a channel setting changes',()=>{
  const saved=legacyRecord();
  const restyled=patchDrawingEdit(saved,bars,{'style.lineWidth':3});expect(member(restyled)).toBeUndefined();
  const filled=patchDrawingEdit(saved,bars,{[P.background]:true});expect(member(filled)).toEqual({...FIB_CHANNEL_LEGACY,background:true});
 });
 it('an invalid member is retained verbatim, painted natively and not editable',async()=>{
  const odd={...legacyRecord()};(odd.props as any)[FIB_CHANNEL_FIELD]={schemaVersion:2,future:true};
  expect(readFibChannel(odd.props).state).toBe('unavailable');
  const model:any=deserializeDrawing(odd)!;expect(member(model.serialize())).toEqual({schemaVersion:2,future:true});
  expect(await painted([model])).toEqual(await painted([nativeTwin(odd)]));
  expect(()=>model.applySettings({[P.background]:true})).toThrow();
 });
 it('places, moves, undoes, deletes and restores through the actual native controller',async()=>{
  const t=await nativeDrawingHarness();try{
   const doc=fresh().serialize();t.controller.setTool('fibchannel');t.controller.onIntent({kind:'create',doc});t.controller.onIntent({kind:'tool-finished',type:'fibchannel'});
   const id=t.controller.all().find((row:any)=>row.type==='fibchannel').id,live:any=t.controller.store.get(id);
   expect(live.lvFibChannel).toEqual(FIB_CHANNEL_FACTORY);expect(ops(t.paint(id),'fill').length).toBeGreaterThan(0);
   t.controller.update(id,{anchors:ANCHORS.map(a=>({time:a.time+5000,price:a.price+3}))});expect(t.controller.store.get(id).anchors[0].price).toBe(103);
   t.controller.undo();expect(t.controller.store.get(id).anchors[0].price).toBe(100);expect((t.controller.store.get(id) as any).lvFibChannel).toEqual(FIB_CHANNEL_FACTORY);
   t.controller.remove(id);expect(t.controller.store.get(id)).toBeFalsy();t.controller.undo();expect((t.controller.store.get(id) as any).lvFibChannel).toEqual(FIB_CHANNEL_FACTORY);
  }finally{t.dispose();}
 });
});

describe('fail closed',()=>{
 // Last on purpose: a second registration appends a status row.
 it('a second module instance cannot replace the registration again and leaves it untouched',()=>{
  const before=getDrawingType('fibchannel');
  const status=registerLvDrawingToolModules([{id:'fib-channel-again',types:FIB_CHANNEL_MODULE.types}]);
  expect(status).toEqual([expect.objectContaining({type:'fibchannel',state:'unavailable',reason:expect.stringContaining('already replaced')})]);
  expect(getDrawingType('fibchannel')).toBe(before);
 });
});
