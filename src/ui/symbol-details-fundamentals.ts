/** Data contract between the fundamentals owner and SymbolDetails.
 * The producer supplies already-selected reported or derived values; SymbolDetails only validates
 * and displays them. Missing is null with a reason, never zero; nothing is inferred from OHLCV. */
export type FundamentalsAvailability='available'|'not-loaded'|'not-applicable'|'unavailable'|'error';
export interface FundamentalsSummaryMarket {exchange:string;symbol:string;synthetic:boolean}
export interface FundamentalsSummarySource {kind:'sec-public'|'local-import'|'synthetic';label:string;retrievedAt:string|null;sourceUrl:string|null;sha256:string|null}
export interface FundamentalsSummaryPeriod {start:string|null;end:string|null;fiscalYear:number|null;fiscalPeriod:string|null}
export interface FundamentalsSummaryField {
 id:string;label:string;
 /** Reported or derived value. null means missing and requires missingReason. */
 value:number|string|null;unit:string|null;
 period:FundamentalsSummaryPeriod|null;filed:string|null;form:string|null;accession:string|null;
 missingReason:string|null;
 /** Present only for derived metrics: formula text and the field ids it used. */
 derived?:{formula:string;inputs:string[]};
}
export interface SymbolFundamentalsSummary {
 schemaVersion:1;market:FundamentalsSummaryMarket;availability:FundamentalsAvailability;
 /** Required unless availability is 'available'. */
 reason:string|null;
 source:FundamentalsSummarySource|null;entity:{name:string;cik:string|null}|null;
 /** Filing cutoff (ISO date) the producer applied, or null for latest supplied. */
 asOf:string|null;
 fields:readonly FundamentalsSummaryField[];
}
export const FUNDAMENTALS_SUMMARY_FIELD_LIMIT=12;
export type FundamentalsSummaryCheck={ok:true;summary:SymbolFundamentalsSummary}|{ok:false;reason:string};
type Plain=null|boolean|number|string|Plain[]|{[key:string]:Plain};
/** Copy producer data exactly once: every descriptor is read a single time, accessors (on objects
 * and array indices), symbols, non-plain prototypes and oversized input reject. Validation and
 * output then use only this detached copy, so a Proxy or getter cannot answer differently later. */
function detach(value:unknown,budget={nodes:0},depth=0):Plain{
 if(++budget.nodes>2000||depth>6)throw Error('The summary exceeds its size limit.');
 if(value===null||typeof value==='boolean'||typeof value==='number'||typeof value==='string')return value;
 if(typeof value!=='object')throw Error('The summary contains unsupported values.');
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
 if(array?proto!==Array.prototype:![Object.prototype,null].includes(proto))throw Error('The summary must be plain data.');
 const length=array?(value as unknown[]).length:0;if(length>64)throw Error('The summary exceeds its size limit.');
 const out:Record<string,Plain>|Plain[]=array?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string')throw Error('The summary cannot contain symbol keys.');
  if(array&&key==='length')continue;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor)continue;
  if(!('value'in descriptor))throw Error('Fundamentals summary fields cannot be accessors.');
  if(!descriptor.enumerable||['__proto__','prototype','constructor'].includes(key))throw Error('The summary cannot contain hidden fields.');
  if(array){if(!/^(0|[1-9]\d*)$/.test(key))throw Error('Summary lists cannot carry extra properties.');(out as Plain[])[Number(key)]=detach(descriptor.value,budget,depth+1);}
  else (out as Record<string,Plain>)[key]=detach(descriptor.value,budget,depth+1);
 }
 if(array&&(Object.keys(out).length!==length||(out as Plain[]).length!==length))throw Error('Summary lists cannot be sparse.');
 return out as Plain;
}
const isRecord=(value:Plain|undefined):value is {[key:string]:Plain}=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:Plain|undefined,max:number,nonEmpty=false)=>typeof value==='string'&&value.length<=max&&(!nonEmpty||value.trim().length>0);
const nullableText=(value:Plain|undefined,max:number)=>value===null||text(value,max);
/** Validate a producer summary against the exact displayed market. Rejections never show values. */
export function checkFundamentalsSummary(value:unknown,market:FundamentalsSummaryMarket):FundamentalsSummaryCheck{
 let record:Plain;try{record=detach(value);}catch(error){return{ok:false,reason:error instanceof Error?error.message:String(error)};}
 if(!isRecord(record))return{ok:false,reason:'The summary is not a plain record.'};
 if(record.schemaVersion!==1)return{ok:false,reason:'Unsupported fundamentals summary version.'};
 const m=record.market;
 if(!isRecord(m)||m.exchange!==market.exchange||m.symbol!==market.symbol||m.synthetic!==market.synthetic)return{ok:false,reason:'The summary belongs to a different market identity than '+market.exchange+':'+market.symbol+'.'};
 const {availability,reason,source,entity,asOf,fields}=record;
 if(typeof availability!=='string'||!['available','not-loaded','not-applicable','unavailable','error'].includes(availability))return{ok:false,reason:'Unknown fundamentals availability.'};
 if(availability!=='available'&&!text(reason,400,true))return{ok:false,reason:'A missing fundamentals summary must state why.'};
 if(!nullableText(reason,400)||!nullableText(asOf,40))return{ok:false,reason:'Summary reason or cutoff is invalid.'};
 if(source!==null&&(!isRecord(source)||!['sec-public','local-import','synthetic'].includes(source.kind as string)||!text(source.label,160,true)||!nullableText(source.retrievedAt,40)||!nullableText(source.sourceUrl,400)||!nullableText(source.sha256,64)))return{ok:false,reason:'Summary source is invalid.'};
 if(isRecord(source)&&(source.kind==='synthetic')!==market.synthetic)return{ok:false,reason:market.synthetic?'A SYNTHETIC DEMO symbol cannot display real reported fundamentals.':'Synthetic fundamentals cannot be shown for a real-market symbol.'};
 if(entity!==null&&(!isRecord(entity)||!text(entity.name,200,true)||!nullableText(entity.cik,20)))return{ok:false,reason:'Summary entity is invalid.'};
 if(!Array.isArray(fields)||fields.length>FUNDAMENTALS_SUMMARY_FIELD_LIMIT)return{ok:false,reason:'Summary fields must be a list of at most '+FUNDAMENTALS_SUMMARY_FIELD_LIMIT+'.'};
 if(availability==='available'&&(source===null||!fields.length))return{ok:false,reason:'An available summary needs its source and at least one field.'};
 const ids=new Set<string>(),out:FundamentalsSummaryField[]=[];
 for(const f of fields){
  if(!isRecord(f))return{ok:false,reason:'Summary field is not a plain record.'};
  const {id,label,value:v,unit,period,filed,form,accession,missingReason,derived}=f;
  if(!text(id,64,true)||ids.has(id as string)||!text(label,80,true))return{ok:false,reason:'Summary field ids must be unique, non-empty and labelled.'};ids.add(id as string);
  if(!(v===null||typeof v==='number'&&Number.isFinite(v)||text(v,200,true)))return{ok:false,reason:'Field '+id+' has an empty, non-finite or unsupported value.'};
  if(v!==null&&source===null)return{ok:false,reason:'Field '+id+' has a value but the summary names no source.'};
  if(v===null&&!text(missingReason,200,true))return{ok:false,reason:'Missing field '+id+' must state why it is missing.'};
  if(!nullableText(unit,40)||!nullableText(filed,40)||!nullableText(form,20)||!nullableText(accession,40)||!nullableText(missingReason,200))return{ok:false,reason:'Field '+id+' metadata is invalid.'};
  if(period!==null&&(!isRecord(period)||!nullableText(period.start,40)||!nullableText(period.end,40)||!(period.fiscalYear===null||Number.isSafeInteger(period.fiscalYear))||!nullableText(period.fiscalPeriod,12)))return{ok:false,reason:'Field '+id+' period is invalid.'};
  if(derived!==undefined&&(!isRecord(derived)||!text(derived.formula,200,true)||!Array.isArray(derived.inputs)||!derived.inputs.length||!derived.inputs.every(input=>text(input,64,true))))return{ok:false,reason:'Field '+id+' derivation is invalid.'};
  out.push({id:id as string,label:label as string,value:v as FundamentalsSummaryField['value'],unit:unit as string|null,period:isRecord(period)?{start:period.start as string|null,end:period.end as string|null,fiscalYear:period.fiscalYear as number|null,fiscalPeriod:period.fiscalPeriod as string|null}:null,filed:filed as string|null,form:form as string|null,accession:accession as string|null,missingReason:missingReason as string|null,...(isRecord(derived)?{derived:{formula:derived.formula as string,inputs:[...derived.inputs as string[]]}}:{})});
 }
 for(const row of out)if(row.derived&&!row.derived.inputs.every(input=>ids.has(input)&&input!==row.id))return{ok:false,reason:'Field '+row.id+' is derived from fields that are not in this summary.'};
 return{ok:true,summary:{schemaVersion:1,market:{...market},availability:availability as FundamentalsAvailability,reason:reason as string|null,source:isRecord(source)?{kind:source.kind as FundamentalsSummarySource['kind'],label:source.label as string,retrievedAt:source.retrievedAt as string|null,sourceUrl:source.sourceUrl as string|null,sha256:source.sha256 as string|null}:null,entity:isRecord(entity)?{name:entity.name as string,cik:entity.cik as string|null}:null,asOf:asOf as string|null,fields:out}};
}
export function formatFundamentalsPeriod(period:FundamentalsSummaryPeriod|null):string{
 if(!period)return 'Period not supplied';
 const fiscal=[period.fiscalYear===null?null:'FY'+period.fiscalYear,period.fiscalPeriod].filter(Boolean).join(' ');
 const span=period.start&&period.end?period.start+' to '+period.end:period.end?'as of '+period.end:'dates not supplied';
 return (fiscal?fiscal+' · ':'')+span;
}
