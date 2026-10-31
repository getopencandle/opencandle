import {beforeEach,expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';

// Actual rendered select/source-change closure and actual coordinator. React
// scheduling and native leases are controlled; no executable UI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
 useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
 useMemo:(factory:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;},
 useEffect:()=>{hooks.cursor++;},
};});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const hit=find(child,test);if(hit)return hit;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});

it('a retained linked acceptance callback throws before touching a newer rendered Grid owner',async()=>{
 const gme=fixtureDataset('GME',5),spy=fixtureDataset('SPY',5),datasets=[gme,spy];
 const before=createMultiChartState(gme,{appearance:defaultTheme.appearance}),calls:string[]=[];let retained:undefined|(()=>void);
 const props={state:before,datasets,activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},
  onChange(_next:unknown,_prepared:unknown,_baseline:unknown,mark?:()=>void){retained=mark;return true;}};
 const render=(state=before)=>{hooks.cursor=0;return MultiChartGrid({...props,state});};
 const tree=render(),cell=find(tree,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 cell.props.onReady({prepareAnalysisSnapshot:async()=>({changed:true,isCurrent:()=>true,commit(){calls.push('commit');},seal(){calls.push('seal');},async rollback(){calls.push('rollback');}}),saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>''});
 cell.props.onRuntime({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})});
 find(tree,node=>node.type==='select'&&node.props['aria-label']==='Source for GME chart').props.onChange({target:{value:spy.provenance.datasetId}});
 for(let i=0;i<30;i++)await Promise.resolve();
 expect(retained).toBeTypeOf('function');expect(calls).toEqual(['commit','rollback']);
 const replacement=structuredClone(before);replacement.cells[replacement.layout.activeCellId].appearance.background='#123456';render(replacement);
 const latest=hooks.cells.find(row=>row?.current?.datasets===datasets&&row.current.state===replacement);
 expect(latest).toBeDefined();expect(()=>retained!()).toThrow(/retired/);
 expect(latest.current.state).toBe(replacement);expect(calls).toEqual(['commit','rollback']);
});
