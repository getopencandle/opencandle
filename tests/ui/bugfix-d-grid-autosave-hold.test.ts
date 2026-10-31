import {afterEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {MultiChartGrid,createMultiChartState,NOTICE_DELAY_MS,type GridTreeInput,type MultiChartGridProps,type MultiChartTransactionCoordinator} from '../../src/ui/MultiChartGrid';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
// F9 follow-up: the chart grid made itself inert, aria-busy and visibility:hidden ("Updating linked chart
// sources") for every chart-tree hold, and every save takes one, so each routine autosave flickered the charts and
// dropped pointer/keyboard input. Actual MultiChartGrid coordinator, tree hold, frame gesture and guards under controlled
// React hooks; native charts and script runtimes are controlled ports. No DOM, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>value===b[index]);return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value];},useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps)){hooks.cells[i]={deps,off:prior?.off};hooks.effects.push(()=>{prior?.off?.();hooks.cells[i].off=effect();});}}};});
function all(node:any,predicate:(node:any)=>boolean,result:any[]=[]){if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
async function settle(){for(const effect of hooks.effects.splice(0))effect();await new Promise(resolve=>setTimeout(resolve,15));}
afterEach(()=>{vi.useRealTimers();for(const item of hooks.cells)if(item?.off)try{item.off();}catch{/* retired */}hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

async function grid(){
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const dataset=fixtureDataset('GME',5),source=sourceContextForDataset(dataset,dataset.bars),changes:any[]=[];let coordinator:MultiChartTransactionCoordinator|null=null;
 const state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const props:MultiChartGridProps={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},onChange(next,_prepared,baseline){changes.push({next,baseline});props.state=next;return true;},onTransactionReady:value=>{coordinator=value;}};
 const render=()=>{hooks.cursor=0;return MultiChartGrid(props);};let tree=render();await settle();
 const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null} as unknown as HistoricalChartFrame;
 let viewport={from:1,to:5};
 const hold={isCurrent:()=>true,resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()};
 const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,captureHistoricalFrame:()=>structuredClone(frame),getViewport:()=>({...viewport}),suspendTree:vi.fn(()=>hold),bindDrawingWorkspaceHost:()=>()=>{}};
 const runtime={prepareBindings:()=>({changed:false,pauseAndCapture(){},stage(){},resume(){},rollback(){},abandon(){}}),configurationStatus:()=>({state:'ready',calculations:'ready',diagnostics:[]})};
 const cell=()=>all(render(),node=>typeof node.type==='function'&&node.type.name==='GridCell')[0];
 cell().props.onReady(chart);cell().props.onRuntime(runtime);cell().props.onStatus({input:{bars:dataset.bars,source,style:'candles'},settled:true,error:''});
 tree=render();await settle();tree=render();await settle();
 const input=():GridTreeInput=>({state:props.state,datasets:props.datasets,activeBars:props.activeBars!,activeDatasetId:props.activeDatasetId!,activeExecutionIdentity:'ordinary'});
 const view=()=>{const now=render(),section=all(now,node=>node.type==='section')[0],surface=section.props.children.find((child:any)=>child?.props?.style?.display==='grid');return{section,surface,text:text(now)};};
 return{coordinator:()=>coordinator!,cell,input,view,changes,chart,setViewport(next:{from:number;to:number}){viewport=next;},render};
}

it('F9 grid: a background (autosave) hold keeps the grid visible, not inert and not busy; its guards still hold',async()=>{
 const g=await grid();expect(g.coordinator()).toBeTruthy();
 const lease=g.coordinator().suspend(g.input(),{background:true});
 try{
  expect(g.chart.suspendTree).toHaveBeenCalledOnce();// the save still holds the chart tree
  const {section,surface,text:shown}=g.view();
  expect(section.props.inert).toBeFalsy();expect(section.props['aria-busy']).toBeFalsy();
  expect(surface.props.style.visibility).toBe('visible');expect(shown).not.toContain('Updating charts');
  // Save lock and frame ownership guards are unchanged: no new gesture or frame capture starts inside the hold.
  expect(g.cell().props.onBeginGesture()).toBe(false);
  expect(g.cell().props.onCapture({viewport:{from:2,to:4}})).toBe(false);
 }finally{lease.resume();}
 expect(g.view().section.props.inert).toBeFalsy();
});

it('F9 grid: a blocking hold (explicit Save, layout operations) still makes the grid inert and hides prices',async()=>{
 const g=await grid(),lease=g.coordinator().suspend(g.input());
 try{const first=g.view();expect(first.section.props.inert).toBe(true);expect(first.section.props['aria-busy']).toBe(true);expect(first.surface.props.style.visibility).toBe('hidden');
  // The transient notice text appears only after the pending state lasts NOTICE_DELAY_MS; the hold itself is immediate.
  expect(first.text).not.toContain('Updating charts');
  vi.useFakeTimers();for(const effect of hooks.effects.splice(0))effect();vi.advanceTimersByTime(NOTICE_DELAY_MS);
  expect(g.view().text).toContain('Updating charts');}
 finally{lease.resume();}
 const after=g.view();expect(after.section.props.inert).toBeFalsy();expect(after.surface.props.style.visibility).toBe('visible');
});

it('F9 grid: the coordinator reports an in-progress chart gesture until it is published, so the autosave can wait for it',async()=>{
 const g=await grid();expect(typeof g.coordinator().gestureActive).toBe('function');
 expect(g.coordinator().gestureActive!()).toBe(false);
 expect(g.cell().props.onBeginGesture()).toBe(true);expect(g.coordinator().gestureActive!()).toBe(true);
 g.setViewport({from:2,to:6});g.cell().props.onFinishGesture();expect(g.coordinator().gestureActive!()).toBe(true);// 200 ms coalescing window
 await new Promise(resolve=>setTimeout(resolve,230));
 const published=g.changes.find(row=>row.baseline);expect(published).toBeDefined();expect(published.next.cells[g.input().state.layout.activeCellId].viewport).toEqual({from:2,to:6});
 expect(g.coordinator().gestureActive!()).toBe(false);
 const lease=g.coordinator().suspend(g.input(),{background:true});lease.resume();expect(g.view().section.props.inert).toBeFalsy();
});
