'use strict';
// Optional Alpaca Market Data (owner's own free Basic plan key). Main process only.
// The owner types a key id and secret into OpenCandle; they are encrypted with Electron safeStorage
// (DPAPI on Windows) into the app profile and never returned to the renderer, logged, exported or put in URLs.
// Real-time: IEX only (wss://stream.data.alpaca.markets/v2/iex). History: REST /v2/stocks/{symbol}/bars with
// feed=iex (to now) or feed=sip ending at least 15 minutes ago (Basic plan excludes the latest 15 minutes).
// Sources (checked 2026-10-20): docs.alpaca.markets real-time-stock-pricing-data, streaming-market-data,
// about-market-data-api, reference/stockbarsingle-1. No Alpaca endpoint was called while building this.
const fs=require('node:fs/promises');
const path=require('node:path');
const {BoundaryError,exactKeys,cancelInput}=require('./validation.cjs');

const REST_ORIGIN='https://data.alpaca.markets';
const WS_URL='wss://stream.data.alpaca.markets/v2/iex';
// The consolidated (all exchanges) real-time stream, used only when the owner picks the Paid data plan.
const WS_SIP_URL='wss://stream.data.alpaca.markets/v2/sip';
// Data plans: free (Basic: IEX real time, SIP history ending 15 minutes ago) or paid (SIP real time, no SIP delay).
const PLANS=Object.freeze(['free','paid']);
const TIMEFRAMES=Object.freeze({'1Min':60,'5Min':300,'15Min':900,'1Hour':3600,'1Day':86400});
const FEEDS=Object.freeze(['iex','sip']);
// Alpaca's documented `adjustment` values that OpenCandle asks for. The renderer sends split (the usual
// stock default) or split,dividend ("Adjust data for dividends"); a request without one stays raw (the connection test).
const ADJUSTMENTS=Object.freeze(['raw','split','split,dividend']);
const SIP_DELAY_SECONDS=900;
const MAX_SYMBOLS=30; // Basic plan WebSocket symbol cap
const MAX_LIMIT=10000;
const REST_MAX_BYTES=8*1024*1024;
const REST_TIMEOUT_MS=20000; // a full 10,000-bar page is about 1 MB; leave room for slow links
const REST_MIN_INTERVAL_MS=300; // Basic plan: 200 historical calls per minute
const REST_MAX_QUEUE=32; // a multi-chart layout backfills several charts and seeds at once
const REST_ERROR_BODY_BYTES=4096;
const REST_DENIED_BACKOFF_MS=60*1000;
const WS_MAX_MESSAGE_BYTES=1024*1024;
// The per-second frame budgets. Frames that carry bars, trades or control messages keep the 200 a second
// budget they had before quotes existed; quote-only frames never count against it. Quote-only frames have their own
// budget; a frame over it is shed (counted in counters.quotesDropped) and the stream sheds quote subscriptions (below).
// Every frame also counts against a much higher hard cap on frames and bytes, so a broken or hostile stream cannot freeze
// the main process. So quote traffic, however dense, never uses up the bar and trade budget; what is shed is quotes.
const WS_MAX_MESSAGES_PER_SECOND=200;
const WS_MAX_QUOTE_MESSAGES_PER_SECOND=2500;
const WS_MAX_QUOTE_BYTES_PER_SECOND=4*1024*1024;
const WS_HARD_MESSAGES_PER_SECOND=10000;
const WS_HARD_BYTES_PER_SECOND=16*1024*1024;
// A second with shed quote frames (or a dropped bar or trade frame while quotes are subscribed) sheds one quote level:
// first the symbols no chart, ticket or watchlist row is showing, then every quote. One level comes back after this long.
const WS_QUOTE_SHED_RETRY_MS=5*60*1000;
const QUOTE_SHED_LEVELS=Object.freeze(['all','shown','none']);
const WS_AUTH_TIMEOUT_MS=10000; // documented: authenticate within 10 seconds
const WS_BACKOFF_BASE_MS=2000;
const WS_BACKOFF_MAX_MS=120000;
const WS_LIMIT_BACKOFF_MS=60000;
const WS_REKEY_DELAY_MS=2000; // free plan allows one stream connection: let the old one close before the new key connects
const FLUSH_MS=250; // Also the quote throttle: at most one quote per symbol per flush (4 a second)
const EARLIEST=Date.UTC(2015,0,1)/1000;
const CREDENTIAL_FILE='alpaca-market-data.key';
// Same expression as src/domain/alpaca-live.ts ALPACA_SYMBOL: 1-5 letter root, up to two dotted 1-3 letter suffixes
// (BRK.B, GME.WS, XYZ.WS.A, ABC.PRA). At most 13 characters, so no path or query text can pass.
const SYMBOL=/^[A-Z]{1,5}(?:\.[A-Z]{1,3}){0,2}$/;
// The asset list lives on the Trading API, not the Market Data host. Paper keys (PK...) use the paper host.
// Source (checked 2026-10-21): docs.alpaca.markets reference/get-v2-assets (GET /v2/assets?status=active&asset_class=us_equity).
const TRADING_ORIGIN='https://api.alpaca.markets';
const PAPER_TRADING_ORIGIN='https://paper-api.alpaca.markets';
const ASSETS_MAX_BYTES=48*1024*1024; // the full US equity list is roughly 10-15 MB of JSON
const ASSETS_TIMEOUT_MS=45000;
const ASSETS_MAX_RESULTS=25;
const ASSET_QUERY=/^[\x20-\x7e]{1,40}$/;
const ASSET_SYMBOL=/^[\x21-\x7e]{1,20}$/;
// Alpaca key IDs are capital letters and digits (paper keys start PK, live keys AK; 20 characters today).
// Secrets are about 40 characters; Alpaca does not document the alphabet, so base64/url-safe characters are allowed.
const KEY_ID=/^[A-Z0-9]{16,64}$/;
const SECRET=/^[A-Za-z0-9+/=._~-]{20,128}$/;
const PAGE_TOKEN=/^[A-Za-z0-9+/=_-]{1,512}$/;
const LICENSE='Alpaca Market Data (owner account, Basic plan): personal display only; not redistributable.';
const fail=(code,message)=>{throw new BoundaryError(code,message);};
/** Subscription message for the bar and trade channels, plus the quote channel for `quoteList` (an
 * explicit subset, so a shed symbol keeps its bars and trades without its quotes). */
const channels=(action,list,quoteList)=>({action,bars:list,updatedBars:list,dailyBars:list,trades:list,...(quoteList&&quoteList.length?{quotes:quoteList}:{})});
/** True when every `"T"` key of a text frame is a quote ("q"). A cheap scan before JSON.parse decides which
 * budget a frame uses. Conservative: a frame with any other type, no type, or any backslash escape (which could hide a
 * key) counts as a bar and trade frame, so a frame that might hold a bar or trade is never treated as quote-only. */
const TYPE_KEY=/"T"\s*:\s*"([^"]*)"/g;
function quoteOnlyFrame(text){
  if(text.indexOf('\\')!==-1)return false;
  TYPE_KEY.lastIndex=0;let quotes=0,match;
  while((match=TYPE_KEY.exec(text))!==null){if(match[1]!=='q'){TYPE_KEY.lastIndex=0;return false;}quotes++;}
  return quotes>0;
}
const failure=(error,code='INVALID_ARGUMENT',message='Invalid request.')=>({ok:false,error:{code:error instanceof BoundaryError?error.code:code,message:error instanceof BoundaryError?error.message:message}});

/** Pasted keys often carry spaces, a line break or quotes from the Alpaca dashboard or a note: remove those ends only. */
const pasted=value=>typeof value==='string'?value.trim().replace(/^(["'`])(.*)\1$/s,'$2').trim():value;
function alpacaKeyInput(value){
  exactKeys(value,['keyId','secret']);
  const keyId=pasted(value.keyId),secret=pasted(value.secret);
  if(typeof keyId!=='string'||typeof secret!=='string')fail('INVALID_ARGUMENT','Enter both the Alpaca API key ID and the secret key.');
  if(!KEY_ID.test(keyId)&&KEY_ID.test(secret)&&/^[PA]K/.test(secret))fail('INVALID_ARGUMENT','The key ID and secret look swapped. The API key ID starts with PK (paper) or AK (live); the longer secret goes in the Secret key box.');
  if(!KEY_ID.test(keyId))fail('INVALID_ARGUMENT','That is not an Alpaca API key ID. Copy the "API Key" value from the Alpaca dashboard (capital letters and digits, a paper key starts with PK).');
  if(!SECRET.test(secret))fail('INVALID_ARGUMENT','That is not an Alpaca secret key. Copy the "Secret Key" value shown when the key was created (about 40 characters, no spaces).');
  return {keyId,secret};
}

/** Encrypted credential file. Plaintext is never written: without OS encryption, saving is refused. */
class AlpacaKeyStore {
  constructor({safeStorage,directory}){this.safeStorage=safeStorage;this.file=path.join(directory,CREDENTIAL_FILE);this.cache=undefined;}
  available(){try{return !!this.safeStorage&&this.safeStorage.isEncryptionAvailable()===true;}catch{return false;}}
  async save(input){
    const raw=alpacaKeyInput(input);
    if(!this.available())fail('KEY_STORAGE_UNAVAILABLE','Windows encryption is unavailable, so the key was not saved.');
    const sealed=this.safeStorage.encryptString(JSON.stringify({v:1,keyId:raw.keyId,secret:raw.secret}));
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.'+process.pid+'.tmp';
    await fs.writeFile(temp,sealed,{mode:0o600});
    await fs.rename(temp,this.file);
    this.cache={keyId:raw.keyId,secret:raw.secret};this.unreadable=false;
    return this.status();
  }
  async load(){
    if(this.cache!==undefined)return this.cache;
    // A key file that exists but cannot be unlocked (encryption off, another Windows user or a copied
    // profile) is reported as `unreadable` so the page can ask for the key again. The file is kept, never deleted here.
    this.unreadable=false;
    let bytes;try{bytes=await fs.readFile(this.file);}catch{this.cache=null;return null;}
    if(!this.available()){this.cache=null;this.unreadable=true;return null;}
    try{const value=JSON.parse(this.safeStorage.decryptString(bytes));if(value?.v!==1||!KEY_ID.test(value.keyId)||!SECRET.test(value.secret))throw Error();this.cache={keyId:value.keyId,secret:value.secret};}
    catch{this.cache=null;this.unreadable=true;}
    return this.cache;
  }
  async status(){const keys=await this.load();return {configured:!!keys,keyIdHint:keys?'****'+keys.keyId.slice(-4):null,encryption:this.available(),...(!keys&&this.unreadable?{unreadable:true}:{})};}
  async clear(){this.cache=null;this.unreadable=false;await fs.rm(this.file,{force:true});return this.status();}
}

function symbolInput(value){if(typeof value!=='string'||!SYMBOL.test(value))fail('INVALID_ARGUMENT','Enter a US stock symbol such as AAPL or BRK.B.');return value;}
function iso(seconds){return new Date(seconds*1000).toISOString().replace('.000Z','Z');}
function barsInput(value,nowSeconds){
  exactKeys(value,['requestId','symbol','timeframe','feed','start','end'],['pageToken','adjustment','plan']);
  cancelInput({requestId:value.requestId});
  const symbol=symbolInput(value.symbol);
  if(typeof value.timeframe!=='string'||!Object.hasOwn(TIMEFRAMES,value.timeframe))fail('INVALID_ARGUMENT','Unsupported Alpaca timeframe.');
  if(!FEEDS.includes(value.feed))fail('INVALID_ARGUMENT','Alpaca feed must be iex or sip.');
  let {start,end}=value;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<EARLIEST||end<=start||end>nowSeconds+86400)fail('INVALID_ARGUMENT','Invalid bar time range.');
  if(value.plan!==undefined&&!PLANS.includes(value.plan))fail('INVALID_ARGUMENT','Alpaca data plan must be free or paid.');
  const plan=value.plan??'free';
  // Basic plan: SIP history excludes the latest 15 minutes, so the request ends there (a paid plan has no SIP delay).
  if(value.feed==='sip'&&plan==='free')end=Math.min(end,nowSeconds-SIP_DELAY_SECONDS);
  if(end<=start)fail('INVALID_ARGUMENT','SIP history on the free plan ends 15 minutes ago.');
  if(value.pageToken!==undefined&&(typeof value.pageToken!=='string'||!PAGE_TOKEN.test(value.pageToken)))fail('INVALID_ARGUMENT','Invalid page token.');
  if(value.adjustment!==undefined&&!ADJUSTMENTS.includes(value.adjustment))fail('INVALID_ARGUMENT','Alpaca adjustment must be raw, split or split,dividend.');
  return {requestId:value.requestId,symbol,timeframe:value.timeframe,seconds:TIMEFRAMES[value.timeframe],feed:value.feed,start,end,pageToken:value.pageToken,adjustment:value.adjustment??'raw',plan};
}
function subscribeInput(value){
  exactKeys(value,['symbols'],['feed','quotes','quotesFor']);
  subscribeFeedInput(value);subscribeQuotesInput(value);
  if(!Array.isArray(value.symbols)||value.symbols.length<1||value.symbols.length>MAX_SYMBOLS)fail('INVALID_ARGUMENT','Subscribe to between 1 and 30 symbols.');
  const symbols=value.symbols.map(symbolInput);
  if(new Set(symbols).size!==symbols.length)fail('INVALID_ARGUMENT','Duplicate symbols.');
  subscribeQuotesForInput(value);
  return [...symbols].sort();
}
/** `quotesFor` names the subscribed symbols whose bid and ask are on screen (a chart, the order ticket, a
 * watchlist row). It only decides what is shed first under quote overload; it never adds a subscription. Absent: none. */
function subscribeQuotesForInput(value){
  if(value.quotesFor===undefined)return [];
  if(!Array.isArray(value.quotesFor)||value.quotesFor.length>MAX_SYMBOLS)fail('INVALID_ARGUMENT','Alpaca quotesFor must list at most 30 symbols.');
  const list=value.quotesFor.map(symbolInput);
  if(new Set(list).size!==list.length)fail('INVALID_ARGUMENT','Duplicate symbols.');
  if(Array.isArray(value.symbols)&&list.some(symbol=>!value.symbols.includes(symbol)))fail('INVALID_ARGUMENT','Alpaca quotesFor must name subscribed symbols only.');
  return [...list].sort();
}
/** The stream feed, iex (the free plan, default) or sip (a paid plan). */
/** `quotes: true` adds the stream's quote channel (best bid and ask) for the same symbols, on the
 * same feed (IEX on the free plan, SIP on paid), inside the same 30-symbol list. Absent or false: no quote channel. */
function subscribeQuotesInput(value){
  if(value.quotes!==undefined&&typeof value.quotes!=='boolean')fail('INVALID_ARGUMENT','Alpaca quotes must be true or false.');
  return value.quotes===true;
}
function subscribeFeedInput(value){
  if(value.feed!==undefined&&!FEEDS.includes(value.feed))fail('INVALID_ARGUMENT','Alpaca feed must be iex or sip.');
  return value.feed??'iex';
}
/** A symbol or company-name query. Printable ASCII only, at most 40 characters, upper-cased. */
function assetsInput(value){
  exactKeys(value,['query']);
  const query=typeof value.query==='string'?value.query.trim().toUpperCase():null;
  if(!query||!ASSET_QUERY.test(query))fail('INVALID_ARGUMENT','Type a symbol or company name (at most 40 letters, digits or punctuation).');
  return {query};
}
const assetsUrl=keyId=>(/^PK/.test(String(keyId))?PAPER_TRADING_ORIGIN:TRADING_ORIGIN)+'/v2/assets?status=active&asset_class=us_equity';
const assetText=(value,max)=>typeof value==='string'?value.replace(/[^\x20-\x7e]/g,'').trim().slice(0,max):'';
/** Alpaca asset objects {symbol,name,exchange,status,tradable,...}. Malformed rows are skipped; anything but a list fails. */
function validateAssets(raw){
  if(!Array.isArray(raw))fail('ALPACA_SCHEMA_INVALID','Alpaca sent an asset list in an unexpected shape.');
  const rows=[];
  for(const item of raw){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.symbol!=='string'||!ASSET_SYMBOL.test(item.symbol))continue;
    const name=assetText(item.name,200),symbol=item.symbol;
    rows.push({symbol,name,exchange:assetText(item.exchange,16),tradable:item.tradable===true,status:assetText(item.status,16)||'unknown',chartable:SYMBOL.test(symbol),warrant:/\bwarrants?\b/i.test(name)||/\.WS(?:\.|$)/.test(symbol)});
  }
  return rows;
}
/** Exact symbol, then the root before a dot (GME finds GME.WS), then symbol prefix, symbol text, company name. */
function rankAssets(rows,query){
  const scored=[];
  for(const row of rows){
    const name=row.name.toUpperCase();
    const score=row.symbol===query?0:row.symbol.split('.')[0]===query?1:row.symbol.startsWith(query)?2:query.length>1&&row.symbol.includes(query)?3:query.length>1&&name.includes(query)?4:null;
    if(score!==null)scored.push({row,score});
  }
  scored.sort((a,b)=>a.score-b.score||(a.row.symbol<b.row.symbol?-1:a.row.symbol>b.row.symbol?1:0));
  return {assets:scored.slice(0,ASSETS_MAX_RESULTS).map(entry=>({...entry.row})),total:scored.length};
}
const newYorkDay=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
function parseTime(value){
  if(typeof value!=='string'||value.length>40)return null;
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match)return null;
  const ms=Date.parse(match[1]+'.'+(match[2]||'0').padEnd(3,'0').slice(0,3)+match[3]);
  return Number.isFinite(ms)?ms:null;
}
const positive=(value,field)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0)fail('ALPACA_SCHEMA_INVALID','Alpaca '+field+' is invalid.');return value;};
const nonnegative=(value,field)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail('ALPACA_SCHEMA_INVALID','Alpaca '+field+' is invalid.');return value;};
/** Alpaca bar {t,o,h,l,c,v,n,vw}. Intraday bars must align to the timeframe; daily bars start at New York midnight. */
function bar(value,seconds,nowSeconds){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('ALPACA_SCHEMA_INVALID','Alpaca bar must be an object.');
  const ms=parseTime(value.t);
  if(ms===null||ms%1000!==0)fail('ALPACA_TIME_INVALID','Alpaca bar time is invalid.');
  const time=ms/1000;
  if(time<EARLIEST||time>nowSeconds+seconds+60||(seconds<86400&&time%seconds!==0))fail('ALPACA_TIME_INVALID','Alpaca bar time is misaligned or outside the accepted window.');
  const out={time,open:positive(value.o,'open'),high:positive(value.h,'high'),low:positive(value.l,'low'),close:positive(value.c,'close'),volume:nonnegative(value.v,'volume')};
  if(out.high<Math.max(out.open,out.close,out.low)||out.low>Math.min(out.open,out.close,out.high))fail('ALPACA_OHLC_INCONSISTENT','Alpaca bar OHLC range is inconsistent.');
  if(value.n!==undefined)nonnegative(value.n,'trade count');
  if(value.vw!==undefined&&value.vw!==null)nonnegative(value.vw,'VWAP');
  return out;
}
function validateRestBars(raw,input,nowSeconds){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.symbol!==input.symbol||(raw.bars!==null&&raw.bars!==undefined&&!Array.isArray(raw.bars)))fail('ALPACA_SCHEMA_INVALID','Alpaca bars response identity or shape is invalid.');
  if(raw.next_page_token!==null&&raw.next_page_token!==undefined&&(typeof raw.next_page_token!=='string'||!PAGE_TOKEN.test(raw.next_page_token)))fail('ALPACA_SCHEMA_INVALID','Alpaca page token is invalid.');
  const rows=raw.bars||[];
  if(rows.length>MAX_LIMIT)fail('ALPACA_SCHEMA_INVALID','Alpaca returned more bars than requested.');
  const bars=[];let skipped=0;
  for(const item of rows){
    // One bad print (high below open, etc.) drops that bar only; a whole chart never fails for it.
    let next;try{next=bar(item,input.seconds,nowSeconds);}catch(error){if(error?.code==='ALPACA_OHLC_INCONSISTENT'){skipped++;continue;}throw error;}
    if(bars.length&&next.time<=bars[bars.length-1].time)fail('ALPACA_SCHEMA_INVALID','Alpaca bars are not strictly chronological.');bars.push(next);}
  return {bars,nextPageToken:raw.next_page_token||null,skipped};
}
const safeText=value=>typeof value==='string'?value.replace(/[^\x20-\x7e]/g,'').slice(0,200):'';
const sameUrl=(a,b)=>{try{return new URL(a).href===new URL(b).href;}catch{return false;}};
/** Alpaca error bodies are small JSON objects such as {"message":"forbidden"} or {"code":40010001,"message":"..."}. */
async function errorMessage(response){
  try{
    const reader=response.body?.getReader();if(!reader)return '';
    const chunks=[];let bytes=0;
    try{while(bytes<REST_ERROR_BODY_BYTES){const item=await reader.read();if(item.done)break;chunks.push(Buffer.from(item.value));bytes+=item.value.byteLength;}}
    finally{await reader.cancel().catch(()=>{});}
    const text=Buffer.concat(chunks).subarray(0,REST_ERROR_BODY_BYTES).toString('utf8');
    try{const value=JSON.parse(text);return safeText(value?.message??value?.msg??'').replace(/\.$/,'');}catch{return '';}
  }catch{return '';}
}
const KEY_REJECTED='Alpaca rejected the key. Check that you copied the paper key ID and its secret from the same key pair, with nothing extra, then save again.';
function httpFailure(status,said,onRateLimit){
  const quoted=said?' Alpaca said: "'+said+'".':'';
  if(status===401)fail('AUTH_FAILED',KEY_REJECTED+quoted);
  if(status===403){
    if(!said||/^(forbidden|unauthori[sz]ed|not authorized|access denied)$/i.test(said)||/auth|credential|api key/i.test(said))fail('AUTH_FAILED',KEY_REJECTED+quoted);
    fail('ALPACA_FORBIDDEN','Alpaca refused this request for your plan.'+quoted);
  }
  if(status===429){onRateLimit();fail('RATE_LIMITED','Alpaca says too many requests were made. Wait a minute and try again.'+quoted);}
  if(status===400||status===422)fail('ALPACA_REQUEST_REJECTED','Alpaca rejected the request.'+quoted);
  if(status>=500)fail('ALPACA_HTTP_ERROR','Alpaca is having a problem (HTTP '+status+'). Try again shortly.'+quoted);
  fail('ALPACA_HTTP_ERROR','Alpaca answered with HTTP '+status+'.'+quoted);
}

/** Plain words for the documented stream error codes (docs.alpaca.markets streaming-market-data). */
const STREAM_ERRORS=Object.freeze({
  400:'OpenCandle sent Alpaca a message it did not understand. Reconnect from the chart.',
  401:'Alpaca says the stream was not signed in yet. Reconnecting.',
  402:KEY_REJECTED,
  404:'Alpaca did not receive the key in time. Reconnecting.',
  405:'Too many symbols for the Alpaca free plan (30 at most). Close some live charts.',
  406:'Alpaca allows one live connection on the free plan, and another app or OpenCandle window is already using it. Close the other one; OpenCandle retries in a minute.',
  407:'Alpaca dropped the stream because data was arriving faster than this computer read it. Reconnecting.',
  409:'Your Alpaca plan does not include the IEX real-time feed.',
  410:'Alpaca does not allow that subscription on the IEX feed.',
  500:'Alpaca had an internal error. Reconnecting.',
});

/** One second of frame accounting. */
const freshWindow=start=>({start,count:0,frames:0,bytes:0,quoteFrames:0,quoteBytes:0,quoteDropped:0,dropped:0});
class AlpacaMarketData {
  constructor({keys,fetchImpl=globalThis.fetch,WebSocketImpl=globalThis.WebSocket,now=Date.now,marketNow=now,random=Math.random,emit=()=>{},restMinIntervalMs=REST_MIN_INTERVAL_MS,restTimeoutMs=REST_TIMEOUT_MS}){
    this.keys=keys;this.fetch=fetchImpl;this.WebSocket=WebSocketImpl;this.now=now;this.marketNow=marketNow;this.random=random;this.emit=emit;this.restMinIntervalMs=restMinIntervalMs;this.restTimeoutMs=restTimeoutMs;
    this.closed=false;this.restQueue=Promise.resolve();this.restQueued=0;this.restNextAt=0;this.restDeniedUntil=0;this.active=new Map();
    this.symbols=[];this.feed='iex';this.socket=null;this.connectionGeneration=0;this.subscriptionGeneration=0;this.state='idle';this.attempt=0;this.reconnectTimer=null;this.authTimer=null;this.flushTimer=null;
    this.lastMessageAt=0;this.rateWindow=freshWindow(0);this.pending={bars:new Map(),trades:new Map(),quotes:new Map()};this.quotes=false;
    // QuotesFor (symbols on screen), the shed level (0 every quote, 1 on-screen symbols only, 2 none), when it
    // last moved, and the symbols whose quote channel the open socket has subscribed.
    this.quotesFor=[];this.quoteLevel=0;this.quoteLevelAt=0;this.quoteSet=new Set();
    this.counters={received:0,dropped:0,rejected:0,reconnects:0,quotesDropped:0,quoteSheds:0};this.lastError=null;this.liveMessages=false;this.halted=false;
    this.assetCache=null;this.assetLoad=null;this.assetsTimeoutMs=ASSETS_TIMEOUT_MS;
  }
  // ---- Asset lookup (Trading API, owner key) ---------------------------------------------------------------
  /** Listings matching a symbol or company name. The full active US equity list is fetched once per
   * New York day per key and kept in memory only; the key never leaves this process. Failures are not cached. */
  async searchAssets(raw){
    let input;try{input=assetsInput(raw);}catch(error){return failure(error);}
    if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Alpaca capability is closed.'}};
    const keys=await this.keys.load();
    if(!keys)return {ok:false,error:{code:'KEY_REQUIRED',message:'Save an Alpaca API key in Live data settings first.'}};
    let list;try{list=await this.assetList(keys);}catch(error){return failure(error,'ALPACA_NETWORK_ERROR','Could not reach Alpaca to look up symbols. Check the internet connection, VPN or firewall.');}
    const ranked=rankAssets(list.rows,input.query);
    return {ok:true,value:{schemaVersion:1,query:input.query,assets:ranked.assets,total:ranked.total,listedAt:list.listedAt}};
  }
  assetList(keys){
    const day=newYorkDay(this.marketNow()),owner=keys.keyId;
    if(this.assetCache&&this.assetCache.day===day&&this.assetCache.owner===owner)return Promise.resolve(this.assetCache);
    if(this.assetLoad&&this.assetLoad.day===day&&this.assetLoad.owner===owner)return this.assetLoad.promise;
    const load={day,owner,promise:null};
    load.promise=this.fetchAssetList(keys).then(rows=>{const entry={day,owner,rows,listedAt:new Date(this.now()).toISOString()};if(this.assetLoad===load){this.assetCache=entry;this.assetLoad=null;}return entry;},error=>{if(this.assetLoad===load)this.assetLoad=null;throw error;});
    this.assetLoad=load;return load.promise;
  }
  async fetchAssetList(keys){
    const sourceUrl=assetsUrl(keys.keyId),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.assetsTimeoutMs);
    let reader;
    try{
      let response;
      try{response=await this.fetch(sourceUrl,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Accept':'application/json','Accept-Encoding':'identity','APCA-API-KEY-ID':keys.keyId,'APCA-API-SECRET-KEY':keys.secret}});}
      catch{fail(controller.signal.aborted?'TIMEOUT':'ALPACA_NETWORK_ERROR',controller.signal.aborted?'Alpaca did not send the symbol list within '+Math.round(this.assetsTimeoutMs/1000)+' seconds. Try again.':'Could not reach Alpaca to look up symbols. Check the internet connection, VPN or firewall.');}
      if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>{});fail('REDIRECT_DENIED','Alpaca redirected the request, which OpenCandle does not follow.');}
      if(response.status!==200){const said=await errorMessage(response);httpFailure(response.status,said,()=>{});}
      if(!sameUrl(response.url,sourceUrl))fail('ALPACA_ORIGIN_DENIED','Unexpected Alpaca response URL.');
      if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('ALPACA_FORMAT_INVALID','Alpaca sent something other than JSON data (a proxy or captive portal may be in the way).');
      const declared=Number(response.headers.get('content-length'));
      if(Number.isFinite(declared)&&declared>ASSETS_MAX_BYTES)fail('ALPACA_TOO_LARGE','The Alpaca symbol list exceeds the 48 MiB limit.');
      if(!response.body)fail('ALPACA_FORMAT_INVALID','Alpaca response body is absent.');
      reader=response.body.getReader();const chunks=[];let bytes=0;
      while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>ASSETS_MAX_BYTES)fail('ALPACA_TOO_LARGE','The Alpaca symbol list exceeds the 48 MiB limit.');chunks.push(Buffer.from(item.value));}
      let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{fail('ALPACA_FORMAT_INVALID','Alpaca returned invalid UTF-8 JSON.');}
      return validateAssets(raw);
    }finally{clearTimeout(timer);if(reader)await reader.cancel().catch(()=>{});}
  }
  // ---- REST ----------------------------------------------------------------------------------------------
  bars(raw){
    let input;try{input=barsInput(raw,Math.floor(this.marketNow()/1000));}catch(error){return Promise.resolve(failure(error));}
    return this.queue(input.requestId,(entry,isCancelled)=>this.fetchBars(input,entry,isCancelled));
  }
  /** Test connection: one small IEX daily-bars request with the saved key. Returns no market data. */
  test(){
    const now=Math.floor(this.marketNow()/1000);
    const input={requestId:'alpaca-test-'+now+'-'+Math.floor(this.random()*1e9),symbol:'SPY',timeframe:'1Day',seconds:86400,feed:'iex',start:now-10*86400,end:now};
    return this.queue(input.requestId,(entry,isCancelled)=>this.fetchBars(input,entry,isCancelled)).then(result=>result.ok?{ok:true,value:{connected:true,feed:'iex',checkedAt:new Date(this.now()).toISOString()}}:result);
  }
  queue(requestId,task){
    if(this.closed)return Promise.resolve({ok:false,error:{code:'CLOSED',message:'Alpaca capability is closed.'}});
    if(this.active.has(requestId))return Promise.resolve({ok:false,error:{code:'INVALID_ARGUMENT',message:'Request identifier is already active.'}});
    if(this.restQueued>=REST_MAX_QUEUE)return Promise.resolve({ok:false,error:{code:'BUSY',message:'Too many Alpaca requests are queued.'}});
    this.restQueued++;let cancelled=false;
    const entry={cancel:()=>{cancelled=true;entry.abort?.();}};this.active.set(requestId,entry);
    const cancelledResult={ok:false,error:{code:'CANCELLED',message:'Alpaca request cancelled before data commit.'}};
    const run=async()=>{
      try{
        if(cancelled)return cancelledResult;
        if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Alpaca capability is closed.'}};
        if(this.now()<this.restDeniedUntil)return {ok:false,error:{code:'RATE_LIMITED',message:'Alpaca limited requests. Wait before requesting again.'}};
        const wait=this.restNextAt-this.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
        this.restNextAt=this.now()+this.restMinIntervalMs;
        if(cancelled)return cancelledResult;
        return await task(entry,()=>cancelled);
      }finally{this.restQueued--;this.active.delete(requestId);}
    };
    const result=this.restQueue.then(run,run);this.restQueue=result.catch(()=>{});return result;
  }
  sourceUrl(input){
    const query=new URLSearchParams([['timeframe',input.timeframe],['start',iso(input.start)],['end',iso(input.end)],['limit',String(MAX_LIMIT)],['feed',input.feed],['adjustment',ADJUSTMENTS.includes(input.adjustment)?input.adjustment:'raw'],['sort','asc']]);
    if(input.pageToken)query.set('page_token',input.pageToken);
    return REST_ORIGIN+'/v2/stocks/'+encodeURIComponent(input.symbol)+'/bars?'+query.toString();
  }
  async fetchBars(input,entry,isCancelled){
    const keys=await this.keys.load();
    if(!keys)return {ok:false,error:{code:'KEY_REQUIRED',message:'Save an Alpaca API key in Live data settings first.'}};
    const sourceUrl=this.sourceUrl(input);
    return new Promise(resolve=>{
      let finished=false,reader;const controller=new AbortController();
      const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);controller.abort();void reader?.cancel().catch(()=>{});resolve(result);};
      const timer=setTimeout(()=>finish({ok:false,error:{code:'TIMEOUT',message:'Alpaca did not answer within '+Math.round(this.restTimeoutMs/1000)+' seconds. Check the internet connection and try again.'}}),this.restTimeoutMs);
      entry.abort=()=>finish({ok:false,error:{code:'CANCELLED',message:'Alpaca request cancelled before data commit.'}});
      void(async()=>{
        try{
          const response=await this.fetch(sourceUrl,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Accept':'application/json','Accept-Encoding':'identity','APCA-API-KEY-ID':keys.keyId,'APCA-API-SECRET-KEY':keys.secret}});
          if(finished||isCancelled()){await response.body?.cancel().catch(()=>{});return;}
          if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>{});fail('REDIRECT_DENIED','Alpaca redirected the request, which OpenCandle does not follow.');}
          if(response.status!==200){const said=await errorMessage(response);if(finished)return;httpFailure(response.status,said,()=>this.holdRest());}
          if(!sameUrl(response.url,sourceUrl))fail('ALPACA_ORIGIN_DENIED','Unexpected Alpaca response URL.');
          if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('ALPACA_FORMAT_INVALID','Alpaca sent something other than JSON data (a proxy or captive portal may be in the way).');
          const declared=Number(response.headers.get('content-length'));
          if(Number.isFinite(declared)&&declared>REST_MAX_BYTES)fail('ALPACA_TOO_LARGE','Alpaca response exceeds the 8 MiB limit.');
          if(!response.body)fail('ALPACA_FORMAT_INVALID','Alpaca response body is absent.');
          reader=response.body.getReader();const chunks=[];let bytes=0;
          try{while(true){const item=await reader.read();if(finished)return;if(item.done)break;bytes+=item.value.byteLength;if(bytes>REST_MAX_BYTES)fail('ALPACA_TOO_LARGE','Alpaca response exceeds the 8 MiB limit.');chunks.push(Buffer.from(item.value));}}
          finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          if(finished)return;
          let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{fail('ALPACA_FORMAT_INVALID','Alpaca returned invalid UTF-8 JSON.');}
          const data=validateRestBars(raw,input,Math.floor(this.marketNow()/1000));
          if(finished||isCancelled())return;
          // The returned URL carries no credential; headers are never echoed back.
          finish({ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:input.seconds,feed:input.feed,bars:data.bars,nextPageToken:data.nextPageToken,provenance:{provider:'Alpaca Market Data',kind:'owner-key',feed:input.feed,delaySeconds:input.feed==='sip'&&input.plan!=='paid'?SIP_DELAY_SECONDS:0,sourceUrl,retrievedAt:new Date(this.now()).toISOString(),bytes,license:LICENSE}}});
        }catch(error){if(!finished)finish(failure(error,'ALPACA_NETWORK_ERROR','Could not reach Alpaca. Check the internet connection, VPN or firewall. No retry was made.'));}
      })();
    });
  }
  cancel(requestId){const entry=this.active.get(requestId);if(!entry)return false;entry.cancel();return true;}
  /** Alpaca answered 429: every queued REST request (bars, connection test, corporate actions) is refused for the next
   * REST_DENIED_BACKOFF_MS. Corporate actions call this too (main.cjs onRateLimit). */
  holdRest(){this.restDeniedUntil=this.now()+REST_DENIED_BACKOFF_MS;}
  // ---- WebSocket (IEX) -----------------------------------------------------------------------------------
  async subscribe(raw){
    let symbols,feed,quotes,quotesFor;try{symbols=subscribeInput(raw);feed=subscribeFeedInput(raw);quotes=subscribeQuotesInput(raw);quotesFor=subscribeQuotesForInput(raw);}catch(error){return failure(error);}
    if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Alpaca capability is closed.'}};
    if(typeof this.WebSocket!=='function')return {ok:false,error:{code:'UNAVAILABLE',message:'WebSocket support is unavailable in this runtime.'}};
    const generation=++this.subscriptionGeneration,keys=await this.keys.load();
    if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Alpaca capability is closed.'}};
    if(generation!==this.subscriptionGeneration)return {ok:false,error:{code:'CANCELLED',message:'Alpaca subscription changed before commit.'}};
    if(!keys)return {ok:false,error:{code:'KEY_REQUIRED',message:'Save an Alpaca API key in Live data settings first.'}};
    const previous=this.symbols;this.symbols=symbols;this.quotes=quotes;this.quotesFor=quotesFor;this.halted=false;
    // A data plan change switches the stream URL, so the session reconnects on the other feed.
    if(feed!==this.feed){this.feed=feed;if(this.socket||this.reconnectTimer){this.teardown();this.attempt=0;}}
    const live=this.socket&&(this.state==='ready'||this.state==='stale');
    if(previous.join()===symbols.join()&&this.socket){if(live)this.syncQuoteChannel();return {ok:true,value:this.status()};}
    if(live){
      // Each message names exactly the quote symbols it changes, so a shed symbol keeps bars and trades only.
      const removed=previous.filter(s=>!symbols.includes(s)),added=symbols.filter(s=>!previous.includes(s));
      const want=new Set(this.wantedQuotes());
      if(removed.length){this.send(channels('unsubscribe',removed,removed.filter(s=>this.quoteSet.has(s))));for(const s of removed)this.quoteSet.delete(s);}
      if(added.length){const quoted=added.filter(s=>want.has(s));this.send(channels('subscribe',added,quoted));for(const s of quoted)this.quoteSet.add(s);}
      this.syncQuoteChannel();
    }else if(!this.socket&&!this.reconnectTimer)this.connect();
    return {ok:true,value:this.status()};
  }
  /** The symbols that should have the quote channel now: every symbol, the on-screen ones, or none. */
  wantedQuotes(){
    if(!this.quotes||this.quoteLevel>=2)return [];
    return this.quoteLevel===1?this.symbols.filter(s=>this.quotesFor.includes(s)):[...this.symbols];
  }
  /** Brings the open socket's quote channel to wantedQuotes() with quote-only messages. The bar and
   * trade channels are never touched here. */
  syncQuoteChannel(){
    const want=this.wantedQuotes(),drop=[...this.quoteSet].filter(s=>!want.includes(s)).sort(),add=want.filter(s=>!this.quoteSet.has(s));
    if(drop.length){this.send({action:'unsubscribe',quotes:drop});for(const s of drop)this.quoteSet.delete(s);}
    if(add.length){this.send({action:'subscribe',quotes:add});for(const s of add)this.quoteSet.add(s);}
  }
  /** One step of quote shedding (+1) or recovery (-1). Bars and trades keep their subscriptions. */
  moveQuoteLevel(step,now){
    const next=Math.max(0,Math.min(2,this.quoteLevel+step));
    if(next===this.quoteLevel)return;
    this.quoteLevel=next;this.quoteLevelAt=now;if(step>0)this.counters.quoteSheds++;
    // A level that would shed nothing (every symbol is on screen) is skipped on the way up.
    if(step>0&&next===1&&this.wantedQuotes().length===this.symbols.length&&this.quotes)this.quoteLevel=2;
    if(this.socket&&(this.state==='ready'||this.state==='stale'))this.syncQuoteChannel();
    this.emit({schemaVersion:1,kind:'status',status:this.status()});
  }
  unsubscribe(){this.symbols=[];this.teardown();this.attempt=0;this.quoteLevel=0;this.quoteLevelAt=0;this.setState('idle');return {ok:true,value:this.status()};}
  /** Key cleared or replaced: drop any authenticated session immediately, then reconnect the same symbols (new key)
   * or stop with "Save an Alpaca API key" (key cleared) once the pause in rekey() has passed. */
  forget(){this.assetCache=null;this.assetLoad=null;this.rekey();}
  status(){return {schemaVersion:1,state:this.state,symbols:[...this.symbols],feed:this.feed,attempt:this.attempt,lastMessageAt:this.lastMessageAt||null,liveMessages:this.liveMessages,counters:{...this.counters},lastError:this.lastError,quoteLevel:QUOTE_SHED_LEVELS[this.quoteLevel]};}
  async connect(){
    if(this.closed||!this.symbols.length||this.halted)return;
    const generation=++this.connectionGeneration,current=()=>!this.closed&&this.symbols.length>0&&!this.halted&&this.connectionGeneration===generation;
    const keys=await this.keys.load();
    if(!current())return;
    if(!keys){this.lastError='Save an Alpaca API key in Live data settings first.';this.setState('auth-failed');return;}
    this.setState('connecting');
    if(!current())return;
    let socket;try{socket=new this.WebSocket(this.feed==='sip'?WS_SIP_URL:WS_URL);}catch{if(current())this.scheduleReconnect('Could not open the Alpaca live stream. Retrying.');return;}
    // Alpaca sends JSON text frames by default; binary frames (if any) are read as UTF-8 bytes, never as Blobs.
    try{socket.binaryType='arraybuffer';}catch{/* runtime without binaryType */}
    if(!current()){try{socket.close();}catch{/* Unadopted local handle cleanup only. */}return;}
    this.socket=socket;let opened=false;
    this.authTimer=setTimeout(()=>{if(this.socket===socket&&this.state!=='ready'){this.drop(socket);this.scheduleReconnect(opened?'Alpaca did not confirm the key within 10 seconds. Retrying.':'Could not reach the Alpaca live stream within 10 seconds. Check the internet connection or firewall. Retrying.');}},WS_AUTH_TIMEOUT_MS);
    socket.onopen=()=>{if(this.socket===socket){opened=true;this.lastMessageAt=this.now();}};
    socket.onmessage=event=>{if(this.socket===socket)this.receive(event?.data,socket,keys);};
    socket.onerror=()=>{};
    socket.onclose=()=>{if(this.socket!==socket)return;this.drop(socket);this.scheduleReconnect(opened?'Alpaca closed the live connection. Reconnecting.':'Could not reach the Alpaca live stream. Check the internet connection or firewall. Retrying.');};
  }
  /** A new key was saved: close any session made with the old key, then reconnect the same symbols with the new one.
   * The pause lets Alpaca release the old connection first (the free plan allows one). */
  rekey(){
    this.teardown();this.attempt=0;this.halted=false;this.lastError=null;
    if(this.closed||!this.symbols.length){this.setState('idle');return;}
    this.setState('disconnected');
    this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;void this.connect();},WS_REKEY_DELAY_MS);
  }
  send(message){try{this.socket?.send(JSON.stringify(message));}catch{/* close handler reconnects */}}
  drop(socket){
    if(this.socket===socket){this.socket=null;this.quoteSet.clear();}
    clearTimeout(this.authTimer);this.authTimer=null;clearInterval(this.flushTimer);this.flushTimer=null;
    try{socket.onopen=socket.onmessage=socket.onclose=socket.onerror=null;socket.close();}catch{/* already closed */}
  }
  teardown(){this.subscriptionGeneration++;this.connectionGeneration++;clearTimeout(this.reconnectTimer);this.reconnectTimer=null;if(this.socket)this.drop(this.socket);this.pending.bars.clear();this.pending.trades.clear();this.pending.quotes.clear();}
  scheduleReconnect(reason,minimum=0){
    this.flush();this.lastError=reason;
    if(this.closed||!this.symbols.length||this.halted){this.setState(this.closed?'closed':this.halted?'auth-failed':'idle');return;}
    this.setState('disconnected');
    const ceiling=Math.min(WS_BACKOFF_MAX_MS,WS_BACKOFF_BASE_MS*2**Math.min(this.attempt,16));
    const delay=Math.max(minimum,WS_BACKOFF_BASE_MS,Math.round(ceiling*(0.5+this.random()*0.5)));
    this.attempt++;this.counters.reconnects++;
    clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;void this.connect();},delay);
  }
  setState(state){if(this.state===state)return;this.state=state;this.emit({schemaVersion:1,kind:'status',status:this.status()});}
  /** A new one-second window. A second that shed quote frames, or that dropped a bar or trade frame while
   * quotes were subscribed, sheds one quote level; a quiet level steps back after WS_QUOTE_SHED_RETRY_MS. */
  rollWindow(now){
    const last=this.rateWindow;this.rateWindow=freshWindow(now);
    if(last.quoteDropped>0||(last.dropped>0&&this.quoteSet.size))this.moveQuoteLevel(1,now);
    else if(this.quoteLevel>0&&now-this.quoteLevelAt>=WS_QUOTE_SHED_RETRY_MS)this.moveQuoteLevel(-1,now);
  }
  receive(data,socket,keys){
    const now=this.now();
    if(now-this.rateWindow.start>=1000)this.rollWindow(now);
    const budget=this.rateWindow;
    // Hard cap first (every frame, before any decoding or scanning): only a broken or hostile stream reaches it.
    const size=typeof data==='string'?data.length:data instanceof ArrayBuffer||ArrayBuffer.isView(data)?data.byteLength:0;
    budget.frames++;budget.bytes+=size;
    if(budget.frames>WS_HARD_MESSAGES_PER_SECOND||budget.bytes>WS_HARD_BYTES_PER_SECOND){this.counters.dropped++;budget.dropped++;return;}
    if(data instanceof ArrayBuffer||ArrayBuffer.isView(data)){
      const bytes=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
      if(bytes.byteLength>WS_MAX_MESSAGE_BYTES){this.counters.rejected++;return;}
      try{data=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{this.counters.rejected++;return;}
    }
    if(typeof data!=='string'||data.length>WS_MAX_MESSAGE_BYTES||Buffer.byteLength(data)>WS_MAX_MESSAGE_BYTES){this.counters.rejected++;return;}
    // Quote-only frames use their own budget and never count against the bar and trade budget.
    if(quoteOnlyFrame(data)){
      budget.quoteFrames++;budget.quoteBytes+=data.length;
      if(budget.quoteFrames>WS_MAX_QUOTE_MESSAGES_PER_SECOND||budget.quoteBytes>WS_MAX_QUOTE_BYTES_PER_SECOND){this.counters.quotesDropped++;budget.quoteDropped++;return;}
    }else if(++budget.count>WS_MAX_MESSAGES_PER_SECOND){this.counters.dropped++;budget.dropped++;return;}
    let items;try{items=JSON.parse(data);}catch{this.counters.rejected++;return;}
    if(!Array.isArray(items)||items.length>1000){this.counters.rejected++;return;}
    this.counters.received++;this.lastMessageAt=now;
    const marketNow=this.marketNow(),nowSeconds=Math.floor(marketNow/1000);
    for(const item of items){
      if(!item||typeof item!=='object'||Array.isArray(item)){this.counters.rejected++;continue;}
      try{
        if(item.T==='success'&&item.msg==='connected'){this.setState('authenticating');this.send({action:'auth',key:keys.keyId,secret:keys.secret});}
        else if(item.T==='success'&&item.msg==='authenticated'){clearTimeout(this.authTimer);this.authTimer=null;this.attempt=0;this.lastError=null;const quoted=this.wantedQuotes();this.send(channels('subscribe',this.symbols,quoted));this.quoteSet=new Set(quoted);clearInterval(this.flushTimer);this.flushTimer=setInterval(()=>this.flush(),FLUSH_MS);this.setState('ready');}
        else if(item.T==='error')this.acceptError(item,socket);
        else if(item.T==='b'||item.T==='u'||item.T==='d')this.acceptBar(item,nowSeconds);
        else if(item.T==='t')this.acceptTrade(item,marketNow);
        else if(item.T==='q')this.acceptQuote(item,marketNow);
        // subscription confirmations and unknown types are ignored.
      }catch{this.counters.rejected++;}
    }
  }
  acceptError(item,socket){
    const code=Number.isSafeInteger(item.code)?item.code:0;
    if(code===403)return; // "already authenticated": harmless
    const plain=(STREAM_ERRORS[code]||'Alpaca reported a live stream problem.').replace('the IEX',this.feed==='sip'?'the SIP (all exchanges)':'the IEX');
    this.lastError=plain+' (Alpaca code '+code+': '+(safeText(item.msg)||'unknown')+')';
    // 402 auth failed, 409 insufficient subscription, 405 symbol limit, 410 invalid action: retrying cannot help.
    if([402,405,409,410].includes(code)){this.halted=true;this.drop(socket);this.setState('auth-failed');this.emit({schemaVersion:1,kind:'status',status:this.status()});return;}
    // 406 connection limit: the free plan allows one stream connection per account; retrying sooner only repeats it.
    if(code===406){this.drop(socket);this.scheduleReconnect(this.lastError,WS_LIMIT_BACKOFF_MS);return;}
    // 401 not authenticated, 404 auth timeout, 407 slow client, 500 internal: a fresh connection is the documented remedy.
    if([401,404,407,500].includes(code)){this.drop(socket);this.scheduleReconnect(this.lastError);return;}
    this.emit({schemaVersion:1,kind:'status',status:this.status()});
  }
  acceptBar(item,nowSeconds){
    if(!this.symbols.includes(item.S))fail('ALPACA_SCHEMA_INVALID','Unexpected symbol.');
    const seconds=item.T==='d'?86400:60;
    const value=bar(item,seconds,nowSeconds);
    this.liveMessages=true;
    this.pending.bars.set(item.T+'|'+item.S+'|'+value.time,{symbol:item.S,kind:item.T==='d'?'daily':item.T==='u'?'updated':'minute',seconds,...value});
  }
  acceptTrade(item,now){
    if(!this.symbols.includes(item.S))fail('ALPACA_SCHEMA_INVALID','Unexpected symbol.');
    const ms=parseTime(item.t);
    if(ms===null||Math.abs(ms-now)>86400000)fail('ALPACA_TIME_INVALID','Invalid trade time.');
    const price=positive(item.p,'price'),size=nonnegative(item.s,'size'),time=Math.floor(ms/1000);
    this.liveMessages=true;
    const key=item.S+'|'+Math.floor(time/60),prior=this.pending.trades.get(key);
    this.pending.trades.set(key,prior?{symbol:item.S,time:Math.max(prior.time,time),price,high:Math.max(prior.high,price),low:Math.min(prior.low,price),size:prior.size+size}:{symbol:item.S,time,price,high:price,low:price,size});
  }
  /** A stream quote (best bid and ask on the subscribed feed). Only the newest quote per symbol is
   * kept until the next flush, so the renderer gets at most one quote per symbol every FLUSH_MS (4 a second). A side
   * with a zero price has no quote and is sent as null; a quote with neither side is dropped. Sizes are as Alpaca reports them. */
  acceptQuote(item,now){
    if(!this.quotes||!this.symbols.includes(item.S))fail('ALPACA_SCHEMA_INVALID','Unexpected symbol.');
    const ms=parseTime(item.t);
    if(ms===null||Math.abs(ms-now)>86400000)fail('ALPACA_TIME_INVALID','Invalid quote time.');
    const bid=nonnegative(item.bp,'bid price'),ask=nonnegative(item.ap,'ask price'),bidSize=nonnegative(item.bs??0,'bid size'),askSize=nonnegative(item.as??0,'ask size');
    if(bid===0&&ask===0)return;
    if(bid>0&&ask>0&&ask<bid)return; // a crossed quote is not shown (it is not a usable top of book)
    const prior=this.pending.quotes.get(item.S);if(prior&&prior.timeMs>ms)return;
    this.pending.quotes.set(item.S,{symbol:item.S,time:Math.floor(ms/1000),timeMs:ms,bid:bid>0?bid:null,ask:ask>0?ask:null,bidSize:bid>0?bidSize:null,askSize:ask>0?askSize:null,feed:this.feed});
  }
  flush(){
    const bars=[...this.pending.bars.values()],trades=[...this.pending.trades.values()],quotes=[...this.pending.quotes.values()];
    if(!bars.length&&!trades.length&&!quotes.length)return;
    this.pending.bars.clear();this.pending.trades.clear();this.pending.quotes.clear();
    this.emit({schemaVersion:1,kind:'batch',bars,trades,...(quotes.length?{quotes}:{}),receivedAt:new Date(this.now()).toISOString()});
  }
  close(){this.closed=true;this.symbols=[];for(const entry of Array.from(this.active.values()))entry.cancel();this.teardown();this.setState('closed');}
}
module.exports={alpacaKeyInput,AlpacaKeyStore,AlpacaMarketData,barsInput,subscribeInput,subscribeFeedInput,subscribeQuotesInput,subscribeQuotesForInput,quoteOnlyFrame,WS_MAX_MESSAGES_PER_SECOND,WS_MAX_QUOTE_MESSAGES_PER_SECOND,WS_MAX_QUOTE_BYTES_PER_SECOND,WS_HARD_MESSAGES_PER_SECOND,WS_HARD_BYTES_PER_SECOND,WS_QUOTE_SHED_RETRY_MS,WS_SIP_URL,validateRestBars,parseTime,assetsInput,validateAssets,rankAssets,assetsUrl,TIMEFRAMES,WS_URL,REST_ORIGIN,TRADING_ORIGIN,PAPER_TRADING_ORIGIN,SIP_DELAY_SECONDS,MAX_SYMBOLS,ASSETS_MAX_BYTES,CREDENTIAL_FILE,LICENSE};
