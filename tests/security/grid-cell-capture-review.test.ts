import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;},useEffect:(fn:()=>unknown,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){hooks.cells[i]=deps;hooks.effects.push(fn);}}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});afterEach(()=>vi.unstubAllGlobals());
// Actual private GridCell component/effect closures obtained from MultiChartGrid,
// controlled native ports and hooks only. No DOM, pixels, native event or IPC.
it('new SPY render rejects the queued old GME drawing event before native source acceptance and effect cleanup',()=>{
 const gme=fixtureDataset('GME',3),spy=fixtureDataset('SPY',3),datasets=[gme,spy],state=createMultiChartState(gme,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 const grid=MultiChartGrid({state,datasets,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(grid,node=>typeof node.type==='function'&&node.type.name==='GridCell');expect(cell).not.toBeNull();
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];let drawListener=()=>{},nativeAccepted={bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'};
 const save=vi.fn(()=>state.cells[id].drawings),publish=vi.fn(()=>true),chart={getExecutionIdentity:()=> 'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},getChartOptions:()=>state.cells[id].chartOptions,applyChartOptions:()=>{},saveDrawings:save,loadDrawings:()=>{},indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:(fn:()=>void)=>{drawListener=fn;return()=>{};},getViewport:()=>null,onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},isInputCurrent:(input:any)=>input.bars===nativeAccepted.bars&&input.source.datasetId===nativeAccepted.source.datasetId};
 let props={...cell.props,onCapture:publish,onReady:()=>{},onStatus:()=>{},port:{mount:()=>()=>{}}};const render=()=>{hooks.cursor=0;return cell.type(props);},flush=()=>{const effects=hooks.effects.splice(0);for(const effect of effects)effect();};
 let tree=render();flush();find(tree,node=>node.type===ChartPanel).props.onReady(chart,nativeAccepted,'ordinary');tree=render();flush();render();flush();save.mockClear();drawListener();expect(save).toHaveBeenCalledOnce();expect(publish).toHaveBeenCalledOnce();
 const originalListener=drawListener;save.mockClear();publish.mockClear();props={...props,dataset:spy,bars:spy.bars,saved:{...transitionDrawingScope(state.cells[id],gme,spy),datasetId:spy.provenance.datasetId}};
 render(); // Deliberately retain the old effect listener until React cleanup.
 originalListener();expect(save).not.toHaveBeenCalled();expect(publish).not.toHaveBeenCalled();expect(nativeAccepted.source.datasetId).toBe(gme.provenance.datasetId);
});
