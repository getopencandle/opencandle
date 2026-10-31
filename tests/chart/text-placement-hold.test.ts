import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createTextPlacementHold,TEXT_PLACEMENT_EDITOR_GRACE_MS,TEXT_PLACEMENT_EDITOR_POLL_MS,type TextPlacementHoldPort} from '../../src/chart/text-placement-hold';
import {publishDrawingSubscribers} from '../../src/chart/drawing-publication';

// Merged G3, item 5: vela places a Text drawing as a create with the
// initial (empty) label and, after its inline editor closes, an edit with the typed text; LV history records one step
// per drawings notification, so one Text placement was two undo steps. ROOT RULING: one placement = one step, as for
// every other LV tool (no the reference app fact states Text undo granularity; this is LV consistency, not reference-compared).
// Part 1 drives the pure hold. Part 2 runs the CURRENT adapter.ts notification wiring (notifyDrawings, updateDocument,
// the native event subscriptions and the hold declaration, extracted from source) against a controlled native event
// bus and a controlled native text-editor field. SYNTHETIC drawings only; no DOM, renderer or GUI claim.

beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();});

function pure(){
 const log:string[]=[];let editor:string|null=null,held=0;
 const port:TextPlacementHoldPort={editing:id=>editor===id,hold:()=>{held++;log.push('hold');},release:publish=>{held--;log.push(publish?'publish':'lift');},schedule:(callback,ms)=>setTimeout(callback,ms),cancel:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)};
 return{hold:createTextPlacementHold(port),log,open(id:string|null){editor=id;},held:()=>held};
}

describe('text placement hold (pure)',()=>{
 it('create then inline edit of a text drawing publishes once',()=>{
  const t=pure();t.hold.created('t1','text',true);expect(t.log).toEqual(['hold']);
  t.open('t1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);
  t.hold.beforeChange('t1');t.hold.edited('t1');expect(t.log,'an edit while the editor is open is absorbed').toEqual(['hold']);
  t.open(null);t.hold.beforeChange('t1');t.hold.edited('t1');
  expect(t.log).toEqual(['hold','publish']);expect(t.held()).toBe(0);expect(t.hold.active()).toBe(false);
  vi.advanceTimersByTime(1000);expect(t.log).toEqual(['hold','publish']);
 });
 it('other tools are never held; a busy (non-idle) create is never held',()=>{
  const t=pure();t.hold.created('l1','trendline',true);t.hold.created('t1','text',false);t.hold.created('x',undefined,true);
  expect(t.log).toEqual([]);expect(t.hold.active()).toBe(false);
 });
 it('Escape on an empty label: the removal completes the placement with one publication',()=>{
  const t=pure();t.hold.created('t1','text',true);t.open('t1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);
  t.open(null);t.hold.beforeChange('t1');t.hold.removed('t1');expect(t.log).toEqual(['hold','publish']);
 });
 it('an editor that never opens, or closes without an edit, still releases once',()=>{
  const t=pure();t.hold.created('t1','text',true);vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS-1);expect(t.log).toEqual(['hold']);
  vi.advanceTimersByTime(1);expect(t.log).toEqual(['hold','publish']);
  t.hold.created('c1','callout',true);t.open('c1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS+5*TEXT_PLACEMENT_EDITOR_POLL_MS);
  expect(t.log).toEqual(['hold','publish','hold']);
  t.open(null);vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_POLL_MS);expect(t.log).toEqual(['hold','publish','hold','publish']);
 });
 it('a change to another drawing or a new create ends the hold first; dispose lifts it without publishing',()=>{
  const t=pure();t.hold.created('t1','text',true);t.open('t1');t.hold.beforeChange('other');expect(t.log).toEqual(['hold','publish']);
  t.hold.created('t2','text',true);t.hold.created('t3','text',true);expect(t.log).toEqual(['hold','publish','hold','publish','hold']);
  t.hold.dispose();expect(t.log.at(-1)).toBe('lift');expect(t.held()).toBe(0);
  t.hold.created('t4','text',true);vi.advanceTimersByTime(1000);expect(t.log.at(-1)).toBe('lift');
 });
});

// Part 2: the current adapter wiring.
const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const line=(start:string,required=true)=>{const a=source.indexOf(start);if(a<0){if(required)throw Error('adapter boundary changed: '+start);return '';}return source.slice(a,source.indexOf('\n',a));};
function adapterWiring(){
 const handlers=new Map<string,Set<(payload:unknown)=>void>>();
 let rows:Array<{id:string;type:string}>=[];const native:{textEditor:null|{id:string}}={textEditor:null};
 const chart={on:(event:string,handler:(payload:unknown)=>void)=>{if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event)!.add(handler);return()=>{handlers.get(event)?.delete(handler);};},drawings:{all:()=>rows.map(row=>({...row}))},renderer:{onCrosshairMove:()=>()=>{}}};
 const code=`const {chart,native,publishDrawingSubscribers,createTextPlacementHold}=injected;
 let drawingBatch=0,drawingDirty=false,nativeDrawingReconciliationHold=0,drawingEraseHeld=false,selectedDrawingIds=[],disposed=false,lastCrosshair=null,unavailableDrawingIds=new Set(),notifications=0;
 const contextMenus=null,drawingSubscribers=new Set(),knownTypes=new Set(['text','callout','trendline']),diagnostics=[],document={all:()=>[]},drawingManager={reconcileRemoved(){}},normalizedCrosshair=value=>value,unavailable=message=>{throw Error(message);};
 const rendererHolder={current:{userDrawings:native}};
 const reconcileNativeDrawings=()=>{};
 ${line('  const duplicateOwn=')}
 ${line('  const notifyDrawings=')}
 ${line('  const updateDocument = () =>')}
 ${line('  const unsubscribes = [')}
 ${line('  const textPlacementType=',false)}
 ${line('  const textPlacementHold=',false)}
 drawingSubscribers.add(()=>{notifications++;});
 return{state:()=>({notifications,drawingBatch,drawingDirty}),batch:value=>{drawingBatch+=value;},dispose:()=>{disposed=true;for(const off of unsubscribes)off();}};`;
 const api=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({chart,native,publishDrawingSubscribers,createTextPlacementHold});
 const emit=(event:string,id:string)=>{for(const handler of [...handlers.get(event)??[]])handler({id});};
 return{...api,emit,rows:(value:typeof rows)=>{rows=value;},editor:(id:string|null)=>{native.textEditor=id===null?null:{id};}};
}

describe('adapter text placement publication (current adapter.ts wiring)',()=>{
 it('one Text placement (create, edit while editing, closing edit) is ONE drawings notification',()=>{
  const a=adapterWiring();
  a.rows([{id:'t1',type:'text'}]);a.emit('drawing:created','t1');
  expect(a.state().notifications,'the empty-text create is held').toBe(0);
  a.editor('t1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);a.emit('drawing:edited','t1');
  a.editor(null);a.emit('drawing:edited','t1');
  expect(a.state()).toEqual({notifications:1,drawingBatch:0,drawingDirty:false});
  vi.advanceTimersByTime(1000);expect(a.state().notifications).toBe(1);
  a.dispose();
 });
 it('control: a trendline create notifies once, immediately',()=>{
  const a=adapterWiring();a.rows([{id:'l1',type:'trendline'}]);a.emit('drawing:created','l1');
  expect(a.state()).toEqual({notifications:1,drawingBatch:0,drawingDirty:false});a.dispose();
 });
 it('Escape on an empty label: create then removal is one notification with the drawing gone (no net change, no undo step)',()=>{
  const a=adapterWiring();a.rows([{id:'t1',type:'text'}]);a.emit('drawing:created','t1');
  a.editor('t1');vi.advanceTimersByTime(TEXT_PLACEMENT_EDITOR_GRACE_MS);a.editor(null);a.rows([]);a.emit('drawing:removed','t1');
  expect(a.state()).toEqual({notifications:1,drawingBatch:0,drawingDirty:false});a.dispose();
 });
 it('a create inside another drawing publication is not held; dispose lifts an open hold without publishing',()=>{
  const a=adapterWiring();a.batch(1);a.rows([{id:'t1',type:'text'}]);a.emit('drawing:created','t1');a.batch(-1);
  expect(a.state().drawingBatch).toBe(0);
  a.rows([{id:'t1',type:'text'},{id:'t2',type:'text'}]);a.emit('drawing:created','t2');a.editor('t2');
  expect(a.state().drawingBatch).toBe(1);a.dispose();expect(a.state().drawingBatch).toBe(0);
  vi.advanceTimersByTime(1000);expect(a.state().notifications).toBe(0);
 });
});
