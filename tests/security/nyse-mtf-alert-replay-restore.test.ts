import {afterEach,expect,it} from 'vitest';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {openReplay,selectReplayStart,replayChartView,closeReplay,continueReplaySession} from '../../src/domain/replay-session';
import {NyseMtfAlertEvaluator,prepareNyseAlertBatch,qualifiedNyseAlertObservation} from '../../src/domain/nyse-mtf-alert-source';
import {captureNyseIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {alertFromView} from '../fixtures/nyse-mtf-alert-fixture';
const owned:{dispose():void}[]=[];afterEach(()=>{for(const item of owned.splice(0).reverse())item.dispose();});
/** These two literal lifecycle oracles require root's separate replay-continue
 * identity repair; the current-main defect is preserved, never emulated here. */
async function setup(){
 const producer=await publishedSource();owned.push(producer);producer.setNow(unix('2024-03-11T20:01:00Z'));producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T20:00:01Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();
 const dataset=producer.regular(),participant={cellId:'synthetic-one',instrumentId:dataset.instrument.id,symbol:'GME',interval:'30m',chartType:'candles',datasetId:dataset.provenance.datasetId,revision:dataset.provenance.revision},session=selectReplayStart(openReplay({participants:[participant],activeCellId:participant.cellId,sessionId:'SYNTHETIC-daily-alert-restoration'}),dataset,dataset.bars.at(-1)!.time,'30m'),frame=replayChartView(session,dataset,null).frame,saved=closeReplay(session,unix('2024-03-11T20:01:01Z')).saved!;
 const source=captureNyseIndicatorAlertSource({id:'synthetic-restored-sma',kind:'sma',...factoryIndicatorDefault('sma'),inputs:{length:2,source:'close'},presentation:{...defaultIndicatorPresentation('sma'),timeframe:{schemaVersion:1,interval:'1D',waitForClose:true}}},'sma','standard','synthetic-restored-frozen'),evaluator=new NyseMtfAlertEvaluator();owned.push(evaluator);
 return{dataset,session,frame,saved,source,evaluator};
}

it('retires a captured completed daily sample when genuine Continue restores the same clock into a new opaque run',async()=>{
 const f=await setup(),old=prepareNyseAlertBatch(f.evaluator,f.dataset,f.frame.bars,f.session.runId,[f.source],'USD',new AbortController().signal),sample=old.samples[0].sample;
 expect(sample.value).toBe(120);const restored=continueReplaySession(f.saved,[f.dataset],{'synthetic-one':'candles'},'30m'),frame=replayChartView(restored,f.dataset,null).frame;
 expect(restored.runId).not.toBe(f.session.runId);expect(restored.clock).toBe(f.session.clock);expect(()=>old.assertCurrent()).toThrow();expect(()=>qualifiedNyseAlertObservation(sample)).toThrow();
 const fresh=prepareNyseAlertBatch(f.evaluator,f.dataset,frame.bars,restored.runId,[f.source],'USD',new AbortController().signal);expect(fresh.samples[0].sample.value).toBe(120);expect(qualifiedNyseAlertObservation(fresh.samples[0].sample).barId).toBe('nyse:1D:1710163800:'+restored.runId);
});

it('does not silently adopt a saved replay alert into a second genuine same-clock restored run',async()=>{
 const f=await setup(),observer=new TechnicalAlertObserver(()=> 'synthetic-restore-observer',()=>Promise.resolve());owned.push(observer);
 const before=await observer.observe({dataset:f.dataset,bars:f.frame.bars,chartId:'synthetic-one',replay:{runId:f.session.runId,cursor:f.frame.cursor},assumeReplayCompletion:false,selectedSource:f.source,alerts:[]},unix('2024-03-11T20:01:00Z')),alert=alertFromView(before),a=continueReplaySession(f.saved,[f.dataset],{'synthetic-one':'candles'},'30m');replayChartView(a,f.dataset,null);
 const b=continueReplaySession(f.saved,[f.dataset],{'synthetic-one':'candles'},'30m'),frame=replayChartView(b,f.dataset,null).frame;expect(b.runId).not.toBe(a.runId);expect(b.runId).not.toBe(f.session.runId);
 const after=await observer.observe({dataset:f.dataset,bars:frame.bars,chartId:'synthetic-one',replay:{runId:b.runId,cursor:frame.cursor},assumeReplayCompletion:false,selectedSource:null,alerts:[alert],adopt:true},unix('2024-03-11T20:01:01Z'));expect(after.events).toEqual([]);expect(after.inactiveAlertIds).toEqual([alert.definition.id]);
});
