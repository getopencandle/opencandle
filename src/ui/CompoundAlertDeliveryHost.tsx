import React,{useEffect,useRef,useState} from 'react';
import {popupTarget,STACKED_POPUP_STYLE} from './alert-popup-target';
import {ALERT_DELIVERY_BATCH_LIMIT,scheduleActivityAutoHide,type AlertWebhookPort,type AlertWebhookRequest,type DesktopNotificationPort} from '../domain/alert-delivery';
import {ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
import {parseLiveDatasetId} from './background-alert-plan';
import {sharedAlertSoundPlayer,type AlertSoundPlayer} from './alert-sound';
import {ALERT_POPUP_LAYER_Z_INDEX,ALERT_POPUP_VISIBLE_LIMIT,defaultAlertWebhookPort,defaultDesktopNotificationPort,type AlertNotifyBridge,type AlertWebhookBridge} from './alert-delivery-host';
import {compoundNotificationView,type CompoundNotificationView} from './compound-alert-presentation';
import type {CompoundAlertBook,CompoundBookEvent} from './compound-alert-book';
import type {AlertDeliverySettings} from '../domain/alert-delivery';
const apply=Reflect.apply;

export interface CompoundDeliveryItem {readonly view:CompoundNotificationView;readonly delivery:Readonly<AlertDeliverySettings>;readonly alertId:string;readonly generation:object}
export interface CompoundDeliveryPorts {
 readonly soundPlayer:AlertSoundPlayer;readonly desktopPort:DesktopNotificationPort|null;
 readonly popup:(items:readonly CompoundDeliveryItem[],suppressed:number)=>void;
 readonly notice:(message:string)=>void;
 /** LV-local webhook poster (same bridge path as single alerts). Absent or null: webhook triggers report that they were not sent. */
 readonly webhookPort?:AlertWebhookPort|null;
}
/** A compound trigger's webhook request; the body is the rendered compound message, as single alerts send theirs. */
export function compoundWebhookRequest(item:CompoundDeliveryItem):AlertWebhookRequest|null{
 const url=item.delivery.webhook;if(!url)return null;const body=item.view.message.slice(0,8000);
 let json=false;try{const parsed=JSON.parse(body);json=parsed!==null&&typeof parsed==='object';}catch{/* plain text */}
 return{url,body,contentType:json?'application/json':'text/plain',origin:item.view.title.startsWith('SYNTHETIC ')?'synthetic':'local'};
}
/** Bounded ephemeral transport. Only book event.fresh is consumed; journal
 * history/previous is never traversed and no scalar AlertDeliveryItem is cast. */
export class CompoundDeliveryRuntime {
 #book:CompoundAlertBook;#ports:()=>CompoundDeliveryPorts;#isCurrent:()=>boolean;#unsubscribe:()=>void;
 #generations=new Map<string,object>();#popups:CompoundDeliveryItem[]=[];#desktop:CompoundDeliveryItem[]=[];#sound:CompoundDeliveryItem|null=null;#webhooks:CompoundDeliveryItem[]=[];#droppedPopups=0;#droppedDesktop=0;#droppedWebhooks=0;
 #closed=false;#scheduled=false;#running=false;#epoch=0;
 constructor(book:CompoundAlertBook,ports:()=>CompoundDeliveryPorts,isCurrent:()=>boolean=()=>true){
  this.#book=book;this.#ports=ports;this.#isCurrent=isCurrent;this.#refresh();this.#unsubscribe=book.subscribe(event=>this.#event(event));
 }
 #refresh(){this.#generations=new Map(this.#book.entries().map(row=>[row.id,row.generation]));}
 #scopeCurrent(){try{return !this.#closed&&this.#isCurrent();}catch{return false;}}
 #valid(item:CompoundDeliveryItem,epoch:number){try{return this.#scopeCurrent()&&epoch===this.#epoch&&this.#generations.get(item.alertId)===item.generation&&this.#book.entry(item.alertId)?.generation===item.generation;}catch{return false;}}
 #event(event:CompoundBookEvent){
  if(!this.#scopeCurrent())return;
  if(event.kind!=='observation'){
   if(event.kind==='adopt'){this.#epoch++;this.#clear();}
   this.#refresh();this.#popups=this.#popups.filter(item=>this.#valid(item,this.#epoch));this.#desktop=this.#desktop.filter(item=>this.#valid(item,this.#epoch));this.#webhooks=this.#webhooks.filter(item=>this.#valid(item,this.#epoch));if(this.#sound&&!this.#valid(this.#sound,this.#epoch))this.#sound=null;return;
  }
  const node=event.fresh,entry=event.entry;if(!node||!entry)return;
  try{
   if(this.#generations.get(entry.id)!==entry.generation)return;
   const epoch=this.#epoch,original=compoundNotificationView(node.binding,node.item);
   const synthetic=parseLiveDatasetId(node.binding.provenance.datasetId)?.providerId===ALPACA_STUB_PROVIDER_ID;
   const view=synthetic?Object.freeze({...original,title:'SYNTHETIC '+original.title}):original;
   if(this.#closed||epoch!==this.#epoch||this.#generations.get(entry.id)!==entry.generation)return;
   const item=Object.freeze({view,delivery:node.delivery,alertId:entry.id,generation:entry.generation});
   if(item.delivery.popup){this.#popups.push(item);if(this.#popups.length>ALERT_DELIVERY_BATCH_LIMIT){this.#popups.shift();this.#droppedPopups++;}}
   if(item.delivery.desktop){this.#desktop.push(item);if(this.#desktop.length>ALERT_DELIVERY_BATCH_LIMIT){this.#desktop.shift();this.#droppedDesktop++;}}
   if(item.delivery.sound)this.#sound=item;
   if(item.delivery.webhook){this.#webhooks.push(item);if(this.#webhooks.length>ALERT_DELIVERY_BATCH_LIMIT){this.#webhooks.shift();this.#droppedWebhooks++;}}
   this.#schedule();
  }catch(error){this.#notice('Compound alert delivery could not be prepared: '+message(error)+'. The trigger remains in local history.');}
 }
 #schedule(){if(this.#closed||this.#scheduled||this.#running)return;this.#scheduled=true;queueMicrotask(()=>{this.#scheduled=false;void this.#flush();});}
 #notice(text:string){if(this.#scopeCurrent()){try{this.#ports().notice(text);}catch{/* presentation never changes acknowledged history */}}}
 async #flush():Promise<void>{
  if(!this.#scopeCurrent()||this.#running||!this.#popups.length&&!this.#desktop.length&&!this.#sound&&!this.#webhooks.length)return;
  this.#running=true;const epoch=this.#epoch,popups=this.#popups.splice(0),desktops=this.#desktop.splice(0),sound=this.#sound,droppedPopups=this.#droppedPopups,droppedDesktop=this.#droppedDesktop,webhooks=this.#webhooks.splice(0),droppedWebhooks=this.#droppedWebhooks;this.#sound=null;this.#droppedPopups=0;this.#droppedDesktop=0;this.#droppedWebhooks=0;
  const valid=()=>[...popups,...desktops,...webhooks,...(sound?[sound]:[])].some(item=>this.#valid(item,epoch));
  try{
   const ports=this.#ports(),popup=ports.popup,currentPopups=popups.filter(item=>this.#valid(item,epoch));if(currentPopups.length||droppedPopups&&this.#scopeCurrent())apply(popup,ports,[currentPopups,droppedPopups]);
   if(droppedDesktop&&valid())this.#notice(droppedDesktop+' additional desktop notifications were not shown to limit one batch to '+ALERT_DELIVERY_BATCH_LIMIT+'. All triggers remain in local history.');
   if(sound&&this.#valid(sound,epoch)&&sound.delivery.sound){try{const player=ports.soundPlayer,play=player.play;if(this.#valid(sound,epoch))await apply(play,player,sound.delivery.soundRepeat?[sound.delivery.sound,sound.delivery.soundRepeat]:[sound.delivery.sound]);}catch(error){if(this.#valid(sound,epoch))this.#notice('Alert sound was not played: '+message(error)+'. The trigger remains in local history.');}}
   // One POST per webhook trigger, in trigger order, never retried; failures become notices.
   const hooks=webhooks.filter(item=>this.#valid(item,epoch));
   if(hooks.length){const hookPort=ports.webhookPort??null;
    if(!hookPort)this.#notice(hooks.length+' webhook'+(hooks.length===1?' was':'s were')+' not sent: webhooks need the OpenCandle desktop app. The trigger'+(hooks.length===1?' remains':'s remain')+' in local history.');
    else for(const item of hooks){const request=compoundWebhookRequest(item);if(!request||!this.#valid(item,epoch))continue;try{const result=await hookPort.post(request);if(!result.delivered&&this.#valid(item,epoch))this.#notice('Webhook for '+item.view.title+' failed: '+(result.error??'HTTP '+result.status)+'. The trigger remains in local history.');}catch(error){if(this.#valid(item,epoch))this.#notice('Webhook for '+item.view.title+' failed: '+message(error)+'. The trigger remains in local history.');}}}
   if(droppedWebhooks&&valid())this.#notice(droppedWebhooks+' more webhooks were not sent to limit one batch. All triggers remain in local history.');
   // Permission may await user input. Recheck exact entry generation and adopt
   // epoch after EACH await, immediately before every irreversible show call.
   let desktop=desktops.filter(item=>this.#valid(item,epoch));if(!desktop.length)return;
   const port=ports.desktopPort;if(!valid())return;if(!port){this.#notice('Desktop notifications are unavailable. The triggers remain in local history.');return;}
   let permission;
   try{const read=port.permission;if(!valid())return;permission=apply(read,port,[]);if(!valid())return;if(permission==='default'){const request=port.request;if(request&&valid())permission=await apply(request,port,[]);}}
   catch(error){if(valid())this.#notice('Desktop notification permission failed: '+message(error)+'. The triggers remain in local history.');return;}
   desktop=desktops.filter(item=>this.#valid(item,epoch));if(!desktop.length)return;
   if(permission!=='granted'){this.#notice('Desktop notification permission is '+(permission==='denied'?'denied':permission==='unsupported'?'unavailable':'not granted')+'. The triggers remain in local history.');return;}
   for(const item of desktop){if(!this.#valid(item,epoch))continue;try{const show=port.show;if(this.#valid(item,epoch))await apply(show,port,[item.view.title,item.view.desktopBody,item.view.id]);}catch(error){if(this.#valid(item,epoch))this.#notice('A desktop notification was not shown: '+message(error)+'. The trigger remains in local history.');}}
  }catch(error){if(valid())this.#notice('Compound alert delivery failed: '+message(error)+'. The triggers remain in local history.');}
  finally{this.#running=false;this.#schedule();}
 }
 #clear(){this.#popups=[];this.#desktop=[];this.#sound=null;this.#webhooks=[];this.#droppedPopups=0;this.#droppedDesktop=0;this.#droppedWebhooks=0;}
 dispose():void{if(this.#closed)return;this.#closed=true;this.#epoch++;this.#unsubscribe();this.#clear();this.#generations.clear();}
}
function message(error:unknown):string{try{return error instanceof Error?error.message:String(error);}catch{return 'The local output failed';}}

interface Popup {readonly item:CompoundDeliveryItem;readonly at:number}
export interface CompoundAlertDeliveryHostProps {
 /** undefined keeps the standalone corner; null waits for a shared popup rack. */
 readonly popupHost?:HTMLElement|null;
 readonly book:CompoundAlertBook;readonly autoHide?:boolean;readonly soundPlayer?:AlertSoundPlayer;readonly desktopPort?:DesktopNotificationPort|null;
 /** Defaults to the desktop bridge's postAlertWebhook. */
 readonly webhookPort?:AlertWebhookPort|null;
 readonly financialGeneration:number;readonly gridGeneration:number;
 readonly financialGenerationRef:{readonly current:number};readonly gridGenerationRef:{readonly current:number};
}
export function CompoundAlertDeliveryHost(props:CompoundAlertDeliveryHostProps){
 const [popups,setPopups]=useState<Popup[]>([]),[notices,setNotices]=useState<string[]>([]),[closedCount,setClosedCount]=useState(0);
 const latest=useRef(props);latest.current=props;const visible=useRef<Popup[]>([]);
 const show=(rows:Popup[])=>{visible.current=rows;setPopups(rows);};
 useEffect(()=>{
  const book=props.book,financial=props.financialGeneration,grid=props.gridGeneration,financialRef=props.financialGenerationRef,gridRef=props.gridGenerationRef;
  let live=true;show([]);setNotices([]);setClosedCount(0);
  const owner=new CompoundDeliveryRuntime(book,()=>({
   soundPlayer:latest.current.soundPlayer??sharedAlertSoundPlayer(),
   desktopPort:latest.current.desktopPort===undefined?defaultDesktopNotificationPort((globalThis as unknown as {lv?:AlertNotifyBridge}).lv):latest.current.desktopPort,
   popup:(items,suppressed)=>{if(!live)return;const combined=[...visible.current,...items.map(item=>({item,at:Date.now()}))],dropped=suppressed+Math.max(0,combined.length-ALERT_POPUP_VISIBLE_LIMIT);show(combined.slice(-ALERT_POPUP_VISIBLE_LIMIT));if(dropped)setClosedCount(value=>value+dropped);},
   webhookPort:latest.current.webhookPort===undefined?defaultAlertWebhookPort((globalThis as unknown as {lv?:AlertWebhookBridge}).lv):latest.current.webhookPort,
   notice:text=>{if(live)setNotices(rows=>[...rows.filter(row=>row!==text),text].slice(-3));},
  }),()=>latest.current.book===book&&latest.current.financialGeneration===financial&&latest.current.gridGeneration===grid&&financialRef.current===financial&&gridRef.current===grid);
  return()=>{live=false;owner.dispose();};
 },[props.book,props.financialGeneration,props.gridGeneration,props.financialGenerationRef,props.gridGenerationRef]);
 useEffect(()=>{
  if(props.autoHide===false)return;
  const cancels=popups.map(popup=>scheduleActivityAutoHide(popup.at,()=>show(visible.current.filter(row=>row!==popup))));
  return()=>{for(const cancel of cancels)cancel();};
 },[popups,props.autoHide]);
 if(!popups.length&&!notices.length)return null;
 return popupTarget(<section className="lv-alert-popups" aria-label="Compound alert notifications" aria-live="polite" style={props.popupHost===undefined?{position:'fixed',right:16,bottom:16,zIndex:ALERT_POPUP_LAYER_Z_INDEX,width:'min(340px, calc(100vw - 32px))',maxHeight:'calc(100vh - 32px)',overflow:'auto'}:STACKED_POPUP_STYLE}>
  {notices.map(notice=><div className="lv-alert-delivery-notice" role="status" key={notice}>{notice}<button type="button" aria-label="Dismiss compound delivery notice" onClick={()=>setNotices(rows=>rows.filter(row=>row!==notice))}>Dismiss</button></div>)}
  {closedCount>0&&<p role="status">{closedCount} earlier compound alert popups were closed to keep {ALERT_POPUP_VISIBLE_LIMIT} visible. All triggers remain in local history.</p>}
  {popups.map(({item})=><article className="lv-alert-popup" data-compound-notification-id={item.view.id} key={item.view.id}><strong>{item.view.title}</strong><p style={{whiteSpace:'pre-wrap'}}>{item.view.message}</p>{item.view.conditions.map((condition,index)=><p key={index}>{condition.label} = {condition.value}</p>)}<button type="button" aria-label={'Dismiss '+item.view.title} onClick={()=>show(visible.current.filter(row=>row.item!==item))}>Dismiss</button></article>)}
  {popups.length>1&&<button type="button" onClick={()=>{show([]);setClosedCount(0);}}>Dismiss all compound alert popups</button>}
 </section>,props.popupHost);
}
