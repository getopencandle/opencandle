import type {SerializedDrawing} from '@luxalgo/vela';
import {deserializeDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import {drawingFields,patchDrawingProperties,patchDrawingEdit,isTrendlineStatsPath,assertTrendlineStatsPatchValues,assertDrawingLevelPatchValues,type DrawingCoordinatePatch,type DrawingCoordinateContext} from './drawing-port';
import type {Bar} from '../domain/types';
import {validateDrawingVisibilityRule,type DrawingVisibilityRule} from './drawing-visibility';
import {DrawingEditRecoveryError} from './drawing-edit-transaction';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';
import {sameDrawingData} from './drawing-data-equality';
import {retainFibLevelFormatPresence,assertFibLevelFormatPatchValues} from './fib-level-format';
import {retainFibTrendLineMember,assertFibTrendLinePatchValues} from './fib-trend-line-data';
import {retainFibLevelPresentationMembers,assertFibLevelPresentationPatchValues,FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,readFibBackground,readFibText} from './fib-level-presentation-data';
import type {OwnedDrawingEditBatch,OwnedDrawingEditAcceptance} from './contracts';

export const DRAWING_TEMPLATE_LIMITS={targets:128,fields:512,levels:2048,bytes:16*1024*1024,nodes:300000,depth:40,work:65536} as const;
type Row=Record<string,unknown>;
export interface PreparedDrawingTemplateBatch{readonly count:number;readonly changedCount:number}
export interface DrawingTemplateReceipt{accepted:true;changed:boolean;recoveryRequired:false}
export class DrawingTemplateBatchError extends Error{
 readonly recoveryRequired=true;readonly nativeHistoryRestored=false;
 constructor(readonly accepted:boolean,readonly causes:unknown[]){super((accepted?'Template changes were accepted, but publication failed.':'Template publication was not confirmed. Native and saved drawing values may differ; native history cannot be restored exactly.')+' Reopen this chart before continuing. '+causes.map(String).join(' | '));this.name='DrawingTemplateBatchError';}
}
export interface DrawingTemplateNativeLease{assertCurrent():void;assertScope():void;assertUnchangedOutsideTargets():void;read():SerializedDrawing[]}
export interface DrawingTemplateBatchHost{
 captureOwner:(ids:readonly string[])=>(checkSelection?:boolean)=>void;
 captureSingleOwner?:()=>(checkSelection?:boolean)=>void;
 readEditContext?:()=>{bars:readonly Bar[];coordinates:DrawingCoordinateContext;intervalVisibilityAvailable:boolean};
 assertMutable:()=>void;
 readDocument:()=>Row;
 captureNative:(ids:readonly string[])=>DrawingTemplateNativeLease;
 prepareEdit:(expected:readonly Row[],next:readonly Row[])=>OwnedDrawingEditBatch;
 begin:()=>void;
 end:(publish:boolean)=>void;
 update:(rows:Array<{id:string;patch:SerializedDrawing}>)=>void;
 quarantine:(message:string)=>void;
}
function bounded(value:unknown){const metrics=measureWorkspaceJSON({value});if(metrics.bytes>DRAWING_TEMPLATE_LIMITS.bytes||metrics.nodes>DRAWING_TEMPLATE_LIMITS.nodes||metrics.depth>DRAWING_TEMPLATE_LIMITS.depth)throw Error('Drawing template resource limit exceeded before native model creation');}
function row(value:unknown):Row{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Drawing template requires a plain record');return value as Row;}
function detached<T>(value:T):T{bounded(value);const prepared=prepareWorkspaceJSON({value}).value as T;return retainFibLevelPresentationMembers(value,retainFibTrendLineMember(value,retainFibLevelFormatPresence(value,prepared)));}
function canonicalDetached<T>(value:T):T{bounded(value);return structuredClone(value);}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function assertDrawingTemplateRecordBudget(value:unknown):void{
 bounded(value);const record=row(value);if(Array.isArray(record.anchors)&&record.anchors.length>10000)throw Error('Drawing target anchor limit exceeded before native model creation');
 const props=record.props;if(props&&typeof props==='object'&&Array.isArray((props as Row).levels)&&((props as Row).levels as unknown[]).length>DRAWING_TEMPLATE_LIMITS.levels)throw Error('Drawing target level limit exceeded before native model creation');
 const text=record.text;if(text&&typeof text==='object'&&typeof(text as Row).value==='string'&&((text as Row).value as string).length>20000)throw Error('Drawing target text limit exceeded before native model creation');
}
export function assertDrawingTemplatePropertiesBudget(properties:Row,targets=1):void{
 bounded(properties);const fields=Object.keys(properties).length;if(fields>DRAWING_TEMPLATE_LIMITS.fields||fields*targets>DRAWING_TEMPLATE_LIMITS.work)throw Error('Drawing template field/work limit exceeded before native model creation');
 if(Object.entries(properties).some(([path,value])=>path.length>128||typeof value==='string'&&value.length>20000))throw Error('Drawing template field/text limit exceeded before native model creation');
}
function templatePatch(record:SerializedDrawing,properties:Row){const drawing=deserializeDrawing(record);if(!drawing)throw Error('Template drawing type is unavailable');const fields=drawingFields(drawing,record);for(const path of Object.keys(properties)){
 if(/^levels\.(0|[1-9]\d*)\.(ratio|color|enabled|label)$/.test(path)){if(Number(path.split('.')[1])>=DRAWING_TEMPLATE_LIMITS.levels)throw Error('Template level limit exceeded');continue;}
 const field=fields.find(value=>value.path===path);if(!field||['locked','visible'].includes(path)||!(['line','fill','text'].includes(field.group??'')||path.startsWith('style.')||path.startsWith('text.')||record.type==='trendline'&&isTrendlineStatsPath(path)))throw Error('Template property is not supported as style; original template retained');
 }
 const edited=patchDrawingProperties(record,properties);
 if(record.type!=='fibretracement')return edited;
 // Explicit template intent can save a complete default tuple. Ordinary editor
 // no-ops still retain omission, and absent template fields never reset a target.
 let result=edited;
 for(const [key,reader] of [[FIB_BACKGROUND_FIELD,readFibBackground],[FIB_TEXT_FIELD,readFibText]] as const){
  if(!Object.hasOwn(record.props??{},key)&&Object.keys(properties).some(path=>path.startsWith(key+'.'))){
   const state=reader(edited.props);if(state.state==='unavailable')throw Error(state.message);
   if(result===edited)result=structuredClone(edited);
   result.props={...(result.props===undefined?{reverse:false}:result.props),[key]:structuredClone(state.settings)};
  }
 }
 return result;
}

export const BULK_PROPERTY_PATHS:readonly string[]=['style.lineColor','style.fillColor','text.color','style.lineWidth','style.lineStyle'];
/** Width choices are exactly these, titled "Line tool widths" for two or more drawings (SDD2#list.lineWidths.floatingToolbar). */
export const BULK_WIDTH_OPTIONS:readonly number[]=[1,2,3,4];
export const BULK_STYLE_OPTIONS:readonly string[]=['solid','dashed','dotted'];
/** SDD2#rule.floatingToolbar.defaultButtons noToolbarWhileSelectedTool: Tweet, Idea and Image. */
export const NO_TOOLBAR_DRAWING_TYPES:readonly string[]=['tweet','idea','image'];
export interface BulkPropertyButton{id:'lineColor'|'backgroundColor'|'textColor'|'lineWidth'|'lineStyle';path:string;title:string;options?:readonly(number|string)[]}
const BULK_BUTTONS:readonly BulkPropertyButton[]=[
 {id:'lineColor',path:'style.lineColor',title:'Line tool colors'},
 {id:'backgroundColor',path:'style.fillColor',title:'Line tool backgrounds'},
 {id:'textColor',path:'text.color',title:'Line tool text colors'},
 {id:'lineWidth',path:'style.lineWidth',title:'Line tool widths',options:BULK_WIDTH_OPTIONS},
 {id:'lineStyle',path:'style.lineStyle',title:'Style',options:BULK_STYLE_OPTIONS},
];
/** Pure model of the multi-selection property bar. A button appears only when every selected tool exposes its property; special-case tools contribute only the default properties they expose through drawingFields. The background rule that hides the button while a tool's fill is off has no stored flag in this build, so it is not modelled. */
export function bulkPropertyBar(records:readonly Row[]):{visible:boolean;buttons:BulkPropertyButton[]}{
 const none={visible:false,buttons:[] as BulkPropertyButton[]};
 if(records.length<2||records.some(value=>!value||typeof value!=='object'||(NO_TOOLBAR_DRAWING_TYPES).includes(String(value.type))))return none;
 let shared:Set<string>|undefined;
 for(const value of records){const drawing=deserializeDrawing(value as unknown as SerializedDrawing);if(!drawing)return none;const names=new Set(drawingFields(drawing,value as unknown as SerializedDrawing).map(field=>field.path));shared=shared?new Set([...shared].filter(path=>names.has(path))):names;}
 const buttons=BULK_BUTTONS.filter(button=>shared!.has(button.path));
 return{visible:buttons.length>0,buttons:buttons.map(button=>({...button}))};
}

/** Private one-use authority; no public serialized row or copied token authorizes publication. */
export function createDrawingTemplateBatches(host:DrawingTemplateBatchHost){
 interface Batch{kind:'template'|'drawing';assertOwner:(checkSelection?:boolean)=>void;document:Row;edit?:OwnedDrawingEditBatch;acceptedDocument?:Row;acceptance?:OwnedDrawingEditAcceptance;acceptanceLive?:boolean;ids:string[];original:Row[];next:Row[];native?:DrawingTemplateNativeLease;used:boolean}
 const batches=new WeakMap<PreparedDrawingTemplateBatch,Batch>(),receipts=new WeakMap<DrawingTemplateReceipt,Batch>();
 let busy=false,acceptedFrame:Batch|undefined;
 const read=(assertOwner:()=>void,beforeDetach?:(raw:Row)=>void)=>{assertOwner();const raw=host.readDocument();assertOwner();if(beforeDetach){bounded(raw);beforeDetach(raw);assertOwner();}const snapshot=canonicalDetached(raw);assertOwner();return snapshot;};
 const assertRows=(batch:Batch,document:Row)=>{batch.assertOwner();if(!sameDrawingData(read(batch.assertOwner),document))throw Error('Drawing source, template, selected record or manager document changed');batch.native?.assertCurrent();batch.assertOwner();};
 const assertNativeState=(batch:Batch,document:Row)=>{const live=batch.native!.read();batch.assertOwner();const byId=new Map(live.map(value=>[value.id,value])),canonical=new Map((document.drawings as Row[]).map(value=>[value.id,value]));for(const id of batch.ids){const actual=byId.get(id),expected=canonical.get(id);if(!actual||!expected)throw Error('Native template target disappeared');assertNativeDrawingMatchesCanonical(expected as unknown as SerializedDrawing,actual);batch.assertOwner();}assertRows(batch,document);};
 const assertAccepted=(batch:Batch)=>{if(!batch.acceptanceLive||!batch.acceptance||!batch.acceptedDocument)throw Error('Template acceptance was retired');try{batch.acceptance.assertCurrent();batch.assertOwner();assertNativeState(batch,batch.acceptedDocument);batch.native!.assertUnchangedOutsideTargets();batch.acceptance.assertCurrent();}catch(error){batch.acceptanceLive=false;throw error;}};
 const failure=(batch:Batch,accepted:boolean,causes:unknown[])=>batch.kind==='drawing'?new DrawingEditRecoveryError(accepted,causes,true):new DrawingTemplateBatchError(accepted,causes);
 const prepareBatch=(batch:Batch):PreparedDrawingTemplateBatch=>{
  if(batch.original.length){batch.edit=host.prepareEdit(canonicalDetached(batch.original),canonicalDetached(batch.next));batch.edit.assertCurrent();}
  assertRows(batch,batch.document);
  if(batch.original.length){batch.native=host.captureNative([...batch.ids]);batch.assertOwner();batch.native.assertCurrent();batch.assertOwner();assertNativeState(batch,batch.document);}
  batch.edit?.assertCurrent();host.assertMutable();const token=Object.freeze({count:batch.ids.length,changedCount:batch.original.length});batches.set(token,batch);return token;
 };
 return{
  captureReadOnly():Row|undefined{
   const batch=acceptedFrame;if(!batch)return undefined;
   const check=()=>{if(acceptedFrame!==batch)throw Error('Template accepted save frame retired');assertAccepted(batch);};
   check();const result=read(check);check();if(!sameDrawingData(result,batch.acceptedDocument))throw Error('Template accepted save values changed');return result;
  },
  prepare(idsInput:readonly string[],templateId:string):PreparedDrawingTemplateBatch{
   if(busy)throw Error('Drawing template publication is already active');
   host.assertMutable();
   const input=detached({ids:idsInput,templateId}),ids=input.ids;
   if(!Array.isArray(ids)||!ids.length||ids.length>DRAWING_TEMPLATE_LIMITS.targets||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>4096)||typeof input.templateId!=='string'||!input.templateId)throw Error('Select bounded unique drawing IDs and a template');
   const assertOwner=host.captureOwner([...ids]);assertOwner();const document=read(assertOwner,raw=>{
    // An in-memory template can contain undefined even though JSON transport cannot.
    // Reject an invalid known setting before detached copying omits it.
    const manager=raw.lvDrawingManager as Row|undefined;
    if(!manager||typeof manager!=='object'||!Array.isArray(manager.templates))return;
    if(manager.templates.length>1000)throw Error('Drawing template library is unavailable');
    for(const item of manager.templates)if(item&&typeof item==='object'&&item.id===input.templateId){const properties=row(item.properties);assertDrawingTemplatePropertiesBudget(properties,ids.length);assertTrendlineStatsPatchValues(properties);assertFibLevelPresentationPatchValues(properties);if(item.type==='fibretracement')assertDrawingLevelPatchValues(properties);}
   }),rows=document.drawings;if(!Array.isArray(rows)||rows.length>10000)throw Error('Drawing document requires bounded rows');
   const byId=new Map<string,Row>();for(const value of rows){const item=row(value);if(typeof item.id!=='string'||byId.has(item.id))throw Error('Drawing records require unique IDs');byId.set(item.id,item);}
   const book=row(document.lvDrawingManager);if(book.schemaVersion!==1||!Array.isArray(book.templates)||book.templates.length>1000)throw Error('Drawing template library is unavailable');
   const templates=new Map<string,Row>();for(const value of book.templates){const item=row(value);if(typeof item.id!=='string'||templates.has(item.id))throw Error('Template IDs must be unique');templates.set(item.id,item);}
   const template=templates.get(input.templateId);if(!template)throw Error('Unknown template');const properties=row(template.properties);assertDrawingTemplatePropertiesBudget(properties,ids.length);
   const original=ids.map(id=>{const value=byId.get(id);if(!value)throw Error('Selected drawing no longer exists');if(value.type!==template.type)throw Error('Templates apply only to the same supported drawing type');return value;});
   for(const value of original)assertDrawingTemplateRecordBudget(value);
   const changed:Row[]=[],next:Row[]=[];for(const value of original){assertOwner();const patched=templatePatch(value as unknown as SerializedDrawing,properties);assertOwner();if((patched as unknown)!==value){changed.push(value);next.push(patched as unknown as Row);}}
   return prepareBatch({kind:'template',assertOwner,document,ids:[...ids],original:changed,next,used:false});
  },
  /** One prepared property batch (bulk color, width, style) over a mixed selection. A tool that does not expose a property is left untouched; one history step through the same owned edit lease as a template apply. */
  prepareProperties(idsInput:readonly string[],patchInput:Row):PreparedDrawingTemplateBatch{
   if(busy)throw Error('Drawing publication is already active');
   host.assertMutable();
   const input=detached({ids:idsInput}),ids=input.ids;
   if(!Array.isArray(ids)||ids.length<1||ids.length>DRAWING_TEMPLATE_LIMITS.targets||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>4096))throw Error('Select bounded unique drawing IDs');
   const patch=canonicalDetached(row(patchInput)),paths=Object.keys(patch);
   if(!paths.length||paths.some(path=>!BULK_PROPERTY_PATHS.includes(path)))throw Error('Bulk editing supports line color, background color, text color, width and style only');
   assertDrawingTemplatePropertiesBudget(patch,ids.length);
   const assertOwner=host.captureOwner([...ids]);assertOwner();const document=read(assertOwner),rows=document.drawings;
   if(!Array.isArray(rows)||rows.length>10000)throw Error('Drawing document requires bounded rows');
   const byId=new Map<string,Row>();for(const value of rows){const item=row(value);if(typeof item.id!=='string'||byId.has(item.id))throw Error('Drawing records require unique IDs');byId.set(item.id,item);}
   const original=ids.map(id=>{const value=byId.get(id);if(!value)throw Error('Selected drawing no longer exists');if((NO_TOOLBAR_DRAWING_TYPES as readonly string[]).includes(String(value.type)))throw Error('This selection has no shared property bar');assertDrawingTemplateRecordBudget(value);return value;});
   const changed:Row[]=[],next:Row[]=[];let exposed=false;
   for(const value of original){
    assertOwner();const drawing=deserializeDrawing(value as unknown as SerializedDrawing);if(!drawing)throw Error('Selected drawing type has no validated property editor');
    const names=new Set(drawingFields(drawing,value as unknown as SerializedDrawing).map(field=>field.path)),mine=Object.fromEntries(Object.entries(patch).filter(([path])=>names.has(path)));
    if(!Object.keys(mine).length)continue;exposed=true;
    const patched=templatePatch(value as unknown as SerializedDrawing,mine);assertOwner();
    if((patched as unknown)!==value){changed.push(value);next.push(patched as unknown as Row);}
   }
   if(!exposed)throw Error('No selected drawing exposes this property');
   return prepareBatch({kind:'drawing',assertOwner,document,ids:[...ids],original:changed,next,used:false});
  },
  /** COORDINATES multi-selection Displacement application: the planner (drawing-displacement.ts) supplies the final anchors; this applies them to every selected drawing as one prepared, owned, one-step batch. Anchor count and every non-coordinate member of each anchor are retained. */
  prepareAnchorMoves(movesInput:readonly {id:string;anchors:readonly {time:number;price:number}[]}[]):PreparedDrawingTemplateBatch{
   if(busy)throw Error('Drawing publication is already active');
   host.assertMutable();
   const input=detached({moves:movesInput}),moves=input.moves;
   if(!Array.isArray(moves)||moves.length<1||moves.length>DRAWING_TEMPLATE_LIMITS.targets||new Set(moves.map(move=>move?.id)).size!==moves.length)throw Error('Select bounded unique drawing IDs to move');
   const ids=moves.map(move=>{if(!move||typeof move.id!=='string'||!move.id||move.id.length>4096||!Array.isArray(move.anchors)||move.anchors.length<1||move.anchors.length>10000||move.anchors.some((anchor:{time:number;price:number})=>!anchor||!Number.isFinite(anchor.time)||!Number.isFinite(anchor.price)))throw Error('Each moved drawing needs finite time and price anchors');return move.id;});
   const assertOwner=host.captureOwner([...ids]);assertOwner();const document=read(assertOwner),rows=document.drawings;
   if(!Array.isArray(rows)||rows.length>10000)throw Error('Drawing document requires bounded rows');
   const byId=new Map<string,Row>();for(const value of rows){const item=row(value);if(typeof item.id!=='string'||byId.has(item.id))throw Error('Drawing records require unique IDs');byId.set(item.id,item);}
   const changed:Row[]=[],next:Row[]=[];
   for(const move of moves){
    const original=byId.get(move.id);if(!original)throw Error('Selected drawing no longer exists');assertDrawingTemplateRecordBudget(original);
    if(!Array.isArray(original.anchors)||original.anchors.length!==move.anchors.length)throw Error('A moved drawing must keep its anchor count');
    const moved={...original,anchors:(original.anchors as Row[]).map((anchor,index)=>({...anchor,time:move.anchors[index].time,price:move.anchors[index].price}))};
    assertDrawingTemplateRecordBudget(moved);if(!deserializeDrawing(moved as unknown as SerializedDrawing))throw Error('Moved drawing is not valid');
    assertOwner();if(!same(moved,original)){changed.push(original);next.push(moved);}
   }
   return prepareBatch({kind:'drawing',assertOwner,document,ids:[...ids],original:changed,next,used:false});
  },
  prepareDrawingEdit(idInput:string,patchInput:Row,coordinatesInput?:readonly DrawingCoordinatePatch[],priceOffsetInput?:number,visibilityInput?:DrawingVisibilityRule):PreparedDrawingTemplateBatch{
   if(busy)throw Error('Drawing publication is already active');host.assertMutable();
   if(!host.captureSingleOwner||!host.readEditContext)throw Error('Single drawing editing is unavailable');
   assertTrendlineStatsPatchValues(patchInput);
   assertFibLevelFormatPatchValues(patchInput);
   assertFibTrendLinePatchValues(patchInput);
   assertFibLevelPresentationPatchValues(patchInput);
   // Keep raw patch presence until the genuine target type is known. Fib label
   // validation must see own undefined; other tools retain their old no-op rule.
   const input={...detached({id:idInput,coordinates:coordinatesInput,priceOffset:priceOffsetInput,visibility:visibilityInput}),patch:canonicalDetached(patchInput)};
   if(typeof input.id!=='string'||!input.id||input.id.length>4096)throw Error('Drawing editing requires a bounded ID');
   const properties=row(input.patch);assertDrawingTemplatePropertiesBudget(properties);
   const assertOwner=host.captureSingleOwner();assertOwner();const document=read(assertOwner),rows=document.drawings;
   if(!Array.isArray(rows)||rows.length>10000)throw Error('Drawing document requires bounded rows');
   const byId=new Map<string,Row>();for(const value of rows){const item=row(value);if(typeof item.id!=='string'||byId.has(item.id))throw Error('Drawing records require unique IDs');byId.set(item.id,item);}
   const original=byId.get(input.id);if(!original)throw Error('Drawing not found: '+input.id);assertDrawingTemplateRecordBudget(original);
   const context=host.readEditContext();assertOwner();
   const edited=patchDrawingEdit(original as unknown as SerializedDrawing,context.bars,properties,input.coordinates,input.priceOffset,context.coordinates);assertOwner();
   const rule=input.visibility===undefined?undefined:validateDrawingVisibilityRule(input.visibility);
   if(rule){if(!context.intervalVisibilityAvailable)throw Error('Drawing interval visibility is unavailable: renderer projection port is missing');if(original.lvIntervalVisibility!==undefined)validateDrawingVisibilityRule(original.lvIntervalVisibility);}
   const ruleChanged=rule!==undefined&&!same(rule,original.lvIntervalVisibility),next=ruleChanged?{...edited,lvIntervalVisibility:rule}:edited;
   assertDrawingTemplateRecordBudget(next);const changed=next!==(original as unknown as SerializedDrawing);
   return prepareBatch({kind:'drawing',assertOwner,document,ids:[input.id],original:changed?[original]:[],next:changed?[next as unknown as Row]:[],used:false});
  },
  commit(token:PreparedDrawingTemplateBatch):DrawingTemplateReceipt{
   if(busy)throw Error('Drawing template publication is already active');
   const batch=batches.get(token);if(!batch||batch.used)throw Error('Foreign, copied or consumed drawing template batch');batch.used=true;batches.delete(token);host.assertMutable();batch.edit?.assertCurrent();assertRows(batch,batch.document);
   if(!batch.next.length)return{accepted:true,changed:false,recoveryRequired:false};
   assertNativeState(batch,batch.document);batch.native!.assertUnchangedOutsideTargets();
   const lease=batch.edit!;lease.assertCurrent();assertRows(batch,batch.document);
   const replacements=new Map(batch.next.map(value=>[value.id,value])),expected={...batch.document,drawings:(batch.document.drawings as Row[]).map(value=>replacements.get(value.id)??value)};
   let accepted=false,attempted=false,began=false,staged=false,restored:OwnedDrawingEditAcceptance|undefined;const failures:unknown[]=[];
   const assertCanonical=()=>{(batch.acceptance??restored??lease).assertCurrent();};
   const assertOwned=()=>{assertCanonical();batch.assertOwner();batch.native!.assertCurrent();batch.native!.assertUnchangedOutsideTargets();assertCanonical();};
   busy=true;
   try{
    host.begin();began=true;assertOwned();assertNativeState(batch,batch.document);host.assertMutable();
    lease.stage();staged=true;assertOwned();assertRows(batch,expected);
    const beforeNative=batch.native!.read();assertOwned();const byId=new Map(beforeNative.map(value=>[value.id,value]));
    for(const value of batch.document.drawings as Row[])if(batch.ids.includes(String(value.id))){const actual=byId.get(String(value.id));if(!actual)throw Error('Native template target disappeared');assertNativeDrawingMatchesCanonical(value as unknown as SerializedDrawing,actual);assertOwned();}
    const changes=batch.next.map(value=>({id:String(value.id),patch:detached(value) as unknown as SerializedDrawing}));assertOwned();host.assertMutable();
    attempted=true;host.update(changes);assertOwned();assertRows(batch,expected);assertNativeState(batch,expected);assertOwned();
    batch.acceptance=lease.accept();batch.acceptedDocument=expected;batch.acceptanceLive=true;accepted=true;acceptedFrame=batch;
   }catch(error){
    failures.push(error);
    // A native call may change values and then throw. Without its private progress
    // authority, no comparison grants permission to overwrite native/replacement state.
    if(staged&&!attempted&&!accepted)try{
     assertOwned();const live=batch.native!.read();assertOwned();const byId=new Map(live.map(value=>[value.id,value]));
     for(const value of batch.original){const actual=byId.get(String(value.id));if(!actual)throw Error('Template rollback target disappeared');assertNativeDrawingMatchesCanonical(value as unknown as SerializedDrawing,actual);assertOwned();}
     restored=lease.rollback();
    }catch(recovery){failures.push(recovery);}
   }
   try{
    if(began)try{host.end(accepted);if(accepted)assertAccepted(batch);else{assertCanonical();batch.assertOwner();}}catch(publication){failures.push(publication);}
   }finally{if(acceptedFrame===batch)acceptedFrame=undefined;busy=false;}
   if(failures.length){
    if(attempted||accepted)try{if(accepted)assertAccepted(batch);else{assertCanonical();batch.assertOwner(false);batch.native!.assertCurrent();batch.native!.assertUnchangedOutsideTargets();assertCanonical();}host.quarantine(failure(batch,accepted,failures).message);}catch(quarantine){failures.push(quarantine);}
    throw failure(batch,accepted,failures);
   }
   const receipt=Object.freeze({accepted:true as const,changed:true,recoveryRequired:false as const});receipts.set(receipt,batch);return receipt;
  },
  publicationFailed(receipt:DrawingTemplateReceipt,cause:unknown):never{
   const batch=receipts.get(receipt);if(!batch||!receipt.changed)throw Error('Foreign or consumed template acceptance receipt');receipts.delete(receipt);const failures=[cause];
   try{assertAccepted(batch);host.quarantine(failure(batch,true,failures).message);}catch(error){failures.push(error);}
   throw failure(batch,true,failures);
  },
 };
}

function own(value:unknown,key:string):unknown{if(!value||typeof value!=='object')throw Error('Native drawing owner unavailable');const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Native drawing owner must be data');return field.value;}
function dataMethod(value:unknown,key:string):(...args:any[])=>any{let current=value;while(current&&typeof current==='object'){const descriptor=Object.getOwnPropertyDescriptor(current,key);if(descriptor){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Native drawing method must be data');return descriptor.value;}current=Object.getPrototypeOf(current);}throw Error('Native drawing method unavailable');}
/** Pins actual native object identities without exporting a writable store/controller. */
export function captureNativeDrawingLease(facade:object,idsInput:readonly string[]):DrawingTemplateNativeLease{
 const ids=detached(idsInput);if(!Array.isArray(ids)||ids.length>DRAWING_TEMPLATE_LIMITS.targets||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id))throw Error('Native drawing claim requires bounded unique IDs');
 const controller=own(facade,'ctrl'),store=own(controller,'store'),get=dataMethod(store,'get'),all=dataMethod(store,'all');
 const models=all.call(store);if(!Array.isArray(models)||models.length>10000)throw Error('Native template model capacity exceeded');
 const owners=[...models],modelIds=owners.map(value=>own(value,'id')),serializers=owners.map(value=>dataMethod(value,'serialize'));
 if(new Set(modelIds).size!==modelIds.length||modelIds.some(id=>typeof id!=='string'||!id))throw Error('Native template model IDs must be unique');
 const indices=ids.map(id=>modelIds.indexOf(id));if(indices.some(index=>index<0))throw Error('Native drawing target unavailable');
 const targets=new Set(ids);
 const assertScope=()=>{if(own(facade,'ctrl')!==controller||own(controller,'store')!==store||dataMethod(store,'get')!==get||dataMethod(store,'all')!==all)throw Error('Native drawing controller retired');};
 const assertCurrent=()=>{assertScope();const current=all.call(store);assertScope();if(!Array.isArray(current)||current.length!==owners.length)throw Error('Native drawing membership changed');for(let i=0;i<owners.length;i++){if(current[i]!==owners[i]||get.call(store,modelIds[i])!==owners[i]||own(owners[i],'id')!==modelIds[i]||dataMethod(owners[i],'serialize')!==serializers[i])throw Error('Native drawing identity, order or serializer changed');assertScope();}};
 const snapshot=(indicesToRead:readonly number[])=>{assertCurrent();const values=indicesToRead.map(index=>{const value=detached(serializers[index].call(owners[index]));assertScope();return value as SerializedDrawing;});assertCurrent();bounded(values);return values;};
 assertCurrent();const unrelatedIndices=owners.map((_,index)=>index).filter(index=>!targets.has(modelIds[index])),unrelated=snapshot(unrelatedIndices);
 return{assertCurrent,assertScope,assertUnchangedOutsideTargets(){const current=snapshot(unrelatedIndices);if(!sameDrawingData(current,unrelated))throw Error('Unrelated native template drawing values changed');assertCurrent();},read(){return snapshot(indices);}};
}
