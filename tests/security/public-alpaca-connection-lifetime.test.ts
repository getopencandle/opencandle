import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';

// SYNTHETIC key-availability promises and fake socket handles only. The opaque
// availability value contains no key fields or credential material. No key
// store, profile, filesystem credential access, IPC or real endpoint is used.
type Status={state:string;symbols:string[]};
type Event={kind:string;status?:Status};
type Reply={ok:boolean;value?:Status};
interface Client {status():Status;subscribe(input:{symbols:string[]}):Promise<Reply>;unsubscribe():Reply;close():void}
type Hooks={onEmit?:(client:Client,event:Event)=>void;onConstruct?:(client:Client)=>void;onBinaryType?:(client:Client)=>void};
const requireMain=createRequire(path.resolve('electron/public-alpaca.cjs'));
const moduleFile=process.env.LV_ALPACA_MAIN_CONNECTION_MODULE??path.resolve('electron/public-alpaca.cjs');
const {AlpacaMarketData}=requireMain(moduleFile) as {AlpacaMarketData:new(options:Record<string,unknown>)=>Client};
const flush=async()=>{for(let index=0;index<80;index++)await Promise.resolve();};
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const close of cleanups.splice(0).reverse())try{await close();}catch(error){failures.push(error);}vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();if(failures.length)throw new AggregateError(failures,'SYNTHETIC main connection cleanup failed.');});

function setup(hooks:Hooks={}){
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']});
 const external=()=>{throw Error('SYNTHETIC main connection checks forbid external transport.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 const loads:Array<{settled:boolean;resolve:()=>void}>=[],requests=new Set<Promise<Reply>>(),events:Event[]=[];
 let client!:Client;
 class FakeSocket {
  closed=false;private kind='blob';onopen:((event:unknown)=>void)|null=null;onmessage:((event:unknown)=>void)|null=null;onclose:((event:unknown)=>void)|null=null;onerror:((event:unknown)=>void)|null=null;
  constructor(_url:string){sockets.push(this);hooks.onConstruct?.(client);}
  get binaryType(){return this.kind;}set binaryType(value:string){this.kind=value;hooks.onBinaryType?.(client);}
  send(_text:string){throw Error('This acquisition-only SYNTHETIC test never authenticates or sends wire messages.');}
  close(){this.closed=true;this.onopen=this.onmessage=this.onclose=this.onerror=null;}
 }
 const sockets:FakeSocket[]=[];
 const keys={load:()=>new Promise<object>(resolve=>{const load={settled:false,resolve:()=>{if(load.settled)throw Error('SYNTHETIC availability already settled.');load.settled=true;resolve(Object.freeze({}));}};loads.push(load);})};
 client=new AlpacaMarketData({keys,fetchImpl:external,WebSocketImpl:FakeSocket,now:()=>Date.parse('2026-10-20T16:00:00Z'),random:()=>1,emit:(event:Event)=>{events.push(event);hooks.onEmit?.(client,event);}});
 let closed=false;
 const close=async()=>{if(closed)return;closed=true;client.close();for(const load of loads)if(!load.settled)load.resolve();await Promise.allSettled([...requests]);await flush();client.close();for(const socket of sockets)socket.close();};
 cleanups.push(close);
 return{client,loads,sockets,events,subscribe(symbol:string){const request=client.subscribe({symbols:[symbol]});requests.add(request);void request.then(()=>requests.delete(request),()=>requests.delete(request));return request;},resolve(index:number){expect(loads[index]).toBeDefined();loads[index].resolve();},close};
}

async function openPending(h:ReturnType<typeof setup>,symbol='GME'){
 const request=h.subscribe(symbol);expect(h.loads).toHaveLength(1);h.resolve(0);expect((await request).ok).toBe(true);expect(h.loads).toHaveLength(2);expect(h.sockets).toHaveLength(0);return 1;
}

it('a pending connect cannot acquire a socket after close or synchronous connecting-status retirement',async()=>{
 for(const boundary of ['pending-await','connecting-emit'] as const){
  const h=setup(boundary==='connecting-emit'?{onEmit:(client,event)=>{if(event.status?.state==='connecting')client.close();}}:{}),pending=await openPending(h);
  if(boundary==='pending-await')h.client.close();h.resolve(pending);await flush();
  expect(h.sockets).toHaveLength(0);expect(h.client.status().state).toBe('closed');expect(h.client.status().symbols).toEqual([]);expect(vi.getTimerCount()).toBe(0);await h.close();
 }
});

it('last unsubscribe retires a pending connect before delayed key availability resolves',async()=>{
 const h=setup(),pending=await openPending(h);expect(h.client.unsubscribe().ok).toBe(true);h.resolve(pending);await flush();
 expect(h.sockets).toHaveLength(0);expect(h.client.status().state).toBe('idle');expect(h.client.status().symbols).toEqual([]);expect(vi.getTimerCount()).toBe(0);await h.close();
});

it('only the current connect may acquire a socket and unadopted retired handles are closed locally',async()=>{
 const h=setup(),old=await openPending(h),replacement=h.subscribe('SPY');expect(h.loads).toHaveLength(3);h.resolve(2);expect((await replacement).ok).toBe(true);expect(h.loads).toHaveLength(4);h.resolve(3);await flush();
 expect(h.sockets).toHaveLength(1);const current=h.sockets[0];expect(current.closed).toBe(false);expect(current.binaryType).toBe('arraybuffer');expect(typeof current.onopen).toBe('function');expect(h.client.status().symbols).toEqual(['SPY']);expect(h.client.status().state).toBe('connecting');
 h.resolve(old);await flush();expect(h.sockets).toHaveLength(1);expect(current.closed).toBe(false);expect(h.client.status().symbols).toEqual(['SPY']);expect(h.client.status().state).toBe('connecting');await h.close();
 for(const boundary of ['constructor','binary-type-setter'] as const){
  const retired=setup(boundary==='constructor'?{onConstruct:client=>client.close()}:{onBinaryType:client=>client.close()}),pending=await openPending(retired);retired.resolve(pending);await flush();
  expect(retired.sockets).toHaveLength(1);expect(retired.sockets[0].closed).toBe(true);expect(retired.client.status().state).toBe('closed');expect(retired.client.status().symbols).toEqual([]);expect(vi.getTimerCount()).toBe(0);await retired.close();
 }
});
