import {describe,expect,it} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {singleClickPlacement} from '../../src/chart/lv-types/position-tool';
import {LV_SHORT_POSITION} from '../../src/chart/lv-types/short-position';
import {drawingProjection} from './drawing-native-harness';
import {annotationNativeHarness} from './trendline-annotation-native-harness';

// One click with the Long or Short position tool places the box at once (the reference app), through the pinned
// native DrawingInteraction bodies. SYNTHETIC projection: 1 px = 1 second, 1 px = 1 price unit.
const T0=1_000_000;
async function click(tool:string){
 const paint=await annotationNativeHarness(),intents:any[]=[];
 const projector={...drawingProjection,pxToPoint:(x:number,y:number)=>({time:T0+(x-20)*1000,price:300-y}),paneIdAtY:()=>'price'};
 Object.assign(paint.interaction.deps,{projector:()=>projector,activeTool:()=>tool,toolDefaults:()=>null,emit:(intent:unknown)=>intents.push(intent),changed(){},drawings:()=>[],selectedIds:()=>new Set(),hoveredId:()=>null,snap:(point:unknown)=>point});
 const at=[120,150] as const;
 paint.interaction.down(...at,'off',false,false);
 const afterPress=intents.map(intent=>intent.kind),stateAfterPress=paint.interaction.state.kind;
 paint.interaction.up(...at);
 return{afterPress,stateAfterPress,intents,state:paint.interaction.state.kind,entry:300-at[1]};
}
describe('FLOWS-AUDIT-1028 #8 position tools place on a single click',()=>{
 for(const [tool,side] of [['position','long'],[LV_SHORT_POSITION,'short']] as const)it(`${tool}: the press creates a default ${side} box, no move or second click`,async()=>{
  expect(lvDrawingTypeStatus().find(row=>row.type===tool)).toMatchObject({state:'registered'});
  const r=await click(tool);
  expect(r.afterPress).toEqual(['create','tool-finished']);expect(r.stateAfterPress).toBe('idle');
  expect(r.intents.map(intent=>intent.kind)).toEqual(['create','tool-finished']);expect(r.state).toBe('idle');
  const doc=r.intents[0].doc as SerializedDrawing;expect(doc.type).toBe(tool);expect(doc.anchors).toHaveLength(3);
  const [entry,stop,target]=doc.anchors;expect(entry.price).toBe(r.entry);expect(stop.time).toBe(target.time);expect(target.time).toBeGreaterThan(entry.time);
  if(side==='long'){expect(target.price).toBeGreaterThan(entry.price);expect(stop.price).toBeLessThan(entry.price);}
  else{expect(target.price).toBeLessThan(entry.price);expect(stop.price).toBeGreaterThan(entry.price);}
 });
 it('only a one-anchor placement draft is doubled; saved records and empty creates are untouched',()=>{
  const one={paneId:'price',anchors:[{time:T0,price:100}]};expect(singleClickPlacement(one).anchors).toEqual([{time:T0,price:100},{time:T0,price:100}]);
  expect(singleClickPlacement(one).anchors![1]).not.toBe(one.anchors[0]);
  const three={paneId:'price',anchors:[{time:T0,price:100},{time:T0+1,price:90},{time:T0+1,price:120}]};expect(singleClickPlacement(three)).toBe(three);
  const none={paneId:'price'};expect(singleClickPlacement(none)).toBe(none);
  expect(createDrawing('position',three)!.anchors).toEqual(three.anchors);
 });
});
