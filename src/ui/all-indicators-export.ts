import packageInfo from '../../package.json';
import type {Bar} from '../domain/types';
import type {IndicatorCalculationOptions,IndicatorResult} from '../domain/indicators';
import {INDICATOR_KINDS,indicatorCreationInputs,indicatorInputSchema} from '../chart/indicator-settings';
import {evaluateDomainIndicator} from '../chart/indicator-port';
import {catalogDefinition} from '../domain/indicator-catalog';
import {secondSymbolSeries} from '../domain/second-symbol';
import {vwapEventDatesFor} from '../domain/vwap-event-anchors';
import {sourcePivotCalendar} from '../domain/indicators-ext/r23-catalog';
import {sourceAxisBasis,sourceExchangeTimeZone} from '../chart/adapter';
import {profileFinerLookup,profileLowerTimeframe,profileSourceContext} from '../chart/vp-visible-range-ltf';
import {indicatorHistoryLookup} from '../chart/indicator-history-lookup';
import type {ChartInputSnapshot} from '../chart/input-visibility';
import {indicatorNames} from './indicator-dialog-model';
import {DRAWING_TOOL_CATALOG} from './drawing-tool-catalog';
import {columnName,formulaSafeText,textZipEntry,xmlText,zipArchive,type ZipEntry} from '../domain/xlsx-zip';
import type {IndicatorId} from '../domain/indicators';

// "Export all indicators (.xlsx)": every built-in at its new-instance defaults, calculated off-chart through the same
// evaluator the chart uses (evaluateDomainIndicator with the chart's own facts), written to one workbook.
export const ALL_INDICATORS_EXPORT_LIMIT=20*1024*1024;
export type IndicatorOptionsFor=(kind:IndicatorId,loading:()=>void)=>IndicatorCalculationOptions;
export interface IndicatorExportColumn{sheet:'Data'|'Patterns';header:string;line:string;values:readonly (number|null)[];note:string}
export interface IndicatorExportEntry{id:IndicatorId;name:string;settings:string;columns:IndicatorExportColumn[];unavailable:string|null;note:string}
export interface DrawingExportRow{tool:string;text:string;anchors:{time:number;price:number}[]}

const plain=(text:string)=>text.replace(/[–—]/g,'-');
const nameOf=(kind:IndicatorId)=>plain((indicatorNames as Record<string,string>)[kind]??kind);
function settingValue(value:unknown):string{if(typeof value==='boolean')return value?'on':'off';if(typeof value==='string')return value===''?'(empty)':value;if(typeof value==='number')return String(value);return JSON.stringify(value)??String(value);}
/** "Length 14, Source close" from the new-instance inputs and the settings dialog titles. */
export function indicatorSettingsText(kind:IndicatorId,inputs:Record<string,unknown>=indicatorCreationInputs(kind)):string{
 let titles:Map<string,string>;try{titles=new Map(indicatorInputSchema(kind).map(field=>[field.key,field.title]));}catch{titles=new Map();}
 return Object.entries(inputs).map(([key,value])=>(titles.get(key)||key)+' '+settingValue(value)).join(', ')||'No inputs';
}
/** Plainer wording where the calculation's own refusal is written for the chart. */
const PLAIN_REASONS:Partial<Record<IndicatorId,string>>={seasonality:'Seasonality is built by a separate chart service from the daily and monthly history of the chart, not from the bars alone, so it cannot be calculated off the chart. Add it to the chart to see it.'};
const finiteCount=(values:readonly (number|null)[])=>{let count=0;for(const value of values)if(typeof value==='number'&&Number.isFinite(value))count++;return count;};
const binary=(values:readonly (number|null)[])=>values.every(value=>value===null||value===0||value===1);
function noteFor(kind:IndicatorId,result:IndicatorResult):string{
 const definition=catalogDefinition(kind),notes:string[]=[];
 if(definition?.pattern==='chart'){
  // The export runs at new-instance inputs, so the breakout input is at its default.
  const breakout=definition.inputs.find(input=>input.key==='breakout');
  notes.push(breakout?.defval===true?'1 on the bar the pattern is confirmed by a breakout close (never earlier, not repainted), else 0. With Require breakout confirmation off, 1 on the bar the pattern\'s last pivot is confirmed.':'1 on the bar the pattern\'s last pivot is confirmed (never earlier, not repainted), else 0.');
 }
 else if(definition?.pattern==='candlestick')notes.push('1 on the bar that completes the pattern, else 0.');
 if(definition?.profile)notes.push('The volume histogram is chart display only; POC, VAH and VAL are the per-bar values.');
 if(definition?.viewport)notes.push('Calculated over the chart\'s visible range at export time.');
 if(result.projection)notes.push('Values projected past the last bar are chart display only and are not included.');
 if(result.diagnostics.length)notes.push('Notice: '+plain(result.diagnostics.join(' ')));
 return notes.join(' ');
}
/** One indicator: its columns, or the plain reason it cannot run here. A throwing indicator becomes "Not available". */
export function exportEntry(kind:IndicatorId,result:IndicatorResult|null,failure?:unknown):IndicatorExportEntry{
 const name=nameOf(kind);let settings:string;try{settings=indicatorSettingsText(kind);}catch{settings='';}
 if(!result)return {id:kind,name,settings,columns:[],unavailable:'Calculation failed: '+plain(failure instanceof Error?failure.message:String(failure)),note:''};
 const definition=catalogDefinition(kind),series=result.series.filter(row=>Array.isArray(row.values));
 if(!series.some(row=>finiteCount(row.values)>0)&&result.diagnostics.length)return {id:kind,name,settings,columns:[],unavailable:PLAIN_REASONS[kind]??plain(result.diagnostics.join(' ')),note:''};
 const hidden=new Set(definition?.plots.filter(plot=>plot.visible===false).map(plot=>plot.id)??[]);
 const columns=series.map((row):IndicatorExportColumn=>{const line=plain(row.label||row.id),notes:string[]=[];if(hidden.has(row.id))notes.push('Hidden on the chart by default.');if(!finiteCount(row.values))notes.push('No values on this data at the default settings.');
  return {sheet:definition?.pattern&&binary(row.values)?'Patterns':'Data',header:name+' - '+line,line,values:row.values,note:notes.join(' ')};});
 return {id:kind,name,settings,columns,unavailable:columns.length?null:'It has no per-bar values to export.',note:noteFor(kind,result)};
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
/**
 * Every built-in (INDICATOR_KINDS, the Indicators dialog list) at its new-instance inputs. Kinds that report loading
 * (second symbols, finer or daily history) are retried for a few seconds before they are reported as not available.
 */
export async function computeAllIndicators(bars:readonly Bar[],optionsFor:IndicatorOptionsFor,options:{kinds?:readonly IndicatorId[];evaluate?:typeof evaluateDomainIndicator;yieldEvery?:number;retryMs?:number;retries?:number;assertCurrent?:()=>void}={}):Promise<IndicatorExportEntry[]>{
 const kinds=options.kinds??INDICATOR_KINDS,evaluate=options.evaluate??evaluateDomainIndicator,yieldEvery=options.yieldEvery??12,assert=options.assertCurrent??(()=>{});
 const entries=new Map<IndicatorId,IndicatorExportEntry>();let pending=new Set<IndicatorId>();
 const run=(kind:IndicatorId)=>{let loading=false;try{const result=evaluate(kind,bars,indicatorCreationInputs(kind),optionsFor(kind,()=>{loading=true;}));entries.set(kind,exportEntry(kind,result));}catch(error){entries.set(kind,exportEntry(kind,null,error));}if(loading)pending.add(kind);};
 for(let index=0;index<kinds.length;index++){if(index&&index%yieldEvery===0){await pause(0);assert();}run(kinds[index]);}
 for(let attempt=0;pending.size&&attempt<(options.retries??8);attempt++){await pause(options.retryMs??500);assert();const again=[...pending];pending=new Set();for(const kind of again)run(kind);}
 for(const kind of pending){const entry=entries.get(kind)!;if(entry.unavailable)entry.unavailable='Still loading the data it needs after waiting. Try the export again in a moment. ('+entry.unavailable+')';}
 return kinds.map(kind=>entries.get(kind)!).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.id.localeCompare(b.id));
}
/** The chart's own calculation facts for each kind (the presentation context the indicator port builds for a chart). */
export function chartIndicatorOptions(input:ChartInputSnapshot,viewport:{from:number;to:number}|null):IndicatorOptionsFor{
 const source=input.source,resolution=source.resolution??null,basis=sourceAxisBasis(source),calendar=sourcePivotCalendar(basis?.assetClass,basis?.timezone)??null,exchangeZone=sourceExchangeTimeZone(source)??null,profile=profileSourceContext(source,input.bars);
 return (kind,loading)=>{
  const definition=catalogDefinition(kind),out:IndicatorCalculationOptions={resolution,calendar};
  if(definition?.tradingSessions)Object.assign(out,{tickSize:profile.tickSize??null,exchangeZone,style:input.style});
  if(kind==='vwap')Object.assign(out,{corporateActions:vwapEventDatesFor(profile.instrument),exchangeZone});
  if(definition&&(definition.profile||definition.viewport||definition.finerBars||definition.dailyHistory)){const isProfile=definition.profile===true,finerBars=isProfile?profileFinerLookup(profile.datasetId,resolution,loading,undefined,profile.requestSource,profile.profileSource):indicatorHistoryLookup(profile.datasetId,resolution,loading,undefined,profile.requestSource);
   Object.assign(out,{visibleRange:viewport,tickSize:profile.tickSize??null,lowerTimeframe:isProfile&&!profile.requestSource?profileLowerTimeframe(profile.instrument,resolution,undefined,profile.profileSource):null,...(finerBars?{finerBars}:{})});}
  if(definition?.secondSymbol)out.secondSeries=symbol=>{const series=secondSymbolSeries(symbol,resolution);if(series.state==='loading')loading();return series;};
  return out;
 };
}
const TOOL_LABELS:ReadonlyMap<string,string>=new Map(DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(section=>section.leaves.flatMap(leaf=>leaf.target.kind==='tool'?[[leaf.target.type,leaf.label] as const]:[]))).reverse());
/** Drawing rows from the chart's drawing manager list: tool name, anchors (epoch ms) and text. */
export function drawingExportRows(rows:readonly Record<string,unknown>[]):DrawingExportRow[]{
 return rows.map(row=>{const type=String(row.type??''),text=row.text&&typeof row.text==='object'?(row.text as {value?:unknown}).value:undefined,anchors=Array.isArray(row.anchors)?row.anchors:[];
  return {tool:plain(TOOL_LABELS.get(type)??type),text:typeof text==='string'?text:'',anchors:anchors.flatMap(point=>point&&typeof point==='object'&&Number.isFinite((point as {time?:number}).time)&&Number.isFinite((point as {price?:number}).price)?[{time:(point as {time:number}).time,price:(point as {price:number}).price}]:[])};});
}

// ---------------------------------------------------------------------------------------------------------------
// Workbook. Cells omit the optional r references (rows and cells are written in order, blanks as <c/>), numbers are
// written with String(value), every part is deflated. Style 1 is a UTC date-time, style 2 a bold header.
type Cell=number|string|null|{date:number};
const excelDate=(seconds:number)=>seconds/86400+25569;
const iso=(seconds:number)=>new Date(seconds*1000).toISOString().replace('T',' ').replace(/\.000Z$/,'').replace(/Z$/,'');
function cellXml(cell:Cell,header=false):string{
 if(cell===null)return '<c/>';
 if(typeof cell==='number')return Number.isFinite(cell)?`<c><v>${String(cell)}</v></c>`:'<c/>';
 if(typeof cell==='object')return Number.isFinite(cell.date)?`<c s="1"><v>${String(cell.date)}</v></c>`:'<c/>';
 const text=xmlText(formulaSafeText(cell));return `<c${header?' s="2"':''} t="inlineStr"><is><t${/^\s|\s$/.test(text)?' xml:space="preserve"':''}>${text}</t></is></c>`;
}
function rowXml(cells:readonly Cell[],header=false):string{let end=cells.length;while(end>0&&cells[end-1]===null)end--;let out='<row>';for(let i=0;i<end;i++)out+=cellXml(cells[i],header);return out+'</row>';}
interface SheetSpec{name:string;freeze:{columns:number;rows:number}|null;widths:readonly [number,number,number][];rows:()=>Iterable<string>}
function* sheetChunks(sheet:SheetSpec):Generator<string>{
 const freeze=sheet.freeze,pane=freeze?`<sheetViews><sheetView workbookViewId="0"><pane${freeze.columns?` xSplit="${freeze.columns}"`:''} ySplit="${freeze.rows}" topLeftCell="${columnName(freeze.columns)}${freeze.rows+1}" activePane="${freeze.columns?'bottomRight':'bottomLeft'}" state="frozen"/></sheetView></sheetViews>`:'';
 const cols=sheet.widths.length?'<cols>'+sheet.widths.map(([min,max,width])=>`<col min="${min}" max="${max}" width="${width}" customWidth="1"/>`).join('')+'</cols>':'';
 yield `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>`;
 let buffer='';for(const row of sheet.rows()){buffer+=row;if(buffer.length>=65536){yield buffer;buffer='';}}
 yield buffer+'</sheetData></worksheet>';
}
const STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
export interface AllIndicatorsWorkbookInput{bars:readonly Bar[];symbol:string;interval:string;exampleData:boolean;sourceName:string;exportedAt:Date;entries:readonly IndicatorExportEntry[];drawings:readonly DrawingExportRow[];notes?:readonly string[];appVersion?:string}
export interface AllIndicatorsWorkbook{bytes:Uint8Array;uncompressedBytes:number;dataColumns:number;patternColumns:number;indicators:number;unavailable:number}
export async function allIndicatorsWorkbook(input:AllIndicatorsWorkbookInput,options:{deflate?:boolean}={}):Promise<AllIndicatorsWorkbook>{
 const {bars,entries}=input,columns=entries.flatMap(entry=>entry.columns.map(column=>({entry,column}))),data=columns.filter(row=>row.column.sheet==='Data'),patterns=columns.filter(row=>row.column.sheet==='Patterns');
 const BASE=['Time (UTC)','Open','High','Low','Close','Volume'];
 // Rows are built cell by cell; trailing blanks are left out (a shorter row reads as blank to the right).
 const numeric=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?`<c><v>${String(value)}</v></c>`:'<c/>';
 const finish=(cells:string[])=>{let end=cells.length;while(end>0&&cells[end-1]==='<c/>')end--;return '<row>'+cells.slice(0,end).join('')+'</row>';};
 const dataRows=function*(){yield rowXml([...BASE,...data.map(row=>row.column.header)],true);for(let i=0;i<bars.length;i++){const bar=bars[i],cells=[cellXml({date:excelDate(bar.time)}),numeric(bar.open),numeric(bar.high),numeric(bar.low),numeric(bar.close),numeric(bar.volume)];for(const row of data)cells.push(numeric(row.column.values[i]));yield finish(cells);}};
 const patternRows=function*(){yield rowXml(['Time (UTC)',...patterns.map(row=>row.column.header)],true);for(let i=0;i<bars.length;i++){const cells=[cellXml({date:excelDate(bars[i].time)})];for(const row of patterns){const value=row.column.values[i];cells.push(value===1?'<c><v>1</v></c>':value===0?'<c><v>0</v></c>':'<c/>');}yield finish(cells);}};
 const most=input.drawings.reduce((max,row)=>Math.max(max,row.anchors.length),0);
 const drawingRows=function*(){yield rowXml(['Tool','Text',...Array.from({length:most},(_,i)=>[`Point ${i+1} time (UTC)`,`Point ${i+1} price`]).flat()],true);for(const row of input.drawings)yield rowXml([row.tool,row.text||null,...row.anchors.flatMap(point=>[{date:excelDate(point.time/1000)},point.price] as Cell[])]);};
 const computed=entries.filter(entry=>!entry.unavailable),unavailable=entries.filter(entry=>entry.unavailable);
 const first=bars[0]?.time,last=bars.at(-1)?.time;
 const keyRows=function*(){
  const pair=(label:string,value:Cell)=>rowXml([label,value]);
  yield rowXml(['OpenCandle all-indicators export'],true);
  yield pair('Symbol',input.symbol);yield pair('Interval',input.interval);yield pair('Bars',bars.length);
  yield pair('First bar (UTC)',first===undefined?null:iso(first));yield pair('Last bar (UTC)',last===undefined?null:iso(last));
  yield pair('Exported (UTC)',iso(Math.floor(input.exportedAt.getTime()/1000)));yield pair('App version',input.appVersion??packageInfo.version);
  yield pair('Data',input.exampleData?'Built-in example data. The prices and volume are invented, not real market data.':'Chart data from '+input.sourceName+'.');
  yield pair('Indicators',`${computed.length} of ${entries.length} built-in indicators calculated; ${unavailable.length} not available (listed at the end).`);
  yield pair('Columns',`Data: ${data.length} indicator columns after Time and OHLCV. Patterns: ${patterns.length} signal columns.`);
  yield pair('Settings','Every indicator uses the defaults a new instance gets in the Indicators dialog, calculated by the same code the chart uses. Empty cells mean no value (warm-up or missing data).');
  for(const note of input.notes??[])yield pair('Note',note);
  yield '<row/>';
  yield rowXml(['Sheet','Column','Header','Indicator id','Indicator','Line','Default settings','Note'],true);
  for(const [index,label] of BASE.entries())yield rowXml(['Data',columnName(index),label,null,null,label,null,index===0?'Bar open time in UTC.':index===5?'Empty where the bar has no volume.':null]);
  const listed=(rows:typeof data,sheet:'Data'|'Patterns',offset:number)=>rows.map((row,index)=>rowXml([sheet,columnName(offset+index),row.column.header,row.entry.id,row.entry.name,row.column.line,row.entry.settings,[row.entry.note,row.column.note].filter(Boolean).join(' ')||null]));
  yield* listed(data,'Data',BASE.length);
  yield rowXml(['Patterns','A','Time (UTC)',null,null,'Time (UTC)',null,'Bar open time in UTC.']);
  yield* listed(patterns,'Patterns',1);
  for(const entry of unavailable)yield rowXml([null,null,null,entry.id,entry.name,null,entry.settings,'Not available: '+entry.unavailable]);
 };
 const sheets:SheetSpec[]=[
  {name:'Data',freeze:{columns:1,rows:1},widths:[[1,1,20]],rows:dataRows},
  {name:'Patterns',freeze:{columns:1,rows:1},widths:[[1,1,20]],rows:patternRows},
  {name:'Drawings',freeze:{columns:0,rows:1},widths:[[1,2,24],...(most?[[3,2+2*most,20] as [number,number,number]]:[])],rows:drawingRows},
  {name:'Key',freeze:null,widths:[[1,1,16],[2,2,8],[3,3,48],[4,4,18],[5,6,30],[7,7,48],[8,8,80]],rows:keyRows},
 ];
 const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet,index)=>`<sheet name="${sheet.name}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`;
 const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
 const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
 const rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const parts:ZipEntry[]=[];
 for(const [name,text] of [['[Content_Types].xml',contentTypes],['_rels/.rels',rootRels],['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',workbookRels],['xl/styles.xml',STYLES]] as const)parts.push(await textZipEntry(name,[text],options.deflate));
 for(const [index,sheet] of sheets.entries())parts.push(await textZipEntry(`xl/worksheets/sheet${index+1}.xml`,sheetChunks(sheet),options.deflate));
 const bytes=zipArchive(parts);
 return {bytes,uncompressedBytes:parts.reduce((sum,part)=>sum+part.size,0),dataColumns:data.length,patternColumns:patterns.length,indicators:computed.length,unavailable:unavailable.length};
}
/** Suggested filename: the chart export stem ("GME-SYNTHETIC") plus "-all-indicators.xlsx". */
export const allIndicatorsFileName=(basename:string)=>basename.slice(0,80)+'-all-indicators.xlsx';
