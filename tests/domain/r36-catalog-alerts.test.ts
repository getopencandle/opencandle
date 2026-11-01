// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import {afterEach,describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey,technicalSourceLabel} from '../../src/domain/technical-alerts';
import {alertDatasetWithPrefix,alertSourceId,validateTechnicalAlertSource,type AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {indicatorAlertBlock,alertChartFacts} from '../../src/domain/indicator-alertability';
import {defaultIndicatorPresentation,indicatorDefaults,indicatorPlotIds,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {createLocalAlert,processAlertEvent,type AlertDefinition,type LocalAlert} from '../../src/domain/alerts';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {BackgroundAlertWatcher} from '../../src/ui/background-alert-watcher';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {Bar,BarDataset} from '../../src/domain/types';
import type {LiveHandle} from '../../src/domain/live-provider';
import {alertOn,liveLike} from '../helpers/background-alert-fixtures';

// Alert extension: every catalog indicator is alertable on each of its plots, on the chart and in the
// background. SYNTHETIC bars, alerts and feeds only; no network, no key.
const settings=(kind:IndicatorId,id='i1'):IndicatorInstanceSettings=>({id,kind,inputs:{...indicatorDefaults[kind]} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
const T0=1_760_000_000-1_760_000_000%300;
const wave=(count:number):Bar[]=>Array.from({length:count},(_,i)=>{const close=100+8*Math.sin(i/9)+3*Math.sin(i/3.3)+(i%5)*0.2;return {time:T0+i*300,open:close-0.4+(i%3)*0.3,high:close+1+(i%4)*0.25,low:close-1-(i%3)*0.2,close,volume:1000+(i*37)%400};});
const dataset=(bars:Bar[]):BarDataset=>({...liveLike('GME','5m'),bars});
/** One representative per indicator family (original catalog, patterns), plus the ones that read chart facts. */
const FAMILY=['cci','supertrend','ichimoku','pivots','zigzag','rvat','woodiescci','alligator','macross','volstop','chopzone','cdlhammer','chpdoubletop'] as const;

describe('R36 catalog alert sources (SYNTHETIC)',()=>{
 it('one representative per family is capturable on every plot and labelled with its own plot titles',()=>{
  for(const kind of FAMILY){
   const definition=catalogDefinition(kind)!;
   for(const plot of definition.plots){
    const source=captureIndicatorAlertSource(settings(kind),plot.id,'standard','snap');
    expect(()=>validateTechnicalAlertSource(source),kind+'/'+plot.id).not.toThrow();
    expect(technicalSourceLabel(source)).toBe(`${definition.name} / ${plot.label} (standard)`);
   }
  }
  // The original ten keep their historical label.
  expect(technicalSourceLabel(captureIndicatorAlertSource(settings('sma'),'sma','standard','snap'))).toBe('SMA / sma (standard)');
 });
 it('every alertable catalog kind evaluates each plot to the chart calculation at the endpoint (same inputs, same chart facts)',async()=>{
  const bars=wave(320),facts=alertChartFacts(dataset(bars)),sources:AlertSourceSnapshot[]=[],expected=new Map<string,number|null>();
  for(const kind of ALL_CATALOG_INDICATOR_IDS){
   if(indicatorAlertBlock(kind))continue;
   const reference=calculateIndicator(kind,bars,{...indicatorDefaults[kind]},facts);
   for(const plotId of indicatorPlotIds[kind]){
    const source=captureIndicatorAlertSource(settings(kind),plotId,'standard','snap-'+kind);sources.push(source);
    expected.set(technicalSourceKey(source),reference.series.find(row=>row.id===plotId)?.values.at(-1)??null);
   }
  }
  expect(sources.length).toBe(490);// + 12 kinds, 87 plots.// + 3 kinds, 16 plots. + 10 Kinds, 28 plots. + CCI-based MA and its two Bollinger bands; every plot of the 178 alertable catalog kinds (+ 10 kinds, 38 plots; + 10 Kinds, 13 plots; + 7 Kinds, 11 plots; + 14 Kinds, 40 plots; + Periodic, Session and Auto anchored volume profile; + Correlation coefficient, Relative strength and Spread, unavailable here: no second series is supplied, as no loader is installed for the chart calculation; + 6 One-plot chart patterns)
  // More sources than one evaluation's 256-expression limit, so they are evaluated in chunks of 128.
  const results=new Map<string,{sample:{value:number|null}}>();
  for(let at=0;at<sources.length;at+=128){const batch=await evaluateTechnicalAlertSources(bars,sources.slice(at,at+128),'USD',facts);for(const [key,value] of batch.results)results.set(key,value as never);}
  const wrong=[...expected].filter(([key,value])=>!Object.is(results.get(key)?.sample.value??null,value)).map(([key])=>key);
  expect(wrong).toEqual([]);
 });
 it('chart facts reach the calculation: pivots on a US equity 5-minute source use the declared calendar',async()=>{
  const bars=wave(320),stock={...dataset(bars),instrument:{...dataset(bars).instrument,assetClass:'stock',timezone:'America/New_York'}} as BarDataset;
  const facts=alertChartFacts(stock);expect(facts).toEqual({resolution:'5m',calendar:'us-equity',exchangeZone:'America/New_York'});// 0.8.1: the exchange zone for 'Exchange' VWAPs
  const source=captureIndicatorAlertSource(settings('pivots'),indicatorPlotIds.pivots[0],'standard','snap'),key=technicalSourceKey(source);
  const value=(await evaluateTechnicalAlertSources(bars,[source],'USD',facts)).results.get(key)!.sample.value;
  expect(value).toBe(calculateIndicator('pivots',bars,{...indicatorDefaults.pivots},facts).series[0].values.at(-1));
 });
 it('the chart-only kinds stay disabled with a plain reason',()=>{
  // The two-symbol kinds are alertable now (tests/domain/r37-second-alerts.test.ts).
  for(const kind of ['vrvp','svphd'] as const){
   const reason=indicatorAlertBlock(kind);expect(reason,kind).toMatch(/cannot be alerted on\.$/);
   expect(()=>captureIndicatorAlertSource(settings(kind),indicatorPlotIds[kind][0],'standard','snap')).toThrow(reason!);
  }
  // The three intrabar studies need a feed absent from background evaluation; Visible average needs chart bounds.
  expect(ALL_CATALOG_INDICATOR_IDS.filter(kind=>indicatorAlertBlock(kind,{...indicatorDefaults[kind]}))).toEqual(['vrvp','svphd','updownvolume','volumedelta','cvd','visibleavg','tradingsessions','seasonality','autotrendlines','autoelliott']);// Visual-only, no alert operands.
 });
 it('the alert dialog lists catalog plots by their titles and disables the chart-only kinds',()=>{
  const bars=wave(80),data=dataset(bars);
  const chart={getAnalysisUnavailable:()=>null,getSourceContext:()=>sourceContextForDataset(alertDatasetWithPrefix(data,bars),bars),getDataWindow:()=>({pending:false,series:{count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,style:'candles'}}),getStyle:()=>'candles',
   indicators:{serialize:()=>[{...settings('macross','m1'),paneId:'price'},{...settings('vrvp','v1'),paneId:'price'}]},saveDrawings:()=>({drawings:[]}),getChartOptions:()=>({scale:'linear'}),scripts:{}} as any;
  const rows=new TechnicalAlertCatalog((()=>{let n=0;return()=>'s'+(++n);})()).capture(chart,data,bars,[]).filter(row=>row.id.startsWith('indicator:'));
  expect(rows.filter(row=>row.id.startsWith('indicator:m1:')).map(row=>[row.label,row.source!==null])).toEqual([['MA Cross: Short MA',true],['MA Cross: Long MA',true],['MA Cross: Crossing',true]]);
  const vp=rows.filter(row=>row.id.startsWith('indicator:v1:'));expect(vp.length).toBeGreaterThan(0);
  for(const row of vp){expect(row.source).toBeNull();expect(row.disabledReason).toMatch(/cannot be alerted on/);}
 });
});

// Closes: 40 flat bars at 100, then a rise to 110, a fall to 90 and a second rise to 110. MA Cross Short MA (SMA 9) crosses
// up through 105 once on each rise.
const closes=[...Array(40).fill(100),...Array.from({length:12},(_,k)=>100+(k+1)*10/12),...Array(6).fill(110),...Array.from({length:24},(_,k)=>110-(k+1)*20/24),...Array(6).fill(90),...Array.from({length:24},(_,k)=>90+(k+1)*20/24),...Array(6).fill(110)];
const priced=(values:readonly number[]):Bar[]=>values.map((close,i)=>({time:T0+i*300,open:close,high:close+0.5,low:close-0.5,close,volume:100}));
const shortMa=(bars:readonly Bar[])=>calculateIndicator('macross',bars,{...indicatorDefaults.macross}).series.find(row=>row.id==='short')!.values;
const upCrossings=(values:readonly (number|null)[],level:number)=>values.flatMap((value,i)=>i>0&&value!==null&&values[i-1]!==null&&(values[i-1] as number)<level&&value>=level?[i]:[]);

describe('R36 catalog alerts fire exactly once per crossing (SYNTHETIC)',()=>{
 it('on the chart path: MA Cross Short MA crossing up 105 fires once per rise',async()=>{
  const bars=priced(closes),data=dataset(bars),source=captureIndicatorAlertSource(settings('macross'),'short','standard','snap-1');
  const want=upCrossings(shortMa(bars),105);expect(want).toHaveLength(2);
  const observer=new TechnicalAlertObserver(()=>'synthetic-session',()=>Promise.resolve());let alert:LocalAlert|null=null;const fired:number[]=[];
  for(let end=2;end<=bars.length;end++){
   const prefix=bars.slice(0,end),view=await observer.observe({dataset:alertDatasetWithPrefix(data,prefix),bars:prefix,chartId:'chart-1',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:alert?[alert]:[],script:undefined as never},1_800_000_000+end);
   if(!alert){const binding=view.selectedContext!.binding;const definition:AlertDefinition={id:'alert-1',instrumentId:data.instrument.id,sourceId:alertSourceId(source),name:'MA up',message:'',condition:{kind:'crossing-up',value:105},frequency:'every-time',createdAt:1,expiresAt:null,mode:'ordinary',runId:'ordinary:snapshot:'+binding.sessionId,observationBinding:binding,conditionVersion:2};alert=createLocalAlert(definition);}
   for(const event of view.events){const result=processAlertEvent(alert!,event);alert=result.alert;if(result.notification)fired.push(end-1);}
  }
  expect(fired).toEqual(want);
 });
});

const disposers:Array<()=>void>=[];
afterEach(()=>{for(const dispose of disposers.splice(0))dispose();});
describe('R36 catalog alerts in the background (SYNTHETIC)',()=>{
 it('a background feed fires a catalog indicator alert once per crossing, alongside a price alert',async()=>{
  // The feed starts with the first 45 bars (Short MA warm) and then receives the rest one bar at a time.
  const all=priced(closes),base=liveLike('GME');let data:BarDataset={...base,bars:all.slice(0,45)};const listeners=new Set<(dataset:BarDataset)=>void>();
  const handle:LiveHandle={datasetId:base.provenance.datasetId,dataset:()=>data,formingTime:()=>null,onChange:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},close(){/* test feed */}};
  const ma=captureIndicatorAlertSource(settings('macross'),'short','standard','snap-bg');
  let saved:LocalAlert[]=[alertOn(base,'price',{condition:{kind:'crossing-up',value:105}}),alertOn(base,'ma',{condition:{kind:'crossing-up',value:105}},ma)];
  const watcher=new BackgroundAlertWatcher({open:()=>handle,alerts:()=>saved,publish:(next,expected)=>{if(expected!==saved)return false;saved=next;return true;},now:()=>Math.floor(Date.now()/1000),identity:()=>crypto.randomUUID(),openAlpacaSymbols:()=>new Set(['GME'])});
  disposers.push(()=>watcher.dispose());
  const plan=watcher.sync('');expect(plan.skipped).toEqual([]);expect(plan.feeds.map(feed=>feed.alertIds)).toEqual([['price','ma']]);
  await watcher.settled();
  for(let end=46;end<=all.length;end++){data={...data,bars:all.slice(0,end)};for(const listener of [...listeners])listener(data);await watcher.settled();}
  const history=(id:string)=>saved.find(alert=>alert.definition.id===id)!.history;
  expect(history('ma')).toHaveLength(upCrossings(shortMa(all),105).length);
  expect(history('ma')).toHaveLength(2);
  for(const row of history('ma'))expect(row.value).toBeGreaterThanOrEqual(105);
  expect(history('price')).toHaveLength(2);
 },20_000);// Each feed update yields with setTimeout(0), which takes about 16 to 23 ms under the default Windows timer resolution, so this runs near 5 s on an idle machine.
});
