import {afterEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState,type MultiChartGridProps,type MultiChartState} from '../../src/ui/MultiChartGrid';
// A grid publication built on a grid the host has already replaced (another change landed
// before the re-render) is stale, not a refusal: no "Workspace rejected this chart change" banner, no quarantine, and the
// change is rebased onto the next rendered grid. A real refusal still reports. Controlled React hooks (same harness as
// bugfix-e-grid-hold-owners); SYNTHETIC fixture data; not executable UI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>value===b[index]);return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value];},useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps)){hooks.cells[i]={deps,off:prior?.off};hooks.effects.push(()=>{prior?.off?.();hooks.cells[i].off=effect();});}}};});
function all(node:any,predicate:(node:any)=>boolean,result:any[]=[]){if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;}
function text(node:any):string{if(node==null||typeof node==='boolean')return'';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(){for(let round=0;round<4&&hooks.effects.length;round++)for(const effect of hooks.effects.splice(0))effect();await wait(5);}
afterEach(()=>{for(const item of hooks.cells)if(item?.off)try{item.off();}catch{/* retired */}hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

async function grid(){
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const gme=fixtureDataset('GME',5),changes:MultiChartState[]=[];let mode:'accept'|'stale'|'reject'='accept';
 const state=resizeMultiChartState(createMultiChartState(gme,{appearance:defaultTheme.appearance}),'two-columns');
 const props:MultiChartGridProps={state,datasets:[gme],activeBars:gme.bars,activeDatasetId:gme.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},
  onDrawingPreferencesChange:vi.fn(()=>true),
  onChange(next,_prepared,_baseline,markCommitted,stale){changes.push(next);if(mode==='stale'){stale?.();return false;}if(mode==='reject')return false;markCommitted?.();props.state=next;return true;}};
 const render=()=>{hooks.cursor=0;return MultiChartGrid(props);};render();await settle();
 const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,getViewport:()=>({from:1,to:5}),bindDrawingWorkspaceHost:()=>()=>{},getAnalysisUnavailable:()=>'',saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]}};
 const runtime={prepareBindings:()=>({changed:false,pauseAndCapture(){},stage(){},resume(){},rollback(){},abandon(){}}),configurationStatus:()=>({state:'ready',calculations:'ready',diagnostics:[]})};
 for(const cell of all(render(),node=>typeof node.type==='function'&&node.type.name==='GridCell')){cell.props.onReady(chart);cell.props.onRuntime(runtime);cell.props.onStatus({input:{bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:'candles'},settled:true,error:''});}
 render();await settle();render();await settle();
 const toggle=(name:string,checked:boolean)=>{const label=all(render(),node=>node.type==='label'&&text(node)===name)[0];const box=all(label.props.children,node=>node.type==='input')[0];box.props.onChange({target:{checked}});};
 return{props,changes,render,settle,toggle,setMode:(value:typeof mode)=>{mode=value;},banner:()=>text(render())};
}

it('a stale publication shows no rejection banner and is rebased onto the next rendered grid',async()=>{
 const g=await grid();g.setMode('stale');g.toggle('Crosshair',true);
 expect(g.changes).toHaveLength(1);expect(g.changes[0].layout.sync.crosshair).toBe(true);
 expect(g.banner()).not.toMatch(/Workspace rejected|Reopen the chart/);
 // The host's other change re-renders the grid with a newer state that does not yet have the toggle.
 g.setMode('accept');const newer={...g.props.state,cells:{...g.props.state.cells}};g.props.state=newer;g.render();await g.settle();
 expect(g.changes).toHaveLength(2);expect(g.changes[1].layout.sync.crosshair).toBe(true);expect(g.props.state.layout.sync.crosshair).toBe(true);
 expect(g.banner()).not.toMatch(/Workspace rejected|Reopen the chart/);
 // Nothing is retried again once the change is in the rendered grid.
 g.render();await g.settle();expect(g.changes).toHaveLength(2);
});

it('a stale publication whose change already reached the host publishes nothing more',async()=>{
 const g=await grid();g.setMode('stale');g.toggle('Crosshair',true);expect(g.changes).toHaveLength(1);
 g.setMode('accept');g.props.state={...g.props.state,layout:{...g.props.state.layout,sync:{...g.props.state.layout.sync,crosshair:true}}};g.render();await g.settle();
 expect(g.changes).toHaveLength(1);expect(g.banner()).not.toMatch(/Workspace rejected/);
});

it('a real refusal still reports the rejection',async()=>{
 const g=await grid();g.setMode('reject');g.toggle('Crosshair',true);
 g.render();await g.settle();expect(g.banner()).toMatch(/Workspace rejected this chart change/);
});
