import type {Bar} from '../domain/types';
import {heikinAshiBars} from './calculation-bars';
import type {PriceScaleMode} from './navigation';
import {validateChartSourceBasisIdentity,type ChartSourceContext} from './source-context';
import {TIME_AXIS_STYLES} from './chart-types';
import {captureDrawingAlertShape,evaluateDrawingAlertShape,validateDrawingAlertShape,type DrawingAlertCaptureOptions,type DrawingAlertShapeCapture,type DrawingAlertShapeSnapshot} from './drawing-alert-shapes';

export type DrawingBoundaryTool='hline'|'hray'|'trendline'|'ray'|'extendedline';
/** A saved drawing alert geometry is version 1 (below, kept exactly for alerts saved with it) or version 2
 * (drawing-alert-shapes.ts: channels, the vertical line, the log scale and the drawing name). New captures are version 2. */
export type DrawingBoundarySnapshot=DrawingBoundarySnapshotV1|DrawingAlertShapeSnapshot;
export interface DrawingBoundarySnapshotV1 {schemaVersion:1;drawingId:string;tool:DrawingBoundaryTool;paneId:'price';coordinateModel:'logical-bar-linear-price';sourceBasis:string;sourceRevision:string;transform:string;gridOrigin:number;capturedRows:number;anchors:ReadonlyArray<{time:number;price:number;logical:number}>;domain:{min:number|null;max:number|null};geometryFingerprint:string}
export type DrawingBoundaryCapture={ok:true;snapshot:DrawingBoundarySnapshotV1}|{ok:false;diagnostics:string[]};
export type DrawingBoundaryValue={ok:true;boundaryPrice:number}|{ok:false;diagnostics:string[]};
const tools=new Set<string>(['hline','hray','trendline','ray','extendedline']);
const domainTime=(value:number)=>Number.isFinite(value)&&value>=-62135596800&&value<=253402300799;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&!Object.values(Object.getOwnPropertyDescriptors(value)).some(field=>field.get||field.set);}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]):boolean{return Reflect.ownKeys(value).length===keys.length&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&keys.includes(key)&&Object.getOwnPropertyDescriptor(value,key)?.enumerable===true);}
function dataArray(value:unknown,limit:number):value is unknown[]{if(!Array.isArray(value)||value.length>limit||Object.getPrototypeOf(value)!==Array.prototype)return false;const fields=Object.getOwnPropertyDescriptors(value);return Reflect.ownKeys(fields).every(key=>typeof key==='string'&&(key==='length'||/^(0|[1-9]\d*)$/.test(key)&&Number(key)<value.length)&&!fields[key].get&&!fields[key].set)&&Object.keys(fields).length===value.length+1;}
function logicalTime(time:number,times:readonly number[]):number{let lo=0,hi=times.length-1;while(hi-lo>1){const middle=(lo+hi)>>1;if(times[middle]<=time)lo=middle;else hi=middle;}return time===times.at(-1)?times.length-1:lo+(time-times[lo])/(times[hi]-times[lo]);}
type DrawingBoundaryContext={source:ChartSourceContext;style:string;scale:PriceScaleMode};
export interface PreparedDrawingBoundaryGrid {readonly origin:number;readonly count:number;readonly sourceBasis:string;readonly sourceRevision:string;readonly transform:string;capture:(value:unknown)=>DrawingBoundaryCapture;logicalPosition:(timeSeconds:number)=>number|null;
 /** Version 2 capture (drawing-alert-shapes.ts) on the same grid, in the scale the grid was prepared for. */
 captureShape:(value:unknown,options?:Partial<DrawingAlertCaptureOptions>)=>DrawingAlertShapeCapture;readonly scale:PriceScaleMode}
/** Validate/copy the common information grid once for a bounded picker/evaluation batch. */
export function prepareDrawingBoundaryGrid(prefix:readonly Bar[],context:DrawingBoundaryContext):{ok:true;grid:PreparedDrawingBoundaryGrid}|{ok:false;diagnostics:string[]}{return prepareGrid(prefix,context,false);}
/** The same grid, also on a logarithmic scale (version 2 captures there are straight in log price; the
 * version 1 capture of such a grid still refuses, as before). */
export function prepareDrawingAlertGrid(prefix:readonly Bar[],context:DrawingBoundaryContext):{ok:true;grid:PreparedDrawingBoundaryGrid}|{ok:false;diagnostics:string[]}{return prepareGrid(prefix,context,true);}
const LOG_REFUSAL='Requested logarithmic drawing geometry is unavailable until its resolved positive native scale is known';
function prepareGrid(prefix:readonly Bar[],context:DrawingBoundaryContext,allowLog:boolean):{ok:true;grid:PreparedDrawingBoundaryGrid}|{ok:false;diagnostics:string[]}{
 try{
  if(!record(context)||!record(context.source))throw new Error('Drawing grid context requires plain metadata');
  if(context.scale==='logarithmic'&&!allowLog)throw new Error(LOG_REFUSAL);
  if(!['linear','percent','indexed',...(allowLog?['logarithmic']:[])].includes(context.scale)||!TIME_AXIS_STYLES.includes(context.style))throw new Error('Unsupported drawing axis or chart topology');
  const sourceBasis=validateChartSourceBasisIdentity(context.source.basisIdentity);if(typeof context.source.revision!=='string'||!context.source.revision||context.source.revision.length>4096)throw new Error('Drawing source revision is required');
  if(!dataArray(prefix,100000)||prefix.length<1)throw new Error('Drawing boundary requires one to 100000 plain supplied rows');
  const fields=['open','high','low','close','volume'] as const,times:number[]=[],preparedRows:Bar[]=[];
  for(const bar of prefix){
   if(!record(bar)||typeof bar.time!=='number'||!domainTime(bar.time)||times.length&&bar.time<=times[times.length-1])throw new Error('Drawing boundary needs an unambiguous increasing supplied time grid within years 0001 through 9999');
   times.push(bar.time);
   // Own primitive snapshots bind regression prices to this preparation, without retaining caller row aliases.
   const own=(key:typeof fields[number])=>{const value=Object.getOwnPropertyDescriptor(bar,key)?.value;return typeof value==='number'?value:undefined;};
   preparedRows.push(Object.freeze({time:bar.time,open:own('open'),high:own('high'),low:own('low'),close:own('close'),volume:own('volume')}) as Bar);
  }
  const observedPrefix:readonly Bar[]=Object.freeze(preparedRows);
  const sourceRevision=context.source.revision,transform=context.style==='heikinashi'?'heikinashi':'standard',scale=context.scale;
  const logicalPosition=(time:number)=>!domainTime(time)||time<times[0]||time>times[times.length-1]?null:times.length===1?0:logicalTime(time,times);
  // Version 2 places an anchor after the last bar as the renderer paints it (@luxalgo/vela barTimeToLogical:
  // the last index plus the time past the last bar over the median bar interval). Before the first bar stays unavailable.
  const diffs:number[]=[];for(let index=1;index<times.length;index++){const step=times[index]-times[index-1];if(step>0)diffs.push(step);}diffs.sort((a,b)=>a-b);
  const interval=diffs.length?diffs[Math.floor(diffs.length/2)]:0,last=times[times.length-1];
  const alertPosition=(time:number)=>domainTime(time)&&time>last?(interval>0?times.length-1+(time-last)/interval:null):logicalPosition(time);
  const grid:PreparedDrawingBoundaryGrid=Object.freeze({origin:times[0],count:times.length,sourceBasis,sourceRevision,transform,scale,logicalPosition,
   capture:(value:unknown):DrawingBoundaryCapture=>scale==='logarithmic'?{ok:false,diagnostics:[LOG_REFUSAL]}:captureWithGrid(value,times,{sourceBasis,sourceRevision,transform}),
   captureShape:(value:unknown,options:Partial<DrawingAlertCaptureOptions>={})=>{
    let observedBars:readonly Bar[]|undefined;const calculationTransform=record(value)&&value.type==='regressionchannel'?options.calculationTransform??transform:transform;
    if(record(value)&&value.type==='regressionchannel'){
     if(calculationTransform!=='standard'&&calculationTransform!=='heikinashi')return {ok:false as const,diagnostics:['Regression trend calculation transform is unavailable.']};
     try{
      for(let index=0;index<times.length;index++){
       const entry=Object.getOwnPropertyDescriptor(prefix,String(index));if(!entry||!Object.hasOwn(entry,'value')||!record(entry.value))throw new Error('Regression trend observed prefix changed before capture.');
       const row=entry.value,own=(key:string)=>Object.getOwnPropertyDescriptor(row,key)?.value;
       if(own('time')!==times[index])throw new Error('Regression trend observed time grid changed before capture.');
       if(fields.some(key=>!Object.is(own(key),observedPrefix[index][key])))throw new Error('Regression trend observed prices changed after grid preparation. Prepare the corrected input again.');
      }
      observedBars=calculationTransform==='heikinashi'?heikinAshiBars(observedPrefix):observedPrefix;
     }
     catch(error){return {ok:false as const,diagnostics:[error instanceof Error?error.message:String(error)]};}
    }
    return captureDrawingAlertShape(value,{origin:times[0],count:times.length,sourceBasis,sourceRevision,transform:calculationTransform,logicalPosition:alertPosition},{...options,observedBars,scale:options.scale??scale});
   }});
  return{ok:true,grid};
 }catch(error){return{ok:false,diagnostics:[error instanceof Error?error.message:String(error)]};}
}
/** Serialized SDK anchor times are milliseconds; domain prefix times are Unix seconds. */
export function captureDrawingBoundary(value:unknown,prefix:readonly Bar[],context:DrawingBoundaryContext):DrawingBoundaryCapture{const prepared=prepareDrawingBoundaryGrid(prefix,context);return prepared.ok?prepared.grid.capture(value):prepared;}
function captureWithGrid(value:unknown,times:readonly number[],context:{sourceBasis:string;sourceRevision:string;transform:string}):DrawingBoundaryCapture{
 try{
  if(!record(value)||typeof value.id!=='string'||!value.id.length||value.id.length>200||typeof value.type!=='string'||!tools.has(value.type))throw new Error('This drawing has no supported scalar boundary');
  if(value.paneId!=='price')throw new Error('Drawing boundaries currently require the main price pane');
  const tool=value.type as DrawingBoundaryTool,count=tool==='hline'||tool==='hray'?1:2;if(!dataArray(value.anchors,2)||value.anchors.length!==count)throw new Error('Drawing boundary anchor count is invalid');
  const anchors=value.anchors.map(anchor=>{if(!record(anchor)||typeof anchor.time!=='number'||typeof anchor.price!=='number'||!Number.isFinite(anchor.time)||!Number.isFinite(anchor.price))throw new Error('Drawing boundary anchors require finite time and price');const time=anchor.time/1000;if(time<times[0]||time>times[times.length-1])throw new Error('Drawing anchors outside the supplied information prefix are unavailable');return {time,price:anchor.price,logical:times.length===1?0:logicalTime(time,times)};});
  if(count===2&&anchors[0].logical===anchors[1].logical)throw new Error('Vertical or equal-time lines do not have a single price boundary');
  let min:number|null=null,max:number|null=null;
  if(tool==='hray')min=anchors[0].logical;
  // A ray runs from its first point in the drawn direction (0.8.1): drawn right to left, its domain is unbounded on the left.
  if(tool==='ray'){if(anchors[1].logical<anchors[0].logical)max=anchors[0].logical;else min=anchors[0].logical;}
  if(tool==='trendline'){if(value.style!==undefined&&!record(value.style))throw new Error('Invalid drawing extension settings');const style=(value.style??{}) as Record<string,unknown>;for(const field of ['extendLeft','extendRight'])if(style[field]!==undefined&&typeof style[field]!=='boolean')throw new Error('Invalid drawing extension flag');min=style.extendLeft?null:Math.min(...anchors.map(anchor=>anchor.logical));max=style.extendRight?null:Math.max(...anchors.map(anchor=>anchor.logical));}
  const geometryFingerprint=JSON.stringify([1,tool,anchors,min,max,'logical-bar-linear-price']);const snapshot:DrawingBoundarySnapshotV1={schemaVersion:1,drawingId:value.id,tool,paneId:'price',coordinateModel:'logical-bar-linear-price',sourceBasis:context.sourceBasis,sourceRevision:context.sourceRevision,transform:context.transform,gridOrigin:times[0],capturedRows:times.length,anchors:Object.freeze(anchors.map(anchor=>Object.freeze(anchor))),domain:Object.freeze({min,max}),geometryFingerprint};
  return {ok:true,snapshot:Object.freeze(snapshot)};
 }catch(error){return{ok:false,diagnostics:[error instanceof Error?error.message:String(error)]};}
}
/** Observation logical position is supplied by the prefix-gated alert adapter, not wall-clock time. */
export function evaluateDrawingBoundary(snapshot:DrawingBoundarySnapshot,logicalIndex:number):DrawingBoundaryValue{
 try{snapshot=validateDrawingBoundarySnapshot(snapshot);}catch(error){return{ok:false,diagnostics:[error instanceof Error?error.message:String(error)]};}
 // A version 2 line gives its price; a channel or vertical line has no single price boundary.
 if(snapshot.schemaVersion===2){if(snapshot.shape!=='line')return{ok:false,diagnostics:['This drawing has no single price boundary']};const value=evaluateDrawingAlertShape(snapshot,logicalIndex);return value.ok&&value.shape==='line'?{ok:true,boundaryPrice:value.price}:{ok:false,diagnostics:value.ok?['Unsupported drawing boundary snapshot']:value.diagnostics};}
 if(!Number.isFinite(logicalIndex))return{ok:false,diagnostics:['Drawing observation position must be finite']};
 if(snapshot.schemaVersion!==1||snapshot.coordinateModel!=='logical-bar-linear-price'||!tools.has(snapshot.tool))return{ok:false,diagnostics:['Unsupported drawing boundary snapshot']};
 if(snapshot.domain.min!==null&&logicalIndex<snapshot.domain.min||snapshot.domain.max!==null&&logicalIndex>snapshot.domain.max)return{ok:false,diagnostics:['This bar is outside the drawing\'s time span.']};
 const [first,second]=snapshot.anchors;if(!first||!Number.isFinite(first.price)||!Number.isFinite(first.logical))return{ok:false,diagnostics:['Invalid drawing boundary anchor']};
 const boundaryPrice=second?first.price+(logicalIndex-first.logical)*(second.price-first.price)/(second.logical-first.logical):first.price;
 return Number.isFinite(boundaryPrice)?{ok:true,boundaryPrice}:{ok:false,diagnostics:['Drawing boundary interpolation is unavailable']};
}
/** Validate persisted geometry independently from a mutable SDK object or chart. */
export function validateDrawingBoundarySnapshot(value:unknown):DrawingBoundarySnapshot{
 if(record(value)&&value.schemaVersion===2)return validateDrawingAlertShape(value);
 if(!record(value)||!exactKeys(value,['schemaVersion','drawingId','tool','paneId','coordinateModel','sourceBasis','sourceRevision','transform','gridOrigin','capturedRows','anchors','domain','geometryFingerprint'])||value.schemaVersion!==1||value.paneId!=='price'||value.coordinateModel!=='logical-bar-linear-price'||typeof value.tool!=='string'||!tools.has(value.tool)||typeof value.drawingId!=='string'||!value.drawingId||value.drawingId.length>200||typeof value.sourceRevision!=='string'||!value.sourceRevision||value.sourceRevision.length>4096||typeof value.transform!=='string'||!['standard','heikinashi'].includes(value.transform)||typeof value.gridOrigin!=='number'||!domainTime(value.gridOrigin)||!Number.isInteger(value.capturedRows)||Number(value.capturedRows)<1||Number(value.capturedRows)>100000||!record(value.domain)||!exactKeys(value.domain,['min','max']))throw new Error('Invalid drawing boundary snapshot');
 validateChartSourceBasisIdentity(value.sourceBasis);
 const count=value.tool==='hline'||value.tool==='hray'?1:2;if(!dataArray(value.anchors,2)||value.anchors.length!==count)throw new Error('Invalid saved drawing anchors');
 for(const anchor of value.anchors)if(!record(anchor)||!exactKeys(anchor,['time','price','logical'])||!['time','price','logical'].every(field=>typeof anchor[field]==='number'&&Number.isFinite(anchor[field]))||(anchor.logical as number)<0||(anchor.logical as number)>Number(value.capturedRows)-1||!domainTime(anchor.time as number)||(anchor.time as number)<value.gridOrigin||((anchor.logical===0)!==(anchor.time===value.gridOrigin)))throw new Error('Invalid saved drawing anchor coordinate');
 const anchors=value.anchors as Array<{time:number;price:number;logical:number}>;if(count===2&&(anchors[0].logical===anchors[1].logical||(anchors[0].time-anchors[1].time)*(anchors[0].logical-anchors[1].logical)<=0))throw new Error('Vertical or inconsistent saved drawing boundary is unavailable');
 const low=Math.min(...anchors.map(anchor=>anchor.logical)),high=Math.max(...anchors.map(anchor=>anchor.logical)),{min,max}=value.domain;
 if(value.tool==='hline'||value.tool==='extendedline'){if(min!==null||max!==null)throw new Error('Invalid unbounded drawing domain');}else if(value.tool==='hray'){if(min!==low||max!==null)throw new Error('Invalid ray drawing domain');}else if(value.tool==='ray'){const leftward=anchors[1].logical<anchors[0].logical;if(leftward?min!==null||max!==high:min!==low||max!==null)throw new Error('Invalid ray drawing domain');}else if(min!==null&&min!==low||max!==null&&max!==high)throw new Error('Invalid trend line domain');
 if(value.geometryFingerprint!==JSON.stringify([1,value.tool,anchors,min,max,'logical-bar-linear-price']))throw new Error('Drawing geometry fingerprint mismatch');
 return value as unknown as DrawingBoundarySnapshotV1;
}
