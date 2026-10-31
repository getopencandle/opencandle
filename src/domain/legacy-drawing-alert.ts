// The older 'drawing' alert kind, evaluated from the drawing saved in the workspace.
// The alert keeps the drawing's tool and anchors as they were when it was made (alert-observation.ts, 'signed-price-distance').
// The saved workspace supplies the rest of the shape (the trend line extension flags, the pane), and proves the drawing was
// not moved since: a moved, retyped or deleted drawing gives no value, never a guess. The value is the endpoint close minus
// the line's price at that bar's time, so crossing 0 is the close crossing the line.
// The line is straight in time and price ('linear-time-price') or in time and log price ('linear-time-log-price'),
// as the saved contract says; a ray starts at its first anchor; an unextended trend line exists only between its anchors.
import type {AlertScalarSource} from './alert-observation';

type LegacyDrawing=Extract<AlertScalarSource,{kind:'drawing'}>;
export interface LegacyDrawingValue {value:number|null;diagnostics:string[]}
const TOOLS=new Set(['hline','hray','trendline','ray','extendedline']);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

export function legacyDrawingDistance(source:LegacyDrawing,drawings:readonly unknown[]|null|undefined,time:number,close:number):LegacyDrawingValue{
 const refuse=(message:string):LegacyDrawingValue=>({value:null,diagnostics:[message]});
 if(!drawings)return refuse('This drawing alert needs its drawing from the saved workspace, which is not available here.');
 if(!TOOLS.has(source.tool))return refuse(`A ${source.tool} drawing has no single price line to compare with.`);
 const saved=drawings.find(row=>record(row)&&String(row.id)===source.instanceId);
 if(!record(saved))return refuse('The drawing this alert watches is no longer in the saved workspace.');
 if(saved.type!==source.tool)return refuse('The saved drawing is no longer the kind of line this alert was made on.');
 if(saved.paneId!==undefined&&saved.paneId!=='price')return refuse('The saved drawing is not on the price pane.');
 const anchors=Array.isArray(saved.anchors)?saved.anchors:[];
 const count=source.tool==='hline'||source.tool==='hray'?1:2;
 if(source.anchors.length!==count||anchors.length!==count)return refuse('The saved drawing anchor count does not match the alert.');
 for(let index=0;index<count;index++){
  const point=anchors[index],frozen=source.anchors[index];
  // Saved drawing anchors are in milliseconds; the alert keeps Unix seconds.
  if(!record(point)||point.time!==frozen.time*1000||point.price!==frozen.price)return refuse('The drawing moved after the alert was made. Make the alert again from the drawing.');
 }
 const style=record(saved.style)?saved.style:{},flag=(key:string)=>typeof source.settings[key]==='boolean'?source.settings[key] as boolean:style[key]===true;
 const [first,second]=source.anchors,log=source.coordinateModel==='linear-time-log-price';
 if(!Number.isFinite(time)||!Number.isFinite(close))return refuse('The endpoint bar has no usable close.');
 let price=first.price;
 if(second){
  if(first.time===second.time)return refuse('A vertical line has no single price.');
  const low=Math.min(first.time,second.time),high=Math.max(first.time,second.time);
  if(source.tool==='ray'&&time<low)return refuse('This bar is before the start of the ray.');
  if(source.tool==='trendline'&&(!flag('extendLeft')&&time<low||!flag('extendRight')&&time>high))return refuse('This bar is outside the trend line.');
  const share=(time-first.time)/(second.time-first.time);
  price=log?Math.exp(Math.log(first.price)+share*(Math.log(second.price)-Math.log(first.price))):first.price+share*(second.price-first.price);
 }else if(source.tool==='hray'&&time<first.time)return refuse('This bar is before the start of the ray.');
 const value=close-price;
 return Number.isFinite(value)?{value,diagnostics:[]}:refuse('The line price is not a finite number at this bar.');
}
