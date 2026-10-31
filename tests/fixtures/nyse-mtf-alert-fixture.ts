import {qualifiedMtfNative} from './qualified-nyse-mtf-native';
import {publishedSource,flushMtf,unix} from './qualified-nyse-mtf-source';
import {TechnicalAlertCatalog} from '../../src/ui/technical-alert-catalog';
import {TechnicalAlertObserver,type TechnicalAlertInput,type TechnicalAlertView} from '../../src/ui/technical-alert-observer';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {createLocalAlert,processAlertEvent,type LocalAlert} from '../../src/domain/alerts';
import type {ChartController} from '../../src/chart/adapter';
import type {AlertSourceSnapshot} from '../../src/domain/alert-observation';

/** Real provider, constructor/queue, native core and study port. Only the controller's
 * descriptive inspection readers and empty drawing/script catalog are controlled;
 * they cannot register a source, completion observation, or numerical sample. */
export async function nyseAlertFixture(options:Parameters<typeof publishedSource>[0]={},waitForClose=true){
 const producer=await publishedSource(options);let native:Awaited<ReturnType<typeof qualifiedMtfNative>>|undefined;
 try{
  const dataset=producer.regular();native=await qualifiedMtfNative(dataset);const n=native;
  const id=n.port.add('sma',{length:2,source:'close'},{presentation:{...defaultIndicatorPresentation('sma'),timeframe:{schemaVersion:1,interval:'1D',waitForClose}}});await flushMtf();
  let serial=0;const catalog=new TechnicalAlertCatalog(()=>`synthetic-frozen-source-${++serial}`),observer=new TechnicalAlertObserver(()=>`synthetic-alert-session-${++serial}`,()=>Promise.resolve());
  const chart={indicators:n.port,scripts:{},getAnalysisUnavailable:()=>null,getExecutionIdentity:()=> 'ordinary',getStyle:()=> 'candles',getSourceContext:()=>n.source(),getChartOptions:()=>({scale:'linear'}),saveDrawings:()=>({version:1,drawings:[]}),
   getDataWindow:()=>{const basis=n.host.capture(),accepted=basis&&n.host.accepted(basis.basis),bars=n.core.rawBars as Array<{time:number}>;return {pending:!accepted,series:{count:bars.length,firstTime:bars.length?bars[0].time/1000:null,lastTime:bars.length?bars[bars.length-1].time/1000:null,style:'candles'}};}} as unknown as ChartController;
  const choices=()=>catalog.capture(chart,producer.regular(),producer.regular().bars,[]),choice=()=>choices().find(row=>row.id===`indicator:${id}:sma`)!;
  const input=(source:AlertSourceSnapshot=choice().source!,alerts:LocalAlert[]=[],adopt=false):TechnicalAlertInput=>{const dataset=producer.regular();return {dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts,adopt};};
  let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;const errors:unknown[]=[];for(const release of [()=>observer.reset(),()=>observer.dispose(),()=>n.dispose(),()=>producer.dispose()])try{release();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC daily alert fixture cleanup failed.');};
  return{producer,native:n,id,chart,catalog,observer,choices,choice,input,dispose,observe:(alerts:LocalAlert[]=[],now=unix('2024-03-11T20:00:05Z'))=>observer.observe(input(undefined,alerts),now)};
 }catch(error){const errors:unknown[]=[error];for(const release of [()=>native?.dispose(),()=>producer.dispose()])try{release();}catch(failure){errors.push(failure);}if(errors.length>1)throw new AggregateError(errors,'SYNTHETIC daily alert fixture acquisition failed.');throw error;}
}
export function alertFromView(view:TechnicalAlertView,options:{id?:string;frequency?:LocalAlert['definition']['frequency'];kind?:'greater'|'crossing-up';level?:number}={}):LocalAlert{
 const context=view.selectedContext;if(!context)throw Error('The actual selected calculation did not produce a capturable context.');
 return createLocalAlert({id:options.id??'synthetic-qualified-daily',name:'SYNTHETIC New York daily alert',message:'SYNTHETIC local-only daily calculation',instrumentId:context.instrumentId,sourceId:context.sourceId,mode:context.mode,runId:context.runId,observationBinding:context.binding,conditionVersion:2,condition:{kind:options.kind??'greater',value:options.level??100},frequency:options.frequency??'once-per-bar-close',createdAt:view.now,expiresAt:null});
}
export function applyView(alert:LocalAlert,view:TechnicalAlertView):LocalAlert{return [...(view.closedEvents??[]),...view.events].reduce((value,event)=>processAlertEvent(value,event).alert,alert);}
