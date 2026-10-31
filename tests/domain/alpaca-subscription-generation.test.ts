import {afterEach,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,isAlpacaSyntheticStub,selectAlpacaSyntheticStub,type AlpacaBridge,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {liveQuotes} from '../../src/domain/live-quotes';
import type {LiveBridgeResult} from '../../src/domain/live-provider';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC in-memory promises only. No keys, IPC, network, profile or chart.
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000;
const rows:Bar[]=Array.from({length:4},(_,index)=>({time:NOW-(4-index)*60,open:100,high:101,low:99,close:100,volume:10}));
const flush=async()=>{for(let index=0;index<80;index++)await Promise.resolve();};
const status=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed:'sip',attempt:0,lastMessageAt:null,liveMessages:false,lastError:state==='auth-failed'?'SYNTHETIC current refusal':null,counters:{}});
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of cleanups.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();if(errors.length)throw new AggregateError(errors,'SYNTHETIC subscription-generation cleanup failed.');});

function setup(){
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const priorSynthetic=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);
 const external=()=>{throw Error('SYNTHETIC subscription tests forbid external transport.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 type Reply=LiveBridgeResult<AlpacaStatus>;
 const calls:Array<{input:Parameters<AlpacaBridge['subscribeAlpaca']>[0];settled:boolean;resolve:(reply:Reply)=>void}>=[];
 const noCredentials=async()=>({ok:false as const,error:{code:'SYNTHETIC_ONLY',message:'Credential operations are unavailable in this synthetic bridge.'}});
 const bridge:AlpacaBridge={
  alpacaKeyStatus:noCredentials,saveAlpacaKey:noCredentials,clearAlpacaKey:noCredentials,testAlpacaConnection:noCredentials,
  fetchAlpacaBars:async input=>({ok:true,value:{schemaVersion:1,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:rows.filter(row=>row.time>=input.start&&row.time<=input.end).map(row=>({...row})),nextPageToken:null,provenance:{provider:'SYNTHETIC invented data',kind:'owner-key',feed:input.feed,delaySeconds:0,sourceUrl:'synthetic:subscription-generation',retrievedAt:'SYNTHETIC fixed time',bytes:0,license:'SYNTHETIC test only'}}}),
  subscribeAlpaca:input=>new Promise<Reply>(resolve=>{const call={input:{...input,symbols:[...input.symbols]},settled:false,resolve:(reply:Reply)=>{if(call.settled)throw Error('SYNTHETIC reply already settled.');call.settled=true;resolve(reply);}};calls.push(call);}),
  unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),onAlpacaEvent:()=>()=>{},
 };
 const provider=new AlpacaLiveProvider(bridge,{now:()=>NOW*1000,plan:'paid'}),handles:ReturnType<AlpacaLiveProvider['open']>[]=[];
 let cleaned=false;
 const close=async()=>{if(cleaned)return;cleaned=true;const failures:unknown[]=[];for(const handle of handles)try{handle.close();}catch(error){failures.push(error);}try{provider.dispose();}catch(error){failures.push(error);}for(const call of calls)if(!call.settled)call.resolve({ok:true,value:status('ready')});await flush();liveQuotes.clear(['US:GME','US:SPY']);selectAlpacaSyntheticStub(priorSynthetic);if(failures.length)throw new AggregateError(failures,'SYNTHETIC provider cleanup failed.');};
 cleanups.push(close);
 return{provider,calls,bridge,open(symbol='GME'){const handle=provider.open(symbol,'1m');handles.push(handle);return handle;},settle(index:number,reply:Reply){expect(calls[index]).toBeDefined();calls[index].resolve(reply);},close};
}

async function reopenA(){
 const h=setup(),first=h.open('GME');await flush();first.close();const middle=h.open('SPY');await flush();middle.close();const current=h.open('GME');await flush();
 expect(h.calls.map(call=>call.input.symbols)).toEqual([['GME'],['SPY'],['GME']]);expect(current.dataset().provenance.providerId).toBe('alpaca-stub');
 return{h,current};
}

it('ignores an old failed A subscription reply after a later A to B to A dispatch succeeds',async()=>{
 const {h,current}=await reopenA();h.settle(2,{ok:true,value:status('ready')});await flush();
 h.provider.receive({schemaVersion:1,kind:'batch',bars:[],trades:[],quotes:[{symbol:'GME',time:NOW,bid:100,ask:101,bidSize:10,askSize:10,feed:'sip'}],receivedAt:'SYNTHETIC fixed time'});
 const before=current.dataset(),quote=liveQuotes.get('US:GME'),feed=h.provider.feedStatus();expect(before.provenance.state).toBe('ready');expect(quote?.synthetic).toBe(true);
 h.settle(0,{ok:false,error:{code:'SYNTHETIC_OLD_FAILURE',message:'SYNTHETIC retired subscription refused'}});await flush();
 expect(current.dataset()).toBe(before);expect(h.provider.feedStatus()).toBe(feed);expect(liveQuotes.get('US:GME')).toBe(quote);expect(h.calls).toHaveLength(3);await h.close();
});

it('ignores an old successful A subscription reply after a later A to B to A dispatch reports its current status',async()=>{
 const {h,current}=await reopenA(),currentStatus=status('auth-failed');h.settle(2,{ok:true,value:currentStatus});await flush();const before=current.dataset();expect(before.provenance.state).toBe('error');expect(h.provider.feedStatus()).toBe(currentStatus);
 h.settle(0,{ok:true,value:status('ready')});await flush();
 expect(current.dataset()).toBe(before);expect(h.provider.feedStatus()).toBe(currentStatus);expect(h.calls).toHaveLength(3);await h.close();
});

it('invalidates a pending subscription reply when the last handle unsubscribes',async()=>{
 const h=setup(),handle=h.open();await flush();expect(h.provider.feedStatus()).toBeNull();handle.close();expect(h.bridge.unsubscribeAlpaca).toHaveBeenCalledTimes(1);
 h.settle(0,{ok:true,value:status('ready')});await flush();expect(h.provider.feedStatus()).toBeNull();expect(h.calls).toHaveLength(1);await h.close();
});

it('ignores a pending subscription reply after provider disposal',async()=>{
 const h=setup();h.open();await flush();expect(h.provider.feedStatus()).toBeNull();h.provider.dispose();
 h.settle(0,{ok:true,value:status('ready')});await flush();expect(h.provider.feedStatus()).toBeNull();expect(h.calls).toHaveLength(1);await h.close();
});

it('applies the current subscription reply through the original status and handle behavior',async()=>{
 const h=setup(),handle=h.open();await flush();const before=handle.dataset(),current=status('ready');expect(before.provenance.state).toBe('disconnected');
 h.settle(0,{ok:true,value:current});await flush();const after=handle.dataset();expect(h.provider.feedStatus()).toBe(current);expect(after.provenance.state).toBe('ready');expect(after.bars).toEqual(before.bars);expect(after.provenance.revision).toBe(before.provenance.revision);expect(h.calls).toHaveLength(1);await h.close();
});
