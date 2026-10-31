import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {describe,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {installArrowMarkHitArea,arrowMarkHit} from '../../src/chart/arrow-mark-hit';
import '../../src/chart/lv-drawing-types';
import {returnBrushToCursor,type BrushToolReturnPort} from '../../src/chart/brush-tool-return';
import {createTextPlacementHold,TEXT_PLACEMENT_EDITOR_GRACE_MS,type TextPlacementHoldPort} from '../../src/chart/text-placement-hold';
import {LV_ANCHORED_TEXT} from '../../src/chart/lv-types/anchored-text';
import {nativeDrawingHarness} from './drawing-native-harness';
import {publishDrawingSubscribers} from '../../src/chart/drawing-publication';

// SYNTHETIC drawings; no DOM, GUI or screenshot claim.

const T0=1_000_000;
const proj={width:400,height:300,xOf:(time:number)=>20+(time-T0)/1000,yOf:(price:number)=>300-price,pxToPoint:(x:number,y:number)=>({time:T0+(x-20)*1000,price:300-y}),paneIdAtY:()=>'price',paneRect:()=>({top:0,height:300})};
const mark=(type:'arrowmarkup'|'arrowmarkdown')=>createDrawing(type as never,{id:'a1',paneId:'price',createdAt:1,anchors:[{time:T0+100_000,price:150}]} as never) as any;
// Anchor at (120, 150). "up" glyph spans x 111..129, y 150..172; "down" glyph spans y 128..150 (vela GLYPH: head 11, headW 9, stem 3.5, len 22).

// Captured at module evaluation, before any test calls the installer itself: importing lv-drawing-types alone must have patched it.
const WIRED_AT_IMPORT=Object.getPrototypeOf(Object.getPrototypeOf(mark('arrowmarkup'))).hitTest===arrowMarkHit;

describe('F4 arrow mark hit area',()=>{
 it('importing lv-drawing-types installs the widened hit test (production wiring, not the test calling the installer)',()=>{expect(WIRED_AT_IMPORT).toBe(true);});
 it('installs on the pinned native class',()=>{expect(installArrowMarkHitArea()).toEqual({state:'installed'});});
 it('control: the exact native polygon misses the anchor tip and a point beside the stem',()=>{
  const original=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(mark('arrowmarkup'))),'hitTest')!;
  expect(original.value).toBe(arrowMarkHit);
  // The patched method is installed; the polygon test is still reachable through glyphPoints, which is what the native hit test used.
  const g=mark('arrowmarkup').glyphPoints(proj) as number[][];
  const inside=(x:number,y:number)=>{let r=false;for(let i=0,j=g.length-1;i<g.length;j=i++){const a=g[i],b=g[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;};
  expect(inside(120,150)).toBe(false);expect(inside(125,168)).toBe(false);
 });
 it.each([['arrowmarkup',[[120,150],[120,148],[125,168],[131,160],[120,176]]],['arrowmarkdown',[[120,150],[120,152],[125,132],[131,140],[120,124]]]] as const)('%s: clicking on or near the drawn mark selects it',(type,points)=>{
  for(const [x,y] of points)expect(mark(type).hitTest(x,y,proj,6),type+' '+x+','+y).toBe(true);
 });
 it.each(['arrowmarkup','arrowmarkdown'] as const)('%s: far clicks still miss, and so does an unplaced mark',type=>{
  for(const [x,y] of [[200,150],[120,100],[120,215],[60,150]])expect(mark(type).hitTest(x,y,proj,6)).toBe(false);
  const unplaced=createDrawing(type as never,{id:'a2',paneId:'price',createdAt:1,anchors:[]} as never) as any;
  expect(unplaced.hitTest(120,150,proj,6)).toBe(false);
 });
 it('is installed once: re-running keeps one patched method',()=>{
  installArrowMarkHitArea();installArrowMarkHitArea();
  expect(mark('arrowmarkdown').hitTest.call(mark('arrowmarkdown'),120,150,proj,6)).toBe(true);
 });
});

describe('F3 anchored text placement is one undo step',()=>{
 function pure(){
  const log:string[]=[];let editor:string|null=null;
  const port:TextPlacementHoldPort={editing:id=>editor===id,hold:()=>log.push('hold'),release:publish=>log.push(publish?'publish':'lift'),schedule:(cb,ms)=>setTimeout(cb,ms),cancel:h=>clearTimeout(h as ReturnType<typeof setTimeout>)};
  return{hold:createTextPlacementHold(port),log,open(id:string|null){editor=id;}};
 }
 it('create then the inline text edit of an anchored text publishes once',()=>{
  vi.useFakeTimers();
  try{
   const t=pure();t.hold.created('t1',LV_ANCHORED_TEXT,true);expect(t.log).toEqual(['hold']);
   t.open('t1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);
   t.hold.beforeChange('t1');t.hold.edited('t1');expect(t.log).toEqual(['hold']);
   t.open(null);t.hold.beforeChange('t1');t.hold.edited('t1');expect(t.log).toEqual(['hold','publish']);
  }finally{vi.useRealTimers();}
 });
 it('the vela class behind the type is inline-editable (extends TextLabel), which is why it needs the hold',()=>{
  const src=readFileSync('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','utf8');
  expect(src).toContain('return d instanceof Callout || d instanceof TextLabel;');
 });
});

describe('Brush and Highlighter return to Cursor unless stay mode is on',()=>{
 async function rig(stay:boolean){
  const native=await nativeDrawingHarness(),queue:Array<()=>void>=[];
  const port:BrushToolReturnPort={tool:()=>native.controller.getTool(),stay:()=>stay,disarm:()=>native.controller.setTool(null),defer:cb=>queue.push(cb)};
  return{native,port,flush(){while(queue.length)queue.shift()!();}};
 }
 it.each(['freehand','highlighter'])('%s: disarmed after the stroke when stay mode is off',async type=>{
  const r=await rig(false);
  try{
   r.native.controller.setTool(type);r.native.controller.onIntent({kind:'tool-finished',type});
   expect(r.native.controller.getTool(),'native control: the library keeps brushes armed').toBe(type);
   returnBrushToCursor(r.port,type);expect(r.native.controller.getTool(),'deferred, not mid pointer-up').toBe(type);
   r.flush();expect(r.native.controller.getTool()).toBeNull();
  }finally{r.native.dispose();}
 });
 it('stay mode keeps the brush armed; other tools and unrelated creates are left alone',async()=>{
  const stay=await rig(true);
  try{stay.native.controller.setTool('freehand');returnBrushToCursor(stay.port,'freehand');stay.flush();expect(stay.native.controller.getTool()).toBe('freehand');}finally{stay.native.dispose();}
  const off=await rig(false);
  try{
   off.native.controller.setTool('trendline');returnBrushToCursor(off.port,'trendline');off.flush();expect(off.native.controller.getTool()).toBe('trendline');
   returnBrushToCursor(off.port,'freehand');off.flush();expect(off.native.controller.getTool(),'a freehand create while another tool is armed').toBe('trendline');
   returnBrushToCursor(off.port,undefined);off.flush();expect(off.native.controller.getTool()).toBe('trendline');
  }finally{off.native.dispose();}
 });
 it('stay mode turned on before the deferred step wins',async()=>{
  let stay=false;const queue:Array<()=>void>=[];let tool:string|null='highlighter';
  returnBrushToCursor({tool:()=>tool,stay:()=>stay,disarm:()=>{tool=null;},defer:cb=>queue.push(cb)},'highlighter');
  stay=true;queue.forEach(cb=>cb());expect(tool).toBe('highlighter');
 });
 it('adapter.ts wires the created-drawing event to the brush return',()=>{
  const src=readFileSync('src/chart/adapter.ts','utf8');
  expect(src).toContain("chart.on('drawing:created',({id})=>{/* typeof: extracted-line test harnesses evaluate this list without the hook. */if(typeof returnCreatedBrush==='function')returnCreatedBrush(String(id));})");
  expect(src).toContain('returnBrushToCursor({tool:');
 });
});

// Review (adversarial pass): the CURRENT adapter.ts drawing-event wiring, extracted from source as in text-placement-hold.test.ts,
// driven by a controlled native event bus and tool state, so a neutered hook body fails here (the source grep above alone did not).
// SYNTHETIC drawings only; no DOM, renderer or GUI claim.
const adapterSource=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const adapterLine=(start:string)=>{const a=adapterSource.indexOf(start);if(a<0)throw Error('adapter boundary changed: '+start);return adapterSource.slice(a,adapterSource.indexOf('\n',a));};
function adapterWiring(initial:{tool:string|null;stay:boolean}){
 const handlers=new Map<string,Set<(payload:unknown)=>void>>();
 let rows:Array<{id:string;type:string}>=[];const native:{textEditor:null|{id:string}}={textEditor:null};const tools={...initial,disarms:0};
 const chart={on:(event:string,handler:(payload:unknown)=>void)=>{if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event)!.add(handler);return()=>{handlers.get(event)?.delete(handler);};},
  drawings:{all:()=>rows.map(row=>({...row})),getTool:()=>tools.tool,getStayMode:()=>tools.stay,setTool:(type:string|null)=>{if(type===null)tools.disarms++;tools.tool=type;}},renderer:{onCrosshairMove:()=>()=>{}}};
 const code=`const {chart,native,publishDrawingSubscribers,createTextPlacementHold,returnBrushToCursor}=injected;
 let drawingBatch=0,drawingDirty=false,nativeDrawingReconciliationHold=0,drawingEraseHeld=false,selectedDrawingIds=[],disposed=false,lastCrosshair=null,unavailableDrawingIds=new Set(),notifications=0,unhideUnlock=null,drawingUtilityState=null;
 const contextMenus=null,drawingSubscribers=new Set(),knownTypes=new Set(['text','freehand','highlighter','lvanchoredtext']),diagnostics=[],document={all:()=>[]},drawingManager={reconcileRemoved(){}},normalizedCrosshair=value=>value;
 const unhideUnlockStep=state=>({state,changed:false,utility:null}),defaultDrawingUtility=()=>({}),drawingUtilitySubscribers=new Set(),drawingProjection={refresh(){}};
 const rendererHolder={current:{userDrawings:native}};
 const reconcileNativeDrawings=()=>{};
 ${adapterLine('  const duplicateOwn=')}
 ${adapterLine('  const notifyDrawings=')}
 ${adapterLine('  const updateDocument = () =>')}
 ${adapterLine('  const unsubscribes = [')}
 ${adapterLine('  const textPlacementType=')}
 ${adapterLine('  const textPlacementHold=')}
 ${adapterLine('  const returnCreatedBrush=')}
 drawingSubscribers.add(()=>{notifications++;});
 return{state:()=>({notifications,drawingBatch}),batch:value=>{drawingBatch+=value;},reconcile:value=>{nativeDrawingReconciliationHold+=value;},dispose:()=>{disposed=true;for(const off of unsubscribes)off();}};`;
 const api=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({chart,native,publishDrawingSubscribers,createTextPlacementHold,returnBrushToCursor});
 const emit=(event:string,id:string)=>{for(const handler of [...handlers.get(event)??[]])handler({id});};
 return{...api,emit,tools,rows:(value:typeof rows)=>{rows=value;},editor:(id:string|null)=>{native.textEditor=id===null?null:{id};}};
}
const settle=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

describe('adapter.ts wiring (current source)',()=>{
 it.each(['freehand','highlighter'])('%s stroke through the adapter returns to Cursor after the create handlers finish',async type=>{
  const a=adapterWiring({tool:type,stay:false});
  try{
   a.rows([{id:'b1',type}]);a.emit('drawing:created','b1');
   expect(a.tools.tool,'not mid pointer-up').toBe(type);expect(a.state().notifications,'the stroke itself still publishes once').toBe(1);
   await settle();expect(a.tools).toMatchObject({tool:null,disarms:1});
  }finally{a.dispose();}
 });
 it('stay mode, a batch (paste, duplicate, template), a reconciliation load, or disposal never disarm the brush',async()=>{
  const stay=adapterWiring({tool:'freehand',stay:true});stay.rows([{id:'b1',type:'freehand'}]);stay.emit('drawing:created','b1');await settle();
  expect(stay.tools).toMatchObject({tool:'freehand',disarms:0});stay.dispose();
  const batch=adapterWiring({tool:'freehand',stay:false});batch.rows([{id:'b1',type:'freehand'}]);batch.batch(1);batch.emit('drawing:created','b1');batch.batch(-1);await settle();
  expect(batch.tools.disarms).toBe(0);batch.dispose();
  const load=adapterWiring({tool:'highlighter',stay:false});load.rows([{id:'h1',type:'highlighter'}]);load.reconcile(1);load.emit('drawing:created','h1');load.reconcile(-1);await settle();
  expect(load.tools.disarms).toBe(0);load.dispose();
  const gone=adapterWiring({tool:'freehand',stay:false});gone.rows([{id:'b1',type:'freehand'}]);gone.emit('drawing:created','b1');gone.dispose();await settle();
  expect(gone.tools.disarms,'disposed before the deferred step').toBe(0);
 });
 it('a tool switched before the deferred step is left alone',async()=>{
  const a=adapterWiring({tool:'freehand',stay:false});
  try{a.rows([{id:'b1',type:'freehand'}]);a.emit('drawing:created','b1');a.tools.tool='trendline';await settle();expect(a.tools).toMatchObject({tool:'trendline',disarms:0});}finally{a.dispose();}
 });
 it('F3: an anchored text placement (create, inline edit) is ONE drawings notification; an emptied one (removal) is also one',()=>{
  vi.useFakeTimers();
  try{
   const a=adapterWiring({tool:null,stay:false});
   a.rows([{id:'t1',type:LV_ANCHORED_TEXT}]);a.emit('drawing:created','t1');expect(a.state().notifications,'held').toBe(0);
   a.editor('t1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);a.emit('drawing:edited','t1');expect(a.state().notifications).toBe(0);
   a.editor(null);a.emit('drawing:edited','t1');expect(a.state()).toEqual({notifications:1,drawingBatch:0});
   a.rows([{id:'t1',type:LV_ANCHORED_TEXT},{id:'t2',type:LV_ANCHORED_TEXT}]);a.emit('drawing:created','t2');a.editor('t2');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);
   a.editor(null);a.rows([{id:'t1',type:LV_ANCHORED_TEXT}]);a.emit('drawing:removed','t2');expect(a.state()).toEqual({notifications:2,drawingBatch:0});
   a.dispose();
  }finally{vi.useRealTimers();}
 });
});
