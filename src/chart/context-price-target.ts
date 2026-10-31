import type {ChartMenuSnapshot} from './context-menu';
import {roundToTick} from './axis-labels';
function record(value:unknown):Record<string,unknown>|null{if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;return value as Record<string,unknown>;}
function field(value:unknown,key:string):unknown{const row=record(value);if(!row)return undefined;const descriptor=Object.getOwnPropertyDescriptor(row,key);return descriptor?.enumerable&&'value'in descriptor?descriptor.value:undefined;}
/** Eligibility is data validation only. Issued/adopted ownership must be checked separately. */
export function contextPriceTargetError(snapshot:ChartMenuSnapshot):string|null{
 const entity=field(snapshot,'entity'),point=field(snapshot,'point'),kind=field(entity,'kind');
 if(kind!=='chart'&&kind!=='price-axis')return 'Clicked-price actions require the chart body or main price axis.';
 if(field(point,'unit')!=='price'||field(field(point,'pane'),'kind')!=='price')return 'Indicator, study and comparison coordinate values cannot seed a main-symbol price action.';
 if(kind==='price-axis'&&(field(entity,'unit')!=='price'||field(entity,'columnOwner')!==null||field(field(entity,'pane'),'kind')!=='price'))return 'Clicked-price actions require the main price-axis column.';
 const price=field(point,'price');if(typeof price!=='number'||!Number.isFinite(price)||price<=0)return 'The clicked raw price must be finite and positive.';
 return null;
}
/** Gap 1: the clicked price a price alert or paper order is prefilled with, rounded to the instrument tick (the raw price
 * when the instrument names no tick). Call after contextPriceTargetError returned null. */
export function contextTargetPrice(snapshot:ChartMenuSnapshot):number{
 const price=field(snapshot,'point')&&field(field(snapshot,'point'),'price'),tick=field(field(snapshot,'instrument'),'tickSize');
 if(typeof price!=='number'||!Number.isFinite(price))throw Error('The clicked raw price must be finite and positive.');
 return roundToTick(price,typeof tick==='number'?tick:undefined);
}
