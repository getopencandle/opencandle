import {assertScriptCsvJobModel,assertScriptCsvJobDependencies} from './script-csv-job-proof';
import {NativeRenderer,getNativeIndicator} from '@luxalgo/vela';
import type {ChartController} from './adapter';
import type {ChartInputSnapshot} from './input-visibility';
import {captureSnapshotGuard,snapshotSeriesKey,snapshotSourceKey} from './snapshot-scene';
import {acquireIndicatorDisplayPort} from './indicator-display-source';
import {INDICATOR_MAX_INSTANCES,INDICATOR_OUTPUT_LIMIT} from './indicator-settings';
import {prepareChartCsvSource,chartCsvSourceRow} from './chart-csv-source';
import {catalogDefinition} from '../domain/indicator-catalog';
import {parseIndicatorSource} from '../domain/indicator-source';
import {indicatorActivePlotIds} from '../domain/indicators';
import {scriptOutputs} from '../ui/script-outputs';
import {providerTermsApply} from '../domain/provider-capabilities';

export interface ChartCsvPoint {readonly time:number;readonly value:number|null}
export interface ChartCsvColumn {readonly label:string;readonly points:readonly ChartCsvPoint[]}
export interface ChartCsvInventory {readonly indicators:readonly string[];readonly comparisons:readonly string[];readonly scripts:readonly string[]}
export const CHART_CSV_POINT_LIMIT=INDICATOR_OUTPUT_LIMIT;
export const CHART_CSV_COLUMN_LIMIT=INDICATOR_MAX_INSTANCES*16*5;
const TIME_MIN=-62135596800,TIME_MAX=253402300799;
const stale=()=>new Error('Chart data or plotted values changed. Wait for the chart to finish updating and export again.');
type Data=Record<string,any>;
const capturedColumns=new WeakSet<object>();
function own(value:unknown,key:string,optional=false):any{
 if(!value||typeof value!=='object')throw stale();
 const field=Object.getOwnPropertyDescriptor(value,key);if(!field){if(optional)return undefined;throw stale();}
 if(!Object.hasOwn(field,'value'))throw stale();return field.value;
}
function method(value:object,key:string):Function{
 for(let object:object|null=value;object;object=Object.getPrototypeOf(object)){const field=Object.getOwnPropertyDescriptor(object,key);if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='function')throw stale();return field.value;}}
 throw stale();
}
function dense(value:unknown,limit:number):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>limit)throw Error('Chart CSV numerical output exceeds its bounded capture capacity.');
 if(Object.hasOwn(value,'map')||Object.hasOwn(value,'some')||Object.hasOwn(value,Symbol.iterator))throw stale();
 for(let i=0;i<value.length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,String(i));if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw stale();}return value;
}
function text(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>4096)throw Error('Chart CSV requires a readable bounded plot name.');return value;}
/** A plot header from a native series title. An untitled plot is named "Plot"; the
 *  caller's ordinal dedupe keeps headers distinct. A non-string or oversized title is still refused. */
function plotName(value:unknown):string{if(typeof value!=='string'||value.length>4096)throw Error('Chart CSV requires a readable bounded plot name.');return value.trim()?value:'Plot';}
function isDecorationAnchor(item:unknown,title:unknown):boolean{if(typeof title!=='string'||title.trim())return false;const display=own(item,'display',true);return !!display&&typeof display==='object'&&own(display,'dataWindow',true)===false;}
function nativeMap(value:unknown):Map<string,any>{if(!(value instanceof Map)||Object.getPrototypeOf(value)!==Map.prototype)throw stale();return value;}
const names:Record<string,string>={volume:'Volume',sma:'Simple Moving Average',ema:'Exponential Moving Average',rsi:'Relative Strength Index',macd:'MACD',bb:'Bollinger Bands',vwap:'Volume Weighted Average Price',stochastic:'Stochastic Oscillator',atr:'Average True Range',obv:'On Balance Volume'};
interface NumericProof {rows:readonly unknown[];field:string;points:readonly ChartCsvPoint[];milliseconds:boolean;optional:boolean}
function copyPoints(rows:readonly unknown[],field:string,milliseconds:boolean,optional=false):readonly ChartCsvPoint[]{
 let previous=-Infinity;return Object.freeze(rows.map(row=>{
  const time=own(row,'time')/(milliseconds?1000:1),raw=own(row,field,optional),value=raw===undefined&&optional||typeof raw==='number'&&Number.isNaN(raw)&&optional?null:raw;
  if(!Number.isFinite(time)||time<TIME_MIN||time>TIME_MAX||time<=previous||value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('Chart CSV plot samples require increasing real timestamps and finite values or gaps.');
  previous=time;return Object.freeze({time,value});
 }));
}
function assertNumbers(proof:NumericProof):void{
 if(proof.rows.length!==proof.points.length)throw stale();
 for(let i=0;i<proof.rows.length;i++){
  const field=Object.getOwnPropertyDescriptor(proof.rows,String(i));if(!field||!Object.hasOwn(field,'value'))throw stale();
  const row=field.value,raw=own(row,proof.field,proof.optional),value=proof.optional&&(raw===undefined||typeof raw==='number'&&Number.isNaN(raw))?null:raw;
  if(own(row,'time')/(proof.milliseconds?1000:1)!==proof.points[i].time||!Object.is(value,proof.points[i].value))throw stale();
 }
}
/** Clone and validate supplied numerical columns before CSV alignment. No calculation, interpolation or request occurs. */
export function validatedChartCsvColumns(value:readonly ChartCsvColumn[]):readonly ChartCsvColumn[]{
 if(capturedColumns.has(value))return value;
 const columns=dense(value,CHART_CSV_COLUMN_LIMIT);let count=0;const labels=new Set<string>();
 return columns.map(item=>{const label=text(own(item,'label')),points=dense(own(item,'points'),CHART_CSV_POINT_LIMIT);count+=points.length;
  if(count>CHART_CSV_POINT_LIMIT)throw Error('Chart CSV numerical output exceeds its bounded capture capacity.');if(labels.has(label))throw Error('Chart CSV plot headers must be distinct.');labels.add(label);
  return {label,points:copyPoints(points,'value',false)};
 });
}
function requestKey(result:unknown):string{
 if(!result)return '[]';const declarations=own(result,'declarations',true);if(!declarations)return '[]';
 const requests=dense(own(declarations,'requests'),64);return JSON.stringify(requests.map(row=>[own(row,'id'),own(row,'symbol'),own(row,'interval')]));
}
function settingsKey(settings:object,category:number):string{
 let nodes=0;
 const safe=(value:unknown,depth=0):unknown=>{
  if(++nodes>4096||depth>6)throw stale();
  if(value===null||value===undefined||['string','number','boolean'].includes(typeof value))return [typeof value,value];
  if(!value||typeof value!=='object'||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))throw stale();
  return Reflect.ownKeys(value).filter(key=>key!=='length').sort((a,b)=>String(a).localeCompare(String(b))).map(key=>{if(typeof key!=='string')throw stale();return [key,safe(own(value,key),depth+1)];});
 };
 const fields=Reflect.ownKeys(settings).filter(key=>key!=='dataset');if(fields.length>64)throw stale();const values=fields.map(key=>{if(typeof key!=='string')throw stale();return [key,safe(own(settings,key))];});
 if(category===1){const data=own(settings,'dataset');values.push(['dataset',safe({instrument:own(data,'instrument'),provenance:own(data,'provenance'),resolution:own(data,'resolution')})]);}
 return JSON.stringify(values);
}
/** Header of the empty column that stands in for a study whose values depend on
 *  additional history (profiles, finer or daily history, a second symbol) or on such a study through its Source input. Those
 *  values have no accepted export permission, so they are left out while the rest of the chart exports. */
export const CHART_CSV_OMITTED_SUFFIX=': not exported (uses additional history)';
function extraHistoryKind(kind:unknown):boolean{const definition=typeof kind==='string'?catalogDefinition(kind):undefined;return !!definition&&!!(definition.profile||definition.finerBars||definition.dailyHistory||definition.secondSymbol);}
/** True when the study or any study it reads through Source uses additional history. A source cycle or an unknown source is
 *  treated as dependent (never exported). */
function usesExtraHistory(id:string,settings:ReadonlyMap<string,object>):boolean{
 const seen=new Set<string>();let current:string|null=id;
 while(current!==null){
  if(seen.has(current)||seen.size>64)return true;seen.add(current);const value=settings.get(current);if(!value)return true;
  if(extraHistoryKind(own(value,'kind')))return true;
  const inputs=own(value,'inputs',true),ref=inputs&&typeof inputs==='object'?parseIndicatorSource(own(inputs,'source',true)):null;current=ref?ref.instance:null;
 }
 return false;
}
/** Capture only current, accepted port models. Caller ownership and native frame guards are one export proof. */
export function captureChartCsvColumns(chart:ChartController|null,input:ChartInputSnapshot,execution:string,inventory:ChartCsvInventory,assertOwner:()=>void):{columns:readonly ChartCsvColumn[];assertCurrent():void;omitted?:readonly string[];personalUse?:readonly string[]}{
 assertOwner();prepareChartCsvSource(input,execution);
 const expected=[...inventory.indicators,...inventory.comparisons,...inventory.scripts];
 // An empty configured graph has no supplementary numerical authority to acquire. Preserve the source-only contract.
 if(expected.length===0&&(!chart?.indicators||!chart?.comparisons||!chart?.scripts))return {columns:[],assertCurrent:assertOwner};
 if(!chart)throw stale();
 const assertInput=()=>{assertOwner();if(!chart.isInputCurrent(input)||chart.getExecutionIdentity()!==execution)throw stale();};assertInput();
 const frame=captureSnapshotGuard({owner:{},chart,sourceKey:snapshotSourceKey(input.source,input.style),seriesKey:snapshotSeriesKey(chart)});
 const sourceRows=input.bars,sourceProof=new Float64Array(sourceRows.length*6),proofs:NumericProof[]=[],checks:Array<()=>void>=[];
 for(let index=0;index<sourceRows.length;index++){const values=chartCsvSourceRow(sourceRows,index);for(let field=0;field<6;field++){if(typeof values[field]!=='number')throw stale();sourceProof[index*6+field]=values[field];}}
 const assertSource=()=>{if(input.bars!==sourceRows)throw stale();for(let index=0;index<sourceRows.length;index++){const values=chartCsvSourceRow(sourceRows,index);for(let field=0;field<6;field++)if(!Object.is(values[field],sourceProof[index*6+field]))throw stale();}};
 const renderer=chart.nativeRenderer();if(!(renderer instanceof NativeRenderer))throw Error('Chart CSV requires the current native numerical model.');
 const native=chart.chart,core=own(native,'orchestrator'),registry=own(core,'registry'),get=method(registry,'get'),all=method(registry,'all'),scene=own(renderer,'scene'),models=nativeMap(own(scene,'indicators')),panes=nativeMap(own(scene,'panes')),bars=own(core,'bars');
 if(own(core,'renderer')!==renderer)throw stale();
 const domain=acquireIndicatorDisplayPort(chart.indicators,native);
 const ports=[chart.indicators,chart.comparisons,chart.scripts],configured=[inventory.indicators,inventory.comparisons,inventory.scripts],categories=new Map<string,number>();
 for(let category=0;category<configured.length;category++)for(const id of dense(configured[category],INDICATOR_MAX_INSTANCES)){if(typeof id!=='string'||!id||categories.has(id))throw stale();categories.set(id,category);}
 // The canonical registry owns accepted models. Avoid comparison.list(), which clones whole source datasets.
 const rows:Data[][]=[[],[],[]],found=new Set<string>();
 for(const record of dense(Reflect.apply(all,registry,[]),INDICATOR_MAX_INSTANCES*3)){
  const binding=own(record,'native',true);if(!binding)continue;const instance=own(binding,'instance'),settings=own(instance,'settings',true),id=settings?own(settings,'id',true):undefined,category=categories.get(id);
  if(category===undefined)continue;if(found.has(id))throw stale();found.add(id);rows[category].push({id,rendererId:own(record,'id'),settings});
 }
 if(found.size!==categories.size)throw Error('Some chart studies are still loading or unavailable. Export after their current results are ready.');
 const scriptMetadata=scriptOutputs.list(chart.scripts),scriptMetadataKey=JSON.stringify(scriptMetadata.map(row=>[row.bindingId,row.declarations.requests,row.plots]));
 const columns:ChartCsvColumn[]=[],labels=new Set<string>(),omitted:string[]=[],personalUse:string[]=[],indicatorSettings=new Map<string,object>(rows[0].map(row=>[row.id as string,row.settings as object]));let samples=0;
 const append=(label:string,rows:readonly unknown[],field:string,optional=false)=>{
  samples+=rows.length;if(samples>CHART_CSV_POINT_LIMIT||columns.length>=CHART_CSV_COLUMN_LIMIT)throw Error('Chart CSV numerical output exceeds its bounded capture capacity.');
  const name=text(label);let header=name,ordinal=1;while(labels.has(header))header=name+' ('+(++ordinal)+')';labels.add(header);const points=copyPoints(rows,field,true,optional);
  columns.push(Object.freeze({label:header,points}));proofs.push({rows,field,points,milliseconds:true,optional});
 };
 for(let category=0;category<rows.length;category++)for(const listed of rows[category]){
  assertInput();const id=listed.rendererId;if(typeof id!=='string'||!id)throw Error('A chart study has no accepted current model. Wait for it to finish loading.');
  const record=Reflect.apply(get,registry,[id]),binding=own(record,'native'),descriptor=own(binding,'descriptor'),type=own(binding,'type'),instance=own(binding,'instance'),model=own(record,'model',true),handle=own(record,'renderHandle',true),ctx=own(instance,'ctx',true),settings=own(instance,'settings');
  if(!model||!handle||!ctx)throw Error('A whole-hidden or unavailable study has no accepted current numerical model. Show it and wait for its calculation.');
  const series=dense(own(model,'series'),16),paneId=own(model,'paneId'),pane=panes.get(paneId),hidden=own(record,'hidden',true)===true;
  const seriesRefs=[...series],contextBars=method(ctx,'bars'),metadata=settingsKey(settings,category),result=own(instance,'result',true),requests=requestKey(result);checks.push(()=>{if(own(instance,'result',true)!==result||settingsKey(settings,category)!==metadata||requestKey(result)!==requests)throw stale();});
  const owner=()=>{
   if(own(record,'loading',true)===true||own(record,'pendingStructural',true)===true||own(instance,'recoveryError',true)||Reflect.apply(get,registry,[id])!==record||getNativeIndicator(type)!==descriptor||own(descriptor,'type')!==type||own(binding,'type')!==type||own(binding,'descriptor')!==descriptor||own(binding,'instance')!==instance||own(instance,'removed',true)===true||own(instance,'ctx')!==ctx||own(instance,'settings')!==settings||own(settings,'id')!==listed.id||own(record,'native')!==binding||own(record,'model')!==model||own(record,'renderHandle')!==handle||own(handle,'id')!==id||own(model,'id')!==id||own(own(model,'native'),'type')!==type||own(model,'series')!==series||series.length!==seriesRefs.length||series.some((row,index)=>row!==seriesRefs[index])||own(model,'paneId')!==paneId||panes.get(paneId)!==pane||!pane||method(ctx,'bars')!==contextBars||Reflect.apply(contextBars,ctx,[])!==bars||(own(record,'hidden',true)===true)!==hidden||!hidden&&models.get(id)!==model)throw stale();
   if(category===0&&(own(instance,'displayInput')!==bars||own(own(instance,'acceptedOutput'),'series')!==series))throw stale();
  };owner();checks.push(owner);
  let label:string;
  if(category===0){const kind=own(settings,'kind'),definition=catalogDefinition(kind);label=definition?.name??names[kind];if(!label)throw stale();
   if(usesExtraHistory(listed.id,indicatorSettings)){const name=text(label);let header=name+CHART_CSV_OMITTED_SUFFIX,ordinal=1;while(labels.has(header))header=name+' ('+(++ordinal)+')'+CHART_CSV_OMITTED_SUFFIX;labels.add(header);if(columns.length>=CHART_CSV_COLUMN_LIMIT)throw Error('Chart CSV numerical output exceeds its bounded capture capacity.');columns.push(Object.freeze({label:header,points:Object.freeze([])}));omitted.push(name);continue;}if(indicatorActivePlotIds(kind,own(settings,'inputs')).length&&!series.length)throw Error('A whole-hidden or unavailable study has no retained numerical output to export. Show it and wait for its current results.');}
  else if(category===1){const dataset=own(settings,'dataset'),provenance=own(dataset,'provenance');if(providerTermsApply({datasetId:own(provenance,'datasetId',true),providerId:own(provenance,'providerId',true),fixture:own(provenance,'fixture',true)}))personalUse.push(String(own(provenance,'providerName',true)??''));label='Compare '+text(own(own(dataset,'instrument'),'symbol'))+' ('+(own(settings,'placement',true)==='same-scale'?'rebased':own(settings,'mode'))+')';if(series.length!==1)throw stale();}
  else{label=text(own(settings,'title'));const description=scriptMetadata.find(row=>row.bindingId===listed.id),result=own(instance,'result'),declarations=own(result,'declarations',true);const requested=declarations?dense(own(declarations,'requests'),64):[];if(description?.declarations.requests.length||requested.length){const dependencies=()=>{const live=assertScriptCsvJobDependencies(instance,result,requested);return (description?assertScriptCsvJobDependencies(instance,result,description.declarations.requests):false)||live;};if(dependencies())personalUse.push('');checks.push(dependencies);}if(description?.plots.length&&!dense(own(result,'plots'),16).length)throw Error('Script results are updating. Wait for their current calculation before exporting.');if(own(result,'provenance',true)?.kind==='live')personalUse.push('');const accepted=()=>assertScriptCsvJobModel(instance,result,input,execution,listed.id);accepted();checks.push(accepted);}
  for(const item of series){
   const rawTitle=own(item,'title');
   // Untitled data-window-hidden series are fill/zone anchors, not plots, so they are left out.
   if(category!==1&&isDecorationAnchor(item,rawTitle))continue;
   const seriesLabel=category===1?'Close':plotName(rawTitle),title=label+': '+(category===2&&seriesLabel.startsWith(label+' · ')?seriesLabel.slice(label.length+3):seriesLabel),kind=own(item,'kind');
   checks.push(()=>{if(own(item,'title')!==rawTitle||own(item,'kind')!==kind)throw stale();});
   if(kind==='candle'||kind==='bar'){
    const rows=dense(own(item,'bars'),CHART_CSV_POINT_LIMIT);checks.push(()=>{if(own(item,'bars')!==rows)throw stale();});
    for(const field of ['open','high','low','close'])append(title+' '+field,rows,field);
    if(rows.some(row=>own(row,'volume',true)!==undefined))append(title+' volume',rows,'volume',true);
   }else if(kind==='markers'){continue;}
   else{const rows=dense(own(item,'points'),CHART_CSV_POINT_LIMIT);checks.push(()=>{if(own(item,'points')!==rows)throw stale();});append(title,rows,'value');}
  }
 }
 const assertCurrent=()=>{
  assertInput();frame();domain.assertCurrent();assertSource();
  if(JSON.stringify(scriptOutputs.list(chart.scripts).map(row=>[row.bindingId,row.declarations.requests,row.plots]))!==scriptMetadataKey)throw stale();
  if(chart.indicators!==ports[0]||chart.comparisons!==ports[1]||chart.scripts!==ports[2]||chart.chart!==native||chart.nativeRenderer()!==renderer||own(native,'orchestrator')!==core||own(core,'registry')!==registry||method(registry,'get')!==get||method(registry,'all')!==all||own(core,'renderer')!==renderer||own(core,'bars')!==bars||own(renderer,'scene')!==scene||own(scene,'indicators')!==models||own(scene,'panes')!==panes)throw stale();
  for(const check of checks)check();for(const proof of proofs)assertNumbers(proof);assertInput();
 };
 assertCurrent();const frozen=Object.freeze(columns);capturedColumns.add(frozen);return {columns:frozen,assertCurrent,...(omitted.length?{omitted:Object.freeze(omitted)}:{}),...(personalUse.length?{personalUse:Object.freeze(personalUse)}:{})};
}
