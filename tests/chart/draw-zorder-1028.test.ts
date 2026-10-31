import {expect,it} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import '../../src/chart/lv-drawing-types';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {createDrawingManager,type DrawingOrderPosition} from '../../src/chart/drawing-manager';

// Send to back then Bring to front on a Fib retracement quarantined
// the chart. Native bringToFront/sendToBack emit (synchronous re-render) BEFORE the adapter's drawing:edited
// listener writes the canonical zIndex; a drawing moved out of the interleaved series stack onto the top canvas
// painted in that window and the presentation binding threw "Native drawing changed or differs from its
// canonical record". SYNTHETIC rows; actual native store/renderer bodies and the actual drawing manager.

type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
const anchors=[{time:1000000,price:100},{time:1120000,price:150},{time:1240000,price:200}];
const MULTI=['fibchannel','pitchfork','gannsquare','fibextension','fibcircles','fibwedge','fibspiral','gannfan','gannbox'];
function fib(){const row=fibBaselineRecord();row.props={...row.props,lvFibBackground:{schemaVersion:1,opacity:40}};return row;}
function rows():SerializedDrawing[]{
 const out=[{...fib(),zIndex:5} as SerializedDrawing];
 MULTI.forEach((type,index)=>out.push(createDrawing(type as never,{id:'SYNTHETIC '+type,paneId:'price',createdAt:1,zIndex:6+index,anchors:type==='fibretracement'?anchors.slice(0,2):anchors} as never)!.serialize()));
 return out;
}
/** Production shape: interleaved committed drawings, canonical written by drawing:edited after the native emit. */
function wire(f:Harness){
 f.setBoundary([10]);(f.core.controller as any).port.stackRange=()=>({front:10,back:0});
 f.core.on('drawing:edited',()=>{f.document.load({...f.document.serialize(),drawings:f.core.controller.store.serialize().drawings});});
 return createDrawingManager({read:()=>f.document.serialize(),write:next=>f.document.load(next),known:()=>true,
  update:list=>f.core.controller.updateMany(list),remove:()=>{},select:()=>{},front:id=>f.core.controller.bringToFront(id),back:id=>f.core.controller.sendToBack(id),
  transaction:operation=>operation(),changed:()=>{}});
}
function run(f:Harness,manager:ReturnType<typeof wire>,id:string,steps:DrawingOrderPosition[]){
 for(const step of steps){
  expect(()=>{manager.order([id],step);f.drain();},id+' '+step).not.toThrow();
  expect(f.diagnostics,id+' '+step).toEqual([]);
  const saved=f.document.all().find(row=>row.id===id)!,native=f.core.controller.store.get(id)!;
  expect(saved.zIndex,id+' '+step+' saved follows native').toBe(native.zIndex);
 }
}
const SEQUENCES:DrawingOrderPosition[][]=[['back','front'],['front','back','front'],['backward','forward','front','back'],['forward','backward','back','backward']];

it.each(SEQUENCES.map(steps=>[steps.join(' > '),steps] as const))('Fib retracement z-order %s never quarantines and the saved order follows',async(_name,steps)=>{
 const f=await fibBaselineHarness();try{
  const manager=wire(f);f.sync(rows());f.drain();
  run(f,manager,String(fibBaselineRecord().id),steps);
  // The saved record caught up: the next frame paints the full LV presentation again.
  f.top.commands.length=0;f.render();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();}
});

it.each(MULTI)('%s z-order (back > front > backward > forward) beside a Fib never quarantines',async type=>{
 const f=await fibBaselineHarness();try{
  const manager=wire(f);f.sync(rows());f.drain();
  run(f,manager,'SYNTHETIC '+type,['back','front','backward','forward','back']);
  run(f,manager,String(fibBaselineRecord().id),['back','front']);
 }finally{f.cleanup();}
});

it('a stacking lag carrying any other difference (locked) is still refused: presentation withheld, chart not quarantined (FIB-SETTINGS-1029)',async()=>{
 const f=await fibBaselineHarness();try{
  f.sync([{...fib(),zIndex:5} as SerializedDrawing]);f.drain();
  f.document.load({version:1,drawings:[{...fib(),zIndex:4,locked:true} as SerializedDrawing]});
  let error:unknown;try{f.render();f.drain();}catch(caught){error=caught;}
  expect(error).toBeUndefined();expect(f.diagnostics).toEqual([]);
  expect(JSON.stringify(f.baseline.diagnostics())).toMatch(/differs from its canonical record/);
 }finally{f.cleanup();}
});

it('fractional start stacking values (vela startZ) take the same path: back > front over a 9.5 Fib',async()=>{
 const f=await fibBaselineHarness();try{
  const manager=wire(f);f.sync([{...fib(),zIndex:9.5} as SerializedDrawing,{...rows()[1],zIndex:8.5} as SerializedDrawing]);f.drain();
  run(f,manager,String(fibBaselineRecord().id),['back','front','backward','back','front']);
 }finally{f.cleanup();}
});

// A new Fib retracement started just under the price series, so candles and BB lines
// covered its ratio/price labels. It now starts above the series stack (as in reference); other drawings keep their start.
it('a new Fib retracement starts above the series stack and paints its level labels on the top canvas',async()=>{
 const f=await fibBaselineHarness();try{
  f.setBoundary([0,10]);const core=f.core.controller as any;core.port.stackRange=()=>({front:10,back:0,price:8});
  expect(core.startZ('fibretracement','price')).toBeGreaterThan(10);
  expect(core.startZ('trendline','price')).toBeLessThan(8);
  const row={...fib(),zIndex:core.startZ('fibretracement','price')} as SerializedDrawing;f.sync([row]);
  f.top.commands.length=0;f.render();f.drain();
  expect(f.diagnostics).toEqual([]);
  const labels=f.top.commands.filter(command=>command.op==='fillText').map(command=>String(command.values[0]));
  expect(labels.length).toBeGreaterThan(0);
 }finally{f.cleanup();}
});

// Root heads-up: a NEW Fib now starts on the top canvas, so it paints inside the native store commit, before the
// adapter's drawing:created listener saves its record ("Fibonacci canonical target is unavailable"). That frame
// withholds the LV presentation instead of quarantining; once saved, the next frame paints it in full.
it.each(['fibretracement',...MULTI])('placing a new %s through the native core never quarantines the chart',async type=>{
 const f=await fibBaselineHarness();try{
  f.setBoundary([0,10]);const core=f.core.controller as any;core.port.stackRange=()=>({front:10,back:0,price:8});
  const follow=()=>f.document.load({...f.document.serialize(),drawings:core.store.serialize().drawings});
  f.core.on('drawing:created',follow);f.core.on('drawing:edited',follow);
  f.sync([]);f.drain();
  let created:any;expect(()=>{created=core.add(type,{paneId:'price',anchors:type==='fibretracement'?anchors.slice(0,2):anchors});f.drain();}).not.toThrow();
  expect(created).toBeTruthy();expect(f.diagnostics).toEqual([]);
  expect(f.document.all().map(row=>row.id)).toEqual([created.id]);
  f.top.commands.length=0;f.render();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  if(type==='fibretracement')expect(f.top.commands.some(command=>command.op==='fillRect'),'full presentation after the save').toBe(true);
 }finally{f.cleanup();}
});

it('a Fib with no saved record outside the creation window is still refused',async()=>{
 const f=await fibBaselineHarness();try{
  f.sync([{...fib(),zIndex:5} as SerializedDrawing]);f.drain();
  let clock=1_000_000;const now=performance.now;performance.now=()=>clock;
  try{
   f.document.load({version:1,drawings:[]});
   f.render();f.drain();expect(f.diagnostics).toEqual([]);// inside the window: withheld, not quarantined
   clock+=5000;let error:unknown;try{f.render();f.drain();}catch(caught){error=caught;}
   expect(String(error)).toMatch(/canonical target is unavailable/);
   expect(f.diagnostics.some(message=>message.includes('Trendline annotation painting failed'))).toBe(true);
  }finally{performance.now=now;}
 }finally{f.cleanup();}
});
