import type {Vela} from '@luxalgo/vela';

/**
 * Scale placement for a mounted built-in indicator. Vela 0.8.4 renders any indicator model either
 * on its pane's shared scale or on its own scale column (to the right of the pane scale); its public
 * moveTo() only chooses that flag implicitly. LV pins the flag through the pinned core's own
 * placement path (record.model.ownScale + paneLocked + renderer.setIndicatorPane), the same fields
 * the core itself writes on a pane move, and verifies the result through chart.panes.list().
 * Left scale and no scale (full-height overlay without an axis) use LV-VELA-SCALE-PLACEMENT-1 (COMPAT-5):
 * setIndicatorPane(handle,pane,{ownScale:true,lvScalePlacement:'left'|'none'})
 * read back through renderer.lvIndicatorScalePlacement(id). A renderer without that API keeps them as gaps.
 */
export type IndicatorScalePlacement='shared'|'own';
export const INDICATOR_SCALE_GAPS=Object.freeze({
 left:'A left-side scale is unavailable: this chart renderer cannot place an indicator on a left scale.',
 none:'No scale (full-height overlay without an axis) is unavailable: the chart renderer has no axis-free scale mode or scale margins.',
});
const own=(value:unknown,key:string):unknown=>{
 if(!value||typeof value!=='object')throw new Error('Native scale owner is unavailable.');
 const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw new Error('Native scale owner is unavailable.');return field.value;
};
const callable=(value:unknown,key:string):(...args:unknown[])=>unknown=>{
 if(!value||typeof value!=='object')throw new Error('Native scale owner is unavailable.');
 const fn=(value as Record<string,unknown>)[key];if(typeof fn!=='function')throw new Error('Native scale placement is unavailable in this renderer.');return fn as (...args:unknown[])=>unknown;
};
/** Renderer-reported scale ownership of one native indicator; null when it is not mounted/reported. */
export function readIndicatorOwnScale(chart:Vela,nativeId:string):boolean|null{
 try{for(const pane of chart.panes.list())for(const row of pane.indicators)if(row.id===nativeId)return row.ownScale===true;}catch{return null;}
 return null;
}
function nativeRecord(chart:Vela,nativeId:string){
 const core=own(chart,'orchestrator'),registry=own(core,'registry'),renderer=own(core,'renderer');
 const record=callable(registry,'get').call(registry,nativeId);
 const model=own(record,'model'),renderHandle=own(record,'renderHandle'),paneId=own(model,'paneId');
 if(typeof paneId!=='string'||!paneId||!renderHandle||own(renderHandle,'id')!==nativeId)throw new Error('Native indicator placement is unavailable.');
 return {core,renderer,record:record as Record<string,unknown>,model:model as Record<string,unknown>,renderHandle,paneId,setPane:callable(renderer,'setIndicatorPane')};
}
export function indicatorNativeScaleSupported(chart:Vela,nativeId:string):boolean{
 try{nativeRecord(chart,nativeId);return readIndicatorOwnScale(chart,nativeId)!==null;}catch{return false;}
}
/** Pin one mounted indicator to its pane's shared scale (false) or its own scale column (true). */
export function setIndicatorNativeScale(chart:Vela,nativeId:string,ownScale:boolean):void{
 if(typeof ownScale!=='boolean')throw new Error('Scale placement must be shared or own.');
 const native=nativeRecord(chart,nativeId),previous={ownScale:native.model.ownScale===true,locked:Object.getOwnPropertyDescriptor(native.record,'paneLocked')};
 const write=(value:boolean)=>{native.model.ownScale=value;native.record.paneLocked=true;native.setPane.call(native.renderer,native.renderHandle,native.paneId,{ownScale:value});};
 try{
  write(ownScale);
  if(readIndicatorOwnScale(chart,nativeId)!==ownScale)throw new Error('The chart renderer did not accept the scale placement.');
  try{const events=own(native.core,'events');callable(events,'emit').call(events,'pane:changed',undefined);}catch{/* Pane listeners are optional in local hosts. */}
 }catch(error){
  try{write(previous.ownScale);if(previous.locked)Object.defineProperty(native.record,'paneLocked',previous.locked);else delete native.record.paneLocked;}
  catch(rollback){throw new AggregateError([error,rollback],'Scale placement failed and the native placement could not be restored. Reopen the chart before continuing.');}
  throw error;
 }
}

/** Every placement, including the left and no-scale sides. */
export type IndicatorScaleSide='shared'|'own'|'left'|'none';
/** "Pin to scale" submenu order and wording.
 * 'own' is LV's separate right column, offered beside these. */
export const INDICATOR_SCALE_PLACEMENT_MENU=Object.freeze([
 Object.freeze({placement:'shared' as const,label:'Pinned to right scale'}),
 Object.freeze({placement:'left' as const,label:'Pin to new left scale'}),
 Object.freeze({placement:'none' as const,label:'No scale (fullscreen)'}),
]);
type LvPlacementRenderer={lvIndicatorScalePlacement?:(id:string)=>unknown};
function placementRenderer(chart:Vela):LvPlacementRenderer|null{
 try{const renderer=own(own(chart,'orchestrator'),'renderer') as LvPlacementRenderer;return typeof renderer?.lvIndicatorScalePlacement==='function'?renderer:null;}catch{return null;}
}
/** Which LV sides the renderer supports (false: still a recorded gap, INDICATOR_SCALE_GAPS gives the reason). */
export function indicatorScaleSides(chart:Vela):{left:boolean;none:boolean}{const ok=!!placementRenderer(chart);return{left:ok,none:ok};}
/** Renderer-reported placement of one native indicator; null when it is not mounted/reported. */
export function readIndicatorScalePlacement(chart:Vela,nativeId:string):IndicatorScaleSide|null{
 const ownScale=readIndicatorOwnScale(chart,nativeId);if(ownScale===null)return null;
 if(!ownScale)return 'shared';
 const side=placementRenderer(chart)?.lvIndicatorScalePlacement?.(nativeId);
 return side==='left'||side==='none'?side:'own';
}
/** Pin one mounted indicator to shared, own (right column), left or no scale, verified through the renderer; restores on failure. */
export function setIndicatorScalePlacement(chart:Vela,nativeId:string,placement:IndicatorScaleSide,group?:string):void{
 if(placement!=='shared'&&placement!=='own'&&placement!=='left'&&placement!=='none')throw new Error('Scale placement must be shared, own, left or none.');
 if(group!==undefined){setGroupedScalePlacement(chart,nativeId,placement,group);return;}
 if(placement==='shared'||placement==='own'){
  const prior=readIndicatorScalePlacement(chart,nativeId);
  setIndicatorNativeScale(chart,nativeId,placement==='own');
  if(placement==='own'&&prior!=='own'&&readIndicatorScalePlacement(chart,nativeId)!=='own'){
   // An earlier left/none placement survives a same-flag write only if the renderer kept it; the native write clears it.
   throw new Error('The chart renderer did not accept the scale placement.');
  }
  return;
 }
 if(!placementRenderer(chart))throw new Error(INDICATOR_SCALE_GAPS[placement]);
 const native=nativeRecord(chart,nativeId),previous={ownScale:native.model.ownScale===true,side:readIndicatorScalePlacement(chart,nativeId),locked:Object.getOwnPropertyDescriptor(native.record,'paneLocked')};
 try{
  native.model.ownScale=true;native.record.paneLocked=true;
  native.setPane.call(native.renderer,native.renderHandle,native.paneId,{ownScale:true,lvScalePlacement:placement});
  if(readIndicatorScalePlacement(chart,nativeId)!==placement)throw new Error('The chart renderer did not accept the scale placement.');
  try{const events=own(native.core,'events');callable(events,'emit').call(events,'pane:changed',undefined);}catch{/* Pane listeners are optional in local hosts. */}
 }catch(error){
  try{
   native.model.ownScale=previous.ownScale;
   const side=previous.side==='left'||previous.side==='none'?{lvScalePlacement:previous.side}:{};
   native.setPane.call(native.renderer,native.renderHandle,native.paneId,{ownScale:previous.ownScale,...side});
   if(previous.locked)Object.defineProperty(native.record,'paneLocked',previous.locked);else delete native.record.paneLocked;
  }catch(rollback){throw new AggregateError([error,rollback],'Scale placement failed and the native placement could not be restored. Reopen the chart before continuing.');}
  throw error;
 }
}

/** LV-VELA-SCALE-GROUPS-1: several indicators on one pane may share one extra scale (a right
 * column or a left scale), and "Pin to scale" lists existing scales beside the new ones. The renderer keeps the
 * membership as an LV scale group id per indicator: setIndicatorPane(handle,pane,{ownScale:true,lvScaleGroup}) and reads it
 * back through renderer.lvIndicatorScaleGroup(id); renderer.lvIndicatorScaleHolder(id) names the member that holds the
 * shared scale and its column. A renderer without that API keeps sharing as a gap. */
export const INDICATOR_SCALE_GROUP_GAP='Sharing an existing scale is unavailable: this chart renderer cannot put several indicators on one extra scale.';
type LvGroupRenderer={lvIndicatorScaleGroup:(id:string)=>unknown;lvIndicatorScaleHolder:(id:string)=>unknown};
function groupRenderer(chart:Vela):LvGroupRenderer|null{
 try{const renderer=own(own(chart,'orchestrator'),'renderer') as Partial<LvGroupRenderer>;return typeof renderer?.lvIndicatorScaleGroup==='function'&&typeof renderer.lvIndicatorScaleHolder==='function'?renderer as LvGroupRenderer:null;}catch{return null;}
}
/** True when the renderer can share one extra scale between indicators. */
export function indicatorScaleGroupsSupported(chart:Vela):boolean{return !!groupRenderer(chart)&&!!placementRenderer(chart);}
/** Renderer-reported scale group of one native indicator; null when it has none, is not mounted or the renderer lacks groups. */
export function readIndicatorScaleGroup(chart:Vela,nativeId:string):string|null{
 try{const group=groupRenderer(chart)?.lvIndicatorScaleGroup(nativeId);return typeof group==='string'&&group.length?group:null;}catch{return null;}
}
/** The native indicator holding the scale (and its column) that one native indicator is drawn on; itself when ungrouped. */
export function readIndicatorScaleHolder(chart:Vela,nativeId:string):string|null{
 try{const holder=groupRenderer(chart)?.lvIndicatorScaleHolder(nativeId);return typeof holder==='string'&&holder.length?holder:readIndicatorOwnScale(chart,nativeId)===true?nativeId:null;}catch{return null;}
}
/** The renderer pane of one native indicator; null when it is not mounted. */
export function readIndicatorPaneId(chart:Vela,nativeId:string):string|null{
 try{for(const pane of chart.panes.list())for(const row of pane.indicators)if(row.id===nativeId)return String(pane.id);}catch{return null;}
 return null;
}
function setGroupedScalePlacement(chart:Vela,nativeId:string,placement:IndicatorScaleSide,group:string):void{
 if(placement!=='own'&&placement!=='left')throw new Error('Only a right or left extra scale can be shared.');
 if(typeof group!=='string'||!group.length||group.length>200||/[\u0000-\u001f\u007f]/.test(group))throw new Error('The scale group id is invalid.');
 if(!indicatorScaleGroupsSupported(chart))throw new Error(INDICATOR_SCALE_GROUP_GAP);
 const native=nativeRecord(chart,nativeId),previous={ownScale:native.model.ownScale===true,side:readIndicatorScalePlacement(chart,nativeId),group:readIndicatorScaleGroup(chart,nativeId),locked:Object.getOwnPropertyDescriptor(native.record,'paneLocked')};
 const options=(ownScale:boolean,side:IndicatorScaleSide|null,value:string|null)=>({ownScale,...(ownScale&&(side==='left'||side==='none')?{lvScalePlacement:side}:{}),...(ownScale&&value!==null&&side!=='none'?{lvScaleGroup:value}:{})});
 try{
  native.model.ownScale=true;native.record.paneLocked=true;
  native.setPane.call(native.renderer,native.renderHandle,native.paneId,options(true,placement,group));
  if(readIndicatorScalePlacement(chart,nativeId)!==placement||readIndicatorScaleGroup(chart,nativeId)!==group)throw new Error('The chart renderer did not accept the shared scale.');
  try{const events=own(native.core,'events');callable(events,'emit').call(events,'pane:changed',undefined);}catch{/* Pane listeners are optional in local hosts. */}
 }catch(error){
  try{
   native.model.ownScale=previous.ownScale;
   native.setPane.call(native.renderer,native.renderHandle,native.paneId,options(previous.ownScale,previous.side,previous.group));
   if(previous.locked)Object.defineProperty(native.record,'paneLocked',previous.locked);else delete native.record.paneLocked;
  }catch(rollback){throw new AggregateError([error,rollback],'Scale placement failed and the native placement could not be restored. Reopen the chart before continuing.');}
  throw error;
 }
}
/** One existing extra scale an indicator can be pinned to (or is on with others). target (the member to pin to: the scale's
 * holder, or another member when the indicator itself holds it) and members are LV instance ids; titles name the other members. */
export interface IndicatorScaleChoice {target:string;side:'own'|'left';members:readonly string[];titles:readonly string[];current:boolean}
/** The extra scales on the pane of one indicator, in pane order, that it could share: every right column or left scale except
 * the one it holds alone. Members are LV rows (instance id plus renderer id); a native indicator without a row is skipped. */
export function indicatorScaleChoices(chart:Vela,nativeId:string,rows:readonly {id:string;rendererId:string}[],titleOf:(id:string)=>string=id=>id):IndicatorScaleChoice[]{
 if(!indicatorScaleGroupsSupported(chart))return [];
 const paneId=readIndicatorPaneId(chart,nativeId);if(paneId===null)return [];
 const byNative=new Map(rows.map(row=>[row.rendererId,row.id])),columns=new Map<string,{side:'own'|'left';members:string[];natives:string[]}>();
 let native:readonly {id:string}[]=[];try{native=chart.panes.list().find(pane=>String(pane.id)===paneId)?.indicators??[];}catch{return [];}
 for(const row of native){
  const id=String(row.id),side=readIndicatorScalePlacement(chart,id),lv=byNative.get(id);if((side!=='own'&&side!=='left')||lv===undefined)continue;
  const holder=readIndicatorScaleHolder(chart,id)??id,column=columns.get(holder)??{side,members:[],natives:[]};column.members.push(lv);column.natives.push(id);columns.set(holder,column);
 }
 const out:IndicatorScaleChoice[]=[];
 for(const [holder,column] of columns){
  const current=column.natives.includes(nativeId);if(current&&column.natives.length===1)continue;
  const self=byNative.get(nativeId),holderId=byNative.get(holder)??column.members[0]!,target=holderId!==self?holderId:column.members.find(id=>id!==self)!;
  out.push({target,side:column.side,members:column.members,titles:column.members.filter(id=>id!==self).map(titleOf),current});
 }
 return out;
}

/** Volume draws in the bottom fifth of the price pane (top margin 80%, bottom 0). */
export const VOLUME_OVERLAY_MARGINS=Object.freeze({top:0.8,bottom:0});
export interface IndicatorScaleMargins {top:number;bottom:number}
/** Asks the renderer to squeeze one indicator's scale into a band (fractions of pane height). Returns false when the renderer
 * has no scale-margin hook (LV renderer patch); the indicator then keeps its own full-height scale. */
export function setIndicatorScaleMargins(chart:Vela,nativeId:string,margins:IndicatorScaleMargins):boolean{
 const {top,bottom}=margins;
 if(![top,bottom].every(value=>Number.isFinite(value)&&value>=0&&value<=1)||top+bottom>=1)throw new Error('Scale margins must be fractions from 0 to 1 that leave room for the plot.');
 let renderer:{lvSetIndicatorScaleMargins?:(id:string,margins:IndicatorScaleMargins)=>void};
 try{renderer=own(own(chart,'orchestrator'),'renderer') as typeof renderer;}catch{return false;}
 if(typeof renderer?.lvSetIndicatorScaleMargins!=='function')return false;
 renderer.lvSetIndicatorScaleMargins(nativeId,{top,bottom});return true;
}
