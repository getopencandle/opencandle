import {expect,it,vi} from 'vitest';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Original parent callbacks, memo dependencies and frame-gesture implementation.
// Hook scheduling/native frame reads are controlled; no browser timing claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const changed=(before:any[],after:any[])=>before.length!==after.length||after.some((value,index)=>!Object.is(value,before[index]));return{...actual,
 useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(next:any)=>{hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},
 useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
 useMemo:(factory:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||changed(old.deps,deps))hooks.cells[index]={deps,value:factory()};return hooks.cells[index].value;},
 useEffect:(effect:()=>unknown,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||changed(old.deps,deps))hooks.effects.push(effect);hooks.cells[index]={deps};},
};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}

it('actual parent frame handler refuses a new props run before the native same-prefix execution owner catches up',async()=>{
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const dataset=fixtureDataset('GME',5),datasets=[dataset],state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const source=sourceContextForDataset(dataset,dataset.bars);let nativeRun='ordinary',captures=0;
 const chart={getExecutionIdentity:()=>nativeRun,getViewport:()=>({from:1,to:5}),captureHistoricalFrame(){captures++;return{schemaVersion:1,basis:{basisIdentity:source.basisIdentity,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};}};
 const props={state,datasets,activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,onChange:()=>true,onReady(){},onActiveCell(){}};
 const render=(activeExecutionIdentity:string)=>{hooks.cursor=0;return MultiChartGrid({...props,activeExecutionIdentity});};
 const initial=render('ordinary'),cell=find(initial,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 cell.props.onReady(chart);cell.props.onStatus({input:{bars:dataset.bars,source,style:'candles'},settled:true,error:''});
 const fingerprintEffect=hooks.effects[0];expect(fingerprintEffect).toBeTypeOf('function');fingerprintEffect();
 for(let index=0;index<64;index++)await Promise.resolve();
 expect(cell.props.onBeginGesture()).toBe(true);expect(captures).toBe(1);cell.props.onNonGesture();expect(captures).toBe(2);captures=0;
 const next=find(render('replay:new'),node=>typeof node.type==='function'&&node.type.name==='GridCell');
 expect(next.props.executionIdentity).toBe('replay:new');expect(chart.getExecutionIdentity()).toBe('ordinary');
 expect(next.props.onBeginGesture()).toBe(false);expect(captures).toBe(0);
 nativeRun='replay:new';
});

it('actual child withholds scripts until the explicit accepted run matches, without inventing it from native getters',()=>{
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const dataset=fixtureDataset('GME',5),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const parent=MultiChartGrid({state,datasets:[dataset],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}),cell=find(parent,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 let nativeRun='ordinary';const chart={getExecutionIdentity:()=>nativeRun,isInputCurrent:()=>true};
 const input={bars:dataset.bars,source:sourceContextForDataset(dataset,dataset.bars),style:'candles'};
 let props={...cell.props,executionIdentity:'ordinary'};
 const render=()=>{hooks.cursor=0;return cell.type(props);};
 const runner=(tree:any)=>find(tree,node=>typeof node.type==='function'&&node.type.name==='ScriptBindingsRunner');
 const panel=(tree:any)=>find(tree,node=>typeof node.type==='function'&&node.type.name==='ChartPanel');
 panel(render()).props.onReady(chart,input,'ordinary');expect(runner(render()).props.ready).toBe(true);
 props={...props,executionIdentity:'replay:new'};nativeRun='replay:new';
 expect(runner(render()).props.ready).toBe(false);
 panel(render()).props.onReady(chart,input);expect(runner(render()).props.ready).toBe(false);
 panel(render()).props.onReady(chart,input,'ordinary');expect(runner(render()).props.ready).toBe(false);
 panel(render()).props.onReady(chart,input,'replay:new');expect(runner(render()).props.ready).toBe(true);
 nativeRun='replay:other';expect(runner(render()).props.ready).toBe(false);
});
