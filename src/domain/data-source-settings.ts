import type {LiveBridgeResult} from './live-provider';
import type {AlpacaKeyStatus,AlpacaStatus} from './alpaca-live';
import {ALPACA_MAX_SYMBOLS} from './alpaca-live';
import {COINBASE_PRODUCTS} from './coinbase-live';
import {IMPORT_MAX_BYTES,IMPORT_MAX_ROWS} from './data-setup';

/**
 * The Data sources page, organised by what a new user needs. Pure data and pure status rules: no network,
 * no key. Every requirement below is what the code actually does (electron/public-*.cjs); anything OpenCandle cannot check
 * itself (a provider's sign-up steps) is worded as the provider's.
 *
 * The text is user-facing: plain words, no internal ids, no em dashes.
 */
export type DataNeedId='demo'|'stocks-live'|'stocks-history'|'crypto'|'macro'|'fundamentals'|'own-files'|'other-markets';
export type DataNeedState='ready'|'on'|'off'|'set-up'|'connected'|'not-set-up'|'attention'|'own-files';
export interface DataNeed {
 id:DataNeedId;
 /** What the user wants, in their words. */
 title:string;
 /** The minimum needed, one short line. */
 minimum:string;
 /** What it gives, and what it does not. */
 gives:string;
 /** How to get it, one or two short lines. */
 howTo:string;
 /** Section of the page with the controls (scroll target), when there is one. */
 section?:'alpaca'|'coinbase'|'fred'|'own-files';
}
const MB=(bytes:number)=>Math.round(bytes/(1024*1024));
export const DATA_NEEDS:readonly DataNeed[]=Object.freeze([
 {id:'demo',title:'Example charts',minimum:'Nothing. Built in.',
  gives:'Invented prices for BTC, ETH, SPY, GME and AAPL, so you can try every feature. They are not real market prices and appear only on the example screen.',
  howTo:'Choose Load example data on any chart that has no live data. Leave example mode to go back.'},
 {id:'stocks-live',title:'Real-time US stocks and ETFs',minimum:'A free Alpaca account and its API key.',
  gives:`Free plan: live prices from the IEX exchange, up to ${ALPACA_MAX_SYMBOLS} symbols at once (IEX is one exchange, so volume looks lower than the whole market). A paid Alpaca market data plan adds live prices from all exchanges.`,
  howTo:'Sign up at alpaca.markets (a free paper trading account is enough), create an API key in the Alpaca dashboard and paste it below.',
  section:'alpaca'},
 {id:'stocks-history',title:'US stock history (daily and intraday bars)',minimum:'The same free Alpaca key.',
  gives:'History from all US exchanges, with splits and dividends. On the free plan the newest 15 minutes come from IEX.',
  howTo:'Nothing extra once the Alpaca key is saved. Closed bars are kept on this computer so charts open faster.',
  section:'alpaca'},
 {id:'crypto',title:'Crypto',minimum:'Nothing. No account or key.',
  gives:`Live prices and history for ${COINBASE_PRODUCTS.join(', ')} from Coinbase public market data.`,
  howTo:'Turn on Live crypto data in Crypto below.',section:'coinbase'},
 {id:'macro',title:'Economic data and rates',minimum:'Nothing. No account or key.',
  gives:'Treasury yields, inflation, jobs and thousands of other series from the St. Louis Fed (FRED), daily or slower.',
  howTo:'Type FRED: and a series id in the symbol search, for example FRED:DGS10, or open Markets. Each series downloads only when you open it.',
  section:'fred'},
 {id:'fundamentals',title:'Company fundamentals and SEC filings',minimum:'Nothing. No account or key.',
  gives:'Reported financials and the filing list for US-listed companies, from the SEC\'s public EDGAR service. Not prices.',
  howTo:'Open Fundamentals or SEC filings for a company. Nothing is downloaded until you ask.'},
 {id:'own-files',title:'Use your own data (any market)',minimum:'A CSV or JSON file of price bars.',
  gives:`Columns time (or date), open, high, low, close, volume. Up to ${MB(IMPORT_MAX_BYTES)} MB and ${IMPORT_MAX_ROWS.toLocaleString('en-US')} rows per file. You are responsible for the rights to data you import.`,
  howTo:'Use Import a file below. The import window shows the format, a preview and example files.',
  section:'own-files'},
 {id:'other-markets',title:'Options, futures, forex and live news',minimum:'Not available from a built-in source.',
  gives:'OpenCandle has no built-in feed for these.',
  howTo:'Import your own files: price bars as above, and news, calendars or watchlists from their own Import buttons.'},
]);
export interface DataNeedInputs {
 /** Null while the key status is still loading, or outside the desktop app. */
 alpacaKey:AlpacaKeyStatus|null;
 alpacaStream?:AlpacaStatus|null;
 coinbaseEnabled:boolean;
 fredEnabled:boolean;
 /** False in a browser preview: nothing can be set up. */
 desktop:boolean;
}
export interface DataNeedStatus {state:DataNeedState;label:string}
/** The status pill for one row. Never claims "connected" unless the live stream says so. */
export function dataNeedStatus(id:DataNeedId,input:DataNeedInputs):DataNeedStatus{
 switch(id){
  case 'demo':return{state:'ready',label:'Ready'};
  case 'fundamentals':return input.desktop?{state:'ready',label:'Ready, nothing to set up'}:{state:'attention',label:'Needs the desktop app'};
  case 'other-markets':return{state:'own-files',label:'Your own files only'};
  case 'own-files':return input.desktop?{state:'ready',label:'Ready, nothing to set up'}:{state:'attention',label:'Needs the desktop app'};
  case 'crypto':return !input.desktop?{state:'attention',label:'Needs the desktop app'}:input.coinbaseEnabled?{state:'on',label:'On'}:{state:'off',label:'Switched off'};
  case 'macro':return !input.desktop?{state:'attention',label:'Needs the desktop app'}:input.fredEnabled?{state:'on',label:'On, nothing to set up'}:{state:'off',label:'Downloads off'};
  case 'stocks-live':case 'stocks-history':{
   if(!input.desktop)return{state:'attention',label:'Needs the desktop app'};
   const key=input.alpacaKey;
   if(!key)return{state:'not-set-up',label:'Checking...'};
   if(key.configured){
    if(id==='stocks-live'&&input.alpacaStream?.state==='ready')return{state:'connected',label:'Connected'};
    if(id==='stocks-live'&&input.alpacaStream?.state==='auth-failed')return{state:'attention',label:'Key not accepted'};
    return{state:'set-up',label:'Key saved'};
   }
   if(key.unreadable)return{state:'attention',label:'Enter your key again'};
   if(!key.encryption)return{state:'attention',label:'Cannot save keys here'};
   return{state:'not-set-up',label:'Not set up'};
  }
 }
}

/** The non-secret provider choices the page can export and import (the workspace's liveData). */
export interface DataSourceSettings {coinbase:boolean;alpacaSymbols:string[];alpacaPlan?:'paid';fred?:false}
/** What the desktop process says about where things are saved. */
export interface DataSourcesInfo {directory:string;insideAppFolder:boolean;encryption:boolean;keySaved:boolean}
export interface DataSourceSettingsBridge {
 dataSourcesInfo():Promise<LiveBridgeResult<DataSourcesInfo>>;
 openDataFolder():Promise<LiveBridgeResult<{opened:boolean}>>;
 exportDataSourceSettings(input:{settings:DataSourceSettings}):Promise<LiveBridgeResult<{fileName:string;bytes:number}>>;
 importDataSourceSettings():Promise<LiveBridgeResult<{fileName:string;settings:DataSourceSettings}>>;
}
/** One-line description of how keys are protected, for the saved-info section. */
export function describeKeyProtection(info:Pick<DataSourcesInfo,'encryption'>|null):string{
 if(!info)return 'Checking how keys are protected...';
 return info.encryption
  ?'API keys are encrypted with your Windows sign-in before they are saved, so only you, on this computer, can unlock them. They are never shown again, logged, or included in workspace backups or exports.'
  :'Windows encryption is not available here, so OpenCandle will not save API keys at all (it never stores them unencrypted). Everything else is saved normally.';
}
