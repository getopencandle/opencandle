import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import {createLocalAlert,processAlertEvent,type AlertEvent,type LocalAlert} from '../../src/domain/alerts';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {fixtureDataset} from '../../src/domain/fixtures';
import {liveHistoryCorrected,priceSourceFields,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {rsi} from '../../src/domain/indicators';
import type {Bar,BarDataset} from '../../src/domain/types';

/** SYNTHETIC Coinbase/Alpaca 1m sequences. Ticks at 4 Hz, the App observes at 1 Hz, and every minute
 * the just-closed bar is finalized (Coinbase REST reconcile / Alpaca late minute bar) with real volume and small H/L revisions. */
const T0=Date.UTC(2026,9,20,15,0,0)/1000;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(T0*1000);});
afterEach(()=>vi.useRealTimers());
const RSI:AlertSourceSnapshot={kind:'indicator',instanceId:'rsi-1',snapshotId:'rsi-settings-1',indicator:'rsi',plotId:'rsi',inputs:{length:14,source:'close'},inputBasis:'standard-ohlc',transformId:'standard'};
/** Down for 60 minutes, then up: closed-bar RSI(14) crosses 50 upward exactly once. */
const MINUTES=120,TURN=60;
const base=(minute:number)=>minute<TURN?100-0.05*minute:100-0.05*TURN+0.05*(minute-TURN);
const price=(seconds:number)=>{const minute=Math.floor(seconds/60),within=seconds-minute*60;return Math.round((base(minute)+0.03*Math.sin(within/60*2*Math.PI*3))*100)/100;};
function backfill():Bar[]{return Array.from({length:40},(_,i)=>{const c=100+0.05*(40-i)+(i%2?0.02:0);return{time:T0-(40-i)*60,open:c,high:c+0.02,low:c-0.02,close:c,volume:3};});}
function snapshot(series:LiveBarSeries,provider:'coinbase'|'alpaca'):BarDataset{
 const d=fixtureDataset('BTC',1);d.bars=series.bars;d.resolution='1m';d.provenance.fixture=false;
 d.provenance.providerId=provider==='coinbase'?'coinbase-public':'alpaca-iex';d.provenance.datasetId=provider==='coinbase'?'live:coinbase:BTC-USD:1m':'live:alpaca-iex:SYNTH:1m';d.provenance.revision=`live-v1:s:${series.revision}`;return d;
}
function finalized(bar:Bar):Bar{return{...bar,high:Math.round((bar.high+0.01)*100)/100,low:Math.round((bar.low-0.01)*100)/100,volume:bar.volume+17};}
/** First closed bar whose RSI reaches 50 from strictly below (version 2 crossing), computed from the final bars. */
function expectedCross(bars:readonly Bar[],from:number):number{
 const values=rsi(bars.map(bar=>bar.close),14) as ArrayLike<number|null>;
 for(let i=Math.max(1,from);i<bars.length-1;i++){const a=values[i-1],b=values[i];if(a!==null&&b!==null&&Number.isFinite(a)&&Number.isFinite(b)&&a<50&&b>=50)return bars[i].time;}
 throw new Error('no expected crossing');
}

async function run(provider:'coinbase'|'alpaca',opts:{olderCorrectionAt?:number}={}){
 const series=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true});series.setBackfill(backfill());series.setState('ready');
 const timerViews:TechnicalAlertView[]=[];let ids=0;
 const observer=new TechnicalAlertObserver(()=>`t${++ids}`,async()=>{},view=>timerViews.push(view));
 let alert:LocalAlert|null=null;const corrections:number[]=[],diagnostics:string[]=[];
 const input=(d:BarDataset):TechnicalAlertInput=>({dataset:d,bars:d.bars,chartId:'c1',replay:null,assumeReplayCompletion:false,selectedSource:RSI,alerts:alert?[alert]:[]});
 const apply=(events:readonly AlertEvent[])=>{for(const event of events){if(event.observation?.correction)corrections.push(event.observation.sourceTime);if(alert){const r=processAlertEvent(alert,event);alert=r.alert;diagnostics.push(...r.diagnostics);}}};
 const observe=async(at:number)=>{const view=await observer.observe(input(snapshot(series,provider)),at);expect(view.cancelled).toBe(false);apply([...(view.closedEvents??[]),...view.events]);return view;};
 const first=await observe(T0);
 const context=first.selectedContext!;expect(context).not.toBeNull();
 alert=createLocalAlert({id:'rsi-cross',name:'RSI cross',message:'local',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,conditionVersion:2,condition:{kind:'crossing-up',value:50},frequency:'once-per-bar-close',createdAt:T0,expiresAt:null});
 let pendingFinal:Bar|null=null;
 for(let step=1;step<=MINUTES*60*4;step++){
  const ms=step*250,seconds=ms/1000,at=T0+Math.floor(seconds);
  vi.advanceTimersByTime(250);
  apply(timerViews.splice(0).flatMap(view=>view.closedEvents??[]));
  const tick={time:at,price:price(seconds)};
  if(provider==='coinbase')series.applyTick({...tick,size:null});else series.applyTick({...tick,size:1});
  if(ms%60000===0&&series.bars.length>1)pendingFinal=series.bars.at(-2)!;
  // Coinbase: REST reconcile (now-180..now) lands about 1.5 s into the minute; Alpaca: the closed minute bar arrives about 2 s late.
  if(pendingFinal&&ms%60000===(provider==='coinbase'?1500:2000)){
   const done=finalized(pendingFinal);pendingFinal=null;
   if(provider==='coinbase')series.reconcile([...series.bars.slice(-3,-2),done,{...series.bars.at(-1)!,volume:series.bars.at(-1)!.volume+2}]);
   else series.applyBase(done);
  }
  if(opts.olderCorrectionAt!==undefined&&ms===opts.olderCorrectionAt*1000){const old=series.bars.at(-6)!;series.reconcile([{...old,close:Math.round((old.close+0.5)*100)/100,high:Math.round((old.high+0.5)*100)/100}]);}
  if(ms%1000===0)await observe(at);
 }
 observer.dispose();
 return{alert:alert!,series,corrections,diagnostics};
}

describe('technical bar-close alerts across the per-minute live finalization',()=>{
 it('Coinbase 1m: RSI crossing-up 50 once per bar close fires exactly once, on the expected bar',async()=>{
  const {alert,series,corrections}=await run('coinbase');
  expect(corrections).toEqual([]);
  expect(alert.history.length).toBe(1);
  expect(alert.history[0].observation?.sourceTime).toBe(expectedCross(series.bars,40));
  expect(alert.history[0].observation?.completion).toBe('observed-closed');
 },120_000);
 it('Alpaca 1m: late minute bars with different volume and H/L do not reset the baseline',async()=>{
  const {alert,series,corrections}=await run('alpaca');
  expect(corrections).toEqual([]);
  expect(alert.history.length).toBe(1);
  expect(alert.history[0].observation?.sourceTime).toBe(expectedCross(series.bars,40));
 },120_000);
 it('a genuine correction of an older bar still restarts crossing history',async()=>{
  const {corrections,diagnostics}=await run('coinbase',{olderCorrectionAt:30*60+20});
  expect(corrections).toHaveLength(1);
  expect(diagnostics.some(message=>message.includes('Crossing history restarted'))).toBe(true);
 },120_000);
});

describe('liveHistoryCorrected: finalization window',()=>{
 const prev:Bar[]=[1,2,3,4].map(time=>({time,open:2,high:2,low:2,close:2,volume:0}));
 const with_=(index:number,patch:Partial<Bar>)=>prev.map((bar,i)=>i===index?{...bar,...patch}:bar);
 it('revising the newest two bars (any field) is finalization, not a correction',()=>{
  expect(liveHistoryCorrected(prev,with_(2,{volume:9,high:3,close:2.5}))).toBe(false);
  expect(liveHistoryCorrected(prev,[...with_(2,{volume:9}),{time:5,open:2,high:2,low:2,close:2,volume:0}])).toBe(false);
  expect(liveHistoryCorrected(prev,with_(3,{close:9}))).toBe(false);
 });
 it('older bars, removed bars and moved times are corrections',()=>{
  expect(liveHistoryCorrected(prev,with_(1,{volume:9}))).toBe(true);
  expect(liveHistoryCorrected(prev,with_(1,{close:9}),priceSourceFields('close'))).toBe(true);
  expect(liveHistoryCorrected(prev,with_(1,{volume:9}),priceSourceFields('close'))).toBe(false);
  expect(liveHistoryCorrected(prev,prev.slice(0,3))).toBe(true);
  expect(liveHistoryCorrected(prev,with_(2,{time:2.5}))).toBe(true);
  expect(liveHistoryCorrected(prev,with_(3,{time:5}))).toBe(true);
 });
});
