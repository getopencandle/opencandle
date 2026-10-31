// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {captureIndicatorAlertSource,technicalSourceLabel} from '../../src/domain/technical-alerts';
import {alertDatasetWithPrefix,alertSourceId,validateTechnicalAlertSource} from '../../src/domain/alert-observation';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {defaultIndicatorPresentation,indicatorDefaults,indicatorPlotIds,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {createLocalAlert,processAlertEvent,type AlertDefinition,type LocalAlert} from '../../src/domain/alerts';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {BackgroundAlertWatcher} from '../../src/ui/background-alert-watcher';
import {planBackgroundAlertFeeds} from '../../src/ui/background-alert-plan';
import {alertSecondSymbolDemand,alertSecondSymbolReads,secondSymbolAlertGate} from '../../src/domain/second-symbol-alerts';
import {ALERT_SECOND_SYMBOL_LEASE_MS,leasedAlertSecondSymbolKeys,notifySecondSymbols,setSecondSymbolLoader,type SecondSeries} from '../../src/domain/second-symbol';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {LiveHandle} from '../../src/domain/live-provider';
import {alertOn,liveLike} from '../helpers/background-alert-fixtures';

// Correlation coefficient, Relative strength and Spread are alertable on the chart and in the background.
// SYNTHETIC bars, alerts, feeds and loaders only; no network, no key.
const settings=(kind:IndicatorId,id='i1',inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id,kind,inputs:{...indicatorDefaults[kind],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
const T0=1_760_000_000-1_760_000_000%300;
// GME closes: 40 flat bars at 100, a rise to 110, a fall to 90 and a second rise to 110. SPY is flat at 100, so the Spread
// (GME close - 1 x SPY close) crosses up through 5 once on each rise.
const closes=[...Array(40).fill(100),...Array.from({length:12},(_,k)=>100+(k+1)*10/12),...Array(6).fill(110),...Array.from({length:24},(_,k)=>110-(k+1)*20/24),...Array(6).fill(90),...Array.from({length:24},(_,k)=>90+(k+1)*20/24),...Array(6).fill(110)];
const priced=(values:readonly number[]):Bar[]=>values.map((close,i)=>({time:T0+i*300,open:close,high:close+0.5,low:close-0.5,close,volume:100}));
const GME=priced(closes),SPY=priced(closes.map(()=>100));
const spreadValues=calculateIndicator('spread',GME,{...indicatorDefaults.spread},{secondSeries:()=>({bars:SPY,state:'ready',message:null})}).series[0].values;
const upCrossings=(values:readonly (number|null)[],level:number)=>values.flatMap((value,i)=>i>0&&value!==null&&values[i-1]!==null&&(values[i-1] as number)<level&&value>=level?[i]:[]);
const WANT=upCrossings(spreadValues,5);
const spreadSource=()=>captureIndicatorAlertSource(settings('spread'),'spread','standard','snap-spread');
const ready=(bars:readonly Bar[],live=false,formingTime:number|null=null):SecondSeries=>({bars,state:'ready',message:null,live,formingTime});
const LOADING:SecondSeries={bars:null,state:'loading',message:'SPY is loading.'};

afterEach(()=>{setSecondSymbolLoader(null);});

describe('R37 second-symbol alert gate (SYNTHETIC)',()=>{
 it('the three two-symbol kinds are alertable on every plot; the view-dependent profiles stay refused',()=>{
  expect(WANT).toHaveLength(2);
  for(const kind of ['correlation','relstrength','spread'] as const){
   expect(indicatorAlertBlock(kind,{...indicatorDefaults[kind]}),kind).toBeNull();
   for(const plotId of indicatorPlotIds[kind])expect(()=>validateTechnicalAlertSource(captureIndicatorAlertSource(settings(kind),plotId,'standard','snap')),kind+'/'+plotId).not.toThrow();
  }
  expect(technicalSourceLabel(spreadSource())).toBe('Spread / Spread (standard)');
  for(const kind of ['vrvp','svphd'] as const)expect(indicatorAlertBlock(kind,{...indicatorDefaults[kind]})).toMatch(/visible range/);
  // A comparison reads each second symbol once, by its canonical text.
  const left=captureIndicatorAlertSource(settings('correlation','c1',{symbol:'gme / spy'}),'correlation','standard','a'),right=captureIndicatorAlertSource(settings('relstrength','r1'),'rs','standard','b');
  expect(alertSecondSymbolReads({kind:'comparison',snapshotId:'x',left,right})).toEqual([{name:'Correlation coefficient',symbol:'GME/SPY'},{name:'Relative strength vs benchmark',symbol:'SPY'}]);
 });
 it('waits while loading (gapped), holds a late or forming endpoint bar, and cuts later bars (no lookahead)',()=>{
  const reads=[{name:'Spread',symbol:'SPY'}],end=SPY[50].time,gate=(found:SecondSeries,closed=false)=>secondSymbolAlertGate(reads,{endTime:end,closed,lookup:()=>found});
  expect(gate(LOADING)).toEqual({kind:'loading',reason:'Spread waits for SPY: it is loading. The alert resumes when it is ready, from a fresh baseline.'});
  expect(gate({bars:null,state:'unavailable',message:'SPY could not be opened.'})).toMatchObject({kind:'loading',reason:expect.stringContaining('SPY could not be opened.')});
  expect(gate(ready(SPY.slice(0,50),true))).toEqual({kind:'hold',reason:'Spread waits for SPY: its bar for this time has not arrived yet.'});
  expect(gate(ready(SPY.slice(0,51),true,end),true)).toEqual({kind:'hold',reason:'Spread waits for SPY: its bar for this time is still forming.'});
  // A forming endpoint may read the forming second bar (the chart does too); an import that ends early never holds.
  expect(gate(ready(SPY.slice(0,51),true,end)).kind).toBe('ready');
  expect(gate(ready(SPY.slice(0,40))).kind).toBe('ready');
  const cut=gate(ready(SPY,true,SPY.at(-1)!.time),true);
  expect(cut.kind).toBe('ready');if(cut.kind==='ready')expect(cut.series.get('SPY')!.at(-1)!.time).toBe(end);
 });
});

describe('R37 second-symbol alerts on the chart path (SYNTHETIC)',()=>{
 const run=async(second:(end:number,attempt:number)=>SecondSeries,attempts:(end:number)=>number=()=>1)=>{
  const data=liveLike('GME','5m'),source=spreadSource(),observer=new TechnicalAlertObserver(()=>'synthetic-session',()=>Promise.resolve());
  let alert:LocalAlert|null=null,clock=1_800_000_000;const fired:number[]=[],notes:string[]=[];
  for(let end=2;end<=GME.length;end++)for(let attempt=0;attempt<attempts(end);attempt++){
   const prefix=GME.slice(0,end),view=await observer.observe({dataset:alertDatasetWithPrefix({...data,bars:GME},prefix),bars:prefix,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:alert?[alert]:[],script:undefined as never,secondSeries:(symbol,resolution)=>{expect([symbol,resolution]).toEqual(['SPY','5m']);return second(end,attempt);}},++clock);
   notes.push(...view.diagnostics);
   if(!alert&&view.selectedContext){const binding=view.selectedContext.binding;const definition:AlertDefinition={id:'alert-1',instrumentId:data.instrument.id,sourceId:alertSourceId(source),name:'Spread up',message:'',condition:{kind:'crossing-up',value:5},frequency:'every-time',createdAt:1,expiresAt:null,mode:'ordinary',runId:'ordinary:snapshot:'+binding.sessionId,observationBinding:binding,conditionVersion:2};alert=createLocalAlert(definition);}
   // Closed-bar events first, as App processes them.
   for(const event of [...(view.closedEvents??[]),...view.events]){expect(event.value===null||Number.isFinite(event.value)).toBe(true);const result=processAlertEvent(alert!,event);alert=result.alert;if(result.notification)fired.push(end-1);}
  }
  return{fired,notes};
 };
 it('fires exactly once per crossing on a ready second series',async()=>{
  expect((await run(()=>ready(SPY))).fired).toEqual(WANT);
 });
 it('while the second symbol loads the alert waits gapped: a crossing inside the wait is not invented, the next one fires once',async()=>{
  // Ready first (the stream exists), then SPY reloads across the first crossing, then ready again.
  const {fired,notes}=await run(end=>end>30&&end<=WANT[0]+3?LOADING:ready(SPY));
  expect(fired).toEqual([WANT[1]]);
  expect(notes).toContain('Spread waits for SPY: it is loading. The alert resumes when it is ready, from a fresh baseline.');
 });
 it('a late second bar holds the observation without a gap, so the crossing still fires exactly once when it arrives',async()=>{
  // At each crossing bar the first attempt sees SPY one bar behind (live, not arrived); the second attempt sees it.
  const late=new Set(WANT.map(index=>index+1));
  const {fired,notes}=await run((end,attempt)=>late.has(end)&&attempt===0?ready(SPY.slice(0,end-1),true,SPY[end-2].time):ready(SPY.slice(0,end),true,SPY[end-1].time),end=>late.has(end)?2:1);
  expect(fired).toEqual(WANT);
  expect(notes).toContain('Spread waits for SPY: its bar for this time has not arrived yet.');
 });
});

const disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers.splice(0))dispose();});
describe('R37 second-symbol alerts in the background (SYNTHETIC)',()=>{
 const feed=(initial:number)=>{
  const base=liveLike('GME');let data:BarDataset={...base,bars:GME.slice(0,initial)};const listeners=new Set<(dataset:BarDataset)=>void>();
  const handle:LiveHandle={datasetId:base.provenance.datasetId,dataset:()=>data,formingTime:()=>null,onChange:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},close(){/* test feed */}};
  return{base,handle,end:()=>data.bars.length,push:(end:number)=>{data={...data,bars:GME.slice(0,end)};for(const listener of [...listeners])listener(data);}};
 };
 const watch=(alerts:{saved:LocalAlert[]},handle:LiveHandle,secondSeries?:(symbol:string,resolution:string)=>SecondSeries)=>{
  const watcher=new BackgroundAlertWatcher({open:()=>handle,alerts:()=>alerts.saved,publish:(next,expected)=>{if(expected!==alerts.saved)return false;alerts.saved=next;return true;},now:()=>Math.floor(Date.now()/1000),identity:()=>crypto.randomUUID(),openAlpacaSymbols:()=>new Set(['GME']),...(secondSeries?{secondSeries}:{})});
  disposers.push(()=>watcher.dispose());return watcher;
 };
 it('a background Spread alert waits while SPY loads, then fires once per crossing; a price alert on the feed is unaffected',async()=>{
  const {base,handle,end,push}=feed(30),alerts={saved:[alertOn(base,'price',{condition:{kind:'crossing-up',value:105}}),alertOn(base,'spread',{condition:{kind:'crossing-up',value:5}},spreadSource())]};
  const watcher=watch(alerts,handle,(symbol,resolution)=>{expect([symbol,resolution]).toEqual(['SPY','5m']);return end()>35&&end()<=WANT[0]+3?LOADING:ready(SPY.slice(0,end()),true,SPY[end()-1].time);});
  expect(watcher.sync('').skipped).toEqual([]);await watcher.settled();
  for(let n=31;n<=GME.length;n++){push(n);await watcher.settled();}
  const history=(id:string)=>alerts.saved.find(alert=>alert.definition.id===id)!.history;
  expect(history('spread')).toHaveLength(1);
  expect(history('spread')[0].value).toBeGreaterThanOrEqual(5);
  expect(history('price')).toHaveLength(2);
 },20_000);// Each feed update yields with setTimeout(0), which takes about 16 to 23 ms under the default Windows timer resolution, so this runs near 5 s on an idle machine.
 it('loads SPY through the registry (alert lookup, leased) and resumes on a second-symbol update with no feed update',async()=>{
  const {base,handle,push}=feed(30),alerts={saved:[alertOn(base,'spread',{condition:{kind:'crossing-up',value:5}},spreadSource())]};
  let spyEnd=30;const calls:string[]=[];
  setSecondSymbolLoader({series:()=>{throw new Error('an alert never uses the typed indicator lookup');},alertSeries:(symbol,resolution)=>{calls.push(symbol+'@'+resolution);return ready(SPY.slice(0,spyEnd),true,SPY[spyEnd-1].time);}});
  const watcher=watch(alerts,handle);watcher.sync('');await watcher.settled();
  for(let n=31;n<=WANT[0]+1;n++){spyEnd=n===WANT[0]+1?n-1:n;push(n);await watcher.settled();}
  // GME's crossing bar arrived; SPY's has not: the alert holds.
  expect(alerts.saved[0].history).toHaveLength(0);
  expect(calls.every(call=>call==='SPY@5m')).toBe(true);
  expect(leasedAlertSecondSymbolKeys()).toEqual(new Set(['SPY\u00005m']));
  expect(leasedAlertSecondSymbolKeys(Date.now()+ALERT_SECOND_SYMBOL_LEASE_MS+1)).toEqual(new Set());
  spyEnd=WANT[0]+1;notifySecondSymbols();await new Promise(resolve=>setTimeout(resolve,0));await watcher.settled();
  expect(alerts.saved[0].history).toHaveLength(1);
  notifySecondSymbols();await new Promise(resolve=>setTimeout(resolve,0));await watcher.settled();
  expect(alerts.saved[0].history).toHaveLength(1);
 });
 it('the plan counts the second symbol toward the 30-symbol Alpaca limit; Coinbase second symbols do not count',()=>{
  const base=liveLike('GME'),taken=(count:number)=>new Set(Array.from({length:count},(_,i)=>'S'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26)));
  const spy=alertOn(base,'spy',{},spreadSource()),btc=alertOn(base,'btc',{},captureIndicatorAlertSource(settings('spread','i2',{symbol:'BTC-USD'}),'spread','standard','snap-btc'));
  expect(planBackgroundAlertFeeds({alerts:[spy],activeInstrumentId:'',openAlpacaSymbols:taken(28)}).skipped).toEqual([]);
  const refused=planBackgroundAlertFeeds({alerts:[spy],activeInstrumentId:'',openAlpacaSymbols:taken(29)});
  expect(refused.feeds).toEqual([]);
  expect(refused.skipped).toEqual([{alertId:'spy',reason:"Live stock data streams at most 30 symbols at once (the Alpaca limit), and this alert's second symbol needs 1 more, so it is not watched in the background."}]);
  expect(planBackgroundAlertFeeds({alerts:[btc],activeInstrumentId:'',openAlpacaSymbols:taken(29)}).skipped).toEqual([]);
  // SPY already streaming (a chart or another feed) costs nothing more.
  expect(planBackgroundAlertFeeds({alerts:[spy],activeInstrumentId:'',openAlpacaSymbols:new Set([...taken(29)].slice(0,28).concat('SPY'))}).skipped).toEqual([]);
 });
 it('saved running alerts keep their second feed open; paused or stopped ones do not (closing when unused)',()=>{
  const base=liveLike('GME'),spy=alertOn(base,'spy',{},spreadSource());
  expect(alertSecondSymbolDemand([spy])).toEqual(new Set(['SPY\u00005m']));
  expect(alertSecondSymbolDemand([{...spy,status:'paused'} as LocalAlert,{...spy,status:'stopped'} as LocalAlert,alertOn(base,'price')])).toEqual(new Set());
 });
});

describe('R37 second-symbol alerts: App loader wiring (ROOT)',()=>{
 it('alert lookups share the second-symbol feeds, are never superseded, and are kept by demand and leases',()=>{
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('},alertSeries(symbol,resolution){');
  expect(app).toContain('const feed=lookup(symbol,resolution,false,true);');
  expect(app).toContain("if(!data.bars.length||data.provenance.state==='loading')return{bars:null,state:'loading',message:symbol+' is loading.'};");
  expect(app).toContain('live:isLiveDatasetId(data.provenance.datasetId),formingTime:feed.handle.formingTime()');
  expect(app).toContain('const superseded=opened.typed&&!opened.script&&!opened.alert&&[');
  expect(app).toContain('...leasedScriptRequestKeys(),...alertSecondSymbolDemand(financial.current.alerts),...leasedAlertSecondSymbolKeys()]));');
  expect(app).toContain('if((feed.script||feed.alert)&&!feed.typed&&!wanted.has(key))drop(key);');
  // The spread limits are unchanged.
  expect(app).toContain('const SECOND_SYMBOL_FEEDS=8,SECOND_SYMBOL_RETRY_MS=15000,SECOND_SYMBOL_DELAY_MS=600;');
 });
});
