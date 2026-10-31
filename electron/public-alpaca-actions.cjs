'use strict';
// Split and dividend history for one US stock from Alpaca's corporate actions endpoint, on
// the owner's own key, in the main process only. The renderer reaches it through one fixed trusted IPC channel
// (lv:alpaca:corporate-actions, exactly {requestId, symbol}); it never names a URL, host, header, date range or path.
// Requests share the bars queue of AlpacaMarketData (main.cjs passes its queue), so they count against the same rate limit
// and back-off. Results are kept in the profile's corporate-actions-cache folder, a sibling of the market-data-cache,
// and are read again at most once per New York day. A run on the SYNTHETIC stub uses its own cache namespace, so invented
// events never land under the real one.
// Source (public docs, checked 2026-10-22): docs.alpaca.markets reference/corporateactions-1, GET /v1/corporate-actions with
// symbols, types (forward_split, reverse_split, cash_dividend, ...), start and end (YYYY-MM-DD, inclusive), limit (1 to 1000,
// counts all data points), page_token and sort; the response holds corporate_actions.{forward_splits, reverse_splits,
// cash_dividends} and next_page_token. No Alpaca endpoint was called while building this. Alpaca documents no earnings data.
const fsDefault=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {BoundaryError,exactKeys}=require('./validation.cjs');
const {REST_ORIGIN,LICENSE}=require('./public-alpaca.cjs');

const ACTIONS_CACHE_DIRECTORY='corporate-actions-cache';
const ACTION_TYPES=Object.freeze(['forward_split','reverse_split','cash_dividend']);
const NAMESPACES=Object.freeze(['alpaca','alpaca-stub']);
const EARLIEST_DAY='2015-01-01'; // the same floor as bar history (public-alpaca.cjs EARLIEST)
const PAGE_LIMIT=1000,MAX_PAGES=10,MAX_EVENTS=5000;
const MAX_BYTES=4*1024*1024,TIMEOUT_MS=20000,ERROR_BODY_BYTES=4096;
const SYMBOL=/^[A-Z]{1,5}(?:\.[A-Z]{1,3}){0,2}$/;
const REQUEST_ID=/^[A-Za-z0-9:_-]{1,96}$/;
const PAGE_TOKEN=/^[A-Za-z0-9+/=_-]{1,512}$/;
const DAY=/^(\d{4})-(\d{2})-(\d{2})$/;
const CURRENCY=/^[A-Z]{3}$/;
const ID=/^[\x21-\x7e]{1,64}$/;
const fail=(code,message)=>{throw new BoundaryError(code,message);};
const failure=(error,code,message)=>({ok:false,error:{code:error instanceof BoundaryError?error.code:code,message:error instanceof BoundaryError?error.message:message}});

function actionsInput(value){
  exactKeys(value,['requestId','symbol']);
  if(typeof value.requestId!=='string'||!REQUEST_ID.test(value.requestId))fail('INVALID_ARGUMENT','Invalid request identifier.');
  if(typeof value.symbol!=='string'||!SYMBOL.test(value.symbol))fail('INVALID_ARGUMENT','Enter a US stock symbol such as AAPL or BRK.B.');
  return {requestId:value.requestId,symbol:value.symbol};
}
const newYorkDay=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
/** A calendar date YYYY-MM-DD that exists (2015 to 2100), or null. */
function day(value){
  if(typeof value!=='string')return null;
  const match=DAY.exec(value);if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),date=Number(match[3]),at=new Date(Date.UTC(year,month-1,date));
  return year>=1990&&year<=2100&&at.getUTCMonth()===month-1&&at.getUTCDate()===date?value:null;
}
const optionalDay=value=>value===undefined||value===null?null:day(value);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<1e9;
const idOf=(value,fallback)=>typeof value==='string'&&ID.test(value)?value:fallback;

function actionsUrl(symbol,start,end,pageToken){
  const query=new URLSearchParams([['symbols',symbol],['types',ACTION_TYPES.join(',')],['start',start],['end',end],['limit',String(PAGE_LIMIT)],['sort','asc']]);
  if(pageToken)query.set('page_token',pageToken);
  return REST_ORIGIN+'/v1/corporate-actions?'+query.toString();
}

/** One page of Alpaca corporate actions to OpenCandle events. Rows for another symbol, or with a missing or impossible
 * ex-date or rate, are skipped; anything but the documented object shape fails. */
function validateActions(raw,symbol){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('ALPACA_SCHEMA_INVALID','Alpaca sent corporate actions in an unexpected shape.');
  const groups=raw.corporate_actions??{};
  if(!groups||typeof groups!=='object'||Array.isArray(groups))fail('ALPACA_SCHEMA_INVALID','Alpaca sent corporate actions in an unexpected shape.');
  if(raw.next_page_token!==null&&raw.next_page_token!==undefined&&(typeof raw.next_page_token!=='string'||!PAGE_TOKEN.test(raw.next_page_token)))fail('ALPACA_SCHEMA_INVALID','Alpaca page token is invalid.');
  const events=[];let skipped=0;
  const list=name=>{const rows=groups[name];if(rows===undefined||rows===null)return [];if(!Array.isArray(rows))fail('ALPACA_SCHEMA_INVALID','Alpaca sent corporate actions in an unexpected shape.');return rows;};
  for(const [name,kind] of [['forward_splits','forward-split'],['reverse_splits','reverse-split']])
    for(const row of list(name)){
      const exDate=row&&typeof row==='object'?day(row.ex_date):null;
      if(!exDate||row.symbol!==symbol||!positive(row.old_rate)||!positive(row.new_rate)){skipped++;continue;}
      events.push({id:idOf(row.id,kind+':'+exDate),kind,symbol,exDate,recordDate:optionalDay(row.record_date),payableDate:optionalDay(row.payable_date),processDate:optionalDay(row.process_date),oldRate:row.old_rate,newRate:row.new_rate});
    }
  for(const row of list('cash_dividends')){
    const exDate=row&&typeof row==='object'?day(row.ex_date):null;
    if(!exDate||row.symbol!==symbol||!positive(row.rate)){skipped++;continue;}
    events.push({id:idOf(row.id,'cash-dividend:'+exDate),kind:'cash-dividend',symbol,exDate,recordDate:optionalDay(row.record_date),payableDate:optionalDay(row.payable_date),processDate:optionalDay(row.process_date),amount:row.rate,currency:typeof row.currency==='string'&&CURRENCY.test(row.currency)?row.currency:'USD',special:row.special===true,foreign:row.foreign===true});
  }
  return {events,nextPageToken:raw.next_page_token||null,skipped};
}
const byDate=(a,b)=>a.exDate<b.exDate?-1:a.exDate>b.exDate?1:a.kind<b.kind?-1:a.kind>b.kind?1:a.id<b.id?-1:a.id>b.id?1:0;
function sortedUnique(events){const seen=new Set(),out=[];for(const event of [...events].sort(byDate)){const key=event.kind+'|'+event.id+'|'+event.exDate;if(seen.has(key))continue;seen.add(key);out.push(event);}return out;}

const safeText=value=>typeof value==='string'?value.replace(/[^\x20-\x7e]/g,'').slice(0,200):'';
async function errorMessage(response){
  try{
    const reader=response.body?.getReader();if(!reader)return '';
    const chunks=[];let bytes=0;
    try{while(bytes<ERROR_BODY_BYTES){const item=await reader.read();if(item.done)break;chunks.push(Buffer.from(item.value));bytes+=item.value.byteLength;}}
    finally{await reader.cancel().catch(()=>{});}
    try{const value=JSON.parse(Buffer.concat(chunks).subarray(0,ERROR_BODY_BYTES).toString('utf8'));return safeText(value?.message??'').replace(/\.$/,'');}catch{return '';}
  }catch{return '';}
}
function httpFailure(status,said,onRateLimit=()=>{}){
  const quoted=said?' Alpaca said: "'+said+'".':'';
  if(status===401)fail('AUTH_FAILED','Alpaca rejected the key.'+quoted);
  if(status===403)fail('ALPACA_FORBIDDEN','Alpaca refused corporate actions for your plan.'+quoted);
  if(status===429){onRateLimit();fail('RATE_LIMITED','Alpaca says too many requests were made. Splits and dividends load again later.'+quoted);}
  if(status===400||status===422)fail('ALPACA_REQUEST_REJECTED','Alpaca rejected the corporate actions request.'+quoted);
  fail('ALPACA_HTTP_ERROR','Alpaca answered with HTTP '+status+'.'+quoted);
}
const sameUrl=(a,b)=>{try{return new URL(a).href===new URL(b).href;}catch{return false;}};

class AlpacaCorporateActions{
  /**
   * keys: the Alpaca key store (or the stub's). queue(requestId, task): AlpacaMarketData.queue, so these requests share the bars
   * rate limit. onRateLimit(): called on a 429 (main.cjs passes AlpacaMarketData.holdRest, so a 429 here starts the same 60 s
   * back-off as the bars). namespace: 'alpaca', 'alpaca-stub' (SYNTHETIC) or null (no cache, a blocked run). directory: the cache folder.
   */
  constructor({keys,queue,onRateLimit=()=>{},fetchImpl=globalThis.fetch,now=Date.now,marketNow=now,directory=null,namespace='alpaca',fs=fsDefault,timeoutMs=TIMEOUT_MS}){
    if(directory!==null&&(typeof directory!=='string'||!path.isAbsolute(directory)))throw new TypeError('The corporate actions cache needs an absolute directory.');
    if(namespace!==null&&!NAMESPACES.includes(namespace))throw new TypeError('Unknown corporate actions cache namespace.');
    this.keys=keys;this.queue=queue;this.onRateLimit=typeof onRateLimit==='function'?onRateLimit:()=>{};this.fetch=fetchImpl;this.now=now;this.marketNow=marketNow;this.directory=directory;this.namespace=namespace;this.fs=fs;this.timeoutMs=timeoutMs;
    this.loading=new Map();this.closed=false;
  }
  /** {requestId, symbol} to {ok, value:{schemaVersion:1, symbol, events, retrievedAt, cached, stale, synthetic, provenance}}. */
  async load(raw){
    let input;try{input=actionsInput(raw);}catch(error){return failure(error,'INVALID_ARGUMENT','Invalid request.');}
    if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Alpaca capability is closed.'}};
    const today=newYorkDay(this.marketNow()),cached=await this.readCache(input.symbol);
    if(cached&&cached.day===today)return {ok:true,value:this.value(input.symbol,cached,{cached:true,stale:false})};
    const pending=this.loading.get(input.symbol);
    const promise=pending??this.download(input,today).finally(()=>{this.loading.delete(input.symbol);});
    if(!pending)this.loading.set(input.symbol,promise);
    const result=await promise;
    if(result.ok)return {ok:true,value:this.value(input.symbol,result.record,{cached:false,stale:false})};
    // A failed refresh keeps showing the last good copy, marked stale; a first failure is reported.
    if(cached)return {ok:true,value:this.value(input.symbol,cached,{cached:true,stale:true,error:result.error})};
    return result;
  }
  value(symbol,record,{cached,stale,error}){
    return {schemaVersion:1,symbol,events:record.events.map(event=>({...event})),retrievedAt:record.retrievedAt,cached,stale,...(error?{error:{code:error.code,message:error.message}}:{}),synthetic:this.namespace==='alpaca-stub',
      provenance:{provider:this.namespace==='alpaca-stub'?'SYNTHETIC Alpaca stub (invented events)':'Alpaca Market Data',kind:'owner-key',source:'corporate-actions',license:LICENSE}};
  }
  async download(input,today){
    const keys=await this.keys.load();
    if(!keys)return {ok:false,error:{code:'KEY_REQUIRED',message:'Save an Alpaca API key in Live data settings first.'}};
    const events=[];let token=null;
    for(let page=0;page<MAX_PAGES;page++){
      const sourceUrl=actionsUrl(input.symbol,EARLIEST_DAY,today,token);
      const result=await this.queue(input.requestId+':'+page,(_entry,isCancelled)=>this.fetchPage(sourceUrl,keys,input.symbol,isCancelled));
      if(!result.ok)return result;
      events.push(...result.value.events);
      if(events.length>MAX_EVENTS)return {ok:false,error:{code:'ALPACA_TOO_LARGE',message:'Alpaca sent more corporate actions than OpenCandle keeps for one symbol.'}};
      token=result.value.nextPageToken;
      if(!token)break;
      if(page===MAX_PAGES-1)return {ok:false,error:{code:'ALPACA_TOO_LARGE',message:'Alpaca sent more corporate action pages than OpenCandle reads for one symbol.'}};
    }
    const record={schemaVersion:1,kind:'lv-corporate-actions',namespace:this.namespace,symbol:input.symbol,synthetic:this.namespace==='alpaca-stub',day:today,retrievedAt:new Date(this.now()).toISOString(),events:sortedUnique(events)};
    await this.writeCache(record).catch(()=>{});
    return {ok:true,record};
  }
  async fetchPage(sourceUrl,keys,symbol,isCancelled){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);let reader;
    try{
      let response;
      try{response=await this.fetch(sourceUrl,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Accept':'application/json','Accept-Encoding':'identity','APCA-API-KEY-ID':keys.keyId,'APCA-API-SECRET-KEY':keys.secret}});}
      catch{fail(controller.signal.aborted?'TIMEOUT':'ALPACA_NETWORK_ERROR',controller.signal.aborted?'Alpaca did not send splits and dividends in time.':'Could not reach Alpaca for splits and dividends.');}
      if(isCancelled()){await response.body?.cancel().catch(()=>{});return {ok:false,error:{code:'CANCELLED',message:'Alpaca request cancelled.'}};}
      if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>{});fail('REDIRECT_DENIED','Alpaca redirected the request, which OpenCandle does not follow.');}
      if(response.status!==200)httpFailure(response.status,await errorMessage(response),()=>this.onRateLimit());
      if(!sameUrl(response.url,sourceUrl))fail('ALPACA_ORIGIN_DENIED','Unexpected Alpaca response URL.');
      if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('ALPACA_FORMAT_INVALID','Alpaca sent something other than JSON data.');
      const declared=Number(response.headers.get('content-length'));
      if(Number.isFinite(declared)&&declared>MAX_BYTES)fail('ALPACA_TOO_LARGE','Alpaca corporate actions exceed the 4 MiB limit.');
      if(!response.body)fail('ALPACA_FORMAT_INVALID','Alpaca response body is absent.');
      reader=response.body.getReader();const chunks=[];let bytes=0;
      while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>MAX_BYTES)fail('ALPACA_TOO_LARGE','Alpaca corporate actions exceed the 4 MiB limit.');chunks.push(Buffer.from(item.value));}
      let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{fail('ALPACA_FORMAT_INVALID','Alpaca returned invalid UTF-8 JSON.');}
      return {ok:true,value:validateActions(raw,symbol)};
    }catch(error){return failure(error,'ALPACA_NETWORK_ERROR','Could not reach Alpaca for splits and dividends.');}
    finally{clearTimeout(timer);if(reader)await reader.cancel().catch(()=>{});}
  }
  // ---- cache ---------------------------------------------------------------------------------------------
  file(symbol){return path.join(this.directory,crypto.createHash('sha256').update('lv-corporate-actions-v1|'+this.namespace+'|'+symbol).digest('hex')+'.json');}
  async readCache(symbol){
    if(!this.directory||!this.namespace)return null;
    let text;try{text=await this.fs.readFile(this.file(symbol),'utf8');}catch{return null;}
    try{
      const record=JSON.parse(text);
      if(!record||record.schemaVersion!==1||record.kind!=='lv-corporate-actions'||record.namespace!==this.namespace||record.symbol!==symbol||record.synthetic!==(this.namespace==='alpaca-stub')||!day(record.day)||typeof record.retrievedAt!=='string'||!Array.isArray(record.events)||record.events.length>MAX_EVENTS)throw Error('Invalid record.');
      // Each cached row is checked again through the same validator as a fresh response.
      const groups={forward_splits:[],reverse_splits:[],cash_dividends:[]};
      for(const event of record.events){
        if(!event||typeof event!=='object')throw Error('Invalid event.');
        const common={id:event.id,symbol,ex_date:event.exDate,record_date:event.recordDate,payable_date:event.payableDate,process_date:event.processDate};
        if(event.kind==='forward-split')groups.forward_splits.push({...common,old_rate:event.oldRate,new_rate:event.newRate});
        else if(event.kind==='reverse-split')groups.reverse_splits.push({...common,old_rate:event.oldRate,new_rate:event.newRate});
        else if(event.kind==='cash-dividend')groups.cash_dividends.push({...common,rate:event.amount,currency:event.currency,special:event.special,foreign:event.foreign});
        else throw Error('Invalid event.');
      }
      const checked=validateActions({corporate_actions:groups},symbol);
      if(checked.skipped)throw Error('Invalid event.');
      return {...record,events:sortedUnique(checked.events)};
    }catch{await this.fs.unlink(this.file(symbol)).catch(()=>{});return null;}
  }
  async writeCache(record){
    if(!this.directory||!this.namespace)return;
    await this.fs.mkdir(this.directory,{recursive:true});
    const target=this.file(record.symbol),temporary=target+'.tmp-'+crypto.randomUUID();
    try{await this.fs.writeFile(temporary,JSON.stringify(record),{encoding:'utf8',mode:0o600});await this.fs.rename(temporary,target);}
    finally{await this.fs.unlink(temporary).catch(()=>{});}
  }
  close(){this.closed=true;}
}
module.exports={AlpacaCorporateActions,ACTIONS_CACHE_DIRECTORY,ACTION_TYPES,actionsInput,actionsUrl,validateActions,EARLIEST_DAY,PAGE_LIMIT,MAX_PAGES};
