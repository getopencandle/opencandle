import {afterEach,expect,it,vi} from 'vitest';
import {all,text} from '../helpers/alert-dialog-harness';
import {actualCell,liveData,newer,binding} from '../fixtures/live-staging-cell';
import {createMultiChartState,NOTICE_DELAY_MS} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {ScriptBindingRuntime,type ScriptExpectedCalculation} from '../../src/ui/script-binding-runtime';
import {scriptExecutionIdentity} from '../../src/ui/script-input';
import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import {sourceContextForDataset,sameChartSourceBasis} from '../../src/chart/source-context';
import {sameBarsInput,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {restoreInitialHistoricalFrame} from '../../src/chart/initial-historical-frame';
import {assertHistoricalFrameCompatible,type HistoricalChartFrame} from '../../src/chart/historical-frame';
import type {ChartController} from '../../src/chart/adapter';
import type {ChartInputSnapshot} from '../../src/chart/input-visibility';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {ScriptRenderSettings} from '../../src/chart/script-port';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';

// Actual GridCell receives its actual ChartPanel
// onReady callback, and uses the real helper and Runtime. Controlled native
// acceptance/placement and script executor do not certify browser/SDK behavior.
type RestoreOptions=Parameters<typeof restoreInitialHistoricalFrame>[0];
const seen=vi.hoisted(()=>({restores:[] as RestoreOptions[],held:false,waiting:[] as Array<()=>void>}));
vi.mock('../../src/ui/frame-fingerprints',async()=>{
 const actual=await vi.importActual<typeof import('../../src/ui/frame-fingerprints')>('../../src/ui/frame-fingerprints');
 return{...actual,createFrameFingerprintCalculator:()=>{const calculate=actual.createFrameFingerprintCalculator();return(...args:Parameters<typeof calculate>)=>{const work=calculate(...args);return seen.held?work.then(value=>new Promise<Awaited<typeof work>>(resolve=>{seen.waiting.push(()=>resolve(value));})):work;};}};
});
vi.mock('../../src/chart/initial-historical-frame',async()=>{
 const actual=await vi.importActual<typeof import('../../src/chart/initial-historical-frame')>('../../src/chart/initial-historical-frame');
 return{...actual,restoreInitialHistoricalFrame:(options:RestoreOptions)=>{seen.restores.push(options);return actual.restoreInitialHistoricalFrame(options);}};
});
const closes:Array<()=>void>=[],flush=async()=>{for(let index=0;index<32;index++)await Promise.resolve();};
afterEach(()=>{for(const close of closes.splice(0).reverse())close();seen.restores=[];seen.held=false;for(const release of seen.waiting.splice(0))release();clearLiveDatasets();vi.clearAllTimers();vi.useRealTimers();});
const context=(input:ChartInputSnapshot,bindings:ScriptBinding[],execution='ordinary')=>({bars:input.bars,identity:scriptExecutionIdentity(input.source,input.style,execution),fixture:input.source.fixture,bindings,ready:true,csvJobOwner:{input,execution,assertCurrent(selected:ScriptBinding){if(!bindings.some(row=>row.id===selected.id&&row.documentId===selected.documentId&&row.version===selected.version&&row.source===selected.source&&JSON.stringify(row.inputs??null)===JSON.stringify(selected.inputs??null)))throw Error('SYNTHETIC calculation binding retired');}}});
const executor:typeof executeScriptOnBars=async()=>{
 const result:ScriptResult={plots:[],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,provenance:{kind:'synthetic',label:'SYNTHETIC missing-script frame characterization'}};
 return{barIds:[],result};
};

async function setup(mode:'stable'|'ack-b'|'native-b'|'future-b'){
 vi.useFakeTimers();// the pending-notice linger timer must be armed under the fake clock
 const data=liveData(),next=newer(data,2),inputA:ChartInputSnapshot={bars:data.bars,source:sourceContextForDataset(data),style:'candles'},inputB:ChartInputSnapshot={bars:next.bars,source:sourceContextForDataset(next),style:'candles'};
 registerLiveDataset(data);const state=createMultiChartState(data,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 state.cells[id]={...state.cells[id],scriptBindings:[binding],chartOptions:{...state.cells[id].chartOptions,auto:false}};
 const fingerprints=await createFrameFingerprintCalculator()(state.cells[id],[data]);
 const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:inputA.source.basisIdentity!,revision:inputA.source.revision,style:'candles'},calculationFingerprints:{...fingerprints},panes:[{key:{kind:'price'},owners:[{kind:'script',id:binding.id}],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:{min:10,max:40}}],independent:[],maximized:null};
 state.cells[id]={...state.cells[id],frame};
 const settings=new Map<string,ScriptRenderSettings>(),events:string[]=[],accepted:ChartInputSnapshot[]=[];let installCallback=()=>{};
 const requireHandle=(key:string)=>{const value=settings.get(key);if(!value)throw Error('SYNTHETIC missing script handle');return value;};
 const scripts={add:(_result:unknown,value:ScriptRenderSettings)=>{settings.set(value.id,structuredClone(value));events.push('install:'+value.id);installCallback();return value.id;},remove:(key:string)=>{settings.delete(key);},update:()=>{},replaceStyles:(key:string,plots:ScriptRenderSettings['plots'])=>{requireHandle(key).plots=structuredClone(plots);},show:(key:string,visible:boolean)=>{requireHandle(key).visible=visible;},rename:(key:string,title:string)=>{requireHandle(key).title=title;},place:(key:string,value:{pane:'price'|'new';paneId?:string|null;ownScale?:boolean})=>{Object.assign(requireHandle(key),value);},configurationSnapshot:()=>structuredClone([...settings.values()]),placementStatus:()=>({ready:true,diagnostics:[]})} as unknown as ChartController['scripts'];
 seen.held=true;const cell=actualCell(data,false,state,id);closes.push(()=>cell.dispose());cell.set({port:{mount:()=>()=>{}}});
 let nativeInput=inputA,nativeHook:undefined|(()=>void);
 const requestContext=()=>queueMicrotask(()=>{const props=cell.runner();runtime.update(context({bars:props.bars as ChartInputSnapshot['bars'],source:props.source as ChartInputSnapshot['source'],style:props.style as string},props.bindings as ScriptBinding[]));});
 const runtime=new ScriptBindingRuntime(scripts,()=>{},()=>{},executor,requestContext);closes.push(()=>runtime.dispose());
 let gate:ScriptExpectedCalculation|undefined;const prepare=runtime.prepareBindings.bind(runtime);
 vi.spyOn(runtime,'prepareBindings').mockImplementation((bindings,expected)=>{if(expected&&'kind' in expected)gate=expected;return prepare(bindings,expected);});
 // Initial Runtime exists but the saved nonempty binding has no native handle.
 runtime.update(context(inputA,[]));expect(runtime.configurationStatus(context(inputA,[])).state).toBe('ready');expect(settings.size).toBe(0);
 const saved=()=>cell.getProps().saved as typeof state.cells[typeof id];
 const chart={scripts,getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},getChartOptions:()=>saved().chartOptions,applyChartOptions:()=>{},saveDrawings:()=>saved().drawings,loadDrawings:()=>{},indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},onDrawingsChanged:()=>()=>{},getViewport:()=>({from:1,to:3}),setViewport:()=>{},onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},drawings:{getMode:()=>null},isDrawingChromeTarget:()=>false,getChartSettingsBook:()=>({}),
  isInputCurrent:(input:ChartInputSnapshot)=>{nativeHook?.();return sameBarsInput(input.bars,nativeInput.bars)&&sameChartSourceBasis(input.source,nativeInput.source)&&input.style===nativeInput.style;},
  isInputExact:(input:ChartInputSnapshot)=>{nativeHook?.();return input.bars===nativeInput.bars&&sameChartSourceBasis(input.source,nativeInput.source)&&input.style===nativeInput.style;},
  isInputOwned:(input:ChartInputSnapshot)=>sameBarsInput(input.bars,nativeInput.bars)&&sameChartSourceBasis(input.source,nativeInput.source)&&input.style===nativeInput.style,
  waitForAnalysisPlacement:async()=>{events.push('placement');},
  captureHistoricalFrame:(request:{expected:ChartInputSnapshot;calculationFingerprints:Record<string,string>})=>{expect(request.expected.bars).toBe(nativeInput.bars);events.push('capture');return assertHistoricalFrameCompatible({...structuredClone(frame),panes:[{...frame.panes[0],manualRange:null}]},{source:request.expected.source,style:request.expected.style,calculationFingerprints:request.calculationFingerprints});},
  prepareConfigurationEdit:async(request:{expected:{source:ChartInputSnapshot['source'];style:string};frame:HistoricalChartFrame;calculationFingerprints:Record<string,string>})=>{assertHistoricalFrameCompatible(request.frame,{...request.expected,calculationFingerprints:request.calculationFingerprints});events.push('prepare');return{isCurrent:()=>true,commit:()=>{events.push('commit');},seal:()=>{events.push('seal');},rollback:async()=>{events.push('rollback');}};},
 } as unknown as ChartController;
 const ready=(input:ChartInputSnapshot)=>{nativeInput=input;accepted.push(input);(cell.panel().onReady as(chart:ChartController,input:ChartInputSnapshot,execution:string)=>void)(chart,input,'ordinary');cell.ui.settle();};
 installCallback=()=>{if(mode==='stable')return;installCallback=()=>{};cell.publish(next);if(mode!=='future-b')nativeInput=inputB;if(mode==='ack-b')ready(inputB);runtime.update(context(inputB,[binding]));};
 ready(inputA);(cell.runner().onRuntime as(value:ScriptBindingRuntime)=>void)(runtime);cell.ui.settle();
 // Finish genuine async digest work before installing a fake clock. Releasing
 // only that completed calculation starts the real helper under the owned clock.
 await vi.waitFor(()=>expect(seen.waiting.length).toBeGreaterThan(0),{timeout:2000,interval:5});
 seen.held=false;for(const release of seen.waiting.splice(0))release();await flush();cell.ui.settle();
 expect(events.filter(value=>value.startsWith('install:'))).toHaveLength(1);
 return{cell,inputA,inputB,accepted,chart,runtime,settings,events,gate:()=>{expect(gate).toBeDefined();return gate!;},acknowledgeB:()=>ready(inputB),setNative:(input:ChartInputSnapshot)=>{nativeInput=input;},hook:(callback?:()=>void)=>{nativeHook=callback;},options:()=>seen.restores[0],alerts:()=>all(cell.ui.render(),node=>node.props.role==='alert').map(text).join(' | '),restoring:()=>{cell.ui.settle();vi.advanceTimersByTime(NOTICE_DELAY_MS);cell.ui.settle();return text(cell.ui.render()).includes('Restoring saved chart frame');}};
}

it('a missing nonempty script installs and restores the frame when accepted A remains current',async()=>{
 const h=await setup('stable');await vi.advanceTimersByTimeAsync(100);await flush();h.cell.ui.settle();
 expect(h.accepted.map(value=>value.bars)).toEqual([h.inputA.bars]);expect(h.settings.has(binding.id)).toBe(true);
 expect(h.runtime.configurationStatus(context(h.inputA,[binding]))).toMatchObject({state:'ready',calculations:'complete'});
 expect(h.events).toEqual(['install:'+binding.id,'placement','capture','prepare','commit','seal']);expect(h.alerts()).toBe('');expect(h.restoring()).toBe(false);
});

it('a genuine Panel acknowledgement B during missing-handle installation finishes full script placement and historical frame restoration',async()=>{
 const h=await setup('ack-b');await vi.advanceTimersByTimeAsync(100);await flush();h.cell.ui.settle();
 expect(h.accepted.map(value=>value.bars)).toEqual([h.inputA.bars,h.inputB.bars]);expect(h.settings.has(binding.id)).toBe(true);
 expect(h.chart.isInputCurrent(h.inputA)).toBe(true);expect(h.chart.isInputCurrent(h.inputB)).toBe(true);expect(h.chart.isInputExact(h.inputA)).toBe(false);expect(h.chart.isInputExact(h.inputB)).toBe(true);
 expect(h.runtime.configurationStatus(context(h.inputB,[binding]))).toMatchObject({state:'ready',calculations:'complete'});
 expect(h.events).toEqual(['install:'+binding.id,'placement','capture','prepare','commit','seal']);expect(h.alerts()).toBe('');expect(h.restoring()).toBe(false);
});

it('native acceptance B can consume the installer gate before Panel acknowledgement, while frame restoration still waits for that genuine acknowledgement',async()=>{
 const h=await setup('native-b');await vi.advanceTimersByTimeAsync(100);await flush();h.cell.ui.settle();
 expect(h.runtime.configurationStatus(context(h.inputB,[binding])).state).toBe('ready');expect(h.accepted.map(row=>row.bars)).toEqual([h.inputA.bars]);expect(h.events).toEqual(['install:'+binding.id]);expect(h.restoring()).toBe(true);
 h.acknowledgeB();await vi.advanceTimersByTimeAsync(100);await flush();h.cell.ui.settle();
 expect(h.events).toEqual(['install:'+binding.id,'placement','capture','prepare','commit','seal']);expect(h.alerts()).toBe('');expect(h.restoring()).toBe(false);
});

it('future raw B remains pending until exact native acceptance and the separate genuine Panel acknowledgement',async()=>{
 const h=await setup('future-b');await vi.advanceTimersByTimeAsync(100);expect(h.chart.isInputCurrent(h.inputB)).toBe(true);expect(h.chart.isInputExact(h.inputB)).toBe(false);expect(h.runtime.configurationStatus(context(h.inputB,[binding])).state).toBe('pending');expect(h.events).toEqual(['install:'+binding.id]);
 h.setNative(h.inputB);h.runtime.update(context(h.inputB,[binding]));await flush();expect(h.runtime.configurationStatus(context(h.inputB,[binding])).state).toBe('ready');expect(h.events).toEqual(['install:'+binding.id]);
 h.acknowledgeB();await vi.advanceTimersByTimeAsync(100);await flush();h.cell.ui.settle();expect(h.events.at(-1)).toBe('seal');expect(h.alerts()).toBe('');
});

it('source session style lineage execution and binding replacements cannot borrow the original installer gate',async()=>{
 const h=await setup('future-b'),gate=h.gate();
 for(const change of ['source','session','style','lineage','execution','binding'] as const){
  let candidate={...h.inputB,source:{...h.inputB.source}};
  if(change==='source')candidate.source.revision='replacement';if(change==='session')candidate.source.sessionOverride='regular';if(change==='style')candidate.style='bars';
  if(change==='lineage'){const bars=candidate.bars.map(row=>({...row}));stampLiveLineage(bars,'replacement-subscription',3);candidate={...candidate,bars};}
  const bindings=change==='binding'?[{...binding,version:2}]:[binding],value=context(candidate,bindings,change==='execution'?'replay:replacement':'ordinary');h.setNative(candidate);
  expect(gate.capture(value),change).toBeNull();
 }
 expect(h.events).toEqual(['install:'+binding.id]);expect(h.options().isCurrent()).toBe(true);
});

it('raw input mutation and reentrant source changes retire installer calculation receipts before any frame grant',async()=>{
 const h=await setup('native-b'),gate=h.gate(),value=context(h.inputB,[binding]),receipt=gate.capture(value);expect(receipt).not.toBeNull();expect(receipt!.isCurrent()).toBe(true);
 const bars=h.inputB.bars.map(row=>({...row}));stampLiveLineage(bars,'live:SYNTHETIC-staging-GME:30m|1',3);value.csvJobOwner.input={...value.csvJobOwner.input,bars};h.setNative(value.csvJobOwner.input);expect(receipt!.isCurrent()).toBe(false);
 h.setNative(h.inputB);const reentrant=context({...h.inputB,source:{...h.inputB.source}},[binding]);h.hook(()=>{reentrant.csvJobOwner.input.source.revision='reentrant';});expect(gate.capture(reentrant)).toBeNull();h.hook();expect(h.events).toEqual(['install:'+binding.id]);
 let alive=true;const retired=context(h.inputB,[binding]);retired.csvJobOwner.assertCurrent=()=>{if(!alive)throw Error('SYNTHETIC current chart owner retired');};const owned=gate.capture(retired);expect(owned).not.toBeNull();alive=false;expect(owned!.isCurrent()).toBe(false);expect(gate.capture(retired)).toBeNull();
});

it('an installed gate can settle for a new same-basis helper after the original frame request is cancelled, without reviving that old request',async()=>{
 const h=await setup('future-b'),old=h.options();expect(h.events).toEqual(['install:'+binding.id]);
 // A real saved-frame prop change cancels the first actual Grid helper while
 // retaining this chart, Runtime, source and binding configuration.
 const saved=h.cell.getProps().saved as ReturnType<typeof createMultiChartState>['cells'][string],frame=structuredClone(saved.frame!);frame.panes[0].manualRange={min:11,max:41};
 seen.held=true;vi.clearAllTimers();vi.useRealTimers();h.cell.set({saved:{...saved,frame}});
 expect(old.signal.aborted).toBe(true);expect(old.isCurrent()).toBe(false);
 await vi.waitFor(()=>expect(seen.waiting.length).toBeGreaterThan(0),{timeout:2000,interval:5});h.acknowledgeB();
 vi.useFakeTimers();seen.held=false;for(const release of seen.waiting.splice(0))release();await flush();h.cell.ui.settle();
 expect(seen.restores).toHaveLength(2);expect(h.events).toEqual(['install:'+binding.id]);h.runtime.update(context(h.inputB,[binding]));await flush();
 expect(h.runtime.configurationStatus(context(h.inputB,[binding])).state).toBe('ready');await vi.advanceTimersByTimeAsync(100);await flush();h.cell.ui.settle();
 expect(h.events).toEqual(['install:'+binding.id,'placement','capture','prepare','commit','seal']);expect(old.signal.aborted).toBe(true);expect(old.isCurrent()).toBe(false);expect(h.alerts()).toBe('');expect(h.restoring()).toBe(false);
});
