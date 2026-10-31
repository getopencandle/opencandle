import type {DrawingLabel,DrawingLine} from '@luxalgo/vela';
import {AutoTrendMeter,AutoTrendUnavailable,autoTrendRecord,readAutoTrendResultEnvelope,validateAutoTrendScene,type AutoTrendLimits,type AutoTrendUsage} from '../domain/indicators-ext/auto-trendlines-scene';
export interface AutoTrendPresentationOptions {instanceId:string;paneId:string;supportColor:string;resistanceColor:string;width:number;lineStyle:'solid'|'dashed'|'dotted'}
export type AutoTrendPresentation={status:'ready';lines:readonly DrawingLine[];labels:readonly DrawingLabel[];sourceKey:string;asOfIndex:number;usage:AutoTrendUsage}|{status:'unavailable';lines:readonly [];labels:readonly [];diagnostic:string;usage:AutoTrendUsage};
/** Pure original native geometry. Coordinates are logical bars, not timestamp interpolation or DOM projections. */
export function presentAutoTrendlines(value:unknown,options:AutoTrendPresentationOptions,limits:AutoTrendLimits={}):AutoTrendPresentation {
 let meter:AutoTrendMeter;try{meter=new AutoTrendMeter(limits);}catch(error){return{status:'unavailable',lines:[],labels:[],diagnostic:String(error),usage:{operations:0,numericSlots:0,peakNumericSlots:0}};}
 try{
  const result=readAutoTrendResultEnvelope(value,meter);
  meter.work(20);if(result.status!=='ready')throw new AutoTrendUnavailable(result.diagnostic);
  validateAutoTrendScene(result.scene,meter);if(result.usage.numericSlots<48+result.scene.lines.length*30+result.scene.pivots.length*8)throw new AutoTrendUnavailable('Auto trendlines scene has no complete allocation receipt.');autoTrendRecord(options,['instanceId','paneId','supportColor','resistanceColor','width','lineStyle'],meter);
  if(typeof options.instanceId!=='string'||!options.instanceId.length||options.instanceId.length>200||typeof options.paneId!=='string'||options.paneId.length>200||typeof options.supportColor!=='string'||typeof options.resistanceColor!=='string'||!/^#[0-9a-f]{6}$/i.test(options.supportColor)||!/^#[0-9a-f]{6}$/i.test(options.resistanceColor)||!Number.isSafeInteger(options.width)||options.width<1||options.width>4||!['solid','dashed','dotted'].includes(options.lineStyle))throw new AutoTrendUnavailable('Invalid Auto trendlines native style.');
  const lines:DrawingLine[]=[],labels:DrawingLabel[]=[];meter.reserve(result.scene.lines.length*12+result.scene.pivots.length*8);
  // Namespace components are length-prefixed to prevent instance/key delimiter aliases.
  const id=(kind:string,key:string)=>`lv-auto:${options.instanceId.length}:${options.instanceId}:${kind}:${key}`;
  // An unbroken extended line is a ray through its two pivots (extend right), so only the pivot prices feed the pane
  // autoscale: the projection is drawn to the edge but never stretches the price scale. A broken line ends at its breakout.
  for(const line of result.scene.lines){meter.work(112);const extended=line.extended,ray=extended&&line.breakoutIndex===null,end=extended&&!ray?line.endIndex:line.to.index,endPrice=extended&&!ray?line.endPrice:line.to.price;
   lines.push(Object.freeze({id:id('line',line.key),paneId:options.paneId,xloc:'bar_index',x1:line.from.index,y1:line.from.price,x2:end,y2:endPrice,extend:ray?'right':'none',color:line.side==='support'?options.supportColor:options.resistanceColor,invisible:false,width:options.width,style:options.lineStyle,arrowLeft:false,arrowRight:false}));
  }
  for(const pivot of result.scene.pivots){meter.work(96);const support=pivot.side==='support';labels.push(Object.freeze({id:id('pivot',pivot.key),paneId:options.paneId,xloc:'bar_index',x:pivot.index,y:pivot.price,yloc:'price',text:support?'\u25b3':'\u25bd',style:'none',textColor:support?options.supportColor:options.resistanceColor,size:'tiny',textAlign:'center',fontFamily:'default',noFill:true,tooltip:`${support?'Support':'Resistance'} pivot confirmed after ${pivot.confirmedAt-pivot.index} observations.`}));}
  meter.work(24);return Object.freeze({status:'ready',lines:Object.freeze(lines),labels:Object.freeze(labels),sourceKey:result.scene.sourceKey,asOfIndex:result.scene.asOfIndex,usage:meter.usage()});
 }catch(error){return Object.freeze({status:'unavailable',lines:Object.freeze([] as const),labels:Object.freeze([] as const),diagnostic:error instanceof Error?error.message:String(error),usage:meter.usage()});}
}
