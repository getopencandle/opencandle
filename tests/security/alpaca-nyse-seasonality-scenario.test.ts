import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {newYorkWallTime,usSessionDay} from '../../src/domain/us-market-hours';

const root=process.cwd(),sourceRoot=process.env.LV_NYSE_SCENARIO_SOURCE_ROOT??root,actualRequire=createRequire(path.join(root,'electron/alpaca-stub.cjs'));
const {AlpacaMarketData,REST_ORIGIN,WS_URL}=actualRequire('./public-alpaca.cjs');
const NOW=Date.UTC(2026,9,20,16),TMP=os.tmpdir(),PROFILE=path.join(TMP,'lv-synthetic-nyse-scenario');
const ENV={LV_ALPACA_STUB:'synthetic',LV_ALPACA_SCENARIO:'nyse-seasonality-v1',LV_ALPACA_CLOCK:'regular'};
const owned:Array<{close():void}>=[];
afterEach(()=>{for(const value of owned.splice(0).reverse())value.close();vi.unstubAllGlobals();vi.useRealTimers();});

/** Whole original CJS modules in memory, with only these two source-overlay filenames selected.
 * Real public-alpaca/validation and all builtins resolve from the actual root. No SDK/source proof is replaced.
 * This NEW test's explicit overlay seam avoids modifying old require() fixtures or installing SDK/module hooks.
 */
function load(){
 const loaded:string[]=[],cache=new Map<string,{exports:any}>();
 const module=(name:string):any=>{const previous=cache.get(name);if(previous)return previous.exports;const logical='electron/'+name,staged=path.join(sourceRoot,logical),filename=existsSync(staged)?staged:path.join(root,logical),value={exports:{}};cache.set(name,value);
  const require=(id:string)=>{loaded.push(id);return id==='./alpaca-nyse-seasonality-stub.cjs'?module('alpaca-nyse-seasonality-stub.cjs'):actualRequire(id);};
  Function('require','module','exports',readFileSync(filename,'utf8'))(require,value,value.exports);return value.exports;
 };
 return{...module('alpaca-stub.cjs'),loaded};
}
function guard(){const fetch=vi.fn(()=>{throw Error('Real network forbidden.');}),Socket=vi.fn(()=>{throw Error('Real socket forbidden.');});vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',Socket);return{fetch,Socket};}
function stub(options:Record<string,unknown>={}){const api=load();return{api,transport:api.alpacaStubTransport({env:ENV,packaged:false,profile:PROFILE,tmpdir:TMP,now:()=>NOW,elapsedNow:()=>0,...options})};}
function url({from='2026-09-01T04:00:00Z',through='2026-10-20T16:00:00Z',timeframe='1Day',limit=10000,token,feed='iex',adjustment='split',symbol='GME'}:{from?:string;through?:string;timeframe?:string;limit?:number;token?:string;feed?:string;adjustment?:string;symbol?:string}={}){
 const query=new URLSearchParams({timeframe,start:from,end:through,limit:String(limit),feed,adjustment,sort:'asc'});if(token!==undefined)query.set('page_token',token);return REST_ORIGIN+'/v2/stocks/'+encodeURIComponent(symbol)+'/bars?'+query;
}
async function page(transport:any,options:Parameters<typeof url>[0]={}){const address=url(options),response=await transport.fetch(address);expect(response.url).toBe(address);return response.json();}
function market(transport:any,now=()=>NOW){const events:any[]=[];const feed=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,now,marketNow:now,restMinIntervalMs:0,emit:(event:any)=>events.push(event)});owned.push(feed);return{feed,events};}

it('requires the existing synthetic/profile/harness gates and never enables from the scenario name alone',async()=>{
 const net=guard(),api=load();expect(api.alpacaStubTransport({env:{LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:PROFILE,tmpdir:TMP})).toBeNull();
 for(const options of [{profile:null},{profile:TMP},{packaged:true},{packaged:true,env:{...ENV,LV_EXE_HARNESS:'wrong'}}]){const value=stub(options);expect(value.transport.mode).toBe('blocked');expect(value.api.loaded).not.toContain('./alpaca-nyse-seasonality-stub.cjs');await expect(value.transport.fetch(url())).rejects.toThrow(/blocked/);expect(()=>new value.transport.WebSocket(WS_URL)).toThrow(/blocked/);}
 expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('blocks unknown, empty, nonstring and lifecycle combinations without loading helper, keys or profile state',async()=>{
 const net=guard(),state={read:vi.fn(()=>{throw Error('Profile read forbidden.');}),write:vi.fn(()=>{throw Error('Profile write forbidden.');})};
 for(const value of ['',null,1,'unknown']){const s=stub({env:{...ENV,LV_ALPACA_SCENARIO:value},state});expect(s.transport.mode).toBe('blocked');expect(s.api.loaded).not.toContain('./alpaca-nyse-seasonality-stub.cjs');expect(await s.transport.keys.load()).toBeNull();await expect(s.transport.fetch(url())).rejects.toThrow(/blocked/);}
 const s=stub({env:{...ENV,LV_ALPACA_STUB:'synthetic-lifecycle'},state});expect(s.transport.mode).toBe('blocked');expect(s.api.loaded).not.toContain('./alpaca-nyse-seasonality-stub.cjs');expect(state.read).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('admits the explicit packaged harness scenario with synthetic key status and no persisted key access',async()=>{
 guard();const state={read:vi.fn(),write:vi.fn()},s=stub({packaged:true,env:{...ENV,LV_EXE_HARNESS:'alpaca-stub'},state});expect(s.transport).toMatchObject({mode:'synthetic',scenario:'nyse-seasonality-v1'});expect(await s.transport.keys.status()).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});
 await expect(s.transport.keys.save({keyId:'SYNTHETIC',secret:'NOT-A-KEY'})).rejects.toMatchObject({code:'KEY_STORAGE_UNAVAILABLE'});expect(state.read).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();expect(s.transport.clock.sample()).toEqual({scenario:'regular',nowMs:NOW});
});
it('leaves default daily weekend generation, prices and no-scenario transport behavior unchanged',async()=>{
 guard();const s=stub({env:{LV_ALPACA_STUB:'synthetic',LV_ALPACA_CLOCK:'regular'}});expect(s.api.loaded).not.toContain('./alpaca-nyse-seasonality-stub.cjs');expect(s.transport.scenario).toBeUndefined();const rows=await page(s.transport,{from:'2026-10-16T04:00:00Z',through:'2026-10-19T04:00:00Z'});
 expect(rows.bars.map((row:any)=>row.t.slice(0,10))).toEqual(['2026-10-16','2026-10-17','2026-10-18','2026-10-19']);expect(rows.bars[0].c).toBe(s.api.stubBar('GME',Date.parse(rows.bars[0].t)/1000,86400,NOW/1000).close);
});
it('matches every NYSE trading date and exact New York midnight from the prior December through the actual cutoff',async()=>{
 const net=guard(),s=stub(),rows=await page(s.transport,{from:'2015-12-01T05:00:00Z'}),expected:number[]=[];
 for(let day=Date.UTC(2015,11,1);day<Date.UTC(2026,9,21);day+=86400000){const date=new Date(day).toISOString().slice(0,10),session=usSessionDay(date);if(!session.weekend&&!session.holiday)expected.push(newYorkWallTime(date,0));}
 expect(rows.next_page_token).toBeNull();expect(rows.bars.length).toBeLessThan(10000);expect(rows.bars.map((row:any)=>Date.parse(row.t)/1000)).toEqual(expected);expect(rows.bars.every((row:any)=>row.o===row.c&&row.h===row.c&&row.l===row.c&&row.v===1000)).toBe(true);expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('omits full holidays and mourning closures while retaining genuine early-close trading dates',async()=>{
 guard();const s=stub(),first=await page(s.transport,{from:'2018-12-01T05:00:00Z',through:'2018-12-31T23:00:00Z'}),second=await page(s.transport,{from:'2025-01-01T05:00:00Z',through:'2025-01-31T23:00:00Z'}),dates=(rows:any)=>rows.bars.map((row:any)=>row.t.slice(0,10));
 expect(dates(first)).not.toContain('2018-12-05');expect(dates(first)).not.toContain('2018-12-25');expect(dates(first)).toContain('2018-12-24');expect(dates(second)).not.toContain('2025-01-09');expect(dates(second)).toContain('2025-01-10');
});
it('uses literal 05Z and 04Z daily labels across spring DST with no weekend or Good Friday bars',async()=>{
 guard();const s=stub(),rows=await page(s.transport,{from:'2024-03-08T00:00:00Z',through:'2024-03-11T23:00:00Z'});expect(rows.bars.map((row:any)=>row.t)).toEqual(['2024-03-08T05:00:00Z','2024-03-11T04:00:00Z']);
 const holiday=await page(s.transport,{from:'2024-03-28T00:00:00Z',through:'2024-04-01T23:00:00Z'});expect(holiday.bars.map((row:any)=>row.t)).toEqual(['2024-03-28T04:00:00Z','2024-04-01T04:00:00Z']);
});
it('has independently literal binary monthly returns and ten completed October observations',async()=>{
 guard();const s=stub(),rows=await page(s.transport,{from:'2015-12-01T05:00:00Z'}),last=new Map<string,number>();for(const row of rows.bars)last.set(row.t.slice(0,7),row.c);
 expect(last.get('2026-09')).toBe(25);expect(last.get('2026-10')).toBe(28.125);const returns=Array.from({length:10},(_,i)=>(last.get((2016+i)+'-10')!/last.get((2016+i)+'-09')!-1)*100);expect(returns).toEqual(Array(10).fill(12.5));const mean=returns.reduce((a,b)=>a+b,0)/10;expect(mean).toBe(12.5);expect(Math.sqrt(returns.reduce((sum,value)=>sum+(value-mean)**2,0)/10)).toBe(0);expect(returns.filter(value=>value>0).length/10).toBe(1);expect(25*(1+mean/100)).toBe(28.125);
});
it('serves coherent daily and minute prices through the actual main-process REST validators',async()=>{
 const net=guard(),s=stub(),{feed}=market(s.transport),start=Date.parse('2026-10-19T00:00:00Z')/1000,end=NOW/1000;
 for(const timeframe of ['1Day','1Min','5Min','15Min','1Hour']){const reply=await feed.bars({requestId:'synthetic-'+timeframe,symbol:'GME',timeframe,feed:'iex',start,end,adjustment:'split'});expect(reply.ok).toBe(true);expect(reply.value.bars.length).toBeGreaterThan(0);expect(reply.value.bars.every((row:any)=>row.open===28.125&&row.high===28.125&&row.low===28.125&&row.close===28.125)).toBe(true);expect(reply.value.nextPageToken).toBeNull();}
 expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('returns every regular 1m/5m/15m month-prefix row within the unchanged three-page envelope',async()=>{
 guard();const s=stub();for(const [timeframe,step]of [['1Min',60],['5Min',300],['15Min',900]] as const){const rows=await page(s.transport,{from:'2026-10-01T04:00:00Z',timeframe}),expected:number[]=[];for(let day=Date.UTC(2026,9,1);day<Date.UTC(2026,9,21);day+=86400000){const date=new Date(day).toISOString().slice(0,10),session=usSessionDay(date);if(session.weekend||session.holiday)continue;for(let time=newYorkWallTime(date,570);time<newYorkWallTime(date,session.close)&&time+step<=NOW/1000+1;time+=step)expected.push(time);}expect(rows.bars.map((row:any)=>Date.parse(row.t)/1000)).toEqual(expected);expect(rows.bars.length).toBeLessThan(10000);expect(rows.next_page_token).toBeNull();}
});
it('stops intraday bars at the published early close and excludes nontrading days',async()=>{
 guard();const s=stub(),rows=await page(s.transport,{from:'2024-11-28T00:00:00Z',through:'2024-11-30T23:00:00Z',timeframe:'1Min'});expect(rows.bars).toHaveLength(210);expect(rows.bars[0].t).toBe('2024-11-29T14:30:00Z');expect(rows.bars.at(-1).t).toBe('2024-11-29T17:59:00Z');
});
it('uses explicit progressing request-scoped pages with no omitted or duplicated admitted rows',async()=>{
 guard();const s=stub(),options={from:'2024-03-08T00:00:00Z',through:'2024-03-12T23:00:00Z',limit:2},first=await page(s.transport,options),second=await page(s.transport,{...options,token:first.next_page_token});expect(first.bars.map((row:any)=>row.t)).toEqual(['2024-03-08T05:00:00Z','2024-03-11T04:00:00Z']);expect(first.next_page_token).toMatch(/^nyse1_/);expect(second.bars.map((row:any)=>row.t)).toEqual(['2024-03-12T04:00:00Z']);expect(second.next_page_token).toBeNull();
 await expect(s.transport.fetch(url({...options,through:'2024-03-13T23:00:00Z',token:first.next_page_token}))).rejects.toThrow(/token/);await expect(s.transport.fetch(url({...options,feed:'sip',token:first.next_page_token}))).rejects.toThrow(/token/);
});
it('refuses malformed limits, unsupported options, foreign cursors and out-of-window requests without a fallback',async()=>{
 const net=guard(),s=stub();for(const options of [{limit:0},{limit:-1},{limit:1.5},{limit:10001},{timeframe:'1Week'},{symbol:'UNKNOWN'},{feed:'unknown'},{adjustment:'unknown'},{token:'nyse1_bad'},{from:'2014-01-01T00:00:00Z'},{through:'2028-01-01T00:00:00Z'}])await expect(s.transport.fetch(url(options))).rejects.toThrow(/SYNTHETIC NYSE/);
 await expect(s.transport.fetch(url()+'&limit=2')).rejects.toThrow(/duplicate/);await expect(s.transport.fetch(url()+'&unknown=1')).rejects.toThrow(/unsupported/);expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('rejects aborts, foreign hosts and sockets while original synthetic assets remain explicitly labeled',async()=>{
 const net=guard(),s=stub(),controller=new AbortController();controller.abort();await expect(s.transport.fetch(url(),{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});await expect(s.transport.fetch('https://example.invalid/v2/stocks/GME/bars')).rejects.toThrow(/never contacts the network/);expect(()=>new s.transport.WebSocket('wss://example.invalid/')).toThrow(/only/);const {feed}=market(s.transport),listed=await feed.searchAssets({query:'GME'});expect(listed.ok).toBe(true);expect(listed.value.assets[0].name).toMatch(/SYNTHETIC/);expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('streams the same October price and actual minute/daily labels through original auth and main-process parsing',async()=>{
 const net=guard();vi.useFakeTimers({toFake:['setTimeout','setInterval','clearTimeout','clearInterval','Date']});vi.setSystemTime(Date.UTC(2026,9,20,15,59,30));const s=stub({env:{LV_ALPACA_STUB:'synthetic',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},now:()=>Date.now()}),{feed,events}=market(s.transport,()=>Date.now());await feed.subscribe({symbols:['GME']});await vi.advanceTimersByTimeAsync(31000);
 const batches=events.filter(row=>row.kind==='batch'),trades=batches.flatMap(row=>row.trades),bars=batches.flatMap(row=>row.bars);expect(trades.length).toBeGreaterThan(0);expect(trades.every(row=>row.price===28.125)).toBe(true);expect(bars.some(row=>row.kind==='minute'&&row.time===Date.UTC(2026,9,20,15,59)/1000&&row.close===28.125)).toBe(true);expect(bars.some(row=>row.kind==='daily'&&row.time===Date.UTC(2026,9,20,4)/1000&&row.close===28.125)).toBe(true);expect(feed.status().counters.rejected).toBe(0);expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('does not emit invented trading prices on weekends or holidays and closes its inherited timers',async()=>{
 guard();vi.useFakeTimers({toFake:['setTimeout','setInterval','clearTimeout','clearInterval','Date']});vi.setSystemTime(Date.UTC(2026,6,3,16));const s=stub({env:{LV_ALPACA_STUB:'synthetic',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},now:()=>Date.now()}),{feed,events}=market(s.transport,()=>Date.now());await feed.subscribe({symbols:['GME']});await vi.advanceTimersByTimeAsync(65000);expect(events.filter(row=>row.kind==='batch').flatMap(row=>row.trades)).toEqual([]);expect(events.filter(row=>row.kind==='batch').flatMap(row=>row.bars)).toEqual([]);feed.close();expect(vi.getTimerCount()).toBe(0);
});

it('refuses a clock outside the finite scenario before acquiring any socket or profile state',()=>{
 const net=guard(),state={read:vi.fn(),write:vi.fn()};expect(()=>stub({env:{LV_ALPACA_STUB:'synthetic',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},now:()=>Date.UTC(2027,0,2),state})).toThrow(/clock.*2015.*2026/);expect(state.read).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
it('retains original synthetic authentication while refusing malformed or undeclared scenario subscriptions',async()=>{
 const net=guard();vi.useFakeTimers({toFake:['setTimeout','setInterval','clearTimeout','clearInterval']});const s=stub(),socket=new s.transport.WebSocket(WS_URL),messages:any[]=[];owned.push(socket);socket.onmessage=(event:any)=>messages.push(...JSON.parse(event.data));await vi.advanceTimersByTimeAsync(50);socket.send(JSON.stringify({action:'auth',key:s.api.STUB_KEYS.keyId,secret:s.api.STUB_KEYS.secret}));await vi.advanceTimersByTimeAsync(10);
 for(const value of ['null','[]',JSON.stringify({action:'subscribe',trades:['UNKNOWN']}),JSON.stringify({action:'subscribe',trades:['GME','SPY','GME.WS','GME']})])socket.send(value);socket.send(JSON.stringify({action:'subscribe',trades:['GME'],quotes:['GME']}));await vi.advanceTimersByTimeAsync(1500);expect(messages.some(row=>row.T==='success'&&row.msg==='authenticated')).toBe(true);expect(messages.filter(row=>row.T==='error').length).toBe(4);expect(messages.filter(row=>row.T==='t').every(row=>row.S==='GME'&&row.p===28.125)).toBe(true);expect(messages.some(row=>row.T==='t')).toBe(true);socket.close();expect(vi.getTimerCount()).toBe(0);expect(net.fetch).not.toHaveBeenCalled();expect(net.Socket).not.toHaveBeenCalled();
});
