import type {Bar} from '../domain/types';
import type {IndicatorResult} from '../domain/indicators';
import {parseInterval,intervalLabel,STANDARD_INTERVALS} from '../domain/intervals';
import {parseIndicatorSource} from '../domain/indicator-source';
import {planHigherTimeframe,alignHigherTimeframe,type HigherTimeframePlan} from '../domain/indicator-resample';

/**
 * Per-instance Timeframe and "Wait for timeframe closes". Stored inside the instance presentation so the
 * existing draft, template, default and workspace paths carry it unchanged. Absent means the chart timeframe.
 *
 * Reference: the common multi-timeframe convention is that
 * indicator timeframes share the chart interval list and that waiting produces values only at completion. The
 * reference default of the wait flag is not established; LV starts with it on (local default, no repainting).
 */
export interface IndicatorTimeframe {schemaVersion:1;interval:string|null;waitForClose:boolean}
export const INDICATOR_TIMEFRAME_DEFAULT:Readonly<IndicatorTimeframe>=Object.freeze({schemaVersion:1,interval:null,waitForClose:true});
export const INDICATOR_TIMEFRAME_CHART_LABEL='Chart';
/** "Chart" plus the LV time presets of the interval menu. Tick/range presets are omitted: they need event data. */
export const INDICATOR_TIMEFRAME_CHOICES:readonly {value:string;label:string}[]=[{value:'',label:INDICATOR_TIMEFRAME_CHART_LABEL},...STANDARD_INTERVALS.filter(spec=>spec.kind==='time').map(spec=>({value:spec.id,label:intervalLabel(spec)}))];
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value'));
export function validateIndicatorTimeframe(value:unknown):asserts value is IndicatorTimeframe{
 if(!plain(value)||Reflect.ownKeys(value).length!==3||!['schemaVersion','interval','waitForClose'].every(key=>Object.hasOwn(value,key)))throw new Error('Indicator timeframe requires schemaVersion, interval and waitForClose only.');
 if(value.schemaVersion!==1||typeof value.waitForClose!=='boolean')throw new Error('Indicator timeframe requires version 1 and an explicit wait-for-close boolean.');
 if(value.interval===null)return;
 if(typeof value.interval!=='string')throw new Error('Indicator timeframe interval must be a canonical interval or null for the chart timeframe.');
 const spec=parseInterval(value.interval);
 if(spec.id!==value.interval)throw new Error('Indicator timeframe interval must be stored in canonical form ('+spec.id+').');
 if(spec.kind!=='time')throw new Error('Tick and range timeframes need actual event data and are unavailable for indicators.');
}
/** Turn dialog text ('' or 'Chart' = chart timeframe; otherwise LV interval syntax such as 4h, 1D, 1W) into a stored interval. */
export function parseIndicatorTimeframeInterval(text:string):string|null{
 const trimmed=String(text).trim();if(trimmed===''||trimmed===INDICATOR_TIMEFRAME_CHART_LABEL)return null;
 const spec=parseInterval(trimmed);if(spec.kind!=='time')throw new Error('Tick and range timeframes need actual event data and are unavailable for indicators.');return spec.id;
}
export function indicatorTimeframeOf(presentation:{timeframe?:IndicatorTimeframe}|undefined):IndicatorTimeframe{return presentation?.timeframe??INDICATOR_TIMEFRAME_DEFAULT;}
/** The one (1D, 1W and 1M) own-timeframe alert route, the qualified New York regular-session calculation. */
export const OWN_TIMEFRAME_ALERT_ROUTE='Own-timeframe alerts support 1D, 1W and 1M timeframes on US stock and ETF intraday charts with live or replay data.';
/** Reason an alert cannot capture this instance as an ordinary chart-timeframe source, or null. A 1D, 1W or 1M instance can
 *  still be captured through the qualified session route (captureNyseIndicatorAlertSource); every other own timeframe is refused. */
export function indicatorTimeframeAlertBlock(settings:{presentation?:{timeframe?:IndicatorTimeframe}}):string|null{
 const interval=indicatorTimeframeOf(settings.presentation).interval;
 return interval===null?null:'Alerts are unavailable for an indicator calculated on its own '+interval+' timeframe. '+OWN_TIMEFRAME_ALERT_ROUTE+' Set its timeframe to '+(['1D','1W','1M'].includes(interval)?'Chart':'1D, 1W, 1M or Chart')+' to create an alert.';
}
const unavailable=(kind:string,message:string,policies:string[]=[]):IndicatorResult=>({id:kind,series:[],diagnostics:[message],policies:['An indicator with its own timeframe is never calculated on the chart bars instead.',...policies]});
/**
 * Evaluate on the instance's own timeframe and align to the chart bars. raw are the chart's standard bars (before a
 * chart-type transform); toCalculation applies that transform to the higher-timeframe bars. chartLength is the number
 * of chart calculation bars the aligned values must cover. Interval equal to the chart evaluates the chart bars.
 * calendar (L4): the chart's session calendar; 'us-equity' builds the timeframe on New York trading sessions.
 * completeRows: chart rows known to be closed (a live or replay forming last bar is not); absent = every row is closed.
 * A bucket whose last row is still forming stays developing, so Wait for timeframe closes shows no value for it yet.
 */
export function evaluateIndicatorOnTimeframe(settings:{kind:string;inputs:Record<string,unknown>;presentation?:{timeframe?:IndicatorTimeframe}},chartResolution:string|null,raw:readonly Bar[]|null,chartBars:readonly Bar[],toCalculation:(bars:readonly Bar[])=>Bar[],evaluate:(bars:readonly Bar[])=>IndicatorResult,qualified?:HigherTimeframePlan,calendar?:'us-equity'|'utc'|null,completeRows?:number):IndicatorResult{
 const timeframe=indicatorTimeframeOf(settings.presentation);
 if(timeframe.interval===null)return evaluate(chartBars);
 if(parseIndicatorSource(settings.inputs.source))return unavailable(settings.kind,'An indicator that uses another indicator as its source calculates on the chart timeframe only. Choose the Chart timeframe or a price source.');
 if(!raw)return unavailable(settings.kind,'The chart source bars for timeframe '+timeframe.interval+' were not supplied.');
 let chartId:string|null=null;try{chartId=chartResolution===null?null:parseInterval(chartResolution).id;}catch{chartId=null;}
 if(chartId===timeframe.interval){const result=evaluate(chartBars);result.policies.push('The indicator timeframe equals the chart interval; values use the chart bars.');return result;}
 const planned=qualified?{ok:true as const,plan:qualified}:planHigherTimeframe(raw,chartResolution,timeframe.interval,{calendar,...(completeRows!==undefined?{completeRows}:{})});
 if(!planned.ok)return unavailable(settings.kind,planned.message);
 const plan=planned.plan;
 if(raw.length!==chartBars.length)return unavailable(settings.kind,'This chart type changes the number of calculation bars, so values on timeframe '+plan.target+' cannot be aligned to it.');
 let htf:Bar[];try{htf=toCalculation(plan.bars);}catch(error){return unavailable(settings.kind,'The chart type cannot build timeframe '+plan.target+' calculation bars: '+(error instanceof Error?error.message:String(error)));}
 if(htf.length!==plan.bars.length)return unavailable(settings.kind,'The chart type changes the number of '+plan.target+' bars, so they cannot be aligned to the chart.');
 const result=evaluate(htf);
 const series=result.series.map(row=>({...row,values:alignHigherTimeframe(row.values,plan,chartBars.length,timeframe.waitForClose)}));
 const policies=[...result.policies,...plan.policies,timeframe.waitForClose?'Wait for timeframe closes: values appear only on the chart bar where each '+plan.target+' bar is confirmed.':'Not waiting for timeframe closes: history holds the last confirmed '+plan.target+' value; the latest chart bar shows the developing value'+(plan.developing?' (provisional).':'.')];
 return {...result,series,policies};
}
