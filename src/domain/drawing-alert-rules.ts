// Which conditions each drawing alert takes, and how the alert list names what it watches.
// No runtime dependency on alerts.ts or alert-observation.ts (both import this module).
// Conditions of drawing alerts:
//  - a line (trend line, ray, extended line, horizontal line and ray, trend angle, info line) is compared with a price:
//    Crossing, Crossing up, Crossing down, Greater than, Less than;
//  - a channel (parallel channel, disjoint channel, flat top/bottom, rectangle, the pitchforks) is watched alone:
//    Entering, Exiting, Inside, Outside. The value is the price's place in the channel (0 lower line, 1 upper line), so the
//    saved bounds are always 0 and 1;
//  - a vertical line is watched alone: Crossing (or Crossing up) 0, the bar time reaching the line.
//  - a Fib channel's levels (shape 'levels') are watched alone with the active level crossing condition,
//    whose frozen levels are the drawing's enabled ratios (alert-levels.ts captureFibChannelLevels).
import type {AlertCondition} from './alerts';
import type {AlertSourceSnapshot,AlertScalarSource} from './alert-observation';
import {DRAWING_ALERT_TOOL_NAMES,type DrawingAlertShapeKind} from '../chart/drawing-alert-shapes';

export const CHANNEL_ALERT_KINDS=Object.freeze(['entering','exiting','inside','outside'] as const);
export const TIME_ALERT_KINDS=Object.freeze(['crossing-up','crossing'] as const);
export const LINE_ALERT_KINDS=Object.freeze(['crossing','crossing-up','crossing-down','greater','less'] as const);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** The shape a version 2 drawing source watches; null for every other source (including version 1 drawing geometry). */
export function drawingSourceShape(source:AlertScalarSource|AlertSourceSnapshot|undefined|null):DrawingAlertShapeKind|null{
 if(!record(source)||source.kind!=='drawing-boundary')return null;
 const geometry=(source as {geometry?:unknown}).geometry;
 return record(geometry)&&geometry.schemaVersion===2&&typeof geometry.shape==='string'?geometry.shape as DrawingAlertShapeKind:null;
}
/** The drawing operand of a source (itself, or either side of a comparison). */
export function drawingOperand(source:AlertSourceSnapshot|undefined|null):Extract<AlertScalarSource,{kind:'drawing-boundary'|'drawing'}>|null{
 if(!record(source))return null;
 if(source.kind==='comparison')return [source.right,source.left].find(side=>side?.kind==='drawing-boundary'||side?.kind==='drawing') as Extract<AlertScalarSource,{kind:'drawing-boundary'|'drawing'}>|undefined??null;
 return source.kind==='drawing-boundary'||source.kind==='drawing'?source:null;
}
/** Comparison operands: a channel or vertical line is never one side of a two-source comparison. */
export function drawingComparisonError(left:unknown,right:unknown):string|null{
 const shapes=[left,right].map(side=>drawingSourceShape(side as AlertScalarSource));
 return shapes.some(shape=>shape==='channel'||shape==='time'||shape==='levels')?'A channel or vertical line alert watches the drawing alone, not compared with another source.':null;
}
/** The condition rule of a drawing source, or null when the condition is allowed (or the source is not a version 2 drawing). */
export function drawingConditionError(source:AlertSourceSnapshot|undefined,condition:AlertCondition):string|null{
 const shape=drawingSourceShape(source);
 if(shape==='channel'&&(!(CHANNEL_ALERT_KINDS as readonly string[]).includes(condition.kind)||condition.lower!==0||condition.upper!==1))return 'A channel alert uses Entering, Exiting, Inside or Outside the drawing\'s channel.';
 if(shape==='time'&&(!(TIME_ALERT_KINDS as readonly string[]).includes(condition.kind)||condition.value!==0))return 'A vertical line alert fires when the bar time reaches the line.';
 if(shape==='levels'&&(condition.kind!=='level-crossing'||condition.levels?.tool!=='fibchannel'||condition.levels.drawingId!==drawingOperand(source)?.instanceId))return "A Fib channel level alert uses the active level crossing of that drawing's levels.";
 if(shape!=='levels'&&condition.kind==='level-crossing'&&condition.levels?.tool==='fibchannel')return "Fib channel level crossing needs the Fib channel's levels as its source.";
 return null;
}
/** The display name of the drawing a source watches (the name kept at creation, else the tool name). Null: not a drawing. */
export function drawingSourceName(source:AlertSourceSnapshot|undefined|null):string|null{
 const operand=drawingOperand(source);if(!operand)return null;
 if(operand.kind==='drawing')return DRAWING_ALERT_TOOL_NAMES[operand.tool]??'Drawing';
 const geometry=operand.geometry as {schemaVersion:number;tool:string;name?:string};
 return geometry.schemaVersion===2&&typeof geometry.name==='string'&&geometry.name?geometry.name:DRAWING_ALERT_TOOL_NAMES[geometry.tool]??'Drawing';
}
const CONDITION_WORDS:Readonly<Record<string,string>>=Object.freeze({crossing:'Crossing','crossing-up':'Crossing up','crossing-down':'Crossing down',greater:'Greater than',less:'Less than',entering:'Entering',exiting:'Exiting',inside:'Inside',outside:'Outside'});
/** How the alert list says a drawing alert's condition, for example "Crossing Trend line", "Entering Parallel channel",
 * "Reaching Vertical line". Null for an alert that does not watch a drawing (the caller keeps its own text). */
export function drawingConditionText(source:AlertSourceSnapshot|undefined|null,condition:AlertCondition):string|null{
 const name=drawingSourceName(source);if(name===null)return null;
 const shape=drawingSourceShape(drawingOperand(source));
 if(shape==='time')return `Reaching ${name}`;
 const word=CONDITION_WORDS[condition.kind];
 return word?`${word} ${name}`:null;
}
export interface DrawingDraftFields {name:string;kind:string;value:string;lower:string;upper:string}
/** The alert form preset for a drawing source: a condition the shape takes (only an incompatible one is replaced), the fixed
 * channel bounds or time level, and the default name "<symbol> <drawing> alert" while the name is still a default one.
 * Returns the same draft when nothing changes. */
export function drawingAlertDraft<T extends DrawingDraftFields>(draft:T,options:{shape:DrawingAlertShapeKind|null|undefined;symbol:string;name:string|null;previousName:string|null}):T{
 let next=draft;
 const patch=(fields:Partial<DrawingDraftFields>)=>{if(Object.entries(fields).some(([key,value])=>(next as unknown as Record<string,unknown>)[key]!==value))next={...next,...fields} as T;};
 if(options.shape==='channel'){if(!(CHANNEL_ALERT_KINDS as readonly string[]).includes(next.kind))patch({kind:'entering'});patch({lower:'0',upper:'1'});}
 else if(options.shape==='time')patch({kind:'crossing-up',value:'0'});
 else if(options.shape==='line'&&!(LINE_ALERT_KINDS as readonly string[]).includes(next.kind))patch({kind:'crossing-up'});
 const plainName=`${options.symbol} price alert`,previous=options.previousName?`${options.symbol} ${options.previousName} alert`:null;
 if(options.name&&(next.name===plainName||next.name===previous))patch({name:`${options.symbol} ${options.name} alert`});
 else if(!options.name&&previous&&next.name===previous)patch({name:plainName});
 return next;
}
