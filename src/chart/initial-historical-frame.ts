import type {ChartController} from './adapter';
import type {ChartInputSnapshot} from './input-visibility';
import type {HistoricalChartFrame} from './historical-frame';
import type {ScriptBindingRuntime,ScriptConfigurationContext,ScriptExpectedCalculation} from '../ui/script-binding-runtime';
import type {ScriptBinding} from '../ui/script-library';
import {calculationBarsForStyle} from './calculation-bars';
import {isDerivedStyle} from './derived/common';
import {derivedCalculationOptions,sourceTickSize} from './adapter';
import {scriptExecutionIdentity} from '../ui/script-input';
import {liveLineageOf,sameBarsInput} from './bar-input-identity';
import {chartSourceContextKey} from './source-context';
/** Startup restoration is guarded by the actual native owner and exact accepted input. */
export async function restoreInitialHistoricalFrame(options:{chart:ChartController;runtime:ScriptBindingRuntime;input:ChartInputSnapshot;executionIdentity:string;bindings:ScriptBinding[];frame:HistoricalChartFrame;fingerprints:Record<string,string>;signal:AbortSignal;isCurrent:()=>boolean;readLatestAccepted?:()=>{input:ChartInputSnapshot;executionIdentity:string}|null}){
 const {chart,runtime,input,signal}=options,started=Date.now();let acceptedInput=input,expected:{identity:string;fixture:boolean;bars:readonly import('../domain/types').Bar[]}={identity:scriptExecutionIdentity(input.source,input.style,options.executionIdentity),fixture:input.source.fixture,bars:isDerivedStyle(input.style)?[]:calculationBarsForStyle(input.bars,input.style,derivedCalculationOptions(input.style,chart.getChartSettingsBook?.()?.[input.style],sourceTickSize(input.source),options.executionIdentity!=='ordinary'||input.source.datasetId.startsWith('live:')))};
 const check=()=>{if(signal.aborted||!options.isCurrent())throw Error('Historical frame initialization was cancelled or superseded');if(Date.now()-started>10000)throw Error('Historical frame initialization exceeded ten seconds');};
 const bounded=<T>(work:Promise<T>)=>new Promise<T>((resolve,reject)=>{let done=false;const finish=(error:unknown,value?:T)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);error?reject(error):resolve(value!);},cancel=()=>finish(Error('Historical frame initialization cancelled')),timer=setTimeout(()=>finish(Error('Historical frame initialization exceeded ten seconds')),Math.max(1,10000-(Date.now()-started)));signal.addEventListener('abort',cancel,{once:true});work.then(value=>finish(null,value),finish);if(signal.aborted)cancel();});
 const pause=()=>new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(Error('Historical frame initialization cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},20);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
 let calculation:ReturnType<ChartController['captureScriptCalculationInput']>=null;
 if(isDerivedStyle(input.style)){for(;;){check();if(chart.isInputCurrent(input)){calculation=chart.captureScriptCalculationInput({input,execution:options.executionIdentity});check();if(calculation&&calculation.isCurrent())break;}await pause();}expected={identity:expected.identity,fixture:expected.fixture,bars:calculation!.bars};}
 const checkCalculation=()=>{check();if(calculation&&!calculation.isCurrent())throw Error('Historical frame calculation input was retired.');};
 checkCalculation();const installed=new Set(chart.scripts.configurationSnapshot().map(row=>row.id)),missingBindings=options.bindings.some(row=>!installed.has(row.id));
 // Ordinary live growth may advance while the one pending frame restoration
 // waits. Use only genuine panel acknowledgements, never raw future bars. The
 // missing-handle gate separately proves the Runtime's exact native input.
 const followLive=options.executionIdentity==='ordinary'&&!isDerivedStyle(input.style)&&!!liveLineageOf(input.bars)&&!!options.readLatestAccepted,sourceKey=chartSourceContextKey(input.source);
 const nativeAccepted=(candidate:ChartInputSnapshot)=>{
  checkCalculation();if(chart.getExecutionIdentity()!==options.executionIdentity)throw Error('Historical frame execution was replaced.');checkCalculation();
  if(!chart.isInputCurrent(candidate))return false;checkCalculation();if(!chart.isInputExact(candidate))return false;checkCalculation();
  if(chart.getExecutionIdentity()!==options.executionIdentity)throw Error('Historical frame execution was replaced.');checkCalculation();return true;
 };
 const refreshAccepted=()=>{
  checkCalculation();const latest=options.readLatestAccepted!();checkCalculation();if(!latest)return false;const candidate=latest.input;
  if(latest.executionIdentity!==options.executionIdentity||candidate.style!==input.style||chartSourceContextKey(candidate.source)!==sourceKey||!sameBarsInput(candidate.bars,input.bars))throw Error('Historical frame accepted input was replaced.');
  if(!nativeAccepted(candidate))return false;
  const nextExpected=candidate.bars!==acceptedInput.bars?{identity:scriptExecutionIdentity(candidate.source,candidate.style,options.executionIdentity),fixture:candidate.source.fixture,bars:calculationBarsForStyle(candidate.bars,candidate.style,derivedCalculationOptions(candidate.style,chart.getChartSettingsBook?.()?.[candidate.style],sourceTickSize(candidate.source),candidate.source.datasetId.startsWith('live:')))}:expected;
  checkCalculation();if(!nativeAccepted(candidate))return false;acceptedInput=candidate;expected=nextExpected;return true;
 };
 if(missingBindings){
  const identity=expected.identity,fixture=expected.fixture,style=input.style,execution=options.executionIdentity,bindingsKey=JSON.stringify(options.bindings);
  const capture=(context?:ScriptConfigurationContext)=>{
   const owner=context?.csvJobOwner,candidate=owner?.input;if(!context||!owner||!candidate)return null;const rawBars=candidate.bars;
   const basis=()=>context.csvJobOwner===owner&&owner.input===candidate&&candidate.bars===rawBars&&candidate.style===style&&owner.execution===execution&&context.identity===identity&&context.fixture===fixture&&JSON.stringify(context.bindings)===bindingsKey&&JSON.stringify(options.bindings)===bindingsKey&&chartSourceContextKey(candidate.source)===sourceKey&&sameBarsInput(rawBars,input.bars);
   // Once installed, this Runtime gate belongs to its chart/input/bindings,
   // independently of the old frame request's cancellation or deadline.
   const owned=()=>{if(!basis())return false;for(const binding of options.bindings){owner.assertCurrent(binding);if(!basis())return false;}return true;};
   const current=()=>{if(!owned())return false;const run=chart.getExecutionIdentity();if(!owned()||run!==execution)return false;const exact=chart.isInputExact(candidate);if(!owned()||!exact)return false;const accepted=chart.isInputCurrent(candidate);if(!owned()||!accepted)return false;const after=chart.getExecutionIdentity();return owned()&&after===execution;};
   try{
    if(!current())return null;
    const bars=calculationBarsForStyle(rawBars,style,derivedCalculationOptions(style,chart.getChartSettingsBook?.()?.[style],sourceTickSize(candidate.source),candidate.source.datasetId.startsWith('live:')));
    if(!current())return null;let alive=true;return Object.freeze({bars,isCurrent(){if(!alive)return false;try{if(!current())alive=false;}catch{alive=false;}return alive;}});
   }catch{return null;}
  };
  const gate:ScriptExpectedCalculation|typeof expected=followLive?{kind:'accepted-calculation',identity,fixture,capture}:expected;
  const lease=runtime.prepareBindings(options.bindings,gate);lease.pauseAndCapture();try{lease.stage();lease.resume(true);}catch(error){try{lease.abandon('Initial saved script configuration failed');}catch{/* Original error retained. */}throw error;}
 }
 for(;;){
  checkCalculation();if(followLive&&!refreshAccepted()){await pause();continue;}
  const attempt=acceptedInput,status=runtime.configurationStatus({...expected,bindings:options.bindings});checkCalculation();if(status.state==='error')throw Error('Saved script configuration unavailable: '+status.diagnostics.join('; '));if(status.state!=='ready'){await pause();continue;}
  await bounded(chart.waitForAnalysisPlacement());checkCalculation();
  if(followLive){if(!refreshAccepted()||acceptedInput.bars!==attempt.bars){await pause();continue;}const after=runtime.configurationStatus({...expected,bindings:options.bindings});checkCalculation();if(after.state==='error')throw Error('Saved script configuration unavailable: '+after.diagnostics.join('; '));if(after.state!=='ready'){await pause();continue;}}
  if(!chart.isInputCurrent(acceptedInput))throw Error('Historical frame input changed before native restore');checkCalculation();
  const captured=chart.captureHistoricalFrame({expected:acceptedInput,calculationFingerprints:options.fingerprints});checkCalculation();
  if(followLive){if(!refreshAccepted()||acceptedInput.bars!==attempt.bars){await pause();continue;}const after=runtime.configurationStatus({...expected,bindings:options.bindings});checkCalculation();if(after.state==='error')throw Error('Saved script configuration unavailable: '+after.diagnostics.join('; '));if(after.state!=='ready'){await pause();continue;}}
  if(JSON.stringify(captured)===JSON.stringify(options.frame))return;
  const work=chart.prepareConfigurationEdit({expected:{source:acceptedInput.source,style:acceptedInput.style},kind:'frame',frame:options.frame,calculationFingerprints:options.fingerprints});let edit:Awaited<typeof work>;try{edit=await bounded(work);}catch(error){void work.then(late=>late.rollback()).catch(cleanup=>console.error('Retired initial frame cleanup was incomplete: '+String(cleanup)));throw error;}
  // Once prepared, its native lease owns admission. Queued future live bars
  // must not turn the held market queue into another runtime-readiness wait.
  let sealing=false;try{check();if(followLive&&(chart.getExecutionIdentity()!==options.executionIdentity||!chart.isInputOwned(acceptedInput)))throw Error('Historical frame prepared owner was replaced.');check();if(!edit.isCurrent())throw Error('Historical frame preparation was superseded.');check();edit.commit();check();sealing=true;edit.seal();return;}catch(error){if(!sealing)try{await bounded(edit.rollback());}catch(rollback){throw new AggregateError([error,rollback],'Historical frame preparation failed and recovery was incomplete');}throw error;}
 }
}
