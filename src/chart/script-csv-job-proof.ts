import {claimScriptRequestJobReceipt,assertScriptRequestJobExport,type ScriptRequestJobReceipt} from '../ui/script-request-export-proof';
import {scriptExecutionIdentity} from '../ui/script-input';
import type {ChartInputSnapshot} from './input-visibility';
import type {Bar} from '../domain/types';
import type {ScriptBinding} from '../ui/script-library';
import {prepareChartCsvSource,chartCsvSourceRow} from './chart-csv-source';
import {snapshotSourceKey} from './snapshot-scene';

/** Renderer-only job authority. Neither a structural token nor descriptive script metadata grants export permission. */
export interface ScriptCsvJobProof {readonly opaque?:never}
export interface ScriptCsvJobOwner {input:ChartInputSnapshot;execution:string;assertCurrent(binding:ScriptBinding):void}
interface Proof {dependency:ScriptRequestJobReceipt|null;owner:ScriptCsvJobOwner;binding:ScriptBinding;execution:string;assertOwner:()=>void;sourceKey:string;rows:readonly Bar[];source:Float64Array;consumed:readonly Bar[];calculation:Float64Array;accepted:boolean}
const jobs=new WeakMap<ScriptCsvJobProof,Proof>(),results=new WeakMap<object,ScriptCsvJobProof>(),models=new WeakMap<object,{result:object;proof:ScriptCsvJobProof}>();
const unavailable=()=>Error('Script results do not have a current accepted calculation input. Wait for recalculation before exporting chart plots.');
export function scriptCsvBindingKey(binding:ScriptBinding):string{return JSON.stringify([binding.id,binding.source,binding.version,binding.documentId,binding.inputs??null]);}
export function scriptCsvJobOwnerKey(owner:ScriptCsvJobOwner|undefined):string|null{return owner?JSON.stringify([snapshotSourceKey(owner.input.source,owner.input.style),owner.execution]):null;}
function snapshot(rows:readonly Bar[]):Float64Array{const values=new Float64Array(rows.length*6);for(let index=0;index<rows.length;index++){const row=chartCsvSourceRow(rows,index);for(let field=0;field<6;field++){const value=row[field];if(typeof value!=='number'||!Number.isFinite(value)&&!(field===5&&Number.isNaN(value)))throw unavailable();values[index*6+field]=value;}}return values;}
function unchanged(rows:readonly Bar[],values:Float64Array):void{if(rows.length*6!==values.length)throw unavailable();for(let index=0;index<rows.length;index++){const row=chartCsvSourceRow(rows,index);for(let field=0;field<6;field++)if(!Object.is(row[field],values[index*6+field]))throw unavailable();}}
function current(proof:Proof):void{
 proof.assertOwner();
 if(proof.owner.execution!==proof.execution||proof.owner.input.bars!==proof.rows||snapshotSourceKey(proof.owner.input.source,proof.owner.input.style)!==proof.sourceKey)throw unavailable();
 unchanged(proof.rows,proof.source);unchanged(proof.consumed,proof.calculation);proof.assertOwner();
}
/** Failure to acquire export authority never blocks an otherwise valid script calculation. */
export function captureScriptCsvJobProof(owner:ScriptCsvJobOwner|undefined,binding:ScriptBinding,consumed:readonly Bar[]):ScriptCsvJobProof|null{
 if(!owner)return null;
 try{
  owner.assertCurrent(binding);prepareChartCsvSource(owner.input,owner.execution);
  if(consumed.length>5000)return null; // The existing script execution limit, unchanged.
  const capturedBinding=structuredClone(binding),assert=owner.assertCurrent;
  const proof:Proof={dependency:null,owner,binding:capturedBinding,execution:owner.execution,assertOwner:()=>assert.call(owner,capturedBinding),sourceKey:snapshotSourceKey(owner.input.source,owner.input.style),rows:owner.input.bars,source:snapshot(owner.input.bars),consumed,calculation:snapshot(consumed),accepted:false};
  current(proof);const token=Object.freeze({});jobs.set(token,proof);return token;
 }catch{return null;}
}
/** Runtime stages the exact response before native add/update; authority activates only after owned acceptance. */
export function stageScriptCsvJobResult(result:object,token:ScriptCsvJobProof|null,dependencyReceipt?:ScriptRequestJobReceipt):void{if(!token)return;const proof=jobs.get(token);if(!proof)throw unavailable();current(proof);proof.dependency=claimScriptRequestJobReceipt(result,dependencyReceipt);results.set(result,token);}
export function acceptScriptCsvJobProof(token:ScriptCsvJobProof|null):void{if(!token)return;const proof=jobs.get(token);if(!proof)throw unavailable();current(proof);proof.accepted=true;}
/** The port preserves private authority across its own value clones and opaque checkpoints. */
export function inheritScriptCsvJobResult(copy:object,original:object):void{const token=results.get(original);if(token)results.set(copy,token);}
export function bindScriptCsvJobModel(model:object,result:object):void{models.delete(model);const token=results.get(result);if(token)models.set(model,{result,proof:token});}
export function retireScriptCsvJobModel(model:object):void{models.delete(model);}
export function assertScriptCsvJobModel(model:object,result:object,input:ChartInputSnapshot,execution:string,bindingId:string):void{
 const accepted=models.get(model),proof=accepted&&jobs.get(accepted.proof);
 if(!accepted||accepted.result!==result||!proof?.accepted||proof.binding.id!==bindingId||proof.execution!==execution||proof.sourceKey!==snapshotSourceKey(input.source,input.style)||input.bars!==proof.rows)throw unavailable();
 current(proof);
}

/** Request permission belongs to this exact accepted job, independent of today's resolver or loaded sources. */
export function assertScriptCsvJobDependencies(model:object,result:object,declarations:unknown):boolean{
 const accepted=models.get(model),proof=accepted&&jobs.get(accepted.proof);if(!accepted||accepted.result!==result||!proof?.accepted)throw Error('This script requests additional data whose accepted export permission is unavailable.');current(proof);
 return assertScriptRequestJobExport(proof.dependency,{source:proof.binding.source,inputs:proof.binding.inputs??null,identity:scriptExecutionIdentity(proof.owner.input.source,proof.owner.input.style,proof.execution),bars:proof.consumed,primary:proof.owner.input.source},declarations);
}
