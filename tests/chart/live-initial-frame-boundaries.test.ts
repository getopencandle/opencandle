import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {restoreInitialHistoricalFrame} from '../../src/chart/initial-historical-frame';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {restoreScriptBindings} from '../../src/ui/script-library';
import type {ChartInputSnapshot} from '../../src/chart/input-visibility';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';

// SYNTHETIC boundary ports only. No native/source completion, provider, profile,
// key, numerical or private proof is forged or claimed by these controlled tests.
const aborts:AbortController[]=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{for(const abort of aborts.splice(0))abort.abort();vi.clearAllTimers();vi.useRealTimers();});
const tick=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
function setup(nonempty=false){
 const seed=fixtureDataset('GME',3),key='live:synthetic-frame-boundary|synthetic-live-v1';
 const snapshot=(seq:number,close:number,lineage=key):ChartInputSnapshot=>{const bars=seed.bars.map(row=>({...row}));bars[bars.length-1]={...bars[bars.length-1],close,high:Math.max(bars[bars.length-1].high,close)};stampLiveLineage(bars,lineage,seq);const dataset={...seed,bars,resolution:'30m',provenance:{...seed.provenance,providerId:'alpaca-stub',providerName:'SYNTHETIC frame boundary',datasetId:'live:synthetic-frame-boundary',revision:'synthetic-live-v1',coverage:'SYNTHETIC controlled ticks',fixture:true,session:'extended' as const}};return{bars,source:sourceContextForDataset(dataset,bars),style:'candles'};};
 const first=snapshot(1,100),second=snapshot(2,101),third=snapshot(3,102),events:string[]=[],contexts:number[]=[];
 const bindings=nonempty?restoreScriptBindings([{id:'synthetic-installed-script',documentId:'synthetic-document',version:1,name:'SYNTHETIC installed study',source:'({onBar(ctx){ctx.plot("p",1);}})',pane:'price',paneId:null,ownScale:false,visible:true,plots:{}}]):[];
 const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:first.source.basisIdentity!,revision:first.source.revision,style:'candles'},calculationFingerprints:nonempty?{'["script","synthetic-installed-script"]':'sha256:synthetic-installed'}:{},panes:[{key:{kind:'price'},owners:nonempty?[{kind:'script',id:'synthetic-installed-script'}]:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:{min:10,max:40}}],independent:[],maximized:null};
 const state={accepted:first,latest:{input:first,executionIdentity:'ordinary'} as {input:ChartInputSnapshot;executionIdentity:string}|null,current:true,execution:'ordinary',held:false};
 const lease={isCurrent:vi.fn(()=>true),commit:vi.fn(()=>{events.push('commit');}),seal:vi.fn(()=>{events.push('seal');}),rollback:vi.fn(async()=>{events.push('rollback');})};
 const chart:any={scripts:{configurationSnapshot:()=>bindings.map(row=>({id:row.id}))},getExecutionIdentity:()=>state.execution,isInputCurrent:vi.fn((_input:ChartInputSnapshot)=>!state.held),isInputExact:vi.fn((input:ChartInputSnapshot)=>input.bars===state.accepted.bars),isInputOwned:vi.fn(()=>true),waitForAnalysisPlacement:vi.fn(async()=>{events.push('placement');}),captureHistoricalFrame:vi.fn((request:any)=>{events.push('capture:'+request.expected.bars.at(-1).close);return{...structuredClone(frame),panes:[{...frame.panes[0],manualRange:null}]};}),prepareConfigurationEdit:vi.fn(async()=>{events.push('prepare');return lease;})};
 const runtime:any={prepareBindings:vi.fn(()=>{throw Error('Installed bindings must not enter a new static context gate');}),configurationStatus:vi.fn((context:any)=>{contexts.push(context.bars.at(-1).close);return{state:JSON.stringify(context.bars)===JSON.stringify(state.accepted.bars)?'ready':'pending',calculations:'complete',diagnostics:[]};})};
 const abort=new AbortController();aborts.push(abort);
 const options={chart,runtime,input:first,executionIdentity:'ordinary',bindings,frame,fingerprints:{...frame.calculationFingerprints},signal:abort.signal,isCurrent:()=>state.current,readLatestAccepted:()=>state.latest};
 const run=()=>{const pending=restoreInitialHistoricalFrame(options);void pending.catch(()=>{});return pending;};
 return{first,second,third,snapshot,state,chart,runtime,lease,events,contexts,options,run,abort};
}

it('refuses changed source style session lineage and execution before granting any native frame preparation',async()=>{
 // One counted case, five explicit replacement scenarios.
 for(const kind of ['source','style','session','lineage','execution'] as const){const h=setup();let input=h.second;
  if(kind==='source')input={...input,source:{...input.source,revision:'synthetic-replaced-revision'}};
  if(kind==='style')input={...input,style:'bars'};
  if(kind==='session')input={...input,source:{...input.source,sessionOverride:'regular'}};
  if(kind==='lineage')input=h.snapshot(4,103,'live:synthetic-other-lineage');
  h.state.accepted=input;h.state.latest={input,executionIdentity:kind==='execution'?'synthetic-replay-run':'ordinary'};if(kind==='execution')h.state.execution='synthetic-replay-run';
  await expect(h.run()).rejects.toThrow(/replaced|superseded/);expect(h.chart.captureHistoricalFrame).not.toHaveBeenCalled();expect(h.chart.prepareConfigurationEdit).not.toHaveBeenCalled();
 }
});

it('a future same-lineage snapshot that passes logical currentness waits for native exact acceptance instead of becoming a frame grant',async()=>{
 const h=setup();h.state.latest={input:h.second,executionIdentity:'ordinary'};const pending=h.run();await vi.advanceTimersByTimeAsync(40);expect(h.chart.isInputCurrent).toHaveReturnedWith(true);expect(h.chart.isInputExact).toHaveReturnedWith(false);expect(h.chart.prepareConfigurationEdit).not.toHaveBeenCalled();
 h.state.accepted=h.second;await vi.advanceTimersByTimeAsync(20);await pending;expect(h.contexts.at(-1)).toBe(101);expect(h.events).toContain('capture:101');expect(h.lease.commit).toHaveBeenCalledOnce();
});

it('accepted-input and postcapture runtime callbacks that retire their chart cannot reach a stale native preparation',async()=>{
 for(const kind of ['accepted-callback','postcapture-runtime'] as const){const h=setup();
  if(kind==='accepted-callback')h.options.readLatestAccepted=()=>{h.state.current=false;return{input:h.second,executionIdentity:'ordinary'};};
  else{const read=h.runtime.configurationStatus.getMockImplementation()!;let calls=0;h.runtime.configurationStatus.mockImplementation((context:any)=>{const status=read(context);if(++calls===3)h.state.current=false;return status;});}
  await expect(h.run()).rejects.toThrow(/cancelled|superseded/);if(kind==='accepted-callback')expect(h.chart.captureHistoricalFrame).not.toHaveBeenCalled();expect(h.chart.prepareConfigurationEdit).not.toHaveBeenCalled();
 }
});

it('native exactness lease-current and preseal commit reentry cannot publish a retired frame',async()=>{
 for(const kind of ['native-exact','lease-current','commit'] as const){const h=setup();
  if(kind==='native-exact')h.chart.isInputExact.mockImplementation(()=>{h.state.current=false;return true;});
  if(kind==='lease-current')h.lease.isCurrent.mockImplementation(()=>{h.state.current=false;return true;});
  if(kind==='commit')h.lease.commit.mockImplementation(()=>{h.events.push('commit');h.state.current=false;});
  await expect(h.run()).rejects.toThrow(/cancelled|superseded/);expect(h.lease.seal).not.toHaveBeenCalled();
  if(kind==='native-exact'){expect(h.chart.captureHistoricalFrame).not.toHaveBeenCalled();expect(h.chart.prepareConfigurationEdit).not.toHaveBeenCalled();}else expect(h.lease.rollback).toHaveBeenCalledOnce();
 }
});

it('placement advancing to a newly accepted row re-proves its runtime context and placement before capture',async()=>{
 const h=setup();h.chart.waitForAnalysisPlacement.mockImplementationOnce(async()=>{h.events.push('placement-old');h.state.accepted=h.second;h.state.latest={input:h.second,executionIdentity:'ordinary'};});const pending=h.run();await vi.advanceTimersByTimeAsync(20);await pending;
 expect(h.chart.waitForAnalysisPlacement).toHaveBeenCalledTimes(2);expect(h.contexts).toContain(100);expect(h.contexts.at(-1)).toBe(101);expect(h.events).not.toContain('capture:100');expect(h.events).toContain('capture:101');expect(h.lease.commit).toHaveBeenCalledOnce();
});

it('a prepared native lease can finish with future live bars queued without waiting for impossible held-queue runtime currentness',async()=>{
 const h=setup();h.chart.prepareConfigurationEdit.mockImplementation(async()=>{h.events.push('prepare');h.state.held=true;h.state.latest={input:h.second,executionIdentity:'ordinary'};return h.lease;});h.lease.seal.mockImplementation(()=>{h.events.push('seal');h.state.held=false;h.state.accepted=h.second;});
 await h.run();expect(h.events).toEqual(['placement','capture:100','prepare','commit','seal']);expect(h.lease.rollback).not.toHaveBeenCalled();expect(h.chart.captureHistoricalFrame).toHaveBeenCalledOnce();
});

it('installed nonempty bindings follow the newest accepted exact input while preserving full runtime and placement checks',async()=>{
 const h=setup(true);h.state.accepted=h.second;h.state.latest={input:h.second,executionIdentity:'ordinary'};await h.run();expect(h.runtime.prepareBindings).not.toHaveBeenCalled();expect(h.runtime.configurationStatus).toHaveBeenCalled();expect(h.contexts.every(value=>value===101)).toBe(true);expect(h.chart.waitForAnalysisPlacement).toHaveBeenCalledOnce();expect(h.events).toContain('capture:101');expect(h.lease.commit).toHaveBeenCalledOnce();
});

it('a candidate rejected by its second native proof cannot leave a stale runtime expectation attached to the old accepted row',async()=>{
 const h=setup();h.state.accepted=h.second;h.state.latest={input:h.second,executionIdentity:'ordinary'};let exactCalls=0;
 h.chart.isInputExact.mockImplementation((input:ChartInputSnapshot)=>{exactCalls++;if(exactCalls===2){h.state.accepted=h.first;h.state.latest={input:h.first,executionIdentity:'ordinary'};return false;}return input.bars===h.state.accepted.bars;});
 const pending=h.run();await vi.advanceTimersByTimeAsync(20);await pending;expect(h.contexts.every(value=>value===100)).toBe(true);expect(h.events).toContain('capture:100');expect(h.events).not.toContain('capture:101');expect(h.lease.commit).toHaveBeenCalledOnce();
});
