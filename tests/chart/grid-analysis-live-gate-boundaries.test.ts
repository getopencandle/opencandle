import {afterEach,expect,it,vi} from 'vitest';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ScriptBindingRuntime,type ScriptExpectedCalculation} from '../../src/ui/script-binding-runtime';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {scriptExecutionIdentity} from '../../src/ui/script-input';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import type {BarDataset} from '../../src/domain/types';
import type {ChartController} from '../../src/chart/adapter';

// Actual coordinator and runtime; only native market/analysis ports are controlled.
// Ordinary capture deliberately throws if the derived-only adapter API is used.
const owned:ScriptBindingRuntime[]=[];
afterEach(()=>{for(const runtime of owned.splice(0))runtime.dispose();clearLiveDatasets();vi.restoreAllMocks();});
function setup(options:{live?:boolean;run?:string;style?:string}={}){
 const a=fixtureDataset('GME',4);a.provenance.datasetId='live:synthetic:GME';
 const b:BarDataset={...a,bars:a.bars.map((bar,index)=>index===a.bars.length-1?{...bar,close:bar.close+1,high:Math.max(bar.high,bar.close+1),volume:bar.volume+1}:{...bar})};
 if(options.live!==false){stampLiveLineage(a.bars,'gate-boundary-owned-feed',1);stampLiveLineage(b.bars,'gate-boundary-owned-feed',2);}
 registerLiveDataset(a);
 const before=createMultiChartState(a,{appearance:defaultTheme.appearance,scriptBindings:[]}),next=structuredClone(before),id=before.layout.activeCellId;
 if(options.style){before.cells[id].style=options.style as typeof before.cells[typeof id]['style'];next.cells[id].style=before.cells[id].style;}
 let state=before,dataset=a,accepted=a.bars,execution=options.run??'ordinary',current=true,exact=true,rootOwned=true,requestOwned=true,failCommit=false;
 let expected:Parameters<ScriptBindingRuntime['prepareBindings']>[1];
 let nativeHook:undefined|(()=>void);
 const scriptPort={configurationSnapshot:()=>[],placementStatus:()=>({ready:true,diagnostics:[]})} as unknown as ChartController['scripts'];
 const runtime=new ScriptBindingRuntime(scriptPort,vi.fn());owned.push(runtime);
 const originalPrepare=runtime.prepareBindings.bind(runtime);
 vi.spyOn(runtime,'prepareBindings').mockImplementation((bindings,value)=>{expected=value;return originalPrepare(bindings,value);});
 const chart={
  isInputCurrent:()=>{nativeHook?.();return current;},
  isInputExact:(input:{bars:typeof a.bars})=>{nativeHook?.();return exact&&input.bars===accepted;},
  getExecutionIdentity:()=>execution,
  getSourceBars:()=>accepted.map(bar=>({...bar})),
  captureScriptCalculationInput:vi.fn(()=>{throw Error('Derived-only capture cannot certify ordinary candles');}),
  prepareAnalysisSnapshot:async(args:{scripts:ReturnType<ScriptBindingRuntime['prepareBindings']>})=>{
   args.scripts.pauseAndCapture();args.scripts.stage();return{changed:true,isCurrent:()=>requestOwned,commit(){},seal(){args.scripts.resume(true);},async rollback(){args.scripts.rollback();args.scripts.resume(false);}};
  },
  saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>'',
 } as unknown as ChartController;
 // The application universe deliberately remains A while the live registry grows.
 const coordinator=createGridAnalysisCoordinator({read:()=>({state,datasets:[a]}),controller:()=>rootOwned?chart:null,runtime:()=>rootOwned?runtime:null,pending(){},holdLinks:()=>({release(){}}),preparedInputs(){},failed(){}});
 const context=(data=dataset,run=execution)=>{const cell=state.cells[id],source=sourceContextForDataset(data),input={bars:data.bars,source,style:cell.style};return{bars:calculationBarsForStyle(data.bars,cell.style),identity:scriptExecutionIdentity(source,cell.style,run),fixture:source.fixture,bindings:cell.scriptBindings??[],ready:true,csvJobOwner:{input,execution:run,assertCurrent(){if(!rootOwned||!current||!exact||accepted!==input.bars||execution!==run)throw Error('Synthetic native input retired');}}};};
 runtime.update(context());
 const apply=()=>coordinator.apply({expectedState:before,nextState:next,nextDatasets:[a],nextExecutionIdentity:options.run??'ordinary',assertCurrent:()=>requestOwned,commitModel(mark){if(failCommit)throw Error('Synthetic model rejection');state=next;mark();}});
 const calculation=()=>{expect(expected).toHaveProperty('kind','accepted-calculation');return expected as ScriptExpectedCalculation;};
 return{a,b,before,next,id,runtime,chart,context,apply,calculation,expected:()=>expected,
  publish(data=b){dataset=data;accepted=data.bars;registerLiveDataset(data);},setExact(value:boolean){exact=value;},setCurrent(value:boolean){current=value;},setRun(value:string){execution=value;},retire(){rootOwned=false;},rejectCommit(){failCommit=true;},hook(value?:()=>void){nativeHook=value;},state:()=>state};
}

it('accepts changed-OHLCV live B after committed empty-binding analysis using exact native ownership',async()=>{
 const h=setup();await h.apply();h.publish();
 // A subsequent pan changes viewport intent, not the script calculation source.
 h.next.cells[h.id].viewport={from:h.a.bars[1].time,to:h.a.bars.at(-1)!.time};
 h.runtime.update(h.context());
 expect(h.a.bars).toHaveLength(h.b.bars.length);expect(h.a.bars.at(-1)?.close).not.toBe(h.b.bars.at(-1)?.close);
 expect(h.runtime.configurationStatus(h.context())).toMatchObject({state:'ready',calculations:'complete'});
 expect(h.chart.captureScriptCalculationInput).not.toHaveBeenCalled();
});

it('future B cannot clear the live gate until native exact acceptance, even when lineage-current',async()=>{
 const h=setup();await h.apply();h.publish();h.setExact(false);h.runtime.update(h.context());
 expect(h.runtime.configurationStatus(h.context()).state).toBe('pending');
 h.setExact(true);h.runtime.update(h.context());expect(h.runtime.configurationStatus(h.context()).state).toBe('ready');
});

it('source revision, session, feed lineage, style and execution replacements cannot obtain the old live receipt',async()=>{
 for(const change of ['revision','session','lineage','style','execution'] as const){
  const h=setup();await h.apply();const gate=h.calculation();h.publish();
  if(change==='revision')h.publish({...h.b,provenance:{...h.b.provenance,revision:'other-revision'}});
  if(change==='session')h.publish({...h.b,provenance:{...h.b.provenance,session:'regular'}});
  if(change==='lineage'){const bars=h.b.bars.map(bar=>({...bar}));stampLiveLineage(bars,'replacement-subscription',3);h.publish({...h.b,bars});}
  if(change==='style')h.next.cells[h.id].style='heikinashi';
  if(change==='execution')h.setRun('replay:replacement');
  expect(gate.capture(h.context()),change).toBeNull();h.runtime.update(h.context());expect(h.runtime.configurationStatus(h.context()).state,change).toBe('pending');
 }
});

it('a captured live receipt retires when accepted rows, native exactness or the controller owner changes',async()=>{
 for(const change of ['rows','owner-input','native','owner'] as const){
  const h=setup();await h.apply();h.publish();const candidate=h.context(),receipt=h.calculation().capture(candidate);expect(receipt,change).not.toBeNull();expect(receipt!.isCurrent(),change).toBe(true);
  if(change==='rows'||change==='owner-input'){const bars=h.b.bars.map(bar=>({...bar}));stampLiveLineage(bars,'gate-boundary-owned-feed',3);h.publish({...h.b,bars});if(change==='owner-input')candidate.csvJobOwner.input.bars=bars;}
  if(change==='native')h.setExact(false);if(change==='owner')h.retire();
  expect(receipt!.isCurrent(),change).toBe(false);
 }
});

it('native callback reentry retiring the owner cannot return a live receipt or consume its gate',async()=>{
 for(const change of ['owner','source'] as const){
  const h=setup();await h.apply();h.publish();const candidate=h.context();
  h.hook(()=>{if(change==='owner')h.retire();else candidate.csvJobOwner.input.source.revision='reentered-revision';});
  expect(h.calculation().capture(candidate),change).toBeNull();h.runtime.update(candidate);expect(h.runtime.configurationStatus(candidate).state,change).toBe('pending');
 }
});

it('changed saved calculation configuration cannot borrow a committed live gate',async()=>{
 const h=setup();await h.apply();h.publish();h.next.cells[h.id].scriptBindings=[{id:'new-binding',documentId:'doc',version:1,name:'New calculation',source:'return {};',pane:'price',visible:true,plots:{}}];
 expect(h.calculation().capture(h.context())).toBeNull();h.runtime.update(h.context());expect(h.runtime.configurationStatus(h.context()).state).toBe('pending');
});

it('static input and replay execution keep their exact original payload gate',async()=>{
 for(const options of [{live:false},{live:true,run:'replay:owned'}]){
  const h=setup(options);await h.apply();expect(h.expected()).not.toHaveProperty('kind');h.publish();h.runtime.update(h.context());expect(h.runtime.configurationStatus(h.context()).state).toBe('pending');
  h.publish(h.a);h.runtime.update(h.context());expect(h.runtime.configurationStatus(h.context()).state).toBe('ready');
 }
});

it('failed model acceptance rolls back to the old runtime configuration without installing a future live gate',async()=>{
 const h=setup();h.rejectCommit();await expect(h.apply()).rejects.toThrow('Synthetic model rejection');
 expect(h.state()).toBe(h.before);expect(h.runtime.configurationStatus(h.context(h.a)).state).toBe('ready');
 h.publish();h.runtime.update(h.context());expect(h.runtime.configurationStatus(h.context()).state).toBe('ready');
 expect(h.calculation().capture(h.context())).toBeNull();
});
