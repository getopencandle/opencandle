import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {AlpacaKeyStore,AlpacaMarketData,barsInput,subscribeInput,WS_URL,CREDENTIAL_FILE,SIP_DELAY_SECONDS}=require('../../electron/public-alpaca.cjs');

// Synthetic key material and synthetic transport only. No real key is used and no Alpaca endpoint is contacted.
const KEY_ID='SYNTHETICKEY0000ABCD';
const SECRET='SyntheticSecretNotARealKey0000000000000000';
const NOW=Date.UTC(2026,9,20,15,0,0),nowS=NOW/1000;
class FakeSafeStorage{constructor(public enabled=true){}isEncryptionAvailable(){return this.enabled;}encryptString(text:string){return Buffer.from('SEALED:'+Buffer.from(text).toString('base64').split('').reverse().join(''));}decryptString(bytes:Buffer){const text=bytes.toString();if(!text.startsWith('SEALED:'))throw Error('bad');return Buffer.from(text.slice(7).split('').reverse().join(''),'base64').toString();}}
class MemoryKeys{constructor(public keys:any={keyId:KEY_ID,secret:SECRET}){}async load(){return this.keys;}}
class FakeSocket{
  static all:FakeSocket[]=[];sent:any[]=[];closed=false;onopen:any;onmessage:any;onclose:any;onerror:any;
  constructor(public url:string,public protocols?:unknown){FakeSocket.all.push(this);}
  send(text:string){this.sent.push(JSON.parse(text));}close(){this.closed=true;}
  open(){this.onopen?.({});}message(value:unknown){this.onmessage?.({data:typeof value==='string'?value:JSON.stringify(value)});}drop(){this.onclose?.({});}
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const barRow=(t:string,c=101)=>({t,o:100,h:102,l:99.5,c,v:1200,n:14,vw:100.9});

describe('Alpaca key storage (owner key, encrypted, main process only)',()=>{
  let dir:string;
  beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'lv-alpaca-synthetic-'));});
  afterEach(async()=>{await rm(dir,{recursive:true,force:true});});
  it('stores only ciphertext, reports a 4-character hint, reloads, and Clear removes the file',async()=>{
    const store=new AlpacaKeyStore({safeStorage:new FakeSafeStorage(),directory:dir});
    expect(await store.status()).toEqual({configured:false,keyIdHint:null,encryption:true});
    const status=await store.save({keyId:KEY_ID,secret:SECRET});
    expect(status).toEqual({configured:true,keyIdHint:'****ABCD',encryption:true});
    expect(JSON.stringify(status)).not.toContain(SECRET);
    const bytes=await readFile(path.join(dir,CREDENTIAL_FILE),'utf8');
    expect(bytes).not.toContain(SECRET);expect(bytes).not.toContain(KEY_ID);
    expect((await readdir(dir)).filter(name=>name.endsWith('.tmp'))).toEqual([]);
    const fresh=new AlpacaKeyStore({safeStorage:new FakeSafeStorage(),directory:dir});
    expect(await fresh.load()).toEqual({keyId:KEY_ID,secret:SECRET});
    expect(await fresh.clear()).toEqual({configured:false,keyIdHint:null,encryption:true});
    expect(await readdir(dir)).toEqual([]);
  });
  it('refuses to save without OS encryption, rejects malformed or extra fields, and ignores a tampered file',async()=>{
    const off=new AlpacaKeyStore({safeStorage:new FakeSafeStorage(false),directory:dir});
    await expect(off.save({keyId:KEY_ID,secret:SECRET})).rejects.toMatchObject({code:'KEY_STORAGE_UNAVAILABLE'});
    expect(await readdir(dir)).toEqual([]);
    const store=new AlpacaKeyStore({safeStorage:new FakeSafeStorage(),directory:dir});
    for(const bad of [{keyId:'short',secret:SECRET},{keyId:KEY_ID,secret:'has spaces in it but long enough'},{keyId:KEY_ID,secret:SECRET,url:'https://x/'},{keyId:KEY_ID}])await expect(store.save(bad)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
    await writeFile(path.join(dir,CREDENTIAL_FILE),'plaintext '+SECRET);
    expect(await new AlpacaKeyStore({safeStorage:new FakeSafeStorage(),directory:dir}).status()).toMatchObject({configured:false});
  });
});

describe('Alpaca REST bars (fixed URL shape, key only in headers)',()=>{
  beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  const input={requestId:'synthetic',symbol:'AAPL',timeframe:'5Min',feed:'iex',start:nowS-3600,end:nowS};
  const urlFor=(feed='iex',end=nowS)=>'https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=5Min&start='+encodeURIComponent(new Date((nowS-3600)*1000).toISOString().replace('.000Z','Z'))+'&end='+encodeURIComponent(new Date(end*1000).toISOString().replace('.000Z','Z'))+'&limit=10000&feed='+feed+'&adjustment=raw&sort=asc';
  const reply=(body:unknown,status=200,at=urlFor())=>{const r=new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:at});return r;};
  it('validates symbol, timeframe, feed, page token and range; no URL or header fields',()=>{
    expect(barsInput(input,nowS)).toMatchObject({symbol:'AAPL',seconds:300,feed:'iex',end:nowS});
    expect(barsInput({...input,symbol:'BRK.B'},nowS).symbol).toBe('BRK.B');
    for(const bad of [{...input,symbol:'aapl'},{...input,symbol:'AAPL/../../v2/account'},{...input,timeframe:'2Min'},{...input,feed:'delayed_sip'},{...input,pageToken:'a b'},{...input,url:'https://x'},{...input,headers:{}},{...input,start:nowS,end:nowS}])expect(()=>barsInput(bad,nowS)).toThrow();
    expect(barsInput({...input,feed:'sip'},nowS).end).toBe(nowS-SIP_DELAY_SECONDS);
    expect(subscribeInput({symbols:['MSFT','AAPL']})).toEqual(['AAPL','MSFT']);
    expect(()=>subscribeInput({symbols:Array.from({length:31},(_,i)=>'A'+String.fromCharCode(65+(i%26))+String.fromCharCode(65+Math.floor(i/26)))})).toThrow();
  });
  it('sends the key only as documented headers, never in the URL or result, and returns validated chronological bars',async()=>{
    const fetchImpl=vi.fn(async(_u:string,_o:RequestInit)=>reply({bars:[barRow('2026-10-20T14:00:00Z'),barRow('2026-10-20T14:05:00Z',101.5)],symbol:'AAPL',next_page_token:null}));
    const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl,restMinIntervalMs:0});
    try{
      const result=await client.bars(input);
      expect(result.ok).toBe(true);
      const [target,options]=fetchImpl.mock.calls[0];
      expect(target).toBe(urlFor());expect(target).not.toContain(SECRET);expect(target).not.toContain(KEY_ID);
      expect(options).toMatchObject({method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{'APCA-API-KEY-ID':KEY_ID,'APCA-API-SECRET-KEY':SECRET}});
      expect(result.value.bars).toEqual([{time:Date.UTC(2026,9,20,14,0)/1000,open:100,high:102,low:99.5,close:101,volume:1200},{time:Date.UTC(2026,9,20,14,5)/1000,open:100,high:102,low:99.5,close:101.5,volume:1200}]);
      expect(result.value.provenance).toMatchObject({feed:'iex',delaySeconds:0});
      expect(JSON.stringify(result)).not.toContain(SECRET);
    }finally{client.close();}
  });
  it('clamps SIP history to 15 minutes ago and labels its delay',async()=>{
    const fetchImpl=vi.fn(async(_u:string,_o?:RequestInit)=>reply({bars:[],symbol:'AAPL',next_page_token:null},200,urlFor('sip',nowS-900)));
    const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl,restMinIntervalMs:0});
    try{const result=await client.bars({...input,feed:'sip'});expect(result.ok).toBe(true);expect(result.value.provenance.delaySeconds).toBe(900);expect(fetchImpl.mock.calls[0][0]).toBe(urlFor('sip',nowS-900));}finally{client.close();}
  });
  it('requires a saved key, maps auth and rate errors without echoing secrets, and rejects bad shapes',async()=>{
    const none=new AlpacaMarketData({keys:new MemoryKeys(null),fetchImpl:vi.fn(),restMinIntervalMs:0});
    try{expect(await none.bars(input)).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});expect(none.fetch).not.toHaveBeenCalled();}finally{none.close();}
    const cases:Array<[()=>Response,string]>=[
      [()=>reply('',401),'AUTH_FAILED'],[()=>reply('',403),'AUTH_FAILED'],[()=>reply('',429),'RATE_LIMITED'],[()=>reply('',301),'REDIRECT_DENIED'],
      [()=>reply({bars:[],symbol:'AAPL'},200,'https://evil.example/'),'ALPACA_ORIGIN_DENIED'],[()=>reply({bars:[],symbol:'MSFT',next_page_token:null}),'ALPACA_SCHEMA_INVALID'],
      [()=>reply({bars:[barRow('2026-10-20T14:01:00Z')],symbol:'AAPL',next_page_token:null}),'ALPACA_TIME_INVALID'],
      // An OHLC-inconsistent bar is dropped, not fatal; see public-alpaca-harden.test.ts.
      [()=>reply({bars:[{...barRow('2026-10-20T14:00:00Z'),v:-1}],symbol:'AAPL',next_page_token:null}),'ALPACA_SCHEMA_INVALID'],
      [()=>reply({bars:[barRow('2026-10-20T14:05:00Z'),barRow('2026-10-20T14:00:00Z')],symbol:'AAPL',next_page_token:null}),'ALPACA_SCHEMA_INVALID'],
    ];
    for(const [make,code] of cases){const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl:vi.fn(async()=>make()),restMinIntervalMs:0});try{const result=await client.bars(input);expect(result).toMatchObject({ok:false,error:{code}});expect(JSON.stringify(result)).not.toContain(SECRET);}finally{client.close();}}
  });
  it('Test connection makes one small IEX request and returns no market data',async()=>{
    const fetchImpl=vi.fn(async(u:string)=>{const r=new Response(JSON.stringify({bars:[],symbol:'SPY',next_page_token:null}),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:u});return r;});
    const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl,restMinIntervalMs:0});
    try{const result=await client.test();expect(result).toMatchObject({ok:true,value:{connected:true,feed:'iex'}});expect(fetchImpl).toHaveBeenCalledOnce();expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/data\.alpaca\.markets\/v2\/stocks\/SPY\/bars\?timeframe=1Day&.*feed=iex/);}finally{client.close();}
  });
});

describe('Alpaca IEX WebSocket (fixed host, auth then subscribe)',()=>{
  beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  const make=(events:any[]=[],keys=new MemoryKeys())=>new AlpacaMarketData({keys,WebSocketImpl:FakeSocket,emit:(e:any)=>events.push(e),random:()=>1,fetchImpl:vi.fn()});
  it('connects to the IEX host, authenticates after "connected", subscribes after "authenticated", and never emits the secret',async()=>{
    const events:any[]=[],client=make(events);
    try{
      expect((await client.subscribe({symbols:['AAPL']})).ok).toBe(true);await flush();
      const socket=FakeSocket.all[0];expect(socket.url).toBe(WS_URL);expect(WS_URL).toBe('wss://stream.data.alpaca.markets/v2/iex');
      socket.open();expect(socket.sent).toEqual([]);
      socket.message([{T:'success',msg:'connected'}]);
      expect(socket.sent).toEqual([{action:'auth',key:KEY_ID,secret:SECRET}]);
      socket.message([{T:'success',msg:'authenticated'}]);
      expect(socket.sent[1]).toEqual({action:'subscribe',bars:['AAPL'],updatedBars:['AAPL'],dailyBars:['AAPL'],trades:['AAPL']});
      socket.message([{T:'subscription',trades:['AAPL'],bars:['AAPL']}]);
      socket.message([{T:'t',S:'AAPL',i:1,x:'V',p:101.25,s:10,t:'2026-10-20T14:59:30.123456789Z',z:'C'},{T:'t',S:'AAPL',i:2,x:'V',p:101.5,s:5,t:'2026-10-20T14:59:40Z',z:'C'},{T:'b',S:'AAPL',...barRow('2026-10-20T14:58:00Z')},{T:'b',S:'MSFT',...barRow('2026-10-20T14:58:00Z')}]);
      vi.advanceTimersByTime(250);
      const batch=events.find(e=>e.kind==='batch');
      expect(batch.trades).toEqual([{symbol:'AAPL',time:nowS-20,price:101.5,high:101.5,low:101.25,size:15}]);
      expect(batch.bars).toEqual([{symbol:'AAPL',kind:'minute',seconds:60,time:nowS-120,open:100,high:102,low:99.5,close:101,volume:1200}]);
      expect(client.status().counters.rejected).toBe(1);
      expect(JSON.stringify(events)).not.toContain(SECRET);expect(JSON.stringify(client.status())).not.toContain(SECRET);
    }finally{client.close();}
  });
  it('halts without retry on auth failure or insufficient subscription; backs off a minute on connection limit',async()=>{
    for(const code of [402,409]){
      FakeSocket.all=[];const events:any[]=[],client=make(events);
      try{await client.subscribe({symbols:['AAPL']});await flush();const socket=FakeSocket.all[0];socket.message([{T:'success',msg:'connected'}]);socket.message([{T:'error',code,msg:'auth failed'}]);
        expect(client.state).toBe('auth-failed');expect(socket.closed).toBe(true);vi.advanceTimersByTime(600000);await flush();expect(FakeSocket.all).toHaveLength(1);}finally{client.close();}
    }
    FakeSocket.all=[];const client=make();
    try{await client.subscribe({symbols:['AAPL']});await flush();FakeSocket.all[0].message([{T:'error',code:406,msg:'connection limit exceeded'}]);expect(client.state).toBe('disconnected');
      vi.advanceTimersByTime(59999);await flush();expect(FakeSocket.all).toHaveLength(1);vi.advanceTimersByTime(1);await flush();expect(FakeSocket.all).toHaveLength(2);}finally{client.close();}
  });
  it('drops a session that does not authenticate within 10 s, refuses to stream without a key, and close stops reconnects',async()=>{
    const client=make();
    try{await client.subscribe({symbols:['AAPL']});await flush();FakeSocket.all[0].open();vi.advanceTimersByTime(10000);expect(FakeSocket.all[0].closed).toBe(true);expect(client.state).toBe('disconnected');}finally{client.close();}
    vi.advanceTimersByTime(600000);await flush();expect(FakeSocket.all).toHaveLength(1);
    const keyless=make([],new MemoryKeys(null));
    try{expect(await keyless.subscribe({symbols:['AAPL']})).toMatchObject({ok:false,error:{code:'KEY_REQUIRED'}});expect(FakeSocket.all).toHaveLength(1);}finally{keyless.close();}
  });
});
