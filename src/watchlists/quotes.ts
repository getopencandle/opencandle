import type {BarDataset} from '../domain/types';
import {originalDailySource as daily,compatibleDailySource} from './sources';
import {resolveWatchSource,type WatchList,type WatchReference,type WatchRow,type WatchColumn} from './model';
import {liveDailyCompanionId} from './live-watch';
import {ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
import {newYorkClock,usSessionDay,usSessionPhase} from '../domain/us-market-hours';
import {parseInterval} from '../domain/intervals';
import {demoDataMode} from '../domain/demo-mode';
import {liveQuoteFresh,liveQuoteSourceLabel,type LiveQuote} from '../domain/live-quotes';
export type ChangePercentState='value'|'missing'|'zero-base';
/** changePercentState is computed per quote and never stored: a zero previous close is distinct from missing data. */
export interface WatchQuote {last:number|null;change:number|null;changePercent:number|null;changePercentState:ChangePercentState;volume:number|null;extended:number|null;extendedChange:number|null;extendedChangePercent:number|null;extendedSession:'pre'|'post'|null;relativeVolume:number|null;
 /** The live best bid and ask (withLiveQuote); absent or null without a live quote. */
 bid?:number|null;ask?:number|null;book?:LiveQuote|null;
 /** Details fields (daily basis only): the previous daily close, the day's open, the low and high
  * of the daily bars in the 365 days up to the day (null without a full year of daily history) and the mean volume of the 30
  * daily bars before the day. Absent on quotes built elsewhere. */
 previousClose?:number|null;open?:number|null;yearLow?:number|null;yearHigh?:number|null;averageVolume30?:number|null;
 /** Columns (daily basis only): the high and low of the same daily bar as `open`, and the day range
  * as its width (high minus low), which is what the Day range column sorts by. Absent on quotes built elsewhere. */
 high?:number|null;low?:number|null;dayRange?:number|null;
 asOf:number|null;dataset:BarDataset|null;dailyDataset?:BarDataset|null;description:string;reason:string;dailyBasis:boolean}
/** Quotes are recomputed only when their own source changes. Datasets and bar arrays are immutable (a live tick
 *  publishes a new array), so a quote is reused while its primary dataset, primary bars, daily source, daily bars and companion
 *  diagnosis are the same objects (and its scalar fields read the same). Each call returns a fresh shallow copy, as before. */
const quoteMemo=new WeakMap<BarDataset,{shape:string;bars:readonly unknown[];daily:BarDataset|null;dailyBars:readonly unknown[]|null;diagnostic:string;liveDaily:boolean;quote:WatchQuote}>();
export function watchQuote(reference:WatchReference,datasets:readonly BarDataset[]):WatchQuote{
 const empty:WatchQuote={last:null,change:null,changePercent:null,changePercentState:'missing',volume:null,extended:null,extendedChange:null,extendedChangePercent:null,extendedSession:null,relativeVolume:null,asOf:null,dataset:null,description:reference.symbol,reason:'No data source for this symbol.',dailyBasis:false},primary=resolveWatchSource(reference,datasets);if(!primary)return empty;
 let dailySource:BarDataset|null=daily(primary)?primary:null,diagnostic='';
 if(reference.dailyDatasetId!==null){const candidates=datasets.filter(row=>row.provenance.datasetId===reference.dailyDatasetId&&compatibleDailySource(primary,row));dailySource=candidates.length===1?candidates[0]:null;if(!dailySource)diagnostic='The selected daily companion is missing, ambiguous or has a different source basis. ';}
 // A live intraday row with no chosen companion uses the same feed's live daily bars (opened in the background).
 const companionId=reference.dailyDatasetId===null&&!dailySource?liveDailyCompanionId(primary.provenance.datasetId):null,companions=companionId?datasets.filter(row=>row.provenance.datasetId===companionId&&compatibleDailySource(primary,row)):[],liveDaily=companions.length===1;if(liveDaily)dailySource=companions[0];
 const primaryBars=primary.bars,dailyBars=dailySource?.bars??null,held=quoteMemo.get(primary),shape=JSON.stringify([primary.resolution,primary.instrument.name,primary.instrument.timezone,primary.instrument.assetClass,primary.provenance.fixture,primary.provenance.providerId]);
 if(held&&held.shape===shape&&held.bars===primaryBars&&held.daily===dailySource&&held.dailyBars===dailyBars&&held.diagnostic===diagnostic&&held.liveDaily===liveDaily)return{...held.quote};
 const quote=quoteFromSources(primary,dailySource,diagnostic,liveDaily);quoteMemo.set(primary,{shape,bars:primaryBars,daily:dailySource,dailyBars,diagnostic,liveDaily,quote});return{...quote};
}
function quoteFromSources(primary:BarDataset,dailySource:BarDataset|null,diagnostic:string,liveDaily:boolean):WatchQuote{
 const empty:WatchQuote={last:null,change:null,changePercent:null,changePercentState:'missing',volume:null,extended:null,extendedChange:null,extendedChangePercent:null,extendedSession:null,relativeVolume:null,asOf:null,dataset:null,description:primary.instrument.name,reason:'',dailyBasis:false};
 const last=primary.bars.at(-1);if(!last)return{...empty,dataset:primary,description:primary.instrument.name,reason:'The selected primary source contains no bars.',dailyBasis:!!dailySource};
 // Live companion: Chg is Last against the close of the last daily bar of an earlier New York day. The days
 // come from the companion's own New York dates, never from Last's bar time (a 1W or 1M bar opens at its period start). Today is
 // the later of the companion's last date and Last's date; with no daily bar for today yet, the latest daily close is the prior day.
 // Crypto trades around the clock and its daily bars open at 00:00 UTC (Coinbase), so its days are UTC dates: on New York dates
 // the bar of the day would count as the prior day from New York midnight on, and Chg would read 0.00% all day.
 const nyDate=primary.instrument.assetClass==='crypto'?(time:number)=>new Date(time*1000).toISOString().slice(0,10):(time:number)=>newYorkClock(time).date,companionLast=liveDaily?dailySource!.bars.at(-1):undefined;
 const today=companionLast?[nyDate(companionLast.time),nyDate(last.time)].sort().at(-1)!:'';
 const dailyLast=liveDaily?(companionLast&&nyDate(companionLast.time)===today?companionLast:undefined):dailySource?.bars.at(-1);
 const prior=liveDaily?[...dailySource!.bars].reverse().find(bar=>nyDate(bar.time)<today):dailySource?.bars.at(-2),dailyBasis=!!dailySource;
 const finite=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?value:null,change=liveDaily?(prior?finite(last.close-prior.close):null):dailyLast&&prior?finite(dailyLast.close-prior.close):null;
 const changePercent=change!==null&&prior?.close?finite(change/prior.close*100):null,changePercentState:ChangePercentState=changePercent!==null?'value':change!==null&&prior?.close===0?'zero-base':'missing';
 const ext=extendedQuote(primary),rvol=relativeVolume(dailySource,dailyLast);
 const year=dailyYearRange(dailySource,dailyLast),stats={previousClose:dailyBasis?finite(prior?.close):null,open:dailyBasis?finite(dailyLast?.open):null,yearLow:year?.low??null,yearHigh:year?.high??null,averageVolume30:averageDailyVolume(dailySource,dailyLast,30)};
 const high=dailyBasis?finite(dailyLast?.high):null,low=dailyBasis?finite(dailyLast?.low):null,range=high!==null&&low!==null&&high>=low?{high,low,dayRange:finite(high-low)}:{high,low,dayRange:null};
 return{last:finite(last.close),change,changePercent,changePercentState,volume:finite(dailyLast?.volume),extended:ext.extended,extendedChange:ext.change,extendedChangePercent:ext.changePercent,extendedSession:ext.session,relativeVolume:rvol,...stats,...range,asOf:last.time,dataset:primary,dailyDataset:dailySource,description:primary.instrument.name,dailyBasis,reason:(primary.provenance.fixture?(demoDataMode()==='legacy'?'SYNTHETIC. ':demoDataMode()==='example'?'Example data. ':''):primary.provenance.providerId===ALPACA_STUB_PROVIDER_ID?'SYNTHETIC (keyless Alpaca stub, invented prices). ':'')+diagnostic+'Last is the selected '+primary.resolution+' close. '+(liveDaily?'Daily change compares Last with the previous live daily close; daily volume is the live daily bar of the day.':dailyBasis?'Daily change and volume use the daily bars; change compares the previous daily close.':'Daily change and volume are unavailable without a compatible daily snapshot.')+' '+ext.reason+' '+(rvol===null?'Relative volume needs the daily bar of the day and ten earlier daily bars with volume.':'Relative volume is the daily bar volume over the mean of the ten earlier daily bars (the day may still be in progress).')+' Historical values do not establish current market prices or final-value availability.'};
}
/**
 * Extended columns require an extended feed and label the session: an intraday New York source whose
 * last bar starts in the pre-market (04:00-09:30) or post-market (16:00-20:00, early-close aware) session is an extended-hours quote.
 * Extended last is that bar's close; extended change compares it with the close of the latest regular-session bar before it (the
 * previous close in the pre-market, the day's close after hours). During regular hours, overnight or for daily data it is unavailable.
 */
export function extendedQuote(primary:BarDataset):{extended:number|null;change:number|null;changePercent:number|null;session:'pre'|'post'|null;reason:string}{
 const none=(reason:string)=>({extended:null,change:null,changePercent:null,session:null,reason});
 let seconds:number|null|undefined;try{seconds=parseInterval(primary.resolution).seconds;}catch{seconds=undefined;}
 if(!seconds||seconds>=86400)return none('Extended-hours values need an intraday source.');
 if(primary.instrument.timezone!=='America/New_York'||primary.instrument.assetClass==='crypto')return none('Extended-hours values apply to US exchange sessions only.');
 const last=primary.bars.at(-1);if(!last||!Number.isFinite(last.close))return none('Extended-hours values need a usable last bar.');
 const phase=usSessionPhase(last.time);if(phase!=='pre'&&phase!=='post')return none(phase==='regular'?'Extended-hours values are blank during the regular session.':'Extended-hours values are blank overnight.');
 let regular:number|null=null;for(let index=primary.bars.length-2;index>=0&&index>=primary.bars.length-20001;index--){const bar=primary.bars[index];if(Number.isFinite(bar.close)&&usSessionPhase(bar.time)==='regular'){regular=bar.close;break;}}
 const change=regular===null?null:last.close-regular,percent=change!==null&&regular?change/regular*100:null,label=phase==='pre'?'Pre-market':'Post-market';
 return{extended:last.close,change:change!==null&&Number.isFinite(change)?change:null,changePercent:percent!==null&&Number.isFinite(percent)?percent:null,session:phase,reason:label+' last from a bar at '+new Date(last.time*1000).toISOString()+(regular===null?'; no regular-session close is loaded to compare with.':'; change is against the latest regular-session close '+regular+'.')};
}
/** The row with the live best bid and ask of its instrument, when a fresh live quote exists. */
export function withLiveQuote(quote:WatchQuote,live:LiveQuote|null|undefined,nowMs:number):WatchQuote{
 if(!quote.dataset||!liveQuoteFresh(live,nowMs)||live.instrumentId!==quote.dataset.instrument.id)return quote.bid===undefined&&quote.ask===undefined?quote:{...quote,bid:null,ask:null,book:null};
 return{...quote,bid:live.bid,ask:live.ask,book:live};
}
/** Daily bar volume over the mean volume of the ten daily bars before it, from the same daily source. */
export function relativeVolume(daily:BarDataset|null|undefined,day:BarDataset['bars'][number]|undefined):number|null{
 if(!daily||!day||!Number.isFinite(day.volume))return null;const at=daily.bars.lastIndexOf(day);if(at<10)return null;
 const earlier=daily.bars.slice(at-10,at).map(bar=>bar.volume);if(!earlier.every(Number.isFinite))return null;
 const mean=earlier.reduce((sum,value)=>sum+value,0)/10;return mean>0&&Number.isFinite(day.volume/mean)?day.volume/mean:null;
}
/** Low and high of the daily bars in the 365 days up to and including `day`; null unless the
 * daily source reaches back a full year before it. */
export function dailyYearRange(daily:BarDataset|null|undefined,day:BarDataset['bars'][number]|undefined):{low:number;high:number}|null{
 if(!daily||!day)return null;const at=daily.bars.lastIndexOf(day),first=daily.bars[0];if(at<0||!first)return null;
 const cutoff=day.time-365*86400;if(first.time>cutoff)return null;
 let low=Infinity,high=-Infinity;for(let index=at;index>=0&&daily.bars[index]!.time>cutoff;index--){const bar=daily.bars[index]!;if(!Number.isFinite(bar.low)||!Number.isFinite(bar.high))return null;low=Math.min(low,bar.low);high=Math.max(high,bar.high);}
 return Number.isFinite(low)&&Number.isFinite(high)?{low,high}:null;
}
/** Mean volume of the `count` daily bars before `day` from the same daily source, like relativeVolume. */
export function averageDailyVolume(daily:BarDataset|null|undefined,day:BarDataset['bars'][number]|undefined,count:number):number|null{
 if(!daily||!day)return null;const at=daily.bars.lastIndexOf(day);if(at<count)return null;
 const earlier=daily.bars.slice(at-count,at).map(bar=>bar.volume);if(!earlier.every(Number.isFinite))return null;
 const mean=earlier.reduce((sum,value)=>sum+value,0)/count;return Number.isFinite(mean)?mean:null;
}
function compare(a:string|number|null,b:string|number|null,direction:'asc'|'desc'){if(a===null)return b===null?0:1;if(b===null)return -1;const value=a<b?-1:a>b?1:0;return direction==='asc'?value:-value;}
export function orderedWatchRows(list:WatchList,quotes:ReadonlyMap<string,WatchQuote>):WatchRow[]{
 if(!list.sort)return [...list.rows];const result:WatchRow[]=[],group:WatchRow[]=[];
 const flush=()=>{group.sort((a,b)=>{if(a.kind!=='symbol'||b.kind!=='symbol')return 0;const field=list.sort!.column,value=(row:typeof a)=>field==='symbol'?row.reference.symbol:quotes.get(row.id)?.[field as Exclude<WatchColumn,'symbol'>]??null;return compare(value(a),value(b),list.sort!.direction);});result.push(...group);group.length=0;};
 for(const row of list.rows){if(row.kind==='section'){flush();result.push(row);}else group.push(row);}flush();return result;
}
export function visibleWatchRows(rows:WatchRow[]):WatchRow[]{let hidden=false;return rows.filter(row=>{if(row.kind==='section'){hidden=row.collapsed;return true;}return !hidden;});}
/** Cell text and tooltip for one quote column. LV wording; no value here is described as a reference value. */
export interface WatchCellDisplay {text:string;title:string;state:'value'|'unavailable'|'zero-base'}
const utc=(seconds:number)=>new Date(seconds*1000).toISOString();
const plain=(value:number,digits=6)=>value.toLocaleString('en-US',{maximumFractionDigits:digits});
function format(column:Exclude<WatchColumn,'symbol'>,value:number):string{if(column==='relativeVolume')return value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});if(column==='extendedChangePercent')column='changePercent';else if(column==='extendedChange')column='change';return column==='changePercent'?value.toLocaleString(undefined,{maximumFractionDigits:2,signDisplay:'exceptZero'})+'%':column==='change'?value.toLocaleString(undefined,{maximumFractionDigits:2,signDisplay:'exceptZero'}):value.toLocaleString(undefined,{maximumFractionDigits:column==='volume'?0:2});}
export function watchCellDisplay(column:Exclude<WatchColumn,'symbol'>,quote:WatchQuote):WatchCellDisplay{
 if(column==='changePercent'&&quote.changePercentState==='zero-base')return{text:'n/a',title:'Previous close is zero',state:'zero-base'};
 if(column==='bid'||column==='ask'){const value=quote[column],book=quote.book;if(typeof value!=='number'||!Number.isFinite(value)||!book)return{text:'N/A',title:'Unavailable. No live '+column+' for this row: bid and ask come from live Alpaca (IEX on the free plan, all exchanges on paid) and Coinbase feeds only.',state:'unavailable'};
  const size=column==='bid'?book.bidSize:book.askSize;return{text:format('last',value),state:'value',title:(column==='bid'?'Bid ':'Ask ')+plain(value)+(size!==null?' x '+plain(size,0):'')+' at '+utc(book.time)+'. '+liveQuoteSourceLabel(book)+'.'};}
 // The daily bar of the day (open, high, low, day range) and the previous daily close, labelled with their bar.
 const dayBar=quote.dailyDataset?.bars.at(-1),daySource=quote.dailyDataset?', '+quote.dailyDataset.provenance.session+' session, from '+quote.dailyDataset.provenance.providerName:'',dayText=(dayBar?' on '+utc(dayBar.time).slice(0,10):'')+daySource;
 if(column==='dayRange'){const low=quote.low,high=quote.high;if(typeof low!=='number'||typeof high!=='number'||!Number.isFinite(low)||!Number.isFinite(high)||high<low)return{text:'N/A',title:'Unavailable. '+quote.reason,state:'unavailable'};return{text:format('last',low)+' to '+format('last',high),state:'value',title:'Day range '+plain(low)+' to '+plain(high)+' (width '+plain(high-low)+')'+dayText+'. Sorted by the width of the range.'};}
 const value=quote[column];if(typeof value!=='number'||!Number.isFinite(value))return{text:'N/A',title:'Unavailable. '+quote.reason,state:'unavailable'};
 const text=format(column,value);
 if(column==='open'||column==='high'||column==='low')return{text,state:'value',title:'Daily '+column+' '+plain(value)+dayText};
 if(column==='previousClose')return{text,state:'value',title:'Previous daily close '+plain(value)+daySource+'. The daily change compares with it.'};
 if(column==='last'){const source=quote.dataset;return{text,state:'value',title:'Last '+plain(value)+(quote.asOf===null?'':' at '+utc(quote.asOf))+(source?', from '+source.provenance.providerName+', '+source.resolution:'')};}
 if(column==='volume'){const source=quote.dailyDataset,bar=source?.bars.at(-1);return{text,state:'value',title:'Daily volume '+plain(value,0)+(bar?' on '+utc(bar.time).slice(0,10):'')+(source?', '+source.provenance.session+' session, from '+source.provenance.providerName:'')};}
 if(column==='extended'||column==='extendedChange'||column==='extendedChangePercent'){const session=quote.extendedSession==='pre'?'Pre-market':'Post-market';return{text,state:'value',title:session+(column==='extended'?' last '+plain(value):column==='extendedChange'?' change '+plain(value):' change '+plain(value,4)+'%')+(quote.asOf===null?'':' at '+utc(quote.asOf))+'. OpenCandle calculation; compared with the latest regular-session close.'};}
 if(column==='relativeVolume')return{text,state:'value',title:'Relative volume '+plain(value,4)+': daily volume over the mean of the ten earlier daily bars of '+(quote.dailyDataset?.provenance.providerName??'the daily source')+'. OpenCandle calculation; the day may still be in progress.'};
 return{text,state:'value',title:'Compared with the previous daily close'};
}
/**
 * The sign colour of a change cell: positive
 * #22ab94 and negative #f7525f text. LV applies them to the four change columns only (Chg,
 * Chg%, Ext Chg, Ext Chg%). Zero, missing and zero-base values stay neutral. Last, volume, relative volume, bid and ask stay
 * neutral too.
 */
export type WatchCellTone='up'|'down'|null;
const TONED:ReadonlySet<WatchColumn>=new Set<WatchColumn>(['change','changePercent','extendedChange','extendedChangePercent']);
export function watchCellTone(column:WatchColumn,quote:WatchQuote):WatchCellTone{
 if(!TONED.has(column))return null;if(column==='changePercent'&&quote.changePercentState!=='value')return null;
 const value=quote[column as 'change'|'changePercent'|'extendedChange'|'extendedChangePercent'];
 return typeof value!=='number'||!Number.isFinite(value)||value===0?null:value>0?'up':'down';
}
/**
 * The market-status dot in the symbol cell (6px). Reading: a New York listed source uses LV's own NYSE calendar (us-market-hours.ts,
 * the same clock as the details "Current market status"), so it is a clock reading, not an exchange status feed; a crypto
 * source trades around the clock; any other market has no dot (null) rather than a guess.
 */
export type WatchMarketState='open'|'pre'|'post'|'closed';
export interface WatchMarketStatus {state:WatchMarketState;title:string}
export function watchMarketStatus(dataset:Pick<BarDataset,'instrument'>|null|undefined,nowSeconds:number):WatchMarketStatus|null{
 const instrument=dataset?.instrument;if(!instrument||!Number.isFinite(nowSeconds))return null;
 if(instrument.assetClass==='crypto')return{state:'open',title:'Market open: crypto trades around the clock'};
 if(instrument.timezone!=='America/New_York')return null;
 const time=Math.floor(nowSeconds),day=usSessionDay(newYorkClock(time).date);
 if(day.weekend)return{state:'closed',title:'Market closed (weekend), OpenCandle calendar'};
 if(day.holiday)return{state:'closed',title:'Market closed (exchange holiday), OpenCandle calendar'};
 const phase=usSessionPhase(time),early=day.earlyClose?', early close day':'';
 return phase==='regular'?{state:'open',title:'Market open'+early+', OpenCandle calendar'}:phase==='pre'?{state:'pre',title:'Pre-market'+early+', OpenCandle calendar'}:phase==='post'?{state:'post',title:'Post-market'+early+', OpenCandle calendar'}:{state:'closed',title:'Market closed (overnight), OpenCandle calendar'};
}
