import React,{useEffect,useRef,useState} from 'react';
import {displayExchange} from '../domain/fixtures';
import type {ChartController} from '../chart/adapter';
import type {IndicatorInstanceView} from '../chart/indicator-port';
import type {BarDataset} from '../domain/types';
import {ChartCandlesIcon,IndicatorsIcon,EyeIcon,HideDrawingsIcon,LockOpenIcon,LockClosedIcon,RemoveObjectsIcon,ChevronFlyoutIcon,DRAWING_TOOL_ICON,LV_ICONS,type LvIconId} from './icons';
import {ObjectTreeGroupIcon,ObjectTreeCloneIcon,ObjectTreeMoveToIcon,ObjectTreeManageIcon} from './ObjectTreePanelIcons';
import {drawingTypeIconId} from './drawing-tool-catalog';
import {removeObjectsAsOneStep} from './object-tree-removal';
import {placeObjectTreeDropdown,placeObjectTreeMenu,placeObjectTreeSubmenu,type MenuPlacement,type MenuViewport} from './object-tree-menu-placement';
import {OBJECT_TREE_TOOLBAR,COPY_CLONE_MENU,MOVE_TO_MENU,buildObjectTree,drawingInput,drawingFrontToBack,drawingMenu,keyId,nextGroupName,pinToScaleMenu,pinToScalePlacement,reorderFrontCalls,rowButtonLabel,selectedDrawingIds,dropGroupTarget,groupOfDrawings,rowButtonTargets,studyMenu,studyTitle,seriesTreeMenu,studyDropPlan,toolbarState,drawingKey,groupKey,type ObjectTreeDrawingInput,type ObjectTreeGroupInput,type ObjectTreeMenuItem,type ObjectTreeNode,type ObjectTreeRowButton,type ObjectTreeToolbarId} from './object-tree-model';
import {studyOnPricePane,finishNewPaneAbove,canPlacePaneAbovePrice} from '../chart/pane-actions';
import {indicatorMoveChoices,existingPaneTarget,isExistingPaneMove,type IndicatorMoveWhere,type IndicatorExistingPaneMove} from './indicator-move-targets';
import {indicatorIntervalVisibility} from '../chart/indicator-visibility';
import {pinToScaleLabel,indicatorClipboard,indicatorCopiedMessage,indicatorOrderState,indicatorOrderAfter,indicatorVisualOrderAvailable,isIndicatorOrderStep,isIndicatorPermutation,visualOrderItems,type IndicatorOrderStep} from '../chart/legend-model';
import type {IndicatorScaleSide,IndicatorScaleChoice} from '../chart/indicator-scale';
import type {IndicatorScalePin} from './object-tree-model';
import './object-tree-panel.css';

/** Chart members the panel uses. Every mutation goes through these ports. */
export type ObjectTreeChart=Pick<ChartController,'drawingManager'|'captureDrawingManagerOwner'|'onDrawingsChanged'|'onDrawingSelection'|'drawings'|'indicators'|'drawingCatalog'>&Partial<Pick<ChartController,'duplicateDrawings'|'copyDrawings'|'chart'|'cutDrawings'|'pasteDrawings'|'clipboardSize'>>;
export type IndicatorRowAction='toggle'|'remove';
/** What a queued edit acts on (see deferDrawingEdit). */
export interface ObjectTreeEditTargets {drawings?:readonly string[];groups?:readonly string[];quiet?:boolean}
export interface ObjectTreePanelProps {
 chart:ObjectTreeChart|null;
 /** Main series source: symbol, exchange and interval for the series row. */
 dataset:Pick<BarDataset,'instrument'|'resolution'>|null;
 /** Indicator instances in legend order (the same list the legend shows). */
 indicators:readonly IndicatorInstanceView[];
 /** Main series visibility; the series Hide button needs onSeriesVisibility (App wires it to the active cell). */
 seriesVisible?:boolean;
 onSeriesVisibility?:(visible:boolean)=>void;
 /** Optional owner-checked indicator route (App: applyIndicatorLegendAction). Default: indicator port update/remove. */
 onIndicatorAction?:(row:IndicatorInstanceView,action:IndicatorRowAction)=>void;
 /** Owner-checked "Move to" route (App: move through the indicator port, then confirmAnalysisCapture).
  * A host that supplies onIndicatorAction must also supply this for Move to to be enabled, so a move
  * never bypasses the host's capture route. Default without host routes: indicator port move. */
 onIndicatorMove?:(row:IndicatorInstanceView,where:'above'|'below')=>void;
 /** Existing pane above / below in the row menu's Move to (indicator-move-targets, entries). A host lists
  * them by supplying this owner-checked route (App: applyIndicatorMove). A panel without host routes lists them with
  * existingPaneMoves and merges through the indicator port. A host that supplies onIndicatorAction or onIndicatorMove but not
  * this route never lists them, so a merge never bypasses the host's capture route. Absent keeps the two new-pane
  * entries. The toolbar Move to menu always keeps those two. */
 onIndicatorMoveExisting?:(row:IndicatorInstanceView,where:IndicatorExistingPaneMove)=>void;
 existingPaneMoves?:boolean;
 /** The owner-checked Visual order route (App: the indicator port restore in the new
  * order, then the saved-capture check). `ids` names every listed indicator once, in the new list order (legend-model.ts).
  * Without host routes the panel restores through the indicator port; a host that supplies onIndicatorAction but not this
  * route gets no Visual order and no same-pane drag, so a reorder never bypasses its capture route. */
 onIndicatorReorder?:(ids:readonly string[])=>void;
 /** The owner-checked route for an indicator row dropped on an indicator of another pane (App: the indicator
  * port move into that pane). Same rule as onIndicatorReorder: without host routes the panel moves through the port. */
 onIndicatorMovePane?:(row:IndicatorInstanceView,target:'price'|{pane:string})=>void;
 /** Told the status text after an indicator Copy (the indicator clipboard, legend-model.ts). */
 onIndicatorCopied?:(message:string)=>void;
 /** The series row menu routes (seriesTreeMenu); each one absent leaves its row out. */
 onSeriesAlert?:()=>void;
 onSeriesAddIndicator?:()=>void;
 onSeriesSymbolInfo?:()=>void;
 onSeriesTableView?:()=>void;
 onSeriesSettings?:()=>void;
 onSeriesPinToScale?:(side:'left'|'right')=>void;
 /** Reads the side of the main price scale for the series Pin to scale wording when the menu opens; absent = right. */
 seriesScaleSide?:()=>'left'|'right';
 /** The host Pin to scale route (App: applyIndicatorScale) and the placement it reads
  * (App: the legend's scaleOf/scaleSides). Both together enable the row menu item; absent keeps it disabled. */
 onIndicatorScale?:(row:IndicatorInstanceView,placement:IndicatorScalePin)=>void;
 /** Choices lists the existing extra scales on the row's pane it can share (absent: none offered). */
 indicatorScale?:(row:IndicatorInstanceView)=>{current:IndicatorScaleSide|null;sides:{left:boolean;none:boolean};choices?:readonly IndicatorScaleChoice[]};
 /** Owner-checked removal of a multi-selection as ONE workspace step (App: the legend route's checks per
  * indicator, then removeObjectsAsOneStep with removeDrawings, then the saved-capture check). A host that supplies
  * onIndicatorAction must also supply this for a multi-selection Delete to be one undo step, so a removal never
  * bypasses the host's capture route; without it each indicator goes through onIndicatorAction (its own step).
  * Default without host routes: removeObjectsAsOneStep on the indicator port. */
 onRemoveObjects?:(request:{indicators:IndicatorInstanceView[];drawingIds:string[];removeDrawings:()=>void})=>void;
 onOpenIndicatorSettings?:(id:string,tab?:'visibility')=>void;
 onOpenDrawingSettings?:(id:string,tab?:'visibility')=>void;
 onManageDrawings?:()=>void;
 onAddIndicatorAlert?:(id:string)=>void;
 onAddChildIndicator?:(id:string)=>void;
 onFavoriteIndicator?:(id:string)=>void;
 /** Read when the row menu opens; true shows the remove-from-favorites wording. */
 isFavoriteIndicator?:(id:string)=>boolean;
 /** Called after an accepted drawing action (App: captureDrawings). */
 onDrawingsChanged?:()=>void;
 /** The routine background autosave holds the chart for its write, and the chart refuses a drawing edit
  * meanwhile. App queues `run` behind the write (in press order with held keys) and runs it when the write ends, after
  * checking the chart and that the named drawings and groups still exist. true: queued; false: run it now. quiet: no
  * waiting notice, and a selection whose drawings are gone is dropped silently. */
 deferDrawingEdit?:(run:()=>void,targets:ObjectTreeEditTargets)=>boolean;
 onSelectionChange?:(keys:string[])=>void;
 onError?:(message:string)=>void;
}
/** `cur` is the roving-tabindex item, as `<level>/<item id>` (level `root` or the owning submenu item id). */
interface MenuState {key:string;x:number;y:number;items:ObjectTreeMenuItem[];sub:string|null;cur:string}
const enabledMenuItems=(items:readonly ObjectTreeMenuItem[])=>items.filter(item=>!item.separator&&!item.disabled);
/** Menu items that run in this panel keep the keyboard on the tree; items that open other UI hand focus to it. */
const MENU_HANDS_OFF_FOCUS=new Set(['rename','settings','intervals','alert','child-study','series-alert','series-addIndicator','series-symbolInfo','series-tableView','series-settings']);
interface DropState {key:string;place:'before'|'after'}
const catalogLabels=new WeakMap<object,Map<string,string>>();
function labelsFor(chart:ObjectTreeChart):Map<string,string>{
 let labels=catalogLabels.get(chart);if(labels)return labels;
 labels=new Map();try{for(const row of chart.drawingCatalog())labels.set(String(row.type),String(row.label));}catch{/* Catalog labels are cosmetic; type ids remain. */}
 catalogLabels.set(chart,labels);return labels;
}
const iconFor=(node:ObjectTreeNode)=>{
 if(node.kind==='series')return ChartCandlesIcon;
 if(node.kind==='study')return IndicatorsIcon;
 if(node.kind==='group')return ObjectTreeGroupIcon;
 const id=(DRAWING_TOOL_ICON[node.drawingType??'']??drawingTypeIconId(node.drawingType??'')) as LvIconId|undefined;
 return id&&LV_ICONS[id]?LV_ICONS[id].Icon:ObjectTreeCloneIcon;
};
const describe=(error:unknown)=>error instanceof Error?error.message:String(error);
/** A shown indicator whose interval visibility rule hides it on the chart interval (an unreadable rule counts as not hidden here). */
function hiddenOnInterval(row:IndicatorInstanceView,resolution:string|undefined):boolean{
 try{return row.visible&&!indicatorIntervalVisibility(row.presentation?.visibility,resolution).visible;}catch{return false;}
}
/** Whether the row menu's Move to lists the existing-pane entries (see onIndicatorMoveExisting). */
const existingMovesListed=(p:ObjectTreePanelProps)=>!!p.onIndicatorMoveExisting||p.existingPaneMoves===true&&!p.onIndicatorMove&&!p.onIndicatorAction;
const MOVE_ITEM_IDS:Readonly<Record<IndicatorMoveWhere,string>>=Object.freeze({above:'move-above',below:'move-below','existing-above':'move-existing-above','existing-below':'move-existing-below'});
const MOVE_BY_ITEM:Readonly<Record<string,IndicatorMoveWhere>>=Object.freeze(Object.fromEntries(Object.entries(MOVE_ITEM_IDS).map(([where,id])=>[id,where as IndicatorMoveWhere])));
/** The menu's own window client area; null when unreadable (the stylesheet position is then kept). */
function clientViewport(element:HTMLElement):MenuViewport|null{
 const doc=element.ownerDocument,view=doc?.defaultView,width=Math.min(view?.innerWidth??NaN,doc?.documentElement?.clientWidth||Infinity),height=Math.min(view?.innerHeight??NaN,doc?.documentElement?.clientHeight||Infinity);
 return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0?{width,height}:null;
}
const clientRect=(element:Element)=>{const rect=element.getBoundingClientRect();return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height};};
/** Moves a mounted menu box to `target` (client px) by its offset from where it rendered: the same for the fixed context menu and the absolutely positioned submenu and toolbar menu. */
function moveMenuTo(element:HTMLElement,target:MenuPlacement){
 const now=clientRect(element),left=parseFloat(element.style.left),top=parseFloat(element.style.top);
 element.style.left=`${(Number.isFinite(left)?left:element.offsetLeft)+target.left-now.left}px`;element.style.top=`${(Number.isFinite(top)?top:element.offsetTop)+target.top-now.top}px`;
}
/** Ref callback keeping an opened Object tree menu inside the window: the context menu at its pointer point, a submenu beside its item, a toolbar menu under its button. */
export function fitObjectTreeMenu(element:HTMLElement|null,anchor:{x:number;y:number}|'submenu'|'dropdown'){
 if(!element||typeof element.getBoundingClientRect!=='function')return;const viewport=clientViewport(element);if(!viewport)return;const size=clientRect(element);
 if(typeof anchor==='object'){moveMenuTo(element,placeObjectTreeMenu(anchor,size,viewport));return;}
 const owner=element.parentElement;if(!owner)return;const rect=clientRect(owner);
 moveMenuTo(element,anchor==='submenu'?placeObjectTreeSubmenu(rect,size,viewport):placeObjectTreeDropdown(rect,size,viewport));
}
/** "Move to" target for an indicator: a new pane directly above (before) or below (after) the pane
 * that holds its native model. */
export function studyMoveTarget(chart:{chart?:{panes:{list():readonly {id:string;indicators:readonly {id:string}[]}[]}}},rendererId:string,where:'above'|'below'):{newPane:{before:string}|{after:string}}{
 const pane=chart.chart?.panes.list().find(item=>item.indicators.some(native=>native.id===rendererId));if(!pane)throw Error('This indicator pane is unavailable.');
 return {newPane:where==='above'?{before:pane.id}:{after:pane.id}};
}

export function ObjectTreePanel(props:ObjectTreePanelProps){
 const {chart,dataset,indicators}=props;
 const [epoch,setEpoch]=useState(0),[selection,setSelectionState]=useState<string[]>([]),[collapsed,setCollapsed]=useState<string[]>([]);
 const [menu,setMenu]=useState<MenuState|null>(null),[toolbarMenu,setToolbarMenu]=useState<ObjectTreeToolbarId|null>(null),[rename,setRename]=useState<{key:string;draft:string}|null>(null),[drop,setDrop]=useState<DropState|null>(null),[error,setError]=useState('');
 const anchor=useRef<string|null>(null),dragging=useRef<string[]>([]),draggingStudy=useRef<string|null>(null),renameSession=useRef<string|null>(null),latest=useRef(props);latest.current=props;
 const itemEls=useRef(new Map<string,HTMLElement>()),rowEls=useRef(new Map<string,HTMLElement>()),menuFocus=useRef<{level:string;at:'first'|'last'}|null>(null),rowFocus=useRef<string|null>(null);
 const cache=useRef<{chart:ObjectTreeChart|null;epoch:number;resolution:string|undefined;native:readonly unknown[];drawings:ObjectTreeDrawingInput[];groups:ObjectTreeGroupInput[];readError:string}|null>(null);
 // Chart selection is the authority for drawing rows; series and indicator rows keep their local selection.
 useEffect(()=>{if(!chart)return;setSelectionState([]);const offChanged=chart.onDrawingsChanged(()=>setEpoch(value=>value+1));const offSelected=chart.onDrawingSelection(ids=>setSelectionState(current=>{const kept=current.filter(key=>!key.startsWith('drawing:')&&!key.startsWith('group:')),known=new Set(selectedDrawingIds([],new Set(current),cache.current?.groups??[]));if(ids.length===known.size&&ids.every(id=>known.has(id)))return current;const next=[...kept,...ids.map(drawingKey)];latest.current.onSelectionChange?.(next);return next;}));return()=>{offChanged();offSelected();};},[chart]);
 useEffect(()=>{if(!menu&&!toolbarMenu)return;if(typeof document==='undefined')return;const close=(event:Event)=>{const target=event.target as Element|null;if(target&&typeof target.closest==='function'&&target.closest('.lv-ot-menu,.lv-ot-toolbar-menu'))return;setMenu(null);setToolbarMenu(null);};document.addEventListener('pointerdown',close,true);return()=>document.removeEventListener('pointerdown',close,true);},[menu,toolbarMenu]);

 // Drawing rows come from the drawing manager document, re-read when the chart reports a change or
 // when the native drawing objects were replaced: a workspace undo/redo restores through
 // loadDrawings (native fromJSON), which publishes no drawing change of its own.
 let nativeObjects:readonly unknown[]=[];if(chart){try{nativeObjects=chart.drawings.all() as readonly unknown[];}catch{nativeObjects=[];}}
 const nativeChanged=!cache.current||cache.current.native.length!==nativeObjects.length||nativeObjects.some((item,index)=>cache.current!.native[index]!==item);
 if(!cache.current||cache.current.chart!==chart||cache.current.epoch!==epoch||cache.current.resolution!==dataset?.resolution||nativeChanged){
  let drawings:ObjectTreeDrawingInput[]=[],groups:ObjectTreeGroupInput[]=[],readError='';
  if(chart){try{const labels=labelsFor(chart);drawings=chart.drawingManager.list().map(row=>drawingInput(row,labels,dataset?.resolution));groups=chart.drawingManager.state().groups.map(group=>({id:group.id,name:group.name,memberIds:[...group.memberIds]}));}catch(cause){readError=describe(cause);}}
  cache.current={chart,epoch,resolution:dataset?.resolution,native:nativeObjects,drawings,groups,readError};
 }
 const {drawings,groups,readError}=cache.current;
 const series=dataset?{symbol:dataset.instrument.symbol,exchange:displayExchange(dataset.instrument.exchange),interval:dataset.resolution,description:dataset.instrument.name,visible:props.seriesVisible}:null;
 const treeIndicators=indicators.map(row=>({id:row.id,kind:row.kind,visible:row.visible,intervalHidden:hiddenOnInterval(row,dataset?.resolution)}));
 const nodes=buildObjectTree({series,indicators:treeIndicators,drawings,groups,collapsed:new Set(collapsed)});
 const allNodes=collapsed.length?buildObjectTree({series,indicators:treeIndicators,drawings,groups}):nodes;
 const liveSelection=selection.filter(key=>allNodes.some(row=>row.key===key)),selected=new Set(liveSelection);
 const canMove=!!props.onIndicatorMove||!props.onIndicatorAction,routes={clone:!!chart?.duplicateDrawings,copy:!!chart?.copyDrawings,moveTo:!!chart&&canMove,manage:!!props.onManageDrawings};
 const toolbar=toolbarState(allNodes,selected,routes);
 // Visual order and pane drag for indicators, through the host routes (or the port when there are none).
 const canReorder=!!props.onIndicatorReorder||!props.onIndicatorAction,canMovePane=!!props.onIndicatorMovePane||!props.onIndicatorAction&&!props.onIndicatorMove;

 function fail(cause:unknown){const message=describe(cause);setError(message);latest.current.onError?.(message);}
 function setSelection(next:string[]){setSelectionState(next);latest.current.onSelectionChange?.(next);}
 /** True when the host queued `run` behind the background autosave (it runs when the write ends). */
 function deferred(run:()=>void,targets:ObjectTreeEditTargets):boolean{const defer=latest.current.deferDrawingEdit;return !!chart&&typeof defer==='function'&&defer(run,targets)===true;}
 /** Runs one drawing-manager action under a fresh source-ownership check (queued behind a background autosave).
  * after: runs once the action is accepted (also when it runs from the queue). */
 function drawingAction(action:(manager:ObjectTreeChart['drawingManager'])=>void,targets:ObjectTreeEditTargets={},after?:()=>void){
  if(!chart)return false;
  if(deferred(()=>{applyDrawingAction(action,after);},targets))return false;
  return applyDrawingAction(action,after);
 }
 function applyDrawingAction(action:(manager:ObjectTreeChart['drawingManager'])=>void,after?:()=>void){
  if(!chart)return false;
  try{setError('');const assertOwner=chart.captureDrawingManagerOwner();assertOwner();action(chart.drawingManager);assertOwner();setEpoch(value=>value+1);latest.current.onDrawingsChanged?.();after?.();return true;}catch(cause){fail(cause);return false;}
 }
 function indicatorAction(id:string,action:IndicatorRowAction){
  const row=latest.current.indicators.find(item=>item.id===id);if(!row||!chart)return;
  try{setError('');if(latest.current.onIndicatorAction){latest.current.onIndicatorAction(row,action);return;}const port=chart.indicators;if(action==='remove')port.remove(row.id);else port.update(row.id,{visible:!row.visible});}catch(cause){fail(cause);}
 }
 function syncChartSelection(next:readonly string[]){
  if(!chart)return;const ids=selectedDrawingIds(allNodes,new Set(next),groups);
  // The chart refuses the owner-checked select while the background autosave holds it; it follows after.
  const select=()=>{try{const assertOwner=chart.captureDrawingManagerOwner();assertOwner();chart.drawingManager.select(ids);}catch(cause){fail(cause);}};
  if(ids.length&&deferred(select,{drawings:ids,quiet:true}))return;
  try{if(ids.length)select();else if(selectedDrawingIds(allNodes,selected,groups).length)chart.drawings.select([]);}catch(cause){fail(cause);}
 }
 function choose(node:ObjectTreeNode,event?:{ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean}){
  let next:string[];
  if(event?.shiftKey&&anchor.current&&nodes.some(row=>row.key===anchor.current)){const from=nodes.findIndex(row=>row.key===anchor.current),to=nodes.findIndex(row=>row.key===node.key);next=nodes.slice(Math.min(from,to),Math.max(from,to)+1).map(row=>row.key);}
  else if(event?.ctrlKey||event?.metaKey){next=selected.has(node.key)?liveSelection.filter(key=>key!==node.key):[...liveSelection,node.key];anchor.current=node.key;}
  else{next=[node.key];anchor.current=node.key;}
  setSelection(next);syncChartSelection(next);
 }
 function targets(node:ObjectTreeNode):ObjectTreeNode[]{return selected.has(node.key)&&liveSelection.length>1?allNodes.filter(row=>selected.has(row.key)):[node];}
 function drawingIdsOf(list:readonly ObjectTreeNode[]):string[]{return selectedDrawingIds(allNodes,new Set(list.map(row=>row.key)),groups);}
 function rowButton(node:ObjectTreeNode,button:ObjectTreeRowButton){
  if(node.kind==='series'){if(button==='hide')latest.current.onSeriesVisibility?.(!node.visible);return;}
  // Like a drawing hidden on this interval (#row.hide hiddenOnIntervalClick), the study's eye opens its Visibility tab.
  if(node.kind==='study'&&button==='hide'&&node.intervalHidden){latest.current.onOpenIndicatorSettings?.(node.id,'visibility');return;}
  if(node.kind==='study'&&rowButtonTargets(node,liveSelection)==='row'){indicatorAction(node.id,button==='remove'?'remove':'toggle');return;}
  if(button==='hide'&&node.intervalHidden){const first=node.kind==='group'?keyId(node.memberKeys[0]??''):node.id;if(first)latest.current.onOpenDrawingSettings?.(first,'visibility');return;}
  // On a row of a multi-selection the button acts on the whole selection (bulk Lock, Hide and Remove, one step each).
  const list=rowButtonTargets(node,liveSelection)==='selection'?targets(node).filter(row=>row.kind!=='series'):[node],ids=drawingIdsOf(list);
  if(button==='remove'){removeNodes(list);return;}
  if(button==='hide')for(const row of list)if(row.kind==='study'&&row.visible===node.visible)indicatorAction(row.id,'toggle');
  if(!ids.length)return;
  if(button==='lock')drawingAction(manager=>manager.set(ids,{locked:!node.locked}),{drawings:ids});
  else if(button==='hide')drawingAction(manager=>manager.set(ids,{visible:!node.visible}),{drawings:ids});
 }
 function removeNodes(list:readonly ObjectTreeNode[]){
  // A removal with drawings waits for the background autosave as a whole (one step, as before); a removal of
  // indicators only goes through the host's indicator route, which waits on its own.
  const drawingIds=drawingIdsOf(list.filter(row=>row.kind==='drawing'||row.kind==='group'));
  if(drawingIds.length&&deferred(()=>removeNodesNow(list),{drawings:drawingIds}))return;
  removeNodesNow(list);
 }
 function removeNodesNow(list:readonly ObjectTreeNode[]){
  // One manager transaction (one workspace undo step); a group row disappears with its last drawing.
  const studies=list.filter(row=>row.kind==='study'),ids=drawingIdsOf(list.filter(row=>row.kind==='drawing'||row.kind==='group')),p=latest.current;
  // A multi-selection with indicators is one workspace step (held indicator publication, see removeObjectsAsOneStep).
  const together=!!chart&&studies.length>0&&studies.length+(ids.length?1:0)>1&&(!!p.onRemoveObjects||!p.onIndicatorAction&&typeof chart.indicators.beginExternalTransaction==='function');
  if(together)removeTogether(studies,ids);
  else{for(const node of studies)indicatorAction(node.id,'remove');if(ids.length)applyDrawingAction(manager=>manager.remove(ids));}
  setSelection(liveSelection.filter(key=>!list.some(row=>row.key===key)));
 }
 function removeTogether(studies:readonly ObjectTreeNode[],ids:readonly string[]){
  if(!chart)return;const rows=studies.map(node=>latest.current.indicators.find(item=>item.id===node.id)).filter((row):row is IndicatorInstanceView=>!!row);
  // A selected study no longer listed refuses the whole batch (as App refuses a stale fingerprint) instead of being dropped.
  if(rows.length!==studies.length){fail(Error('This indicator changed. Review its current settings.'));return;}
  let drawingsRemoved=false;
  const removeDrawings=()=>{if(!ids.length)return;const assertOwner=chart.captureDrawingManagerOwner();assertOwner();chart.drawingManager.remove(ids);assertOwner();drawingsRemoved=true;};
  try{setError('');const host=latest.current.onRemoveObjects;if(host)host({indicators:rows,drawingIds:[...ids],removeDrawings});else removeObjectsAsOneStep(chart.indicators,rows.map(row=>row.id),ids.length?removeDrawings:undefined);}
  catch(cause){fail(cause);}
  finally{if(drawingsRemoved){setEpoch(value=>value+1);latest.current.onDrawingsChanged?.();}}
 }
 function createGroup(list:readonly ObjectTreeNode[]){
  const ids=drawingIdsOf(list);if(!ids.length)return;let created='';
  drawingAction(manager=>{created=manager.group(ids,nextGroupName(manager.state().groups));},{drawings:ids},()=>{if(created)setSelection([groupKey(created)]);});
 }
 function cloneNodes(list:readonly ObjectTreeNode[]){
  const ids=drawingIdsOf(list);if(!ids.length||!chart?.duplicateDrawings)return;
  if(deferred(()=>cloneNow(ids),{drawings:ids}))return;cloneNow(ids);
 }
 function cloneNow(ids:readonly string[]){
  if(!chart?.duplicateDrawings)return;
  try{setError('');chart.duplicateDrawings(ids);setEpoch(value=>value+1);latest.current.onDrawingsChanged?.();}catch(cause){fail(cause);}
 }
 function copyNodes(list:readonly ObjectTreeNode[]){
  const ids=drawingIdsOf(list);if(!ids.length||!chart?.copyDrawings)return;
  const copy=()=>{try{setError('');chart.copyDrawings!(ids);}catch(cause){fail(cause);}};// no history, no repaint
  if(deferred(copy,{drawings:ids}))return;copy();
 }
 /** Cut = copy to the shared clipboard, then remove as one manager step (one workspace undo step). */
 function cutNodes(list:readonly ObjectTreeNode[]){
  const ids=drawingIdsOf(list);if(!ids.length||!chart?.cutDrawings)return;
  if(deferred(()=>cutNow(list,ids),{drawings:ids}))return;cutNow(list,ids);
 }
 function cutNow(list:readonly ObjectTreeNode[],ids:readonly string[]){
  if(!chart?.cutDrawings)return;
  try{setError('');chart.cutDrawings(ids);setEpoch(value=>value+1);latest.current.onDrawingsChanged?.();setSelection(liveSelection.filter(key=>!list.some(row=>row.key===key)));}catch(cause){fail(cause);}
 }
 /** Paste (Ctrl + V) from the shared clipboard, one step. */
 function pasteObjects(){
  if(!chart?.pasteDrawings)return;
  if(deferred(pasteNow,{}))return;pasteNow();
 }
 function pasteNow(){
  if(!chart?.pasteDrawings)return;
  try{setError('');chart.pasteDrawings();setEpoch(value=>value+1);latest.current.onDrawingsChanged?.();}catch(cause){fail(cause);}
 }
 /** Ungroup every selected group row, one manager step each. */
 function ungroupNodes(list:readonly ObjectTreeNode[]){
  const chosen=list.filter(row=>row.kind==='group');if(!chosen.length)return;
  drawingAction(manager=>{for(const row of chosen)manager.ungroup(row.id);},{groups:chosen.map(row=>row.id)},()=>setSelection(chosen.flatMap(row=>row.memberKeys)));
 }
 /** Every Move to choice. The host route (App) takes all four; without one an existing-pane choice merges through the
  * indicator port (indicator-move-targets) and the new-pane choices keep moveStudy. */
 function moveStudyTo(id:string,where:IndicatorMoveWhere){
  if(!isExistingPaneMove(where)){moveStudy(id,where);return;}
  if(!chart||!canMove)return;const row=latest.current.indicators.find(item=>item.id===id);if(!row)return;
  try{setError('');const host=latest.current.onIndicatorMoveExisting;if(host){host(row,where);return;}if(!existingMovesListed(latest.current))return;chart.indicators.move(id,existingPaneTarget(chart,row.rendererId,latest.current.indicators,where));}catch(cause){fail(cause);}
 }
 function moveStudy(id:string,where:'above'|'below'){
  if(!chart||!canMove)return;const row=latest.current.indicators.find(item=>item.id===id);if(!row)return;
  try{setError('');if(latest.current.onIndicatorMove){latest.current.onIndicatorMove(row,where);return;}const raise=where==='above'&&studyOnPricePane(chart,row.rendererId);if(raise){const can=canPlacePaneAbovePrice(chart,row.rendererId);if(!can.ok)throw new Error(can.message);}chart.indicators.move(id,studyMoveTarget(chart,row.rendererId,where));if(raise){const lifted=finishNewPaneAbove(chart,row.rendererId,true);if(!lifted.ok)throw new Error(lifted.message);}}catch(cause){fail(cause);}
 }
 const orderRows=()=>latest.current.indicators.map(row=>({id:row.id,paneId:row.paneId}));
 /** Lists the indicators in `ids` order (Visual order and same-pane drag). */
 function reorderStudies(ids:readonly string[]){
  if(!chart||!canReorder)return;const p=latest.current;
  try{setError('');if(p.onIndicatorReorder){p.onIndicatorReorder(ids);return;}
   const port=chart.indicators,saved=port.serialize(),byId=new Map(saved.map(row=>[row.id,row] as const));
   if(!isIndicatorPermutation(saved,ids))throw new Error('This indicator changed. Review its current settings.');
   port.restore(ids.map(id=>byId.get(id)!));}catch(cause){fail(cause);}
 }
 function orderStudy(id:string,step:IndicatorOrderStep){const ids=indicatorOrderAfter(orderRows(),id,step);if(ids)reorderStudies(ids);}
 function moveStudyToPane(id:string,target:'price'|{pane:string}){
  if(!chart||!canMovePane)return;const p=latest.current,row=p.indicators.find(item=>item.id===id);if(!row)return;
  try{setError('');if(p.onIndicatorMovePane){p.onIndicatorMovePane(row,target);return;}chart.indicators.move(id,target);}catch(cause){fail(cause);}
 }
 function copyStudy(id:string){
  const row=latest.current.indicators.find(item=>item.id===id);if(!row)return;
  try{setError('');const clip=indicatorClipboard.copy(row,studyTitle(row.kind));latest.current.onIndicatorCopied?.(indicatorCopiedMessage(clip.title));}catch(cause){fail(cause);}
 }
 function dropStudy(node:ObjectTreeNode,place:'before'|'after'){
  const moving=draggingStudy.current;draggingStudy.current=null;setDrop(null);if(!moving)return;
  const plan=studyDropPlan(orderRows(),moving,node.id,place);if(!plan)return;
  if(plan.kind==='order')reorderStudies(plan.ids);else moveStudyToPane(moving,plan.target);
 }
 // Enter and blur can both end one rename session; only the first commits.
 function commitRename(){
  if(!rename||renameSession.current!==rename.key)return;renameSession.current=null;const node=allNodes.find(row=>row.key===rename.key),draft=rename.draft;setRename(null);if(!node||draft===node.title)return;
  if(node.kind==='drawing')drawingAction(manager=>manager.renameDrawing(node.id,draft),{drawings:[node.id]});else if(node.kind==='group')drawingAction(manager=>manager.renameGroup(node.id,draft),{groups:[node.id]});
 }
 function openMenu(node:ObjectTreeNode,x:number,y:number){
  if(!selected.has(node.key))choose(node);
  let items:ObjectTreeMenuItem[]=[];
  if(node.kind==='series'){const p=latest.current;items=seriesTreeMenu({symbol:dataset?.instrument.symbol??node.title,hidden:!node.visible,...(p.seriesScaleSide?{mainScaleSide:(()=>{try{return p.seriesScaleSide!();}catch{return 'right' as const;}})()}:{}),routes:{alert:!!p.onSeriesAlert,addIndicator:!!p.onSeriesAddIndicator,symbolInfo:!!p.onSeriesSymbolInfo,tableView:!!p.onSeriesTableView,pinToScale:!!p.onSeriesPinToScale,hide:!!p.onSeriesVisibility,settings:!!p.onSeriesSettings}});}
  else if(node.kind==='study'){const p=latest.current,row=p.indicators.find(item=>item.id===node.id);
   // Host-enabled Move to (existing panes) and Pin to scale submenus.
   const moveTo=existingMovesListed(p)&&chart&&row?indicatorMoveChoices(chart,row.rendererId,p.indicators).map(choice=>({id:MOVE_ITEM_IDS[choice.id],label:choice.label,...(choice.disabled?{disabled:true,title:choice.disabled}:{})})):undefined;
   let scale:{current:IndicatorScaleSide|null;sides:{left:boolean;none:boolean};choices?:readonly IndicatorScaleChoice[]}|null=null;if(p.onIndicatorScale&&p.indicatorScale&&row){try{scale=p.indicatorScale(row);}catch{scale=null;}}
   // A shared indicator rides the main price scale, so its wording follows that side.
   const mainSide=(()=>{try{return (chart as {priceScale?:{settings():{mainSide?:string}}}|null)?.priceScale?.settings().mainSide==='left'?'left' as const:'right' as const;}catch{return 'right' as const;}})();
   const pinToScale=scale?{label:pinToScaleLabel(scale.current,mainSide),items:pinToScaleMenu(scale.current,scale.sides,scale.choices??[])}:undefined;
   // Visual order when the pane holds another indicator; Copy through the indicator clipboard.
   const ordering=!!chart&&canReorder&&indicatorVisualOrderAvailable(orderRows(),node.id),visualOrder=ordering?visualOrderItems(indicatorOrderState(orderRows(),node.id)):undefined;
   items=studyMenu(node.title,null,{alert:!!p.onAddIndicatorAlert,childStudy:!!p.onAddChildIndicator,favorite:!!p.onFavoriteIndicator,visualOrder:ordering,intervals:!!p.onOpenIndicatorSettings,moveTo:!!chart&&canMove,pinToScale:!!pinToScale,copy:!!row,settings:!!p.onOpenIndicatorSettings},node.visible,{...(moveTo?{moveTo}:{}),...(pinToScale?{pinToScale}:{}),...(visualOrder?{visualOrder}:{}),...(p.onFavoriteIndicator&&(()=>{try{return p.isFavoriteIndicator?.(node.id)===true;}catch{return false;}})()?{favorited:true}:{})});}
  else if(node.kind==='drawing'||node.kind==='group'){const list=targets(node);const ids=drawingIdsOf(list);items=drawingMenu(node,list.every(row=>row.kind==='drawing'&&row.renderable),{copy:!!chart?.copyDrawings,clone:!!chart?.duplicateDrawings,order:chart?.drawingManager&&ids.length?chart.drawingManager.orderState(ids):null,
   // Cut, Paste and Ungroup appear when the chart offers their routes.
   ...(chart?.cutDrawings?{cut:ids.length>0}:{}),...(chart?.pasteDrawings&&chart.clipboardSize?{paste:(()=>{try{return chart.clipboardSize!()>0;}catch{return false;}})()}:{}),...(node.kind==='group'?{ungroup:true}:{})});}
  if(!items.length)return;
  // Keyboard route (WAI-ARIA menu): the first enabled item takes focus once the menu mounts.
  const first=enabledMenuItems(items)[0];menuFocus.current={level:'root',at:'first'};setMenu({key:node.key,x,y,items,sub:null,cur:first?'root/'+first.id:''});
 }
 /** Closes the menu from the keyboard and returns focus to the originating row (or the selection when that row is gone). */
 function closeMenuToRow(){rowFocus.current=menu?.key??null;menuFocus.current=null;setMenu(null);}
 function focusItem(level:string,id:string){itemEls.current.get(level+'/'+id)?.focus();}
 /** Opens the submenu of `item` and focuses its first enabled item (immediately when it is already open). */
 function openSubmenu(item:ObjectTreeMenuItem){
  if(!item.submenu||item.disabled||!menu)return;const first=enabledMenuItems(item.submenu)[0];if(!first)return;
  if(menu.sub===item.id){focusItem(item.id,first.id);return;}
  menuFocus.current={level:item.id,at:'first'};setMenu(current=>current?{...current,sub:item.id}:current);
 }
 function closeSubmenu(parent:string){focusItem('root',parent);setMenu(current=>current?{...current,sub:null}:current);}
 function menuItemKey(event:React.KeyboardEvent,item:ObjectTreeMenuItem,level:string,siblings:readonly ObjectTreeMenuItem[]){
  const handled=()=>{event.preventDefault();event.stopPropagation();};const enabled=enabledMenuItems(siblings),at=enabled.findIndex(entry=>entry.id===item.id);
  const go=(index:number)=>{const target=enabled[(index+enabled.length)%enabled.length];if(target)focusItem(level,target.id);};
  switch(event.key){
   case 'ArrowDown':handled();go(at+1);return;
   case 'ArrowUp':handled();go(at<0?-1:at-1);return;
   case 'Home':handled();go(0);return;
   case 'End':handled();go(-1);return;
   case 'ArrowRight':if(item.submenu){handled();openSubmenu(item);}return;
   case 'ArrowLeft':if(level!=='root'){handled();closeSubmenu(level);}return;
   case 'Enter':case ' ':case 'Spacebar':
    handled();if(item.disabled)return;
    if(item.submenu){openSubmenu(item);return;}
    if(!MENU_HANDS_OFF_FOCUS.has(item.id))rowFocus.current=menu?.key??null;
    runMenu(item.id);return;
   case 'Escape':handled();if(level!=='root')closeSubmenu(level);else closeMenuToRow();return;
   case 'Tab':handled();closeMenuToRow();return;
  }
 }
 /** Runs after the menu mounts: focuses the requested item of this menu level. */
 function takeMenuFocus(level:string,items:readonly ObjectTreeMenuItem[]){
  const pending=menuFocus.current;if(!pending||pending.level!==level)return;
  const enabled=enabledMenuItems(items),target=pending.at==='first'?enabled[0]:enabled.at(-1);if(!target)return;
  const element=itemEls.current.get(level+'/'+target.id);if(!element)return;menuFocus.current=null;element.focus();
 }
 /** Runs after the rows mount: focus returns to the row the menu was opened from, else the first selected row, else the first row. */
 function takeRowFocus(){
  const wanted=rowFocus.current;if(wanted===null)return;
  const element=rowEls.current.get(wanted)??[...liveSelection,...nodes.map(row=>row.key)].map(key=>rowEls.current.get(key)).find(Boolean);
  if(!element)return;rowFocus.current=null;element.focus();if(typeof element.scrollIntoView==='function')element.scrollIntoView({block:'nearest'});
 }
 function runMenu(id:string){
  const state=menu;setMenu(null);if(!state)return;const node=allNodes.find(row=>row.key===state.key);if(!node)return;const p=latest.current;
  if(node.kind==='series'){
   if(id==='series-alert')p.onSeriesAlert?.();else if(id==='series-addIndicator')p.onSeriesAddIndicator?.();else if(id==='series-symbolInfo')p.onSeriesSymbolInfo?.();
   else if(id==='series-tableView')p.onSeriesTableView?.();else if(id==='series-hide')p.onSeriesVisibility?.(!node.visible);else if(id==='series-settings')p.onSeriesSettings?.();
   else if(id==='series-pin-left'||id==='series-pin-right')p.onSeriesPinToScale?.(id==='series-pin-left'?'left':'right');
   return;
  }
  if(node.kind==='study'){
   if(id==='hide')indicatorAction(node.id,'toggle');else if(id==='remove')indicatorAction(node.id,'remove');
   else if(id==='settings')p.onOpenIndicatorSettings?.(node.id);else if(id==='intervals')p.onOpenIndicatorSettings?.(node.id,'visibility');
   else if(id==='alert')p.onAddIndicatorAlert?.(node.id);else if(id==='child-study')p.onAddChildIndicator?.(node.id);else if(id==='favorite')p.onFavoriteIndicator?.(node.id);
   else if(Object.hasOwn(MOVE_BY_ITEM,id))moveStudyTo(node.id,MOVE_BY_ITEM[id]);
   else if(id==='copy')copyStudy(node.id);else if(isIndicatorOrderStep(id))orderStudy(node.id,id);
   else if(id.startsWith('pin-')){const row=p.indicators.find(item=>item.id===node.id);if(row&&p.onIndicatorScale){try{setError('');p.onIndicatorScale(row,pinToScalePlacement(id));}catch(cause){fail(cause);}}}
   return;
  }
  const list=targets(node),ids=drawingIdsOf(list);
  if(id==='group')createGroup(list);
  else if(id==='rename'){renameSession.current=node.key;setRename({key:node.key,draft:node.title});}
  else if(id==='lock')drawingAction(manager=>manager.set(ids,{locked:!node.locked}),{drawings:ids});
  else if(id==='hide')drawingAction(manager=>manager.set(ids,{visible:!node.visible}),{drawings:ids});
  else if(id==='remove')removeNodes(list);
  else if(id==='copy')copyNodes(list);
  else if(id==='cut')cutNodes(list);
  else if(id==='paste')pasteObjects();
  else if(id==='ungroup')ungroupNodes(list);
  else if(id==='clone')cloneNodes(list);
  else if(id==='front'||id==='back'||id==='forward'||id==='backward')drawingAction(manager=>manager.order(ids,id),{drawings:ids});
 }
 function runToolbar(id:ObjectTreeToolbarId,item?:string){
  const list=allNodes.filter(row=>selected.has(row.key));setToolbarMenu(null);
  if(id==='group')createGroup(list);
  else if(id==='manage')latest.current.onManageDrawings?.();
  else if(id==='copy-clone'&&item==='Clone')cloneNodes(list);
  else if(id==='copy-clone'&&item==='Copy')copyNodes(list);
  else if(id==='move-to'&&list[0]?.kind==='study')moveStudy(list[0].id,item==='New pane above'?'above':'below');
 }
 function onKeyDown(event:React.KeyboardEvent){
  if(rename)return;
  if(event.key==='Escape'){if(menu||toolbarMenu){event.preventDefault();if(menu)closeMenuToRow();else setMenu(null);setToolbarMenu(null);}return;}
  // While the context menu is open its own keys rule; the tree keeps its selection.
  if(menu)return;
  // Ctrl + C, Ctrl + X and Ctrl + V on the tree (App's window listener takes them first when it owns the keys).
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey){const key=event.key.toLowerCase(),list=allNodes.filter(row=>selected.has(row.key));
   // One selected indicator (and no drawing) copies to the indicator clipboard.
   if(key==='c'&&list.length===1&&list[0]!.kind==='study'){event.preventDefault();copyStudy(list[0]!.id);return;}
   if(key==='c'&&list.length){event.preventDefault();copyNodes(list);return;}
   if(key==='x'&&list.length){event.preventDefault();cutNodes(list);return;}
   if(key==='v'){event.preventDefault();pasteObjects();return;}}
  if(event.key==='Delete'&&liveSelection.length){event.preventDefault();removeNodes(allNodes.filter(row=>selected.has(row.key)&&row.kind!=='series'));return;}
  // The arrows, Home and End move the selection AND focus (and scroll) to the new row; End no longer scrolls the body away from the focused row.
  if(!toolbarMenu&&(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End')){event.preventDefault();const at=nodes.findIndex(row=>row.key===liveSelection.at(-1)),next=event.key==='Home'?nodes[0]:event.key==='End'?nodes.at(-1):nodes[Math.max(0,Math.min(nodes.length-1,at<0?0:at+(event.key==='ArrowDown'?1:-1)))];if(next){choose(next);rowFocus.current=next.key;}}
 }
 function frontToBack():string[]{return drawingFrontToBack(drawings).filter(row=>row.renderable).map(row=>row.id);}
 function dropOn(node:ObjectTreeNode,place:'before'|'after'){
  const moving=dragging.current;dragging.current=[];setDrop(null);if(!moving.length)return;
  const target=node.kind==='group'?(place==='before'?keyId(node.memberKeys[0]??''):keyId(node.memberKeys.at(-1)??'')):node.id;
  // The drop also moves the drawings into the target's group (or out of every group), with the new order, as one step.
  const into=dropGroupTarget(node),current=groupOfDrawings(groups),regroup=moving.some(id=>(current.get(id)??null)!==into);
  const calls=target&&!moving.includes(target)?reorderFrontCalls(frontToBack(),moving,target,place):[];
  if(!regroup&&!calls.length)return;
  drawingAction(manager=>{manager.moveObjects(moving,regroup?into:undefined,calls);},{drawings:moving,groups:regroup&&into?[into]:[]});
  // The moved drawings end selected (row and chart), so a reorder of rows with one name is visible.
  const keys=moving.map(drawingKey);if(keys.some(key=>!selected.has(key))){setSelection(keys);syncChartSelection(keys);}
 }
 const placeFor=(event:React.DragEvent):'before'|'after'=>{const element=event.currentTarget as HTMLElement,rect=typeof element.getBoundingClientRect==='function'?element.getBoundingClientRect():null;return rect&&event.clientY>rect.top+rect.height/2?'after':'before';};
 const draggableNode=(node:ObjectTreeNode)=>(node.kind==='drawing'||node.kind==='group')&&node.renderable&&!rename||node.kind==='study'&&!rename&&!!chart&&(canReorder||canMovePane);
 const toolbarIcon={group:ObjectTreeGroupIcon,'copy-clone':ObjectTreeCloneIcon,'move-to':ObjectTreeMoveToIcon,manage:ObjectTreeManageIcon} as const;
 const toolbarEnabled={group:toolbar.group,'copy-clone':toolbar.copyClone,'move-to':toolbar.moveTo,manage:toolbar.manage} as const;
 const buttonIcon=(node:ObjectTreeNode,button:ObjectTreeRowButton)=>button==='lock'?(node.locked?LockClosedIcon:LockOpenIcon):button==='remove'?RemoveObjectsIcon:(node.visible&&!node.intervalHidden?EyeIcon:HideDrawingsIcon);
 const buttonOn=(node:ObjectTreeNode,button:ObjectTreeRowButton)=>button==='lock'?node.locked:button==='hide'?(!node.visible||node.intervalHidden):false;
 const buttonDisabled=(node:ObjectTreeNode,button:ObjectTreeRowButton)=>node.kind==='series'?!props.onSeriesVisibility:(node.kind==='drawing'||node.kind==='group')&&button!=='remove'&&!node.renderable;
 const renderMenu=(items:readonly ObjectTreeMenuItem[],label:string,point?:{x:number;y:number},level='root'):React.ReactElement=><div className={'lv-ot-menu'+(point?'':' lv-ot-submenu')} role="menu" aria-label={label} style={point?{left:point.x,top:point.y}:undefined} ref={element=>{fitObjectTreeMenu(element,point??'submenu');if(element)takeMenuFocus(level,items);}}>
  {items.map(item=>item.separator?<div key={item.id} className="lv-ot-menu-separator" role="separator"/>:<div key={item.id} className="lv-ot-menu-entry">
   <button type="button" role="menuitem" className="lv-ot-menu-item" data-menu-id={item.id} tabIndex={menu?.cur===level+'/'+item.id?0:-1} ref={element=>{if(element)itemEls.current.set(level+'/'+item.id,element);else itemEls.current.delete(level+'/'+item.id);}} onFocus={()=>setMenu(current=>current&&current.cur!==level+'/'+item.id?{...current,cur:level+'/'+item.id}:current)} onKeyDown={event=>menuItemKey(event,item,level,items)} aria-label={item.label} title={item.title} aria-disabled={item.disabled||undefined} disabled={item.disabled} aria-haspopup={item.submenu?'menu':undefined} aria-expanded={item.submenu?menu?.sub===item.id:undefined} aria-keyshortcuts={item.hotkey?item.hotkey.replace(/ \+ /g,'+'):undefined}
    onMouseEnter={()=>{if(item.submenu&&!item.disabled&&menu)setMenu({...menu,sub:item.id});}}
    onClick={()=>{if(item.disabled)return;/* The hover that precedes a pointer click has already opened the submenu, so the click opens (never toggles shut); ArrowLeft/Escape/outside press close it. */if(item.submenu){if(menu&&menu.sub!==item.id)setMenu({...menu,sub:item.id});return;}runMenu(item.id);}}>
    <span className="lv-ot-menu-label">{item.label}</span>{item.hotkey&&<span className="lv-ot-menu-hotkey">{item.hotkey}</span>}{item.submenu&&<ChevronFlyoutIcon width={10} height={16}/>}
   </button>
   {item.submenu&&menu?.sub===item.id&&renderMenu(item.submenu,item.label??'',undefined,item.id)}
  </div>)}
 </div>;

 // Presses inside the tree never reach the document: the pinned renderer's drawing-bar outside-dismiss
 // (a bubbling document pointerdown) clears the chart drawing selection on a plain press, which emptied
 // this tree's selection before a toolbar or menu click could act on it. The tree's own
 // handlers keep the chart selection in sync; LV dismiss listeners use the capture phase.
 return <section className="lv-ot" aria-label="Object tree" data-model-revision={epoch} ref={()=>takeRowFocus()} onKeyDown={onKeyDown} onPointerDown={event=>event.stopPropagation()}>
  <div className="lv-ot-toolbar" role="toolbar" aria-label="Object tree toolbar">
   {OBJECT_TREE_TOOLBAR.map(entry=>{const Icon=toolbarIcon[entry.id],menuItems=entry.id==='copy-clone'?COPY_CLONE_MENU:entry.id==='move-to'?MOVE_TO_MENU:null;const enabled=toolbarEnabled[entry.id];
    return <React.Fragment key={entry.id}>{entry.trailing&&<span className="lv-ot-toolbar-gap"/>}<span className="lv-ot-toolbar-slot">
     <button type="button" className="lv-ot-toolbar-button" data-name={entry.dataName} aria-label={entry.label} title={entry.label} disabled={!enabled} aria-haspopup={menuItems?'menu':undefined} aria-expanded={menuItems?toolbarMenu===entry.id:undefined}
      onClick={()=>{if(!enabled)return;if(menuItems){setToolbarMenu(toolbarMenu===entry.id?null:entry.id);return;}runToolbar(entry.id);}}><Icon/></button>
     {menuItems&&toolbarMenu===entry.id&&<div className="lv-ot-toolbar-menu" role="menu" aria-label={entry.label} ref={element=>fitObjectTreeMenu(element,'dropdown')}>{menuItems.map(item=>{const disabled=entry.id==='copy-clone'?(item==='Copy'?!toolbar.copy:!toolbar.clone):false;return <button type="button" role="menuitem" key={item} className="lv-ot-menu-item" aria-label={item} disabled={disabled} aria-disabled={disabled||undefined} title={disabled?'Not available yet':undefined} onClick={()=>{if(!disabled)runToolbar(entry.id,item);}}><span className="lv-ot-menu-label">{item}</span></button>;})}</div>}
    </span></React.Fragment>;})}
  </div>
  <div className="lv-ot-tree" role="tree" aria-label="Chart objects" aria-multiselectable="true" data-name="tree">
   {nodes.map(node=>{const Icon=iconFor(node),isSelected=selected.has(node.key),renaming=rename?.key===node.key;
    return <div key={node.key} role="treeitem" aria-level={node.level} aria-selected={isSelected} aria-expanded={node.kind==='group'?node.expanded:undefined} aria-label={node.title} tabIndex={isSelected||(!liveSelection.length&&node===nodes[0])?0:-1} ref={element=>{if(element)rowEls.current.set(node.key,element);else rowEls.current.delete(node.key);}}
     className={'lv-ot-row'+(isSelected?' is-selected':'')+(node.visible?'':' is-hidden')+(drop?.key===node.key?' is-drop-'+drop.place:'')} data-node-kind={node.kind} data-node-key={node.key} title={node.tooltip||undefined}
     draggable={draggableNode(node)||undefined}
     onClick={event=>{if(!renaming)choose(node,event);}}
     onDoubleClick={()=>{if(node.kind==='drawing')latest.current.onOpenDrawingSettings?.(node.id);else if(node.kind==='study')latest.current.onOpenIndicatorSettings?.(node.id);}}
     onContextMenu={event=>{event.preventDefault();openMenu(node,event.clientX,event.clientY);}}
     onDragStart={event=>{if(!draggableNode(node)){event.preventDefault();return;}if(node.kind==='study'){dragging.current=[];draggingStudy.current=node.id;try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.key);}catch{/* Some hosts expose no drag data store. */}return;}draggingStudy.current=null;const list=targets(node).filter(draggableNode);dragging.current=drawingIdsOf(list);try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',node.key);}catch{/* Some hosts expose no drag data store. */}}}
     onDragOver={event=>{if(draggingStudy.current){if(node.kind!=='study'||node.id===draggingStudy.current)return;event.preventDefault();const place=placeFor(event);if(drop?.key!==node.key||drop.place!==place)setDrop({key:node.key,place});return;}if(!dragging.current.length||!(node.kind==='drawing'||node.kind==='group'))return;if(node.kind==='group'&&!node.memberKeys.length)return;event.preventDefault();const place=placeFor(event);if(drop?.key!==node.key||drop.place!==place)setDrop({key:node.key,place});}}
     onDragLeave={()=>{if(drop?.key===node.key)setDrop(null);}}
     onDrop={event=>{event.preventDefault();if(draggingStudy.current){if(node.kind==='study')dropStudy(node,placeFor(event));else{draggingStudy.current=null;setDrop(null);}return;}if(node.kind==='drawing'||node.kind==='group')dropOn(node,placeFor(event));}}
     onDragEnd={()=>{dragging.current=[];draggingStudy.current=null;setDrop(null);}}>
     {node.kind==='group'?<button type="button" className="lv-ot-expand" aria-label={node.expanded?'Collapse group':'Expand group'} tabIndex={-1} onClick={event=>{event.stopPropagation();setCollapsed(node.expanded?[...collapsed,node.key]:collapsed.filter(key=>key!==node.key));}}><ChevronFlyoutIcon width={10} height={16}/></button>:<span className="lv-ot-indent" aria-hidden="true"/>}
     <span className="lv-ot-icon" aria-hidden="true"><Icon width={28} height={28}/></span>
     {renaming?<input className="lv-ot-rename" aria-label="Rename" value={rename!.draft} autoFocus spellCheck={false} maxLength={200}
       onClick={event=>event.stopPropagation()} onChange={event=>setRename({key:node.key,draft:event.target.value})} onBlur={commitRename}
       onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();commitRename();}else if(event.key==='Escape'){event.preventDefault();renameSession.current=null;setRename(null);}}}/>
      :<span className="lv-ot-title">{node.title}</span>}
     <span className="lv-ot-buttons">{node.buttons.map(button=>{const ButtonIcon=buttonIcon(node,button),label=rowButtonLabel(node,button),disabled=buttonDisabled(node,button);
      return <button type="button" key={button} className={'lv-ot-row-button'+(buttonOn(node,button)?' is-on':'')} data-name={button} aria-label={label} title={disabled&&node.kind==='series'?'Hiding the main series is unavailable in this OpenCandle build':label} aria-pressed={button==='remove'?undefined:buttonOn(node,button)} disabled={disabled} tabIndex={-1}
       onClick={event=>{event.stopPropagation();if(!disabled)rowButton(node,button);}}><ButtonIcon width={22} height={22}/></button>;})}</span>
    </div>;})}
   {!nodes.length&&<p className="lv-ot-empty">No chart is open.</p>}
  </div>
  {menu&&renderMenu(menu.items,'Object tree menu',{x:menu.x,y:menu.y})}
  {(readError||error)&&<output className="lv-ot-error" role="alert">{readError||error}</output>}
 </section>;
}
