import type {PitCompany} from '../fundamentals/pit-metrics';
import type {AdjustmentBasis} from './types';

/**
 * Company filings for the `fundamental` and `pebands` indicators.
 *
 * The application installs one loader (setFundamentalsLoader, src/fundamentals/fundamentals-service.ts). A calculation
 * only reads: a lookup returns what is in memory now and, when nothing is there yet, asks the loader to read its saved
 * copy. Network requests are never started by a calculation; they start only from the user's own actions (adding a
 * fundamentals indicator, Refresh company data) and the once-a-day refresh of a chart that is on screen.
 * `notifyFundamentals` is called when company data arrives or changes, so the indicators that read it recalculate.
 * Without a loader (tests, a secondary window, the off-chart export without saved data) every lookup is unavailable
 * with a plain reason.
 */
/** The chart facts a fundamentals lookup needs, from the chart's own source. */
export interface FundamentalsChartFacts {symbol:string;exchange:string;assetClass:string;currency:string|null;adjustment:AdjustmentBasis;synthetic:boolean;instrument:string|null}
export interface FundamentalsState {
 state:'ready'|'loading'|'unavailable';
 /** The prepared company, when its filings are loaded and pass every gate. */
 company:PitCompany|null;
 /** Why there is no company (gates, loading, offline); null when ready. */
 reason:string|null;
 cik:string|null;
}
/** What a calculation reads: the chart facts and the current company state. */
export interface FundamentalsLookup {facts:FundamentalsChartFacts|null;company():FundamentalsState}
export interface FundamentalsLoader {company(facts:FundamentalsChartFacts):FundamentalsState}

export const FUNDAMENTALS_TEXT=Object.freeze({
 noService:'Fundamentals load on a chart in the desktop app.',
 noFacts:'This chart does not say which company it shows, so no filings can be matched to it.',
 assetClass:(name:string)=>'Fundamentals come from SEC company filings and do not apply to '+name+' symbols.',
 index:'Indexes have no SEC filings. Add this to a company\'s chart.',
 fund:'ETFs and funds have no company earnings to chart.',
 noCik:(symbol:string)=>'No SEC company is known for '+symbol+'. Check the symbol, or import a ticker file in Fundamentals.',
 identity:'Add your SEC contact in this indicator\'s settings to load company data.',
 ifrs:(entity:string,form:string)=>entity+' reports under IFRS (form '+form+'). This version reads US GAAP filings only.',
 demo:'Demo charts have no company filings. Link the demo company in Fundamentals to try this.',
 loading:(symbol:string)=>'Loading SEC company data for '+symbol+'.',
 offline:'OpenCandle could not reach SEC. Nothing is cached for this company yet.',
 backoff:(time:string)=>'SEC paused requests. Try again after '+time+'.',
 disabledRun:'SEC requests are off in demo and automated runs.',
 notCached:(symbol:string)=>'No SEC company data is saved for '+symbol+' yet. Choose Refresh company data in the legend menu to load it.',
 desktopOnly:'SEC company data loads in the desktop app.',
 interval:'The chart interval is unknown, so filings cannot be placed on its bars.',
});
const ASSET_NAMES:Readonly<Record<string,string>>={crypto:'crypto',forex:'forex',future:'futures',option:'options',bond:'bond',commodity:'commodity'};
/** The checks that need no data at all (asset class). Null when the symbol may have SEC filings. Nothing is requested. */
export function fundamentalsChartGate(facts:FundamentalsChartFacts|null):string|null{
 if(!facts||!facts.symbol)return FUNDAMENTALS_TEXT.noFacts;
 if(facts.assetClass==='index')return FUNDAMENTALS_TEXT.index;
 if(facts.assetClass==='etf')return FUNDAMENTALS_TEXT.fund;
 const name=ASSET_NAMES[facts.assetClass];return name?FUNDAMENTALS_TEXT.assetClass(name):null;
}

let loader:FundamentalsLoader|null=null;
const listeners=new Set<()=>void>();
export function setFundamentalsLoader(next:FundamentalsLoader|null):void{loader=next;notifyFundamentals();}
export function fundamentalsLoader():FundamentalsLoader|null{return loader;}
/** The company state for these chart facts. Never throws; never sends a request. */
export function fundamentalsCompany(facts:FundamentalsChartFacts|null):FundamentalsState{
 const gate=fundamentalsChartGate(facts);if(gate)return {state:'unavailable',company:null,reason:gate,cik:null};
 if(!loader)return {state:'unavailable',company:null,reason:FUNDAMENTALS_TEXT.noService,cik:null};
 try{return loader.company(facts!);}catch(error){return {state:'unavailable',company:null,reason:error instanceof Error?error.message:String(error),cik:null};}
}
/** A lookup bound to one chart's facts (what the chart passes to the calculation). */
export function fundamentalsLookup(facts:FundamentalsChartFacts|null|undefined):FundamentalsLookup{
 const bound=facts??null;return {facts:bound,company:()=>fundamentalsCompany(bound)};
}
export function subscribeFundamentals(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
export function notifyFundamentals():void{for(const listener of [...listeners]){try{listener();}catch{/* one failure never stops the others */}}}
