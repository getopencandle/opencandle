// Alert geometry of the drawing shapes, schema version 2.
// Version 1 (drawing-alert-geometry.ts) stays exactly as it was for the alerts saved with it. Version 2 adds:
//  - more line tools: trend angle and info line (a segment, like the trend line);
//  - channels: parallel channel, disjoint channel, flat top/bottom, rectangle, pitchfork, Schiff, modified Schiff and inside
//    pitchfork. A channel alert reads where the price is between the two outer lines (0 on the lower line, 1 on the upper line),
//    so Entering, Exiting, Inside and Outside use the fixed bounds 0 and 1 whatever the slope;
//  - the vertical line, whose alert is the bar time reaching the line (: the value is the endpoint bar time minus the
//    line time in seconds, so Crossing up 0 is the first bar at or after the line);
//  - the logarithmic price scale: a line drawn on a log scale is straight in log price ('logical-bar-log-price'), as it is
//    painted there;
//  - the drawing's display name (its own name when renamed, else the tool name), kept so the alert list can say what it watches.
// Also inside version 2:
//  - Arrow (a segment, like the trend line) and Cross line (its horizontal price, like the horizontal line);
//  - Fib channel, two ways. As a channel (shape 'channel'): between its outermost enabled levels, so Entering, Exiting, Inside and
//    Outside work as for the other channels. As levels (shape 'levels'): its lines are the
//    ratio 0 line (p1 to p2) and the ratio 1 line (shifted by the offset anchor), and the alert value is the price's Fib ratio
//    in the channel, so crossing any enabled level is crossing that ratio. Each level line is the renderer's: p1 -> p2 shifted
//    by ratio * (offset - p1) in the drawn coordinates (log price on a log scale), extended left/right by props.lvFibChannel.
// Every shape is built the way the renderer paints it (@luxalgo/vela 0.8.4 geometry): x is the logical bar position, a ray and a
// pitchfork tine run right from the left end of their two points, the parallel channel and flat top/bottom span their base line
// only (their third anchor sets a price), and the disjoint channel exists where both of its lines do.
import type {Bar} from '../domain/types';
import {fitRegressionAlert} from './regression-alert-fit';
import {readBoxExtend} from './box-extend-data';
import {readChannelLevels} from './channel-levels-data';
import {readFibChannelAlert} from './fib-channel-alert-data';
import {validateChartSourceBasisIdentity} from './source-context';

export const DRAWING_ALERT_LINE_TOOLS=Object.freeze(['trendline','ray','extendedline','hline','hray','trendangle','infoline','arrow','crossline'] as const);
export const DRAWING_ALERT_CHANNEL_TOOLS=Object.freeze(['parallelchannel','disjointchannel','flattopbottom','box','pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork','regressionchannel','fibchannel'] as const);
export const DRAWING_ALERT_TIME_TOOLS=Object.freeze(['vline'] as const);
export type DrawingAlertTool=typeof DRAWING_ALERT_LINE_TOOLS[number]|typeof DRAWING_ALERT_CHANNEL_TOOLS[number]|typeof DRAWING_ALERT_TIME_TOOLS[number];
/** 'levels': a Fib channel's level lines; the value is the price's Fib ratio in the channel. */
export type DrawingAlertShapeKind='line'|'channel'|'time'|'levels';
export type DrawingAlertCoordinateModel='logical-bar-linear-price'|'logical-bar-log-price'|'time';
/** The reference's tool names (the drawing toolbar's labels), used when the drawing has no name of its own. */
export const DRAWING_ALERT_TOOL_NAMES:Readonly<Record<string,string>>=Object.freeze({
 trendline:'Trend line',ray:'Ray',extendedline:'Extended line',hline:'Horizontal line',hray:'Horizontal ray',trendangle:'Trend angle',infoline:'Info line',
 vline:'Vertical line',parallelchannel:'Parallel channel',disjointchannel:'Disjoint channel',flattopbottom:'Flat top/bottom',box:'Rectangle',
 pitchfork:'Pitchfork',schiffpitchfork:'Schiff pitchfork',modifiedschiffpitchfork:'Modified Schiff pitchfork',insidepitchfork:'Inside pitchfork',
 regressionchannel:'Regression trend',fibretracement:'Fib retracement',position:'Long/Short position',
 arrow:'Arrow',crossline:'Cross line',fibchannel:'Fib channel',
});
export interface DrawingAlertPoint {readonly logical:number;readonly price:number}
/** One straight line: from a point to a point (to null: horizontal through from), on the logical bar domain [min, max] (null: open). */
export interface DrawingAlertLine {readonly from:DrawingAlertPoint;readonly to:DrawingAlertPoint|null;readonly min:number|null;readonly max:number|null}
export interface DrawingAlertShapeSnapshot {
 schemaVersion:2;drawingId:string;tool:DrawingAlertTool;shape:DrawingAlertShapeKind;name:string;paneId:'price';coordinateModel:DrawingAlertCoordinateModel;
 sourceBasis:string;sourceRevision:string;transform:'standard'|'heikinashi';gridOrigin:number;capturedRows:number;
 /** The anchors whose time places the shape (for the whole-bar shift check of a later feed). Prices are as drawn. */
 anchors:ReadonlyArray<{time:number;price:number;logical:number}>;
 lines:ReadonlyArray<DrawingAlertLine>;
 /** Vertical line only: the line time in Unix seconds. */
 lineTime:number|null;
 /** What of the drawing the alert depends on (type, anchors as saved, extension settings): equal keys are the same geometry. */
 drawingKey:string;
 geometryFingerprint:string;
}
export interface DrawingAlertGrid {readonly origin:number;readonly count:number;readonly sourceBasis:string;readonly sourceRevision:string;readonly transform:string;logicalPosition:(timeSeconds:number)=>number|null}
export type DrawingAlertShapeCapture={ok:true;snapshot:DrawingAlertShapeSnapshot}|{ok:false;diagnostics:string[]};
export type DrawingAlertShapeValue=
 | {ok:true;shape:'line';price:number}
 | {ok:true;shape:'channel';lower:number;upper:number}
 /** Fib channel levels: the prices of the ratio 0 and ratio 1 lines at the bar (unsorted). */
 | {ok:true;shape:'levels';zero:number;one:number}
 | {ok:false;diagnostics:string[]};

const LINE=new Set<string>(DRAWING_ALERT_LINE_TOOLS),CHANNEL=new Set<string>(DRAWING_ALERT_CHANNEL_TOOLS),TIME=new Set<string>(DRAWING_ALERT_TIME_TOOLS);
export const isDrawingAlertTool=(type:unknown):type is DrawingAlertTool=>typeof type==='string'&&(LINE.has(type)||CHANNEL.has(type)||TIME.has(type));
export function drawingAlertShapeOf(tool:string):DrawingAlertShapeKind|null{return LINE.has(tool)?'line':CHANNEL.has(tool)?'channel':TIME.has(tool)?'time':null;}
/** The shapes a tool can be captured as: its own, and for the Fib channel also its levels. */
export const drawingAlertShapesOf=(tool:string):DrawingAlertShapeKind[]=>{const own=drawingAlertShapeOf(tool);return own===null?[]:tool==='fibchannel'?[own,'levels']:[own];};
const domainTime=(value:number)=>Number.isFinite(value)&&value>=-62135596800&&value<=253402300799;
function plain(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&!Object.values(Object.getOwnPropertyDescriptors(value)).some(field=>field.get||field.set);}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]):boolean{const own=Reflect.ownKeys(value);return own.length===keys.length&&own.every(key=>typeof key==='string'&&keys.includes(key)&&Object.getOwnPropertyDescriptor(value,key)?.enumerable===true);}
function plainArray(value:unknown,limit:number):value is unknown[]{return Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=limit&&Reflect.ownKeys(value).length===value.length+1&&Object.values(Object.getOwnPropertyDescriptors(value)).every(field=>!field.get&&!field.set);}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** The name the alert shows for a drawing: its own name when it was renamed, else the tool name. */
export function drawingAlertName(record:unknown,labels?:ReadonlyMap<string,string>):string{
 const row=plain(record)?record:{} as Record<string,unknown>,type=typeof row.type==='string'?row.type:'';
 const own=typeof row.lvName==='string'?row.lvName.trim():'';
 const name=own||DRAWING_ALERT_TOOL_NAMES[type]||labels?.get(type)||'Drawing';
 return name.length>100?name.slice(0,100):name;
}
/** Settings that move the alert geometry. Visual settings (colour, width, text, lock, visibility) are left out on purpose. */
function extension(type:string,row:Record<string,unknown>):{left:boolean;right:boolean}|null{
 if(type==='trendline'||type==='trendangle'||type==='infoline'){
  if(row.style!==undefined&&!plain(row.style))throw new Error('Invalid drawing extension settings');
  const style=(row.style??{}) as Record<string,unknown>;
  for(const field of ['extendLeft','extendRight'])if(style[field]!==undefined&&typeof style[field]!=='boolean')throw new Error('Invalid drawing extension flag');
  return {left:style.extendLeft===true,right:style.extendRight===true};
 }
 if(type==='box'){const read=readBoxExtend(row.props);if(read.state==='unavailable')throw new Error(read.message);return {left:read.settings.left,right:read.settings.right};}
 if(type==='parallelchannel'){const read=readChannelLevels(row.props);if(read.state==='unavailable')throw new Error(read.message);return {left:read.settings.extendLeft,right:read.settings.extendRight};}
 if(type==='fibchannel'){const read=readFibChannelAlert(row.props);return {left:read.extendLeft,right:read.extendRight};}
 return null;
}
const ANCHOR_COUNTS:Readonly<Record<string,number>>=Object.freeze({trendline:2,ray:2,extendedline:2,hline:1,hray:1,trendangle:2,infoline:2,vline:1,parallelchannel:3,disjointchannel:4,flattopbottom:3,box:2,pitchfork:3,schiffpitchfork:3,modifiedschiffpitchfork:3,insidepitchfork:3,regressionchannel:2,arrow:2,crossline:1,fibchannel:3});
/** The drawing key: equal keys mean the alert geometry of the drawing did not change. Throws on an unreadable record. */
export function drawingAlertKey(record:unknown):string{
 if(!plain(record)||typeof record.type!=='string'||!isDrawingAlertTool(record.type))throw new Error('This drawing has no supported alert geometry');
 const count=ANCHOR_COUNTS[record.type];
 if(!plainArray(record.anchors,8)||record.anchors.length!==count)throw new Error('Drawing alert anchor count is invalid');
 const anchors=record.anchors.map(anchor=>{if(!plain(anchor)||!finite(anchor.time)||!finite(anchor.price))throw new Error('Drawing alert anchors require finite time and price');return [anchor.time,anchor.price];});
 if(record.type==='regressionchannel')return JSON.stringify([record.type,anchors.map(row=>row[0]).sort((a,b)=>a-b),'close',2,'population residual deviation']);
 // A Fib channel's enabled levels place its outer lines, so they belong to its geometry.
 if(record.type==='fibchannel')return JSON.stringify([record.type,anchors,extension(record.type,record),readFibChannelAlert(record.props).enabledRatios]);
 return JSON.stringify([record.type,anchors,extension(record.type,record)]);
}

function fingerprint(snapshot:Omit<DrawingAlertShapeSnapshot,'geometryFingerprint'>):string{
 return JSON.stringify([2,snapshot.drawingId,snapshot.tool,snapshot.shape,snapshot.name,snapshot.coordinateModel,snapshot.sourceBasis,snapshot.sourceRevision,snapshot.transform,snapshot.gridOrigin,snapshot.capturedRows,snapshot.anchors,snapshot.lines,snapshot.lineTime,snapshot.drawingKey]);
}
const point=(logical:number,price:number):DrawingAlertPoint=>Object.freeze({logical,price});
const line=(from:DrawingAlertPoint,to:DrawingAlertPoint|null,min:number|null,max:number|null):DrawingAlertLine=>Object.freeze({from,to,min,max});

export interface DrawingAlertCaptureOptions {
 /** 'logarithmic' captures in log price: every price must then be positive. Other scales are linear in price. */
 scale:string;
 labels?:ReadonlyMap<string,string>;
 /** The prepared grid's own observed calculation rows. Never stored in an alert snapshot. */
 observedBars?:readonly Bar[];
 /** Saved regression source transform, applied only to this grid's own raw prefix. */
 calculationTransform?:'standard'|'heikinashi';
 /** Capture a Fib channel as its levels ('levels') instead of its outer channel. Other tools refuse it. */
 shape?:DrawingAlertShapeKind;
}
/** Capture one saved drawing record (anchor times in milliseconds) on the supplied information grid. */
export function captureDrawingAlertShape(value:unknown,grid:DrawingAlertGrid,options:DrawingAlertCaptureOptions):DrawingAlertShapeCapture{
 try{
  if(!plain(value)||typeof value.id!=='string'||!value.id.length||value.id.length>200)throw new Error('This drawing has no supported alert geometry');
  if(typeof value.type!=='string'||!isDrawingAlertTool(value.type))throw new Error('This drawing has no supported alert geometry');
  if(value.paneId!==undefined&&value.paneId!=='price')throw new Error('Drawing alerts currently require the main price pane');
  const tool=value.type,shape=options.shape??drawingAlertShapeOf(tool)!,drawingKey=drawingAlertKey(value);
  if(!drawingAlertShapesOf(tool).includes(shape))throw new Error('This drawing has no '+shape+' alert geometry');
  if(drawingKey.length>4096)throw new Error('The drawing is too large for an alert');
  const raw=(value.anchors as Array<{time:number;price:number}>).map(anchor=>({time:anchor.time/1000,price:anchor.price}));
  if(raw.some(anchor=>!domainTime(anchor.time)))throw new Error('Drawing anchors must be within years 0001 through 9999');
  const log=shape!=='time'&&options.scale==='logarithmic';
  const coordinateModel:DrawingAlertCoordinateModel=shape==='time'?'time':log?'logical-bar-log-price':'logical-bar-linear-price';
  if(log&&tool!=='regressionchannel'&&raw.some(anchor=>!(anchor.price>0)))throw new Error('A drawing on a logarithmic scale needs positive prices for an alert');
  const placed:Array<{time:number;price:number;logical:number}>=[];
  const place=(index:number)=>{const anchor=raw[index],logical=grid.logicalPosition(anchor.time);if(logical===null)throw new Error('Drawing anchors outside the supplied information prefix are unavailable');const row={time:anchor.time,price:anchor.price,logical};placed.push(row);return row;};
  const atTime=(time:number)=>{const logical=grid.logicalPosition(time);if(logical===null)throw new Error('Drawing anchors outside the supplied information prefix are unavailable');return logical;};
  const ext=extension(tool,value);
  const lines:DrawingAlertLine[]=[];let lineTime:number|null=null;
  const segment=(a:{logical:number;price:number},b:{logical:number;price:number},kind:'segment'|'ray'|'both')=>{
   if(a.logical===b.logical)throw new Error('Vertical or equal-time lines do not have a single price boundary');
   const low=Math.min(a.logical,b.logical),high=Math.max(a.logical,b.logical);
   const left=kind==='both'||kind==='segment'&&ext?.left===true,right=kind!=='segment'||ext?.right===true;
   return line(point(a.logical,a.price),point(b.logical,b.price),left?null:low,right?null:high);
  };
  // y in the price coordinate the renderer draws in (log price on a log scale), and back.
  const y=(price:number)=>log?Math.log(price):price,price=(value:number)=>log?Math.exp(value):value;
  switch(tool){
   case 'regressionchannel':{
    const bars=options.observedBars;
    if(!Array.isArray(bars)||bars.length!==grid.count)throw new Error('Regression trend requires the observed price prefix of this grid.');
    const fit=fitRegressionAlert(bars,raw[0].time,raw[1].time);
    if(bars[0].time!==grid.origin||Math.min(raw[0].time,raw[1].time)<grid.origin)throw new Error('Earlier fitting history for the Regression trend is unavailable.');
    if(!(fit.halfWidth>0))throw new Error('Regression trend has no residual channel height on these observed bars.');
    const first=atTime(fit.firstTime),last=atTime(fit.lastTime);
    if(first!==fit.firstIndex||last!==fit.lastIndex||last>=grid.count)throw new Error('Regression trend fitting rows do not match this information grid.');
    const low0=fit.startCenter-fit.halfWidth,low1=fit.endCenter-fit.halfWidth,high0=fit.startCenter+fit.halfWidth,high1=fit.endCenter+fit.halfWidth;
    if(![low0,low1,high0,high1].every(finite)||!(high0>low0&&high1>low1))throw new Error('Regression trend channel height is not representable.');
    if(log&&![low0,low1,high0,high1].every(value=>value>0))throw new Error('Regression trend on a logarithmic scale requires positive fitted bands.');
    placed.push({time:fit.firstTime,price:fit.startCenter,logical:first},{time:fit.lastTime,price:fit.endCenter,logical:last});
    lines.push(line(point(first,low0),point(last,low1),first,last),line(point(first,high0),point(last,high1),first,last));break;
   }
   case 'hline':case 'crossline':lines.push(line(point(0,raw[0].price),null,null,null));break;
   case 'hray':{const a=place(0);lines.push(line(point(a.logical,a.price),null,a.logical,null));break;}
   case 'trendline':case 'trendangle':case 'infoline':case 'arrow':lines.push(segment(place(0),place(1),'segment'));break;
   case 'fibchannel':{
    const a=place(0),b=place(1),c=place(2),ratios=readFibChannelAlert(value.props).enabledRatios;
    if(a.logical===b.logical)throw new Error('Vertical or equal-time lines do not have a single price boundary');
    if(!ratios.length)throw new Error('This Fib channel has no active (enabled) level.');
    const dX=c.logical-a.logical,dY=y(c.price)-y(a.price),low=Math.min(a.logical,b.logical),high=Math.max(a.logical,b.logical);
    // Height of the ratio 1 line above the ratio 0 line at any bar (the lines are parallel in the drawn coordinate).
    const slope=(y(b.price)-y(a.price))/(b.logical-a.logical),height=dY-slope*dX;
    if(!finite(height)||!(Math.abs(height)>1e-12))throw new Error('The offset of this Fib channel is on its base line, so it has no height.');
    const at=(ratio:number,min:number|null,max:number|null)=>{const from=point(a.logical+ratio*dX,price(y(a.price)+ratio*dY)),to=point(b.logical+ratio*dX,price(y(b.price)+ratio*dY));if(![from.price,to.price].every(finite)||log&&!(from.price>0&&to.price>0))throw new Error('Fib channel level price is not representable');return line(from,to,min,max);};
    const span=(ratio:number):[number|null,number|null]=>[ext?.left?null:low+ratio*dX,ext?.right?null:high+ratio*dX];
    if(shape==='levels'){
     // The two frame lines span every enabled level: the bar must lie on at least one drawn level line.
     const spans=ratios.map(span),min=spans.some(row=>row[0]===null)?null:Math.min(...spans.map(row=>row[0]!)),max=spans.some(row=>row[1]===null)?null:Math.max(...spans.map(row=>row[1]!));
     lines.push(at(0,min,max),at(1,min,max));break;
    }
    const lowest=Math.min(...ratios),highest=Math.max(...ratios);
    if(lowest===highest)throw new Error('A Fib channel needs two different enabled levels to have an inside.');
    lines.push(at(lowest,...span(lowest)),at(highest,...span(highest)));break;
   }
   case 'ray':lines.push(segment(place(0),place(1),'ray'));break;
   case 'extendedline':lines.push(segment(place(0),place(1),'both'));break;
   case 'vline':lineTime=raw[0].time;break;
   case 'parallelchannel':{
    const a=place(0),b=place(1),offset=raw[2].price-(a.price+b.price)/2;
    if(!finite(offset))throw new Error('Channel price offset overflow');
    const base=segment(a,b,'segment'),shifted={...a,price:a.price+offset},shiftedEnd={...b,price:b.price+offset};
    if(log&&!(shifted.price>0&&shiftedEnd.price>0))throw new Error('A drawing on a logarithmic scale needs positive prices for an alert');
    lines.push(base,line(point(shifted.logical,shifted.price),point(shiftedEnd.logical,shiftedEnd.price),base.min,base.max));break;
   }
   case 'flattopbottom':{const a=place(0),b=place(1),base=segment(a,b,'segment');lines.push(base,line(point(a.logical,raw[2].price),null,base.min,base.max));break;}
   case 'disjointchannel':{
    const top=segment(place(0),place(1),'segment'),bottom=segment(place(2),place(3),'segment');
    const min=Math.max(top.min!,bottom.min!),max=Math.min(top.max!,bottom.max!);
    if(min>max)throw new Error('The two lines of this disjoint channel do not overlap in time');
    lines.push({...top,min,max},{...bottom,min,max});break;
   }
   case 'box':{
    const a=place(0),b=place(1);if(a.logical===b.logical)throw new Error('A rectangle with no width has no inside');
    const min=ext?.left?null:Math.min(a.logical,b.logical),max=ext?.right?null:Math.max(a.logical,b.logical);
    lines.push(line(point(a.logical,a.price),null,min,max),line(point(b.logical,b.price),null,min,max));break;
   }
   case 'pitchfork':case 'schiffpitchfork':case 'modifiedschiffpitchfork':case 'insidepitchfork':{
    const p0=place(0),p1=place(1),p2=place(2);
    // Median origin and direction as the renderer builds them (in its drawn coordinates).
    let sx=p0.logical,sy=y(p0.price),dx:number,dy:number;
    if(tool==='schiffpitchfork')sy=y((p0.price+p1.price)/2);
    if(tool==='modifiedschiffpitchfork'){sx=atTime((p0.time+p1.time)/2);sy=y((p0.price+p1.price)/2);}
    if(tool==='insidepitchfork'){const bx=atTime((p0.time+p1.time)/2),by=y((p0.price+p1.price)/2);dx=p2.logical-bx;dy=y(p2.price)-by;}
    else{const mx=(p1.logical+p2.logical)/2,my=(y(p1.price)+y(p2.price))/2;dx=mx-sx;dy=my-sy;}
    if(!(Math.abs(dx)>1e-9))throw new Error('A pitchfork with a vertical median line has no price channel');
    const tine=(from:{logical:number;price:number})=>{const end=from.logical+dx,endPrice=price(y(from.price)+dy);if(!finite(endPrice)||log&&!(endPrice>0))throw new Error('Pitchfork tine price is not representable');return line(point(from.logical,from.price),point(end,endPrice),Math.min(from.logical,end),null);};
    const upper=tine(p1),lower=tine(p2),min=Math.max(upper.min!,lower.min!);
    lines.push({...upper,min},{...lower,min});break;
   }
  }
  if(lines.some(row=>[row.from.logical,row.from.price,row.to?.logical??0,row.to?.price??0].some(number=>!finite(number))))throw new Error('Drawing alert geometry is not representable');
  const body={schemaVersion:2 as const,drawingId:value.id,tool,shape,name:drawingAlertName(value,options.labels),paneId:'price' as const,coordinateModel,
   sourceBasis:grid.sourceBasis,sourceRevision:grid.sourceRevision,transform:(grid.transform==='heikinashi'?'heikinashi':'standard') as 'standard'|'heikinashi',gridOrigin:grid.origin,capturedRows:grid.count,
   anchors:Object.freeze(placed.map(row=>Object.freeze({...row}))),lines:Object.freeze(lines.map(row=>Object.freeze({...row}))),lineTime,drawingKey};
  return {ok:true,snapshot:Object.freeze({...body,geometryFingerprint:fingerprint(body)})};
 }catch(error){return{ok:false,diagnostics:[error instanceof Error?error.message:String(error)]};}
}

/** The single segment tools. As in the reference, an alert on such a segment follows the line through its two
 * anchors past the drawn ends (the alert keeps working after the segment's last bar); Extend left/right only change the picture. */
export const DRAWING_ALERT_SEGMENT_TOOLS:ReadonlySet<string>=new Set(['trendline','trendangle','infoline','arrow']);
function priceAt(row:DrawingAlertLine,x:number,log:boolean,unbounded=false):number|null{
 if(!unbounded&&(row.min!==null&&x<row.min||row.max!==null&&x>row.max))return null;
 if(!row.to)return row.from.price;
 const share=(x-row.from.logical)/(row.to.logical-row.from.logical);
 const value=log?Math.exp(Math.log(row.from.price)+share*(Math.log(row.to.price)-Math.log(row.from.price))):row.from.price+share*(row.to.price-row.from.price);
 return Number.isFinite(value)?value:null;
}
/** The line price, or the channel's lower and upper line prices, at a logical bar position of the captured grid. */
export function evaluateDrawingAlertShape(snapshot:DrawingAlertShapeSnapshot,logicalIndex:number):DrawingAlertShapeValue{
 if(!Number.isFinite(logicalIndex))return{ok:false,diagnostics:['Drawing observation position must be finite']};
 if(snapshot.shape==='time')return{ok:false,diagnostics:['A vertical line has no price at a bar']};
 if(snapshot.tool==='regressionchannel'&&logicalIndex<snapshot.anchors[1].logical)return{ok:false,diagnostics:['This observation precedes the final bar used to fit the captured Regression trend.']};
 const log=snapshot.coordinateModel==='logical-bar-log-price',prices=snapshot.tool==='regressionchannel'&&logicalIndex===snapshot.anchors[1].logical?snapshot.lines.map(row=>row.to!.price):snapshot.lines.map(row=>priceAt(row,logicalIndex,log,snapshot.shape==='line'&&DRAWING_ALERT_SEGMENT_TOOLS.has(snapshot.tool)));
 if(prices.some(value=>value===null))return{ok:false,diagnostics:[snapshot.shape==='line'?'This bar is before the start of the drawing.':'This bar is outside the drawing\'s time span.']};
 if(snapshot.shape==='line')return{ok:true,shape:'line',price:prices[0]!};
 if(snapshot.shape==='levels')return{ok:true,shape:'levels',zero:prices[0]!,one:prices[1]!};
 const [first,second]=prices as number[];return{ok:true,shape:'channel',lower:Math.min(first,second),upper:Math.max(first,second)};
}

const NAME_LIMIT=100;
/** Validate a persisted version 2 snapshot independently of any chart. */
export function validateDrawingAlertShape(value:unknown):DrawingAlertShapeSnapshot{
 const fail=(message='Invalid drawing alert geometry'):never=>{throw new Error(message);};
 if(!plain(value)||!exactKeys(value,['schemaVersion','drawingId','tool','shape','name','paneId','coordinateModel','sourceBasis','sourceRevision','transform','gridOrigin','capturedRows','anchors','lines','lineTime','drawingKey','geometryFingerprint']))fail();
 const row=value as Record<string,unknown>;
 if(row.schemaVersion!==2||row.paneId!=='price'||typeof row.tool!=='string'||!isDrawingAlertTool(row.tool)||!drawingAlertShapesOf(row.tool).includes(row.shape as DrawingAlertShapeKind))fail();
 if(typeof row.drawingId!=='string'||!row.drawingId||row.drawingId.length>200||typeof row.name!=='string'||!row.name.trim()||row.name.length>NAME_LIMIT)fail();
 if(typeof row.sourceRevision!=='string'||!row.sourceRevision||row.sourceRevision.length>4096||!['standard','heikinashi'].includes(row.transform as string))fail();
 validateChartSourceBasisIdentity(row.sourceBasis);
 if(typeof row.gridOrigin!=='number'||!domainTime(row.gridOrigin)||!Number.isSafeInteger(row.capturedRows)||(row.capturedRows as number)<1||(row.capturedRows as number)>100000)fail();
 if(typeof row.drawingKey!=='string'||!row.drawingKey||row.drawingKey.length>4096)fail();
 const shape=row.shape as DrawingAlertShapeKind,model=row.coordinateModel;
 if(shape==='time'?model!=='time':model!=='logical-bar-linear-price'&&model!=='logical-bar-log-price')fail();
 if(!plainArray(row.anchors,4))fail();
 for(const anchor of row.anchors as unknown[])if(!plain(anchor)||!exactKeys(anchor,['time','price','logical'])||!finite(anchor.time)||!domainTime(anchor.time)||!finite(anchor.price)||!finite(anchor.logical)||anchor.logical<0)fail('Invalid saved drawing anchor coordinate');
 const lineCount=shape==='line'?1:shape==='channel'||shape==='levels'?2:0;
 if(!plainArray(row.lines,2)||(row.lines as unknown[]).length!==lineCount)fail();
 const log=model==='logical-bar-log-price',okPoint=(p:unknown):boolean=>plain(p)&&exactKeys(p,['logical','price'])&&finite(p.logical)&&finite(p.price)&&(!log||p.price>0);
 for(const entry of row.lines as unknown[]){
  if(!plain(entry)||!exactKeys(entry,['from','to','min','max'])||!okPoint(entry.from)||entry.to!==null&&!okPoint(entry.to))fail();
  const item=entry as Record<string,unknown>;
  if(item.min!==null&&!finite(item.min)||item.max!==null&&!finite(item.max)||finite(item.min)&&finite(item.max)&&item.min>item.max)fail();
  if(item.to!==null&&(item.to as DrawingAlertPoint).logical===(item.from as DrawingAlertPoint).logical)fail('Vertical saved drawing boundary is unavailable');
 }
 if(row.tool==='regressionchannel'){
  const anchors=row.anchors as DrawingAlertShapeSnapshot['anchors'],lines=row.lines as DrawingAlertShapeSnapshot['lines'];
  if(anchors.length!==2||!Number.isInteger(anchors[0].logical)||!Number.isInteger(anchors[1].logical)||anchors[0].logical>=anchors[1].logical||anchors[0].time>=anchors[1].time||anchors[1].logical>=(row.capturedRows as number))fail('Invalid Regression trend fitting endpoints');
  for(const boundary of lines)if(!boundary.to||boundary.from.logical!==anchors[0].logical||boundary.to.logical!==anchors[1].logical||boundary.min!==anchors[0].logical||boundary.max!==anchors[1].logical)fail('Invalid Regression trend fitted segment');
  if(!(lines[1].from.price>lines[0].from.price&&lines[1].to!.price>lines[0].to!.price))fail('Invalid Regression trend channel height');
 }
 if(shape==='time'?!finite(row.lineTime)||!domainTime(row.lineTime as number):row.lineTime!==null)fail();
 const snapshot=row as unknown as DrawingAlertShapeSnapshot,{geometryFingerprint,...body}=snapshot;
 if(geometryFingerprint!==fingerprint(body))fail('Drawing geometry fingerprint mismatch');
 return snapshot;
}
