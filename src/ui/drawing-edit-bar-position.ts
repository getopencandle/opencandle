/** Where the floating drawing toolbar sits. The position is a per-viewer convenience: it is remembered in local browser
 * storage when that works and silently forgotten when it does not. */
export const DRAWING_BAR_POSITION_KEY='lv.drawingEditBar.position';
export interface BarPosition{left:number;top:number}
interface BarStorage{getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
/** Keeps the whole bar inside the viewport. */
export function clampBarPosition(position:BarPosition,bar:{width:number;height:number},viewport:{width:number;height:number}):BarPosition{
 const fit=(value:number,size:number,limit:number)=>Math.max(0,Math.min(value,Math.max(0,limit-size)));
 return{left:fit(position.left,bar.width,viewport.width),top:fit(position.top,bar.height,viewport.height)};
}
export function readBarPosition(storage:BarStorage|null|undefined):BarPosition|null{
 try{
  const raw=storage?.getItem(DRAWING_BAR_POSITION_KEY);if(!raw)return null;
  const value=JSON.parse(raw) as Partial<BarPosition>;
  return typeof value?.left==='number'&&typeof value.top==='number'&&Number.isFinite(value.left)&&Number.isFinite(value.top)?{left:value.left,top:value.top}:null;
 }catch{return null;}
}
export function writeBarPosition(storage:BarStorage|null|undefined,position:BarPosition):void{
 try{storage?.setItem(DRAWING_BAR_POSITION_KEY,JSON.stringify({left:position.left,top:position.top}));}catch{/* Not remembered; the bar still works. */}
}
/** Forgets the remembered place so the bar goes back to sitting beside its drawing. */
export function clearBarPosition(storage:(BarStorage&{removeItem?:(key:string)=>void})|null|undefined):void{
 try{storage?.removeItem?.(DRAWING_BAR_POSITION_KEY);}catch{/* Nothing to forget. */}
}
export interface DrawingBox{left:number;top:number;right:number;bottom:number}
/** Starting place for the bar: centered over the drawing and just above it (below it when there is no room above), kept inside the chart. */
export function placeBarNearDrawing(box:DrawingBox,bar:{width:number;height:number},viewport:{width:number;height:number},gap=8):BarPosition{
 const left=Math.round((box.left+box.right)/2-bar.width/2),above=box.top-gap-bar.height,below=box.bottom+gap;
 return clampBarPosition({left,top:above>=0?above:below},bar,viewport);
}
/** The band at the top of a price pane that holds the series legend (title row and values row, 24px each) and an 8px
 * gap. The bar never opens over it, so it no longer covers the change value. */
export const PANE_LEGEND_RESERVE=56;
/** Starting place inside one price pane, in pane pixels: centered above the drawing, else below it, never over the
 * legend band and never past the plot width (the price scale lies beyond pane.width). The measured bar size is used.
 * `avoid` is the chart navigation strip (- + < > reset) in pane pixels. In a short pane the bar landed on it and the strip
 * painted over its first buttons. A bar that would meet the strip stays above it; when the room between the legend band and the
 * strip is too small for the bar, the bar still sits above the strip (over the legend band, which it may cover then). */
export function placeBarInPane(box:DrawingBox,bar:{width:number;height:number},pane:{width:number;height:number},reserveTop=PANE_LEGEND_RESERVE,gap=8,avoid?:DrawingBox|null):BarPosition{
 // The drawing's handles sit on its anchors, at the box edges. With only `gap` (8px) from an anchor the bar touched the
 // lower handle (radius 4.5 plus its grab zone) and the fib level label beside it. The drawing box is widened by HANDLE_CLEARANCE;
 // the bar goes above it, else below it, else beside it, and only when none of those fit inside the pane the old rule applies,
 // with the bar slid sideways off the handles when it can.
 const strip=avoid&&avoid.right>avoid.left&&avoid.bottom>avoid.top?avoid:null,c=HANDLE_CLEARANCE;
 const held={left:box.left-c,top:box.top-c,right:box.right+c,bottom:box.bottom+c};
 const maxLeft=Math.max(0,pane.width-bar.width),centred=Math.max(0,Math.min(Math.round((box.left+box.right)/2-bar.width/2),maxLeft));
 const maxTop=Math.max(0,pane.height-bar.height),minTop=Math.min(reserveTop,maxTop);
 const onStrip=(left:number,top:number)=>!!strip&&top<strip.bottom+NAV_STRIP_GAP&&top+bar.height>strip.top-NAV_STRIP_GAP&&left<strip.right+NAV_STRIP_GAP&&left+bar.width>strip.left-NAV_STRIP_GAP;
 const onDrawing=(left:number,top:number)=>top<held.bottom&&top+bar.height>held.top&&left<held.right&&left+bar.width>held.left;
 const clear=(left:number,top:number)=>left>=0&&left<=maxLeft&&top>=minTop&&top<=maxTop&&!onStrip(left,top)&&!onDrawing(left,top);
 const heldAbove=Math.round(held.top-gap-bar.height),heldBelow=Math.round(held.bottom+gap);
 if(clear(centred,heldAbove))return{left:centred,top:heldAbove};
 if(clear(centred,heldBelow))return{left:centred,top:heldBelow};
 const middle=Math.max(minTop,Math.min(Math.round((box.top+box.bottom)/2-bar.height/2),maxTop));
 for(const side of [Math.round(held.right+gap),Math.round(held.left-gap-bar.width)])if(clear(side,middle))return{left:side,top:middle};
 const legacy=legacyBarInPane(box,bar,centred,maxTop,minTop,gap,strip);
 const handles=[[box.left,box.top],[box.right,box.top],[box.left,box.bottom],[box.right,box.bottom]];
 const onHandle=(left:number)=>handles.some(([x,y])=>x>left-c&&x<left+bar.width+c&&y>legacy.top-c&&y<legacy.top+bar.height+c);
 for(const left of [centred,0,maxLeft])if(!onHandle(left)&&!onStrip(left,legacy.top))return{left,top:legacy.top};
 return legacy;
}
/** Room kept around the drawing's anchors (handle radius 4.5 in @luxalgo/vela, its grab zone and a fib level label row). */
export const HANDLE_CLEARANCE=14;
function legacyBarInPane(box:DrawingBox,bar:{width:number;height:number},left:number,maxTop:number,minTop:number,gap:number,avoid:DrawingBox|null):BarPosition{
 const above=Math.round(box.top-gap-bar.height),below=Math.round(box.bottom+gap);
 const top=Math.max(minTop,Math.min(above>=minTop?above:below,maxTop));
 if(!avoid)return{left,top};
 const meets=(at:number)=>at<avoid.bottom+NAV_STRIP_GAP&&at+bar.height>avoid.top-NAV_STRIP_GAP&&left<avoid.right+NAV_STRIP_GAP&&left+bar.width>avoid.left-NAV_STRIP_GAP;
 if(!meets(top))return{left,top};
 const overStrip=Math.floor(avoid.top-NAV_STRIP_GAP-bar.height);
 // Above the drawing first, if that clears both bands; else the lowest place above the strip (below the legend band when it fits).
 if(above>=minTop&&above<=overStrip&&!meets(above))return{left,top:above};
 return{left,top:Math.max(0,overStrip)};
}
/** Gap kept between the bar and the chart navigation strip. */
export const NAV_STRIP_GAP=4;
/** The navigation strip (one per chart cell) whose centre lies in the drawing's pane, pane relative. `origin` is the pane's
 * client position and `pane` its plot size. Null when no strip is shown there (Always invisible) or it has no box. */
export function navStripInPane(bar:Element,origin:{left:number;top:number},pane:{width:number;height:number}):DrawingBox|null{
 const scope=bar.closest('.chart-workspace')??bar.ownerDocument;
 for(const strip of Array.from(scope.querySelectorAll('.lv-nav-buttons'))){
  const rect=strip.getBoundingClientRect();if(!(rect.width>0)||!(rect.height>0))continue;
  const box={left:rect.left-origin.left,top:rect.top-origin.top,right:rect.right-origin.left,bottom:rect.bottom-origin.top},x=(box.left+box.right)/2,y=(box.top+box.bottom)/2;
  if(x>=0&&x<=pane.width&&y>=0&&y<=pane.height)return box;
 }
 return null;
}
