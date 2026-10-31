import {afterEach,expect,it,vi} from 'vitest';
import {mountControlledComponent} from '../helpers/alert-dialog-harness';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {scriptExecutionIdentity} from '../../src/ui/script-input';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {liveLineageOf,stampLiveLineage} from '../../src/chart/bar-input-identity';
import type {ChartController} from '../../src/chart/adapter';

// Actual Runner hooks and actual runtime gate. Only native acceptance/observer
// delivery is controlled. Empty bindings isolate retry ownership from workers;
// neither absence of scripts nor the event itself grants runtime readiness.
const owned:Array<ReturnType<typeof mountControlledComponent>>=[];
afterEach(()=>{for(const view of owned.splice(0))view.dispose();vi.restoreAllMocks();vi.useRealTimers();});
function fixture(live=true){
 vi.useFakeTimers();
 const dataset=fixtureDataset('GME',3);dataset.resolution='1m';
 let bars=dataset.bars.map(bar=>({...bar}));
 if(live){stampLiveLineage(bars,'SYNTHETIC-native-runner-retry',1);dataset.provenance={...dataset.provenance,datasetId:'live:SYNTHETIC-native-runner-retry'};}
 dataset.bars=bars;let source=sourceContextForDataset(dataset);
 let accepted={bars,source,style:'candles'};
 const makeChart=()=>{
  const market=new Set<()=>void>(),released=vi.fn(),port={onInteraction:()=>()=>{},configurationSnapshot:()=>[],placementStatus:()=>({ready:true,diagnostics:[]})};
  const exact=vi.fn((input:{bars:typeof bars;source:typeof source;style:string})=>input.bars===accepted.bars&&input.source===accepted.source&&input.style===accepted.style);
  const chart={scripts:port,isInputCurrent:exact,isInputExact:exact,getExecutionIdentity:()=> 'ordinary',onMarketApplied:vi.fn((callback:()=>void)=>{market.add(callback);return()=>{released();market.delete(callback);};})} as unknown as ChartController;
  return{chart,market,released,exact};
 };
 const native=makeChart(),owner:{runtime:ScriptBindingRuntime|null}={runtime:null};
 const props:Parameters<typeof ScriptBindingsRunner>[0]={chart:native.chart,bars,source,style:'candles',bindings:[],ready:true,executionIdentity:'ordinary',onRuntime:value=>{owner.runtime=value;}};
 const view=mountControlledComponent(()=>ScriptBindingsRunner(props));owned.push(view);view.settle();
 const runtime=owner.runtime;if(!runtime)throw Error('Actual Runner did not publish its runtime.');
 const context=()=>({bars:props.bars,identity:scriptExecutionIdentity(props.source,props.style,props.executionIdentity!),fixture:props.source.fixture,bindings:props.bindings});
 expect(runtime.configurationStatus(context())).toMatchObject({state:'ready',calculations:'complete'});
 const capture=vi.fn(()=>{
  const input={bars:props.bars,source:props.source,style:props.style};
  if(props.chart!==native.chart||!native.chart.isInputExact(input)||native.chart.getExecutionIdentity()!==props.executionIdentity)return null;
  return{bars:input.bars,isCurrent:()=>props.chart===native.chart&&native.chart.isInputExact(input)&&native.chart.getExecutionIdentity()===props.executionIdentity};
 });
 const lease=runtime.prepareBindings([],{kind:'accepted-calculation',identity:context().identity,fixture:context().fixture,capture});
 lease.pauseAndCapture();lease.stage();lease.resume(true);
 const previous=bars;
 bars=bars.map((bar,index)=>index===bars.length-1?{...bar,close:bar.close+1,high:Math.max(bar.high,bar.close+1),volume:bar.volume+1}:{...bar});
 if(live)stampLiveLineage(bars,'SYNTHETIC-native-runner-retry',2);
 dataset.bars=bars;source=sourceContextForDataset(dataset);props.bars=bars;props.source=source;view.settle();
 expect(previous).toHaveLength(bars.length);expect(previous.at(-1)?.time).toBe(bars.at(-1)?.time);expect(previous.at(-1)?.close).not.toBe(bars.at(-1)?.close);
 if(live)expect(liveLineageOf(previous)?.key).toBe(liveLineageOf(bars)?.key);
 expect(runtime.configurationStatus(context()).state).toBe('pending');
 const updates=vi.spyOn(runtime,'update');
 return{native,props,view,runtime,capture,updates,context,makeChart,accept(){accepted={bars,source,style:'candles'};},fire(){for(const callback of [...native.market])callback();},async drain(){await vi.runOnlyPendingTimersAsync();view.settle();}};
}

it('ordinary live native acknowledgement retries the previously refused exact context and stops retrying after readiness',async()=>{
 const h=fixture();expect(h.native.market.size).toBe(1);
 h.fire();await h.drain();expect(h.runtime.configurationStatus(h.context()).state).toBe('pending');expect(h.updates).not.toHaveBeenCalled();
 h.accept();h.fire();await h.drain();
 expect(h.updates).toHaveBeenCalledOnce();expect(h.capture).toHaveReturnedWith(expect.objectContaining({bars:h.props.bars,isCurrent:expect.any(Function)}));
 expect(h.runtime.configurationStatus(h.context())).toMatchObject({state:'ready',calculations:'complete'});
 const calls=h.capture.mock.calls.length;h.fire();await h.drain();expect(h.updates).toHaveBeenCalledOnce();expect(h.capture).toHaveBeenCalledTimes(calls);
});

it('a static ordinary chart does not subscribe to the live retry path or accept a changed static gate from market delivery',async()=>{
 const h=fixture(false);expect(h.native.market.size).toBe(0);expect(h.native.chart.onMarketApplied).not.toHaveBeenCalled();
 h.accept();h.fire();await h.drain();expect(h.updates).not.toHaveBeenCalled();expect(h.runtime.configurationStatus(h.context()).state).toBe('pending');
});

it('retained native callbacks after chart replacement cannot retry the retired runtime or write the replacement owner',async()=>{
 const h=fixture(),callback=[...h.native.market][0];expect(callback).toBeTypeOf('function');h.accept();
 const replacement=h.makeChart();h.props.chart=replacement.chart;h.view.settle();
 const writes=h.view.owner.writes,captures=h.capture.mock.calls.length;h.updates.mockClear();callback();await h.drain();
 expect(h.native.market.size).toBe(0);expect(h.native.released).toHaveBeenCalledOnce();expect(h.updates).not.toHaveBeenCalled();expect(h.capture).toHaveBeenCalledTimes(captures);expect(h.view.owner.writes).toBe(writes);
 expect(h.runtime.configurationStatus(h.context()).state).toBe('error');
});

it('unmount cancels queued native retries and retained callbacks cannot mutate disposed hook state',async()=>{
 const h=fixture(),callback=[...h.native.market][0];expect(callback).toBeTypeOf('function');h.accept();callback();h.view.dispose();
 const writes=h.view.owner.writes,captures=h.capture.mock.calls.length;h.updates.mockClear();callback();await vi.runOnlyPendingTimersAsync();
 expect(h.native.market.size).toBe(0);expect(h.native.released).toHaveBeenCalledOnce();expect(h.updates).not.toHaveBeenCalled();expect(h.capture).toHaveBeenCalledTimes(captures);expect(h.view.owner.writes).toBe(writes);expect(vi.getTimerCount()).toBe(0);
 expect(h.runtime.configurationStatus(h.context()).state).toBe('error');
});
