/** Drawing edit bar placed near a drawing: the renderer's time-to-x mapping, in client pixels.
 * `coords` is the pinned renderer's CoordinateSystem (logical bar axis, times in ms); `time` is Unix seconds. Times between,
 * before or after the loaded bars map along the bar cadence like the renderer's own drawing projection. Null when the geometry
 * is unreadable, no bars are loaded, the time is not finite, or the chart type has no time axis (derived styles). */
export interface TimeAxisCoords {barCount:number;timeToLogical?:(ms:number)=>number;logicalToX?:(logical:number)=>number}
export function timeToClientX(coords:TimeAxisCoords|null|undefined,clientLeft:number,time:number,timeAxis:boolean):number|null{
 if(!timeAxis||!Number.isFinite(time)||!Number.isFinite(clientLeft)||!coords||!coords.barCount||typeof coords.timeToLogical!=='function'||typeof coords.logicalToX!=='function')return null;
 const x=coords.logicalToX(coords.timeToLogical(time*1000));
 return Number.isFinite(x)?clientLeft+x:null;
}
