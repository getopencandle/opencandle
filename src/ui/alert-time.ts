import {chartDateTimeInputValue,formatChartDateTime,chartZoneOffsetText,parseChartDateTimeInput,type ChartClockHours} from './chart-time-text';
import {zoneOffsetAt} from '../chart/bottom-toolbar';

/** Manager/log timezone follows the OS by default. CSV remains UTC.
 * Expiry editing zone, strict gap refusal and explicit fold choice are original LV policies. */
export interface AlertClock {zone:string;hours:ChartClockHours}
/** The alert dialog, manager and log show times in the chart timezone, the same
 * zone the Alerts panel lists them in. App sets it from the shown chart timezone; null returns to the OS zone. Note: this
 * overrides the OS-zone default above, so entry and listing agree. */
let displayClock:AlertClock|null=null;
export function setAlertDisplayClock(next:{zone:string;hours?:ChartClockHours}|null):void{
 if(!next){displayClock=null;return;}
 try{new Intl.DateTimeFormat('en-US',{timeZone:next.zone});}catch{displayClock=null;return;}
 displayClock=Object.freeze({zone:next.zone,hours:next.hours==='12'?'12':'24'});
}
export function alertDisplayClockActive():boolean{return displayClock!==null;}
export function systemAlertClock():AlertClock{
 if(displayClock)return displayClock;
 try{const options=new Intl.DateTimeFormat(undefined,{hour:'numeric'}).resolvedOptions();return{zone:options.timeZone||'UTC',hours:options.hourCycle==='h11'||options.hourCycle==='h12'?'12':'24'};}catch{return{zone:'UTC',hours:'24'};}
}
export const formatAlertTime=(seconds:number,clock:AlertClock)=>formatChartDateTime(seconds,clock.zone,{hours:clock.hours,seconds:true});
/** Natural OS-locale speech text for a history row. One date/time, explicit current zone/hour cycle,
 * and its offset distinguish DST folds. Visible sortable timestamps retain formatAlertTime. */
export function formatAlertAccessibleTime(seconds:number,clock:AlertClock):string{
 const instant=new Date(seconds*1000);if(!Number.isFinite(instant.getTime()))return String(seconds);
 let zone=typeof clock.zone==='string'&&clock.zone.length?clock.zone:'UTC';const hourCycle=clock.hours==='12'?'h12':'h23';let natural:string;
 try{natural=instant.toLocaleString(undefined,{timeZone:zone,hourCycle});}
 catch{zone='UTC';natural=instant.toLocaleString(undefined,{timeZone:zone,hourCycle});}
 return `${natural} (${zone}, ${chartZoneOffsetText(seconds,zone)})`;
}

export interface AlertExpiryDraft {original:number|null;value:string;zone:string;edited:boolean;choice:number|null}
export function alertExpiryFromInstant(instant:number,zone:string):AlertExpiryDraft{
 if(!Number.isSafeInteger(instant)||!chartDateTimeInputValue(instant,zone))throw Error('The saved expiration time is unavailable.');
 return{original:instant,value:chartDateTimeInputValue(instant,zone),zone,edited:false,choice:null};
}
/** Untouched instants are redisplayed in the current OS zone, including their original seconds and fold occurrence. */
export function alertExpiryView(draft:AlertExpiryDraft,systemZone:string):AlertExpiryDraft{
 return draft.edited?draft:alertExpiryFromInstant(draft.original!,systemZone);
}
/** Once edited, wall text stays in the clearly labelled zone where it was entered if the OS zone changes. */
export function editAlertExpiry(draft:AlertExpiryDraft,systemZone:string,value:string):AlertExpiryDraft{
 return{...alertExpiryView(draft,systemZone),value,edited:true,choice:null};
}
export function alertExpiryForText(value:string,zone:string):AlertExpiryDraft{return{original:null,value,zone,edited:true,choice:null};}
/** Reuse strict calendar/gap validation; then enumerate actual offsets to expose repeated wall times explicitly. */
export function alertExpiryCandidates(value:string,zone:string):number[]{
 const first=parseChartDateTimeInput(value,zone),wall=Date.parse(value+'Z'),solutions=new Set([first]);
 for(const delta of [-172800000,-86400000,0,86400000,172800000]){
  const offset=zoneOffsetAt(wall+delta,zone);if(offset===null)continue;const candidate=(wall-offset*60000)/1000;
  if(Number.isSafeInteger(candidate)&&chartDateTimeInputValue(candidate,zone)===value)solutions.add(candidate);
 }
 return[...solutions].sort((a,b)=>a-b);
}
export function chooseAlertExpiry(draft:AlertExpiryDraft,choice:number):AlertExpiryDraft{
 if(!draft.edited||!alertExpiryCandidates(draft.value,draft.zone).includes(choice))throw Error('Choose an occurrence of the displayed expiration time.');
 return{...draft,choice};
}
export function resolveAlertExpiry(draft:AlertExpiryDraft):number{
 if(!draft.edited){if(!Number.isSafeInteger(draft.original))throw Error('The saved expiration time is unavailable.');return draft.original!;}
 const candidates=alertExpiryCandidates(draft.value,draft.zone);if(candidates.length===1)return candidates[0];
 if(draft.choice!==null&&candidates.includes(draft.choice))return draft.choice;
 throw Error('That expiration time occurs twice. Choose the first or second occurrence.');
}
/**
 * Quick expiration choices beside the Expires on field (our own list and wording; the reference picker's
 * preset list is not in the cached facts). Each sets the expiration to that long after the action time, in the shown zone.
 */
export const ALERT_EXPIRY_PRESETS:ReadonlyArray<{id:string;label:string;seconds:number}>=Object.freeze([
 {id:'1h',label:'1 hour',seconds:3600},{id:'1d',label:'1 day',seconds:86400},{id:'1w',label:'1 week',seconds:7*86400},{id:'30d',label:'30 days',seconds:30*86400},{id:'90d',label:'90 days',seconds:90*86400},
]);
export function alertExpiryPreset(now:number,seconds:number,zone:string):AlertExpiryDraft{
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(seconds)||seconds<=0)throw Error('Invalid expiration preset.');
 return alertExpiryFromInstant(now+seconds,zone);
}
