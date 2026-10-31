import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import type {createDrawingTemplateBatches,PreparedDrawingTemplateBatch} from './drawing-template-batch';
import {assertDrawingTemplateRecordBudget,assertDrawingTemplatePropertiesBudget} from './drawing-template-batch';
import {deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {drawingFields,patchDrawingProperties,TRENDLINE_STATS_EDITOR_FIELDS} from './drawing-port';
import {readTrendlineStats,type TrendlineStatsSettings} from './trendline-stats-data';
import {FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,readFibBackground,readFibText} from './fib-level-presentation-data';
import {assertNewFibLevelLabel} from './fib-level-text-policy';
import {drawingSyncScope,type DrawingSyncScope} from './drawing-linked-plan';
export interface DrawingGroup {id:string;name:string;memberIds:string[];[key:string]:unknown}
export interface DrawingTemplate {id:string;name:string;type:string;properties:Record<string,unknown>;[key:string]:unknown}
export interface DrawingManagerBook {schemaVersion:1;groups:DrawingGroup[];templates:DrawingTemplate[];[key:string]:unknown}
export class DrawingManagerPublicationError extends Error{
 readonly accepted=true;readonly recoveryRequired=true;
 constructor(readonly causes:unknown[]){super('Drawing manager changes were accepted, but publication failed. Reopen this chart before continuing. '+causes.map(String).join(' | '));this.name='DrawingManagerPublicationError';}
}
export interface DrawingManagerHost {read:()=>Record<string,unknown>;write:(document:Record<string,unknown>)=>void;known:(type:string)=>boolean;update:(rows:Array<{id:string;patch:SerializedDrawing}>)=>void;remove:(ids:string[])=>void;select:(ids:string[])=>void;front:(id:string)=>void;back:(id:string)=>void;transaction:<T>(operation:()=>T)=>T;changed:()=>void;templateBatches?:ReturnType<typeof createDrawingTemplateBatches>;
 /** Loads the whole next document (canonical and native) inside a transaction; required by insert (paste from snapshots). */
 insert?:(document:Record<string,unknown>)=>void}
type Row=Record<string,unknown>;
export type DrawingOrderPosition='front'|'back'|'forward'|'backward';
/** Same-pane stacking, bottom first. Rows without a numeric zIndex rank by canonical order. */
function paneStack(all:readonly Row[],paneId:unknown){return all.map((row,index)=>({row,index})).filter(item=>item.row.paneId===paneId).sort((a,b)=>{const za=typeof a.row.zIndex==='number'?a.row.zIndex:0,zb=typeof b.row.zIndex==='number'?b.row.zIndex:0;return za-zb||a.index-b.index;}).map(item=>item.row);}
/** Front/forward are disabled when the whole selection already holds the top of every pane it touches; back/backward likewise at the bottom (VDL#series.moreMenu). */
export function drawingOrderDisabled(all:readonly Row[],ids:readonly string[]){
 const chosen=all.filter(row=>ids.includes(String(row.id)));let top=chosen.length>0,bottom=chosen.length>0;
 for(const paneId of new Set(chosen.map(row=>row.paneId))){const stack=paneStack(all,paneId),mine=chosen.filter(row=>row.paneId===paneId).length;if(!stack.slice(stack.length-mine).every(row=>ids.includes(String(row.id))))top=false;if(!stack.slice(0,mine).every(row=>ids.includes(String(row.id))))bottom=false;}
 return{front:top,forward:top,backward:bottom,back:bottom};
}
/** Swaps zIndex with the adjacent unselected drawing, moving the selection as a block per pane. Equal zIndex values break by one step. */
function planAdjacentOrder(all:readonly Row[],ids:readonly string[],position:'forward'|'backward'):Row[]{
 const z=new Map<string,number>(),changed=new Set<string>(),chosen=all.filter(row=>ids.includes(String(row.id)));
 for(const paneId of new Set(chosen.map(row=>row.paneId))){
  const stack=paneStack(all,paneId);for(const row of stack)z.set(String(row.id),typeof row.zIndex==='number'?row.zIndex:0);
  const order=position==='forward'?[...stack].reverse():stack,steps=position==='forward'?1:-1;
  for(let index=0;index<order.length;index++){
   const row=order[index];if(!ids.includes(String(row.id)))continue;
   const next=order[index-1];if(!next||ids.includes(String(next.id)))continue;
   const mine=z.get(String(row.id))!,theirs=z.get(String(next.id))!;
   if(mine===theirs)z.set(String(row.id),mine+steps);else{z.set(String(row.id),theirs);z.set(String(next.id),mine);}
   changed.add(String(row.id));changed.add(String(next.id));[order[index],order[index-1]]=[order[index-1],order[index]];
  }
 }
 return all.filter(row=>changed.has(String(row.id))&&z.get(String(row.id))!==(typeof row.zIndex==='number'?row.zIndex:0)).map(row=>({...row,zIndex:z.get(String(row.id))}));
}
const valueAt=(object:unknown,path:string):unknown=>path.split('.').reduce((value:any,key)=>value?.[key],object);
function name(value:string){if(typeof value!=='string'||!value.trim()||value.length>200)throw new Error('Enter a name of 1 to 200 characters');return value.trim();}
export function templateProperties(record:SerializedDrawing){assertDrawingTemplateRecordBudget(record);const drawing=deserializeDrawing(record);if(!drawing)throw new Error('This drawing type has no validated template schema');const properties:Record<string,unknown>={},background=readFibBackground(record.props),text=readFibText(record.props);for(const field of drawingFields(drawing,record)){if(record.type==='fibretracement'&&(field.path.startsWith(FIB_BACKGROUND_FIELD+'.')&&background.state!=='supported'||field.path.startsWith(FIB_TEXT_FIELD+'.')&&text.state!=='supported'))continue;if(['locked','visible'].includes(field.path)||!(['line','fill','text'].includes(field.group??'')||field.path.startsWith('style.')||field.path.startsWith('text.')))continue;const value=valueAt(drawing,field.path);if(value!==undefined)properties[field.path]=structuredClone(value);}for(const [index,level] of (drawing.editableLevels()??[]).entries())for(const property of ['ratio','color','enabled','label']){const value=(level as unknown as Record<string,unknown>)[property];if(record.type==='fibretracement'&&property==='label'&&value!==undefined)assertNewFibLevelLabel(value);if(value!==undefined)properties[`levels.${index}.${property}`]=structuredClone(value);}if(record.type==='trendline'){const stats=readTrendlineStats(record.props);if(stats.state==='supported')for(const field of TRENDLINE_STATS_EDITOR_FIELDS)properties[field.path]=stats.settings[field.path.slice('props.lvTrendlineStats.'.length) as keyof TrendlineStatsSettings];}assertDrawingTemplatePropertiesBudget(properties);patchDrawingProperties(record,properties);return properties;}
export function createDrawingManager(host:DrawingManagerHost){
 const document=()=>{const raw=host.read(),metrics=measureWorkspaceJSON(raw);if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Drawing manager resource limit exceeded');return structuredClone(raw);};
 const rows=()=>document().drawings as Record<string,unknown>[];
 const book=():DrawingManagerBook=>{const value=document().lvDrawingManager;if(value===undefined)return{schemaVersion:1,groups:[],templates:[]};if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Drawing manager metadata is invalid and has been retained');const data=value as DrawingManagerBook;if(data.schemaVersion!==1||!Array.isArray(data.groups)||!Array.isArray(data.templates))throw new Error('Drawing manager schema is unavailable and has been retained');const ids=new Set<string>();for(const group of data.groups){if(!group.id||ids.has(group.id)||typeof group.name!=='string'||!Array.isArray(group.memberIds)||group.memberIds.some(id=>typeof id!=='string'))throw new Error('Invalid drawing group metadata has been retained');ids.add(group.id);}const members=new Set<string>(),existing=new Set(rows().map(row=>String(row.id)));for(const group of data.groups)for(const id of group.memberIds){if(members.has(id)||!existing.has(id))throw new Error('Overlapping, duplicate or orphan drawing group membership has been retained without interpretation');members.add(id);}ids.clear();for(const template of data.templates){if(!template.id||ids.has(template.id)||typeof template.name!=='string'||typeof template.type!=='string'||!template.properties||typeof template.properties!=='object'||Array.isArray(template.properties))throw new Error('Invalid drawing template metadata has been retained');ids.add(template.id);}return structuredClone(data);};
 const save=(next:DrawingManagerBook)=>{const before=document();if(JSON.stringify(before.lvDrawingManager)===JSON.stringify(next))return;host.write({...before,lvDrawingManager:next});host.changed();};
 const selected=(ids:readonly string[])=>{if(!ids.length||new Set(ids).size!==ids.length)throw new Error('Select unique drawing IDs');const all=new Map(rows().map(row=>[row.id,row]));return ids.map(id=>{const row=all.get(id);if(!row)throw new Error('Selected drawing no longer exists');return row;});};
 const port={
  policies:['OpenCandle groups are flat folders with one group per drawing. Nested folders and exact reference grouping semantics remain unresolved.','Template saves tool-specific style/text/levels and supported explicit Trendline stats, excluding coordinates, identity, lock and visibility. Reference template scope/defaults remain unresolved.','Unsupported drawing types and future manager fields remain opaque and retained; this does not claim they render.'],
  state:()=>book(),
  reconcileRemoved(ids:readonly string[]){if(!ids.length)return;const next=book();let changed=false;next.groups=next.groups.map(group=>{const memberIds=group.memberIds.filter(id=>!ids.includes(id));if(memberIds.length!==group.memberIds.length)changed=true;return{...group,memberIds};});if(changed)save(next);},
  list:()=>rows().map<Record<string,unknown>&{renderable:boolean}>(row=>({...structuredClone(row),renderable:host.known(String(row.type))})),
  renameDrawing(id:string,label:string){selected([id]);const clean=name(label);host.transaction(()=>{host.write({...host.read(),drawings:rows().map(row=>row.id===id?{...row,lvName:clean}:row)});host.changed();});},
  /** The toolbar Sync rows for one placed drawing (static-drawing-toolbar#utility.sync: Not synced, Sync in layout, Sync
   * globally). Writes the row's lvSyncScope stamp (absent = not synced) in ONE host transaction, so one workspace undo step; the stamp
   * survives later native edits (stampNewDrawings keeps a known id's stamp). The layout drawing sync (layout-port replicateScopedDrawings)
   * then mirrors the change: a stamped row reaches the charts of the same drawing scope, and a row whose stamp is removed is dropped from
   * them, so turning sync off leaves the drawing on this chart only. Returns false when the scope is already the drawing's. */
  setSyncScope(id:string,scope:DrawingSyncScope|null){
   if(scope!==null&&scope!=='layout'&&scope!=='global')throw new Error('Unsupported drawing sync scope');
   const row=selected([id])[0];if(!host.known(String(row.type)))throw new Error('This drawing is not available on this chart, so its sync cannot change.');
   if(drawingSyncScope(row)===scope&&(scope!==null||!Object.hasOwn(row,'lvSyncScope')))return false;
   host.transaction(()=>{host.write({...host.read(),drawings:rows().map(next=>{if(next.id!==id)return next;const copy={...next};if(scope)copy.lvSyncScope=scope;else delete copy.lvSyncScope;return copy;})});host.changed();});return true;},
  group(ids:readonly string[],label:string){selected(ids);const group:DrawingGroup={id:crypto.randomUUID(),name:name(label),memberIds:[...ids]},next=book();next.groups=next.groups.map(existing=>({...existing,memberIds:existing.memberIds.filter(id=>!ids.includes(id))}));next.groups.push(group);host.transaction(()=>save(next));return group.id;},
  renameGroup(id:string,label:string){const next=book(),group=next.groups.find(row=>row.id===id);if(!group)throw new Error('Unknown drawing group');group.name=name(label);host.transaction(()=>save(next));},
  ungroup(id:string){const next=book();if(!next.groups.some(row=>row.id===id))throw new Error('Unknown drawing group');next.groups=next.groups.filter(row=>row.id!==id);host.transaction(()=>save(next));},
  /** Groups are flat folders, see policies: moves drawings into an existing group, appended in the
   * given order, or out of every group with null. One host transaction, so one workspace undo step. A group this move leaves
   * without members is dropped; an already empty group is kept as it was. */
  assignGroup(ids:readonly string[],groupId:string|null){return port.moveObjects(ids,groupId,[]);},
  /** An Object tree drag ("move objects"): the group change (see
   * assignGroup; undefined leaves membership alone) and the bring-to-front calls of the new order in ONE host transaction, so the
   * drag is one workspace undo step. */
  moveObjects(ids:readonly string[],groupId:string|null|undefined,frontCalls:readonly string[]){
   selected(ids);if(frontCalls.length){const chosen=selected(frontCalls);if(chosen.some(row=>!host.known(String(row.type))))throw new Error('Opaque unsupported drawings have no available render ordering');}
   let next:DrawingManagerBook|null=null;
   if(groupId!==undefined){const book0=book();if(groupId!==null&&!book0.groups.some(row=>row.id===groupId))throw new Error('Unknown drawing group');const before=JSON.stringify(book0.groups);book0.groups=book0.groups.flatMap(group=>{const kept=group.memberIds.filter(id=>!ids.includes(id));if(group.id===groupId)return[{...group,memberIds:[...kept,...ids.filter(id=>!kept.includes(id))]}];return kept.length||!group.memberIds.length?[{...group,memberIds:kept}]:[];});if(JSON.stringify(book0.groups)!==before)next=book0;}
   if(!next&&!frontCalls.length)return false;
   host.transaction(()=>{if(next)host.write({...document(),lvDrawingManager:next});for(const id of frontCalls)host.front(id);host.changed();});return true;},
  /** Adds prepared rows (fresh ids and stacking from drawing-object-clipboard) as ONE host transaction (one workspace
   * undo step), then selects them. Refused when an id is taken, a type has no renderer or the host has no insert route.
   * `groups` (pasted groups: a name and pasted member ids) become new groups in the same transaction; without them the
   * rows join no group. */
  insert(input:readonly Row[],groups:readonly {name:string;memberIds:readonly string[]}[]=[]){
   if(!host.insert)throw new Error('Drawing insertion is unavailable on this chart.');
   if(!Array.isArray(input)||!input.length||input.length>128)throw new Error('Paste between 1 and 128 drawings.');
   const before=document(),existing=new Set((before.drawings as Row[]).map(row=>String(row.id))),ids:string[]=[];
   for(const row of input){const id=row?.id;if(typeof id!=='string'||!id||existing.has(id)||ids.includes(id))throw new Error('Pasted drawing identities collide.');if(!host.known(String(row.type)))throw new Error('Some copied drawings are not available in this chart and were not pasted.');ids.push(id);}
   if(!Array.isArray(groups)||groups.length>128)throw new Error('Paste between 0 and 128 drawing groups.');
   const grouped=new Set<string>(),added:DrawingGroup[]=groups.map(group=>{const memberIds=Array.isArray(group?.memberIds)?[...group.memberIds]:[];if(!memberIds.length||memberIds.some(id=>!ids.includes(id)||grouped.has(id)))throw new Error('Pasted drawing groups do not match the pasted drawings.');for(const id of memberIds)grouped.add(id);return{id:crypto.randomUUID(),name:name(group.name),memberIds};});
   const manager=added.length?(()=>{const next=book();next.groups.push(...added);return next;})():null;
   const next={...before,drawings:[...(before.drawings as Row[]),...input.map(row=>structuredClone(row))],...manager?{lvDrawingManager:manager}:{}};
   host.transaction(()=>{host.insert!(next);host.changed();});host.select([...ids]);return ids;},
  select(ids:readonly string[]){const chosen=selected(ids),renderable=chosen.filter(row=>host.known(String(row.type))).map(row=>String(row.id));host.select(renderable);return{selectedIds:renderable,unavailableIds:chosen.filter(row=>!host.known(String(row.type))).map(row=>String(row.id))};},
  set(ids:readonly string[],patch:{locked?:boolean;visible?:boolean}){const chosen=selected(ids);if(Object.keys(patch).some(key=>!['locked','visible'].includes(key))||Object.values(patch).some(value=>typeof value!=='boolean'))throw new Error('Unsupported bulk drawing property');const changes=chosen.map<Record<string,unknown>>(row=>({...row,...patch}));host.transaction(()=>{host.write({...host.read(),drawings:rows().map(row=>changes.find(next=>next.id===row.id)??row)});host.update(changes.filter(row=>host.known(String(row.type))).map(row=>({id:String(row.id),patch:row as unknown as SerializedDrawing})));host.changed();});},
  remove(ids:readonly string[]){selected(ids);const next=book();next.groups=next.groups.map(group=>({...group,memberIds:group.memberIds.filter(id=>!ids.includes(id))}));host.transaction(()=>{host.write({...host.read(),drawings:rows().filter(row=>!ids.includes(String(row.id))),lvDrawingManager:next});host.remove([...ids]);host.changed();});},
  order(ids:readonly string[],position:DrawingOrderPosition){const chosen=selected(ids);if(chosen.some(row=>!host.known(String(row.type))))throw new Error('Opaque unsupported drawings have no available render ordering');
   // Forward and backward swap zIndex with the adjacent drawing of the same pane in one host transaction (one history step).
   if(position==='forward'||position==='backward'){const plan=planAdjacentOrder(rows().filter(row=>host.known(String(row.type))),ids,position);if(!plan.length)return;const changes=plan.map(row=>row as unknown as SerializedDrawing);host.transaction(()=>{host.write({...host.read(),drawings:rows().map(row=>plan.find(next=>next.id===row.id)??row)});host.update(changes.map(patch=>({id:String((patch as unknown as Row).id),patch})));host.changed();});return;}
   host.transaction(()=>{for(const row of chosen)position==='front'?host.front(String(row.id)):host.back(String(row.id));host.changed();});},
  /** Disabled flags for the Visual order submenu (VDL#series.moreMenu: front and forward at the front, back and backward at the bottom). */
  orderState(ids:readonly string[]){return drawingOrderDisabled(rows().filter(row=>host.known(String(row.type))),ids);},
  prepareProperties(ids:readonly string[],patch:Record<string,unknown>){if(!host.templateBatches)throw Error('Owned drawing property transaction is unavailable');return host.templateBatches.prepareProperties(ids,patch);},
  prepareMoves(moves:readonly {id:string;anchors:readonly {time:number;price:number}[]}[]){if(!host.templateBatches)throw Error('Owned drawing move transaction is unavailable');return host.templateBatches.prepareAnchorMoves(moves);},
  /** Multi-selection Displacement: all moved drawings commit as one owned step. */
  moveMany(moves:readonly {id:string;anchors:readonly {time:number;price:number}[]}[]){return port.commitTemplate(port.prepareMoves(moves));},
  commitProperties(token:PreparedDrawingTemplateBatch){return port.commitTemplate(token);},
  applyProperties(ids:readonly string[],patch:Record<string,unknown>){return port.commitProperties(port.prepareProperties(ids,patch));},
  saveTemplate(id:string,label:string){const row=selected([id])[0];if(!host.known(String(row.type)))throw new Error('Unsupported drawing has no validated template editor');const next=book(),clean=name(label),properties=templateProperties(row as unknown as SerializedDrawing),existing=next.templates.find(template=>template.type===row.type&&template.name===clean),template={...(existing??{}),id:existing?.id??crypto.randomUUID(),type:String(row.type),name:clean,properties};next.templates=next.templates.filter(item=>item.id!==template.id);next.templates.push(template);host.transaction(()=>save(next));return template.id;},
  renameTemplate(id:string,label:string){const next=book(),template=next.templates.find(row=>row.id===id);if(!template)throw new Error('Unknown template');template.name=name(label);if(next.templates.some(row=>row.id!==id&&row.type===template.type&&row.name===template.name))throw new Error('A template with that name already exists for this tool');host.transaction(()=>save(next));},
  removeTemplate(id:string){const next=book();if(!next.templates.some(row=>row.id===id))throw new Error('Unknown template');next.templates=next.templates.filter(row=>row.id!==id);host.transaction(()=>save(next));},
  prepareTemplate(ids:readonly string[],templateId:string){if(!host.templateBatches)throw Error('Owned drawing template transaction is unavailable');return host.templateBatches.prepare(ids,templateId);},
  commitTemplate(token:PreparedDrawingTemplateBatch){if(!host.templateBatches)throw Error('Owned drawing template transaction is unavailable');return host.templateBatches.commit(token);},
  failTemplatePublication(receipt:Parameters<ReturnType<typeof createDrawingTemplateBatches>['publicationFailed']>[0],cause:unknown):never{if(!host.templateBatches)throw Error('Owned drawing template transaction is unavailable');return host.templateBatches.publicationFailed(receipt,cause);},
  applyTemplate(ids:readonly string[],templateId:string){return port.commitTemplate(port.prepareTemplate(ids,templateId));},
 };return port;
}
