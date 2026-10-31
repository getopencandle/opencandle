// Split and dividend markers on the chart's time axis (the Events markers).
// Data: Alpaca corporate actions on the owner's key, fetched and cached by the main process (electron/public-alpaca-actions.cjs)
// and reached through window.lv.fetchAlpacaCorporateActions. This module is pure: event types, placement on loaded bars,
// marker grouping and the tooltip text.
// Settings: dividends, splits and earnings are all shown by default. Earnings stay
// stored only: Alpaca documents no earnings endpoint (docs.alpaca.markets reference/corporateactions-1 lists split, dividend,
// merger, spin-off and similar types, and nothing for earnings), and no other permitted source is configured.
// The marker letters D and S, the colors, the bottom-of-pane placement, the tooltip wording and the date format.
import {ALPACA_IEX_PROVIDER_ID,ALPACA_SIP_PROVIDER_ID,ALPACA_SYMBOL} from './alpaca-live';

export type CorporateActionKind='forward-split'|'reverse-split'|'cash-dividend';
export type ChartEventType='dividend'|'split';
export interface CorporateActionEvent{
 id:string;kind:CorporateActionKind;symbol:string;
 /** New York calendar dates, YYYY-MM-DD. */
 exDate:string;recordDate:string|null;payableDate:string|null;processDate:string|null;
 /** Splits: newRate shares for every oldRate shares. */
 oldRate?:number;newRate?:number;
 /** Cash dividends: amount per share in currency. */
 amount?:number;currency?:string;special?:boolean;foreign?:boolean;
}
export interface CorporateActionsValue{
 schemaVersion:1;symbol:string;events:CorporateActionEvent[];retrievedAt:string;cached:boolean;stale:boolean;synthetic:boolean;
 error?:{code:string;message:string};
 provenance:{provider:string;kind:'owner-key';source:'corporate-actions';license:string};
}
export type ChartEventsResult={ok:true;value:CorporateActionsValue}|{ok:false;error:{code:string;message:string}};
export interface ChartEventsBridge{fetchAlpacaCorporateActions(input:{requestId:string;symbol:string}):Promise<ChartEventsResult>}
export interface ChartEventSettings{dividends:boolean;splits:boolean}

export const CHART_EVENT_STYLE=Object.freeze({
 dividend:Object.freeze({letter:'D',color:'#2f9e6e'}),
 split:Object.freeze({letter:'S',color:'#b7772b'}),
 /** Badge diameter and its gap above the bottom of the price pane, in CSS pixels. */
 size:16,bottomGap:4,
});

export const chartEventType=(event:Pick<CorporateActionEvent,'kind'>):ChartEventType=>event.kind==='cash-dividend'?'dividend':'split';

/** The symbol to ask for when the chart shows an Alpaca US stock (live, or the delayed all-exchange history); otherwise null. */
export function chartEventSymbol(providerId:string|undefined,symbol:string):string|null{
 return (providerId===ALPACA_IEX_PROVIDER_ID||providerId===ALPACA_SIP_PROVIDER_ID)&&ALPACA_SYMBOL.test(symbol)?symbol:null;
}

let newYorkFormat:Intl.DateTimeFormat|null=null;
/** The New York calendar date (YYYY-MM-DD) of a Unix second. */
export function newYorkDate(seconds:number):string{
 newYorkFormat??=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
 return newYorkFormat.format(new Date(seconds*1000));
}

/**
 * The open time of the bar an ex-date belongs to, or null when it is not on the loaded bars. A bar that starts on the ex-date
 * (its first one on an intraday chart) wins. Otherwise the last bar that started before it holds it, if that bar spans the date
 * (weekly and monthly bars). Bars must be in time order.
 */
export function eventBarTime(exDate:string,bars:readonly {time:number}[]):number|null{
 const count=bars.length;if(!count)return null;
 let low=0,high=count;
 while(low<high){const middle=(low+high)>>1;if(newYorkDate(bars[middle].time)<exDate)low=middle+1;else high=middle;}
 if(low<count&&newYorkDate(bars[low].time)===exDate)return bars[low].time;
 if(low===0)return null;
 // The holder spans up to the next bar, but never more than one bar length (the median of the last five bar steps), so a
 // daily bar never claims a later date that has no bar. Intraday bars need a bar on the ex-date itself.
 const steps:number[]=[];for(let i=Math.max(1,count-5);i<count;i++)steps.push(bars[i].time-bars[i-1].time);
 steps.sort((a,b)=>a-b);
 const length=steps.length?steps[steps.length>>1]:86400;
 if(length<86400-3600)return null;
 const holder=bars[low-1],end=low<count?Math.min(bars[low].time,holder.time+length):holder.time+length*1.1;
 // The ex-date's New York midnight is 04:00 (EDT) or 05:00 (EST) UTC; the later one keeps a daylight-saving hour off the edge.
 const midnight=Date.parse(exDate+'T05:00:00Z')/1000;
 return end>midnight?holder.time:null;
}

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** 2025-06-16 to "Jun 16, 2025". */
export function eventDateLabel(date:string):string{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
 return match?`${MONTHS[Number(match[2])-1]??match[2]} ${Number(match[3])}, ${match[1]}`:date;
}
const rate=(value:number)=>Number.isInteger(value)?String(value):String(Number(value.toFixed(6)));
/** Dividend amounts keep their own precision (at least two decimals, at most six). */
export function dividendAmountLabel(amount:number,currency='USD'):string{
 const fixed=amount.toFixed(6).replace(/0+$/,''),decimals=Math.max(2,(fixed.split('.')[1]??'').length);
 return `${amount.toFixed(decimals)} ${currency}`;
}

/** The tooltip lines of one event: its type, then ratio or amount, then the dates. A stub run says SYNTHETIC first. */
export function chartEventLines(event:CorporateActionEvent,synthetic=false):string[]{
 const lines:string[]=[];
 if(event.kind==='cash-dividend'){
  lines.push((synthetic?'SYNTHETIC ':'')+(event.special?'Special dividend':'Dividend'));
  lines.push('Amount: '+dividendAmountLabel(event.amount??0,event.currency));
 }else{
  lines.push((synthetic?'SYNTHETIC ':'')+(event.kind==='reverse-split'?'Reverse split':'Split'));
  lines.push(`Ratio: ${rate(event.newRate??0)} for ${rate(event.oldRate??0)}`);
 }
 lines.push('Ex-date: '+eventDateLabel(event.exDate));
 if(event.recordDate)lines.push('Record date: '+eventDateLabel(event.recordDate));
 if(event.payableDate&&event.kind==='cash-dividend')lines.push('Payment date: '+eventDateLabel(event.payableDate));
 if(synthetic)lines.push('Invented by the synthetic stub; not market data.');
 return lines;
}

export interface ChartEventMarker{key:string;type:ChartEventType;barTime:number;letter:string;color:string;events:CorporateActionEvent[];lines:string[];label:string}
/** Markers for the shown event types on the loaded bars: one per type and bar, dividends before splits. */
export function chartEventMarkers(events:readonly CorporateActionEvent[],bars:readonly {time:number}[],settings:ChartEventSettings,synthetic=false):ChartEventMarker[]{
 const groups=new Map<string,{type:ChartEventType;barTime:number;events:CorporateActionEvent[]}>();
 for(const event of events){
  const type=chartEventType(event);
  if(type==='dividend'?!settings.dividends:!settings.splits)continue;
  const barTime=eventBarTime(event.exDate,bars);if(barTime===null)continue;
  const key=type+':'+barTime,group=groups.get(key);
  if(group)group.events.push(event);else groups.set(key,{type,barTime,events:[event]});
 }
 return [...groups.entries()].sort((a,b)=>a[1].barTime-b[1].barTime||(a[1].type===b[1].type?0:a[1].type==='dividend'?-1:1)).map(([key,group])=>{
  const style=CHART_EVENT_STYLE[group.type],lines=group.events.flatMap((event,index)=>[...(index?['']:[]),...chartEventLines(event,synthetic)]);
  return {key,type:group.type,barTime:group.barTime,letter:style.letter,color:style.color,events:group.events,lines,label:lines.filter(Boolean).join('. ')};
 });
}

/** Horizontal offset of a marker so a dividend and a split on the same bar sit side by side. */
export function markerOffset(markers:readonly ChartEventMarker[],index:number):number{
 const marker=markers[index],shared=markers.filter(row=>row.barTime===marker.barTime);
 if(shared.length<2)return 0;
 const position=shared.indexOf(marker),step=CHART_EVENT_STYLE.size+2;
 return (position-(shared.length-1)/2)*step;
}

const MAX_AGE_MS=6*3600*1000;
/** One load per symbol at a time, remembered for six hours (main keeps its own once-a-day disk cache), and
 * never past the New York day it was asked on, so a daily refresh reaches main's cache on the new day. */
export function createChartEventsLoader(bridge:()=>Partial<ChartEventsBridge>|undefined,now:()=>number=Date.now){
 const memo=new Map<string,{at:number;promise:Promise<ChartEventsResult>}>();let sequence=0;
 return (symbol:string):Promise<ChartEventsResult>=>{
  const held=memo.get(symbol);
  if(held&&now()-held.at<MAX_AGE_MS&&newYorkDate(held.at/1000)===newYorkDate(now()/1000))return held.promise;
  const lv=bridge();
  if(typeof lv?.fetchAlpacaCorporateActions!=='function')return Promise.resolve({ok:false,error:{code:'UNAVAILABLE',message:'Splits and dividends need the desktop app.'}});
  const requestId=`lv-actions-${symbol.replace(/\./g,'_')}-${++sequence}`;
  const promise=lv.fetchAlpacaCorporateActions({requestId,symbol}).then(result=>{if(!result.ok)memo.delete(symbol);return result;},error=>{memo.delete(symbol);return {ok:false as const,error:{code:'FAILED',message:String(error instanceof Error?error.message:error)}};});
  memo.set(symbol,{at:now(),promise});
  return promise;
 };
}
