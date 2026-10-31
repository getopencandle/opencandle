// ListAlertDialog. It writes a ListAlert
// to the `listAlerts` collection only, never an AlertDefinition. Text is LV wording; the Sessions default is Regular.
import React,{useState} from 'react';
import {Modal} from './Modal';
import type {BarDataset} from '../domain/types';
import type {WatchBook} from '../watchlists/model';
import {LIST_ALERT_FREQUENCIES,createListAlert,editListAlert,listAlertFromForm,listAlertToForm,type ListAlert,type ListAlertForm} from '../domain/watchlist-alerts';
import {watchListById} from '../watchlists/membership';
import {ALERT_WEBHOOK_LOCAL_ONLY,sendAlertWebhookTest,type AlertWebhookPort} from '../domain/alert-delivery';
import {defaultAlertWebhookPort,type AlertWebhookBridge} from './alert-delivery-host';

const KINDS:Array<[string,string]>=[['crossing-up','Crosses up'],['crossing-down','Crosses down'],['crossing','Crosses'],['greater','Greater than'],['less','Less than'],['inside','Inside channel'],['outside','Outside channel'],['entering','Enters channel'],['exiting','Exits channel'],['moving-up','Moving up'],['moving-down','Moving down'],['moving-up-percent','Moving up %'],['moving-down-percent','Moving down %']];
const FREQUENCIES:Record<string,string>={'only-once':'Only once','once-per-bar':'Once per bar','once-per-bar-close':'Once per bar close','once-per-minute':'Once per minute','every-time':'Every time'};
export interface ListAlertDialogProps {book:WatchBook;listId:string;alerts:readonly ListAlert[];datasets:readonly BarDataset[];now:()=>number;newId:()=>string;onCreate:(next:ListAlert[])=>boolean|void;onClose:()=>void;
 /** The saved list alert to edit in place. Absent: a new one. */
 editing?:ListAlert;
 /** Send test poster; default is the desktop bridge's postAlertWebhook. */
 webhookPort?:AlertWebhookPort|null}
export function ListAlertDialog(props:ListAlertDialogProps){
 let listName='this list';try{listName=watchListById(props.book,props.listId).name;}catch{/* the create button reports a deleted list */}
 const editing=props.editing;
 const [form,setForm]=useState<ListAlertForm>(()=>editing?listAlertToForm(editing):{listId:props.listId,name:'',message:'',kind:'crossing-up',value:'',lower:'',upper:'',amount:'',bars:'1',frequency:'only-once',session:'regular',expires:''}),[error,setError]=useState(''),[hookTest,setHookTest]=useState<{text:string;pending:boolean}|null>(null);
 const channel=['inside','outside','entering','exiting'].includes(form.kind),moving=form.kind.startsWith('moving-'),percent=form.kind.endsWith('-percent'),set=(patch:Partial<ListAlertForm>)=>{setForm({...form,...patch});setError('');};
 function create(){
  try{
   if(editing){
    const at=props.alerts.findIndex(row=>row.id===editing.id);if(at<0)throw new Error('This list alert was removed. Nothing was saved.');
    const edited=editListAlert(props.alerts[at],form,props.book,props.now());
    if(props.onCreate(props.alerts.map((row,index)=>index===at?edited:row))===false)throw new Error('The list alert could not be saved. Nothing was changed.');
    props.onClose();return;
   }
   const created=createListAlert(listAlertFromForm(form,props.newId(),props.now()),props.alerts,props.book,props.datasets);
   if(props.onCreate([...props.alerts,created])===false)throw new Error('The list alert could not be saved. Nothing was created.');
   props.onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
 }
 return <Modal title={editing?'Edit list alert':'New list alert'} onClose={props.onClose}>
  <form className="wl-modal-content" onSubmit={event=>{event.preventDefault();create();}}>
   <p>Watches every symbol in "{listName}" for one condition. Symbols added later start at their next completed bar; removed symbols stop at once.</p>
   {editing&&<p className="help">A new condition, frequency or session restarts every symbol at its next completed bar. Trigger history is kept.</p>}
   <label>Alert name<input aria-label="Alert name" maxLength={200} value={form.name} onChange={event=>set({name:event.target.value})}/></label>
   <label>Message<input aria-label="Message" maxLength={4000} value={form.message} onChange={event=>set({message:event.target.value})}/></label>
   <label>Condition<select aria-label="Condition" value={form.kind} onChange={event=>set({kind:event.target.value})}>{KINDS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {moving?<><label>{percent?'Movement (%)':'Movement (price)'}<input aria-label="Movement" inputMode="decimal" value={form.amount??''} onChange={event=>set({amount:event.target.value})}/></label><label>Within bars<input aria-label="Bars" inputMode="numeric" value={form.bars??''} onChange={event=>set({bars:event.target.value})}/></label><p className="help">Each symbol compares its completed bar with its own close that many bars earlier.</p></>:channel?<><label>Lower bound<input aria-label="Lower bound" inputMode="decimal" value={form.lower} onChange={event=>set({lower:event.target.value})}/></label><label>Upper bound<input aria-label="Upper bound" inputMode="decimal" value={form.upper} onChange={event=>set({upper:event.target.value})}/></label></>:<label>Level<input aria-label="Level" inputMode="decimal" value={form.value} onChange={event=>set({value:event.target.value})}/></label>}
   <label>Frequency<select aria-label="Frequency" value={form.frequency} onChange={event=>set({frequency:event.target.value})}>{LIST_ALERT_FREQUENCIES.map(value=><option key={value} value={value}>{FREQUENCIES[value]}</option>)}</select></label>
   <label>Sessions<select aria-label="Sessions" value={form.session} onChange={event=>set({session:event.target.value})}><option value="regular">Regular</option><option value="extended">Extended</option></select></label>
   {/* LV-local webhook, same rule and delivery as single alerts. */}
   <label>Webhook URL (optional)<input type="url" aria-label="Webhook URL" placeholder="http://127.0.0.1:8080/alert" maxLength={2048} value={form.webhook??''} onChange={event=>set({webhook:event.target.value})}/></label>
   {(form.webhook??'').trim()&&<p className="help">{ALERT_WEBHOOK_LOCAL_ONLY} <button type="button" disabled={!!hookTest?.pending} onClick={()=>{setHookTest({text:'Sending test...',pending:true});const port=props.webhookPort===undefined?defaultAlertWebhookPort((globalThis as unknown as {lv?:AlertWebhookBridge}).lv):props.webhookPort;void sendAlertWebhookTest(port,(form.webhook??'').trim(),form.message).then(result=>setHookTest({text:result.text,pending:false}));}}>Send test</button>{hookTest&&<span role="status" aria-label="Webhook test result"> {hookTest.text}</span>}</p>}
   <label>Expires (UTC, optional)<input aria-label="Expires" placeholder="YYYY-MM-DDTHH:mm" value={form.expires} onChange={event=>set({expires:event.target.value})}/></label>
   <p className="help">A symbol whose source does not declare the chosen session waits for data and never triggers. Only once completes when every current symbol has triggered.</p>
  </form>
  <footer><span role="alert">{error}</span><button type="button" onClick={props.onClose}>Cancel</button><button type="button" onClick={create}>{editing?'Save':'Create list alert'}</button></footer>
 </Modal>;
}
