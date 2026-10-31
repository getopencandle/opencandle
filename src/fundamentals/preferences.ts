import {dateDay} from './company-facts';
import {restoreGraphConfig,type GraphConfig} from './graph';
import {COLUMN_LIMITS,type StatementBasis,type StatementKind,type StatementRevisions,type StatementScale} from './statements';
/** Persistable fundamentals view and explicit chart-symbol links. A link is the user's own
 * statement that a filing entity belongs to a market; LV never maps tickers to CIKs by itself. */
export type FundamentalsTab=StatementKind|'facts';
export type CutoffMode='today'|'date'|'none';
export interface FundamentalsView {tab:FundamentalsTab;basis:StatementBasis;currency:string|null;scale:StatementScale;cutoffMode:CutoffMode;cutoffDate:string|null;revisions:StatementRevisions;columns:typeof COLUMN_LIMITS[number];line:string|null}
export interface FundamentalsMarket {exchange:string;symbol:string;synthetic:boolean}
export interface FundamentalsLink extends FundamentalsMarket {documentId:string}
export interface FundamentalsPreferences {schemaVersion:1;view:FundamentalsView;links:FundamentalsLink[];/** Saved Graph tab configuration; absent until the user saves one. */graph?:GraphConfig}
export const MAX_FUNDAMENTALS_LINKS=1000;
export function createFundamentalsView():FundamentalsView{return {tab:'income',basis:'FY',currency:null,scale:'auto',cutoffMode:'today',cutoffDate:null,revisions:'latest',columns:8,line:null};}
export function createFundamentalsPreferences():FundamentalsPreferences{return {schemaVersion:1,view:createFundamentalsView(),links:[]};}
export const utcToday=(now:Date=new Date())=>now.toISOString().slice(0,10);
/** Resolved inclusive filing cutoff: today (UTC calendar day), a chosen day, or none. */
export function resolveFilingCutoff(view:FundamentalsView,today:string):string|null{
 if(view.cutoffMode==='none')return null;
 const day=view.cutoffMode==='today'?today:view.cutoffDate;
 if(day===null)throw new Error('Choose a filing cutoff date.');dateDay(day);return day;
}
const own=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const short=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function restoreFundamentalsView(input:unknown):FundamentalsView{
 if(!own(input)||!exact(input,['tab','basis','currency','scale','cutoffMode','cutoffDate','revisions','columns','line']))throw new Error('Invalid fundamentals view settings.');
 const v=input;
 if(!['income','balance','cashflow','statistics','facts'].includes(v.tab as string)||!['FY','FQ','TTM'].includes(v.basis as string)||!['auto','units','thousands','millions','billions'].includes(v.scale as string)||!['today','date','none'].includes(v.cutoffMode as string)||!['latest','original'].includes(v.revisions as string)||!(COLUMN_LIMITS as readonly unknown[]).includes(v.columns))throw new Error('Invalid fundamentals view option.');
 if(!(v.currency===null||short(v.currency,40))||!(v.line===null||short(v.line,64)))throw new Error('Invalid fundamentals view selection.');
 if(v.cutoffDate!==null){if(typeof v.cutoffDate!=='string')throw new Error('Invalid fundamentals filing cutoff.');dateDay(v.cutoffDate);}
 if(v.cutoffMode==='date'&&v.cutoffDate===null)throw new Error('A dated filing cutoff needs its date.');
 return {tab:v.tab as FundamentalsTab,basis:v.basis as StatementBasis,currency:v.currency as string|null,scale:v.scale as StatementScale,cutoffMode:v.cutoffMode as CutoffMode,cutoffDate:v.cutoffDate as string|null,revisions:v.revisions as StatementRevisions,columns:v.columns as FundamentalsView['columns'],line:v.line as string|null};
}
const marketKey=(market:FundamentalsMarket)=>JSON.stringify([market.exchange,market.symbol,market.synthetic]);
export function restoreFundamentalsPreferences(input:unknown):FundamentalsPreferences{
 if(!own(input)||!(exact(input,['schemaVersion','view','links'])||exact(input,['schemaVersion','view','links','graph']))||input.schemaVersion!==1||!Array.isArray(input.links)||input.links.length>MAX_FUNDAMENTALS_LINKS)throw new Error('Invalid fundamentals preferences.');
 const keys=new Set<string>(),links:FundamentalsLink[]=[];
 for(const link of input.links){
  if(!own(link)||!exact(link,['exchange','symbol','synthetic','documentId'])||!short(link.exchange,40)||!short(link.symbol,64)||typeof link.synthetic!=='boolean'||!short(link.documentId,200))throw new Error('Invalid fundamentals symbol link.');
  const next={exchange:link.exchange as string,symbol:link.symbol as string,synthetic:link.synthetic,documentId:link.documentId as string},key=marketKey(next);
  if(keys.has(key))throw new Error('Duplicate fundamentals symbol link.');keys.add(key);links.push(next);
 }
 return {schemaVersion:1,view:restoreFundamentalsView(input.view),links,...(Object.hasOwn(input,'graph')?{graph:restoreGraphConfig(input.graph)}:{})};
}
export function linkedDocumentId(links:readonly FundamentalsLink[],market:FundamentalsMarket):string|null{const key=marketKey(market);return links.find(link=>marketKey(link)===key)?.documentId??null;}
/** Replace (documentId) or remove (null) the single link for an exact market identity. */
export function setFundamentalsLink(preferences:FundamentalsPreferences,market:FundamentalsMarket,documentId:string|null):FundamentalsPreferences{
 if(!short(market.exchange,40)||!short(market.symbol,64)||typeof market.synthetic!=='boolean'||documentId!==null&&!short(documentId,200))throw new Error('Invalid fundamentals symbol link.');
 const key=marketKey(market),links=preferences.links.filter(link=>marketKey(link)!==key);
 if(documentId!==null){if(links.length>=MAX_FUNDAMENTALS_LINKS)throw new Error('Too many fundamentals symbol links.');links.push({exchange:market.exchange,symbol:market.symbol,synthetic:market.synthetic,documentId});}
 return {...preferences,links};
}
/** Remove links whose document no longer exists (for example after Remove saved data). */
export function pruneFundamentalsLinks(preferences:FundamentalsPreferences,documentIds:readonly string[]):FundamentalsPreferences{
 const ids=new Set(documentIds),links=preferences.links.filter(link=>ids.has(link.documentId));
 return links.length===preferences.links.length?preferences:{...preferences,links};
}
