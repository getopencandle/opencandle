import type {Vela,IndicatorHandle} from '@luxalgo/vela';
/** Refusal/currentness only; no source or numerical authority is created. */
export interface PaneBindingGuard {assertCurrent():void;mutate(action:()=>void):void}
/** Shared by domain indicators and scripts; renderer pane IDs are session-local. */
export function createPaneRegistry(chart:Vela){
 const byRenderer=new Map<string,string>([['price','price']]),byLogical=new Map<string,string>([['price','price']]);
 const info=(handle:IndicatorHandle)=>chart.panes.list().find(pane=>pane.indicators.some(row=>row.id===handle.id));
 const logical=(renderer:string|null)=>{if(renderer===null)return null;let id=byRenderer.get(renderer);if(!id){id=`lv-pane-${crypto.randomUUID()}`;byRenderer.set(renderer,id);byLogical.set(id,renderer);}return id;};
 const renderer=(id:string)=>{const found=byLogical.get(id);return found&&chart.panes.list().some(pane=>pane.id===found)?found:null;};
 const identify=(id:string,native:string)=>{byLogical.set(id,native);byRenderer.set(native,id);};
 const guardedBind=(handle:IndicatorHandle,id:string,ownScale:boolean|undefined,guard:PaneBindingGuard):boolean=>{
  const check=()=>guard.assertCurrent();
  const list=()=>{check();const panes=chart.panes;check();const read=panes.list;check();const rows=Reflect.apply(read,panes,[]) as ReturnType<Vela['panes']['list']>;check();return rows;};
  const ownedInfo=(target:IndicatorHandle)=>{const rows=list(),pane=rows.find(pane=>pane.indicators.some(row=>row.id===target.id));check();return pane;};
  const paneId=(pane:ReturnType<typeof ownedInfo>)=>{const value=pane?.id;check();return value;};
  const shared=(pane:NonNullable<ReturnType<typeof ownedInfo>>,target:IndicatorHandle)=>{const value=pane.indicators.find(row=>row.id===target.id)?.ownScale??false;check();return value;};
  const identifyCurrent=(native:string)=>{check();identify(id,native);check();};
  const move=(target:IndicatorHandle,destination:Parameters<IndicatorHandle['moveTo']>[0])=>{
   check();const method=target.moveTo;check();let entered=false,completed=false;
   guard.mutate(()=>{if(entered)throw Error('The owned native pane move was repeated.');entered=true;check();Reflect.apply(method,target,[destination]);check();completed=true;});
   check();if(!entered||!completed)throw Error('The owned native pane move did not complete.');
  };
  check();let current=ownedInfo(handle);if(!current)return false;
  const initial=paneId(current)!;const saved=byLogical.get(id);let existing:string|null=null;
  if(saved){const found=list().some(pane=>pane.id===saved);check();if(found)existing=saved;}
  let expected=initial;
  if(id==='price'){
   expected='price';if(initial!=='price')move(handle,'price');
  }else if(existing&&existing!==initial){
   if(ownScale===false){
    const target=list().find(pane=>pane.id===existing);check();const members=target?.indicators??[];check();
    const blocked=members.some(row=>row.ownScale===false);check();if(blocked)throw Error('Native shared pane cannot restore a second shared-scale master.');
    if(initial==='price'){
     move(handle,{newPane:true});current=ownedInfo(handle);const native=paneId(current);if(!native||native==='price')return false;expected=native;
    }
    current=ownedInfo(handle);if(!current||paneId(current)!==expected)return false;identifyCurrent(expected);
    for(const row of members){
     check();const memberId=row.id;check();const read=chart.indicators;check();const handles=read?Reflect.apply(read,chart,[]) as IndicatorHandle[]:undefined;check();const other=handles?.find(candidate=>candidate.id===memberId);check();
     if(!other)throw Error('Shared pane member has no movable native handle.');move(other,{pane:expected});if(paneId(ownedInfo(other))!==expected)return false;
    }
   }else{expected=existing;move(handle,{pane:existing});}
  }else if(initial==='price'&&id!=='price'){
   move(handle,{newPane:true});current=ownedInfo(handle);const native=paneId(current);if(!native||native==='price')return false;expected=native;
  }
  current=ownedInfo(handle);if(!current||paneId(current)!==expected||id!=='price'&&expected==='price')return false;
  let actual=shared(current,handle);
  if(ownScale===true&&!actual){
   move(handle,{pane:expected});current=ownedInfo(handle);if(!current||paneId(current)!==expected)return false;actual=shared(current,handle);if(!actual)return false;
  }
  if(ownScale===false&&actual&&expected!=='price')throw Error('Native shared pane cannot restore a second shared-scale master.');
  check();identifyCurrent(expected);return true;
 };
 const bind=(handle:IndicatorHandle,id:string,ownScale?:boolean,guard?:PaneBindingGuard)=>{
  if(guard)return guardedBind(handle,id,ownScale,guard);
  let current=info(handle);if(!current)return false;const existing=renderer(id);
  if(id==='price'){if(current.id!=='price')handle.moveTo('price');}
  else if(existing&&existing!==current.id){
   if(ownScale===false){
    const members=chart.panes.list().find(pane=>pane.id===existing)?.indicators??[];
    if(members.some(row=>row.ownScale===false))throw new Error('Native shared pane cannot restore a second shared-scale master.');
    // The one shared-scale master keeps its fresh pane; restore other members into it.
    if(current.id==='price'){handle.moveTo({newPane:true});current=info(handle)!;}
    identify(id,current.id);
    for(const row of members){const other=chart.indicators?.().find(candidate=>candidate.id===row.id);if(!other)throw new Error('Shared pane member has no movable native handle.');other.moveTo({pane:current.id});}
   }else handle.moveTo({pane:existing});
  }else if(current.id==='price'&&id!=='price')handle.moveTo({newPane:true});
  current=info(handle);if(!current)return false;identify(id,current.id);
  const actual=current.indicators.find(row=>row.id===handle.id)?.ownScale??false;
  if(ownScale===true&&!actual)handle.moveTo({pane:current.id});
  if(ownScale===false&&actual&&current.id!=='price')throw new Error('Native shared pane cannot restore a second shared-scale master.');
  return true;
 };
 const snapshot=()=>{const active=new Set(chart.panes.list().map(pane=>pane.id));return [...byLogical].filter(([,native])=>active.has(native)).map(([logical,native])=>({logical,native}));};
 return {logical,renderer,identify,bind,info,snapshot};
}
export type PaneRegistry=ReturnType<typeof createPaneRegistry>;
