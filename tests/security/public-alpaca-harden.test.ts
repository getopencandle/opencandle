import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {AlpacaKeyStore,AlpacaMarketData,alpacaKeyInput}=require('../../electron/public-alpaca.cjs');

// Realistic payload shapes from docs.alpaca.markets (stockbarsingle-1, streaming-market-data,
// real-time-stock-pricing-data). Synthetic key material and a synthetic transport only; no Alpaca endpoint is contacted.
// Alpaca paper key ids start with PK; the prefix is joined at runtime so no source literal looks like a real key id to secret scanners.
const PAPER_PREFIX='P'+'K';
const KEY_ID=PAPER_PREFIX+'SYNTHETIC0000ABCD1';
const SECRET='Synthetic/Secret+NotReal0000000000000000';
const NOW=Date.UTC(2026,9,20,15,0,0),nowS=NOW/1000;
class FakeSafeStorage{isEncryptionAvailable(){return true;}encryptString(text:string){return Buffer.from('SEALED:'+Buffer.from(text).toString('base64'));}decryptString(bytes:Buffer){return Buffer.from(bytes.toString().slice(7),'base64').toString();}}
class MemoryKeys{constructor(public keys:any={keyId:KEY_ID,secret:SECRET}){}async load(){return this.keys;}}
class FakeSocket{
  static all:FakeSocket[]=[];sent:any[]=[];closed=false;binaryType='blob';onopen:any;onmessage:any;onclose:any;onerror:any;
  constructor(public url:string){FakeSocket.all.push(this);}
  send(text:string){this.sent.push(JSON.parse(text));}close(){this.closed=true;}
  open(){this.onopen?.({});}message(value:unknown){this.onmessage?.({data:typeof value==='string'||value instanceof ArrayBuffer?value:JSON.stringify(value)});}drop(code=1006){this.onclose?.({code});}
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

describe('key entry tolerates real copy-paste and explains mistakes',()=>{
  let dir:string;
  beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'lv-alpaca-harden-'));});
  afterEach(async()=>{await rm(dir,{recursive:true,force:true});});
  it('trims whitespace, newlines and quotes; accepts paper (PK) and live (AK) ids and secrets with / + characters',async()=>{
    const store=new AlpacaKeyStore({safeStorage:new FakeSafeStorage(),directory:dir});
    await store.save({keyId:'  '+KEY_ID+'\r\n',secret:'"'+SECRET+'"\n'});
    expect(await store.load()).toEqual({keyId:KEY_ID,secret:SECRET});
    await store.save({keyId:'AKSYNTHETIC0000ABCD1',secret:'SyntheticSecret0000000000000000000000000000ab'});
    expect((await store.status()).keyIdHint).toBe('****BCD1');
  });
  it('says plainly when the two fields are swapped or the key id is not an Alpaca key id',()=>{
    expect(()=>alpacaKeyInput({keyId:SECRET,secret:KEY_ID})).toThrow(/swapped/i);
    expect(()=>alpacaKeyInput({keyId:'pk lower case',secret:SECRET})).toThrow(/API key ID/);
    expect(()=>alpacaKeyInput({keyId:KEY_ID,secret:'short'})).toThrow(/secret/i);
  });
});

describe('REST against the documented response shapes',()=>{
  beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  const input={requestId:'synthetic',symbol:'BRK.B',timeframe:'1Min',feed:'iex',start:nowS-3600,end:nowS};
  const reply=(body:unknown,status=200,type='application/json; charset=UTF-8')=>vi.fn(async(u:string)=>{const r=new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':type}});Object.defineProperty(r,'url',{value:u});return r;});
  const run=async(fetchImpl:any,value:any=input)=>{const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl,restMinIntervalMs:0});try{return await client.bars(value);}finally{client.close();}};
  it('accepts an absent or null bars field (market closed, no data) and a null next_page_token',async()=>{
    expect(await run(reply({symbol:'BRK.B',next_page_token:null}))).toMatchObject({ok:true,value:{bars:[],nextPageToken:null}});
    expect(await run(reply({bars:null,symbol:'BRK.B',next_page_token:null}))).toMatchObject({ok:true,value:{bars:[]}});
  });
  it('accepts the documented example bar (nanosecond-capable RFC-3339, vw, n) and a base64 page token',async()=>{
    const result=await run(reply({bars:[{c:178.21,h:178.26,l:178.21,n:65,o:178.26,t:'2026-10-20T14:00:00Z',v:1118,vw:178.235733}],next_page_token:'QUFQTHxNfDIwMjItMDEtMDNUMDk6MDA6MDAuMDAwMDAwMDAwWg==',symbol:'BRK.B'}));
    expect(result).toMatchObject({ok:true,value:{nextPageToken:'QUFQTHxNfDIwMjItMDEtMDNUMDk6MDA6MDAuMDAwMDAwMDAwWg=='}});
    expect(result.value.bars[0]).toEqual({time:Date.UTC(2026,9,20,14)/1000,open:178.26,high:178.26,low:178.21,close:178.21,volume:1118});
  });
  it('drops a single inconsistent bar instead of failing the whole chart',async()=>{
    const good={o:10,h:11,l:9,c:10.5,v:5,n:1,vw:10.2};
    const result=await run(reply({bars:[{...good,t:'2026-10-20T14:00:00Z'},{...good,h:9.5,t:'2026-10-20T14:01:00Z'},{...good,vw:0,t:'2026-10-20T14:02:00Z'}],symbol:'BRK.B',next_page_token:null}));
    expect(result.ok).toBe(true);expect(result.value.bars.map((b:any)=>b.time)).toEqual([nowS-3600,nowS-3600+120]);
  });
  it('explains every HTTP failure in plain words, using Alpaca\'s own message when it sends one',async()=>{
    expect(await run(reply({message:'unauthorized.'},401))).toMatchObject({ok:false,error:{code:'AUTH_FAILED',message:expect.stringMatching(/Alpaca rejected the key.*paper key/)}});
    expect(await run(reply({message:'forbidden'},403))).toMatchObject({ok:false,error:{code:'AUTH_FAILED',message:expect.stringMatching(/rejected the key/)}});
    expect(await run(reply({message:'subscription does not permit querying recent SIP data'},403))).toMatchObject({ok:false,error:{code:'ALPACA_FORBIDDEN',message:expect.stringContaining('subscription does not permit querying recent SIP data')}});
    expect(await run(reply({message:'invalid timeframe'},400))).toMatchObject({ok:false,error:{code:'ALPACA_REQUEST_REJECTED',message:expect.stringContaining('invalid timeframe')}});
    expect(await run(reply('',429))).toMatchObject({ok:false,error:{code:'RATE_LIMITED',message:expect.stringMatching(/minute/)}});
    expect(await run(reply('<html>bad gateway</html>',502,'text/html'))).toMatchObject({ok:false,error:{code:'ALPACA_HTTP_ERROR',message:expect.stringContaining('502')}});
    expect(await run(vi.fn(async()=>{throw new TypeError('fetch failed');}))).toMatchObject({ok:false,error:{code:'ALPACA_NETWORK_ERROR',message:expect.stringMatching(/Could not reach Alpaca/)}});
  });
  it('allows enough queued requests for a multi-chart layout and a timeout long enough for a full page',async()=>{
    const client=new AlpacaMarketData({keys:new MemoryKeys(),fetchImpl:reply({bars:[],symbol:'BRK.B',next_page_token:null}),restMinIntervalMs:0});
    try{const results=await Promise.all(Array.from({length:16},(_,i)=>client.bars({...input,requestId:'r'+i})));expect(results.every((r:any)=>r.ok)).toBe(true);expect(client.restTimeoutMs).toBeGreaterThanOrEqual(20000);}finally{client.close();}
  });
});

describe('IEX stream against the documented message flow',()=>{
  beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  const make=(events:any[]=[],keys=new MemoryKeys())=>new AlpacaMarketData({keys,WebSocketImpl:FakeSocket,emit:(e:any)=>events.push(e),random:()=>1,fetchImpl:vi.fn()});
  const ready=async(client:any)=>{await client.subscribe({symbols:['AAPL']});await flush();const socket=FakeSocket.all.at(-1)!;socket.open();socket.message([{T:'success',msg:'connected'}]);socket.message([{T:'success',msg:'authenticated'}]);return socket;};
  it('reads binary (ArrayBuffer) frames as UTF-8 JSON and asks for array buffers',async()=>{
    const events:any[]=[],client=make(events);
    try{
      const socket=await ready(client);expect(socket.binaryType).toBe('arraybuffer');expect(client.state).toBe('ready');
      const bytes=new TextEncoder().encode(JSON.stringify([{T:'b',S:'AAPL',o:1,h:2,l:0.5,c:1.5,v:10,n:2,vw:1.2,t:'2026-10-20T14:58:00Z'}]));
      socket.message(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));vi.advanceTimersByTime(250);
      expect(events.find(e=>e.kind==='batch')?.bars).toHaveLength(1);
    }finally{client.close();}
  });
  it('402 auth failed: plain reason, no retry',async()=>{
    const client=make();
    try{await client.subscribe({symbols:['AAPL']});await flush();const s=FakeSocket.all[0];s.message([{T:'success',msg:'connected'}]);s.message([{T:'error',code:402,msg:'auth failed'}]);
      expect(client.status()).toMatchObject({state:'auth-failed',lastError:expect.stringMatching(/Alpaca rejected the key.*paper key/)});}finally{client.close();}
  });
  it('406 connection limit: says only one connection is allowed and waits a minute',async()=>{
    const client=make();
    try{await client.subscribe({symbols:['AAPL']});await flush();FakeSocket.all[0].message([{T:'error',code:406,msg:'connection limit exceeded'}]);
      expect(client.status().lastError).toMatch(/one live connection/);expect(client.state).toBe('disconnected');}finally{client.close();}
  });
  it('404 auth timeout and 407 slow client reconnect; 403 already authenticated is harmless',async()=>{
    const client=make();
    try{
      const socket=await ready(client);socket.message([{T:'error',code:403,msg:'already authenticated'}]);expect(client.state).toBe('ready');
      socket.message([{T:'error',code:407,msg:'slow client'}]);expect(client.state).toBe('disconnected');expect(socket.closed).toBe(true);
      vi.advanceTimersByTime(5000);await flush();expect(FakeSocket.all).toHaveLength(2);
    }finally{client.close();}
  });
  it('a socket that never opened reports that the stream could not be reached',async()=>{
    const client=make();
    try{await client.subscribe({symbols:['AAPL']});await flush();FakeSocket.all[0].drop();expect(client.status().lastError).toMatch(/Could not reach the Alpaca live stream/);}finally{client.close();}
  });
  it('a replaced key restarts the stream for the same symbols, after the old connection is closed',async()=>{
    const client=make();
    try{
      const first=await ready(client);
      client.rekey();expect(first.closed).toBe(true);expect(FakeSocket.all).toHaveLength(1);expect(client.status().symbols).toEqual(['AAPL']);
      vi.advanceTimersByTime(2000);await flush();expect(FakeSocket.all).toHaveLength(2);
    }finally{client.close();}
  });
});

describe('clearing the key stops the stream with a plain reason',()=>{
  beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(NOW);});
  afterEach(()=>vi.useRealTimers());
  it('forget() after the key file is removed ends in "Save an Alpaca API key", with no new socket',async()=>{
    const keys=new MemoryKeys(),client=new AlpacaMarketData({keys,WebSocketImpl:FakeSocket,emit:()=>{},random:()=>1,fetchImpl:vi.fn()});
    try{
      await client.subscribe({symbols:['AAPL']});await flush();
      keys.keys=null;client.forget();expect(FakeSocket.all[0].closed).toBe(true);
      vi.advanceTimersByTime(2000);await flush();
      expect(FakeSocket.all).toHaveLength(1);expect(client.status()).toMatchObject({state:'auth-failed',lastError:expect.stringMatching(/Save an Alpaca API key/)});
    }finally{client.close();}
  });
});
