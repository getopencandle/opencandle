// render-count probe (SYNTHETIC, no DOM). The real WorkspaceChartHost and MultiChartGrid run under counting
// hooks; a child is counted as re-rendered when its element is not the very element of the previous render (React skips a
// child whose element, and so whose props object, is unchanged and that has no own state or context update). This is
// React's bailout rule for these children: none of them reads a context.
// LV_RENDER_BASELINE=1 prints the counts without the lane's expectations (used to measure the pre-lane tree).
import {expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState,type MultiChartGridProps} from '../../src/ui/MultiChartGrid';
import {WorkspaceChartHost} from '../../src/ui/WorkspaceChartHost';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));const effect=(_fn:any,deps:any[])=>{const i=hooks.cursor++;hooks.cells[i]={deps};};return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},
 useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},
 useCallback:(fn:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:fn,deps};return hooks.cells[i].value;},
 useEffect:effect,useLayoutEffect:effect};});
const baseline=!!process.env.LV_RENDER_BASELINE;
function all(node:any,predicate:(node:any)=>boolean,result:any[]=[]){if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
const named=(name:string)=>(node:any)=>typeof node.type==='function'&&node.type.name===name;
/** Children React re-renders: elements that are not the previous render's element at the same position. */
const changed=(before:any[],after:any[])=>after.filter((element,index)=>element!==before[index]).length;

function gridFixture(){
 const gme=fixtureDataset('GME',400),spy=fixtureDataset('SPY',400),amc=fixtureDataset('AMC',400),datasets=[gme,spy,amc];
 let state=resizeMultiChartState(createMultiChartState(gme,{appearance:defaultTheme.appearance}),'three-columns');
 const ids=state.layout.cells.map(row=>row.id);state={...state,layout:{...state.layout,cells:state.layout.cells.map((row,index)=>({...row,symbol:datasets[index].instrument.symbol,interval:datasets[index].resolution}))},cells:Object.fromEntries(ids.map((id,index)=>[id,{...state.cells[id],datasetId:datasets[index].provenance.datasetId}]))};
 const appProps=(activeBars:typeof gme.bars):MultiChartGridProps=>({state,datasets,activeBars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',appearance:defaultTheme.appearance,
  // App passes fresh closures on every render (inline arrows), as the real App does.
  onReady:()=>{},onActiveCell:()=>{},onChange:()=>true,onOpenSettings:()=>{},zoomArmed:false,zoomTimeAt:()=>null,zoomBarInterval:()=>60,zoomRange:()=>{},zoomCancel:()=>{},newChartTimezone:()=>'UTC',onDrawingSyncChange:()=>{},drawingSyncOn:false});
 return{gme,appProps};
}

it('render counts per 1 Hz live App update, 3 charts (host, grid, cells)',()=>{
 const {gme,appProps}=gridFixture(),report:Record<string,number>={};
 // Host: one App render with nothing chart-related changed (another symbol's live update, a watchlist quote, the clock).
 hooks.cells=[];hooks.cursor=0;let props=appProps(gme.bars);const hostRender=(p:MultiChartGridProps)=>{hooks.cursor=0;return WorkspaceChartHost(p);};
 const first=all(hostRender(props),named('MultiChartGrid'));props=appProps(gme.bars);const second=all(hostRender(props),named('MultiChartGrid'));
 report.gridRendersOnUnrelatedAppUpdate=changed(first,second);
 // Host: the active chart's own live update (App hands it newer bars).
 const live=[...gme.bars.slice(0,-1),{...gme.bars.at(-1)!,close:gme.bars.at(-1)!.close+0.01}];props=appProps(live);const third=all(hostRender(props),named('MultiChartGrid'));
 report.gridRendersOnActiveLiveUpdate=changed(second,third);
 // Grid: the cells re-rendered by a grid render.
 hooks.cells=[];hooks.cursor=0;const gridRender=(p:MultiChartGridProps)=>{hooks.cursor=0;return MultiChartGrid(p);};
 const cellsA=all(gridRender(appProps(gme.bars)),named('GridCell')),cellsB=all(gridRender(appProps(gme.bars)),named('GridCell')),cellsC=all(gridRender(appProps(live)),named('GridCell'));
 report.cells=cellsA.length;report.cellRendersOnUnrelatedGridRender=changed(cellsA,cellsB);report.cellRendersOnActiveLiveUpdate=changed(cellsB,cellsC);
 // Per cell, a cell render also renders its ChartPanel, ChartWatermark and ScriptBindingsRunner.
 const subtree=(grid:number,cells:number)=>1+grid*(1+cells*4);
 report.componentRendersUnrelatedAppUpdate=subtree(report.gridRendersOnUnrelatedAppUpdate,report.cellRendersOnUnrelatedGridRender);
 report.componentRendersActiveLiveUpdate=subtree(report.gridRendersOnActiveLiveUpdate,report.cellRendersOnActiveLiveUpdate);
 console.log(JSON.stringify({lane:'R28-PERF2',baseline,...report}));
 expect(cellsA).toHaveLength(3);
 if(baseline)return;
 expect(report.gridRendersOnUnrelatedAppUpdate).toBe(0);expect(report.gridRendersOnActiveLiveUpdate).toBe(1);
 expect(report.cellRendersOnUnrelatedGridRender).toBe(0);expect(report.cellRendersOnActiveLiveUpdate).toBe(1);
 // A reused cell element (the same object as three renders ago) forwards to the newest closure the grid was given.
 const calls:string[]=[];const p=appProps(live);p.onOpenSettings=tab=>{calls.push('newest:'+tab);};hooks.cursor=0;const cells=all(MultiChartGrid(p),named('GridCell'));
 expect(cells[1]).toBe(cellsA[1]);cells[1].props.onOpenSettings('scales');expect(calls).toEqual(['newest:scales']);
});
