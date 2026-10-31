import {cellSessionOverride} from './cell-session';
import type {Bar,BarDataset} from '../domain/types';
import type {AlpacaSeasonalityDailyPlan} from '../domain/alpaca-live';
import {parseInterval,US_EQUITY_EXCHANGES} from '../domain/intervals';
import {alpacaSessionCompletionInputFacts,captureAlpacaSessionCompletion,captureAlpacaSessionSeasonalityDailyPlan,alpacaSeasonalitySessionInputValuesMatch} from '../domain/live-session-source';
import {captureReplayFrameCompletion,replayFrameCompletionInputMatches} from '../domain/replay-session';
import {barInputIdentity} from './bar-input-identity';
import {cloneMarketInput,marketInputCloneConsumedSourceMatches} from './bar-clone';
import {localCandleOriginFacts,captureLocalCandleOrigin,type LocalCandleOrigin,type LocalCandleAdmission} from '../domain/local-candle-origin';
export interface ChartSourceContext {datasetId:string;revision:string;fixture:boolean;label:string;resolution?:string;inputIdentity?:string;basisIdentity?:string;sessionOverride?:'regular'|'extended'}
const LOCAL_FIELDS=['datasetId','revision','fixture','label','resolution','inputIdentity','basisIdentity','sessionOverride'] as const;
interface LocalContextOrigin {original:WeakRef<BarDataset>;input:WeakRef<readonly Bar[]>|null;pins:readonly unknown[]}
const localContextOrigins=new WeakMap<object,LocalContextOrigin>();
// Fixed metadata only: these weak bindings never certify rows or completion by themselves.
const completionContexts=new WeakMap<object,LocalContextOrigin>();
function completionRecord(context:unknown):LocalContextOrigin|null{
 if(!context||typeof context!=='object')return null;const record=completionContexts.get(context);if(!record||!record.original.deref()||!record.input?.deref())return null;
 try{return sameLocalPins(context,record.pins)?record:null;}catch{return null;}
}
function retainCompletion(context:object,dataset:BarDataset,input:readonly Bar[]):void{try{completionContexts.set(context,{original:new WeakRef(dataset),input:new WeakRef(input),pins:localPins(context)});}catch{/* Optional fixed transport cannot change legacy construction. */}}
function retainCompletionCopy(source:ChartSourceContext,copy:object,inputIdentity?:string,input?:readonly Bar[]):void{
 const record=completionRecord(source),dataset=record?.original.deref(),rows=input??record?.input?.deref();if(!record||!dataset||!rows)return;const pins=[...record.pins];if(inputIdentity!==undefined){pins[10]=true;pins[11]=inputIdentity;}try{if(sameLocalPins(copy,pins))retainCompletion(copy,dataset,rows);}catch{}
}
/** Read-only exact constructor membership, never a resolver or attach operation. */
export function completionSourceInputMatches(context:unknown,expected:unknown):boolean{const record=completionRecord(context);return !!record&&record.input?.deref()===expected;}
export interface ClosedTimeframeContext {readonly rows:number;readonly completeRows:number;readonly coveredFrom:number;readonly closedThrough:number;assertCurrent():void}
/** Fixed source descriptors only; the real producer observation is captured AFTER shared admission. */
export function closedTimeframeContextFacts(context:ChartSourceContext):Readonly<{rows:number;sourceRows:number;resolution:string}>|null{
 const record=completionRecord(context),rows=record?.input?.deref();if(!record||!rows)return null;
 try{const length=Object.getOwnPropertyDescriptor(rows,'length'),basis=Object.getOwnPropertyDescriptor(context,'basisIdentity'),resolution=Object.getOwnPropertyDescriptor(context,'resolution');if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<1||length.value>100000||!basis||!Object.hasOwn(basis,'value')||typeof basis.value!=='string'||basis.value.length>8192||!resolution||!Object.hasOwn(resolution,'value')||typeof resolution.value!=='string')return null;
  const tuple=JSON.parse(basis.value);if(!Array.isArray(tuple)||tuple.length!==18||tuple[0]!==1||!['stock','etf'].includes(tuple[6])||typeof tuple[4]!=='string'||!US_EQUITY_EXCHANGES.has(tuple[4].toUpperCase())||tuple[7]!=='America/New_York'||tuple[12]!=='regular'||tuple[13]!=='America/New_York')return null;
  const producer=alpacaSessionCompletionInputFacts(record.original.deref()!,rows);if(producer&&(!Number.isSafeInteger(producer.sourceRows)||producer.sourceRows<length.value||producer.sourceRows>100000)||!producer&&!replayFrameCompletionInputMatches(rows,record.original.deref()!))return null;return Object.freeze({rows:length.value,sourceRows:producer?.sourceRows??length.value,resolution:resolution.value});
 }catch{return null;}
}
/** The expected original remains weak/private. No caller supplies an observation, clock or callback. */
export function captureClosedTimeframeContext(context:ChartSourceContext,expectedInput:readonly Bar[],execution:string):ClosedTimeframeContext|null{
 const record=completionRecord(context),dataset=record?.original.deref();if(!record||!dataset||record.input?.deref()!==expectedInput||!closedTimeframeContextFacts(context))return null;
 try{
  const replay=execution==='ordinary'?null:captureReplayFrameCompletion(expectedInput,dataset);
  if(execution!=='ordinary'&&(!replay||replay.execution!==execution))return null;
  const live=replay?null:captureAlpacaSessionCompletion(dataset,expectedInput);if(!replay&&!live)return null;
  const observation=replay??live!,rows=expectedInput.length,completeRows=replay?.completeRows??rows,coveredFrom=live?.coveredFrom??-Infinity,closedThrough=replay?.closedThrough??live!.coveredThrough;
  observation.assertCurrent();if(completionRecord(context)!==record)return null;
  const selected=new WeakRef(expectedInput);let alive=true;return Object.freeze({rows,completeRows,coveredFrom,closedThrough,assertCurrent(){if(!alive)throw Error('Calendar completion source retired.');try{if(completionRecord(context)!==record||record.input?.deref()!==selected.deref()||!selected.deref())throw Error('Calendar completion source retired.');observation.assertCurrent();}catch(error){alive=false;throw error;}}});
 }catch{return null;}
}


/** Original-bound observation only. The actual constructor's weak input is never resolved to callers. */
export function captureOriginalClosedTimeframeContext(context:ChartSourceContext,admittedRows:number,execution:string):ClosedTimeframeContext|null{
 const record=completionRecord(context),input=record?.input?.deref();if(!record||!input||!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>100000)return null;
 const observation=captureClosedTimeframeContext(context,input,execution);
 if(!observation||observation.rows!==admittedRows||completionRecord(context)!==record||record.input?.deref()!==input)return null;return observation;
}
/** Boolean equality only, not target ancestry/ownership. The closed consumer must already own the actual native
 * frame + required charge. Do not register/rebase a mutable grown array as a newly constructed clone. */
export function closedTimeframeInputValuesMatch(context:ChartSourceContext,currentInput:readonly Bar[],admittedRows:number):boolean{
 const record=completionRecord(context),expected=record?.input?.deref();if(!record||!expected||!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>100000)return false;
 const read=(owner:object,key:PropertyKey):unknown=>{const field=Object.getOwnPropertyDescriptor(owner,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Calendar input requires own data.');return field.value;};
 try{
  const facts=closedTimeframeContextFacts(context);if(!facts||facts.rows!==admittedRows)return false;
  for(const input of [expected,currentInput])if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype||read(input,'length')!==admittedRows)return false;
  for(let index=0;index<admittedRows;index++){
   const original=read(expected,String(index)),actual=read(currentInput,String(index));
   if(!original||typeof original!=='object'||!actual||typeof actual!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(original))||![Object.prototype,null].includes(Object.getPrototypeOf(actual)))return false;
   for(const key of ['time','open','high','low','close','volume']){const value=read(original,key),other=read(actual,key);if(typeof value!=='number'||typeof other!=='number'||!Object.is(value,other))return false;}
  }
  return completionRecord(context)===record&&record.input?.deref()===expected&&!!closedTimeframeContextFacts(context);
 }catch{return false;}
}

function localPins(context:object):readonly unknown[]{
 const pins:unknown[]=[];for(const key of LOCAL_FIELDS){const field=Object.getOwnPropertyDescriptor(context,key);if(field&&(!field.enumerable||!Object.hasOwn(field,'value')))throw Error('Local source transport requires own primitive context fields.');const value=field?.value;if(value!==undefined&&typeof value!=='string'&&!(key==='fixture'&&typeof value==='boolean'))throw Error('Local source context is unavailable.');pins.push(!!field,value);}return Object.freeze(pins);
}
function sameLocalPins(context:object,pins:readonly unknown[]):boolean{
 for(let index=0;index<LOCAL_FIELDS.length;index++){const field=Object.getOwnPropertyDescriptor(context,LOCAL_FIELDS[index]);if(!!field!==pins[index*2]||field&&(!field.enumerable||!Object.hasOwn(field,'value'))||!Object.is(field?.value,pins[index*2+1]))return false;}return true;
}
function localContextOriginal(context:unknown):BarDataset|null{
 if(!context||typeof context!=='object')return null;const record=localContextOrigins.get(context),original=record?.original.deref();if(!record)return null;
 try{if(!original||!sameLocalPins(context,record.pins)||!localCandleOriginFacts(original)||localContextOrigins.get(context)!==record||!sameLocalPins(context,record.pins))throw Error('Local source transport changed.');return original;}catch{localContextOrigins.delete(context);return null;}
}
/** Called only for an output just created inside one of the actual constructors below. */
function retainLocalContext(context:object,original:BarDataset,input?:readonly Bar[]):void{try{if(localCandleOriginFacts(original))localContextOrigins.set(context,{original:new WeakRef(original),input:input?new WeakRef(input):null,pins:localPins(context)});}catch{/* Optional transport cannot alter construction values or errors. */}}
function retainLocalCopy(source:ChartSourceContext,context:object,original:BarDataset,inputIdentity?:string,input?:readonly Bar[]):void{
 const record=localContextOrigins.get(source);if(!record||localContextOriginal(source)!==original)return;const pins=inputIdentity===undefined?record.pins:[...record.pins];if(inputIdentity!==undefined){(pins as unknown[])[10]=true;(pins as unknown[])[11]=inputIdentity;}if(sameLocalPins(context,pins))retainLocalContext(context,original,input??record.input?.deref());
}
/** Expected identity is checked before original facts. This is not native/publication or numerical authority. */
export function localCandleSourceContextMatches(context:unknown,expectedOriginal:unknown):boolean{
 if(!context||typeof context!=='object')return false;const expected=localContextOrigins.get(context)?.original.deref();if(!expected||expected!==expectedOriginal)return false;return localContextOriginal(context)===expected;
}
/** Same shallow copy as the existing queue operation; no caller can supply an attachment target. */
export function copyChartSourceContext(source:ChartSourceContext):ChartSourceContext{
 const original=localContextOriginal(source),copy={...source};if(original)retainLocalCopy(source,copy,original);retainCompletionCopy(source,copy);return copy;
}
/** Same actual deep market-input clone, with optional association only on that constructor's own context output. */
export function cloneMarketInputWithSourceContext<T extends {bars:readonly Bar[];source:unknown}>(input:T):T{
 const copy=cloneMarketInput(input);try{const field=input&&typeof input==='object'?Object.getOwnPropertyDescriptor(input,'source'):undefined,source=field&&Object.hasOwn(field,'value')?field.value:undefined,original=marketInputCloneConsumedSourceMatches(copy,source)?localContextOriginal(source):null,created=copy&&typeof copy==='object'?Object.getOwnPropertyDescriptor(copy,'source'):undefined;if(original&&created&&Object.hasOwn(created,'value')&&created.value&&typeof created.value==='object'&&created.value!==source)retainLocalCopy(source,created.value,original);if(source&&created&&Object.hasOwn(created,'value')&&created.value&&typeof created.value==='object'&&created.value!==source&&marketInputCloneConsumedSourceMatches(copy,source))retainCompletionCopy(source,created.value);}catch{/* All ordinary clone values and errors are determined by the existing clone first. */}return copy;
}
const bounded=(value:unknown,label:string):string=>{if(typeof value!=='string'||!value.length||value.length>4096)throw new Error('Incomplete or oversized chart source '+label);return value;};
function plain(value:unknown,label:string):void{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.values(Object.getOwnPropertyDescriptors(value)).some(property=>property.get||property.set))throw new Error('Chart source '+label+' requires a plain data record');}
/** Strict portable validation of the exact versioned tuple used for persisted bindings. */
export function validateChartSourceBasisIdentity(value:unknown):string{
 if(typeof value!=='string'||new TextEncoder().encode(value).length>100000)throw new Error('Invalid or oversized chart source basis identity');
 let tuple:unknown;try{tuple=JSON.parse(value);}catch{throw new Error('Invalid chart source basis identity JSON');}
 if(!Array.isArray(tuple)||tuple.length!==18||tuple[0]!==1)throw new Error('Unsupported chart source basis identity schema');
 for(let index=1;index<=14;index++)bounded(tuple[index],'basis field '+index);
 if(![tuple[15],tuple[16]].every(field=>typeof field==='number'&&Number.isFinite(field)&&field>0)||typeof tuple[17]!=='boolean')throw new Error('Invalid chart source basis units or synthetic status');
 const interval=tuple[10] as string;if(interval.startsWith('unparsed:')){const declared=interval.slice(9);bounded(declared,'unparsed resolution');let known=false;try{parseInterval(declared);known=true;}catch{}if(known)throw new Error('Known chart resolution requires canonical identity');}else{let canonical:string;try{canonical=parseInterval(interval).id;}catch{throw new Error('Invalid canonical chart resolution');}if(canonical!==interval)throw new Error('Noncanonical chart resolution identity');}
 if(JSON.stringify(tuple)!==value)throw new Error('Noncanonical chart source basis identity JSON');return value;
}
/** Preserve the declared basis. Unsupported interval labels are identified verbatim, never guessed from bars. */
export function sourceContextForDataset(dataset:BarDataset,bars?:readonly Bar[]):ChartSourceContext{
 plain(dataset,'dataset');plain(dataset.instrument,'instrument');plain(dataset.provenance,'provenance');const input=bars??dataset.bars;if(!Array.isArray(input))throw new Error('Chart source bars require an array');
 const instrument=dataset.instrument,provenance=dataset.provenance,resolution=bounded(dataset.resolution,'resolution');let interval:string;
 try{interval=parseInterval(resolution).id;}catch{interval='unparsed:'+resolution;}
 const fields=[instrument.id,instrument.symbol,instrument.name,instrument.exchange,instrument.currency,instrument.assetClass,instrument.timezone,provenance.providerId,provenance.datasetId,interval,provenance.adjustment,provenance.session,provenance.timezone,provenance.coverage].map((value,index)=>bounded(value,'basis field '+index));
 if(typeof provenance.fixture!=='boolean'||![instrument.tickSize,instrument.lotSize].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0))throw new Error('Explicit chart fixture labeling, positive tick and lot sizes are required');
 const basisIdentity=validateChartSourceBasisIdentity(JSON.stringify([1,...fields,instrument.tickSize,instrument.lotSize,provenance.fixture]));
 const context=sourceContextForInput({datasetId:provenance.datasetId,revision:bounded(provenance.revision,'revision'),fixture:provenance.fixture,label:bounded(provenance.providerName,'label'),resolution,basisIdentity,...(cellSessionOverride(dataset)?{sessionOverride:cellSessionOverride(dataset)}:{})},input);retainLocalContext(context,dataset,input);retainCompletion(context,dataset,input);return context;
}
/** Validated renderer-only request proof. Portable bindings continue to use the existing 18-field basis. */
export function sessionRequestSource(source:ChartSourceContext):Readonly<ChartSourceContext>{
 plain(source,'session request');const session=source.sessionOverride;
 if(session!=='regular'&&session!=='extended')throw Error('Invalid chart trading session request source.');
 const datasetId=bounded(source.datasetId,'dataset'),revision=bounded(source.revision,'revision'),label=bounded(source.label,'label'),resolution=bounded(source.resolution,'resolution'),basisIdentity=validateChartSourceBasisIdentity(source.basisIdentity),tuple=JSON.parse(basisIdentity) as unknown[];
 if(typeof source.fixture!=='boolean'||tuple[9]!==datasetId||tuple[12]!==session||tuple[17]!==source.fixture||tuple[10]!==parseInterval(resolution).id)throw Error('The chart trading session request proof does not match its source basis.');
 return Object.freeze({datasetId,revision,label,resolution,basisIdentity,fixture:source.fixture,sessionOverride:session});
}
/** Supplied identity tokens are never authoritative for a new public input. */
export function sourceContextForInput(source:ChartSourceContext,bars:readonly Bar[]):ChartSourceContext{const original=localContextOriginal(source),context={...source,inputIdentity:barInputIdentity(bars)};if(original)retainLocalCopy(source,context,original,context.inputIdentity,bars);retainCompletionCopy(source,context,context.inputIdentity,bars);return context;}
export function sameChartSourceBasis(actual:ChartSourceContext,desired:ChartSourceContext,requireKnown=false):boolean{
 if(requireKnown&&(!actual.basisIdentity||!desired.basisIdentity))return false;
 return (['datasetId','revision','fixture','label','resolution','basisIdentity'] as const).every(key=>actual[key]===desired[key]);
}
/** React effects depend on declared context values, not a metadata heartbeat object's reference. */
export function chartSourceContextKey(source:ChartSourceContext):string{return JSON.stringify((['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride'] as const).map(key=>[typeof source[key],source[key]]));}

/** Read-only exact constructor input membership; no array/dataset is resolved to callers. */
export function localCandleSourceInputMatches(context:unknown,expected:unknown):boolean{
 if(!context||typeof context!=='object')return false;const record=localContextOrigins.get(context);return !!record&&record.input?.deref()===expected&&localContextOriginal(context)!==null;
}
export interface LocalCandleContextLease {
 readonly rows:number;readonly resolution:string;
 isCurrent():boolean;assertCurrent():void;
 readRows(start:number,count:number):readonly Readonly<Bar>[];dispose():void;
}
interface ContextLease {context:WeakRef<ChartSourceContext>;original:WeakRef<BarDataset>;input:WeakRef<readonly Bar[]>;origin:LocalCandleOrigin}
const contextLeases=new WeakMap<object,ContextLease>();
function contextLease(key:object):{record:ContextLease;original:BarDataset}{
 const record=contextLeases.get(key),context=record?.context.deref(),original=record?.original.deref(),input=record?.input.deref();
 if(!record||!context||!original||!input||!localCandleSourceContextMatches(context,original)||!localCandleSourceInputMatches(context,input)){if(record)record.origin.dispose();contextLeases.delete(key);throw Error('The current original local source is unavailable.');}return{record,original};
}
/** Admission is supplied only by the closed port source planner. This cannot publish into a chart. */
export function captureLocalCandleContext(context:ChartSourceContext,admission:LocalCandleAdmission):LocalCandleContextLease|null{
 const original=localContextOriginal(context),record=localContextOrigins.get(context),input=record?.input?.deref();if(!original||!input||!record)return null;const resolution=Object.getOwnPropertyDescriptor(context,'resolution');if(!resolution||!Object.hasOwn(resolution,'value')||typeof resolution.value!=='string')return null;
 const origin=captureLocalCandleOrigin(original,admission);if(!origin)return null;if(localContextOriginal(context)!==original||!localCandleSourceInputMatches(context,input)){origin.dispose();return null;}const key={};contextLeases.set(key,{context:new WeakRef(context),original:new WeakRef(original),input:new WeakRef(input),origin});
 return Object.freeze({rows:origin.rows,resolution:resolution.value as string,isCurrent(){try{contextLease(key);return true;}catch{return false;}},assertCurrent(){const {record,original}=contextLease(key);try{record.origin.assertCurrent(original);contextLease(key);}catch(error){record.origin.dispose();contextLeases.delete(key);throw error;}},readRows(start:number,count:number){const {record,original}=contextLease(key);const rows=record.origin.readRows(original,start,count);contextLease(key);return rows;},dispose(){const current=contextLeases.get(key);contextLeases.delete(key);current?.origin.dispose();}});
}
/** Fixed metadata only, before numerical allocation and shared admission. */
export function localCandleContextFacts(context:ChartSourceContext):Readonly<{rows:number;inputRows:number;resolution:string}>|null{
 const original=localContextOriginal(context),record=localContextOrigins.get(context),input=record?.input?.deref();if(!original||!input)return null;
 const facts=localCandleOriginFacts(original),length=Object.getOwnPropertyDescriptor(input,'length'),resolution=Object.getOwnPropertyDescriptor(context,'resolution');if(!facts||!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<1||length.value>facts.rows||!resolution||!Object.hasOwn(resolution,'value')||typeof resolution.value!=='string')return null;
 return Object.freeze({rows:facts.rows,inputRows:length.value,resolution:resolution.value});
}

/** Actual constructor binding + private producer/view membership only, before native initial seed acceptance.
 * This grants neither numerical currentness nor a calculated result. */
export function producerCompletionSourceInputMatches(context:unknown,expected:unknown):boolean{
 const record=completionRecord(context),dataset=record?.original.deref(),rows=record?.input?.deref();return !!record&&!!dataset&&!!rows&&rows===expected&&!!alpacaSessionCompletionInputFacts(dataset,rows)&&completionRecord(context)===record;
}

/** Descriptive source mode ONLY. Actual context and its constructor-owned
 * original/input pair precede any classifier. This may remain true while a
 * Range/Renko frame is numerically unavailable. It never
 * grants F access, completion, prices, requests, native acceptance or budget. */
export function seasonalityDailyContextMode(context:ChartSourceContext,execution:string):boolean{
 const record=completionRecord(context),original=record?.original.deref(),input=record?.input?.deref();if(!record||!original||!input||typeof execution!=='string')return false;
 try{
  const selected=execution==='ordinary'&&!!captureAlpacaSessionSeasonalityDailyPlan(original,input,2015,2028);
  return selected&&completionRecord(context)===record&&record.original.deref()===original&&record.input?.deref()===input;
 }catch{return false;}
}
/** Ordinary live actual-origin transport only. No caller rows/resolver can
 * select an entry. Replay needs a distinct private freeze/run bridge and is
 * explicitly withheld here rather than borrowed from an ordinary live lease. */
export function captureSeasonalityDailyContext(context:ChartSourceContext,startYear:number,endYear:number,execution:string):AlpacaSeasonalityDailyPlan|null{
 if(execution!=='ordinary')return null;
 const record=completionRecord(context),dataset=record?.original.deref(),input=record?.input?.deref();if(!record||!dataset||!input)return null;
 const plan=captureAlpacaSessionSeasonalityDailyPlan(dataset,input,startYear,endYear);
 if(!plan||completionRecord(context)!==record||record.input?.deref()!==input)return null;
 try{plan.assertCurrent();return plan;}catch{return null;}
}
/** Called only after actual C source/clone/native overlap admission. Equality
 * does not attach ownership to the supplied candidate array. This deliberately
 * supports genuine extended as well as regular selections; no metadata-only
 * RTH convention or UTC daily-label assumption is introduced. */
export function seasonalityDailyContextInputValuesMatch(context:ChartSourceContext,currentInput:readonly Bar[],admittedRows:number):boolean{
 const record=completionRecord(context),original=record?.original.deref(),expected=record?.input?.deref();
 if(!record||!original||!expected||!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>100000)return false;
 const read=(owner:object,key:PropertyKey):unknown=>{const field=Object.getOwnPropertyDescriptor(owner,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Actual live input requires own data.');return field.value;};
 try{
  if(!alpacaSeasonalitySessionInputValuesMatch(original,expected))return false;
  for(const input of [expected,currentInput])if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype||read(input,'length')!==admittedRows)return false;
  for(let index=0;index<admittedRows;index++){
   const a=read(expected,String(index)),b=read(currentInput,String(index));if(!a||typeof a!=='object'||!b||typeof b!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(a))||![Object.prototype,null].includes(Object.getPrototypeOf(b)))return false;
   for(const key of ['time','open','high','low','close','volume']){const value=read(a,key),other=read(b,key);if(typeof value!=='number'||typeof other!=='number'||!Object.is(value,other))return false;}
  }
  return completionRecord(context)===record&&record.input?.deref()===expected&&alpacaSeasonalitySessionInputValuesMatch(original,expected);
 }catch{return false;}
}

/** One closed producer pass for the exact constructor-owned selected input.
 * Boolean comparison only: no original, resolver, reusable proof or attachment
 * escapes. The fused clone/native consumer pays for calls on both sides of its
 * full input comparison; this function does not certify the supplied native data. */
export function seasonalityDailyProducerInputValuesMatch(context:ChartSourceContext,expectedInput:readonly Bar[],admittedRows:number):boolean{
 const record=completionRecord(context),original=record?.original.deref(),expected=record?.input?.deref();
 if(!record||!original||!expected||expected!==expectedInput||!Number.isSafeInteger(admittedRows)||admittedRows<1||admittedRows>100000)return false;
 try{
  const length=Object.getOwnPropertyDescriptor(expected,'length');
  if(!Array.isArray(expected)||Object.getPrototypeOf(expected)!==Array.prototype||!length||!Object.hasOwn(length,'value')||length.value!==admittedRows)return false;
  if(!alpacaSeasonalitySessionInputValuesMatch(original,expected))return false;
  return completionRecord(context)===record&&record.original.deref()===original&&record.input?.deref()===expected;
 }catch{return false;}
}
