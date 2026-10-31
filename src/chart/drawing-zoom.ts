// DWUTIL Zoom in: host-side zoom region over the time axis. Pure; the host supplies the visible range, never history.
export interface ZoomRange{from:number;to:number}
/** Time axis only, price stays auto. A span narrower than one bar cancels. */
export function regionToRange(a:number,b:number,barInterval:number):ZoomRange|null{
 if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(barInterval)||barInterval<=0)return null;
 const from=Math.min(a,b),to=Math.max(a,b);return to-from<barInterval?null:{from,to};
}
export function createZoomStack(){
 const stack:ZoomRange[]=[];
 return{push:(range:ZoomRange)=>{stack.push({from:range.from,to:range.to});},pop:():ZoomRange|null=>stack.pop()??null,canZoomOut:()=>stack.length>0,depth:()=>stack.length,clear:()=>{stack.length=0;}};
}
export interface ZoomControllerHost{getRange:()=>ZoomRange|null;setRange:(range:ZoomRange)=>void;barInterval:()=>number}
/** The stack is session-only per chart and clears when the symbol, interval or layout key changes. Zoom never writes history. */
export function createZoomController(host:ZoomControllerHost){
 const stack=createZoomStack();let context:string|undefined;
 return{
  commit(a:number,b:number):boolean{const next=regionToRange(a,b,host.barInterval()),previous=host.getRange();if(!next||!previous)return false;host.setRange(next);stack.push(previous);return true;},
  zoomOut():boolean{const previous=stack.pop();if(!previous)return false;host.setRange(previous);return true;},
  canZoomOut:()=>stack.canZoomOut(),depth:()=>stack.depth(),
  observeContext(key:string){if(context!==key){context=key;stack.clear();}}
 };
}
/** Press, drag, release over the pane. Escape or a narrow drag cancels; one release commits once (momentary). */
export interface ZoomGestureHost{timeAt:(clientX:number)=>number|null;barInterval:()=>number;onRange:(from:number,to:number)=>void;onCancel:()=>void}
export function createZoomGesture(host:ZoomGestureHost){
 let start:number|null=null,end:number|null=null;
 const finish=()=>{start=null;end=null;};
 return{
  down(x:number){start=x;end=x;},
  move(x:number){if(start!==null)end=x;},
  up(x:number){
   if(start===null)return;const a=host.timeAt(start),b=host.timeAt(x);finish();
   const range=a===null||b===null?null:regionToRange(a,b,host.barInterval());
   if(range)host.onRange(range.from,range.to);else host.onCancel();
  },
  escape(){if(start!==null){finish();host.onCancel();}},
  /** Current dragged span in client x, for drawing the selection rectangle. */
  span:():{from:number;to:number}|null=>start===null||end===null?null:{from:Math.min(start,end),to:Math.max(start,end)}
 };
}
