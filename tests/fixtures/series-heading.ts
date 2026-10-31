import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import type {Bar} from '../../src/domain/types';
import {isDerivedStyle} from '../../src/chart/derived/common';
import * as tools from '../../src/chart/series-readout-position';

/** Actual adapter method under controlled private lexical rows/native sinks; Node-only synthetic evidence. */
export function seriesHeadingProducer(raw:Bar[],options:{style?:string;displayed?:Bar[];zone?:string;derived?:any}={}){
 const source=readFileSync(process.env.LV_SERIES_SOURCE_ROOT?resolve(process.env.LV_SERIES_SOURCE_ROOT,'src/chart/adapter.ts'):new URL('../../src/chart/adapter.ts',import.meta.url),'utf8');
 const from=source.indexOf('    captureSeriesReadout:():SeriesReadout=>{'),to=source.indexOf('    getDataWindow:',from);
 if(from<0||to<0)throw Error('Actual adapter series producer boundary changed.');
 const body=source.slice(from,to).trim().replace('captureSeriesReadout:():SeriesReadout=>{','function capture():SeriesReadout{').replace(/},$/,'}');
 const weakFrom=source.indexOf('function weakMainSeriesReadout('),weakTo=source.indexOf('import type {IndicatorPresentationOwner}',weakFrom);
 if(weakFrom<0||weakTo<0)throw Error('Actual weak view boundary changed.');
 const weak=source.slice(weakFrom,weakTo);
 const code=stripTypeScriptTypes(`function build(raw,options,tools){
 const {isDerivedStyle,seriesOwn,seriesNumber,seriesScalarBar,seriesFloor,createSeriesDayCloseReader,SeriesReadoutQueryError,SeriesReadoutPendingError}=tools;
 ${weak}
 let currentBars=raw,currentSource={datasetId:'SYNTHETIC local',resolution:'1m'},requestedStyle=options.style??'candles',vwapSourceEpoch={},currentExecutionIdentity='ordinary';
 let disposed=false,marketUpdating=false,analysisPending=0,analysisUnavailable='',seriesReadoutLease=null,statsSourceEpoch={},seriesReadoutRetiredBasis=null,seriesDayReader=null,derivedMemo=options.derived??null,pending=false,zone=options.zone??'UTC';
 const ms=row=>({...row,time:row.time*1000});
 const native=(options.displayed??raw).map(ms),shown=native.map(row=>({...row}));
 const core={bars:native,rawBars:(options.derived?options.displayed:raw).map(ms),barTransform:requestedStyle==='heikinashi'?{}:null,renderer:{bars:shown}};
 const chart={orchestrator:core},controller={getChartOptions:()=>({timezone:zone})},marketQueue={isPending:()=>pending};
 ${body}
 return{capture,raw,native,shown,core,source:currentSource,setPending(value){pending=value;},setZone(value){zone=value;},setResolution(value){currentSource.resolution=value;vwapSourceEpoch={};},publish(next=raw){currentBars=next;vwapSourceEpoch={};},retire(){disposed=true;seriesReadoutLease=null;},setExecution(value){currentExecutionIdentity=value;vwapSourceEpoch={};}};
 }`,{mode:'transform'});
 return new Function(code+';return build;')()(raw,options,{...tools,isDerivedStyle}) as {capture:()=>tools.SeriesReadout;raw:Bar[];native:Bar[];shown:Bar[];core:any;source:any;setPending(value:boolean):void;setZone(value:string):void;setResolution(value:string):void;publish(next?:Bar[]):void;retire():void;setExecution(value:string):void};
}
export const literalSeriesRows=():Bar[]=>[
 {time:100,open:10,high:14,low:6,close:12,volume:10},
 {time:160,open:12,high:20,low:8,close:16,volume:20},
 {time:220,open:16,high:22,low:12,close:18,volume:30},
];
