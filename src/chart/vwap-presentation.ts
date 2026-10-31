import type {LineLikeSeries,PriceLine} from '@luxalgo/vela';
import type {IndicatorResult} from '../domain/indicators';
import type {Bar} from '../domain/types';
import {VWAP_WORKER_LIMITS} from '../vwap/types';
import {assertIndicatorBatchBudget,indicatorPlotIds,validateIndicatorSettings,type IndicatorInstanceSettings} from './indicator-settings';
import {defaultPlotStyle,validatedIndicatorDisplayTime} from './indicator-rendering';
import {anchoredResets,ANCHOR_RESET_POLICY,SEGMENT_BREAK_COLOR,appendIndicatorEndpointPresentation,indicatorDecorationId,INDICATOR_TRACKING_POLICY,renderIndicatorPresentation,validateIndicatorPresentationContext,type IndicatorNativePresentation,type IndicatorPresentationContext} from './indicator-presentation';
import type {IndicatorDisplayPlot} from './indicator-display-source';

/** Opaque internal receipt; its public shape is never publication authority. */
export interface PreparedVwapPresentation {readonly type:'owned-vwap-presentation'}
export interface VwapPresentationConfiguration {readonly settings:IndicatorInstanceSettings;readonly context?:IndicatorPresentationContext}
interface Bindings extends VwapPresentationConfiguration {readonly result:IndicatorResult;readonly bars:readonly Bar[]}
interface Host extends VwapPresentationConfiguration {
 readonly rows:number;
 /** Fresh private materialization arrays, still empty and never exposed to a consumer. */
 readonly bars:Bar[];
 readonly series:IndicatorResult['series'];
 assertCurrent():void;
}
export interface VwapPresentationPreparation {
 /** The run has appended exactly this chunk to its private rows/value arrays. */
 append(start:number,count:number):void;
 complete(result:IndicatorResult):PreparedVwapPresentation;
 retire():void;
}
const receipts=new WeakMap<object,(bindings:Bindings)=>IndicatorNativePresentation>();
export function consumeVwapPresentation(receipt:PreparedVwapPresentation,bindings:Bindings):IndicatorNativePresentation{
 const consume=receipt!==null&&typeof receipt==='object'?receipts.get(receipt):undefined;
 if(!consume)throw Error('VWAP presentation receipt is foreign, retired or already consumed.');
 return consume(bindings);
}
const data=(object:object,key:PropertyKey):unknown=>{const value=Object.getOwnPropertyDescriptor(object,key);if(!value||!Object.hasOwn(value,'value'))throw Error('VWAP presentation requires private data fields.');return value.value;};
function length(array:readonly unknown[]):number{
 if(!Array.isArray(array)||Object.getPrototypeOf(array)!==Array.prototype)throw Error('VWAP presentation requires private ordinary arrays.');
 const count=data(array,'length');if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0)throw Error('VWAP presentation has an invalid array length.');return count;
}

/** Internal only: source/run authority comes from the retained host, not these arrays. */
export function createVwapPresentationPreparation(host:Host):VwapPresentationPreparation{
 const settings=host.settings,rows=host.rows,assertOwner=host.assertCurrent;
 assertOwner();validateIndicatorSettings(settings);validateIndicatorPresentationContext(host.context);
 if(settings.kind!=='vwap'||settings.inputs.kernelVersion!==2||settings.offset!==0)throw Error('Bounded VWAP presentation requires version2 with zero offset.');
 if(!Number.isSafeInteger(rows)||rows<1||rows>VWAP_WORKER_LIMITS.rows)throw Error('VWAP presentation row count is outside its bound.');
 // The empty metadata pass below is never the complete allocation admission.
 assertIndicatorBatchBudget([settings],rows);
 let bars=host.bars,series=host.series;
 if(length(bars)!==0||length(series)<1||length(series)>7)throw Error('VWAP presentation requires fresh private materialization arrays.');
 const hasContext=host.context!==undefined,resolution=host.context?.resolution;
 const plots=series.map(plot=>{
  if(!plot||typeof plot!=='object')throw Error('Invalid VWAP presentation plot.');
  const id=data(plot,'id'),label=data(plot,'label'),values=data(plot,'values');
  if(typeof id!=='string'||typeof label!=='string'||label.length>128||!Array.isArray(values)||length(values)!==0)throw Error('Invalid VWAP presentation plot.');
  return {plot,id,label,values:values as Array<number|null>};
 });
 const empty:IndicatorResult={id:'vwap',series:plots.map(plot=>({id:plot.id,label:plot.label,values:[]})),diagnostics:[],policies:[]};
 let prepared:IndicatorNativePresentation|undefined=renderIndicatorPresentation(settings,empty,[],host.context);
 let native=prepared.output.series as LineLikeSeries[];const destinations:Array<{source:number;points:LineLikeSeries['points']}>=[];
 // Hidden output has no point work, matching the generic builder's early return.
 if(native.length){
  for(let index=0;index<plots.length;index++)destinations.push({source:index,points:native[index].points});
  for(const [id,fill]of Object.entries(settings.presentation?.fills??{})){
   if(!fill?.visible)continue;
   const from=plots.findIndex(plot=>plot.id==='lower'+id.at(-1)),to=plots.findIndex(plot=>plot.id==='upper'+id.at(-1));
   if(from<0||to<0)continue;
   for(const [ordinal,source]of [from,to].entries()){
    const anchor=native.find(plot=>plot.id===indicatorDecorationId(settings.id,`fill:${id}:${ordinal}`));
    if(!anchor)throw Error('VWAP presentation fill metadata is incomplete.');destinations.push({source,points:anchor.points});
   }
  }
  if(destinations.length!==native.length||native.length>13)throw Error('VWAP presentation has an invalid native point plan.');
 }
 let phase:'building'|'complete'|'consumed'|'retired'='building',busy=false,appended=0,receipt:PreparedVwapPresentation|undefined,boundResult:IndicatorResult|undefined;
 const retired=()=>phase==='retired';
 const dropReferences=()=>{prepared=undefined;boundResult=undefined;destinations.length=0;native=[];bars=[];series=[];plots.length=0;};
 const discard=()=>{phase='retired';if(receipt)receipts.delete(receipt);receipt=undefined;dropReferences();};
 const current=()=>{if(retired())throw Error('VWAP presentation preparation was retired.');assertOwner();if(retired())throw Error('VWAP presentation preparation was retired.');};
 function perform<T>(expected:'building'|'complete',action:()=>T):T{
  if(busy){discard();throw Error('VWAP presentation preparation was reentered.');}
  if(phase!==expected)throw Error('VWAP presentation preparation is not in the required phase.');
  busy=true;try{current();const value=action();current();return value;}catch(error){discard();throw error;}finally{busy=false;}
 }
 const arrays=(count:number)=>{
  if(length(bars)!==count||length(series)!==plots.length)throw Error('VWAP presentation materialization length changed.');
  for(let index=0;index<plots.length;index++){const expected=plots[index];if(data(series,String(index))!==expected.plot||data(expected.plot,'values')!==expected.values||data(expected.plot,'id')!==expected.id||data(expected.plot,'label')!==expected.label||length(expected.values)!==count)throw Error('VWAP presentation materialization identity changed.');}
 };
 const api:VwapPresentationPreparation=Object.freeze({
  append(this:VwapPresentationPreparation,start:number,count:number){
   if(this!==api)throw Error('Foreign VWAP presentation preparation receiver.');
   perform('building',()=>{
    if(!Number.isSafeInteger(start)||start!==appended||!Number.isSafeInteger(count)||count<1||count>VWAP_WORKER_LIMITS.chunkRows||start+count>rows)throw Error('VWAP presentation chunk is outside its exact prefix.');
    arrays(start+count);
    if(destinations.length){
     const values:Array<number|null>=Array(plots.length);
     for(let ordinal=start;ordinal<start+count;ordinal++){
      const row=data(bars,String(ordinal));if(row===null||typeof row!=='object')throw Error('VWAP presentation row is unavailable.');
      const time=validatedIndicatorDisplayTime(data(row,'time') as number)*1000;
      for(let index=0;index<plots.length;index++){const value=data(plots[index].values,String(ordinal));if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('Invalid numerical plot result.');values[index]=value as number|null;}
      for(const target of destinations)target.points.push({time,value:values[target.source]});
     }
    }
    appended+=count;
   });
  },
  complete(this:VwapPresentationPreparation,result:IndicatorResult){
   if(this!==api)throw Error('Foreign VWAP presentation preparation receiver.');
   return perform('building',()=>{
    if(appended!==rows||data(result,'id')!=='vwap'||data(result,'series')!==series)throw Error('VWAP presentation cannot complete a partial or foreign result.');arrays(rows);
    if(destinations.length){
     const display:IndicatorDisplayPlot[]=[],priceLines=prepared!.output.priceLines as PriceLine[];
     for(let index=0;index<plots.length;index++){
      const plot=plots[index],style=Object.hasOwn(settings.plots,plot.id)?settings.plots[plot.id]:defaultPlotStyle('vwap',plot.id,indicatorPlotIds.vwap.indexOf(plot.id)),point=native[index];
      appendIndicatorEndpointPresentation(settings.id,plot,point,style,data(plot.values,String(rows-1)) as number|null,point.style.color,point.style.color,display,priceLines);
     }
     prepared!.display=Object.freeze(display);
     // Same anchor-reset breaks as the generic builder (renderIndicatorPresentation): no stroke joins two VWAP periods.
     const resets=anchoredResets(settings,bars as readonly Bar[],host.context);
     if(resets){for(let index=0;index<plots.length;index++){const points=native[index].points;for(const i of resets){const a=points[i-1],b=points[i];if(a&&b&&a.value!==null&&b.value!==null)b.color=SEGMENT_BREAK_COLOR;}}prepared!.policies.push(ANCHOR_RESET_POLICY);}
     if(priceLines.some(line=>line.id.includes('track:')))prepared!.policies.push(INDICATOR_TRACKING_POLICY);
    }
    boundResult=result;phase='complete';receipt=Object.freeze({type:'owned-vwap-presentation'});
    receipts.set(receipt,bindings=>perform('complete',()=>{
     validateIndicatorPresentationContext(bindings.context);
     if(bindings.settings!==settings||bindings.result!==boundResult||bindings.bars!==bars||(bindings.context!==undefined)!==hasContext||bindings.context?.resolution!==resolution)throw Error('VWAP presentation receipt bindings changed.');
     arrays(rows);const value=prepared!;receipts.delete(receipt!);receipt=undefined;phase='consumed';dropReferences();return value;
    }));return receipt;
   });
  },
  retire(this:VwapPresentationPreparation){if(this!==api)throw Error('Foreign VWAP presentation preparation receiver.');discard();},
 });
 try{current();return api;}catch(error){discard();throw error;}
}
