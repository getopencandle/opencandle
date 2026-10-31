// Pane actions for the workspace pane menu and pane buttons: move up/down, collapse/expand, maximize/restore,
// remove, merge into the price pane, and indicator price scale assignment. Each action runs through the pinned
// renderer's own pane controller (@luxalgo/vela 0.8.4 chart.panes: move, collapse, maximize, remove, moveIndicator)
// and is verified against chart.panes.list() afterwards; a refused or ineffective action is reported, never assumed.
// Pane buttons default to "Visible on mouse over".
// Action wording is OpenCandle's own.
import type {Vela} from '@luxalgo/vela';

export type PaneActionId='moveUp'|'moveDown'|'collapse'|'expand'|'maximize'|'restore'|'remove'|'merge';
export interface PaneAction {id:PaneActionId;label:string;disabled?:string}
export interface PaneActionResult {ok:boolean;message?:string}
interface PaneRow {id:string;kind:string;order:number;collapsed:boolean;maximized:boolean;indicators:Array<{id:string;ownScale:boolean}>}

const LABELS:Record<PaneActionId,string>={moveUp:'Move pane up',moveDown:'Move pane down',collapse:'Collapse pane',expand:'Expand pane',maximize:'Maximize pane',restore:'Restore pane',remove:'Remove pane',merge:'Merge into the price pane'};
const REASON={
 unsupported:'This chart renderer cannot manage panes.',
 price:'The price pane stays on top and cannot be moved, collapsed, removed or merged.',
 top:'This pane is already directly below the price pane.',
 bottom:'This pane is already at the bottom.',
 single:'There is only one pane to show.',
 gone:'That pane is no longer on the chart.',
} as const;

function rows(chart:Vela):PaneRow[]{return chart.panes.list() as unknown as PaneRow[];}
function supported(chart:Vela):boolean{try{return chart.panes.supported===true;}catch{return false;}}

/** The actions for one pane, in menu order, with a reason on each one that cannot run now. */
export function paneActions(chart:Vela,paneId:string):PaneAction[]{
 const list=supported(chart)?rows(chart):[],index=list.findIndex(row=>row.id===paneId),pane=list[index];
 const off=(reason:string)=>(id:PaneActionId):PaneAction=>({id,label:LABELS[id],disabled:reason});
 if(!supported(chart))return(['moveUp','moveDown','collapse','maximize','remove','merge'] as PaneActionId[]).map(off(REASON.unsupported));
 if(!pane)return(['moveUp','moveDown','collapse','maximize','remove','merge'] as PaneActionId[]).map(off(REASON.gone));
 const price=pane.kind==='price',out:PaneAction[]=[];
 const add=(id:PaneActionId,reason?:string)=>out.push(reason?{id,label:LABELS[id],disabled:reason}:{id,label:LABELS[id]});
 add('moveUp',price?REASON.price:index<=1?REASON.top:undefined);
 add('moveDown',price?REASON.price:index>=list.length-1?REASON.bottom:undefined);
 add(pane.collapsed?'expand':'collapse',price?REASON.price:undefined);
 add(pane.maximized?'restore':'maximize',list.length<2?REASON.single:undefined);
 add('merge',price?REASON.price:undefined);
 add('remove',price?REASON.price:undefined);
 return out;
}

/** Runs one action and checks the renderer's pane list for its effect. */
export function runPaneAction(chart:Vela,paneId:string,action:PaneActionId):PaneActionResult{
 try{
  const entry=paneActions(chart,paneId).find(row=>row.id===action);
  if(!entry)return{ok:false,message:'This pane action is not available here.'};
  if(entry.disabled)return{ok:false,message:entry.disabled};
  const before=rows(chart),pane=before.find(row=>row.id===paneId)!,index=before.indexOf(pane);
  switch(action){
   case 'moveUp':case 'moveDown':chart.panes.move(paneId,action==='moveUp'?'up':'down');break;
   case 'collapse':case 'expand':chart.panes.collapse(paneId,action==='collapse');break;
   case 'maximize':chart.panes.maximize(paneId);break;
   case 'restore':chart.panes.maximize(null);break;
   case 'remove':chart.panes.remove(paneId);break;
   case 'merge':for(const row of pane.indicators)chart.panes.moveIndicator(row.id,'price');break;
  }
  const after=rows(chart),now=after.find(row=>row.id===paneId),at=now?after.indexOf(now):-1;
  const done=action==='moveUp'?at===index-1:action==='moveDown'?at===index+1:action==='collapse'?now?.collapsed===true:action==='expand'?now?.collapsed===false:action==='maximize'?now?.maximized===true:action==='restore'?!after.some(row=>row.maximized):!now;
  return done?{ok:true}:{ok:false,message:'The chart renderer did not apply this pane change.'};
 }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
}

/** Pane snapshot rows in the shape the workspace saves (adapter paneLayout: id, order, collapsed, maximized). */
export function paneLayoutRows(chart:Vela):Array<{id:string;order:number;collapsed:boolean;maximized:boolean}>{
 return rows(chart).map((row,index)=>({id:row.id,order:index,collapsed:row.collapsed,maximized:row.maximized}));
}

// Pane button visibility (canvas.paneButtons). The renderer shows a pane's button cluster while the pointer is over
// that pane; 'always' shows every pane's cluster, 'never' hides them except the state chip of a collapsed or
// maximized pane (its only way back; OpenCandle decision, the reference behavior for that case was not observed).
/** Vela 0.8.4 PaneControls CLUSTER_PILL (the hovered cluster background). */
export const PANE_CLUSTER_PILL='rgba(0,0,0,0.65)';
export type PaneButtonsVisibility='mouseover'|'always'|'never';
interface ClusterLike {style:Record<string,string>;children:ArrayLike<{style:Record<string,string>;dataset?:Record<string,string|undefined>}>}
interface PaneControlsLike {clusters:Map<string,ClusterLike>;hoverPaneId:string|null;reposition():void;deps:{panes():Array<{id:string;collapsed?:boolean;maximized?:boolean;height:number}>}}
/** Binds a visibility mode to the renderer's pane controls; returns a setter and a disposer. Null when the renderer has none. */
export function bindPaneButtons(renderer:object):{set(mode:PaneButtonsVisibility):void;mode():PaneButtonsVisibility;dispose():void}|null{
 const controls=(renderer as {paneControls?:PaneControlsLike|null}).paneControls;
 if(!controls||typeof controls.reposition!=='function'||!(controls.clusters instanceof Map))return null;
 let mode:PaneButtonsVisibility='mouseover';
 const own=Object.getOwnPropertyDescriptor(controls,'reposition'),prior=controls.reposition;
 controls.reposition=function(){
  Reflect.apply(prior,controls,[]);
  if(mode==='mouseover')return;
  const panes=new Map(controls.deps.panes().map(row=>[row.id,row]));
  for(const [id,cluster] of controls.clusters){
   const pane=panes.get(id),chip=!!pane&&(pane.collapsed===true||pane.maximized===true);
   if(!pane||!cluster.children.length||!(pane.height>8)){cluster.style.display='none';continue;}
   if(mode==='never'){
    if(!chip){cluster.style.display='none';continue;}
    const role=pane.collapsed?'collapse':'maximize';cluster.style.display='flex';cluster.style.background='transparent';
    for(const child of Array.from(cluster.children))child.style.visibility=child.dataset?.role===role?'visible':'hidden';
    continue;
   }
   cluster.style.display='flex';cluster.style.background=PANE_CLUSTER_PILL;
   for(const child of Array.from(cluster.children)){child.style.display='inline-flex';child.style.visibility='visible';}
  }
 };
 const apply=()=>{try{controls.reposition();}catch{/* Not laid out yet. */}};
 return{
  set(next){if(next!=='mouseover'&&next!=='always'&&next!=='never')throw Error('Pane button visibility must be mouseover, always or never.');mode=next;apply();},
  mode:()=>mode,
  dispose(){if(own)Object.defineProperty(controls,'reposition',own);else delete (controls as {reposition?:unknown}).reposition;apply();},
 };
}

// "New pane above" / "New pane below" for an indicator (Object tree Move to, legend Move to). Vela 0.8.4
// insertPaneOrder clamps a new pane to index 1, so a pane inserted "before" the price pane lands directly below it. For an
// indicator on the price pane, "above" therefore inserts the pane and then reorders it to the top through the
// orchestrator's own reorderPanes (the same call movePane and moveIndicator end with). The result is read back from
// chart.panes.list(); a chart without that hook reports the gap before changing anything.
export type MoveStudyResult={ok:true;paneId:string}|{ok:false;message:string};
interface PaneOrderOwner {reorderPanes(order:string[]):void}
function orderOwner(chart:Vela):PaneOrderOwner|null{
 try{
  const field=Object.getOwnPropertyDescriptor(chart,'orchestrator');
  const owner=field&&Object.hasOwn(field,'value')?field.value as Partial<PaneOrderOwner>|null:null;
  return owner&&typeof owner.reorderPanes==='function'?owner as PaneOrderOwner:null;
 }catch{return null;}
}
/** Reorders the study pane that holds the indicator to the top of the stack, above the price pane. For a host whose own move
 * path (the indicator port) already created the pane below price: call it right after that move. Verified by read-back. */
export function placePaneAbovePrice(chart:Vela,nativeId:string):MoveStudyResult{
 try{
  const owner=orderOwner(chart);
  if(!owner)return{ok:false,message:'This chart renderer cannot place a new pane above the price pane.'};
  const list=rows(chart),pane=list.find(row=>row.indicators.some(native=>native.id===nativeId));
  if(!pane||pane.kind==='price')return{ok:false,message:'This indicator pane is unavailable.'};
  owner.reorderPanes([pane.id,...list.map(row=>row.id).filter(id=>id!==pane.id)]);
  const after=rows(chart);
  return after[0]?.id===pane.id?{ok:true,paneId:pane.id}:{ok:false,message:'The chart renderer did not place the new pane above the price pane.'};
 }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
}
export function moveStudyToNewPane(chart:Vela,nativeId:string,where:'above'|'below'):MoveStudyResult{
 try{
  if(where!=='above'&&where!=='below')return{ok:false,message:'Choose a new pane above or below.'};
  if(!supported(chart))return{ok:false,message:REASON.unsupported};
  const pane=rows(chart).find(row=>row.indicators.some(native=>native.id===nativeId));
  if(!pane)return{ok:false,message:'This indicator pane is unavailable.'};
  const aboveStack=where==='above'&&pane.kind==='price';
  if(aboveStack&&!orderOwner(chart))return{ok:false,message:'This chart renderer cannot place a new pane above the price pane.'};
  chart.panes.moveIndicator(nativeId,{newPane:where==='above'?{before:pane.id}:{after:pane.id}});
  const landed=rows(chart).find(row=>row.indicators.some(native=>native.id===nativeId));
  if(!landed||landed.id===pane.id||landed.kind==='price')return{ok:false,message:'The chart renderer did not move this indicator to a new pane.'};
  return aboveStack?placePaneAbovePrice(chart,nativeId):{ok:true,paneId:landed.id};
 }catch(error){return{ok:false,message:error instanceof Error?error.message:String(error)};}
}

/** True when the native indicator sits on the price pane (read before the host's own "New pane above" move). */
export function studyOnPricePane(host:{chart?:Vela|null},nativeId:string):boolean{
 try{return !!host.chart&&rows(host.chart).some(row=>row.kind==='price'&&row.indicators.some(native=>native.id===nativeId));}catch{return false;}
}
/** After the host's own move: lifts the new pane above price when the indicator came from the price pane, otherwise a no-op success. */
export function finishNewPaneAbove(host:{chart?:Vela|null},nativeId:string,wasOnPrice:boolean):MoveStudyResult{
 if(!wasOnPrice)return{ok:true,paneId:''};
 if(!host.chart)return{ok:false,message:'This indicator pane is unavailable.'};
 return placePaneAbovePrice(host.chart,nativeId);
}

/** Pre-check for the host's "New pane above": call it BEFORE the port move. When the indicator is on the price pane, the lift needs the
 * chart's reorder hook; without it the host must refuse up front instead of leaving the pane below price. */
export function canPlacePaneAbovePrice(host:{chart?:Vela|null},nativeId:string):MoveStudyResult{
 if(!studyOnPricePane(host,nativeId))return{ok:true,paneId:''};
 return host.chart&&orderOwner(host.chart)?{ok:true,paneId:''}:{ok:false,message:'This chart renderer cannot place a new pane above the price pane.'};
}
