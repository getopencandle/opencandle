import type {Bar,BarDataset} from '../domain/types';
import type {ChartController} from './adapter';
import type {PreparedAnalysisLease} from './analysis-transaction';
import type {MultiChartState,MultiChartTransactionCoordinator} from '../ui/MultiChartGrid';
import type {ScriptBindingRuntime,ScriptConfigurationContext} from '../ui/script-binding-runtime';
import {cellSessionDataset} from './cell-session';
import {sourceContextForDataset,chartSourceContextKey} from './source-context';
import {barInputIdentity,isLiveInputIdentity} from './bar-input-identity';
import {calculationBarsForStyle} from './calculation-bars';
import {isDerivedStyle} from './derived/common';
import {derivedCalculationOptions,sourceTickSize} from './adapter';
import {scriptExecutionIdentity} from '../ui/script-input';
import {createFrameFingerprintCalculator} from '../ui/frame-fingerprints';
import {serializeAppearance} from '../ui/themes';
export type GridAnalysisRequest=Parameters<MultiChartTransactionCoordinator['apply']>[0];
function failureText(value:unknown):string{try{return String(value);}catch{return 'Failure details are unavailable.';}}
export function exactGridDataset(state:MultiChartState,cellId:string,datasets:readonly BarDataset[]):BarDataset{const cell=state.cells[cellId],layout=state.layout.cells.find(row=>row.id===cellId);if(!cell||!layout)throw new Error('Unknown analysis chart');const candidates=datasets.filter(dataset=>dataset.provenance.datasetId===cell.datasetId&&dataset.instrument.symbol===layout.symbol&&dataset.resolution===layout.interval);if(candidates.length!==1)throw new Error('Analysis source is missing or ambiguous for chart '+cellId);return cellSessionDataset(candidates[0],cell);}
export function createGridAnalysisCoordinator(port:{read:()=>{state:MultiChartState;datasets:BarDataset[]};controller:(id:string)=>ChartController|null;runtime:(id:string)=>ScriptBindingRuntime|null;pending:(active:boolean,ids:string[])=>void;holdLinks:()=>{release:()=>void};preparedInputs:(state:MultiChartState,inputs:Map<string,{dataset:BarDataset;bars:Bar[]}>)=>void;failed:(ids:string[],message:string)=>void}):Pick<MultiChartTransactionCoordinator,'inventory'|'apply'>{
 let busy=false;const calculateFingerprints=createFrameFingerprintCalculator();
 return{inventory(cellId){const chart=port.controller(cellId);if(!chart)throw new Error('Chart controller is not ready');return chart.getAnalysisPaneInventory();},async apply(request:GridAnalysisRequest){
  if(busy)throw new Error('A grid analysis transaction is already active');const current=port.read();if(!request.assertCurrent()||JSON.stringify(current.state)!==JSON.stringify(request.expectedState))throw new Error('Workspace changed before analysis application');const ids=request.expectedState.layout.cells.map(row=>row.id);if(ids.length!==request.nextState.layout.cells.length||ids.some(id=>!request.nextState.cells[id]||!request.nextState.layout.cells.some(row=>row.id===id)))throw new Error('Atomic analysis restore with added or removed chart cells is unavailable');
  const desired=request.nextDatasets??current.datasets,prepared=ids.map(id=>{const chart=port.controller(id),runtime=port.runtime(id);if(!chart||!runtime)throw new Error('Chart or script runtime is not ready: '+id);const before=exactGridDataset(request.expectedState,id,current.datasets),next=exactGridDataset(request.nextState,id,desired),oldBars=id===request.expectedState.layout.activeCellId&&request.activeBars?request.activeBars:before.bars,nextBars=id===request.nextState.layout.activeCellId&&request.nextActiveBars?request.nextActiveBars:next.bars,cell=request.nextState.cells[id],source=sourceContextForDataset(next,nextBars),style=cell.style,execution=id===request.nextState.layout.activeCellId?request.nextExecutionIdentity??'ordinary':'ordinary',sourceKey=chartSourceContextKey(source),inputIdentity=barInputIdentity(nextBars),identity=scriptExecutionIdentity(source,style,execution),fixture=source.fixture,configurationKey=(state:MultiChartState)=>{const saved=state.cells[id],layout=state.layout.cells.find(row=>row.id===id);return JSON.stringify([saved?.datasetId,saved?.session,saved?.style,saved?.chartTypeSettings?.[style]??null,saved?.scriptBindings??[],layout?.symbol,layout?.interval]);},preparedConfiguration=configurationKey(request.nextState),bindingsKey=JSON.stringify(cell.scriptBindings??[]);
   const captureLive=(context?:ScriptConfigurationContext)=>{
    const owner=context?.csvJobOwner,input=owner?.input;if(!context||!owner||!input)return null;const rawBars=input.bars;
    const basis=()=>modelCommitted&&port.controller(id)===chart&&port.runtime(id)===runtime&&configurationKey(port.read().state)===preparedConfiguration&&context.csvJobOwner===owner&&owner.input===input&&input.bars===rawBars&&input.style===style&&owner.execution===execution&&context.identity===identity&&context.fixture===fixture&&JSON.stringify(context.bindings)===bindingsKey&&chartSourceContextKey(input.source)===sourceKey&&barInputIdentity(rawBars)===inputIdentity;
    const current=()=>{if(!basis())return false;const exact=chart.isInputExact(input);if(!basis()||!exact)return false;const accepted=chart.isInputCurrent(input);if(!basis()||!accepted)return false;const run=chart.getExecutionIdentity();return basis()&&run===execution;};
    try{if(!current())return null;const bars=calculationBarsForStyle(rawBars,style);if(!current())return null;let alive=true;return Object.freeze({bars,isCurrent(){if(!alive)return false;try{if(!current())alive=false;}catch{alive=false;}return alive;}});}catch{return null;}
   };return{id,chart,runtime,before,next,oldBars,nextBars,cell,source,scriptLease:runtime.prepareBindings(cell.scriptBindings??[],isDerivedStyle(cell.style)?{kind:'accepted-calculation' as const,identity:scriptExecutionIdentity(source,cell.style,id===request.nextState.layout.activeCellId?request.nextExecutionIdentity??'ordinary':'ordinary'),fixture:source.fixture,capture:()=>{if(!modelCommitted||port.controller(id)!==chart||port.runtime(id)!==runtime)return null;return chart.captureScriptCalculationInput({input:{source,bars:nextBars,style:cell.style},execution:id===request.nextState.layout.activeCellId?request.nextExecutionIdentity??'ordinary':'ordinary'});}}:execution==='ordinary'&&isLiveInputIdentity(inputIdentity)?{kind:'accepted-calculation' as const,identity:scriptExecutionIdentity(source,cell.style,execution),fixture:source.fixture,capture:captureLive}:{identity:scriptExecutionIdentity(source,cell.style,id===request.nextState.layout.activeCellId?request.nextExecutionIdentity??'ordinary':'ordinary'),fixture:source.fixture,bars:calculationBarsForStyle(nextBars,cell.style,derivedCalculationOptions(cell.style,cell.chartTypeSettings?.[cell.style],sourceTickSize(source),(id===request.nextState.layout.activeCellId?request.nextExecutionIdentity??'ordinary':'ordinary')!=='ordinary'||source.datasetId.startsWith('live:')))}),comparisons:cell.comparisons.map(({datasetId,...settings})=>{const matches=desired.filter(dataset=>dataset.provenance.datasetId===datasetId);if(matches.length!==1)throw new Error('Comparison source is missing or ambiguous');return{...settings,dataset:matches[0]};})};});
  busy=true;const leases:Array<{id:string;lease:PreparedAnalysisLease}>=[];let links:{release:()=>void}|null=null,modelCommitted=false,pendingStarted=false,error:unknown=null;const publicationErrors:string[]=[],recoveryErrors:unknown[]=[];
  const report=(cells:string[],message:string)=>{try{port.failed(cells,message);}catch(failure){if(modelCommitted)publicationErrors.push('Committed chart diagnostic publication failed: '+failureText(failure));else recoveryErrors.push(failure);}};
  const assertPrepared=()=>{
   if(!request.assertCurrent())throw new Error('Prepared analysis request was superseded before model commit');
   for(const {lease}of leases){if(!lease.isCurrent())throw new Error('Prepared analysis chart was superseded before model commit');if(!request.assertCurrent())throw new Error('Prepared analysis request was superseded during ownership checks');}
  };
  try{
   links=port.holdLinks();pendingStarted=true;port.pending(true,ids);
   for(const row of prepared){const fingerprints=row.cell.frame?await calculateFingerprints(row.cell,desired):undefined;if(!request.assertCurrent())throw new Error('Workspace changed during analysis staging');const lease=await row.chart.prepareAnalysisSnapshot({expected:{source:sourceContextForDataset(row.before,row.oldBars),bars:row.oldBars,style:request.expectedState.cells[row.id].style},next:{source:row.source,bars:row.nextBars,style:row.cell.style},analysis:{drawings:row.cell.drawings,indicators:row.cell.indicators,appearance:serializeAppearance(row.cell.appearance),chartOptions:row.cell.chartOptions,chartTypeSettings:row.cell.chartTypeSettings??{},comparisons:row.comparisons,viewport:row.cell.viewport,frame:row.cell.frame},scripts:row.scriptLease,calculationFingerprints:fingerprints});leases.push({id:row.id,lease});}
   assertPrepared();for(const {lease}of leases){lease.commit();assertPrepared();}
   const cells={...request.nextState.cells};for(const row of prepared){
    const drawings=row.chart.saveDrawings();assertPrepared();
    const indicators=row.chart.indicators.serialize();assertPrepared();
    cells[row.id]={...row.cell,drawings,indicators};
   }
   request.nextState.cells=cells;
   port.preparedInputs(request.nextState,new Map(prepared.map(row=>[row.id,{dataset:row.next,bars:row.nextBars}])));assertPrepared();
   // Only the trusted caller's synchronous acknowledgement distinguishes an
   // accepted model from a fallible UI callback. A later throw cannot undo it.
   let accepting=true;
   try{request.commitModel(()=>{if(!accepting)throw Error('Grid analysis acceptance is retired.');if(modelCommitted)throw Error('Grid analysis model was already committed.');modelCommitted=true;});}finally{accepting=false;}
   if(!modelCommitted)throw Error('Grid analysis model did not acknowledge acceptance.');
  }catch(failure){error=failure;if(modelCommitted){const message='Configuration committed, but final publication failed: '+failureText(failure);publicationErrors.push(message);report(ids,message);}else{for(const row of prepared)if(row.chart.getAnalysisUnavailable())report([row.id],row.chart.getAnalysisUnavailable());for(const {id,lease}of leases.reverse())try{await lease.rollback();}catch(rollback){recoveryErrors.push(rollback);report([id],failureText(rollback));}}}
  finally{
   if(modelCommitted)for(const {id,lease}of leases)try{lease.seal();}catch(failure){const message='Committed chart '+id+' publication failed: '+failureText(failure);publicationErrors.push(message);report([id],message);}
   const cleanup:unknown[]=[];if(links)try{links.release();}catch(failure){cleanup.push(failure);}if(pendingStarted)try{port.pending(false,ids);}catch(failure){cleanup.push(failure);}busy=false;if(cleanup.length){const message='Analysis transaction cleanup failed: '+cleanup.map(failureText).join('; ');if(modelCommitted)publicationErrors.push(message);else recoveryErrors.push(...cleanup);report(ids,message);}}
  if(modelCommitted)return{publicationErrors};if(recoveryErrors.length)throw new AggregateError([error,...recoveryErrors].filter(value=>value!==null),'Grid analysis failed and recovery or cleanup was incomplete');if(error)throw error;throw new Error('Analysis transaction did not commit');
 }};
}
