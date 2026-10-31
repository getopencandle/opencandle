import type {Bar} from '../domain/types';
import {ScriptPositionQueryError,type ScriptLogicalPositions,type ScriptReadoutPosition} from './script-logical-position';
import type {ChartInputSnapshot} from './input-visibility';
import type {ScriptObjects,ScriptPlot,ScriptRenderResult} from './script-port';
import {getNativeIndicator,type NativeIndicatorOutput} from '@luxalgo/vela';
import {readScriptPresentationDispatch} from '../ui/script-binding-runtime';

/** Private renderer presentation authority. This never grants export permission. */
export interface ScriptPresentationInput {input:ChartInputSnapshot;execution:string}
export interface ScriptPresentationLease {isCurrent():boolean;readonly logicalPositions?:ScriptLogicalPositions}
export interface ScriptPresentationHost {
 capture(expected:ScriptPresentationInput,consumed:readonly Bar[],renew:boolean):ScriptPresentationLease|null;
 captureLogical?(expected:ScriptPresentationInput,consumed:readonly Bar[],renew:boolean):ScriptPresentationLease|null;
 /** Display formatting only; this cannot grant input, output or export authority. */
 capturePriceScaleFormat?():ScriptPriceScaleFormat|null;
}
export interface ScriptPresentationNativeOwner extends ScriptPresentationLease {paneId:string}
/** Constructor-private native bookkeeping only; never returned in values or saved bindings. */
export interface ScriptTableNativeState {epoch:object;output:NativeIndicatorOutput|null;native:ScriptPresentationNativeOwner|null;active:object|null;mounted:object|null;input:object|null;result:object|null;expectedPlacement:'chart'|'bottom'|null}
export interface ScriptTableNativeTransition {readonly emptyOnly:boolean;isCurrent():boolean;canRecover():boolean;emit(output:NativeIndicatorOutput):void;recover(output:NativeIndicatorOutput):void;release():void}
export interface ScriptPriceScaleFormat {format(value:number):string;assertCurrent():void}
export interface ScriptPriceScaleHeader {readonly ownerCount:number;readonly plotCount:number}
export interface ScriptPriceScaleEndpoint {readonly ordinal:number;readonly native:object;readonly point:object;readonly value:number;readonly title:string;readonly color:string;assertCurrent():void}
export interface ScriptPriceScaleOwner {readonly key:object;readonly rendererId:string;readonly model:object;readonly series:readonly object[];readonly plots:readonly ScriptPriceScaleEndpoint[];assertCurrent():void}
export interface ScriptPriceScaleFrame {readonly owners:readonly ScriptPriceScaleOwner[];readonly format:ScriptPriceScaleFormat;assertCurrent():void;assertGeneration():void}
interface NativeDisplayRecord {chart:object;producer:object;result:object;mounted:object;series:readonly object[];rendererId:string}
interface DisplayHeaderRecord {pipeline:WeakRef<Pipeline>;epoch:object;chart:WeakRef<object>}
interface DisplaySourceRecord {pipeline:WeakRef<Pipeline>;port:WeakRef<object>;chart:WeakRef<object>}
const displaySources=new WeakMap<object,DisplaySourceRecord>();
const nativeDisplays=new WeakMap<object,NativeDisplayRecord>(),displayHeaders=new WeakMap<object,DisplayHeaderRecord>();
export interface ScriptReadoutRow {label:string;color:string;value:number|null}
export interface ScriptReadoutValue {title:string;paneId:string;visible:boolean;time:number;logicalIndex?:number;axisTime?:number;plots:readonly ScriptReadoutRow[]}
export type ScriptReadoutSnapshot={state:'unavailable';message:string}|{state:'ready';assertCurrent():void;readAt(time:number):ScriptReadoutValue;readPosition?:(position:ScriptReadoutPosition)=>ScriptReadoutValue};
/** Opaque presentation handle: copied or forged handles cannot name an accepted result. */
export interface ScriptTablesSnapshot {readonly opaque?:never}
type ScriptTable=ScriptObjects['tables'][number];
export interface ScriptTablesValue {readonly title:string;readonly tables:readonly (Readonly<Omit<ScriptTable,'cells'>>&{readonly cells:readonly Readonly<ScriptTable['cells'][number]>[]})[]}
const tableViews=new WeakMap<object,ViewKey>(),emptyScriptTables=Object.freeze([]);
function tableValueFor(view:ScriptTablesSnapshot,port?:object):ScriptTablesValue{
 const record=tableViews.get(view),owner=record?.owner.deref(),model=record?.model.deref();if(!owner||!model||!record||port!==undefined&&ports.get(port)!==owner)throw unavailable();try{return owner.tableValue(model,record.version);}catch(error){tableViews.delete(view);throw error;}
}
export function assertScriptTables(view:ScriptTablesSnapshot,port?:object):void{tableValueFor(view,port);}
/** Count exact serialized fixed presentation fields without constructing a serialization or enumerating unknown keys. */
function tableStringBytes(value:string):number{let bytes=2;for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code===34||code===92)bytes+=2;else if(code<32)bytes+=code===8||code===9||code===10||code===12||code===13?2:6;else if(code<128)bytes++;else if(code<2048)bytes+=2;else if(code>=0xd800&&code<=0xdbff&&index+1<value.length&&value.charCodeAt(index+1)>=0xdc00&&value.charCodeAt(index+1)<=0xdfff){bytes+=4;index++;}else bytes+=code>=0xd800&&code<=0xdfff?6:3;}return bytes;}
const tableFields=['id','position','columns','rows','bgColor','frameColor','frameWidth','borderColor','borderWidth'] as const,cellFields=['column','row','text','textColor','bgColor','hAlign','vAlign','textSize','tooltip'] as const;
function fixedTableBytes(row:object,keys:readonly string[]):number{let bytes=2;for(let index=0;index<keys.length;index++){const key=keys[index],value=own(row,key);bytes+=(index?1:0)+key.length+3+(value===null?4:typeof value==='string'?tableStringBytes(value):typeof value==='number'&&Number.isFinite(value)?String(value).length:SCRIPT_PRESENTATION_OUTPUT_BYTES+1);}return bytes;}
function admitScriptTableProjection(tables:ScriptTablesValue['tables'],title:string):void{
 let filled=0,tracks=0,bytes=22+tableStringBytes(title);for(let ordinal=0;ordinal<tables.length;ordinal++){const table=tables[ordinal];filled+=table.cells.length;tracks+=table.rows+table.columns;bytes+=(ordinal?1:0)+fixedTableBytes(table,tableFields)+11;for(let index=0;index<table.cells.length;index++)bytes+=(index?1:0)+fixedTableBytes(table.cells[index],cellFields);}
 if(tables.length>9||filled>500||filled+tracks+tables.length>10000||bytes>SCRIPT_PRESENTATION_OUTPUT_BYTES)throw Error('Script table presentation exceeds the existing output envelope.');
}
export function readScriptTables(view:ScriptTablesSnapshot):ScriptTablesValue{
 const value=tableValueFor(view);admitScriptTableProjection(value.tables,value.title);
 const tables=value.tables.map(table=>Object.freeze({id:table.id,position:table.position,columns:table.columns,rows:table.rows,bgColor:table.bgColor,frameColor:table.frameColor,frameWidth:table.frameWidth,borderColor:table.borderColor,borderWidth:table.borderWidth,cells:Object.freeze(table.cells.map(cell=>Object.freeze({column:cell.column,row:cell.row,text:cell.text,textColor:cell.textColor,bgColor:cell.bgColor,hAlign:cell.hAlign,vAlign:cell.vAlign,textSize:cell.textSize,tooltip:cell.tooltip})))}));
 assertScriptTables(view);return Object.freeze({title:value.title,tables:Object.freeze(tables)});
}
/** Only the port's already validated, cloned graph reaches this function. Bounds precede every walk/freeze. */
export function freezeScriptPresentationTables(result:ScriptRenderResult,title=''):void{
 const tables=result.objects?.tables;if(tables===undefined)return;
 if(!Array.isArray(tables)||tables.length>9)throw Error('Script tables exceed the existing nine-table limit.');
 const color=(value:unknown)=>value===null||typeof value==='string'&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);let filled=0,grid=0;
 for(const table of tables){if(!Number.isSafeInteger(table.id)||table.id<0||!['top_left','top_center','top_right','middle_left','middle_center','middle_right','bottom_left','bottom_center','bottom_right'].includes(table.position)||!Number.isSafeInteger(table.rows)||table.rows<1||table.rows>50||!Number.isSafeInteger(table.columns)||table.columns<1||table.columns>20||!Array.isArray(table.cells)||table.cells.length>500-filled||![table.bgColor,table.frameColor,table.borderColor].every(color)||![table.frameWidth,table.borderWidth].every(value=>Number.isFinite(value)&&value>=0&&value<=20))throw Error('Script tables exceed the existing dimensions, filled-cell or field limits.');filled+=table.cells.length;grid+=table.rows*table.columns;
  if(grid>9000)throw Error('Script tables exceed the existing dense-grid limit.');
  for(const cell of table.cells)if(!Number.isSafeInteger(cell.row)||cell.row<0||cell.row>=table.rows||!Number.isSafeInteger(cell.column)||cell.column<0||cell.column>=table.columns||typeof cell.text!=='string'||cell.text.length>500||typeof cell.tooltip!=='string'||cell.tooltip.length>500||!color(cell.textColor)||!color(cell.bgColor)||!['left','center','right'].includes(cell.hAlign)||!['top','center','bottom'].includes(cell.vAlign)||!['auto','tiny','small','normal','large','huge'].includes(cell.textSize))throw Error('Invalid script table cell.');
 }
 admitScriptTableProjection(tables,title);
 for(const table of tables){for(const cell of table.cells)Object.freeze(cell);Object.freeze(table.cells);Object.freeze(table);}Object.freeze(tables);
}

export interface ScriptPresentationJob {readonly opaque?:never}
/** Inspected only with a transient genuine Runtime private ticket; callers cannot supply this to the mint. */
export interface ScriptPresentationDispatch {bindingId:string;positionMode?:'logical-v1';expected:ScriptPresentationInput|undefined;consumed:readonly Bar[];current:()=>boolean;settled:()=>boolean;signal:AbortSignal}
interface Job {
 bindingId:string;logical:boolean;
 expected:ScriptPresentationInput|null;consumed:readonly Bar[]|null;owner:ScriptPresentationLease|null;
 current:(()=>boolean)|null;settled:(()=>boolean)|null;accepted:boolean;signal:AbortSignal|null;unlisten:(()=>void)|null;
}
/** Outside the Pipeline/job activation: retained pending handles contain only weak owners and one opaque token. */
function makePendingTableOwner(owner:WeakRef<Pipeline>,job:WeakRef<Job>,token:object,bindingId:string):ScriptPresentationLease|null{
 let alive=true;const isCurrent=()=>{if(!alive)return false;const pipeline=owner.deref(),value=job.deref();try{if(!pipeline||!value||!pipeline.pendingTableCurrent(bindingId,token,value)){alive=false;return false;}return true;}catch{alive=false;return false;}};
 return isCurrent()?Object.freeze({isCurrent}):null;
}
interface Accepted {
 bindingId:string;logical:boolean;expected:ScriptPresentationInput;consumed:readonly Bar[];current:()=>boolean;
 origin:ScriptPresentationLease|null;originModel:WeakRef<object>|null;retired:boolean;
}
export interface ScriptPresentationModel {
 id:string;model:object;result:ScriptRenderResult;native:()=>ScriptPresentationNativeOwner|null;
 tableSource?:ScriptObjects['tables']|null;
 tableState?:ScriptTableNativeState;
 paintAccepted?:boolean;
 paintedTables?:readonly object[]|null;
 paintedSeries?:readonly object[]|null;
 paintedPlots?:readonly {native:object;points:readonly object[];tail:object|null}[]|null;
 metadata:()=>{title:string;visible:boolean;styles:Readonly<Record<string,{color?:string;legend?:boolean;visible?:boolean}>>};
}
interface ReadoutMetadata {title:string;visible:boolean;styles:Readonly<Record<string,{color?:string;legend?:boolean;visible?:boolean}>>}
interface ModelState {displayKey:object;version:number;result:ScriptRenderResult;plots:readonly ScriptPlot[];owner:ScriptPresentationLease;native:ScriptPresentationNativeOwner;metadata:ReadoutMetadata;positions:ScriptLogicalPositions|null;view:ScriptReadoutSnapshot|null;display:{native:NativeDisplayRecord;count:number;ordinals:readonly number[];plots:NonNullable<ScriptPresentationModel['paintedPlots']>}|null;scaleVisibility:Readonly<Record<string,boolean>>|null}
interface ViewKey {owner:WeakRef<Pipeline>;model:WeakRef<object>;version:number}
const ports=new WeakMap<object,Pipeline>(),views=new WeakMap<object,ViewKey>();
// Existing electron/script-runtime.cjs emit() budget, not an additional worker allowance.
const SCRIPT_PRESENTATION_OUTPUTS=10000;
const SCRIPT_PRESENTATION_OUTPUT_BYTES=512*1024,SCRIPT_PRESENTATION_TITLE_CHARACTERS=128;
const outputEncoder=new TextEncoder();
const unavailable=()=>Error('Script values are waiting for a current accepted calculation.');
class ReadoutQueryError extends Error{}
function own(object:unknown,key:string):unknown{
 if(!object||typeof object!=='object')throw unavailable();const field=Object.getOwnPropertyDescriptor(object,key);
 if(!field||!Object.hasOwn(field,'value'))throw unavailable();return field.value;
}
function expectedInput(value:ScriptPresentationInput):ScriptPresentationInput{
 const input=own(value,'input'),execution=own(value,'execution'),bars=own(input,'bars'),source=own(input,'source'),style=own(input,'style');
 if(typeof execution!=='string'||!execution||typeof style!=='string'||!Array.isArray(bars)||!source||typeof source!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(source)))throw unavailable();
 const fields=new Set(['datasetId','revision','fixture','label','resolution','basisIdentity','inputIdentity','sessionOverride']),copy:Record<string,unknown>=Object.create(null);
 for(const key of Reflect.ownKeys(source)){if(typeof key!=='string'||!fields.has(key))throw unavailable();const field=Object.getOwnPropertyDescriptor(source,key);if(!field||!Object.hasOwn(field,'value')||!(field.value===undefined||typeof field.value==='string'||key==='fixture'&&typeof field.value==='boolean'))throw unavailable();copy[key]=field.value;}
 return Object.freeze({input:Object.freeze({bars:bars as readonly Bar[],source:Object.freeze(copy) as unknown as ChartInputSnapshot['source'],style}),execution});
}
export function scriptPresentationNumber(row:unknown,key:'time'|'open'|'high'|'low'|'close'|'volume',timeScale=1):number{
 if(!row||typeof row!=='object')throw unavailable();const descriptor=Object.getOwnPropertyDescriptor(row,key);
 if(!descriptor&&key==='volume')return NaN;if(!descriptor||!Object.hasOwn(descriptor,'value'))throw unavailable();
 const value=descriptor.value;if(key==='volume'&&(value===undefined||typeof value==='number'&&Number.isNaN(value)))return NaN;
 if(typeof value!=='number'||!Number.isFinite(value))throw unavailable();return key==='time'?value/timeScale:value;
}
/** Captures the private native input incarnation, including an in-place tail update, in constant space. */
export function captureScriptPresentationInputFrame(chart:object):{rows:readonly unknown[];isCurrent():boolean}|null{
 try{
  const core=own(chart,'orchestrator'),rows=own(core,'bars');if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype)return null;
  const length=own(rows,'length') as number,tail=length?own(rows,String(length-1)):null,fields=['time','open','high','low','close','volume'] as const;
  const values=tail?fields.map(key=>scriptPresentationNumber(tail,key)):null;let alive=true;
  return{rows,isCurrent(){if(!alive)return false;try{const current=own(chart,'orchestrator')===core&&own(core,'bars')===rows&&own(rows,'length')===length&&(!length||own(rows,String(length-1))===tail&&fields.every((key,index)=>Object.is(scriptPresentationNumber(tail,key),values![index])));if(!current)alive=false;return current;}catch{alive=false;return false;}}};
 }catch{return null;}
}
/** Read-only actual native incarnation. No ctx.bars() or source lookup is used by its current check. */
export function captureScriptPresentationNative(chart:object,model:object,descriptor:object|undefined):ScriptPresentationNativeOwner|null{
 try{
  const core=own(chart,'orchestrator'),registry=own(core,'registry'),records=own(registry,'records'),handles=own(core,'handles'),renderer=own(core,'renderer'),scene=own(renderer,'scene');
  const handle=own(model,'handle'),ctx=own(model,'ctx'),inputVersion=own(model,'readoutInput'),result=own(model,'result'),settings=own(model,'settings'),id=own(handle,'id');
  const settingsKeys=['id','title','visible','pane','paneId','ownScale','plots'] as const,settingsValues=settingsKeys.map(key=>{const field=Object.getOwnPropertyDescriptor(settings as object,key);if(field&&!Object.hasOwn(field,'value'))throw unavailable();return field?.value;});
  if(typeof id!=='string'||!id||!descriptor||!ctx||!(records instanceof Map)||Object.getPrototypeOf(records)!==Map.prototype||!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype)return null;
  const record=Map.prototype.get.call(records,id),native=own(record,'native'),type=own(native,'type'),mounted=own(record,'model'),renderHandle=own(record,'renderHandle'),models=own(scene,'indicators'),panes=own(scene,'panes'),paneId=own(mounted,'paneId');
  if(typeof type!=='string'||typeof paneId!=='string'||!paneId||getNativeIndicator(type)!==descriptor||own(native,'descriptor')!==descriptor||own(native,'instance')!==model||Map.prototype.get.call(handles,id)!==handle||!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||!(panes instanceof Map)||Object.getPrototypeOf(panes)!==Map.prototype||Map.prototype.get.call(models,id)!==mounted||!Map.prototype.has.call(panes,paneId))return null;
  const pane=Map.prototype.get.call(panes,paneId);let alive=true;
  const current=()=>{
   if(!alive)return false;try{
    const ok=own(chart,'orchestrator')===core&&own(core,'registry')===registry&&own(registry,'records')===records&&own(core,'handles')===handles&&own(core,'renderer')===renderer&&own(renderer,'scene')===scene&&own(model,'handle')===handle&&own(model,'ctx')===ctx&&own(model,'readoutInput')===inputVersion&&own(model,'result')===result&&own(model,'settings')===settings&&settingsKeys.every((key,index)=>{const field=Object.getOwnPropertyDescriptor(settings as object,key);return(!field||Object.hasOwn(field,'value'))&&Object.is(field?.value,settingsValues[index]);})&&Map.prototype.get.call(records,id)===record&&Map.prototype.get.call(handles,id)===handle&&own(record,'native')===native&&own(native,'descriptor')===descriptor&&own(native,'instance')===model&&getNativeIndicator(type)===descriptor&&own(record,'model')===mounted&&own(record,'renderHandle')===renderHandle&&own(mounted,'paneId')===paneId&&own(scene,'indicators')===models&&own(scene,'panes')===panes&&Map.prototype.get.call(models,id)===mounted&&Map.prototype.get.call(panes,paneId)===pane;
    if(!ok)alive=false;return ok;
   }catch{alive=false;return false;}
  };
  if(!current())return null;const lease={paneId,isCurrent:current};
  try{const series=own(mounted,'series');if(Array.isArray(series)&&Object.getPrototypeOf(series)===Array.prototype)nativeDisplays.set(lease,{chart,producer:model,result:result as object,mounted:mounted as object,series,rendererId:id});}catch{/* Optional scale evidence never changes legacy native readout qualification. */}
  return lease;
 }catch{return null;}
}
/** Destination acknowledgement only; it grants no accepted source or table-content permission. */
export function scriptPresentationTablesApplied(native:ScriptPresentationNativeOwner|null,tables:readonly object[]|null):boolean{try{if(!native||!tables||!native.isCurrent())return false;const record=nativeDisplays.get(native);return!!record&&own(record.mounted,'tables')===tables&&native.isCurrent();}catch{return false;}}

// These arrays are the actual already-admitted SDK output graph, not source or scalar authority.
const tableNativeFields=['series','fills','backgrounds','priceLines','lines','boxes','labels','tables','barColors','polylines','linefills','trades','paneAxis'] as const;
function tableData(value:unknown,key:string):any{if(!value||typeof value!=='object')throw unavailable();const row=Object.getOwnPropertyDescriptor(value,key);if(row&&!Object.hasOwn(row,'value'))throw unavailable();return row?.value;}
function tableNativeOutputApplied(native:ScriptPresentationNativeOwner|null,output:NativeIndicatorOutput):boolean{
 try{const record=native?nativeDisplays.get(native):undefined;if(!record||!native!.isCurrent())return false;return tableNativeFields.every(key=>Object.is(tableData(record.mounted,key),tableData(output,key)))&&native!.isCurrent();}catch{return false;}
}
function tableNativeMethod(value:object,key:string):Function{let next:object|null=value;for(let depth=0;next&&depth<8;depth++,next=Object.getPrototypeOf(next)){const row=Object.getOwnPropertyDescriptor(next,key);if(row){if(!Object.hasOwn(row,'value')||typeof row.value!=='function')throw unavailable();return row.value;}}throw unavailable();}
interface TableNativeFacts {
 owner:WeakRef<Pipeline>;chart:object;model:object;id:string;bindingId:string;result:object;settings:object;settingsValues:unknown[];input:object;ctx:object;
 state:ScriptTableNativeState;epoch:object;key:object;source:ScriptPresentationLease;emptyOnly:boolean;frame:{isCurrent():boolean};
 core:object;registry:object;records:Map<unknown,unknown>;handles:Map<unknown,unknown>;renderer:object;scene:object;models:Map<unknown,unknown>;panes:Map<unknown,unknown>;
 record:object;nativeRecord:object;descriptor:object;type:string;handle:object;renderHandle:unknown;pane:object;paneId:string;ownScale:boolean;
 build:Function;apply:Function;native:ScriptPresentationNativeOwner;currentModel:object;candidate:object|null;baseOutput:NativeIndicatorOutput;failed:boolean;recoveryAttempted:boolean;
}
const tableSettings=['id','title','visible','pane','paneId','ownScale','plots'] as const;
function tablePlacementMode(settings:object):'chart'|'bottom'{const field=Object.getOwnPropertyDescriptor(settings,'tablePlacement');if(!field)return'chart';if(!Object.hasOwn(field,'value')||field.value!=='bottom')throw unavailable();return'bottom';}
const tableMapGet=(map:Map<unknown,unknown>,key:unknown):any=>Map.prototype.get.call(map,key);
function tableNativeHeader(f:TableNativeFacts):boolean{
 try{return own(f.chart,'orchestrator')===f.core&&own(f.core,'registry')===f.registry&&own(f.registry,'records')===f.records&&own(f.core,'handles')===f.handles&&own(f.core,'renderer')===f.renderer&&own(f.renderer,'scene')===f.scene&&own(f.scene,'indicators')===f.models&&own(f.scene,'panes')===f.panes&&tableMapGet(f.records,f.id)===f.record&&tableMapGet(f.handles,f.id)===f.handle&&own(f.record,'native')===f.nativeRecord&&own(f.nativeRecord,'descriptor')===f.descriptor&&own(f.nativeRecord,'instance')===f.model&&getNativeIndicator(f.type)===f.descriptor&&own(f.record,'renderHandle')===f.renderHandle&&tableMapGet(f.panes,f.paneId)===f.pane&&tableData(f.record,'hidden')!==true&&tableNativeMethod(f.core,'buildNativeModel')===f.build&&tableNativeMethod(f.core,'applyModel')===f.apply&&f.frame.isCurrent();}catch{return false;}
}
function tableNativeBase(f:TableNativeFacts):boolean{return tableNativeHeader(f)&&!!f.owner.deref()?.tableNativeOwns(f)&&tableNativeHeader(f);}
function tableNativeCurrent(f:TableNativeFacts):boolean{return !f.failed&&tableNativeBase(f)&&f.state.native===f.native&&f.native.isCurrent()&&own(f.record,'model')===f.currentModel&&tableMapGet(f.models,f.id)===f.currentModel&&own(f.currentModel,'paneId')===f.paneId&&(tableData(f.currentModel,'ownScale')===true)===f.ownScale;}
function tableNativeRecoverable(f:TableNativeFacts):boolean{
 const allowed=(value:unknown)=>value===f.currentModel||!!f.candidate&&value===f.candidate;return tableNativeBase(f)&&allowed(own(f.record,'model'))&&allowed(tableMapGet(f.models,f.id));
}
function tableNativePublish(f:TableNativeFacts,output:NativeIndicatorOutput,recovery:boolean):void{
 if(recovery){if(f.recoveryAttempted||!tableNativeRecoverable(f))throw unavailable();f.recoveryAttempted=true;}else if(!tableNativeCurrent(f))throw unavailable();
 if(!tableNativeFields.every(key=>key==='tables'||Object.is(tableData(output,key),tableData(f.baseOutput,key))))throw unavailable();const tables=tableData(output,'tables');if(!Array.isArray(tables)||f.emptyOnly&&tables.length!==0)throw unavailable();
 const beforeRecord=own(f.record,'model'),beforeScene=tableMapGet(f.models,f.id);
 // EXACT SDK ctx.emit path: build the real candidate first, then apply that exact object. Never patch installed methods.
 const candidate=Reflect.apply(f.build,f.core,[f.record,output]);if(!candidate||typeof candidate!=='object'||!tableNativeBase(f)||own(f.record,'model')!==beforeRecord||tableMapGet(f.models,f.id)!==beforeScene)throw unavailable();
 f.candidate=candidate;const applied=Reflect.apply(f.apply,f.core,[f.id,candidate]);
 if(applied!==true||!tableNativeBase(f)||own(f.record,'model')!==candidate||tableMapGet(f.models,f.id)!==candidate||own(candidate,'paneId')!==f.paneId||(tableData(candidate,'ownScale')===true)!==f.ownScale)throw unavailable();
 const native=captureScriptPresentationNative(f.chart,f.model,f.descriptor),record=native?nativeDisplays.get(native):undefined;
 if(!native||record?.mounted!==candidate||!tableNativeOutputApplied(native,output)||!tableNativeBase(f))throw unavailable();
 // This is the sole witness advance. A same-shaped foreign candidate never reaches it.
 f.native=native;f.currentModel=candidate;f.candidate=null;f.failed=false;f.state.native=native;f.state.output=output;f.state.mounted=candidate;f.state.input=f.input;f.state.result=f.result;
}
/** Outside Pipeline/port activations. Release clears held graph refs; an active call owns only its stack locals. */
function makeTableNativeTransition(facts:TableNativeFacts|null):ScriptTableNativeTransition{
 let held=facts,retired=false,busy=false;const emptyOnly=!!held?.emptyOnly;facts=null;
 const release=()=>{if(retired)return;retired=true;const value=held;held=null;if(value&&value.state.active===value.key){value.state.active=null;value.state.expectedPlacement=null;}};
 const owned=()=>{const value=held;if(retired||busy||!value)throw unavailable();return value;};
 return Object.freeze({emptyOnly,isCurrent(){if(retired||busy||!held)return false;try{if(tableNativeCurrent(held))return true;}catch{/* Retire observed mismatches. */}release();return false;},
  canRecover(){if(retired||busy||!held)return false;try{if(!held.recoveryAttempted&&tableNativeRecoverable(held))return true;}catch{/* Refuse unknown recovery owners. */}release();return false;},
  emit(output:NativeIndicatorOutput){const value=owned();busy=true;try{tableNativePublish(value,output,false);if(retired||held!==value)throw unavailable();}catch(error){value.failed=true;throw error;}finally{busy=false;}},
  recover(output:NativeIndicatorOutput){const value=owned();busy=true;try{tableNativePublish(value,output,true);if(retired||held!==value)throw unavailable();}catch(error){value.failed=true;throw error;}finally{busy=false;}},
  release,
 });
}
/** Called at owned binding, not from hover. Model/settings accessors cannot execute through this seam. */
export function scriptPresentationMetadata(model:object):ReadoutMetadata{
 const settings=own(model,'settings'),title=own(settings,'title'),visible=own(settings,'visible'),styles=own(settings,'plots');
 if(typeof title!=='string'||typeof visible!=='boolean'||!styles||typeof styles!=='object')throw unavailable();
 // A plot the script declared off the status line (ctx.plot display) has no legend value unless a saved style says otherwise.
 let hidden:string[]=[];try{const visuals=own(own(model,'result'),'visuals'),field=visuals&&typeof visuals==='object'?Object.getOwnPropertyDescriptor(visuals,'plotStyles'):undefined,rows=field&&Object.hasOwn(field,'value')?field.value:undefined;
  if(Array.isArray(rows)&&rows.length<=SCRIPT_PRESENTATION_OUTPUTS)hidden=rows.flatMap(row=>{const id='lvplot:'+String(own(row,'title'));return own(own(row,'display'),'legend')===false&&!Object.hasOwn(styles,id)?[id]:[];});}catch{hidden=[];}
 if(hidden.length)return{title,visible,styles:Object.freeze({...(styles as ReadoutMetadata['styles']),...Object.fromEntries(hidden.map(id=>[id,Object.freeze({legend:false})]))})};
 return{title,visible,styles:styles as ReadoutMetadata['styles']};
}
function immutableMetadata(value:ReadoutMetadata,plots:readonly ScriptPlot[]):ReadoutMetadata{
 const title=own(value,'title'),visible=own(value,'visible'),original=own(value,'styles');if(typeof title!=='string'||typeof visible!=='boolean'||!original||typeof original!=='object')throw unavailable();
 const styles:Record<string,{color?:string;legend?:boolean;visible?:boolean}>=Object.create(null);
 for(const plot of plots){const field=Object.getOwnPropertyDescriptor(original,plot.id);if(!field)continue;if(!Object.hasOwn(field,'value')||!field.value||typeof field.value!=='object')throw unavailable();
  const color=Object.getOwnPropertyDescriptor(field.value,'color'),legend=Object.getOwnPropertyDescriptor(field.value,'legend'),shown=Object.getOwnPropertyDescriptor(field.value,'visible');
  if(color&&(!Object.hasOwn(color,'value')||typeof color.value!=='string')||legend&&(!Object.hasOwn(legend,'value')||typeof legend.value!=='boolean')||shown&&(!Object.hasOwn(shown,'value')||typeof shown.value!=='boolean'))throw unavailable();
  styles[plot.id]=Object.freeze({...(color?{color:color.value}:{}),...(legend?{legend:legend.value}:{}),...(shown?{visible:shown.value}:{})});
 }
 return Object.freeze({title,visible,styles:Object.freeze(styles)});
}
function dense(value:unknown,maximum=SCRIPT_PRESENTATION_OUTPUTS):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1)throw unavailable();
 for(let index=0;index<value.length;index++){const field=Object.getOwnPropertyDescriptor(value,String(index));if(!field||!Object.hasOwn(field,'value'))throw unavailable();}
 return value;
}
/** Unknown legacy envelopes keep their old calculation path but receive no UI authority. */
export function freezeScriptPresentationPlots(value:unknown,positions?:ScriptLogicalPositions):ScriptPlot[]|null{
 try{
  const plots=dense(value),ids=new Set<string>();let total=0,bytes=2,plotIndex=0;
  for(const item of plots){
   if(Reflect.ownKeys(item as object).length!==4)return null;
   const id=own(item,'id'),title=own(item,'title'),color=own(item,'color'),points=dense(own(item,'values'),SCRIPT_PRESENTATION_OUTPUTS-total);total+=points.length;
   if(typeof id!=='string'||!id||id.length>135||ids.has(id)||typeof title!=='string'||title.length>SCRIPT_PRESENTATION_TITLE_CHARACTERS||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)||!points.length)return null;ids.add(id);
   bytes+=(plotIndex?1:0)+outputEncoder.encode('{"id":'+JSON.stringify(id)+',"title":'+JSON.stringify(title)+',"color":'+JSON.stringify(color)+',"values":[').length+2;
   if(bytes>SCRIPT_PRESENTATION_OUTPUT_BYTES)return null;
   let previous=-Infinity,pointIndex=0;const values=points as Array<{time:number;value:number|null;index?:number}>;
   for(const point of points){if(Reflect.ownKeys(point as object).length!==(positions?3:2))return null;const time=own(point,'time'),value=own(point,'value'),index=positions?positions.assertEmission(own(point,'index'),time):undefined;
    if(typeof time!=='number'||!Number.isFinite(time)||(positions?index!<=previous:time<=previous)||value!==null&&(typeof value!=='number'||!Number.isFinite(value)))return null;
    bytes+=(pointIndex?1:0)+('{"time":'+time+',"value":'+value+(positions?',"index":'+index:'')+'}').length;if(bytes>SCRIPT_PRESENTATION_OUTPUT_BYTES)return null;
    previous=positions?index!:time;Object.freeze(point);pointIndex++;
   }
   Object.freeze(values);Object.freeze(item);plotIndex++;
  }
  return Object.freeze(plots) as unknown as ScriptPlot[];
 }catch{return null;}
}
function findTime<T>(rows:readonly T[],time:number,get:(row:T)=>number):number{
 let low=0,high=rows.length-1;while(low<=high){const middle=(low+high)>>>1,current=get(rows[middle]);if(current===time)return middle;if(current<time)low=middle+1;else high=middle-1;}return-1;
}
function readView(key:object,time?:number|ScriptReadoutPosition,query=false,positionQuery=false):ScriptReadoutValue|undefined{
 const value=views.get(key),owner=value?.owner.deref(),model=value?.model.deref();if(!value||!owner||!model)throw unavailable();
 return owner.read(model,value.version,time,query,positionQuery);
}
/** These methods close only over their opaque key, outside every producer/model activation. */
function makeReadoutView(key:object,logical=false):Extract<ScriptReadoutSnapshot,{state:'ready'}>{
 const view=Object.freeze({state:'ready' as const,assertCurrent(){readView(key);},readAt(time:number){return readView(key,time,true)!;},...(logical?{readPosition(position:ScriptReadoutPosition){return readView(key,position,true,true)!;}}:{})});
 const record=views.get(key);if(!record)throw unavailable();views.set(view,record);return view;
}

/** Presentation-only typed query. One extra weak index aliases the existing WeakRef record; no new numeric/history storage. */
export function readScriptReadoutPosition(snapshot:ScriptReadoutSnapshot,position:ScriptReadoutPosition):ScriptReadoutValue{return readView(snapshot,position,true,true)!;}

export interface ScriptPresentationControl {
 setNotifier(notify:()=>void):void;
 presentationFor(result:object,bindingId:string):ScriptPresentationLease|null;
 pendingTableOwner(bindingId:string):ScriptPresentationLease|null;
 tableNativeTransition?(model:object,destination?:'chart'|'bottom'):ScriptTableNativeTransition;
 positionsFor(result:object,bindingId:string):ScriptLogicalPositions|null;
 inherit(copy:object,original:object,ownedNumeric:boolean):void;
 bind(value:ScriptPresentationModel):void;
 renew(value:ScriptPresentationModel):void;
 retireModel(model:object):void;
 retireBinding(id:string):void;
 dropModel(model:object,terminal?:boolean):void;
 releaseReplacedResult(model:object,result:object):void;
 renewAll():void;
 capture(model:object|null):ScriptReadoutSnapshot;
 captureTables(model:object|null):ScriptTablesSnapshot;
 retireInput():void;
 dispose():void;
}
/** Factory binds before the port escapes. Existing real ports cannot be rebound by a registrar or a lookalike. */
export function createScriptPresentationPort<P extends object>(host:ScriptPresentationHost|undefined,build:(control:ScriptPresentationControl)=>P,nativeChart?:object):P{
 const pipeline=new Pipeline(host,nativeChart),port=build(pipeline);if(ports.has(port)){pipeline.dispose();throw Error('Script presentation port is already owned.');}ports.set(port,pipeline);return port;
}
export function captureScriptPresentationJob(port:object,runtime:unknown,ticket:object):ScriptPresentationJob|null{
 const dispatch=readScriptPresentationDispatch(runtime,port,ticket);if(!dispatch)return null;
 return ports.get(port)?.job(dispatch)??null;
}
export function scriptPresentationExecutionMode(port:object,job:ScriptPresentationJob|null):'logical-v1'|undefined{return job?ports.get(port)?.executionMode(job):undefined;}
export function stageScriptPresentationResult(port:object,job:ScriptPresentationJob|null,result:object):void{try{ports.get(port)?.stage(job,result);}catch{/* Optional presentation does not block calculation. */}}
export function acceptScriptPresentationJob(port:object,job:ScriptPresentationJob|null):void{try{ports.get(port)?.accept(job);}catch{ports.get(port)?.retireInput();}}
/** Exact pending-job cleanup. An accepted or foreign token cannot revoke a current descendant. */
export function finishScriptPresentationJob(port:object,token:ScriptPresentationJob|null):void{ports.get(port)?.finish(token);}
export function retireScriptPresentationPort(port:object):void{ports.get(port)?.retireInput();}
export function retireScriptPresentationBinding(port:object,id:string):void{ports.get(port)?.retireBinding(id);}
export function renewScriptPresentationPort(port:object):void{try{ports.get(port)?.renewAll();}catch{ports.get(port)?.retireInput();}}

/** Read-only factory lookup. Public metadata and lookalike headers cannot attach a source. */
function displaySourceFor(key:object){const record=displaySources.get(key),pipeline=record?.pipeline.deref(),port=record?.port.deref(),chart=record?.chart.deref();if(!pipeline||!port||!chart||ports.get(port)!==pipeline)throw unavailable();pipeline.assertDisplayActive(chart);return{pipeline,chart};}
/** This factory's methods close only over an opaque key, not a port/chart/producer activation. */
function makeScriptPriceScaleSource(key:object){return Object.freeze({assertCurrent(){displaySourceFor(key);},header(){const{pipeline,chart}=displaySourceFor(key);return pipeline.displayHeader(chart);},read(header:ScriptPriceScaleHeader){const{pipeline,chart}=displaySourceFor(key);return pipeline.displayFrame(header,chart);}});}
/** Descriptive UI capability only; no current data, native membership or numeric authority. */
export function scriptPriceScaleControlsAvailable(port:object):boolean{return ports.get(port)?.displayControlsAvailable()??false;}
export function acquireScriptPriceScaleSource(port:object,chart:object){
 const pipeline=ports.get(port);if(!pipeline)throw unavailable();pipeline.assertDisplayActive(chart);const key={};displaySources.set(key,{pipeline:new WeakRef(pipeline),port:new WeakRef(port),chart:new WeakRef(chart)});return makeScriptPriceScaleSource(key);
}
class Pipeline implements ScriptPresentationControl {
 private jobs=new Map<ScriptPresentationJob,Job>();private candidates=new WeakMap<object,ScriptPresentationJob>();
 private accepted=new WeakMap<object,Accepted>();private models=new Map<object,ModelState>();private registered=new Map<object,ScriptPresentationModel>();private version=0;private closed=false;
 private notify:(()=>void)|null=null;
 private displayChart:WeakRef<object>|undefined;private displayEpoch:object={};private displayPlotCount=0;
 constructor(private host:ScriptPresentationHost|undefined,nativeChart?:object){if(nativeChart)this.displayChart=new WeakRef(nativeChart);}
 setNotifier(notify:()=>void){if(this.notify)throw Error('Script presentation notifier is already installed.');this.notify=notify;}
 // Only a not-yet-painted acceptance retains its original dispatch lease. A hold is not source retirement.
 private originCurrent(accepted:Accepted):boolean{
  if(accepted.retired)return false;const origin=accepted.origin;if(!origin)return true;
  try{if(origin.isCurrent()&&accepted.origin===origin&&!accepted.retired)return true;}catch{/* Actual origin failure is terminal. */}
  if(accepted.origin===origin){accepted.origin=null;accepted.originModel=null;accepted.retired=true;}return false;
 }
 private acceptedCurrent(accepted:Accepted):boolean{return this.originCurrent(accepted)&&accepted.current()&&this.originCurrent(accepted);}
 private retirePending(accepted:Accepted|undefined,model:object){if(accepted?.origin&&accepted.originModel?.deref()===model){accepted.origin=null;accepted.originModel=null;accepted.retired=true;}}
 releaseReplacedResult(model:object,result:object){const accepted=this.accepted.get(result),current=this.registered.get(model);if(current&&this.accepted.get(current.result)===accepted)return;this.retirePending(accepted,model);}
 private valid(job:Job):boolean{return !this.closed&&!!job.owner&&!!job.current&&job.current()&&!job.signal?.aborted&&job.owner.isCurrent()&&job.current();}
 private clear(job:Job){try{job.unlisten?.();}catch{/* Optional observation cleanup must still release the private graph. */}job.unlisten=null;job.expected=null;job.consumed=null;job.owner=null;job.current=null;job.settled=null;job.signal=null;}
 job(dispatch:Readonly<ScriptPresentationDispatch>):ScriptPresentationJob|null{
  let {expected}=dispatch;const{bindingId,consumed,current,settled,signal,positionMode}=dispatch;
  if(this.closed||!this.host||!expected||signal.aborted||!current())return null;
  try{
   if(consumed.length>5000)return null;expected=expectedInput(expected);const logical=positionMode==='logical-v1',owner=logical?this.host.captureLogical?.(expected,consumed,false):this.host.capture(expected,consumed,false);if(!owner||!owner.isCurrent()||!current())return null;
   const token=Object.freeze({}),job:Job={bindingId,logical,expected,consumed,owner,current,settled,accepted:false,signal,unlisten:null};
   const abort=()=>{const entry=this.jobs.get(token);if(!entry)return;this.jobs.delete(token);this.clear(entry);for(const [model,state]of this.models)if(this.candidates.get(state.result)===token)this.retireModel(model);};
   job.unlisten=()=>signal.removeEventListener('abort',abort);this.jobs.set(token,job);signal.addEventListener('abort',abort,{once:true});
   if(!this.valid(job)){this.jobs.delete(token);this.clear(job);return null;}return token;
  }catch{return null;}
 }
 executionMode(token:ScriptPresentationJob):'logical-v1'|undefined{const job=this.jobs.get(token);try{if(job?.logical&&this.valid(job)&&job.owner?.logicalPositions){job.owner.logicalPositions.assertCurrent();return'logical-v1';}}catch{/* A stale private job cannot select chart transport. */}return;}
 presentationFor(result:object,bindingId:string):ScriptPresentationLease|null{try{const token=this.candidates.get(result),job=token?this.jobs.get(token):undefined,accepted=this.accepted.get(result);let owner:ScriptPresentationLease|null|undefined=null,renewed=false;if(job&&job.bindingId===bindingId&&this.valid(job))owner=job.owner;else if(accepted&&accepted.bindingId===bindingId&&this.acceptedCurrent(accepted)&&this.host){owner=accepted.logical?this.host.captureLogical?.(accepted.expected,accepted.consumed,true):this.host.capture(accepted.expected,accepted.consumed,true);renewed=true;}if(!owner?.isCurrent()||renewed&&accepted&&!this.acceptedCurrent(accepted))return null;owner.logicalPositions?.assertCurrent();return owner.isCurrent()&&(!renewed||!accepted||this.acceptedCurrent(accepted))?owner:null;}catch{return null;}}
 /** Pending return-to-chart can own EMPTY output only. This never grants logical positions or accepted result access. */
 pendingTableOwner(bindingId:string):ScriptPresentationLease|null{
  try{if(this.closed||this.jobs.size>100)return null;let selected:{token:object;job:Job}|null=null;for(const[token,job]of this.jobs)if(job.bindingId===bindingId&&!job.accepted&&this.valid(job)){if(selected)return null;selected={token,job};}if(!selected)return null;
   return makePendingTableOwner(new WeakRef(this),new WeakRef(selected.job),selected.token,bindingId);
  }catch{return null;}
 }
 pendingTableCurrent(bindingId:string,token:object,job:Job):boolean{
  if(this.closed||this.jobs.size>100||this.jobs.get(token)!==job||job.accepted||job.bindingId!==bindingId||!this.valid(job))return false;
  for(const[other,value]of this.jobs)if(other!==token&&value.bindingId===bindingId&&!value.accepted&&this.valid(value))return false;
  return this.jobs.get(token)===job&&!job.accepted&&this.valid(job);
 }

 private bindTableNative(value:ScriptPresentationModel){
  // Initial acknowledgement follows a genuine full render. Metadata renewal must keep that exact mounted model/input/result.
  const state=value.tableState,chart=this.displayChart?.deref();if(!state||!chart||!state.output||state.native)return;const epoch=state.epoch,output=state.output,mounted=state.mounted,input=own(value.model,'readoutInput');
  try{const source=mounted?(value.paintAccepted===false?this.pendingTableOwner(value.id):this.presentationFor(value.result,value.id)):null;if(mounted&&(!source||!source.isCurrent()||state.input!==input||state.result!==value.result))return;
   const native=value.native(),record=native?nativeDisplays.get(native):undefined;if(!native||record?.chart!==chart||record.producer!==value.model||record.result!==value.result||mounted&&record.mounted!==mounted)return;
   if(this.registered.get(value.model)===value&&state.epoch===epoch&&state.output===output&&state.native===null&&own(value.model,'result')===value.result&&own(value.model,'readoutInput')===input&&tableNativeOutputApplied(native,output)&&(!source||source.isCurrent())){state.native=native;state.mounted=record.mounted;state.input=input as object;state.result=value.result;}
  }catch{/* Missing native evidence grants no table transition. */}
 }
 tableNativeOwns(f:TableNativeFacts):boolean{
  const check=()=>{const record=this.registered.get(f.model);return !this.closed&&this.displayChart?.deref()===f.chart&&!!record&&record.id===f.bindingId&&record.result===f.result&&record.tableState===f.state&&f.state.epoch===f.epoch&&f.state.active===f.key&&f.state.expectedPlacement!==null&&tablePlacementMode(f.settings)===f.state.expectedPlacement&&own(f.model,'settings')===f.settings&&own(f.model,'result')===f.result&&own(f.model,'readoutInput')===f.input&&own(f.model,'ctx')===f.ctx&&own(f.model,'handle')===f.handle&&tableSettings.every((key,index)=>Object.is(tableData(f.settings,key),f.settingsValues[index]));};
  try{return check()&&f.source.isCurrent()&&check();}catch{return false;}
 }
 tableNativeTransition(model:object,destination?:'chart'|'bottom'):ScriptTableNativeTransition{
  const registered=this.registered.get(model),chart=this.displayChart?.deref(),state=registered?.tableState;
  if(this.closed||!registered||!chart||!state||!state.output||!state.native||state.active)throw unavailable();
  const epoch=state.epoch,key=Object.freeze({});state.active=key;
  try{
   state.expectedPlacement=tablePlacementMode(own(model,'settings') as object);
   const accepted=registered.paintAccepted===false?null:this.presentationFor(registered.result,registered.id),pending=!accepted&&destination==='chart'&&state.expectedPlacement==='bottom'?this.pendingTableOwner(registered.id):null,source=accepted??pending;
   if(!source||!source.isCurrent()||this.registered.get(model)?.tableState!==state||state.epoch!==epoch||state.active!==key)throw unavailable();
   const native=state.native,display=native?nativeDisplays.get(native):undefined;if(!native||!display||display.chart!==chart||display.producer!==model||display.result!==registered.result||!native.isCurrent()||!tableNativeOutputApplied(native,state.output))throw unavailable();
   const core=own(chart,'orchestrator') as object,registry=own(core,'registry') as object,records=own(registry,'records'),handles=own(core,'handles'),renderer=own(core,'renderer') as object,scene=own(renderer,'scene') as object,models=own(scene,'indicators'),panes=own(scene,'panes');
   if(!(records instanceof Map)||Object.getPrototypeOf(records)!==Map.prototype||!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype||!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||!(panes instanceof Map)||Object.getPrototypeOf(panes)!==Map.prototype)throw unavailable();
   const id=display.rendererId,record=tableMapGet(records,id) as object,nativeRecord=own(record,'native') as object,descriptor=own(nativeRecord,'descriptor') as object,type=own(nativeRecord,'type') as string,handle=own(model,'handle') as object,settings=own(model,'settings') as object,ctx=own(model,'ctx') as object,input=own(model,'readoutInput') as object,paneId=own(display.mounted,'paneId') as string,pane=tableMapGet(panes,paneId) as object,frame=captureScriptPresentationInputFrame(chart);if(!frame)throw unavailable();
   const facts:TableNativeFacts={owner:new WeakRef(this),chart,model,id,bindingId:registered.id,result:registered.result,settings,settingsValues:tableSettings.map(name=>tableData(settings,name)),input,ctx,state,epoch,key,source,emptyOnly:!!pending,frame,core,registry,records,handles,renderer,scene,models,panes,record,nativeRecord,descriptor,type,handle,renderHandle:own(record,'renderHandle'),pane,paneId,ownScale:tableData(display.mounted,'ownScale')===true,build:tableNativeMethod(core,'buildNativeModel'),apply:tableNativeMethod(core,'applyModel'),native,currentModel:display.mounted,candidate:null,baseOutput:state.output,failed:false,recoveryAttempted:false};
   // rendererId routes only this already-proven native member; source qualification remains bindingId/private job based.
   if(!tableNativeCurrent(facts))throw unavailable();return makeTableNativeTransition(facts);
  }catch(error){if(state.active===key){state.active=null;state.expectedPlacement=null;}throw error;}
 }
 positionsFor(result:object,bindingId:string):ScriptLogicalPositions|null{return this.presentationFor(result,bindingId)?.logicalPositions??null;}
 stage(token:ScriptPresentationJob|null,result:object){if(!token)return;const job=this.jobs.get(token);if(!job)return;if(!this.valid(job)){this.finish(token);return;}this.candidates.set(result,token);}
 inherit(copy:object,original:object,ownedNumeric:boolean){
  if(!ownedNumeric)return;const token=this.candidates.get(original);if(token&&this.jobs.has(token))this.candidates.set(copy,token);
  const accepted=this.accepted.get(original);if(accepted&&this.originCurrent(accepted)){this.accepted.set(copy,accepted);this.originCurrent(accepted);}
 }
 accept(token:ScriptPresentationJob|null){
  if(!token)return;const job=this.jobs.get(token);if(!job)return;if(!this.valid(job)||!job.expected||!job.consumed||!job.settled){this.finish(token);return;}
  job.accepted=true;try{job.unlisten?.();}catch{/* Optional observation cleanup must still release the private graph. */}job.unlisten=null;
  // Activation is looked up through the exact candidate's token, never by public binding/plot IDs.
  const expected:ScriptPresentationInput={input:{bars:[],source:job.expected.input.source,style:job.expected.input.style},execution:job.expected.execution};
  for(const [model,value]of this.registered)if(value.id===job.bindingId&&this.candidates.get(value.result)===token){
   this.accepted.set(value.result,{bindingId:job.bindingId,logical:job.logical,expected,consumed:job.consumed,current:job.settled,origin:value.paintAccepted===false?job.owner:null,originModel:value.paintAccepted===false?new WeakRef(model):null,retired:false});
   if(!this.valid(job)){this.retireModel(model);continue;}this.bind(value);
  }
  this.jobs.delete(token);this.clear(job);
  this.notify?.();
 }
 bind(value:ScriptPresentationModel){
  this.retireModel(value.model);if(this.closed)return;this.registered.set(value.model,value);
  const token=this.candidates.get(value.result),job=token?this.jobs.get(token):undefined,accepted=this.accepted.get(value.result);
  if(job&&job.bindingId!==value.id||accepted&&accepted.bindingId!==value.id)return;
  if(accepted&&!this.originCurrent(accepted))return;if(accepted?.origin&&accepted.originModel?.deref()!==value.model)accepted.originModel=new WeakRef(value.model);
  this.bindTableNative(value);if(accepted&&!this.originCurrent(accepted)||value.paintAccepted===false)return;
  const owner=job&&this.valid(job)?job.owner:null;
  if(!owner&&!accepted)return;
  try{
   const native=value.native();if(!native||!native.isCurrent())return;
   let input=owner;
   if(!input&&accepted&&this.host&&this.acceptedCurrent(accepted))input=(accepted.logical?this.host.captureLogical?.(accepted.expected,accepted.consumed,true):this.host.capture(accepted.expected,accepted.consumed,true))??null;
   if(!input||!input.isCurrent()||!native.isCurrent()||accepted&&!this.originCurrent(accepted))return;
   const plots=own(value.result,'plots') as readonly ScriptPlot[];if(!Array.isArray(plots)||!Object.isFrozen(plots))return;
   const frame=input.logicalPositions;let positions:ScriptLogicalPositions|null=null;
   if(frame){if(!freezeScriptPresentationPlots(plots,frame))return;positions=frame;}
   const ownMetadata=value.metadata(),metadata=immutableMetadata(ownMetadata,plots);if(!input.isCurrent()||!native.isCurrent())return;
   const state:ModelState={displayKey:{},version:++this.version,result:value.result,plots,owner:input,native,metadata,positions,view:null,display:null,scaleVisibility:null};
   const nativeDisplay=nativeDisplays.get(native);
   try{if(nativeDisplay&&nativeDisplay.chart===this.displayChart?.deref()&&nativeDisplay.producer===value.model&&nativeDisplay.result===value.result&&nativeDisplay.series===value.paintedSeries&&plots.length<=2048&&value.paintedPlots?.length===plots.length){
    for(let index=0;index<plots.length;index++){const paint=value.paintedPlots[index];if(own(nativeDisplay.series,String(index))!==paint.native||own(paint.native,'points')!==paint.points||own(paint.points,String(paint.points.length-1))!==paint.tail)throw unavailable();}
    const styles=own(ownMetadata,'styles'),flags:Record<string,boolean>=Object.create(null);for(const plot of plots){const style=Object.getOwnPropertyDescriptor(styles as object,plot.id);if(!style)continue;if(!Object.hasOwn(style,'value'))throw unavailable();const flag=Object.getOwnPropertyDescriptor(style.value,'priceScale');if(flag&&(!Object.hasOwn(flag,'value')||typeof flag.value!=='boolean'))throw unavailable();if(flag)flags[plot.id]=flag.value;}state.scaleVisibility=Object.freeze(flags);
    const ordinals:number[]=[];for(let ordinal=0;ordinal<plots.length;ordinal++)if(this.displayValue(state,plots[ordinal])!==null)ordinals.push(ordinal);
    if(input.isCurrent()&&native.isCurrent())state.display={native:nativeDisplay,count:ordinals.length,ordinals:Object.freeze(ordinals),plots:value.paintedPlots};
   }}catch{state.display=null;state.scaleVisibility=null;}
   if(!input.isCurrent()||!native.isCurrent()||accepted&&!this.originCurrent(accepted))return;
   if(state.display?.count&&(!Number.isSafeInteger(this.displayPlotCount+state.display.count))){state.display=null;state.scaleVisibility=null;}
   this.models.set(value.model,state);if(accepted?.origin&&this.acceptedCurrent(accepted)&&this.registered.get(value.model)===value&&this.models.get(value.model)===state){accepted.origin=null;accepted.originModel=null;}if(state.display?.count){this.displayPlotCount+=state.display.count;}this.displayEpoch={};
  }catch{/* Missing presentation proof never retracts a calculation. */}
 }
 finish(token:ScriptPresentationJob|null){
  if(!token)return;const job=this.jobs.get(token);if(!job)return;this.jobs.delete(token);
  const pending=!job.accepted;this.clear(job);
  if(pending)for(const [model,state]of this.models)if(this.candidates.get(state.result)===token)this.retireModel(model);
 }
 renew(value:ScriptPresentationModel){this.bind(value);}
 renewAll(){for(const value of [...this.registered.values()])this.bind(value);}
 retireModel(model:object){const state=this.models.get(model);if(state?.display?.count){this.displayPlotCount-=state.display.count;}if(state){this.models.delete(model);this.displayEpoch={};}}
 retireBinding(id:string){for(const [model,value]of this.registered)if(value.id===id){this.retirePending(this.accepted.get(value.result),model);this.retireModel(model);}for(const [token,job]of this.jobs)if(job.bindingId===id){this.jobs.delete(token);this.clear(job);}}
 dropModel(model:object,terminal=false){const value=this.registered.get(model);if(terminal)this.retirePending(this.accepted.get(value?.result??own(model,'result') as object),model);const state=value?.tableState;if(state){state.epoch={};state.output=null;state.native=null;state.active=null;state.mounted=null;state.input=null;state.result=null;state.expectedPlacement=null;}this.retireModel(model);this.registered.delete(model);}
 displayControlsAvailable():boolean{return !this.closed&&this.displayChart?.deref()!==undefined;}
 assertDisplayActive(chart?:object){if(this.closed||chart!==undefined&&this.displayChart?.deref()!==chart)throw unavailable();}
 displayHeader(chart:object):ScriptPriceScaleHeader{
  this.assertDisplayActive(chart);if(!Number.isSafeInteger(this.models.size)||this.models.size<0||!Number.isSafeInteger(this.displayPlotCount)||this.displayPlotCount<0)throw unavailable();
  const header=Object.freeze({ownerCount:this.models.size,plotCount:this.displayPlotCount});displayHeaders.set(header,{pipeline:new WeakRef(this),epoch:this.displayEpoch,chart:new WeakRef(chart)});return header;
 }
 private displayValue(state:ModelState,plot:ScriptPlot):{point:ScriptPlot['values'][number];index:number;nativeTime:number}|null{
  const style=state.metadata.styles[plot.id];if(!state.metadata.visible||style?.visible===false||state.scaleVisibility?.[plot.id]===false)return null;
  const accepted=this.accepted.get(state.result);if(!accepted?.consumed.length)return null;
  const logical=state.positions,target=logical?logical.count-1:scriptPresentationNumber(own(accepted.consumed,String(accepted.consumed.length-1)),'time');
  const index=findTime(plot.values,target,row=>logical?(row as {index:number}).index:row.time);if(index<0||plot.values[index].value===null)return null;
  const point=plot.values[index];if(logical)logical.assertEmission((point as {index:number}).index,point.time);
  return{point,index,nativeTime:logical?logical.nativeTime(target):target};
 }
 displayFrame(header:ScriptPriceScaleHeader,chart:object):ScriptPriceScaleFrame{
  const ticket=displayHeaders.get(header);if(!ticket||ticket.pipeline.deref()!==this||ticket.chart.deref()!==chart)throw unavailable();
  const epoch=ticket.epoch,assertGeneration=()=>{this.assertDisplayActive();if(this.displayEpoch!==epoch)throw unavailable();};assertGeneration();
  // The painter has admitted these genuine cached counts before requesting materialization.
  if(header.ownerCount>1000||header.plotCount>16000)throw unavailable();
  const format=this.host?.capturePriceScaleFormat?.();assertGeneration();if(!format)throw unavailable();format.assertCurrent();assertGeneration();
  const owners:ScriptPriceScaleOwner[]=[];let points=0;
  for(const [producer,state]of this.models){
   if(!state.display)throw unavailable();const record=state.display.native;
   if(record.chart!==chart||record.producer!==producer||record.result!==state.result)throw unavailable();
   const assertCurrent=()=>{assertGeneration();this.read(producer,state.version);if(this.models.get(producer)!==state||own(record.mounted,'series')!==record.series||nativeDisplays.get(state.native)!==record)throw unavailable();assertGeneration();};assertCurrent();
   const plots:ScriptPriceScaleEndpoint[]=[];
   for(const ordinal of state.display.ordinals){
    const plot=state.plots[ordinal],endpoint=this.displayValue(state,plot);if(!endpoint)throw unavailable();
    const native=own(record.series,String(ordinal)),nativePoints=own(native,'points'),paint=state.display.plots[ordinal];if(native!==paint.native||nativePoints!==paint.points||!Array.isArray(nativePoints)||Object.getPrototypeOf(nativePoints)!==Array.prototype)throw unavailable();
    const at=state.positions?state.positions.count-1:findTime(nativePoints,endpoint.nativeTime*1000,row=>own(row,'time') as number);
    if(at<0)throw unavailable();const point=own(nativePoints,String(at));if(point!==paint.tail)throw unavailable();
    if(own(point,'time')!==endpoint.nativeTime*1000||!Object.is(own(point,'value'),endpoint.point.value)||own(native,'visible')!==true||own(own(native,'display'),'priceScale')!==true)throw unavailable();
    if(++points>header.plotCount)throw unavailable();const color=state.metadata.styles[plot.id]?.color??plot.color;
    const time=endpoint.nativeTime*1000,value=endpoint.point.value!;
    const assertEndpoint=()=>{assertCurrent();if(own(native,'points')!==nativePoints||own(nativePoints,String(at))!==point||own(point,'time')!==time||!Object.is(own(point,'value'),value)||own(native,'visible')!==true||own(own(native,'display'),'priceScale')!==true||own(own(native,'style'),'color')!==color)throw unavailable();assertGeneration();};assertEndpoint();
    plots.push(Object.freeze({ordinal,native:native as object,point:point as object,value,title:plot.title,color,assertCurrent:assertEndpoint}));
   }
   assertCurrent();if(plots.length!==state.display.count)throw unavailable();owners.push(Object.freeze({key:state.displayKey,rendererId:record.rendererId,model:record.mounted,series:record.series,plots:Object.freeze(plots),assertCurrent}));
  }
  if(owners.length!==header.ownerCount||points!==header.plotCount)throw unavailable();
  const assertCurrent=()=>{assertGeneration();format.assertCurrent();for(const owner of owners){owner.assertCurrent();for(const endpoint of owner.plots)endpoint.assertCurrent();}assertGeneration();};assertCurrent();
  return Object.freeze({owners:Object.freeze(owners),format,assertCurrent,assertGeneration});
 }
 capture(model:object|null):ScriptReadoutSnapshot{
  const state=model?this.models.get(model):undefined;
  try{if(!model||!state)throw unavailable();const candidate=this.candidates.get(state.result),pending=candidate?this.jobs.get(candidate):undefined;if(pending&&!pending.accepted)throw unavailable();this.read(model,state.version);if(state.view)return state.view;
   const key={};views.set(key,{owner:new WeakRef(this),model:new WeakRef(model),version:state.version});
   return state.view=makeReadoutView(key,!!state.positions);
  }catch{return Object.freeze({state:'unavailable' as const,message:unavailable().message});}
 }
 captureTables(model:object|null):ScriptTablesSnapshot{
  try{const state=model?this.models.get(model):undefined;if(!model||!state)throw unavailable();this.tableValue(model,state.version);const key=Object.freeze({});tableViews.set(key,{owner:new WeakRef(this),model:new WeakRef(model),version:state.version});return key;}catch{return Object.freeze({});}
 }
 tableValue(model:object,version:number):ScriptTablesValue{
  const state=this.models.get(model),registered=this.registered.get(model);if(!state||state.version!==version||!registered)throw unavailable();
  const assert=()=>{this.read(model,version);if(this.models.get(model)!==state||this.registered.get(model)!==registered||own(model,'result')!==state.result||own(own(model,'settings'),'tablePlacement')!=='bottom'||own(own(model,'settings'),'visible')!==true||!state.metadata.visible)throw unavailable();
   const record=nativeDisplays.get(state.native),tables=record?own(record.mounted,'tables'):null,tableState=registered.tableState,tableNative=tableState?.native,tableRecord=tableNative?nativeDisplays.get(tableNative):undefined;if(!record||record.producer!==model||record.result!==state.result||tables!==registered.paintedTables||!Array.isArray(tables)||tables.length!==0||!tableState?.output||!tableNative||tableRecord?.mounted!==record.mounted||!tableNativeOutputApplied(tableNative,tableState.output))throw unavailable();
  };
  assert();const objects=Object.getOwnPropertyDescriptor(state.result,'objects');if(objects&&!Object.hasOwn(objects,'value'))throw unavailable();const source=objects&&objects.value!==undefined?own(objects.value,'tables'):null;if(source!==registered.tableSource)throw unavailable();const tables=source??emptyScriptTables;if(!Array.isArray(tables)||!Object.isFrozen(tables)||tables.length>9)throw unavailable();assert();return Object.freeze({title:state.metadata.title,tables:tables as ScriptTablesValue['tables']});
 }
 read(model:object,version:number,time?:number|ScriptReadoutPosition,query=false,positionQuery=false):ScriptReadoutValue|undefined{
  const state=this.models.get(model);if(!state||state.version!==version||this.closed)throw unavailable();
  const assert=()=>{if(this.closed||this.models.get(model)!==state||!state.owner.isCurrent()||!state.native.isCurrent()||this.models.get(model)!==state||own(state.result,'plots')!==state.plots)throw unavailable();};
  try{
   assert();const token=this.candidates.get(state.result),job=token?this.jobs.get(token):undefined,accepted=this.accepted.get(state.result);
   if(job&&!job.accepted||!accepted||!this.acceptedCurrent(accepted))throw unavailable();
   if(!query){assert();return;}
   const positions=state.positions;if(positions){const cursor=typeof time==='number'?{kind:'axis-time' as const,time}:time;if(!cursor)throw new ScriptPositionQueryError('Choose a confirmed chart position.');const logicalIndex=positions.indexFor(cursor),eventTime=positions.eventTime(logicalIndex),axisTime=positions.nativeTime(logicalIndex),metadata=state.metadata,plots:ScriptReadoutRow[]=[];for(const plot of state.plots){const style=metadata.styles[plot.id];if(style?.legend===false||positionQuery&&(metadata.visible===false||style?.visible===false))continue;const values=plot.values as Array<{time:number;value:number|null;index:number}>,index=findTime(values,logicalIndex,row=>row.index);if(index>=0)positions.assertEmission(values[index].index,values[index].time);plots.push(Object.freeze({label:plot.title,color:style?.color??plot.color,value:index<0?null:values[index].value}));}assert();positions.assertCurrent();return Object.freeze({title:metadata.title,paneId:state.native.paneId,visible:metadata.visible,time:eventTime,logicalIndex,axisTime,plots:Object.freeze(plots)});}
   if(positionQuery){
    let kind:unknown,axis:unknown;try{kind=own(time,'kind');if(kind==='axis-time')axis=own(time,'time');const keys=Reflect.ownKeys(time as object);if(keys.length!==(kind==='axis-time'?2:1)||keys.some(key=>key!=='kind'&&key!=='time'))throw Error('Invalid position fields.');}catch{throw new ReadoutQueryError('Choose a valid chart position.');}
    if(kind==='latest'){if(!accepted.consumed.length)throw new ReadoutQueryError('No accepted calculation bar is available.');time=scriptPresentationNumber(own(accepted.consumed,String(accepted.consumed.length-1)),'time');}
    else if(kind==='axis-time'&&typeof axis==='number'&&Number.isFinite(axis))time=axis;
    else throw new ReadoutQueryError('No current chart position is available.');
   }
   if(typeof time!=='number'||!Number.isFinite(time))throw new ReadoutQueryError('Choose a finite loaded calculation time for script values.');
   if(findTime(accepted.consumed,time,row=>row.time)<0)throw new ReadoutQueryError('Script values are unavailable outside the accepted calculation rows.');
   const metadata=state.metadata,plots:ScriptReadoutRow[]=[];
   for(const plot of state.plots){const style=metadata.styles[plot.id];if(style?.legend===false||positionQuery&&(metadata.visible===false||style?.visible===false))continue;
    const index=findTime(plot.values,time,row=>row.time);plots.push(Object.freeze({label:plot.title,color:style?.color??plot.color,value:index<0?null:plot.values[index].value}));
   }
   assert();return Object.freeze({title:metadata.title,paneId:state.native.paneId,visible:metadata.visible,time,plots:Object.freeze(plots)});
  }catch(error){if(!(error instanceof ReadoutQueryError)&&!(error instanceof ScriptPositionQueryError)&&this.models.get(model)===state)this.retireModel(model);throw error;}
 }
 retireInput(){for(const value of this.registered.values()){const state=value.tableState;if(state){state.epoch={};state.output=null;state.native=null;state.active=null;state.mounted=null;state.input=null;state.result=null;state.expectedPlacement=null;}}this.displayPlotCount=0;this.displayEpoch={};this.models.clear();for(const job of this.jobs.values())this.clear(job);this.jobs.clear();this.candidates=new WeakMap();}
 dispose(){this.closed=true;for(const [model,value]of this.registered)this.retirePending(this.accepted.get(value.result),model);this.retireInput();this.accepted=new WeakMap();this.registered.clear();this.host=undefined;this.notify=null;this.displayChart=undefined;}
}
