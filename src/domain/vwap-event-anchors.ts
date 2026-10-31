// The VWAP "Dividends" and "Splits" anchor periods.
// Data: the corporate actions (Alpaca on the owner key, src/domain/chart-events.ts). The Earnings
// anchor reads the user's own Calendar earnings events for the chart symbol (imports, SEC auto-fill); no earnings date is ever
// invented, and with none loaded the anchor is unavailable.
// Earnings rule (the timing is our own choice and never looks ahead): the period starts at the
// first bar whose start is at or after the event. An exact time uses that instant. Before-open starts on the date's first bar.
// After-close, date-only and unknown timing could be known only after the session, so they start on the next date's first bar.
// The common Anchor Period options are Session, Week, Month, Year, Decade and Century. The option names
// Dividends and Splits, and every rule below, are LV's: a period starts on the bar that holds an ex-date (the bar the chart's D or S marker sits on, eventBarTime), or on
// the first later bar when no loaded bar holds it. Bars before the first loaded ex-date form one period from the first loaded
// bar. Dividends counts cash dividends; Splits counts forward and reverse splits. Dates are New York calendar dates, whatever
// the VWAP timezone input says. Only the Original calculation method (kernel 1) supports these anchors.
import {eventBarTime,newYorkDate,type CorporateActionKind} from './chart-events';
import type {CalendarDocument} from './calendar';
import {calendarSymbolMatches} from './calendar-chart-markers';

export const VWAP_EVENT_ANCHORS=['Dividends','Splits','Earnings'] as const;
export type VwapEventAnchor=typeof VWAP_EVENT_ANCHORS[number];
/** exDate is the first date a period may start on (earnings: already shifted by the timing rule); time is an exact earnings instant. 'actions-loaded' only marks that the corporate-action load finished with no dates. */
export interface VwapEventDate {exDate:string;kind:CorporateActionKind|'earnings'|'actions-loaded';time?:number|null}
export const isVwapEventAnchor=(anchor:unknown):anchor is VwapEventAnchor=>anchor==='Dividends'||anchor==='Splits'||anchor==='Earnings';
export const VWAP_EVENT_ANCHOR_UNAVAILABLE='The Dividends and Splits anchors need this symbol\'s split and dividend dates, which load from Alpaca corporate actions (Data sources key). They are not loaded for this chart.';
export const VWAP_EARNINGS_ANCHOR_UNAVAILABLE='The Earnings anchor needs earnings dates for this symbol. Import or auto-fill earnings in Calendar; none are loaded for this chart.';
export const VWAP_EVENT_ANCHOR_KERNEL='The Dividends, Splits and Earnings anchors use the Original calculation method.';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const KINDS:Record<VwapEventAnchor,readonly VwapEventDate['kind'][]>={Dividends:['cash-dividend'],Splits:['forward-split','reverse-split'],Earnings:['earnings']};

/** One anchor key per bar: the number of selected ex-dates at or before it. Throws when the dates are not loaded. */
export function vwapEventAnchorKeys(bars:readonly {time:number}[],anchor:VwapEventAnchor,events:readonly VwapEventDate[]|null|undefined):string[]{
 if(anchor==='Earnings')return earningsKeys(bars,events);
 // Corporate actions count as loaded when the list is empty, holds an action date, or carries the loaded marker; an earnings-only list does not.
 if(!events||(events.length>0&&!events.some(event=>event.kind!=='earnings')))throw new Error(VWAP_EVENT_ANCHOR_UNAVAILABLE);
 const dates=[...new Set(events.filter(event=>KINDS[anchor].includes(event.kind)&&typeof event.exDate==='string'&&DATE.test(event.exDate)).map(event=>event.exDate))].sort();
 const starts=new Set<number>();
 for(const date of dates){
  let time=eventBarTime(date,bars);
  if(time===null){const later=bars.find(bar=>newYorkDate(bar.time)>=date);time=later?later.time:null;}
  if(time!==null&&time!==bars[0]?.time)starts.add(time);
 }
 let period=0;
 return bars.map(bar=>{if(starts.has(bar.time))period++;return String(period);});
}

/** Earnings periods start at the first bar at or after each event: never a bar that opened before it (no look-ahead). */
function earningsKeys(bars:readonly {time:number}[],events:readonly VwapEventDate[]|null|undefined):string[]{
 const rows=(events??[]).filter(event=>event.kind==='earnings'&&typeof event.exDate==='string'&&DATE.test(event.exDate));
 if(!rows.length)throw new Error(VWAP_EARNINGS_ANCHOR_UNAVAILABLE);
 const starts=new Set<number>();
 for(const event of rows){
  const index=typeof event.time==='number'&&Number.isFinite(event.time)?bars.findIndex(bar=>bar.time>=event.time!):bars.findIndex(bar=>newYorkDate(bar.time)>=event.exDate);
  if(index>0)starts.add(bars[index].time);
 }
 let period=0;
 return bars.map(bar=>{if(starts.has(bar.time))period++;return String(period);});
}

const nextDate=(date:string)=>new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
/**
 * The chart symbol's earnings starts from the user's Calendar documents: the latest revision of each event, cancelled ones
 * left out; an event matches by instrument id, or by ticker with the same synthetic status. Null when none match.
 */
export function vwapEarningsDatesFromCalendar(documents:readonly CalendarDocument[]|null|undefined,target:{instrumentId:string;symbol:string;fixture:boolean}):VwapEventDate[]|null{
 const latest=new Map<string,{event:CalendarDocument['events'][number];fixture:boolean}>();
 for(const document of documents??[])for(const event of document?.events??[]){
  if(event?.kind!=='earnings'||typeof event.date!=='string'||!DATE.test(event.date))continue;
  const key=JSON.stringify([document.id,event.id]),old=latest.get(key);
  if(!old||event.revision>old.event.revision)latest.set(key,{event,fixture:!!document.provenance?.fixture});
 }
 const out=new Map<string,VwapEventDate>();
 for(const {event,fixture} of latest.values()){
  if(event.status==='cancelled')continue;
  if(!(event.instrumentId?event.instrumentId===target.instrumentId:fixture===target.fixture&&calendarSymbolMatches(event.symbol,target.symbol)))continue;
  const exact=event.timing==='exact'&&typeof event.time==='number'&&Number.isFinite(event.time);
  const row:VwapEventDate=exact?{exDate:event.date,kind:'earnings',time:event.time}:{exDate:event.timing==='before-open'?event.date:nextDate(event.date),kind:'earnings'};
  out.set(JSON.stringify(row),row);
 }
 const at=(row:VwapEventDate)=>row.time??Date.parse(row.exDate+'T05:00:00Z')/1000;
 return out.size?[...out.values()].sort((a,b)=>at(a)-at(b)):null;
}

// The loaded dates per instrument id. App remembers them when the chart's corporate actions load; chart indicators and alert
// evaluation read them by instrument. A listener lets the chart recalculate once dates arrive.
const loaded=new Map<string,readonly VwapEventDate[]>(),earnings=new Map<string,readonly VwapEventDate[]>(),listeners=new Set<(instrumentId:string)=>void>();
const merged=new Map<string,{a:readonly VwapEventDate[]|undefined;e:readonly VwapEventDate[];out:readonly VwapEventDate[]}>();
const LIMIT=64;
export function rememberVwapEventDates(instrumentId:string,events:readonly {exDate:string;kind:CorporateActionKind}[]|null):void{
 if(typeof instrumentId!=='string'||!instrumentId)return;
 if(events===null){if(!loaded.delete(instrumentId))return;}
 else{
  const next=Object.freeze(events.filter(event=>DATE.test(event.exDate)).map(event=>Object.freeze({exDate:event.exDate,kind:event.kind})));
  const prior=loaded.get(instrumentId);if(prior&&JSON.stringify(prior)===JSON.stringify(next))return;
  loaded.delete(instrumentId);loaded.set(instrumentId,next);
  while(loaded.size>LIMIT)loaded.delete(loaded.keys().next().value as string);
 }
 for(const listener of [...listeners])try{listener(instrumentId);}catch{/* one listener never stops another */}
}
/** Earnings starts for the chart symbol (see vwapEarningsDatesFromCalendar); null or empty clears them. */
export function rememberVwapEarningsDates(instrumentId:string,events:readonly VwapEventDate[]|null):void{
 if(typeof instrumentId!=='string'||!instrumentId)return;
 const next=(events??[]).filter(event=>event.kind==='earnings'&&DATE.test(event.exDate)).map(event=>Object.freeze({...event}));
 if(!next.length){if(!earnings.delete(instrumentId))return;merged.delete(instrumentId);}
 else{
  const prior=earnings.get(instrumentId);if(prior&&JSON.stringify(prior)===JSON.stringify(next))return;
  earnings.delete(instrumentId);earnings.set(instrumentId,Object.freeze(next));
  while(earnings.size>LIMIT)earnings.delete(earnings.keys().next().value as string);
 }
 for(const listener of [...listeners])try{listener(instrumentId);}catch{/* one listener never stops another */}
}
/** Corporate-action dates and earnings starts together; the array identity is stable while neither changes. Null when neither is loaded. */
export function vwapEventDatesFor(instrumentId:string|null|undefined):readonly VwapEventDate[]|null{
 if(!instrumentId)return null;
 const a=loaded.get(instrumentId),e=earnings.get(instrumentId);
 if(!e)return a??null;
 const cached=merged.get(instrumentId);
 if(cached&&cached.a===a&&cached.e===e)return cached.out;
 const out=Object.freeze([...(a??[]),...(a&&!a.length?[{exDate:'',kind:'actions-loaded' as const}]:[]),...e]);
 merged.set(instrumentId,{a,e,out});
 return out;
}
export function onVwapEventDates(listener:(instrumentId:string)=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Test seam. */
export function clearVwapEventDates():void{loaded.clear();earnings.clear();merged.clear();}
