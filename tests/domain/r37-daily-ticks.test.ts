import {afterEach,describe,expect,it,vi} from 'vitest';
import {AlpacaLiveProvider,preferAlpacaDailySession,currentAlpacaDailySession,type AlpacaBridge,type AlpacaEvent,type AlpacaStatus} from '../../src/domain/alpaca-live';
import {ALPACA_SHAPE,planLiveInterval} from '../../src/domain/live-intervals';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import {SymbolMathProvider,derivedPriceDecimals} from '../../src/domain/symbol-math-live';
import {statusLineParts,statusLinePriceFormat} from '../../src/chart/status-line-model';
import {advanceLocalAlertClock,createLocalAlert,processAlertEvent,type AlertDefinition,type LocalAlert} from '../../src/domain/alerts';
import {WorkspaceAlertObserver,type WorkspaceAlertView} from '../../src/ui/workspace-alert-observer';
import type {Bar} from '../../src/domain/types';

// Daily, weekly and monthly Alpaca charts fold live trades into the forming bar tick by tick (reference moves the
// daily bar on every trade). SYNTHETIC bridge only: no key, no network, invented prices.
const DATE='2026-10-21',DAY0=newYorkWallTime(DATE,0),DAY1=newYorkWallTime('2026-10-22',0);
const ET=(h:number,m=0,s=0)=>newYorkWallTime(DATE,h*60+m)+s;
/** Five SYNTHETIC published daily bars ending today (DATE). Today's: O 25 H 26 L 24.5 C 25.5 V 10000. */
const DAYS:Bar[]=[4,3,2,1].map(k=>({time:newYorkWallTime(`2026-10-${String(21-k).padStart(2,'0')}`,0),open:24,high:25,low:23,close:24.5,volume:20000}))
 .concat([{time:DAY0,open:25,high:26,low:24.5,close:25.5,volume:10000}]);
const status=(state:AlpacaStatus['state']):AlpacaStatus=>({schemaVersion:1,state,symbols:['GME'],feed:'iex',attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as AlpacaStatus);
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function bridge(daily:(symbol:string)=>Bar[]=()=>DAYS){
 let listener:((event:AlpacaEvent)=>void)|null=null;
 const value={
  alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:{configured:true,keyIdHint:'****',encryption:true}})),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn(),
  fetchAlpacaBars:vi.fn(async(input:any)=>{
   const bars=input.timeframe==='1Day'?daily(input.symbol).filter(bar=>bar.time>=input.start&&bar.time<=input.end).map(bar=>({...bar})):[];
   return {ok:true as const,value:{schemaVersion:1 as const,symbol:input.symbol,timeframe:input.timeframe,seconds:input.timeframe==='1Day'?86400:60,feed:input.feed,bars,nextPageToken:null,provenance:{provider:'synthetic',kind:'owner-key' as const,feed:input.feed,delaySeconds:0,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};
  }),
  subscribeAlpaca:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeAlpaca:vi.fn(async()=>({ok:true as const,value:null})),
  onAlpacaEvent:vi.fn((handler:(event:AlpacaEvent)=>void)=>{listener=handler;return()=>{listener=null;};}),
 } satisfies AlpacaBridge;
 return {bridge:value,emit:(event:AlpacaEvent)=>listener?.(event)};
}
const trade=(time:number,price:number,size:number,symbol='GME')=>({symbol,time,price,high:price,low:price,size});
const batch=(trades:ReturnType<typeof trade>[],bars:AlpacaEvent extends infer E?E extends {kind:'batch';bars:infer B}?B:never:never=[]):AlpacaEvent=>({schemaVersion:1,kind:'batch',bars,trades,receivedAt:''});
const minuteBar=(time:number,o:number,h:number,l:number,c:number,v:number,kind:'minute'|'updated'='minute')=>({symbol:'GME',kind,seconds:60,time,open:o,high:h,low:l,close:c,volume:v});
const dailyBar=(time:number,o:number,h:number,l:number,c:number,v:number,symbol='GME')=>({symbol,kind:'daily' as const,seconds:86400,time,open:o,high:h,low:l,close:c,volume:v});
const last=(bars:readonly Bar[])=>{const bar=bars.at(-1)!;return {time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume};};
afterEach(()=>preferAlpacaDailySession('extended'));

describe('the plan',()=>{
 it('Alpaca 1D, 1W and 1M take trade ticks on the forming New York day; Coinbase and intraday plans are unchanged',()=>{
  for(const id of ['1D','1W','1M','2D']){const plan=planLiveInterval(ALPACA_SHAPE,id);expect(plan.ok&&plan.plan.dayTicks,id).toBe(true);}
  const minute=planLiveInterval(ALPACA_SHAPE,'1m');expect(minute.ok&&minute.plan.dayTicks).toBe(false);
  expect(currentAlpacaDailySession()).toBe('extended');
 });
});

describe('a 1D Alpaca chart moves on every trade',()=>{
 it('close, high, low and volume follow each trade tick (no minute wait)',async()=>{
  let now=ET(10,30,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1D');await flush();
  expect(last(handle.dataset().bars)).toEqual({time:DAY0,open:25,high:26,low:24.5,close:25.5,volume:10000});
  let changes=0;const off=handle.onChange(()=>changes++);
  now=ET(10,30,20);emit(batch([trade(ET(10,30,20),26.5,100)]));
  expect(last(handle.dataset().bars)).toEqual({time:DAY0,open:25,high:26.5,low:24.5,close:26.5,volume:10100});
  now=ET(10,30,21);emit(batch([trade(ET(10,30,21),24.0,50)]));
  expect(last(handle.dataset().bars)).toEqual({time:DAY0,open:25,high:26.5,low:24,close:24,volume:10150});
  now=ET(10,30,22);emit(batch([trade(ET(10,30,22),25.1,7)]));
  expect(last(handle.dataset().bars)).toMatchObject({close:25.1,volume:10157});
  expect(changes).toBe(3);
  // A trade from before the backfill instant is already inside the published bar: never added twice.
  emit(batch([trade(ET(10,30,5),30,999)]));
  expect(last(handle.dataset().bars)).toMatchObject({high:26.5,close:25.1,volume:10157});
  off();handle.close();provider.dispose();
 });
 it('the minute bar replaces that minute\'s ticks and the published daily bar replaces everything it covers: volume is never counted twice',async()=>{
  let now=ET(10,30,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1D');await flush();
  now=ET(10,30,20);emit(batch([trade(ET(10,30,20),25.6,100)]));
  now=ET(10,31,5);emit(batch([trade(ET(10,31,5),25.7,40)]));
  expect(last(handle.dataset().bars).volume).toBe(10140);
  // 10:32:00: the 10:31 minute bar (volume 70, fuller than the 40 seen as ticks) replaces those ticks; it is not added to them.
  now=ET(10,32,0);emit(batch([],[minuteBar(ET(10,31),25.7,25.8,25.6,25.75,70)]));
  expect(last(handle.dataset().bars)).toMatchObject({close:25.75,high:26,volume:10000+100+70});
  // A late print of a minute that already has its bar is carried by the next published bar, not added now.
  emit(batch([trade(ET(10,31,59),25.9,5)]));
  expect(last(handle.dataset().bars).volume).toBe(10170);
  now=ET(10,32,1);emit(batch([trade(ET(10,32,1),25.8,9)]));
  expect(last(handle.dataset().bars)).toMatchObject({close:25.8,volume:10179});
  // 10:32:02: the published daily bar covers every minute before 10:32 (volume 10180 with the late print); the 10:32 trade stays on top.
  now=ET(10,32,2);emit(batch([],[dailyBar(DAY0,25,26,24.5,25.9,10180)]));
  expect(last(handle.dataset().bars)).toEqual({time:DAY0,open:25,high:26,low:24.5,close:25.8,volume:10189});
  // Its minute bar then replaces the 10:32 ticks, and the next published bar takes over all of it.
  now=ET(10,33,0);emit(batch([],[minuteBar(ET(10,32),25.8,25.85,25.8,25.82,12)]));
  expect(last(handle.dataset().bars).volume).toBe(10192);
  now=ET(10,33,1);emit(batch([],[dailyBar(DAY0,25,26,24.5,25.82,10192)]));
  expect(last(handle.dataset().bars)).toEqual({time:DAY0,open:25,high:26,low:24.5,close:25.82,volume:10192});
  handle.close();provider.dispose();
 });
 it('a new New York day starts its own bar from its first trade; the closed day keeps its last value',async()=>{
  let now=ET(19,59,50);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1D');await flush();
  now=ET(19,59,55);emit(batch([trade(ET(19,59,55),25.2,10)]));
  const closed=last(handle.dataset().bars);expect(closed).toMatchObject({time:DAY0,close:25.2,volume:10010});
  now=DAY1+4*3600+5;emit(batch([trade(DAY1+4*3600+5,25.4,3)]));
  const bars=handle.dataset().bars;
  expect(last(bars)).toEqual({time:DAY1,open:25.4,high:25.4,low:25.4,close:25.4,volume:3});
  expect(bars.at(-2)).toMatchObject(closed);
  handle.close();provider.dispose();
 });
});

describe('session rules',()=>{
 it('Extended trading hours on (the default): pre-market and after-hours trades move the daily bar; overnight prints never do',async()=>{
  let now=ET(8,0,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1D');await flush();
  now=ET(8,0,30);emit(batch([trade(ET(8,0,30),27,20)]));
  expect(last(handle.dataset().bars)).toMatchObject({high:27,close:27,volume:10020});
  // 20:30 New York is outside every session (no IEX trading): a print there is ignored.
  now=ET(20,30);emit(batch([trade(ET(20,30),40,1)]));
  expect(last(handle.dataset().bars)).toMatchObject({high:27,close:27,volume:10020});
  handle.close();provider.dispose();
 });
 it('Extended trading hours off: only regular-session trades move it; switching the setting refolds the same trades',async()=>{
  preferAlpacaDailySession('regular');
  let now=ET(8,0,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1D');await flush();
  now=ET(8,0,30);emit(batch([trade(ET(8,0,30),27,20)]));
  expect(last(handle.dataset().bars)).toEqual({time:DAY0,open:25,high:26,low:24.5,close:25.5,volume:10000});
  now=ET(9,30,1);emit(batch([trade(ET(9,30,1),25.9,5)]));
  expect(last(handle.dataset().bars)).toMatchObject({high:26,close:25.9,volume:10005});
  let changes=0;const off=handle.onChange(()=>changes++);
  preferAlpacaDailySession('extended');
  expect(changes).toBe(1);
  expect(last(handle.dataset().bars)).toMatchObject({high:27,close:25.9,volume:10025});
  preferAlpacaDailySession('regular');
  expect(last(handle.dataset().bars)).toMatchObject({high:26,close:25.9,volume:10005});
  off();handle.close();provider.dispose();
 });
});

describe('weekly, monthly and derived charts inherit it',()=>{
 it('the forming week and month move with each trade, by exactly the trade size',async()=>{
  let now=ET(10,30,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const week=provider.open('GME','1W'),month=provider.open('GME','1M');await flush();
  const w0=last(week.dataset().bars),m0=last(month.dataset().bars);
  now=ET(10,30,20);emit(batch([trade(ET(10,30,20),26.75,100)]));await flush();
  expect(last(week.dataset().bars)).toMatchObject({time:w0.time,close:26.75,high:Math.max(w0.high,26.75),volume:w0.volume+100});
  expect(last(month.dataset().bars)).toMatchObject({time:m0.time,close:26.75,volume:m0.volume+100});
  now=ET(10,30,21);emit(batch([trade(ET(10,30,21),26.5,1)]));await flush();
  expect(last(week.dataset().bars)).toMatchObject({close:26.5,volume:w0.volume+101});
  week.close();month.close();provider.dispose();
 });
 it('a derived GME/SPY 1D chart recomputes on each component trade',async()=>{
  const spyDays=DAYS.map(bar=>({...bar,open:bar.open*20,high:bar.high*20,low:bar.low*20,close:bar.close*20}));
  let now=ET(10,30,10);const {bridge:b,emit}=bridge(symbol=>symbol==='SPY'?spyDays:DAYS),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const derived=new SymbolMathProvider((symbol,resolution)=>provider.open(symbol,resolution)).open('gme / spy','1D');await flush();
  expect(derived.dataset().bars.at(-1)!.close).toBeCloseTo(25.5/510,12);
  now=ET(10,30,20);emit(batch([trade(ET(10,30,20),26,10)]));
  expect(derived.dataset().bars.at(-1)!.close).toBeCloseTo(26/510,12);
  now=ET(10,30,21);emit(batch([trade(ET(10,30,21),505,10,'SPY')]));
  expect(derived.dataset().bars.at(-1)!.close).toBeCloseTo(26/505,12);
  derived.close();provider.dispose();
 });
 it('the 1D forming close equals the 1m close after every trade (paper fills follow the 1m series; both show the same price)',async()=>{
  let now=ET(10,30,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const daily=provider.open('GME','1D'),minute=provider.open('GME','1m');await flush();
  for(const [s,price] of [[20,25.61],[21,25.4],[40,25.77]] as const){
   now=ET(10,30,s);emit(batch([trade(now,price,1)]));
   expect(daily.dataset().bars.at(-1)!.close).toBe(price);expect(minute.dataset().bars.at(-1)!.close).toBe(price);
  }
  daily.close();minute.close();provider.dispose();
 });
});

describe('alerts on 1D see the tick values with the existing exactly-once rules',()=>{
 it('a once-per-bar crossing on the forming daily bar fires on the trade that crosses, once',async()=>{
  let now=ET(10,30,10);const {bridge:b,emit}=bridge(),provider=new AlpacaLiveProvider(b,{now:()=>now*1000});
  const handle=provider.open('GME','1D');await flush();
  const observer=new WorkspaceAlertObserver(()=>'s');
  const observe=()=>observer.observe({dataset:handle.dataset(),priceSource:'close',replay:null,assumeReplayCompletion:false},now);
  const first=observe();
  const c=first.context!;
  const def:AlertDefinition={id:'a',name:'A',message:'Synthetic',instrumentId:c.instrumentId,sourceId:c.sourceId,runId:c.runId,mode:c.mode,observationBinding:c.binding,condition:{kind:'crossing-up',value:26},frequency:'once-per-bar',createdAt:first.now,expiresAt:null};
  const consume=(alert:LocalAlert,view:WorkspaceAlertView)=>{const advanced=advanceLocalAlertClock(alert,view.now);return view.event?processAlertEvent(advanced,view.event).alert:advanced;};
  let alert=consume(createLocalAlert(def),first);
  now=ET(10,30,20);emit(batch([trade(now,25.9,1)]));alert=consume(alert,observe());
  expect(alert.history).toHaveLength(0);
  now=ET(10,30,21);emit(batch([trade(now,26.2,1)]));const crossed=observe();
  expect(crossed.event?.observation?.correction).toBe(false);
  alert=consume(alert,crossed);
  expect(alert.history).toHaveLength(1);
  for(const [s,price] of [[22,25.8],[23,26.4],[24,25.7],[25,26.9]] as const){now=ET(10,30,s);emit(batch([trade(now,price,1)]));alert=consume(alert,observe());}
  expect(alert.history).toHaveLength(1);
  handle.close();provider.dispose();
 });
});

describe('derived price precision (OpenCandle-defined)',()=>{
 it('at least 5 significant digits: max(4, 4 - floor(log10|v|)), capped at 8',()=>{
  expect([0.0421,1.2345,25.5,0.00042,1e-7,0,-0.0421,Number.NaN,0.1,0.99,10,123456].map(derivedPriceDecimals)).toEqual([6,4,4,8,8,4,6,4,5,5,4,4]);
 });
 it('the status line shows OHLC and the absolute change with the same decimals from the shown bar; a stored Precision still wins',()=>{
  const format=statusLinePriceFormat(undefined,0.0001,0.0421234);
  expect(format(0.0421234)).toBe('0.042123');
  const settings={logo:false,title:{visible:false,source:'symbol'},chartValues:true,barChange:true,volume:false,lastDayChange:false,indicatorTitles:true,indicatorInputs:true,background:{visible:false,transparency:0}} as never;
  const parts=statusLineParts(settings,{symbol:'GME/SPY',interval:'1D',exchange:'DERIVED'},{time:2,open:0.0421,high:0.0423,low:0.042,close:0.042154},{time:1,open:0.0421,high:0.0423,low:0.042,close:0.042223},[],{legendVisible:false,format:statusLinePriceFormat(undefined,0.0001,0.042154)}).parts;
  expect(parts.find(part=>part.id==='chartValues')).toMatchObject({values:[{label:'O',text:'0.042100'},{label:'H',text:'0.042300'},{label:'L',text:'0.042000'},{label:'C',text:'0.042154'}]});
  expect(parts.find(part=>part.id==='barChange')).toMatchObject({absolute:'-0.000069'});
  expect(statusLinePriceFormat('2',0.0001,0.0421234)(0.0421234)).toBe('0.04');
  // Without a reference (every non-derived chart) the instrument tick rule is unchanged.
  expect(statusLinePriceFormat(undefined,0.01)(25.123)).toBe('25.12');
  expect(statusLinePriceFormat(undefined,0.0001,null)(0.0421234)).toBe('0.0421');
 });
});
