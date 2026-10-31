import type {BarDataset,AdjustmentBasis,SessionBasis} from '../domain/types';
import {validateIndicatorSnapshots,validateIndicatorPlotStyle,type IndicatorSnapshot} from '../chart/indicator-settings';
import {restoreScriptBindings,type ScriptBinding} from './script-library';
import {remapIndicatorSource,validateIndicatorSourceGraph,orderIndicatorSourceGraph} from '../domain/indicator-source';
import {indicatorPlotIds} from '../chart/indicator-settings';
import type {IndicatorId} from '../domain/indicators';

export const INDICATOR_TEMPLATE_BYTES=8*1024*1024;
export interface TemplateSource {datasetId:string;resolution:string;instrumentId:string;symbol:string;exchange:string;currency:string;assetClass:'stock'|'etf';providerId:string;fixture:boolean;coverage:string;adjustment:AdjustmentBasis;session:SessionBasis;timezone:string}
export interface IndicatorTemplateContent {indicators:IndicatorSnapshot[];scripts:ScriptBinding[];rememberSymbol:boolean;rememberInterval:boolean;source:TemplateSource|null}
export interface IndicatorTemplate extends IndicatorTemplateContent {id:string;name:string;revision:number}
export interface IndicatorTemplates {schemaVersion:1;records:IndicatorTemplate[]}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
/** Reject behavior-bearing values before any JSON byte measurement or copying. */
function plainJson(value:unknown,depth=0,budget={nodes:0}):void{
 if(++budget.nodes>150000||depth>24)throw new Error('Template document exceeds local structure limits.');
 if(value===null||typeof value==='boolean'||typeof value==='string')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(!Array.isArray(value)&&!object(value))throw new Error('Template values must be plain JSON.');
 if(Array.isArray(value)&&Object.getPrototypeOf(value)!==Array.prototype)throw new Error('Invalid template array.');
 for(const key of Reflect.ownKeys(value as object)){
  if(typeof key!=='string')throw new Error('Template symbols are unsupported.');const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
  if(!Object.hasOwn(descriptor,'value'))throw new Error('Template accessors are unsupported.');
  if(!descriptor.enumerable&&!(Array.isArray(value)&&key==='length'))throw new Error('Non-enumerable template fields are unsupported.');
  if(Array.isArray(value)){if(key==='length')continue;if(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)throw new Error('Invalid template array property.');}
  plainJson(descriptor.value,depth+1,budget);
 }
 if(Array.isArray(value)&&Object.keys(value).length!==value.length)throw new Error('Sparse template arrays are unsupported.');
}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]){if(Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Unsupported template field.');}
function text(value:unknown,max=200):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Invalid template text.');return value;}
function identity(value:unknown):string{const id=text(value);if(['__proto__','prototype','constructor'].includes(id))throw new Error('Unsafe template identity.');return id;}
export function templateName(value:unknown):string{return text(typeof value==='string'?value.normalize('NFC').trim():value,100);}
const nameKey=(value:string)=>templateName(value).toLocaleLowerCase('en-US');
export function createIndicatorTemplates():IndicatorTemplates{return {schemaVersion:1,records:[]};}
export function templateSource(dataset:BarDataset):TemplateSource{
 const i=dataset.instrument,p=dataset.provenance;
 return validateSource({datasetId:p.datasetId,resolution:dataset.resolution,instrumentId:i.id,symbol:i.symbol,exchange:i.exchange,currency:i.currency,assetClass:i.assetClass,providerId:p.providerId,fixture:p.fixture,coverage:p.coverage,adjustment:p.adjustment,session:p.session,timezone:p.timezone});
}
function validateSource(value:unknown):TemplateSource{
 if(!object(value))throw new Error('Template source is missing.');
 exactKeys(value,['datasetId','resolution','instrumentId','symbol','exchange','currency','assetClass','providerId','fixture','coverage','adjustment','session','timezone']);
 for(const key of ['datasetId','resolution','instrumentId','symbol','exchange','currency','providerId','timezone'])text(value[key]);text(value.coverage,1000);
 if(!['stock','etf'].includes(value.assetClass)||!/^[A-Z]{3}$/.test(value.currency)||typeof value.fixture!=='boolean'||!['raw','split-adjusted','total-return','unknown'].includes(value.adjustment)||!['regular','extended','all','unknown'].includes(value.session))throw new Error('Unsupported template source basis.');
 new Intl.DateTimeFormat('en',{timeZone:value.timezone});return structuredClone(value) as TemplateSource;
}
function content(value:Record<string,any>):IndicatorTemplateContent{
 if(!Array.isArray(value.indicators)||value.indicators.length>100||!Array.isArray(value.scripts)||value.scripts.length>100||typeof value.rememberSymbol!=='boolean'||typeof value.rememberInterval!=='boolean')throw new Error('Invalid template content or local instance limit.');
 validateIndicatorSnapshots(value.indicators);validateIndicatorSourceGraph(value.indicators,{allowMissing:false,plots:kind=>indicatorPlotIds[kind as IndicatorId]??[]});
 for(const script of value.scripts){if(!object(script))throw new Error('Invalid template script.');exactKeys(script,['id','name','source','pane','documentId','version','paneId','ownScale','visible','plots','inputs','tablePlacement']);if(!object(script.plots))throw new Error('Invalid template script plots.');for(const style of Object.values(script.plots))validateIndicatorPlotStyle(style);}
 const scripts=restoreScriptBindings(value.scripts),ids=new Set(value.indicators.map(row=>row.id));
 for(const script of scripts){if(ids.has(script.id))throw new Error('Template instance identities overlap.');ids.add(script.id);}
 const source=value.source===null?null:validateSource(value.source);if((value.rememberSymbol||value.rememberInterval)&&!source)throw new Error('Remembered symbol or interval needs an explicit source basis.');
 return {indicators:structuredClone(value.indicators),scripts,rememberSymbol:value.rememberSymbol,rememberInterval:value.rememberInterval,source};
}
export function restoreIndicatorTemplates(value:unknown):IndicatorTemplates{
 plainJson(value);if(!object(value)||value.schemaVersion!==1||!Array.isArray(value.records)||value.records.length>200)throw new Error('Invalid indicator template library.');exactKeys(value,['schemaVersion','records']);
 if(new TextEncoder().encode(JSON.stringify(value)).length>INDICATOR_TEMPLATE_BYTES)throw new Error('Indicator templates exceed 8 MiB.');
 const ids=new Set<string>(),names=new Set<string>();const records=value.records.map((row:unknown):IndicatorTemplate=>{
  if(!object(row))throw new Error('Invalid indicator template.');exactKeys(row,['id','name','revision','indicators','scripts','rememberSymbol','rememberInterval','source']);
  const id=identity(row.id),name=templateName(row.name);if(ids.has(id)||names.has(nameKey(name))||!Number.isSafeInteger(row.revision)||row.revision<1)throw new Error('Duplicate template identity/name or invalid revision.');ids.add(id);names.add(nameKey(name));return{id,name,revision:row.revision,...content(row)};
 });return {schemaVersion:1,records};
}
function selected(library:IndicatorTemplates,id:string,expectedRevision:number):IndicatorTemplate{
 const row=library.records.find(row=>row.id===id);if(!row||row.revision!==expectedRevision)throw new Error('This template changed or was removed. Review it again.');return row;
}
function revision(row:IndicatorTemplate):number{if(row.revision===Number.MAX_SAFE_INTEGER)throw new Error('Template revision exhausted. Make a copy.');return row.revision+1;}
export function saveIndicatorTemplate(library:IndicatorTemplates,name:string,value:IndicatorTemplateContent,makeId:()=>string,overwrite?:{id:string;expectedRevision:number}):IndicatorTemplates{
 plainJson(value);
 const clean=templateName(name),existing=overwrite?selected(library,overwrite.id,overwrite.expectedRevision):null;
 if(library.records.some(row=>row.id!==existing?.id&&nameKey(row.name)===nameKey(clean)))throw new Error('A template has this name. Review an explicit overwrite or choose another name.');
 const record={...value,id:existing?.id??makeId(),name:clean,revision:existing?revision(existing):1};
 return restoreIndicatorTemplates({...library,records:existing?library.records.map(row=>row.id===existing.id?record:row):[...library.records,record]});
}
export function renameIndicatorTemplate(library:IndicatorTemplates,id:string,expectedRevision:number,name:string):IndicatorTemplates{
 const row=selected(library,id,expectedRevision);return saveIndicatorTemplate(library,name,row,()=>{throw new Error('Rename cannot allocate an identity.');},{id,expectedRevision});
}
export function copyIndicatorTemplate(library:IndicatorTemplates,id:string,expectedRevision:number,name:string,makeId:()=>string):IndicatorTemplates{
 const row=selected(library,id,expectedRevision);return saveIndicatorTemplate(library,name,row,makeId);
}
export function deleteIndicatorTemplate(library:IndicatorTemplates,id:string,expectedRevision:number):IndicatorTemplates{selected(library,id,expectedRevision);return restoreIndicatorTemplates({...library,records:library.records.filter(row=>row.id!==id)});}
export function importIndicatorTemplates(library:IndicatorTemplates,json:string,makeId:()=>string):IndicatorTemplates{
 if(new TextEncoder().encode(json).length>INDICATOR_TEMPLATE_BYTES)throw new Error('Template JSON exceeds 8 MiB.');const incoming=restoreIndicatorTemplates(JSON.parse(json));let next=library;
 for(const row of incoming.records)next=saveIndicatorTemplate(next,row.name,row,makeId);return next;
}
/** Fresh native ownership, including panes shared between built-ins and scripts. */
export function instantiateIndicatorTemplate(template:IndicatorTemplate,makeId:()=>string,occupied:readonly string[]=[]):Pick<IndicatorTemplateContent,'indicators'|'scripts'>{
 if(!Array.isArray(occupied)||occupied.length>20000)throw new Error('Invalid chart ownership inventory.');
 const checked=restoreIndicatorTemplates({schemaVersion:1,records:[template]}).records[0],reserved=new Set(['price',...occupied.map(identity),...[...checked.indicators,...checked.scripts].map(row=>row.id)]),panes=new Map<string,string>();
 for(const row of [...checked.indicators,...checked.scripts])if(row.paneId)reserved.add(row.paneId);
 const fresh=()=>{const id=identity(makeId());if(reserved.has(id))throw new Error('Fresh template identity collision.');reserved.add(id);return id;};
 const pane=(id:string|null|undefined)=>{if(id===undefined||id===null||id==='price')return id??null;let next=panes.get(id);if(!next){next='lv-template-pane-'+fresh();if(reserved.has(next))throw new Error('Fresh pane identity collision.');reserved.add(next);panes.set(id,next);}return next;};
 const mapped=checked.indicators.map(row=>({...row,id:fresh(),paneId:pane(row.paneId)})),ids=new Map(checked.indicators.map((row,index)=>[row.id,mapped[index].id]));
 const indicators=orderIndicatorSourceGraph(mapped.map(row=>Object.hasOwn(row.inputs,'source')?{...row,inputs:{...row.inputs,source:remapIndicatorSource(row.inputs.source,ids) as string}}:row)),scripts=checked.scripts.map(row=>({...row,id:fresh(),paneId:pane(row.paneId)}));
 validateIndicatorSnapshots(indicators);restoreScriptBindings(scripts);return {indicators,scripts};
}
/** Resolve remembered dimensions without aggregation, another venue, or a demo fallback. */
export function resolveTemplateDataset(template:IndicatorTemplate,current:BarDataset,available:readonly BarDataset[]):BarDataset{
 const saved=restoreIndicatorTemplates({schemaVersion:1,records:[template]}).records[0];if(!saved.rememberSymbol&&!saved.rememberInterval)return current;
 const basis=saved.rememberSymbol?saved.source!:templateSource(current),resolution=saved.rememberInterval?saved.source!.resolution:current.resolution;
 const keys=['instrumentId','symbol','exchange','currency','assetClass','providerId','fixture','coverage','adjustment','session','timezone'] as const;
 const matches=available.filter(dataset=>{const candidate=templateSource(dataset);return candidate.resolution===resolution&&keys.every(key=>candidate[key]===basis[key]);});
 const preferred=matches.filter(dataset=>dataset.provenance.datasetId===basis.datasetId);
 if(preferred.length===1)return preferred[0];if(preferred.length>1||matches.length>1)throw new Error('More than one data source matches. Choose one before applying.');if(matches.length===1)return matches[0];
 throw new Error('Template requires unavailable '+basis.symbol+' '+resolution+' history with its saved source basis. No prices were substituted.');
}
export function indicatorTemplateFingerprint(template:IndicatorTemplate):string{return JSON.stringify(restoreIndicatorTemplates({schemaVersion:1,records:[template]}).records[0]);}
