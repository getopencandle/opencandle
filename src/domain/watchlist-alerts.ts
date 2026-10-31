import type {BarDataset,SessionBasis} from './types';
import {createLocalAlert,processAlertEvent,type AlertCondition,type AlertDefinition,type AlertFrequency,type AlertEvent,type AlertNotification,type LocalAlert} from './alerts';
import {parseInterval} from './intervals';
import {isMarketSymbol} from './symbol-math';
import {isFormingLiveDataset} from './live-provider';
import {marketKey,resolveWatchSource,type WatchBook,type WatchReference} from '../watchlists/model';
import {watchListById} from '../watchlists/membership';
import {renderAlertMessage} from './alert-message';
import {LV_DEFAULT_ALERT_DELIVERY,validateAlertWebhookUrl,type AlertDeliverySettings} from './alert-delivery';

/**
 * List alerts: one price or channel condition watched on every current member of a watchlist.
 * They are a separate collection (the workspace key `listAlerts`) and never AlertDefinition rows, so the saved local-alert
 * array, its validator and every existing alert consumer are unchanged. Everything here is pure and local behavior.
 *
 * Contract for callers: the datasets passed to evaluateListAlert are the closed view. Every bar given is treated as a completed bar.
 * Members join at their next completed bar after they are first seen, removed members stop at once, and Once only completes when
 * every current member has triggered. The default session is Regular. The caps are our own choice.
 */
/**
 * Closed view: list alerts only ever see completed bars. A probe says whether a dataset's last bar is still forming; the
 * default probe treats a zero-delay source whose last bar has not ended by its as-of time as forming. A live source
 * registers its own exact probe with registerFormingBarProbe. evaluateListAlert applies this itself, so the contract does not
 * depend on the caller remembering to.
 */
export type FormingBarProbe=(dataset:BarDataset)=>boolean;
const defaultFormingProbe:FormingBarProbe=dataset=>{
 const last=dataset.bars.at(-1);if(last&&isFormingLiveDataset(dataset))return true;
 if(!last||dataset.provenance.delaySeconds!==0)return false;
 let seconds:number|null=null;try{const spec=parseInterval(dataset.resolution);seconds=spec.seconds??(spec.unit==='day'?spec.multiplier*86400:spec.unit==='week'?spec.multiplier*604800:null);}catch{return false;}
 return seconds!==null&&last.time+seconds>dataset.provenance.asOf;
};
const formingProbes:FormingBarProbe[]=[defaultFormingProbe];
export function registerFormingBarProbe(probe:FormingBarProbe):()=>void{formingProbes.push(probe);return()=>{const at=formingProbes.indexOf(probe);if(at>=0)formingProbes.splice(at,1);};}
/** The dataset without a forming last bar. Returns the same object when nothing is forming. */
export function closedViewDataset(dataset:BarDataset):BarDataset{return dataset.bars.length&&formingProbes.some(probe=>probe(dataset))?{...dataset,bars:dataset.bars.slice(0,-1)}:dataset;}
/** Closed view of a whole catalog. Returns the same array when no dataset has a forming bar, so callers can keep identity checks. */
export function closedViewDatasets(datasets:readonly BarDataset[]):readonly BarDataset[]{const next=datasets.map(closedViewDataset);return next.every((row,index)=>row===datasets[index])?datasets:next;}
export const LIST_ALERT_LIMITS=Object.freeze({alerts:20,members:500,history:10000,name:200,message:4000,bytes:8*1024*1024});
/** Moving up and Moving down (price or percent over N bars), so a list alert takes
 * every condition a chart price alert takes. Position and Fib level crossings belong to one drawing and stay chart-only. */
export const LIST_ALERT_CONDITION_KINDS=['crossing','crossing-up','crossing-down','greater','less','inside','outside','entering','exiting','moving-up','moving-down'] as const;
const MOVING_KINDS:readonly string[]=['moving-up','moving-down'];
export const LIST_ALERT_FREQUENCIES:readonly AlertFrequency[]=['only-once','once-per-bar','once-per-bar-close','once-per-minute','every-time'];
export type ListAlertSession='regular'|'extended';
export type ListAlertStatus='active'|'paused'|'completed'|'stopped'|'expired';
export type ListAlertMemberStatus='waiting-for-data'|'active'|'triggered';
export interface ListAlertMember {key:string;status:ListAlertMemberStatus;reason:string;baselineTime:number|null;lastTime:number|null;lastSequence:number|null;lastValue:number|null;closedLast:{id:string;value:number}|null;previousClosedValue:number|null;currentBarId:string|null;lastTriggeredBar:string|null;lastTriggeredAt:number|null;triggers:number}
export interface ListAlertTrigger {memberKey:string;time:number;value:number;barId:string;sequence:number}
export interface ListAlert {schemaVersion:1;id:string;listId:string;name:string;message:string;condition:AlertCondition;frequency:AlertFrequency;session:ListAlertSession;createdAt:number;expiresAt:number|null;status:ListAlertStatus;statusReason:string|null;members:ListAlertMember[];history:ListAlertTrigger[];
 /** Optional LV-local webhook URL (validateAlertWebhookUrl). Absent: no webhook. */ webhook?:string}
export interface ListAlertInput {id:string;listId:string;name:string;message:string;condition:AlertCondition;frequency:AlertFrequency;session:ListAlertSession;createdAt:number;expiresAt:number|null;webhook?:string}
export interface ListAlertNotification {id:string;alertId:string;memberKey:string;name:string;message:string;value:number;at:number;barId:string;sequence:number}
export interface ListAlertMemberResult {key:string;status:ListAlertMemberStatus;reason:string;triggers:number;triggeredNow:boolean}
export interface ListAlertEvaluation {alert:ListAlert;members:ListAlertMemberResult[];notifications:ListAlertNotification[];diagnostics:string[]}

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f]/.test(value);
const MEMBER_TICKER_KEY=/^[A-Z0-9._-]{1,80}:[A-Z0-9.^_-]{1,24}$/;
/** A member key is EXCHANGE:TICKER, or DERIVED:<canonical expression> for a derived row. */
const MEMBER_KEY={test:(key:string)=>MEMBER_TICKER_KEY.test(key)||key.startsWith('DERIVED:')&&isMarketSymbol(key.slice(8),'DERIVED')};
const ALERT_KEYS=['schemaVersion','id','listId','name','message','condition','frequency','session','createdAt','expiresAt','status','statusReason','members','history'];
const MEMBER_KEYS=['key','status','reason','baselineTime','lastTime','lastSequence','lastValue','closedLast','previousClosedValue','currentBarId','lastTriggeredBar','lastTriggeredAt','triggers'];
const TRIGGER_KEYS=['memberKey','time','value','barId','sequence'];
const sameKeys=(value:Record<string,unknown>,keys:readonly string[])=>{const own=Object.keys(value);return own.length===keys.length&&keys.every(key=>Object.hasOwn(value,key));};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);

/** Session gate. Returns null when the source can be evaluated, otherwise the reason shown on the member. */
export function listAlertSessionEligibility(session:ListAlertSession,basis:SessionBasis):string|null{
 if(session==='regular')return basis==='regular'||basis==='all'?null:'This source does not separate regular-session bars.';
 return basis==='extended'||basis==='all'?null:'This source does not declare extended-session bars.';
}
function freshMember(key:string,triggers=0):ListAlertMember{return{key,status:'waiting-for-data',reason:'Waiting for data.',baselineTime:null,lastTime:null,lastSequence:null,lastValue:null,closedLast:null,previousClosedValue:null,currentBarId:null,lastTriggeredBar:null,lastTriggeredAt:null,triggers};}

/** Price, channel and moving kinds are allowed. The existing local-alert validator checks the numbers. */
function normalizeCondition(input:unknown):AlertCondition{
 if(!record(input)||!(LIST_ALERT_CONDITION_KINDS as readonly unknown[]).includes(input.kind))throw new Error('A list alert supports price, channel and moving conditions only.');
 const channel=['inside','outside','entering','exiting'].includes(input.kind as string),moving=MOVING_KINDS.includes(input.kind as string),keys=channel?['kind','lower','upper']:moving?['kind','amount','bars','percent']:['kind','value'];
 if(!sameKeys(input,keys))throw new Error('Invalid list alert condition fields.');
 const kind=input.kind as AlertCondition['kind'];
 if(moving){if(typeof input.percent!=='boolean')throw new Error('Invalid list alert condition fields.');const condition:AlertCondition={kind,amount:input.amount as number,bars:input.bars as number,percent:input.percent};transient({id:'check',instrumentId:'CHECK:ALERT',sourceId:'close',name:'check',message:'',condition,frequency:'every-time',createdAt:0,expiresAt:null,mode:'ordinary',runId:'ordinary:check',conditionVersion:2});return condition;}
 const condition:AlertCondition=channel?{kind,lower:input.lower as number,upper:input.upper as number}:{kind,value:input.value as number};
 if(channel?!finite(condition.lower)||!finite(condition.upper):!finite(condition.value))throw new Error('Alert level must be finite.');
 transient({id:'check',instrumentId:'CHECK:ALERT',sourceId:'close',name:'check',message:'',condition,frequency:'every-time',createdAt:0,expiresAt:null,mode:'ordinary',runId:'ordinary:check',conditionVersion:2});
 return condition;
}
function transient(definition:AlertDefinition):LocalAlert{return createLocalAlert(definition);}
function validateInput(input:ListAlertInput):ListAlertInput{
 if(!record(input)||!text(input.id,200)||!text(input.listId,200)||!text(input.name,LIST_ALERT_LIMITS.name)||!input.name.trim()||typeof input.message!=='string'||input.message.length>LIST_ALERT_LIMITS.message)throw new Error('Enter a list alert name and message within the limits.');
 if(!LIST_ALERT_FREQUENCIES.includes(input.frequency))throw new Error('Unsupported alert frequency.');
 if(input.session!=='regular'&&input.session!=='extended')throw new Error('Choose Regular or Extended sessions.');
 if(!Number.isSafeInteger(input.createdAt)||input.createdAt<0||input.expiresAt!==null&&(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=input.createdAt))throw new Error('Alert expiration must be later than its creation time.');
 if(input.webhook!==undefined)validateAlertWebhookUrl(input.webhook);
 return{id:input.id,listId:input.listId,name:input.name,message:input.message,condition:normalizeCondition(input.condition),frequency:input.frequency,session:input.session,createdAt:input.createdAt,expiresAt:input.expiresAt,...(input.webhook!==undefined?{webhook:input.webhook}:{})};
}
/** The delivery settings a list alert's triggers use: LV defaults (popup, desktop, chime) plus its own webhook. */
export function listAlertDelivery(alert:Pick<ListAlert,'webhook'>|undefined):AlertDeliverySettings{return alert?.webhook?{...LV_DEFAULT_ALERT_DELIVERY,webhook:alert.webhook}:{...LV_DEFAULT_ALERT_DELIVERY};}

/** Creates the alert and records each current member's baseline bar. Refuses, with a message, past 500 members or 20 list alerts. */
export function createListAlert(input:ListAlertInput,existing:readonly ListAlert[],book:WatchBook,datasets:readonly BarDataset[]):ListAlert{
 const spec=validateInput(input);
 if(existing.length>=LIST_ALERT_LIMITS.alerts)throw new Error('A workspace holds at most 20 list alerts. Remove one before creating another.');
 if(existing.some(row=>row.id===spec.id))throw new Error('A list alert with this identity already exists.');
 const list=watchListById(book,spec.listId),count=new Set(list.rows.flatMap(row=>row.kind==='symbol'?[marketKey(row.reference)]:[])).size;
 if(count>LIST_ALERT_LIMITS.members)throw new Error('A list alert evaluates at most 500 symbols. This list has '+count+'.');
 const alert:ListAlert={schemaVersion:1,...spec,status:'active',statusReason:null,members:[],history:[]};
 return evaluateListAlert(alert,book,datasets).alert;
}
/** Pausing keeps history. Resuming starts every unfinished member from a fresh baseline, so a gap never invents a trigger. */
export function setListAlertPaused(alert:ListAlert,paused:boolean):ListAlert{
 if(!['active','paused'].includes(alert.status))return alert;
 const next=structuredClone(alert);next.status=paused?'paused':'active';next.statusReason=null;
 next.members=next.members.map(member=>member.status==='triggered'?member:freshMember(member.key,member.triggers));return next;
}

/** `messages` runs parallel to `triggers`: each trigger's message with its placeholders filled from the member's own bar. */
interface Sink {triggers:ListAlertTrigger[];messages:string[];expired:boolean;diagnostics:string[]}
function baseline(state:ListAlertMember,time:number,close:number):ListAlertMember{return{...state,status:'active',reason:'',baselineTime:time,lastTime:time,lastSequence:null,lastValue:close,closedLast:{id:String(time),value:close},previousClosedValue:null,currentBarId:String(time),lastTriggeredBar:null,lastTriggeredAt:null};}
function stepMember(alert:ListAlert,state:ListAlertMember,reference:WatchReference,datasets:readonly BarDataset[],sink:Sink):ListAlertMember{
 if(state.status==='triggered')return state;
 const wait=(reason:string):ListAlertMember=>({...freshMember(state.key,state.triggers),reason});
 const resolved=resolveWatchSource(reference,datasets),dataset=resolved&&closedViewDataset(resolved);
 if(!dataset)return wait(reference.datasetId===null?'No exact source is bound to this symbol.':'The bound source is not loaded.');
 if(!dataset.bars.length)return wait('The source has no bars.');
 if(dataset.provenance.state!=='ready')return wait('The source data is not ready.');
 const blocked=listAlertSessionEligibility(alert.session,dataset.provenance.session);if(blocked)return wait(blocked);
 const last=dataset.bars.at(-1)!;if(!finite(last.close)||!Number.isSafeInteger(last.time))return wait('The source has no usable close.');
 if(state.baselineTime===null||state.lastTime===null)return baseline(state,last.time,last.close);
 if(last.time<state.lastTime){sink.diagnostics.push(state.key+': the source now ends before the last evaluated bar; evaluation restarts from its latest bar.');return baseline(state,last.time,last.close);}
 const pending=dataset.bars.filter(bar=>bar.time>state.lastTime!&&finite(bar.close)&&Number.isSafeInteger(bar.time));
 if(!pending.length)return state;
 // A transient LocalAlert reuses the existing condition, frequency and baseline semantics. It is never stored or listed.
 let local=transient({id:alert.id+':'+state.key,instrumentId:state.key,sourceId:'close',name:alert.name,message:alert.message,condition:alert.condition,frequency:alert.frequency,createdAt:0,expiresAt:alert.expiresAt,mode:'ordinary',runId:'ordinary:list:'+alert.id,conditionVersion:2});
 local.armedAt=0;local.lastSequence=state.lastSequence;local.lastTime=state.lastTime;local.lastValue=state.lastValue;local.previousClosedValue=state.previousClosedValue;local.currentBarId=state.currentBarId;local.closedBars=state.closedLast?[{...state.closedLast}]:[];local.lastTriggeredBar=state.lastTriggeredBar;local.lastTriggeredAt=state.lastTriggeredAt;
 // A moving condition compares with the close N completed bars earlier. Those closes are read from the member's
 // own closed-view source (bars up to the last evaluated one, history before creation included, as a chart series would), so the
 // saved member state keeps its exact shape. Fewer bars than N means no trigger; no bar is ever invented.
 if(MOVING_KINDS.includes(alert.condition.kind)){const need=alert.condition.bars??1,seed:{id:string;value:number}[]=[];for(let index=dataset.bars.length-1;index>=0&&seed.length<need;index--){const bar=dataset.bars[index];if(bar.time<=state.lastTime&&finite(bar.close)&&Number.isSafeInteger(bar.time))seed.unshift({id:String(bar.time),value:bar.close});}local.closedBars=seed;}
 let triggers=state.triggers,status:ListAlertMemberStatus='active';
 for(const bar of pending){
  const event:AlertEvent={instrumentId:state.key,sourceId:'close',value:bar.close,time:bar.time,availableAt:bar.time,sequence:(local.lastSequence??0)+1,barId:String(bar.time),barClosed:true,feedState:'ready',mode:'ordinary',runId:'ordinary:list:'+alert.id};
  const result=processAlertEvent(local,event);local=result.alert;
  if(result.notification){triggers++;sink.triggers.push({memberKey:state.key,time:bar.time,value:bar.close,barId:event.barId,sequence:event.sequence});sink.messages.push(listAlertMessage(alert.message,reference,dataset.resolution,bar));local.history=[];}
  if(local.status==='expired'){sink.expired=true;break;}
  if(local.status==='stopped'){status='triggered';break;}
 }
 return{key:state.key,status,reason:'',baselineTime:state.baselineTime,lastTime:local.lastTime,lastSequence:local.lastSequence,lastValue:local.lastValue,closedLast:local.closedBars.at(-1)?{...local.closedBars.at(-1)!}:null,previousClosedValue:local.previousClosedValue,currentBarId:local.currentBarId,lastTriggeredBar:local.lastTriggeredBar,lastTriggeredAt:local.lastTriggeredAt,triggers};
}

/**
 * List alert messages take the same placeholders as other local alerts (catalog in alert-message.ts).
 * {{ticker}} and {{exchange}} are the triggering member, {{interval}} its source resolution, {{open}} to {{volume}} and {{time}} its
 * completed bar. {{timenow}} stays as typed: evaluation is pure and has no trigger clock.
 */
export function listAlertMessage(template:string,reference:Pick<WatchReference,'symbol'|'exchange'>,interval:string,bar:{time:number;open:number;high:number;low:number;close:number;volume?:number}):string{
 return renderAlertMessage(template,{ticker:reference.symbol,exchange:reference.exchange,interval,bar,triggeredAt:Number.NaN});
}
/**
 * Restart a completed, expired or stopped list alert. Every member starts again from a fresh baseline at its
 * next completed bar, so no trigger is invented for the gap; trigger counts and saved history are kept. An expired alert restarts
 * open-ended (the button says so), matching Restart in the Alerts panel. An alert whose list was deleted cannot restart.
 */
export function restartListAlert(alert:ListAlert,book:WatchBook):ListAlert{
 if(!['completed','expired','stopped'].includes(alert.status))throw new Error('Only a completed, expired or stopped list alert can be restarted.');
 try{watchListById(book,alert.listId);}catch{throw new Error('The list this alert watched was deleted. Create a new list alert.');}
 const next=structuredClone(alert);next.status='active';next.statusReason=null;if(alert.status==='expired')next.expiresAt=null;
 next.members=next.members.map(member=>freshMember(member.key,member.triggers));return next;
}
/** Clear log for list alerts. Every alert keeps its members and state; only the saved trigger history goes. */
export function clearListAlertHistory(alerts:readonly ListAlert[]):ListAlert[]{return alerts.map(alert=>alert.history.length?{...alert,history:[]}:alert);}
/** Evaluate every current member independently. Pure: the input alert is never changed. */
export function evaluateListAlert(alert:ListAlert,book:WatchBook,datasets:readonly BarDataset[]):ListAlertEvaluation{
 const out=structuredClone(alert),diagnostics:string[]=[],sink:Sink={triggers:[],messages:[],expired:false,diagnostics};
 const finish=(notifications:ListAlertNotification[]=[],now:Set<string>=new Set()):ListAlertEvaluation=>({alert:out,notifications,diagnostics:[...new Set(diagnostics)],members:out.members.map(member=>({key:member.key,status:member.status,reason:member.reason,triggers:member.triggers,triggeredNow:now.has(member.key)}))});
 if(out.status!=='active')return finish();
 let list;try{list=watchListById(book,out.listId);}catch{out.status='stopped';out.statusReason='The list was deleted';return finish();}
 const references=new Map<string,WatchReference>();for(const row of list.rows)if(row.kind==='symbol'&&!references.has(marketKey(row.reference)))references.set(marketKey(row.reference),row.reference);
 let keys=[...references.keys()];if(keys.length>LIST_ALERT_LIMITS.members){keys=keys.slice(0,LIST_ALERT_LIMITS.members);diagnostics.push('Only the first 500 symbols of this list are evaluated.');}
 const previous=new Map(out.members.map(member=>[member.key,member]));
 const members:ListAlertMember[]=[];
 for(const key of keys){if(sink.expired){members.push(previous.get(key)??freshMember(key));continue;}members.push(stepMember(out,previous.get(key)??freshMember(key),references.get(key)!,datasets,sink));}
 out.members=members;
 const notifications:ListAlertNotification[]=[],now=new Set<string>(),room=LIST_ALERT_LIMITS.history-out.history.length;
 sink.triggers.forEach((trigger,index)=>{notifications.push({id:out.id+':'+trigger.memberKey+':'+trigger.sequence+':'+trigger.time,alertId:out.id,memberKey:trigger.memberKey,name:out.name,message:sink.messages[index]??out.message,value:trigger.value,at:trigger.time,barId:trigger.barId,sequence:trigger.sequence});now.add(trigger.memberKey);if(index<room)out.history.push(trigger);});
 if(sink.triggers.length>room){out.status='paused';out.statusReason='The alert history reached its limit. Earlier history was kept; remove saved history before resuming.';diagnostics.push(out.statusReason);}
 else if(sink.expired){out.status='expired';out.statusReason='The alert expired';}
 else if(out.frequency==='only-once'&&members.length>0&&members.every(member=>member.status==='triggered')){out.status='completed';out.statusReason='Every symbol in the list has triggered';}
 return finish(notifications,now);
}

function plain(value:unknown,depth=0,counter={nodes:0}):void{
 if(++counter.nodes>400000||depth>8)throw new Error('List alert state exceeds structural limits.');
 if(value===null||typeof value==='boolean')return;if(typeof value==='string'){if(value.length>100000)throw new Error('List alert text exceeds limits.');return;}
 if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('List alert numbers must be finite.');return;}
 if(typeof value!=='object')throw new Error('List alerts hold plain JSON values only.');
 const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new Error('List alerts hold plain JSON values only.');
 const keys=Reflect.ownKeys(value);if(array&&keys.length!==value.length+1)throw new Error('List alert arrays cannot be sparse.');
 for(const key of keys){if(typeof key!=='string')throw new Error('List alerts hold plain JSON values only.');if(array&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!descriptor.enumerable||!('value' in descriptor)||['__proto__','prototype','constructor'].includes(key))throw new Error('List alerts hold plain JSON values only.');plain(descriptor.value,depth+1,counter);}
}
function checkMember(member:unknown):ListAlertMember{
 if(!record(member)||!sameKeys(member,MEMBER_KEYS))throw new Error('Invalid list alert member fields.');
 const nullableNumber=(v:unknown)=>v===null||finite(v),nullableTime=(v:unknown)=>v===null||Number.isSafeInteger(v),nullableText=(v:unknown)=>v===null||text(v,200);
 const closed=member.closedLast;
 if(typeof member.key!=='string'||!MEMBER_KEY.test(member.key)||!['waiting-for-data','active','triggered'].includes(member.status as string)||typeof member.reason!=='string'||member.reason.length>300||!nullableTime(member.baselineTime)||!nullableTime(member.lastTime)||!nullableTime(member.lastSequence)||!nullableNumber(member.lastValue)||!nullableNumber(member.previousClosedValue)||!nullableText(member.currentBarId)||!nullableText(member.lastTriggeredBar)||!nullableTime(member.lastTriggeredAt)||!Number.isSafeInteger(member.triggers)||(member.triggers as number)<0)throw new Error('Invalid list alert member state.');
 if(closed!==null&&(!record(closed)||!sameKeys(closed,['id','value'])||!text(closed.id,200)||!finite(closed.value)))throw new Error('Invalid list alert member baseline.');
 return structuredClone(member) as unknown as ListAlertMember;
}
function checkAlert(row:unknown):ListAlert{
 if(!record(row)||!sameKeys(row,Object.hasOwn(row,'webhook')?[...ALERT_KEYS,'webhook']:ALERT_KEYS)||row.schemaVersion!==1)throw new Error('Invalid list alert fields.');
 const spec=validateInput({id:row.id,listId:row.listId,name:row.name,message:row.message,condition:row.condition,frequency:row.frequency,session:row.session,createdAt:row.createdAt,expiresAt:row.expiresAt,...(Object.hasOwn(row,'webhook')?{webhook:row.webhook}:{})} as ListAlertInput);
 if(!['active','paused','completed','stopped','expired'].includes(row.status as string)||row.statusReason!==null&&!text(row.statusReason,300))throw new Error('Invalid list alert status.');
 if(!Array.isArray(row.members)||row.members.length>LIST_ALERT_LIMITS.members||!Array.isArray(row.history)||row.history.length>LIST_ALERT_LIMITS.history)throw new Error('List alert members or history exceed their limits.');
 const members=row.members.map(checkMember);if(new Set(members.map(member=>member.key)).size!==members.length)throw new Error('Duplicate list alert member.');
 const history=row.history.map((trigger:unknown)=>{if(!record(trigger)||!sameKeys(trigger,TRIGGER_KEYS)||typeof trigger.memberKey!=='string'||!MEMBER_KEY.test(trigger.memberKey)||!Number.isSafeInteger(trigger.time)||!finite(trigger.value)||!text(trigger.barId,200)||!Number.isSafeInteger(trigger.sequence))throw new Error('Invalid list alert history entry.');return structuredClone(trigger) as unknown as ListAlertTrigger;});
 return{schemaVersion:1,...spec,status:row.status as ListAlertStatus,statusReason:row.statusReason as string|null,members,history};
}
export interface ListAlertsValidation {ok:boolean;alerts?:ListAlert[];errors:string[]}
/** Exact-key validation for the optional `listAlerts` workspace collection (at most 20 alerts, 500 members each). */
export function validateListAlerts(input:unknown):ListAlertsValidation{
 try{
  plain(input);if(!Array.isArray(input)||input.length>LIST_ALERT_LIMITS.alerts)throw new Error('Expected at most 20 list alerts.');
  if(new TextEncoder().encode(JSON.stringify(input)).length>LIST_ALERT_LIMITS.bytes)throw new Error('List alerts exceed their byte limit.');
  const alerts=input.map(checkAlert);if(new Set(alerts.map(row=>row.id)).size!==alerts.length)throw new Error('Duplicate list alert identity.');
  return{ok:true,alerts,errors:[]};
 }catch(cause){return{ok:false,errors:[cause instanceof Error?cause.message:String(cause)]};}
}
export function restoreListAlerts(input:unknown):ListAlert[]{const result=validateListAlerts(input);if(!result.ok||!result.alerts)throw new Error(result.errors.join(' '));return result.alerts;}
/** Counts for a manager row: how many members wait, run or have finished. */
export function listAlertMemberCounts(alert:ListAlert){return{total:alert.members.length,waiting:alert.members.filter(row=>row.status==='waiting-for-data').length,active:alert.members.filter(row=>row.status==='active').length,triggered:alert.members.filter(row=>row.status==='triggered').length};}
/** Raw dialog fields. Numbers arrive as text, the expiry as a UTC date-time "YYYY-MM-DDTHH:mm" (blank means none).
 * Kind may also be moving-up, moving-down, moving-up-percent or moving-down-percent, with `amount` (the movement)
 * and `bars` (how many bars back); both are optional so forms built before these kinds existed stay valid. */
export interface ListAlertForm {listId:string;name:string;message:string;kind:string;value:string;lower:string;upper:string;amount?:string;bars?:string;frequency:string;session:string;expires:string;
 /** Optional webhook URL; blank means none. */ webhook?:string}
const FORM_NUMBER=/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
function formNumber(raw:string,label:string):number{const trimmed=typeof raw==='string'?raw.trim():'';if(!FORM_NUMBER.test(trimmed)||!Number.isFinite(Number(trimmed)))throw new Error('Enter a number for '+label+'.');return Number(trimmed);}
/** Dialog fields to a creation request. Throws a message the dialog can show; nothing is created here. */
export function listAlertFromForm(form:ListAlertForm,id:string,now:number):ListAlertInput{
 const channel=['inside','outside','entering','exiting'].includes(form.kind),movingKind=/^moving-(up|down)(-percent)?$/.exec(form.kind);
 const bars=movingKind?formNumber(form.bars??'','the bar count'):0;if(movingKind&&!Number.isSafeInteger(bars))throw new Error('Enter a whole number of bars, from 1 to 10000.');
 const condition=movingKind?{kind:'moving-'+movingKind[1],amount:formNumber(form.amount??'','the movement'),bars,percent:!!movingKind[2]}:channel?{kind:form.kind,lower:formNumber(form.lower,'the lower bound'),upper:formNumber(form.upper,'the upper bound')}:{kind:form.kind,value:formNumber(form.value,'the level')};
 let expiresAt:number|null=null;if(form.expires.trim()){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.expires.trim()))throw new Error('Enter the expiry as YYYY-MM-DDTHH:mm in UTC, or leave it blank.');const parsed=Date.parse(form.expires.trim()+':00Z');if(!Number.isFinite(parsed))throw new Error('Enter a real expiry date.');expiresAt=Math.floor(parsed/1000);}
 const webhook=(form.webhook??'').trim();
 return validateInput({id,listId:form.listId,name:form.name.trim(),message:form.message,condition:condition as AlertCondition,frequency:form.frequency as AlertFrequency,session:form.session as ListAlertSession,createdAt:now,expiresAt,...(webhook?{webhook}:{})});
}
/** The dialog fields of a saved list alert, for editing it in place. */
export function listAlertToForm(alert:ListAlert):ListAlertForm{
 const channel=['inside','outside','entering','exiting'].includes(alert.condition.kind),number=(value:number|undefined)=>value===undefined?'':String(value);
 const expires=alert.expiresAt===null?'':new Date(alert.expiresAt*1000).toISOString().slice(0,16);
 const moving=MOVING_KINDS.includes(alert.condition.kind),kind=moving&&alert.condition.percent?alert.condition.kind+'-percent':alert.condition.kind;
 return{listId:alert.listId,name:alert.name,message:alert.message,kind,value:channel||moving?'':number(alert.condition.value),lower:channel?number(alert.condition.lower):'',upper:channel?number(alert.condition.upper):'',amount:moving?number(alert.condition.amount):'',bars:moving?number(alert.condition.bars):'',frequency:alert.frequency,session:alert.session,expires,...(alert.webhook?{webhook:alert.webhook}:{})};
}
/**
 * Save an edit to a list alert in place. Its identity, list, creation time,
 * trigger history and per-symbol trigger counts are kept. A new name, message or expiry keeps every symbol's running state. A
 * new condition, frequency or session restarts every symbol from a fresh baseline at its next completed bar, so the change
 * never reports a crossing for bars evaluated under the old condition. An expiry must be later than `now`. A completed,
 * stopped or expired alert that is saved runs again (as Restart does); a paused one stays paused. The list must still exist.
 */
export function editListAlert(alert:ListAlert,form:ListAlertForm,book:WatchBook,now:number):ListAlert{
 const spec=listAlertFromForm({...form,listId:alert.listId},alert.id,alert.createdAt);
 if(spec.expiresAt!==null&&spec.expiresAt<=now)throw new Error('The expiry is already past. Choose a later time or leave it blank.');
 try{watchListById(book,alert.listId);}catch{throw new Error('The list this alert watched was deleted. Create a new list alert.');}
 const next=structuredClone(alert);
 const restart=JSON.stringify(spec.condition)!==JSON.stringify(alert.condition)||spec.frequency!==alert.frequency||spec.session!==alert.session;
 next.name=spec.name;next.message=spec.message;next.condition=spec.condition;next.frequency=spec.frequency;next.session=spec.session;next.expiresAt=spec.expiresAt;if(spec.webhook)next.webhook=spec.webhook;else delete next.webhook;
 const finished=['completed','stopped','expired'].includes(alert.status);
 if(finished){next.status='active';next.statusReason=null;}
 if(restart||finished)next.members=next.members.map(member=>freshMember(member.key,member.triggers));
 return next;
}
export interface ListAlertsBatch {alerts:ListAlert[];notifications:ListAlertNotification[];diagnostics:string[];changed:boolean}
/** Evaluate the whole collection. Returns the same array when nothing changed, so a caller publishes only real changes. */
export function evaluateListAlerts(alerts:readonly ListAlert[],book:WatchBook,datasets:readonly BarDataset[]):ListAlertsBatch{
 const notifications:ListAlertNotification[]=[],diagnostics:string[]=[];let changed=false;
 const next=alerts.map(alert=>{const result=evaluateListAlert(alert,book,datasets);notifications.push(...result.notifications);diagnostics.push(...result.diagnostics);if(JSON.stringify(result.alert)===JSON.stringify(alert))return alert;changed=true;return result.alert;});
 return{alerts:changed?next:alerts as ListAlert[],notifications,diagnostics:[...new Set(diagnostics)],changed};
}
/** One manager row: the alert name, the list it watches and how many symbols wait, run or have triggered. */
export function listAlertSummary(alert:ListAlert,book:WatchBook){
 let listName='Deleted list';try{listName=watchListById(book,alert.listId).name;}catch{/* deleted lists keep their id and say so */}
 return{id:alert.id,name:alert.name,listName,status:alert.status,statusReason:alert.statusReason,...listAlertMemberCounts(alert)};
}
/** The notification shape the existing delivery pipeline (sound, message toast) already takes. It is never stored in the local alert history. */
export function listAlertNotificationToLocal(notification:ListAlertNotification):AlertNotification{return{id:notification.id,alertId:notification.alertId,name:notification.name+' ('+notification.memberKey+')',message:notification.message,value:notification.value,at:notification.at,barId:notification.barId,sequence:notification.sequence,mode:'ordinary',runId:'ordinary:list:'+notification.alertId,local:true};}
