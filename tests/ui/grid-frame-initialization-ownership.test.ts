import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,NOTICE_DELAY_MS,createMultiChartState,type MultiChartCellState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {transitionDrawingScope} from '../../src/ui/drawing-scopes';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {BarDataset} from '../../src/domain/types';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';

// Actual private GridCell frame-initialization effect, refs and state obtained
// from the real MultiChartGrid tree under the shared controlled hook model. The
// harness separates render from passive effects, so a replacement basis can be
// rendered while the old effect cleanup is still pending. Restore promises and
// native ports are SYNTHETIC; this is not DOM, GUI or packaged-build evidence.
type Input={bars:BarDataset['bars'];source:ReturnType<typeof sourceContextForDataset>;style:string};
type RestoreOptions={chart:unknown;input:Input;frame:HistoricalChartFrame;signal:AbortSignal;isCurrent:()=>boolean};
type RestoreCall={options:RestoreOptions;resolve:()=>void;reject:(cause:unknown)=>void;runActual:()=>Promise<void>};
const restore=vi.hoisted(()=>({calls:[] as RestoreCall[]}));
vi.mock('../../src/chart/initial-historical-frame',async()=>{
 const actual=await vi.importActual<typeof import('../../src/chart/initial-historical-frame')>('../../src/chart/initial-historical-frame');
 type Options=Parameters<typeof actual.restoreInitialHistoricalFrame>[0];
 // Each call is held until the test settles it directly or runs the actual
 // native restoration body with the exact options the Grid supplied.
 return{restoreInitialHistoricalFrame:(options:Options)=>new Promise<void>((resolve,reject)=>{restore.calls.push({options:options as unknown as RestoreOptions,resolve:()=>resolve(),reject,runActual:()=>actual.restoreInitialHistoricalFrame(options).then(()=>resolve(),(cause:unknown)=>{reject(cause);})});})};
});
const gate=vi.hoisted(()=>({held:false,waiting:[] as Array<()=>void>}));
vi.mock('../../src/ui/frame-fingerprints',async()=>{
 const actual=await vi.importActual<typeof import('../../src/ui/frame-fingerprints')>('../../src/ui/frame-fingerprints');
 return{...actual,createFrameFingerprintCalculator:()=>{
  const calculate=actual.createFrameFingerprintCalculator();
  return(...args:Parameters<typeof calculate>)=>{const work=calculate(...args);return gate.held?new Promise<Awaited<typeof work>>((resolve,reject)=>{gate.waiting.push(()=>{work.then(resolve,reject);});}):work;};
 }};
});
beforeEach(()=>{vi.useFakeTimers();restore.calls=[];gate.held=false;gate.waiting=[];});
afterEach(()=>{vi.useRealTimers();});

const flush=async()=>{for(let turn=0;turn<6;turn++)await vi.advanceTimersByTimeAsync(0);};
const inputFor=(dataset:BarDataset):Input=>({bars:dataset.bars,source:sourceContextForDataset(dataset,dataset.bars),style:'candles'});
function frameFor(dataset:BarDataset,min:number):HistoricalChartFrame{
 const source=sourceContextForDataset(dataset,dataset.bars);
 return{schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:{min,max:min+30}}],independent:[],maximized:null};
}
function nativeChart(read:()=>{saved:Record<string,any>;accepted:Input}){
 const events:string[]=[],placements:Array<()=>void>=[];let holding=false,configured=0;
 return{events,get configured(){return configured;},
  hold(){holding=true;},release(){holding=false;for(const resume of placements.splice(0))resume();},
  getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>read().saved.chartOptions,applyChartOptions:()=>{},saveDrawings:()=>read().saved.drawings,loadDrawings:()=>{events.push('loadDrawings');},
  indicators:{restore:()=>{configured++;},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},
  onDrawingsChanged:()=>()=>{},getViewport:()=>null,setViewport:()=>{},onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},
  drawings:{getMode:()=>null},isDrawingChromeTarget:()=>false,
  isInputCurrent:(input:Input)=>{const accepted=read().accepted;return input.bars===accepted.bars&&input.style===accepted.style&&input.source.datasetId===accepted.source.datasetId;},
  scripts:{configurationSnapshot:()=>[]},
  waitForAnalysisPlacement:()=>new Promise<void>(resolve=>{if(holding)placements.push(resolve);else resolve();}),
  captureHistoricalFrame:()=>{const frame=structuredClone(read().saved.frame as HistoricalChartFrame);frame.panes[0].manualRange=null;return frame;},
  prepareConfigurationEdit:async(request:{frame:HistoricalChartFrame})=>{events.push('prepare:'+request.frame.panes[0].manualRange?.min);return{isCurrent:()=>true,commit:()=>{events.push('commit');},seal:()=>{events.push('seal');},rollback:async()=>{events.push('rollback');}};},
 };
}
type Native=ReturnType<typeof nativeChart>;

function setup(){
 const gme=fixtureDataset('GME',3),spy=fixtureDataset('SPY',3),datasets=[gme,spy];
 const state=createMultiChartState(gme,{appearance:defaultTheme.appearance});
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 parent.dispose();
 const statuses:Array<{settled:boolean;error:string}>=[];
 let accepted=inputFor(gme);
 let props:Record<string,any>={...cell.props,saved:{...(cell.props.saved as Record<string,any>),frame:frameFor(gme,10)},onCapture:vi.fn(()=>true),onReady:vi.fn(),onRuntime:vi.fn(),
  onStatus:(value:{settled:boolean;error:string})=>{statuses.push({settled:value.settled,error:value.error});},onNonGesture:vi.fn(),onBeginGesture:vi.fn(()=>true),onFinishGesture:vi.fn(),port:{mount:()=>()=>{}}};
 const component=cell.type as (input:Record<string,any>)=>unknown;
 const ui=mountControlledComponent(()=>component(props));
 const reveal=()=>{vi.advanceTimersByTime(NOTICE_DELAY_MS);};
 const read=()=>({saved:props.saved as Record<string,any>,accepted});
 const chartA=nativeChart(read),chartB=nativeChart(read);
 const runtime={configurationStatus:()=>({state:'ready',calculations:'complete',diagnostics:[]}),prepareBindings:()=>{throw Error('SYNTHETIC fixture has no missing script bindings');}};
 const only=(tree:unknown,type:unknown)=>{const found=all(tree,value=>value.type===type);if(found.length!==1)throw Error('SYNTHETIC fixture expected one element');return found[0];};
 const ready=(chart:Native,dataset:BarDataset)=>{accepted=inputFor(dataset);(only(ui.render(),ChartPanel).props.onReady as (chart:Native,input:Input,execution:string)=>void)(chart,accepted,'ordinary');};
 ui.settle();
 return{ui,gme,spy,chartA,chartB,statuses,ready,
  get props(){return props;},setProps(patch:Record<string,unknown>){props={...props,...patch};},
  async start(){const tree=ui.render();accepted=inputFor(gme);(only(tree,ChartPanel).props.onReady as (chart:Native,input:Input,execution:string)=>void)(chartA,accepted,'ordinary');(only(tree,ScriptBindingsRunner).props.onRuntime as (value:unknown)=>void)(runtime);ui.settle();await flush();},
  republishRuntime(){(only(ui.render(),ScriptBindingsRunner).props.onRuntime as (value:unknown)=>void)({...runtime});},
  call(index:number){const value=restore.calls[index];if(!value)throw Error('SYNTHETIC restore call '+index+' was not issued');return value;},
  // Pending notices appear only after a 400 ms linger (presentation timing): advance past it, then read.
  restoring:()=>{reveal();return text(ui.render()).includes('Restoring saved chart frame...');},
  alerts:()=>all(ui.render(),value=>value.props.role==='alert').map(text).join(' | '),
  writes:()=>{reveal();return ui.owner.writes;},
 };
}
type Harness=ReturnType<typeof setup>;
const vwap=()=>({id:'vwap-one',kind:'vwap',...factoryIndicatorDefault('vwap'),paneId:'price'});
const retirements:Record<string,(h:Harness)=>void>={
 'a new saved frame':h=>h.setProps({saved:{...h.props.saved,frame:frameFor(h.gme,20)}}),
 'a studies change':h=>h.setProps({saved:{...h.props.saved,indicators:[vwap()]}}),
 'a new source':h=>h.setProps({dataset:h.spy,bars:h.spy.bars,saved:{...transitionDrawingScope(h.props.saved as MultiChartCellState,h.gme,h.spy),frame:frameFor(h.spy,10)}}),
};
const replacements:Record<string,(h:Harness)=>void>={...retirements,'a replacement chart instance':h=>h.ready(h.chartB,h.gme)};
const drawingsAck=(h:Harness)=>h.setProps({saved:{...h.props.saved,drawings:structuredClone(h.props.saved.drawings)}});

/** Runs the replacement's own effect and proves it initializes and becomes ready on its own owner. */
async function completeReplacement(h:Harness,name:string,baseline:number,retired?:RestoreCall){
 h.ui.settle();await flush();
 if(retired)expect(retired.options.signal.aborted).toBe(true);
 if(name==='a new source'){expect(restore.calls).toHaveLength(baseline);expect(h.restoring()).toBe(true);h.ready(h.chartA,h.spy);h.ui.settle();}
 await vi.waitFor(()=>expect(restore.calls).toHaveLength(baseline+1));
 const next=restore.calls[baseline],owner=name==='a replacement chart instance'?h.chartB:h.chartA,other=owner===h.chartA?h.chartB:h.chartA;
 expect(next.options.chart).toBe(owner);expect(next.options.frame).toBe(h.props.saved.frame);expect(next.options.input.bars).toBe(h.props.bars);expect(next.options.isCurrent()).toBe(true);
 expect(h.restoring()).toBe(true);const before=owner.events.length,otherBefore=other.events.slice();
 await next.runActual();await flush();h.ui.settle();
 expect(h.alerts()).toBe('');expect(h.restoring()).toBe(false);expect(h.statuses.at(-1)).toEqual({settled:true,error:''});
 expect(owner.events.slice(before)).toEqual(['prepare:'+h.props.saved.frame.panes[0].manualRange.min,'commit','seal']);expect(other.events).toEqual(otherBefore);
}

it('a restored saved manual frame stays ready with no extra restore across drawings-only saved-object ACKs',async()=>{
 const h=setup();await h.start();expect(restore.calls).toHaveLength(1);expect(h.restoring()).toBe(true);
 await h.call(0).runActual();await flush();h.ui.settle();
 expect(h.chartA.events).toEqual(['prepare:10','commit','seal']);expect(h.restoring()).toBe(false);expect(h.alerts()).toBe('');expect(h.statuses.at(-1)).toEqual({settled:true,error:''});
 const configured=h.chartA.configured,statuses=h.statuses.length;
 for(let hit=0;hit<2;hit++){drawingsAck(h);h.ui.settle();await flush();h.ui.settle();}
 expect(h.chartA.configured).toBe(configured+2);
 expect(restore.calls).toHaveLength(1);expect(h.chartA.events).toEqual(['prepare:10','commit','seal']);expect(h.restoring()).toBe(false);expect(h.alerts()).toBe('');
 expect(h.statuses.slice(statuses).every(value=>value.settled&&!value.error)).toBe(true);
});

it('a drawings-only ACK while the saved frame is pending neither retires nor restarts initialization',async()=>{
 const h=setup();await h.start();const first=h.call(0),configured=h.chartA.configured;
 drawingsAck(h);h.ui.settle();await flush();h.ui.settle();
 expect(h.chartA.configured).toBe(configured+1);
 expect(restore.calls).toHaveLength(1);expect(first.options.signal.aborted).toBe(false);expect(first.options.isCurrent()).toBe(true);expect(h.restoring()).toBe(true);
 await first.runActual();await flush();h.ui.settle();
 expect(h.restoring()).toBe(false);expect(h.alerts()).toBe('');expect(h.chartA.events).toEqual(['prepare:10','commit','seal']);
});

it.each(Object.keys(retirements))('%s retires the pending initialization and only the replacement basis initializes',async name=>{
 const h=setup();await h.start();const first=h.call(0);
 retirements[name](h);h.ui.render();
 expect(first.options.isCurrent()).toBe(false);
 h.ui.settle();await flush();expect(first.options.signal.aborted).toBe(true);expect(h.restoring()).toBe(true);
 const writes=h.writes();first.resolve();await flush();expect(h.writes()).toBe(writes);expect(h.restoring()).toBe(true);
 await completeReplacement(h,name,1);
 expect(h.chartA.events.filter(event=>event==='commit')).toHaveLength(1);
});

it.each(Object.keys(replacements))('a stale completion after %s renders but before old cleanup cannot mark the replacement ready',async name=>{
 const h=setup();await h.start();const first=h.call(0);
 replacements[name](h);h.ui.render();expect(first.options.signal.aborted).toBe(false);
 const writes=h.writes();first.resolve();await flush();
 expect(h.restoring()).toBe(true);expect(h.alerts()).toBe('');expect(h.writes()).toBe(writes);expect(restore.calls).toHaveLength(1);expect(h.chartB.events).toEqual([]);
 await completeReplacement(h,name,1,first);
});

it.each(Object.keys(replacements))('a stale error after %s renders but before old cleanup cannot fail the replacement',async name=>{
 const h=setup();await h.start();const first=h.call(0);
 replacements[name](h);h.ui.render();expect(first.options.signal.aborted).toBe(false);
 const writes=h.writes();first.reject(Error('SYNTHETIC late native frame failure'));await flush();
 expect(h.alerts()).toBe('');expect(h.restoring()).toBe(true);expect(h.writes()).toBe(writes);expect(restore.calls).toHaveLength(1);expect(h.chartB.events).toEqual([]);
 await completeReplacement(h,name,1,first);
});

it.each(Object.keys(replacements))('the actual native restore superseded by %s before old cleanup applies nothing and reports nothing',async name=>{
 const h=setup();h.chartA.hold();await h.start();const first=h.call(0),running=first.runActual();await flush();
 expect(h.chartA.events).toEqual([]);
 replacements[name](h);h.ui.render();expect(first.options.signal.aborted).toBe(false);
 const writes=h.writes();h.chartA.release();await running;await flush();
 expect(h.chartA.events).toEqual([]);expect(h.chartB.events).toEqual([]);
 expect(h.alerts()).toBe('');expect(h.restoring()).toBe(true);expect(h.writes()).toBe(writes);
 await completeReplacement(h,name,1,first);
});

it.each(Object.keys(replacements))('a fingerprint calculation outliving %s before old cleanup issues no stale restore or state write',async name=>{
 const h=setup();gate.held=true;await h.start();expect(restore.calls).toHaveLength(0);expect(gate.waiting).toHaveLength(1);
 replacements[name](h);h.ui.render();
 const writes=h.writes();gate.held=false;for(const release of gate.waiting.splice(0))release();await flush();
 expect(restore.calls).toHaveLength(0);expect(h.writes()).toBe(writes);expect(h.alerts()).toBe('');expect(h.restoring()).toBe(true);
 await completeReplacement(h,name,0);
});

it('a runtime republish keeps token and chart but retires the pending effect, so its late completion writes nothing',async()=>{
 const h=setup();await h.start();const first=h.call(0);
 h.republishRuntime();h.ui.settle();await flush();
 expect(first.options.signal.aborted).toBe(true);expect(restore.calls).toHaveLength(2);
 const next=h.call(1);expect(next.options.chart).toBe(h.chartA);expect(next.options.frame).toBe(h.props.saved.frame);expect(next.options.isCurrent()).toBe(true);
 const writes=h.writes();first.resolve();await flush();
 expect(h.writes()).toBe(writes);expect(h.restoring()).toBe(true);expect(h.alerts()).toBe('');expect(h.chartA.events).toEqual([]);expect(restore.calls).toHaveLength(2);expect(first.options.isCurrent()).toBe(false);
 await next.runActual();await flush();h.ui.settle();
 expect(h.restoring()).toBe(false);expect(h.alerts()).toBe('');expect(h.chartA.events).toEqual(['prepare:10','commit','seal']);
});

// A pending saved frame keeps the last-painted chart visible but out of interaction until it is verified.
const frameWrapper=(h:Harness)=>{const found=all(h.ui.render(),value=>value.type==='div'&&(value.props.children as {type?:unknown}|undefined)?.type===ChartPanel);if(found.length!==1)throw Error('SYNTHETIC fixture expected one chart wrapper');return found[0].props as {inert?:boolean;'aria-busy'?:boolean;style:{visibility:string;pointerEvents?:string}};};
it('SMOOTH: a pending frame stays painted but inert, busy and pointer-transparent until verified; only an owner-less cell is blank',async()=>{
 const h=setup();expect(frameWrapper(h).style.visibility).toBe('hidden');
 await h.start();expect(h.restoring()).toBe(true);
 let view=frameWrapper(h);expect(view.style.visibility).toBe('visible');expect(view.inert).toBe(true);expect(view['aria-busy']).toBe(true);expect(view.style.pointerEvents).toBe('none');
 await h.call(0).runActual();await flush();h.ui.settle();
 view=frameWrapper(h);expect(h.restoring()).toBe(false);expect(view.style.visibility).toBe('visible');expect(view.inert).toBe(false);expect(view['aria-busy']).toBe(false);expect(view.style.pointerEvents).toBeUndefined();
 retirements['a new source'](h);h.ui.settle();await flush();
 view=frameWrapper(h);expect(h.restoring()).toBe(true);expect(view.style.visibility).toBe('visible');expect(view.inert).toBe(true);expect(view.style.pointerEvents).toBe('none');
 expect(h.statuses.at(-1)?.settled).toBe(false);
});
