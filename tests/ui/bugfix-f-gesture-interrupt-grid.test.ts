import {afterEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState,type MultiChartGridProps,type MultiChartTransactionCoordinator} from '../../src/ui/MultiChartGrid';
// BE-3 (since BD-R2 removed the ~10 s cap, the autosave
// defers for as long as gestureActive() is true, so a frame gesture interrupted without a release (window blur, hidden
// window, lost pointer capture: tests/ui/bugfix-f-gesture-interrupt-cell.test.ts) held autosave off until the next chart
// interaction. The grid now ends the open gesture on the cell's interruption report, owner-checked: only the cell whose
// begin opened the still-open gesture can end it. Actual MultiChartGrid coordinator and frame gesture under controlled
// React hooks; native charts are controlled ports. No DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>value===b[index]);return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value];},useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps)){hooks.cells[i]={deps,off:prior?.off};hooks.effects.push(()=>{prior?.off?.();hooks.cells[i].off=effect();});}}};});
function all(node:any,predicate:(node:any)=>boolean,result:any[]=[]){if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(){for(const effect of hooks.effects.splice(0))effect();await wait(15);}
afterEach(()=>{for(const item of hooks.cells)if(item?.off)try{item.off();}catch{/* retired */}hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

async function grid(cells:1|2=1,extra:Partial<MultiChartGridProps>={}){
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const gme=fixtureDataset('GME',5);let coordinator:MultiChartTransactionCoordinator|null=null;let ids=0;
 const single=createMultiChartState(gme,{appearance:defaultTheme.appearance}),state=cells===2?resizeMultiChartState(single,'two-columns',()=>'synthetic-cell-'+(++ids)):single;
 const changes:any[]=[];
 const props:MultiChartGridProps={state,datasets:[gme],activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},
  onChange(next,_prepared,baseline,markCommitted){changes.push({next,baseline});markCommitted?.();props.state=next;return true;},
  onTransactionReady:value=>{coordinator=value;},...extra};
 const render=()=>{hooks.cursor=0;return MultiChartGrid(props);};render();await settle();
 let view:{from:number;to:number}|null={from:1,to:5},host:any=null;
 const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,captureHistoricalFrame:()=>({schemaVersion:1,basis:{},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null}),getViewport:()=>view?{...view}:null,bindDrawingWorkspaceHost:(value:any)=>{host=value;return()=>{};},getAnalysisUnavailable:()=>'',saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]}};
 const gridCells=()=>all(render(),node=>typeof node.type==='function'&&node.type.name==='GridCell');
 for(const cell of gridCells()){cell.props.onReady(chart);cell.props.onStatus({input:{bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'},settled:true,error:''});}
 render();await settle();render();await settle();
 return{coordinator:()=>coordinator!,cell:(index=0)=>gridCells()[index],changes,props,host:()=>host,refresh:async()=>{render();await settle();},pan(){view={from:view!.from+1,to:view!.to+1};},view:(value:{from:number;to:number}|null)=>{view=value;},alerts:()=>all(render(),node=>node.type==='output'&&node.props.role==='alert').map(node=>String(node.props.children))};
}

it('BE-3: an interrupted frame gesture ends like a release: the 200 ms window runs, then gestureActive() clears so the autosave resumes',async()=>{
 const g=await grid();
 expect(g.cell().props.onBeginGesture()).toBe(true);expect(g.coordinator().gestureActive!()).toBe(true);
 await wait(400);expect(g.coordinator().gestureActive!(),'an open gesture never times out (BD-R2)').toBe(true);
 // Probe: the cell reports a drag interrupted without pointercancel (blur, hidden, lost capture).
 g.cell().props.onInterruptGesture();
 expect(g.coordinator().gestureActive!()).toBe(true);// inside the frame gesture's 200 ms publication window, as after a release
 await wait(230);expect(g.coordinator().gestureActive!()).toBe(false);
 expect(g.changes,'an unchanged frame publishes nothing').toHaveLength(0);
 // The hidden-window flush now treats it as finished (it publishes finished gestures only).
 expect(g.cell().props.onBeginGesture()).toBe(true);g.cell().props.onInterruptGesture();
 g.coordinator().flushFrameGesture!();expect(g.coordinator().gestureActive!()).toBe(false);
});

it('BE-3: owner-checked: only the cell whose begin opened the still-open gesture can end it',async()=>{
 const g=await grid(2);
 expect(g.cell(0).props.onBeginGesture()).toBe(true);expect(g.coordinator().gestureActive!()).toBe(true);
 g.cell(1).props.onInterruptGesture();await wait(230);
 expect(g.coordinator().gestureActive!(),'another cell cannot end it').toBe(true);
 g.cell(0).props.onInterruptGesture();await wait(230);expect(g.coordinator().gestureActive!()).toBe(false);
 // A late interruption after the gesture already ended is a no-op, and cannot end a newer gesture opened since.
 g.cell(0).props.onFinishGesture();
 expect(g.cell(0).props.onBeginGesture()).toBe(true);g.cell(0).props.onFinishGesture();await wait(230);
 expect(g.cell(1).props.onBeginGesture()).toBe(true);
 g.cell(0).props.onInterruptGesture();await wait(230);
 expect(g.coordinator().gestureActive!(),'the stale owner cannot end the newer gesture').toBe(true);
 g.cell(1).props.onFinishGesture();await wait(230);expect(g.coordinator().gestureActive!()).toBe(false);
});

// A released frame gesture stays "open" for its 200 ms coalescing
// window, and the drawing workspace port counted it as blocked, so Undo/Redo and eraser arming right after a chart click
// were refused with "unavailable or has been replaced". The port now settles (flushes) a FINISHED gesture at command
// entry; a gesture whose pointer is still held stays refused. After a settle that publishes a drag, the state handed to
// App's history callback is the published state (App refuses anything but its current grid).
function workspaceRoutes(){
 const received:any[]=[];
 const onDrawingHistory=vi.fn((_direction:'undo'|'redo',expected:any)=>{received.push(expected);});
 const onCaptureDrawingWorkspace=vi.fn(()=>({assertCurrent(){},prepare(){throw Error('SYNTHETIC: not prepared in this test');}}));
 return{received,onDrawingHistory,onCaptureDrawingWorkspace};
}
it('BF-G3: undo and eraser within 200 ms of a released click settle it instead of refusing; nothing is published',async()=>{
 const routes=workspaceRoutes(),g=await grid(1,{onDrawingHistory:routes.onDrawingHistory,onCaptureDrawingWorkspace:routes.onCaptureDrawingWorkspace as any});
 const owner=vi.fn();
 expect(g.cell().props.onBeginGesture()).toBe(true);g.cell().props.onFinishGesture();
 expect(()=>g.host().history('undo',owner)).not.toThrow();
 expect(routes.received).toEqual([g.props.state]);expect(owner).toHaveBeenCalled();
 expect(g.cell().props.onBeginGesture()).toBe(true);g.cell().props.onFinishGesture();
 expect(()=>g.host().capture('erase')).not.toThrow();expect(routes.onCaptureDrawingWorkspace).toHaveBeenCalledOnce();
 expect(g.cell().props.onBeginGesture()).toBe(true);g.cell().props.onFinishGesture();
 expect(()=>g.host().historyStatus()).not.toThrow();
 await wait(250);expect(g.changes,'a click with no frame change publishes nothing').toHaveLength(0);
});
it('BF-G3: a released drag is published first, exactly once, and history receives the published state',async()=>{
 const routes=workspaceRoutes(),g=await grid(1,{onDrawingHistory:routes.onDrawingHistory,onCaptureDrawingWorkspace:routes.onCaptureDrawingWorkspace as any});
 const opening=g.props.state;
 expect(g.cell().props.onBeginGesture()).toBe(true);g.pan();g.cell().props.onFinishGesture();
 g.host().history('undo',()=>{expect(g.changes,'the frame step is published before dispatch').toHaveLength(1);});
 expect(g.changes).toHaveLength(1);expect(g.changes[0].baseline.kind).toBe('native-frame');expect(g.changes[0].baseline.expectedGrid).toBe(opening);
 expect(routes.received).toHaveLength(1);expect(routes.received[0],'the fresh published state, not the pre-flush props').toBe(g.changes[0].next);
 expect(routes.received[0]).not.toBe(opening);
 // The old 200 ms timer must not fire into a NEWER gesture whose pointer is still held (re-render first, as React
 // would after the publication, so the new frame fingerprints exist).
 await g.refresh();expect(g.cell().props.onBeginGesture()).toBe(true);g.pan();
 await wait(250);expect(g.changes,'no second publication and no early flush of the held gesture').toHaveLength(1);
 expect(g.cell().props.brokenMessage).toBeUndefined();
 g.cell().props.onFinishGesture();await wait(250);expect(g.changes).toHaveLength(2);
});
it('BF-G3: a gesture whose pointer is still held keeps refusing workspace history and erase',async()=>{
 const routes=workspaceRoutes(),g=await grid(1,{onDrawingHistory:routes.onDrawingHistory,onCaptureDrawingWorkspace:routes.onCaptureDrawingWorkspace as any});
 expect(g.cell().props.onBeginGesture()).toBe(true);g.pan();
 expect(()=>g.host().history('undo',()=>{})).toThrow('unavailable or has been replaced');
 expect(()=>g.host().capture('erase')).toThrow('unavailable or has been replaced');
 expect(()=>g.host().historyStatus()).toThrow('unavailable or has been replaced');
 expect(routes.onDrawingHistory).not.toHaveBeenCalled();expect(g.changes).toHaveLength(0);
 g.cell().props.onFinishGesture();await wait(250);expect(g.changes).toHaveLength(1);
});

// The next wheel turn after a saved frame gesture arrived before the
// asynchronous fingerprint effect re-ran for the saved cell, so the grid could not observe the cell and refused the turn
// (then, before the gesture fix, every later gesture). Frame fingerprints are a pure function of the cell's indicators,
// script bindings and comparisons plus the datasets; a frame publication replaces only frame, viewport and scale
// options, so the cached fingerprints still describe the saved cell and the next turn is accepted.
it('FREEZE-A: the next gesture right after a saved frame publication is accepted before the fingerprint effect re-runs',async()=>{
 const g=await grid();
 expect(g.cell().props.onBeginGesture()).toBe(true);g.pan();g.cell().props.onFinishGesture();
 await wait(230);expect(g.changes).toHaveLength(1);
 // No re-render or effect pass here: the fingerprint cache still holds the pre-publication cell object.
 expect(g.cell().props.onBeginGesture(),'the next turn is not refused').toBe(true);g.pan();g.cell().props.onFinishGesture();
 await wait(230);expect(g.changes).toHaveLength(2);expect(g.changes[1].baseline.expectedGrid).toBe(g.changes[0].next);
 expect(g.cell().props.brokenMessage).toBeUndefined();
});

// Review finding R-G2-1 (quarantine was not enforced on the frame-gesture path.
// After a capture error quarantined a cell, the next wheel/key begin succeeded (blocked is no longer sticky)
// and its flush could publish a frame for the quarantined cell. begin now refuses visibly while any linked cell is
// quarantined, and the frame publication refuses a quarantined target; the quarantine itself stays in place.
it('R-G2-1: a quarantined cell refuses new frame gestures visibly and keeps its quarantine',async()=>{
 const g=await grid();
 g.view(null);expect(g.cell().props.onBeginGesture(),'a real capture error refuses and quarantines').toBe(false);
 const broken=g.cell().props.brokenMessage;expect(broken).toContain('cannot be saved');
 g.view({from:1,to:5});
 expect(g.cell().props.onBeginGesture(),'no frame gesture opens on a quarantined chart').toBe(false);
 expect(g.alerts().join(' ')).toContain('Reopen the affected chart');
 g.pan();g.cell().props.onFinishGesture();await wait(230);
 expect(g.changes,'nothing is published for the quarantined cell').toHaveLength(0);
 expect(g.cell().props.brokenMessage,'quarantine intact').toBe(broken);
});
it('R-G2-1: a cell quarantined during an open gesture is not published at its flush; quarantine stays',async()=>{
 const g=await grid();
 expect(g.cell().props.onBeginGesture()).toBe(true);g.pan();
 expect(g.cell().props.onCapture({drawings:'SYNTHETIC malformed drawings'} as any)).toBe(false);
 expect(g.cell().props.brokenMessage,'the capture error quarantined the cell mid-gesture').toBeDefined();
 g.cell().props.onFinishGesture();await wait(230);
 expect(g.changes).toHaveLength(0);expect(g.cell().props.brokenMessage).toBeDefined();
});
