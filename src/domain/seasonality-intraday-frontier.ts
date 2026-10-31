import {planAlpacaInterval} from './live-intervals';
import {newYorkClock,newYorkWallTime,usSessionPhase,NYSE_CALENDAR_YEARS} from './us-market-hours';

/** Time-only arithmetic. The actual provider must separately authenticate and
 * retain every response/feed/entry/epoch under its already admitted owner. */
export interface SeasonalityFrontierPage {
 readonly from:number;readonly through:number;
 readonly requestPageToken:string|null;readonly nextPageToken:string|null;
 readonly rows:readonly unknown[];
}
export interface SeasonalityFrontierRequest {
 readonly resolution:string;readonly session:'regular'|'extended';
 readonly firstLoadedTime:number;readonly requestFrom:number;readonly requestThrough:number;
 readonly pages:readonly SeasonalityFrontierPage[];
}
export type SeasonalityIntradayFrontier=
 | Readonly<{status:'ready';firstObservedTime:number;firstLoadedTime:number;prefixBars:number;sourceRows:number;selectedBars:number}>
 | Readonly<{status:'incomplete';reason:'pagination'|'first-loaded-missing'|'empty-selection'}>
 | Readonly<{status:'refused';reason:'invalid'|'coherence'|'order'|'outside-window'|'unsupported'}>;
export const SEASONALITY_FRONTIER_LIMITS=Object.freeze({pages:3,pageRows:10000,rows:30000,dates:31});

/** Separate from response ownership: each retained response still needs its own
 * provider transport envelope. This fee grants no source authority/admission.
 * Caller admits the complete request+retained cache+frame overlap BEFORE use. */
export function seasonalityIntradayFrontierCost(sourceRows:number):Readonly<{operations:number;numericSlots:number}>{
 if(!Number.isSafeInteger(sourceRows)||sourceRows<0||sourceRows>30000)throw Error('The Seasonality frontier exceeds its time-only row bound.');
 return Object.freeze({operations:512*sourceRows+8192*31+32768,numericSlots:4096});
}
const own=(value:unknown,key:PropertyKey):unknown=>{
 if(!value||typeof value!=='object')throw Error('Own frontier data required.');
 const field=Object.getOwnPropertyDescriptor(value,key);
 if(!field||!Object.hasOwn(field,'value'))throw Error('Own frontier data required.');return field.value;
};
function length(value:unknown,maximum:number):number{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Ordinary frontier arrays required.');
 const result=own(value,'length');if(typeof result!=='number'||!Number.isSafeInteger(result)||result<0||result>maximum)throw Error('Frontier array bound exceeded.');return result;
}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value);
const refused=(reason:Extract<SeasonalityIntradayFrontier,{status:'refused'}>['reason']):SeasonalityIntradayFrontier=>Object.freeze({status:'refused',reason});
const incomplete=(reason:Extract<SeasonalityIntradayFrontier,{status:'incomplete'}>['reason']):SeasonalityIntradayFrontier=>Object.freeze({status:'incomplete',reason});

/** One synchronous admitted pass, no price/volume reads and no row-sized output,
 * callback, cache, resolver, registration or extrapolation. Actual gaps stay
 * gaps. The month midnight is a REQUEST bound, never an observed first bar.
 * Regular selection is applied AFTER folding, exactly like cellSessionDataset.
 * Extended preserves supplied raw/folded entry bars, including any actual
 * overnight rows; it does not invent an extra session filter. */
export function seasonalityIntradayFrontier(input:Readonly<SeasonalityFrontierRequest>):SeasonalityIntradayFrontier{
 try{
  const resolution=own(input,'resolution'),session=own(input,'session'),firstLoaded=own(input,'firstLoadedTime'),from=own(input,'requestFrom'),through=own(input,'requestThrough'),pages=own(input,'pages');
  if(typeof resolution!=='string'||resolution.length>20||(session!=='regular'&&session!=='extended')||!integer(firstLoaded)||!integer(from)||!integer(through)||through<firstLoaded||from>firstLoaded)return refused('invalid');
  const result=planAlpacaInterval(resolution);if(!result.ok)return refused('unsupported');const plan=result.plan;
  if(plan.calendar||plan.nominalSeconds>=86400||plan.dayTicks||![60,300,900].includes(plan.backfillSeconds))return refused('unsupported');
  const clock=newYorkClock(firstLoaded),year=Number(clock.date.slice(0,4)),month=clock.date.slice(0,7);
  if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last||from!==newYorkWallTime(month+'-01',0)||through>firstLoaded+plan.backfillSeconds||firstLoaded-from>32*86400)return refused('outside-window');
  const pageCount=length(pages,3);if(!pageCount)return incomplete('pagination');
  const sizes=[0,0,0];let total=0;for(let p=0;p<pageCount;p++){sizes[p]=length(own(own(pages,String(p)),'rows'),10000);total+=sizes[p];}
  // Validate the fixed count before any source timestamp or row-sized work.
  seasonalityIntradayFrontierCost(total);
  let previous=-Infinity,previousBucket=-Infinity,selectedBars=0,prefixBars=0,firstObserved:number|null=null,found=false,expectedToken:string|null=null,lastDate='',dates=0;const seenTokens:string[]=[];
  for(let p=0;p<pageCount;p++){
   const page=own(pages,String(p)),rows=own(page,'rows'),n=length(rows,10000),token=own(page,'requestPageToken'),next=own(page,'nextPageToken');
   if(n!==sizes[p]||own(page,'from')!==from||own(page,'through')!==through||token!==expectedToken||next!==null&&(typeof next!=='string'||next.length<1||next.length>2048)||p<pageCount-1&&next===null)return refused('coherence');
   const nextToken=next as string|null;
   if(nextToken!==null){if(nextToken===token||seenTokens.includes(nextToken))return refused('coherence');seenTokens.push(nextToken);}
   expectedToken=nextToken;
   for(let i=0;i<n;i++){
    const time=own(own(rows,String(i)),'time');
    if(!integer(time)||time<=previous)return refused('order');previous=time;
    if(time<from||time>through||time>firstLoaded||time%plan.backfillSeconds!==0)return refused('outside-window');
    const date=newYorkClock(time).date;if(date.slice(0,7)!==month)return refused('outside-window');
    if(date!==lastDate){lastDate=date;if(++dates>31)return refused('outside-window');}
    // This is the SAME canonical planner used by the constructor. No supplied
    // function can choose buckets, run callbacks or mint source permission.
    const bucket=plan.native?time:plan.bucketOf!(time);
    if(!integer(bucket)||bucket>time||bucket<previousBucket)return refused('order');
    if(bucket===previousBucket)continue;previousBucket=bucket;
    // An overnight bucket can begin in the preceding month. Its existence is
    // not an observed first bar of THIS month; never relabel it to midnight.
    if(bucket<from||session==='regular'&&usSessionPhase(bucket)!=='regular')continue;
    if(bucket>firstLoaded)return refused('outside-window');
    if(firstObserved===null)firstObserved=bucket;selectedBars++;
    if(bucket<firstLoaded)prefixBars++;else found=true;
   }
  }
  if(expectedToken!==null)return incomplete('pagination');
  if(firstObserved===null)return incomplete('empty-selection');
  if(!found)return incomplete('first-loaded-missing');
  return Object.freeze({status:'ready',firstObservedTime:firstObserved,firstLoadedTime:firstLoaded,prefixBars,sourceRows:total,selectedBars});
 }catch{return refused('invalid');}
}
