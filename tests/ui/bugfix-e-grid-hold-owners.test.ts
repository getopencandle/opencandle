import {afterEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {MultiChartGrid,createMultiChartState,type GridTreeInput,type MultiChartGridProps,type MultiChartTransactionCoordinator} from '../../src/ui/MultiChartGrid';
// Probes src-A / src-B: the background (autosave) chart-tree
// hold leaves the grid interactive, so a cell Source change could start inside it. The hold and the grid analysis
// transaction shared ONE analysisActive flag, so whichever finished first lifted the other's guard, and a hold that
// ended during a Source change left sourcePending stuck at 1 (layout publications, drawing commands, resizes and later
// Source changes refused until remount). Actual MultiChartGrid coordinator, tree hold, analysis coordinator and guards
// under controlled React hooks; native charts and script runtimes are controlled ports. No DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>value===b[index]);return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value];},useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps)){hooks.cells[i]={deps,off:prior?.off};hooks.effects.push(()=>{prior?.off?.();hooks.cells[i].off=effect();});}}};});
function all(node:any,predicate:(node:any)=>boolean,result:any[]=[]){if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(){for(const effect of hooks.effects.splice(0))effect();await wait(15);}
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{resolve,reject,promise};};
afterEach(()=>{for(const item of hooks.cells)if(item?.off)try{item.off();}catch{/* retired */}hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

async function grid(){
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const gme=fixtureDataset('GME',5),amc=fixtureDataset('AMC',5),changes:any[]=[];let coordinator:MultiChartTransactionCoordinator|null=null;
 const state=createMultiChartState(gme,{appearance:defaultTheme.appearance}),cellId=state.layout.activeCellId;
 const props:MultiChartGridProps={state,datasets:[gme,amc],activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},
  onDrawingPreferencesChange:vi.fn(()=>true),
  onChange(next,prepared,baseline,markCommitted){changes.push({next,prepared,baseline});markCommitted?.();props.state=next;if(prepared){props.activeBars=prepared.nextActiveBars;props.activeDatasetId=prepared.activeDatasetId;}return true;},
  onTransactionReady:value=>{coordinator=value;}};
 const render=()=>{hooks.cursor=0;return MultiChartGrid(props);};render();await settle();
 const hold={isCurrent:()=>true,resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()};
 const gates:Array<ReturnType<typeof deferred<any>>>=[];
 const lease=()=>({changed:true,isCurrent:()=>true,commit(){},seal(){},rollback:async()=>{}});
 const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,captureHistoricalFrame:()=>({schemaVersion:1,basis:{},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null}),getViewport:()=>({from:1,to:5}),suspendTree:vi.fn(()=>hold),bindDrawingWorkspaceHost:()=>()=>{},
  getAnalysisUnavailable:()=>'',saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},
  // The native analysis checkpoint resolves when the test says so (the fingerprint / native-prepare await window).
  prepareAnalysisSnapshot:vi.fn(()=>{const gate=deferred<any>();gates.push(gate);return gate.promise;})};
 const runtime={prepareBindings:()=>({changed:false,pauseAndCapture(){},stage(){},resume(){},rollback(){},abandon(){}}),configurationStatus:()=>({state:'ready',calculations:'ready',diagnostics:[]})};
 const cell=()=>all(render(),node=>typeof node.type==='function'&&node.type.name==='GridCell')[0];
 const status=(dataset:typeof gme)=>cell().props.onStatus({input:{bars:dataset.bars,source:sourceContextForDataset(dataset,dataset.bars),style:'candles'},settled:true,error:''});
 cell().props.onReady(chart);cell().props.onRuntime(runtime);status(gme);
 render();await settle();render();await settle();
 const input=():GridTreeInput=>({state:props.state,datasets:props.datasets,activeBars:props.activeBars!,activeDatasetId:props.activeDatasetId!,activeExecutionIdentity:'ordinary'});
 const section=()=>all(render(),node=>node.type==='section')[0];
 /** The cell's Source select, as the user changes it. */
 const source=(dataset:typeof gme)=>all(render(),node=>node.type==='select'&&String(node.props['aria-label']).startsWith('Source for '))[0].props.onChange({target:{value:dataset.provenance.datasetId}});
 /** A guarded edit with no side effect: refused while any grid hold or transaction guard is up. */
 const editable=()=>cell().props.onDrawingPreferencesChange({magnet:'off',stay:false})===true;
 /** A layout publication (sync toggle): refused while sourcePending is non-zero. */
 const sync=(name:string,value:boolean)=>{const label=all(render(),node=>node.type==='label'&&node.props.children?.[1]===(({crosshair:'Crosshair',time:'Time',symbol:'Symbol',interval:'Interval',dateRange:'Date range',drawings:'Drawings'} as Record<string,string>)[name]??name))[0];/* Sync labels are capitalized words since r17 (SYNC_LABELS). */label.props.children[0].props.onChange({target:{checked:value}});};
 /** React commits the accepted state: render, then run its effects (the new layout port subscribes). */
 const refresh=async()=>{render();await settle();render();await settle();};
 return{refresh,coordinator:()=>coordinator!,props,cell,input,section,source,editable,sync,changes,chart,gates,lease,status,gme,amc,cellId,render,settle};
}
type Grid=Awaited<ReturnType<typeof grid>>;
const datasetOf=(g:Grid,row:any)=>row.next.cells[g.cellId].datasetId;

it('BD-R1 (save finishes first): a Source change requested inside a background hold waits for the save, then runs; the hold guard never drops',async()=>{
 const g=await grid(),lease=g.coordinator().suspend(g.input(),{background:true});
 expect(g.editable()).toBe(false);
 g.source(g.amc);await wait(60);
 // Probe src-A: the transaction used to start inside the hold (and its end lifted the hold's guard).
 expect(g.chart.prepareAnalysisSnapshot).not.toHaveBeenCalled();
 expect(g.editable()).toBe(false);expect(g.cell().props.onBeginGesture()).toBe(false);
 expect(g.section().props.inert).toBeFalsy();// the background hold still never makes the grid inert
 lease.resume();await wait(60);// the save finishes first; the waiting Source change now runs
 expect(g.chart.prepareAnalysisSnapshot).toHaveBeenCalledOnce();
 expect(g.coordinator().transactionActive!()).toBe(true);expect(g.editable()).toBe(false);
 g.gates[0].resolve(g.lease());await wait(30);await g.refresh();
 expect(datasetOf(g,g.changes.at(-1))).toBe(g.amc.provenance.datasetId);
 expect(g.coordinator().transactionActive!()).toBe(false);expect(g.editable()).toBe(true);expect(g.section().props.inert).toBeFalsy();
 // Nothing is stuck: a layout publication is accepted and a later hold works.
 const before=g.changes.length;g.sync('crosshair',true);expect(g.changes.length).toBe(before+1);expect(g.changes.at(-1).next.layout.sync.crosshair).toBe(true);
 g.status(g.amc);const later=g.coordinator().suspend(g.input(),{background:true});expect(g.editable()).toBe(false);later.resume();expect(g.editable()).toBe(true);
});

it('BD-R1 (Source change finishes first): a hold requested while a Source change is finishing is refused; nothing sticks after it commits',async()=>{
 const g=await grid();g.source(g.amc);await wait(10);
 expect(g.chart.prepareAnalysisSnapshot).toHaveBeenCalledOnce();
 // Probe src-B: this hold used to be granted, and its release cleared the transaction's guard and stranded sourcePending.
 expect(()=>g.coordinator().suspend(g.input(),{background:true})).toThrow(/source change is finishing/);
 expect(()=>g.coordinator().suspend(g.input())).toThrow(/source change is finishing/);
 expect(g.chart.suspendTree).not.toHaveBeenCalled();expect(g.editable()).toBe(false);
 expect(g.coordinator().transactionActive!(),'App defers its autosave on this').toBe(true);
 g.gates[0].resolve(g.lease());await wait(30);await g.refresh();
 expect(datasetOf(g,g.changes.at(-1))).toBe(g.amc.provenance.datasetId);
 expect(g.coordinator().transactionActive!()).toBe(false);expect(g.editable()).toBe(true);
 const before=g.changes.length;g.sync('crosshair',true);expect(g.changes.length).toBe(before+1);
 // A later Source change reaches the chart (the reviewer saw 'Another chart transaction is already updating').
 g.source(g.gme);await wait(10);expect(g.chart.prepareAnalysisSnapshot).toHaveBeenCalledTimes(2);
 g.gates[1].resolve(g.lease());await wait(30);await g.refresh();expect(datasetOf(g,g.changes.at(-1))).toBe(g.gme.provenance.datasetId);
 g.status(g.gme);const hold=g.coordinator().suspend(g.input(),{background:true});expect(g.chart.suspendTree).toHaveBeenCalledOnce();expect(g.editable()).toBe(false);hold.resume();expect(g.editable()).toBe(true);
});

it('BD-R1: an analysis transaction attempted inside a hold is refused without lifting the hold guard or leaving a pending counter',async()=>{
 for(const background of [true,false]){
  const g=await grid(),lease=g.coordinator().suspend(g.input(),background?{background:true}:undefined),state=g.props.state;
  const attempt=g.coordinator().apply({expectedState:state,nextState:structuredClone(state),assertCurrent:()=>true,commitModel:mark=>mark()});
  // Before the fix the transaction started; a native refusal inside the hold then cleared the shared guard.
  if(g.gates[0])g.gates[0].reject(Error('Synthetic native refusal: the chart tree is suspended'));
  await expect(attempt).rejects.toThrow();
  expect(g.editable(),'the hold still guards edits').toBe(false);expect(g.cell().props.onBeginGesture()).toBe(false);
  expect(g.coordinator().transactionActive!()).toBe(false);
  lease.resume();expect(g.editable()).toBe(true);
  const before=g.changes.length;g.sync('time',true);expect(g.changes.length,'layout publication is not stuck').toBe(before+1);
  for(const item of hooks.cells)if(item?.off)try{item.off();}catch{/* retired */}
 }
});

it('BD-R2: only an OPEN frame gesture defers the autosave; a refused (blocked) begin has nothing to publish and cannot stall it',async()=>{
 const g=await grid();
 expect(g.cell().props.onBeginGesture()).toBe(true);expect(g.coordinator().gestureActive!()).toBe(true);
 g.cell().props.onFinishGesture();expect(g.coordinator().gestureActive!()).toBe(true);// still inside the 200 ms window
 await wait(230);expect(g.coordinator().gestureActive!()).toBe(false);
 // A begin refused by the frame gesture itself (inputs not settled) leaves a blocked marker that only a later release
 // clears. It used to read as an open gesture, so an uncapped autosave would wait on it indefinitely.
 g.cell().props.onStatus({input:null,settled:false,error:''});
 expect(g.cell().props.onBeginGesture()).toBe(false);
 expect(g.coordinator().gestureActive!()).toBe(false);
});
