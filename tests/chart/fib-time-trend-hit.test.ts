import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {fibBaselineHarness} from './fib-trend-line-painter-harness';

// "Trend-based fib time cannot be selected on the chart". Its
// painted body is the set of vertical level lines that START at the third anchor
// (x = time(p3) + ratio * (time(p2) - time(p1))), not anything between the first two
// anchors, which is where the sweep clicked. These pin the actual owned route
// (annotation-wrapped hitAt/updateHover, native interaction and core store): the drawing
// is selected and dragged from its painted level lines. SYNTHETIC rows.

type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
const anchors=[{time:1000000,price:100},{time:1120000,price:200},{time:1240000,price:150}];
function wire(f:Harness){const intents:any[]=[],opened:string[]=[];
 f.controller.intentCb=(intent:any)=>{intents.push(intent);Reflect.apply(f.core.controller.onIntent,f.core.controller,[intent]);};
 f.controller.popup.open=()=>{};f.controller.openSettingsById=(id:string)=>{opened.push(id);};
 Object.assign(f.interaction.deps,{changed:()=>{f.controller.syncLift();f.controller.render();},openSettings:(id:string)=>f.controller.openSettingsById(id)});
 return{intents,opened};}

it('a placed trend-based fib time is selected by clicking its painted level line and moves with a body drag',async()=>{
 const f=await fibBaselineHarness();try{
  f.sync([]);const {intents,opened}=wire(f);const proj=f.renderer.drawingProjector();
  const px=(time:number)=>proj.xOf(time),py=(price:number)=>proj.yOf(price,'price');
  // Three placement clicks through the native interaction (create intent into the core store).
  Object.assign(f.interaction.deps,{activeTool:()=>'trendfibtime'});f.interaction.down(px(anchors[0].time),py(anchors[0].price));
  Object.assign(f.interaction.deps,{activeTool:()=>null});
  for(const point of anchors.slice(1)){f.interaction.move(px(point.time),py(point.price));f.interaction.down(px(point.time),py(point.price));}
  const created=intents.find(intent=>intent.kind==='create');expect(created?.doc.type).toBe('trendfibtime');
  f.document.load({version:1,drawings:f.core.controller.store.serialize().drawings});
  const model=f.controller.drawings.find((row:any)=>row.type==='trendfibtime');expect(model).toBeDefined();
  const lines=model.entryLines(proj);expect(lines.length).toBeGreaterThan(0);
  // The 0 level is the vertical line through the third anchor.
  const x0=lines[0].x1;expect(x0).toBeCloseTo(px(anchors[2].time),6);
  const id=model.id;
  // Hover and a click on that line select it (a no-move press opens its settings).
  f.controller.updateHover(x0+2,40);expect(f.controller.hoveredId).toBe(id);
  expect(f.interaction.hitAt(x0+2,40)?.id).toBe(id);
  f.interaction.down(x0+2,40);expect(f.interaction.state.kind).toBe('pressed');f.interaction.up(x0+2,40);expect(opened).toEqual([id]);
  // Body drag from the same line commits one edit that translates all three anchors.
  f.interaction.down(x0+2,40);f.interaction.move(x0+30,60);expect(f.interaction.state.moved).toBe(true);f.interaction.up(x0+30,60);
  const edit=intents.filter(intent=>intent.kind==='edit').at(-1);expect(edit?.doc.id).toBe(id);
  const moved=f.core.controller.store.serialize().drawings.find((row:any)=>row.id===id)!.anchors;
  for(let i=0;i<3;i++){expect(moved[i].time).toBeGreaterThan(anchors[i].time);expect(moved[i].price).toBeLessThan(anchors[i].price);}
  expect(f.diagnostics).toEqual([]);
 }finally{f.cleanup();}
});

it('every enabled level line of a committed trend-based fib time is hittable on screen',async()=>{
 const f=await fibBaselineHarness();try{
  const row=createDrawing('trendfibtime',{id:'SYNTHETIC fib time',paneId:'price',createdAt:1,anchors})!.serialize();f.sync([row]);wire(f);
  const proj=f.renderer.drawingProjector(),lines=f.controller.drawings[0].entryLines(proj);
  const visible=lines.filter((line:any)=>line.x1>=0&&line.x1<=proj.width);expect(visible.length).toBeGreaterThan(0);
  for(const line of visible)for(const y of [5,150,295])expect(f.interaction.hitAt(line.x1+1,y)?.id).toBe('SYNTHETIC fib time');
 }finally{f.cleanup();}
});
