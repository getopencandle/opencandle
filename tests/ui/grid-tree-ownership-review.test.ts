import {expect,it,vi} from 'vitest';
import {createGridTreeCoordinator} from '../../src/chart/grid-tree-coordinator';
import {createMultiChartState,type GridTreeInput} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';
// Root review of exact native identity and cancellation across asynchronous
// placement. Controlled native ports, not an executable GUI claim.
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>resolve=yes);return{promise,resolve};}
function fixture(){
 const dataset=fixtureDataset('GME',3),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),input:GridTreeInput={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary'},source=sourceContextForDataset(dataset),id=state.layout.activeCellId;
 const entered=deferred(),placement=deferred(),hold={isCurrent:()=>true,resume:vi.fn(),retire:vi.fn(),dispose:vi.fn()};
 const original={isInputCurrent:()=>true,waitForAnalysisPlacement:vi.fn(()=>{entered.resolve();return placement.promise;}),saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},suspendTree:vi.fn(()=>hold),dispose:vi.fn()};let chart=original;
 const runtime={prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},resume(){},rollback(){},abandon(){}}),configurationStatus:()=>({state:'ready',calculations:'pending',diagnostics:[]})};
 const coordinator=createGridTreeCoordinator({read:()=>input,alive:()=>true,staging:()=>true,controller:()=>chart as any,runtime:()=>runtime as any,cell:()=>({input:{bars:dataset.bars,source,style:'candles'},settled:true,error:''}),holdLinks:()=>({release(){}}),pending:()=>{},failed:()=>{},canonical:()=>{}});
 return{input,coordinator,original,entered,placement,hold,id,replace(){chart={...original,suspendTree:vi.fn(()=>hold)};return chart;}};
}
it('native controller replacement during placement cannot authorize canonical state from another chart',async()=>{
 const s=fixture(),pending=s.coordinator.waitUntilReady(s.input,new AbortController().signal);await s.entered.promise;const replacement=s.replace();s.placement.resolve();let accepted:any;
 try{await expect(pending.then(value=>{accepted=value;return value;})).rejects.toThrow(/changed|superseded|owner|retired/i);expect(replacement.suspendTree).not.toHaveBeenCalled();}finally{accepted?.dispose();}
});
it('an old hold becomes stale when a replacement native controller appears under identical model props',()=>{
 const s=fixture(),hold=s.coordinator.suspend(s.input);s.replace();try{expect(hold.isCurrent()).toBe(false);}finally{hold.dispose();}
});
it('cancellation does not wait for an unresponsive native placement promise',async()=>{
 const s=fixture(),abort=new AbortController(),pending=s.coordinator.waitUntilReady(s.input,abort.signal);await s.entered.promise;abort.abort();let timer:ReturnType<typeof setTimeout>|undefined;
 try{const result=await Promise.race([pending.then(()=> 'accepted',error=>String(error)),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve('timeout'),250);})]);expect(result).toMatch(/cancel|abort|retired/i);}finally{if(timer)clearTimeout(timer);s.placement.resolve();await pending.catch(()=>{});}
});
