import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {drawingTypes} from '@luxalgo/vela';
import {nativeDrawingHarness} from './drawing-native-harness';
import {crosshairPlacement,crosshairPaneId,PLACE_POINTER_MESSAGE} from '../../src/chart/place-at-crosshair';

// Runs the actual adapter placeAtCrosshair body (extracted from src/chart/adapter.ts) against the actual
// pinned native drawings controller; the busy/gesture guard is injected so each refusal path is observable.
const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('    placeAtCrosshair:('),end=source.indexOf('\n    },\n',start);
if(start<0||end<start)throw Error('placeAtCrosshair boundary changed; review this test.');
const body=source.slice(start,end+'\n    },'.length).trim().replace(/,$/,'');
function command(drawings:any,state:{crosshair:any;guard:(operation:string)=>void;scene?:any;bars?:any[]}){
 const knownTypes=new Set(drawingTypes().map(row=>String(row.type)));
 const make=new Function('return '+stripTypeScriptTypes(`(function(injected){const {chart,knownTypes,state,crosshairPlacement,PLACE_POINTER_MESSAGE}=injected;const rendererHolder={current:state.scene?{scene:state.scene}:null};const currentBars=state.bars??[];const assertDuplicateMutable=operation=>state.guard(operation);return {get lastCrosshair(){return state.crosshair;},run(type){let lastCrosshair=state.crosshair;const api={${body}};return api.placeAtCrosshair(type);}};})`,{mode:'strip'}))();
 return make({chart:{drawings},knownTypes,state,crosshairPlacement,PLACE_POINTER_MESSAGE});
}
const point={time:1_060,price:142.5,paneKind:'price',values:new Map(),ohlc:null};

describe('adapter placeAtCrosshair (reference drawRightThere for Alt + H/J/V/C)',()=>{
 it('places one single-point line at the crosshair through drawings.add: history recorded and drawing:created emitted',async()=>{
  const t=await nativeDrawingHarness();try{
   const created:string[]=[];t.on('drawing:created',({id})=>created.push(id));const guard=vi.fn();
   const run=command(t.controller,{crosshair:point,guard});
   for(const type of ['hline','hray','vline','crossline']){const result=run.run(type);expect(result.ok,type).toBe(true);}
   expect(guard.mock.calls).toEqual([['placement'],['placement'],['placement'],['placement']]);
   const rows=t.controller.all();expect(rows.map((row:any)=>row.type)).toEqual(['hline','hray','vline','crossline']);
   for(const row of rows)expect(row.anchors).toEqual([{time:1_060_000,price:142.5}]);
   expect(created).toEqual(rows.map((row:any)=>row.id));expect(t.controller.canUndo()).toBe(true);
   t.controller.undo();expect(t.controller.all()).toHaveLength(3);
  }finally{t.dispose();}
 });
 it('refuses without a readable crosshair point, and never places other tool types',async()=>{
  const t=await nativeDrawingHarness();try{
   for(const crosshair of [null,{...point,time:null},{...point,price:null},{...point,paneKind:'study'},{...point,paneKind:null},{...point,price:Number.NaN}])
    expect(command(t.controller,{crosshair,guard:()=>{}}).run('hline')).toEqual({ok:false,message:PLACE_POINTER_MESSAGE});
   for(const type of ['trendline','box','fibretracement','lvshortposition'])expect(()=>command(t.controller,{crosshair:point,guard:()=>{}}).run(type)).toThrow('Only single-point line tools');
   expect(t.controller.all()).toHaveLength(0);expect(t.controller.canUndo()).toBe(false);
  }finally{t.dispose();}
 });
 it('propagates the busy/gesture/editor/armed-tool/eraser refusal before touching the renderer',async()=>{
  const t=await nativeDrawingHarness();try{
   const run=command(t.controller,{crosshair:point,guard:()=>{throw Error('Finish the active native gesture or text editor before drawing placement.');}});
   expect(()=>run.run('vline')).toThrow('before drawing placement');expect(t.controller.all()).toHaveLength(0);
  }finally{t.dispose();}
 });
 it('uses the adapter guard that refuses busy charts, active gestures/editors, an armed tool and eraser mode, and the publication path of pointer placements',()=>{
  expect(body).toContain("assertDuplicateMutable('placement')");expect(body).toContain('chart.drawings.add(type');
  const guard=source.slice(source.indexOf('  const assertDuplicateMutable='),source.indexOf('\n  };',source.indexOf('  const assertDuplicateMutable=')));
  for(const fragment of ["analysisUnavailable||analysisPending||marketUpdating||marketQueue.isPending()","isEditing()","duplicateOwn(native,'activeTool')!==null","duplicateOwn(native,'textEditor')!==null","duplicateOwn(native,'eraserMode')!==false"])expect(guard,fragment).toContain(fragment);
  expect(source).toContain("chart.on('drawing:created',updateDocument)");
 });
 it('CHART-TB 2: a vertical line from a sub-pane without a readable pane lands on the price pane at the pointer time',async()=>{
  const t=await nativeDrawingHarness();try{
   const result=command(t.controller,{crosshair:{...point,price:55,paneKind:'study'},guard:()=>{},bars:[{time:1_000,close:140}]}).run('vline');
   expect(result.ok).toBe(true);expect(t.controller.all().map((row:any)=>[row.type,row.paneId??'price',row.anchors])).toEqual([['vline','price',[{time:1_060_000,price:140}]]]);
  }finally{t.dispose();}
 });
});
describe('crosshairPlacement (CHART-TB 2: any pane)',()=>{
 const scene={crosshair:{x:10,y:450},panes:new Map([['price',{bounds:{top:0,height:400}}],['pane-rsi',{bounds:{top:404,height:120}}]])};
 it('names the pane under the crosshair from scene bounds',()=>{
  expect(crosshairPaneId(scene)).toBe('pane-rsi');expect(crosshairPaneId({...scene,crosshair:{x:1,y:100}})).toBe('price');
  expect(crosshairPaneId({...scene,crosshair:null})).toBeNull();expect(crosshairPaneId({...scene,crosshair:{x:1,y:402}})).toBeNull();expect(crosshairPaneId(undefined)).toBeNull();
 });
 it('places every single-point line on the hovered sub-pane at that pane value',()=>{
  for(const type of ['hline','hray','vline','crossline'] as const)expect(crosshairPlacement(type,{time:5,price:61.2,paneKind:'study'},scene,140)).toEqual({ok:true,paneId:'pane-rsi',price:61.2});
  expect(crosshairPlacement('hline',{time:5,price:142,paneKind:'price'},scene,140)).toEqual({ok:true,paneId:'price',price:142});
 });
 it('without a readable sub-pane only the vertical line falls back to the price pane',()=>{
  expect(crosshairPlacement('vline',{time:5,price:61.2,paneKind:'study'},null,140)).toEqual({ok:true,paneId:'price',price:140});
  expect(crosshairPlacement('vline',{time:5,price:61.2,paneKind:'study'},null,null).ok).toBe(false);
  for(const type of ['hline','hray','crossline'] as const)expect(crosshairPlacement(type,{time:5,price:61.2,paneKind:'study'},null,140)).toEqual({ok:false,message:PLACE_POINTER_MESSAGE});
 });
});
