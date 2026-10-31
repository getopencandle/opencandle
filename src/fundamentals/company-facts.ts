export interface ReportedFact {start:string|null;end:string;value:number;unit:string;filed:string|null;form:string|null;accession:string|null;fiscalYear:number|null;fiscalPeriod:string|null;frame:string|null}
export interface FactConcept {id:string;namespace:string;tag:string;label:string;description:string;units:string[];observations:ReportedFact[]}
export interface CompanyFacts {schemaVersion:1;cik:string;entityName:string;concepts:FactConcept[];observationCount:number}
export interface FactsSource {kind:'sec-public'|'local-import'|'synthetic';label:string;retrievedAt:string;sourceUrl:string|null;sha256:string|null}
export interface FactsDocument {id:string;facts:CompanyFacts;source:FactsSource}
export type FactPeriod='all'|'instant'|'quarter-length'|'annual-length'|'other-duration';
export interface FactQuery {unit:string;period:FactPeriod;asOf:string|null;revisions:'latest'|'original'|'all'}
export interface FactRow extends ReportedFact {ambiguous:boolean;chronologyUnknown:boolean;duplicateCount:number}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const string=(v:unknown,max:number,name:string)=>{if(typeof v!=='string'||v.length>max)throw new Error('Invalid '+name+'.');return v;};
export function dateDay(value:string):number{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Date must be YYYY-MM-DD.');
 const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new Error('Invalid calendar date.');return time/86400000;
}
function date(value:unknown,nullable:boolean,name:string):string|null{if(nullable&&value==null)return null;const result=string(value,10,name);dateDay(result);return result;}
function optional(value:unknown,max:number,name:string){return value==null?null:string(value,max,name);}
/** SEC tag/unit/filing data stays explicit. No currency conversion, annualization or quarterly derivation. */
export function normalizeCompanyFacts(input:unknown):CompanyFacts{
 if(!object(input)||!object(input.facts))throw new Error('Expected a SEC companyfacts JSON document.');
 const rawCik=String(input.cik);if(!/^\d{1,10}$/.test(rawCik)||Number(rawCik)===0)throw new Error('Invalid company CIK.');
 const cik=rawCik.padStart(10,'0'),entityName=string(input.entityName,500,'company name'),concepts:FactConcept[]=[],conceptIds=new Set<string>();let observationCount=0;
 for(const [namespace,tags] of Object.entries(input.facts)){
  if(!namespace.trim()||namespace.length>100||!object(tags))throw new Error('Invalid taxonomy namespace.');
  for(const [tag,raw] of Object.entries(tags)){
   const id=namespace+':'+tag;if(!tag.trim()||conceptIds.has(id)||concepts.length>=10000||tag.length>160||!object(raw)||!object(raw.units))throw new Error('Invalid, duplicate or excessive fact concepts.');conceptIds.add(id);
   const observations:ReportedFact[]=[];
   for(const [unit,values] of Object.entries(raw.units)){
    if(unit.length>100||!Array.isArray(values))throw new Error('Invalid fact unit.');
    for(const value of values){
     if(++observationCount>200000||!object(value)||typeof value.val!=='number'||!Number.isFinite(value.val)||Number.isInteger(value.val)&&!Number.isSafeInteger(value.val))throw new Error('Invalid or excessive fact values.');
     const start=date(value.start,true,'period start'),end=date(value.end,false,'period end')!;if(start&&start>end)throw new Error('Fact period ends before it starts.');
     if(value.fy!=null&&(!Number.isSafeInteger(value.fy)||Number(value.fy)<0||Number(value.fy)>9999))throw new Error('Invalid fiscal year.');
     observations.push({start,end,value:value.val,unit,filed:date(value.filed,true,'filing date'),form:optional(value.form,80,'form'),accession:optional(value.accn,80,'accession'),fiscalYear:value.fy==null?null:Number(value.fy),fiscalPeriod:optional(value.fp,20,'fiscal period'),frame:optional(value.frame,100,'frame')});
    }
   }
   concepts.push({id:namespace+':'+tag,namespace,tag,label:raw.label==null?tag:string(raw.label,500,'concept label'),description:raw.description==null?'':string(raw.description,20000,'concept description'),units:Object.keys(raw.units),observations});
  }
 }
 return {schemaVersion:1,cik,entityName,concepts:concepts.sort((a,b)=>a.label.localeCompare(b.label)),observationCount};
}
export function restoreFactsDocument(input:unknown):FactsDocument{
 if(!object(input)||typeof input.id!=='string'||input.id.length>200||!object(input.facts)||input.facts.schemaVersion!==1||!Array.isArray(input.facts.concepts)||input.facts.concepts.length>10000||!object(input.source))throw new Error('Invalid saved fundamentals document.');
 const source=input.source;
 if(!['sec-public','local-import','synthetic'].includes(String(source.kind))||typeof source.label!=='string'||source.label.length>1000||typeof source.retrievedAt!=='string'||!Number.isFinite(Date.parse(source.retrievedAt))||source.sha256!==null&&(typeof source.sha256!=='string'||!/^[0-9a-f]{64}$/.test(source.sha256))||source.sourceUrl!==null&&(typeof source.sourceUrl!=='string'||source.sourceUrl.length>2048))throw new Error('Invalid saved fundamentals provenance.');
 const namespaces:Record<string,Record<string,unknown>>=Object.create(null),ids=new Set<string>();
 for(const concept of input.facts.concepts){
  if(!object(concept)||typeof concept.namespace!=='string'||typeof concept.tag!=='string'||concept.id!==concept.namespace+':'+concept.tag||ids.has(String(concept.id))||!Array.isArray(concept.observations)||!Array.isArray(concept.units)||new Set(concept.units).size!==concept.units.length)throw new Error('Invalid saved fact concept.');
  ids.add(String(concept.id));const units:Record<string,Record<string,unknown>[]>=Object.create(null);for(const unit of concept.units){if(typeof unit!=='string'||unit.length>100)throw new Error('Invalid saved fact unit.');units[unit]=[];}
  for(const observation of concept.observations){if(!object(observation)||typeof observation.unit!=='string'||!Object.hasOwn(units,observation.unit))throw new Error('Invalid saved fact observation.');const raw:Record<string,unknown>={end:observation.end,val:observation.value};for(const [from,to] of [['start','start'],['filed','filed'],['form','form'],['accession','accn'],['fiscalYear','fy'],['fiscalPeriod','fp'],['frame','frame']])if(observation[from]!==null)raw[to]=observation[from];units[observation.unit].push(raw);}
  if(!Object.hasOwn(namespaces,concept.namespace))namespaces[concept.namespace]=Object.create(null);namespaces[concept.namespace][concept.tag]={label:concept.label,description:concept.description,units};
 }
 const facts=normalizeCompanyFacts({cik:input.facts.cik,entityName:input.facts.entityName,facts:namespaces});
 if(source.kind==='sec-public'&&source.sourceUrl!=='https://data.sec.gov/api/xbrl/companyfacts/CIK'+facts.cik+'.json')throw new Error('Saved SEC source does not match the company.');
 return {id:input.id,facts,source:{kind:source.kind as FactsSource['kind'],label:source.label,retrievedAt:source.retrievedAt,sourceUrl:source.sourceUrl as string|null,sha256:source.sha256 as string|null}};
}
export function factDuration(row:ReportedFact):number|null{return row.start===null?null:dateDay(row.end)-dateDay(row.start)+1;}
export function queryFacts(concept:FactConcept,query:FactQuery):{rows:FactRow[];unavailableFilingDates:number;unorderedFilingDates:number;afterCutoff:number;conflicts:number;policy:string}{
 if(!concept.units.includes(query.unit))throw new Error('Requested fact unit is unavailable.');
 if(!['all','instant','quarter-length','annual-length','other-duration'].includes(query.period)||!['latest','original','all'].includes(query.revisions))throw new Error('Invalid fact query.');
 if(query.asOf!==null)dateDay(query.asOf);
 let unavailableFilingDates=0,afterCutoff=0;
 const selected=concept.observations.filter(row=>{
  if(row.unit!==query.unit)return false;
  if(query.asOf!==null){if(row.filed===null){unavailableFilingDates++;return false;}if(row.filed>query.asOf){afterCutoff++;return false;}}
  const duration=factDuration(row);return query.period==='all'||query.period==='instant'&&duration===null||query.period==='quarter-length'&&duration!==null&&duration>=60&&duration<=120||query.period==='annual-length'&&duration!==null&&duration>=300&&duration<=400||query.period==='other-duration'&&duration!==null&&!(duration>=60&&duration<=120)&&!(duration>=300&&duration<=400);
 });
 const groups=new Map<string,ReportedFact[]>();for(const row of selected){const key=JSON.stringify([row.start,row.end]);const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
 const rows:FactRow[]=[];let conflicts=0;
 for(const group of groups.values()){
  let candidates=group;
  if(query.revisions!=='all'){
   const known=group.filter(row=>row.filed!==null).sort((a,b)=>a.filed!.localeCompare(b.filed!));
   const chosen=(query.revisions==='latest'?known.at(-1):known[0])?.filed;
   candidates=chosen?group.filter(row=>row.filed===chosen||row.filed===null):group;
  }
  const vintages=new Map<string|null,ReportedFact[]>();for(const row of candidates){const vintage=vintages.get(row.filed)??[];vintage.push(row);vintages.set(row.filed,vintage);}
  for(const [filed,vintage] of vintages){
   const distinct=new Set(vintage.map(row=>row.value)),ambiguous=filed!==null&&distinct.size>1,chronologyUnknown=filed===null;
   if(ambiguous)conflicts++;
   if(query.revisions==='all')rows.push(...vintage.map(row=>({...row,ambiguous,chronologyUnknown,duplicateCount:1})));
   else {const identical=new Map<string,ReportedFact[]>();for(const observation of vintage){const key=JSON.stringify(observation),group=identical.get(key)??[];group.push(observation);identical.set(key,group);}for(const group of identical.values())rows.push({...group[0],ambiguous,chronologyUnknown,duplicateCount:group.length});}
  }
 }
 rows.sort((a,b)=>b.end.localeCompare(a.end)||(b.filed??'').localeCompare(a.filed??'')||(a.start??'').localeCompare(b.start??''));
 return {rows,unavailableFilingDates,unorderedFilingDates:rows.filter(row=>row.chronologyUnknown).length,afterCutoff,conflicts,policy:'Use exact reported tags and units. Filing cutoff is inclusive at day precision; SEC companyfacts does not supply an intraday availability timestamp. With no cutoff, unknown filing dates remain visible and cannot be ranked against dated versions. Conflicts mean different values for the same tag, unit, period and filing day; changes between filing days remain revision history. Quarter-length means 60 to 120 days and annual-length means 300 to 400 days, explicit OpenCandle filters rather than issuer fiscal labels. No YTD subtraction, currency conversion, aggregation or forecasts.'};
}
