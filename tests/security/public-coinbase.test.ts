import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {CoinbasePublicFeed,candlesInput,subscribeInput,WS_URL,REST_MAX_BYTES,WS_MAX_MESSAGE_BYTES,WS_MAX_MESSAGES_PER_SECOND}=require('../../electron/public-coinbase.cjs');

// Synthetic transport only. No Coinbase endpoint is contacted by these tests.
const NOW=Date.UTC(2026,9,20,15,0,0);
const nowS=NOW/1000;
const input={requestId:'synthetic',productId:'BTC-USD',granularity:'FIVE_MINUTE',start:nowS-3000,end:nowS};
const url=`https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/candles?start=${input.start}&end=${input.end}&granularity=FIVE_MINUTE&limit=350`;
const c=(start:number,close='101.5',extra:Record<string,string>={})=>({start:String(start),low:'100',high:'102',open:'100.5',close,volume:'3.25',...extra});
function response(body:unknown={candles:[c(nowS-300),c(nowS-600)]},status=200,headers:Record<string,string>={},at=url){const r=new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});Object.defineProperty(r,'url',{value:at,configurable:true});return r;}
class FakeSocket{
  static all:FakeSocket[]=[];sent:any[]=[];closed=false;onopen:any;onmessage:any;onclose:any;onerror:any;
  constructor(public url:string,public protocols?:unknown){FakeSocket.all.push(this);}
  send(text:string){this.sent.push(JSON.parse(text));}
  close(){this.closed=true;}
  open(){this.onopen?.({});}
  message(value:unknown){this.onmessage?.({data:typeof value==='string'?value:JSON.stringify(value)});}
  drop(){this.onclose?.({});}
}
const candleMessage=(seq:number,candles:unknown[],type='update')=>({channel:'candles',client_id:'',timestamp:'2026-10-20T15:00:00.123456789Z',sequence_num:seq,events:[{type,candles}]});
const tickerMessage=(seq:number,price:string,product='BTC-USD',timestamp='2026-10-20T15:00:01.5Z')=>({channel:'ticker',client_id:'',timestamp,sequence_num:seq,events:[{type:'update',tickers:[{type:'ticker',product_id:product,price,volume_24_h:'1'}]}]});

describe('Coinbase public REST candles (fixed capability)',()=>{
  beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  it('accepts only allow-listed products, the granularity enum and at most 350 buckets; no URL, header or key fields',()=>{
    expect(candlesInput(input)).toMatchObject({productId:'BTC-USD',seconds:300});
    for(const bad of [{...input,productId:'DOGE-USD'},{...input,productId:'BTC-USD/../../v2/accounts'},{...input,granularity:'ONE_WEEK'},{...input,granularity:'toString'},{...input,start:input.end-351*300},{...input,start:input.end},{...input,url:'https://private/'},{...input,headers:{}},{...input,jwt:'x'},{...input,requestId:'bad id'}])expect(()=>candlesInput(bad)).toThrow();
    expect(subscribeInput({productIds:['SOL-USD','BTC-USD']})).toEqual(['BTC-USD','SOL-USD']);
    for(const bad of [{productIds:[]},{productIds:['BTC-USD','BTC-USD']},{productIds:['XRP-USD']},{productIds:['BTC-USD'],channel:'user'},{productIds:'BTC-USD'}])expect(()=>subscribeInput(bad)).toThrow();
  });
  it('fetches one fixed URL without credentials, redirects or auth headers and returns chronological validated bars',async()=>{
    const fetchImpl=vi.fn(async(_u:string,_o:RequestInit)=>response());const feed=new CoinbasePublicFeed({fetchImpl,restMinIntervalMs:0});
    try{
      const result=await feed.candles(input);
      expect(result.ok).toBe(true);expect(fetchImpl).toHaveBeenCalledOnce();
      const [target,options]=fetchImpl.mock.calls[0];
      expect(target).toBe(url);
      expect(options).toMatchObject({method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      expect(Object.keys(options.headers as object).sort()).toEqual(['Accept','Accept-Encoding']);
      expect(result.value.bars.map((b:any)=>b.time)).toEqual([nowS-600,nowS-300]);
      expect(result.value.bars[0]).toEqual({time:nowS-600,open:100.5,high:102,low:100,close:101.5,volume:3.25});
      expect(result.value.provenance).toMatchObject({kind:'public-unauthenticated',sourceUrl:url});
    }finally{feed.close();}
  });
  it('rejects redirects, other origins, status errors, HTML, malformed numbers, misaligned or future buckets and conflicting duplicates',async()=>{
    const cases:Array<[()=>Response,string]>=[
      [()=>response('',302,{location:'https://private/'}),'REDIRECT_DENIED'],
      [()=>response(undefined,200,{},'https://private/'),'COINBASE_ORIGIN_DENIED'],
      [()=>response('',500),'COINBASE_HTTP_ERROR'],
      [()=>response('<html></html>',200,{'content-type':'text/html'}),'COINBASE_FORMAT_INVALID'],
      [()=>response('{bad'),'COINBASE_FORMAT_INVALID'],
      [()=>response({candles:{}}),'COINBASE_SCHEMA_INVALID'],
      [()=>response({candles:[c(nowS-300,'1e9')]}),'COINBASE_SCHEMA_INVALID'],
      [()=>response({candles:[c(nowS-300,'-1')]}),'COINBASE_SCHEMA_INVALID'],
      [()=>response({candles:[c(nowS-300,'500')]}),'COINBASE_SCHEMA_INVALID'],
      [()=>response({candles:[c(nowS-299)]}),'COINBASE_TIME_INVALID'],
      [()=>response({candles:[c(nowS+3000)]}),'COINBASE_TIME_INVALID'],
      [()=>response({candles:[c(nowS-300),c(nowS-300,'101')]}),'COINBASE_SCHEMA_INVALID'],
      [()=>response({},200,{'content-length':String(REST_MAX_BYTES+1)}),'COINBASE_TOO_LARGE'],
    ];
    for(const [make,code] of cases){const fetchImpl=vi.fn(async()=>make());const feed=new CoinbasePublicFeed({fetchImpl,restMinIntervalMs:0});try{expect(await feed.candles(input)).toMatchObject({ok:false,error:{code}});expect(fetchImpl).toHaveBeenCalledOnce();}finally{feed.close();}}
  });
  it('bounds streamed bytes without trusting Content-Length',async()=>{
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(REST_MAX_BYTES));controller.enqueue(new Uint8Array(1));controller.close();}});
    const r=new Response(stream,{headers:{'content-type':'application/json','content-length':'2'}});Object.defineProperty(r,'url',{value:url});
    const feed=new CoinbasePublicFeed({fetchImpl:async()=>r,restMinIntervalMs:0});
    try{expect(await feed.candles(input)).toMatchObject({ok:false,error:{code:'COINBASE_TOO_LARGE'}});}finally{feed.close();}
  });
  it('backs off after 429 without retrying, and cancels or times out without a post-cancel commit',async()=>{
    const fetchImpl=vi.fn(async()=>response('',429));const feed=new CoinbasePublicFeed({fetchImpl,restMinIntervalMs:0});
    try{expect(await feed.candles(input)).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});expect(await feed.candles({...input,requestId:'again'})).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});expect(fetchImpl).toHaveBeenCalledOnce();}finally{feed.close();}
    let complete!:(r:Response)=>void;const pending=new CoinbasePublicFeed({fetchImpl:()=>new Promise<Response>(resolve=>{complete=resolve;}),restMinIntervalMs:0});
    try{const run=pending.candles(input);await Promise.resolve();await Promise.resolve();expect(pending.cancel('synthetic')).toBe(true);expect(await run).toMatchObject({ok:false,error:{code:'CANCELLED'}});complete?.(response());expect(pending.active.size).toBe(0);}finally{pending.close();}
    const timed=new CoinbasePublicFeed({fetchImpl:()=>new Promise(()=>{}),restMinIntervalMs:0,restTimeoutMs:20});
    try{expect(await timed.candles(input)).toMatchObject({ok:false,error:{code:'TIMEOUT'}});}finally{timed.close();}
    expect(await timed.candles({...input,requestId:'closed'})).toMatchObject({ok:false,error:{code:'CLOSED'}});
  });
});

describe('Coinbase public WebSocket (fixed host, validated stream)',()=>{
  beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  const make=(events:any[]=[])=>new CoinbasePublicFeed({WebSocketImpl:FakeSocket,emit:(event:any)=>events.push(event),random:()=>1,fetchImpl:vi.fn()});
  it('connects only to the documented public host and subscribes heartbeats, candles and ticker with no JWT',()=>{
    const events:any[]=[],feed=make(events);
    try{
      expect(feed.subscribe({productIds:['ETH-USD','BTC-USD']}).ok).toBe(true);
      expect(FakeSocket.all).toHaveLength(1);expect(FakeSocket.all[0].url).toBe(WS_URL);expect(WS_URL).toBe('wss://advanced-trade-ws.coinbase.com');expect(FakeSocket.all[0].protocols).toBeUndefined();
      FakeSocket.all[0].open();
      expect(FakeSocket.all[0].sent).toEqual([{type:'subscribe',channel:'heartbeats'},{type:'subscribe',product_ids:['BTC-USD','ETH-USD'],channel:'candles'},{type:'subscribe',product_ids:['BTC-USD','ETH-USD'],channel:'ticker'}]);
      expect(JSON.stringify(FakeSocket.all[0].sent)).not.toMatch(/jwt|key|secret/i);
      expect(events.at(-1)).toMatchObject({kind:'status',status:{state:'ready'}});
    }finally{feed.close();}
  });
  it('batches validated candles and tickers at 4 Hz, coalescing repeated updates of one bucket',()=>{
    const events:any[]=[],feed=make(events);
    try{
      feed.subscribe({productIds:['BTC-USD']});const socket=FakeSocket.all[0];socket.open();
      socket.message(candleMessage(1,[{...c(nowS-300),product_id:'BTC-USD'}],'snapshot'));
      socket.message(candleMessage(2,[{...c(nowS-300,'101.9'),product_id:'BTC-USD'}]));
      socket.message(tickerMessage(3,'101.7'));socket.message(tickerMessage(4,'101.2'));
      expect(events.filter(e=>e.kind==='batch')).toHaveLength(0);
      vi.advanceTimersByTime(250);
      const batches=events.filter(e=>e.kind==='batch');expect(batches).toHaveLength(1);
      expect(batches[0].candles).toEqual([{productId:'BTC-USD',seconds:300,time:nowS-300,open:100.5,high:102,low:100,close:101.9,volume:3.25}]);
      expect(batches[0].tickers).toEqual([{productId:'BTC-USD',price:101.2,time:nowS+1,high:101.7,low:101.2}]);
      expect(batches[0].gap).toBe(false);expect(feed.status().liveMessages).toBe(true);
    }finally{feed.close();}
  });
  it('rejects unsubscribed products, malformed or oversize frames and binary data; flags sequence gaps; caps message rate',()=>{
    const events:any[]=[],feed=make(events);
    try{
      feed.subscribe({productIds:['BTC-USD']});const socket=FakeSocket.all[0];socket.open();
      socket.message(candleMessage(1,[{...c(nowS-300),product_id:'ETH-USD'}]));
      socket.message(candleMessage(2,[{...c(nowS-300,'abc'),product_id:'BTC-USD'}]));
      socket.message(tickerMessage(3,'100','BTC-USD','not-a-time'));
      socket.message('{not json');socket.message(' '.repeat(WS_MAX_MESSAGE_BYTES+1));socket.onmessage({data:new ArrayBuffer(8)});
      expect(feed.status().counters.rejected).toBe(6);
      socket.message(tickerMessage(9,'100'));
      expect(feed.status().counters.gaps).toBe(1);
      for(let i=0;i<WS_MAX_MESSAGES_PER_SECOND+5;i++)socket.message({channel:'heartbeats',events:[]});
      expect(feed.status().counters.dropped).toBeGreaterThan(0);
      vi.advanceTimersByTime(250);
      const batch=events.find(e=>e.kind==='batch');expect(batch.candles).toEqual([]);expect(batch.gap).toBe(true);
      vi.advanceTimersByTime(1000);socket.message({type:'error',message:'<script>bad</script>\u0007 failure'});expect(feed.status().lastError).toBe('<script>bad</script> failure');
    }finally{feed.close();}
  });
  it('marks stale after 10 s of silence, reconnects after 30 s and after close with growing capped backoff, and resubscribes',()=>{
    const events:any[]=[],feed=make(events);
    try{
      feed.subscribe({productIds:['BTC-USD']});FakeSocket.all[0].open();
      vi.advanceTimersByTime(11000);expect(feed.state).toBe('stale');
      FakeSocket.all[0].message({channel:'heartbeats',events:[]});expect(feed.state).toBe('ready');
      vi.advanceTimersByTime(30000);expect(FakeSocket.all[0].closed).toBe(true);expect(feed.state).toBe('disconnected');
      vi.advanceTimersByTime(999);expect(FakeSocket.all).toHaveLength(1);
      vi.advanceTimersByTime(1);expect(FakeSocket.all).toHaveLength(2);
      FakeSocket.all[1].drop();vi.advanceTimersByTime(1999);expect(FakeSocket.all).toHaveLength(2);vi.advanceTimersByTime(1);expect(FakeSocket.all).toHaveLength(3);
      const delays:number[]=[];
      for(let i=0;i<10;i++){const count=FakeSocket.all.length;FakeSocket.all.at(-1)!.drop();let waited=0;while(FakeSocket.all.length===count){vi.advanceTimersByTime(500);waited+=500;}delays.push(waited);}
      expect(delays).toEqual([4000,8000,16000,32000,60000,60000,60000,60000,60000,60000]);
      const last=FakeSocket.all.at(-1)!;last.open();expect(last.sent.map((m:any)=>m.channel)).toEqual(['heartbeats','candles','ticker']);
      expect(feed.status().counters.reconnects).toBe(12);
    }finally{feed.close();}
  });
  it('a connect that never opens times out; unsubscribe and close stop sockets and timers with no reconnect',()=>{
    const feed=make();
    try{
      feed.subscribe({productIds:['BTC-USD']});vi.advanceTimersByTime(10000);expect(FakeSocket.all[0].closed).toBe(true);expect(feed.state).toBe('disconnected');
      vi.advanceTimersByTime(1000);expect(FakeSocket.all).toHaveLength(2);
      feed.unsubscribe();expect(FakeSocket.all[1].closed).toBe(true);vi.advanceTimersByTime(120000);expect(FakeSocket.all).toHaveLength(2);expect(feed.state).toBe('idle');
      feed.subscribe({productIds:['SOL-USD']});FakeSocket.all[2].open();
      feed.subscribe({productIds:['BTC-USD']});
      expect(FakeSocket.all[2].sent.slice(-4)).toEqual([{type:'unsubscribe',product_ids:['SOL-USD'],channel:'candles'},{type:'unsubscribe',product_ids:['SOL-USD'],channel:'ticker'},{type:'subscribe',product_ids:['BTC-USD'],channel:'candles'},{type:'subscribe',product_ids:['BTC-USD'],channel:'ticker'}]);
    }finally{feed.close();}
    expect(FakeSocket.all[2].closed).toBe(true);vi.advanceTimersByTime(120000);expect(FakeSocket.all).toHaveLength(3);
    expect(feed.subscribe({productIds:['BTC-USD']})).toMatchObject({ok:false,error:{code:'CLOSED'}});
  });
});
