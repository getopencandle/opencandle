// OpenCandle drawing types must register before any drawingTypes() snapshot.
import './lv-drawing-types';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import {validateRendererContextInventory} from './renderer-frame';
import type {AnalysisPaneInventory} from './analysis-transaction';
import type {ChartDiagnostic,LosslessDrawingDocument} from './contracts';
import type {DrawingTemplate} from './drawing-manager';
import {readFibLevelFormat,retainFibLevelFormatPresence} from './fib-level-format';
import {readFibTrendLine,retainFibTrendLineMember} from './fib-trend-line-data';
import {nativeFibTrendLineDefaults} from './fib-level-format-native';
import {retainFibLevelPresentationMembers,readFibBackground,readFibText} from './fib-level-presentation-data';
export interface DrawingPaneOwner{kind:'built'|'script'|'comparison';id:string}
export type DrawingPaneBinding={schemaVersion:1;target:{kind:'price'}|{kind:'logical';id:string;owners:DrawingPaneOwner[]}|{kind:'owners';owners:DrawingPaneOwner[]}};
export interface DrawingTemplateLibrary{schemaVersion:1;templates:DrawingTemplate[]}
export interface PortableDrawingResolution{document:Record<string,unknown>;nativeDocument:Record<string,unknown>;diagnostics:ChartDiagnostic[];unavailableIds:string[]}
function text(value:unknown):string{if(typeof value!=='string'||!value||value.length>4096)throw Error('Invalid drawing binding identity');return value;}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Drawing binding requires a record');return value as Record<string,unknown>;}
function exact(value:unknown,keys:string[]){const row=object(value);if(Object.keys(row).length!==keys.length||Object.keys(row).some(key=>!keys.includes(key)))throw Error('Unsupported drawing pane binding fields');return row;}
function ownerRows(value:unknown):DrawingPaneOwner[]{if(!Array.isArray(value)||!value.length||value.length>2048)throw Error('Drawing study pane requires complete bounded owners');const seen=new Set<string>();return value.map(value=>{const row=exact(value,['kind','id']);if(typeof row.kind!=='string'||!['built','script','comparison'].includes(row.kind))throw Error('Unknown drawing pane owner');const owner={kind:row.kind as DrawingPaneOwner['kind'],id:text(row.id)},key=JSON.stringify([owner.kind,owner.id]);if(seen.has(key))throw Error('Duplicate drawing pane owner');seen.add(key);return owner;}).sort((a,b)=>{const x=JSON.stringify([a.kind,a.id]),y=JSON.stringify([b.kind,b.id]);return x<y?-1:x>y?1:0;});}
export function validateDrawingPaneBinding(value:unknown):DrawingPaneBinding{const row=exact(prepareWorkspaceJSON({binding:value}).binding,['schemaVersion','target']);if(row.schemaVersion!==1)throw Error('Unsupported drawing pane binding version');const target=object(row.target);if(target.kind==='price'){exact(target,['kind']);return{schemaVersion:1,target:{kind:'price'}};}if(target.kind==='logical'){exact(target,['kind','id','owners']);return{schemaVersion:1,target:{kind:'logical',id:text(target.id),owners:ownerRows(target.owners)}};}if(target.kind==='owners'){exact(target,['kind','owners']);return{schemaVersion:1,target:{kind:'owners',owners:ownerRows(target.owners)}};}throw Error('Unsupported drawing pane binding target');}
function document(value:unknown,canonical=false){
 let result:Record<string,unknown>;
 if(canonical){measureWorkspaceJSON(value);result=structuredClone(value) as Record<string,unknown>;}else result=prepareWorkspaceJSON(value);
 if(!Array.isArray(result.drawings)||result.drawings.length>10000)throw Error('Drawing document requires a bounded records array');
 const ids=new Set<string>();for(const item of result.drawings){const row=object(item),id=text(row.id);text(row.type);if(ids.has(id))throw Error('Duplicate drawing record identity');ids.add(id);}
 if(!canonical){const originals=(value as Record<string,unknown>).drawings as unknown[];result.drawings=result.drawings.map((row,index)=>retainFibLevelPresentationMembers(originals[index],retainFibTrendLineMember(originals[index],retainFibLevelFormatPresence(originals[index],row))));}
 return result;
}
function signature(owners:readonly {kind:string;id:string}[]){return JSON.stringify(owners.map(row=>JSON.stringify([row.kind,row.id])).sort());}
function target(pane:AnalysisPaneInventory['panes'][number]):DrawingPaneBinding{if(pane.paneId==='price')return{schemaVersion:1,target:{kind:'price'}};const owners=ownerRows(pane.owners.map(({kind,id})=>({kind,id})));return{schemaVersion:1,target:pane.logicalPaneId!==null?{kind:'logical',id:pane.logicalPaneId,owners}:{kind:'owners',owners}};}
/** The portable binding of a live pane (Move to pane). */
export function drawingPaneBinding(pane:AnalysisPaneInventory['panes'][number]):DrawingPaneBinding{return target(pane);}
function savedBinding(row:Record<string,unknown>):DrawingPaneBinding{if(Object.hasOwn(row,'lvPaneBinding'))return validateDrawingPaneBinding(row.lvPaneBinding);if(row.paneId==='price')return{schemaVersion:1,target:{kind:'price'}};if(Object.hasOwn(row,'lvPaneOwners')){const owners=ownerRows(row.lvPaneOwners);if(row.lvLogicalPaneId!==undefined&&row.lvLogicalPaneId!==null)return{schemaVersion:1,target:{kind:'logical',id:text(row.lvLogicalPaneId),owners}};return{schemaVersion:1,target:{kind:'owners',owners}};}throw Error('Legacy native study pane has no portable ownership binding');}
/** The actual successful native rows are mandatory proof before native-ID inference.
 * Imported/archived documents must instead use resolvePortableDrawingDocument. */
export function capturePortableDrawingDocument(value:unknown,inventoryInput:AnalysisPaneInventory,liveNativeRows:readonly Record<string,unknown>[]):Record<string,unknown>{
 const doc=document(value,true),inventory=validateRendererContextInventory(inventoryInput),proof=document({drawings:liveNativeRows}).drawings as Record<string,unknown>[],live=new Map(proof.map(row=>[String(row.id),row])),panes=new Map(inventory.panes.map(pane=>[pane.paneId,pane]));return{...doc,drawings:(doc.drawings as Record<string,unknown>[]).map(row=>{if(row.lvPaneBinding!==undefined){try{validateDrawingPaneBinding(row.lvPaneBinding);}catch{return row;}}const native=live.get(String(row.id));if(!native||native.paneId!==row.paneId)return row;const pane=panes.get(String(native.paneId));if(!pane)return row;try{return{...row,lvPaneBinding:target(pane)};}catch{return row;}})};
}
/** Enrich the authoritative document without resetting geometry, selection or history. */
export function commitPortableDrawingBindings(store:LosslessDrawingDocument,inventory:AnalysisPaneInventory,liveNativeRows:readonly Record<string,unknown>[]):Record<string,unknown>{const before=store.serialize(),next=capturePortableDrawingDocument(before,inventory,liveNativeRows);store.enrichPaneBindings(before,next);return store.serialize();}
/** Bar/interval reprojection does not reload the native store unless placement topology changed. */
export function reprojectPortableDrawingDocument(store:LosslessDrawingDocument,inventory:AnalysisPaneInventory,knownTypes:ReadonlySet<string>,host:{nativeRows:readonly Record<string,unknown>[];load:(value:Record<string,unknown>)=>void;sync:(rows:Record<string,unknown>[])=>void}):PortableDrawingResolution{
 const before=store.serialize(),resolved=resolveDrawingDocument(before,inventory,knownTypes,true),rows=resolved.nativeDocument.drawings as Record<string,unknown>[],topology=(values:readonly Record<string,unknown>[])=>JSON.stringify(values.map(row=>[row.id,row.type,row.paneId]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0));
 if(topology(host.nativeRows)!==topology(rows))host.load(resolved.nativeDocument);else host.sync(rows);
 store.enrichPaneBindings(before,resolved.document);return resolved;
}
export function resolvePortableDrawingDocument(value:unknown,inventoryInput:AnalysisPaneInventory,knownTypes:ReadonlySet<string>):PortableDrawingResolution{
 return resolveDrawingDocument(value,inventoryInput,knownTypes,false);
}
function resolveDrawingDocument(value:unknown,inventoryInput:AnalysisPaneInventory,knownTypes:ReadonlySet<string>,canonical:boolean):PortableDrawingResolution{
 const doc=document(value,canonical),inventory=validateRendererContextInventory(inventoryInput),diagnostics:ChartDiagnostic[]=[],unavailableIds:string[]=[],native:Record<string,unknown>[]=[];
 const rows=(doc.drawings as Record<string,unknown>[]).map(row=>{
  try{
   if(!knownTypes.has(String(row.type)))throw Error('Drawing type has no supported native renderer');
   if(doc.version!==1||!Array.isArray(row.anchors)||row.anchors.some(item=>{const anchor=object(item);return typeof anchor.time!=='number'||!Number.isFinite(anchor.time)||typeof anchor.price!=='number'||!Number.isFinite(anchor.price);})||!row.style||typeof row.style!=='object'||Array.isArray(row.style))throw Error('Drawing native record shape is unavailable');
   const binding=savedBinding(row),key=binding.target;
   const matches=inventory.panes.filter(pane=>key.kind==='price'?pane.paneId==='price':pane.paneId!=='price'&&(key.kind!=='logical'||pane.logicalPaneId===key.id)&&signature(pane.owners)===signature(key.owners));
   if(matches.length!==1)throw Error('Drawing pane ownership is missing, ambiguous or incompatible');
   if(row.type==='fibretracement'){const format=readFibLevelFormat(row.props);if(format.state==='unavailable')diagnostics.push({code:'FIB_LEVEL_FORMAT_UNAVAILABLE',feature:'drawing '+String(row.id),severity:'warning',message:format.message});}
   if(row.type==='fibretracement'){const baseline=readFibTrendLine(row.props,nativeFibTrendLineDefaults());if(baseline.state==='unavailable')diagnostics.push({code:'FIB_TREND_LINE_UNAVAILABLE',feature:'drawing '+String(row.id),severity:'warning',message:baseline.message});}
   if(row.type==='fibretracement'){const background=readFibBackground(row.props),text=readFibText(row.props);if(background.state==='unavailable')diagnostics.push({code:'FIB_BACKGROUND_UNAVAILABLE',feature:'drawing '+String(row.id),severity:'warning',message:background.message});if(text.state==='unavailable')diagnostics.push({code:'FIB_TEXT_UNAVAILABLE',feature:'drawing '+String(row.id),severity:'warning',message:text.message});}
   native.push({...row,paneId:matches[0].paneId});return{...row,lvPaneBinding:binding};
  }catch(cause){const id=String(row.id);unavailableIds.push(id);diagnostics.push({code:'DRAWING_PANE_UNAVAILABLE',feature:'drawing '+id,severity:'unavailable',message:String(cause)+'; original record retained without price-pane fallback'});return row;}
 });
 const nativeDocument=canonical?prepareWorkspaceJSON({...doc,drawings:native}):{...doc,drawings:native};
 if(canonical)nativeDocument.drawings=(nativeDocument.drawings as Record<string,unknown>[]).map((row,index)=>retainFibLevelPresentationMembers(native[index],retainFibTrendLineMember(native[index],retainFibLevelFormatPresence(native[index],row))));
 return{document:{...doc,drawings:rows},nativeDocument,diagnostics,unavailableIds};
}
function manager(doc:Record<string,unknown>){const value=doc.lvDrawingManager;if(value===undefined)return null;const row=object(value);if(row.schemaVersion!==1||!Array.isArray(row.groups)||!Array.isArray(row.templates))throw Error('Drawing manager schema cannot be split; original document retained');const records=new Set((doc.drawings as Record<string,unknown>[]).map(row=>String(row.id))),ids=new Set<string>(),members=new Set<string>();for(const item of row.groups){const group=object(item),id=text(group.id);if(ids.has(id)||typeof group.name!=='string'||!Array.isArray(group.memberIds))throw Error('Invalid drawing group metadata retained');ids.add(id);for(const member of group.memberIds){const key=text(member);if(!records.has(key)||members.has(key))throw Error('Orphan or overlapping drawing group metadata retained');members.add(key);}}return row;}
function templates(value:unknown):DrawingTemplate[]{if(!Array.isArray(value)||value.length>10000)throw Error('Drawing templates require a bounded array');const ids=new Set<string>();return value.map(item=>{const row=object(item),id=text(row.id);if(ids.has(id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>200)throw Error('Invalid drawing template identity');ids.add(id);text(row.type);object(row.properties);return row as unknown as DrawingTemplate;});}
export function splitDrawingDocumentTemplates(value:unknown):{document:Record<string,unknown>;library:DrawingTemplateLibrary}{const doc=document(value),book=manager(doc),library:DrawingTemplateLibrary={schemaVersion:1,templates:book?templates(book.templates):[]};return{document:book?{...doc,lvDrawingManager:{...book,templates:[]}}:doc,library};}
export function combineDrawingDocumentTemplates(value:unknown,libraryInput:DrawingTemplateLibrary):Record<string,unknown>{const doc=document(value),book=manager(doc),lib=prepareWorkspaceJSON(libraryInput);if(lib.schemaVersion!==1)throw Error('Unsupported drawing template library');const shared=templates(lib.templates);if(book&&templates(book.templates).length&&JSON.stringify(book.templates)!==JSON.stringify(shared))throw Error('Scoped drawing document still owns a conflicting template library');if(!book&&!shared.length)return doc;return{...doc,lvDrawingManager:{...(book??{schemaVersion:1,groups:[]}),templates:shared}};}
