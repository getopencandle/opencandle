import {isAlpacaSyntheticStub,ALPACA_STUB_PROVIDER_NAME} from '../domain/alpaca-live';
import type {ChartSourceContext} from './source-context';
declare const __LV_SYNTHETIC_SEASONALITY_TRACE__:boolean;
/** Diagnostic logging ONLY. The actual caller has already selected its genuine
 * daily source. This opaque token cannot admit/read/resolve or revive a source. */
export interface SeasonalityDiagnosticTrace {readonly diagnosticOnly?:never}
type Event='plan'|'reserve'|'group-attached'|'window-ready'|'frame-null'|'source-ready'|'source-fail'|'presentation-pending'|'job-resume'|'consume-pending'|'fail-paint'|'published'|'job-retire'|'await-settlement';
const tokens=new WeakMap<object,SeasonalityDiagnosticTrace>(),counts=new WeakMap<SeasonalityDiagnosticTrace,{sequence:number}>();
const enabled=typeof __LV_SYNTHETIC_SEASONALITY_TRACE__!=='undefined'&&__LV_SYNTHETIC_SEASONALITY_TRACE__===true;
export function captureSeasonalityDiagnosticTrace(model:object,context:ChartSourceContext):SeasonalityDiagnosticTrace|null{
 if(!enabled||!isAlpacaSyntheticStub())return null;
 const dataset=Object.getOwnPropertyDescriptor(context,'datasetId'),label=Object.getOwnPropertyDescriptor(context,'label');
 if(!dataset||!('value'in dataset)||typeof dataset.value!=='string'||!dataset.value.startsWith('live:alpaca-stub:')||!label||!('value'in label)||label.value!==ALPACA_STUB_PROVIDER_NAME)return null;
 let token=tokens.get(model);if(!token){token=Object.freeze({});tokens.set(model,token);counts.set(token,{sequence:0});}return token;
}
export function seasonalityDiagnosticToken(model:object):SeasonalityDiagnosticTrace|null{return enabled?tokens.get(model)??null:null;}
export function traceSeasonalityDiagnostic(token:SeasonalityDiagnosticTrace|null|undefined,event:Event,count0=0,count1=0,flag=false):void{
 if(!enabled||!token||!isAlpacaSyntheticStub())return;const state=counts.get(token);if(!state||state.sequence>=64)return;
 // Only fixed primitive fields reach console; never log object/exception text,
 // identifiers, rows, source/proof handles or values. Failure cannot affect work.
 state.sequence++;try{console.debug('LV_SYNTHETIC_SEASONALITY_TRACE',JSON.stringify({event,sequence:state.sequence,count0:Number.isSafeInteger(count0)?count0:0,count1:Number.isSafeInteger(count1)?count1:0,flag:flag===true}));}catch{/* Logging never changes the observed branch or scheduling. */}
}
