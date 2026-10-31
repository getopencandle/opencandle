import {afterEach,expect,it} from 'vitest';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {openReplay,selectReplayStart,replayChartView,replayChartFrame,stepBackReplaySession} from '../../src/domain/replay-session';
import {NyseMtfAlertEvaluator,prepareNyseAlertBatch,qualifiedNyseAlertObservation} from '../../src/domain/nyse-mtf-alert-source';
import {captureNyseIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {alertFromView,applyView} from '../fixtures/nyse-mtf-alert-fixture';
const owned:{dispose():void}[]=[];afterEach(()=>{for(const item of owned.splice(0).reverse())item.dispose();});
const source=(wait=true)=>captureNyseIndicatorAlertSource({id:'synthetic-replay-sma',kind:'sma',...factoryIndicatorDefault('sma'),inputs:{length:2,source:'close'},presentation:{...defaultIndicatorPresentation('sma'),timeframe:{schemaVersion:1,interval:'1D',waitForClose:wait}}},'sma','standard','synthetic-replay-frozen');
async function setup(){
 const p=await publishedSource();owned.push(p);p.setNow(unix('2024-03-11T20:01:00Z'));p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T20:00:01Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();
 const dataset=p.regular(),participant={cellId:'synthetic-one',instrumentId:dataset.instrument.id,symbol:'GME',interval:'30m',chartType:'candles',datasetId:dataset.provenance.datasetId,revision:dataset.provenance.revision},selecting=openReplay({participants:[participant],activeCellId:participant.cellId,sessionId:'SYNTHETIC-daily-alert-replay'}),session=selectReplayStart(selecting,dataset,dataset.bars.at(-1)!.time,'30m'),view=replayChartView(session,dataset,null),evaluator=new NyseMtfAlertEvaluator();owned.push(evaluator);
 return{p,dataset,participant,session,view,evaluator};
}

it('uses an actual isolated replay clock for a completed target daily120',async()=>{
 const f=await setup(),result=prepareNyseAlertBatch(f.evaluator,f.dataset,f.view.frame.bars,f.session.runId,[source()],'USD',new AbortController().signal),sample=result.samples[0].sample;
 expect(sample.value).toBe(120);expect(sample.informationBars).toBe(26);expect(qualifiedNyseAlertObservation(sample).closed).toBe(true);expect(qualifiedNyseAlertObservation(sample).barId).toBe('nyse:1D:1710163800:'+f.session.runId);
 const observer=new TechnicalAlertObserver(()=> 'synthetic-replay-observer',()=>Promise.resolve());owned.push(observer);const view=await observer.observe({dataset:f.dataset,bars:f.view.frame.bars,chartId:'synthetic-one',replay:{runId:f.session.runId,cursor:f.view.frame.cursor},assumeReplayCompletion:false,selectedSource:source(),alerts:[]},unix('2024-03-11T20:00:05Z'));
 expect(view.selectedEvent?.value).toBe(120);expect(view.selectedEvent?.observation?.completion).toBe('simulated-complete');expect(view.selectedEvent?.barClosed).toBe(true);expect(view.selectedContext?.binding.replayRunId).toBe(f.session.runId);
});

it('does not turn a genuine developing replay prefix into a close through the checkbox',async()=>{
 const f=await setup(),session=selectReplayStart(f.session,f.dataset,unix('2024-03-11T19:00:00Z'),'30m'),frame=replayChartView(session,f.dataset,null).frame,observer=new TechnicalAlertObserver(()=> 'synthetic-replay-pending',()=>Promise.resolve());owned.push(observer);
 const view=await observer.observe({dataset:f.dataset,bars:frame.bars,chartId:'synthetic-one',replay:{runId:session.runId,cursor:frame.cursor},assumeReplayCompletion:true,selectedSource:source(false),alerts:[]},unix('2024-03-11T20:00:05Z'));
 expect(view.selectedEvent?.value).toBe(120);expect(view.selectedEvent?.barClosed).toBe(false);expect(view.selectedEvent?.observation?.completion).toBe('unknown');expect(view.selectedContext?.binding.completionPolicy).toBe('nyse-session-observation');
 expect(applyView(alertFromView(view),view).history).toEqual([]);
});

it('refuses an unowned numeric replay frame and copied arrays without borrowing actual frame permission',async()=>{
 const f=await setup(),signal=new AbortController().signal;
 expect(()=>prepareNyseAlertBatch(f.evaluator,f.dataset,replayChartFrame(f.dataset,f.session.clock!).bars,f.session.runId,[source()],'USD',signal)).toThrow('genuine');
 expect(()=>prepareNyseAlertBatch(f.evaluator,f.dataset,[...f.view.frame.bars],f.session.runId,[source()],'USD',signal)).toThrow('genuine');
 expect(prepareNyseAlertBatch(f.evaluator,f.dataset,f.view.frame.bars,f.session.runId,[source()],'USD',signal).samples[0].sample.value).toBe(120);
});

it('keeps ordinary and replay observations separate even when their prices and declared settings agree',async()=>{
 const f=await setup(),signal=new AbortController().signal,actual=prepareNyseAlertBatch(f.evaluator,f.dataset,f.view.frame.bars,f.session.runId,[source()],'USD',signal);
 expect(()=>prepareNyseAlertBatch(f.evaluator,{...f.dataset},f.view.frame.bars,f.session.runId,[source()],'USD',signal)).toThrow('genuine');
 const other=await publishedSource();owned.push(other);expect(()=>prepareNyseAlertBatch(f.evaluator,other.regular(),f.view.frame.bars,f.session.runId,[source()],'USD',signal)).toThrow('genuine');expect(()=>actual.assertCurrent()).not.toThrow();
});

it('terminally retires the old numeric sample after a genuine backward replay owner is observed',async()=>{
 const f=await setup(),signal=new AbortController().signal,result=prepareNyseAlertBatch(f.evaluator,f.dataset,f.view.frame.bars,f.session.runId,[source()],'USD',signal),sample=result.samples[0].sample;
 const backward=stepBackReplaySession(f.session,f.dataset.bars.map(row=>row.time+1800),1);replayChartView(backward,f.dataset,null);expect(()=>result.assertCurrent()).toThrow();
 replayChartView(f.session,f.dataset,null);expect(()=>result.assertCurrent()).toThrow();expect(()=>qualifiedNyseAlertObservation(sample)).toThrow();
});
