import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

// (fail-first): the grid forwards a chart's held drawing change to App. A native gesture during the routine
// background autosave hold is held back by the chart (src/chart/held-drawing-publication.ts); App can only queue its
// publication if the grid tells it which chart held it. Actual MultiChartGrid and private GridCell closures (obtained from
// the grid's element tree) with controlled native ports and hooks. No DOM, pixels, native event or IPC.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;},useCallback:(fn:any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v:any,j:number)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn};return hooks.cells[i].value;},useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}},useLayoutEffect:()=>{}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());
function nativeChart(state:ReturnType<typeof createMultiChartState>,id:string,accepted:{bars:unknown;source:{datasetId:string}}){
 const held=new Set<()=>void>();
 const chart={getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},getChartOptions:()=>state.cells[id].chartOptions,applyChartOptions:()=>{},saveDrawings:()=>state.cells[id].drawings,loadDrawings:()=>{},indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{},getViewport:()=>null,onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},isInputCurrent:(input:any)=>input.bars===accepted.bars&&input.source.datasetId===accepted.source.datasetId,
  onHeldDrawingChange:(fn:()=>void)=>{held.add(fn);return()=>{held.delete(fn);};},publishHeldDrawings:()=>false};
 return{chart,signal:()=>{for(const fn of [...held])fn();},listeners:()=>held.size};
}

it('a chart cell tells the grid when its chart held back a drawing publication, and the grid tells App which chart',()=>{
 const gme=fixtureDataset('GME',3),state=createMultiChartState(gme,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 const forwarded:unknown[]=[];
 const gridProps={state,datasets:[gme],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{},onHeldDrawingChange:(chart:unknown)=>{forwarded.push(chart);}} as any;
 const renderGrid=()=>{hooks.cursor=0;return MultiChartGrid(gridProps);};
 let grid=renderGrid();for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}grid=renderGrid();
 const cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');expect(cell).not.toBeNull();
 expect(typeof cell.props.onHeldDrawingChange,'the grid hands each cell a held-change route').toBe('function');
 const accepted={bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'};
 const native=nativeChart(state,id,accepted),other=nativeChart(state,id,accepted);
 // Not a chart the grid owns: ignored.
 cell.props.onHeldDrawingChange(other.chart);expect(forwarded).toEqual([]);
 cell.props.onReady(native.chart);
 cell.props.onHeldDrawingChange(native.chart);expect(forwarded,'the owned chart reaches App').toEqual([native.chart]);
 // The cell itself: the chart's held-change notice reaches the cell's route (GridCell effect on the chart).
 const routed:unknown[]=[];
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const props={...cell.props,onHeldDrawingChange:(chart:unknown)=>{routed.push(chart);},onCapture:()=>true,onReady:()=>{},onStatus:()=>{},port:{mount:()=>()=>{}}};
 const render=()=>{hooks.cursor=0;return cell.type(props);},flush=()=>{for(const effect of hooks.effects.splice(0))try{effect();}catch{/* absent DOM ports */}};
 let tree=render();flush();find(tree,node=>node.type===ChartPanel).props.onReady(native.chart,accepted,'ordinary');tree=render();flush();render();flush();
 expect(native.listeners(),'the cell listens to its chart').toBe(1);
 native.signal();expect(routed).toEqual([native.chart]);
});
