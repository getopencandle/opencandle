import type {Bar} from '../domain/types';

/** Addresses only. None of these data values grant native or numerical authority. */
export type ScriptReadoutPosition={readonly kind:'latest'}|{readonly kind:'axis-time';readonly time:number}|{readonly kind:'unavailable'};
export class ScriptPositionQueryError extends Error{}
export interface ScriptLogicalPositions {
 readonly count:number;
 readonly timeIdentity:boolean;
 assertCurrent():void;
 nativeTime(index:number):number;
 spanEnd(index:number):number;
 eventTime(index:number):number;
 indexFor(position:ScriptReadoutPosition):number;
 uniqueEventIndex(time:number):number|null;
 assertEmission(index:unknown,time:unknown):number;
}
interface Input {
 confirmed:readonly Bar[];consumed:readonly Bar[];axisRows:readonly unknown[];feed:readonly Bar[];sourceTimes:readonly unknown[];
 native:readonly unknown[];projection:readonly unknown[];projectionFrom:number;step:number;isCurrent():boolean;
}
const absent=()=>Error('The derived script position frame is no longer current.');
function own(value:unknown,key:string):unknown{if(!value||typeof value!=='object')throw absent();const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw absent();return field.value;}
function array(value:unknown):asserts value is readonly unknown[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!Number.isSafeInteger(own(value,'length')))throw absent();}
function number(row:unknown,key:string):number{const field=row&&typeof row==='object'?Object.getOwnPropertyDescriptor(row,key):undefined;if(key==='volume'&&(!field||Object.hasOwn(field,'value')&&(field.value===undefined||typeof field.value==='number'&&Number.isNaN(field.value))))return NaN;if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='number'||!Number.isFinite(field.value))throw absent();return field.value;}
const fields=['time','open','high','low','close','volume'] as const;
/** Pure mapping helper. Its caller must privately issue/retain the actual producer authority. No history copy. */
export function createScriptLogicalPositions(input:Input):ScriptLogicalPositions|null{
 try{
  for(const rows of [input.confirmed,input.consumed,input.axisRows,input.feed,input.sourceTimes,input.native,input.projection])array(rows);
  const count=input.confirmed.length,length=input.feed.length,projectionCount=input.projection.length;
  if(!input.isCurrent()||count<1||count>5000||input.consumed.length!==count||input.projectionFrom!==count||!Number.isSafeInteger(input.projectionFrom)||!Number.isFinite(input.step)||input.step<=0||length!==count+projectionCount||input.axisRows.length!==length||input.sourceTimes.length!==length||input.native.length!==length)return null;
  const base=number(own(input.feed,'0'),'time');let timeIdentity=true,previousAxis=-Infinity,previousEvent=-Infinity;
  for(let index=0;index<count;index++){
   if(!input.isCurrent())return null;const row=own(input.confirmed,String(index)),given=own(input.consumed,String(index)),axis=own(input.axisRows,String(index)),feed=own(input.feed,String(index)),native=own(input.native,String(index));
   if(axis!==row)return null;const event=number(row,'time'),time=number(feed,'time');
   if(event<previousEvent||time<=previousAxis||!Object.is(time,base+index*input.step)||!Object.is(own(input.sourceTimes,String(index)),event)||!Object.is(number(native,'time')/1000,time))return null;
   for(const field of fields){const value=number(row,field);if(!Object.is(value,number(given,field))||field!=='time'&&(!Object.is(value,number(feed,field))||!Object.is(value,number(native,field))))return null;}
   timeIdentity&&=Object.is(time,event)&&event>previousEvent;previousAxis=time;previousEvent=event;if(!input.isCurrent())return null;
  }
  let alive=true;
  const assert=()=>{if(!alive)throw absent();try{if(!input.isCurrent()||input.confirmed.length!==count||input.consumed.length!==count||input.feed.length!==length||input.axisRows.length!==length||input.sourceTimes.length!==length||input.native.length!==length||input.projection.length!==projectionCount)throw absent();}catch(error){alive=false;throw error;}};
  const validIndex=(index:number)=>{assert();if(!Number.isSafeInteger(index)||index<0||index>=count)throw new ScriptPositionQueryError('Choose a confirmed chart bar for script values.');return index;};
  const at=(index:number)=>{validIndex(index);try{const row=own(input.confirmed,String(index)),given=own(input.consumed,String(index)),feed=own(input.feed,String(index)),native=own(input.native,String(index)),event=number(row,'time'),time=number(feed,'time');if(own(input.axisRows,String(index))!==row||!Object.is(own(input.sourceTimes,String(index)),event)||!Object.is(time,base+index*input.step)||!Object.is(number(native,'time')/1000,time))throw absent();for(const field of fields){const value=number(row,field);if(!Object.is(value,number(given,field))||field!=='time'&&(!Object.is(value,number(feed,field))||!Object.is(value,number(native,field))))throw absent();}assert();return{event,time};}catch(error){alive=false;throw error;}};
  const nativeTime=(index:number)=>at(index).time;
  const eventTime=(index:number)=>at(index).event;
  const positions:ScriptLogicalPositions={count,timeIdentity,assertCurrent:assert,nativeTime,eventTime,spanEnd(index){validIndex(index);const time=index+1<count?nativeTime(index+1):(base+(index+1)*input.step)*1000/1000;if(!Number.isFinite(time))throw absent();assert();return time;},
   indexFor(position){assert();let kind:unknown,time:unknown;try{kind=own(position,'kind');if(kind==='axis-time')time=own(position,'time');}catch{throw new ScriptPositionQueryError('Choose a valid chart position.');}if(kind==='latest')return validIndex(count-1);if(kind!=='axis-time')throw new ScriptPositionQueryError('No current chart position is available.');if(typeof time!=='number'||!Number.isFinite(time))throw new ScriptPositionQueryError('Choose a finite chart axis position.');let low=0,high=count-1;while(low<=high){const middle=(low+high)>>>1,value=nativeTime(middle);if(value===time)return middle;if(value<time)low=middle+1;else high=middle-1;}throw new ScriptPositionQueryError('Script values are unavailable on projection or off-grid positions.');},
   uniqueEventIndex(time){assert();if(typeof time!=='number'||!Number.isFinite(time))return null;let low=0,high=count;while(low<high){const mid=(low+high)>>>1;if(eventTime(mid)<time)low=mid+1;else high=mid;}if(low>=count||eventTime(low)!==time||low+1<count&&eventTime(low+1)===time)return null;assert();return low;},
   assertEmission(index,time){if(typeof index!=='number'||typeof time!=='number')throw absent();validIndex(index);if(!Object.is(eventTime(index),time))throw absent();return index;},
  };assert();return Object.freeze(positions);
 }catch{return null;}
}
