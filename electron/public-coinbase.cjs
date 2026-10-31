'use strict';
// Optional live crypto market data: Coinbase Advanced Trade PUBLIC market data (no account, no key, no JWT).
// Main process only. The renderer never receives a URL, host, socket or header: it names an allow-listed
// product and a granularity enum, and receives validated, normalized candles and ticker prices.
// Sources (checked 2026-10-20): docs.cdp.coinbase.com advanced-trade websocket overview/channels/rate limits,
// api-reference advanced-trade websocket candles/heartbeats, REST get-public-product-candles.
const {BoundaryError,exactKeys,cancelInput}=require('./validation.cjs');

const REST_ORIGIN='https://api.coinbase.com';
const WS_URL='wss://advanced-trade-ws.coinbase.com';
const PRODUCTS=Object.freeze(['BTC-USD','ETH-USD','SOL-USD']);
const GRANULARITIES=Object.freeze({ONE_MINUTE:60,FIVE_MINUTE:300,FIFTEEN_MINUTE:900,ONE_HOUR:3600,SIX_HOUR:21600,ONE_DAY:86400});
const MAX_CANDLES=350; // documented per-request maximum
const REST_MAX_BYTES=1024*1024;
const REST_TIMEOUT_MS=10000;
const REST_MIN_INTERVAL_MS=250;
const REST_MAX_QUEUE=8;
const REST_DENIED_BACKOFF_MS=60*1000;
const WS_MAX_MESSAGE_BYTES=1024*1024;
const WS_MAX_MESSAGES_PER_SECOND=400;
const WS_CONNECT_TIMEOUT_MS=10000;
const WS_STALE_MS=10000; // heartbeats arrive every second
const WS_DEAD_MS=30000;
const WS_BACKOFF_BASE_MS=1000;
const WS_BACKOFF_MAX_MS=60000;
const FLUSH_MS=250;
const EARLIEST=Date.UTC(2015,0,1)/1000;
const DECIMAL=/^\d{1,20}(?:\.\d{1,20})?$/;
const LICENSE='Coinbase Market Data Terms: personal, internal display only; not redistributable.';

const fail=(code,message)=>{throw new BoundaryError(code,message);};
function productInput(value){if(typeof value!=='string'||!PRODUCTS.includes(value))fail('INVALID_ARGUMENT','Unsupported Coinbase product.');return value;}
function candlesInput(value){
  exactKeys(value,['requestId','productId','granularity','start','end']);
  cancelInput({requestId:value.requestId});
  const productId=productInput(value.productId);
  const seconds=GRANULARITIES[value.granularity];
  if(typeof value.granularity!=='string'||!Object.hasOwn(GRANULARITIES,value.granularity))fail('INVALID_ARGUMENT','Unsupported Coinbase granularity.');
  const {start,end}=value;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<EARLIEST||end<=start||end>Math.floor(Date.now()/1000)+86400)fail('INVALID_ARGUMENT','Invalid candle time range.');
  if(Math.ceil((end-start)/seconds)>MAX_CANDLES)fail('INVALID_ARGUMENT','A candle request covers at most 350 buckets.');
  return {requestId:value.requestId,productId,granularity:value.granularity,seconds,start,end};
}
function subscribeInput(value){
  exactKeys(value,['productIds']);
  if(!Array.isArray(value.productIds)||value.productIds.length<1||value.productIds.length>PRODUCTS.length)fail('INVALID_ARGUMENT','Subscribe to one to three allow-listed products.');
  const ids=value.productIds.map(productInput);
  if(new Set(ids).size!==ids.length)fail('INVALID_ARGUMENT','Duplicate products.');
  return [...ids].sort();
}
/** The ticker channel's best bid and ask (best_bid, best_ask and their quantities), when the
 * message carries them. Absent or empty fields add nothing; a malformed or crossed pair throws, and acceptTicker then keeps
 * the ticker's price without the quote fields.
 * The newest ticker of each minute wins, and the feed flushes every 250 ms, so at most 4 quotes a second reach a window. */
function bestBidAsk(item){
  const read=(value,field)=>value===undefined||value===null||value===''?null:decimal(value,field,false);
  const bid=read(item.best_bid,'best bid'),ask=read(item.best_ask,'best ask');
  if((bid===null||bid===0)&&(ask===null||ask===0))return {};
  if(bid&&ask&&ask<bid)fail('COINBASE_SCHEMA_INVALID','Coinbase best bid and ask are crossed.');
  const bidSize=bid?read(item.best_bid_quantity,'best bid quantity'):null,askSize=ask?read(item.best_ask_quantity,'best ask quantity'):null;
  return {bid:bid||null,ask:ask||null,bidSize,askSize};
}
function decimal(value,field,positive){
  if(typeof value!=='string'||!DECIMAL.test(value))fail('COINBASE_SCHEMA_INVALID','Coinbase '+field+' must be a plain decimal string.');
  const number=Number(value);
  if(!Number.isFinite(number)||(positive?number<=0:number<0))fail('COINBASE_SCHEMA_INVALID','Coinbase '+field+' is out of range.');
  return number;
}
/** One candle object (REST or WebSocket). Unknown fields are ignored, required fields are strict. */
function candle(value,seconds,nowSeconds){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('COINBASE_SCHEMA_INVALID','Coinbase candle must be an object.');
  if(typeof value.start!=='string'||!/^\d{1,12}$/.test(value.start))fail('COINBASE_SCHEMA_INVALID','Coinbase candle start must be Unix seconds.');
  const time=Number(value.start);
  if(time<EARLIEST||time%seconds!==0||time>nowSeconds+seconds+60)fail('COINBASE_TIME_INVALID','Coinbase candle start is misaligned or outside the accepted time window.');
  const bar={time,open:decimal(value.open,'open',true),high:decimal(value.high,'high',true),low:decimal(value.low,'low',true),close:decimal(value.close,'close',true),volume:decimal(value.volume,'volume',false)};
  if(bar.high<Math.max(bar.open,bar.close,bar.low)||bar.low>Math.min(bar.open,bar.close,bar.high))fail('COINBASE_SCHEMA_INVALID','Coinbase candle OHLC range is inconsistent.');
  return bar;
}
function validateRestCandles(raw,input,nowSeconds){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.candles))fail('COINBASE_SCHEMA_INVALID','Coinbase candles response must contain a candles array.');
  if(raw.candles.length>MAX_CANDLES)fail('COINBASE_SCHEMA_INVALID','Coinbase returned more candles than requested.');
  const byTime=new Map();
  for(const item of raw.candles){
    const bar=candle(item,input.seconds,nowSeconds);
    if(bar.time<input.start-input.seconds||bar.time>input.end)fail('COINBASE_TIME_INVALID','Coinbase candle is outside the requested range.');
    const prior=byTime.get(bar.time);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(bar))fail('COINBASE_SCHEMA_INVALID','Coinbase returned conflicting candles for one bucket.');
    byTime.set(bar.time,bar);
  }
  // Coinbase lists newest first; the domain wants chronological bars.
  return [...byTime.values()].sort((a,b)=>a.time-b.time);
}
function parseServerTime(value){
  if(typeof value!=='string'||value.length>40)return null;
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if(!match)return null;
  const ms=Date.parse(match[1]+'.'+(match[2]||'0').padEnd(3,'0').slice(0,3)+'Z');
  return Number.isFinite(ms)?ms:null;
}
const safeText=value=>typeof value==='string'?value.replace(/[^\x20-\x7e]/g,'').slice(0,200):'';

class CoinbasePublicFeed {
  constructor({fetchImpl=globalThis.fetch,WebSocketImpl=globalThis.WebSocket,now=Date.now,random=Math.random,emit=()=>{},restMinIntervalMs=REST_MIN_INTERVAL_MS,restTimeoutMs=REST_TIMEOUT_MS}={}){
    this.fetch=fetchImpl;this.WebSocket=WebSocketImpl;this.now=now;this.random=random;this.emit=emit;
    this.restMinIntervalMs=restMinIntervalMs;this.restTimeoutMs=restTimeoutMs;
    this.closed=false;this.restQueue=Promise.resolve();this.restQueued=0;this.restNextAt=0;this.restDeniedUntil=0;this.active=new Map();
    this.products=[];this.socket=null;this.state='idle';this.attempt=0;this.reconnectTimer=null;this.connectTimer=null;this.flushTimer=null;this.watchdog=null;
    this.lastMessageAt=0;this.lastSequence=null;this.rateWindow={start:0,count:0};this.pending={candles:new Map(),tickers:new Map()};
    this.counters={received:0,dropped:0,rejected:0,gaps:0,reconnects:0};this.lastError=null;this.liveMessages=false;
  }
  // ---- REST backfill -------------------------------------------------------------------------------------
  candles(raw){
    let input;try{input=candlesInput(raw);}catch(error){return Promise.resolve(this.failure(error));}
    if(this.closed)return Promise.resolve({ok:false,error:{code:'CLOSED',message:'Live crypto capability is closed.'}});
    if(this.active.has(input.requestId))return Promise.resolve({ok:false,error:{code:'INVALID_ARGUMENT',message:'Request identifier is already active.'}});
    if(this.restQueued>=REST_MAX_QUEUE)return Promise.resolve({ok:false,error:{code:'BUSY',message:'Too many Coinbase candle requests are queued.'}});
    this.restQueued++;
    let cancelled=false;
    const entry={cancel:()=>{cancelled=true;entry.abort?.();}};
    this.active.set(input.requestId,entry);
    const run=async()=>{
      try{
        if(cancelled)return {ok:false,error:{code:'CANCELLED',message:'Coinbase request cancelled before data commit.'}};
        if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Live crypto capability is closed.'}};
        if(this.now()<this.restDeniedUntil)return {ok:false,error:{code:'RATE_LIMITED',message:'Coinbase limited public requests. Wait before requesting again.'}};
        const wait=this.restNextAt-this.now();
        if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
        this.restNextAt=this.now()+this.restMinIntervalMs;
        if(cancelled)return {ok:false,error:{code:'CANCELLED',message:'Coinbase request cancelled before data commit.'}};
        return await this.fetchCandles(input,entry,()=>cancelled);
      }finally{this.restQueued--;this.active.delete(input.requestId);}
    };
    const result=this.restQueue.then(run,run);
    this.restQueue=result.catch(()=>{});
    return result;
  }
  sourceUrl(input){return REST_ORIGIN+'/api/v3/brokerage/market/products/'+input.productId+'/candles?start='+input.start+'&end='+input.end+'&granularity='+input.granularity+'&limit='+MAX_CANDLES;}
  fetchCandles(input,entry,isCancelled){
    const sourceUrl=this.sourceUrl(input);
    return new Promise(resolve=>{
      let finished=false,reader;
      const controller=new AbortController();
      const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);controller.abort();void reader?.cancel().catch(()=>{});resolve(result);};
      const timer=setTimeout(()=>finish({ok:false,error:{code:'TIMEOUT',message:'Coinbase candle request exceeded ten seconds.'}}),this.restTimeoutMs);
      entry.abort=()=>finish({ok:false,error:{code:'CANCELLED',message:'Coinbase request cancelled before data commit.'}});
      void(async()=>{
        try{
          const response=await this.fetch(sourceUrl,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Accept':'application/json','Accept-Encoding':'identity'}});
          if(finished||isCancelled()){await response.body?.cancel().catch(()=>{});return;}
          if(response.status===429||response.status===403){this.restDeniedUntil=this.now()+REST_DENIED_BACKOFF_MS;fail('RATE_LIMITED','Coinbase denied or limited this public request. No retry was made.');}
          if(response.status>=300&&response.status<400)fail('REDIRECT_DENIED','Coinbase redirect was denied.');
          if(response.status!==200)fail('COINBASE_HTTP_ERROR','Coinbase returned an unsuccessful public-data response.');
          if(response.url!==sourceUrl)fail('COINBASE_ORIGIN_DENIED','Unexpected public-data response URL.');
          if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('COINBASE_FORMAT_INVALID','Expected a Coinbase JSON response.');
          const declared=Number(response.headers.get('content-length'));
          if(Number.isFinite(declared)&&declared>REST_MAX_BYTES)fail('COINBASE_TOO_LARGE','Coinbase response exceeds the 1 MiB limit.');
          if(!response.body)fail('COINBASE_FORMAT_INVALID','Coinbase response body is absent.');
          reader=response.body.getReader();const chunks=[];let bytes=0;
          try{while(true){const item=await reader.read();if(finished)return;if(item.done)break;bytes+=item.value.byteLength;if(bytes>REST_MAX_BYTES)fail('COINBASE_TOO_LARGE','Coinbase response exceeds the 1 MiB limit.');chunks.push(Buffer.from(item.value));}}
          finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          if(finished)return;
          let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{fail('COINBASE_FORMAT_INVALID','Coinbase returned invalid UTF-8 JSON.');}
          const bars=validateRestCandles(raw,input,Math.floor(this.now()/1000));
          if(finished||isCancelled())return;
          finish({ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:input.seconds,bars,provenance:{provider:'Coinbase Advanced Trade public market data',kind:'public-unauthenticated',sourceUrl,retrievedAt:new Date(this.now()).toISOString(),bytes,license:LICENSE}}});
        }catch(error){if(!finished)finish(this.failure(error,'COINBASE_NETWORK_ERROR','Public Coinbase request failed. No retry was made.'));}
      })();
    });
  }
  cancel(requestId){const entry=this.active.get(requestId);if(!entry)return false;entry.cancel();return true;}
  failure(error,code='INVALID_ARGUMENT',message='Invalid request.'){return {ok:false,error:{code:error instanceof BoundaryError?error.code:code,message:error instanceof BoundaryError?error.message:message}};}
  // ---- WebSocket stream ----------------------------------------------------------------------------------
  subscribe(raw){
    let products;try{products=subscribeInput(raw);}catch(error){return this.failure(error);}
    if(this.closed)return {ok:false,error:{code:'CLOSED',message:'Live crypto capability is closed.'}};
    if(typeof this.WebSocket!=='function')return {ok:false,error:{code:'UNAVAILABLE',message:'WebSocket support is unavailable in this runtime.'}};
    const same=products.join()===this.products.join();
    const previous=this.products;this.products=products;
    if(same&&this.socket)return {ok:true,value:this.status()};
    if(this.socket&&this.state!=='connecting'){this.sendSubscriptions('unsubscribe',previous);this.sendSubscriptions('subscribe',products);}
    else if(!this.socket&&!this.reconnectTimer)this.connect();
    return {ok:true,value:this.status()};
  }
  unsubscribe(){this.products=[];this.teardown();this.attempt=0;this.setState('idle');return {ok:true,value:this.status()};}
  status(){return {schemaVersion:1,state:this.state,productIds:[...this.products],attempt:this.attempt,lastMessageAt:this.lastMessageAt||null,liveMessages:this.liveMessages,counters:{...this.counters},lastError:this.lastError};}
  connect(){
    if(this.closed||!this.products.length)return;
    this.setState('connecting');
    let socket;
    try{socket=new this.WebSocket(WS_URL);}catch{this.scheduleReconnect('Could not open the Coinbase public connection.');return;}
    this.socket=socket;this.lastSequence=null;
    this.connectTimer=setTimeout(()=>{if(this.socket===socket&&this.state==='connecting'){this.drop(socket);this.scheduleReconnect('Coinbase connection timed out.');}},WS_CONNECT_TIMEOUT_MS);
    socket.onopen=()=>{if(this.socket!==socket)return;clearTimeout(this.connectTimer);this.connectTimer=null;this.lastMessageAt=this.now();
      // Subscribe within the documented five-second deadline; heartbeats keep quiet channels open.
      this.send(socket,{type:'subscribe',channel:'heartbeats'});this.sendSubscriptions('subscribe',this.products);
      this.setState('ready');this.startTimers();};
    socket.onmessage=event=>{if(this.socket===socket)this.receive(event?.data);};
    socket.onerror=()=>{};
    socket.onclose=()=>{if(this.socket!==socket)return;this.drop(socket);this.scheduleReconnect('Coinbase connection closed.');};
  }
  sendSubscriptions(type,products){if(!products.length||!this.socket)return;for(const channel of ['candles','ticker'])this.send(this.socket,{type,product_ids:[...products],channel});}
  send(socket,message){try{socket.send(JSON.stringify(message));}catch{/* close handler reconnects */}}
  startTimers(){
    clearInterval(this.flushTimer);clearInterval(this.watchdog);
    this.flushTimer=setInterval(()=>this.flush(),FLUSH_MS);
    this.watchdog=setInterval(()=>{
      if(!this.socket||this.state==='connecting')return;
      const silent=this.now()-this.lastMessageAt;
      if(silent>=WS_DEAD_MS){const socket=this.socket;this.drop(socket);this.scheduleReconnect('Coinbase feed went silent.');}
      else if(silent>=WS_STALE_MS&&this.state==='ready')this.setState('stale');
    },1000);
  }
  drop(socket){
    if(this.socket===socket)this.socket=null;
    clearTimeout(this.connectTimer);this.connectTimer=null;clearInterval(this.flushTimer);this.flushTimer=null;clearInterval(this.watchdog);this.watchdog=null;
    try{socket.onopen=socket.onmessage=socket.onclose=socket.onerror=null;socket.close();}catch{/* already closed */}
  }
  teardown(){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;if(this.socket)this.drop(this.socket);this.pending.candles.clear();this.pending.tickers.clear();}
  scheduleReconnect(reason){
    this.flush();
    this.lastError=reason;
    if(this.closed||!this.products.length){this.setState(this.closed?'closed':'idle');return;}
    this.setState('disconnected');
    const ceiling=Math.min(WS_BACKOFF_MAX_MS,WS_BACKOFF_BASE_MS*2**Math.min(this.attempt,16));
    const delay=Math.max(WS_BACKOFF_BASE_MS,Math.round(ceiling*(0.5+this.random()*0.5)));
    this.attempt++;this.counters.reconnects++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.connect();},delay);
  }
  setState(state){if(this.state===state)return;this.state=state;this.emit({schemaVersion:1,kind:'status',status:this.status()});}
  receive(data){
    const now=this.now();
    if(now-this.rateWindow.start>=1000)this.rateWindow={start:now,count:0};
    if(++this.rateWindow.count>WS_MAX_MESSAGES_PER_SECOND){this.counters.dropped++;return;}
    if(typeof data!=='string'||data.length>WS_MAX_MESSAGE_BYTES||Buffer.byteLength(data)>WS_MAX_MESSAGE_BYTES){this.counters.rejected++;return;}
    let message;try{message=JSON.parse(data);}catch{this.counters.rejected++;return;}
    if(!message||typeof message!=='object'||Array.isArray(message)){this.counters.rejected++;return;}
    this.counters.received++;this.lastMessageAt=now;
    if(this.state==='stale')this.setState('ready');
    if(message.type==='error'){this.lastError=safeText(message.message)||'Coinbase reported a subscription error.';this.emit({schemaVersion:1,kind:'status',status:this.status()});return;}
    if(Number.isSafeInteger(message.sequence_num)){
      if(this.lastSequence!==null&&message.sequence_num!==this.lastSequence+1){this.counters.gaps++;this.pending.gap=true;}
      this.lastSequence=message.sequence_num;
    }
    try{
      if(message.channel==='candles')this.acceptCandles(message);
      else if(message.channel==='ticker')this.acceptTicker(message);
      // heartbeats/subscriptions only prove liveness; unknown message types are ignored as documented.
    }catch{this.counters.rejected++;}
  }
  acceptCandles(message){
    if(!Array.isArray(message.events)||message.events.length>20)fail('COINBASE_SCHEMA_INVALID','Invalid candles events.');
    const nowSeconds=Math.floor(this.now()/1000),accepted=[];
    for(const event of message.events){
      if(!event||!['snapshot','update'].includes(event.type)||!Array.isArray(event.candles)||event.candles.length>MAX_CANDLES)fail('COINBASE_SCHEMA_INVALID','Invalid candles event.');
      for(const item of event.candles){if(!this.products.includes(item?.product_id))fail('COINBASE_SCHEMA_INVALID','Unexpected product.');accepted.push({productId:item.product_id,bar:candle(item,300,nowSeconds)});}
    }
    this.liveMessages=true;
    for(const row of accepted)this.pending.candles.set(row.productId+'|'+row.bar.time,{productId:row.productId,seconds:300,...row.bar});
  }
  acceptTicker(message){
    const time=parseServerTime(message.timestamp);
    if(time===null||Math.abs(time-this.now())>86400000)fail('COINBASE_TIME_INVALID','Invalid ticker timestamp.');
    if(!Array.isArray(message.events)||message.events.length>20)fail('COINBASE_SCHEMA_INVALID','Invalid ticker events.');
    const accepted=[];let refusedQuote=null;
    for(const event of message.events){
      if(!event||!Array.isArray(event.tickers)||event.tickers.length>50)fail('COINBASE_SCHEMA_INVALID','Invalid ticker event.');
      for(const item of event.tickers){
        if(!item||!this.products.includes(item.product_id))fail('COINBASE_SCHEMA_INVALID','Unexpected product.');
        const price=decimal(item.price,'price',true);
        // A crossed or malformed best bid and ask drops only those quote fields, never the price.
        let quote;try{quote=bestBidAsk(item);}catch(error){quote={};refusedQuote=refusedQuote||error;}
        accepted.push({productId:item.product_id,price,time:Math.floor(time/1000),...quote});
      }
    }
    this.liveMessages=true;
    for(const row of accepted){const key=row.productId+'|'+Math.floor(row.time/60),prior=this.pending.tickers.get(key);this.pending.tickers.set(key,prior?{...prior,...row,time:Math.max(prior.time,row.time),high:Math.max(prior.high,row.price),low:Math.min(prior.low,row.price)}:{...row,high:row.price,low:row.price});}
    // The prices are kept above; the refused quote is still reported, so receive() counts it in counters.rejected.
    if(refusedQuote)throw refusedQuote;
  }
  flush(){
    const candles=[...this.pending.candles.values()],tickers=[...this.pending.tickers.values()],gap=!!this.pending.gap;
    if(!candles.length&&!tickers.length&&!gap)return;
    this.pending.candles.clear();this.pending.tickers.clear();this.pending.gap=false;
    this.emit({schemaVersion:1,kind:'batch',candles,tickers,gap,receivedAt:new Date(this.now()).toISOString()});
  }
  close(){this.closed=true;this.products=[];for(const entry of Array.from(this.active.values()))entry.cancel();this.teardown();this.setState('closed');}
}
module.exports={CoinbasePublicFeed,candlesInput,subscribeInput,validateRestCandles,parseServerTime,PRODUCTS,GRANULARITIES,WS_URL,REST_ORIGIN,REST_MAX_BYTES,WS_MAX_MESSAGE_BYTES,WS_MAX_MESSAGES_PER_SECOND,LICENSE};
