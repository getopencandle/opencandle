import type {BarDataset} from '../domain/types';
import {sourceContextForDataset,sameChartSourceBasis} from '../chart/source-context';
import {ensureWorkspaceGrid,projectGrid,selectedDataset,workspaceDatasets,suppliedSourceId,transitionGridDrawingScopes,type ChartWorkspace} from './workspace-grid';
import {linkedDatasetAtInterval} from './source-basis';
import {instantiateIndicatorTemplate,resolveTemplateDataset,type IndicatorTemplate} from './indicator-templates';
import {assertTemplateDrawingData} from './template-drawing-validation';
import {resetIncompatibleFrame} from './frame-reset-policy';
import {drawingScopeBasis,drawingScopeKey} from './drawing-scopes';
import {validateDrawingPaneBinding} from '../chart/drawing-document-bindings';

export interface TemplatePaneOwnership {paneId:string;replaceable:boolean;logicalPaneId?:string|null;owners?:readonly {kind:string;id:string}[]}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function knownKeys(value:Record<string,unknown>,keys:readonly string[]){if(Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Drawing metadata has unknown fields. Template application cannot safely reconcile them.');}
/** Portable ownership must match the complete current inventory before any deletion. */
export function prepareTemplateDrawings(document:Record<string,unknown>,panes:readonly TemplatePaneOwnership[]):{document:Record<string,unknown>;removedIds:string[]}{
 assertTemplateDrawingData(document);
 assertTemplateDrawingData(panes);
 if(document.version!==1||!Array.isArray(document.drawings)||document.drawings.length>10000)throw new Error('Drawing document is unavailable for template application.');
 const inventory=new Map<string,TemplatePaneOwnership>();for(const pane of panes){if(!object(pane)||typeof pane.paneId!=='string'||!pane.paneId||inventory.has(pane.paneId)||typeof pane.replaceable!=='boolean'||pane.paneId==='price'&&pane.replaceable)throw new Error('Invalid native pane ownership inventory.');if(pane.owners!==undefined){if(!Array.isArray(pane.owners)||pane.owners.length>2048)throw new Error('Invalid native pane ownership inventory.');const owners=new Set<string>();for(const owner of pane.owners){if(!object(owner)||typeof owner.kind!=='string'||typeof owner.id!=='string'||!owner.id)throw new Error('Invalid native pane ownership inventory.');const key=JSON.stringify([owner.kind,owner.id]);if(owners.has(key))throw new Error('Invalid native pane ownership inventory.');owners.add(key);}}inventory.set(pane.paneId,pane);}if(!inventory.has('price'))throw new Error('Price pane ownership is missing.');
 const signature=(owners:readonly {kind:string;id:string}[])=>JSON.stringify(owners.map(owner=>JSON.stringify([owner.kind,owner.id])).sort());
 const removedIds:string[]=[],ids=new Set<string>();for(const row of document.drawings){
  if(!object(row)||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.paneId!=='string')throw new Error('A drawing has unresolved pane ownership. No template was applied.');ids.add(row.id);
  let binding;if(Object.hasOwn(row,'lvPaneBinding'))binding=validateDrawingPaneBinding(row.lvPaneBinding);else if(Object.hasOwn(row,'lvPaneOwners'))binding=validateDrawingPaneBinding({schemaVersion:1,target:row.lvLogicalPaneId!==undefined&&row.lvLogicalPaneId!==null?{kind:'logical',id:row.lvLogicalPaneId,owners:row.lvPaneOwners}:{kind:'owners',owners:row.lvPaneOwners}});else if(row.paneId==='price')binding=validateDrawingPaneBinding({schemaVersion:1,target:{kind:'price'}});else throw new Error('A drawing has unresolved portable pane ownership. No template was applied.');
  const target=binding.target,matches=panes.filter(pane=>target.kind==='price'?pane.paneId==='price':pane.paneId!=='price'&&Array.isArray(pane.owners)&&(target.kind!=='logical'||pane.logicalPaneId===target.id)&&signature(pane.owners)===signature(target.owners));
  if(matches.length!==1)throw new Error('A drawing has unresolved portable pane ownership. No template was applied.');if(matches[0].replaceable)removedIds.push(row.id);
 }
 if(!removedIds.length)return {document:structuredClone(document),removedIds};
 knownKeys(document,['version','drawings','lvDrawingManager']);const removed=new Set(removedIds),next=structuredClone(document);next.drawings=(next.drawings as Record<string,unknown>[]).filter(row=>!removed.has(String(row.id)));
 if(document.lvDrawingManager!==undefined){const manager=document.lvDrawingManager;if(!object(manager)||manager.schemaVersion!==1||!Array.isArray(manager.groups)||!Array.isArray(manager.templates))throw new Error('Drawings are unavailable. No template was applied.');knownKeys(manager,['schemaVersion','groups','templates']);
  const groups=new Set<string>(),members=new Set<string>();for(const group of manager.groups){if(!object(group)||typeof group.id!=='string'||!group.id||groups.has(group.id)||typeof group.name!=='string'||!Array.isArray(group.memberIds))throw new Error('Invalid drawing group metadata.');knownKeys(group,['id','name','memberIds']);groups.add(group.id);for(const id of group.memberIds){if(typeof id!=='string'||!ids.has(id)||members.has(id))throw new Error('Drawing group membership is unavailable.');members.add(id);}}
  const templates=new Set<string>();for(const template of manager.templates){if(!object(template)||typeof template.id!=='string'||templates.has(template.id)||typeof template.name!=='string'||typeof template.type!=='string'||!object(template.properties))throw new Error('Invalid drawing template metadata.');knownKeys(template,['id','name','type','properties']);templates.add(template.id);}
  next.lvDrawingManager={...structuredClone(manager),groups:manager.groups.map((group:Record<string,any>)=>({...structuredClone(group),memberIds:group.memberIds.filter((id:string)=>!removed.has(id))}))};
 }
 return {document:next,removedIds};
}

/** Resolve both link switches independently and preflight every source before native mutation. */
export function prepareTemplateSources<T extends ChartWorkspace>(state:T,template:IndicatorTemplate):{workspace:T;activeSource:BarDataset;sourceChanged:boolean;changedSourceIds:string[]}{
 const previous=ensureWorkspaceGrid(state),available=workspaceDatasets(previous),old=selectedDataset(previous),selected=resolveTemplateDataset(template,old,available);suppliedSourceId(previous,selected);
 const grid=structuredClone(previous.grid),active=grid.layout.cells.find(row=>row.id===grid.layout.activeCellId)!,changedSourceIds:string[]=[];
 const sourceChanged=!sameChartSourceBasis(sourceContextForDataset(old),sourceContextForDataset(selected),true),symbolRecall=template.rememberSymbol&&sourceChanged,intervalChanged=old.resolution!==selected.resolution;
 const atInterval=(source:BarDataset,interval:string)=>source.resolution===interval?source:linkedDatasetAtInterval(available,source,interval);
 for(const cell of grid.layout.cells){const current=available.find(row=>row.provenance.datasetId===grid.cells[cell.id].datasetId&&row.instrument.symbol===cell.symbol&&row.resolution===cell.interval);if(!current)throw new Error('A chart source is missing. No template was applied.');let next=current;
  if(cell.id===active.id)next=selected;
  else if(cell.group===active.group){if(symbolRecall&&grid.layout.sync.symbol)next=atInterval(selected,grid.layout.sync.interval?selected.resolution:current.resolution);else if(intervalChanged&&grid.layout.sync.interval)next=atInterval(current,selected.resolution);}
  if(!sameChartSourceBasis(sourceContextForDataset(current),sourceContextForDataset(next),true)){changedSourceIds.push(cell.id);cell.symbol=next.instrument.symbol;cell.interval=next.resolution;grid.cells[cell.id].datasetId=next.provenance.datasetId;grid.cells[cell.id]=resetIncompatibleFrame(previous.grid.cells[cell.id],grid.cells[cell.id],available,available);}
 }
 return {workspace:projectGrid(previous,transitionGridDrawingScopes(previous.grid,grid,available,available)),activeSource:selected,sourceChanged,changedSourceIds};
}

export function prepareTemplateApplication<T extends ChartWorkspace>(state:T,template:IndicatorTemplate,panes:readonly TemplatePaneOwnership[],occupied:readonly string[],makeId:()=>string){
 const resolved=prepareTemplateSources(state,template),next=ensureWorkspaceGrid(resolved.workspace),id=next.grid.layout.activeCellId,before=next.grid.cells[id];
 const changedScope=drawingScopeKey(drawingScopeBasis(selectedDataset(state)))!==drawingScopeKey(drawingScopeBasis(resolved.activeSource));
 if(changedScope&&(before.drawings.drawings as Record<string,unknown>[]).some(row=>row.paneId!=='price'||(Object.hasOwn(row,'lvPaneBinding')?validateDrawingPaneBinding(row.lvPaneBinding).target.kind!=='price':Object.hasOwn(row,'lvPaneOwners'))))throw new Error('The target symbol has retained drawings whose portable pane ownership must be reviewed before applying this template. No source or drawing was changed.');
 const drawings=prepareTemplateDrawings(before.drawings,panes),instances=instantiateIndicatorTemplate(template,makeId,occupied);
 const grid={...next.grid,cells:{...next.grid.cells,[id]:{...before,indicators:instances.indicators,scriptBindings:instances.scripts,drawings:drawings.document}}};
 const sources=workspaceDatasets(next);grid.cells[id]=resetIncompatibleFrame(before,grid.cells[id],sources,sources);
 return {...resolved,workspace:projectGrid(next,grid),activeId:id,removedDrawingIds:drawings.removedIds,replacedIndicators:before.indicators.length,replacedScripts:before.scriptBindings?.length??0};
}

/** What applying (or undoing) a template does to long-lived work identities. */
export interface TemplateIdentityEffect {retireReplay:boolean;retireAlerts:boolean;retireScripts:boolean;freshExecutionIdentity:true}
/** Replay policy: a template that changes the chart source retires the replay session, alert and script identities
 * tied to the old source (ordinary virtual paper history is untouched); a same-source template keeps the replay prefix.
 * Either way the applied or restored state gets a fresh execution identity, so stale work cannot publish after an undo.
 * Pure decision; the host applies it. `sourceChanged` comes from prepareTemplateSources / prepareTemplateApplication. */
export function templateIdentityEffect(preparation:{sourceChanged:boolean}):TemplateIdentityEffect{
 if(!preparation||typeof preparation.sourceChanged!=='boolean')throw new Error('Template identity policy needs an explicit sourceChanged decision.');
 const retire=preparation.sourceChanged;
 return{retireReplay:retire,retireAlerts:retire,retireScripts:retire,freshExecutionIdentity:true};
}
