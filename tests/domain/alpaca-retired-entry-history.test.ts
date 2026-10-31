import {afterEach,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,isAlpacaSyntheticStub,selectAlpacaSyntheticStub,type AlpacaBridge,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {LIVE_CACHED_NOTE,type BarCacheBridge,type BarCacheRecord} from '../../src/domain/live-cache';
import {liveHistoryState,requestLiveHistory} from '../../src/domain/live-history';
import {liveLineageOf} from '../../src/chart/bar-input-identity';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC in-memory bridge/cache only. No key material, IPC, network, profile,
// native chart or numerical authority is used. These are entry-lifetime tests.
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000;
type Request=Parameters<AlpacaBridge['fetchAlpacaBars']>[0];
type Reply=Awaited<ReturnType<AlpacaBridge['fetchAlpacaBars']>>;
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
const tape=(from:number,count:number,price:number):Bar[]=>Array.from({length:count},(_,index)=>({time:from+index*60,open:price,high:price+1,low:price-1,close:price,volume:10}));
const oldRows=tape(NOW-400*60,400,100),newRows=tape(NOW-1000*60,400,200);
const currentStatus=():AlpacaStatus=>({schemaVersion:1,state:'ready',symbols:['GME'],feed:'sip',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}});
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of cleanups.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();if(errors.length)throw new AggregateError(errors,'SYNTHETIC entry lifetime cleanup failed.');});

function setup(mode:'cached-refresh'|'reload'){
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const priorSynthetic=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);
 const external=()=>{throw Error('SYNTHETIC entry lifetime checks forbid external transport.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 let phase:'initial'|'hold-old'|'replacement'|'older'=mode==='cached-refresh'?'hold-old':'initial',cacheReads=0,retiredRequest:Request|null=null,releaseOld!:()=>void;
 const oldGate=new Promise<void>(resolve=>{releaseOld=resolve;}),pending=new Set<Promise<Reply>>(),requests:Request[]=[];
 const reply=(input:Request,rows:Bar[]):Reply=>({ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:rows.filter(row=>row.time>=input.start&&row.time<=input.end).map(row=>({...row})),nextPageToken:null,provenance:{provider:'SYNTHETIC invented data',kind:'owner-key',feed:input.feed,delaySeconds:0,sourceUrl:'synthetic:entry-lifetime',retrievedAt:'SYNTHETIC fixed time',bytes:0,license:'SYNTHETIC test only'}}});
 const noCredentials=async()=>({ok:false as const,error:{code:'SYNTHETIC_ONLY',message:'Credential operations are unavailable in this synthetic bridge.'}});
 const bridge:AlpacaBridge&BarCacheBridge={
  alpacaKeyStatus:noCredentials,saveAlpacaKey:noCredentials,clearAlpacaKey:noCredentials,testAlpacaConnection:noCredentials,
  fetchAlpacaBars:input=>{
   requests.push({...input});
   if(phase==='hold-old'){
    if(retiredRequest)throw Error('SYNTHETIC scenario expected exactly one held old request.');retiredRequest={...input};
    const rows=mode==='cached-refresh'?tape(Math.ceil(input.start/60)*60,Math.floor((input.end-Math.ceil(input.start/60)*60)/60)+1,100):oldRows;
    const result=oldGate.then(()=>reply(input,rows));pending.add(result);void result.then(()=>pending.delete(result),()=>pending.delete(result));return result;
   }
   if(phase==='initial')return Promise.resolve(reply(input,oldRows));
   if(phase==='replacement')return Promise.resolve(reply(input,newRows));
   // Every older page has a real inclusive anchor matching its own source.
   const price=input.end===newRows[100].time?200:100;
   return Promise.resolve(reply(input,tape(input.end-300*60,301,price)));
  },
  subscribeAlpaca:async()=>({ok:true,value:currentStatus()}),unsubscribeAlpaca:async()=>({ok:true,value:null}),onAlpacaEvent:()=>()=>{},
  readBarCache:async({key})=>{cacheReads++;const value:BarCacheRecord|null=mode==='cached-refresh'&&cacheReads===1?{schemaVersion:1,key:{...key},savedAt:'SYNTHETIC fixed time',synthetic:true,bars:oldRows.map(row=>({...row}))}:null;return{ok:true,value};},
  writeBarCache:async()=>({ok:true,value:{schemaVersion:1,bytes:1,entries:1,maxBytes:1}}),discardBarCache:async()=>({ok:true,value:{removed:0}}),
 };
 const provider=new AlpacaLiveProvider(bridge,{now:()=>NOW*1000,plan:'paid'}),handles:ReturnType<AlpacaLiveProvider['open']>[]=[];
 let closed=false;
 const close=async()=>{if(closed)return;closed=true;releaseOld();await Promise.allSettled([...pending]);await flush();const errors:unknown[]=[];for(const handle of handles)try{handle.close();}catch(error){errors.push(error);}try{provider.dispose();}catch(error){errors.push(error);}await flush();selectAlpacaSyntheticStub(priorSynthetic);if(errors.length)throw new AggregateError(errors,'SYNTHETIC provider cleanup failed.');};
 cleanups.push(close);
 return{provider,requests,open(){const handle=provider.open('GME','1m');handles.push(handle);return handle;},phase(value:typeof phase){phase=value;},retiredRequest:()=>retiredRequest,releaseOld,close};
}

async function provesCurrentPager(mode:'cached-refresh'|'reload'){
 const h=setup(mode),first=h.open();await flush();
 if(mode==='reload'){
  expect(first.dataset().provenance.state).toBe('ready');h.phase('hold-old');h.provider.setDividendAdjustment(true);await flush();
 }else{
  expect(first.dataset().provenance.notes).toContain(LIVE_CACHED_NOTE);expect(first.dataset().provenance.state).toBe('loading');
 }
 expect(h.retiredRequest()).not.toBeNull();first.close();h.phase('replacement');
 const current=h.open();await flush();const before=current.dataset(),key=current.datasetId;
 const beforeLineage=liveLineageOf(before.bars);expect(beforeLineage?.key).toBeTypeOf('string');expect(beforeLineage!.key).toContain(key+'|live-v1:');expect(before.provenance.providerId).toBe('alpaca-stub');expect(before.provenance.state).toBe('ready');expect(before.bars).toHaveLength(300);expect(before.bars[0].time).toBe(newRows[100].time);expect(before.bars[0].close).toBe(200);
 h.phase('older');h.releaseOld();await flush();
 expect(current.dataset()).toBe(before);const calls=h.requests.length;
 expect(requestLiveHistory(key)).toBe(true);
 // The public registry must route to the replacement handle's pager. A retired
 // pager can report work while this current handle remains idle and unchanged.
 expect(current.historyState!().status).toBe('loading');
 expect(h.requests).toHaveLength(calls+1);expect(h.requests.at(-1)?.end).toBe(before.bars[0].time);
 await current.loadOlder!();await flush();const after=current.dataset();
 expect(h.requests).toHaveLength(calls+1);expect(after.bars).toHaveLength(600);expect(after.bars[0].time).toBe(before.bars[0].time-300*60);expect(after.bars.slice(300)).toEqual(before.bars);
 expect(after.provenance.revision).toBe(before.provenance.revision);expect(liveLineageOf(after.bars)?.key).toBe(beforeLineage!.key);expect(after.provenance.state).toBe('ready');
 current.close();expect(liveHistoryState(key)).toBeNull();await h.close();
}

it('a late cached refresh from a closed same-key entry cannot replace the current history pager',async()=>{await provesCurrentPager('cached-refresh');});
it('a late adjustment reload from a closed same-key entry cannot replace the current history pager',async()=>{await provesCurrentPager('reload');});
