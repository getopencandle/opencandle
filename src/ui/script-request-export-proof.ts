import {rawLiveSessionSource} from '../domain/live-session-source';
import type {Bar,BarDataset} from '../domain/types';
import type {ScriptRequestBase,ScriptRequestDeclaration,ScriptRequestRow,ScriptRequestSeries,ResolvedScriptRequests} from './script-requests';
import {sourceContextForDataset,validateChartSourceBasisIdentity,type ChartSourceContext} from '../chart/source-context';
import {isLiveDatasetId,isLicensedLiveProviderId} from '../domain/live-provider';

/** Renderer-only authority; copying a visible object never copies its private association. */
export interface ScriptRequestOrigin {readonly opaque?:never}
export interface ScriptRequestExportReceipt {readonly opaque?:never}
export interface ScriptRequestJobReceipt {readonly opaque?:never}
type Permission='allowed'|'live'|'unknown';
interface SourceFacts {basis:string;revision:string;label:string;provider:string;dataset:string;resolution:string;permission:Permission}
interface Origin {facts:SourceFacts;assertCurrent():void}
interface SeriesEvidence {origin:Origin;output:SourceFacts;assertCurrent():void}
interface RowProof {id:string;rows:readonly (ScriptRequestRow|null)[];values:Float64Array}
interface Receipt {declarations:string;base:ScriptRequestBase;permission:Permission;map:ResolvedScriptRequests['rows'];rows:RowProof[];facts:Array<{origin:SourceFacts;output:SourceFacts}>}
interface Job {receipt:ScriptRequestExportReceipt;source:string;inputs:string;identity:string;bars:readonly Bar[]}
const origins=new WeakMap<ScriptRequestOrigin,Origin>(),seriesEvidence=new WeakMap<object,SeriesEvidence>(),receipts=new WeakMap<ScriptRequestExportReceipt,Receipt>(),resolvedReceipts=new WeakMap<object,ScriptRequestExportReceipt>(),jobs=new WeakMap<ScriptRequestJobReceipt,Job>(),responses=new WeakMap<object,ScriptRequestJobReceipt>();
const unavailable=()=>Error('This script requests additional data whose accepted export permission is unavailable. Wait for a current permitted calculation or remove it before exporting chart plots.');
function own(value:unknown,key:string,optional=false):any{if(!value||typeof value!=='object')throw unavailable();const field=Object.getOwnPropertyDescriptor(value,key);if(!field){if(optional)return undefined;throw unavailable();}if(!Object.hasOwn(field,'value'))throw unavailable();return field.value;}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value.length||value.length>max)throw unavailable();return value;}
function array(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)throw unavailable();for(let index=0;index<value.length;index++){const field=Object.getOwnPropertyDescriptor(value,String(index));if(!field?.enumerable||!Object.hasOwn(field,'value'))throw unavailable();}return value;}
function sourceFacts(dataset:BarDataset,original:boolean):SourceFacts{
 // Validate visible own descriptors first, then honor the private raw-view ownership before classifying permission.
 const source=sourceContextForDataset(dataset,own(dataset,'bars')),provenance=own(dataset,'provenance'),provider=own(provenance,'providerId'),id=source.datasetId,raw=rawLiveSessionSource(dataset),rawSource=raw===dataset?source:sourceContextForDataset(raw,own(raw,'bars')),rawProvider=own(own(raw,'provenance'),'providerId');
 const live=isLiveDatasetId(id)||isLicensedLiveProviderId(provider)||isLiveDatasetId(rawSource.datasetId)||isLicensedLiveProviderId(rawProvider);
 const derived='derivation' in dataset||provider==='lv-local-aggregation';
 const local=provider==='local-import'&&id.startsWith('local:');
 const synthetic=provider==='lv-synthetic-v1'&&source.fixture&&id.startsWith('lv-synthetic-v1:');
 return {basis:source.basisIdentity!,revision:source.revision,label:source.label,provider,dataset:id,resolution:source.resolution!,permission:live?'live':original&&!derived&&(local||synthetic)?'allowed':'unknown'};
}
/** Called before chooseIntervalSource can clone or replace source provenance. No history values are copied here. */
export function captureScriptRequestOrigin(dataset:BarDataset):ScriptRequestOrigin|null{
 try{const facts=sourceFacts(dataset,true),bars=own(dataset,'bars'),key=JSON.stringify(facts),token=Object.freeze({});origins.set(token,{facts,assertCurrent(){if(own(dataset,'bars')!==bars||JSON.stringify(sourceFacts(dataset,true))!==key)throw unavailable();}});return token;}catch{return null;}
}
/** Successful resolver return only. A plain/custom resolver result is never automatically promoted. */
export function retainScriptRequestSeriesEvidence(series:ScriptRequestSeries,dataset:BarDataset,token:ScriptRequestOrigin|null):void{
 if(!token)return;const origin=origins.get(token);if(!origin)return;
 try{origin.assertCurrent();const output=sourceFacts(dataset,false),key=JSON.stringify(output),bars=own(series,'bars'),resolution=own(series,'resolution'),ends=own(series,'ends',true),label=own(series,'label'),fixture=own(series,'fixture');if(bars!==own(dataset,'bars'))return;
  seriesEvidence.set(series,{origin,output,assertCurrent(){origin.assertCurrent();if(own(series,'bars')!==bars||own(series,'resolution')!==resolution||own(series,'ends',true)!==ends||own(series,'label')!==label||own(series,'fixture')!==fixture||own(dataset,'bars')!==bars||JSON.stringify(sourceFacts(dataset,false))!==key)throw unavailable();}});
 }catch{/* An export proof refusal never blocks normal resolver/calculation behavior. */}
}
function declarationKey(value:unknown):string{
 const seen=new Set<string>(),rows=array(value,4).map(row=>{const id=text(own(row,'id'),64),symbol=own(row,'symbol'),interval=own(row,'interval');if(seen.has(id)||!/^(?!__)[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(id))throw unavailable();seen.add(id);return [id,symbol===null?null:text(symbol,40),interval===null?null:text(interval,16)];});
 return JSON.stringify(rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
function baseCopy(value:ScriptRequestBase):ScriptRequestBase{
 const datasetId=text(own(value,'datasetId'),4096),resolution=own(value,'resolution'),session=own(value,'sessionOverride',true),source=own(value,'source',true);
 if(resolution!==null)text(resolution,4096);if(session!==undefined&&session!=='regular'&&session!=='extended')throw unavailable();
 let copiedSource:ChartSourceContext|undefined;
 if(source!==undefined){const fixture=own(source,'fixture'),override=own(source,'sessionOverride',true);if(typeof fixture!=='boolean'||override!==undefined&&override!=='regular'&&override!=='extended')throw unavailable();copiedSource={datasetId:text(own(source,'datasetId'),4096),revision:text(own(source,'revision'),4096),label:text(own(source,'label'),4096),fixture,resolution:text(own(source,'resolution'),4096),basisIdentity:validateChartSourceBasisIdentity(own(source,'basisIdentity')),...(override?{sessionOverride:override}:{})};}
 return {datasetId,resolution,...(session?{sessionOverride:session}:{}),...(copiedSource?{source:copiedSource}:{})};
}
function rowValues(row:unknown):number[]{if(row===null)return [NaN,0,0,0,0,0];return ['time','open','high','low','close','volume'].map((key,index)=>{const value=own(row,key);if(index===5&&value===null)return NaN;if(typeof value!=='number'||!Number.isFinite(value))throw unavailable();return value;});}
function rowProof(value:unknown,id:string):RowProof{const rows=array(value,5000) as Array<ScriptRequestRow|null>,values=new Float64Array(rows.length*6);for(let index=0;index<rows.length;index++){const current=rowValues(own(rows,String(index)));for(let field=0;field<6;field++)values[index*6+field]=current[field];}return {id,rows,values};}
function assertRows(proof:RowProof):void{if(proof.rows.length*6!==proof.values.length)throw unavailable();for(let index=0;index<proof.rows.length;index++){const values=rowValues(own(proof.rows,String(index)));for(let field=0;field<6;field++)if(!Object.is(values[field],proof.values[index*6+field]))throw unavailable();}}
/** Copies only actual aligned consumed rows, up to the existing four requests times five thousand bars. */
export function retainResolvedScriptRequestReceipt(result:ResolvedScriptRequests,declarations:readonly ScriptRequestDeclaration[],base:ScriptRequestBase,entries:readonly {id:string;series:ScriptRequestSeries}[]):void{
 try{const key=declarationKey(declarations),rows:RowProof[]=[],facts:Receipt['facts']=[];let permission:Permission='allowed';if(entries.length!==declarations.length)throw unavailable();
  for(const declaration of declarations){const entry=entries.find(row=>row.id===declaration.id),evidence=entry&&seriesEvidence.get(entry.series);if(evidence){evidence.assertCurrent();facts.push({origin:{...evidence.origin.facts},output:{...evidence.output}});if(evidence.origin.facts.permission==='live'||evidence.output.permission==='live')permission='live';else if(evidence.origin.facts.permission!=='allowed'&&permission!=='live')permission='unknown';}else if(permission!=='live')permission='unknown';rows.push(rowProof(own(result.rows,declaration.id),declaration.id));}
  const token=Object.freeze({});receipts.set(token,{declarations:key,base:baseCopy(base),permission,map:result.rows,rows,facts});resolvedReceipts.set(result,token);
 }catch{/* Unknown exportability leaves the existing calculation intact. */}
}
export function resolvedScriptRequestReceipt(result:ResolvedScriptRequests):ScriptRequestExportReceipt|null{return resolvedReceipts.get(result)??null;}
function assertReceiptRows(proof:Receipt):void{const keys=Reflect.ownKeys(proof.map);if(keys.length!==proof.rows.length||keys.some(key=>typeof key!=='string'||!proof.rows.some(row=>row.id===key)))throw unavailable();for(const row of proof.rows){if(own(proof.map,row.id)!==row.rows)throw unavailable();assertRows(row);}}
function inputKey(value:unknown):string{if(value===null||value===undefined)return 'null';if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw unavailable();const keys=Object.keys(value);if(keys.length>32)throw unavailable();return JSON.stringify(keys.sort().map(key=>{const item=own(value,key);if(!['string','boolean','number'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item)||typeof item==='string'&&item.length>200)throw unavailable();return [key,item];}));}
/** Associate only the exact accepted host response, after the job's existing abort checks. */
export function bindScriptRequestJobReceipt(result:object,receipt:ScriptRequestExportReceipt|null,context:{source:string;inputs:unknown;identity:string;bars:readonly Bar[]}):ScriptRequestJobReceipt|null{
 if(!receipt)return null;
 try{const proof=receipts.get(receipt);if(!proof||declarationKey(own(own(result,'declarations'),'requests'))!==proof.declarations)return null;assertReceiptRows(proof);const token=Object.freeze({});jobs.set(token,{receipt,source:context.source,inputs:inputKey(context.inputs),identity:context.identity,bars:context.bars});responses.set(result,token);return token;}catch{return null;}
}
export function claimScriptRequestJobReceipt(result:object,token:ScriptRequestJobReceipt|null|undefined):ScriptRequestJobReceipt|null{return token&&jobs.has(token)&&responses.get(result)===token?token:null;}
function sameBars(left:readonly Bar[],right:readonly Bar[]):void{if(left.length!==right.length||left.length>5000)throw unavailable();for(let index=0;index<left.length;index++)for(const key of ['time','open','high','low','close','volume']){const a=own(own(left,String(index)),key),b=own(own(right,String(index)),key);if(typeof a!=='number'||typeof b!=='number'||!Object.is(a,b))throw unavailable();}}
/** Export reads retained receipt facts and consumed rows only. Never consults any current resolver or loader. True when the
 * consumed rows came from live, FRED or licensed data, so the saved file states the provider terms. */
export function assertScriptRequestJobExport(token:ScriptRequestJobReceipt|null,context:{source:string;inputs:unknown;identity:string;bars:readonly Bar[];primary:ChartSourceContext},declarations:unknown):boolean{
 const job=token&&jobs.get(token),receipt=job&&receipts.get(job.receipt);if(!job||!receipt||job.source!==context.source||job.inputs!==inputKey(context.inputs)||job.identity!==context.identity||declarationKey(declarations)!==receipt.declarations)throw unavailable();
 const base=receipt.base,source=context.primary;if(base.datasetId!==source.datasetId||base.resolution!==source.resolution||base.sessionOverride!==source.sessionOverride||base.source&&(['datasetId','revision','label','fixture','resolution','basisIdentity','sessionOverride'] as const).some(key=>base.source![key]!==source[key]))throw unavailable();sameBars(job.bars,context.bars);assertReceiptRows(receipt);
 // Live requested rows export for personal analysis like the live chart source; unknown provenance stays refused.
 if(receipt.permission!=='allowed'&&receipt.permission!=='live')throw unavailable();return receipt.permission==='live';
}
