/**
 * Brush and Highlighter return to Cursor after a stroke unless "stay in drawing mode" is on.
 *
 * The pinned native controller exempts the two brush types from its one-shot rule (`tool-finished` never disarms freehand or
 * highlighter), so a brush stayed armed after every stroke while every other tool returned to Cursor. The app's own rule is the
 * stay-in-drawing-mode preference (chart.drawings.getStayMode); this applies it to the brush types the library skips.
 * Pure: the armed tool, the preference and the disarm are ports.
 */
export const BRUSH_TOOL_TYPES:ReadonlySet<string>=new Set(['freehand','highlighter']);

export interface BrushToolReturnPort{
 /** The currently armed placement tool, or null. */
 tool():string|null;
 /** The stay-in-drawing-mode preference. */
 stay():boolean;
 /** Disarms the placement tool (back to Cursor). */
 disarm():void;
 /** Runs after the native create handler has finished (the library is mid-pointer-up when it announces the create). */
 defer(callback:()=>void):void;
}

/** Call on every native drawing creation; `type` is the created drawing's type. */
export function returnBrushToCursor(port:BrushToolReturnPort,type:string|undefined):void{
 if(!type||!BRUSH_TOOL_TYPES.has(type))return;
 if(port.tool()!==type||port.stay())return;
 port.defer(()=>{
  // Re-check: the user may have armed another tool or turned stay mode on in between.
  if(port.tool()===type&&!port.stay())port.disarm();
 });
}
