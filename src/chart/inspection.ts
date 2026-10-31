import type {CrosshairEvent} from '@luxalgo/vela';
import type {Bar} from '../domain/types';
/** Normalize renderer milliseconds at the boundary; never reinterpret a study value as a price. */
export function normalizedCrosshair(event:CrosshairEvent){return {time:event.time===null?null:event.time/1000,price:event.price,paneKind:event.paneKind??null,values:new Map(event.values),ohlc:event.ohlc?{...event.ohlc,time:event.ohlc.time/1000}:null};}
export function inspectedBar(bars:readonly Bar[],hoveredSeconds:number|null){
 const index=hoveredSeconds===null?bars.length-1:bars.findIndex(bar=>bar.time===hoveredSeconds);
 return {index,bar:index>=0?structuredClone(bars[index]):null,hovered:hoveredSeconds!==null&&index>=0};
}
export function centeredDateRange(fromSeconds:number,toSeconds:number,targetSeconds:number){if(![fromSeconds,toSeconds,targetSeconds].every(Number.isFinite)||toSeconds<=fromSeconds)throw new Error('Navigation requires finite increasing boundaries');const half=(toSeconds-fromSeconds)/2;return {from:targetSeconds-half,to:targetSeconds+half};}
export function validateViewport(range:{from:number;to:number}){if(!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.to<=range.from)throw new Error('Saved viewport requires finite increasing Unix-second boundaries');}
