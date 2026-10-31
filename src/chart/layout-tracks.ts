// Divider track sizes for the multi-chart grid. Pure model.
// Tracks are fractions that sum to 1, one entry per grid track, each at least 0.1. An absent `tracks` key means
// equal tracks, which is exactly today's CSS, so every saved grid paints as before. The key lives on the grid
// object next to presetId, never inside LayoutSnapshot, so the strict layout sync key check is untouched.
import {LV_LAYOUTS} from './layout-port';

export const TRACK_FLOOR=0.1;
export const TRACK_TOLERANCE=1e-6;
export const KEYBOARD_STEP=0.05;
export interface LayoutTracks {schemaVersion:1;columns:number[];rows:number[]}
export type TrackAxis='columns'|'rows';
export interface GridTrackHost {presetId:string;tracks?:LayoutTracks}

const round=(value:number)=>Math.round(value*1e6)/1e6;
function preset(id:string){const row=LV_LAYOUTS.find(entry=>entry.id===id);if(!row)throw new Error('Unknown layout preset for tracks.');return row;}
/** Round every entry but the last to 1e-6; the last track is the remainder, so the sum is 1 within rounding. */
function normalize(values:number[]):number[]{
 const head=values.slice(0,-1).map(round);const last=round(1-head.reduce((total,value)=>total+value,0));
 return[...head,last];
}
function equalAxis(count:number):number[]{return normalize(Array.from({length:count},()=>1/count));}
export function equalTracks(presetId:string):LayoutTracks{const spec=preset(presetId);return{schemaVersion:1,columns:equalAxis(spec.columns),rows:equalAxis(spec.rows)};}
const sameAxis=(values:readonly number[],other:readonly number[])=>values.length===other.length&&values.every((value,index)=>Math.abs(value-other[index])<=TRACK_TOLERANCE);
/** A well-formed block whose track counts belong to another preset. An older build that changes the preset keeps the block it was
 * given (its resize spreads the previous grid), so the newer build meets this on load. It is tolerated: treated as absent (equal
 * tracks) and dropped by dropStaleTracks. Malformed blocks stay strict errors. */
/** Check the full old block before deciding that its dimensions merely belong to another preset.
 * Read descriptors so a malformed block never invokes a user-supplied getter. */
function checkedTrackBlock(tracks:unknown):LayoutTracks{
 const fail=(message:string):never=>{throw new Error(message);};
 if(!tracks||typeof tracks!=='object'||Array.isArray(tracks)||![Object.prototype,null].includes(Object.getPrototypeOf(tracks)))fail('Layout tracks are malformed.');
 const fields=Object.getOwnPropertyDescriptors(tracks),keys=Reflect.ownKeys(fields);
 if(keys.length!==3||keys.some(key=>typeof key!=='string'||!['columns','rows','schemaVersion'].includes(key)))fail('Layout tracks have missing or unknown fields.');
 for(const key of ['columns','rows','schemaVersion'])if(!fields[key]?.enumerable||!Object.hasOwn(fields[key],'value'))fail('Layout tracks must contain plain data fields.');
 if(fields.schemaVersion.value!==1)fail('Layout tracks use an unsupported schema.');
 const lengths:number[]=[];
 for(const axis of ['columns','rows']){
  const values=fields[axis].value;
  if(!Array.isArray(values)||Object.getPrototypeOf(values)!==Array.prototype)fail('Layout tracks must contain dense arrays.');
  const descriptors=Object.getOwnPropertyDescriptors(values),length=descriptors.length?.value;
  if(!Number.isInteger(length)||length<1||length>8||Reflect.ownKeys(descriptors).length!==length+1)fail('Layout tracks have invalid track counts.');
  let total=0;
  for(let index=0;index<length;index++){
   const field=descriptors[index];if(!field?.enumerable||!Object.hasOwn(field,'value'))fail('Layout tracks must contain dense plain data.');
   const value=field.value;if(typeof value!=='number'||!Number.isFinite(value))fail('Layout tracks must be finite numbers.');
   if(value<TRACK_FLOOR-1e-9)fail('Layout tracks must be at least 0.1.');total+=value;
  }
  if(Math.abs(total-1)>TRACK_TOLERANCE)fail('Layout tracks must sum to 1.');lengths.push(length);
 }
 if(!LV_LAYOUTS.some(row=>row.columns===lengths[0]&&row.rows===lengths[1]))fail('Layout tracks do not match a known layout preset.');
 return tracks as LayoutTracks;
}
export function isStaleTracks(tracks:unknown,presetId:string):boolean{
 const spec=preset(presetId);let record:LayoutTracks;
 try{record=checkedTrackBlock(tracks);}catch{return false;}
 return record.columns.length!==spec.columns||record.rows.length!==spec.rows;
}
/** Tracks to paint: the stored block, or the equal tracks when none is stored or the stored block is stale. */
export function effectiveTracks(grid:GridTrackHost):LayoutTracks{return grid.tracks&&!isStaleTracks(grid.tracks,grid.presetId)?structuredClone(grid.tracks):equalTracks(grid.presetId);}

/** Throws a plain-language message. Used for the working grid, every library entry grid and imported layout files. */
export function validateLayoutTracks(tracks:unknown,presetId:string):asserts tracks is LayoutTracks{
 const spec=preset(presetId),record=checkedTrackBlock(tracks);
 if(record.columns.length!==spec.columns||record.rows.length!==spec.rows)throw new Error('Layout tracks do not match the layout preset.');
}
/** Validation for a grid object that may carry tracks. Absent tracks are valid. */
export function assertGridTracks(grid:{presetId:string;tracks?:unknown}):void{
 const field=Object.getOwnPropertyDescriptor(grid,'tracks');
 if(!field){if('tracks' in grid)throw new Error('Layout tracks must be an own data field.');return;}
 if(!field.enumerable||!Object.hasOwn(field,'value'))throw new Error('Layout tracks must be an own data field.');
 if(field.value!==undefined&&!isStaleTracks(field.value,grid.presetId))validateLayoutTracks(field.value,grid.presetId);
}
/** Removes a stale block (see isStaleTracks); anything else is returned unchanged. */
export function dropStaleTracks<T extends {presetId:string;tracks?:unknown}>(grid:T):T{
 if(grid.tracks===undefined||!isStaleTracks(grid.tracks,grid.presetId))return grid;
 const next={...grid};delete next.tracks;return next;
}

/** Move the divider between track `index` and `index + 1` by `delta` (a fraction of the whole). Only those two tracks
 * change; the move is clamped so both stay at least 0.1. */
export function dragDivider(tracks:LayoutTracks,axis:TrackAxis,index:number,delta:number):LayoutTracks{
 const values=[...tracks[axis]];
 if(!Number.isInteger(index)||index<0||index>=values.length-1)throw new Error('Unknown divider.');
 if(!Number.isFinite(delta))throw new Error('Divider movement must be finite.');
 const low=TRACK_FLOOR-values[index],high=values[index+1]-TRACK_FLOOR,applied=Math.min(Math.max(delta,Math.min(low,0)),Math.max(high,0));
 values[index]=values[index]+applied;values[index+1]=values[index+1]-applied;
 return{...structuredClone(tracks),[axis]:normalize(values)} as LayoutTracks;
}
export function keyboardDivider(tracks:LayoutTracks,axis:TrackAxis,index:number,direction:'increase'|'decrease'):LayoutTracks{
 return dragDivider(tracks,axis,index,direction==='increase'?KEYBOARD_STEP:-KEYBOARD_STEP);
}
/** Double-click: the two tracks beside the divider take equal shares of their combined size. Returns undefined when every
 * track is then equal, which deletes the stored block so the bytes return to today's. */
export function resetDivider(tracks:LayoutTracks,axis:TrackAxis,index:number):LayoutTracks|undefined{
 const values=[...tracks[axis]];
 if(!Number.isInteger(index)||index<0||index>=values.length-1)throw new Error('Unknown divider.');
 const shared=(values[index]+values[index+1])/2;values[index]=shared;values[index+1]=shared;
 const next:LayoutTracks={...structuredClone(tracks),[axis]:normalize(values)} as LayoutTracks;
 const equalColumns=sameAxis(next.columns,equalAxis(next.columns.length)),equalRows=sameAxis(next.rows,equalAxis(next.rows.length));
 if(equalColumns)next.columns=equalAxis(next.columns.length);
 if(equalRows)next.rows=equalAxis(next.rows.length);
 return equalColumns&&equalRows?undefined:next;
}
/** CSS grid templates. An axis whose tracks are equal keeps today's repeat() form, byte for byte. */
export function gridTemplates(grid:GridTrackHost):{columns:string;rows:string}{
 const spec=preset(grid.presetId);
 const axis=(values:readonly number[]|undefined,count:number)=>!values||sameAxis(values,equalAxis(count))?`repeat(${count},minmax(0,1fr))`:values.map(value=>`minmax(0,${value}fr)`).join(' ');
 const tracks=grid.tracks&&!isStaleTracks(grid.tracks,grid.presetId)?grid.tracks:undefined;
 return{columns:axis(tracks?.columns,spec.columns),rows:axis(tracks?.rows,spec.rows)};
}
/** A copy of the grid with the tracks set, or with the key deleted when none is given. */
export function withTracks<T extends GridTrackHost>(grid:T,tracks:LayoutTracks|undefined):T{
 const next={...grid};if(tracks===undefined)delete next.tracks;else next.tracks=structuredClone(tracks);return next;
}
/** A preset change deletes the tracks (resizeMultiChartState calls this on its result). */
export function dropTracksOnResize<T extends GridTrackHost>(grid:T):T{return withTracks(grid,undefined);}
/** The stored form of a tracks block: undefined when every track is equal, so the saved bytes return to those of an untouched grid. */
export function normalizeTracks(tracks:LayoutTracks,presetId:string):LayoutTracks|undefined{
 validateLayoutTracks(tracks,presetId);
 const equal=equalTracks(presetId);
 return sameAxis(tracks.columns,equal.columns)&&sameAxis(tracks.rows,equal.rows)?undefined:structuredClone(tracks);
}

// The dividers between chart cells (dragging the border between two charts of a layout resizes them).
/** The tracks a grid paints: a stored block that validates against the preset, else equal tracks. A stale or malformed block
 * never reaches the CSS (a hand-edited file paints the equal grid instead of a broken one). */
export function paintedTracks(grid:{presetId:string;tracks?:unknown}):LayoutTracks{
 if(grid.tracks===undefined||isStaleTracks(grid.tracks,grid.presetId))return equalTracks(grid.presetId);
 try{validateLayoutTracks(grid.tracks,grid.presetId);return structuredClone(grid.tracks);}catch{return equalTracks(grid.presetId);}
}
/** The CSS the grid container adds on top of its equal repeat() templates: nothing for equal tracks, so an untouched grid
 * keeps today's style object and markup. */
export function trackTemplateStyle(grid:{presetId:string;tracks?:unknown}):{gridTemplateColumns?:string;gridTemplateRows?:string}{
 const tracks=paintedTracks(grid);if(normalizeTracks(tracks,grid.presetId)===undefined)return{};
 const templates=gridTemplates({presetId:grid.presetId,tracks});return{gridTemplateColumns:templates.columns,gridTemplateRows:templates.rows};
}
/** One draggable divider piece: the border between track `index` and `index + 1` on `axis`, spanning the tracks
 * `from` to `to` (exclusive) of the other axis. An uneven layout has a piece only where two different charts meet. */
export interface DividerSegment {axis:TrackAxis;index:number;from:number;to:number}
export function dividerSegments(presetId:string):DividerSegment[]{
 const spec=preset(presetId) as {columns:number;rows:number;areas?:readonly (readonly string[])[]};
 const area=(row:number,column:number)=>spec.areas?spec.areas[row][column]:row+':'+column;
 const segments:DividerSegment[]=[];
 const scan=(axis:TrackAxis,count:number,across:number,split:(index:number,position:number)=>boolean)=>{
  for(let index=0;index<count-1;index++){let from=-1;for(let position=0;position<=across;position++){const open=position<across&&split(index,position);if(open&&from<0)from=position;if(!open&&from>=0){segments.push({axis,index,from,to:position});from=-1;}}}
 };
 scan('columns',spec.columns,spec.rows,(index,row)=>area(row,index)!==area(row,index+1));
 scan('rows',spec.rows,spec.columns,(index,column)=>area(index,column)!==area(index+1,column));
 return segments;
}
/** Where a divider piece sits, in percent of the grid: `at` along its axis, `start` and `length` across it. */
export function dividerPlacement(tracks:LayoutTracks,segment:DividerSegment):{at:number;start:number;length:number}{
 const along=tracks[segment.axis],across=tracks[segment.axis==='columns'?'rows':'columns'];
 const sum=(values:readonly number[],end:number,begin=0)=>values.slice(begin,end).reduce((total,value)=>total+value,0);
 const percent=(value:number)=>Math.round(value*1e6)/1e4;
 return{at:percent(sum(along,segment.index+1)),start:percent(sum(across,segment.from)),length:percent(sum(across,segment.to,segment.from))};
}
