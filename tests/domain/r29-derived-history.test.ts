import {describe,expect,it} from 'vitest';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {LiveHandle} from '../../src/domain/live-provider';
import {LIVE_NO_MORE_DATA,liveAlertView,liveHistoryState,recordLiveOrigin,requestLiveHistory,type LiveHistoryState} from '../../src/domain/live-history';
import {liveLineageOf} from '../../src/chart/bar-input-identity';
import {SymbolMathProvider,symbolMathDatasetId} from '../../src/domain/symbol-math-live';

// goal 2: older-history paging on derived (symbol math) charts. Mock component feeds, SYNTHETIC bars.
const D=86400,T0=D*20000;
const bar=(time:number,close:number):Bar=>({time,open:close,high:close,low:close,close,volume:1});
const days=(from:number,count:number,price:(i:number)=>number)=>Array.from({length:count},(_,i)=>bar(T0+(from+i)*D,price(from+i)));

/** A mock live component: its own pager prepends `page` older days per request until `floor`. */
function component(symbol:string,first:number,last:number,floor:number,page=5){
 let bars=days(first,last-first+1,i=>symbol==='SPY'?100+i:50+i),revision=0,status:LiveHistoryState={status:'idle',message:null};const calls={n:0};
 const listeners=new Set<(d:BarDataset)=>void>();
 const make=():BarDataset=>{const shown=bars;recordLiveOrigin(shown,T0+first*D);return{instrument:{id:symbol,symbol} as BarDataset['instrument'],bars:shown,resolution:'1D',provenance:{providerId:'alpaca-iex',providerName:'Alpaca IEX',datasetId:'live:alpaca-iex:'+symbol+':1D',fixture:false,state:'ready',adjustment:'raw',delaySeconds:0,asOf:0,license:'L',revision:'live-v1:'+symbol,notes:[]} as unknown as BarDataset['provenance']};};
 let snapshot=make();
 const handle:LiveHandle={datasetId:'live:alpaca-iex:'+symbol+':1D',dataset:()=>snapshot,formingTime:()=>null,onChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close:()=>{},
  loadOlder:async()=>{calls.n++;const oldest=(bars[0].time-T0)/D;if(oldest<=floor){status={status:'exhausted',message:LIVE_NO_MORE_DATA};return status;}
   const from=Math.max(floor,oldest-page);bars=[...days(from,oldest-from,i=>symbol==='SPY'?100+i:50+i),...bars];revision++;snapshot=make();for(const fn of listeners)fn(snapshot);return status;},
  historyState:()=>status};
 return{handle,calls};
}

describe(' derived charts page older history through their component pagers',()=>{
 it('pages only the limiting component, recomputes aligned bars, keeps the lineage and the alert origin',async()=>{
  const gme=component('GME',30,60,0),spy=component('SPY',10,60,0);
  const provider=new SymbolMathProvider(symbol=>symbol==='GME'?gme.handle:spy.handle,{now:()=>Date.now()});
  const handle=provider.open('GME/SPY','1D'),id=symbolMathDatasetId('GME/SPY','1D');
  const first=handle.dataset();expect(first.bars).toHaveLength(31);expect(first.bars[0].time).toBe(T0+30*D);
  const lineage=liveLineageOf(first.bars)!.key;
  expect(typeof handle.loadOlder).toBe('function');
  const state=await handle.loadOlder!();
  expect(state.status).toBe('idle');
  expect(gme.calls.n).toBe(1);expect(spy.calls.n).toBe(0);// SPY already reaches further back
  const grown=handle.dataset();
  expect(grown.bars).toHaveLength(36);expect(grown.bars[0].time).toBe(T0+25*D);
  // Every derived bar is the ratio of the component bars at the same time (alignment unchanged).
  for(const row of grown.bars){const i=(row.time-T0)/D;expect(row.close).toBeCloseTo((50+i)/(100+i),12);}
  expect(liveLineageOf(grown.bars)!.key).toBe(lineage);
  // Alerts read from the subscription's own first bar, so the prepend is never a correction.
  expect(liveAlertView(grown).bars[0].time).toBe(T0+30*D);
  expect(handle.historyState!().status).toBe('idle');
  expect(liveHistoryState(id)?.status).toBe('idle');
  handle.close();
  expect(liveHistoryState(id)).toBeNull();
 });
 it('the chart request reaches the derived pager, and a limiting component at its limit ends with No more data',async()=>{
  const gme=component('GME',3,20,0,5),spy=component('SPY',0,20,0);
  let clock=1_000_000;
  const provider=new SymbolMathProvider(symbol=>symbol==='GME'?gme.handle:spy.handle,{now:()=>clock});
  const handle=provider.open('GME-SPY','1D'),id=symbolMathDatasetId('GME-SPY','1D');
  expect(requestLiveHistory(id)).toBe(true);
  await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));
  expect(handle.dataset().bars[0].time).toBe(T0);// GME paged to day 0, SPY already had it
  clock+=5000;
  // Now both start at day 0: both are limiting, both report their end.
  const end=await handle.loadOlder!();
  expect(end).toEqual({status:'exhausted',message:LIVE_NO_MORE_DATA});
  provider.dispose();
  expect(liveHistoryState(id)).toBeNull();
 });
 it('a static import component cannot page, so it ends paging when it limits',async()=>{
  const spy=component('SPY',0,20,0);
  const imported:BarDataset={...spy.handle.dataset(),bars:days(5,16,i=>7+i)};
  const provider=new SymbolMathProvider(symbol=>symbol==='SPY'?spy.handle:{datasetId:'import:GME',dataset:()=>imported,formingTime:()=>null,onChange:()=>()=>{},close:()=>{}},{});
  const handle=provider.open('GME/SPY','1D');
  expect((await handle.loadOlder!()).status).toBe('exhausted');
  expect(spy.calls.n).toBe(0);
  provider.dispose();
 });
});
