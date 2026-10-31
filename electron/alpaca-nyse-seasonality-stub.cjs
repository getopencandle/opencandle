'use strict';
// Explicit opt-in SYNTHETIC prices only. This is not a market-data source or a calendar/completion permission.
// Trading dates reuse the original LV 2015..2026 NYSE calendar data; tests compare every date with its canonical module.
const {REST_ORIGIN,TIMEFRAMES}=require('./public-alpaca.cjs');
const HOLIDAYS=new Set(["2015-01-01","2015-01-19","2015-02-16","2015-04-03","2015-05-25","2015-07-03","2015-09-07","2015-11-26","2015-12-25","2016-01-01","2016-01-18","2016-02-15","2016-03-25","2016-05-30","2016-07-04","2016-09-05","2016-11-24","2016-12-26","2017-01-02","2017-01-16","2017-02-20","2017-04-14","2017-05-29","2017-07-04","2017-09-04","2017-11-23","2017-12-25","2018-01-01","2018-01-15","2018-02-19","2018-03-30","2018-05-28","2018-07-04","2018-09-03","2018-11-22","2018-12-05","2018-12-25","2019-01-01","2019-01-21","2019-02-18","2019-04-19","2019-05-27","2019-07-04","2019-09-02","2019-11-28","2019-12-25","2020-01-01","2020-01-20","2020-02-17","2020-04-10","2020-05-25","2020-07-03","2020-09-07","2020-11-26","2020-12-25","2021-01-01","2021-01-18","2021-02-15","2021-04-02","2021-05-31","2021-07-05","2021-09-06","2021-11-25","2021-12-24","2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26","2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25","2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25","2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25","2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const EARLY_CLOSES=new Set(["2015-11-27","2015-12-24","2016-11-25","2017-07-03","2017-11-24","2018-07-03","2018-11-23","2018-12-24","2019-07-03","2019-11-29","2019-12-24","2020-11-27","2020-12-24","2021-11-26","2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29","2024-12-24","2025-07-03","2025-11-28","2025-12-24","2026-11-27","2026-12-24"]);
const DAY=86400,MINUTE=60,FLOOR=Date.UTC(2015,0,1)/1000,CEILING=Date.UTC(2027,0,1,5)/1000,PAGE_ROWS=10000;
const BASES=Object.freeze({GME:25,SPY:580,'GME.WS':3.2});
const fail=message=>{throw new TypeError('SYNTHETIC NYSE scenario: '+message);};
const safe=value=>typeof value==='number'&&Number.isSafeInteger(value);
const text=day=>new Date(day*1000).toISOString().slice(0,10);
function midnight(day){
 const date=new Date(day*1000),year=date.getUTCFullYear();
 // All fixture years follow the post-2007 US DST rule. At midnight on a transition Sunday the OLD offset still applies.
 const march=Date.UTC(year,2,1)/1000,november=Date.UTC(year,10,1)/1000;
 const spring=march+((7-new Date(march*1000).getUTCDay())%7+7)*DAY,fall=november+(7-new Date(november*1000).getUTCDay())%7*DAY;
 return day+(day>spring&&day<=fall?4:5)*3600;
}
function dayOf(seconds){let day=Math.floor(seconds/DAY)*DAY;if(seconds<midnight(day))day-=DAY;return day;}
function session(day){
 if(day<FLOOR||day>=Date.UTC(2027,0,1)/1000)return null;const weekday=new Date(day*1000).getUTCDay(),date=text(day);
 if(weekday===0||weekday===6||HOLIDAYS.has(date))return null;
 // A trading day's open/close occur after any DST transition; its own midnight uses the same offset on weekdays.
 const start=midnight(day);return{day,start,open:start+570*MINUTE,close:start+(EARLY_CLOSES.has(date)?780:960)*MINUTE};
}
function price(symbol,seconds){if(!Object.hasOwn(BASES,symbol))fail('only the three declared synthetic listings are supported.');return BASES[symbol]*(new Date(dayOf(seconds)*1000).getUTCMonth()===9?9/8:1);}
function bar(symbol,time){const value=price(symbol,time);return{t:new Date(time*1000).toISOString().replace('.000Z','Z'),o:value,h:value,l:value,c:value,v:1000,n:1,vw:value};}
function response(url,value){const result=new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});Object.defineProperty(result,'url',{value:url});return result;}
function nowSeconds(now){const value=Math.floor(now()/1000);if(!safe(value)||value<FLOOR||value>=CEILING)fail('the clock must remain in the declared 2015..2026 fixture window.');return value;}
function query(url,now){
 const match=/^\/v2\/stocks\/([^/]+)\/bars$/.exec(url.pathname);if(!match)return null;if(url.href.length>8192)fail('request URL exceeds its fixed bound.');
 const q=url.searchParams,allowed=new Set(['timeframe','start','end','limit','feed','adjustment','sort','page_token']);
 for(const key of q.keys())if(!allowed.has(key)||q.getAll(key).length!==1)fail('duplicate or unsupported query field.');
 const symbol=decodeURIComponent(match[1]),timeframe=q.get('timeframe'),start=Date.parse(q.get('start'))/1000,end=Date.parse(q.get('end'))/1000,limit=Number(q.get('limit')),feed=q.get('feed'),adjustment=q.get('adjustment');
 if(url.username||url.password||url.hash||!Object.hasOwn(BASES,symbol)||!Object.hasOwn(TIMEFRAMES,timeframe)||!safe(start)||!safe(end)||start<FLOOR||end<=start||end>CEILING||!safe(limit)||!/^([1-9]\d{0,4})$/.test(q.get('limit'))||limit<1||limit>PAGE_ROWS||!['iex','sip'].includes(feed)||!['raw','split','split,dividend'].includes(adjustment)||q.get('sort')!=='asc')fail('invalid symbol, interval, window, page size or source options.');
 if(![start,end].every((value,index)=>{const expected=new Date(value*1000).toISOString(),given=q.get(index?'end':'start');return given===expected||given===expected.replace('.000Z','Z');}))fail('timestamps require exact UTC second labels.');
 const seconds=TIMEFRAMES[timeframe],prefix='nyse1_'+symbol.replaceAll('.','_')+'_'+timeframe+'_'+start+'_'+end+'_'+feed+'_'+adjustment.replaceAll(',','_')+'_'+limit+'_',token=q.get('page_token');let cursor=start;
 if(token!==null){if(token.length>512||!token.startsWith(prefix)||!/^\d+$/.test(token.slice(prefix.length)))fail('foreign or malformed page token.');cursor=Number(token.slice(prefix.length));if(!safe(cursor)||cursor<start||cursor>Math.min(end,now))fail('page cursor is outside the admitted window.');const s=session(dayOf(cursor));if(!s||(seconds===DAY?cursor!==s.start:cursor<s.open||cursor>=s.close||(cursor-(seconds===3600?0:s.open))%seconds!==0))fail('page cursor is not an admitted trading-grid position.');}
 return{symbol,timeframe,start,end,until:Math.min(end,now),observedNow:now,seconds,limit,cursor,prefix};
}
function page(spec){
 const rows=[];let dates=0,points=0;
 for(let day=dayOf(spec.cursor);day<=dayOf(spec.until);day+=DAY){
  if(++dates>4384)fail('calendar walk exceeded the fixed twelve-year window.');const s=session(day);if(!s)continue;
  const origin=spec.seconds===3600?Math.ceil(s.open/spec.seconds)*spec.seconds:s.open,first=spec.seconds===DAY?s.start:origin+Math.max(0,Math.ceil((spec.cursor-origin)/spec.seconds))*spec.seconds,last=spec.seconds===DAY?s.start:s.close-1;
  for(let time=first;time<=last;time+=spec.seconds){
   if(time<spec.cursor||time<spec.start||time>spec.until)continue;
   // Query bounds select opening labels; completion stays bounded by the actual synthetic business clock.
   if(spec.seconds!==DAY&&Math.min(time+spec.seconds,s.close)>spec.observedNow+1)continue;
   if(++points>PAGE_ROWS+1)fail('page enumeration exceeded the fixed response bound.');
   if(rows.length===spec.limit)return{symbol:spec.symbol,bars:rows,next_page_token:spec.prefix+time};rows.push(bar(spec.symbol,time));
  }
 }
 return{symbol:spec.symbol,bars:rows,next_page_token:null};
}
/** The real stub factory supplies its original no-network fallback and original synthetic socket protocol class. */
function createNyseSeasonalityScenario(now,fallbackFetch,BaseSocket){
 nowSeconds(now); // Refuse an unsupported fixture clock before acquiring any socket/timer.
 const fetch=async(input,options={})=>{
  if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');const url=new URL(String(input));
  if(url.origin!==REST_ORIGIN||!/^\/v2\/stocks\/[^/]+\/bars$/.test(url.pathname))return fallbackFetch(input,options);
  const spec=query(url,nowSeconds(now));return response(url.href,page(spec));
 };
 class NyseScenarioSocket extends BaseSocket{
  send(value){
   if(typeof value!=='string'||value.length>4096){this.deliver([{T:'error',code:400,msg:'invalid synthetic message'}]);return;}
   let message;try{message=JSON.parse(value);}catch{return super.send(value);}if(!message||typeof message!=='object'||Array.isArray(message)){this.deliver([{T:'error',code:400,msg:'invalid synthetic message'}]);return;}
   if(message&&(message.action==='subscribe'||message.action==='unsubscribe'))for(const key of ['trades','quotes'])if(message[key]!==undefined&&(!Array.isArray(message[key])||message[key].length>3||message[key].some(symbol=>typeof symbol!=='string'||!Object.hasOwn(BASES,symbol)))){this.deliver([{T:'error',code:400,msg:'unsupported synthetic listing'}]);return;}
   return super.send(value);
  }
  tick(){
   if(this.closed||!this.symbols.size)return;let seconds;try{seconds=nowSeconds(now);}catch{this.close();this.onclose?.({code:1008,reason:'Synthetic fixture calendar ended.'});return;}const ms=seconds*1000,minute=Math.floor(seconds/MINUTE),current=session(dayOf(seconds)),inSession=current&&seconds>=current.open&&seconds<current.close,prior=this.minute,changed=minute!==prior;this.minute=minute;const items=[];
   if(inSession)for(const symbol of this.symbols){const value=price(symbol,seconds);items.push({T:'t',S:symbol,i:seconds,x:'V',p:value,s:1,t:new Date(ms).toISOString(),c:['@'],z:'C'});}
   if(inSession)for(const symbol of this.quoteSymbols)if(this.symbols.has(symbol)){const value=price(symbol,seconds);items.push({T:'q',S:symbol,bx:'V',bp:value-0.01,bs:1,ax:'V',ap:value+0.01,as:1,t:new Date(ms).toISOString(),c:['R'],z:'C'});}
   const previousTime=(minute-1)*MINUTE,previous=session(dayOf(previousTime)),closed=changed&&prior===minute-1&&previous&&previousTime>=previous.open&&previousTime<previous.close;
   if(closed)for(const symbol of this.symbols)items.push({...bar(symbol,previousTime),T:'b',S:symbol});
   if(changed&&(inSession||closed))for(const symbol of this.symbols)items.push({...bar(symbol,current?.start??previous.start),T:'d',S:symbol});
   this.deliver(items);
  }
 }
 return Object.freeze({fetch,WebSocket:NyseScenarioSocket});
}
module.exports={createNyseSeasonalityScenario};
