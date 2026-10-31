'use strict';
// A keyless, SYNTHETIC stand-in for the Alpaca Market Data transport, for executable-interface
// flows and tests only. It answers the REST bars, asset list and IEX WebSocket shapes that public-alpaca.cjs reads, from
// invented deterministic prices. It contains no network code: nothing leaves this process and the real Alpaca service is never
// contacted (the real Alpaca hosts are only named through public-alpaca.cjs constants). No key is read, stored or accepted (the key lifecycle mode below holds a typed key in memory only). Prices are not market data.
//
// Selection (electron/main.cjs, decided once at startup): LV_ALPACA_STUB=synthetic, and --lv-profile must name a folder inside
// the OS temp folder (a throwaway profile: never the default profile or local-data/demo-profile). A packaged build also needs
// LV_EXE_HARNESS=alpaca-stub. A refused or malformed request blocks Alpaca entirely (no key, no request, no socket), so a run
// that asked for the stub can never reach the real service by accident. The key status says synthetic:true, so the renderer
// labels every stub dataset SYNTHETIC (live:alpaca-stub:*).
//
// LV_ALPACA_STUB=synthetic-lifecycle is the same stub behind the same gates, except that Save key and Clear
// key really toggle `configured`, so a flow can walk the key lifecycle (clear, wrong key, the stub key again, relaunch). Only
// the stub's own SYNTHETIC credential (STUB_KEYS) is accepted: the stream answers any other one with 402 auth failed and the
// REST routes with 401, as the real service does. A key that is not STUB_KEYS is held in memory only; the profile's state
// file records only "stub" or "none", never key text.
const {BoundaryError}=require('./validation.cjs');
const {REST_ORIGIN,TRADING_ORIGIN,PAPER_TRADING_ORIGIN,WS_URL,TIMEFRAMES,alpacaKeyInput}=require('./public-alpaca.cjs');

const STUB_FLAG='LV_ALPACA_STUB',STUB_VALUE='synthetic',HARNESS_FLAG='LV_EXE_HARNESS',HARNESS_VALUE='alpaca-stub';
const LIFECYCLE_VALUE='synthetic-lifecycle',LIFECYCLE_STATE_FILE='alpaca-stub-lifecycle.json';
// Synthetic credential shapes that pass the real validators. They are not keys: the stub compares them with itself only.
const STUB_KEYS=Object.freeze({keyId:'LVSYNTHETICSTUB00000',secret:'lv-synthetic-stub-not-a-key-0000000000'});
const STUB_EARLIEST=Date.UTC(2024,0,2,5)/1000; // 2024-01-02 00:00 New York, the first synthetic bar; paging past it ends with "No more data"
const STUB_LIMIT=10000;
const LISTINGS=Object.freeze([
  {symbol:'GME',base:25,name:'SYNTHETIC STUB listing GME',exchange:'NYSE'},
  {symbol:'GME.WS',base:3.2,name:'SYNTHETIC STUB listing GME.WS warrants',exchange:'NYSE'},
  {symbol:'SPY',base:580,name:'SYNTHETIC STUB listing SPY',exchange:'ARCA'},
]);

/** True when `profile` is a folder strictly inside `tmpdir`. Both are absolute paths the caller already resolved (realpath). */
function profileUnderTemp(profile,tmpdir){
  if(typeof profile!=='string'||typeof tmpdir!=='string'||!profile||!tmpdir)return false;
  const norm=value=>{let text=value.split(String.fromCharCode(92)).join('/').replace(/\/+$/,'');if(/^[a-z]:\//i.test(text))text=text.toLowerCase();return text;};
  const p=norm(profile),t=norm(tmpdir);
  if(!t||/(^|\/)\.\.?(\/|$)/.test(p))return false;
  return p.startsWith(t+'/')&&p.length>t.length+1;
}
function stubDecision({env,packaged,profile=null,tmpdir=null}){
  const requested=env&&typeof env[STUB_FLAG]==='string'?env[STUB_FLAG]:'';
  if(!requested)return {mode:'off',reason:null};
  if(requested!==STUB_VALUE&&requested!==LIFECYCLE_VALUE)return {mode:'blocked',reason:STUB_FLAG+' must be "'+STUB_VALUE+'" or "'+LIFECYCLE_VALUE+'".'};
  if(!profileUnderTemp(profile,tmpdir))return {mode:'blocked',reason:'The synthetic Alpaca stub runs only on a throwaway profile: --lv-profile must name a folder inside the OS temp folder.'};
  if(packaged&&env[HARNESS_FLAG]!==HARNESS_VALUE)return {mode:'blocked',reason:'A packaged build uses the synthetic Alpaca stub only under the exe harness ('+HARNESS_FLAG+'='+HARNESS_VALUE+').'};
  return requested===LIFECYCLE_VALUE?{mode:'synthetic',reason:null,lifecycle:true}:{mode:'synthetic',reason:null};
}

const hashOf=text=>{let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
const baseOf=symbol=>LISTINGS.find(row=>row.symbol===symbol)?.base??10+hashOf(symbol)%190;
const round=value=>Math.round(value*100)/100;
/** Invented price path: a slow swing, an hourly wave and a one-minute wave, so a level at the base is crossed every minute. */
function stubPrice(symbol,seconds){
  const base=baseOf(symbol),phase=(hashOf(symbol)%1000)/1000*2*Math.PI;
  return round(base*(1+0.06*Math.sin(2*Math.PI*seconds/(86400*23)+phase)+0.01*Math.sin(2*Math.PI*seconds/(3600*5)+phase)+0.004*Math.sin(2*Math.PI*seconds/60)));
}
function stubBar(symbol,start,seconds,end){
  const last=Math.max(start,Math.min(start+seconds-1,end)),points=[start,last];
  for(let k=1;k<8;k++)points.push(start+Math.floor((last-start)*k/8));
  const prices=points.map(time=>stubPrice(symbol,time));
  return {time:start,open:prices[0],high:Math.max(...prices),low:Math.min(...prices),close:prices[1],volume:1000+hashOf(symbol+':'+start)%9000};
}
let nyHour=null;
/** New York midnight (Unix seconds) of the calendar day that contains `seconds`. */
function newYorkMidnight(seconds){
  nyHour??=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(nyHour.formatToParts(new Date(seconds*1000)).map(part=>[part.type,part.value]));
  const day=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/1000;
  // 05:00 UTC is 00:00 (EST) or 01:00 (EDT) in New York on that day, which tells the offset in force at its midnight.
  const at=Number(Object.fromEntries(nyHour.formatToParts(new Date((day+5*3600)*1000)).map(part=>[part.type,part.value])).hour);
  return day+(at===0?5:4)*3600;
}
/** Bar start times in [start, end] that have closed by `now` (daily bars: New York midnights; the current day is included). */
function barTimes(timeframe,start,end,now){
  const seconds=TIMEFRAMES[timeframe],times=[],from=Math.max(start,STUB_EARLIEST),until=Math.min(end,now);
  if(seconds===86400){for(let day=newYorkMidnight(from);day<=until;day=newYorkMidnight(day+30*3600))if(day>=from)times.push(day);return times;}
  for(let time=Math.ceil(from/seconds)*seconds;time+seconds<=until+1&&time<=end;time+=seconds)times.push(time);
  return times;
}
const iso=seconds=>new Date(seconds*1000).toISOString().replace('.000Z','Z');
const wire=(bar,extra={})=>({...extra,t:iso(bar.time),o:bar.open,h:bar.high,l:bar.low,c:bar.close,v:bar.volume,n:10,vw:round((bar.high+bar.low+bar.close)/3)});

// Invented corporate actions for /v1/corporate-actions (the documented response shape). Every id starts with
// SYNTHETIC; the renderer labels each marker SYNTHETIC in a stub run. Quarterly cash dividends on the first weekday from the
// 15th of February, May, August and November, a 2-for-1 split on 2025-06-16 for every symbol, and a 1-for-5 reverse split on
// 2024-09-16 for symbols whose name hash is odd. Not market data.
const STUB_SPLIT_DAY='2025-06-16',STUB_REVERSE_DAY='2024-09-16';
const dayText=ms=>new Date(ms).toISOString().slice(0,10);
function stubCorporateActions(symbol,nowSeconds){
  const hash=hashOf(symbol),today=dayText(nowSeconds*1000),rows=[];
  for(let year=2024;year<=Number(today.slice(0,4));year++)for(const month of [1,4,7,10]){
    let ms=Date.UTC(year,month,15);while([0,6].includes(new Date(ms).getUTCDay()))ms+=86400000;
    const exDate=dayText(ms);if(exDate>today)continue;
    rows.push({group:'cash_dividends',exDate,row:{id:'SYNTHETIC-DIV-'+symbol+'-'+exDate,symbol,cusip:'000000000',currency:'USD',rate:round(0.1+(hash%40)/100),special:false,foreign:false,process_date:exDate,ex_date:exDate,record_date:dayText(ms+86400000),payable_date:dayText(ms+14*86400000)}});
  }
  if(STUB_SPLIT_DAY<=today)rows.push({group:'forward_splits',exDate:STUB_SPLIT_DAY,row:{id:'SYNTHETIC-SPLIT-'+symbol,symbol,cusip:'000000000',new_rate:2,old_rate:1,process_date:STUB_SPLIT_DAY,ex_date:STUB_SPLIT_DAY,record_date:'2025-06-13',payable_date:'2025-06-13'}});
  if(hash%2===1&&STUB_REVERSE_DAY<=today)rows.push({group:'reverse_splits',exDate:STUB_REVERSE_DAY,row:{id:'SYNTHETIC-RSPLIT-'+symbol,symbol,old_cusip:'000000000',new_cusip:'000000001',new_rate:1,old_rate:5,process_date:STUB_REVERSE_DAY,ex_date:STUB_REVERSE_DAY,record_date:'2024-09-13',payable_date:'2024-09-13'}});
  return rows.sort((a,b)=>a.exDate<b.exDate?-1:a.exDate>b.exDate?1:0);
}
function stubActionsPage(url,nowSeconds){
  const symbols=(url.searchParams.get('symbols')||'').split(',').filter(Boolean),types=new Set((url.searchParams.get('types')||'forward_split,reverse_split,cash_dividend').split(','));
  const start=url.searchParams.get('start')||'0000-00-00',end=url.searchParams.get('end')||'9999-99-99',limit=Math.max(1,Math.min(1000,Number(url.searchParams.get('limit'))||100)),from=Number(url.searchParams.get('page_token')||0);
  const wanted={forward_splits:'forward_split',reverse_splits:'reverse_split',cash_dividends:'cash_dividend'};
  const all=symbols.flatMap(symbol=>stubCorporateActions(symbol,nowSeconds)).filter(item=>types.has(wanted[item.group])&&item.exDate>=start&&item.exDate<=end);
  const page=all.slice(from,from+limit),corporate_actions={};
  for(const item of page)(corporate_actions[item.group]??=[]).push(item.row);
  return {corporate_actions,next_page_token:from+limit<all.length?String(from+limit):null};
}

function jsonResponse(url,value,status=200){
  const response=new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8'}});
  Object.defineProperty(response,'url',{value:url});
  return response;
}
/** True when the request headers carry exactly the stub's SYNTHETIC credential. */
const stubCredential=headers=>!!headers&&typeof headers==='object'&&headers['APCA-API-KEY-ID']===STUB_KEYS.keyId&&headers['APCA-API-SECRET-KEY']===STUB_KEYS.secret;
function createStubFetch(now,{checkKeys=false}={}){
  return async function stubFetch(input,options={}){
    if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');
    const url=new URL(String(input));
    const nowSeconds=Math.floor(now()/1000);
    // Like the real service, a request with any other credential is answered 401 (the client's rejected-key text).
    if(checkKeys&&[REST_ORIGIN,TRADING_ORIGIN,PAPER_TRADING_ORIGIN].includes(url.origin)&&!stubCredential(options?.headers))return jsonResponse(url.href,{message:'unauthorized'},401);
    if(url.origin===REST_ORIGIN&&url.pathname!=='/v1/corporate-actions'){
      const match=/^\/v2\/stocks\/([^/]+)\/bars$/.exec(url.pathname);
      if(!match)throw new TypeError('The synthetic Alpaca stub has no such route.');
      const symbol=decodeURIComponent(match[1]),timeframe=url.searchParams.get('timeframe');
      if(!Object.hasOwn(TIMEFRAMES,timeframe))throw new TypeError('Unsupported synthetic timeframe.');
      const seconds=TIMEFRAMES[timeframe],start=Date.parse(url.searchParams.get('start'))/1000,end=Date.parse(url.searchParams.get('end'))/1000;
      const limit=Math.min(STUB_LIMIT,Number(url.searchParams.get('limit'))||STUB_LIMIT),token=url.searchParams.get('page_token');
      const from=token?Number(token):start,times=barTimes(timeframe,from,end,nowSeconds),page=times.slice(0,limit);
      const bars=page.map(time=>wire(stubBar(symbol,time,seconds,nowSeconds)));
      return jsonResponse(url.href,{symbol,bars,next_page_token:times.length>limit?String(times[limit]):null});
    }
    if(url.origin===REST_ORIGIN&&url.pathname==='/v1/corporate-actions')return jsonResponse(url.href,stubActionsPage(url,nowSeconds));
    if((url.origin===TRADING_ORIGIN||url.origin===PAPER_TRADING_ORIGIN)&&url.pathname==='/v2/assets')
      return jsonResponse(url.href,LISTINGS.map(row=>({symbol:row.symbol,name:row.name,exchange:row.exchange,status:'active',tradable:true,class:'us_equity'})));
    throw new TypeError('The synthetic Alpaca stub never contacts the network.');
  };
}

/** WebSocket stand-in for the IEX stream (WS_URL): connect, auth, subscribe, then one batch of trades per
 * tick and the closed minute bar plus the current daily bar at each minute boundary. */
function createStubSocket(now,tickMs){
  return class StubAlpacaSocket{
    constructor(url){
      if(url!==WS_URL)throw new TypeError('The synthetic Alpaca stub serves only the IEX stream URL.');
      this.url=url;this.readyState=0;this.binaryType='blob';this.symbols=new Set();this.quoteSymbols=new Set();this.authenticated=false;this.closed=false;this.timer=null;this.minute=null;
      this.onopen=null;this.onmessage=null;this.onclose=null;this.onerror=null;
      setTimeout(()=>{if(this.closed)return;this.readyState=1;this.onopen?.({});this.deliver([{T:'success',msg:'connected'}]);},0);
    }
    deliver(items){setTimeout(()=>{if(!this.closed&&items.length)this.onmessage?.({data:JSON.stringify(items)});},0);}
    send(text){
      if(this.closed)return;let message;try{message=JSON.parse(String(text));}catch{this.deliver([{T:'error',code:400,msg:'invalid syntax'}]);return;}
      if(message.action==='auth'){if(message.key===STUB_KEYS.keyId&&message.secret===STUB_KEYS.secret){this.authenticated=true;this.deliver([{T:'success',msg:'authenticated'}]);}else this.deliver([{T:'error',code:402,msg:'auth failed'}]);return;}
      if(!this.authenticated){this.deliver([{T:'error',code:401,msg:'not authenticated'}]);return;}
      const listed=Array.isArray(message.trades)?message.trades.filter(symbol=>typeof symbol==='string'):[];
      const quoted=Array.isArray(message.quotes)?message.quotes.filter(symbol=>typeof symbol==='string'):[];
      if(message.action==='subscribe'){for(const symbol of listed)this.symbols.add(symbol);for(const symbol of quoted)this.quoteSymbols.add(symbol);}
      else if(message.action==='unsubscribe'){for(const symbol of listed)this.symbols.delete(symbol);for(const symbol of quoted)this.quoteSymbols.delete(symbol);}
      else return;
      const symbols=[...this.symbols].sort();
      this.deliver([{T:'subscription',trades:symbols,quotes:[...this.quoteSymbols].filter(symbol=>this.symbols.has(symbol)).sort(),bars:symbols,updatedBars:symbols,dailyBars:symbols}]);
      if(!this.timer){this.minute=Math.floor(now()/60000);this.timer=setInterval(()=>this.tick(),tickMs);}
    }
    tick(){
      if(this.closed||!this.symbols.size)return;
      const ms=now(),seconds=Math.floor(ms/1000),minute=Math.floor(ms/60000),items=[];
      for(const symbol of this.symbols)items.push({T:'t',S:symbol,i:seconds,x:'V',p:stubPrice(symbol,seconds),s:1+hashOf(symbol+seconds)%100,t:new Date(ms).toISOString(),c:['@'],z:'C'});
      // An invented one-cent spread around the invented price (SYNTHETIC, like every stub value).
      for(const symbol of this.quoteSymbols)if(this.symbols.has(symbol)){const price=stubPrice(symbol,seconds);items.push({T:'q',S:symbol,bx:'V',bp:Math.max(0.01,Math.round((price-0.01)*100)/100),bs:1+hashOf('b'+symbol+seconds)%9,ax:'V',ap:Math.round((price+0.01)*100)/100,as:1+hashOf('a'+symbol+seconds)%9,t:new Date(ms).toISOString(),c:['R'],z:'C'});}
      if(minute!==this.minute){
        const closed=this.minute*60;this.minute=minute;
        for(const symbol of this.symbols){items.push(wire(stubBar(symbol,closed,60,seconds),{T:'b',S:symbol}));const day=newYorkMidnight(seconds);items.push(wire(stubBar(symbol,day,86400,seconds),{T:'d',S:symbol}));}
      }
      this.deliver(items);
    }
    close(){if(this.closed)return;this.closed=true;this.readyState=3;clearInterval(this.timer);this.timer=null;}
  };
}

/** Key store shape AlpacaKeyStore exposes. Synthetic: configured, saves refused. Blocked: never configured, saves refused. */
function stubKeys(synthetic){
  const refuse=()=>{throw new BoundaryError('KEY_STORAGE_UNAVAILABLE',synthetic?'This run uses the synthetic Alpaca stub, which never stores a key.':'Alpaca is blocked in this run because a synthetic stub was requested but refused.');};
  return {
    available:()=>true,
    load:async()=>synthetic?{...STUB_KEYS}:null,
    status:async()=>({configured:synthetic,keyIdHint:synthetic?'****STUB':null,encryption:true,...(synthetic?{synthetic:true}:{})}),
    save:async()=>refuse(),
    clear:async()=>({configured:synthetic,keyIdHint:synthetic?'****STUB':null,encryption:true}),
  };
}

/**
 * The key store of LV_ALPACA_STUB=synthetic-lifecycle. Save and clear toggle `configured` for real. Saving
 * goes through the real input validator (alpacaKeyInput), so badly shaped input gets the real messages; any well-shaped key is
 * kept, as the real store does, and only STUB_KEYS then authenticates. `state` ({read, write}, bound by main.cjs to one file
 * in the throwaway profile) remembers across a relaunch whether the stub key is saved: the text written is {"v":1,"key":"stub"}
 * or {"v":1,"key":"none"} only, so a key that is not STUB_KEYS is never written anywhere (after a relaunch it counts as none).
 * A missing or unreadable state file means the stub key is saved (the first launch starts connected, like LV_ALPACA_STUB=synthetic).
 */
function lifecycleKeys(state){
  let current; // undefined until the state file is read; then null (no key) or {keyId, secret}
  const isStub=keys=>!!keys&&keys.keyId===STUB_KEYS.keyId&&keys.secret===STUB_KEYS.secret;
  const read=async()=>{
    if(current!==undefined)return current;
    let saved='stub';
    try{const text=await state?.read?.();const value=typeof text==='string'?JSON.parse(text):null;if(value&&value.v===1&&(value.key==='stub'||value.key==='none'))saved=value.key;}catch{/* missing or unreadable: the stub key */}
    if(current===undefined)current=saved==='stub'?{...STUB_KEYS}:null;
    return current;
  };
  const persist=async keys=>{try{await state?.write?.(JSON.stringify({v:1,key:isStub(keys)?'stub':'none'}));}catch{/* the in-memory state still holds for this run */}};
  const status=async()=>{const keys=await read();return {configured:!!keys,keyIdHint:keys?(isStub(keys)?'****STUB':'****'+keys.keyId.slice(-4)):null,encryption:true,synthetic:true};};
  return {
    available:()=>true,
    load:async()=>{const keys=await read();return keys?{...keys}:null;},
    status,
    save:async input=>{const keys=alpacaKeyInput(input);current={keyId:keys.keyId,secret:keys.secret};await persist(current);return status();},
    clear:async()=>{current=null;await persist(null);return status();},
  };
}

/**
 * The Alpaca transport for this run: null (stub not requested), the synthetic stub, or a blocked transport. Options:
 * env (process.env), packaged (app.isPackaged), profile and tmpdir (resolved --lv-profile and OS temp folder), now and
 * tickMs (tests), state (key lifecycle mode: {read, write} of the lifecycle state file; used only in that mode).
 */
// Only an admitted keyless stub may select a named business-time fixture. Real arrival/deadline clocks stay real.
const CLOCK_FLAG='LV_ALPACA_CLOCK';
const CLOCK_EPOCHS=Object.freeze({regular:Date.UTC(2026,9,20,16),closed:Date.UTC(2026,9,21,2)});
function syntheticClock(scenario,elapsedNow){
  const started=elapsedNow();let elapsed=0;
  const now=()=>{elapsed=Math.max(elapsed,elapsedNow()-started);return CLOCK_EPOCHS[scenario]+Math.floor(elapsed);};
  return Object.freeze({now,sample:()=>({scenario,nowMs:now()})});
}
function alpacaStubTransport({env,packaged,profile=null,tmpdir=null,now=Date.now,tickMs=1000,state=null,elapsedNow=()=>globalThis.performance.now()}={}){
  let decision=stubDecision({env,packaged,profile,tmpdir});
  if(decision.mode==='off')return null;
  const scenario=env&&env[CLOCK_FLAG];
  if(decision.mode==='synthetic'&&scenario!==undefined&&scenario!=='regular'&&scenario!=='closed')decision={mode:'blocked',reason:CLOCK_FLAG+' must name the regular or closed synthetic clock scenario.'};
  const dataScenario=env&&env.LV_ALPACA_SCENARIO;
  if(decision.mode==='synthetic'&&dataScenario!==undefined&&(dataScenario!=='nyse-seasonality-v1'||decision.lifecycle))decision={mode:'blocked',reason:'LV_ALPACA_SCENARIO supports only nyse-seasonality-v1 in non-lifecycle synthetic mode.'};
  if(decision.mode==='blocked')return {mode:'blocked',reason:decision.reason,keys:stubKeys(false),
    fetch:async()=>{throw new TypeError('Alpaca is blocked in this run: '+decision.reason);},
    WebSocket:class BlockedAlpacaSocket{constructor(){throw new TypeError('Alpaca is blocked in this run: '+decision.reason);}}};
  const clock=scenario?syntheticClock(scenario,elapsedNow):null;if(clock)now=clock.now;
  if(dataScenario){const transport=require('./alpaca-nyse-seasonality-stub.cjs').createNyseSeasonalityScenario(now,createStubFetch(now),createStubSocket(now,tickMs));return {mode:'synthetic',scenario:dataScenario,reason:null,keys:stubKeys(true),fetch:transport.fetch,WebSocket:transport.WebSocket,restMinIntervalMs:50,...(clock?{clock}:{})};}
  if(decision.lifecycle)return {mode:'synthetic',lifecycle:true,reason:null,keys:lifecycleKeys(state),fetch:createStubFetch(now,{checkKeys:true}),WebSocket:createStubSocket(now,tickMs),restMinIntervalMs:50,...(clock?{clock}:{})};
  return {mode:'synthetic',reason:null,keys:stubKeys(true),fetch:createStubFetch(now),WebSocket:createStubSocket(now,tickMs),restMinIntervalMs:50,...(clock?{clock}:{})};
}

module.exports={stubCorporateActions,STUB_SPLIT_DAY,STUB_REVERSE_DAY,alpacaStubTransport,stubDecision,profileUnderTemp,stubPrice,stubBar,newYorkMidnight,barTimes,STUB_KEYS,STUB_EARLIEST,STUB_FLAG,STUB_VALUE,LIFECYCLE_VALUE,LIFECYCLE_STATE_FILE,HARNESS_FLAG,HARNESS_VALUE,LISTINGS};
