import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';

// SYNTHETIC opaque key availability and fake socket handles only. No KeyStore,
// credential fields, real endpoints, profile files or real socket is used.
type Input={symbols:string[];feed?:'iex'|'sip';quotes?:boolean;quotesFor?:string[]};
type Status={state:string;symbols:string[];feed:string};
type Reply={ok:boolean;value?:Status;error?:{code:string;message:string}};
interface Client {status():Status;subscribe(input:Input):Promise<Reply>;unsubscribe():Reply;forget():void;close():void}
const requireMain=createRequire(path.resolve('electron/public-alpaca.cjs'));
const moduleFile=process.env.LV_ALPACA_SUBSCRIPTION_INTENT_MODULE??path.resolve('electron/public-alpaca.cjs');
const {AlpacaMarketData}=requireMain(moduleFile) as {AlpacaMarketData:new(options:Record<string,unknown>)=>Client};
const flush=async()=>{for(let index=0;index<80;index++)await Promise.resolve();};
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const close of cleanups.splice(0).reverse())try{await close();}catch(error){failures.push(error);}vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();if(failures.length)throw new AggregateError(failures,'SYNTHETIC subscription intent cleanup failed.');});

function setup(){
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']});
 const external=()=>{throw Error('SYNTHETIC subscription checks forbid external transport.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 const loads:Array<{settled:boolean;resolve:()=>void}>=[],requests=new Set<Promise<Reply>>(),events:unknown[]=[],sockets:FakeSocket[]=[];
 class FakeSocket {
  closed=false;binaryType='blob';onopen:((event:unknown)=>void)|null=null;onmessage:((event:unknown)=>void)|null=null;onclose:((event:unknown)=>void)|null=null;onerror:((event:unknown)=>void)|null=null;
  constructor(readonly url:string){sockets.push(this);}
  send(_text:string){throw Error('Acquisition-only SYNTHETIC checks never authenticate or send wire messages.');}
  close(){this.closed=true;this.onopen=this.onmessage=this.onclose=this.onerror=null;}
 }
 const keys={load:()=>new Promise<object>(resolve=>{const load={settled:false,resolve:()=>{if(load.settled)throw Error('SYNTHETIC availability already settled.');load.settled=true;resolve(Object.freeze({}));}};loads.push(load);})};
 const client=new AlpacaMarketData({keys,fetchImpl:external,WebSocketImpl:FakeSocket,now:()=>Date.parse('2026-10-20T16:00:00Z'),random:()=>1,emit:(event:unknown)=>events.push(event)});
 let closed=false;
 const close=async()=>{if(closed)return;closed=true;client.close();for(const load of loads)if(!load.settled)load.resolve();await Promise.allSettled([...requests]);await flush();client.close();for(const socket of sockets)socket.close();};
 cleanups.push(close);
 return{client,loads,sockets,events,subscribe(input:Input){const request=client.subscribe(input);requests.add(request);void request.then(()=>requests.delete(request),()=>requests.delete(request));return request;},resolve(index:number){expect(loads[index]).toBeDefined();loads[index].resolve();},close};
}

it('unsubscribe retires an initial subscribe awaiting key availability',async()=>{
 const h=setup(),request=h.subscribe({symbols:['GME']});expect(h.loads).toHaveLength(1);expect(h.client.unsubscribe().ok).toBe(true);h.resolve(0);
 expect(await request).toMatchObject({ok:false,error:{code:'CANCELLED'}});
 await flush();expect(h.client.status()).toMatchObject({state:'idle',symbols:[]});expect(h.loads).toHaveLength(1);expect(h.sockets).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);await h.close();
});

it('close refuses initial subscribe completion without repopulating closed symbols',async()=>{
 const h=setup(),request=h.subscribe({symbols:['GME']});expect(h.loads).toHaveLength(1);h.client.close();h.resolve(0);
 expect(await request).toMatchObject({ok:false,error:{code:'CLOSED'}});
 await flush();expect(h.client.status()).toMatchObject({state:'closed',symbols:[]});expect(h.loads).toHaveLength(1);expect(h.sockets).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);await h.close();
});

it('latest valid subscribe keeps its feed and socket when an earlier request completes last',async()=>{
 const h=setup(),old=h.subscribe({symbols:['GME'],feed:'iex'}),latest=h.subscribe({symbols:['SPY'],feed:'sip',quotes:true,quotesFor:['SPY']});expect(h.loads).toHaveLength(2);
 expect(await h.subscribe({symbols:['invalid symbol']})).toMatchObject({ok:false,error:{code:'INVALID_ARGUMENT'}});expect(h.loads).toHaveLength(2);
 h.resolve(1);expect(await latest).toMatchObject({ok:true,value:{symbols:['SPY'],feed:'sip'}});expect(h.loads).toHaveLength(3);h.resolve(2);await flush();
 expect(h.sockets).toHaveLength(1);const current=h.sockets[0];expect(current.closed).toBe(false);expect(current.url).toMatch(/\/sip$/);expect(typeof current.onopen).toBe('function');expect(h.client.status()).toMatchObject({state:'connecting',symbols:['SPY'],feed:'sip'});
 h.resolve(0);expect(await old).toMatchObject({ok:false,error:{code:'CANCELLED'}});
 await flush();expect(h.client.status()).toMatchObject({state:'connecting',symbols:['SPY'],feed:'sip'});expect(h.sockets).toHaveLength(1);expect(current.closed).toBe(false);expect(h.loads).toHaveLength(3);expect(vi.getTimerCount()).toBe(1);await h.close();
});

it('forget retires an initial subscribe before key availability can restore it',async()=>{
 const h=setup(),request=h.subscribe({symbols:['GME']});expect(h.loads).toHaveLength(1);h.client.forget();h.resolve(0);
 expect(await request).toMatchObject({ok:false,error:{code:'CANCELLED'}});
 await flush();expect(h.client.status()).toMatchObject({state:'idle',symbols:[]});expect(h.loads).toHaveLength(1);expect(h.sockets).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);await h.close();
});
