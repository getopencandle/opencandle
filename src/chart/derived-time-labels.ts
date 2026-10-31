// Derived chart types (Renko, Kagi, Point & figure, Line break, Range) feed the
// renderer a logical axis of synthetic, evenly spaced times (derived-axis.ts). The time-axis ticks and the crosshair time
// chip must show the real source time of each brick instead, as the reference does. The adapter registers, per renderer,
// the source time (ms) of every fed display bar; the two renderer seams that already wrap the time axis
// (time-axis-ticks.ts drawTimeAxis) and the crosshair layer (precision-crosshair.ts render) pass the renderer a coordinate
// view whose time methods speak source time. Logical indexes, pixels and prices are untouched.
type Coords=Record<string,any>;
type Provider=()=>readonly number[]|null;
const providers=new WeakMap<object,Provider>();

/** The adapter's registration: source times (ms, display order) of the fed derived bars, or null for a time-based chart. */
export function setDerivedTimeSource(renderer:object,provider:Provider|null):void{if(provider)providers.set(renderer,provider);else providers.delete(renderer);}
export function derivedTimeSource(renderer:object):readonly number[]|null{
 const provider=providers.get(renderer);if(!provider)return null;
 try{const times=provider();return times&&times.length?times:null;}catch{return null;}
}

/** Source time for a logical index: the brick's own time; past either end, one source interval per bar. */
export function sourceTimeAtLogical(times:readonly number[],logical:number,intervalMs:number):number{
 const last=times.length-1,index=Math.round(logical),step=Number.isFinite(intervalMs)&&intervalMs>0?intervalMs:86400000;
 if(index<0)return times[0]+index*step;if(index>last)return times[last]+(index-last)*step;return times[index];
}
/** Logical position of a source time: the first brick at that time, interpolated between bricks (times never decrease). */
export function logicalAtSourceTime(times:readonly number[],ms:number,intervalMs:number):number{
 const last=times.length-1,step=Number.isFinite(intervalMs)&&intervalMs>0?intervalMs:86400000;
 if(ms<=times[0])return (ms-times[0])/step;if(ms>times[last])return last+(ms-times[last])/step;
 let lo=0,hi=last;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<ms)lo=mid+1;else hi=mid;}
 if(times[lo]===ms||lo===0)return lo;const before=times[lo-1],after=times[lo];return lo-1+(ms-before)/(after-before);
}

/** A coordinate view whose time methods use source time; everything else is the renderer's own coords. */
export function derivedTimeCoords(coords:Coords,times:readonly number[]):Coords{
 const interval=()=>Number(coords.barInterval);
 const logicalToTime=(logical:number)=>sourceTimeAtLogical(times,logical,interval());
 const timeToLogical=(ms:number)=>logicalAtSourceTime(times,ms,interval());
 const own:Record<string,unknown>={
  logicalToTime,timeToLogical,
  timeToX:(ms:number)=>coords.logicalToX(timeToLogical(ms)),
  visibleTimeRange:()=>{const range=coords.visibleLogicalRange();return{from:logicalToTime(range.from),to:logicalToTime(range.to)};},
 };
 return new Proxy(coords,{get(target,key){if(typeof key==='string'&&Object.hasOwn(own,key))return own[key];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
/** The coords to hand the renderer for this frame (unchanged for time-based charts). */
export function frameCoords<T>(renderer:object,coords:T):T{
 if(!coords||typeof coords!=='object')return coords;const times=derivedTimeSource(renderer);
 return times?derivedTimeCoords(coords as Coords,times) as T:coords;
}
