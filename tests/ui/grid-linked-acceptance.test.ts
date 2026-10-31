import {beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';

// Actual rendered handler and coordinator, controlled hooks/chart leases.
// This is not an executable UI or native-source acceptance test.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useMemo:(fn:()=>any,deps:any[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))hooks.cells[i]={deps,value:fn()};return hooks.cells[i].value;},useEffect:()=>{hooks.cursor++;}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});

it.each(['throw-after-mark','false-after-mark','true-without-mark'] as const)('linked source %s retains exact acceptance semantics',async mode=>{
 const gme=fixtureDataset('GME',5),spy=fixtureDataset('SPY',5),datasets=[gme,spy],before=createMultiChartState(gme,{appearance:defaultTheme.appearance}),calls:string[]=[];
 let saved=before,received:any,acknowledged=false;
 const tree=MultiChartGrid({state:before,datasets,activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},
  onChange(next,prepared,baseline,mark){received={next,prepared,baseline,marker:typeof mark};if(mode==='true-without-mark')return true;saved=next;mark!();acknowledged=true;if(mode==='throw-after-mark')throw Error('Synthetic postmark parent failure');return false;},
 });
 const cell=find(tree,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 cell.props.onReady({prepareAnalysisSnapshot:async()=>({changed:true,isCurrent:()=>true,commit(){calls.push('commit');},seal(){calls.push('seal');},async rollback(){calls.push('rollback');}}),saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>''});
 cell.props.onRuntime({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})});
 find(tree,node=>node.type==='select'&&node.props['aria-label']==='Source for GME chart').props.onChange({target:{value:spy.provenance.datasetId}});
 for(let i=0;i<30;i++)await Promise.resolve();
 expect(received.marker).toBe('function');expect(received.baseline).toBeUndefined();expect(received.prepared.nextActiveBars).toBe(spy.bars);expect(received.prepared.nextDatasets).toBe(datasets);
 if(mode==='true-without-mark'){
  expect(acknowledged).toBe(false);expect(saved).toBe(before);expect(calls).toEqual(['commit','rollback']);expect(hooks.cells.some(value=>typeof value==='string'&&value.includes('acknowledge'))).toBe(true);
 }else{
  expect(acknowledged).toBe(true);expect(saved).toBe(received.next);expect(calls).toEqual(['commit','seal']);
  const current=hooks.cells.map(row=>row?.current).find(row=>row?.datasets===datasets&&row?.state);expect(current.state).toBe(saved);
 }
});
