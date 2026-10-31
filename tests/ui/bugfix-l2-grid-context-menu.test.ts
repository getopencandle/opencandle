import {expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import * as grid from '../../src/ui/MultiChartGrid';
import {createMultiChartState,resizeMultiChartState,type MultiChartGridProps,type GridTreeInput} from '../../src/ui/MultiChartGrid';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>value===b[index]);return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value];},useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useMemo:(make:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps))hooks.cells[i]={value:make(),deps};return hooks.cells[i].value;},useEffect:(effect:any,deps:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!same(prior.deps,deps)){hooks.cells[i]={deps,off:prior?.off};hooks.effects.push(()=>{prior?.off?.();hooks.cells[i].off=effect();});}}};});
// BLR-2/BLR-3 grid side, against src/ui/MultiChartGrid.tsx with the L2 grid diff applied. It always runs.
const all=(node:any,predicate:(node:any)=>boolean,result:any[]=[])=>{if(Array.isArray(node))node.forEach(child=>all(child,predicate,result));else if(node?.props){if(predicate(node))result.push(node);all(node.props.children,predicate,result);}return result;};
async function settle(){for(const effect of hooks.effects.splice(0))effect();await new Promise(resolve=>setTimeout(resolve,15));}
async function mount(){
 hooks.cells=[];hooks.cursor=0;hooks.effects=[];
 const dataset=fixtureDataset('GME',5),source=sourceContextForDataset(dataset,dataset.bars),state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns');
 let coordinator:any=null;
 const props:MultiChartGridProps={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary',onReady(){},onActiveCell(){},onChange:()=>true,onTransactionReady:value=>{coordinator=value;},onCaptureDrawingWorkspace:()=>({assertCurrent(){},prepare(){throw Error('Not exercised');}})};
 const tree=grid.MultiChartGrid(props);await settle();
 const cells=all(tree,node=>typeof node.type==='function'&&node.type.name==='GridCell');
 const charts:any[]=[];
 for(const cell of cells){
  const chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true,saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},suspendTree:()=>{let active=true;return{isCurrent:()=>active,resume:()=>{active=false;},retire:()=>{active=false;},dispose(){}};}};
  charts.push(chart);cell.props.onReady(chart);
  cell.props.onRuntime({prepareBindings:()=>({pauseAndCapture(){},stage(){},resume(){},abandon(){},rollback(){},changed:true}),configurationStatus:()=>({state:'ready',calculations:'ok',diagnostics:[]})});
  cell.props.onStatus({input:{bars:dataset.bars,source,style:'candles'},settled:true,error:''});
 }
 const input:GridTreeInput={state,datasets:props.datasets,activeBars:props.activeBars!,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary'};
 const owners=cells.map(cell=>cell.props.contextOwner);
 const drain=async()=>{await Promise.resolve();await Promise.resolve();};
 return{props,charts,coordinator:()=>coordinator,owners,hold:(background:boolean)=>coordinator.suspend(input,{background}),drain,unmount(){for(const item of hooks.cells)if(item?.off)item.off();}};
}
it('BLR-2: two cells right-clicked during one background hold yield exactly one menu (latest wins)',async()=>{
 const g=await mount(),opened:string[]=[],superseded:string[]=[];
 const lease=g.hold(true);
 expect(g.owners[0].beforeOpen(),'the real beforeOpen refuses inside the hold').toBe(false);
 g.owners[0].afterHold(()=>opened.push('a'),()=>superseded.push('a'));
 g.owners[1].afterHold(()=>opened.push('b'),()=>superseded.push('b'));
 expect(superseded).toEqual(['a']);
 lease.resume();await g.drain();
 expect(opened,'only the latest right-click runs').toEqual(['b']);
});
it('BLR-3: unmount during the hold yields no menu; a cancelled waiter never runs',async()=>{
 const g=await mount(),opened:string[]=[];
 const lease=g.hold(true);
 g.owners[0].afterHold(()=>opened.push('a'),()=>{});
 g.unmount();try{lease.resume();}catch{/* the unmounted grid retires the hold */}await g.drain();
 expect(opened).toEqual([]);
 const h=await mount();const second=h.hold(true);
 const cancel=h.owners[0].afterHold(()=>opened.push('c'),()=>{});cancel();
 second.resume();await h.drain();expect(opened).toEqual([]);
});
it('BLR-2/5: a blocking tree hold and no hold defer nothing',async()=>{
 const g=await mount(),lease=g.hold(false);
 expect(g.owners[0].afterHold(()=>{},()=>{}),'a non-background tree hold refuses visibly').toBeNull();
 lease.resume();
 expect(g.owners[0].afterHold(()=>{},()=>{}),'no hold means nothing to wait for').toBeNull();
});
it('BLR-11: an analysis (Source change) hold defers nothing',async()=>{
 const g=await mount();
 const gate=new Promise<never>(()=>{});
 // Hold the analysis transaction open: the controller call after the hold starts never settles.
 const request={expectedState:g.props.state,nextState:g.props.state,nextDatasets:g.props.datasets,activeBars:g.props.activeBars,nextActiveBars:g.props.activeBars,activeExecutionIdentity:'ordinary',nextExecutionIdentity:'ordinary',assertCurrent:()=>true};
 g.charts.forEach(chart=>{chart.prepareAnalysisSnapshot=()=>gate;});
 void g.coordinator().apply(request as any).catch(()=>{});await g.drain();
 expect(g.owners[0].beforeOpen(),'the real beforeOpen refuses inside the analysis hold').toBe(false);
 expect(g.owners[0].afterHold(()=>{},()=>{}),'an analysis hold is not a background tree hold').toBeNull();
});
it('BLR-11: a quarantined cell defers nothing even inside a background hold',async()=>{
 const g=await mount();
 // Quarantine both cells: a hold whose setup fails and whose recovery also fails (the coordinator quarantines every row).
 g.charts[0].suspendTree=()=>({isCurrent:()=>true,resume(){throw Error('Synthetic resume fault');},retire(){},dispose(){}});
 g.charts[1].suspendTree=()=>{throw Error('Synthetic hold fault');};
 expect(()=>g.hold(true)).toThrow();
 for(const chart of g.charts)chart.suspendTree=()=>({isCurrent:()=>true,resume(){},retire(){},dispose(){}});
 const lease=g.hold(true);
 expect(g.owners[0].afterHold(()=>{},()=>{}),'a quarantined cell is not deferred').toBeNull();
 expect(g.owners[1].afterHold(()=>{},()=>{})).toBeNull();
 lease.resume();
});
