// Range charts take their range size from the interval (Range size is not a dialog input;
// switching to Range sets the interval to 100R).
// LV builds Range bars from the loaded time bars (OHLC path approximation, derived/range.ts), so the data interval stays
// the source resolution and the R interval is the chart's range size. One stored truth: the Range book entry's `range`
// (instrument ticks) IS the multiplier of the R interval, so saved books read unchanged and an interval change writes it.
import {settingsDefaults,validatedSettingsBook,type ChartSettingsBook} from './chart-settings';

/** The interval on switching to Range (100R). */
export const RANGE_INTERVAL_DEFAULT=100;
/** Same bound as the Range calculation input (derived-settings.ts). */
export const RANGE_INTERVAL_MAX=100000;

export type RangeIntervalResult={ok:true;size:number;interval:string;label:string}|{ok:false;message:string};
export const rangeIntervalId=(size:number)=>`${size}R`;
export const rangeIntervalLabel=(size:number)=>`${size} range${size===1?'':'s'}`;
const validSize=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=RANGE_INTERVAL_MAX;

/** True when the text is written as a range interval (`100R`, `25 ranges`), valid or not. */
export function looksLikeRangeInterval(text:string):boolean{return typeof text==='string'&&/^\s*\d*(?:\.\d+)?\s*(r|range|ranges)\s*$/i.test(text);}
/** Parses `<n>R` (also `n range(s)`): a whole number of instrument ticks from 1 to 100000. */
export function parseRangeInterval(text:string):RangeIntervalResult{
 const match=typeof text==='string'&&text.length<=40?text.trim().match(/^(\d+(?:\.\d+)?)?\s*(r|range|ranges)$/i):null;
 if(!match)return{ok:false,message:'Enter a range interval such as 10R or 100R.'};
 const size=match[1]===undefined?1:Number(match[1]);
 if(!validSize(size))return{ok:false,message:`A range interval is a whole number of ticks from 1 to ${RANGE_INTERVAL_MAX}.`};
 return{ok:true,size,interval:rangeIntervalId(size),label:rangeIntervalLabel(size)};
}
/** The Range chart's range size: the saved Range entry's value, else the default (100). An invalid saved
 * value reads as the default; the calculation reports it through its own diagnostic. */
export function rangeSizeOf(book:ChartSettingsBook|null|undefined):number{const saved=book?.range?.range;return validSize(saved)?saved:RANGE_INTERVAL_DEFAULT;}
/** The book with the Range size set from an R interval. A book without a Range entry gets the full Range defaults. */
export function withRangeSize(book:ChartSettingsBook|null|undefined,size:number):ChartSettingsBook{
 if(!validSize(size))throw new Error(`A range interval is a whole number of ticks from 1 to ${RANGE_INTERVAL_MAX}.`);
 const next:ChartSettingsBook={...(book??{}),range:{...settingsDefaults('range'),...(book?.range??{}),range:size}};
 validatedSettingsBook(next);return next;
}
/** The interval the toolbar shows: `<size>R` on a Range chart, the data interval otherwise. */
export function chartIntervalText(style:string,book:ChartSettingsBook|null|undefined,timeText:string):string{return style==='range'?rangeIntervalId(rangeSizeOf(book)):timeText;}
/** Typed interval preview: a range interval on any chart type (choosing one switches to Range), else the time grammar. */
export function previewChartInterval(text:string,timePreview:(text:string)=>{ok:true;label:string}|{ok:false;message:string}):{ok:true;label:string}|{ok:false;message:string}{
 if(looksLikeRangeInterval(text)){const parsed=parseRangeInterval(text);return parsed.ok?{ok:true,label:parsed.label}:parsed;}
 return timePreview(text);
}
/** Enter in the interval box: an R interval goes to the Range handler (sets the size and selects Range), anything else to the
 * ordinary interval route unchanged. */
export function submitChartIntervalEntry(text:string,applyRange:(size:number)=>{ok:boolean;message?:string},applyTime:(text:string)=>{ok:boolean;interval:string|null;message:string|null}):{ok:boolean;interval:string|null;message:string|null}{
 if(!looksLikeRangeInterval(text))return applyTime(text);
 const parsed=parseRangeInterval(text);if(!parsed.ok)return{ok:false,interval:null,message:parsed.message};
 const result=applyRange(parsed.size);
 return result.ok?{ok:true,interval:parsed.interval,message:null}:{ok:false,interval:null,message:result.message??'The range interval could not be applied.'};
}
