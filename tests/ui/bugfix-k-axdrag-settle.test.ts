import {afterEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {MultiChartGrid,createMultiChartState,type MultiChartGridProps,type MultiChartTransactionCoordinator} from '../../src/ui/MultiChartGrid';
// Auto off, drag the price axis (a frame change), release, then place a Horizontal line at once. The placing pointerdown
// arrived inside the released drag's 200 ms coalescing window, so begin() reused the drag's still-unpublished opening; the
// drawing capture then ran frameGesture.invalidate(), which found that opening dirty (the axis drag's frame change) and
// quarantined the cell ("a dirty gesture was interrupted"). Every later save then refused with "Chart tree input or
// configuration is not settled". The fix publishes the released gesture before a new pointer gesture opens; the dirty
// check itself is unchanged (a gesture still held by its own pointer is still quarantined when interrupted).
// Actual MultiChartGrid coordinator and frame gesture under controlled React hooks; native charts are controlled ports.
// SYNTHETIC fixture bars. No DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>value===b[index]);return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value];},useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps)){hooks.cells[i]={deps,off:prior?.off};hooks.effects.push(()=>{prior?.off?.();hooks.cells[i].off=effect();});}}};});
function all(node:any,predicate:(node:any)=>boolean,result:any[]=[]){if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(){for(const effect of hooks.effects.splice(0))effect();await wait(15);}
afterEach(()=>{for(const item of hooks.cells)if(item?.off)try{item.off();}catch{/* retired */}hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

async function grid(){
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const gme=fixtureDataset('GME',5);let coordinator:MultiChartTransactionCoordinator|null=null;
 const state=createMultiChartState(gme,{appearance:defaultTheme.appearance});
 // Auto off on Regular before the drag (the menu command already saved a frozen window).
 const id=state.layout.activeCellId;state.cells[id]={...state.cells[id],chartOptions:{...state.cells[id].chartOptions,auto:false}};
 const changes:any[]=[];
 const props:MultiChartGridProps={state,datasets:[gme],activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},
  onChange(next,_prepared,baseline,markCommitted){changes.push({next,baseline});markCommitted?.();props.state=next;return true;},
  onTransactionReady:value=>{coordinator=value;},...{}};
 const render=()=>{hooks.cursor=0;return MultiChartGrid(props);};render();await settle();
 let manualRange={min:10,max:40};
 const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,captureHistoricalFrame:()=>({schemaVersion:1,basis:{},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:{...manualRange}}],independent:[],maximized:null}),getViewport:()=>({from:1,to:5}),bindDrawingWorkspaceHost:()=>()=>{},getAnalysisUnavailable:()=>'',saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]}};
 const gridCells=()=>all(render(),node=>typeof node.type==='function'&&node.type.name==='GridCell');
 for(const cell of gridCells()){cell.props.onReady(chart);cell.props.onStatus({input:{bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'},settled:true,error:''});}
 render();await settle();render();await settle();
 // An Auto-off cell without a saved frame is a carried-frame cell (MultiChartGrid recaptureCarriedFrame):
 // about 100 ms after its fingerprints settle the grid publishes the live frame once (no baseline). Under suite load that timer
 // fired before or inside each case and showed up as an extra change. Wait for that one publication so every case starts from
 // the settled saved window it describes, then start the change log empty.
 for(let i=0;i<200&&!props.state.cells[id].frame;i++)await wait(10);
 expect(props.state.cells[id].frame?.panes[0].manualRange,'the carried frame was recaptured').toEqual({min:10,max:40});
 expect(changes.map(change=>change.baseline?.kind)).toEqual([undefined]);changes.length=0;
 return{coordinator:()=>coordinator!,cell:()=>gridCells()[0],changes,id,dragAxis(){manualRange={min:-5,max:40};}};
}
const drawing={version:1,drawings:[{id:'synthetic-hline',type:'horizontalline',points:[{time:0,price:12}]}]};

it('AXDRAG-UNSETTLED: a pointer press inside a released axis drag\'s 200 ms window publishes the drag first; the drawing it places is saved and nothing is quarantined',async()=>{
 const g=await grid();
 // Axis drag: press, the frozen window widens, release (200 ms coalescing timer starts).
 expect(g.cell().props.onBeginGesture()).toBe(true);g.dragAxis();g.cell().props.onFinishGesture();
 // At once: the Horizontal line placing press opens a new pointer gesture and the native drawing is captured.
 expect(g.cell().props.onBeginGesture('pointer')).toBe(true);
 expect(g.cell().props.onCapture({drawings:drawing}),'the placed drawing is accepted').toBe(true);
 g.cell().props.onFinishGesture();await wait(230);
 expect(g.cell().props.brokenMessage,'no quarantine: the released drag is not an interrupted dirty gesture').toBeUndefined();
 expect(g.changes.map(change=>change.baseline?.kind??'capture'),'the axis drag frame, then the drawing').toEqual(['native-frame','capture']);
 const saved=g.changes.at(-1).next.cells[g.id];
 expect(saved.frame.panes[0].manualRange).toEqual({min:-5,max:40});
 expect(saved.drawings).toEqual(drawing);
 expect(g.coordinator().gestureActive!()).toBe(false);
});

it('AXDRAG-UNSETTLED guard kept: a drawing captured while the dirtying pointer is still held quarantines exactly as before',async()=>{
 const g=await grid();
 expect(g.cell().props.onBeginGesture('pointer')).toBe(true);g.dragAxis();
 expect(g.cell().props.onCapture({drawings:drawing})).toBe(false);
 expect(g.cell().props.brokenMessage).toContain('dirty gesture was interrupted');
 g.cell().props.onFinishGesture();await wait(230);
 expect(g.changes).toHaveLength(0);
});

it('AXDRAG-UNSETTLED: wheel and key turns (no pointer kind) still coalesce into one frame publication',async()=>{
 const g=await grid();
 for(let turn=0;turn<3;turn++){expect(g.cell().props.onBeginGesture()).toBe(true);g.dragAxis();g.cell().props.onFinishGesture();}
 await wait(230);
 expect(g.changes.map(change=>change.baseline?.kind)).toEqual(['native-frame']);
});
