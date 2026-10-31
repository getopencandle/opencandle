import type {IndicatorId} from '../domain/indicators';
import {shortIntervalText} from './interval-display';
import {drawingVisibility} from '../chart/drawing-visibility';
import {INDICATOR_SCALE_PLACEMENT_MENU,INDICATOR_SCALE_GAPS,type IndicatorScaleSide,type IndicatorScaleChoice} from '../chart/indicator-scale';
import {indicatorAcronyms,indicatorNames} from './indicator-dialog-model';
import {seriesMoreMenu,seriesMoveToItems,seriesPinToScaleItems,type SeriesMoreItemId} from './series-legend-menu';

// Pure model for the Object tree panel. No chart access and no mutation happens here.

/** Row height in pixels. */
export const OBJECT_TREE_ROW_HEIGHT=38;
/** Row button size in pixels. */
export const OBJECT_TREE_ROW_BUTTON=22;
/** Toolbar button size in pixels. */
export const OBJECT_TREE_TOOLBAR_BUTTON=38;

export type ObjectTreeToolbarId='group'|'copy-clone'|'move-to'|'manage';
/** Toolbar order: Group (1),
 * Copy/Clone (2), Move to (3), then a flexible gap and
 * Manage layout drawings (4) at the far right. */
export const OBJECT_TREE_TOOLBAR:readonly {id:ObjectTreeToolbarId;dataName:string;label:string;trailing:boolean}[]=Object.freeze([
 {id:'group',dataName:'group-button',label:'Create a group of drawings',trailing:false},
 {id:'copy-clone',dataName:'copy-clone-button',label:'Clone, Copy',trailing:false},
 {id:'move-to',dataName:'move-to-button',label:'Move to',trailing:false},
 {id:'manage',dataName:'manage-drawings-button',label:'Manage layout drawings',trailing:true},
]);
/** The Copy/Clone toolbar menu. */
export const COPY_CLONE_MENU=Object.freeze(['Copy','Clone'] as const);
/** The Move to toolbar menu. */
export const MOVE_TO_MENU=Object.freeze(['New pane above','New pane below'] as const);

export type ObjectTreeNodeKind='series'|'study'|'drawing'|'group';
export type ObjectTreeRowButton='lock'|'hide'|'remove';
/** Row button order: Lock, Hide, Remove.
 * Series: Hide only;
 * indicator: Hide, Remove; lockable sources (drawings, groups): Lock, Hide, Remove. */
export const ROW_BUTTONS:Readonly<Record<ObjectTreeNodeKind,readonly ObjectTreeRowButton[]>>=Object.freeze({series:['hide'],study:['hide','remove'],drawing:['lock','hide','remove'],group:['lock','hide','remove']});

export interface ObjectTreeSeriesInput {symbol:string;exchange:string;interval:string;description?:string;visible?:boolean}
/** intervalHidden: shown, but its interval visibility rule hides it on the current chart interval. */
export interface ObjectTreeIndicatorInput {id:string;kind:IndicatorId;visible:boolean;intervalHidden?:boolean}
export interface ObjectTreeDrawingInput {id:string;type:string;title:string;visible:boolean;locked:boolean;renderable:boolean;zIndex:number|null;intervalHidden:boolean}
export interface ObjectTreeGroupInput {id:string;name:string;memberIds:readonly string[]}
export interface ObjectTreeInput {series:ObjectTreeSeriesInput|null;indicators:readonly ObjectTreeIndicatorInput[];drawings:readonly ObjectTreeDrawingInput[];groups:readonly ObjectTreeGroupInput[];collapsed?:ReadonlySet<string>}

export interface ObjectTreeNode {
 key:string;
 kind:ObjectTreeNodeKind;
 id:string;
 title:string;
 /** Hover text; full indicator name or series description. */
 tooltip:string;
 level:1|2;
 parentKey:string|null;
 visible:boolean;
 locked:boolean;
 buttons:readonly ObjectTreeRowButton[];
 /** Group member keys (groups only). */
 memberKeys:readonly string[];
 expanded?:boolean;
 renderable:boolean;
 intervalHidden:boolean;
 drawingType?:string;
 indicatorKind?:IndicatorId;
}

export const seriesKey='series';
export const studyKey=(id:string)=>'study:'+id;
export const drawingKey=(id:string)=>'drawing:'+id;
export const groupKey=(id:string)=>'group:'+id;
export function keyId(key:string):string{const index=key.indexOf(':');return index<0?key:key.slice(index+1);}

/** Series row pattern "{symbol} · {exchange}, {interval}". */
/** The interval reads as the toolbar shows it (240m is 4h). */
export function seriesTitle(series:ObjectTreeSeriesInput):string{return (series.exchange?series.symbol+' · '+series.exchange:series.symbol)+', '+shortIntervalText(series.interval);}
/** Indicator row pattern "{indicator short title}". */
export function studyTitle(kind:IndicatorId):string{return indicatorAcronyms[kind]??kind;}

/** Reads a drawing-manager document row without trusting its shape. */
export function drawingInput(row:Record<string,unknown>,labels:ReadonlyMap<string,string>,resolution?:string):ObjectTreeDrawingInput{
 const type=String(row.type??'drawing'),name=typeof row.lvName==='string'&&row.lvName.trim()?row.lvName:labels.get(type)??type;
 const visible=row.visible!==false,interval=visible?drawingVisibility(row,resolution):{visible:true};
 return {id:String(row.id),type,title:name,visible,locked:row.locked===true,renderable:row.renderable!==false,zIndex:typeof row.zIndex==='number'&&Number.isFinite(row.zIndex)?row.zIndex:null,intervalHidden:visible&&!interval.visible};
}

/** Drawings front-most first. When every row carries a draw-order key: higher key first, equal keys
 * newest first. When any key is missing the keys are not comparable, so document order decides
 * (the newest, last row in front). */
export function drawingFrontToBack<T extends Pick<ObjectTreeDrawingInput,'zIndex'>>(drawings:readonly T[]):T[]{
 const rows=drawings.map((row,index)=>({row,index}));
 if(rows.some(item=>item.row.zIndex===null))return rows.reverse().map(item=>item.row);
 return rows.sort((a,b)=>(b.row.zIndex as number)-(a.row.zIndex as number)||b.index-a.index).map(item=>item.row);
}

/**
 * Order: main series, indicators in legend order, then drawings front-most first (higher
 * draw-order key first; equal keys keep newest first). A group row sits at the position of its
 * front-most member, with its members indented under it; a group without live members is not
 * listed. This order and the lack of per-pane grouping are LV policy.
 */
export function buildObjectTree(input:ObjectTreeInput):ObjectTreeNode[]{
 const nodes:ObjectTreeNode[]=[],collapsed=input.collapsed??new Set<string>();
 if(input.series)nodes.push({key:seriesKey,kind:'series',id:seriesKey,title:seriesTitle(input.series),tooltip:input.series.description??'',level:1,parentKey:null,visible:input.series.visible!==false,locked:false,buttons:ROW_BUTTONS.series,memberKeys:[],renderable:true,intervalHidden:false});
 for(const row of input.indicators)nodes.push({key:studyKey(row.id),kind:'study',id:row.id,title:studyTitle(row.kind),tooltip:indicatorNames[row.kind]??row.kind,level:1,parentKey:null,visible:row.visible,locked:false,buttons:ROW_BUTTONS.study,memberKeys:[],renderable:true,intervalHidden:row.visible&&row.intervalHidden===true,indicatorKind:row.kind});
 const ordered=drawingFrontToBack(input.drawings);
 const byId=new Map(ordered.map(row=>[row.id,row])),groupOf=new Map<string,ObjectTreeGroupInput>();
 for(const group of input.groups)for(const id of group.memberIds)if(byId.has(id)&&!groupOf.has(id))groupOf.set(id,group);
 const placed=new Set<string>();
 const drawingNode=(row:ObjectTreeDrawingInput,parent:string|null):ObjectTreeNode=>({key:drawingKey(row.id),kind:'drawing',id:row.id,title:row.title,tooltip:'',level:parent?2:1,parentKey:parent,visible:row.visible,locked:row.locked,buttons:ROW_BUTTONS.drawing,memberKeys:[],renderable:row.renderable,intervalHidden:row.intervalHidden,drawingType:row.type});
 const groupNode=(group:ObjectTreeGroupInput,members:ObjectTreeDrawingInput[]):ObjectTreeNode=>({key:groupKey(group.id),kind:'group',id:group.id,title:group.name,tooltip:'',level:1,parentKey:null,visible:members.length===0||members.some(row=>row.visible),locked:members.length>0&&members.every(row=>row.locked),buttons:ROW_BUTTONS.group,memberKeys:members.map(row=>drawingKey(row.id)),expanded:!collapsed.has(groupKey(group.id)),renderable:members.every(row=>row.renderable),intervalHidden:members.length>0&&members.every(row=>row.intervalHidden)});
 for(const row of ordered){
  if(placed.has(row.id))continue;
  const group=groupOf.get(row.id);
  if(!group){nodes.push(drawingNode(row,null));placed.add(row.id);continue;}
  const members=ordered.filter(item=>groupOf.get(item.id)===group),parent=groupNode(group,members);nodes.push(parent);
  for(const member of members){placed.add(member.id);if(parent.expanded)nodes.push(drawingNode(member,parent.key));}
 }
 // A group without live members is not listed: removing a group's drawings is one manager
 // transaction (one undo step) and the row goes with them.
 return nodes;
}

/** Drawing ids covered by a selection; a group stands for its members. */
export function selectedDrawingIds(nodes:readonly ObjectTreeNode[],selection:ReadonlySet<string>,groups:readonly ObjectTreeGroupInput[]=[]):string[]{
 const out:string[]=[];const add=(id:string)=>{if(!out.includes(id))out.push(id);};
 for(const key of selection){
  if(key.startsWith('drawing:'))add(keyId(key));
  else if(key.startsWith('group:')){const node=nodes.find(row=>row.key===key);const members=node?.memberKeys.map(keyId)??groups.find(group=>group.id===keyId(key))?.memberIds??[];members.forEach(add);}
 }
 return out;
}
export interface ToolbarState {group:boolean;copyClone:boolean;copy:boolean;clone:boolean;moveTo:boolean;manage:boolean}
/**
 * Enablement: Group is disabled when the selection
 * cannot be grouped, Copy/Clone when it is neither copyable nor cloneable, and
 * Move to when the selection cannot be unmerged. LV: groupable means one or more
 * drawings and nothing else; Clone uses the drawing duplicate route; Copy has no LV clipboard
 * route; Move to applies to exactly one indicator.
 */
export function toolbarState(nodes:readonly ObjectTreeNode[],selection:ReadonlySet<string>,routes:{clone:boolean;copy:boolean;moveTo:boolean;manage:boolean}):ToolbarState{
 const chosen=nodes.filter(row=>selection.has(row.key)),onlyDrawings=chosen.length>0&&chosen.every(row=>row.kind==='drawing'&&row.renderable),drawings=chosen.some(row=>row.kind==='drawing'||row.kind==='group');
 const clone=routes.clone&&drawings&&chosen.every(row=>row.kind==='drawing'||row.kind==='group'),copy=routes.copy&&drawings;
 return {group:onlyDrawings,copyClone:clone||copy,copy,clone,moveTo:routes.moveTo&&chosen.length===1&&chosen[0].kind==='study',manage:routes.manage};
}

export interface ObjectTreeMenuItem {id:string;label?:string;hotkey?:string;separator?:boolean;disabled?:boolean;submenu?:readonly ObjectTreeMenuItem[];title?:string;checked?:boolean}
const sep=(order:number):ObjectTreeMenuItem=>({id:'separator-'+order,separator:true});
/**
 * Indicator row menu (order, separators,
 * hotkeys). Items without an LV route stay in place and are disabled.
 */
/** Submenus (host routes): a Move to submenu that replaces the two new-pane entries (indicator-move-targets),
 * and a Pin to scale label plus submenu (pinToScaleMenu). Absent keeps the previous menu. */
/** VisualOrder replaces the four disabled Visual order steps with the host's (legend-model visualOrderItems). */
/** `favorited` flips the favorite item to its remove wording (the legend More menu's wording). */
export interface StudyMenuSubmenus {moveTo?:readonly ObjectTreeMenuItem[];pinToScale?:{label:string;items:readonly ObjectTreeMenuItem[]};visualOrder?:readonly ObjectTreeMenuItem[];favorited?:boolean}
export function studyMenu(title:string,value:string|null,routes:{alert:boolean;childStudy:boolean;favorite:boolean;visualOrder:boolean;intervals:boolean;moveTo:boolean;pinToScale:boolean;copy:boolean;settings:boolean},visible:boolean,submenus:StudyMenuSubmenus={}):ObjectTreeMenuItem[]{
 const unavailable='Not available yet';
 const gap=(enabled:boolean)=>enabled?{}:{disabled:true,title:unavailable};
 return [
  // Without a readout value the alert item drops "at ..." (as the legend More menu does) instead of showing a placeholder.
  {id:'alert',label:'Add alert on '+title+(value?' at '+value:'')+'…',hotkey:'Alt + A',...gap(routes.alert)},
  {id:'child-study',label:'Add indicator/strategy on '+title+'…',...gap(routes.childStudy)},
  {id:'favorite',label:submenus.favorited?'Remove this indicator from favorites':'Add this indicator to favorites',...gap(routes.favorite)},
  sep(4),
  {id:'visual-order',label:'Visual order',...gap(routes.visualOrder),submenu:routes.visualOrder&&submenus.visualOrder?submenus.visualOrder:[{id:'front',label:'Bring to front',disabled:true},{id:'back',label:'Send to back',disabled:true},{id:'forward',label:'Bring forward',disabled:true},{id:'backward',label:'Send backward',disabled:true}]},
  {id:'intervals',label:'Visibility on intervals',...gap(routes.intervals)},
  {id:'move-to',label:'Move to',...gap(routes.moveTo),submenu:submenus.moveTo??MOVE_TO_MENU.map(label=>({id:label==='New pane above'?'move-above':'move-below',label}))},
  {id:'pin-to-scale',label:routes.pinToScale&&submenus.pinToScale?submenus.pinToScale.label:'Pin to scale',...gap(routes.pinToScale),...(routes.pinToScale&&submenus.pinToScale?{submenu:submenus.pinToScale.items}:{})},
  sep(9),
  {id:'copy',label:'Copy',hotkey:'Ctrl + C',...gap(routes.copy)},
  {id:'hide',label:visible?'Hide':'Show'},
  {id:'remove',label:'Remove',hotkey:'Del'},
  sep(13),
  {id:'settings',label:'Settings…',...gap(routes.settings)},
 ];
}
/** Drawing and group row menu, from the row action titles
 * (inferred; exact runtime order unresolved). Group rows omit "Create a group of drawings". Visual order items in the order
 * Bring to front, Send to back, Bring forward, Send backward. */
/** `order` holds the DISABLED flags returned by `manager.orderState(ids)` (true = disabled). `extra` absent keeps the previous menu. */
/** Extra rows (all optional; absent keeps the previous menu): `cut` (Cut, Ctrl + X), `paste` (Paste, Ctrl + V, as in the
 * legend More menu) and `ungroup` (Ungroup on a group row). */
export interface DrawingMenuExtra {copy:boolean;clone:boolean;order:{front:boolean;forward:boolean;backward:boolean;back:boolean}|null;cut?:boolean;paste?:boolean;ungroup?:boolean}
export function drawingMenu(node:Pick<ObjectTreeNode,'kind'|'locked'|'visible'|'renderable'>,canGroup:boolean,extra?:DrawingMenuExtra):ObjectTreeMenuItem[]{
 const items:ObjectTreeMenuItem[]=[];
 if(node.kind==='drawing')items.push({id:'group',label:'Create a group of drawings',disabled:!canGroup});
 else if(node.kind==='group'&&extra?.ungroup!==undefined)items.push({id:'ungroup',label:'Ungroup',disabled:!extra.ungroup});
 items.push({id:'rename',label:'Rename'});
 if(extra){
  const unavailable='Not available yet';
  if(extra.order)items.push({id:'visual-order',label:'Visual order',disabled:!node.renderable,submenu:[
   {id:'front',label:'Bring to front',disabled:extra.order.front},{id:'back',label:'Send to back',disabled:extra.order.back},
   {id:'forward',label:'Bring forward',disabled:extra.order.forward},{id:'backward',label:'Send backward',disabled:extra.order.backward}]});
  items.push({id:'copy',label:'Copy',hotkey:'Ctrl + C',...(extra.copy?{}:{disabled:true,title:unavailable})});
  if(extra.cut!==undefined)items.push({id:'cut',label:'Cut',hotkey:'Ctrl + X',...(extra.cut?{}:{disabled:true,title:unavailable})});
  if(extra.paste!==undefined)items.push({id:'paste',label:'Paste',hotkey:'Ctrl + V',...(extra.paste?{}:{disabled:true,title:'Nothing has been copied yet.'})});
  items.push({id:'clone',label:'Clone',...(extra.clone?{}:{disabled:true,title:unavailable})});
 }
 items.push({id:'lock',label:node.locked?'Unlock':'Lock',disabled:!node.renderable},{id:'hide',label:node.visible?'Hide':'Show',disabled:!node.renderable},{id:'remove',label:'Remove'});
 return items;
}

/** Row button tooltips. */
export function rowButtonLabel(node:ObjectTreeNode,button:ObjectTreeRowButton):string{
 if(button==='lock')return node.locked?'Unlock':'Lock';
 if(button==='remove')return 'Remove';
 // The study wording is our own choice, parallel to the cited drawing and group texts (#row.hide hiddenOnIntervalTooltip).
 if(node.intervalHidden)return node.kind==='group'?'Group is hidden on current interval':node.kind==='study'?'Indicator is hidden on current interval':'Drawing is hidden on current interval';
 return node.visible?'Hide':'Show';
}

/** Groups are flat folders: the group a drag lands the moved drawings in. A group row takes them in; a
 * member row puts them in that member's group; a top-level drawing row takes them out of every group (null). */
export function dropGroupTarget(node:Pick<ObjectTreeNode,'kind'|'id'|'parentKey'>):string|null{
 if(node.kind==='group')return node.id;
 return node.parentKey&&node.parentKey.startsWith('group:')?keyId(node.parentKey):null;
}
/** The group each drawing id sits in now (none: absent). */
export function groupOfDrawings(groups:readonly ObjectTreeGroupInput[]):Map<string,string>{const out=new Map<string,string>();for(const group of groups)for(const id of group.memberIds)if(!out.has(id))out.set(id,group.id);return out;}
/** A row button pressed on a row of a multi-selection acts on the whole selection; the pressed row's
 * state decides the direction (Lock when it is unlocked, Hide when it is shown), as the context menu does. */
export function rowButtonTargets(node:Pick<ObjectTreeNode,'key'>,selection:readonly string[]):'selection'|'row'{return selection.length>1&&selection.includes(node.key)?'selection':'row';}

/** LV policy: default group names "Group {n}" (reference default name unresolved). */
export function nextGroupName(groups:readonly {name:string}[]):string{let n=groups.length+1;const names=new Set(groups.map(row=>row.name));while(names.has('Group '+n))n++;return 'Group '+n;}

/**
 * Drag reorder. Returns the drawing ids to bring to the front, in call order, so the moved
 * drawings land directly in front of (before) or behind (after) the target and every other
 * drawing keeps its relative order. Front-to-back input order; only renderable drawings can be ordered.
 */
export function reorderFrontCalls(frontToBack:readonly string[],moving:readonly string[],targetId:string,place:'before'|'after'='before'):string[]{
 const moved=frontToBack.filter(id=>moving.includes(id));if(!moved.length||moved.includes(targetId)||!frontToBack.includes(targetId))return [];
 const rest=frontToBack.filter(id=>!moving.includes(id)),at=rest.indexOf(targetId)+(place==='after'?1:0);
 const next=[...rest.slice(0,at),...moved,...rest.slice(at)];
 // Untouched drawings keep their relative order behind the moved prefix, so only the shortest
 // prefix whose remainder already reads in the original order is brought to the front.
 let prefix=next.length;
 while(prefix>0){const tail=next.slice(prefix-1),original=frontToBack.filter(id=>tail.includes(id));if(original.every((id,index)=>id===tail[index]))prefix--;else break;}
 return next.slice(0,prefix).reverse();
}

/** Pin to scale submenu for an indicator row. The standard
 * placements come from the scale module's menu in its order; LV adds its own separate right column last. Left and no
 * scale stay in place but disabled, with the renderer gap as the reason, when the renderer cannot place them. A null
 * current placement (indicator not mounted) disables every placement. The existing extra scales on the
 * pane (choices, from indicatorScaleChoices) follow, so several indicators can share one; on a shared scale the new-scale
 * rows are not checked. */
export function pinToScaleMenu(current:IndicatorScaleSide|null,sides:{left:boolean;none:boolean},choices:readonly IndicatorScaleChoice[]=[]):ObjectTreeMenuItem[]{
 const unmounted='This indicator is not mounted on the chart, so its scale cannot be changed.';
 const gap=(enabled:boolean,reason:string)=>current===null?{disabled:true,title:unmounted}:enabled?{}:{disabled:true,title:reason};
 const joined=choices.some(choice=>choice.current);
 return [
  ...INDICATOR_SCALE_PLACEMENT_MENU.map(row=>({id:'pin-'+row.placement,label:row.label,checked:current===row.placement&&!(joined&&row.placement==='left'),...gap(row.placement==='shared'||(row.placement==='left'?sides.left:sides.none),row.placement==='left'?INDICATOR_SCALE_GAPS.left:INDICATOR_SCALE_GAPS.none)})),
  // The right column mirrors "Pin to new left scale".
  {id:'pin-own',label:'Pin to new right scale',checked:current==='own'&&!joined,...gap(true,'')},
  // Each existing extra scale on the pane, named by the other indicators on it.
  ...choices.map(choice=>({id:PIN_SCALE_PREFIX+choice.target,label:(choice.current?'Pinned to ':'Pin to ')+(choice.side==='left'?'left':'right')+' scale with '+(choice.titles.join(', ')||'another indicator'),checked:choice.current,...gap(true,'')})),
 ];
}
const PIN_SCALE_PREFIX='pin-scale:';
/** A Pin to scale choice: a placement, or the existing extra scale another indicator is on. */
export type IndicatorScalePin=IndicatorScaleSide|{scaleOf:string};
const PIN_PLACEMENTS:Readonly<Record<string,IndicatorScaleSide>>=Object.freeze({'pin-shared':'shared','pin-left':'left','pin-none':'none','pin-own':'own'});
/** The placement behind a Pin to scale submenu item id. */
export function pinToScalePlacement(id:string):IndicatorScalePin{
 if(id.startsWith(PIN_SCALE_PREFIX)&&id.length>PIN_SCALE_PREFIX.length)return {scaleOf:id.slice(PIN_SCALE_PREFIX.length)};
 const placement=Object.hasOwn(PIN_PLACEMENTS,id)?PIN_PLACEMENTS[id]:undefined;
 if(!placement)throw new Error('Unknown scale placement.');
 return placement;
}

/** The series row menu. The rows, order, wording and separators are the legend's main
 * series More menu (series-legend-menu.ts) limited to the routes the host gives
 * the tree; a row without a route is left out. Move to keeps its two new-pane entries, disabled with the reason (the main series
 * stays in the top pane). Using that menu on the series row is our own choice. */
export type SeriesTreeRoute='alert'|'addIndicator'|'symbolInfo'|'tableView'|'pinToScale'|'hide'|'settings';
export function seriesTreeMenu(input:{symbol:string;hidden:boolean;mainScaleSide?:'left'|'right';routes:Partial<Record<SeriesTreeRoute,boolean>>}):ObjectTreeMenuItem[]{
 const availability:Partial<Record<SeriesMoreItemId,null>>={moveTo:null};
 for(const [id,on] of Object.entries(input.routes) as [SeriesTreeRoute,boolean][])if(on)availability[id]=null;
 const side=input.mainScaleSide==='left'?'left' as const:'right' as const;
 const sub=(items:readonly {id:string;label:string;disabled?:boolean;title?:string;checked?:boolean}[]):ObjectTreeMenuItem[]=>items.map(item=>({id:item.id,label:item.label,...(item.disabled?{disabled:true}:{}),...(item.title?{title:item.title}:{}),...(item.checked?{checked:true}:{})}));
 return seriesMoreMenu({symbol:input.symbol,price:null,hidden:input.hidden,mainScaleSide:side,availability}).map(row=>row.kind==='separator'?{id:row.id,separator:true}:{
  id:'series-'+row.id,label:row.label,...(row.hotkey?{hotkey:row.hotkey}:{}),...(row.availability.state==='unavailable'?{disabled:true,title:row.availability.reason}:{}),
  ...(row.id==='moveTo'?{submenu:sub(seriesMoveToItems()).map(item=>({...item,id:'series-move-'+item.id}))}:row.id==='pinToScale'?{submenu:sub(seriesPinToScaleItems(side)).map(item=>({...item,id:'series-pin-'+item.id}))}:{}),
 });
}

/** What dropping one dragged indicator row on another indicator row does. On the same pane the dragged
 * indicator is listed directly before or after the target (its Visual order, legend-model.ts); on another pane it moves into
 * that pane (the indicator port target: 'price' or the pane's saved id). Null: nothing to do. */
export type StudyDropPlan={kind:'order';ids:string[]}|{kind:'move';target:'price'|{pane:string}};
export function studyDropPlan(rows:readonly {id:string;paneId:string|null}[],moving:string,target:string,place:'before'|'after'):StudyDropPlan|null{
 if(moving===target)return null;const from=rows.find(row=>row.id===moving),to=rows.find(row=>row.id===target);
 if(!from||!to||to.paneId===null)return null;
 if(from.paneId!==to.paneId)return{kind:'move',target:to.paneId==='price'?'price':{pane:to.paneId}};
 const rest=rows.filter(row=>row.id!==moving).map(row=>row.id),at=rest.indexOf(target)+(place==='after'?1:0),ids=[...rest.slice(0,at),moving,...rest.slice(at)];
 return ids.every((id,index)=>id===rows[index]!.id)?null:{kind:'order',ids};
}
