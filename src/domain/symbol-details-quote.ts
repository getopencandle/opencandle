/**
 * Pure view model for the right-panel Details widget, built only from the
 * prepared watchlist DetailSnapshot (watchlists/details.ts) and an already-validated fundamentals summary.
 * Nothing here reads a provider or estimates a value: a missing input is a null with the reason, never zero.
 */
import type {DetailSnapshot,DetailStat} from '../watchlists/details';
import type {SymbolFundamentalsSummary} from '../ui/symbol-details-fundamentals';
import {displayExchange} from './fixtures';

/**
 * UI audit 1028 #2 (our own display rules): prices show the decimals of the instrument tick size (two without a usable
 * tick), volumes are compact above ten thousand (2.50M) and grouped integers below, ratios and percents use two decimals.
 * Display only: the snapshot keeps the exact supplied numbers.
 */
export function tickDecimals(tick:unknown):number{
 if(typeof tick!=='number'||!Number.isFinite(tick)||tick<=0)return 2;
 for(let digits=0;digits<=8;digits++){const scaled=tick*10**digits;if(Math.abs(scaled-Math.round(scaled))<1e-9*Math.max(1,scaled))return digits;}
 return 8;
}
export function formatDetailPrice(value:number,tick?:unknown):string{const digits=tickDecimals(tick);return value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
export function formatDetailVolume(value:number):string{return Math.abs(value)>=10000?value.toLocaleString('en-US',{notation:'compact',minimumFractionDigits:2,maximumFractionDigits:2}):Math.round(value).toLocaleString('en-US');}
export function formatDetailRatio(value:number):string{return value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
/** The display text of one numeric detail value, chosen by its label. Strings pass through unchanged. */
export function formatDetailValue(label:string,value:string|number,tick?:unknown):string{
 if(typeof value!=='number')return value;
 if(!Number.isFinite(value))return String(value);
 if(/relative volume/i.test(label)||/%/.test(label))return formatDetailRatio(value);
 if(/volume/i.test(label))return formatDetailVolume(value);
 if(/tick size|lot size|seconds|revision|count|bars/i.test(label))return value.toLocaleString('en-US',{maximumFractionDigits:16});
 if(/close|open|high|low|bid|ask|last|change|price|range/i.test(label))return formatDetailPrice(value,tick);
 return value.toLocaleString('en-US',{maximumFractionDigits:6});
}

export type DetailMarketState='open'|'pre'|'post'|'closed'|'unknown';
export interface DetailMarketStatus {state:DetailMarketState;label:string;detail:string}
/** Classify the LV calendar session reading (detailSessionState). */
export function detailMarketStatus(session:string|null|undefined):DetailMarketStatus{
 if(typeof session!=='string'||!session.trim())return{state:'unknown',label:'Market status not available',detail:'OpenCandle has a session calendar only for New York listed instruments. No exchange status feed is connected.'};
 const state:DetailMarketState=/^Regular session open/.test(session)?'open':/^Pre-market/.test(session)?'pre':/^Post-market/.test(session)?'post':/^Closed/.test(session)?'closed':'unknown';
 const label={open:'Market open',pre:'Pre-market',post:'Post-market',closed:'Market closed',unknown:'Market status not available'}[state];
 return{state,label,detail:session+'. A clock reading, not an exchange feed: halts and unscheduled closures are not known.'};
}

export interface DetailRange {id:'day'|'year';label:string;low:number|null;high:number|null;value:number|null;position:number|null;reason:string|null}
const finite=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
function range(id:DetailRange['id'],label:string,low:number|null,high:number|null,value:number|null,missing:string):DetailRange{
 if(low===null||high===null)return{id,label,low:null,high:null,value,position:null,reason:missing};
 if(low>high)return{id,label,low:null,high:null,value,position:null,reason:'The supplied low is above the supplied high.'};
 // The marker is the last supplied close, clamped into the bar; an equal low and high puts it in the middle.
 const position=value===null?null:high===low?50:Math.round(Math.min(1,Math.max(0,(value-low)/(high-low)))*10000)/100;
 return{id,label,low,high,value,position,reason:null};
}
/** Day range and 52-week range: range bars from the daily snapshot fields and the 52-week key stats. */
export function detailRanges(snapshot:DetailSnapshot):DetailRange[]{
 const daily=(label:string)=>finite(snapshot.blocks.daily.find(row=>row.label===label)?.value);
 const stat=(label:string)=>{const row=snapshot.keyStats?.find(item=>item.label===label);return row?{value:finite(row.value),reason:row.reason}:null;};
 const last=finite(snapshot.headline?.last),yearHigh=stat('52-week high'),yearLow=stat('52-week low');
 return[
  range('day','Day range',daily('Daily snapshot low'),daily('Daily snapshot high'),last,'Needs the daily bar of the day.'),
  range('year','52-week range',yearLow?.value??null,yearHigh?.value??null,last,yearHigh?.reason??yearLow?.reason??'Needs a full year of daily history.'),
 ];
}

const NO_SUMMARY='No company fundamentals are linked to this symbol. Load them with Open fundamentals.';
/**
 * The snapshot key stats with company rows filled from a validated, available fundamentals
 * summary (a local import or public SEC filing data). Only reported fields are copied; P/E is derived from the last
 * supplied close and the diluted EPS only when the EPS unit names the instrument currency and the EPS is positive.
 * summary undefined: no fundamentals integration, rows unchanged; null: none linked or rejected. Market capitalization, dividend yield and float need shares or dividend data no permitted source supplies.
 */
export function detailKeyStatsWithFundamentals(stats:readonly DetailStat[]|undefined,summary:SymbolFundamentalsSummary|null|undefined,last:number|null,currency:string|null):DetailStat[]|undefined{
 if(!stats)return undefined;
 const usable=summary&&summary.availability==='available'?summary:null,field=(id:string)=>usable?.fields.find(row=>row.id===id)??null;
 const reported=(id:string):{value:string|number|null;reason:string}=>{const row=field(id);if(!usable)return{value:null,reason:summary?.reason??NO_SUMMARY};if(!row)return{value:null,reason:'Not in the supplied fundamentals summary.'};return row.value===null?{value:null,reason:row.missingReason??'Not reported.'}:{value:typeof row.value==='number'?row.value.toLocaleString('en-US',{maximumFractionDigits:4})+(row.unit?' '+row.unit:''):row.value,reason:''};};
 const eps=field('eps_diluted'),epsValue=finite(eps?.value),epsCurrency=!!currency&&!!eps?.unit&&eps.unit.toUpperCase().startsWith(currency.toUpperCase());
 const pe=():{value:string|number|null;reason:string}=>{
  if(!usable)return{value:null,reason:summary?.reason??NO_SUMMARY};
  if(last===null)return{value:null,reason:'Needs a last supplied close.'};
  if(epsValue===null)return{value:null,reason:'Needs a reported diluted EPS.'};
  if(epsValue<=0)return{value:null,reason:'Not meaningful: diluted EPS is zero or negative.'};
  if(!epsCurrency)return{value:null,reason:'The EPS unit does not match the price currency.'};
  return{value:(Math.round(last/epsValue*100)/100).toLocaleString('en-US',{maximumFractionDigits:2})+' (last close / '+(eps!.label)+')',reason:''};
 };
 const unsupplied=(what:string)=>({value:null,reason:'Needs '+what+'. No permitted source supplies it.'});
 const company:Record<string,()=>{value:string|number|null;reason:string}>={
  'Market capitalization':()=>unsupplied('shares outstanding with the price'),'Dividend yield (indicated)':()=>unsupplied('declared dividend data'),'Shares float':()=>unsupplied('a float count'),
  'Price to earnings ratio (TTM)':pe,'Basic EPS (TTM)':()=>reported('eps_diluted'),'Net income (FY)':()=>reported('net_income'),'Revenue (FY)':()=>reported('revenue'),
 };
 return stats.map(row=>{
  const fill=company[row.label];if(!fill||summary===undefined)return row;
  const result=fill(),label=row.label==='Basic EPS (TTM)'&&usable?eps?.label??'Diluted EPS':row.label==='Price to earnings ratio (TTM)'&&usable?'Price to earnings ratio':row.label;
  return result.value===null?{label,value:null,reason:result.reason}:{label,value:result.value,reason:null};
 });
}

export interface DetailCoverageRow {id:string;label:string;value:string|null;reason:string|null}
/**
 * Detail sections without a permitted data source, stated once as not available (bonds and options too).
 * Identifiers and Company profile use the fundamentals entity when a validated summary names one.
 */
export function detailCoverage(snapshot:DetailSnapshot,summary:SymbolFundamentalsSummary|null,assetClass:string|null):DetailCoverageRow[]{
 const identity=(label:string)=>{const value=snapshot.blocks.identity.find(row=>row.label===label)?.value;return value===null||value===undefined?null:String(value);};
 const fund=/^(etf|fund|etn)$/i.test(assetClass??''),none=(id:string,label:string,reason:string):DetailCoverageRow=>({id,label,value:null,reason});
 const entity=summary?.entity??null;
 return[
  {id:'exchange',label:'Exchange',value:displayExchange(snapshot.exchange)+(identity('Exchange timezone')?' ('+identity('Exchange timezone')+')':''),reason:null},
  entity?{id:'profile',label:'Company',value:entity.name,reason:null}:none('profile','Company profile','No company profile source is connected.'),
  entity?.cik?{id:'identifiers',label:'Identifiers',value:'CIK '+entity.cik+' (no ISIN or CUSIP)',reason:null}:none('identifiers','Identifiers','No ISIN, CUSIP or CIK for this symbol.'),
  none('sector','Sector and industry','No classification source is connected.'),
  none('earnings','Earnings','No earnings calendar or estimates source is connected.'),
  none('dividends','Dividends','No dividend history source is connected.'),
  ...(fund?[none('etf-holdings','ETF holdings','No holdings source is connected.'),none('etf-expense','ETF expense ratio','No fund data source is connected.')]:[]),
  none('technical','Technical ratings','No reviewed rating method is defined in OpenCandle.'),
  none('seasonals','Seasonals','Not shown in Details. Use the chart seasonality indicator with loaded daily bars.'),
  none('news','News','Not shown in Details. Use the News dialog with locally imported news.'),
  none('bonds','Related bonds','No bond data source is connected.'),
  none('options','Options data','No options data source is connected.'),
 ];
}
