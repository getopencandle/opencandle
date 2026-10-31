import type {SerializedDrawing} from '@luxalgo/vela';
import type {Bar} from '../domain/types';
import {isPositionDrawing} from '../domain/position-drawing';
export interface DrawingCoordinateContext{timeCoordinatesAvailable:boolean;diagnostic?:string}
export interface DrawingCoordinateDiagnostic{code:'TIME_GRID_UNAVAILABLE'|'TIME_GRID_INVALID'|'DISPLAY_TOPOLOGY_UNAVAILABLE'|'COORDINATE_SCHEMA_UNAVAILABLE';axis:'time'|'all';message:string}
export interface DrawingEditorAnchor{nativeTime:number;nativePrice:number;timeSeconds:number;price:number;barNumber:number|null;editablePrice:boolean;editableTime:boolean;coordinateDiagnostic:DrawingCoordinateDiagnostic|null}
export interface DrawingCoordinatePatch{barNumber?:number;timeSeconds?:number;price?:number}
export interface DrawingCoordinateDraft{barNumber?:number|null;timeSeconds?:number;price?:number}
/** One price + bar row per anchor for these fixed-count types, every anchor a free point. Ghost feed has a variable anchor count and,
 * like the native polyline, no coordinate rows. */
export const R24_FREE_POINT_COUNTS:Readonly<Record<string,number>>=Object.freeze({lvpitchfan:3,lvcycliclines:2,lvtimecycles:2,lvsineline:2,lvsector:3,lvarrowmarker:2,lvtrianglepattern:4,lvthreedrives:6,lvgannsquarefixed:2,lvpositionforecast:2,lvpin:1,lvtable:1});
export function coordinateAxes(type:string,index:number):{time:boolean;price:boolean}|null{
 if(isPositionDrawing(type))type='position';
 // Rectangle: one price + bar row per stored anchor, 2 anchors.
 // Text has no entry (its Coordinates page is hidden).
 const counts:Record<string,number>={hline:1,vline:1,hray:1,crossline:1,box:2,trendline:2,ray:2,extendedline:2,infoline:2,trendangle:2,fibretracement:2,position:3,parallelchannel:3,arc:3,lvanchoredvp:1,...R24_FREE_POINT_COUNTS};
 if(!Object.hasOwn(counts,type)||index<0||index>=counts[type])return null;
 // Anchored volume profile: one free-x anchor; the profile spans anchor..latest bar and ignores price, so only time is editable.
 if(type==='lvanchoredvp')return{time:true,price:false};
 if(type==='hline')return{time:false,price:index===0};if(type==='vline')return{time:index===0,price:false};
 if(['trendline','ray','extendedline','infoline','trendangle','fibretracement','hray','crossline','position','box'].includes(type)||Object.hasOwn(R24_FREE_POINT_COUNTS,type))return{time:true,price:true};
 if(type==='parallelchannel')return{time:index<2,price:index<2};if(type==='arc')return{time:index<2,price:true};return null;
}
export function assertCoordinateGrid(bars:readonly Bar[]){if(!bars.length)throw Error('Time coordinate requires loaded bars');let previous=-Infinity;for(const bar of bars){if(!Number.isFinite(bar.time)||!Number.isFinite(new Date(bar.time*1000).getTime())||bar.time<=previous)throw Error('Time coordinate requires strictly increasing finite and representable display timestamps');previous=bar.time;}}
function finiteOrdinal(value:number){if(!Number.isFinite(value))throw Error('Time coordinate requires a finite ordinal');return value;}
export function barNumberToTime(bars:readonly Bar[],number:number):number{
 assertCoordinateGrid(bars);if(!Number.isFinite(number))throw Error('Coordinate requires a finite bar number');if(bars.length===1){if(number!==0)throw Error('One loaded bar has no declared extrapolation cadence');return bars[0].time;}
 const low=Math.floor(number),high=Math.ceil(number);const value=low>=0&&high<bars.length?bars[low].time+(bars[high].time-bars[low].time)*(number-low):number<0?bars[0].time+number*(bars[1].time-bars[0].time):bars.at(-1)!.time+(number-bars.length+1)*(bars.at(-1)!.time-bars.at(-2)!.time);
 if(!Number.isFinite(value)||!Number.isFinite(new Date(value*1000).getTime()))throw Error('Coordinate time must be finite and representable');return value;
}
export function timeToBarNumber(bars:readonly Bar[],time:number):number{
 assertCoordinateGrid(bars);if(!Number.isFinite(time))throw Error('Coordinate requires finite time');if(bars.length===1){if(time!==bars[0].time)throw Error('One loaded bar has no declared extrapolation cadence');return 0;}
 if(time<bars[0].time)return finiteOrdinal((time-bars[0].time)/(bars[1].time-bars[0].time));if(time>bars.at(-1)!.time)return finiteOrdinal(bars.length-1+(time-bars.at(-1)!.time)/(bars.at(-1)!.time-bars.at(-2)!.time));
 let low=0,high=bars.length-1;while(low<high){const mid=Math.floor((low+high)/2);if(bars[mid].time<time)low=mid+1;else high=mid;}return finiteOrdinal(bars[low].time===time||low===0?low:low-1+(time-bars[low-1].time)/(bars[low].time-bars[low-1].time));
}
export function editorAnchors(record:SerializedDrawing,bars:readonly Bar[],context?:DrawingCoordinateContext):DrawingEditorAnchor[]{return record.anchors.map((anchor,index)=>{
 const axes=coordinateAxes(record.type,index);let diagnostic:DrawingCoordinateDiagnostic|null=axes?null:{code:'COORDINATE_SCHEMA_UNAVAILABLE',axis:'all',message:'This tool coordinate schema is not independently specified.'},barNumber:number|null=null,editableTime=axes?.time??false;
 if(editableTime&&context?.timeCoordinatesAvailable===false){editableTime=false;diagnostic={code:'DISPLAY_TOPOLOGY_UNAVAILABLE',axis:'time',message:context.diagnostic??'Time coordinates are unavailable for this display topology.'};}
 if(editableTime)try{barNumber=timeToBarNumber(bars,anchor.time/1000);}catch(error){editableTime=false;diagnostic={code:bars.length?'TIME_GRID_INVALID':'TIME_GRID_UNAVAILABLE',axis:'time',message:String(error)};}
 return{nativeTime:anchor.time,nativePrice:anchor.price,timeSeconds:anchor.time/1000,price:anchor.price,barNumber,editablePrice:axes?.price??false,editableTime,coordinateDiagnostic:diagnostic};
 });}
export function validateCoordinatePatch(type:string,index:number,value:DrawingCoordinatePatch){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!['price','barNumber','timeSeconds'].includes(key)||!Object.getOwnPropertyDescriptor(value,key)!.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value')))throw Error('Coordinates require plain sparse supported axis changes');
 if(type==='parallelchannel'&&index===2&&Object.keys(value).length)throw Error('Edit channel level 1 with price offset, not a third coordinate');
 const axes=coordinateAxes(type,index);for(const key of Object.keys(value)){if(!axes||(key==='price'?!axes.price:!axes.time))throw Error('Unsupported coordinate axis for this tool');if(typeof value[key as keyof DrawingCoordinatePatch]!=='number'||!Number.isFinite(value[key as keyof DrawingCoordinatePatch]))throw Error('Coordinate values must be finite numbers');}
 if(Object.hasOwn(value,'barNumber')&&Object.hasOwn(value,'timeSeconds'))throw Error('Choose a bar coordinate or explicit time, not both');
}
