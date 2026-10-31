import {vi} from 'vitest';
import {AlpacaLiveProvider,selectAlpacaSyntheticStub,type AlpacaBridge} from '../../src/domain/alpaca-live';
import type {BarCacheBridge,BarCacheKey} from '../../src/domain/live-cache';
import type {Bar} from '../../src/domain/types';
import {newYorkDayStart} from '../../src/domain/live-daily';
import {readSyntheticMarketClock} from '../../src/domain/synthetic-market-clock';

export const T0=Date.UTC(2026,9,20,16)/1000,DAY=86400;
export const flush=async()=>{for(let turn=0;turn<80;turn++)await Promise.resolve();};
export const cacheRow=(time:number):Bar=>({time,open:10,high:11,low:9,close:10.5,volume:100});
export const futureMinuteRows=()=>Array.from({length:10},(_,index)=>cacheRow(T0+(index-2)*60));
export const oldMinuteRows=(now=T0)=>Array.from({length:10},(_,index)=>cacheRow(Math.floor(now/60)*60-(30-index)*60));
export type ClockMode='explicit'|'fixture-default'|'ordinary-default';

/** SYNTHETIC in-memory source/cache only. No network, files, Electron, hidden application hooks or Date override. */
export function cacheClockFixture(rows:Bar[],options:{plan?:'free'|'paid';resolution?:string;failure?:boolean;mode?:ClockMode;holdRead?:boolean;savedAt?:string;now?:number}={}){
 const mode=options.mode??'explicit',clock={now:options.now??T0};
 if(mode==='fixture-default')selectAlpacaSyntheticStub(true,readSyntheticMarketClock({synthetic:true,syntheticClock:{scenario:'regular',nowMs:T0*1000}},()=>0));else selectAlpacaSyntheticStub(true);
 let releaseHistory!:()=>void,releaseRead!:()=>void;
 const historyGate=new Promise<void>(done=>{releaseHistory=done;}),readGate=options.holdRead?new Promise<void>(done=>{releaseRead=done;}):Promise.resolve();
 const calls:any[]=[],snapshots:Array<{times:number[];cached:boolean}>=[];
 const bridge={alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>{
   calls.push({...input});await historyGate;
   if(options.failure)return{ok:false as const,error:{code:'UNAVAILABLE',message:'SYNTHETIC offline fixture'}};
   const step=({'1Min':60,'5Min':300,'15Min':900,'1Hour':3600,'1Day':DAY} as Record<string,number>)[input.timeframe];
   const latest=input.timeframe==='1Day'?newYorkDayStart(input.end):Math.floor(input.end/step)*step,bars:Bar[]=[];
   for(let index=30;index>=0;index--){const time=latest-index*step;if(time>=input.start&&time<=input.end)bars.push(cacheRow(time));}
   return{ok:true as const,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:step,feed:input.feed,bars,nextPageToken:null,provenance:{provider:'SYNTHETIC cache chronology fixture',kind:'owner-key',feed:input.feed,delaySeconds:input.feed==='sip'&&input.plan!=='paid'?900:0,sourceUrl:'https://synthetic.invalid/',retrievedAt:new Date().toISOString(),bytes:1,license:'SYNTHETIC fixture only'}}};
  }),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1,state:'ready',symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:clock.now*1000,liveMessages:false,lastError:null,counters:{}}})),
  unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),onAlpacaEvent:vi.fn(()=>()=>{}),
  readBarCache:vi.fn(async({key}:{key:BarCacheKey})=>{await readGate;return{ok:true as const,value:{schemaVersion:1,key:{...key},savedAt:options.savedAt??new Date().toISOString(),synthetic:true,bars:rows.map(row=>({...row}))}};}),
  writeBarCache:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1,bytes:0,entries:1,maxBytes:1}})),discardBarCache:vi.fn(async()=>({ok:true as const,value:{removed:1}}))};
 const provider=new AlpacaLiveProvider(bridge as unknown as AlpacaBridge&BarCacheBridge,{plan:options.plan??'free',...(mode==='explicit'?{now:()=>clock.now*1000}:{})});
 const handle=provider.open('GME',options.resolution??'1m'),off=handle.onChange(dataset=>snapshots.push({times:dataset.bars.map(row=>row.time),cached:dataset.provenance.notes.includes('Cached: these bars were saved on this computer earlier and are shown until the refresh from the provider completes.')}));
 return{clock,calls,snapshots,bridge,provider,handle,releaseHistory,releaseRead,close:async()=>{off();handle.close();provider.dispose();releaseRead?.();releaseHistory();await flush();}};
}
