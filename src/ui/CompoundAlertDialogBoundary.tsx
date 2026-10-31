import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Modal} from './Modal';
import {CompoundConditionEditor,emptyCompoundCondition,type CompoundConditionDraft} from './CompoundConditionEditor';
import {buildCompoundFormDefinition} from './compound-alert-form';
import {compoundConditionLabels,compoundNotificationView,type CompoundNotificationView} from './compound-alert-presentation';
import {COMPOUND_DIALOG_OPERATORS,compoundChannel,compoundDefinitionDrafts,compoundDialogChoices,compoundSeedCondition,sameCompoundDialogContext,validateCompoundAddedCondition,type CompoundAlertDialogController,type CompoundDialogChoice} from './compound-alert-dialog';
import type {AlertDraft,AlertSourceChoice,ManagerActionAuthority} from './AlertDialog';
import type {CompoundBookEntry} from './compound-alert-book';
import type {CompoundContext,CompoundFrequency} from '../domain/compound-alerts';
import {ALERT_SOUNDS,ALERT_SOUND_REPEAT_LABELS,ALERT_SOUND_REPEAT_SECONDS,ALERT_WEBHOOK_LOCAL_ONLY,LV_DEFAULT_ALERT_DELIVERY,type AlertSoundId,type AlertSoundRepeat,type AlertDeliverySettings} from '../domain/alert-delivery';
import type {AlertManagerFilter,AlertManagerSort} from '../domain/alert-manager-view';
import {alertExpiryFromInstant,alertExpiryForText,editAlertExpiry,resolveAlertExpiry,alertExpiryCandidates,chooseAlertExpiry,systemAlertClock,type AlertExpiryDraft} from './alert-time';

interface EntryPin {id:string;generation:object;revision:number}
interface RowModel {pin:EntryPin;name:string;message:string;status:CompoundBookEntry['state']['status'];interval:string;labels:readonly string[]}
const statusLabel={active:'Active','waiting-for-data':'Waiting for data',paused:'Paused',stopped:'Stopped',expired:'Expired'} as const;
function CompoundManagerRow({row,onEdit,onLifecycle,onDelete}:{row:RowModel;onEdit:(pin:EntryPin)=>void;onLifecycle:(pin:EntryPin,kind:'pause'|'resume'|'rearm')=>void;onDelete:(pin:EntryPin)=>void}){
 return <article className="alert-row" tabIndex={0} aria-label={`All-conditions alert ${row.name}, ${statusLabel[row.status]}`}><strong>{row.name}</strong><span className="alert-state">{statusLabel[row.status]}</span><p>{row.message}</p><p>{row.interval} · Regular session · All conditions</p><ul>{row.labels.map((label,index)=><li key={index}>{label}</li>)}</ul><div className="compound-actions"><button type="button" onClick={()=>onEdit(row.pin)}>Edit all-conditions alert</button>{row.status==='paused'?<button type="button" onClick={()=>onLifecycle(row.pin,'resume')}>Resume</button>:row.status==='active'||row.status==='waiting-for-data'?<button type="button" onClick={()=>onLifecycle(row.pin,'pause')}>Pause</button>:<button type="button" onClick={()=>onLifecycle(row.pin,'rearm')}>Restart</button>}<button type="button" onClick={()=>onDelete(row.pin)}>Delete all-conditions alert</button></div></article>;
}
interface PendingAdd {
 book:CompoundAlertDialogController['book'];request:unknown;authority:object|undefined;
 selectedSourceId:string|undefined;scalarDraft:AlertDraft;deadline:number;attempts:number;
 timer:ReturnType<typeof setTimeout>|null;
}
// The timer retains only its intent and ref, never a render's source/catalog.
function schedulePendingAdd(target:{current:((intent:PendingAdd)=>void)|null},intent:PendingAdd):ReturnType<typeof setTimeout>{return setTimeout(()=>target.current?.(intent),50);}
interface PendingSave {
 session:Session;tab:string;allowCreate:boolean;selectedSourceId:string|undefined;scalarDraft:AlertDraft;
 deadline:number;attempts:number;phase:'waiting'|'reading'|'finishing';timer:ReturnType<typeof setTimeout>|null;
}
function schedulePendingSave(target:{current:((intent:PendingSave)=>void)|null},intent:PendingSave):ReturnType<typeof setTimeout>{return setTimeout(()=>target.current?.(intent),50);}
type LifecycleKind='pause'|'resume'|'rearm';
interface PendingLifecycle {pin:EntryPin;kind:LifecycleKind;book:CompoundAlertDialogController['book'];request:unknown;authority:object|undefined;tab:string;deadline:number;attempts:number;phase:'waiting'|'reading'|'finishing';timer:ReturnType<typeof setTimeout>|null}
function schedulePendingLifecycle(target:{current:((intent:PendingLifecycle)=>void)|null},intent:PendingLifecycle):ReturnType<typeof setTimeout>{return setTimeout(()=>target.current?.(intent),50);}
interface Session {
 token:object;book:CompoundAlertDialogController['book'];request:unknown;authority:object|undefined;
 editing:EntryPin|null;context:Readonly<CompoundContext>;choices:readonly CompoundDialogChoice[];
 owner:Readonly<{assertCurrent():void}>;phase:'add'|'form';conditions:readonly CompoundConditionDraft[];candidate:CompoundConditionDraft;
 name:string;message:string;frequency:CompoundFrequency;expiration:boolean;expiry:AlertExpiryDraft;delivery:Readonly<AlertDeliverySettings>;
}
export interface CompoundAlertDialogBoundaryProps {
 readonly controller:CompoundAlertDialogController;readonly tab:string;readonly scalarDraft:AlertDraft;
 readonly sourceChoices:readonly AlertSourceChoice[];readonly selectedSourceId?:string;
 readonly managerAuthority?:ManagerActionAuthority;readonly requestKey:unknown;
 readonly allowCreate:boolean;readonly filter:AlertManagerFilter;readonly sort:AlertManagerSort;
 readonly onSaved:()=>void;
}
function useBookVersion(controller:CompoundAlertDialogController){
 const [version,setVersion]=useState(controller.book.version);
 useEffect(()=>{let alive=true;const off=controller.book.subscribe(()=>{if(alive)setVersion(controller.book.version);});setVersion(controller.book.version);return()=>{alive=false;off();};},[controller.book]);
 return version;
}
/** A child owns the new hook state; legacy AlertDialog hook order is unchanged. */
export function CompoundAlertCount({controller,scalarCount}:{controller:CompoundAlertDialogController;scalarCount:number}){
 useBookVersion(controller);return <>Alerts ({scalarCount+controller.book.entries().length})</>;
}
export function CompoundAlertHistoryCount({controller,scalarCount}:{controller:CompoundAlertDialogController;scalarCount:number}){
 useBookVersion(controller);let count=scalarCount;for(const entry of controller.book.entries())count+=entry.state.history?.size??0;return <>History ({count})</>;
}
function currentEntry(controller:CompoundAlertDialogController,pin:EntryPin):CompoundBookEntry{
 const entry=controller.book.entry(pin.id);if(!entry||entry.generation!==pin.generation||entry.state.revision!==pin.revision)throw Error('This all-conditions alert changed or was removed. Reopen it before editing.');return entry;
}
const pin=(entry:CompoundBookEntry):EntryPin=>({id:entry.id,generation:entry.generation,revision:entry.state.revision});
function filtered(entries:readonly CompoundBookEntry[],filter:AlertManagerFilter,sort:AlertManagerSort):CompoundBookEntry[]{
 if(filter.mode==='replay')return[];const query=filter.query.trim().toLocaleLowerCase();
 const rows=entries.filter(entry=>{
  const d=entry.state.definition,type=d.predicates.some(row=>row.source.kind==='indicator')?'indicator':'price';
  if(filter.status!=='all'&&entry.state.status!==filter.status||filter.sourceType!=='all'&&filter.sourceType!==type)return false;
  return!query||[d.name,d.message,d.context.instrumentId,...compoundConditionLabels(d)].join(' ').toLocaleLowerCase().includes(query);
 });
 if(sort.key==='original')return rows;
 const key=(entry:CompoundBookEntry):string|number=>sort.key==='name'?entry.state.definition.name:sort.key==='message'?entry.state.definition.message:sort.key==='ticker'?entry.state.definition.context.instrumentId:sort.key==='created'?entry.state.definition.createdAt:entry.state.lastTriggeredAt??-1;
 return rows.sort((a,b)=>{const x=key(a),y=key(b),n=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));return sort.direction==='desc'?-n:n;});
}
function expiryFromDraft(draft:AlertDraft):AlertExpiryDraft{return draft.expiry&&draft.expiry.value===draft.expiresAt?draft.expiry:alertExpiryForText(draft.expiresAt,draft.expiry?.zone??systemAlertClock().zone);}
function FirstAddedCondition({session,change,onAdd,onCancel,error}:{session:Session;change:(patch:Partial<CompoundConditionDraft>)=>void;onAdd:()=>void;onCancel:()=>void;error:string}){
 const row=session.candidate;
 return <Modal title="Add condition" onClose={onCancel} portal><div className="lv-compound-condition-fields" onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&event.target instanceof HTMLInputElement){event.preventDefault();event.stopPropagation();onAdd();}}}>
  <p>The first condition is kept from the alert form. Configure another condition to require both in the same observation.</p>
  <label>Source<select autoFocus aria-label="Added condition source" value={row.sourceId} onChange={event=>change({sourceId:event.target.value})}><option value="">Choose a source</option>{session.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
  <label>Condition<select aria-label="Added condition operator" value={row.kind} onChange={event=>change({kind:event.target.value as CompoundConditionDraft['kind']})}><option value="">Choose a condition</option>{COMPOUND_DIALOG_OPERATORS.map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></label>
  {compoundChannel(row.kind)?<><label>Lower bound<input aria-label="Added condition lower bound" inputMode="decimal" maxLength={64} value={row.lower} onChange={event=>change({lower:event.target.value})}/></label><label>Upper bound<input aria-label="Added condition upper bound" inputMode="decimal" maxLength={64} value={row.upper} onChange={event=>change({upper:event.target.value})}/></label></>:<label>Value<input aria-label="Added condition value" inputMode="decimal" maxLength={64} value={row.value} onChange={event=>change({value:event.target.value})}/></label>}
 </div>{error&&<p role="alert">{error}</p>}<div className="lv-compound-condition-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" onClick={onAdd}>Add</button></div></Modal>;
}

/** Inside the existing Alerts/History/Create manager. This component never
 * casts compound state or a value vector to LocalAlert/AlertDeliveryItem. */
export function CompoundAlertDialogBoundary(props:CompoundAlertDialogBoundaryProps){
 const [session,setSession]=useState<Session|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[deleting,setDeleting]=useState<EntryPin|null>(null);
 const alive=useRef(false),viewRef=useRef<object|null>(null),draft=useRef<Session|null>(null),latest=useRef(props);latest.current=props;
 const view={};viewRef.current=view;const version=useBookVersion(props.controller);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;viewRef.current=null;draft.current=null;};},[]);
 const active=()=>alive.current&&viewRef.current===view;
 const report=(value:unknown)=>{if(active())setError(value instanceof Error?value.message:'The all-conditions alert action could not finish. Review the current alert.');};
 const replace=(next:Session|null)=>{if(pendingSave.current&&next!==pendingSave.current.session)cancelPendingSave();cancelPendingLifecycle();draft.current=next;setSession(next);};
 const owner=(token:object,book:Session['book'],request:unknown,authority:object|undefined,editing:EntryPin|null)=>Object.freeze({assertCurrent(){
  const live=latest.current;
  if(!alive.current||draft.current?.token!==token||live.controller.book!==book||live.requestKey!==request||live.managerAuthority?.token!==authority)throw Error('This all-conditions alert draft is no longer open.');
  if(editing)currentEntry(live.controller,editing);
 }});
 useLayoutEffect(()=>{
  const value=draft.current;if(!value)return;
  try{value.owner.assertCurrent();}catch{if(draft.current===value)replace(null);}
 },[version,props.controller.book,props.requestKey,props.managerAuthority?.token]);
 useEffect(()=>{const book=props.controller.book;return book.subscribe(event=>{if(event.kind==='adopt'&&alive.current&&latest.current.controller.book===book){cancelPendingAdd();cancelPendingSave();cancelPendingLifecycle();draft.current=null;setSession(null);setDeleting(null);}});},[props.controller.book]);
 // Appended hooks preserve the existing Boundary hook prefix. Form inputs are
 // controlled state identities; normal market renders keep that draft identity.
 const [preparing,setPreparing]=useState(false),pendingAdd=useRef<PendingAdd|null>(null),pendingRunner=useRef<((intent:PendingAdd)=>void)|null>(null);
 const intentCurrent=(intent:PendingAdd)=>{const live=latest.current;return alive.current&&pendingAdd.current===intent&&live.controller.book===intent.book&&live.requestKey===intent.request&&live.managerAuthority?.token===intent.authority&&live.tab==='Create'&&live.allowCreate&&live.selectedSourceId===intent.selectedSourceId&&live.scalarDraft===intent.scalarDraft;};
 function cancelPendingAdd(){const intent=pendingAdd.current;pendingAdd.current=null;if(intent?.timer!==null&&intent?.timer!==undefined)clearTimeout(intent.timer);if(intent)intent.timer=null;if(alive.current)setPreparing(false);}
 useLayoutEffect(()=>{const intent=pendingAdd.current;if(intent&&!intentCurrent(intent))cancelPendingAdd();},[props.controller.book,props.requestKey,props.managerAuthority?.token,props.tab,props.allowCreate,props.selectedSourceId,props.scalarDraft]);
 useEffect(()=>()=>{pendingRunner.current=null;const intent=pendingAdd.current;pendingAdd.current=null;if(intent?.timer!==null&&intent?.timer!==undefined)clearTimeout(intent.timer);if(intent)intent.timer=null;},[]);
 // Appended after every existing Boundary hook. A save owns the FULL immutable
 // session value, so text/conditions/delivery/expiry edits retire it immediately.
 const [savingSource,setSavingSource]=useState(false),pendingSave=useRef<PendingSave|null>(null),saveRunner=useRef<((intent:PendingSave)=>void)|null>(null);
 const saveCurrent=(intent:PendingSave)=>{const live=latest.current,value=intent.session;return alive.current&&pendingSave.current===intent&&draft.current===value&&live.controller.book===value.book&&live.requestKey===value.request&&live.managerAuthority?.token===value.authority&&live.tab===intent.tab&&live.allowCreate===intent.allowCreate&&live.selectedSourceId===intent.selectedSourceId&&live.scalarDraft===intent.scalarDraft;};
 function cancelPendingSave(){const intent=pendingSave.current;pendingSave.current=null;if(intent?.timer!==null&&intent?.timer!==undefined)clearTimeout(intent.timer);if(intent)intent.timer=null;if(intent&&alive.current)setSavingSource(false);}
 useLayoutEffect(()=>{const intent=pendingSave.current;if(intent&&!saveCurrent(intent))cancelPendingSave();},[session,props.controller.book,props.requestKey,props.managerAuthority?.token,props.tab,props.allowCreate,props.selectedSourceId,props.scalarDraft]);
 useEffect(()=>()=>{saveRunner.current=null;const intent=pendingSave.current;pendingSave.current=null;if(intent?.timer!==null&&intent?.timer!==undefined)clearTimeout(intent.timer);if(intent)intent.timer=null;},[]);
 // Appended after the complete Add/Save hook prefix. Entry pins retain no
 // canonical Entry, journal, row, dataset or prior host snapshot across waits.
 const [lifecyclePending,setLifecyclePending]=useState(false),pendingLifecycle=useRef<PendingLifecycle|null>(null),lifecycleRunner=useRef<((intent:PendingLifecycle)=>void)|null>(null),lifecycleDispatch=useRef(false),lifecycleInteraction=useRef<object>({});
 const lifecycleOwner=(intent:PendingLifecycle)=>{const live=latest.current;return alive.current&&pendingLifecycle.current===intent&&live.controller.book===intent.book&&live.requestKey===intent.request&&live.managerAuthority?.token===intent.authority&&live.tab===intent.tab;};
 function cancelPendingLifecycle(){lifecycleInteraction.current={};const intent=pendingLifecycle.current;pendingLifecycle.current=null;if(intent?.timer!==null&&intent?.timer!==undefined)clearTimeout(intent.timer);if(intent)intent.timer=null;if(intent&&alive.current)setLifecyclePending(false);}
 const assertLifecycleOwner=(intent:PendingLifecycle)=>{if(!lifecycleOwner(intent))throw Error('This alert action is no longer current. Review the current alert.');if(Date.now()>=intent.deadline)throw Error('The alert collection is busy. Wait a moment and try the action again.');};
 const assertLifecycleCurrent=(intent:PendingLifecycle)=>{assertLifecycleOwner(intent);currentEntry(latest.current.controller,intent.pin);assertLifecycleOwner(intent);};
 useLayoutEffect(()=>{const intent=pendingLifecycle.current;if(!intent)return;try{assertLifecycleCurrent(intent);}catch{if(pendingLifecycle.current===intent)cancelPendingLifecycle();}},[version,props.controller.book,props.requestKey,props.managerAuthority?.token,props.tab]);
 useEffect(()=>()=>{lifecycleRunner.current=null;const intent=pendingLifecycle.current;pendingLifecycle.current=null;if(intent?.timer!==null&&intent?.timer!==undefined)clearTimeout(intent.timer);if(intent)intent.timer=null;},[]);
 const renderedLifecycle=pendingLifecycle.current;
 const change=(patch:Partial<Session>)=>{const value=draft.current;if(!active()||!value)return;try{value.owner.assertCurrent();replace({...value,...patch});setError('');}catch(value){report(value);}};
 const cancel=()=>{if(active()){cancelPendingAdd();replace(null);setError('');}};
 const openDraft=(entry:CompoundBookEntry|undefined,context:Readonly<CompoundContext>,intent?:PendingAdd)=>{
  if(!active()||intent&&!intentCurrent(intent))return;
  try{
   const live=latest.current,book=live.controller.book;
   const choices=compoundDialogChoices(live.sourceChoices,entry?.state.definition),token={},editing=entry?pin(entry):null,first=entry?compoundDefinitionDrafts(entry.state.definition,choices):Object.freeze([compoundSeedCondition(live.scalarDraft,live.selectedSourceId,choices)]),authority=live.managerAuthority?.token;
   const settings=entry?.delivery??{schemaVersion:1 as const,popup:live.scalarDraft.popup??LV_DEFAULT_ALERT_DELIVERY.popup,desktop:live.scalarDraft.desktop??LV_DEFAULT_ALERT_DELIVERY.desktop,sound:live.scalarDraft.sound||null,...(live.scalarDraft.sound&&live.scalarDraft.soundRepeat?{soundRepeat:live.scalarDraft.soundRepeat}:{}),...(live.scalarDraft.webhookEnabled&&live.scalarDraft.webhook?.trim()?{webhook:live.scalarDraft.webhook.trim()}:{})};
   const next:Session={token,book,request:live.requestKey,authority,editing,context,choices,owner:owner(token,book,live.requestKey,authority,editing),phase:entry?'form':'add',conditions:first,candidate:emptyCompoundCondition(),name:entry?.state.definition.name??live.scalarDraft.name,message:entry?.state.definition.message??live.scalarDraft.message,frequency:entry?.state.definition.frequency??live.scalarDraft.frequency,expiration:entry?entry.state.definition.expiresAt!==null:live.scalarDraft.expirationEnabled,expiry:entry?.state.definition.expiresAt!==undefined&&entry.state.definition.expiresAt!==null?alertExpiryFromInstant(entry.state.definition.expiresAt,systemAlertClock().zone):entry?alertExpiryForText('',systemAlertClock().zone):expiryFromDraft(live.scalarDraft),delivery:Object.freeze({...settings})};
   if(intent&&!intentCurrent(intent)){if(pendingAdd.current===intent)cancelPendingAdd();return;}if(!active()){if(intent)cancelPendingAdd();return;}if(intent&&Date.now()>=intent.deadline)throw Error('The live regular-session source is not ready. Wait a moment and try Add condition again.');if(intent)cancelPendingAdd();replace(next);setError('');setNotice('');
  }catch(value){if(intent&&pendingAdd.current!==intent)return;if(intent)cancelPendingAdd();report(value);}
 };
 pendingRunner.current=(intent)=>{
  intent.timer=null;if(!intentCurrent(intent)){if(pendingAdd.current===intent)cancelPendingAdd();return;}
  if(intent.attempts>=40||Date.now()>=intent.deadline){cancelPendingAdd();setError('The live regular-session source is not ready. Wait a moment and try Add condition again.');return;}
  intent.attempts++;
  try{
   const context=intent.book.describeCurrentSource();if(!intentCurrent(intent)){if(pendingAdd.current===intent)cancelPendingAdd();return;}
   if(Date.now()>=intent.deadline){cancelPendingAdd();setError('The live regular-session source is not ready. Wait a moment and try Add condition again.');return;}
   // A same-owner synchronous rerender replaces the runner. Before any catalog
   // or expiry work, hand off through its ref instead of using the old view.
   if(!active()){intent.timer=schedulePendingAdd(pendingRunner,intent);return;}
   if(context){openDraft(undefined,context,intent);return;}
   intent.timer=schedulePendingAdd(pendingRunner,intent);
  }catch(value){if(intentCurrent(intent)){cancelPendingAdd();report(value);}}
 };
 const start=(entry?:CompoundBookEntry)=>{
  if(!active())return;cancelPendingLifecycle();
  if(entry){cancelPendingAdd();openDraft(entry,entry.state.definition.context);return;}
  if(pendingAdd.current)return;
  const live=latest.current;if(live.tab!=='Create'||!live.allowCreate)return;
  const intent:PendingAdd={book:live.controller.book,request:live.requestKey,authority:live.managerAuthority?.token,selectedSourceId:live.selectedSourceId,scalarDraft:live.scalarDraft,deadline:Date.now()+2000,attempts:0,timer:null};
  pendingAdd.current=intent;setPreparing(true);setError('');pendingRunner.current?.(intent);
 };
 const addFirst=()=>{const value=draft.current;if(!active()||!value)return;try{value.owner.assertCurrent();validateCompoundAddedCondition(value.candidate,value.choices);change({phase:'form',conditions:Object.freeze([...value.conditions,value.candidate])});}catch(value){report(value);}};
 const finishSave=(value:Session,intent:PendingSave)=>{
  if(!active()||!saveCurrent(intent)){if(pendingSave.current===intent)cancelPendingSave();return;}
  const assertSavingCurrent=()=>{value.owner.assertCurrent();if(!saveCurrent(intent))throw Error('This all-conditions alert draft changed before saving. Review it and try again.');if(Date.now()>=intent.deadline)throw Error('The live source is not ready. Wait a moment and try saving again.');};
  try{
   assertSavingCurrent();const now=latest.current.controller.readActionTime();assertSavingCurrent();if(!active())return;
   if(intent.attempts>=40)throw Error('The live source is not ready. Wait a moment and try saving again.');intent.attempts++;const context=latest.current.controller.book.describeCurrentSource();assertSavingCurrent();if(!context||!sameCompoundDialogContext(context,value.context))throw Error('Select the matching genuine live regular-session source before saving this alert. The draft is retained.');
   const existing=value.editing?currentEntry(latest.current.controller,value.editing):null,id=existing?.id??crypto.randomUUID(),definition=buildCompoundFormDefinition({name:value.name,message:value.message,conditions:value.conditions,frequency:value.frequency,expiresAt:value.expiration?resolveAlertExpiry(value.expiry):null},value.choices,value.context,{id,now:existing?.state.definition.createdAt??now});
   assertSavingCurrent();if(!active())return;
   const action=existing?latest.current.controller.book.prepareEdit(existing.id,existing,definition,value.delivery,now):latest.current.controller.book.prepareCreate(definition,value.delivery);
   let committed=false;try{assertSavingCurrent();if(!active())return;committed=action.commit();}finally{if(!committed)action.rollback();}
   if(!committed)throw Error('The alert collection changed before saving. Review this draft and try again.');
   const live=latest.current;
   if((draft.current===value||draft.current===null)&&live.controller.book===value.book&&live.requestKey===value.request&&live.managerAuthority?.token===value.authority&&live.tab===intent.tab&&live.allowCreate===intent.allowCreate&&live.selectedSourceId===intent.selectedSourceId&&live.scalarDraft===intent.scalarDraft){if(draft.current===value)replace(null);setNotice('All-conditions alert saved. It waits for its matching genuine observation.');setError('');live.onSaved();}
  }catch(value){report(value);}finally{if(pendingSave.current===intent)cancelPendingSave();}
 };
 saveRunner.current=(intent)=>{
  intent.timer=null;if(!saveCurrent(intent)){if(pendingSave.current===intent)cancelPendingSave();return;}if(intent.phase!=='waiting')return;
  // Reserve one of the forty actual description calls for the unchanged
  // post-clock strict check in finishSave; never retry that final action.
  if(intent.attempts>=39||Date.now()>=intent.deadline){cancelPendingSave();setError('The live source is not ready. Wait a moment and try saving again.');return;}
  intent.phase='reading';try{
   intent.session.owner.assertCurrent();if(!saveCurrent(intent)){if(pendingSave.current===intent)cancelPendingSave();return;}
   intent.attempts++;const context=intent.session.book.describeCurrentSource();
   intent.session.owner.assertCurrent();if(!saveCurrent(intent)){if(pendingSave.current===intent)cancelPendingSave();return;}
   if(Date.now()>=intent.deadline){cancelPendingSave();setError('The live source is not ready. Wait a moment and try saving again.');return;}
   if(context&&!sameCompoundDialogContext(context,intent.session.context))throw Error('Select the matching genuine live regular-session source before saving this alert. The draft is retained.');
   if(!active()){intent.phase='waiting';intent.timer=schedulePendingSave(saveRunner,intent);return;}
   if(context){intent.phase='finishing';finishSave(intent.session,intent);return;}
   intent.phase='waiting';intent.timer=schedulePendingSave(saveRunner,intent);
  }catch(value){if(pendingSave.current===intent){const current=saveCurrent(intent);cancelPendingSave();if(current)report(value);}}
 };
 const save=()=>{
  const value=draft.current;if(!active()||!value)return;
  const pending=pendingSave.current;if(pending){if(pending.phase!=='waiting')return;if(pending.timer!==null)clearTimeout(pending.timer);pending.timer=null;saveRunner.current?.(pending);return;}
  const live=latest.current,intent:PendingSave={session:value,tab:live.tab,allowCreate:live.allowCreate,selectedSourceId:live.selectedSourceId,scalarDraft:live.scalarDraft,deadline:Date.now()+2000,attempts:0,phase:'waiting',timer:null};
  pendingSave.current=intent;setSavingSource(true);setError('');saveRunner.current?.(intent);
 };
 const finishLifecycle=(intent:PendingLifecycle)=>{
  try{
   assertLifecycleCurrent(intent);if(!active())return;
   const now=latest.current.controller.readActionTime();assertLifecycleCurrent(intent);if(!active())return;
   const entry=currentEntry(latest.current.controller,intent.pin);assertLifecycleOwner(intent);if(!active())return;const action=intent.book.prepareLifecycle(intent.pin.id,entry,intent.kind,now);
   let committed=false;try{assertLifecycleCurrent(intent);if(!active())return;committed=action.commit();}finally{if(!committed)action.rollback();}
   if(!committed)throw Error('This alert changed before the action completed.');
   if(lifecycleOwner(intent))setError('');
  }catch(value){if(lifecycleOwner(intent))report(value);}finally{if(pendingLifecycle.current===intent)cancelPendingLifecycle();}
 };
 lifecycleRunner.current=(intent)=>{
  intent.timer=null;if(!lifecycleOwner(intent)){if(pendingLifecycle.current===intent)cancelPendingLifecycle();return;}if(intent.phase!=='waiting')return;
  if(intent.attempts>=40||Date.now()>=intent.deadline){cancelPendingLifecycle();setError('The alert collection is busy. Wait a moment and try the action again.');return;}
  intent.phase='reading';try{
   assertLifecycleCurrent(intent);intent.attempts++;const available=intent.book.describeCollectionAvailability();assertLifecycleCurrent(intent);if(typeof available!=='boolean')throw Error('The alert collection readiness could not be determined. Review the current alert.');
   if(!active()||!available){intent.phase='waiting';intent.timer=schedulePendingLifecycle(lifecycleRunner,intent);return;}
   intent.phase='finishing';finishLifecycle(intent);
  }catch(value){if(pendingLifecycle.current===intent){const current=lifecycleOwner(intent);cancelPendingLifecycle();if(current)report(value);}}
 };
 const lifecycle=(expected:EntryPin,kind:LifecycleKind)=>{
  if(!active()||lifecycleDispatch.current)return;const pending=pendingLifecycle.current;
  if(pending&&pending.phase!=='waiting')return;
  if(pending!==renderedLifecycle)return;
  if(pending&&pending.kind===kind&&pending.pin.id===expected.id&&pending.pin.generation===expected.generation&&pending.pin.revision===expected.revision&&lifecycleOwner(pending)){if(pending.timer!==null)clearTimeout(pending.timer);pending.timer=null;lifecycleRunner.current?.(pending);return;}
  const interaction=lifecycleInteraction.current;lifecycleDispatch.current=true;try{
   currentEntry(latest.current.controller,expected);if(!active()||lifecycleInteraction.current!==interaction)return;
   cancelPendingLifecycle();cancelPendingSave();cancelPendingAdd();
   const live=latest.current,intent:PendingLifecycle={pin:expected,kind,book:live.controller.book,request:live.requestKey,authority:live.managerAuthority?.token,tab:live.tab,deadline:Date.now()+2000,attempts:0,phase:'waiting',timer:null};
   pendingLifecycle.current=intent;setLifecyclePending(true);setError('');lifecycleRunner.current?.(intent);
  }catch(value){report(value);}finally{lifecycleDispatch.current=false;}
 };
 const remove=()=>{
  if(!active()||!deleting)return;try{const entry=currentEntry(props.controller,deleting),action=props.controller.book.prepareRemove(entry.id,entry);let committed=false;try{committed=action.commit();}finally{if(!committed)action.rollback();}if(!committed)throw Error('This alert changed before removal.');setDeleting(null);setError('');}catch(value){report(value);}
 };
 let entries:readonly CompoundBookEntry[]|null=props.controller.book.entries(),rows:CompoundBookEntry[]=filtered(entries,props.filter,props.sort);
 const rowModels:readonly RowModel[]=rows.map(entry=>({pin:pin(entry),name:entry.state.definition.name,message:entry.state.definition.message,status:entry.state.status,interval:entry.state.definition.context.interval,labels:compoundConditionLabels(entry.state.definition)}));
 const historyChoices=entries.map(entry=>({id:entry.id,name:entry.state.definition.name}));entries=null;rows=[];
 const opened=session&&session.book===props.controller.book&&session.request===props.requestKey&&session.authority===props.managerAuthority?.token?session:null;
 const shownSave=pendingSave.current,cancelShownSave=()=>{if(active()&&shownSave&&pendingSave.current===shownSave)cancelPendingSave();};
 const shownLifecycle=pendingLifecycle.current,cancelShownLifecycle=()=>{if(active()&&shownLifecycle&&pendingLifecycle.current===shownLifecycle)cancelPendingLifecycle();};
 let expiryOptions:number[]=[],expiryError='';if(opened?.expiration)try{expiryOptions=alertExpiryCandidates(opened.expiry.value,opened.expiry.zone);}catch(value){expiryError=value instanceof Error?value.message:'Choose an available expiration time.';}
 return <section className="lv-compound-manager" aria-label="All-conditions alerts">
  <style>{`.lv-compound-manager{margin:12px 0}.lv-compound-manager .alert-row{border:1px solid var(--lv-border,#34445d);padding:12px;margin:8px 0}.lv-compound-manager .compound-actions{display:flex;gap:8px;flex-wrap:wrap}.lv-compound-editor-fields{display:grid;gap:12px}.lv-compound-editor-fields>label{display:grid;gap:5px}.lv-compound-editor-fields textarea{min-height:70px}.lv-compound-condition-fields{display:grid;gap:12px}.lv-compound-condition-fields label{display:grid;gap:5px}.lv-compound-condition-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}`}</style>
  {props.tab==='Create'&&props.allowCreate&&<button type="button" onClick={()=>start()}>Add condition</button>}
  {preparing&&<div><p role="status">Preparing the current live regular-session source…</p><button type="button" onClick={cancel}>Cancel preparing condition</button></div>}
  {props.tab==='Alerts'&&<>{rowModels.length>0&&<p>{rowModels.length} all-conditions alert{rowModels.length===1?'':'s'} match these filters.</p>}{rowModels.map(row=><CompoundManagerRow key={row.pin.id} row={row} onEdit={expected=>{try{if(active())start(currentEntry(props.controller,expected));}catch(value){report(value);}}} onLifecycle={lifecycle} onDelete={expected=>{if(active()){cancelPendingLifecycle();setDeleting(expected);}}}/>)}</>}
  {props.tab==='History'&&<CompoundAlertHistory controller={props.controller} choices={historyChoices}/>}
  {lifecyclePending&&shownLifecycle&&<div><p role="status">Preparing to {{pause:'pause',resume:'resume',rearm:'restart'}[shownLifecycle.kind]} this alert. The saved state is unchanged.</p><button type="button" onClick={cancelShownLifecycle}>Cancel pending alert action</button></div>}
  {notice&&<p role="status">{notice}</p>}{error&&!opened&&!deleting&&<p role="alert">{error}</p>}
  {opened?.phase==='add'&&<FirstAddedCondition session={opened} change={patch=>change({candidate:Object.freeze({...opened.candidate,...patch})})} onAdd={addFirst} onCancel={cancel} error={error}/>}
  {opened?.phase==='form'&&<Modal title={opened.editing?'Edit all-conditions alert':'Create all-conditions alert'} onClose={cancel} portal>
   <form className="lv-compound-editor-fields" onSubmit={event=>{event.preventDefault();event.stopPropagation();save();}}>
    <label>Alert name<input autoFocus aria-label="All-conditions alert name" maxLength={200} value={opened.name} onChange={event=>change({name:event.target.value})}/></label>
    <div style={{display:'contents'}} onClickCapture={cancelShownSave} onInputCapture={cancelShownSave} onChangeCapture={cancelShownSave}><CompoundConditionEditor conditions={opened.conditions} choices={opened.choices} owner={opened.owner} onError={message=>{if(active())setError(message);}} onChange={(next,expected)=>{const value=draft.current;if(!active()||!value||value.conditions!==expected)return false;value.owner.assertCurrent();replace({...value,conditions:next});return true;}}/></div>
    <label>Trigger<select aria-label="All-conditions alert frequency" value={opened.frequency} onChange={event=>change({frequency:event.target.value as CompoundFrequency})}>{[['only-once','Only once'],['once-per-bar','Once per bar'],['once-per-bar-close','Once per bar close'],['once-per-minute','Once per minute'],['every-time','Every time']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Expiration<input type="checkbox" aria-label="All-conditions expiration enabled" checked={opened.expiration} onChange={event=>change({expiration:event.target.checked})}/></label>
    {opened.expiration&&<><label>Expires on ({opened.expiry.zone})<input type="datetime-local" aria-label="All-conditions expiration" value={opened.expiry.value} onChange={event=>change({expiry:editAlertExpiry(opened.expiry,systemAlertClock().zone,event.target.value)})}/></label>{expiryOptions.length>1&&<label>Repeated time<select aria-label="All-conditions expiration occurrence" value={opened.expiry.choice??''} onChange={event=>change({expiry:event.target.value===''?{...opened.expiry,choice:null}:chooseAlertExpiry(opened.expiry,Number(event.target.value))})}><option value="">Choose an occurrence</option>{expiryOptions.map((instant,index)=><option key={instant} value={instant}>{index===0?'First':'Second'} occurrence</option>)}</select></label>}</>}
    <label>Message<textarea aria-label="All-conditions alert message" maxLength={4000} value={opened.message} onChange={event=>change({message:event.target.value})}/></label>
    <fieldset><legend>Notifications</legend><label>Show popup<input type="checkbox" aria-label="All-conditions popup" checked={opened.delivery.popup} onChange={event=>change({delivery:Object.freeze({...opened.delivery,popup:event.target.checked})})}/></label><label>Desktop notification<input type="checkbox" aria-label="All-conditions desktop notification" checked={opened.delivery.desktop} onChange={event=>change({delivery:Object.freeze({...opened.delivery,desktop:event.target.checked})})}/></label><label>Sound<select aria-label="All-conditions sound" value={opened.delivery.sound??''} onChange={event=>{const sound=event.target.value as AlertSoundId||null,{soundRepeat,...rest}=opened.delivery;change({delivery:Object.freeze({...rest,sound,...(sound&&soundRepeat?{soundRepeat}:{})})});}}><option value="">No sound</option>{ALERT_SOUNDS.map(sound=><option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>{/* Sound duration and the LV-local webhook, as single alerts. */}<label>Sound duration<select aria-label="All-conditions sound duration" disabled={!opened.delivery.sound} value={opened.delivery.soundRepeat??''} onChange={event=>{const {soundRepeat:_old,...rest}=opened.delivery,next=Number(event.target.value) as AlertSoundRepeat;change({delivery:Object.freeze({...rest,...(next?{soundRepeat:next}:{})})});}}><option value="">Once</option>{ALERT_SOUND_REPEAT_SECONDS.map(seconds=><option key={seconds} value={seconds}>{ALERT_SOUND_REPEAT_LABELS[seconds]}</option>)}</select></label><label>Webhook URL<input type="url" aria-label="All-conditions webhook URL" placeholder="http://127.0.0.1:8080/alert (optional)" maxLength={2048} value={opened.delivery.webhook??''} onChange={event=>{const {webhook:_old,...rest}=opened.delivery,url=event.target.value;change({delivery:Object.freeze({...rest,...(url?{webhook:url}:{})})});}}/></label>{opened.delivery.webhook!==undefined&&<p className="alert-note">{ALERT_WEBHOOK_LOCAL_ONLY}</p>}</fieldset>
    <p>Requires matching live regular-session data on an active Candles chart at the saved interval. Price fields and frozen primary SMA inputs only. Replay and background charts are not evaluated.</p>
    {savingSource&&<div><p role="status">Preparing the current live source before saving. The draft is retained.</p><button type="button" onClick={cancelShownSave}>Cancel pending save</button></div>}
    {(error||expiryError)&&<p role="alert">{error||expiryError}</p>}<div className="lv-compound-condition-actions"><button type="button" onClick={cancel}>Cancel</button><button type="submit">{opened.editing?'Apply all-conditions changes':'Create all-conditions alert'}</button></div>
   </form>
  </Modal>}
  {deleting&&<Modal title="Delete all-conditions alert" onClose={()=>setDeleting(null)} portal><p>Delete this all-conditions alert and its retained local history?</p>{error&&<p role="alert">{error}</p>}<button type="button" onClick={()=>setDeleting(null)}>Cancel</button><button type="button" onClick={remove}>Delete alert</button></Modal>}
 </section>;
}

/** Explicit bounded page. Older pages hold their captured nodes until the user
 * navigates again; market ticks never walk the historical offset. */
function CompoundAlertHistory({controller,choices}:{controller:CompoundAlertDialogController;choices:readonly{id:string;name:string}[]}){
 const [selected,setSelected]=useState(''),[page,setPage]=useState<{id:string;generation:object;offset:number;views:readonly CompoundNotificationView[]}|null>(null);
 const id=choices.find(row=>row.id===selected)?.id??choices[0]?.id,size=50;
 const read=(offset:number)=>{if(!id)return;const current=controller.book.entry(id);if(!current)return;let node=current.journal;const views:CompoundNotificationView[]=[];for(let index=0;node&&index<offset+size;index++,node=node.previous)if(index>=offset)views.push(compoundNotificationView(node.binding,node.item));setPage({id,generation:current.generation,offset,views:Object.freeze(views)});};
 let actual:CompoundBookEntry|null=id?controller.book.entry(id):null,views:readonly CompoundNotificationView[]=[];const total=actual?.journal?.size??0;
 const offset=page?.id===id&&page.generation===actual?.generation?page.offset:0;
 if(actual){if(offset>0&&page)views=page.views;else{const recent:CompoundNotificationView[]=[];let node=actual.journal;while(node&&recent.length<size){recent.push(compoundNotificationView(node.binding,node.item));node=node.previous;}views=recent;}}actual=null;
 return <section aria-label="All-conditions alert history"><h3>All-conditions history</h3>{!id?<p>No all-conditions alerts.</p>:<><label>Alert<select aria-label="All-conditions history alert" value={id} onChange={event=>{setSelected(event.target.value);setPage(null);}}>{choices.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><p>Recorded vectors retain the original declaration and delivery settings. Private live history cannot be exported or shared.</p>{!views.length?<p>No local all-conditions triggers recorded.</p>:<table><thead><tr><th>Time</th><th>Alert</th><th>Conditions</th><th>Message</th></tr></thead><tbody>{views.map(view=><tr key={view.id}><td>{new Date(view.at*1000).toLocaleString()}</td><td>{view.title}</td><td>{view.conditions.map((row,index)=><div key={index}>{row.label}: {row.value}</div>)}</td><td>{view.message}</td></tr>)}</tbody></table>}<button type="button" disabled={!offset} onClick={()=>read(Math.max(0,offset-size))}>Newer all-conditions events</button><button type="button" disabled={total<=offset+size} onClick={()=>read(offset+size)}>Older all-conditions events</button></>}</section>;
}
