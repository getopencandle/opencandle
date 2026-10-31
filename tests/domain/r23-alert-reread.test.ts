import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {WorkspaceAlertObserver,type WorkspaceAlertInput,type WorkspaceAlertView} from '../../src/ui/workspace-alert-observer';
import {createLocalAlert,processAlertEvent,type AlertDefinition,type AlertFrequency} from '../../src/domain/alerts';
import {liveHistoryCorrected,priceSourceFields} from '../../src/domain/alert-observation';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import type {Bar,BarDataset} from '../../src/domain/types';

// The all-exchange re-read of aged IEX bars is alert-neutral. It is not a history correction, so crossing
// baselines survive it. A crossing next to a re-read fires exactly once, and a re-read alone fires nothing. SYNTHETIC
// bridge and prices only.
const DATE='2026-10-21',ET=(h:number,m=0,s=0)=>newYorkWallTime(DATE,h*60+m)+s;
/** SYNTHETIC tape near 100: all exchanges every minute; IEX on even minutes only, with a close 0.03 lower. */
function minutes(start:number,end:number,feed:string):Bar[]{
 const out:Bar[]=[];
 for(let t=Math.ceil(start/60)*60;t<=end;t+=60){
  if(feed==='iex'&&(t/60)%2!==0)continue;
  const c=100+((t/60)%7)/10-(feed==='iex'?0.03:0);out.push({time:t,open:c,high:c+0.2,low:c-0.2,close:c,volume:feed==='sip'?1000:30});
 }
 return out;
}
const status:AlpacaStatus={schemaVersion:1,state:'ready',symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:true,lastError:null,counters:{}} as AlpacaStatus;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
let now=0;
beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>vi.useRealTimers());
function setup(frequency:AlertFrequency){
 let listener:((event:AlertEvent0)=>void)|null=null;type AlertEvent0=AlpacaEvent;
 const bridge={
  alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>({ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:60,feed:input.feed,bars:minutes(input.start,input.end,input.feed),nextPageToken:null,provenance:{} as any}})),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 } as unknown as AlpacaBridge&{fetchAlpacaBars:ReturnType<typeof vi.fn>};
 const provider=new AlpacaLiveProvider(bridge,{now:()=>now*1000,plan:'free'});
 const handle=provider.open('GME','1m');
 const observer=new WorkspaceAlertObserver(()=>'s1');
 const input=():WorkspaceAlertInput=>({dataset:handle.dataset(),priceSource:'close',replay:null,assumeReplayCompletion:false});
 let alert:ReturnType<typeof createLocalAlert>|null=null;const views:WorkspaceAlertView[]=[];
 const observe=()=>{vi.setSystemTime(now*1000);const view=observer.observe(input(),now);views.push(view);
  if(!alert){const ctx=view.context!;const def:AlertDefinition={id:'a',name:'x',message:'m',instrumentId:ctx.instrumentId,sourceId:ctx.sourceId,mode:ctx.mode,runId:ctx.runId,observationBinding:ctx.binding,frequency,condition:{kind:'crossing-up',value:105},createdAt:now,expiresAt:null};alert=createLocalAlert(def);}
  for(const event of [...(view.closedEvents??[]),...(view.event?[view.event]:[])])alert=processAlertEvent(alert,event).alert;
  return view;};
 const trade=(t:number,price:number)=>{now=t;listener?.({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:t,price,high:price,low:price,size:1}],receivedAt:''});};
 const sipReads=()=>bridge.fetchAlpacaBars.mock.calls.filter(([call]:any)=>call.feed==='sip').length;
 return {provider,handle,observer,observe,trade,sipReads,fired:()=>alert!.history.length,views,done:()=>{observer.dispose();handle.close();provider.dispose();}};
}
const corrected=(views:WorkspaceAlertView[])=>views.some(view=>view.diagnostics.some(line=>/Source correction/.test(line)));

describe('the all-exchange tail re-read is alert-neutral',()=>{
 it('a crossing on the forming bar right before a re-read fires exactly once (not again after the re-read)',async()=>{
  now=ET(11);const s=setup('once-per-bar');await flush();
  s.trade(ET(11,4,10),104);s.observe(); // the cut has moved 4 minutes: no re-read yet
  s.trade(ET(11,4,20),105.5);s.observe();
  expect(s.fired()).toBe(1);
  const reads=s.sipReads();
  s.trade(ET(11,6,5),105.6);await flush(); // 15-minute cut moved 6 minutes: the IEX tail is re-read from all exchanges
  expect(s.sipReads()).toBe(reads+1);
  expect(s.handle.dataset().bars.some(bar=>bar.time===ET(10,47)&&bar.volume===1000)).toBe(true); // an inserted all-exchange minute
  s.observe();s.trade(ET(11,6,30),105.8);s.observe();
  expect(s.fired()).toBe(1);expect(corrected(s.views)).toBe(false);
  s.done();
 });
 it('a crossing on the forming bar in the same update as a re-read fires exactly once (the baseline is not cleared)',async()=>{
  now=ET(11);const s=setup('once-per-bar');await flush();
  s.trade(ET(11,4,50),104);s.observe();
  const reads=s.sipReads();
  s.trade(ET(11,6,10),105.5);await flush();
  expect(s.sipReads()).toBe(reads+1);
  s.observe();
  expect(s.fired()).toBe(1);
  s.trade(ET(11,6,20),105.9);s.observe();
  expect(s.fired()).toBe(1);expect(corrected(s.views)).toBe(false);
  s.done();
 });
 it('a re-read with no new crossing fires nothing, for live and bar-close frequencies',async()=>{
  for(const frequency of ['once-per-bar','once-per-bar-close','every-time'] as AlertFrequency[]){
   now=ET(11);const s=setup(frequency);await flush();
   s.trade(ET(11,4,10),104);s.observe();
   s.trade(ET(11,6,10),104.2);await flush();s.observe();
   s.trade(ET(11,7,10),104.1);s.observe();
   s.trade(ET(11,12,10),104.3);await flush();s.observe(); // a second re-read
   expect(s.sipReads(),frequency).toBeGreaterThanOrEqual(3);
   expect(s.fired(),frequency).toBe(0);expect(corrected(s.views),frequency).toBe(false);
   s.done();
  }
 });
});

describe('liveHistoryCorrected with consolidated bars',()=>{
 const T=ET(10);
 const bar=(time:number,close:number):Bar=>({time,open:close,high:close,low:close,close,volume:1});
 it('replaced and inserted closed bars are not a correction; other changes still are',()=>{
  const s=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true});
  s.setBackfill([bar(T,1),bar(T+120,2),bar(T+180,3),bar(T+240,4),bar(T+300,5)]);
  const before=s.bars.map(b=>({...b}));
  s.replaceClosed([bar(T,1.5),bar(T+60,1.7),bar(T+120,2.5)]);
  expect(s.bars.map(b=>b.time)).toEqual([T,T+60,T+120,T+180,T+240,T+300]);
  expect(liveHistoryCorrected(before,s.bars,priceSourceFields('close'))).toBe(false);
  // A settled bar that the re-read did not supply changed: still a correction.
  const tampered=[...s.bars];tampered[3]={...tampered[3],close:9};
  expect(liveHistoryCorrected(before,tampered,priceSourceFields('close'))).toBe(true);
  // A removed bar is still a correction.
  expect(liveHistoryCorrected(before,s.bars.filter(b=>b.time!==T+180),priceSourceFields('close'))).toBe(true);
  // An inserted bar that is not from the re-read is still a correction.
  const foreign=[...s.bars.slice(0,4),bar(T+210,7),...s.bars.slice(4)];
  expect(liveHistoryCorrected(before,foreign,priceSourceFields('close'))).toBe(true);
  // The forming bar is never replaced.
  expect(s.replaceClosed([bar(T+300,99)])).toBe(false);
 });
});
