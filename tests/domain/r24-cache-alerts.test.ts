import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {WorkspaceAlertObserver,type WorkspaceAlertInput} from '../../src/ui/workspace-alert-observer';
import {createLocalAlert,processAlertEvent,type AlertDefinition} from '../../src/domain/alerts';
import {LIVE_CACHED_NOTE,type BarCacheBridge,type BarCacheKey} from '../../src/domain/live-cache';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import type {Bar} from '../../src/domain/types';

// Cached bars are a source of their own. The jump from a cached snapshot to the refreshed bars is never an
// observed crossing (the move happened while the app was closed), and a real crossing after the refresh fires once.
// SYNTHETIC bridge, cache and prices only.
const DATE='2026-10-21',ET=(h:number,m=0,s=0)=>newYorkWallTime(DATE,h*60+m)+s;
/** SYNTHETIC flat tape: close 100 up to 10:00, 106 after it (all exchanges every minute, IEX the same prices). */
const close=(t:number)=>t<=ET(10)?100:106;
function minutes(start:number,end:number,feed:string):Bar[]{
 const out:Bar[]=[];
 for(let t=Math.ceil(start/60)*60;t<=end;t+=60){const c=close(t);out.push({time:t,open:c,high:c+0.2,low:c-0.2,close:c,volume:feed==='sip'?1000:30});}
 return out;
}
const status:AlpacaStatus={schemaVersion:1,state:'ready',symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}} as AlpacaStatus;
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
let now=0;
beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>vi.useRealTimers());

it('a cached snapshot then the refreshed bars across an alert level fire nothing; a live crossing afterwards fires once',async()=>{
 now=ET(11);
 let listener:((event:AlpacaEvent)=>void)|null=null;let release:()=>void=()=>undefined;const gate=new Promise<void>(resolve=>{release=resolve;});
 const key:BarCacheKey={provider:'alpaca-iex',symbol:'GME',interval:'1m',feed:'sip',adjustment:'split',plan:'free'};
 const bridge={
  alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>{await gate;return {ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:minutes(input.start,input.end,input.feed),nextPageToken:null,provenance:{} as any}};}),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
  // Saved by an earlier launch at 10:15: closed all-exchange minutes through 10:00, all at 100.
  readBarCache:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1 as const,key,savedAt:'synthetic',synthetic:false,bars:minutes(ET(9),ET(10),'sip')}})),
  writeBarCache:vi.fn(async()=>({ok:true as const,value:{schemaVersion:1 as const,bytes:1,entries:1,maxBytes:1}})),
  discardBarCache:vi.fn(async()=>({ok:true as const,value:{removed:0}})),
 } as unknown as AlpacaBridge&BarCacheBridge;
 const provider=new AlpacaLiveProvider(bridge,{now:()=>now*1000,plan:'free'});
 const handle=provider.open('GME','1m');
 const observer=new WorkspaceAlertObserver(()=>'s1');
 const input=():WorkspaceAlertInput=>({dataset:handle.dataset(),priceSource:'close',replay:null,assumeReplayCompletion:false});
 let alert:ReturnType<typeof createLocalAlert>|null=null;
 const observe=()=>{vi.setSystemTime(now*1000);const view=observer.observe(input(),now);
  if(!alert&&view.context){const ctx=view.context;const def:AlertDefinition={id:'a',name:'x',message:'m',instrumentId:ctx.instrumentId,sourceId:ctx.sourceId,mode:ctx.mode,runId:ctx.runId,observationBinding:ctx.binding,frequency:'once-per-bar',condition:{kind:'crossing-up',value:105},createdAt:now,expiresAt:null};alert=createLocalAlert(def);}
  for(const event of [...(view.closedEvents??[]),...(view.event?[view.event]:[])])alert=processAlertEvent(alert!,event).alert;
  return view;};
 const trade=(t:number,price:number)=>{now=t;listener?.({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:t,price,high:price,low:price,size:1}],receivedAt:''});};
 await flush();
 expect(handle.dataset().provenance.notes).toContain(LIVE_CACHED_NOTE);expect(handle.dataset().bars.at(-1)!.close).toBe(100);
 observe();
 release();await flush();
 expect(handle.dataset().provenance.notes).not.toContain(LIVE_CACHED_NOTE);expect(handle.dataset().bars.at(-1)!.close).toBe(106);
 observe();
 expect(alert!.history).toHaveLength(0);                      // 100 -> 106 across the refresh is not a crossing
 trade(ET(11,1,10),104);observe();trade(ET(11,1,20),105.5);observe();
 expect(alert!.history).toHaveLength(1);                      // a live crossing after the refresh fires once
 observer.dispose();handle.close();provider.dispose();
});
