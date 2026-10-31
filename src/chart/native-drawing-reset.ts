import {NativeRenderer,Drawing,Vela,type SerializedDrawing} from '@luxalgo/vela';
import type {ChartDiagnostic,LosslessDrawingDocument} from './contracts';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import {assertDrawingTemplateRecordBudget} from './drawing-template-batch';
import {assertNativeDrawingMatchesCanonical,projectNativeDrawingRecord} from './drawing-canonical';
import {retainFibTrendLineMember,FIB_TREND_LINE_FIELD} from './fib-trend-line-data';
import {retainFibLevelFormatPresence,FIB_LEVEL_FORMAT_FIELD} from './fib-level-format';
import {FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,retainFibLevelPresentationMembers} from './fib-level-presentation-data';
import {sameDrawingData} from './drawing-data-equality';
import {readTrendlineAnnotation} from './trendline-annotation-data';
import {readTrendlineStats,patchTrendlineStats,TRENDLINE_STATS_DEFAULTS} from './trendline-stats-data';
import {observeOwnedDrawingRender,type OwnedDrawingRenderObservation} from './trendline-annotation';
import {resolveDrawingDuplicatePopupPort,type DrawingDuplicatePopupPort} from './drawing-command-router';

type Row=Record<string,any>;
type Method=(this:any,...args:any[])=>any;
export interface NativeDrawingResetProgress{readonly forwardStarted:boolean;readonly forwarded:boolean}
export interface NativeDrawingResetAcceptance{
 readonly accepted:true;
 assertValueOwner():void;
 assertActionOwner():void;
}
export interface NativeDrawingResetPublication{
 readonly count:number;readonly changedCount:number;
 readonly expected:readonly Record<string,unknown>[];readonly next:readonly Record<string,unknown>[];
 /** Private one use, synchronous, after the exact canonical batch has been staged. */
 forward(assertCanonicalOwner:()=>void):NativeDrawingResetAcceptance;
 inspectProgress():NativeDrawingResetProgress;
 assertValueOwner():void;
 assertActionOwner():void;
}
export interface NativeDrawingResetHost{
 document:LosslessDrawingDocument;
 captureOwner():()=>void;
 /** User mutation gate; opening and legitimate native render/rebuild remain read-only. */
 assertMutable():void;
 publish(reset:NativeDrawingResetPublication):void;
 unavailable(message:string):void;
 /** Optional genuine port from the command router installed before this sole popup owner. */
 duplicatePopup?:DrawingDuplicatePopupPort;
 /** Renderer row (synthetic time on a derived chart) -> source-time row, applied before any renderer row is
  * compared with a core or canonical row. Omitted, or the same row on a time chart, means no mapping. */
 rendererRowToSource?(row:Record<string,unknown>):Record<string,unknown>;
}
const installed=new WeakSet<object>();
/** The genuine `get drawings(){return this.drawingsControl}`; a replacement or shadow is refused, not sampled. */
const velaDrawingsGetter=Object.getOwnPropertyDescriptor(Vela.prototype,'drawings')?.get;
const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
const textKeys=['value','color','size','bold','italic','hAlign','vAlign','place','side','lvAnnotation'];
const styleKeys=['lineColor','lineWidth','lineStyle','fillColor','fillOpacity','arrowLeft','arrowRight','extendLeft','extendRight'];
const fibKeys=['levels','numbersSize','labelsSize','showRatios','showPrices','labelSide','background','reverse',FIB_LEVEL_FORMAT_FIELD,FIB_TREND_LINE_FIELD,FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function rowEqual(left:Row,right:Row):boolean{if(!equal(left,right))return false;if(left.type!=='fibretracement'&&right.type!=='fibretracement')return true;for(const key of [FIB_LEVEL_FORMAT_FIELD,FIB_TREND_LINE_FIELD,FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD]){const a=left.props&&Object.getOwnPropertyDescriptor(left.props,key),b=right.props&&Object.getOwnPropertyDescriptor(right.props,key);if(!!a!==!!b||a&&b&&(!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value')||!sameDrawingData(a.value,b.value)))return false;}return true;}
function own(value:unknown,key:string,optional=false):any{if(!value||typeof value!=='object')throw Error('Native Reset owner unavailable: '+key);const field=Object.getOwnPropertyDescriptor(value,key);if(!field){if(optional)return undefined;throw Error('Native Reset data member missing: '+key);}if(!Object.hasOwn(field,'value'))throw Error('Native Reset owner requires data members: '+key);return field.value;}
/** The inherited getter-only accessor for key; an own member of that key is a shadow and is refused. */
function inheritedGetter(value:object,key:string):{owner:object;getter:Method}{if(Object.hasOwn(value,key))throw Error('Native Reset facade accessor mismatch');let depth=0;for(let current=Object.getPrototypeOf(value);current;current=Object.getPrototypeOf(current)){if(++depth>32)throw Error('Native Reset prototype bound exceeded');const field=Object.getOwnPropertyDescriptor(current,key);if(field){if(typeof field.get!=='function'||field.set!==undefined)throw Error('Native Reset facade accessor mismatch');return{owner:current,getter:field.get};}}throw Error('Native Reset facade accessor mismatch');}
function method(value:object,key:string,unclaimed=false):Method{if(unclaimed&&Object.hasOwn(value,key))throw Error('Native Reset method already owned: '+key);for(let current:object|null=value;current;current=Object.getPrototypeOf(current)){const field=Object.getOwnPropertyDescriptor(current,key);if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='function')throw Error('Native Reset method must be data: '+key);return field.value;}}throw Error('Native Reset method missing: '+key);}
function safe<T>(value:T):T{const metrics=measureWorkspaceJSON({value});if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Native Reset resource bound exceeded');return prepareWorkspaceJSON({value}).value as T;}
function safeDrawing(value:Row):Row{return retainFibLevelPresentationMembers(value,retainFibTrendLineMember(value,retainFibLevelFormatPresence(value,safe(value))));}
function canonicalCopy<T>(value:T):T{const metrics=measureWorkspaceJSON({value});if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Native Reset resource bound exceeded');return structuredClone(value);}
function canonicalEqual(left:unknown,right:unknown):boolean{for(const value of [left,right]){const metrics=measureWorkspaceJSON({value});if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Native Reset resource bound exceeded');}return sameDrawingData(left,right);}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const member of Object.values(value))freeze(member);Object.freeze(value);}return value;}
function withoutSettings(value:Row):Row{const result={...value};delete result.style;delete result.text;if(value.type==='fibretracement'&&result.props){result.props={...result.props};for(const key of fibKeys)delete result.props[key];if(!Object.keys(result.props).length)delete result.props;}return result;}
function known(value:unknown,keys:string[]):Row{if(!value||typeof value!=='object')return{};return Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,(value as Row)[key]]));}
function settings(value:Row){return{style:known(value.style,styleKeys),text:known(value.text,textKeys)};}
/** Selected opaque Stats cannot lose fields while the existing JSON snapshot is prepared. */
function assertStatisticsRetained(raw:Row,prepared:Row):void{
 const props=raw.props;if(!props||typeof props!=='object')return;
 const member=Object.getOwnPropertyDescriptor(props,'lvTrendlineStats');if(!member)return;
 const nextProps=prepared.props,next=nextProps&&typeof nextProps==='object'?Object.getOwnPropertyDescriptor(nextProps,'lvTrendlineStats'):undefined;
 const exact=(left:unknown,right:unknown):boolean=>{
  if(Object.is(left,right))return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const keys=Reflect.ownKeys(left),other=Reflect.ownKeys(right);if(keys.length!==other.length)return false;
  return keys.every(key=>{const a=Object.getOwnPropertyDescriptor(left,key),b=Object.getOwnPropertyDescriptor(right,key);return!!a&&!!b&&Object.hasOwn(a,'value')&&Object.hasOwn(b,'value')&&exact(a.value,b.value);});
 };
 if(!Object.hasOwn(member,'value')||!next||!Object.hasOwn(next,'value')||!exact(member.value,next.value))throw Error('Trendline statistics contain values that cannot be retained by Reset. Saved settings were left unchanged.');
}
function resetRecord(previous:Row,actual:Row):Row{
 if(equal(settings(previous),settings(actual)))return previous;
 const next=structuredClone(previous),style={...next.style};for(const key of styleKeys){delete style[key];if(Object.hasOwn(actual.style,key))style[key]=structuredClone(actual.style[key]);}next.style=style;
 const text={...next.text};for(const key of textKeys){delete text[key];if(actual.text&&Object.hasOwn(actual.text,key))text[key]=structuredClone(actual.text[key]);}if(Object.keys(text).length)next.text=text;else delete next.text;
 return next;
}

/** Capability installer for exact native popup Reset actions. No ordinary omission policy changes. */
export function installNativeDrawingReset(renderer:NativeRenderer,chart:Vela,host:NativeDrawingResetHost):{diagnostics():ChartDiagnostic[];dispose():void}{
 if(!(renderer instanceof NativeRenderer)||installed.has(renderer))throw Error('Native Reset renderer invalid or already installed');
 const orchestrator=own(chart,'orchestrator'),facade=own(chart,'drawingsControl'),core=own(facade,'ctrl'),store=own(core,'store'),controller=own(renderer,'userDrawings'),popup=own(controller,'popup'),document=host.document;
 const chartPrototype=Object.getPrototypeOf(chart),accessor=inheritedGetter(chart,'drawings');
 if(accessor.getter!==velaDrawingsGetter||Reflect.apply(accessor.getter,chart,[])!==facade)throw Error('Native Reset facade accessor mismatch');
 /** Pinned resolution: same chart prototype, no shadow, same accessor owner and getter, and it still yields the owned facade. */
 const accessorCurrent=()=>{if(Object.getPrototypeOf(chart)!==chartPrototype)return false;let now:{owner:object;getter:Method};try{now=inheritedGetter(chart,'drawings');}catch{return false;}return now.owner===accessor.owner&&now.getter===accessor.getter&&Reflect.apply(accessor.getter,chart,[])===facade;};
 const get=method(store,'get'),all=method(store,'all'),nativeMap=own(store,'byId'),sync=method(core,'sync'),isOpen=method(popup,'isOpen');
 const duplicatePort=own(host,'duplicatePopup',true) as DrawingDuplicatePopupPort|undefined,duplicate=duplicatePort?resolveDrawingDuplicatePopupPort(duplicatePort,renderer,controller,popup):undefined,closePopup=duplicate?method(popup,'close'):undefined;
 if(!(nativeMap instanceof Map))throw Error('Native Reset native store map unavailable');
 const rendererToSource=own(host,'rendererRowToSource',true) as Method|undefined;if(rendererToSource!==undefined&&typeof rendererToSource!=='function')throw Error('Native Reset renderer time map unavailable');
 /** A renderer row in source time, for comparison with core/canonical rows; the row itself without a time map. */
 const sourceRow=(row:Row):Row=>{if(own(host,'rendererRowToSource',true)!==rendererToSource)throw Error('Native Reset renderer time map changed');if(!rendererToSource)return row;const mapped=Reflect.apply(rendererToSource,host,[row]);if(mapped===row)return row;if(!mapped||typeof mapped!=='object'||mapped.id!==row.id||mapped.type!==row.type)throw Error('Native Reset renderer time map changed row identity');return mapped;};
 const slots:Array<{owner:Row;key:string;original:Method;wrapper?:Method}>=[];
 const reserve=(owner:Row,key:string)=>{const slot={owner,key,original:method(owner,key,true),wrapper:undefined as Method|undefined};slots.push(slot);return slot;};
 const single=reserve(controller,'openSettingsById'),multi=reserve(controller,'openSettingsForSelection'),emit=reserve(controller,'emit'),open=reserve(popup,'open');
 let active=true,observation:OwnedDrawingRenderObservation|undefined,diagnostics:ChartDiagnostic[]=[];
 interface Target{id:string;type:string;core:Row;serialize:Method}
 interface Opening{ids:string[];targets:Target[];checkSource:()=>void}
 interface Session{opening:Opening;active:boolean}
 let currentSession:Session|undefined;
 interface NativeOwner{id:string;type:string;model:Row;serialize:Method;writeProps:Method}
 interface NativeState{coreOwners:NativeOwner[];coreRows:Row[];rendererRows:Row[]}
 interface Reset{session:Session;opening:Opening;before:Row;beforeObject:object;canonicalObject?:object;previous:Row[];models:Row[];snapshots:Row[];coreSnapshots:Row[];native:NativeState;phase:'awaiting-preview'|'preview'|'ready'|'publishing'|'forwarding'|'forwarded';depth:number;emission:boolean;forwardStarted:boolean;finished:boolean;invalidated?:unknown;assertCanonicalOwner?:()=>void;assertAccepted?:()=>void}
 const openings:Array<Opening|undefined>=[],resets:Reset[]=[],renderEntries:Array<{frame:Reset;counted:boolean}|undefined>=[];
 const checkingCanonical=new WeakSet<Reset>();
 function note(error:unknown){const message=String(error).slice(0,900);if(!diagnostics.some(row=>row.message===message))diagnostics=[...diagnostics.slice(-15),{code:'DRAWING_RESET_UNAVAILABLE',feature:'Drawing native Reset',severity:'unavailable',message}];}
 function base(checkObservation=true){if(!active||own(chart,'orchestrator')!==orchestrator||own(orchestrator,'renderer')!==renderer||own(chart,'drawingsControl')!==facade||!accessorCurrent()||own(facade,'ctrl')!==core||own(core,'store')!==store||own(store,'byId')!==nativeMap||method(store,'get')!==get||method(store,'all')!==all||method(core,'sync')!==sync||method(popup,'isOpen')!==isOpen||own(renderer,'userDrawings')!==controller||own(controller,'popup')!==popup||host.document!==document||slots.some(slot=>own(slot.owner,slot.key,true)!==slot.wrapper))throw Error('Native Reset ownership retired or changed');if(checkObservation)observation?.assertCurrent();}
 function checkSession(session:Session){base();if(currentSession!==session||!session.active)throw Error('Native Reset popup session retired or replaced');const selection=safe(own(core,'selectedIds'));if(!equal(selection,session.opening.ids)){session.active=false;throw Error('Native Reset popup ordered selection changed');}const shown=Reflect.apply(isOpen,popup,[]);base();if(currentSession!==session||!session.active||shown!==true)throw Error('Native Reset popup session closed or replaced');}
 function duplicateAction(session:Session,closed:boolean){
  base();if(!duplicate||own(host,'duplicatePopup',true)!==duplicatePort||method(popup,'close')!==closePopup||currentSession!==session||!session.active)throw Error('Duplicate popup session retired or replaced');
  checkOpening(session.opening);if(!equal(safe(own(core,'selectedIds')),session.opening.ids))throw Error('Duplicate popup ordered selection changed');
  const shown=Reflect.apply(isOpen,popup,[]);checkOpening(session.opening);base();
  if(currentSession!==session||!session.active||shown!==!closed||own(host,'duplicatePopup',true)!==duplicatePort||method(popup,'close')!==closePopup||!equal(safe(own(core,'selectedIds')),session.opening.ids))throw Error('Duplicate popup session closed or replaced');
  for(const target of session.opening.targets)if(Map.prototype.get.call(nativeMap,target.id)!==target.core||own(target.core,'id')!==target.id||own(target.core,'type')!==target.type||method(target.core,'serialize')!==target.serialize)throw Error('Duplicate popup native target changed');
 }
 function canonicalRead(opening:Opening){const frame=resets.at(-1);if(frame?.opening!==opening||!frame.assertCanonicalOwner)return;if(checkingCanonical.has(frame))throw Error('Native Reset canonical owner assertion reentered');checkingCanonical.add(frame);try{frame.assertCanonicalOwner();if(frame.canonicalObject){const actual=own(document,'document');if(actual!==frame.canonicalObject&&(frame.forwardStarted||actual!==frame.beforeObject))throw Error('Native Reset canonical identity proof retired');}}finally{checkingCanonical.delete(frame);}}
 function checkOpening(opening:Opening){canonicalRead(opening);base();opening.checkSource();canonicalRead(opening);base();for(const target of opening.targets){const model=Reflect.apply(get,store,[target.id]);if(model!==target.core||own(target.core,'id')!==target.id||own(target.core,'type')!==target.type||method(target.core,'serialize')!==target.serialize)throw Error('Native Reset opening core model changed');}if(opening.targets.length){opening.checkSource();canonicalRead(opening);base();}}
 function snapshot(model:Row,opening:Opening):Row{
  checkOpening(opening);if(!(model instanceof Drawing))throw Error('Native Reset requires an owned native model');
  const candidate:Row={};for(const[key,field]of Object.entries(Object.getOwnPropertyDescriptors(model))){if(!Object.hasOwn(field,'value'))throw Error('Native Reset requires plain native model data');if(typeof field.value!=='function')candidate[key]=field.value;}
  assertDrawingTemplateRecordBudget(candidate);safe(candidate);const serialize=method(model,'serialize'),result=safeDrawing(Reflect.apply(serialize,model,[]));checkOpening(opening);if(method(model,'serialize')!==serialize||result.id!==candidate.id||result.type!==candidate.type)throw Error('Native Reset serializer or model changed');return result;
 }
 function nativeState(opening:Opening):NativeState{
  checkOpening(opening);if(Reflect.apply(mapSize,nativeMap,[])>10000)throw Error('Native Reset native row bound exceeded');const raw=[...Map.prototype.values.call(nativeMap)];
  let owners:NativeOwner[]=[];const ids=new Set<string>();
  // Admit all row data before any serializer in this complete-state read.
  const candidates=raw.map(model=>{if(!(model instanceof Drawing))throw Error('Native Reset native model unavailable');const candidate:Row={};for(const[key,field]of Object.entries(Object.getOwnPropertyDescriptors(model))){if(!Object.hasOwn(field,'value'))throw Error('Native Reset native model requires data members');if(typeof field.value!=='function')candidate[key]=field.value;}assertDrawingTemplateRecordBudget(candidate);if(Array.isArray(candidate.levels)&&candidate.levels.length>2048)throw Error('Native Reset native level limit exceeded');if(typeof candidate.id!=='string'||ids.has(candidate.id)||Reflect.apply(get,store,[candidate.id])!==model)throw Error('Native Reset native membership or identity changed');ids.add(candidate.id);owners.push({id:candidate.id,type:candidate.type,model,serialize:method(model,'serialize'),writeProps:method(model,'writeProps')});return candidate;});
  safe(candidates);checkOpening(opening);const byModel=new Map(owners.map(owner=>[owner.model,owner])),ordered=Reflect.apply(all,store,[]);checkOpening(opening);if(!Array.isArray(ordered)||ordered.length!==owners.length||new Set(ordered).size!==owners.length||ordered.some(model=>!byModel.has(model)))throw Error('Native Reset native membership or identity changed');owners=ordered.map(model=>byModel.get(model)!);
  const assertOwners=()=>{checkOpening(opening);if(Reflect.apply(mapSize,nativeMap,[])!==owners.length)throw Error('Native Reset native membership changed');for(const owner of owners){if(Map.prototype.get.call(nativeMap,owner.id)!==owner.model||own(owner.model,'id')!==owner.id||own(owner.model,'type')!==owner.type||typeof own(owner.model,'zIndex')!=='number'||method(owner.model,'serialize')!==owner.serialize||method(owner.model,'writeProps')!==owner.writeProps)throw Error('Native Reset native membership or identity changed');}const current=Reflect.apply(all,store,[]);checkOpening(opening);if(!Array.isArray(current)||current.length!==owners.length||current.some((model,index)=>model!==owners[index].model))throw Error('Native Reset native membership, order or identity changed during readback');};
  const rendererModels=own(controller,'drawings');if(!Array.isArray(rendererModels)||rendererModels.length!==owners.length)throw Error('Native Reset renderer membership changed');
  safe(rendererModels.map(model=>{if(!(model instanceof Drawing))throw Error('Native Reset renderer model unavailable');const candidate:Row={};for(const[key,field]of Object.entries(Object.getOwnPropertyDescriptors(model))){if(!Object.hasOwn(field,'value'))throw Error('Native Reset renderer requires data members');if(typeof field.value!=='function')candidate[key]=field.value;}assertDrawingTemplateRecordBudget(candidate);if(Array.isArray(candidate.levels)&&candidate.levels.length>2048)throw Error('Native Reset renderer level limit exceeded');return candidate;}));checkOpening(opening);
  assertOwners();const coreRows=owners.map(owner=>snapshot(owner.model,opening));assertOwners();
  const rendererRows=rendererModels.map((model,index)=>{if(own(model,'id')!==owners[index].id||own(model,'type')!==owners[index].type)throw Error('Native Reset renderer order changed');const value=snapshot(model,opening);if(own(controller,'drawings')!==rendererModels||rendererModels[index]!==model)throw Error('Native Reset renderer identity changed during readback');return sourceRow(value);});assertOwners();
  safe({coreRows,rendererRows});assertOwners();return{coreOwners:owners,coreRows,rendererRows};
 }
 function assertNativeState(frame:Reset,next?:Row[]){
  const actual=nativeState(frame.opening),before=frame.native,targetIndex=new Map(frame.opening.ids.map((id,index)=>[id,index]));
  if(actual.coreOwners.length!==before.coreOwners.length)throw Error('Native Reset unrelated native membership changed');
  for(let index=0;index<actual.coreOwners.length;index++){
   const owner=actual.coreOwners[index],prior=before.coreOwners[index];if(owner.model!==prior.model||owner.id!==prior.id||owner.type!==prior.type||owner.serialize!==prior.serialize||owner.writeProps!==prior.writeProps)throw Error('Native Reset unrelated native membership, order or identity changed');
   const target=targetIndex.get(owner.id);if(target===undefined){if(!rowEqual(actual.coreRows[index],before.coreRows[index])||!rowEqual(actual.rendererRows[index],next?actual.coreRows[index]:before.rendererRows[index]))throw Error('Native Reset unrelated native or renderer state changed');continue;}
   if(!equal(withoutSettings(actual.coreRows[index]),withoutSettings(before.coreRows[index]))||!equal(withoutSettings(actual.rendererRows[index]),withoutSettings(before.rendererRows[index])))throw Error('Native Reset target native non-settings state changed');
   if(next){assertNativeDrawingMatchesCanonical(next[target] as SerializedDrawing,actual.coreRows[index] as SerializedDrawing);checkOpening(frame.opening);assertNativeDrawingMatchesCanonical(next[target] as SerializedDrawing,actual.rendererRows[index] as SerializedDrawing);checkOpening(frame.opening);}else if(!rowEqual(actual.coreRows[index],before.coreRows[index]))throw Error('Native Reset target core state changed before forwarding');
  }
 }
 function capture(ids:unknown,checkSource:()=>void):Opening{
  const input=safe(ids);if(!Array.isArray(input)||!input.length||input.length>128||new Set(input).size!==input.length||input.some(id=>typeof id!=='string'||!id||id.length>4096))throw Error('Native Reset requires bounded ordered targets');
  checkSource();base();const targets:Target[]=[];
  for(const id of input){const model=Reflect.apply(get,store,[id]);checkSource();base();if(!model||own(model,'id')!==id)throw Error('Native Reset opening target missing');targets.push({id,type:own(model,'type'),core:model,serialize:method(model,'serialize')});}
  const opening={ids:input,targets,checkSource};checkOpening(opening);return opening;
 }
 function current(opening:Opening){
   checkOpening(opening);safe(own(document,'document'));checkOpening(opening);const raw=document.serialize() as Row,normalized=safe(raw),before=canonicalCopy(raw),rows=before.drawings;if(!Array.isArray(rows)||rows.length>10000)throw Error('Native Reset canonical row bound exceeded');const byId=new Map(rows.map((row:Row)=>[row.id,row])),normalizedById=new Map(normalized.drawings.map((row:Row)=>[row.id,row])),selected=new Set(opening.ids);for(const row of raw.drawings)if(selected.has(row.id)&&row.type==='trendline')assertStatisticsRetained(row,normalizedById.get(row.id) as Row);checkOpening(opening);const drawings=own(controller,'drawings');if(!Array.isArray(drawings)||drawings.length>10000)throw Error('Native Reset renderer model bound exceeded');
  for(const target of opening.targets){const prior=byId.get(target.id);if(!prior)throw Error('Native Reset canonical target missing');assertDrawingTemplateRecordBudget(prior);safe(prior);}
  const native=nativeState(opening);
  const previous:Row[]=[],models:Row[]=[],snapshots:Row[]=[],coreSnapshots:Row[]=[];
  for(const target of opening.targets){const prior=byId.get(target.id) as Row|undefined,model=drawings.find(value=>own(value,'id')===target.id);if(!prior||!model||prior.type!==target.type||own(model,'type')!==target.type)throw Error('Native Reset target type or row changed');assertDrawingTemplateRecordBudget(prior);safe(prior);const native=snapshot(target.core,opening),rendered=snapshot(model,opening);assertNativeDrawingMatchesCanonical(prior as SerializedDrawing,native as SerializedDrawing);assertNativeDrawingMatchesCanonical(native as SerializedDrawing,sourceRow(rendered) as SerializedDrawing);checkOpening(opening);previous.push(prior);models.push(model);snapshots.push(rendered);coreSnapshots.push(native);}
  if(!canonicalEqual(document.serialize(),before))throw Error('Native Reset canonical changed during capture');checkOpening(opening);return{before,previous,models,snapshots,coreSnapshots,native};
 }
 function beforeCore(frame:Reset,staged=false){checkSession(frame.session);checkOpening(frame.opening);if(frame.finished||frame.invalidated)throw Error('Native Reset frame retired');if(!staged&&(own(document,'document')!==frame.beforeObject||!canonicalEqual(document.serialize(),frame.before)))throw Error('Native Reset canonical owner changed');for(let index=0;index<frame.models.length;index++){const model=frame.models[index],target=frame.opening.targets[index];if(!own(controller,'drawings').includes(model)||own(model,'id')!==target.id||own(model,'type')!==target.type)throw Error('Native Reset renderer model retired or retyped');if(!rowEqual(snapshot(target.core,frame.opening),frame.coreSnapshots[index]))throw Error('Native Reset authoritative core values changed before forwarding');}checkOpening(frame.opening);checkSession(frame.session);}
 function recoveryModels(frame:Reset){for(let index=0;index<frame.models.length;index++){const model=frame.models[index],target=frame.opening.targets[index];if(!own(controller,'drawings').includes(model)||own(model,'id')!==target.id||own(model,'type')!==target.type)throw Error('Native Reset preview recovery renderer owner retired');}}
 function recoverPreview(frame:Reset){checkSession(frame.session);checkOpening(frame.opening);recoveryModels(frame);if(own(document,'document')!==frame.beforeObject||!canonicalEqual(document.serialize(),frame.before))throw Error('Native Reset preview recovery canonical owner changed');for(let index=0;index<frame.opening.targets.length;index++)if(!rowEqual(snapshot(frame.opening.targets[index].core,frame.opening),frame.coreSnapshots[index]))throw Error('Native Reset preview recovery core changed');checkOpening(frame.opening);checkSession(frame.session);recoveryModels(frame);frame.phase='forwarded';Reflect.apply(sync,core,[]);checkOpening(frame.opening);checkSession(frame.session);const restored=current(frame.opening);if(restored.snapshots.length!==frame.snapshots.length||restored.snapshots.some((row,index)=>!rowEqual(row,frame.snapshots[index])))throw Error('Native Reset preview recovery did not restore original renderer state');}
 function invoke(session:Session,callback:Method,receiver:unknown,args:any[]){
  const opening=session.opening;checkOpening(opening);checkSession(session);host.assertMutable();checkOpening(opening);checkSession(session);
  const captured=current(opening);for(const row of captured.previous){if(!['trendline','fibretracement'].includes(row.type))throw Error('Native Reset mixed tools are outside the reviewed capability');if(row.type==='trendline'&&readTrendlineAnnotation(row.text).state==='unavailable')throw Error('Native Reset unknown annotation is retained without interpretation');}
  checkSession(session);const frame:Reset={session,opening,...captured,beforeObject:own(document,'document'),phase:'awaiting-preview',depth:0,emission:false,forwardStarted:false,finished:false};resets.push(frame);
  try{const result=Reflect.apply(callback,receiver,args);checkOpening(opening);if(!frame.emission)throw Error('Native Reset callback did not emit its complete synchronous reset');return result;}catch(cause){const failures=[cause];if(!frame.forwardStarted)try{recoverPreview(frame);}catch(recovery){failures.push(recovery);}if(frame.forwardStarted)try{checkOpening(opening);checkSession(session);frame.assertCanonicalOwner?.();checkOpening(opening);checkSession(session);host.unavailable((frame.phase==='forwarded'?'Native Reset values were accepted, but callback or workspace publication failed. Reopen this chart before continuing. ':'Native Reset publication may be partial; native history cannot be restored exactly. Reopen this chart. ')+failures.map(String).join(' | '));}catch(owner){failures.push(owner);}const error=failures.length===1?cause:new AggregateError(failures,'Native Reset callback and recovery failed: '+failures.map(String).join(' | '));note(error);throw error;}finally{frame.finished=true;frame.depth=0;const retired=resets.pop();if(retired!==frame&&active){resets.length=0;throw Error('Native Reset frame stack changed');}}
 }
 function openingMethod(slot:typeof single,many:boolean):Method{return function(...args:any[]){if(this!==controller)return Reflect.apply(slot.original,this,args);base();const ids=safe(many?args[0]:[args[0]]),checkSource=host.captureOwner();if(typeof checkSource!=='function')throw Error('Native Reset source lease unavailable');checkSource();base();let opening:Opening|undefined;if(Array.isArray(ids)&&ids.length){if(duplicate)opening=capture(ids,checkSource);else{const models=ids.map(id=>{const model=Reflect.apply(get,store,[id]);checkSource();base();return model;});if(models.some(model=>model&&['trendline','fibretracement'].includes(own(model,'type'))))opening=capture(ids,checkSource);}}openings.push(opening);try{return Reflect.apply(slot.original,controller,args);}finally{const retired=openings.pop();if(retired!==opening&&active){openings.length=0;throw Error('Native Reset opening stack changed');}}};}
 single.wrapper=openingMethod(single,false);multi.wrapper=openingMethod(multi,true);
 open.wrapper=function(drawings:Row[],anchor:unknown,actions:Row,...args:any[]){
  if(this!==popup)return Reflect.apply(open.original,this,[drawings,anchor,actions,...args]);base();if(currentSession)currentSession.active=false;currentSession=undefined;
  const opening=openings.at(-1);if(!opening)return Reflect.apply(open.original,popup,[drawings,anchor,actions,...args]);checkOpening(opening);
  if(!Array.isArray(drawings)||drawings.length!==opening.ids.length||drawings.some((model,index)=>model!==own(controller,'drawings').find((value:Row)=>own(value,'id')===opening.ids[index])))throw Error('Native Reset popup target order or identity changed');
  const original=own(actions,'resetSettings');if(typeof original!=='function'||Reflect.ownKeys(actions).length>32||Object.values(Object.getOwnPropertyDescriptors(actions)).some(field=>!Object.hasOwn(field,'value')))throw Error('Native Reset callback requires bounded data actions');
  const session:Session={opening,active:false};currentSession=session;let used=false;
  const wrapped={...actions};
  if(opening.targets.some(target=>['trendline','fibretracement'].includes(target.type)))wrapped.resetSettings=function(...values:any[]){if(this!==wrapped)throw Error('Native Reset foreign callback receiver');if(used)throw Error('Native Reset callback consumed');used=true;try{return invoke(session,original,actions,values);}catch(error){note(error);throw error;}};
  if(duplicate){
   const originalDuplicate=own(actions,'duplicate');if(typeof originalDuplicate!=='function')throw Error('Duplicate popup callback unavailable');let duplicateUsed=false,closed=false;
   wrapped.duplicate=function(){if(this!==wrapped)throw Error('Duplicate popup foreign callback receiver');if(duplicateUsed)throw Error('Duplicate popup callback consumed');duplicateUsed=true;
    duplicateAction(session,closed);
    duplicate(opening.ids,()=>duplicateAction(session,closed),()=>{duplicateAction(session,false);const answer=Reflect.apply(closePopup!,popup,[]);if(answer!==undefined)throw Error('Duplicate popup close must finish synchronously');closed=true;});
   };
  }
  const result=Reflect.apply(open.original,popup,[drawings,anchor,wrapped,...args]);checkOpening(opening);if(currentSession!==session||Reflect.apply(isOpen,popup,[])!==true)throw Error('Native Reset popup opening replaced or closed during acquisition');checkOpening(opening);if(currentSession!==session)throw Error('Native Reset popup opening replaced during acquisition');session.active=true;return result;
 };
 emit.wrapper=function(intent:Row){if(this!==controller)return Reflect.apply(emit.original,this,[intent]);base();const frame=resets.at(-1);if(!frame||!['edit','edit-many'].includes(own(intent,'kind',true)))return Reflect.apply(emit.original,controller,[intent]);
  if(frame.emission||frame.phase!=='ready'||frame.depth!==0)throw Error('Native Reset emission is not its completed preview');beforeCore(frame);const safeIntent=safe(intent),docs=safeIntent.kind==='edit'?[safeIntent.doc]:safeIntent.docs;
  const rawDocs=intent.kind==='edit'?[intent.doc]:intent.docs;if(Array.isArray(docs)&&Array.isArray(rawDocs)&&docs.length===rawDocs.length)for(let index=0;index<docs.length;index++)docs[index]=retainFibLevelPresentationMembers(rawDocs[index],retainFibTrendLineMember(rawDocs[index],retainFibLevelFormatPresence(rawDocs[index],docs[index])));
  if(!Array.isArray(docs)||docs.length!==frame.models.length||safeIntent.kind!==(docs.length===1?'edit':'edit-many'))throw Error('Native Reset requires one complete ordered emission');
  const actual=frame.models.map(model=>snapshot(model,frame.opening));for(let index=0;index<actual.length;index++){if(!rowEqual(docs[index],actual[index])||!equal(withoutSettings(actual[index]),withoutSettings(frame.snapshots[index])))throw Error('Native Reset emitted record changed identity, ordinal or non-settings state');}
  const next=frame.previous.map((row,index)=>{
   const styled=equal(settings(frame.coreSnapshots[index]),settings(actual[index]))?row:resetRecord(row,actual[index]);
   const nativeReset=row.type==='fibretracement'?projectNativeDrawingRecord(styled,sourceRow(actual[index])):styled;
   return row.type==='trendline'&&readTrendlineStats(nativeReset.props).state==='supported'?patchTrendlineStats(nativeReset as SerializedDrawing,TRENDLINE_STATS_DEFAULTS) as unknown as Row:nativeReset;
  });const changed=next.map((row,index)=>rowEqual(row,frame.previous[index])?-1:index).filter(index=>index>=0);frame.emission=true;
  if(!changed.length){frame.phase='forwarded';Reflect.apply(sync,core,[]);checkOpening(frame.opening);return;}
  const normalized=actual.map((row,index)=>({...row,style:structuredClone(next[index].style),text:Object.hasOwn(next[index],'text')?structuredClone(next[index].text):null})),forwardIntent=docs.length===1?{...safeIntent,doc:normalized[0]}:{...safeIntent,docs:normalized};
  const replacements=new Map(next.map(row=>[row.id,row])),staged={...frame.before,drawings:frame.before.drawings.map((row:Row)=>replacements.get(row.id)??row)};let used=false,live=true;
  const assertLive=()=>{if(!live||frame.finished)throw Error('Native Reset publication proof retired');};
  const canonical=()=>{assertLive();if(!frame.assertCanonicalOwner)throw Error('Native Reset canonical owner assertion required');checkOpening(frame.opening);assertLive();};
  const valueOwner=()=>{canonical();if(frame.phase!=='forwarded')throw Error('Native Reset accepted value proof unavailable');assertNativeState(frame,next);canonical();};
  const actionOwner=()=>{assertLive();checkOpening(frame.opening);checkSession(frame.session);if(frame.assertCanonicalOwner)canonical();checkSession(frame.session);};
  const receipt:NativeDrawingResetAcceptance=Object.freeze({accepted:true,assertValueOwner(this:NativeDrawingResetAcceptance){if(this!==receipt)throw Error('Native Reset foreign acceptance receiver');valueOwner();},assertActionOwner(this:NativeDrawingResetAcceptance){if(this!==receipt)throw Error('Native Reset foreign acceptance receiver');actionOwner();valueOwner();checkSession(frame.session);}});
  const publication:NativeDrawingResetPublication=Object.freeze({
    count:next.length,changedCount:changed.length,expected:freeze(canonicalCopy(changed.map(index=>frame.previous[index]))),next:freeze(canonicalCopy(changed.map(index=>next[index]))),
   inspectProgress(this:NativeDrawingResetPublication){if(this!==publication)throw Error('Native Reset foreign publication receiver');assertLive();return Object.freeze({forwardStarted:frame.forwardStarted,forwarded:frame.phase==='forwarded'});},
   assertValueOwner(this:NativeDrawingResetPublication){if(this!==publication)throw Error('Native Reset foreign publication receiver');valueOwner();},
   assertActionOwner(this:NativeDrawingResetPublication){if(this!==publication)throw Error('Native Reset foreign publication receiver');actionOwner();},
   forward(this:NativeDrawingResetPublication,assertCanonicalOwner:()=>void):NativeDrawingResetAcceptance{
    if(this!==publication)throw Error('Native Reset foreign publication receiver');if(used||!live)throw Error('Native Reset forward consumed or retired');used=true;
    if(typeof assertCanonicalOwner!=='function')throw Error('Native Reset canonical batch was not staged with its owner assertion');frame.assertCanonicalOwner=assertCanonicalOwner;
    canonical();beforeCore(frame,true);canonical();assertNativeState(frame);canonical();const stagedObject=own(document,'document');if(!canonicalEqual(document.serialize(),staged))throw Error('Native Reset canonical batch was not staged exactly before forwarding');canonical();if(own(document,'document')!==stagedObject)throw Error('Native Reset canonical identity changed during admission');frame.canonicalObject=stagedObject;
    host.assertMutable();canonical();checkSession(frame.session);host.assertMutable();frame.phase='forwarding';frame.forwardStarted=true;Reflect.apply(emit.original,controller,[structuredClone(forwardIntent)]);canonical();assertNativeState(frame,next);canonical();frame.phase='forwarded';frame.assertAccepted=valueOwner;return receipt;
   }
  });
  try{host.assertMutable();beforeCore(frame);frame.phase='publishing';host.publish(publication);frame.assertAccepted?.();checkSession(frame.session);checkOpening(frame.opening);if(!used||(frame.phase as Reset['phase'])!=='forwarded')throw Error('Native Reset host did not forward synchronously');}finally{live=false;}
 };
 const written:typeof slots=[],attempted:typeof slots=[];
 function installation(){if(!active||own(chart,'orchestrator')!==orchestrator||own(orchestrator,'renderer')!==renderer||own(chart,'drawingsControl')!==facade||!accessorCurrent()||own(facade,'ctrl')!==core||own(core,'store')!==store||own(renderer,'userDrawings')!==controller||own(controller,'popup')!==popup)throw Error('Native Reset owner changed during installation');for(const slot of slots){if(written.includes(slot)){if(own(slot.owner,slot.key,true)!==slot.wrapper)throw Error('Native Reset method ownership changed');}else if(Object.hasOwn(slot.owner,slot.key)||method(slot.owner,slot.key)!==slot.original)throw Error('Native Reset method ownership changed');}}
 try{observation=observeOwnedDrawingRender(renderer,{before(){const frame=resets.at(-1);if(frame)try{checkOpening(frame.opening);checkSession(frame.session);}catch(error){frame.invalidated=error;renderEntries.push(undefined);return;}const entry=frame&&!frame.invalidated&&['awaiting-preview','preview','ready'].includes(frame.phase)?{frame,counted:false}:undefined;renderEntries.push(entry);if(!frame||frame.invalidated)return;if(frame.phase==='publishing')throw Error('Native Reset cannot render during canonical staging');if(!entry)return;try{beforeCore(frame);}catch(error){frame.invalidated=error;return;}entry.counted=true;frame.depth++;frame.phase='preview';},after(_kind,outcome){const entry=renderEntries.pop();if(!entry)return;if(entry.counted)entry.frame.depth--;if(outcome.succeeded){try{beforeCore(entry.frame);}catch(error){entry.frame.invalidated=error;return;}if(entry.frame.depth===0)entry.frame.phase='ready';}}});for(const slot of slots){installation();attempted.push(slot);Object.defineProperty(slot.owner,slot.key,{configurable:true,writable:true,value:slot.wrapper});written.push(slot);}installation();base();}catch(cause){active=false;const failures=[cause];try{observation?.dispose();}catch(error){failures.push(error);}for(const slot of [...attempted].reverse())try{if(own(slot.owner,slot.key,true)===slot.wrapper){delete slot.owner[slot.key];if(Object.hasOwn(slot.owner,slot.key)||method(slot.owner,slot.key)!==slot.original)throw Error('Native Reset install cleanup did not restore its method');}else if(written.includes(slot))throw Error('Native Reset install cleanup preserved replacement');}catch(error){failures.push(error);}throw failures.length===1?cause:new AggregateError(failures,'Native Reset installation failed');}
 installed.add(renderer);
 return{diagnostics:()=>diagnostics.map(row=>({...row})),dispose(){if(!active)return;active=false;if(currentSession)currentSession.active=false;currentSession=undefined;installed.delete(renderer);resets.forEach(frame=>frame.finished=true);resets.length=0;openings.length=0;renderEntries.length=0;const failures:unknown[]=[];try{observation?.dispose();}catch(error){failures.push(error);}for(const slot of [...slots].reverse())try{if(own(slot.owner,slot.key,true)!==slot.wrapper)throw Error('Native Reset cleanup preserved replacement: '+slot.key);delete slot.owner[slot.key];}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Native Reset cleanup failed');}};
}
