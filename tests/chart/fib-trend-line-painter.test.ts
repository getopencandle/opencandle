import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
it('paints the literal original-anchor diagonal during synchronous native load before returning',async()=>{
 const f=await fibBaselineHarness();try{const row=fibBaselineRecord();f.sync([row]);expect(f.baseline.diagnostics(),JSON.stringify(f.baseline.diagnostics())).toEqual([]);const lines=f.top.commands.filter(value=>value.op==='lineTo').map(value=>value.values);expect(lines).toContainEqual([400,100.00000000000001]);expect(f.top.commands.some(value=>value.op==='setLineDash'&&JSON.stringify(value.values[0])==='[20,15]')).toBe(true);expect(f.controller.drawings[0].serialize()).toStrictEqual(row);}finally{f.cleanup();}
});
it('uses actual native baseline hit/claim/double-click/hover and eraser paths with the owned projector',async()=>{
 const f=await fibBaselineHarness();try{f.sync([fibBaselineRecord()]);Object.assign(f.interaction.deps,{projector:()=>f.renderer.drawingProjector(),drawings:()=>f.controller.onScreen(),selectedIds:()=>f.controller.selectedIds,hoveredId:()=>null,activeTool:()=>null});
  expect(f.interaction.hitAt(300,150)?.id).toBe(fibBaselineRecord().id);expect(f.interaction.claim(300,150)).toBe(true);expect(f.interaction.cursorAt(300,150)).toBe('pointer');
  f.controller.updateHover(300,150);expect(f.controller.hoveredId).toBe(fibBaselineRecord().id);
  let opened=0;f.controller.popup={syncPanel(){},isOpen:()=>false,openPanel(){opened++;},close(){}};f.controller.openSettingsById=()=>{opened++;};expect(f.controller.dblClick(300,150)).toBe(true);expect(opened).toBe(2);
  const intents:any[]=[];f.controller.intentCb=(value:unknown)=>intents.push(value);expect(f.controller.deleteAt(300,150)).toBe(true);expect(intents.at(-1)).toEqual({kind:'delete',ids:[fibBaselineRecord().id]});
 }finally{f.cleanup();}
});
it('keeps normal native levels unchanged and clears cached baseline via actual update scheduling',async()=>{
 const f=await fibBaselineHarness();try{f.setBoundary([10]);f.sync([fibBaselineRecord()]);f.drain();const count=()=>f.slices.at(-1)?.commands.filter(value=>value.op==='lineTo'&&value.values[0]===400&&value.values[1]===100.00000000000001).length??0;expect(count()).toBeGreaterThan(0);
  const next=fibBaselineRecord();(next.props!.lvFibTrendLine as any).enabled=false;f.document.load({version:1,drawings:[next]});f.core.controller.updateMany([{id:next.id,patch:{props:next.props}}]);expect(f.callbacks.length).toBeGreaterThan(0);f.drain();expect(count()).toBe(0);
 }finally{f.cleanup();}
});
it('suppresses added baseline operations after source loss inside native projection',async()=>{
 const f=await fibBaselineHarness();let descriptor:PropertyDescriptor|undefined,prototype:any;
 try{f.sync([fibBaselineRecord()]);prototype=Object.getPrototypeOf(f.coords);descriptor=Object.getOwnPropertyDescriptor(prototype,'timeToX');if(!descriptor||typeof descriptor.value!=='function')throw Error('SYNTHETIC expected native timeToX provider');const original=descriptor.value;let calls=0;Object.defineProperty(prototype,'timeToX',{...descriptor,value:function(...args:any[]){const result=Reflect.apply(original,this,args);if(++calls===1)f.retireSource();return result;}});f.top.commands.length=0;expect(()=>f.render()).toThrow();expect(calls).toBeGreaterThan(0);expect(f.top.commands.some(value=>value.op==='stroke')).toBe(false);expect(f.baseline.diagnostics()).toEqual([]);}finally{if(descriptor)Object.defineProperty(prototype,'timeToX',descriptor);f.cleanup();}
});
it('preserves the enabled diagonal through actual body/anchor drag and modifier-copy previews',async()=>{
 const f=await fibBaselineHarness();try{f.sync([fibBaselineRecord()]);const model=f.controller.drawings[0],original=model.serialize(),intents:any[]=[];const sync=f.core.controller.port.syncDrawings;f.core.controller.port.syncDrawings=(docs:any[])=>{f.document.load({version:1,drawings:docs});return Reflect.apply(sync,f.core.controller.port,[docs]);};f.controller.intentCb=(intent:unknown)=>{intents.push(intent);Reflect.apply(f.core.controller.onIntent,f.core.controller,[intent]);};f.controller.popup.open=()=>{};
  f.interaction.down(300,150,'off',false,false);expect(f.interaction.state.kind).toBe('pressed');f.top.commands.length=0;f.interaction.move(320,170);expect(f.interaction.state.moved).toBe(true);expect(f.top.commands.some(value=>value.op==='setLineDash'&&JSON.stringify(value.values[0])==='[20,15]')).toBe(true);expect(f.baseline.diagnostics()).toEqual([]);f.interaction.up(320,170);expect(intents.filter(value=>value.kind==='edit')).toHaveLength(1);
  f.sync([original]);f.interaction.down(200,200,'off',false,false);expect(f.interaction.state.handle).toBe(0);f.top.commands.length=0;f.interaction.move(220,220);expect(f.top.commands.some(value=>value.op==='setLineDash'&&JSON.stringify(value.values[0])==='[20,15]')).toBe(true);f.interaction.cancel();
  f.sync([original]);f.interaction.down(300,150,'off',false,true);f.top.commands.length=0;f.interaction.move(320,170);expect(f.interaction.state.clones).toHaveLength(1);expect(f.top.commands.some(value=>value.op==='setLineDash'&&JSON.stringify(value.values[0])==='[20,15]')).toBe(true);expect(f.baseline.diagnostics()).toEqual([]);f.interaction.up(320,170);expect(intents.filter(value=>value.kind==='clone')).toHaveLength(1);
 }finally{f.cleanup();}
});
it('uses exact factory-produced placement ghosts and retains native locked selection policy',async()=>{
 const f=await fibBaselineHarness();try{const row=fibBaselineRecord(),draft=createDrawing('fibretracement',{...row,anchors:[row.anchors[0]]})!;f.interaction.state={kind:'placing',draft,need:2,cursor:row.anchors[1]};f.top.commands.length=0;f.render();expect(f.top.commands.some(value=>value.op==='setLineDash'&&JSON.stringify(value.values[0])==='[20,15]')).toBe(true);expect(f.baseline.diagnostics()).toEqual([]);
  f.interaction.state={kind:'idle'};row.locked=true;f.sync([row]);f.interaction.down(300,150);expect(f.interaction.state.kind).toBe('pressed');const before=f.controller.drawings[0].serialize();f.interaction.move(320,170);expect(f.interaction.state.moved).toBe(false);expect(f.controller.drawings[0].serialize()).toStrictEqual(before);
 }finally{f.cleanup();}
});

